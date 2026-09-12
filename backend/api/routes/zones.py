from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from db.connection import get_db, IS_SPATIALITE
from db.models import ZoneGeometry
from api.auth import get_current_user
from datetime import datetime, timezone, timedelta
from sqlalchemy import text
from typing import Optional
from ml.risk_score import get_zone_risk_assessment
from utils.geo import km_to_degrees

def pm25_to_indian_aqi(pm25: float) -> int:
    if pm25 <= 0:
        return 0
    if pm25 <= 30:
        return int(round(0 + (pm25 - 0) * (50 - 0) / (30 - 0)))
    elif pm25 <= 60:
        return int(round(51 + (pm25 - 31) * (100 - 51) / (60 - 31)))
    elif pm25 <= 90:
        return int(round(101 + (pm25 - 61) * (200 - 101) / (90 - 61)))
    elif pm25 <= 120:
        return int(round(201 + (pm25 - 91) * (300 - 201) / (120 - 91)))
    elif pm25 <= 250:
        return int(round(301 + (pm25 - 121) * (400 - 301) / (250 - 121)))
    else:
        val = int(round(401 + (pm25 - 250) * (500 - 401) / (380 - 250)))
        return min(val, 500)

router = APIRouter()

# ---------------------------------------------------------------------------
# Mock telemetry data — used because raw_observations and ml_outputs have
# ZERO rows for any Pune-area region/zone as of 2026-06-21.
#
# TODO: Once the ingestion pipeline (backend/ingestion/) has been run against
# Pune's bbox (73.7-74.0, 18.4-18.65) to populate raw_observations, replace
# this static dict with real queries against raw_observations + ml_outputs,
# using the same spatial join pattern as db/queries.py:get_zone_current_indicators().
# ---------------------------------------------------------------------------
MOCK_TELEMETRY = {
    "Hadapsar Industrial": {
        "aqi": 168, "lst": 36.7, "ndvi": 0.22, "risk": 8.4,
        "classification": "Industrial Plume", "severity": "critical",
        "radiusKm": 12,
    },
    "Pune NE Quadrant": {
        "aqi": 142, "lst": 38.4, "ndvi": 0.34, "risk": 7.8,
        "classification": "Heat-Stressed Urban", "severity": "critical",
        "radiusKm": 15,
    },
    "Kothrud Residential": {
        "aqi": 96, "lst": 32.1, "ndvi": 0.52, "risk": 5.4,
        "classification": "Moderate Risk", "severity": "warning",
        "radiusKm": 10,
    },
    "Katraj Hills": {
        "aqi": 58, "lst": 27.9, "ndvi": 0.71, "risk": 2.6,
        "classification": "Nominal", "severity": "nominal",
        "radiusKm": 14,
    },
    "Shivajinagar": {
        "aqi": 89, "lst": 34.8, "ndvi": 0.44, "risk": 4.3,
        "classification": "Mixed Urban", "severity": "warning",
        "radiusKm": 10,
    },
    "Aundh": {
        "aqi": 51, "lst": 31.4, "ndvi": 0.58, "risk": 1.8,
        "classification": "Nominal", "severity": "nominal",
        "radiusKm": 10,
    },
}

_DEFAULT_TELEMETRY = {
    "aqi": 0, "lst": 0, "ndvi": 0, "risk": 0,
    "classification": "Unknown", "severity": "nominal",
    "radiusKm": 10,
}


def _zone_centroid(z: ZoneGeometry) -> tuple:
    """Extract centroid lat/lon from zone properties or geometry."""
    # Fast path: centroid stored in properties JSON during seeding
    if z.properties and isinstance(z.properties, dict):
        lat = z.properties.get("centroid_lat")
        lon = z.properties.get("centroid_lon")
        if lat is not None and lon is not None:
            return (lat, lon)
    # Slow path: compute from geometry via SpatiaLite/PostGIS
    try:
        from geoalchemy2.shape import to_shape
        shape = to_shape(z.geometry)
        centroid = shape.centroid
        return (centroid.y, centroid.x)
    except Exception:
        return (0.0, 0.0)


