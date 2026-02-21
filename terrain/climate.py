"""Fast deterministic climate moisture proxy fields."""

from __future__ import annotations

import numpy as np
from matplotlib.colors import ListedColormap
from scipy.ndimage import distance_transform_edt, gaussian_filter


BIOME_ID_WATER = np.uint8(0)
BIOME_ID_ICE = np.uint8(1)
BIOME_ID_TUNDRA = np.uint8(2)
BIOME_ID_BOREAL_FOREST = np.uint8(3)
BIOME_ID_TEMPERATE_GRASSLAND = np.uint8(4)
BIOME_ID_TEMPERATE_FOREST = np.uint8(5)
BIOME_ID_TEMPERATE_RAIN_FOREST = np.uint8(6)
BIOME_ID_HOT_DESERT = np.uint8(7)
BIOME_ID_SAVANNA = np.uint8(8)
BIOME_ID_TROPICAL_SEASONAL_FOREST = np.uint8(9)
BIOME_ID_TROPICAL_RAIN_FOREST = np.uint8(10)


def compute_moisture_mask(
    *,
    height_m: np.ndarray,
    land_mask: np.ndarray,
    ocean_mask: np.ndarray,
    lake_mask: np.ndarray,
    river_mask: np.ndarray,
    meters_per_pixel: float,
    moisture_decay_px: float = 120.0,
    wind_x: float = 1.0,
    wind_y: float = 0.0,
    upslope_boost: float = 0.45,
    rain_shadow_strength: float = 2.0,
    smooth_sigma_px: float = 1.2,
) -> np.ndarray:
    """Compute normalized moisture mask from water distance + orographic forcing."""

    if height_m.shape != land_mask.shape:
        raise ValueError("height_m and land_mask shape mismatch")
    if meters_per_pixel <= 0.0:
        raise ValueError("meters_per_pixel must be positive")

    ocean_mask_local = height_m <= 0.0
    fresh_mask = (river_mask > 0.0) | (lake_mask > 0.0)

    dist_to_ocean = distance_transform_edt(~ocean_mask_local).astype(np.float32)
    dist_to_fresh = distance_transform_edt(~fresh_mask).astype(np.float32)

    ocean_moisture = np.exp(-dist_to_ocean / 150.0).astype(np.float32)
    fresh_moisture = np.exp(-dist_to_fresh / 5.0).astype(np.float32)
    ambient_moisture = np.maximum(ocean_moisture, fresh_moisture)

    _, dx = np.gradient(height_m.astype(np.float32))
    orographic_modifier = (dx / 50.0).astype(np.float32)
    orographic_modifier = np.clip(orographic_modifier, -0.8, 0.4).astype(np.float32)

    moisture = ambient_moisture + orographic_modifier
    moisture = gaussian_filter(moisture.astype(np.float32), sigma=2.0, mode="nearest")
    moisture = np.clip(moisture, 0.0, 1.0).astype(np.float32)
    return moisture


def compute_temperature_mask(
    *,
    height_m: np.ndarray,
    land_mask: np.ndarray,
    max_land_height_m: float,
    equator_y: float | None = None,
    lat_weight: float = 0.72,
    alt_weight: float = 0.55,
) -> np.ndarray:
    """Compute normalized temperature from latitude and altitude proxies."""

    h, w = height_m.shape
    eq_y = float(0.5 * (h - 1)) if equator_y is None else float(np.clip(equator_y, 0.0, h - 1.0))
    y = np.arange(h, dtype=np.float32)[:, None]
    lat_penalty = np.abs(y - eq_y) / max(eq_y, float(h - 1) - eq_y, 1e-6)
    lat_penalty = np.broadcast_to(lat_penalty, (h, w)).astype(np.float32)

    elev_land = np.clip(height_m.astype(np.float32), 0.0, None)
    alt_penalty = elev_land / max(float(max_land_height_m), 1e-6)
    alt_penalty = np.clip(alt_penalty, 0.0, 1.0).astype(np.float32)

    temperature = 1.0 - (float(lat_weight) * lat_penalty + float(alt_weight) * alt_penalty)
    temperature = np.clip(temperature, 0.0, 1.0).astype(np.float32)
    temperature[~land_mask] = 0.0
    return temperature


def classify_biomes_whittaker(
    *,
    temperature: np.ndarray,
    moisture: np.ndarray,
    land_mask: np.ndarray,
    ocean_mask: np.ndarray,
) -> np.ndarray:
    """Classify land pixels into Whittaker-inspired discrete biome IDs."""

    t = np.clip(temperature.astype(np.float32), 0.0, 1.0)
    m = np.clip(moisture.astype(np.float32), 0.0, 1.0)
    land = land_mask.astype(bool)

    conditions = [
        ocean_mask,
        land & (t < 0.10),
        land & (t < 0.24) & (m < 0.45),
        land & (t < 0.24) & (m >= 0.45),
        land & (t >= 0.24) & (t < 0.58) & (m < 0.22),
        land & (t >= 0.24) & (t < 0.58) & (m >= 0.22) & (m < 0.55),
        land & (t >= 0.24) & (t < 0.58) & (m >= 0.55),
        land & (t >= 0.58) & (m < 0.16),
        land & (t >= 0.58) & (m >= 0.16) & (m < 0.42),
        land & (t >= 0.58) & (m >= 0.42) & (m < 0.70),
        land & (t >= 0.58) & (m >= 0.70),
        land,
    ]
    choices = [
        BIOME_ID_WATER,
        BIOME_ID_ICE,
        BIOME_ID_TUNDRA,
        BIOME_ID_BOREAL_FOREST,
        BIOME_ID_TEMPERATE_GRASSLAND,
        BIOME_ID_TEMPERATE_FOREST,
        BIOME_ID_TEMPERATE_RAIN_FOREST,
        BIOME_ID_HOT_DESERT,
        BIOME_ID_SAVANNA,
        BIOME_ID_TROPICAL_SEASONAL_FOREST,
        BIOME_ID_TROPICAL_RAIN_FOREST,
        BIOME_ID_TEMPERATE_GRASSLAND,
    ]
    biome_mask = np.select(conditions, choices, default=BIOME_ID_WATER).astype(np.uint8)
    return biome_mask


def biome_colormap_rgb(biome_mask: np.ndarray) -> np.ndarray:
    """Map biome integer IDs to a discrete RGB palette via ListedColormap."""

    palette = [
        "#1e4877",  # 0 water
        "#ffffff",  # 1 ice / snow
        "#8e9ba8",  # 2 tundra
        "#425946",  # 3 boreal forest
        "#c2c58b",  # 4 temperate grassland
        "#5ea345",  # 5 temperate forest
        "#247d52",  # 6 temperate rain forest
        "#d1823e",  # 7 hot desert
        "#dcb352",  # 8 savanna
        "#8ba832",  # 9 tropical seasonal forest
        "#11401f",  # 10 tropical rain forest
    ]
    cmap = ListedColormap(palette, name="whittaker_biomes")
    idx = np.clip(biome_mask.astype(np.int32), 0, len(palette) - 1)
    rgba = cmap(idx)
    rgb = np.round(rgba[..., :3] * 255.0).astype(np.uint8)
    return rgb
