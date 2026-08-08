import pytest
import os
import shutil
import unittest.mock as mock
from fastapi.testclient import TestClient

# Isolate tests from running server instances
TEST_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "test_lock")
os.environ["RAPHAEL_DATA_DIR"] = TEST_DATA_DIR

from utils.lock import PipelineLock
from api.main import app

# Mock get_current_user to bypass authentication for API tests
from api.auth import get_current_user
app.dependency_overrides[get_current_user] = lambda: {"username": "admin"}

@pytest.fixture(autouse=True)
def setup_and_teardown():
    os.makedirs(TEST_DATA_DIR, exist_ok=True)
    yield
    # Clean up test files
    try:
        shutil.rmtree(TEST_DATA_DIR)
    except Exception:
        pass

def test_lock_acquire_and_release():
    lock = PipelineLock()
    
    # 1. First lock acquisition succeeds
    assert lock.acquire_non_blocking() is True

    # 2. Second lock acquisition on a new instance fails
    lock2 = PipelineLock()
    assert lock2.acquire_non_blocking() is False

    # 3. Releasing first lock allows second lock to be acquired
    lock.release()
    assert lock2.acquire_non_blocking() is True
    lock2.release()

def test_lock_context_manager_exception():
    lock = PipelineLock()

    try:
        with lock:
            lock2 = PipelineLock()
            assert lock2.acquire_non_blocking() is False
            raise ValueError("Test error")
    except ValueError:
        pass

    # Lock should be released automatically after context block
    lock3 = PipelineLock()
    assert lock3.acquire_non_blocking() is True
    lock3.release()

@mock.patch("ml.runner.run_intelligence_cycle")
def test_manual_trigger_lock_conflict(mock_run):
    mock_run.return_value = {"status": "complete"}
    
    lock = PipelineLock()
    client = TestClient(app)

    # Acquire lock externally
    assert lock.acquire_non_blocking() is True

    # Try triggering via API - should return 429
    response = client.post("/api/v1/system/intelligence-cycle")
    assert response.status_code == 429

    # Also check /intelligence/run - should return 429
    response2 = client.post("/api/v1/system/intelligence/run")
    assert response2.status_code == 429

    # Release lock
    lock.release()

    # Now API should succeed
    response = client.post("/api/v1/system/intelligence-cycle")
    assert response.status_code == 200
    assert response.json()["data"]["status"] == "complete"

@mock.patch("scheduler.job_openaq")
@mock.patch("scheduler.job_waqi")
@mock.patch("scheduler.job_iqair")
@mock.patch("scheduler.job_openmeteo")
@mock.patch("scheduler.job_gdacs")
@mock.patch("scheduler.job_intelligence_cycle")
def test_scheduler_job_skips_when_locked(
    mock_intel, mock_gdacs, mock_meteo, mock_iqair, mock_waqi, mock_openaq
):
    from scheduler import job_hourly_pipeline
    lock = PipelineLock()

    # Acquire lock externally
    assert lock.acquire_non_blocking() is True

    # Run scheduler job - it should skip running individual jobs
    job_hourly_pipeline()
    
    assert mock_openaq.called is False
    assert mock_intel.called is False

    # Release lock
    lock.release()

    # Run scheduler job - it should execute now
    job_hourly_pipeline()
    assert mock_openaq.called is True
    assert mock_intel.called is True
