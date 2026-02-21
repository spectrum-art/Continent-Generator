from __future__ import annotations

import json

from cli.main import main


def test_runtime_fields_only_in_meta_json(tmp_path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    out_dir = tmp_path / "out"
    code = main(
        [
            "--seed",
            "MistyForge",
            "--out",
            str(out_dir),
            "--w",
            "96",
            "--h",
            "64",
            "--mpp",
            "5000",
            "--overwrite",
        ]
    )
    assert code == 0

    base = out_dir / "mistyforge" / "96x64"
    meta = json.loads((base / "meta.json").read_text(encoding="utf-8"))
    deterministic_meta = json.loads((base / "deterministic_meta.json").read_text(encoding="utf-8"))

    assert "generation_seconds" in meta
    assert meta["generation_seconds"] >= 0.0
    assert "incision_seconds" in meta
    assert meta["incision_seconds"] >= 0.0
    assert "generated_at_utc" in meta

    assert "generation_seconds" not in deterministic_meta
    assert "incision_seconds" not in deterministic_meta
    assert "generated_at_utc" not in deterministic_meta

    hydro = deterministic_meta["hydrology"]
    metrics = deterministic_meta["metrics"]
    geomorph = deterministic_meta["geomorph"]
    assert "hypsometric_integral_land" in metrics
    assert "basin_count_total" in hydro
    assert "basin_count_retained" in hydro
    assert "lake_area_fraction" in hydro
    assert "mean_lake_area" in hydro
    assert "largest_lake_area" in hydro
    assert "num_ocean_outlets_raw" in hydro
    assert "num_ocean_outlets_merged" in hydro
    assert "largest_basin_land_ratio" in hydro
    assert "endorheic_land_ratio" in hydro
    assert "top_10_basin_sizes" in hydro
    assert "regional_endorheic_count_gt_10000km2" in hydro
    assert "continental_basin_count_gt_1pct_land" in hydro
    assert "tiny_endorheic_basin_count_lt_10000km2" in hydro
    assert "tiny_endorheic_area_ratio_lt_10000km2" in hydro
    assert "trunk_sinuosity_segment_count" in hydro
    assert "trunk_sinuosity_median" in hydro
    assert "trunk_sinuosity_p90" in hydro
    assert "geomorph" in deterministic_meta
    assert "max_incision_depth_m" in geomorph
    assert "mean_incision_depth_m" in geomorph
    assert "mean_incision_depth_incised_m" in geomorph
    assert "percent_land_incised" in geomorph
    assert "power_scale_value" in geomorph

    for name in (
        "height.npy",
        "height_16.png",
        "hillshade.png",
        "land_mask.png",
        "debug_h_hydro_pre.png",
        "debug_h_hydro_post.png",
        "debug_capture_paths.png",
        "debug_basin_id.png",
        "debug_basin_sizes.png",
        "debug_outlets.png",
        "debug_endorheic_mask.png",
        "debug_flow_accum_log.png",
        "debug_flow_dir.png",
        "debug_river_mask.png",
        "debug_h_geomorph.png",
        "debug_incision.png",
        "debug_composite.png",
    ):
        assert (base / name).exists(), name

    for name in (
        "debug_flow_accum_raw.png",
        "debug_flow_accum.png",
        "debug_h_hydro.png",
        "debug_lake_mask.png",
        "debug_lake_sizes.png",
        "debug_height_stack.png",
        "debug_plates.png",
        "debug_incision_raw.png",
        "debug_incision_blurred.png",
        "debug_power_raw_log.png",
        "debug_detail_damping.png",
        "debug_tectonic_distance.png",
    ):
        assert not (base / name).exists(), name


def test_overwrite_cleans_stale_outputs(tmp_path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    out_dir = tmp_path / "out"
    args = [
        "--seed",
        "MistyForge",
        "--out",
        str(out_dir),
        "--w",
        "96",
        "--h",
        "64",
        "--mpp",
        "5000",
        "--overwrite",
    ]
    assert main(args + ["--debug-tier", "2"]) == 0
    base = out_dir / "mistyforge" / "96x64"
    assert (base / "debug_plates.png").exists()

    assert main(args + ["--debug-tier", "0"]) == 0
    assert not (base / "debug_plates.png").exists()
