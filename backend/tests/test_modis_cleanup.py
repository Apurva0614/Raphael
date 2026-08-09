import os
import sys
import tempfile
import datetime
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest

# Ensure backend dir is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Define mock classes to prevent Prefect decorator from wrapping functions in MagicMocks
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

# Inject mocks into sys.modules
sys.modules['prefect'] = MockPrefect
sys.modules['tenacity'] = MockTenacity

# Create and inject mock earthaccess
mock_ea = MagicMock()
sys.modules['earthaccess'] = mock_ea

# Create and inject mock api.routes.ws to avoid broadcast issues
mock_ws = MagicMock()
async def dummy_broadcast(*args, **kwargs):
    pass
mock_ws.broadcast = dummy_broadcast
sys.modules['api.routes.ws'] = mock_ws

# Import the flows
from ingestion.flows.ndvi_modis import process_ndvi_granule
from ingestion.flows.lst_modis import process_lst_granule

@pytest.fixture
def mock_earthaccess():
    mock_ea.reset_mock()
    mock_ea.login.return_value = MagicMock()
    yield mock_ea

def test_ndvi_cleanup_on_success(mock_earthaccess):
    dummy_hdf = "dummy.hdf"
    
    created_dirs = []
    original_tempdir = tempfile.TemporaryDirectory
    
    def spy_tempdir(*args, **kwargs):
        td = original_tempdir(*args, **kwargs)
        created_dirs.append(td.name)
        return td

    def mock_download(granules, local_path):
        filepath = os.path.join(local_path, dummy_hdf)
        with open(filepath, "w") as f:
            f.write("mock content")
        return [filepath]
    
    mock_earthaccess.download.side_effect = mock_download

    with patch("tempfile.TemporaryDirectory", side_effect=spy_tempdir), \
         patch("processing.raster.HAS_HDF4", True), \
         patch("processing.raster.process_modis_ndvi") as mock_process:
        
        mock_process.return_value = ("tile_path.png", None, None, None)
        
        granule = {"dummy": "granule"}
        bbox = (73.7, 18.4, 74.0, 18.65)
        target_date = datetime.date(2026, 8, 9)
        
        tile_path, _, _, _ = process_ndvi_granule(granule, bbox, target_date)
        
        assert tile_path == "tile_path.png"
        assert len(created_dirs) == 1
        assert not os.path.exists(created_dirs[0])

def test_ndvi_cleanup_on_download_failure(mock_earthaccess):
    mock_earthaccess.download.return_value = []

    created_dirs = []
    original_tempdir = tempfile.TemporaryDirectory
    
    def spy_tempdir(*args, **kwargs):
        td = original_tempdir(*args, **kwargs)
        created_dirs.append(td.name)
        return td

    with patch("tempfile.TemporaryDirectory", side_effect=spy_tempdir), \
         patch("processing.raster.HAS_HDF4", True), \
         patch("processing.raster.generate_mock_ndvi_tile") as mock_mock_tile:
        
        mock_mock_tile.return_value = "mock_tile_path.png"
        
        granule = {"dummy": "granule"}
        bbox = (73.7, 18.4, 74.0, 18.65)
        target_date = datetime.date(2026, 8, 9)
        
        tile_path, _, _, _ = process_ndvi_granule(granule, bbox, target_date)
        
        assert tile_path == "mock_tile_path.png"
        assert len(created_dirs) == 1
        assert not os.path.exists(created_dirs[0])

def test_ndvi_cleanup_on_exception(mock_earthaccess):
    created_dirs = []
    original_tempdir = tempfile.TemporaryDirectory
    
    def spy_tempdir(*args, **kwargs):
        td = original_tempdir(*args, **kwargs)
        created_dirs.append(td.name)
        return td

    def mock_download(granules, local_path):
        filepath = os.path.join(local_path, "dummy.hdf")
        with open(filepath, "w") as f:
            f.write("mock content")
        return [filepath]
    
    mock_earthaccess.download.side_effect = mock_download

    with patch("tempfile.TemporaryDirectory", side_effect=spy_tempdir), \
         patch("processing.raster.HAS_HDF4", True), \
         patch("processing.raster.process_modis_ndvi", side_effect=ValueError("Process failed")), \
         patch("processing.raster.generate_mock_ndvi_tile") as mock_mock_tile:
        
        mock_mock_tile.return_value = "mock_tile_path.png"
        
        granule = {"dummy": "granule"}
        bbox = (73.7, 18.4, 74.0, 18.65)
        target_date = datetime.date(2026, 8, 9)
        
        tile_path, _, _, _ = process_ndvi_granule(granule, bbox, target_date)
        
        assert tile_path == "mock_tile_path.png"
        assert len(created_dirs) == 1
        assert not os.path.exists(created_dirs[0])

