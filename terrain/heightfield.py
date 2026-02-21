"""Heightfield composition pipeline."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.ndimage import distance_transform_edt

from terrain.climate import classify_biomes_whittaker, compute_moisture_mask, compute_temperature_mask
from terrain.config import GeneratorConfig
from terrain.geomorph import GeomorphMetrics, apply_hierarchical_incision
from terrain.hydrology import HydrologyMetrics, run_hydrology
from terrain.mask import generate_land_mask
from terrain.metrics import ConnectivityMetrics
from terrain.noise import fbm_noise, warp_field
from terrain.rng import RngStream
from terrain.tectonics import TectonicsResult, generate_tectonic_scaffold


@dataclass(frozen=True)
class HeightfieldResult:
    """Primary and intermediate raster outputs of generation."""

    height_m: np.ndarray
    h_tectonic: np.ndarray
    h_hydro_pre: np.ndarray
    h_hydro: np.ndarray
    h_geomorph: np.ndarray
    h_drain: np.ndarray
    h_river: np.ndarray
    h_eroded: np.ndarray
    h_lake_adjusted: np.ndarray
    h_shore: np.ndarray
    h_final_pre_clamp: np.ndarray
    land_mask: np.ndarray
    mask_potential: np.ndarray
    uplift: np.ndarray
    tectonic_distance_px: np.ndarray
    tectonic_noise_gain: np.ndarray
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
    river_mask: np.ndarray
    river_incision_map: np.ndarray
    lake_mask: np.ndarray
    erosion_map: np.ndarray
    deposition_map: np.ndarray
    coast_mask: np.ndarray
    distance_to_coast: np.ndarray
    incision_raw: np.ndarray
    incision_power_raw: np.ndarray
    incision_blurred: np.ndarray
    incision_depth_m: np.ndarray
    detail_damping: np.ndarray
    moisture_mask: np.ndarray
    temperature_mask: np.ndarray
    biome_mask: np.ndarray
    hypsometric_integral_land: float
    mask_metrics: ConnectivityMetrics
    hydrology_metrics: HydrologyMetrics
    geomorph_metrics: GeomorphMetrics
    tectonics: TectonicsResult


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
    tectonics = generate_tectonic_scaffold(
        width,
        height,
        land,
        rng.fork("tectonics"),
        config=cfg.tectonics,
    )

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
    background_uplift = warp_field(
        ridged,
        uplift_warp_x,
        uplift_warp_y,
        strength_px=cfg.height.uplift_warp_strength_px,
    )
    background_uplift = _normalize01(background_uplift)

    # Detail is computed early but re-added after hydrology/erosion to preserve rivers/lakes.
    detail = fbm_noise(width, height, rng.fork("detail").generator(), base_res=10, octaves=4)

    fabric_a = fbm_noise(width, height, rng.fork("tectonic-fabric-a").generator(), base_res=7, octaves=4)
    fabric_b = fbm_noise(width, height, rng.fork("tectonic-fabric-b").generator(), base_res=7, octaves=4)
    fabric_signal = _plate_fabric_signal(tectonics.plate_ids, tectonics.plate_motion, fabric_a, fabric_b)
    fabric_ridge = np.square(np.clip(1.0 - np.abs(fabric_signal), 0.0, 1.0)).astype(np.float32)
    fabric_lineament = np.clip(np.abs(fabric_signal), 0.0, 1.0).astype(np.float32)

    basin = fbm_noise(width, height, rng.fork("basin").generator(), base_res=4, octaves=4)
    basin_term = np.clip(0.62 - (basin + 1.0) * 0.5, 0.0, 1.0)

    tectonic_distance_px, tectonic_noise_gain = _tectonic_noise_modulation(tectonics)
    background_uplift *= tectonic_noise_gain
    basin_term *= tectonic_noise_gain
    detail *= tectonic_noise_gain

    rift_noise = _normalize01(fbm_noise(width, height, rng.fork("rift-noise").generator(), base_res=6, octaves=3))
    orogeny = tectonics.orogeny_field * fabric_ridge * (0.85 + 0.15 * tectonics.stress_field)
    rift = tectonics.rift_field * (0.45 + 0.55 * rift_noise)
    transform = tectonics.transform_field * fabric_lineament * (0.7 + 0.3 * tectonics.stress_field)
    collision_damp = 1.0 - cfg.height.collision_damping * tectonics.collision_buffer

    macro_land = (
        cfg.height.base_land_lift_m
        + continentality * cfg.height.continentality_height_m
        + background_uplift * cfg.height.ridge_height_m
        + tectonics.base_crust_field * cfg.height.crust_height_m
        + basin_term * cfg.height.basin_height_m
        + tectonics.stress_field * cfg.height.stress_uplift_m
        + orogeny * cfg.height.orogeny_strength_m
        + transform * cfg.height.transform_strength_m
        - rift * cfg.height.rift_strength_m
        - tectonics.interior_basin_field * cfg.height.interior_basin_strength_m
    )
    macro_land = macro_land * collision_damp

    tectonic_detail = fabric_signal * tectonics.transform_field * cfg.height.tectonic_detail_m
    detail_amp = cfg.height.detail_land_m * (1.0 - cfg.height.craton_detail_reduction * tectonics.plate_age_map)

    ocean_factor = np.clip(
        (threshold - potential) / max(threshold, 1e-6),
        0.0,
        1.0,
    )
    shelf_depth = np.power(
        np.clip(1.0 - tectonics.shelf_proximity, 0.0, 1.0),
        cfg.height.shelf_depth_power,
    )
    ocean_depth_factor = (
        ocean_factor * (1.0 - cfg.height.ocean_shelf_blend)
        + shelf_depth * cfg.height.ocean_shelf_blend
    )

    ocean_height = -ocean_depth_factor * cfg.height.ocean_depth_m
    ocean_height -= tectonics.rift_field * (1.0 - tectonics.shelf_proximity) * (cfg.height.rift_strength_m * 0.18)
    ocean_height = np.maximum(ocean_height, -cfg.height.max_ocean_depth_m)
    ocean_height = np.minimum(ocean_height, 0.0)

    h_tectonic = ocean_height.astype(np.float32)
    land_macro = np.clip(macro_land, cfg.height.min_land_height_m, cfg.height.max_land_height_m)
    h_tectonic[land] = land_macro[land]
    ocean_mask = h_tectonic <= 0.0
    distance_to_ocean_px = distance_transform_edt(~ocean_mask).astype(np.float32)
    distance_to_ocean_m = distance_to_ocean_px * float(meters_per_pixel)
    coastal_gradient_m_per_m = 0.00005
    dome_lift = distance_to_ocean_m * coastal_gradient_m_per_m
    dome_lift[ocean_mask] = 0.0
    h_tectonic[~ocean_mask] += dome_lift[~ocean_mask]

    hydro = run_hydrology(
        h_tectonic,
        land,
        meters_per_pixel,
        hydrology_cfg=cfg.hydrology,
        tectonics_cfg=cfg.tectonics,
        rng=rng.fork("hydrology"),
    )
    moisture_mask = compute_moisture_mask(
        height_m=h_tectonic,
        land_mask=land,
        ocean_mask=~land,
        lake_mask=hydro.lake_mask,
        river_mask=hydro.river_mask,
        meters_per_pixel=meters_per_pixel,
    )
    geomorph = apply_hierarchical_incision(
        hydro.h_hydro,
        hydro.flow_accum_raw,
        hydro.flow_dir,
        land,
        meters_per_pixel,
        config=cfg.geomorph,
    )

    # Recompose fine detail while preserving hydrological structures.
    river_strength = np.clip(hydro.river_mask / max(cfg.hydrology.river_max_width_px, 1e-6), 0.0, 1.0)
    flow_gate = _flow_detail_gate(
        hydro.flow_accum_raw,
        land,
        threshold_cells=cfg.height.detail_flow_threshold_cells,
        damp_strength=cfg.height.detail_flow_damp_strength,
        curve=cfg.height.detail_flow_damp_curve,
    )
    suppress = np.clip(river_strength * 0.9 + hydro.lake_mask.astype(np.float32), 0.0, 1.0)
    detail_damping = np.clip(flow_gate * (1.0 - suppress), 0.0, 1.0) * land.astype(np.float32)

    detail_readd = (detail * detail_amp + tectonic_detail) * detail_damping
    h_final_pre = geomorph.h_geomorph.astype(np.float32, copy=True)
    h_final_pre[land] = h_final_pre[land] + detail_readd[land]

    h_final = np.clip(
        h_final_pre,
        -cfg.height.max_ocean_depth_m,
        cfg.height.max_land_height_m,
    ).astype(np.float32)
    h_final[~land] = np.minimum(h_final[~land], 0.0)
    h_final[land] = np.maximum(h_final[land], cfg.height.min_land_height_m)
    temperature_mask = compute_temperature_mask(
        height_m=h_final,
        land_mask=land,
        max_land_height_m=cfg.height.max_land_height_m,
    )
    biome_mask = classify_biomes_whittaker(
        temperature=temperature_mask,
        moisture=moisture_mask,
        land_mask=land,
        ocean_mask=~land,
    )
    hypsometric_integral_land = _hypsometric_integral(h_final, land)

    uplift_debug = _normalize01(background_uplift * 0.2 + orogeny * 0.65 + tectonics.stress_field * 0.15)

    return HeightfieldResult(
        height_m=h_final,
        h_tectonic=h_tectonic,
        h_hydro_pre=hydro.h_hydro_pre,
        h_hydro=hydro.h_hydro,
        h_geomorph=geomorph.h_geomorph,
        h_drain=hydro.h_drain,
        h_river=hydro.h_river,
        h_eroded=hydro.h_eroded,
        h_lake_adjusted=hydro.h_lake_adjusted,
        h_shore=hydro.h_shore,
        h_final_pre_clamp=h_final_pre,
        land_mask=land,
        mask_potential=potential,
        uplift=uplift_debug,
        tectonic_distance_px=tectonic_distance_px,
        tectonic_noise_gain=tectonic_noise_gain,
        flow_dir=hydro.flow_dir,
        flow_accum_raw=hydro.flow_accum_raw,
        flow_accum_norm=hydro.flow_accum_norm,
        basin_outlet_id=hydro.basin_outlet_id,
        outlet_points=hydro.outlet_points,
        endorheic_mask=hydro.endorheic_mask,
        capture_paths_mask=hydro.capture_paths_mask,
        basin_mask=hydro.basin_mask,
        basin_id_map=hydro.basin_id_map,
        basin_size_map=hydro.basin_size_map,
        lake_size_map=hydro.lake_size_map,
        lake_retention_map=hydro.lake_retention_map,
        river_mask=hydro.river_mask,
        river_incision_map=hydro.river_incision_map,
        lake_mask=hydro.lake_mask,
        erosion_map=hydro.erosion_map,
        deposition_map=hydro.deposition_map,
        coast_mask=hydro.coast_mask,
        distance_to_coast=hydro.distance_to_coast,
        incision_raw=geomorph.incision_raw,
        incision_power_raw=geomorph.power_raw,
        incision_blurred=geomorph.incision_blurred,
        incision_depth_m=geomorph.incision_depth_m,
        detail_damping=detail_damping.astype(np.float32),
        moisture_mask=moisture_mask.astype(np.float32),
        temperature_mask=temperature_mask.astype(np.float32),
        biome_mask=biome_mask.astype(np.uint8),
        hypsometric_integral_land=hypsometric_integral_land,
        mask_metrics=mask_result.metrics,
        hydrology_metrics=hydro.metrics,
        geomorph_metrics=geomorph.metrics,
        tectonics=tectonics,
    )


def _plate_fabric_signal(
    plate_ids: np.ndarray,
    plate_motion: np.ndarray,
    field_a: np.ndarray,
    field_b: np.ndarray,
) -> np.ndarray:
    motion = plate_motion[plate_ids]
    signal = field_a * motion[..., 0] + field_b * motion[..., 1]
    return np.clip(signal, -1.0, 1.0).astype(np.float32)


def _normalize01(values: np.ndarray) -> np.ndarray:
    lo, hi = np.percentile(values, [1.0, 99.0])
    scale = max(hi - lo, 1e-6)
    return np.clip((values - lo) / scale, 0.0, 1.0).astype(np.float32)


def _tectonic_noise_modulation(
    tectonics: TectonicsResult,
) -> tuple[np.ndarray, np.ndarray]:
    lambda_px = 40.0
    active_boundaries = (
        tectonics.boundary_mask
        | (tectonics.stress_field > 0.18)
        | (tectonics.orogeny_field > 0.10)
        | (tectonics.rift_field > 0.10)
        | (tectonics.transform_field > 0.10)
    )
    if not np.any(active_boundaries):
        shape = tectonics.boundary_mask.shape
        return np.zeros(shape, dtype=np.float32), np.ones(shape, dtype=np.float32)
    dist_px = distance_transform_edt(~active_boundaries).astype(np.float32)
    modulation_mask = np.exp(-dist_px / lambda_px).astype(np.float32)
    return dist_px, modulation_mask


def _flow_detail_gate(
    flow_accum_raw: np.ndarray,
    land_mask: np.ndarray,
    *,
    threshold_cells: float,
    damp_strength: float,
    curve: float,
) -> np.ndarray:
    gate = np.ones_like(flow_accum_raw, dtype=np.float32)
    if not np.any(land_mask):
        return gate
    flow = np.clip(flow_accum_raw.astype(np.float32), 0.0, None)
    land_flow = flow[land_mask]
    if land_flow.size == 0:
        return gate
    flow_ref = max(float(np.percentile(land_flow, 99.5)), float(threshold_cells) + 1.0)
    log_min = np.log1p(max(float(threshold_cells), 0.0))
    denom = max(np.log1p(flow_ref) - log_min, 1e-6)
    flow_norm = np.clip((np.log1p(flow) - log_min) / denom, 0.0, 1.0)
    damp = float(np.clip(damp_strength, 0.0, 1.0))
    shaped = np.power(flow_norm, max(float(curve), 0.2))
    gate = 1.0 - damp * shaped
    gate[~land_mask] = 1.0
    return np.clip(gate, 0.0, 1.0).astype(np.float32)


def _hypsometric_integral(height_m: np.ndarray, land_mask: np.ndarray) -> float:
    if not np.any(land_mask):
        return 0.0
    land = height_m[land_mask].astype(np.float32)
    h_min = float(np.min(land))
    h_max = float(np.max(land))
    if h_max <= h_min + 1e-6:
        return 0.0
    norm = np.clip((land - h_min) / (h_max - h_min), 0.0, 1.0)
    return float(np.mean(norm))
