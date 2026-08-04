from fastapi.testclient import TestClient
from unittest.mock import MagicMock
from api.main import app
from api.auth import get_current_user
from db.connection import get_db

client = TestClient(app)

# Override auth dependency for routes that require authentication
class MockUser:
    id = "test-user-id"
    role = "admin"

app.dependency_overrides[get_current_user] = lambda: MockUser()
app.dependency_overrides[get_db] = lambda: MagicMock()

# Valid mock UUID for testing
VALID_UUID = "12345678123456781234567812345678"

def test_forecast_hours_validation():
    # Valid request
    res = client.get(f"/api/v1/layers/aq/forecast?zone_id={VALID_UUID}&hours=24")
    assert res.status_code == 200
    
    # Invalid request: hours below minimum (ge=1)
    res = client.get(f"/api/v1/layers/aq/forecast?zone_id={VALID_UUID}&hours=0")
    assert res.status_code == 422
    
    # Invalid request: hours above maximum (le=168)
    res = client.get(f"/api/v1/layers/aq/forecast?zone_id={VALID_UUID}&hours=169")
    assert res.status_code == 422

def test_anomalies_days_validation():
    # Valid request
    res = client.get("/api/v1/anomalies?days=14")
    assert res.status_code == 200
    
    # Invalid request: days below minimum (ge=1)
    res = client.get("/api/v1/anomalies?days=0")
    assert res.status_code == 422
    
    # Invalid request: days above maximum (le=365)
    res = client.get("/api/v1/anomalies?days=366")
    assert res.status_code == 422

def test_history_dates_validation():
    # Valid request
    res = client.get(f"/api/v1/layers/aq/history?region_id={VALID_UUID}&location=18.5,73.8&from_date=2025-05-01&to_date=2025-05-10")
    assert res.status_code == 200

    # Invalid request: malformed dates
    res = client.get(f"/api/v1/layers/aq/history?region_id={VALID_UUID}&location=18.5,73.8&from_date=2025-05-xx&to_date=2025-05-10")
    assert res.status_code == 400

    # Invalid request: from_date after to_date
    res = client.get(f"/api/v1/layers/aq/history?region_id={VALID_UUID}&location=18.5,73.8&from_date=2025-05-10&to_date=2025-05-01")
    assert res.status_code == 400

    # Invalid request: range exceeds 365 days
    res = client.get(f"/api/v1/layers/aq/history?region_id={VALID_UUID}&location=18.5,73.8&from_date=2025-01-01&to_date=2026-05-01")
    assert res.status_code == 400

def test_layers_validation():
    # Invalid region_id (too short / wrong pattern)
    res = client.get(f"/api/v1/layers/aq/current?region_id=invalid&bbox=73.7,18.4,74.0,18.6")
    assert res.status_code == 422

    # Invalid bbox (wrong structure)
    res = client.get(f"/api/v1/layers/aq/current?region_id={VALID_UUID}&bbox=73.7,18.4")
    assert res.status_code == 422

    # Invalid location (wrong structure)
    res = client.get(f"/api/v1/layers/aq/history?region_id={VALID_UUID}&location=18.5&from_date=2025-05-01&to_date=2025-05-10")
    assert res.status_code == 422

    # Invalid zone_id (wrong pattern)
    res = client.get(f"/api/v1/layers/aq/forecast?zone_id=invalid&hours=24")
    assert res.status_code == 422

def test_zones_validation():
    # Valid request
    res = client.get(f"/api/v1/zones/?region_id={VALID_UUID}")
    assert res.status_code == 200

    # Invalid region_id (too short)
    res = client.get(f"/api/v1/zones/?region_id=short")
    assert res.status_code == 422

    # Invalid format (not geojson)
    res = client.get(f"/api/v1/zones/?region_id={VALID_UUID}&format=invalid")
    assert res.status_code == 422

def test_system_validation():
    # Invalid region_id in /insights
    res = client.get(f"/api/v1/system/insights?region_id=invalid")
    assert res.status_code == 422

    # Invalid region_id in /intelligence-cycle
    res = client.post(f"/api/v1/system/intelligence-cycle?region_id=invalid")
    assert res.status_code == 422

    # Invalid q (too short/empty) in /regions/search
    res = client.get(f"/api/v1/system/regions/search?q=")
    assert res.status_code == 422

    # Invalid q (too long) in /regions/search
    res = client.get(f"/api/v1/system/regions/search?q=" + ("a" * 101))
    assert res.status_code == 422

def test_geocode_validation():
    # Valid request (needs query matching Nominatim mock logic or handled gracefully)
    # Just asserting it returns 200 for empty query bypass or validation rules
    res = client.get(f"/api/v1/geocode?q=Pune")
    assert res.status_code == 200

    # Invalid q (too short/empty)
    res = client.get(f"/api/v1/geocode?q=")
    assert res.status_code == 422

    # Invalid q (length 1)
    res = client.get(f"/api/v1/geocode?q=a")
    assert res.status_code == 422

    # Invalid limit (less than 1)
    res = client.get(f"/api/v1/geocode?q=Pune&limit=0")
    assert res.status_code == 422

    # Invalid limit (greater than 50)
    res = client.get(f"/api/v1/geocode?q=Pune&limit=51")
    assert res.status_code == 422
