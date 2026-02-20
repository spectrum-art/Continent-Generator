"""Land mask generation routines."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from terrain.config import MaskConfig
from terrain.metrics import ConnectivityMetrics, connected_components_metrics
from terrain.noise import fbm_noise, warp_field
from terrain.rng import RngStream


@dataclass(frozen=True)
class LandMaskResult:
    """Outputs from land mask generation."""

    land_mask: np.ndarray
    mask_potential: np.ndarray
    threshold: float
    metrics: ConnectivityMetrics


def generate_land_mask(
    width: int,
    height: int,
    rng: RngStream,
    *,
    config: MaskConfig | None = None,
) -> LandMaskResult:
    """Create a dominant-continent mask with optional island fragmentation."""

    cfg = config or MaskConfig()

    potential_rng = rng.fork("mask-potential").generator()
    warp_x_rng = rng.fork("mask-warp-x").generator()
    warp_y_rng = rng.fork("mask-warp-y").generator()
    frag_rng = rng.fork("mask-fragment").generator()

    base = fbm_noise(width, height, potential_rng, base_res=2, octaves=cfg.base_octaves)
    warp_x = fbm_noise(width, height, warp_x_rng, base_res=1, octaves=cfg.warp_octaves)
    warp_y = fbm_noise(width, height, warp_y_rng, base_res=1, octaves=cfg.warp_octaves)
    warped = warp_field(
        base,
        warp_x,
        warp_y,
        strength_px=cfg.warp_strength_px * (1.0 + cfg.fragmentation),
    )

    frag = fbm_noise(width, height, frag_rng, base_res=4, octaves=3)

    yy, xx = np.indices((height, width), dtype=np.float32)
    nx = (xx / max(width - 1, 1)) * 2.0 - 1.0
    ny = (yy / max(height - 1, 1)) * 2.0 - 1.0

    radius = np.sqrt((nx * 0.85) ** 2 + ny**2)
    center_bias = np.clip(1.0 - radius, 0.0, 1.0)
    lat_bias = 1.0 - np.abs(ny) * 0.35

    potential = (
        warped * 0.62
        + center_bias * cfg.coast_bias_strength
        + lat_bias * 0.18
        + frag * cfg.fragmentation * 0.20
    )

    low, high = np.percentile(potential, [2.0, 98.0])
    scale = max(high - low, 1e-6)
    potential = np.clip((potential - low) / scale, 0.0, 1.0).astype(np.float32)

    target_land = np.clip(
        cfg.target_land_fraction + (cfg.fragmentation - 0.2) * 0.20,
        cfg.min_land_fraction,
        cfg.max_land_fraction,
    )

    threshold = float(np.quantile(potential, 1.0 - target_land))
    land = _smooth_mask(potential >= threshold, iterations=cfg.smooth_iterations)
    metrics = connected_components_metrics(land, connectivity=8)

    if metrics.largest_land_ratio < cfg.dominant_land_ratio:
        for attempt in range(3):
            threshold -= cfg.threshold_relaxation * (attempt + 1)
            land = _smooth_mask(
                potential >= threshold,
                iterations=cfg.smooth_iterations + 1,
            )
            metrics = connected_components_metrics(land, connectivity=8)
            if metrics.largest_land_ratio >= cfg.dominant_land_ratio:
                break

    return LandMaskResult(
        land_mask=land.astype(bool, copy=False),
        mask_potential=potential,
        threshold=threshold,
        metrics=metrics,
    )


def _smooth_mask(mask: np.ndarray, *, iterations: int) -> np.ndarray:
    result = mask.astype(bool, copy=True)
    for _ in range(max(0, iterations)):
        result = _majority_filter(result)
    return result


def _majority_filter(mask: np.ndarray) -> np.ndarray:
    cells = mask.astype(np.uint8)
    padded = np.pad(cells, pad_width=1, mode="constant", constant_values=0)
    neighborhood = (
        padded[:-2, :-2]
        + padded[:-2, 1:-1]
        + padded[:-2, 2:]
        + padded[1:-1, :-2]
        + padded[1:-1, 1:-1]
        + padded[1:-1, 2:]
        + padded[2:, :-2]
        + padded[2:, 1:-1]
        + padded[2:, 2:]
    )
    return neighborhood >= 5
