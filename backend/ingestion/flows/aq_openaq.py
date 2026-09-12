import sys
import os

# Ensure backend directory is in the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from prefect import flow, task
import uuid
from datetime import datetime, timezone
from ingestion.base import BaseIngestionFlow

BASE_URL = "https://api.openaq.org/v3"
API_KEY  = os.getenv("OPENAQ_API_KEY", "")

class OpenAQFlow(BaseIngestionFlow):
    source_key = "openaq"
    layer_type  = "aq"

@task(name="fetch-openaq-locations", retries=3)
def fetch_locations(bbox: tuple) -> list:
    flow_obj = OpenAQFlow()
    if not flow_obj.is_online():
        return []
    west, south, east, north = bbox
    headers = {"X-API-Key": API_KEY} if API_KEY else {}
    data = flow_obj.fetch(
        f"{BASE_URL}/locations",
        params={
            "bbox":          f"{west},{south},{east},{north}",
            "limit":         1000,
            "parameters_id": "1,2,7,8,10"
        },
        headers=headers
    )
    return data.get("results", [])

@task(name="fetch-openaq-measurements", retries=3)
def fetch_measurements(sensor_id: int) -> list:
    flow_obj = OpenAQFlow()
    headers  = {"X-API-Key": API_KEY} if API_KEY else {}
    from datetime import datetime, timezone, timedelta
    date_from = (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat()
    data = flow_obj.fetch(
        f"{BASE_URL}/sensors/{sensor_id}/measurements",
        params={"limit": 24, "datetime_from": date_from},
        headers=headers
    )
    return data.get("results", [])

@task(name="write-openaq-to-db")
def write_to_db(locations: list, flow_obj: OpenAQFlow):
    observations = []
    
    def get_measurement_time(m):
        period = m.get("period") or {}
        dt_utc = (period.get("end") or {}).get("utc") or (period.get("datetimeTo") or {}).get("utc")
        return dt_utc

    for loc in locations:
        for sensor in loc.get("sensors", []):
            sensor_id = sensor["id"]
            measurements = fetch_measurements(sensor_id)
            if not measurements:
                continue
                
            valid_m = []
            for m in measurements:
                dt_str = get_measurement_time(m)
                if dt_str and m.get("value") is not None:
                    valid_m.append((dt_str, m))
                    
            if not valid_m:
                continue
                
            valid_m.sort(key=lambda x: x[0])
            newest_dt_str, newest_m = valid_m[-1]
            
            raw_data = {
                "value": newest_m["value"],
                "datetime": newest_dt_str,
                "parameter": newest_m.get("parameter", {}).get("name"),
                "unit": newest_m.get("parameter", {}).get("units") or "ug/m3",
                "lat": loc["coordinates"]["latitude"],
                "lon": loc["coordinates"]["longitude"]
            }
            
            observations.append({
                "id":           uuid.uuid4(),
                "source_id":    flow_obj.source.id,
                "region_id":    flow_obj.region.id,
                "layer_type":   "aq",
                "geometry":     flow_obj.normalize_point(
                                    loc["coordinates"]["latitude"],
                                    loc["coordinates"]["longitude"]
                                ),
                "value":        float(newest_m["value"]),
                "unit":         raw_data["unit"],
                "station_id":   str(loc["id"]),
                "station_name": loc.get("name", ""),
                "observed_at":  datetime.fromisoformat(
                                    newest_dt_str.replace("Z", "+00:00")
                                ) if newest_dt_str else datetime.now(timezone.utc),
                "raw_payload":  raw_data
            })
            
    flow_obj.bulk_write(observations)
    flow_obj.update_source_sync_time()
    return len(observations)

@flow(name="openaq-ingestion", log_prints=True)
def openaq_flow():
    flow_obj = OpenAQFlow()
    if not flow_obj.region:
        print("No active region configured. Skipping.")
        return

    from db.queries import get_active_region_bbox
    bbox = get_active_region_bbox(flow_obj.db)


    locations = fetch_locations(tuple(bbox))
    print(f"Found {len(locations)} OpenAQ stations")
    count = write_to_db(locations, flow_obj)
    print(f"Wrote {count} observations")
    flow_obj.close()

if __name__ == "__main__":
    openaq_flow()
