"""Static hierarchical fluvial incision pass."""

from __future__ import annotations

from dataclasses import dataclass
import time

import numpy as np

from terrain.config import GeomorphConfig
from terrain.tectonics import box_blur


_DIRECTIONS_8 = [
    (-1, 0),
    (1, 0),
    (0, 1),
    (0, -1),
    (-1, 1),
    (-1, -1),
    (1, 1),
    (1, -1),
]


@dataclass(frozen=True)
class GeomorphMetrics:
    max_incision_depth_m: float
    mean_incision_depth_m: float
    mean_incision_depth_incised_m: float
    percent_land_incised: float
    power_scale_value: float
    incision_seconds: float


@dataclass(frozen=True)
class GeomorphResult:
    h_geomorph: np.ndarray
    power_raw: np.ndarray
    incision_raw: np.ndarray
    incision_blurred: np.ndarray
    incision_depth_m: np.ndarray
    metrics: GeomorphMetrics


def apply_hierarchical_incision(
    h_hydro_post: np.ndarray,
    flow_accum: np.ndarray,
    flow_dir: np.ndarray,
    land_mask: np.ndarray,
    meters_per_pixel: float,
    *,
    config: GeomorphConfig,
) -> GeomorphResult:
    """Build geomorph height by applying one deterministic hierarchical incision pass."""

    t0 = time.perf_counter()

    land = land_mask.astype(bool)
    incision_raw = np.zeros_like(h_hydro_post, dtype=np.float32)
    power_raw = np.zeros_like(h_hydro_post, dtype=np.float32)
    if not np.any(land):
        metrics = GeomorphMetrics(
            max_incision_depth_m=0.0,
            mean_incision_depth_m=0.0,
            mean_incision_depth_incised_m=0.0,
            percent_land_incised=0.0,
            power_scale_value=0.0,
            incision_seconds=time.perf_counter() - t0,
        )
        zeros = np.zeros_like(h_hydro_post, dtype=np.float32)
        return GeomorphResult(
            h_geomorph=h_hydro_post.astype(np.float32, copy=True),
            power_raw=zeros,
            incision_raw=zeros,
            incision_blurred=zeros,
            incision_depth_m=zeros,
            metrics=metrics,
        )

    accum_cells = np.clip(flow_accum.astype(np.float32), 0.0, None)
    accum_land = accum_cells[land]
    a_scale = max(float(np.percentile(accum_land, 99.5)), 1.0)
    a_norm = np.clip(accum_cells / a_scale, 0.0, 1.0)
    a_gate = (a_norm >= float(config.geomorph_a_min)).astype(np.float32)

    gy_phys, gx_phys = np.gradient(
        h_hydro_post.astype(np.float32),
        float(meters_per_pixel),
        float(meters_per_pixel),
    )
    slope_phys = np.hypot(gx_phys, gy_phys).astype(np.float32)

    if config.geomorph_use_physical_stream_power:
        cell_area_m2 = float(meters_per_pixel) * float(meters_per_pixel)
        accum_area_m2 = accum_cells * cell_area_m2
        power_raw = np.power(np.clip(accum_area_m2, 0.0, None), config.geomorph_incision_m) * np.power(
            np.clip(slope_phys, 0.0, None), config.geomorph_incision_n
        )
    else:
        slope_scale = max(float(np.percentile(slope_phys[land], 99.0)), 1e-6)
        slope_norm = np.clip(slope_phys / slope_scale, 0.0, 1.0)
        power_raw = np.power(a_norm, config.geomorph_incision_m) * np.power(slope_norm, config.geomorph_incision_n)

    power_raw = power_raw.astype(np.float32)
    power_raw *= land.astype(np.float32)
    power_raw *= a_gate

    power_land = power_raw[land]
    scale_pct = float(np.clip(config.geomorph_power_scale_percentile, 90.0, 100.0))
    power_scale = max(float(np.percentile(power_land, scale_pct)), 1e-9)
    incision_raw = np.clip(power_raw / power_scale, 0.0, 1.0)

    # Keep convex ridge crests from being over-incised.
    ridge = _laplacian(h_hydro_post.astype(np.float32)) < 0.0
    ridge_preserve = float(np.clip(config.geomorph_ridge_preserve, 0.0, 1.0))
    incision_raw[ridge] *= ridge_preserve

    incision_raw *= land.astype(np.float32)

    blur_radius = max(1, int(round(max(0.5, config.geomorph_valley_blur_sigma_px) * 1.5)))
    incision_blurred = box_blur(incision_raw.astype(np.float32), blur_radius, passes=3)
    incision_blurred *= land.astype(np.float32)

    depth_scale = float(config.geomorph_max_depth_m) * float(np.clip(config.geomorph_incision_strength * 320.0, 0.0, 1.0))
    incision_depth = np.minimum(incision_blurred * depth_scale, float(config.geomorph_max_depth_m)).astype(np.float32)
    incision_depth *= land.astype(np.float32)
    incision_depth = _enforce_noninversion(
        base_height=h_hydro_post.astype(np.float32),
        incision_depth=incision_depth,
        flow_dir=flow_dir,
        land_mask=land,
    )

    h_geomorph = h_hydro_post.astype(np.float32) - incision_depth
    h_geomorph[~land] = h_hydro_post[~land]

    land_incision = incision_depth[land]
    incised = land_incision[land_incision > 0.5]
    metrics = GeomorphMetrics(
        max_incision_depth_m=float(np.max(land_incision)) if land_incision.size else 0.0,
        mean_incision_depth_m=float(np.mean(land_incision)) if land_incision.size else 0.0,
        mean_incision_depth_incised_m=float(np.mean(incised)) if incised.size else 0.0,
        percent_land_incised=float(np.mean(land_incision > 0.5)) if land_incision.size else 0.0,
        power_scale_value=power_scale,
        incision_seconds=time.perf_counter() - t0,
    )
    return GeomorphResult(
        h_geomorph=h_geomorph.astype(np.float32),
        power_raw=power_raw.astype(np.float32),
        incision_raw=incision_raw.astype(np.float32),
        incision_blurred=incision_blurred.astype(np.float32),
        incision_depth_m=incision_depth.astype(np.float32),
        metrics=metrics,
    )


