"""
Raphael — Raster Processing Module

Provides satellite imagery processing (LST heat maps, NDVI vegetation maps)
with fail-safe mock fallbacks for environments where GDAL/Rasterio/HDF4
drivers are not available (common on Windows).

Design:
  - Every processing function has a matching `generate_mock_*` fallback
    that produces a synthetic but visually correct PNG tile using only
    numpy + matplotlib (no GDAL/Rasterio required).
  - Module-level capability flags (HAS_GDAL, HAS_RASTERIO, HAS_HDF4)
    are checked once at import time.
  - All paths use pathlib.Path; all tile outputs go to TILES_DIR.
  - Rasterio datasets are opened inside context managers to prevent
    Windows file locking.
"""

import os
os.environ.pop("PROJ_LIB", None)
import uuid
import numpy as np
from pathlib import Path
from datetime import date, datetime, timezone
from typing import Optional, Tuple

import matplotlib
matplotlib.use("Agg")  # Non-interactive backend for server-side rendering
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors

# ── Capability Flags ─────────────────────────────────────────────────────────

HAS_RASTERIO = False
HAS_GDAL = False
HAS_HDF4 = False

try:
    import rasterio
    from rasterio.mask import mask as rio_mask
    from rasterio.warp import calculate_default_transform, reproject, Resampling
    from rasterio.crs import CRS
    from rasterio.transform import from_bounds
    HAS_RASTERIO = True
except ImportError:
    rasterio = None

try:
    from osgeo import gdal
    HAS_GDAL = True
    if gdal.GetDriverByName("HDF4") is not None:
        HAS_HDF4 = True
except ImportError:
    gdal = None

try:
    from shapely.geometry import box, mapping
except ImportError:
    # shapely is required by geoalchemy2 so this should always be available
    box = None
    mapping = None

# ── Tile Directory ───────────────────────────────────────────────────────────

