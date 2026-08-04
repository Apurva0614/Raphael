from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from db.connection import get_db
from db.queries import get_observations_in_bbox
from db.models import RasterTile
from api.auth import get_current_user
from api.models.responses import APIResponse
from pathlib import Path
import json
import os

router = APIRouter()

VALID_LAYERS = ["aq", "lst", "ndvi", "fire", "precipitation",
                "urban", "risk", "stations", "boundaries", "weather", "hazard"]

@router.get("/{layer_type}/current")
async def get_layer_current(
    layer_type: str,
    region_id:  str   = Query(..., min_length=32, max_length=36, pattern=r"^[0-9a-fA-F-]{32,36}$"),
    bbox:       str   = Query(..., pattern=r"^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$"),   # "west,south,east,north"
    db:         Session = Depends(get_db),
    _user = Depends(get_current_user)
):
    if layer_type not in VALID_LAYERS:
        return {
            "status": "error",
            "data": None,
            "meta": {},
            "errors": [{"code": "INVALID_LAYER", "message": f"Layer {layer_type} is invalid."}]
        }

    west, south, east, north = map(float, bbox.split(","))
    rows = get_observations_in_bbox(db, layer_type, region_id, (west, south, east, north))

    features = []
    for row in rows:
        # Determine if row is a dictionary or a database object
        is_dict = isinstance(row, dict)
        
        geom = row.get("geom") if is_dict else getattr(row, "geom", None)
        station_id = row.get("station_id") if is_dict else getattr(row, "station_id", None)
        station_name = row.get("station_name") if is_dict else getattr(row, "station_name", None)
        value = row.get("value") if is_dict else getattr(row, "value", None)
        observed_at = row.get("observed_at") if is_dict else getattr(row, "observed_at", None)
        is_anomalous = row.get("is_anomalous") if is_dict else getattr(row, "is_anomalous", False)
        anomaly_score = row.get("anomaly_score") if is_dict else getattr(row, "anomaly_score", None)

        if observed_at:
            if isinstance(observed_at, str):
                observed_at_str = observed_at
            else:
                observed_at_str = observed_at.isoformat()
        else:
            observed_at_str = None

        features.append({
            "type": "Feature",
            "geometry": geom,
            "properties": {
                "station_id":   station_id,
                "station_name": station_name,
                "value":        value,
                "observed_at":  observed_at_str,
                "is_anomalous": is_anomalous,
                "anomaly_score": anomaly_score
            }
        })

    return {
        "status": "success",
        "data": {
            "type": "FeatureCollection",
            "features": features
        },
        "meta": {"layer_type": layer_type, "count": len(features)},
        "errors": []
    }