def _enforce_noninversion(
    *,
    base_height: np.ndarray,
    incision_depth: np.ndarray,
    flow_dir: np.ndarray,
    land_mask: np.ndarray,
) -> np.ndarray:
    """Cap incision so routed cells remain at or above downstream post-incision height."""

    capped = incision_depth.astype(np.float32, copy=True)
    base = base_height.astype(np.float32, copy=False)
    eps = 1e-3
    for dir_idx, (dy, dx) in enumerate(_DIRECTIONS_8):
        region = land_mask & (flow_dir == dir_idx)
        if not np.any(region):
            continue
        base_down = _shift_float(base, dy, dx, fill=np.inf)
        inc_down = _shift_float(capped, dy, dx, fill=0.0)
        max_allowed = np.clip(base - base_down + inc_down - eps, 0.0, None)
        capped[region] = np.minimum(capped[region], max_allowed[region])
    capped[~land_mask] = 0.0
    return capped


def _shift_float(arr: np.ndarray, dy: int, dx: int, *, fill: float) -> np.ndarray:
    out = np.full(arr.shape, fill, dtype=np.float32)
    h, w = arr.shape
    src_y0 = max(0, -dy)
    src_y1 = min(h, h - dy)
    src_x0 = max(0, -dx)
    src_x1 = min(w, w - dx)
    dst_y0 = src_y0 + dy
    dst_y1 = src_y1 + dy
    dst_x0 = src_x0 + dx
    dst_x1 = src_x1 + dx
    out[src_y0:src_y1, src_x0:src_x1] = arr[dst_y0:dst_y1, dst_x0:dst_x1]
    return out


def _laplacian(values: np.ndarray) -> np.ndarray:
    c = values
    return (
        _shift_float(c, -1, 0, fill=float(c.mean()))
        + _shift_float(c, 1, 0, fill=float(c.mean()))
        + _shift_float(c, 0, -1, fill=float(c.mean()))
        + _shift_float(c, 0, 1, fill=float(c.mean()))
        - 4.0 * c
    ).astype(np.float32)