def test_lst_cleanup_on_success(mock_earthaccess):
    dummy_hdf = "dummy.hdf"
    
    created_dirs = []
    original_tempdir = tempfile.TemporaryDirectory
    
    def spy_tempdir(*args, **kwargs):
        td = original_tempdir(*args, **kwargs)
        created_dirs.append(td.name)
        return td

    def mock_download(granules, local_path):
        filepath = os.path.join(local_path, dummy_hdf)
        with open(filepath, "w") as f:
            f.write("mock content")
        return [filepath]
    
    mock_earthaccess.download.side_effect = mock_download

    with patch("tempfile.TemporaryDirectory", side_effect=spy_tempdir), \
         patch("processing.raster.HAS_HDF4", True), \
         patch("processing.raster.process_modis_lst") as mock_process:
        
        mock_process.return_value = ("tile_path.png", None, None, None)
        
        granule = {"dummy": "granule"}
        bbox = (73.7, 18.4, 74.0, 18.65)
        target_date = datetime.date(2026, 8, 9)
        
        tile_path, _, _, _ = process_lst_granule(granule, bbox, target_date)
        
        assert tile_path == "tile_path.png"
        assert len(created_dirs) == 1
        assert not os.path.exists(created_dirs[0])

def test_lst_cleanup_on_download_failure(mock_earthaccess):
    mock_earthaccess.download.return_value = []

    created_dirs = []
    original_tempdir = tempfile.TemporaryDirectory
    
    def spy_tempdir(*args, **kwargs):
        td = original_tempdir(*args, **kwargs)
        created_dirs.append(td.name)
        return td

    with patch("tempfile.TemporaryDirectory", side_effect=spy_tempdir), \
         patch("processing.raster.HAS_HDF4", True), \
         patch("processing.raster.generate_mock_lst_tile") as mock_mock_tile:
        
        mock_mock_tile.return_value = "mock_tile_path.png"
        
        granule = {"dummy": "granule"}
        bbox = (73.7, 18.4, 74.0, 18.65)
        target_date = datetime.date(2026, 8, 9)
        
        tile_path, _, _, _ = process_lst_granule(granule, bbox, target_date)
        
        assert tile_path == "mock_tile_path.png"
        assert len(created_dirs) == 1
        assert not os.path.exists(created_dirs[0])

def test_lst_cleanup_on_exception(mock_earthaccess):
    created_dirs = []
    original_tempdir = tempfile.TemporaryDirectory
    
    def spy_tempdir(*args, **kwargs):
        td = original_tempdir(*args, **kwargs)
        created_dirs.append(td.name)
        return td

    def mock_download(granules, local_path):
        filepath = os.path.join(local_path, "dummy.hdf")
        with open(filepath, "w") as f:
            f.write("mock content")
        return [filepath]
    
    mock_earthaccess.download.side_effect = mock_download

    with patch("tempfile.TemporaryDirectory", side_effect=spy_tempdir), \
         patch("processing.raster.HAS_HDF4", True), \
         patch("processing.raster.process_modis_lst", side_effect=ValueError("Process failed")), \
         patch("processing.raster.generate_mock_lst_tile") as mock_mock_tile:
        
        mock_mock_tile.return_value = "mock_tile_path.png"
        
        granule = {"dummy": "granule"}
        bbox = (73.7, 18.4, 74.0, 18.65)
        target_date = datetime.date(2026, 8, 9)
        
        tile_path, _, _, _ = process_lst_granule(granule, bbox, target_date)
        
        assert tile_path == "mock_tile_path.png"
        assert len(created_dirs) == 1
        assert not os.path.exists(created_dirs[0])
