"""CLI entry point for terrain generation."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path
import platform
import shutil
import tempfile
import time

import numpy as np
from PIL import Image
from terrain.config import DEFAULT_HEIGHT, DEFAULT_MPP, DEFAULT_WIDTH, GeneratorConfig
from terrain.climate import biome_colormap_rgb
from terrain.derive import (
    flow_dir_u8,
    float_preview_u8,
    height_preview_u16,
    hillshade,
    land_mask_u8,
)
from terrain.heightfield import generate_heightfield
from terrain.io import (
    move_tree_contents,
    resolve_output_dir,
    safe_clean_output_dir,
    write_height_npy,
    write_json,
    write_png_u16,
    write_png_u8,
)
from terrain.rng import RngStream
from terrain.seed import SeedParseError, parse_seed


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Deterministic continent-scale terrain generator")
    parser.add_argument("--seed", required=True, help="Readable seed in adjective+noun form (e.g. MistyForge)")
    parser.add_argument("--out", default="out", help="Output root directory")
    parser.add_argument("--w", type=int, default=DEFAULT_WIDTH, help="Output width in pixels")
    parser.add_argument("--h", type=int, default=DEFAULT_HEIGHT, help="Output height in pixels")
    parser.add_argument("--mpp", type=float, default=DEFAULT_MPP, help="Meters per pixel")
    parser.add_argument(
        "--debug-tier",
        type=int,
        choices=(0, 1, 2),
        default=0,
        help="Debug output tier: 0=core, 1=subsystem, 2=deep",
    )
    parser.add_argument("--overwrite", action="store_true", help="Overwrite files in existing output directory")
    parser.add_argument(
        "--json",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Write metadata JSON files",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        parsed_seed = parse_seed(args.seed)
    except SeedParseError as exc:
        parser.error(str(exc))

    config = GeneratorConfig(debug_tier=args.debug_tier)
    rng = RngStream(parsed_seed.seed_hash)

    generation_start = time.perf_counter()
    result = generate_heightfield(
        args.w,
        args.h,
        args.mpp,
        rng,
        config=config,
    )
    generation_seconds = time.perf_counter() - generation_start

    shade = hillshade(
        result.h_geomorph,
        meters_per_pixel=args.mpp,
        azimuth_deg=config.render.hillshade_azimuth_deg,
        altitude_deg=config.render.hillshade_altitude_deg,
        hillshade_vertical_exaggeration=config.render.hillshade_vertical_exaggeration,
    )
    height_16 = height_preview_u16(result.height_m)
    mask_8 = land_mask_u8(result.land_mask)
    flow_accum_8 = _land_scaled_preview_u8(result.flow_accum_raw, result.land_mask, p_lo=1.0, p_hi=99.5)
    flow_dir_8 = flow_dir_u8(result.flow_dir)
    river_norm = np.clip(result.river_mask / max(config.hydrology.river_max_width_px, 1e-6), 0.0, 1.0)
    river_norm = np.power(river_norm, 0.6)
    river_mask_8 = np.round(river_norm * 255.0).astype(np.uint8)
    river_mask_8[~result.land_mask] = 0
    basin_id_8 = _id_map_preview_u8(result.basin_id_map, result.land_mask)
    outlets_8 = _outlet_points_preview(result.height_m.shape, result.outlet_points)
    incision_depth_8 = float_preview_u8(result.incision_depth_m, robust_percentiles=(0.0, 100.0))
    tectonic_scaffold_8 = float_preview_u8(result.h_tectonic, robust_percentiles=(1.0, 99.0))
    moisture_rgb = _moisture_colormap_rgb(result.moisture_mask)
    biomes_rgb = biome_colormap_rgb(result.biome_mask)

    out_dir = resolve_output_dir(
        args.out,
        parsed_seed.canonical,
        args.w,
        args.h,
        overwrite=args.overwrite,
    )
    png_u16_outputs: dict[str, np.ndarray] = {
        "height_16.png": height_16,
    }
    png_u8_outputs: dict[str, np.ndarray] = {
        "hillshade.png": shade,
        "land_mask.png": mask_8,
        "debug_flow_accum.png": flow_accum_8,
        "debug_flow_dir.png": flow_dir_8,
        "debug_basin_id.png": basin_id_8,
        "debug_outlets.png": outlets_8,
        "debug_river_mask.png": river_mask_8,
        "debug_incision.png": incision_depth_8,
        "debug_tectonic_scaffold.png": tectonic_scaffold_8,
    }
    png_rgb_outputs: dict[str, np.ndarray] = {
        "debug_moisture.png": moisture_rgb,
        "debug_biomes.png": biomes_rgb,
    }

    stage_dir = Path(tempfile.mkdtemp(prefix=".staging-", dir=str(out_dir.parent)))
    try:
        write_height_npy(stage_dir / "height.npy", result.height_m)
        write_height_npy(stage_dir / "h_hydro_pre.npy", result.h_hydro_pre)
        write_height_npy(stage_dir / "h_hydro_post.npy", result.h_hydro)
        for name, raster in png_u16_outputs.items():
            write_png_u16(stage_dir / name, raster)
        for name, raster in png_u8_outputs.items():
            write_png_u8(stage_dir / name, raster)
        for name, raster in png_rgb_outputs.items():
            Image.fromarray(raster.astype(np.uint8), mode="RGB").save(stage_dir / name)
        if args.json:
            timestamp = datetime.now(timezone.utc).isoformat()
            deterministic_meta = {
                "canonical_seed": parsed_seed.canonical,
                "height": args.h,
                "meters_per_pixel": args.mpp,
                "seed_hash": parsed_seed.seed_hash,
                "width": args.w,
                "config": config.to_dict(),
                "metrics": {
                    "num_components": result.mask_metrics.num_components,
                    "largest_component_area": result.mask_metrics.largest_component_area,
                    "total_land_pixels": result.mask_metrics.total_land_pixels,
                    "largest_land_ratio": result.mask_metrics.largest_land_ratio,
                    "land_fraction": result.mask_metrics.land_fraction,
                    "hypsometric_integral_land": result.hypsometric_integral_land,
                },
                "tectonics": {
                    "plate_count": result.tectonics.plate_count,
                    "boundary_pixels": int(result.tectonics.boundary_mask.sum()),
                    "mean_lithosphere_thickness_px": float(result.tectonics.lithosphere_thickness_px.mean()),
                },
                "hydrology": {
                    "river_pixel_count": result.hydrology_metrics.river_pixel_count,
                    "lake_pixel_count": result.hydrology_metrics.lake_pixel_count,
                    "max_flow_accum": result.hydrology_metrics.max_flow_accum,
                    "mean_flow_accum": result.hydrology_metrics.mean_flow_accum,
                    "percent_endo_basins": result.hydrology_metrics.percent_endo_basins,
                    "total_river_length_estimate": result.hydrology_metrics.total_river_length_estimate,
                    "basin_count_total": result.hydrology_metrics.basin_count_total,
                    "basin_count_retained": result.hydrology_metrics.basin_count_retained,
                    "lake_area_fraction": result.hydrology_metrics.lake_area_fraction,
                    "mean_lake_area": result.hydrology_metrics.mean_lake_area,
                    "largest_lake_area": result.hydrology_metrics.largest_lake_area,
                    "num_ocean_outlets_raw": result.hydrology_metrics.num_ocean_outlets_raw,
                    "num_ocean_outlets_merged": result.hydrology_metrics.num_ocean_outlets_merged,
                    "largest_basin_land_ratio": result.hydrology_metrics.largest_basin_land_ratio,
                    "top_10_basin_sizes": list(result.hydrology_metrics.top_10_basin_sizes),
                    "endorheic_land_ratio": result.hydrology_metrics.endorheic_land_ratio,
                    "num_endorheic_basins": result.hydrology_metrics.num_endorheic_basins,
                    "flow_accum_p50": result.hydrology_metrics.flow_accum_p50,
                    "flow_accum_p90": result.hydrology_metrics.flow_accum_p90,
                    "flow_accum_p99": result.hydrology_metrics.flow_accum_p99,
                    "flow_accum_p999": result.hydrology_metrics.flow_accum_p999,
                    "flow_cells_ge_10": result.hydrology_metrics.flow_cells_ge_10,
                    "flow_cells_ge_100": result.hydrology_metrics.flow_cells_ge_100,
                    "flow_cells_ge_1000": result.hydrology_metrics.flow_cells_ge_1000,
                    "regional_endorheic_count_gt_10000km2": result.hydrology_metrics.regional_endorheic_count_gt_10000km2,
                    "continental_basin_count_gt_1pct_land": result.hydrology_metrics.continental_basin_count_gt_1pct_land,
                    "tiny_endorheic_basin_count_lt_10000km2": result.hydrology_metrics.tiny_endorheic_basin_count_lt_10000km2,
                    "tiny_endorheic_area_ratio_lt_10000km2": result.hydrology_metrics.tiny_endorheic_area_ratio_lt_10000km2,
                    "trunk_sinuosity_segment_count": result.hydrology_metrics.trunk_sinuosity_segment_count,
                    "trunk_sinuosity_median": result.hydrology_metrics.trunk_sinuosity_median,
                    "trunk_sinuosity_p90": result.hydrology_metrics.trunk_sinuosity_p90,
                },
                "geomorph": {
                    "max_incision_depth_m": result.geomorph_metrics.max_incision_depth_m,
                    "mean_incision_depth_m": result.geomorph_metrics.mean_incision_depth_m,
                    "mean_incision_depth_incised_m": result.geomorph_metrics.mean_incision_depth_incised_m,
                    "percent_land_incised": result.geomorph_metrics.percent_land_incised,
                    "power_scale_value": result.geomorph_metrics.power_scale_value,
                },
            }
            meta = {
                **deterministic_meta,
                "generated_at_utc": timestamp,
                "original_seed": parsed_seed.original,
                "generation_seconds": generation_seconds,
                "incision_seconds": result.geomorph_metrics.incision_seconds,
                "python_version": platform.python_version(),
                "numpy_version": np.__version__,
            }
            write_json(stage_dir / "deterministic_meta.json", deterministic_meta)
            write_json(stage_dir / "meta.json", meta)

        safe_clean_output_dir(
            out_dir,
            out_root=Path(args.out),
            project_root=Path.cwd(),
        )
        move_tree_contents(stage_dir, out_dir)
    finally:
        shutil.rmtree(stage_dir, ignore_errors=True)

    print(f"Generated terrain: {out_dir}")
    print(
        "Land fraction "
        f"{result.mask_metrics.land_fraction:.3f}; "
        f"dominant landmass ratio {result.mask_metrics.largest_land_ratio:.3f}"
    )
    print(
        "Hydrology: "
        f"outlets raw={result.hydrology_metrics.num_ocean_outlets_raw}, "
        f"merged={result.hydrology_metrics.num_ocean_outlets_merged}, "
        f"largest basin={result.hydrology_metrics.largest_basin_land_ratio * 100.0:.2f}% land, "
        f"endorheic land={result.hydrology_metrics.endorheic_land_ratio * 100.0:.2f}%"
    )
    print(
        "Flow accumulation: "
        f"max={result.hydrology_metrics.max_flow_accum:.1f}, "
        f"p50={result.hydrology_metrics.flow_accum_p50:.1f}, "
        f"p90={result.hydrology_metrics.flow_accum_p90:.1f}, "
        f"p99={result.hydrology_metrics.flow_accum_p99:.1f}, "
        f"p99.9={result.hydrology_metrics.flow_accum_p999:.1f}"
    )
    print(f"Generation time: {generation_seconds:.3f} s ({args.w}x{args.h})")
    print(
        "Geomorph incision: "
        f"max={result.geomorph_metrics.max_incision_depth_m:.1f}m, "
        f"mean={result.geomorph_metrics.mean_incision_depth_m:.2f}m, "
        f"mean_incised={result.geomorph_metrics.mean_incision_depth_incised_m:.2f}m, "
        f"land_incised={result.geomorph_metrics.percent_land_incised * 100.0:.2f}%, "
        f"runtime={result.geomorph_metrics.incision_seconds:.3f}s"
    )
    print(
        "Trunk sinuosity: "
        f"segments={result.hydrology_metrics.trunk_sinuosity_segment_count}, "
        f"median={result.hydrology_metrics.trunk_sinuosity_median:.3f}, "
        f"p90={result.hydrology_metrics.trunk_sinuosity_p90:.3f}"
    )
    file_count = sum(1 for child in out_dir.iterdir() if child.is_file())
    print(f"Output files: {file_count}")
    return 0


def _land_scaled_preview_u8(values: np.ndarray, land_mask: np.ndarray, *, p_lo: float, p_hi: float) -> np.ndarray:
    out = np.zeros(values.shape, dtype=np.uint8)
    if not np.any(land_mask):
        return out
    land_vals = values[land_mask].astype(np.float32)
    lo, hi = np.percentile(land_vals, [p_lo, p_hi])
    scale = max(float(hi - lo), 1e-6)
    norm = np.clip((values.astype(np.float32) - float(lo)) / scale, 0.0, 1.0)
    out = np.round(norm * 255.0).astype(np.uint8)
    out[~land_mask] = 0
    return out


def _id_map_preview_u8(id_map: np.ndarray, land_mask: np.ndarray) -> np.ndarray:
    out = np.zeros(id_map.shape, dtype=np.uint8)
    ids = id_map.astype(np.int64)
    valid = land_mask & (ids >= 0)
    if not np.any(valid):
        return out
    # Deterministic hash-like remap to avoid monotone gradients.
    remapped = ((ids[valid] * 73 + 29) % 251) + 4
    out[valid] = remapped.astype(np.uint8)
    return out


def _outlet_points_preview(shape: tuple[int, int], outlet_points: np.ndarray) -> np.ndarray:
    out = np.zeros(shape, dtype=np.uint8)
    if outlet_points.size == 0:
        return out
    h, w = shape
    for y, x, cid in outlet_points:
        yy = int(np.clip(y, 0, h - 1))
        xx = int(np.clip(x, 0, w - 1))
        val = int((cid * 41) % 215) + 40
        out[yy, xx] = np.uint8(val)
        if yy + 1 < h:
            out[yy + 1, xx] = np.uint8(val)
        if xx + 1 < w:
            out[yy, xx + 1] = np.uint8(val)
    return out


def _moisture_colormap_rgb(values: np.ndarray) -> np.ndarray:
    v = np.clip(values.astype(np.float32), 0.0, 1.0)
    # Dry (tan) -> temperate (green) -> wet (blue)
    anchors = np.array([0.0, 0.5, 1.0], dtype=np.float32)
    r_anchor = np.array([210.0, 90.0, 20.0], dtype=np.float32)
    g_anchor = np.array([180.0, 140.0, 110.0], dtype=np.float32)
    b_anchor = np.array([120.0, 90.0, 190.0], dtype=np.float32)
    r = np.interp(v, anchors, r_anchor)
    g = np.interp(v, anchors, g_anchor)
    b = np.interp(v, anchors, b_anchor)
    return np.stack((r, g, b), axis=-1).astype(np.uint8)


if __name__ == "__main__":
    raise SystemExit(main())
