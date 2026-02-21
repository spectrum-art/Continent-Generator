"""Hydrology and erosion scaffold for terrain finalization."""

from __future__ import annotations

from dataclasses import dataclass
import heapq

import numpy as np

from terrain.config import HydrologyConfig, TectonicsConfig
from terrain.rng import RngStream
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
_SQRT2 = float(np.sqrt(2.0))


@dataclass(frozen=True)
class BasinRecord:
    basin_id: int
    seed_y: int
    seed_x: int
    spill_y: int
    spill_x: int
    spill_elevation: float
    area_to_spill: int
    volume_to_spill: float
    max_depth_to_spill: float
    flat_indices: np.ndarray


@dataclass(frozen=True)
class HydrologyMetrics:
    river_pixel_count: int
    lake_pixel_count: int
    max_flow_accum: float
    mean_flow_accum: float
    percent_endo_basins: float
    total_river_length_estimate: float
    basin_count_total: int
    basin_count_retained: int
    lake_area_fraction: float
    mean_lake_area: float
    largest_lake_area: int
    num_ocean_outlets_raw: int
    num_ocean_outlets_merged: int
    largest_basin_land_ratio: float
    top_10_basin_sizes: tuple[int, ...]
    endorheic_land_ratio: float
    num_endorheic_basins: int
    flow_accum_p50: float
    flow_accum_p90: float
    flow_accum_p99: float
    flow_accum_p999: float
    flow_cells_ge_10: int
    flow_cells_ge_100: int
    flow_cells_ge_1000: int
    regional_endorheic_count_gt_10000km2: int
    continental_basin_count_gt_1pct_land: int
    tiny_endorheic_basin_count_lt_10000km2: int
    tiny_endorheic_area_ratio_lt_10000km2: float
    trunk_sinuosity_segment_count: int
    trunk_sinuosity_median: float
    trunk_sinuosity_p90: float


@dataclass(frozen=True)
class HydrologyResult:
    h_base: np.ndarray
    h_hydro_pre: np.ndarray
    h_hydro: np.ndarray
    flow_dir: np.ndarray
    flow_accum_raw: np.ndarray
    flow_accum_norm: np.ndarray
    basin_outlet_id: np.ndarray
    outlet_points: np.ndarray
    endorheic_mask: np.ndarray
    capture_paths_mask: np.ndarray
    basin_mask: np.ndarray
    basin_id_map: np.ndarray
    basin_size_map: np.ndarray
    lake_size_map: np.ndarray
    lake_retention_map: np.ndarray
    lake_mask: np.ndarray
    h_drain: np.ndarray
    river_mask: np.ndarray
    river_width_px: np.ndarray
    river_incision_map: np.ndarray
    h_river: np.ndarray
    erosion_map: np.ndarray
    deposition_map: np.ndarray
    h_eroded: np.ndarray
    h_lake_adjusted: np.ndarray
    coast_mask: np.ndarray
    distance_to_coast: np.ndarray
    h_shore: np.ndarray
    metrics: HydrologyMetrics


@dataclass(frozen=True)
class DrainageState:
    flow_dir: np.ndarray
    flow_accum: np.ndarray
    sink_id_flat: np.ndarray
    outlet_raw_flat: np.ndarray
    basin_key_flat: np.ndarray
    basin_id_map: np.ndarray
    basin_size_map: np.ndarray
    endorheic_mask: np.ndarray
    ocean_outlet_points: np.ndarray


def run_hydrology(
    h_tectonic: np.ndarray,
    land_mask: np.ndarray,
    meters_per_pixel: float,
    *,
    hydrology_cfg: HydrologyConfig,
    tectonics_cfg: TectonicsConfig,
    rng: RngStream,
) -> HydrologyResult:
    """Run hydrology integration with basin capture and outlet consolidation."""

    h_base = h_tectonic.astype(np.float32, copy=True)
    h_hydro_smoothed = gaussian_smooth(h_base, hydrology_cfg.hydro_smooth_sigma_px)
    raw_noise = rng.fork("routing-noise").generator().uniform(-1.0, 1.0, size=h_base.shape).astype(np.float32)
    routing_noise = gaussian_smooth(raw_noise, 4.0) * 3.0
    h_routing_base = h_hydro_smoothed + routing_noise

    h_routing_filled = h_routing_base
    if hydrology_cfg.depression_fill_enabled:
        h_routing_filled = _priority_flood_fill(
            h_routing_base,
            land_mask,
            epsilon_m=hydrology_cfg.depression_flat_epsilon_m,
            breach_enabled=hydrology_cfg.depression_breach_enabled,
            breach_max_saddle_m=hydrology_cfg.depression_breach_max_saddle_m,
            rng=rng.fork("depression-epsilon-noise"),
        )
    h_routing_filled = _sculpt_meanders(
        h_routing_filled,
        land_mask,
        rng=rng.fork("sculpt-meanders"),
        droplet_count=50_000,
        steps=500,
        carve_m=0.02,
    )
    h_hydro_pre = h_routing_filled

    pre_state = _analyze_drainage_state(h_routing_filled, land_mask)
    h_hydro, capture_paths_mask = _integrate_drainage(
        h_routing_filled,
        land_mask,
        pre_state,
        hydrology_cfg,
        rng.fork("capture"),
    )
    post_state = _analyze_drainage_state(h_hydro, land_mask)
    validate_flow_fields(post_state.flow_accum, post_state.flow_dir, land_mask)

    basin_outlet_id, basin_id_map, basin_size_map, outlet_points, merged_count, top_10 = _merge_ocean_outlets(
        post_state,
        land_mask,
        hydrology_cfg,
    )

    flow_accum_raw = post_state.flow_accum.astype(np.float32, copy=False)
    flow_accum_norm = _normalize01(np.log1p(flow_accum_raw))

    river_mask, river_width, river_incision, h_river = extract_rivers(
        h_hydro,
        post_state.flow_dir,
        flow_accum_raw,
        flow_accum_norm,
        land_mask,
        hydrology_cfg,
    )

    lake_mask = post_state.endorheic_mask & land_mask
    h_lake_adjusted = h_hydro.astype(np.float32, copy=True)
    h_lake_adjusted[lake_mask] = np.minimum(
        h_lake_adjusted[lake_mask],
        box_blur(h_lake_adjusted, 1, passes=1)[lake_mask],
    )
    river_mask, h_lake_adjusted = enforce_downhill_river_profile(
        h_lake_adjusted,
        post_state.flow_dir,
        flow_accum_raw,
        river_mask,
        lake_mask,
    )
    assert_downhill_river_routing(h_lake_adjusted, post_state.flow_dir, river_mask)

    # Milestone 6 keeps erosional transforms minimal and hydro-topology focused.
    erosion_map = np.zeros_like(h_hydro, dtype=np.float32)
    deposition_map = np.zeros_like(h_hydro, dtype=np.float32)
    h_eroded = h_lake_adjusted.astype(np.float32, copy=True)
    h_drain = h_hydro.astype(np.float32, copy=True)

    coast_mask, distance_to_coast, h_shore = apply_shore_falloff(
        h_lake_adjusted,
        land_mask,
        tectonics_cfg.shelf_radius_px,
        hydrology_cfg,
    )

    land_pixels = int(np.count_nonzero(land_mask))
    river_pixels = int(np.count_nonzero(river_mask > 0.0))
    lake_pixels = int(np.count_nonzero(lake_mask))
    land_flow = flow_accum_raw[land_mask]
    max_flow = float(np.max(land_flow)) if land_flow.size else 0.0
    mean_flow = float(np.mean(land_flow)) if land_flow.size else 0.0
    river_length_est = float(np.sum(np.clip(river_mask > 0.0, 0.0, 1.0)))

    endo_ids = np.unique(post_state.sink_id_flat[(post_state.sink_id_flat >= 0) & post_state.endorheic_mask.ravel()])
    num_endo_basins = int(endo_ids.size)
    endo_land_ratio = float(np.count_nonzero(post_state.endorheic_mask & land_mask) / max(1, land_pixels))

    exo_ids = basin_outlet_id[land_mask]
    exo_ids = exo_ids[exo_ids > 0]
    exo_counts = np.zeros(0, dtype=np.int64)
    if exo_ids.size:
        _, exo_counts = np.unique(exo_ids, return_counts=True)
        largest_basin = int(np.max(exo_counts))
    else:
        largest_basin = 0
    largest_basin_ratio = float(largest_basin / max(1, land_pixels))

    basin_count_total = int(np.unique(basin_id_map[land_mask]).size)
    basin_count_retained = num_endo_basins
    percent_endo = float(100.0 * basin_count_retained / max(1, basin_count_total))

    tiny_endo_cells = 0
    endo_large_count = 0
    endo_small_count = 0
    cell_area_km2 = (float(meters_per_pixel) * float(meters_per_pixel)) / 1_000_000.0
    regional_threshold_cells = max(1, int(np.ceil(10_000.0 / max(cell_area_km2, 1e-6))))
    if num_endo_basins > 0:
        sink_sizes = []
        sink_flat = post_state.sink_id_flat.reshape(land_mask.shape)
        for sid in endo_ids:
            size = int(np.count_nonzero((sink_flat == sid) & land_mask))
            sink_sizes.append(size)
            if size >= regional_threshold_cells:
                endo_large_count += 1
            else:
                endo_small_count += 1
                tiny_endo_cells += size
        mean_lake_area = float(np.mean(sink_sizes)) if sink_sizes else 0.0
        largest_lake_area = int(max(sink_sizes)) if sink_sizes else 0
    else:
        mean_lake_area = 0.0
        largest_lake_area = 0
    lake_area_fraction = float(lake_pixels / max(1, land_pixels))

    # Basin tiers: count continental-scale exorheic watersheds above 1% of land.
    basin_1pct_threshold = max(1, int(np.ceil(land_pixels * 0.01)))
    continental_basin_count = int(np.count_nonzero(exo_counts >= basin_1pct_threshold))

    tiny_endo_area_ratio = float(tiny_endo_cells / max(1, land_pixels))

    trunk_stats = _compute_trunk_sinuosity(
        flow_dir=post_state.flow_dir,
        flow_accum=flow_accum_raw,
        land_mask=land_mask,
        min_flow_cells=hydrology_cfg.trunk_sinuosity_min_flow_cells,
    )

    p50, p90, p99, p999 = np.percentile(land_flow, [50.0, 90.0, 99.0, 99.9]) if land_flow.size else (0, 0, 0, 0)
    metrics = HydrologyMetrics(
        river_pixel_count=river_pixels,
        lake_pixel_count=lake_pixels,
        max_flow_accum=max_flow,
        mean_flow_accum=mean_flow,
        percent_endo_basins=percent_endo,
        total_river_length_estimate=river_length_est,
        basin_count_total=basin_count_total,
        basin_count_retained=basin_count_retained,
        lake_area_fraction=lake_area_fraction,
        mean_lake_area=mean_lake_area,
        largest_lake_area=largest_lake_area,
        num_ocean_outlets_raw=int(post_state.ocean_outlet_points.shape[0]),
        num_ocean_outlets_merged=int(merged_count),
        largest_basin_land_ratio=largest_basin_ratio,
        top_10_basin_sizes=tuple(int(v) for v in top_10[:10]),
        endorheic_land_ratio=endo_land_ratio,
        num_endorheic_basins=num_endo_basins,
        flow_accum_p50=float(p50),
        flow_accum_p90=float(p90),
        flow_accum_p99=float(p99),
        flow_accum_p999=float(p999),
        flow_cells_ge_10=int(np.count_nonzero(land_flow >= 10.0)),
        flow_cells_ge_100=int(np.count_nonzero(land_flow >= 100.0)),
        flow_cells_ge_1000=int(np.count_nonzero(land_flow >= 1000.0)),
        regional_endorheic_count_gt_10000km2=endo_large_count,
        continental_basin_count_gt_1pct_land=continental_basin_count,
        tiny_endorheic_basin_count_lt_10000km2=endo_small_count,
        tiny_endorheic_area_ratio_lt_10000km2=tiny_endo_area_ratio,
        trunk_sinuosity_segment_count=trunk_stats[0],
        trunk_sinuosity_median=trunk_stats[1],
        trunk_sinuosity_p90=trunk_stats[2],
    )

    lake_size_map = _normalize01(basin_size_map * lake_mask.astype(np.float32))
    lake_retention_map = lake_mask.astype(np.float32)

    return HydrologyResult(
        h_base=h_base,
        h_hydro_pre=h_hydro_pre,
        h_hydro=h_hydro,
        flow_dir=post_state.flow_dir,
        flow_accum_raw=flow_accum_raw,
        flow_accum_norm=flow_accum_norm,
        basin_outlet_id=basin_outlet_id.astype(np.int32),
        outlet_points=outlet_points.astype(np.int32),
        endorheic_mask=post_state.endorheic_mask,
        capture_paths_mask=capture_paths_mask,
        basin_mask=post_state.endorheic_mask.copy(),
        basin_id_map=basin_id_map.astype(np.int32),
        basin_size_map=basin_size_map.astype(np.float32),
        lake_size_map=lake_size_map.astype(np.float32),
        lake_retention_map=lake_retention_map.astype(np.float32),
        lake_mask=lake_mask,
        h_drain=h_drain,
        river_mask=river_mask.astype(np.float32),
        river_width_px=river_width.astype(np.float32),
        river_incision_map=river_incision.astype(np.float32),
        h_river=h_river.astype(np.float32),
        erosion_map=erosion_map,
        deposition_map=deposition_map,
        h_eroded=h_eroded.astype(np.float32),
        h_lake_adjusted=h_lake_adjusted.astype(np.float32),
        coast_mask=coast_mask,
        distance_to_coast=distance_to_coast.astype(np.float32),
        h_shore=h_shore.astype(np.float32),
        metrics=metrics,
    )


