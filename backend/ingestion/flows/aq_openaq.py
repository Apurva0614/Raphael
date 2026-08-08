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
def fetch_measurements(location_id: int) -> list:
    flow_obj = OpenAQFlow()
    headers  = {"X-API-Key": API_KEY} if API_KEY else {}
    data = flow_obj.fetch(
        f"{BASE_URL}/measurements",
        params={"location_id": location_id, "parameter": "pm25", "limit": 24},
        headers=headers
    )
    return data.get("results", [])

@task(name="write-openaq-to-db")
def write_to_db(locations: list, flow_obj: OpenAQFlow):
    observations = []
    for loc in locations:
        for sensor in loc.get("sensors", []):
            latest = sensor.get("latest", {})
            if not latest.get("value"):
                continue
            raw_data = dict(latest)
            raw_data["lat"] = loc["coordinates"]["latitude"]
            raw_data["lon"] = loc["coordinates"]["longitude"]
            observations.append({
                "id":           uuid.uuid4(),
                "source_id":    flow_obj.source.id,
                "region_id":    flow_obj.region.id,
                "layer_type":   "aq",
                "geometry":     flow_obj.normalize_point(
                                    loc["coordinates"]["latitude"],
                                    loc["coordinates"]["longitude"]
                                ),
                "value":        float(latest["value"]),
                "unit":         "ug/m3",
                "station_id":   str(loc["id"]),
                "station_name": loc.get("name", ""),
                "observed_at":  datetime.fromisoformat(
                                    latest["datetime"].replace("Z", "+00:00")
                                ) if latest.get("datetime") else datetime.now(timezone.utc),
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

    bbox = flow_obj.db.execute(
        "SELECT ST_MinX(bbox), ST_MinY(bbox), ST_MaxX(bbox), ST_MaxY(bbox) FROM regions WHERE is_active = true"
    ).fetchone()

    locations = fetch_locations(tuple(bbox))
    print(f"Found {len(locations)} OpenAQ stations")
    count = write_to_db(locations, flow_obj)
    print(f"Wrote {count} observations")
    flow_obj.close()

if __name__ == "__main__":
    openaq_flow()
