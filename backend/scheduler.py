"""
Raphael — Background Scheduler (Task 1C)

Runs on APScheduler (BlockingScheduler). No Prefect dependency.
Orchestrates:
  • Every hour  — OpenAQ, WAQI, IQAir, OpenMeteo, GDACS ingestion
  • Every 3h    — FIRMS fire detection ingestion
  • Every 24h   — MODIS LST daily ingestion
  • Every hour  — ML Intelligence Cycle (runs *after* ingestion completes)

Usage:
    python scheduler.py

The scheduler is intended to be launched as a long-running background
process alongside the FastAPI server. On Windows, start it in a second
terminal or wrap in a service manager (e.g. NSSM).
"""

import sys, os

# Windows DLL overrides for MKL/OMP, Stan compiler, and SpatiaLite
if sys.platform == 'win32':
    conda_prefix = os.environ.get("RAPHAEL_CONDA_PREFIX") or os.environ.get("CONDA_PREFIX") or r"C:\Users\harsh\anaconda3\envs\raphael-env"
    lib_bin = os.path.join(conda_prefix, "Library", "bin")
    if os.path.exists(lib_bin):
        if lib_bin not in os.environ["PATH"]:
            os.environ["PATH"] = lib_bin + os.pathsep + os.environ["PATH"]
        if hasattr(os, 'add_dll_directory'):
            try:
                os.add_dll_directory(lib_bin)
            except Exception:
                pass

# Monkeypatch Windows SSL default cert loading to bypass ASN1 NOT_ENOUGH_DATA certificate store bug
import ssl
orig_load_default_certs = ssl.SSLContext.load_default_certs
def patched_load_default_certs(self, purpose=ssl.Purpose.SERVER_AUTH):
    try:
        return orig_load_default_certs(self, purpose)
    except Exception:
        try:
            import certifi
            self.load_verify_locations(certifi.where())
        except Exception:
            pass
ssl.SSLContext.load_default_certs = patched_load_default_certs

# Pre-import torch first to resolve Windows OpenMP/MKL DLL collision quirk
try:
    import torch
except Exception:
    pass




import sys
import os
import logging
import time
from datetime import datetime, timezone

# ── Path bootstrap ───────────────────────────────────────────────────────────
_backend_dir = os.path.dirname(os.path.abspath(__file__))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("raphael.scheduler")

# ── APScheduler ──────────────────────────────────────────────────────────────
try:
    from apscheduler.schedulers.blocking import BlockingScheduler
    from apscheduler.triggers.interval import IntervalTrigger
    from apscheduler.events import EVENT_JOB_ERROR, EVENT_JOB_EXECUTED
except ImportError as e:
    log.critical("APScheduler not installed. Run: pip install apscheduler>=3.10.0")
    raise


# ════════════════════════════════════════════════════════════════════════════
# INGESTION JOB WRAPPERS
# Each wrapper imports the flow lazily (avoids import-time side-effects)
# and calls the flow with default parameters (Pune region).
# ════════════════════════════════════════════════════════════════════════════

def _safe_run(label: str, fn, *args, **kwargs):
    """Execute fn with basic error isolation and timing."""
    started = datetime.now(timezone.utc)
    try:
        log.info("[%s] starting", label)
        result = fn(*args, **kwargs)
        elapsed = (datetime.now(timezone.utc) - started).total_seconds()
        log.info("[%s] finished in %.1fs — %s", label, elapsed, result)
        return result
    except Exception as exc:
        elapsed = (datetime.now(timezone.utc) - started).total_seconds()
        log.error("[%s] FAILED after %.1fs: %s", label, elapsed, exc, exc_info=True)


def job_openaq():
    from ingestion.flows.aq_openaq import openaq_flow
    _safe_run("openaq", openaq_flow)


def job_waqi():
    from ingestion.flows.aq_waqi import waqi_flow
    _safe_run("waqi", waqi_flow)


def job_iqair():
    from ingestion.flows.aq_iqair import iqair_flow
    _safe_run("iqair", iqair_flow)


def job_openmeteo():
    from ingestion.flows.weather_openmeteo import openmeteo_flow
    _safe_run("openmeteo", openmeteo_flow)


def job_gdacs():
    from ingestion.flows.hazard_gdacs import gdacs_flow
    _safe_run("gdacs", gdacs_flow)


