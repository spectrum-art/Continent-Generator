"""Heightfield composition pipeline."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from terrain.config import GeneratorConfig
from terrain.mask import generate_land_mask
from terrain.metrics import ConnectivityMetrics
from terrain.noise import fbm_noise, warp_field
from terrain.rng import RngStream


@dataclass(frozen=True)
class HeightfieldResult:
    """Primary and intermediate raster outputs of generation."""

    height_m: np.ndarray
    land_mask: np.ndarray
    mask_potential: np.ndarray
    uplift: np.ndarray
    mask_metrics: ConnectivityMetrics


def generate_heightfield(
    width: int,
    height: int,
    meters_per_pixel: float,
    rng: RngStream,
    *,
    config: GeneratorConfig | None = None,
) -> HeightfieldResult:
    """Generate a deterministic continent-scale heightfield in meters."""

    if width <= 0 or height <= 0:
        raise ValueError("width and height must be positive")
    if meters_per_pixel <= 0:
        raise ValueError("meters_per_pixel must be positive")

    cfg = config or GeneratorConfig()
    mask_result = generate_land_mask(width, height, rng.fork("mask"), config=cfg.mask)

    land = mask_result.land_mask
    potential = mask_result.mask_potential

    threshold = mask_result.threshold
    continentality = np.clip(
        (potential - threshold) / max(1.0 - threshold, 1e-6),
        0.0,
        1.0,
    ).astype(np.float32)

    uplift_rng = rng.fork("uplift").generator()
    uplift_base = fbm_noise(width, height, uplift_rng, base_res=3, octaves=5)
    ridged = np.square(np.clip(1.0 - np.abs(uplift_base), 0.0, 1.0)).astype(np.float32)

    uplift_warp_x = fbm_noise(
        width,
        height,
        rng.fork("uplift-warp-x").generator(),
        base_res=1,
        octaves=3,
    )
    uplift_warp_y = fbm_noise(
        width,
        height,
        rng.fork("uplift-warp-y").generator(),
        base_res=1,
        octaves=3,
    )
    uplift = warp_field(
        ridged,
        uplift_warp_x,
        uplift_warp_y,
        strength_px=cfg.height.uplift_warp_strength_px,
    )
    uplift = _normalize01(uplift)

    basin = fbm_noise(width, height, rng.fork("basin").generator(), base_res=4, octaves=4)
    basin_term = np.clip(0.62 - (basin + 1.0) * 0.5, 0.0, 1.0)

    macro_land = (
        cfg.height.base_land_lift_m
        + continentality * cfg.height.continentality_height_m
        + uplift * cfg.height.ridge_height_m
        + basin_term * cfg.height.basin_height_m
    )

    detail = fbm_noise(width, height, rng.fork("detail").generator(), base_res=10, octaves=4)

    ocean_factor = np.clip(
        (threshold - potential) / max(threshold, 1e-6),
        0.0,
        1.0,
    )

    ocean_height = -ocean_factor * cfg.height.ocean_depth_m + detail * cfg.height.detail_ocean_m
    ocean_height = np.maximum(ocean_height, -cfg.height.max_ocean_depth_m)
    ocean_height = np.minimum(ocean_height, 0.0)

    full_height = ocean_height.astype(np.float32)
    land_height = macro_land + detail * cfg.height.detail_land_m
    land_height = np.clip(
        land_height,
        cfg.height.min_land_height_m,
        cfg.height.max_land_height_m,
    )
    full_height[land] = land_height[land]

    full_height = np.clip(
        full_height,
        -cfg.height.max_ocean_depth_m,
        cfg.height.max_land_height_m,
    ).astype(np.float32)

    return HeightfieldResult(
        height_m=full_height,
        land_mask=land,
        mask_potential=potential,
        uplift=uplift,
        mask_metrics=mask_result.metrics,
    )


def _normalize01(values: np.ndarray) -> np.ndarray:
    lo, hi = np.percentile(values, [1.0, 99.0])
    scale = max(hi - lo, 1e-6)
    return np.clip((values - lo) / scale, 0.0, 1.0).astype(np.float32)
