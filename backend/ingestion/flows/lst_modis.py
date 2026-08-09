"""
Raphael — MODIS Land Surface Temperature Ingestion Flow

Searches NASA EarthData for MOD11A1 granules, downloads and processes them
into colored PNG tiles using the raster processing pipeline. Falls back to
mock tile generation if:
  - No EarthData credentials configured
  - HDF4 GDAL driver unavailable (common on Windows)
  - No granules found for the target date
"""
import sys
import os
import ssl
# Monkey-patch to fix Windows SSL ASN1 parsing bug
ssl.SSLContext._load_windows_store_certs = lambda self, *args, **kwargs: None

from datetime import date, datetime, timezone, timedelta
import asyncio

# Ensure backend directory is in the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from prefect import flow, task
import uuid
from ingestion.base import BaseIngestionFlow
from api.routes.ws import broadcast
from geoalchemy2.shape import to_shape

class MODISLSTFlow(BaseIngestionFlow):
    source_key = "modis_lst"
    layer_type  = "lst"

@task(name="search-modis-granules", retries=2)
def search_granules(bbox: tuple, target_date: date) -> list:
    flow_obj = MODISLSTFlow()
    if not flow_obj.is_online():
        print("Offline - skipping search")
        asyncio.run(broadcast({
            "type": "trace",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": {
                "source": "modis_lst",
                "message": "Offline - skipped NASA granule search"
            }
        }))
        flow_obj.close()
        return []

    username = os.getenv("EARTHDATA_USERNAME", "")
    password = os.getenv("EARTHDATA_PASSWORD", "")
    if not username:
        print("No NASA EarthData credentials configured. Skipping search.")
        asyncio.run(broadcast({
            "type": "trace",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": {
                "source": "modis_lst",
                "message": "EarthData credentials missing - will use mock tile fallback"
            }
        }))
        flow_obj.close()
        return []

    asyncio.run(broadcast({
        "type": "trace",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "payload": {
            "source": "modis_lst",
            "message": f"Searching NASA EarthData for MODIS LST granules (MOD11A1) on date {target_date}..."
        }
    }))

    west, south, east, north = bbox
    try:
        import earthaccess
        auth = earthaccess.login(strategy="environment")
        
        results = earthaccess.search_data(
            short_name="MOD11A1",
            version="061",
            bounding_box=bbox,
            temporal=(str(target_date), str(target_date))
        )

        asyncio.run(broadcast({
            "type": "trace",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": {
                "source": "modis_lst",
                "message": f"Found {len(results)} matching MODIS LST granules on EarthData"
            }
        }))
        flow_obj.close()
        return results
    except Exception as e:
        print("Error searching CMR granules:", e)
        asyncio.run(broadcast({
            "type": "trace",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": {
                "source": "modis_lst",
                "message": f"Error searching MODIS granules: {str(e)}"
            }
        }))
        flow_obj.close()
        return []


