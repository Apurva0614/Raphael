from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session
from db.connection import get_db

router = APIRouter()

@router.get("")
async def get_anomalies(days: int = Query(7, ge=1, le=365), db: Session = Depends(get_db)):
    rows = db.execute(text("""
        SELECT id, layer_type, value, unit, station_name, observed_at, anomaly_score
        FROM raw_observations
        WHERE is_anomalous = 1
          AND observed_at > datetime('now', :days_interval)
        ORDER BY observed_at DESC
    """), {"days_interval": f"-{days} days"}).fetchall()
    
    anomalies = []
    for r in rows:
        observed_str = r.observed_at.isoformat() if hasattr(r.observed_at, "isoformat") else str(r.observed_at)
        anomalies.append({
            "id": str(r.id),
            "layer_type": r.layer_type,
            "value": r.value,
            "unit": r.unit,
            "station_name": r.station_name,
            "observed_at": observed_str,
            "anomaly_score": r.anomaly_score
        })
        
    return {
        "status": "success",
        "data": anomalies,
        "meta": {"count": len(anomalies), "days": days},
        "errors": []
    }