def _enrich_zone(z: ZoneGeometry, db: Session) -> dict:
    """Build a flat zone dict with telemetry, suitable for API response."""
    lat, lon = _zone_centroid(z)
    telemetry = MOCK_TELEMETRY.get(z.name, _DEFAULT_TELEMETRY)
    radius_km = telemetry.get("radiusKm", 10.0)

    # Determine spatial point geom based on database engine type
    if IS_SPATIALITE:
        point_geom = "MakePoint(:lon, :lat, 4326)"
    else:
        point_geom = "ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)"

    # Helper function to get the latest value for a layer_type within the zone's buffer
    def get_latest_val(layer_type: str, lookback_hours: int, custom_radius: Optional[float] = None) -> tuple[Optional[float], Optional[datetime]]:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=lookback_hours)
        radius_val = custom_radius if custom_radius is not None else radius_km
        
        # Build layer-specific filters
        if layer_type in ("aq", "pm25"):
            if IS_SPATIALITE:
                layer_filter = """
                  AND (
                    layer_type IN ('aq', 'pm25') 
                    OR json_extract(raw_payload, '$.parameter') IN 
                       ('pm25', 'pm2.5', 'PM2.5', 'PM25')
                  )
                """
            else:
                layer_filter = """
                  AND (
                    layer_type IN ('aq', 'pm25') 
                    OR raw_payload ->> 'parameter' IN 
                       ('pm25', 'pm2.5', 'PM2.5', 'PM25')
                  )
                """
        else:
            layer_filter = "AND layer_type = :layer_type"
 
        sql = text(f"""
            SELECT value, observed_at
            FROM raw_observations
            WHERE region_id = :region_id
              {layer_filter}
              AND ST_Distance(geometry, {point_geom}) <= :radius_deg
              AND observed_at >= :cutoff
            ORDER BY ST_Distance(geometry, {point_geom}) ASC, observed_at DESC
            LIMIT 1
        """)
        row = db.execute(sql, {
            "region_id": str(z.region_id),
            "layer_type": layer_type,
            "lon": lon,
            "lat": lat,
            "radius_deg": km_to_degrees(radius_val),
            "cutoff": cutoff
        }).first()
        if row:
            return float(row.value), row.observed_at
        return None, None
 
    # Fetch values (48h lookback for AQ/weather, 8 days lookback for LST/NDVI)
    aq_val, aq_at = get_latest_val("aq", 48)
    if aq_val is None:
        aq_val, aq_at = get_latest_val("pm25", 48)
    if aq_val is None:
        aq_val, aq_at = get_latest_val("aq", 48, custom_radius=50.0)
    if aq_val is None:
        aq_val, aq_at = get_latest_val("pm25", 48, custom_radius=50.0)
 
    lst_val, lst_at = get_latest_val("lst", 24 * 8)
    ndvi_val, ndvi_at = get_latest_val("ndvi", 24 * 8)

    is_live = (aq_val is not None) or (lst_val is not None) or (ndvi_val is not None)

    if is_live:
        aqi = pm25_to_indian_aqi(aq_val) if aq_val is not None else telemetry["aqi"]
        lst = lst_val if lst_val is not None else telemetry["lst"]
        ndvi = ndvi_val if ndvi_val is not None else telemetry["ndvi"]
        
        # Calculate risk composite score using the unified ml/risk_score formula
        assessment = get_zone_risk_assessment(aqi, lst, ndvi)
        risk = assessment["value"]
        classification = assessment["category"]
        severity = "critical" if classification in ("Critical Risk", "High Risk") else ("warning" if classification == "Moderate Risk" else "nominal")
        data_source = "live"
    else:
        aqi = telemetry["aqi"]
        lst = telemetry["lst"]
        ndvi = telemetry["ndvi"]
        risk = telemetry["risk"]
        classification = telemetry["classification"]
        severity = telemetry["severity"]
        data_source = "mock"

    return {
        "id": str(z.id),
        "region_id": str(z.region_id),
        "admin_level": z.admin_level,
        "name": z.name,
        "name_local": z.name_local,
        "gadm_gid": z.gadm_gid,
        "source": z.source,
        "lat": lat,
        "lon": lon,
        "radiusKm": radius_km,
        "aqi": aqi,
        "lst": lst,
        "ndvi": ndvi,
        "risk": risk,
        "classification": classification,
        "severity": severity,
        "data_source": data_source,
    }