def job_firms():
    from utils.lock import PipelineLock
    lock = PipelineLock()
    if not lock.acquire_non_blocking():
        log.warning("FIRMS job skipped because another cycle is running")
        return
    try:
        from ingestion.flows.fire_firms import firms_flow
        _safe_run("firms", firms_flow)
    finally:
        lock.release()


def job_lst_modis():
    from utils.lock import PipelineLock
    lock = PipelineLock()
    if not lock.acquire_non_blocking():
        log.warning("MODIS LST job skipped because another cycle is running")
        return
    try:
        from ingestion.flows.lst_modis import lst_modis_flow
        _safe_run("lst_modis", lst_modis_flow)
    finally:
        lock.release()


def job_intelligence_cycle():
    """
    Stage 5-stage ML Intelligence Cycle (Detect → Attribute → Forecast
    → Decide → Disperse). Runs after ingestion jobs have had time to
    complete. Uses its own DB session to avoid session-sharing issues
    across scheduler threads.
    """
    from db.connection import SessionLocal
    from ml.runner import run_intelligence_cycle

    db = SessionLocal()
    try:
        _safe_run("intelligence_cycle", run_intelligence_cycle, db=db)
    finally:
        db.close()


# ════════════════════════════════════════════════════════════════════════════
# COMBINED HOURLY JOB
# Runs ingestion first, then the ML cycle.
# APScheduler runs each job in its own thread so this is sequential-safe.
# ════════════════════════════════════════════════════════════════════════════

def job_hourly_pipeline():
    """
    Combined hourly pipeline: ingest → ML cycle.
    Ingestion flows are run sequentially so the ML cycle always receives
    fresh data from the current hour.
    """
    from utils.lock import PipelineLock
    lock = PipelineLock()
    if not lock.acquire_non_blocking():
        log.warning("Hourly pipeline skipped because another cycle is running")
        return

    try:
        log.info("═══ HOURLY PIPELINE START ═══")

        # 1. Ingest fast sources
        job_openaq()
        job_waqi()
        job_iqair()
        job_openmeteo()
        job_gdacs()

        # 2. Run intelligence cycle on freshly-ingested data
        job_intelligence_cycle()

        log.info("═══ HOURLY PIPELINE DONE  ═══")
    finally:
        lock.release()


# ════════════════════════════════════════════════════════════════════════════
# SCHEDULER SETUP
# ════════════════════════════════════════════════════════════════════════════

def _on_job_event(event):
    if event.exception:
        log.error("Scheduled job %s crashed: %s", event.job_id, event.exception)
    else:
        log.debug("Scheduled job %s completed successfully", event.job_id)


def build_scheduler() -> BlockingScheduler:
    scheduler = BlockingScheduler(timezone="UTC")

    # ── Hourly combined pipeline (ingestion + ML) ──────────────────────────
    scheduler.add_job(
        job_hourly_pipeline,
        trigger=IntervalTrigger(hours=1),
        id="hourly_pipeline",
        name="Hourly ingestion + ML intelligence cycle",
        max_instances=1,           # No overlapping runs
        coalesce=True,             # Skip missed runs (e.g. after sleep)
        misfire_grace_time=300,    # Tolerate up to 5 min latency
    )

    # ── Every 3h — FIRMS fire detection (heavier, less frequent) ──────────
    scheduler.add_job(
        job_firms,
        trigger=IntervalTrigger(hours=3),
        id="firms_3h",
        name="FIRMS fire detection (3-hourly)",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=600,
    )

    # ── Daily — MODIS LST (once per day is sufficient) ─────────────────────
    scheduler.add_job(
        job_lst_modis,
        trigger=IntervalTrigger(hours=24),
        id="modis_lst_daily",
        name="MODIS LST daily ingestion",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=3600,
    )

    scheduler.add_listener(_on_job_event, EVENT_JOB_EXECUTED | EVENT_JOB_ERROR)
    return scheduler


# ════════════════════════════════════════════════════════════════════════════
# ENTRY POINT
# ════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    log.info("Raphael background scheduler starting…")
    log.info("  • Hourly pipeline  : OpenAQ + WAQI + IQAir + OpenMeteo + GDACS → ML Cycle")
    log.info("  • Every 3h         : FIRMS fire detection")
    log.info("  • Every 24h        : MODIS LST")
    log.info("Press Ctrl-C to stop.\n")

    scheduler = build_scheduler()

    try:
        # Run all ingestion + ML once immediately on startup, then follow the schedule
        log.info("Running initial pipeline on startup…")
        job_hourly_pipeline()
        job_firms()

        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        log.info("Scheduler stopped by user.")
