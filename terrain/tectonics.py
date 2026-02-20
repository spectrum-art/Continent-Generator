"""Plate-proxy tectonic scaffold for structured uplift fields."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from terrain.config import TectonicsConfig
from terrain.rng import RngStream


@dataclass(frozen=True)
class TectonicsResult:
    """Generated tectonic fields for height composition and debugging."""

    plate_count: int
    plate_ids: np.ndarray
    plate_sites: np.ndarray
    plate_motion: np.ndarray
    boundary_mask: np.ndarray
    boundary_type: np.ndarray
    convergence_field: np.ndarray
    orogeny_field: np.ndarray
    rift_field: np.ndarray
    transform_field: np.ndarray
    crust_thickness: np.ndarray
    shelf_proximity: np.ndarray


def generate_tectonic_scaffold(
    width: int,
    height: int,
    land_mask: np.ndarray,
    rng: RngStream,
    *,
    config: TectonicsConfig | None = None,
) -> TectonicsResult:
    """Generate deterministic plate partition and tectonic intensity fields."""

    if width <= 0 or height <= 0:
        raise ValueError("width and height must be positive")
    if land_mask.shape != (height, width):
        raise ValueError("land_mask shape must match (height, width)")

    cfg = config or TectonicsConfig()

    plate_count = _sample_plate_count(rng.fork("tectonics_plate_count"), cfg)
    sites = _sample_plate_sites(rng.fork("tectonics_plate_sites"), plate_count, cfg.site_min_distance)
    plate_ids = _partition_plates(width, height, sites)
    motion = _sample_plate_motion(rng.fork("tectonics_plate_motion"), plate_count)

    boundary_type, convergence = _classify_boundaries(
        plate_ids,
        motion,
        threshold=cfg.boundary_convergence_threshold,
    )
    boundary_mask = boundary_type != 0

    orogeny, rift, transform = _tectonic_intensity_fields(boundary_type, cfg)
    crust, shelf = _crust_and_shelf_fields(land_mask, cfg)

    orogeny = np.clip(orogeny * (0.2 + 0.8 * crust), 0.0, 1.0).astype(np.float32)
    rift = np.clip(rift * (0.4 + 0.6 * np.maximum(crust, 1.0 - shelf)), 0.0, 1.0).astype(np.float32)

    return TectonicsResult(
        plate_count=plate_count,
        plate_ids=plate_ids,
        plate_sites=sites,
        plate_motion=motion,
        boundary_mask=boundary_mask,
        boundary_type=boundary_type,
        convergence_field=convergence,
        orogeny_field=orogeny,
        rift_field=rift,
        transform_field=transform,
        crust_thickness=crust,
        shelf_proximity=shelf,
    )


def box_blur(field: np.ndarray, radius: int, *, passes: int = 1) -> np.ndarray:
    """Approximate Gaussian blur using repeated separable box blur passes."""

    if radius <= 0:
        return field.astype(np.float32, copy=True)

    result = field.astype(np.float32, copy=True)
    for _ in range(max(1, passes)):
        result = _box_blur_axis(result, radius, axis=1)
        result = _box_blur_axis(result, radius, axis=0)
    return result.astype(np.float32)


def _box_blur_axis(field: np.ndarray, radius: int, *, axis: int) -> np.ndarray:
    kernel = 2 * radius + 1
    if axis == 0:
        padded = np.pad(field, ((radius, radius), (0, 0)), mode="edge")
        csum = np.cumsum(padded, axis=0, dtype=np.float32)
        csum = np.pad(csum, ((1, 0), (0, 0)), mode="constant", constant_values=0.0)
        return (csum[kernel:, :] - csum[:-kernel, :]) / float(kernel)

    padded = np.pad(field, ((0, 0), (radius, radius)), mode="edge")
    csum = np.cumsum(padded, axis=1, dtype=np.float32)
    csum = np.pad(csum, ((0, 0), (1, 0)), mode="constant", constant_values=0.0)
    return (csum[:, kernel:] - csum[:, :-kernel]) / float(kernel)


def _sample_plate_count(rng: RngStream, cfg: TectonicsConfig) -> int:
    return int(rng.generator().integers(cfg.min_plate_count, cfg.max_plate_count + 1))


def _sample_plate_sites(rng: RngStream, plate_count: int, min_distance: float) -> np.ndarray:
    prng = rng.generator()
    sites: list[np.ndarray] = []
    min_dist = float(min_distance)

    for _ in range(8):
        for _ in range(plate_count * 64):
            candidate = prng.random(2).astype(np.float32)
            if not sites:
                sites.append(candidate)
            else:
                distances = [float(np.linalg.norm(candidate - point)) for point in sites]
                if min(distances) >= min_dist:
                    sites.append(candidate)
            if len(sites) >= plate_count:
                break
        if len(sites) >= plate_count:
            break
        min_dist *= 0.88

    while len(sites) < plate_count:
        sites.append(prng.random(2).astype(np.float32))

    return np.stack(sites[:plate_count]).astype(np.float32)


def _partition_plates(width: int, height: int, sites: np.ndarray) -> np.ndarray:
    x_coords = (np.arange(width, dtype=np.float32) + 0.5) / float(width)
    y_coords = (np.arange(height, dtype=np.float32) + 0.5) / float(height)

    plate_ids = np.zeros((height, width), dtype=np.int16)
    best_dist = np.full((height, width), np.inf, dtype=np.float32)

    for idx, site in enumerate(sites):
        dx = x_coords[None, :] - site[0]
        dy = y_coords[:, None] - site[1]
        dist = dx * dx + dy * dy
        closer = dist < best_dist
        plate_ids[closer] = idx
        best_dist[closer] = dist[closer]

    return plate_ids


def _sample_plate_motion(rng: RngStream, plate_count: int) -> np.ndarray:
    angles = rng.generator().uniform(0.0, 2.0 * np.pi, size=plate_count).astype(np.float32)
    motion = np.stack((np.cos(angles), np.sin(angles)), axis=1)
    return motion.astype(np.float32)


def _classify_boundaries(
    plate_ids: np.ndarray,
    motion: np.ndarray,
    *,
    threshold: float,
) -> tuple[np.ndarray, np.ndarray]:
    height, width = plate_ids.shape
    boundary_type = np.zeros((height, width), dtype=np.int8)
    convergence = np.zeros((height, width), dtype=np.float32)
    assigned = np.zeros((height, width), dtype=bool)

    directions = [
        (-1, 0),
        (1, 0),
        (0, 1),
        (0, -1),
        (-1, 1),
        (-1, -1),
        (1, 1),
        (1, -1),
    ]

    for dy, dx in directions:
        sy0 = max(0, -dy)
        sy1 = height - max(0, dy)
        sx0 = max(0, -dx)
        sx1 = width - max(0, dx)
        ny0 = max(0, dy)
        ny1 = height - max(0, -dy)
        nx0 = max(0, dx)
        nx1 = width - max(0, -dx)

        a = plate_ids[sy0:sy1, sx0:sx1]
        b = plate_ids[ny0:ny1, nx0:nx1]
        if a.size == 0:
            continue

        different = a != b
        if not np.any(different):
            continue

        region_assigned = assigned[sy0:sy1, sx0:sx1]
        take = different & ~region_assigned
        if not np.any(take):
            continue

        dv = motion[b] - motion[a]
        norm = float(np.hypot(dx, dy))
        nx = float(dx / norm)
        ny = float(dy / norm)
        c = dv[..., 0] * nx + dv[..., 1] * ny

        cls = np.full(c.shape, 3, dtype=np.int8)
        cls[c < -threshold] = 1
        cls[c > threshold] = 2

        region_type = boundary_type[sy0:sy1, sx0:sx1]
        region_conv = convergence[sy0:sy1, sx0:sx1]

        region_type[take] = cls[take]
        region_conv[take] = np.clip(c[take] * 0.5, -1.0, 1.0).astype(np.float32)
        region_assigned[take] = True

        boundary_type[sy0:sy1, sx0:sx1] = region_type
        convergence[sy0:sy1, sx0:sx1] = region_conv
        assigned[sy0:sy1, sx0:sx1] = region_assigned

    return boundary_type, convergence


def _tectonic_intensity_fields(boundary_type: np.ndarray, cfg: TectonicsConfig) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    convergent = (boundary_type == 1).astype(np.float32)
    divergent = (boundary_type == 2).astype(np.float32)
    transform = (boundary_type == 3).astype(np.float32)

    orogeny = box_blur(convergent, cfg.orogeny_radius_px, passes=cfg.blur_passes)
    rift = box_blur(divergent, cfg.rift_radius_px, passes=cfg.blur_passes)
    lineament = box_blur(transform, cfg.transform_radius_px, passes=cfg.blur_passes)

    orogeny = np.power(_normalize01(orogeny), cfg.orogeny_gamma)
    rift = np.power(_normalize01(rift), cfg.rift_gamma)
    lineament = np.power(_normalize01(lineament), cfg.transform_gamma)
    return orogeny.astype(np.float32), rift.astype(np.float32), lineament.astype(np.float32)


def _crust_and_shelf_fields(land_mask: np.ndarray, cfg: TectonicsConfig) -> tuple[np.ndarray, np.ndarray]:
    land = land_mask.astype(np.float32)
    crust = box_blur(land, cfg.crust_radius_px, passes=max(1, cfg.blur_passes - 1))
    crust = np.power(np.clip(crust, 0.0, 1.0), cfg.crust_power)

    shelf = box_blur(land, cfg.shelf_radius_px, passes=max(1, cfg.blur_passes - 1))
    shelf = np.power(np.clip(shelf, 0.0, 1.0), cfg.shelf_power)
    return crust.astype(np.float32), shelf.astype(np.float32)


def _normalize01(values: np.ndarray) -> np.ndarray:
    maximum = float(values.max())
    if maximum <= 1e-8:
        return np.zeros_like(values, dtype=np.float32)
    return np.clip(values / maximum, 0.0, 1.0).astype(np.float32)
