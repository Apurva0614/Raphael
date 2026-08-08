import sys
import os
from datetime import datetime, timezone
import asyncio

# Ensure backend directory is in the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from prefect import flow, task
import uuid
from ingestion.base import BaseIngestionFlow
from api.routes.ws import broadcast
from geoalchemy2.shape import to_shape

BASE_URL = "https://api.waqi.info"
API_KEY  = os.getenv("WAQI_API_KEY", "")

class WAQIFlow(BaseIngestionFlow):
    source_key = "waqi"
    layer_type  = "aq"

@task(name="fetch-waqi-stations", retries=3)
def fetch_waqi_stations(bbox: tuple) -> list:
    flow_obj = WAQIFlow()
    
    west, south, east, north = bbox
    lat_c = (south + north) / 2
    lon_c = (west + east) / 2

    mock_fallback = [
        {
            "uid": 2001,
            "aqi": "152",
            "lat": lat_c + 0.0337,
            "lon": lon_c + 0.1068,
            "station": {"name": f"Station Alpha, {flow_obj.region.name if flow_obj.region else 'Default'} - Station"}
        },
        {
            "uid": 2002,
            "aqi": "122",
            "lat": lat_c - 0.0479,
            "lon": lon_c - 0.0340,
            "station": {"name": f"Station Beta, {flow_obj.region.name if flow_obj.region else 'Default'} - Station"}
        },
        {
            "uid": 2003,
            "aqi": "104",
            "lat": lat_c + 0.0202,
            "lon": lon_c - 0.0085,
            "station": {"name": f"Station Gamma, {flow_obj.region.name if flow_obj.region else 'Default'} - Station"}
        },
        {
            "uid": 2004,
            "aqi": "138",
            "lat": lat_c + 0.0541,
            "lon": lon_c - 0.0845,
            "station": {"name": f"Station Delta, {flow_obj.region.name if flow_obj.region else 'Default'} - Station"}
        },
        {
            "uid": 2005,
            "aqi": "131",
            "lat": lat_c + 0.0145,
            "lon": lon_c + 0.0320,
            "station": {"name": f"Station Epsilon, {flow_obj.region.name if flow_obj.region else 'Default'} - Station"}
        }
    ]

    clean_key = API_KEY.split('#')[0].strip() if API_KEY else ""
    if not clean_key or "register at" in clean_key:
        print(f"No WAQI API key configured or placeholder key found. Generating high-fidelity mock {flow_obj.region.name if flow_obj.region else 'Default'} stations.")
        asyncio.run(broadcast({
            "type": "trace",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": {
                "source": "waqi",
                "message": f"No WAQI API Key configured or placeholder key found. Generating high-fidelity mock {flow_obj.region.name if flow_obj.region else 'Default'} stations."
            }
        }))
        return mock_fallback

    if not flow_obj.is_online():
        print("Offline - skipping fetch")
        asyncio.run(broadcast({
            "type": "trace",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": {
                "source": "waqi",
                "message": "Offline - skipped fetching WAQI stations"
            }
        }))
        return []

    asyncio.run(broadcast({
        "type": "trace",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "payload": {
            "source": "waqi",
            "message": f"Fetching stations within bounding coordinates from WAQI..."
        }
    }))

    # bbox is (west, south, east, north)
    # WAQI wants latlng: south,west,north,east
    south, west, north, east = bbox[1], bbox[0], bbox[3], bbox[2]
    try:
        data = flow_obj.fetch(
            f"{BASE_URL}/map/bounds/",
            params={"latlng": f"{south},{west},{north},{east}", "token": clean_key}
        )
        if data.get("status") == "error" or not isinstance(data.get("data"), list):
            print(f"WAQI API returned error: {data.get('data')}. Falling back to mock stations.")
            asyncio.run(broadcast({
                "type": "trace",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "payload": {
                    "source": "waqi",
                    "message": f"WAQI API returned error: {data.get('data')}. Generating mock fallback observations."
                }
            }))
            return mock_fallback

        stations = data.get("data", [])
        
        asyncio.run(broadcast({
            "type": "trace",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": {
                "source": "waqi",
                "message": f"Successfully fetched {len(stations)} stations from WAQI"
            }
        }))
        return stations
    except Exception as e:
        print("Error fetching from WAQI, falling back to mock data:", e)
        asyncio.run(broadcast({
            "type": "trace",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": {
                "source": "waqi",
                "message": f"Error fetching WAQI stations ({str(e)}). Generating mock fallback observations."
            }
        }))
        return mock_fallback

def write_waqi_to_db(stations: list, flow_obj: WAQIFlow) -> int:
    if not stations:
        return 0
        
    observations = []
    
    asyncio.run(broadcast({
        "type": "trace",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "payload": {
            "source": "waqi",
            "message": "Validating and preparing WAQI observations for database..."
        }
    }))

    for station in stations:
        if station.get("aqi") == "-":
            continue
        try:
            aqi = float(station["aqi"])
            lat = float(station["lat"])
            lon = float(station["lon"])
        except (ValueError, TypeError, KeyError):
            continue

        observations.append({
            "id":           str(uuid.uuid4()),
            "source_id":    flow_obj.source.id,
            "region_id":    flow_obj.region.id,
            "layer_type":   "aq",
            "geometry":     flow_obj.normalize_point(lat, lon),
            "value":        aqi,
            "unit":         "AQI",
            "station_id":   str(station["uid"]),
            "station_name": station.get("station", {}).get("name", "WAQI Station"),
            "observed_at":  datetime.now(timezone.utc),
            "raw_payload":  station
        })

    try:
        flow_obj.bulk_write(observations)
        flow_obj.update_source_sync_time()
        
        asyncio.run(broadcast({
            "type": "trace",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": {
                "source": "waqi",
                "message": f"Successfully wrote {len(observations)} observations to the database"
            }
        }))
        return len(observations)
    except Exception as e:
        flow_obj.record_error(str(e))
        asyncio.run(broadcast({
            "type": "trace",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": {
                "source": "waqi",
                "message": f"Error inserting WAQI observations into DB: {str(e)}"
            }
        }))
        raise e

@flow(name="waqi-ingestion")
def waqi_flow():
    flow_obj = WAQIFlow()
    if not flow_obj.region:
        print("No active region configured. Skipping.")
        return

    from db.queries import get_active_region_bbox
    bbox = get_active_region_bbox(flow_obj.db)

    stations = fetch_waqi_stations(bbox)
    print(f"Fetched {len(stations)} WAQI stations")
    
    count = write_waqi_to_db(stations, flow_obj)
    print(f"Wrote {count} WAQI observations")

    # Broadcast standard sync status
    asyncio.run(broadcast({
        "type": "sync_status",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "payload": {
            "source": "waqi",
            "layer_type": "aq",
            "count": count,
            "status": "success"
        }
    }))
    
    flow_obj.close()

if __name__ == "__main__":
    waqi_flow()