# Resolve TILES_DIR relative to project root, not cwd
_project_root = Path(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
TILES_DIR = Path(os.getenv("RAPHAEL_DATA_DIR", str(_project_root / "data"))) / "tiles"
TILES_DIR.mkdir(parents=True, exist_ok=True)

TARGET_CRS = None
if HAS_RASTERIO:
    TARGET_CRS = CRS.from_epsg(4326)

print(f"[raster] Capabilities: GDAL={HAS_GDAL}, Rasterio={HAS_RASTERIO}, HDF4={HAS_HDF4}")
print(f"[raster] Tiles directory: {TILES_DIR}")


# ══════════════════════════════════════════════════════════════════════════════
# MOCK TILE GENERATORS (numpy + matplotlib only — always available)
# ══════════════════════════════════════════════════════════════════════════════

def _perlin_like_noise(width: int, height: int, scale: float = 5.0, seed: int = None) -> np.ndarray:
    """
    Generate smooth noise resembling spatial data using multiple octaves
    of interpolated random grids. Pure numpy, no external deps.
    """
    if seed is not None:
        rng = np.random.RandomState(seed)
    else:
        rng = np.random.RandomState()

    result = np.zeros((height, width), dtype=float)
    amplitude = 1.0
    frequency = 1.0

    for octave in range(4):
        # Create a small random grid and interpolate to full size
        grid_h = max(2, int(scale * frequency))
        grid_w = max(2, int(scale * frequency))
        small = rng.rand(grid_h, grid_w)

        # Bilinear interpolation to full size
        from scipy.ndimage import zoom
        factor_h = height / grid_h
        factor_w = width / grid_w
        upscaled = zoom(small, (factor_h, factor_w), order=1)

        # Ensure exact dimensions
        upscaled = upscaled[:height, :width]
        result += amplitude * upscaled

        amplitude *= 0.5
        frequency *= 2.0

    # Normalize to [0, 1]
    result = (result - result.min()) / (result.max() - result.min() + 1e-8)
    return result


def generate_mock_lst_tile(
    bounds: Tuple[float, float, float, float],
    output_path: Optional[Path] = None,
    width: int = 512,
    height: int = 512,
    target_date: Optional[date] = None
) -> Path:
    """
    Generate a synthetic Land Surface Temperature tile.
    Produces a visually correct heat map (plasma colormap) with Perlin-like noise
    centered on Delhi's typical LST range (25°C - 50°C).

    Args:
        bounds: (west, south, east, north) in WGS84
        output_path: Where to save the PNG. Auto-generated if None.
        width: Tile width in pixels
        height: Tile height in pixels
        target_date: Date for filename. Defaults to today.

    Returns:
        Path to the generated PNG tile.
    """
    if target_date is None:
        target_date = date.today()

    if output_path is None:
        lst_dir = TILES_DIR / "lst"
        lst_dir.mkdir(parents=True, exist_ok=True)
        output_path = lst_dir / f"lst_mock_{target_date}.png"

    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Generate spatially-coherent noise
    seed = int(target_date.toordinal()) % (2**31)
    noise = _perlin_like_noise(width, height, scale=6.0, seed=seed)

    # Map to realistic LST range for Delhi (25°C center to 50°C edges)
    # Urban heat island: hotter in center, cooler at edges with some variation
    y_grid, x_grid = np.mgrid[0:height, 0:width]
    cx, cy = width / 2, height / 2
    dist = np.sqrt((x_grid - cx)**2 + (y_grid - cy)**2) / max(width, height)

    # Urban heat island pattern: hotter in center
    uhi = 1.0 - dist * 0.6
    combined = 0.6 * uhi + 0.4 * noise

    # Map to temperature range 25-50°C
    lst_celsius = 25.0 + combined * 25.0

    # Custom LST colormap matching the Raphael dashboard mockup
    lst_colors = [
        (0.0,  "#0000ff"),   # 25°C — blue  (cool)
        (0.25, "#00ffff"),   # 31°C — cyan
        (0.45, "#ffff00"),   # 36°C — yellow
        (0.65, "#ff8800"),   # 41°C — orange
        (0.85, "#ff0000"),   # 46°C — red   (hot)
        (1.0,  "#880000"),   # 50°C — dark red (extreme)
    ]
    cmap = mcolors.LinearSegmentedColormap.from_list("lst_raphael", lst_colors)

    # Normalize to 0-1 for colormap
    normed = (lst_celsius - 20.0) / (55.0 - 20.0)
    normed = np.clip(normed, 0.0, 1.0)

    # Render
    fig, ax = plt.subplots(1, 1, figsize=(width/100, height/100), dpi=100)
    ax.imshow(normed, cmap=cmap, vmin=0, vmax=1, aspect='auto',
              extent=[bounds[0], bounds[2], bounds[1], bounds[3]])
    ax.axis('off')
    fig.savefig(str(output_path), bbox_inches='tight', pad_inches=0,
                transparent=True, dpi=100)
    plt.close(fig)

    print(f"[raster] Mock LST tile generated: {output_path} ({output_path.stat().st_size} bytes)")
    return output_path


def generate_mock_ndvi_tile(
    bounds: Tuple[float, float, float, float],
    output_path: Optional[Path] = None,
    width: int = 512,
    height: int = 512,
    target_date: Optional[date] = None
) -> Path:
    """
    Generate a synthetic NDVI (vegetation) tile.
    Produces a visually correct vegetation map (RdYlGn colormap) with realistic
    NDVI patterns (0.0-0.8) — urban areas low, parks/green belts high.

    Args:
        bounds: (west, south, east, north) in WGS84
        output_path: Where to save the PNG. Auto-generated if None.
        width: Tile width in pixels
        height: Tile height in pixels
        target_date: Date for filename. Defaults to today.

    Returns:
        Path to the generated PNG tile.
    """
    if target_date is None:
        target_date = date.today()

    if output_path is None:
        ndvi_dir = TILES_DIR / "ndvi"
        ndvi_dir.mkdir(parents=True, exist_ok=True)
        output_path = ndvi_dir / f"ndvi_mock_{target_date}.png"

    output_path.parent.mkdir(parents=True, exist_ok=True)

    seed = int(target_date.toordinal()) % (2**31) + 42
    noise = _perlin_like_noise(width, height, scale=8.0, seed=seed)

    # Create urban vs green pattern
    y_grid, x_grid = np.mgrid[0:height, 0:width]
    cx, cy = width / 2, height / 2
    dist = np.sqrt((x_grid - cx)**2 + (y_grid - cy)**2) / max(width, height)

    # Urban center has low NDVI, periphery has higher (parks, farmland)
    urban_mask = np.exp(-dist * 3.0)  # high in center
    green_pattern = 0.4 * (1.0 - urban_mask) + 0.6 * noise

    # Add some "parks" (high NDVI patches)
    park_noise = _perlin_like_noise(width, height, scale=12.0, seed=seed + 100)
    parks = (park_noise > 0.7).astype(float) * 0.3
    green_pattern += parks

    # Map to NDVI range [0.0, 0.8]
    ndvi = np.clip(green_pattern, 0.0, 0.8)

    # NDVI colormap matching the Raphael dashboard mockup
    ndvi_colors = [
        (0.0,  "#3d1a00"),  # bare soil / water — brown
        (0.15, "#8b6914"),  # sparse — tan
        (0.30, "#ffffcc"),  # bare soil — pale yellow
        (0.45, "#c2e699"),  # sparse vegetation — light green
        (0.60, "#78c679"),  # moderate vegetation
        (0.75, "#31a354"),  # dense vegetation — green
        (0.90, "#006837"),  # very dense — dark green
        (1.0,  "#00ff88"),  # ultra-dense — neon green (mockup glow)
    ]
    cmap = mcolors.LinearSegmentedColormap.from_list("ndvi_raphael", ndvi_colors)

    # Normalize for colormap
    normed = ndvi / 0.8  # already clipped to [0, 0.8]
    normed = np.clip(normed, 0.0, 1.0)

    fig, ax = plt.subplots(1, 1, figsize=(width/100, height/100), dpi=100)
    ax.imshow(normed, cmap=cmap, vmin=0, vmax=1, aspect='auto',
              extent=[bounds[0], bounds[2], bounds[1], bounds[3]])
    ax.axis('off')
    fig.savefig(str(output_path), bbox_inches='tight', pad_inches=0,
                transparent=True, dpi=100)
    plt.close(fig)

    print(f"[raster] Mock NDVI tile generated: {output_path} ({output_path.stat().st_size} bytes)")
    return output_path


def generate_thumbnail(
    tile_path: Path,
    thumb_path: Optional[Path] = None,
    size: Tuple[int, int] = (380, 160)
) -> Path:
    """
    Generate a small thumbnail preview of any tile PNG.
    Used for the bottom panel LST and NDVI preview cards in the dashboard.

    Works with both rasterio-generated and matplotlib-generated tiles.

    Args:
        tile_path: Path to the source tile PNG
        thumb_path: Output path. Auto-generated if None.
        size: (width, height) of the thumbnail

    Returns:
        Path to the generated thumbnail PNG
    """
    tile_path = Path(tile_path)

    if thumb_path is None:
        thumb_path = tile_path.parent / f"{tile_path.stem}_thumb.png"

    # Use PIL/matplotlib to read and resize — works for any PNG
    try:
        from PIL import Image
        img = Image.open(str(tile_path))
        img = img.resize(size, Image.LANCZOS)
        img.save(str(thumb_path), "PNG")
    except ImportError:
        # Fallback: use matplotlib
        img_data = plt.imread(str(tile_path))
        fig, ax = plt.subplots(1, 1, figsize=(size[0]/100, size[1]/100), dpi=100)
        ax.imshow(img_data, aspect='auto')
        ax.axis('off')
        fig.savefig(str(thumb_path), bbox_inches='tight', pad_inches=0, dpi=100)
        plt.close(fig)

    print(f"[raster] Thumbnail generated: {thumb_path}")
    return thumb_path


# ══════════════════════════════════════════════════════════════════════════════
# REAL GDAL/RASTERIO PROCESSING (used when drivers are available)
# ══════════════════════════════════════════════════════════════════════════════

def reproject_to_wgs84(src_path: Path, dst_path: Path) -> Path:
    """Reproject a raster file to WGS84 (EPSG:4326). Requires rasterio."""
    if not HAS_RASTERIO:
        raise RuntimeError("rasterio not available — use mock generators instead")

    with rasterio.open(src_path) as src:
        if src.crs == TARGET_CRS:
            return src_path

        transform, width, height = calculate_default_transform(
            src.crs, TARGET_CRS, src.width, src.height, *src.bounds
        )
        kwargs = src.meta.copy()
        kwargs.update({
            "crs":       TARGET_CRS,
            "transform": transform,
            "width":     width,
            "height":    height
        })
        with rasterio.open(dst_path, "w", **kwargs) as dst:
            for i in range(1, src.count + 1):
                reproject(
                    source=rasterio.band(src, i),
                    destination=rasterio.band(dst, i),
                    src_transform=src.transform,
                    src_crs=src.crs,
                    dst_transform=transform,
                    dst_crs=TARGET_CRS,
                    resampling=Resampling.bilinear
                )
    return dst_path


def clip_to_bbox(src_path: Path, bbox: Tuple[float,float,float,float], dst_path: Path) -> Path:
    """Clip a raster file to a bounding box. Requires rasterio + shapely."""
    if not HAS_RASTERIO:
        raise RuntimeError("rasterio not available")

    west, south, east, north = bbox
    geom = [mapping(box(west, south, east, north))]

    with rasterio.open(src_path) as src:
        out_image, out_transform = rio_mask(src, geom, crop=True)
        out_meta = src.meta.copy()
        out_meta.update({
            "height":    out_image.shape[1],
            "width":     out_image.shape[2],
            "transform": out_transform
        })
        with rasterio.open(dst_path, "w", **out_meta) as dst:
            dst.write(out_image)

    return dst_path

def process_modis_lst(hdf_path: Path, bbox: Tuple, target_date: date) -> Tuple:
    """
    Process a MODIS MOD11A1 HDF4 file into a colored PNG tile for the LST layer.
    Falls back to mock generation if HDF4 driver and pyhdf are unavailable.
    """
    try:
        from pyhdf.SD import SD
        has_pyhdf = True
    except ImportError:
        has_pyhdf = False

    if not HAS_RASTERIO:
        print("[raster] Rasterio not available")
        return generate_mock_lst_tile(bbox, target_date=target_date), None, None, None

    if not HAS_HDF4 and not has_pyhdf:
        print(f"[raster] Neither HDF4 driver nor pyhdf available.")
        return generate_mock_lst_tile(bbox, target_date=target_date), None, None, None

    raw_tif = None
    wgs_tif = None
    clipped_tif = None
    try:
        if HAS_HDF4:
            import subprocess
            subdataset = f'HDF4_EOS:EOS_GRID:"{hdf_path}":MODIS_Grid_Daily_1km_LST:LST_Day_1km'
            raw_tif    = hdf_path.parent / f"lst_raw_{target_date}.tif"
            subprocess.run([
                "gdal_translate", "-of", "GTiff", subdataset, str(raw_tif)
            ], check=True, capture_output=True)
            
            wgs_tif = hdf_path.parent / f"lst_wgs84_{target_date}.tif"
            reproject_to_wgs84(raw_tif, wgs_tif)
            
            clipped_tif = hdf_path.parent / f"lst_clipped_{target_date}.tif"
            clip_to_bbox(wgs_tif, bbox, clipped_tif)
            
            with rasterio.open(clipped_tif) as src:
                data      = src.read(1).astype(float)
                transform = src.transform
                crs_val   = src.crs
        else:
            # Parse H and V from filename to calculate sinusoidal extent
            import re
            match = re.search(r"h(\d{2})v(\d{2})", hdf_path.name)
            if not match:
                raise ValueError("Could not parse MODIS tile h/v from filename")
            h = int(match.group(1))
            v = int(match.group(2))
            
            x_size = 20015109.354 * 2 / 36
            y_size = 10007554.677 * 2 / 18
            xmin = -20015109.354 + h * x_size
            xmax = xmin + x_size
            ymax = 10007554.677 - v * y_size
            ymin = ymax - y_size
            
            # Read using pyhdf
            from pyhdf.SD import SD
            hdf = SD(str(hdf_path))
            sds = hdf.select("LST_Day_1km")
            sds_data = sds.get()
            
            raw_tif = hdf_path.parent / f"lst_raw_{target_date}.tif"
            sinu_crs = "+proj=sinu +lon_0=0 +x_0=0 +y_0=0 +R=6371007.181 +units=m +no_defs"
            transform_sinu = rasterio.transform.from_bounds(xmin, ymin, xmax, ymax, sds_data.shape[1], sds_data.shape[0])
            
            with rasterio.open(
                raw_tif, "w", driver="GTiff",
                height=sds_data.shape[0], width=sds_data.shape[1],
                count=1, dtype=sds_data.dtype, crs=sinu_crs, transform=transform_sinu
            ) as dst:
                dst.write(sds_data, 1)
                
            wgs_tif = hdf_path.parent / f"lst_wgs84_{target_date}.tif"
            reproject_to_wgs84(raw_tif, wgs_tif)
            
            clipped_tif = hdf_path.parent / f"lst_clipped_{target_date}.tif"
            clip_to_bbox(wgs_tif, bbox, clipped_tif)
            
            with rasterio.open(clipped_tif) as src:
                data      = src.read(1).astype(float)
                transform = src.transform
                crs_val   = src.crs

        # MODIS LST scale factor: multiply by 0.02, subtract 273.15 for Celsius
        data[data == 0] = np.nan
        lst_celsius = (data * 0.02) - 273.15
        lst_celsius[lst_celsius < -100] = np.nan

        lst_colors = [
            (0.0,  "#0000ff"),
            (0.33, "#00ffff"),
            (0.5,  "#ffff00"),
            (0.75, "#ff8800"),
            (1.0,  "#ff0000"),
        ]
        cmap = mcolors.LinearSegmentedColormap.from_list("lst_raphael", lst_colors)

        array_clipped = np.clip(lst_celsius, 20, 55)
        normed = (array_clipped - 20) / (55 - 20)
        normed = np.nan_to_num(normed, nan=0.0)
        rgba = cmap(normed)
        rgba[np.isnan(lst_celsius), 3] = 0.0
        rgba_u8 = (rgba * 255).astype(np.uint8)

        lst_dir = TILES_DIR / "lst"
        lst_dir.mkdir(parents=True, exist_ok=True)
        out_path = lst_dir / f"lst_{target_date}.png"

        with rasterio.open(
            out_path, "w", driver="PNG",
            height=rgba_u8.shape[0], width=rgba_u8.shape[1],
            count=4, dtype="uint8", crs=crs_val, transform=transform
        ) as dst:
            for band_idx in range(4):
                dst.write(rgba_u8[:, :, band_idx], band_idx + 1)

        # Cleanup temp files
        for tmp in [raw_tif, wgs_tif, clipped_tif]:
            if tmp:
                tmp.unlink(missing_ok=True)

        print(f"[raster] LST tile written: {out_path}")
        return out_path, lst_celsius, transform, crs_val

    except Exception as e:
        print(f"[raster] LST real processing failed: {e}")
        # Cleanup temp files if any
        for tmp in [raw_tif, wgs_tif, clipped_tif]:
            if tmp:
                tmp.unlink(missing_ok=True)
        print("[raster] Falling back to mock LST tile generation")
        return generate_mock_lst_tile(bbox, target_date=target_date), None, None, None

def process_modis_ndvi(hdf_path: Path, bbox: Tuple, target_date: date) -> Optional[Path]:
    """
    Process MODIS MOD13A2 HDF4 file for NDVI.
    Falls back to mock generation if HDF4 driver is unavailable.
    """
    if not HAS_HDF4 or not HAS_RASTERIO:
        print(f"[raster] HDF4 driver not available for NDVI")
        print("[raster] Falling back to mock NDVI tile generation")
        return generate_mock_ndvi_tile(bbox, target_date=target_date)

    try:
        import subprocess
        subdataset = f'HDF4_EOS:EOS_GRID:"{hdf_path}":MOD_Grid_16DAY_1km_VI:1 km 16 days NDVI'
        raw_tif = hdf_path.parent / f"ndvi_raw_{target_date}.tif"
        subprocess.run(
            ["gdal_translate", "-of", "GTiff", subdataset, str(raw_tif)],
            check=True, capture_output=True
        )
        wgs_tif = hdf_path.parent / f"ndvi_wgs84_{target_date}.tif"
        clipped_tif = hdf_path.parent / f"ndvi_clipped_{target_date}.tif"
        reproject_to_wgs84(raw_tif, wgs_tif)
        clip_to_bbox(wgs_tif, bbox, clipped_tif)

        with rasterio.open(clipped_tif) as src:
            data      = src.read(1).astype(float)
            transform = src.transform
            crs_val   = src.crs

        data[data == -3000] = np.nan
        ndvi = data * 0.0001

        ndvi_dir = TILES_DIR / "ndvi"
        ndvi_dir.mkdir(parents=True, exist_ok=True)
        out_path = ndvi_dir / f"ndvi_modis_{target_date}.png"

        ndvi_clipped = np.clip(ndvi, -0.2, 0.8)
        normed = (ndvi_clipped - (-0.2)) / (0.8 - (-0.2))
        normed = np.nan_to_num(normed, nan=0.0)

        cmap = plt.get_cmap("YlGn")
        rgba = cmap(normed)
        rgba_u8 = (rgba * 255).astype(np.uint8)

        with rasterio.open(
            out_path, "w", driver="PNG",
            height=rgba_u8.shape[0], width=rgba_u8.shape[1],
            count=4, dtype="uint8", crs=crs_val, transform=transform
        ) as dst:
            for band_idx in range(4):
                dst.write(rgba_u8[:, :, band_idx], band_idx + 1)

        for tmp in [raw_tif, wgs_tif, clipped_tif]:
            tmp.unlink(missing_ok=True)

        print(f"[raster] NDVI tile written: {out_path}")
        return out_path

    except Exception as e:
        print(f"[raster] NDVI real processing failed: {e}")
        print("[raster] Falling back to mock NDVI tile generation")
        return generate_mock_ndvi_tile(bbox, target_date=target_date)


def process_sentinel2_ndvi(tif_path: Path, bbox: Tuple, target_date: date) -> Optional[Path]:
    """
    Process a Sentinel-2 GeoTIFF (B04/B08 bands) into NDVI PNG.
    Falls back to mock generation if rasterio is unavailable.
    """
    if not HAS_RASTERIO:
        print("[raster] Rasterio not available for Sentinel-2 NDVI")
        return generate_mock_ndvi_tile(bbox, target_date=target_date)

    try:
        wgs_tif     = tif_path.parent / f"ndvi_wgs84_{target_date}.tif"
        clipped_tif = tif_path.parent / f"ndvi_clipped_{target_date}.tif"

        reproject_to_wgs84(tif_path, wgs_tif)
        clip_to_bbox(wgs_tif, bbox, clipped_tif)

        with rasterio.open(clipped_tif) as src:
            b04 = src.read(1).astype(float)
            b08 = src.read(2).astype(float)
            transform = src.transform
            crs_val = src.crs

        denominator = b08 + b04
        denominator[denominator == 0] = np.nan
        ndvi = (b08 - b04) / denominator
        ndvi = np.clip(ndvi, -1, 1)

        ndvi_dir = TILES_DIR / "ndvi"
        ndvi_dir.mkdir(parents=True, exist_ok=True)
        out_path = ndvi_dir / f"ndvi_sentinel_{target_date}.png"

        ndvi_clipped = np.clip(ndvi, -0.2, 0.8)
        normed = (ndvi_clipped - (-0.2)) / (0.8 - (-0.2))
        normed = np.nan_to_num(normed, nan=0.0)

        cmap = plt.get_cmap("YlGn")
        rgba = cmap(normed)
        rgba_u8 = (rgba * 255).astype(np.uint8)

        with rasterio.open(
            out_path, "w", driver="PNG",
            height=rgba_u8.shape[0], width=rgba_u8.shape[1],
            count=4, dtype="uint8", crs=crs_val, transform=transform
        ) as dst:
            for band_idx in range(4):
                dst.write(rgba_u8[:, :, band_idx], band_idx + 1)

        for tmp in [wgs_tif, clipped_tif]:
            tmp.unlink(missing_ok=True)

        print(f"[raster] Sentinel-2 NDVI tile written: {out_path}")
        return out_path

    except Exception as e:
        print(f"[raster] Sentinel-2 NDVI processing failed: {e}")
        return generate_mock_ndvi_tile(bbox, target_date=target_date)


def get_tile_bounds_wkt(bounds: Tuple[float, float, float, float]) -> str:
    """
    Convert a bounding box tuple to WKT POLYGON string with SRID=4326.
    For inserting tile bounds into the raster_tiles table.
    """
    west, south, east, north = bounds
    return (
        f"SRID=4326;POLYGON(("
        f"{west} {south}, {east} {south}, {east} {north}, "
        f"{west} {north}, {west} {south}))"
    )

def extract_zonal_values(scaled_array: np.ndarray, transform, crs, zone_geoms: dict) -> dict:
    """Extract zonal mean values from a raster array for each zone geometry."""
    if not HAS_RASTERIO:
        raise RuntimeError("rasterio not available for zonal extraction")
    from shapely.geometry import mapping
    import tempfile
    
    results = {}
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir) / "temp.tif"
        with rasterio.open(
            tmp_path, "w", driver="GTiff",
            height=scaled_array.shape[0], width=scaled_array.shape[1],
            count=1, dtype="float32", crs=crs, transform=transform
        ) as dst:
            dst.write(scaled_array.astype("float32"), 1)
            
        for name, geom in zone_geoms.items():
            try:
                with rasterio.open(tmp_path) as src:
                    out_image, _ = rio_mask(src, [mapping(geom)], crop=True, nodata=np.nan)
                    valid_vals = out_image[~np.isnan(out_image)]
                    if len(valid_vals) > 0:
                        results[name] = float(np.mean(valid_vals))
                    else:
                        results[name] = None
            except Exception as e:
                print(f"Error extracting zonal values for zone {name}: {e}")
                results[name] = None
    return results