@router.get("/")
async def list_zones(
    region_id: str = Query(..., min_length=32, max_length=36, pattern=r"^[0-9a-fA-F-]{32,36}$"),
    format: str = Query(None, pattern=r"^(geojson)?$"),
    db: Session = Depends(get_db),
    _user = Depends(get_current_user)
):
    if format == "geojson":
        import asyncio
        from db.queries import get_zone_geometries_geojson
        geojson_data = await asyncio.to_thread(get_zone_geometries_geojson, db, region_id)
        return {
            "status": "success",
            "data": geojson_data,
            "meta": {"count": len(geojson_data["features"])},
            "errors": []
        }

    zones = db.query(ZoneGeometry).filter(ZoneGeometry.region_id == region_id).all()
    data = [_enrich_zone(z, db) for z in zones]
    return {
        "status": "success",
        "data": data,
        "meta": {"count": len(data), "data_source": "live" if any(d["data_source"] == "live" for d in data) else "mock"},
        "errors": []
    }


@router.get("/{id}")
async def get_zone(id: str, db: Session = Depends(get_db), _user = Depends(get_current_user)):
    z = db.query(ZoneGeometry).filter(ZoneGeometry.id == id).first()
    if not z:
        raise HTTPException(status_code=404, detail="Zone not found")
    enriched = _enrich_zone(z, db)
    return {
        "status": "success",
        "data": enriched,
        "meta": {"data_source": enriched["data_source"]},
        "errors": []
    }


@router.get("/{id}/scorecard")
async def get_zone_scorecard(id: str, db: Session = Depends(get_db), _user = Depends(get_current_user)):
    z = db.query(ZoneGeometry).filter(ZoneGeometry.id == id).first()
    if not z:
        raise HTTPException(status_code=404, detail="Zone not found")

    enriched = _enrich_zone(z, db)
    lat, lon = enriched["lat"], enriched["lon"]

    # Look up parent region name
    from db.models import Region
    region = db.query(Region).filter(Region.id == z.region_id).first()
    region_name = region.name if region else "Unknown"

    # Compute risk assessment details using raw values
    assessment = get_zone_risk_assessment(enriched["aqi"], enriched["lst"], enriched["ndvi"])

    return {
        "status": "success",
        "data": {
            "zone": {
                "id": str(z.id),
                "name": z.name,
                "admin_level": z.admin_level,
                "region": region_name,
                "lat": lat,
                "lon": lon,
            },
            "indicators": {
                "aq":   { "current": enriched["aqi"], "unit": "ug/m3",  "category": _aqi_category(enriched["aqi"]),  "trend_30d": "stable", "trend_pct": 0 },
                "lst":  { "current": enriched["lst"], "unit": "celsius", "category": _lst_category(enriched["lst"]),  "trend_30d": "stable", "trend_pct": 0 },
                "ndvi": { "current": enriched["ndvi"], "unit": "index",  "category": _ndvi_category(enriched["ndvi"]), "trend_30d": "stable", "trend_pct": 0 },
            },
            "risk_score": {
                "value": enriched["risk"],
                "category": enriched["classification"],
                "explanation": assessment["explanation"] if enriched["data_source"] == "live" else "Mock data — run ingestion pipeline against Pune bbox to populate real observations.",
                "contributions": assessment["contributions"]
            },
            "classification": enriched["classification"],
            "severity": enriched["severity"],
            "data_source": enriched["data_source"],
            "data_sources": [],
            "recent_alerts": [],
            "event_markers": []
        },
        "meta": {
            "computed_at": datetime.now(timezone.utc).isoformat() if enriched["data_source"] == "live" else None,
            "data_source": enriched["data_source"],
        },
        "errors": []
    }


def _aqi_category(val: float) -> str:
    if val > 200: return "Severe"
    if val > 150: return "Very Poor"
    if val > 100: return "Poor"
    if val > 50:  return "Moderate"
    return "Good"


def _lst_category(val: float) -> str:
    if val > 42: return "Extreme"
    if val > 36: return "High"
    if val > 30: return "Moderate"
    return "Normal"


def _ndvi_category(val: float) -> str:
    if val < 0.15: return "Very Low"
    if val < 0.30: return "Low"
    if val < 0.50: return "Moderate"
    return "Good"