@task(name="download-and-process-lst")
def process_lst_granule(granule: dict, bbox: tuple, target_date: date) -> tuple:
    """
    Download an HDF4 granule and process it into an LST tile.
    If granule is None/empty (mock mode), generates a synthetic tile instead.
    """
    from processing.raster import process_modis_lst, generate_mock_lst_tile, HAS_HDF4
    from pathlib import Path

    # If no real granule data, generate mock tile
    if not granule:
        asyncio.run(broadcast({
            "type": "trace",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": {
                "source": "modis_lst",
                "message": "No granule data — generating mock LST tile"
            }
        }))
        tile_path = generate_mock_lst_tile(bbox, target_date=target_date)
        return str(tile_path), None, None, None

    # If HDF4 driver and pyhdf not available, fall back to mock
    try:
        from pyhdf.SD import SD
        has_pyhdf = True
    except ImportError:
        has_pyhdf = False

    if not HAS_HDF4 and not has_pyhdf:
        asyncio.run(broadcast({
            "type": "trace",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": {
                "source": "modis_lst",
                "message": "HDF4 driver and pyhdf unavailable — generating mock LST tile"
            }
        }))
        tile_path = generate_mock_lst_tile(bbox, target_date=target_date)
        return str(tile_path), None, None, None

    # Try real download + processing
    try:
        import tempfile
        import earthaccess
        
        auth = earthaccess.login(strategy="environment")
        with tempfile.TemporaryDirectory() as tmp_dir_str:
            tmp_dir = Path(tmp_dir_str)

            # Download using earthaccess
            downloaded_files = earthaccess.download([granule], local_path=str(tmp_dir))
            
            if not downloaded_files:
                print("No files downloaded by earthaccess — falling back to mock")
                tile_path = generate_mock_lst_tile(bbox, target_date=target_date)
                return str(tile_path), None, None, None
                
            hdf_path = Path(downloaded_files[0])

            asyncio.run(broadcast({
                "type": "trace",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "payload": {
                    "source": "modis_lst",
                    "message": f"Downloaded HDF4 granule ({hdf_path.stat().st_size} bytes), processing..."
                }
            }))

            tile_path, scaled_array, transform, crs = process_modis_lst(hdf_path, bbox, target_date)
            return str(tile_path) if tile_path else "", scaled_array, transform, crs

    except Exception as e:
        print(f"Real LST processing failed: {e}")
        asyncio.run(broadcast({
            "type": "trace",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": {
                "source": "modis_lst",
                "message": f"Real LST processing failed ({str(e)}), generating mock LST tile"
            }
        }))
        tile_path = generate_mock_lst_tile(bbox, target_date=target_date)
        return str(tile_path), None, None, None


@task(name="write-lst-tile-metadata")
def write_tile_metadata(tile_path: str, bbox: tuple, target_date: date, region_id) -> int:
    """Write tile metadata record to the raster_tiles table."""
    if not tile_path:
        return 0

    from db.connection import SessionLocal
    from db.models import RasterTile
    from processing.raster import get_tile_bounds_wkt

    db = SessionLocal()

    asyncio.run(broadcast({
        "type": "trace",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "payload": {
            "source": "modis_lst",
            "message": "Writing MODIS Land Surface Temperature tile metadata record..."
        }
    }))

    try:
        # Prevent duplicate tile metadata entries for the exact same valid date
        existing = db.query(RasterTile).filter(
            RasterTile.layer_type == "lst",
            RasterTile.valid_date == target_date,
            RasterTile.region_id == region_id
        ).first()

        if existing:
            # Update existing record with new tile path
            existing.tile_path = tile_path
            existing.processed_at = datetime.now(timezone.utc)
            existing.bounds = get_tile_bounds_wkt(bbox)
            db.commit()
            print(f"LST tile metadata updated for date {target_date}")
            asyncio.run(broadcast({
                "type": "trace",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "payload": {
                    "source": "modis_lst",
                    "message": f"Updated existing LST tile metadata for date {target_date}"
                }
            }))
            return 1

        tile = RasterTile(
            id=str(uuid.uuid4()),
            layer_type="lst",
            region_id=region_id,
            tile_path=tile_path,
            bounds=get_tile_bounds_wkt(bbox),
            processed_at=datetime.now(timezone.utc),
            valid_date=target_date,
            resolution_m=1000,
            colormap="plasma"
        )
        db.add(tile)
        db.commit()

        asyncio.run(broadcast({
            "type": "trace",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": {
                "source": "modis_lst",
                "message": f"Successfully registered MODIS LST tile metadata for date {target_date}"
            }
        }))
        return 1
    except Exception as e:
        db.rollback()
        asyncio.run(broadcast({
            "type": "trace",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": {
                "source": "modis_lst",
                "message": f"Error writing MODIS LST tile metadata: {str(e)}"
            }
        }))
        raise e
    finally:
        db.close()


