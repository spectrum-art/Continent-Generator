"""Lithosphere mechanics and tectonic scaffold fields."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from terrain.config import TectonicsConfig
from terrain.noise import fbm_noise
from terrain.rng import RngStream


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
class TectonicsResult:
    """Generated tectonic fields for height composition and debugging."""

    plate_count: int
    plate_ids: np.ndarray
    raw_plate_ids: np.ndarray
    warped_plate_ids: np.ndarray
    plate_sites: np.ndarray
    plate_motion: np.ndarray
    plate_age_values: np.ndarray
    plate_age_map: np.ndarray
    boundary_warp_magnitude: np.ndarray
    boundary_mask: np.ndarray
    boundary_type: np.ndarray
    convergence_field: np.ndarray
    boundary_tangent_x: np.ndarray
    boundary_tangent_y: np.ndarray
    boundary_speed: np.ndarray
    boundary_curvature: np.ndarray
    lithosphere_thickness_px: np.ndarray
    collision_buffer: np.ndarray
    triple_junction_field: np.ndarray
    orogeny_tangent: np.ndarray
    orogeny_field: np.ndarray
    rift_field: np.ndarray
    transform_field: np.ndarray
    base_crust_field: np.ndarray
    crust_thickness: np.ndarray
    shelf_proximity: np.ndarray
    stress_field: np.ndarray
    interior_basin_field: np.ndarray


def generate_tectonic_scaffold(
    width: int,
    height: int,
    land_mask: np.ndarray,
    rng: RngStream,
    *,
    config: TectonicsConfig | None = None,
) -> TectonicsResult:
    """Generate deterministic, stabilized lithosphere proxy fields."""

    if width <= 0 or height <= 0:
        raise ValueError("width and height must be positive")
    if land_mask.shape != (height, width):
        raise ValueError("land_mask shape must match (height, width)")

    cfg = config or TectonicsConfig()

    plate_count = _sample_plate_count(rng.fork("tectonics_plate_count"), cfg)
    sites = _sample_plate_sites(rng.fork("tectonics_plate_sites"), plate_count, cfg.site_min_distance)
    motion = _sample_plate_motion(rng.fork("tectonics_plate_motion"), plate_count)
    plate_age_values = _sample_plate_ages(rng.fork("tectonics_plate_age"), plate_count)

    base_x, base_y = _normalized_grid(width, height)
    raw_plate_ids = _partition_plates(base_x, base_y, sites)

    # Stage A: coarse multi-scale warp to move away from raw Voronoi geometry.
    coarse_dx, coarse_dy = _fractal_warp_vector(
        width,
        height,
        rng.fork("tectonics_warp_coarse"),
        cfg,
    )
    prelim_x, prelim_y = _apply_pixel_warp(base_x, base_y, coarse_dx, coarse_dy, width, height)
    prelim_plate_ids = _partition_plates(prelim_x, prelim_y, sites)
    prelim_boundary, prelim_tx, prelim_ty = _boundary_tangent_from_plate_ids(prelim_plate_ids)

    # Stage B: tangent-biased strike roughness (along-strike > across-strike).
    strike_dx, strike_dy = _tangent_biased_warp(
        width,
        height,
        prelim_tx,
        prelim_ty,
        rng.fork("tectonics_warp_tangent"),
        cfg,
    )

    hf_dx = strike_dx
    hf_dy = strike_dy
    cand_dx = coarse_dx + hf_dx
    cand_dy = coarse_dy + hf_dy
    cand_x, cand_y = _apply_pixel_warp(base_x, base_y, cand_dx, cand_dy, width, height)
    cand_plate_ids = _partition_plates(cand_x, cand_y, sites)

    # Stage C: anti-pinch stabilization and curvature limiting.
    thickness = _nearest_other_plate_distance(cand_plate_ids, cfg.thickness_search_radius_px)
    dyn_min_thickness = cfg.min_lithosphere_thickness_px + max(1, int(min(width, height) * 0.004))
    pinch = np.clip((dyn_min_thickness - thickness) / max(dyn_min_thickness, 1), 0.0, 1.0)

    cand_boundary, cand_tx, cand_ty = _boundary_tangent_from_plate_ids(cand_plate_ids)
    curvature = _curvature_proxy(cand_tx, cand_ty, cand_boundary)
    curvature_excess = np.clip(
        (curvature - cfg.curvature_limit) / max(1.0 - cfg.curvature_limit, 1e-6),
        0.0,
        1.0,
    )

    hf_keep = np.clip(1.0 - np.maximum(pinch, curvature_excess), 0.0, 1.0)
    hf_keep = box_blur(hf_keep, 2, passes=1)

    relaxed_dx = coarse_dx + hf_dx * hf_keep
    relaxed_dy = coarse_dy + hf_dy * hf_keep

    smooth_dx = box_blur(relaxed_dx, cfg.curvature_smooth_radius_px, passes=1)
    smooth_dy = box_blur(relaxed_dy, cfg.curvature_smooth_radius_px, passes=1)
    smooth_blend = np.clip(pinch + curvature_excess * 0.7, 0.0, 1.0)

    final_dx = relaxed_dx * (1.0 - smooth_blend) + smooth_dx * smooth_blend
    final_dy = relaxed_dy * (1.0 - smooth_blend) + smooth_dy * smooth_blend

    warped_x, warped_y = _apply_pixel_warp(base_x, base_y, final_dx, final_dy, width, height)
    warped_plate_ids = _partition_plates(warped_x, warped_y, sites)
    plate_ids = warped_plate_ids
    warp_magnitude = _normalize01(np.hypot(final_dx, final_dy))

    # Stage D: boundary mechanics and classification.
    boundary_type, convergence, tx, ty, speed = _classify_boundaries(
        plate_ids,
        motion,
        threshold=cfg.boundary_convergence_threshold,
    )
    boundary_mask = boundary_type != 0
    curvature = _curvature_proxy(tx, ty, boundary_mask)
    thickness = _nearest_other_plate_distance(plate_ids, cfg.thickness_search_radius_px)

    # Stage E: deformation-width modeling using distance envelopes.
    boundary_fragment = _boundary_fragmentation_noise(width, height, boundary_mask, rng.fork("tectonics_boundary_fragment"), cfg)

    conv_mask = boundary_type == 1
    div_mask = boundary_type == 2
    trans_mask = boundary_type == 3

    dist_conv = _distance_to_mask(conv_mask, cfg.deformation_max_radius_px)
    dist_div = _distance_to_mask(div_mask, cfg.deformation_max_radius_px)
    dist_trans = _distance_to_mask(trans_mask, cfg.deformation_max_radius_px)

    speed_norm = np.clip(speed * 0.5, 0.0, 1.0)
    conv_speed = _masked_mean(speed_norm, conv_mask)
    div_speed = _masked_mean(speed_norm, div_mask)
    trans_speed = _masked_mean(speed_norm, trans_mask)
    curvature_mean = _masked_mean(curvature, boundary_mask)

    sigma_conv = cfg.sigma_convergent_base_px * (0.8 + 0.8 * conv_speed) * (0.9 + 0.3 * curvature_mean)
    sigma_div = cfg.sigma_divergent_base_px * (0.8 + 0.6 * div_speed) * (0.9 + 0.2 * curvature_mean)
    sigma_trans = cfg.sigma_transform_base_px * (0.9 + 0.5 * trans_speed) * (0.9 + 0.2 * curvature_mean)

    conv_env = _gaussian_envelope(dist_conv, sigma_conv)
    div_env = _gaussian_envelope(dist_div, sigma_div)
    trans_env = _gaussian_envelope(dist_trans, sigma_trans)

    seg_conv, seg_div, seg_trans = _boundary_segment_strength(
        width,
        height,
        conv_mask,
        div_mask,
        trans_mask,
        rng.fork("tectonics_segments"),
        cfg,
    )

    conv_env = np.clip(conv_env * seg_conv * boundary_fragment, 0.0, 1.0)
    div_env = np.clip(div_env * seg_div * boundary_fragment, 0.0, 1.0)
    trans_env = np.clip(trans_env * seg_trans * boundary_fragment, 0.0, 1.0)

    collision_buffer, conv_soft, div_soft, trans_soft = _collision_softmax(
        conv_env,
        div_env,
        trans_env,
        cfg.collision_softmax_temperature,
    )

    triple_junction = _triple_junction_field(plate_ids, boundary_mask, cfg)
    orogeny_tangent = _tangent_aligned_orogeny(
        width,
        height,
        conv_soft,
        tx,
        ty,
        rng.fork("tectonics_orogeny_tangent"),
        cfg,
    )

    orogeny = np.clip(
        (conv_soft * 0.35 + orogeny_tangent * 0.65)
        * (1.0 + triple_junction * cfg.triple_junction_boost),
        0.0,
        1.0,
    )
    rift = np.power(np.clip(div_soft, 0.0, 1.0), cfg.rift_gamma)
    transform = np.power(np.clip(trans_soft, 0.0, 1.0), cfg.transform_gamma)

    # Stage F: crust/stress/age interior mechanics.
    plate_age_map = plate_age_values[plate_ids]
    base_crust = _base_crust_field(
        plate_ids,
        plate_age_values,
        boundary_mask,
        land_mask,
        cfg,
    )
    shelf = _shelf_proximity(land_mask, cfg)
    stress = _plate_stress_field(plate_ids, boundary_type, plate_age_values, cfg)

    deformation_damp = np.clip(1.0 - plate_age_map * 0.45, 0.55, 1.0)
    crust = np.clip(base_crust * (0.45 + 0.55 * shelf), 0.0, 1.0)

    orogeny = np.clip(orogeny * deformation_damp * (1.0 - collision_buffer * 0.18), 0.0, 1.0)
    rift = np.clip(rift * deformation_damp * (0.85 + 0.15 * stress), 0.0, 1.0)
    transform = np.clip(transform * (0.7 + 0.3 * stress), 0.0, 1.0)

    interior_basin = _interior_basin_field(
        width,
        height,
        land_mask,
        crust,
        stress,
        collision_buffer,
        rng.fork("tectonics_interior_basin"),
        cfg,
    )

    return TectonicsResult(
        plate_count=plate_count,
        plate_ids=plate_ids,
        raw_plate_ids=raw_plate_ids,
        warped_plate_ids=warped_plate_ids,
        plate_sites=sites,
        plate_motion=motion,
        plate_age_values=plate_age_values,
        plate_age_map=plate_age_map.astype(np.float32),
        boundary_warp_magnitude=warp_magnitude.astype(np.float32),
        boundary_mask=boundary_mask,
        boundary_type=boundary_type,
        convergence_field=convergence,
        boundary_tangent_x=tx,
        boundary_tangent_y=ty,
        boundary_speed=speed,
        boundary_curvature=curvature,
        lithosphere_thickness_px=thickness,
        collision_buffer=collision_buffer.astype(np.float32),
        triple_junction_field=triple_junction,
        orogeny_tangent=orogeny_tangent.astype(np.float32),
        orogeny_field=orogeny.astype(np.float32),
        rift_field=rift.astype(np.float32),
        transform_field=transform.astype(np.float32),
        base_crust_field=base_crust.astype(np.float32),
        crust_thickness=crust.astype(np.float32),
        shelf_proximity=shelf.astype(np.float32),
        stress_field=stress.astype(np.float32),
        interior_basin_field=interior_basin.astype(np.float32),
    )


def box_blur(field: np.ndarray, radius: int, *, passes: int = 1) -> np.ndarray:
    """Approximate Gaussian blur using repeated separable box passes."""

    if radius <= 0:
        return field.astype(np.float32, copy=True)

    result = field.astype(np.float32, copy=True)
    for _ in range(max(1, passes)):
        result = _box_blur_axis(result, radius, axis=1)
        result = _box_blur_axis(result, radius, axis=0)
    return result.astype(np.float32)


def distance_to_mask(mask: np.ndarray, max_radius: int) -> np.ndarray:
    """Public helper for deterministic mask-distance fields in pixel units."""

    return _distance_to_mask(mask, max_radius)


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


def _sample_plate_motion(rng: RngStream, plate_count: int) -> np.ndarray:
    angles = rng.generator().uniform(0.0, 2.0 * np.pi, size=plate_count).astype(np.float32)
    return np.stack((np.cos(angles), np.sin(angles)), axis=1).astype(np.float32)


def _sample_plate_ages(rng: RngStream, plate_count: int) -> np.ndarray:
    return rng.generator().uniform(0.0, 1.0, size=plate_count).astype(np.float32)


def _normalized_grid(width: int, height: int) -> tuple[np.ndarray, np.ndarray]:
    x_coords = (np.arange(width, dtype=np.float32) + 0.5) / float(width)
    y_coords = (np.arange(height, dtype=np.float32) + 0.5) / float(height)
    return np.broadcast_to(x_coords[None, :], (height, width)), np.broadcast_to(y_coords[:, None], (height, width))


def _fractal_warp_vector(width: int, height: int, rng: RngStream, cfg: TectonicsConfig) -> tuple[np.ndarray, np.ndarray]:
    dx = np.zeros((height, width), dtype=np.float32)
    dy = np.zeros((height, width), dtype=np.float32)
    total_amp = float(sum(cfg.plate_warp_octave_amplitudes))

    for i, (freq, amp) in enumerate(zip(cfg.plate_warp_octave_frequencies, cfg.plate_warp_octave_amplitudes)):
        res = max(1, int(round(cfg.plate_warp_base_res * freq)))
        nx = fbm_noise(width, height, rng.fork(f"fractal-warp-x-{i}").generator(), base_res=res, octaves=3)
        ny = fbm_noise(width, height, rng.fork(f"fractal-warp-y-{i}").generator(), base_res=res, octaves=3)
        dx += nx * float(amp)
        dy += ny * float(amp)

    if total_amp > 0:
        dx /= total_amp
        dy /= total_amp

    return (dx * cfg.plate_warp_strength_px).astype(np.float32), (dy * cfg.plate_warp_strength_px).astype(np.float32)


def _tangent_biased_warp(
    width: int,
    height: int,
    tangent_x: np.ndarray,
    tangent_y: np.ndarray,
    rng: RngStream,
    cfg: TectonicsConfig,
) -> tuple[np.ndarray, np.ndarray]:
    along = fbm_noise(width, height, rng.fork("along-strike").generator(), base_res=7, octaves=4)
    across = fbm_noise(width, height, rng.fork("across-strike").generator(), base_res=8, octaves=3)

    tx = box_blur(tangent_x, 3, passes=1)
    ty = box_blur(tangent_y, 3, passes=1)
    norm = np.maximum(np.hypot(tx, ty), 1e-6)
    tx = tx / norm
    ty = ty / norm
    nx = -ty
    ny = tx

    tangent_scale = cfg.plate_warp_strength_px * cfg.tangent_warp_fraction
    normal_scale = cfg.plate_warp_strength_px * cfg.normal_warp_fraction

    dx = tx * along * tangent_scale + nx * across * normal_scale
    dy = ty * along * tangent_scale + ny * across * normal_scale
    return dx.astype(np.float32), dy.astype(np.float32)


def _apply_pixel_warp(
    base_x: np.ndarray,
    base_y: np.ndarray,
    delta_x_px: np.ndarray,
    delta_y_px: np.ndarray,
    width: int,
    height: int,
) -> tuple[np.ndarray, np.ndarray]:
    warped_x = np.clip(base_x + delta_x_px / float(max(width - 1, 1)), 0.0, 1.0)
    warped_y = np.clip(base_y + delta_y_px / float(max(height - 1, 1)), 0.0, 1.0)
    return warped_x.astype(np.float32), warped_y.astype(np.float32)


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


def _boundary_tangent_from_plate_ids(plate_ids: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    boundary = np.zeros_like(plate_ids, dtype=bool)
    for dy, dx in _DIRECTIONS_8:
        shifted = _shift_int(plate_ids, dy, dx, fill=-1)
        boundary |= shifted != plate_ids

    boundary_f = boundary.astype(np.float32)
    gy, gx = np.gradient(boundary_f)
    nx = gx
    ny = gy
    norm = np.maximum(np.hypot(nx, ny), 1e-6)

    tx = -ny / norm
    ty = nx / norm

    tx = box_blur(tx, 2, passes=1)
    ty = box_blur(ty, 2, passes=1)
    tnorm = np.maximum(np.hypot(tx, ty), 1e-6)
    tx = tx / tnorm
    ty = ty / tnorm

    tx *= boundary_f
    ty *= boundary_f
    return boundary, tx.astype(np.float32), ty.astype(np.float32)


def _classify_boundaries(
    plate_ids: np.ndarray,
    motion: np.ndarray,
    *,
    threshold: float,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    height, width = plate_ids.shape
    boundary_type = np.zeros((height, width), dtype=np.int8)
    convergence = np.zeros((height, width), dtype=np.float32)
    tangent_x = np.zeros((height, width), dtype=np.float32)
    tangent_y = np.zeros((height, width), dtype=np.float32)
    speed = np.zeros((height, width), dtype=np.float32)
    assigned = np.zeros((height, width), dtype=bool)

    for dy, dx in _DIRECTIONS_8:
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

        different = a != b
        region_assigned = assigned[sy0:sy1, sx0:sx1]
        take = different & ~region_assigned
        if not np.any(take):
            continue

        va = motion[a]
        vb = motion[b]
        dv = vb - va

        nlen = float(np.hypot(dx, dy))
        nx = float(dx / nlen)
        ny = float(dy / nlen)
        tx = -ny
        ty = nx

        c = dv[..., 0] * nx + dv[..., 1] * ny
        spd = np.hypot(dv[..., 0], dv[..., 1])

        cls = np.full(c.shape, 3, dtype=np.int8)
        cls[c < -threshold] = 1
        cls[c > threshold] = 2

        region_type = boundary_type[sy0:sy1, sx0:sx1]
        region_conv = convergence[sy0:sy1, sx0:sx1]
        region_tx = tangent_x[sy0:sy1, sx0:sx1]
        region_ty = tangent_y[sy0:sy1, sx0:sx1]
        region_speed = speed[sy0:sy1, sx0:sx1]

        region_type[take] = cls[take]
        region_conv[take] = np.clip(c[take] * 0.5, -1.0, 1.0)
        region_tx[take] = tx
        region_ty[take] = ty
        region_speed[take] = spd[take]
        region_assigned[take] = True

        boundary_type[sy0:sy1, sx0:sx1] = region_type
        convergence[sy0:sy1, sx0:sx1] = region_conv
        tangent_x[sy0:sy1, sx0:sx1] = region_tx
        tangent_y[sy0:sy1, sx0:sx1] = region_ty
        speed[sy0:sy1, sx0:sx1] = region_speed
        assigned[sy0:sy1, sx0:sx1] = region_assigned

    mask = boundary_type != 0
    tangent_x *= mask
    tangent_y *= mask
    speed *= mask
    return boundary_type, convergence, tangent_x, tangent_y, speed


def _curvature_proxy(tangent_x: np.ndarray, tangent_y: np.ndarray, boundary_mask: np.ndarray) -> np.ndarray:
    ty_y, ty_x = np.gradient(tangent_y)
    tx_y, tx_x = np.gradient(tangent_x)
    divergence = tx_x + ty_y
    curl_like = tx_y - ty_x
    curvature = np.hypot(divergence, curl_like) * boundary_mask.astype(np.float32)

    p = np.percentile(curvature[boundary_mask], 95) if np.any(boundary_mask) else 1.0
    if p <= 1e-6:
        return np.zeros_like(curvature, dtype=np.float32)
    return np.clip(curvature / p, 0.0, 1.0).astype(np.float32)


def _nearest_other_plate_distance(plate_ids: np.ndarray, max_radius: int) -> np.ndarray:
    max_radius = max(1, int(max_radius))
    remaining = np.ones_like(plate_ids, dtype=bool)
    distance = np.full(plate_ids.shape, max_radius + 1, dtype=np.float32)

    for radius in range(1, max_radius + 1):
        close = np.zeros_like(plate_ids, dtype=bool)
        for dy, dx in _DIRECTIONS_8:
            shifted = _shift_int(plate_ids, dy * radius, dx * radius, fill=-1)
            close |= shifted != plate_ids

        newly = remaining & close
        if np.any(newly):
            distance[newly] = float(radius)
            remaining[newly] = False
        if not np.any(remaining):
            break

    return distance


def _distance_to_mask(mask: np.ndarray, max_radius: int) -> np.ndarray:
    max_radius = max(1, int(max_radius))
    distance = np.full(mask.shape, max_radius + 1, dtype=np.float32)
    distance[mask] = 0.0

    frontier = mask.copy()
    visited = mask.copy()

    for radius in range(1, max_radius + 1):
        if not np.any(frontier):
            break
        neighbors = _dilate_bool(frontier)
        new_frontier = neighbors & (~visited)
        if np.any(new_frontier):
            distance[new_frontier] = float(radius)
            visited |= new_frontier
        frontier = new_frontier

    return distance


def _dilate_bool(mask: np.ndarray) -> np.ndarray:
    out = mask.copy()
    for dy, dx in _DIRECTIONS_8:
        out |= _shift_bool(mask, dy, dx)
    return out


def _boundary_fragmentation_noise(
    width: int,
    height: int,
    boundary_mask: np.ndarray,
    rng: RngStream,
    cfg: TectonicsConfig,
) -> np.ndarray:
    noise = fbm_noise(
        width,
        height,
        rng.fork("fragment-noise").generator(),
        base_res=cfg.boundary_fragment_base_res,
        octaves=cfg.boundary_fragment_octaves,
    )
    noise01 = _normalize01(noise)
    strength = 1.0 - (cfg.boundary_fragment_strength * 0.5) + noise01 * cfg.boundary_fragment_strength
    spread = box_blur(boundary_mask.astype(np.float32) * strength, 4, passes=1)
    spread = _normalize01(spread)
    return np.clip(0.55 + 0.45 * spread, 0.4, 1.0).astype(np.float32)


def _boundary_segment_strength(
    width: int,
    height: int,
    conv_mask: np.ndarray,
    div_mask: np.ndarray,
    trans_mask: np.ndarray,
    rng: RngStream,
    cfg: TectonicsConfig,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    noise = fbm_noise(
        width,
        height,
        rng.fork("segment-noise").generator(),
        base_res=cfg.segment_noise_base_res,
        octaves=cfg.segment_noise_octaves,
    )
    noise = _normalize01(noise)

    def segment(mask: np.ndarray) -> np.ndarray:
        classes = np.where(noise > 0.72, 1.0, np.where(noise > 0.4, 0.62, 0.25)).astype(np.float32)
        seeded = classes * mask.astype(np.float32)
        spread = _normalize01(box_blur(seeded, 9, passes=1))
        return np.clip(0.35 + 0.65 * spread, 0.2, 1.0)

    return segment(conv_mask), segment(div_mask), segment(trans_mask)


def _gaussian_envelope(distance: np.ndarray, sigma_px: float) -> np.ndarray:
    sigma = max(float(sigma_px), 1e-3)
    return np.exp(-(distance * distance) / (2.0 * sigma * sigma)).astype(np.float32)


def _collision_softmax(
    convergent: np.ndarray,
    divergent: np.ndarray,
    transform: np.ndarray,
    temperature: float,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    stack = np.stack((convergent, divergent, transform), axis=0)
    temp = max(float(temperature), 1e-3)
    logits = stack / temp
    logits = logits - np.max(logits, axis=0, keepdims=True)
    exp_logits = np.exp(logits)
    weights = exp_logits / np.maximum(np.sum(exp_logits, axis=0, keepdims=True), 1e-6)

    collision = np.clip(np.sum(stack, axis=0), 0.0, 1.0)
    collision = _normalize01(box_blur(collision, 2, passes=1))

    convergent_soft = np.clip(convergent * (0.55 + 0.45 * weights[0]), 0.0, 1.0)
    divergent_soft = np.clip(divergent * (0.55 + 0.45 * weights[1]), 0.0, 1.0)
    transform_soft = np.clip(transform * (0.55 + 0.45 * weights[2]), 0.0, 1.0)
    return collision, convergent_soft, divergent_soft, transform_soft


def _triple_junction_field(plate_ids: np.ndarray, boundary_mask: np.ndarray, cfg: TectonicsConfig) -> np.ndarray:
    neighbors = [plate_ids]
    for dy, dx in _DIRECTIONS_8:
        neighbors.append(_shift_int(plate_ids, dy, dx, fill=-1))

    values = np.stack(neighbors, axis=0)
    sorted_vals = np.sort(values, axis=0)
    unique_count = 1 + np.sum(sorted_vals[1:] != sorted_vals[:-1], axis=0)

    triple = (boundary_mask & (unique_count >= 3)).astype(np.float32)
    boosted = box_blur(triple, cfg.triple_junction_radius_px, passes=max(1, cfg.blur_passes - 1))
    return _normalize01(boosted)


def _tangent_aligned_orogeny(
    width: int,
    height: int,
    convergent_soft: np.ndarray,
    tangent_x: np.ndarray,
    tangent_y: np.ndarray,
    rng: RngStream,
    cfg: TectonicsConfig,
) -> np.ndarray:
    sm_tx = box_blur(tangent_x * convergent_soft, cfg.orogeny_radius_px, passes=cfg.blur_passes)
    sm_ty = box_blur(tangent_y * convergent_soft, cfg.orogeny_radius_px, passes=cfg.blur_passes)
    norm = np.maximum(np.hypot(sm_tx, sm_ty), 1e-6)
    tx = sm_tx / norm
    ty = sm_ty / norm

    a = fbm_noise(
        width,
        height,
        rng.fork("orogeny-tangent-a").generator(),
        base_res=cfg.orogeny_tangent_base_res,
        octaves=cfg.orogeny_tangent_octaves,
    )
    b = fbm_noise(
        width,
        height,
        rng.fork("orogeny-tangent-b").generator(),
        base_res=cfg.orogeny_tangent_base_res,
        octaves=cfg.orogeny_tangent_octaves,
    )

    aligned = np.abs(a * tx + b * ty)
    return _normalize01(aligned * convergent_soft)


def _base_crust_field(
    plate_ids: np.ndarray,
    plate_age_values: np.ndarray,
    boundary_mask: np.ndarray,
    land_mask: np.ndarray,
    cfg: TectonicsConfig,
) -> np.ndarray:
    plate_noise = np.linspace(0.0, 1.0, num=plate_age_values.shape[0], dtype=np.float32)
    crust_per_plate = np.clip(0.45 + 0.35 * plate_noise + 0.2 * plate_age_values, 0.25, 1.0)
    crust_raw = crust_per_plate[plate_ids]

    dist_boundary = _distance_to_mask(boundary_mask, cfg.deformation_max_radius_px)
    blend = _gaussian_envelope(dist_boundary, cfg.crust_boundary_sigma_px)
    crust_smooth = box_blur(crust_raw, cfg.crust_blend_radius_px, passes=2)
    crust_blended = crust_raw * (1.0 - blend) + crust_smooth * blend

    interior = box_blur(land_mask.astype(np.float32), cfg.crust_radius_px, passes=max(1, cfg.blur_passes - 1))
    return np.clip(crust_blended * (0.35 + 0.65 * interior), 0.0, 1.0).astype(np.float32)


def _shelf_proximity(land_mask: np.ndarray, cfg: TectonicsConfig) -> np.ndarray:
    shelf = box_blur(land_mask.astype(np.float32), cfg.shelf_radius_px, passes=max(1, cfg.blur_passes - 1))
    return np.power(np.clip(shelf, 0.0, 1.0), cfg.shelf_power).astype(np.float32)


def _plate_stress_field(
    plate_ids: np.ndarray,
    boundary_type: np.ndarray,
    plate_age_values: np.ndarray,
    cfg: TectonicsConfig,
) -> np.ndarray:
    height, width = plate_ids.shape
    yy, xx = np.indices((height, width), dtype=np.float32)
    nx = (xx + 0.5) / float(width)
    ny = (yy + 0.5) / float(height)

    stress = np.zeros((height, width), dtype=np.float32)
    unique_ids = np.unique(plate_ids)

    for pid in unique_ids:
        mask = plate_ids == pid
        if not np.any(mask):
            continue

        cx = float(nx[mask].mean())
        cy = float(ny[mask].mean())

        dx = nx - cx
        dy = ny - cy
        radial = np.hypot(dx, dy)
        radial_decay = np.clip(1.0 - radial / np.sqrt(2.0), 0.0, 1.0)
        radial_decay = np.power(radial_decay, cfg.stress_decay_power)

        local_conv = mask & (boundary_type == 1)
        if np.any(local_conv):
            bx = float(nx[local_conv].mean())
            by = float(ny[local_conv].mean())
            vdx = bx - cx
            vdy = by - cy
            vlen = float(np.hypot(vdx, vdy))
            if vlen > 1e-6:
                dirx = -vdx / vlen
                diry = -vdy / vlen
                pos_len = np.maximum(np.hypot(dx, dy), 1e-6)
                ux = dx / pos_len
                uy = dy / pos_len
                directional = np.clip(ux * dirx + uy * diry, 0.0, 1.0)
            else:
                directional = np.full((height, width), 0.5, dtype=np.float32)
        else:
            directional = np.full((height, width), 0.35, dtype=np.float32)

        age = float(plate_age_values[int(pid)])
        activity = 1.0 - 0.45 * age
        plate_stress = radial_decay * (0.45 + 0.55 * directional) * activity
        stress[mask] = plate_stress[mask]

    return _normalize01(box_blur(stress, 4, passes=1))


def _interior_basin_field(
    width: int,
    height: int,
    land_mask: np.ndarray,
    crust: np.ndarray,
    stress: np.ndarray,
    collision_buffer: np.ndarray,
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
    noise_low = 1.0 - _normalize01(noise)
    broad = box_blur(land_mask.astype(np.float32), cfg.interior_basin_radius_px, passes=cfg.blur_passes)

    basin = broad * (1.0 - stress) * (0.45 + 0.55 * noise_low)
    basin *= np.clip(1.0 - collision_buffer * 0.45, 0.55, 1.0)
    basin *= np.clip(0.35 + 0.65 * crust, 0.0, 1.0)
    basin *= land_mask.astype(np.float32)
    basin = np.power(_normalize01(basin), cfg.interior_basin_power)
    return basin.astype(np.float32)


def _masked_mean(values: np.ndarray, mask: np.ndarray) -> float:
    if not np.any(mask):
        return 0.0
    return float(np.mean(values[mask]))


def _shift_bool(mask: np.ndarray, dy: int, dx: int) -> np.ndarray:
    out = np.zeros_like(mask, dtype=bool)

    y_src0 = max(0, -dy)
    y_src1 = mask.shape[0] - max(0, dy)
    x_src0 = max(0, -dx)
    x_src1 = mask.shape[1] - max(0, dx)

    y_dst0 = max(0, dy)
    y_dst1 = mask.shape[0] - max(0, -dy)
    x_dst0 = max(0, dx)
    x_dst1 = mask.shape[1] - max(0, -dx)

    out[y_dst0:y_dst1, x_dst0:x_dst1] = mask[y_src0:y_src1, x_src0:x_src1]
    return out


def _shift_int(field: np.ndarray, dy: int, dx: int, *, fill: int) -> np.ndarray:
    out = np.full_like(field, fill)

    y_src0 = max(0, -dy)
    y_src1 = field.shape[0] - max(0, dy)
    x_src0 = max(0, -dx)
    x_src1 = field.shape[1] - max(0, dx)

    y_dst0 = max(0, dy)
    y_dst1 = field.shape[0] - max(0, -dy)
    x_dst0 = max(0, dx)
    x_dst1 = field.shape[1] - max(0, -dx)

    out[y_dst0:y_dst1, x_dst0:x_dst1] = field[y_src0:y_src1, x_src0:x_src1]
    return out


def _normalize01(values: np.ndarray) -> np.ndarray:
    maximum = float(values.max())
    if maximum <= 1e-8:
        return np.zeros_like(values, dtype=np.float32)
    minimum = float(values.min())
    scale = max(maximum - minimum, 1e-8)
    return np.clip((values - minimum) / scale, 0.0, 1.0).astype(np.float32)
