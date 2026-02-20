"""Plate-proxy tectonic scaffold for structured uplift fields."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from terrain.config import TectonicsConfig
from terrain.noise import fbm_noise
from terrain.rng import RngStream


@dataclass(frozen=True)
class TectonicsResult:
    """Generated tectonic fields for height composition and debugging."""

    plate_count: int
    plate_ids: np.ndarray
    raw_plate_ids: np.ndarray
    warped_plate_ids: np.ndarray
    plate_sites: np.ndarray
    plate_motion: np.ndarray
    boundary_warp_magnitude: np.ndarray
    boundary_mask: np.ndarray
    boundary_type: np.ndarray
    convergence_field: np.ndarray
    boundary_tangent_x: np.ndarray
    boundary_tangent_y: np.ndarray
    triple_junction_field: np.ndarray
    orogeny_tangent: np.ndarray
    orogeny_field: np.ndarray
    rift_field: np.ndarray
    transform_field: np.ndarray
    crust_thickness: np.ndarray
    shelf_proximity: np.ndarray
    interior_basin_field: np.ndarray


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

    coord_x, coord_y, warp_magnitude = _warped_coordinates(width, height, rng.fork("tectonics_plate_warp"), cfg)
    raw_x, raw_y = _normalized_grid(width, height)
    raw_plate_ids = _partition_plates(raw_x, raw_y, sites)
    warped_plate_ids = _partition_plates(coord_x, coord_y, sites)
    motion = _sample_plate_motion(rng.fork("tectonics_plate_motion"), plate_count)

    boundary_type, convergence, tangent_x, tangent_y = _classify_boundaries(
        warped_plate_ids,
        motion,
        threshold=cfg.boundary_convergence_threshold,
    )
    boundary_mask = boundary_type != 0

    base_orogeny, rift, transform = _tectonic_intensity_fields(boundary_type, cfg)
    triple_junction = _triple_junction_field(warped_plate_ids, boundary_mask, cfg)
    orogeny_tangent = _tangent_aligned_orogeny(
        width,
        height,
        boundary_type,
        tangent_x,
        tangent_y,
        rng.fork("tectonics_orogeny_tangent"),
        cfg,
    )

    # Keep continuous convergent belts but bias structure along boundary tangents.
    orogeny = np.clip(
        (base_orogeny * 0.35 + orogeny_tangent * 0.65)
        * (1.0 + triple_junction * cfg.triple_junction_boost),
        0.0,
        1.0,
    )

    crust, shelf = _crust_and_shelf_fields(land_mask, cfg)

    orogeny = np.clip(orogeny * (0.2 + 0.8 * crust), 0.0, 1.0).astype(np.float32)
    rift = np.clip(rift * (0.4 + 0.6 * np.maximum(crust, 1.0 - shelf)), 0.0, 1.0).astype(np.float32)
    interior_basin = _interior_basin_field(
        width,
        height,
        land_mask,
        crust,
        rng.fork("tectonics_interior_basin"),
        cfg,
    )

    return TectonicsResult(
        plate_count=plate_count,
        plate_ids=warped_plate_ids,
        raw_plate_ids=raw_plate_ids,
        warped_plate_ids=warped_plate_ids,
        plate_sites=sites,
        plate_motion=motion,
        boundary_warp_magnitude=warp_magnitude,
        boundary_mask=boundary_mask,
        boundary_type=boundary_type,
        convergence_field=convergence,
        boundary_tangent_x=tangent_x,
        boundary_tangent_y=tangent_y,
        triple_junction_field=triple_junction,
        orogeny_tangent=orogeny_tangent,
        orogeny_field=orogeny,
        rift_field=rift,
        transform_field=transform,
        crust_thickness=crust,
        shelf_proximity=shelf,
        interior_basin_field=interior_basin,
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


def _normalized_grid(width: int, height: int) -> tuple[np.ndarray, np.ndarray]:
    x_coords = (np.arange(width, dtype=np.float32) + 0.5) / float(width)
    y_coords = (np.arange(height, dtype=np.float32) + 0.5) / float(height)
    return np.broadcast_to(x_coords[None, :], (height, width)), np.broadcast_to(y_coords[:, None], (height, width))


def _warped_coordinates(
    width: int,
    height: int,
    rng: RngStream,
    cfg: TectonicsConfig,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    base_x, base_y = _normalized_grid(width, height)

    low_x = fbm_noise(
        width,
        height,
        rng.fork("plate-warp-low-x").generator(),
        base_res=cfg.plate_warp_base_res,
        octaves=cfg.plate_warp_octaves,
    )
    low_y = fbm_noise(
        width,
        height,
        rng.fork("plate-warp-low-y").generator(),
        base_res=cfg.plate_warp_base_res,
        octaves=cfg.plate_warp_octaves,
    )
    jitter_x = fbm_noise(
        width,
        height,
        rng.fork("plate-warp-jitter-x").generator(),
        base_res=cfg.boundary_jitter_base_res,
        octaves=cfg.boundary_jitter_octaves,
    )
    jitter_y = fbm_noise(
        width,
        height,
        rng.fork("plate-warp-jitter-y").generator(),
        base_res=cfg.boundary_jitter_base_res,
        octaves=cfg.boundary_jitter_octaves,
    )

    delta_x_px = low_x * cfg.plate_warp_strength_px + jitter_x * cfg.boundary_jitter_strength_px
    delta_y_px = low_y * cfg.plate_warp_strength_px + jitter_y * cfg.boundary_jitter_strength_px

    warped_x = np.clip(base_x + delta_x_px / float(max(width - 1, 1)), 0.0, 1.0)
    warped_y = np.clip(base_y + delta_y_px / float(max(height - 1, 1)), 0.0, 1.0)
    warp_magnitude = _normalize01(np.hypot(delta_x_px, delta_y_px))
    return warped_x.astype(np.float32), warped_y.astype(np.float32), warp_magnitude.astype(np.float32)


def _partition_plates(coord_x: np.ndarray, coord_y: np.ndarray, sites: np.ndarray) -> np.ndarray:
    height, width = coord_x.shape
    plate_ids = np.zeros((height, width), dtype=np.int16)
    best_dist = np.full((height, width), np.inf, dtype=np.float32)

    for idx, site in enumerate(sites):
        dx = coord_x - site[0]
        dy = coord_y - site[1]
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
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    height, width = plate_ids.shape
    boundary_type = np.zeros((height, width), dtype=np.int8)
    convergence = np.zeros((height, width), dtype=np.float32)
    tangent_x = np.zeros((height, width), dtype=np.float32)
    tangent_y = np.zeros((height, width), dtype=np.float32)
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
        normal_length = float(np.hypot(dx, dy))
        nx = float(dx / normal_length)
        ny = float(dy / normal_length)
        c = dv[..., 0] * nx + dv[..., 1] * ny

        cls = np.full(c.shape, 3, dtype=np.int8)
        cls[c < -threshold] = 1
        cls[c > threshold] = 2

        region_type = boundary_type[sy0:sy1, sx0:sx1]
        region_conv = convergence[sy0:sy1, sx0:sx1]
        region_tx = tangent_x[sy0:sy1, sx0:sx1]
        region_ty = tangent_y[sy0:sy1, sx0:sx1]

        region_type[take] = cls[take]
        region_conv[take] = np.clip(c[take] * 0.5, -1.0, 1.0).astype(np.float32)
        region_tx[take] = -ny
        region_ty[take] = nx
        region_assigned[take] = True

        boundary_type[sy0:sy1, sx0:sx1] = region_type
        convergence[sy0:sy1, sx0:sx1] = region_conv
        tangent_x[sy0:sy1, sx0:sx1] = region_tx
        tangent_y[sy0:sy1, sx0:sx1] = region_ty
        assigned[sy0:sy1, sx0:sx1] = region_assigned

    return boundary_type, convergence, tangent_x, tangent_y


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


def _triple_junction_field(plate_ids: np.ndarray, boundary_mask: np.ndarray, cfg: TectonicsConfig) -> np.ndarray:
    diffs = np.zeros_like(plate_ids, dtype=np.int16)
    for dy, dx in [(-1, 0), (1, 0), (0, 1), (0, -1), (-1, 1), (-1, -1), (1, 1), (1, -1)]:
        rolled = np.roll(plate_ids, shift=(dy, dx), axis=(0, 1))
        diffs += (rolled != plate_ids).astype(np.int16)

    triple = (boundary_mask & (diffs >= 3)).astype(np.float32)
    boosted = box_blur(triple, cfg.triple_junction_radius_px, passes=max(1, cfg.blur_passes - 1))
    return _normalize01(boosted)


def _tangent_aligned_orogeny(
    width: int,
    height: int,
    boundary_type: np.ndarray,
    tangent_x: np.ndarray,
    tangent_y: np.ndarray,
    rng: RngStream,
    cfg: TectonicsConfig,
) -> np.ndarray:
    convergent = (boundary_type == 1).astype(np.float32)
    tangent_strength = box_blur(convergent, cfg.orogeny_radius_px, passes=cfg.blur_passes)

    sm_tx = box_blur(tangent_x * convergent, cfg.orogeny_radius_px, passes=cfg.blur_passes)
    sm_ty = box_blur(tangent_y * convergent, cfg.orogeny_radius_px, passes=cfg.blur_passes)
    norm = np.maximum(np.hypot(sm_tx, sm_ty), 1e-6)
    tx = sm_tx / norm
    ty = sm_ty / norm

    field_a = fbm_noise(
        width,
        height,
        rng.fork("orogeny-tangent-a").generator(),
        base_res=cfg.orogeny_tangent_base_res,
        octaves=cfg.orogeny_tangent_octaves,
    )
    field_b = fbm_noise(
        width,
        height,
        rng.fork("orogeny-tangent-b").generator(),
        base_res=cfg.orogeny_tangent_base_res,
        octaves=cfg.orogeny_tangent_octaves,
    )

    tangent_noise = np.abs(field_a * tx + field_b * ty)
    tangent_noise = _normalize01(tangent_noise)
    return _normalize01(tangent_strength * (0.35 + 0.65 * tangent_noise))


def _crust_and_shelf_fields(land_mask: np.ndarray, cfg: TectonicsConfig) -> tuple[np.ndarray, np.ndarray]:
    land = land_mask.astype(np.float32)
    crust = box_blur(land, cfg.crust_radius_px, passes=max(1, cfg.blur_passes - 1))
    crust = np.power(np.clip(crust, 0.0, 1.0), cfg.crust_power)

    shelf = box_blur(land, cfg.shelf_radius_px, passes=max(1, cfg.blur_passes - 1))
    shelf = np.power(np.clip(shelf, 0.0, 1.0), cfg.shelf_power)
    return crust.astype(np.float32), shelf.astype(np.float32)


def _interior_basin_field(
    width: int,
    height: int,
    land_mask: np.ndarray,
    crust: np.ndarray,
    rng: RngStream,
    cfg: TectonicsConfig,
) -> np.ndarray:
    noise = fbm_noise(
        width,
        height,
        rng.fork("basin-noise").generator(),
        base_res=cfg.interior_basin_base_res,
        octaves=cfg.interior_basin_octaves,
    )
    noise_norm = _normalize01(noise)
    lowland_noise = 1.0 - noise_norm
    broad_interior = box_blur(
        np.clip(crust - 0.25, 0.0, 1.0),
        cfg.interior_basin_radius_px,
        passes=cfg.blur_passes,
    )
    interior_basin = broad_interior * lowland_noise * land_mask.astype(np.float32)
    interior_basin = np.power(_normalize01(interior_basin), cfg.interior_basin_power)
    return interior_basin.astype(np.float32)


def _normalize01(values: np.ndarray) -> np.ndarray:
    maximum = float(values.max())
    if maximum <= 1e-8:
        return np.zeros_like(values, dtype=np.float32)
    return np.clip(values / maximum, 0.0, 1.0).astype(np.float32)
