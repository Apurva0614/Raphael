import sys
import os
import uuid
import json
import pytest
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock

# Windows SSL patch for aiohttp / geopy certificate store quirk
import ssl
orig_load_default_certs = ssl.SSLContext.load_default_certs
def patched_load_default_certs(self, purpose=ssl.Purpose.SERVER_AUTH):
    try:
        return orig_load_default_certs(self, purpose)
    except Exception:
        try:
            import certifi
            self.load_verify_locations(certifi.where())
        except Exception:
            pass
ssl.SSLContext.load_default_certs = patched_load_default_certs

from db.connection import SessionLocal
from db.models import AlertRule, AlertEvent, ZoneGeometry
from ml.alerts_evaluator import evaluate_alerts, ensure_columns


@pytest.fixture
def db_session():
    session = SessionLocal()
    ensure_columns(session)
    yield session
    session.close()


def test_same_zone_three_consecutive_fires_escalates(db_session):
    region_id = str(uuid.uuid4())
    zone_a = ZoneGeometry(id=uuid.uuid4(), region_id=region_id, name="Zone A")
    db_session.add(zone_a)
    
    rule = AlertRule(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        name="AQ Exceeded",
        layer_type="aq",
        operator="gt",
        threshold=100.0,
        severity="warning",
        is_active=True,
        consecutive_fires_by_zone="{}"
    )
    db_session.add(rule)
    db_session.commit()

    with patch("ml.alerts_evaluator.broadcast_sync"), \
         patch("ml.alerts_evaluator._recommend_action", return_value={"action": "test"}):
        
        # Cycle 1: Fire
        with patch("ml.alerts_evaluator.get_current_zone_value", return_value=(150.0, datetime.now(timezone.utc))):
            evaluate_alerts(db_session, region_id)
        events = db_session.query(AlertEvent).filter(AlertEvent.rule_id == rule.id).all()
        assert len(events) == 1
        assert events[0].severity == "warning"

        # Cycle 2: Fire
        with patch("ml.alerts_evaluator.get_current_zone_value", return_value=(150.0, datetime.now(timezone.utc))):
            evaluate_alerts(db_session, region_id)
        events = db_session.query(AlertEvent).filter(AlertEvent.rule_id == rule.id).order_by(AlertEvent.triggered_at.asc()).all()
        assert len(events) == 2
        assert events[1].severity == "warning"

        # Cycle 3: Fire -> Should escalate to critical
        with patch("ml.alerts_evaluator.get_current_zone_value", return_value=(150.0, datetime.now(timezone.utc))):
            evaluate_alerts(db_session, region_id)
        events = db_session.query(AlertEvent).filter(AlertEvent.rule_id == rule.id).order_by(AlertEvent.triggered_at.asc()).all()
        assert len(events) == 3
        assert events[2].severity == "critical"


def test_three_different_zones_one_fire_each_does_not_escalate(db_session):
    region_id = str(uuid.uuid4())
    zone_a = ZoneGeometry(id=uuid.uuid4(), region_id=region_id, name="Zone A")
    zone_b = ZoneGeometry(id=uuid.uuid4(), region_id=region_id, name="Zone B")
    zone_c = ZoneGeometry(id=uuid.uuid4(), region_id=region_id, name="Zone C")
    db_session.add_all([zone_a, zone_b, zone_c])

    rule = AlertRule(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        name="Multi Zone Rule",
        layer_type="aq",
        operator="gt",
        threshold=100.0,
        severity="warning",
        is_active=True,
        consecutive_fires_by_zone="{}"
    )
    db_session.add(rule)
    db_session.commit()

    def zone_value_side_effect(db, zone_id, layer_type):
        # Fire zone A in cycle 1, zone B in cycle 2, zone C in cycle 3
        current_cycle = getattr(zone_value_side_effect, "cycle", 1)
        if current_cycle == 1 and str(zone_id) == str(zone_a.id):
            return (150.0, datetime.now(timezone.utc))
        elif current_cycle == 2 and str(zone_id) == str(zone_b.id):
            return (150.0, datetime.now(timezone.utc))
        elif current_cycle == 3 and str(zone_id) == str(zone_c.id):
            return (150.0, datetime.now(timezone.utc))
        return (50.0, datetime.now(timezone.utc))

    with patch("ml.alerts_evaluator.broadcast_sync"), \
         patch("ml.alerts_evaluator._recommend_action", return_value={"action": "test"}):
        
        # Cycle 1: Zone A fires
        zone_value_side_effect.cycle = 1
        with patch("ml.alerts_evaluator.get_current_zone_value", side_effect=zone_value_side_effect):
            evaluate_alerts(db_session, region_id)

        # Cycle 2: Zone B fires
        zone_value_side_effect.cycle = 2
        with patch("ml.alerts_evaluator.get_current_zone_value", side_effect=zone_value_side_effect):
            evaluate_alerts(db_session, region_id)

        # Cycle 3: Zone C fires
        zone_value_side_effect.cycle = 3
        with patch("ml.alerts_evaluator.get_current_zone_value", side_effect=zone_value_side_effect):
            evaluate_alerts(db_session, region_id)

    events = db_session.query(AlertEvent).filter(AlertEvent.rule_id == rule.id).all()
    assert len(events) == 3
    # None of the three events should escalate to "critical"
    for ev in events:
        assert ev.severity == "warning", f"Event {ev.id} incorrectly escalated to {ev.severity}"

    db_session.refresh(rule)
    fires_map = json.loads(rule.consecutive_fires_by_zone)
    assert fires_map.get(str(zone_a.id)) == 0
    assert fires_map.get(str(zone_b.id)) == 0
    assert fires_map.get(str(zone_c.id)) == 1


