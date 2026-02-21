from __future__ import annotations

import hashlib

import numpy as np

from terrain.config import GeneratorConfig
from terrain.heightfield import generate_heightfield
from terrain.rng import RngStream
from terrain.seed import parse_seed


def _hash(arr: np.ndarray) -> str:
    return hashlib.sha256(arr.tobytes()).hexdigest()


def test_hydrology_determinism_small_grid() -> None:
    parsed = parse_seed("MistyForge")
    cfg = GeneratorConfig()

    a = generate_heightfield(256, 128, 5000.0, RngStream(parsed.seed_hash), config=cfg)
    b = generate_heightfield(256, 128, 5000.0, RngStream(parsed.seed_hash), config=cfg)

    assert np.array_equal(a.flow_dir, b.flow_dir)
    assert np.array_equal(a.flow_accum_raw, b.flow_accum_raw)
    assert np.array_equal(a.river_mask, b.river_mask)
    assert np.array_equal(a.lake_mask, b.lake_mask)
    assert _hash(a.height_m) == _hash(b.height_m)


def test_hydrology_stability_fields() -> None:
    parsed = parse_seed("MistyForge")
    cfg = GeneratorConfig()
    r = generate_heightfield(256, 128, 5000.0, RngStream(parsed.seed_hash), config=cfg)

    assert np.isfinite(r.h_hydro).all()
    assert np.isfinite(r.h_geomorph).all()
    assert np.isfinite(r.h_drain).all()
    assert np.isfinite(r.h_eroded).all()
    assert np.isfinite(r.height_m).all()

    assert float(np.min(r.flow_accum_raw)) >= 0.0
    assert float(np.min(r.flow_accum_norm)) >= 0.0
    assert float(np.max(r.flow_accum_norm)) <= 1.0 + 1e-6
    assert int(np.min(r.flow_dir)) >= -1
    assert int(np.max(r.flow_dir)) <= 7

    land_flow = r.flow_accum_raw[r.land_mask]
    assert float(np.min(land_flow)) >= 1.0
    assert float(np.mean(land_flow > 0.0)) >= 0.98
    assert float(np.max(land_flow)) > (10.0 * float(np.mean(land_flow)))

    assert float(np.min(r.basin_size_map)) >= 0.0
    assert float(np.max(r.basin_size_map)) <= 1.0 + 1e-6
    assert float(np.min(r.lake_size_map)) >= 0.0
    assert float(np.max(r.lake_size_map)) <= 1.0 + 1e-6

    assert r.hydrology_metrics.river_pixel_count >= 0
    assert r.hydrology_metrics.lake_pixel_count >= 0
    assert r.hydrology_metrics.basin_count_retained <= r.hydrology_metrics.basin_count_total
    assert r.hydrology_metrics.largest_lake_area >= 0
    assert 0.0 <= r.hydrology_metrics.percent_endo_basins <= 100.0
    assert r.geomorph_metrics.max_incision_depth_m >= 0.0
    assert r.geomorph_metrics.mean_incision_depth_m >= 0.0
    assert r.geomorph_metrics.mean_incision_depth_incised_m >= 0.0
    assert 0.0 <= r.geomorph_metrics.percent_land_incised <= 1.0
    assert r.geomorph_metrics.power_scale_value >= 0.0
    assert 0.0 <= r.hypsometric_integral_land <= 1.0
    assert r.hydrology_metrics.regional_endorheic_count_gt_10000km2 >= 0
    assert r.hydrology_metrics.continental_basin_count_gt_1pct_land >= 0
    assert r.hydrology_metrics.tiny_endorheic_basin_count_lt_10000km2 >= 0
    assert 0.0 <= r.hydrology_metrics.tiny_endorheic_area_ratio_lt_10000km2 <= 1.0
    assert r.hydrology_metrics.trunk_sinuosity_segment_count >= 0
    assert r.hydrology_metrics.trunk_sinuosity_median >= 0.0
    assert r.hydrology_metrics.trunk_sinuosity_p90 >= 0.0

    assert np.all(r.h_geomorph[~r.land_mask] == r.h_hydro[~r.land_mask])
    land_delta = r.h_hydro[r.land_mask] - r.h_geomorph[r.land_mask]
    assert float(np.min(land_delta)) >= -1e-4


def test_hydrology_capture_metrics_improve_connectivity() -> None:
    parsed = parse_seed("MistyForge")
    cfg = GeneratorConfig()
    r = generate_heightfield(256, 128, 5000.0, RngStream(parsed.seed_hash), config=cfg)
    m = r.hydrology_metrics

    assert m.num_ocean_outlets_raw > 0
    assert m.num_ocean_outlets_merged > 0
    assert m.num_ocean_outlets_merged <= m.num_ocean_outlets_raw

    assert m.largest_basin_land_ratio >= 0.08
    assert m.endorheic_land_ratio <= 0.25
    assert len(m.top_10_basin_sizes) >= 1
