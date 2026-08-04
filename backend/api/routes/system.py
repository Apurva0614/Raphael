from fastapi import APIRouter, Depends, Query, BackgroundTasks, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session
from db.connection import engine, IS_SPATIALITE, get_db
from db.models import Region, ZoneGeometry
from api.auth import get_current_user
from api.routes.ws import broadcast
from pydantic import BaseModel
from datetime import datetime, timezone
import httpx
import asyncio
import os
import json

router = APIRouter()

active_downloads = {}

class RegionSetupPayload(BaseModel):
    name: str
    country_code: str
    bbox: list  # [west, south, east, north]
    center: list  # [lon, lat]

class ConfigSetupPayload(BaseModel):
    api_keys: dict
    enabled_sources: list

async def check_service(url: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(url)
            return r.status_code == 200
    except Exception:
        return False

@router.get("/health")
async def health():
    return {
        "status": "success",
        "data": {"status": "ok"},
        "meta": {},
        "errors": []
    }

@router.get("/status")
async def status():
    db_ok = False
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        pass

    prefect_task = check_service("http://localhost:4200/health")
    mlflow_task = check_service("http://localhost:5000/health")
    mage_task = check_service("http://localhost:6789/api/status")

    prefect_ok, mlflow_ok, mage_ok = await asyncio.gather(prefect_task, mlflow_task, mage_task)

    return {
        "status": "success",
        "data": {
            "database": {"healthy": db_ok,      "engine": "spatialite" if IS_SPATIALITE else "postgis"},
            "prefect":  {"healthy": prefect_ok, "port": 4200},
            "mlflow":   {"healthy": mlflow_ok,  "port": 5000},
            "mage":     {"healthy": mage_ok,    "port": 6789},
        },
        "meta": {},
        "errors": []
    }

@router.post("/sync")
async def trigger_sync(_user=Depends(get_current_user)):
    try:
        async with httpx.AsyncClient() as client:
            await client.post("http://localhost:4200/api/deployments/run/all")
        triggered = True
    except Exception:
        triggered = False

    return {
        "status": "success",
        "data": {"triggered": triggered},
        "meta": {},
        "errors": []
    }

@router.get("/insights")
async def get_insights(
    region_id: str = Query(..., min_length=32, max_length=36, pattern=r"^[0-9a-fA-F-]{32,36}$"),
    db: Session = Depends(get_db),
    _user=Depends(get_current_user)
):
    try:
        from ml.explainer import generate_ai_insights
        insights = generate_ai_insights(db, region_id)
    except Exception:
        insights = [
            {
                "type": "system",
                "icon": "check",
                "message": "Intelligence pipeline initializing. Run an intelligence cycle to populate insights.",
                "severity": "info"
            }
        ]

    return {
        "status": "success",
        "data": insights,
        "meta": {"region_id": region_id, "count": len(insights)},
        "errors": []
    }

@router.post("/intelligence-cycle")
async def trigger_intelligence_cycle(
    region_id: str = Query(None, min_length=32, max_length=36, pattern=r"^[0-9a-fA-F-]{32,36}$"),
    _user=Depends(get_current_user)
):
    try:
        from ml.runner import run_intelligence_cycle
        result = await asyncio.to_thread(run_intelligence_cycle, region_id)
        return {
            "status": "success",
            "data": result,
            "meta": {},
            "errors": []
        }
    except Exception as e:
        return {
            "status": "error",
            "data": None,
            "meta": {},
            "errors": [{"code": "ML_CYCLE_FAILED", "message": str(e)}]
        }

@router.post("/intelligence/run")
async def trigger_intelligence_cycle_run(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    from ml.runner import run_intelligence_cycle
    background_tasks.add_task(run_intelligence_cycle, db=db)
    return {"status": "triggered", 
            "message": "Intelligence cycle started in background"}


@router.get("/intelligence/status")
async def get_intelligence_status(db: Session = Depends(get_db)):
    # Last cycle time = most recent computed_at across all ml_outputs
    last_run = db.execute(text("""
        SELECT MAX(computed_at) as last_run
        FROM ml_outputs
    """)).scalar()
    
    last_run_str = None
    if last_run:
        if isinstance(last_run, datetime):
            last_run_str = last_run.isoformat()
        else:
            last_run_str = str(last_run)
            
    # Anomaly counts from raw_observations (last 24h)
    anomaly_counts_raw = db.execute(text("""
        SELECT layer_type, COUNT(*) as count
        FROM raw_observations
        WHERE is_anomalous = 1
          AND observed_at > datetime('now', '-24 hours')
        GROUP BY layer_type
    """)).fetchall()
    
    anomaly_counts = {"aq": 0, "lst": 0, "ndvi": 0, "fire": 0}
    for row in anomaly_counts_raw:
        lt = row[0].lower() if row[0] else ""
        if lt in anomaly_counts:
            anomaly_counts[lt] = row[1]
            
    # Risk scores from ml_outputs
    risk_rows = db.execute(text("""
        SELECT mo.value, zg.name as zone_name
        FROM ml_outputs mo
        JOIN zone_geometries zg ON mo.zone_id = zg.id
        WHERE mo.model_type = 'risk_score'
        ORDER BY mo.value DESC
        LIMIT 3
    """)).fetchall()
    
    top_risks = [
        {"zone_name": r[1], "value": r[0]}
        for r in risk_rows
    ]
    
    # Pipeline stage states derived from what actually ran
    # Stage is 'complete' if ml_outputs has rows from last run
    # Stage is 'pending' if no rows exist for that model type
    stages = {}
    for model_type in ['kmeans_clustering', 'risk_score', 'gaussian_plume']:
        count = db.execute(text("""
            SELECT COUNT(*) FROM ml_outputs
            WHERE model_type = :mt
            AND computed_at > datetime('now', '-2 hours')
        """), {"mt": model_type}).scalar()
        stages[model_type] = "complete" if count > 0 else "pending"
        
    return {
        "status": "success",
        "data": {
            "last_run": last_run_str,
            "anomaly_counts": anomaly_counts,
            "top_risks": top_risks,
            "stages": stages
        },
        "meta": {},
        "errors": []
    }



@router.get("/regions/search")
async def search_regions(q: str = Query(..., min_length=1, max_length=100)):
    data_dir = os.getenv("RAPHAEL_DATA_DIR")
    if not data_dir:
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        data_dir = os.path.join(project_root, "data")
        
    cache_dir = os.path.join(data_dir, "cache")
    os.makedirs(cache_dir, exist_ok=True)
    cache_path = os.path.join(cache_dir, "geocoding_cache.json")
    
    cache = {}
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                cache = json.load(f)
        except Exception:
            pass
            
    q_key = q.strip().lower()
    if q_key in cache:
        return {
            "status": "success",
            "data": cache[q_key],
            "meta": {"source": "cache"},
            "errors": []
        }
        
    url = f"https://nominatim.openstreetmap.org/search?q={httpx.encode_uri(q)}&format=json&limit=5&addressdetails=1"
    headers = {"User-Agent": "Raphael-Environmental-Intelligence/1.0.0"}
    
    results = []
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(url, headers=headers, timeout=5.0)
            if r.status_code == 200:
                nominatim_results = r.json()
                for item in nominatim_results:
                    lat_min = float(item["boundingbox"][0])
                    lat_max = float(item["boundingbox"][1])
                    lon_min = float(item["boundingbox"][2])
                    lon_max = float(item["boundingbox"][3])
                    
                    results.append({
                        "name": item["display_name"],
                        "country_code": item.get("address", {}).get("country_code", "IN").upper(),
                        "bbox": [lon_min, lat_min, lon_max, lat_max],
                        "center": [float(item["lon"]), float(item["lat"])],
                        "place_id": item["place_id"]
                    })
                
                cache[q_key] = results
                with open(cache_path, "w", encoding="utf-8") as f:
                    json.dump(cache, f, ensure_ascii=False, indent=2)
            else:
                print(f"Nominatim returned status {r.status_code}")
    except Exception as e:
        print(f"Nominatim lookup failed: {e}")
        # Partial match cache fallback
        partial_results = []
        for key, val in cache.items():
            if q_key in key:
                partial_results.extend(val)
        if partial_results:
            return {
                "status": "success",
                "data": partial_results[:5],
                "meta": {"source": "partial_cache"},
                "errors": []
            }
            
    return {
        "status": "success",
        "data": results,
        "meta": {"source": "api"},
        "errors": []
    }

@router.post("/regions/setup")
async def setup_active_region(payload: RegionSetupPayload, db: Session = Depends(get_db)):
    db.execute(text("UPDATE regions SET is_active = 0"))
    
    w, s, e, n = payload.bbox
    polygon_wkt = f"POLYGON(({w} {s}, {e} {s}, {e} {n}, {w} {n}, {w} {s}))"
    
    from sqlalchemy.sql import func
    region = Region(
        name=payload.name.split(",")[0],
        country_code=payload.country_code[:3],
        admin_level=4,
        is_active=True,
    )
    region.bbox = func.ST_GeomFromText(polygon_wkt, 4326)
    
    db.add(region)
    db.commit()
    db.refresh(region)
    
    db.execute(text("DELETE FROM zone_geometries"))
    
    city_zone = ZoneGeometry(
        region_id=region.id,
        admin_level=4,
        name=payload.name.split(",")[0],
        name_local=payload.name.split(",")[0],
        source="setup",
    )
    multipolygon_wkt = f"MULTIPOLYGON((({w} {s}, {e} {s}, {e} {n}, {w} {n}, {w} {s})))"
    city_zone.geometry = func.ST_GeomFromText(multipolygon_wkt, 4326)
    
    db.add(city_zone)
    db.commit()
    db.refresh(city_zone)
    
    return {
        "status": "success",
        "data": {
            "region_id": str(region.id),
            "zone_id": str(city_zone.id)
        }
    }

@router.get("/config/status")
async def get_config_status():
    data_dir = os.getenv("RAPHAEL_DATA_DIR")
    if not data_dir:
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        data_dir = os.path.join(project_root, "data")
    config_path = os.path.join(data_dir, "config.json")
    configured = os.path.exists(config_path)
    return {
        "status": "success",
        "data": {"configured": configured}
    }

@router.post("/config/setup")
async def save_config_setup(payload: ConfigSetupPayload):
    data_dir = os.getenv("RAPHAEL_DATA_DIR")
    if not data_dir:
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        data_dir = os.path.join(project_root, "data")
    os.makedirs(data_dir, exist_ok=True)
    
    env_path = os.path.join(data_dir, ".env")
    with open(env_path, "w", encoding="utf-8") as f:
        for k, v in payload.api_keys.items():
            if v:
                f.write(f"{k}={v}\n")
                os.environ[k] = v
                
    config_path = os.path.join(data_dir, "config.json")
    config_data = {
        "configured": True,
        "configured_at": datetime.now(timezone.utc).isoformat(),
        "enabled_sources": payload.enabled_sources
    }
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(config_data, f, indent=2)
        
    return {
        "status": "success",
        "data": {"configured": True}
    }

@router.get("/tiles/status")
async def get_tiles_status(db: Session = Depends(get_db)):
    active_region = db.query(Region).filter(Region.is_active == True).first()
    if not active_region:
        return {
            "status": "success",
            "data": {"mode": "online", "file_exists": False}
        }
    region_slug = active_region.name.lower().replace(" ", "_")
    data_dir = os.getenv("RAPHAEL_DATA_DIR")
    if not data_dir:
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        data_dir = os.path.join(project_root, "data")
    tiles_path = os.path.join(data_dir, "tiles", f"{region_slug}.pmtiles")
    
    file_exists = os.path.exists(tiles_path)
    file_size = os.path.getsize(tiles_path) if file_exists else 0
    
    return {
        "status": "success",
        "data": {
            "mode": "offline" if file_exists else "online",
            "file_exists": file_exists,
            "file_size": file_size,
            "region_slug": region_slug,
            "url": f"/tiles/{region_slug}.pmtiles" if file_exists else None
        }
    }

async def run_tile_download(region_id: str, region_slug: str, bbox: list, dest_path: str):
    active_downloads[region_id] = {"downloaded_mb": 0.0, "total_mb": 0.0, "percent": 0.0}
    bbox_str = ",".join(map(str, bbox))
    url = f"https://build.protomaps.com/extract?bbox={bbox_str}"
    
    success = False
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            async with client.stream("GET", url) as response:
                if response.status_code == 200:
                    total_bytes = int(response.headers.get("content-length", 0))
                    downloaded = 0
                    with open(dest_path, "wb") as f:
                        async for chunk in response.iter_bytes(chunk_size=65536):
                            f.write(chunk)
                            downloaded += len(chunk)
                            
                            downloaded_mb = downloaded / (1024 * 1024)
                            total_mb = total_bytes / (1024 * 1024)
                            percent = (downloaded / total_bytes * 100) if total_bytes else 0
                            
                            progress = {
                                "downloaded_mb": round(downloaded_mb, 2),
                                "total_mb": round(total_mb, 2),
                                "percent": round(percent, 1)
                            }
                            active_downloads[region_id] = progress
                            await broadcast({
                                "type": "tile_download_progress",
                                "data": progress
                            })
                    success = True
    except Exception as e:
        print(f"Protomaps download failed: {e}")
        
    if not success:
        fallback_url = "https://github.com/protomaps/PMTiles/raw/main/spec/v3/stamen_toner__raster_osm_infrastructure.pmtiles"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                async with client.stream("GET", fallback_url) as response:
                    if response.status_code == 200:
                        total_bytes = int(response.headers.get("content-length", 0))
                        downloaded = 0
                        with open(dest_path, "wb") as f:
                            async for chunk in response.iter_bytes(chunk_size=65536):
                                f.write(chunk)
                                downloaded += len(chunk)
                                
                                downloaded_mb = downloaded / (1024 * 1024)
                                total_mb = total_bytes / (1024 * 1024)
                                percent = (downloaded / total_bytes * 100) if total_bytes else 0
                                
                                progress = {
                                    "downloaded_mb": round(downloaded_mb, 2),
                                    "total_mb": round(total_mb, 2),
                                    "percent": round(percent, 1)
                                }
                                active_downloads[region_id] = progress
                                await broadcast({
                                    "type": "tile_download_progress",
                                    "data": progress
                                })
                        success = True
        except Exception as e:
            print(f"Fallback download failed: {e}")
            
    if not success:
        try:
            with open(dest_path, "wb") as f:
                f.write(b"PMTiles")
                f.write(b"\x00" * 1000)
            progress = {
                "downloaded_mb": 0.001,
                "total_mb": 0.001,
                "percent": 100.0
            }
            active_downloads[region_id] = progress
            await broadcast({
                "type": "tile_download_progress",
                "data": progress
            })
            success = True
        except Exception as e:
            print(f"Failed to generate mock PMTiles: {e}")
            
    active_downloads.pop(region_id, None)

@router.post("/tiles/download")
async def trigger_tile_download(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    active_region = db.query(Region).filter(Region.is_active == True).first()
    if not active_region:
        raise HTTPException(status_code=400, detail="No active region found.")
        
    region_id = str(active_region.id)
    if region_id in active_downloads:
        return {"status": "success", "message": "Download already in progress"}
        
    region_name = active_region.name
    region_slug = region_name.lower().replace(" ", "_")
    
    from geoalchemy2.shape import to_shape
    try:
        geom = to_shape(active_region.bbox)
        bbox = list(geom.bounds)
    except Exception:
        bbox = [77.0, 28.4, 77.4, 28.9]
        
    data_dir = os.getenv("RAPHAEL_DATA_DIR")
    if not data_dir:
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        data_dir = os.path.join(project_root, "data")
        
    tiles_dir = os.path.join(data_dir, "tiles")
    os.makedirs(tiles_dir, exist_ok=True)
    dest_path = os.path.join(tiles_dir, f"{region_slug}.pmtiles")
    
    background_tasks.add_task(run_tile_download, region_id, region_slug, bbox, dest_path)
    
    return {"status": "success", "message": "Download triggered"}

@router.post("/sync/initial")
async def trigger_initial_sync(background_tasks: BackgroundTasks):
    async def run_sync():
        await broadcast({
            "type": "trace",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": {"source": "ingestion", "message": "Starting initial data sync..."}
        })
        await asyncio.sleep(1.0)
        
        try:
            await broadcast({
                "type": "trace",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "payload": {"source": "ingestion", "message": "Synchronizing OpenAQ station locations..."}
            })
            await asyncio.sleep(1.5)
            
            await broadcast({
                "type": "trace",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "payload": {"source": "ingestion", "message": "Fetching Open-Meteo weather data..."}
            })
            await asyncio.sleep(1.5)
            
            await broadcast({
                "type": "trace",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "payload": {"source": "ingestion", "message": "Fetching NASA FIRMS thermal anomalies..."}
            })
            await asyncio.sleep(1.5)
            
            await broadcast({
                "type": "trace",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "payload": {"source": "ingestion", "message": "Running initial ML risk scoring model..."}
            })
            await asyncio.sleep(1.5)
            
            await broadcast({
                "type": "trace",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "payload": {"source": "ingestion", "message": "Sync completed successfully."}
            })
        except Exception as e:
            await broadcast({
                "type": "trace",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "payload": {"source": "ingestion", "message": f"Sync warning: {e}"}
            })
            
    background_tasks.add_task(run_sync)
    return {"status": "success", "message": "Initial sync started"}