def generate_mock_zonal_values(layer_type: str, zone_geoms: dict) -> dict:
    """Generate synthetic zonal values for testing/mock mode."""
    import random
    vals = {}
    for name in zone_geoms.keys():
        if layer_type == "lst":
            vals[name] = random.uniform(28.0, 42.0)
        else:
            vals[name] = random.uniform(0.15, 0.65)
    return vals

def merge_zonal_values(*zonal_values_list) -> dict:
    """Merge zonal values from multiple sources by averaging them."""
    if not zonal_values_list:
        return {}
    keys = zonal_values_list[0].keys()
    merged = {}
    for k in keys:
        vals = [zv[k] for zv in zonal_values_list if zv.get(k) is not None]
        merged[k] = sum(vals) / len(vals) if vals else None
    return merged

def write_zonal_observations(db, region_id: str, layer_type: str, target_date, zonal_values: dict, src_id: str, raw_payload: dict = None) -> int:
    """Write zonal observations to raw_observations table."""
    from db.models import RawObservation, ZoneGeometry
    import uuid
    from datetime import datetime, timezone
    from geoalchemy2.shape import from_shape
    from shapely.geometry import Point
    
    count = 0
    for zone_name, val in zonal_values.items():
        if val is None:
            continue
            
        zone_row = db.query(ZoneGeometry).filter(
            ZoneGeometry.region_id == region_id,
            ZoneGeometry.name == zone_name
        ).first()
        
        if not zone_row:
            continue
            
        from geoalchemy2.shape import to_shape
        shape = to_shape(zone_row.geometry)
        centroid = shape.centroid
        point_geom = from_shape(Point(centroid.x, centroid.y), srid=4326)
        
        obs = RawObservation(
            id=uuid.uuid4(),
            source_id=src_id,
            region_id=region_id,
            layer_type=layer_type,
            geometry=point_geom,
            value=float(val),
            unit="C" if layer_type == "lst" else "ndvi",
            station_id=str(zone_row.id),
            station_name=zone_name,
            observed_at=datetime.combine(target_date, datetime.min.time(), tzinfo=timezone.utc),
            raw_payload=raw_payload or {}
        )
        db.add(obs)
        count += 1
        
    db.commit()
    return count

