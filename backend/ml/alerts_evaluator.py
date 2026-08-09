import os
import uuid
import json
import structlog
from datetime import datetime, timezone, timedelta
from sqlalchemy import text, func
from sqlalchemy.orm import Session
from db.models import AlertRule, AlertEvent, ZoneGeometry, MLOutput, RawObservation
from ml.runner import broadcast_sync, _recommend_action

log = structlog.get_logger()

def ensure_columns(db: Session):
    dialect = db.bind.dialect.name
    # 1. Check consecutive_fires on alert_rules
    try:
        db.execute(text("SELECT consecutive_fires FROM alert_rules LIMIT 1"))
    except Exception:
        db.rollback()
        log.info("Adding consecutive_fires column to alert_rules")
        if dialect == "postgresql":
            db.execute(text("ALTER TABLE alert_rules ADD COLUMN consecutive_fires INT DEFAULT 0;"))
        else:
            db.execute(text("ALTER TABLE alert_rules ADD COLUMN consecutive_fires INTEGER DEFAULT 0;"))
        db.commit()
    
    # 2. Check severity on alert_events
    try:
        db.execute(text("SELECT severity FROM alert_events LIMIT 1"))
    except Exception:
        db.rollback()
        log.info("Adding severity column to alert_events")
        if dialect == "postgresql":
            db.execute(text("ALTER TABLE alert_events ADD COLUMN severity VARCHAR(20) DEFAULT 'warning';"))
        else:
            db.execute(text("ALTER TABLE alert_events ADD COLUMN severity TEXT DEFAULT 'warning';"))
        db.commit()

    # 3. Check consecutive_fires_by_zone on alert_rules
    try:
        db.execute(text("SELECT consecutive_fires_by_zone FROM alert_rules LIMIT 1"))
    except Exception:
        db.rollback()
        log.info("Adding consecutive_fires_by_zone column to alert_rules")
        if dialect == "postgresql":
            db.execute(text("ALTER TABLE alert_rules ADD COLUMN consecutive_fires_by_zone TEXT DEFAULT '{}';"))
        else:
            db.execute(text("ALTER TABLE alert_rules ADD COLUMN consecutive_fires_by_zone TEXT DEFAULT '{}';"))
        db.commit()

def get_current_zone_value(db: Session, zone_id: str, layer_type: str) -> tuple:
    # Returns (current_value, timestamp) or (None, None)
    if layer_type in ["risk_score", "composite"]:
        latest_risk = db.query(MLOutput).filter(
            MLOutput.zone_id == zone_id,
            MLOutput.model_type == "risk_score"
        ).order_by(MLOutput.computed_at.desc()).first()
        if latest_risk:
            return float(latest_risk.value), latest_risk.computed_at
        return None, None

    # Query latest raw observation inside the zone using ST_Within
    row = db.execute(text("""
        SELECT AVG(o.value) as val, MAX(o.observed_at) as observed_at
        FROM raw_observations o
        JOIN zone_geometries z ON ST_Within(o.geometry, z.geometry)
        WHERE z.id = :zone_id
          AND o.layer_type = :layer_type
          AND o.observed_at >= :cutoff
    """), {
        "zone_id": zone_id,
        "layer_type": layer_type,
        "cutoff": datetime.now(timezone.utc) - timedelta(hours=24)
    }).fetchone()

    if row and row.val is not None:
        dt = row.observed_at
        if isinstance(dt, str):
            dt = datetime.fromisoformat(dt.replace('Z', '+00:00'))
        return float(row.val), dt
    return None, None

def evaluate_alerts(db: Session, region_id: str):
    ensure_columns(db)
    
    rules = db.query(AlertRule).filter(AlertRule.is_active == True).all()
    triggered_now = datetime.now(timezone.utc)
    
    for rule in rules:
        # Get zones for this rule
        if rule.zone_id:
            zones = db.query(ZoneGeometry).filter(ZoneGeometry.id == rule.zone_id).all()
        else:
            zones = db.query(ZoneGeometry).filter(ZoneGeometry.region_id == region_id).all()
            
        for zone in zones:
            val, observed_at = get_current_zone_value(db, zone.id, rule.layer_type)
            if val is None:
                continue
                
            # Check threshold
            fired = False
            if rule.operator == 'gt' and val > rule.threshold:
                fired = True
            elif rule.operator == 'lt' and val < rule.threshold:
                fired = True
            
            # Load per-zone fire tracking dictionary
            raw_json = getattr(rule, "consecutive_fires_by_zone", None) or '{}'
            try:
                fires_by_zone = json.loads(raw_json)
            except Exception:
                fires_by_zone = {}
                
            zone_key = str(zone.id)
            
            if fired:
                fires_by_zone[zone_key] = fires_by_zone.get(zone_key, 0) + 1
            else:
                fires_by_zone[zone_key] = 0
                
            rule.consecutive_fires_by_zone = json.dumps(fires_by_zone)
            db.commit()
            
            if fired:
                escalated_severity = rule.severity
                if fires_by_zone.get(zone_key, 0) >= 3:
                    escalated_severity = "critical"
                    
                # Get cause and risk info
                latest_risk = db.query(MLOutput).filter(
                    MLOutput.zone_id == zone.id,
                    MLOutput.model_type == "risk_score"
                ).order_by(MLOutput.computed_at.desc()).first()
                
                current_risk = latest_risk.value if latest_risk else 50.0
                cause = "unknown"
                if latest_risk and latest_risk.explanation:
                    try:
                        expl = json.loads(latest_risk.explanation)
                        cause = expl.get("cause", "unknown")
                    except Exception:
                        cause = latest_risk.explanation
                if cause == "unknown" or not cause:
                    cause = f"High {rule.layer_type.upper()} reading"
                
                event_id = uuid.uuid4()
                zone_id_str = str(zone.id)
                
                # Create alert event
                event = AlertEvent(
                    id=event_id,
                    rule_id=rule.id,
                    triggered_at=triggered_now,
                    observed_value=val,
                    location=func.ST_Centroid(zone.geometry),
                    acknowledged=False,
                    severity=escalated_severity
                )
                db.add(event)
                db.commit()
                
                # Generate action recommendation
                rec = _recommend_action({"risk_score": current_risk}, [{"cause": cause}])
                recommended_action = rec.get("action", "Enhance monitoring and inspect local sensor nodes.")
                
                # WebSocket broadcast payload
                payload = {
                    "id": str(event_id),
                    "rule_name": rule.name,
                    "zone_name": zone.name,
                    "zone_id": zone_id_str,
                    "current_value": val,
                    "threshold": rule.threshold,
                    "operator": rule.operator,
                    "severity": escalated_severity,
                    "layer_type": rule.layer_type,
                    "cause": cause,
                    "recommended_action": recommended_action,
                    "unit": "ug/m3" if rule.layer_type == "aq" else "°C" if rule.layer_type == "lst" else "",
                    "timestamp": triggered_now.isoformat()
                }
                
                broadcast_sync({
                    "type": "alert",
                    "timestamp": triggered_now.isoformat(),
                    "payload": payload
                })
                
                log.info("Alert fired successfully!", rule_name=rule.name, zone_name=zone.name, severity=escalated_severity)