def compute_zonal_values_for_granule(scaled_array, transform, crs, zone_geoms: dict) -> dict:
    from pyproj import CRS as pyproj_CRS
    from processing.raster import extract_zonal_values
    
    raster_crs = pyproj_CRS.from_user_input(crs)
    wgs84_crs = pyproj_CRS.from_epsg(4326)
    if not raster_crs.equals(wgs84_crs):
        from pyproj import Transformer
        from shapely.ops import transform as shapely_transform
        transformer = Transformer.from_crs(wgs84_crs, raster_crs, always_xy=True)
        zone_geoms_proj = {
            name: shapely_transform(transformer.transform, geom)
            for name, geom in zone_geoms.items()
        }
    else:
        zone_geoms_proj = zone_geoms
    return extract_zonal_values(scaled_array, transform, crs, zone_geoms_proj)


@flow(name="modis-lst-ingestion")
def lst_modis_flow():
    from processing.raster import generate_mock_zonal_values, write_zonal_observations, merge_zonal_values, generate_mock_lst_tile
    from db.connection import SessionLocal
    from sqlalchemy import text
    from shapely import wkb

    flow_obj = MODISLSTFlow()
    if not flow_obj.region:
        print("No active region configured. Skipping.")
        flow_obj.close()
        return

    bbox_shape = to_shape(flow_obj.region.bbox)
    bbox = bbox_shape.bounds
    region_id = str(flow_obj.region.id)
    flow_obj.close()

    # Load zone geometries and source_id
    db = SessionLocal()
    zone_rows = db.execute(text("""
        SELECT name, AsBinary(geometry) FROM zone_geometries WHERE region_id = :rid
    """), {"rid": region_id}).fetchall()
    zone_geoms = {name: wkb.loads(geom_wkb) for name, geom_wkb in zone_rows}

    source_row = db.execute(text("SELECT id FROM sources WHERE key = 'modis_lst'")).fetchone()
    src_id = str(source_row[0]) if source_row else None
    db.close()

    if not zone_geoms:
        print("No zone geometries found in DB. Skipping.")
        return

    max_days_back = 7
    zonal_values = None
    last_tile_path = None
    target_date = date.today()

    for days_back in range(0, max_days_back + 1):
        test_date = date.today() - timedelta(days=days_back)
        granules = search_granules(bbox, test_date)

        if not granules:
            print(f"No granules found for {test_date}. Trying earlier date.")
            continue

        print(f"Found {len(granules)} granules for {test_date}. Processing...")
        per_granule_zonal_values = []
        for granule in granules:
            # process_lst_granule returns (tile_path, scaled_array, transform, crs)
            tile_path, scaled_array, transform, crs = process_lst_granule(granule, bbox, test_date)
            if tile_path:
                last_tile_path = tile_path
            if scaled_array is not None:
                zv = compute_zonal_values_for_granule(scaled_array, transform, crs, zone_geoms)
                per_granule_zonal_values.append(zv)

        if per_granule_zonal_values:
            combined = merge_zonal_values(*per_granule_zonal_values)
            n_valid = sum(1 for v in combined.values() if v is not None)
            if n_valid > 0:
                zonal_values = combined
                target_date = test_date
                print(f"[modis_lst] Found usable LST data on {target_date}: {n_valid} zones valid")
                break
            else:
                print(f"[modis_lst] {test_date}: granule(s) found but fully cloud-masked, trying earlier date")
                continue

    is_mock = False
    if zonal_values is None:
        print(f"[modis_lst] No usable LST data in {max_days_back}-day lookback — falling back to mock")
        zonal_values = generate_mock_zonal_values("lst", zone_geoms)
        target_date = date.today()
        last_tile_path = generate_mock_lst_tile(bbox, target_date=target_date)
        is_mock = True

    db = SessionLocal()
    raw_payload = {"source": "mock"} if is_mock else {"source": "modis_real"}
    n_written = write_zonal_observations(db, region_id, "lst", target_date, zonal_values, src_id, raw_payload=raw_payload)
    db.close()

    count = write_tile_metadata(str(last_tile_path) if last_tile_path else "", bbox, target_date, region_id)
    print(f"LST tile processed: {last_tile_path}")

    # Broadcast standard sync status
    asyncio.run(broadcast({
        "type": "sync_status",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "payload": {
            "source": "modis_lst",
            "layer_type": "lst",
            "count": count,
            "status": "success" if last_tile_path else "skipped"
        }
    }))

if __name__ == "__main__":
    lst_modis_flow()