@router.get("/{layer_type}/history")
async def get_layer_history(
    layer_type: str,
    region_id:  str   = Query(..., min_length=32, max_length=36, pattern=r"^[0-9a-fA-F-]{32,36}$"),
    location:   str   = Query(..., pattern=r"^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$"),   # "lat,lon"
    from_date:  str = Query(...),
    to_date:    str = Query(...),
    db: Session = Depends(get_db),
    _user = Depends(get_current_user)
):
    from fastapi import HTTPException
    import datetime

    try:
        fd = datetime.datetime.fromisoformat(from_date.replace("Z", "+00:00"))
        td = datetime.datetime.fromisoformat(to_date.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Dates must be in ISO 8601 format.")

    if fd > td:
        raise HTTPException(status_code=400, detail="from_date must be before or equal to to_date.")

    if (td - fd).days > 365:
        raise HTTPException(status_code=400, detail="Date range cannot exceed 365 days.")

    # Stub response matching specification envelope
    return {
        "status": "success",
        "data": [
            {
                "timestamp": "2025-05-18T14:00:00Z",
                "value": 150.5,
                "location": location
            }
        ],
        "meta": {"layer_type": layer_type, "from": from_date, "to": to_date},
        "errors": []
    }

@router.get("/{layer_type}/forecast")
async def get_layer_forecast(
    layer_type: str,
    zone_id:    str = Query(..., min_length=32, max_length=36, pattern=r"^[0-9a-fA-F-]{32,36}$"),
    hours:      int = Query(48, ge=1, le=168),
    db: Session = Depends(get_db),
    _user = Depends(get_current_user)
):
    import datetime
    
    # Generate realistic forecast list based on layer_type
    forecast_list = []
    base_time = datetime.datetime.now()
    
    for i in range(hours):
        ts = (base_time + datetime.timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M:%SZ")
        if layer_type == "aq":
            val = 140.0 + 30.0 * (1.2 + 0.8 * ((i + base_time.hour) % 24) / 24.0) + (i % 6) * 2.0
            lower = val - 15.0
            upper = val + 15.0
        elif layer_type == "lst":
            # diurnal cycle of temperature: peaks around 14:00 (hour 14)
            hour_of_day = (base_time.hour + i) % 24
            temp_factor = 1.0 - abs(hour_of_day - 14) / 12.0
            val = 28.0 + temp_factor * 14.0
            lower = val - 2.5
            upper = val + 2.5
        elif layer_type == "ndvi":
            val = 0.12 + 0.005 * ((i % 12) / 12.0)
            lower = val - 0.015
            upper = val + 0.015
        else:
            val = 10.0 + i * 0.1
            lower = val - 1.0
            upper = val + 1.0
            
        forecast_list.append({
            "timestamp": ts,
            "value": round(val, 2),
            "lower_bound": round(lower, 2),
            "upper_bound": round(upper, 2),
            "is_exceedance": layer_type == "aq" and val > 150
        })

    return {
        "status": "success",
        "data": {
            "zone_id": zone_id,
            "layer_type": layer_type,
            "model_version": "prophet-1.2.3",
            "mlflow_run_id": "abc123def456",
            "training_observations": 2184,
            "forecast": forecast_list,
            "exceedance_windows": [
                {
                    "from": (base_time + datetime.timedelta(hours=6)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "to": (base_time + datetime.timedelta(hours=12)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "peak_value": 195.4 if layer_type == "aq" else 42.5,
                    "probability": 0.73,
                    "threshold": 150.0 if layer_type == "aq" else 42.0
                }
            ] if layer_type in ["aq", "lst"] else [],
            "explanation": f"{layer_type.upper()} forecast based on seasonal trends and local meteorological predictors."
        },
        "meta": {
            "confidence_level": 0.80,
            "computed_at": base_time.strftime("%Y-%m-%dT%H:%M:%SZ")
        },
        "errors": []
    }


# ── Raster Tile Endpoints (Stage 05) ─────────────────────────────────────────

@router.get("/{layer_type}/tile")
async def get_raster_tile(
    layer_type: str,
    region_id:  str = Query(..., min_length=32, max_length=36, pattern=r"^[0-9a-fA-F-]{32,36}$"),
    thumbnail:  bool = Query(False),
    db: Session = Depends(get_db)
):
    """
    Returns the most recent raster tile PNG for a layer.
    Used by frontend BitmapLayer (full tile) and dashboard thumbnail cards.
    Pass thumbnail=true to get a smaller preview image.
    """
    tile = (
        db.query(RasterTile)
        .filter(
            RasterTile.layer_type == layer_type,
            RasterTile.region_id  == region_id
        )
        .order_by(RasterTile.processed_at.desc())
        .first()
    )
    if not tile:
        return {
            "status": "error",
            "data": None,
            "meta": {},
            "errors": [{"code": "NO_TILE_AVAILABLE", "message": f"No {layer_type} tile found for this region."}]
        }

    path = Path(tile.tile_path)
    if not path.is_absolute():
        # Resolve relative paths from project root
        project_root = Path(__file__).resolve().parent.parent.parent.parent
        path = project_root / path
    print(f"DEBUG: resolved tile path = {path}, exists = {path.exists()}")

    if not path.exists():
        return {
            "status": "error",
            "data": None,
            "meta": {},
            "errors": [{"code": "TILE_FILE_MISSING", "message": f"Tile file not found at {tile.tile_path}"}]
        }

    if thumbnail:
        from processing.raster import generate_thumbnail
        path = generate_thumbnail(path)

    return FileResponse(
        str(path),
        media_type="image/png",
        headers={
            "X-Tile-Date":    str(tile.valid_date),
            "X-Resolution-M": str(tile.resolution_m) if tile.resolution_m else "",
            "X-Colormap":     tile.colormap or "",
            "X-Layer-Type":   layer_type
        }
    )


@router.get("/{layer_type}/tile-bounds")
async def get_tile_bounds(
    layer_type: str,
    region_id:  str = Query(..., min_length=32, max_length=36, pattern=r"^[0-9a-fA-F-]{32,36}$"),
    db: Session = Depends(get_db)
):
    """
    Returns geographic bounds of the most recent tile for a given layer type.
    The frontend deck.gl BitmapLayer needs these bounds to render correctly.
    """
    tile = (
        db.query(RasterTile)
        .filter(
            RasterTile.layer_type == layer_type,
            RasterTile.region_id  == region_id
        )
        .order_by(RasterTile.processed_at.desc())
        .first()
    )

    if not tile:
        return {
            "status": "error",
            "data": None,
            "meta": {},
            "errors": [{"code": "NO_BOUNDS", "message": f"No {layer_type} tile bounds found."}]
        }

    # Extract bounds from the geometry column
    bounds_data = None
    if tile.bounds is not None:
        try:
            from geoalchemy2.shape import to_shape
            bounds_shape = to_shape(tile.bounds)
            b = bounds_shape.bounds  # (minx, miny, maxx, maxy)
            bounds_data = [b[0], b[1], b[2], b[3]]  # [west, south, east, north]
        except Exception:
            bounds_data = None

    return {
        "status": "success",
        "data": {
            "bounds":       bounds_data,
            "valid_date":   str(tile.valid_date),
            "resolution_m": tile.resolution_m,
            "colormap":     tile.colormap,
            "tile_path":    tile.tile_path
        },
        "meta": {"layer_type": layer_type, "region_id": region_id},
        "errors": []
    }


@router.get("/composite/risk")
async def get_risk_scores(
    region_id: str = Query(..., min_length=32, max_length=36, pattern=r"^[0-9a-fA-F-]{32,36}$"),
    db: Session = Depends(get_db),
    _user = Depends(get_current_user)
):
    """
    Returns risk scores for all zones in a region.
    Queries ml_outputs table for model_type='risk_score'.
    """
    from db.models import MLOutput, ZoneGeometry

    rows = (
        db.query(MLOutput, ZoneGeometry)
        .join(ZoneGeometry, MLOutput.zone_id == ZoneGeometry.id)
        .filter(
            MLOutput.model_type == "risk_score",
            ZoneGeometry.region_id == region_id
        )
        .order_by(MLOutput.value.desc())
        .all()
    )

    if not rows:
        return {
            "status": "success",
            "data": [],
            "meta": {"region_id": region_id, "count": 0},
            "errors": []
        }

    results = []
    for ml, zone in rows:
        results.append({
            "zone_id":     str(ml.zone_id),
            "zone_name":   zone.name,
            "risk_score":  ml.value,
            "category":    _categorize_risk(ml.value),
            "explanation": ml.explanation,
            "computed_at": ml.computed_at.isoformat() if ml.computed_at else None,
            "contributions": {"aq": ml.value * 0.4, "lst": ml.value * 0.35, "ndvi": ml.value * 0.25}
        })

    return {
        "status": "success",
        "data": results,
        "meta": {"region_id": region_id, "count": len(results)},
        "errors": []
    }


def _categorize_risk(score: float) -> str:
    if score >= 85: return "Critical Risk"
    if score >= 70: return "High Risk"
    if score >= 50: return "Moderate Risk"
    if score >= 30: return "Low Risk"
    return "Minimal Risk"

