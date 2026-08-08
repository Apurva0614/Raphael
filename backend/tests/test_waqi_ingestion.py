import sys
import os
import types
from unittest.mock import MagicMock, patch

# Define mock classes to prevent import-time crashes on missing third-party modules
class MockPrefect:
    @staticmethod
    def task(*args, **kwargs):
        def decorator(f):
            return f
        return decorator

    @staticmethod
    def flow(*args, **kwargs):
        def decorator(f):
            return f
        return decorator

class MockTenacity:
    @staticmethod
    def retry(*args, **kwargs):
        def decorator(f):
            return f
        return decorator

    @staticmethod
    def stop_after_attempt(*args, **kwargs):
        return None

    @staticmethod
    def wait_exponential(*args, **kwargs):
        return None

# Inject mocks into sys.modules before importing ingestion base or flow modules
sys.modules['prefect'] = MockPrefect
sys.modules['prefect-sqlalchemy'] = MagicMock()
sys.modules['tenacity'] = MockTenacity
sys.modules['structlog'] = MagicMock()
sys.modules['sqlalchemy'] = MagicMock()
sys.modules['sqlalchemy.orm'] = MagicMock()
sys.modules['geoalchemy2'] = MagicMock()
sys.modules['geoalchemy2.shape'] = MagicMock()
sys.modules['db'] = MagicMock()
sys.modules['db.connection'] = MagicMock()
sys.modules['db.models'] = MagicMock()

# Mock the ws broadcast function as a proper async coroutine
async def mock_broadcast(*args, **kwargs):
    pass

ws_mock = types.ModuleType("ws")
ws_mock.broadcast = mock_broadcast
sys.modules['api.routes.ws'] = ws_mock

from ingestion.flows.aq_waqi import fetch_waqi_stations, write_waqi_to_db, WAQIFlow

def test_fetch_waqi_missing_key_uses_fallback_offline():
    """Verify that a missing or placeholder key uses mock fallback even when offline."""
    bbox = (73.7, 18.4, 74.0, 18.65)
    
    with patch("ingestion.flows.aq_waqi.API_KEY", ""), \
         patch.object(WAQIFlow, 'is_online') as mock_online, \
         patch.object(WAQIFlow, '__init__', lambda self: setattr(self, 'region', MagicMock(name="Pune"))):
        
        # We explicitly mock region to verify name construction
        flow_mock = WAQIFlow()
        flow_mock.region.name = "Pune"
        
        with patch("ingestion.flows.aq_waqi.WAQIFlow", return_value=flow_mock):
            stations = fetch_waqi_stations(bbox)
            
            # Verify mock fallback was returned
            assert len(stations) == 5
            assert stations[0]["uid"] == 2001
            assert "Station Alpha" in stations[0]["station"]["name"]
            assert "Pune" in stations[0]["station"]["name"]
            
            # Verify is_online was NEVER called
            mock_online.assert_not_called()


def test_fetch_waqi_bbox_conversion():
    """Verify correct bounding-box translation format and coordinate ordering."""
    bbox = (73.7, 18.4, 74.0, 18.65)  # (west, south, east, north)
    
    with patch("ingestion.flows.aq_waqi.API_KEY", "valid_key_123"), \
         patch.object(WAQIFlow, 'is_online', return_value=True), \
         patch.object(WAQIFlow, 'fetch') as mock_fetch, \
         patch.object(WAQIFlow, '__init__', lambda self: setattr(self, 'region', MagicMock(name="Pune"))):
        
        # Explicit mock region name
        flow_mock = WAQIFlow()
        flow_mock.region.name = "Pune"
        
        with patch("ingestion.flows.aq_waqi.WAQIFlow", return_value=flow_mock):
            mock_fetch.return_value = {"status": "ok", "data": [{"uid": 99, "aqi": 80, "lat": 18.5, "lon": 73.8, "station": {"name": "Test"}}]}
            
            stations = fetch_waqi_stations(bbox)
            
            assert len(stations) == 1
            mock_fetch.assert_called_once()
            args, kwargs = mock_fetch.call_args
            
            # Coordinate order must be: south,west,north,east
            params = kwargs.get("params", {})
            assert params.get("latlng") == "18.4,73.7,18.65,74.0"
            assert params.get("token") == "valid_key_123"


def test_fetch_waqi_api_failure_fallback():
    """Verify that an API error or invalid response status triggers mock fallback."""
    bbox = (73.7, 18.4, 74.0, 18.65)
    
    with patch("ingestion.flows.aq_waqi.API_KEY", "valid_key_123"), \
         patch.object(WAQIFlow, 'is_online', return_value=True), \
         patch.object(WAQIFlow, 'fetch') as mock_fetch, \
         patch.object(WAQIFlow, '__init__', lambda self: setattr(self, 'region', MagicMock(name="Pune"))):
        
        # API returns status error
        mock_fetch.return_value = {"status": "error", "data": "Rate limit exceeded"}
        
        flow_mock = WAQIFlow()
        flow_mock.region.name = "Pune"
        
        with patch("ingestion.flows.aq_waqi.WAQIFlow", return_value=flow_mock):
            stations = fetch_waqi_stations(bbox)
            
            # Should fallback to mock stations
            assert len(stations) == 5
            assert stations[0]["uid"] == 2001


def test_write_waqi_to_db_preserves_coordinates():
    """Verify that mock fallback stations preserve valid lat/lon in raw_payload."""
    lat_c, lon_c = 18.5, 73.8
    mock_stations = [
        {
            "uid": 2001,
            "aqi": "152",
            "lat": lat_c + 0.0337,
            "lon": lon_c + 0.1068,
            "station": {"name": "Station Alpha, Pune - Station"}
        }
    ]
    
    flow_mock = MagicMock()
    flow_mock.source.id = "waqi-source"
    flow_mock.region.id = "pune-region"
    flow_mock.normalize_point = lambda lat, lon: f"POINT({lon} {lat})"
    
    count = write_waqi_to_db(mock_stations, flow_mock)
    
    assert count == 1
    flow_mock.bulk_write.assert_called_once()
    
    observations = flow_mock.bulk_write.call_args[0][0]
    assert len(observations) == 1
    
    obs = observations[0]
    assert obs["value"] == 152.0
    assert obs["station_name"] == "Station Alpha, Pune - Station"
    
    # Verify lat and lon are present in raw_payload
    payload = obs["raw_payload"]
    assert payload.get("lat") == lat_c + 0.0337
    assert payload.get("lon") == lon_c + 0.1068