def test_zone_resets_after_non_firing_cycle(db_session):
    region_id = str(uuid.uuid4())
    zone_a = ZoneGeometry(id=uuid.uuid4(), region_id=region_id, name="Zone A")
    db_session.add(zone_a)

    rule = AlertRule(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        name="Reset Rule",
        layer_type="aq",
        operator="gt",
        threshold=100.0,
        severity="warning",
        is_active=True,
        consecutive_fires_by_zone="{}"
    )
    db_session.add(rule)
    db_session.commit()

    with patch("ml.alerts_evaluator.broadcast_sync"), \
         patch("ml.alerts_evaluator._recommend_action", return_value={"action": "test"}):
        
        # Cycle 1: Fire (count 1)
        with patch("ml.alerts_evaluator.get_current_zone_value", return_value=(150.0, datetime.now(timezone.utc))):
            evaluate_alerts(db_session, region_id)
        
        # Cycle 2: Fire (count 2)
        with patch("ml.alerts_evaluator.get_current_zone_value", return_value=(150.0, datetime.now(timezone.utc))):
            evaluate_alerts(db_session, region_id)
            
        db_session.refresh(rule)
        assert json.loads(rule.consecutive_fires_by_zone).get(str(zone_a.id)) == 2

        # Cycle 3: Normal / Non-firing (resets count to 0)
        with patch("ml.alerts_evaluator.get_current_zone_value", return_value=(50.0, datetime.now(timezone.utc))):
            evaluate_alerts(db_session, region_id)
            
        db_session.refresh(rule)
        assert json.loads(rule.consecutive_fires_by_zone).get(str(zone_a.id)) == 0

        # Cycle 4: Fire again (count 1, not 3)
        with patch("ml.alerts_evaluator.get_current_zone_value", return_value=(150.0, datetime.now(timezone.utc))):
            evaluate_alerts(db_session, region_id)
            
        events = db_session.query(AlertEvent).filter(AlertEvent.rule_id == rule.id).order_by(AlertEvent.triggered_at.asc()).all()
        assert len(events) == 3  # Cycles 1, 2, 4
        assert events[2].severity == "warning"  # Count is 1, so warning not critical


def test_one_zone_escalating_does_not_affect_other_zones(db_session):
    region_id = str(uuid.uuid4())
    zone_a = ZoneGeometry(id=uuid.uuid4(), region_id=region_id, name="Zone A")
    zone_b = ZoneGeometry(id=uuid.uuid4(), region_id=region_id, name="Zone B")
    db_session.add_all([zone_a, zone_b])

    rule = AlertRule(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        name="Independent Zones Rule",
        layer_type="aq",
        operator="gt",
        threshold=100.0,
        severity="warning",
        is_active=True,
        consecutive_fires_by_zone="{}"
    )
    db_session.add(rule)
    db_session.commit()

    with patch("ml.alerts_evaluator.broadcast_sync"), \
         patch("ml.alerts_evaluator._recommend_action", return_value={"action": "test"}):
        
        # Cycles 1 & 2: Only Zone A fires
        def val_side_effect_12(db, zone_id, layer_type):
            if str(zone_id) == str(zone_a.id):
                return (150.0, datetime.now(timezone.utc))
            return (50.0, datetime.now(timezone.utc))

        with patch("ml.alerts_evaluator.get_current_zone_value", side_effect=val_side_effect_12):
            evaluate_alerts(db_session, region_id)
            evaluate_alerts(db_session, region_id)

        # Cycle 3: Both Zone A and Zone B fire
        def val_side_effect_3(db, zone_id, layer_type):
            return (150.0, datetime.now(timezone.utc))

        with patch("ml.alerts_evaluator.get_current_zone_value", side_effect=val_side_effect_3):
            evaluate_alerts(db_session, region_id)

    db_session.refresh(rule)
    fires_map = json.loads(rule.consecutive_fires_by_zone)
    assert fires_map.get(str(zone_a.id)) == 3
    assert fires_map.get(str(zone_b.id)) == 1

    events_a = db_session.query(AlertEvent).filter(
        AlertEvent.rule_id == rule.id,
        AlertEvent.severity == "critical"
    ).all()
    assert len(events_a) == 1  # Zone A escalated

    events_b = db_session.query(AlertEvent).filter(
        AlertEvent.rule_id == rule.id,
        AlertEvent.severity == "warning"
    ).all()
    assert len(events_b) == 3  # Zone A (x2) + Zone B (x1)