def gaussian_smooth(height: np.ndarray, sigma_px: float) -> np.ndarray:
    radius = max(1, int(round(max(0.5, sigma_px) * 1.5)))
    return box_blur(height.astype(np.float32), radius, passes=3)


def _sculpt_meanders(
    height: np.ndarray,
    land_mask: np.ndarray,
    *,
    rng: RngStream,
    droplet_count: int,
    steps: int,
    carve_m: float,
) -> np.ndarray:
    if droplet_count <= 0 or steps <= 0 or carve_m <= 0.0:
        return height.astype(np.float32, copy=True)
    if not np.any(land_mask):
        return height.astype(np.float32, copy=True)

    h = height.astype(np.float32, copy=True)
    gh, gw = h.shape
    gen = rng.generator()

    land_idx = np.flatnonzero(land_mask.ravel())
    land_elev = h.ravel()[land_idx]
    elev_base = np.clip(land_elev - float(np.min(land_elev)), 0.0, None) + 1.0
    spawn_w = np.power(elev_base, 2.0, dtype=np.float64)
    spawn_w /= np.sum(spawn_w)

    high_cut = float(np.percentile(land_elev, 70.0))
    high_sel = land_idx[land_elev >= high_cut]
    if high_sel.size == 0:
        high_sel = land_idx
    high_elev = h.ravel()[high_sel]
    high_base = np.clip(high_elev - float(np.min(high_elev)), 0.0, None) + 1.0
    high_w = np.power(high_base, 2.0, dtype=np.float64)
    high_w /= np.sum(high_w)

    start_flat = gen.choice(land_idx, size=int(droplet_count), replace=True, p=spawn_w)
    pos_y = (start_flat // gw).astype(np.int32)
    pos_x = (start_flat % gw).astype(np.int32)
    vel_y = np.zeros(int(droplet_count), dtype=np.float32)
    vel_x = np.zeros(int(droplet_count), dtype=np.float32)

    dir_y = np.array([-1, 1, 0, 0, -1, -1, 1, 1], dtype=np.int32)
    dir_x = np.array([0, 0, 1, -1, 1, -1, 1, -1], dtype=np.int32)
    dir_len = np.array([1.0, 1.0, 1.0, 1.0, _SQRT2, _SQRT2, _SQRT2, _SQRT2], dtype=np.float32)
    dir_y_u = (dir_y.astype(np.float32) / dir_len)[:, None]
    dir_x_u = (dir_x.astype(np.float32) / dir_len)[:, None]
    dir_y_f = dir_y.astype(np.float32)[:, None]
    dir_x_f = dir_x.astype(np.float32)[:, None]

    for _ in range(int(steps)):
        cur_h = h[pos_y, pos_x]

        ny = pos_y[None, :] + dir_y[:, None]
        nx = pos_x[None, :] + dir_x[:, None]
        in_bounds = (ny >= 0) & (ny < gh) & (nx >= 0) & (nx < gw)
        nyc = np.clip(ny, 0, gh - 1)
        nxc = np.clip(nx, 0, gw - 1)

        nh = h[nyc, nxc]
        n_land = land_mask[nyc, nxc]
        drop = cur_h[None, :] - nh
        downhill = in_bounds & n_land & (drop > 0.0)

        downhill_drop = np.where(downhill, drop, 0.0).astype(np.float32)
        drop_sum = np.sum(downhill_drop, axis=0)
        inv_sum = np.zeros_like(drop_sum, dtype=np.float32)
        has_drop = drop_sum > 0.0
        inv_sum[has_drop] = 1.0 / drop_sum[has_drop]
        g_y = (np.sum(downhill_drop * dir_y_f, axis=0) * inv_sum).astype(np.float32)
        g_x = (np.sum(downhill_drop * dir_x_f, axis=0) * inv_sum).astype(np.float32)

        vel_y = vel_y * 0.7 + g_y * 0.3
        vel_x = vel_x * 0.7 + g_x * 0.3

        align = vel_y[None, :] * dir_y_u + vel_x[None, :] * dir_x_u
        score = np.where(downhill, align, -1e20)
        best_idx = np.argmax(score, axis=0).astype(np.int32)
        droplet_idx = np.arange(int(droplet_count), dtype=np.int32)

        next_y = nyc[best_idx, droplet_idx]
        next_x = nxc[best_idx, droplet_idx]
        no_downhill = ~np.any(downhill, axis=0)
        ocean_or_sink = no_downhill | (~land_mask[next_y, next_x]) | (h[next_y, next_x] <= 0.0)

        moving = ~ocean_or_sink
        if np.any(moving):
            my = next_y[moving]
            mx = next_x[moving]
            np.add.at(h, (my, mx), -float(carve_m))
            pos_y[moving] = my
            pos_x[moving] = mx

        if np.any(ocean_or_sink):
            respawn_n = int(np.count_nonzero(ocean_or_sink))
            respawn_flat = gen.choice(high_sel, size=respawn_n, replace=True, p=high_w)
            pos_y[ocean_or_sink] = (respawn_flat // gw).astype(np.int32)
            pos_x[ocean_or_sink] = (respawn_flat % gw).astype(np.int32)
            vel_y[ocean_or_sink] = 0.0
            vel_x[ocean_or_sink] = 0.0

    return h


def _priority_flood_fill(
    height: np.ndarray,
    land_mask: np.ndarray,
    *,
    epsilon_m: float,
    breach_enabled: bool,
    breach_max_saddle_m: float,
    rng: RngStream,
) -> np.ndarray:
    """Deterministic priority-flood depression conditioning for land cells."""

    if not np.any(land_mask):
        return height.astype(np.float32, copy=True)

    h, w = height.shape
    filled = height.astype(np.float32, copy=True)
    original = filled.copy()
    land_flat = land_mask.ravel()
    visited = np.zeros(h * w, dtype=bool)
    parent_flat = np.full(h * w, -1, dtype=np.int32)
    pop_order: list[int] = []

    edge = np.zeros((h, w), dtype=bool)
    edge[0, :] = True
    edge[-1, :] = True
    edge[:, 0] = True
    edge[:, -1] = True
    seeds = land_mask & (_coast_mask(land_mask) | edge)
    seed_idx = np.flatnonzero(seeds.ravel())
    if seed_idx.size == 0:
        land_idx = np.flatnonzero(land_flat)
        seed_idx = np.array([int(land_idx[int(np.argmin(filled.ravel()[land_idx]))])], dtype=np.int64)

    heap: list[tuple[float, int]] = []
    for idx in seed_idx:
        i = int(idx)
        if visited[i]:
            continue
        visited[i] = True
        heapq.heappush(heap, (float(filled.ravel()[i]), i))

    eps = max(float(epsilon_m), 0.0)
    while heap:
        cur_h, flat = heapq.heappop(heap)
        pop_order.append(int(flat))
        y = flat // w
        x = flat - y * w
        for dy, dx in _DIRECTIONS_8:
            ny = y + dy
            nx = x + dx
            if ny < 0 or ny >= h or nx < 0 or nx >= w:
                continue
            nflat = int(ny * w + nx)
            if visited[nflat] or (not land_flat[nflat]):
                continue
            visited[nflat] = True
            nval = float(filled[ny, nx])
            if nval <= cur_h:
                next_h = cur_h + eps
                filled[ny, nx] = np.float32(next_h)
            else:
                next_h = nval
            parent_flat[nflat] = int(flat)
            heapq.heappush(heap, (next_h, nflat))

    if breach_enabled and breach_max_saddle_m > 0.0:
        delta = np.clip(filled - original, 0.0, None)
        shallow = land_mask & (delta > 0.0) & (delta <= float(breach_max_saddle_m))
        if np.any(shallow):
            ratio = np.clip(delta / float(breach_max_saddle_m), 0.0, 1.0)
            relaxed = original + delta * ratio
            if eps > 0.0:
                relaxed = np.maximum(relaxed, original + eps)
            filled[shallow] = relaxed[shallow]

    raised_mask = land_mask & (filled > original + 1e-9)
    if eps > 0.0 and np.any(raised_mask):
        # Deterministic high-frequency perturbation seeded from the canonical seed stream.
        micro_seed = int(
            rng.fork("epsilon-micro-seed").generator().integers(0, np.iinfo(np.int64).max, dtype=np.int64)
        )
        noise_rng = np.random.default_rng(micro_seed)
        noise_hf = noise_rng.uniform(-1.0, 1.0, size=filled.shape).astype(np.float32)
        epsilon_micro = float(max(0.0, min(eps * 0.48, 0.02)))

        filled[raised_mask] = filled[raised_mask] + noise_hf[raised_mask] * epsilon_micro

        # Preserve a strict downstream drop along the flood parent relation to avoid new sinks.
        min_drop = max(eps - 2.0 * epsilon_micro, 1e-6)
        filled_flat = filled.ravel()
        raised_flat = raised_mask.ravel()
        for flat in pop_order:
            idx = int(flat)
            if not raised_flat[idx]:
                continue
            parent = int(parent_flat[idx])
            if parent < 0:
                continue
            required = filled_flat[parent] + min_drop
            if filled_flat[idx] < required:
                filled_flat[idx] = required

    filled[land_mask] = np.maximum(filled[land_mask], original[land_mask])
    return filled.astype(np.float32)


def _compute_trunk_sinuosity(
    *,
    flow_dir: np.ndarray,
    flow_accum: np.ndarray,
    land_mask: np.ndarray,
    min_flow_cells: float,
) -> tuple[int, float, float]:
    trunk = land_mask & (flow_dir >= 0) & (flow_accum >= float(min_flow_cells))
    if not np.any(trunk):
        return 0, 0.0, 0.0

    h, w = flow_dir.shape
    size = h * w
    trunk_flat = trunk.ravel()
    dir_flat = flow_dir.ravel()
    dest_flat = _flow_dest_from_dir(flow_dir)

    src = np.flatnonzero(trunk_flat)
    dst = dest_flat[src]
    valid = (dst >= 0) & trunk_flat[dst]

    up_count = np.zeros(size, dtype=np.int32)
    np.add.at(up_count, dst[valid], 1)

    starts = src[valid & (up_count[src] != 1)]
    sinuosity: list[float] = []

    for start in starts:
        start_i = int(start)
        curr = start_i
        steps = 0
        path_len = 0.0
        while True:
            dir_idx = int(dir_flat[curr])
            nxt = int(dest_flat[curr])
            if dir_idx < 0 or nxt < 0 or (not trunk_flat[nxt]):
                break
            path_len += _flow_step_length(dir_idx)
            steps += 1
            curr = nxt
            if up_count[curr] != 1:
                break

        if steps < 2 or curr == start_i:
            continue
        y0, x0 = divmod(start_i, w)
        y1, x1 = divmod(curr, w)
        euclid = float(np.hypot(float(y1 - y0), float(x1 - x0)))
        if euclid <= 1e-6:
            continue
        sinuosity.append(path_len / euclid)

    if not sinuosity:
        return 0, 0.0, 0.0
    sinuosity_arr = np.array(sinuosity, dtype=np.float32)
    return int(sinuosity_arr.size), float(np.median(sinuosity_arr)), float(np.percentile(sinuosity_arr, 90.0))


def _flow_step_length(dir_idx: int) -> float:
    if dir_idx < 0:
        return 0.0
    return _SQRT2 if dir_idx >= 4 else 1.0


def compute_flow_d8(
    height: np.ndarray,
    ocean_mask: np.ndarray,
    *,
    with_accumulation: bool = True,
) -> tuple[np.ndarray, np.ndarray]:
    h, w = height.shape
    size = h * w

    best_drop = np.zeros((h, w), dtype=np.float32)
    flow_dir = np.full((h, w), -1, dtype=np.int8)
    dest_flat = np.full((h, w), -1, dtype=np.int32)

    for idx, (dy, dx) in enumerate(_DIRECTIONS_8):
        nh = _shift_float(height, dy, dx, fill=np.inf)
        drop = height - nh
        better = drop > best_drop
        best_drop[better] = drop[better]
        flow_dir[better] = idx

        flat_idx = _shift_index_grid(h, w, dy, dx)
        dest_flat[better] = flat_idx[better]

    flow_dir[ocean_mask] = -1
    dest_flat[ocean_mask] = -1

    no_down = best_drop <= 0.0
    flow_dir[no_down] = -1
    dest_flat[no_down] = -1

    if not with_accumulation:
        return flow_dir, np.zeros((h, w), dtype=np.float32)

    elev_flat = height.ravel()
    order = np.argsort(elev_flat)[::-1]
    accum = np.ones(size, dtype=np.float32)
    dest1d = dest_flat.ravel()

    for src in order:
        dst = int(dest1d[src])
        if dst >= 0:
            accum[dst] += accum[src]

    return flow_dir, accum.reshape((h, w)).astype(np.float32)


def _analyze_drainage_state(
    height: np.ndarray,
    land_mask: np.ndarray,
    *,
    routing_height: np.ndarray | None = None,
) -> DrainageState:
    ocean_mask = ~land_mask
    route_h = height if routing_height is None else routing_height
    if route_h.shape != height.shape:
        raise ValueError("routing_height shape mismatch")
    flow_dir, flow_accum = compute_flow_d8(route_h, ocean_mask, with_accumulation=True)
    flow_accum = flow_accum.astype(np.float32, copy=False)
    flow_accum[ocean_mask] = 0.0

    h, w = height.shape
    size = h * w
    elev_flat = route_h.ravel()
    land_flat = land_mask.ravel()
    ocean_flat = ocean_mask.ravel()
    dest_flat = _flow_dest_from_dir(flow_dir)

    sink_id_flat = np.full(size, -1, dtype=np.int32)
    outlet_raw_flat = np.full(size, -1, dtype=np.int32)
    order = np.argsort(elev_flat)

    for flat_idx in order:
        idx = int(flat_idx)
        if not land_flat[idx]:
            continue
        dst = int(dest_flat[idx])
        if dst < 0:
            sink_id_flat[idx] = idx
            outlet_raw_flat[idx] = -1
            continue
        if ocean_flat[dst] or (not land_flat[dst]):
            outlet_raw_flat[idx] = dst
            sink_id_flat[idx] = -1
            continue
        downstream_outlet = int(outlet_raw_flat[dst])
        if downstream_outlet >= 0:
            outlet_raw_flat[idx] = downstream_outlet
            sink_id_flat[idx] = -1
        else:
            sink_id_flat[idx] = int(sink_id_flat[dst]) if sink_id_flat[dst] >= 0 else dst
            outlet_raw_flat[idx] = -1

    basin_key_flat = np.where(outlet_raw_flat >= 0, outlet_raw_flat, -(sink_id_flat + 1)).astype(np.int64)
    basin_key_flat[~land_flat] = 0

    basin_id_map = np.full((h, w), -1, dtype=np.int32)
    basin_size_map = np.zeros((h, w), dtype=np.float32)
    land_idx = np.flatnonzero(land_flat)
    if land_idx.size:
        keys = basin_key_flat[land_idx]
        unique_keys, inverse = np.unique(keys, return_inverse=True)
        basin_ids = inverse.astype(np.int32) + 1
        basin_id_map.ravel()[land_idx] = basin_ids
        counts = np.bincount(inverse)
        basin_size_map.ravel()[land_idx] = counts[inverse].astype(np.float32)
        basin_size_map = _normalize01(np.log1p(basin_size_map))

    endorheic_mask = (sink_id_flat.reshape((h, w)) >= 0) & land_mask
    raw_outlets = np.unique(outlet_raw_flat[(outlet_raw_flat >= 0) & land_flat])
    if raw_outlets.size:
        oy = (raw_outlets // w).astype(np.int32)
        ox = (raw_outlets % w).astype(np.int32)
        ocean_outlet_points = np.stack((oy, ox), axis=1)
    else:
        ocean_outlet_points = np.zeros((0, 2), dtype=np.int32)

    return DrainageState(
        flow_dir=flow_dir,
        flow_accum=flow_accum,
        sink_id_flat=sink_id_flat,
        outlet_raw_flat=outlet_raw_flat,
        basin_key_flat=basin_key_flat.astype(np.int64),
        basin_id_map=basin_id_map,
        basin_size_map=basin_size_map,
        endorheic_mask=endorheic_mask,
        ocean_outlet_points=ocean_outlet_points,
    )


def _integrate_drainage(
    h_hydro_pre: np.ndarray,
    land_mask: np.ndarray,
    state: DrainageState,
    cfg: HydrologyConfig,
    rng: RngStream,
) -> tuple[np.ndarray, np.ndarray]:
    h = h_hydro_pre.astype(np.float32, copy=True)
    capture_paths_mask = np.zeros_like(h, dtype=bool)

    lakes = float(np.clip(cfg.hydro_lakes, 0.0, 1.0))
    capture_strength = float(np.clip(cfg.hydro_capture_strength * (1.0 - 0.85 * lakes), 0.0, 1.0))
    max_sill = float(max(1.0, cfg.hydro_capture_max_sill * (1.0 - 0.75 * lakes)))
    basin_scale = 1.0 + (1.0 - lakes) * (8.0 + 12.0 * capture_strength)
    land_pixels = int(np.count_nonzero(land_mask))
    basin_limit_from_cfg = int(max(64, round(cfg.hydro_capture_min_basin_pixels * basin_scale)))
    basin_limit_from_fraction = int(
        max(
            64,
            round(
                land_pixels
                * (
                    0.02
                    + 0.22 * (1.0 - lakes) * max(0.25, capture_strength)
                )
            ),
        )
    )
    max_basin_pixels = int(max(basin_limit_from_cfg, basin_limit_from_fraction))
    max_link = int(max(16, cfg.hydro_capture_max_link_length_px))
    capture_fraction = float(np.clip(capture_strength + (1.0 - lakes) * 0.65, 0.0, 1.0))

    if capture_strength <= 0.0:
        return h, capture_paths_mask

    capture_iterations = 2
    for _ in range(capture_iterations):
        cur_state = _analyze_drainage_state(h, land_mask)
        endo_flat = cur_state.endorheic_mask.ravel()
        sink_flat = cur_state.sink_id_flat
        land_flat = land_mask.ravel()
        exo_mask = land_mask & (cur_state.outlet_raw_flat.reshape(land_mask.shape) >= 0)
        exo_idx = np.flatnonzero(exo_mask.ravel())
        if exo_idx.size == 0:
            break
        exo_outlets = cur_state.outlet_raw_flat[exo_idx]
        uniq_outlets, outlet_counts = np.unique(exo_outlets, return_counts=True)
        lookup = np.searchsorted(uniq_outlets, exo_outlets)
        exo_basin_size = outlet_counts[lookup].astype(np.float32)
        exo_priority = _normalize01(np.log1p(exo_basin_size))

        groups = _group_pixels_by_key(sink_flat, endo_flat & land_flat)
        candidates: list[tuple[float, int, np.ndarray]] = []
        width = h.shape[1]

        for _, basin_pixels in groups:
            basin_size = int(basin_pixels.size)
            if basin_size < 8 or basin_size > max_basin_pixels:
                continue

            sink_flat_idx = _pick_basin_sink(h, basin_pixels)

            target_flat, required_sill = _select_capture_target(
                h,
                sink_flat_idx,
                exo_idx,
                exo_priority,
                max_link,
                max_sill,
                width,
            )
            if target_flat < 0:
                continue

            path_flat = _line_path_flat(sink_flat_idx, target_flat, width)
            required_cut = max(required_sill, _estimate_capture_cut(h, path_flat))
            if required_cut > max_sill:
                continue
            candidates.append((float(required_cut), -basin_size, path_flat))

        if not candidates:
            break

        candidates.sort(key=lambda item: (item[0], item[1]))
        k = int(round(capture_fraction * len(candidates)))
        if capture_fraction > 0.0 and k == 0:
            k = 1
        k = min(k, len(candidates))

        for _, _, path_flat in candidates[:k]:
            _carve_capture_path(h, path_flat, max_sill)
            capture_paths_mask.ravel()[path_flat] = True

    return h.astype(np.float32), capture_paths_mask


def _merge_ocean_outlets(
    state: DrainageState,
    land_mask: np.ndarray,
    cfg: HydrologyConfig,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, int, np.ndarray]:
    h, w = land_mask.shape
    land_flat = land_mask.ravel()
    outlet_raw = state.outlet_raw_flat

    outlet_id = np.zeros((h, w), dtype=np.int32)
    raw_outlets = np.unique(outlet_raw[(outlet_raw >= 0) & land_flat])
    if raw_outlets.size == 0:
        empty_map = np.full((h, w), -1, dtype=np.int32)
        return outlet_id, empty_map, np.zeros((h, w), np.float32), np.zeros((0, 3), np.int32), 0, np.zeros(0, np.int32)

    oy = (raw_outlets // w).astype(np.int32)
    ox = (raw_outlets % w).astype(np.int32)
    labels = _cluster_points_radius(
        oy,
        ox,
        max(1, int(cfg.hydro_outlet_merge_radius_px)),
    )

    # map raw outlet index -> merged cluster id
    raw_to_merged = {int(r): int(labels[i]) for i, r in enumerate(raw_outlets)}
    land_exo = land_flat & (outlet_raw >= 0)
    out_flat = outlet_id.ravel()
    out_flat[np.flatnonzero(land_exo)] = np.array(
        [raw_to_merged[int(v)] + 1 for v in outlet_raw[land_exo]],
        dtype=np.int32,
    )

    # collapse tiny coastal basins into nearest large merged basin
    merged_ids, merged_counts = np.unique(out_flat[out_flat > 0], return_counts=True)
    if merged_ids.size:
        large_ids = merged_ids[merged_counts >= max(1, cfg.hydro_outlet_min_basin_pixels)]
        if large_ids.size:
            centers = {}
            for mid in merged_ids:
                pts = np.flatnonzero(out_flat == mid)
                py = pts // w
                px = pts % w
                centers[int(mid)] = (float(np.mean(py)), float(np.mean(px)))
            large_centers = np.array([centers[int(mid)] for mid in large_ids], dtype=np.float32)
            remap = {int(mid): int(mid) for mid in merged_ids}
            for mid, count in zip(merged_ids, merged_counts):
                if count >= cfg.hydro_outlet_min_basin_pixels:
                    continue
                cy, cx = centers[int(mid)]
                dy = large_centers[:, 0] - cy
                dx = large_centers[:, 1] - cx
                nearest = int(large_ids[int(np.argmin(dy * dy + dx * dx))])
                remap[int(mid)] = nearest
            if remap:
                pos = out_flat > 0
                out_flat[pos] = np.array([remap[int(v)] for v in out_flat[pos]], dtype=np.int32)

    # compress ids to contiguous 1..N
    final_ids = np.unique(out_flat[out_flat > 0])
    id_compact = {int(v): i + 1 for i, v in enumerate(final_ids)}
    if final_ids.size:
        pos = out_flat > 0
        out_flat[pos] = np.array([id_compact[int(v)] for v in out_flat[pos]], dtype=np.int32)

    # basin ids across exorheic + endorheic
    sink_flat = state.sink_id_flat
    basin_key = np.zeros(h * w, dtype=np.int64)
    basin_key[land_flat & (out_flat > 0)] = out_flat[land_flat & (out_flat > 0)].astype(np.int64)
    endo_land = land_flat & (out_flat <= 0) & (sink_flat >= 0)
    basin_key[endo_land] = -(sink_flat[endo_land].astype(np.int64) + 1)

    basin_id_map = np.full((h, w), -1, dtype=np.int32)
    basin_size_map = np.zeros((h, w), dtype=np.float32)
    land_idx = np.flatnonzero(land_flat)
    if land_idx.size:
        keys = basin_key[land_idx]
        uniq, inv = np.unique(keys, return_inverse=True)
        ids = inv.astype(np.int32) + 1
        basin_id_map.ravel()[land_idx] = ids
        counts = np.bincount(inv)
        basin_size_map.ravel()[land_idx] = counts[inv].astype(np.float32)
        basin_size_map = _normalize01(np.log1p(basin_size_map))

    # outlet points from compact ids
    outlet_points: list[tuple[int, int, int]] = []
    for merged_id in np.unique(out_flat[out_flat > 0]):
        pts = np.flatnonzero(out_flat == merged_id)
        if pts.size == 0:
            continue
        py = int(np.mean(pts // w))
        px = int(np.mean(pts % w))
        outlet_points.append((py, px, int(merged_id)))

    exo_sizes = []
    if final_ids.size:
        _, counts = np.unique(out_flat[out_flat > 0], return_counts=True)
        exo_sizes = sorted((int(c) for c in counts), reverse=True)
    top10 = np.array(exo_sizes[:10], dtype=np.int32)

    return (
        outlet_id,
        basin_id_map,
        basin_size_map.astype(np.float32),
        np.array(outlet_points, dtype=np.int32),
        int(final_ids.size),
        top10,
    )


def _group_pixels_by_key(keys: np.ndarray, mask: np.ndarray) -> list[tuple[int, np.ndarray]]:
    idx = np.flatnonzero(mask)
    if idx.size == 0:
        return []
    vals = keys[idx]
    order = np.argsort(vals, kind="mergesort")
    vals = vals[order]
    idx = idx[order]
    cuts = np.flatnonzero(np.diff(vals)) + 1
    groups = []
    for v, pix in zip(np.split(vals, cuts), np.split(idx, cuts)):
        groups.append((int(v[0]), pix.astype(np.int32)))
    return groups


def _pick_basin_sink(height: np.ndarray, basin_pixels: np.ndarray) -> int:
    elev = height.ravel()[basin_pixels]
    return int(basin_pixels[int(np.argmin(elev))])


def _pick_basin_boundary_source(height: np.ndarray, basin_pixels: np.ndarray, width: int) -> tuple[int, int] | None:
    h, w = height.shape
    basin_mask = np.zeros((h, w), dtype=bool)
    basin_mask.ravel()[basin_pixels] = True
    boundary = np.zeros((h, w), dtype=bool)
    for dy, dx in _DIRECTIONS_8:
        boundary |= basin_mask & ~_shift_bool(basin_mask, dy, dx)
    boundary_idx = np.flatnonzero(boundary.ravel())
    if boundary_idx.size == 0:
        return None
    elev = height.ravel()[boundary_idx]
    src = int(boundary_idx[int(np.argmin(elev))])
    return src // width, src % width


def _select_capture_target(
    height: np.ndarray,
    src_flat: int,
    exo_idx: np.ndarray,
    exo_priority: np.ndarray,
    max_link: int,
    max_sill: float,
    width: int,
) -> tuple[int, float]:
    h, w = height.shape
    src_y, src_x = divmod(src_flat, width)
    src_elev = float(height.ravel()[src_flat])

    exo_y = exo_idx // width
    exo_x = exo_idx % width
    dy = exo_y - src_y
    dx = exo_x - src_x
    dist2 = dy.astype(np.float32) * dy.astype(np.float32) + dx.astype(np.float32) * dx.astype(np.float32)
    in_range = dist2 <= float(max_link * max_link)
    if not np.any(in_range):
        return -1, np.inf

    cand_idx = exo_idx[in_range]
    cand_priority = exo_priority[in_range]
    cand_dist = np.sqrt(dist2[in_range])
    cand_elev = height.ravel()[cand_idx].astype(np.float32)
    sill = np.maximum(0.0, cand_elev - src_elev)
    lower_target = cand_elev <= (src_elev - 0.01)
    valid = (sill <= max_sill) & lower_target
    if not np.any(valid):
        return -1, np.inf

    cand_idx = cand_idx[valid]
    cand_priority = cand_priority[valid]
    cand_dist = cand_dist[valid]
    sill = sill[valid]
    cost = sill + 0.02 * cand_dist - 0.35 * cand_priority
    k = int(np.argmin(cost))
    return int(cand_idx[k]), float(sill[k])


def _find_adjacent_exorheic_breach(
    height: np.ndarray,
    basin_pixels: np.ndarray,
    exo_flat_mask: np.ndarray,
    width: int,
    max_sill: float,
) -> tuple[int, int, float] | None:
    h, w = height.shape
    basin_mask = np.zeros((h, w), dtype=bool)
    basin_mask.ravel()[basin_pixels] = True
    y = basin_pixels // width
    x = basin_pixels % width

    elev_flat = height.ravel()
    best: tuple[float, int, int] | None = None

    for dy, dx in _DIRECTIONS_8:
        ny = y + dy
        nx = x + dx
        valid = (ny >= 0) & (ny < h) & (nx >= 0) & (nx < w)
        if not np.any(valid):
            continue
        src = basin_pixels[valid]
        dst = (ny[valid] * w + nx[valid]).astype(np.int32)
        outside = ~basin_mask.ravel()[dst]
        if not np.any(outside):
            continue
        src = src[outside]
        dst = dst[outside]
        exo = exo_flat_mask[dst]
        if not np.any(exo):
            continue
        src = src[exo]
        dst = dst[exo]
        sill = np.maximum(0.0, elev_flat[dst] - elev_flat[src])
        ok = sill <= max_sill
        if not np.any(ok):
            continue
        src = src[ok]
        dst = dst[ok]
        sill = sill[ok]
        i = int(np.argmin(sill))
        cand = (float(sill[i]), int(src[i]), int(dst[i]))
        if best is None or cand < best:
            best = cand

    if best is None:
        return None
    return best[1], best[2], best[0]


def _carve_capture_path(height: np.ndarray, path_flat: np.ndarray, max_sill: float) -> None:
    if path_flat.size < 2:
        return
    vals = height.ravel()[path_flat].astype(np.float32, copy=False)
    carved = _capture_profile(vals)
    cut = vals - carved
    if float(np.max(cut)) > float(max_sill):
        return
    height.ravel()[path_flat] = carved


def _capture_profile(vals: np.ndarray) -> np.ndarray:
    if vals.size < 2:
        return vals.astype(np.float32, copy=True)
    start = float(vals[0])
    end = float(vals[-1])
    if end < start - 0.005:
        target_end = end
    else:
        target_end = start - 0.02
    profile = np.linspace(start, target_end, vals.size, dtype=np.float32)
    carved = np.minimum(vals, profile)
    return np.minimum.accumulate(carved).astype(np.float32, copy=False)


def _estimate_capture_cut(height: np.ndarray, path_flat: np.ndarray) -> float:
    if path_flat.size < 2:
        return 0.0
    vals = height.ravel()[path_flat].astype(np.float32, copy=False)
    carved = _capture_profile(vals)
    return float(np.max(vals - carved))


def _line_path_flat(src_flat: int, dst_flat: int, width: int) -> np.ndarray:
    if src_flat == dst_flat:
        return np.array([int(src_flat)], dtype=np.int32)
    y0, x0 = divmod(int(src_flat), width)
    y1, x1 = divmod(int(dst_flat), width)
    yy, xx = _line_indices(y0, x0, y1, x1)
    return (yy * width + xx).astype(np.int32)


def _concat_path_flats(path_a: np.ndarray, path_b: np.ndarray) -> np.ndarray:
    if path_a.size == 0:
        return path_b.astype(np.int32, copy=False)
    if path_b.size == 0:
        return path_a.astype(np.int32, copy=False)
    if int(path_a[-1]) == int(path_b[0]):
        merged = np.concatenate((path_a, path_b[1:]))
    else:
        merged = np.concatenate((path_a, path_b))
    if merged.size <= 1:
        return merged.astype(np.int32, copy=False)
    dedup = np.empty_like(merged)
    dedup[0] = merged[0]
    n = 1
    for i in range(1, merged.size):
        if merged[i] != dedup[n - 1]:
            dedup[n] = merged[i]
            n += 1
    return dedup[:n].astype(np.int32, copy=False)


def _cluster_points_radius(y: np.ndarray, x: np.ndarray, radius: int) -> np.ndarray:
    n = int(y.size)
    if n == 0:
        return np.zeros(0, dtype=np.int32)
    r = max(1, int(radius))
    keys = np.stack((y // r, x // r), axis=1)
    _, inv = np.unique(keys, axis=0, return_inverse=True)
    return inv.astype(np.int32)


def analyze_depressions(
    h_hydro: np.ndarray,
    land_mask: np.ndarray,
    flow_dir_pre: np.ndarray,
    cfg: HydrologyConfig,
) -> tuple[list[BasinRecord], np.ndarray, np.ndarray, np.ndarray]:
    sinks = (flow_dir_pre < 0) & land_mask
    if not np.any(sinks):
        shape = h_hydro.shape
        return [], np.zeros(shape, bool), np.full(shape, -1, np.int32), np.zeros(shape, np.float32)

    h, w = h_hydro.shape
    size = h * w
    elev_flat = h_hydro.ravel()
    land_flat = land_mask.ravel()

    sink_components = _connected_components(sinks)
    sink_component_flat = np.full(size, -1, dtype=np.int32)
    sink_seed_flat: dict[int, int] = {}

    for comp_id, comp in enumerate(sink_components):
        sink_component_flat[comp] = comp_id
        comp_elev = elev_flat[comp]
        seed_flat = int(comp[int(np.argmin(comp_elev))])
        sink_seed_flat[comp_id] = seed_flat

    flow_dest_flat = _flow_dest_from_dir(flow_dir_pre)
    sink_catchment_flat = _assign_sink_catchments(
        elev_flat,
        land_flat,
        sink_component_flat,
        flow_dest_flat,
    )

    grouped = _group_pixels_by_basin_id(sink_catchment_flat)
    if len(grouped) > 2400:
        grouped = sorted(grouped, key=lambda item: item[1].size, reverse=True)[:2400]
        grouped = sorted(grouped, key=lambda item: item[0])

    basin_mask = np.zeros((h, w), dtype=bool)
    basin_id_map = np.full((h, w), -1, dtype=np.int32)
    basin_size_map = np.zeros((h, w), dtype=np.float32)
    basins: list[BasinRecord] = []
    next_basin_id = 0

    for sink_id, basin_pixels in grouped:
        if basin_pixels.size < 3:
            continue
        seed_flat = sink_seed_flat.get(sink_id)
        if seed_flat is None:
            continue

        spill = _find_basin_spill(
            h_hydro,
            sink_catchment_flat,
            sink_id,
            basin_pixels,
            seed_flat,
            cfg,
        )
        if spill is None:
            continue

        spill_y, spill_x, spill_level = spill
        region = _flood_region_to_spill(
            h_hydro,
            sink_catchment_flat,
            sink_id,
            basin_pixels,
            seed_flat,
            spill_level,
        )
        if region.size == 0:
            continue

        values = elev_flat[region]
        depths = np.clip(spill_level - values, 0.0, None)
        area = int(region.size)
        volume = float(np.sum(depths))
        max_depth = float(np.max(depths)) if depths.size else 0.0

        if area < 3 or volume < 1e-3:
            continue

        ry = region // w
        rx = region % w
        basin_mask[ry, rx] = True
        basin_id_map[ry, rx] = next_basin_id
        basin_size_map[ry, rx] = float(area)

        sy, sx = divmod(seed_flat, w)
        basins.append(
            BasinRecord(
                basin_id=next_basin_id,
                seed_y=int(sy),
                seed_x=int(sx),
                spill_y=int(spill_y),
                spill_x=int(spill_x),
                spill_elevation=float(spill_level),
                area_to_spill=area,
                volume_to_spill=volume,
                max_depth_to_spill=max_depth,
                flat_indices=region.astype(np.int32),
            )
        )
        next_basin_id += 1

    if next_basin_id == 0:
        occupied = np.zeros(size, dtype=bool)
        for sink_id in sorted(sink_seed_flat):
            seed_flat = sink_seed_flat[sink_id]
            sy, sx = divmod(seed_flat, w)
            spill = _find_local_spill_ring(
                h_hydro,
                sy,
                sx,
                cfg.breach_search_radius_px,
                cfg.breach_slope_bias,
            )
            if spill is None:
                continue
            spill_y, spill_x, spill_level = spill
            region = _flood_local_region_to_spill(
                h_hydro,
                land_mask,
                sy,
                sx,
                spill_level,
                cfg.breach_search_radius_px,
            )
            if region.size < 3:
                continue
            overlap = np.mean(occupied[region]) if region.size else 0.0
            if overlap > 0.4:
                continue

            values = elev_flat[region]
            depths = np.clip(spill_level - values, 0.0, None)
            area = int(region.size)
            volume = float(np.sum(depths))
            max_depth = float(np.max(depths)) if depths.size else 0.0
            if volume < 1e-3:
                continue

            ry = region // w
            rx = region % w
            occupied[region] = True
            basin_mask[ry, rx] = True
            basin_id_map[ry, rx] = next_basin_id
            basin_size_map[ry, rx] = float(area)

            basins.append(
                BasinRecord(
                    basin_id=next_basin_id,
                    seed_y=int(sy),
                    seed_x=int(sx),
                    spill_y=int(spill_y),
                    spill_x=int(spill_x),
                    spill_elevation=float(spill_level),
                    area_to_spill=area,
                    volume_to_spill=volume,
                    max_depth_to_spill=max_depth,
                    flat_indices=region.astype(np.int32),
                )
            )
            next_basin_id += 1

    basin_size_map = _normalize01(np.log1p(basin_size_map))
    return basins, basin_mask, basin_id_map, basin_size_map


def decide_basin_retention(basins: list[BasinRecord], lake_encouragement: float, rng: RngStream) -> np.ndarray:
    if not basins:
        return np.zeros(0, dtype=bool)

    volumes = np.array([b.volume_to_spill for b in basins], dtype=np.float64)
    scores = np.log1p(np.clip(volumes, 0.0, None))
    mu = float(np.median(scores))
    sigma = float(np.std(scores))
    sigma = max(sigma, 1e-3)

    logits = (scores - mu) / sigma
    logits -= (1.0 - float(np.clip(lake_encouragement, 0.0, 1.0))) * 0.9
    sigmoid = 1.0 / (1.0 + np.exp(-logits))
    p_keep = sigmoid * float(np.clip(lake_encouragement, 0.0, 1.0))

    roll = rng.generator().random(len(basins))
    return (roll < p_keep).astype(bool)


def apply_basin_decisions(
    h_hydro: np.ndarray,
    basins: list[BasinRecord],
    retained_flags: np.ndarray,
    cfg: HydrologyConfig,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    h = h_hydro.astype(np.float32, copy=True)
    lake_seed_mask = np.zeros_like(h, dtype=bool)
    lake_size_map = np.zeros_like(h, dtype=np.float32)
    lake_retention_map = np.zeros_like(h, dtype=np.float32)

    w = h.shape[1]

    for basin, keep in zip(basins, retained_flags):
        yy = basin.flat_indices // w
        xx = basin.flat_indices % w

        if keep:
            h[yy, xx] = basin.spill_elevation

            lake_seed_mask[yy, xx] = True
            lake_size_map[yy, xx] = float(basin.area_to_spill)
            lake_retention_map[yy, xx] = 1.0
            _ensure_lake_outflow(h, basin)
        else:
            _carve_breach_channel(
                h,
                basin.seed_y,
                basin.seed_x,
                basin.spill_y,
                basin.spill_x,
                float(h_hydro[basin.seed_y, basin.seed_x]),
                basin.spill_elevation,
                float(np.clip((1.0 - cfg.lake_encouragement), 0.0, 1.0)),
            )

    return h, lake_seed_mask, _normalize01(lake_size_map), lake_retention_map


def extract_rivers(
    h_drain: np.ndarray,
    flow_dir: np.ndarray,
    flow_accum_raw: np.ndarray,
    flow_accum_norm: np.ndarray,
    land_mask: np.ndarray,
    cfg: HydrologyConfig,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    freq = float(np.clip(cfg.river_frequency, 0.0, 1.0))
    log_flow = np.log1p(np.clip(flow_accum_raw.astype(np.float32), 0.0, None))
    flow_metric = _normalize01(log_flow) * land_mask.astype(np.float32)

    land_vals = flow_metric[land_mask]
    if land_vals.size == 0:
        empty = np.zeros_like(h_drain, dtype=np.float32)
        return empty, empty, empty, h_drain.astype(np.float32, copy=True)

    high_q = np.clip(99.1 - 4.0 * freq - 220.0 * cfg.river_accum_threshold_base, 90.0, 99.8)
    low_q = max(75.0, high_q - _lerp(6.0, 11.0, freq))
    t_high = float(np.percentile(land_vals, high_q))
    t_low = float(np.percentile(land_vals, low_q))

    local_bg = box_blur(flow_metric, 2, passes=1)
    channelness = np.clip(flow_metric - local_bg, 0.0, None)
    ch_vals = channelness[land_mask]
    ch_q = np.clip(78.0 - 24.0 * freq, 50.0, 88.0)
    ch_t = float(np.percentile(ch_vals, ch_q)) if ch_vals.size else 0.0

    core = (flow_metric >= t_high) & (channelness >= ch_t * 1.08) & land_mask
    support = (flow_metric >= t_low) & (channelness >= ch_t) & land_mask
    connected = _flow_connected_support(core, support, flow_dir, flow_accum_raw)

    width = cfg.river_max_width_px * np.power(
        np.clip(flow_metric, 0.0, 1.0),
        max(0.25, cfg.river_width_power * 0.9),
    )
    min_width = np.where(
        connected,
        np.minimum(0.55, cfg.river_max_width_px * 0.09),
        0.0,
    ).astype(np.float32)
    width = np.maximum(width, min_width) * connected.astype(np.float32)

    incision = cfg.river_max_incision_m * np.clip(flow_metric, 0.0, 1.0)
    width_factor = np.clip(width / max(cfg.river_max_width_px, 1e-6), 0.0, 1.0)
    incision_map = incision * width_factor * connected.astype(np.float32)
    incision_map = box_blur(incision_map, 1, passes=1)

    h_river = h_drain - incision_map
    return width.astype(np.float32), width.astype(np.float32), incision_map.astype(np.float32), h_river.astype(np.float32)


def stream_power_erosion(
    h_river: np.ndarray,
    flow_accum_norm: np.ndarray,
    land_mask: np.ndarray,
    cfg: HydrologyConfig,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    h = h_river.astype(np.float32, copy=True)
    erosion_map = np.zeros_like(h, dtype=np.float32)

    for _ in range(max(0, cfg.erosion_iterations)):
        gy, gx = np.gradient(h)
        slope = np.clip(np.hypot(gx, gy), 0.0, None)

        erosion = (
            cfg.erosion_stream_power_k
            * np.power(np.clip(flow_accum_norm, 0.0, 1.0), cfg.erosion_stream_power_m)
            * np.power(np.clip(slope, 0.0, None), cfg.erosion_stream_power_n)
            * 60.0
        )
        erosion *= land_mask.astype(np.float32)

        h -= erosion
        erosion_map += erosion

        lap = _laplacian(h)
        h += cfg.erosion_diffusion_strength * lap * land_mask.astype(np.float32)

    deposition = box_blur(erosion_map, 1, passes=1) * 0.35
    return erosion_map.astype(np.float32), deposition.astype(np.float32), h.astype(np.float32)


def apply_lakes_post_erosion(
    h_eroded: np.ndarray,
    basins: list[BasinRecord],
    retained_flags: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    h = h_eroded.astype(np.float32, copy=True)
    lake_mask = np.zeros_like(h, dtype=bool)
    w = h.shape[1]

    for basin, keep in zip(basins, retained_flags):
        if not keep:
            continue
        yy = basin.flat_indices // w
        xx = basin.flat_indices % w
        lake_mask[yy, xx] = True
        h[yy, xx] = basin.spill_elevation
        _ensure_lake_outflow(h, basin)

    return lake_mask, h


def apply_shore_falloff(
    height: np.ndarray,
    land_mask: np.ndarray,
    shelf_radius_px: int,
    cfg: HydrologyConfig,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    coast = _coast_mask(land_mask)
    max_dist = max(16, int(shelf_radius_px * 4))
    dist = _distance_to_mask(coast, max_dist)

    denom = max(float(shelf_radius_px), 1.0)
    delta = cfg.shore_falloff_strength_m * np.exp(-np.power(np.clip(dist / denom, 0.0, None), cfg.shore_falloff_power))
    delta *= land_mask.astype(np.float32)

    shaped = height.astype(np.float32, copy=True)
    shaped -= delta
    return coast, dist.astype(np.float32), shaped.astype(np.float32)


def validate_flow_fields(flow_accum: np.ndarray, flow_dir: np.ndarray, land_mask: np.ndarray) -> None:
    if np.isnan(flow_accum).any():
        raise ValueError("flow_accum contains NaN")
    if np.any(flow_accum < 0.0):
        raise ValueError("flow_accum has negative values")

    land = land_mask.astype(bool)
    if np.any(land):
        min_land = float(np.min(flow_accum[land]))
        if min_land < 1.0 - 1e-4:
            raise ValueError(f"flow_accum has land value below self-contribution: {min_land:.3f}")
        nonzero_fraction = float(np.mean(flow_accum[land] > 0.0))
        if nonzero_fraction < 0.98:
            raise ValueError(f"flow_accum nonzero fraction too low: {nonzero_fraction:.3f}")

    land_flow = flow_accum[land] if np.any(land) else flow_accum
    mean_flow = float(np.mean(land_flow))
    max_flow = float(np.max(land_flow))
    if mean_flow > 0.0 and max_flow <= (10.0 * mean_flow):
        raise ValueError("flow_accum lacks expected heavy-tail ratio")


def assert_downhill_river_routing(h_drain: np.ndarray, flow_dir: np.ndarray, river_mask: np.ndarray) -> None:
    river = river_mask > 0.0
    if not np.any(river):
        return

    for dir_idx, (dy, dx) in enumerate(_DIRECTIONS_8):
        region = river & (flow_dir == dir_idx)
        if not np.any(region):
            continue

        downstream = _shift_float(h_drain, dy, dx, fill=np.inf)
        slope_ok = (h_drain - downstream) >= -1e-4
        if not np.all(slope_ok[region]):
            raise ValueError("Detected uphill river routing after lake handling")


def enforce_downhill_river_profile(
    height: np.ndarray,
    flow_dir: np.ndarray,
    flow_accum_raw: np.ndarray,
    river_mask: np.ndarray,
    lake_mask: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    adjusted_mask = river_mask.astype(np.float32, copy=True)
    adjusted_mask[lake_mask] = 0.0
    adjusted_mask[flow_dir < 0] = 0.0

    h = height.astype(np.float32, copy=True)
    h_flat = h.ravel()
    mask_flat = adjusted_mask.ravel()
    flow_flat = flow_dir.ravel()
    lake_flat = lake_mask.ravel()
    dest_flat = _flow_dest_from_dir(flow_dir)

    order = np.argsort(flow_accum_raw.ravel())
    min_drop = 0.01

    for src in order:
        src_i = int(src)
        if mask_flat[src_i] <= 0.0:
            continue
        dst = int(dest_flat[src_i])
        if dst < 0:
            mask_flat[src_i] = 0.0
            continue

        if lake_flat[dst]:
            if h_flat[src_i] < h_flat[dst] - 1e-4:
                mask_flat[src_i] = 0.0
            continue

        target_downstream = h_flat[src_i] - min_drop
        if h_flat[dst] >= target_downstream:
            h_flat[dst] = target_downstream

    adjusted_mask = mask_flat.reshape(river_mask.shape).astype(np.float32)

    h2 = h_flat.reshape(height.shape).astype(np.float32)
    for dir_idx, (dy, dx) in enumerate(_DIRECTIONS_8):
        region = (adjusted_mask > 0.0) & (flow_dir == dir_idx)
        if not np.any(region):
            continue
        downstream = _shift_float(h2, dy, dx, fill=np.inf)
        invalid = region & ((h2 - downstream) < -1e-4)
        adjusted_mask[invalid] = 0.0

    return adjusted_mask.astype(np.float32), h2


def _flow_connected_support(
    core: np.ndarray,
    support: np.ndarray,
    flow_dir: np.ndarray,
    flow_accum_raw: np.ndarray,
) -> np.ndarray:
    connected = core.astype(bool, copy=True)
    if not np.any(support):
        return connected

    dest_flat = _flow_dest_from_dir(flow_dir)
    order = np.argsort(flow_accum_raw.ravel())[::-1]
    connected_flat = connected.ravel()
    support_flat = support.ravel()

    for src in order:
        src_i = int(src)
        if connected_flat[src_i] or not support_flat[src_i]:
            continue
        dst = int(dest_flat[src_i])
        if dst >= 0 and connected_flat[dst]:
            connected_flat[src_i] = True

    return connected_flat.reshape(core.shape)


def _coast_mask(land_mask: np.ndarray) -> np.ndarray:
    ocean = ~land_mask
    near_ocean = np.zeros_like(land_mask, dtype=bool)
    for dy, dx in _DIRECTIONS_8:
        near_ocean |= _shift_bool(ocean, dy, dx)
    return land_mask & near_ocean


def _distance_to_mask(mask: np.ndarray, max_radius: int) -> np.ndarray:
    max_radius = max(1, int(max_radius))
    dist = np.full(mask.shape, max_radius + 1, dtype=np.float32)
    dist[mask] = 0.0

    frontier = mask.copy()
    visited = mask.copy()

    for radius in range(1, max_radius + 1):
        if not np.any(frontier):
            break
        neighbors = frontier.copy()
        for dy, dx in _DIRECTIONS_8:
            neighbors |= _shift_bool(frontier, dy, dx)

        new_frontier = neighbors & ~visited
        if np.any(new_frontier):
            dist[new_frontier] = float(radius)
            visited |= new_frontier
        frontier = new_frontier

    return dist


def _connected_components(mask: np.ndarray) -> list[np.ndarray]:
    h, w = mask.shape
    flat = mask.ravel()
    visited = np.zeros(flat.shape[0], dtype=np.uint8)
    components: list[np.ndarray] = []

    for start in np.flatnonzero(flat):
        if visited[start]:
            continue
        stack = [int(start)]
        visited[start] = 1
        comp: list[int] = []

        while stack:
            idx = stack.pop()
            comp.append(idx)
            y = idx // w
            x = idx - y * w

            for dy, dx in _DIRECTIONS_8:
                ny = y + dy
                nx = x + dx
                if ny < 0 or ny >= h or nx < 0 or nx >= w:
                    continue
                nidx = ny * w + nx
                if flat[nidx] and not visited[nidx]:
                    visited[nidx] = 1
                    stack.append(int(nidx))

        components.append(np.array(comp, dtype=np.int32))

    return components


def _flow_dest_from_dir(flow_dir: np.ndarray) -> np.ndarray:
    h, w = flow_dir.shape
    dest = np.full((h, w), -1, dtype=np.int32)
    for dir_idx, (dy, dx) in enumerate(_DIRECTIONS_8):
        m = flow_dir == dir_idx
        if not np.any(m):
            continue
        flat_idx = _shift_index_grid(h, w, dy, dx)
        dest[m] = flat_idx[m]
    return dest.ravel()


def _assign_sink_catchments(
    elev_flat: np.ndarray,
    land_flat: np.ndarray,
    sink_component_flat: np.ndarray,
    flow_dest_flat: np.ndarray,
) -> np.ndarray:
    basin_flat = sink_component_flat.copy()
    order = np.argsort(elev_flat)
    for idx in order:
        idx_i = int(idx)
        if not land_flat[idx_i]:
            continue
        if basin_flat[idx_i] >= 0:
            continue
        dst = int(flow_dest_flat[idx_i])
        if dst < 0:
            basin_flat[idx_i] = -1
            continue
        basin_flat[idx_i] = basin_flat[dst]
    basin_flat[~land_flat] = -1
    return basin_flat.astype(np.int32)


def _group_pixels_by_basin_id(basin_id_flat: np.ndarray) -> list[tuple[int, np.ndarray]]:
    valid_idx = np.flatnonzero(basin_id_flat >= 0)
    if valid_idx.size == 0:
        return []

    valid_ids = basin_id_flat[valid_idx]
    order = np.argsort(valid_ids, kind="mergesort")
    sorted_ids = valid_ids[order]
    sorted_idx = valid_idx[order]

    cuts = np.flatnonzero(np.diff(sorted_ids)) + 1
    id_chunks = np.split(sorted_ids, cuts)
    pixel_chunks = np.split(sorted_idx, cuts)

    grouped: list[tuple[int, np.ndarray]] = []
    for ids, pixels in zip(id_chunks, pixel_chunks):
        grouped.append((int(ids[0]), pixels.astype(np.int32)))
    return grouped


def _find_basin_spill(
    height: np.ndarray,
    basin_id_flat: np.ndarray,
    sink_id: int,
    basin_pixels: np.ndarray,
    seed_flat: int,
    cfg: HydrologyConfig,
) -> tuple[int, int, float] | None:
    h, w = height.shape
    elev_flat = height.ravel()

    y = basin_pixels // w
    x = basin_pixels % w
    seed_y, seed_x = divmod(seed_flat, w)
    radius = max(1.0, float(cfg.breach_search_radius_px))

    best_key: tuple[float, float, int, int] | None = None
    best_outside = -1

    for dy, dx in _DIRECTIONS_8:
        ny = y + dy
        nx = x + dx
        valid = (ny >= 0) & (ny < h) & (nx >= 0) & (nx < w)
        if not np.any(valid):
            continue

        inside_idx = basin_pixels[valid]
        nidx = (ny[valid] * w + nx[valid]).astype(np.int32)
        outside = basin_id_flat[nidx] != sink_id
        if not np.any(outside):
            continue

        in_edge = inside_idx[outside]
        out_edge = nidx[outside]
        saddle = np.maximum(elev_flat[in_edge], elev_flat[out_edge])
        dy_seed = (in_edge // w) - seed_y
        dx_seed = (in_edge % w) - seed_x
        distance = np.hypot(dy_seed, dx_seed)
        cost = saddle + cfg.breach_slope_bias * np.clip(distance / radius, 0.0, 6.0)

        idx = int(np.argmin(cost))
        cand_key = (float(cost[idx]), float(saddle[idx]), int(in_edge[idx]), int(out_edge[idx]))
        if best_key is None or cand_key < best_key:
            best_key = cand_key
            best_outside = int(out_edge[idx])

    if best_key is None or best_outside < 0:
        return None

    spill_y, spill_x = divmod(best_outside, w)
    spill_level = best_key[1]
    seed_elev = float(elev_flat[seed_flat])
    spill_level = max(spill_level, seed_elev + 0.05)
    return int(spill_y), int(spill_x), float(spill_level)


def _flood_region_to_spill(
    height: np.ndarray,
    basin_id_flat: np.ndarray,
    sink_id: int,
    basin_pixels: np.ndarray,
    seed_flat: int,
    spill_elev: float,
) -> np.ndarray:
    h, w = height.shape
    y = basin_pixels // w
    x = basin_pixels % w

    y0 = max(0, int(np.min(y)) - 1)
    y1 = min(h, int(np.max(y)) + 2)
    x0 = max(0, int(np.min(x)) - 1)
    x1 = min(w, int(np.max(x)) + 2)

    local_h = height[y0:y1, x0:x1]
    local_ids = basin_id_flat.reshape((h, w))[y0:y1, x0:x1]
    allowed = (local_ids == sink_id) & (local_h <= spill_elev + 1e-6)

    sy, sx = divmod(seed_flat, w)
    lsy = sy - y0
    lsx = sx - x0
    if lsy < 0 or lsy >= allowed.shape[0] or lsx < 0 or lsx >= allowed.shape[1]:
        return np.zeros(0, dtype=np.int32)
    if not allowed[lsy, lsx]:
        return np.zeros(0, dtype=np.int32)

    visited = np.zeros_like(allowed, dtype=bool)
    stack = [(lsy, lsx)]
    visited[lsy, lsx] = True
    out: list[int] = []

    while stack:
        ly, lx = stack.pop()
        gy = ly + y0
        gx = lx + x0
        out.append(int(gy * w + gx))

        for dy, dx in _DIRECTIONS_8:
            ny = ly + dy
            nx = lx + dx
            if ny < 0 or ny >= allowed.shape[0] or nx < 0 or nx >= allowed.shape[1]:
                continue
            if allowed[ny, nx] and not visited[ny, nx]:
                visited[ny, nx] = True
                stack.append((ny, nx))

    return np.array(out, dtype=np.int32)


def _find_local_spill_ring(
    height: np.ndarray,
    sy: int,
    sx: int,
    radius: int,
    slope_bias: float,
) -> tuple[int, int, float] | None:
    h, w = height.shape
    r = max(2, int(radius))

    y0 = max(0, sy - r)
    y1 = min(h, sy + r + 1)
    x0 = max(0, sx - r)
    x1 = min(w, sx + r + 1)

    yy, xx = np.indices((y1 - y0, x1 - x0))
    gy = yy + y0
    gx = xx + x0

    dy = gy - sy
    dx = gx - sx
    dist = np.hypot(dy, dx)
    ring = (dist >= max(2.0, r * 0.65)) & (dist <= float(r))
    if not np.any(ring):
        return None

    sub_h = height[y0:y1, x0:x1]
    cost = sub_h + slope_bias * np.clip(dist / float(r), 0.0, 1.0)
    cost = np.where(ring, cost, np.inf)
    i = int(np.argmin(cost))
    if not np.isfinite(cost.ravel()[i]):
        return None

    ty = int(gy.ravel()[i])
    tx = int(gx.ravel()[i])
    spill = float(sub_h.ravel()[i])
    spill = max(spill, float(height[sy, sx]) + 0.08)
    return ty, tx, spill


def _flood_local_region_to_spill(
    height: np.ndarray,
    land_mask: np.ndarray,
    sy: int,
    sx: int,
    spill_elev: float,
    radius: int,
) -> np.ndarray:
    h, w = height.shape
    r = max(4, int(radius))

    y0 = max(0, sy - r)
    y1 = min(h, sy + r + 1)
    x0 = max(0, sx - r)
    x1 = min(w, sx + r + 1)

    local_h = height[y0:y1, x0:x1]
    local_land = land_mask[y0:y1, x0:x1]
    allowed = local_land & (local_h <= spill_elev + 1e-6)
    lsy = sy - y0
    lsx = sx - x0

    if not allowed[lsy, lsx]:
        return np.zeros(0, dtype=np.int32)

    visited = np.zeros_like(allowed, dtype=bool)
    stack = [(lsy, lsx)]
    visited[lsy, lsx] = True
    pixels: list[int] = []

    while stack:
        ly, lx = stack.pop()
        gy = ly + y0
        gx = lx + x0
        pixels.append(int(gy * w + gx))
        for dy, dx in _DIRECTIONS_8:
            ny = ly + dy
            nx = lx + dx
            if ny < 0 or ny >= allowed.shape[0] or nx < 0 or nx >= allowed.shape[1]:
                continue
            if allowed[ny, nx] and not visited[ny, nx]:
                visited[ny, nx] = True
                stack.append((ny, nx))

    return np.array(pixels, dtype=np.int32)


def _carve_breach_channel(
    height: np.ndarray,
    sy: int,
    sx: int,
    ty: int,
    tx: int,
    sink_elev: float,
    spill_elev: float,
    aggressiveness: float,
) -> None:
    yy, xx = _line_indices(sy, sx, ty, tx)
    n = len(yy)
    if n < 2:
        return

    end_elev = min(spill_elev, sink_elev - 0.4)
    line = np.linspace(sink_elev - 0.1, end_elev, n, dtype=np.float32)
    carve_depth = 6.0 + 10.0 * float(np.clip(aggressiveness, 0.0, 1.0))
    carve = line - carve_depth
    height[yy, xx] = np.minimum(height[yy, xx], carve)


def _ensure_lake_outflow(height: np.ndarray, basin: BasinRecord) -> None:
    w = height.shape[1]
    yy = basin.flat_indices // w
    xx = basin.flat_indices % w

    dy = yy - basin.spill_y
    dx = xx - basin.spill_x
    near = np.argmin(dy * dy + dx * dx)
    sy = int(yy[near])
    sx = int(xx[near])

    py, px = _line_indices(sy, sx, basin.spill_y, basin.spill_x)
    n = len(py)
    if n < 2:
        return

    profile = np.linspace(basin.spill_elevation, basin.spill_elevation - 0.8, n, dtype=np.float32)
    height[py, px] = np.minimum(height[py, px], profile)


def _line_indices(y0: int, x0: int, y1: int, x1: int) -> tuple[np.ndarray, np.ndarray]:
    steps = int(max(abs(y1 - y0), abs(x1 - x0))) + 1
    ys = np.linspace(y0, y1, steps)
    xs = np.linspace(x0, x1, steps)
    return np.round(ys).astype(np.int32), np.round(xs).astype(np.int32)


def _laplacian(arr: np.ndarray) -> np.ndarray:
    return (
        np.roll(arr, 1, axis=0)
        + np.roll(arr, -1, axis=0)
        + np.roll(arr, 1, axis=1)
        + np.roll(arr, -1, axis=1)
        - 4.0 * arr
    ).astype(np.float32)


def _shift_float(field: np.ndarray, dy: int, dx: int, *, fill: float) -> np.ndarray:
    out = np.full(field.shape, fill, dtype=np.float32)

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


def _shift_index_grid(h: int, w: int, dy: int, dx: int) -> np.ndarray:
    grid = np.arange(h * w, dtype=np.int32).reshape((h, w))
    out = np.full((h, w), -1, dtype=np.int32)

    y_src0 = max(0, -dy)
    y_src1 = h - max(0, dy)
    x_src0 = max(0, -dx)
    x_src1 = w - max(0, dx)

    y_dst0 = max(0, dy)
    y_dst1 = h - max(0, -dy)
    x_dst0 = max(0, dx)
    x_dst1 = w - max(0, -dx)

    out[y_dst0:y_dst1, x_dst0:x_dst1] = grid[y_src0:y_src1, x_src0:x_src1]
    return out


def _normalize01(values: np.ndarray) -> np.ndarray:
    vmax = float(np.max(values))
    if vmax <= 1e-8:
        return np.zeros_like(values, dtype=np.float32)
    vmin = float(np.min(values))
    scale = max(vmax - vmin, 1e-8)
    return np.clip((values - vmin) / scale, 0.0, 1.0).astype(np.float32)


def _lerp(a: float, b: float, t: float) -> float:
    return (1.0 - t) * a + t * b
