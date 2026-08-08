import sys
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

# Now import the modules under test
from ingestion.flows.aq_openaq import fetch_locations, write_to_db, OpenAQFlow

def test_fetch_locations_parameters():
    """Verify that fetch_locations requests the correct parameter IDs."""
    bbox = (73.7, 18.4, 74.0, 18.65)
    
    with patch.object(OpenAQFlow, 'is_online', return_value=True), \
         patch.object(OpenAQFlow, 'fetch') as mock_fetch, \
         patch.object(OpenAQFlow, '__init__', return_value=None):
        
        mock_fetch.return_value = {"results": [{"id": 1, "name": "Test Location"}]}
        
        results = fetch_locations(bbox)
        
        # Verify result is returned
        assert len(results) == 1
        assert results[0]["id"] == 1
        
        # Verify the fetch parameters
        mock_fetch.assert_called_once()
        args, kwargs = mock_fetch.call_args
        
        assert "locations" in args[0]
        params = kwargs.get("params", {})
        assert params.get("parameters_id") == "1,2,7,8,10"
        assert params.get("bbox") == "73.7,18.4,74.0,18.65"


def test_write_to_db_preserves_coordinates():
    """Verify that write_to_db copies lat/lon from location coordinates to raw_payload."""
    mock_location = {
        "id": 101,
        "name": "Pune Station",
        "coordinates": {
            "latitude": 18.5204,
            "longitude": 73.8567
        },
        "sensors": [
            {
                "latest": {
                    "value": 42.5,
                    "datetime": "2026-08-08T12:00:00Z"
                }
            }
        ]
    }
    
    flow_mock = MagicMock()
    flow_mock.source.id = "mock-source-id"
    flow_mock.region.id = "mock-region-id"
    flow_mock.normalize_point = lambda lat, lon: f"POINT({lon} {lat})"
    
    # Run the database write operation
    count = write_to_db([mock_location], flow_mock)
    
    assert count == 1
    
    # Verify bulk_write was called with correct data structure
    flow_mock.bulk_write.assert_called_once()
    observations = flow_mock.bulk_write.call_args[0][0]
    assert len(observations) == 1
    
    obs = observations[0]
    assert obs["value"] == 42.5
    assert obs["station_name"] == "Pune Station"
    assert obs["station_id"] == "101"
    
    # Verify coordinates are preserved inside raw_payload
    payload = obs["raw_payload"]
    assert payload.get("lat") == 18.5204
    assert payload.get("lon") == 73.8567
    assert payload.get("value") == 42.5
