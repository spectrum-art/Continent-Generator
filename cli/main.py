"""CLI entry point for terrain generation."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import platform
import time

import numpy as np
from terrain.config import DEFAULT_HEIGHT, DEFAULT_MPP, DEFAULT_WIDTH, GeneratorConfig
from terrain.derive import (
    boundary_type_u8,
    float_preview_u8,
    height_preview_u16,
    hillshade,
    land_mask_u8,
    plate_ids_u8,
    signed_preview_u8,
)
from terrain.heightfield import generate_heightfield
from terrain.io import resolve_output_dir, write_height_npy, write_json, write_png_u16, write_png_u8
from terrain.rng import RngStream
from terrain.seed import SeedParseError, parse_seed


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Deterministic continent-scale terrain generator")
    parser.add_argument("--seed", required=True, help="Readable seed in adjective+noun form (e.g. MistyForge)")
    parser.add_argument("--out", default="out", help="Output root directory")
    parser.add_argument("--w", type=int, default=DEFAULT_WIDTH, help="Output width in pixels")
    parser.add_argument("--h", type=int, default=DEFAULT_HEIGHT, help="Output height in pixels")
    parser.add_argument("--mpp", type=float, default=DEFAULT_MPP, help="Meters per pixel")
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

    config = GeneratorConfig()
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
        result.height_m,
        meters_per_pixel=args.mpp,
        azimuth_deg=config.render.hillshade_azimuth_deg,
        altitude_deg=config.render.hillshade_altitude_deg,
        z_factor=config.render.hillshade_z_factor,
    )
    height_16 = height_preview_u16(result.height_m)
    mask_8 = land_mask_u8(result.land_mask)
    potential_8 = float_preview_u8(result.mask_potential, robust_percentiles=(1.0, 99.0))
    uplift_8 = float_preview_u8(result.uplift, robust_percentiles=(1.0, 99.0))
    plates_8 = plate_ids_u8(result.tectonics.raw_plate_ids, result.tectonics.plate_count)
    warped_plates_8 = plate_ids_u8(result.tectonics.warped_plate_ids, result.tectonics.plate_count)
    boundary_warp_map_8 = float_preview_u8(result.tectonics.boundary_warp_magnitude, robust_percentiles=(0.0, 100.0))
    boundary_type_8 = boundary_type_u8(result.tectonics.boundary_type)
    convergence_8 = signed_preview_u8(result.tectonics.convergence_field)
    rift_8 = float_preview_u8(result.tectonics.rift_field, robust_percentiles=(0.0, 100.0))
    transform_8 = float_preview_u8(result.tectonics.transform_field, robust_percentiles=(0.0, 100.0))
    crust_8 = float_preview_u8(result.tectonics.crust_thickness, robust_percentiles=(0.0, 100.0))
    orogeny_8 = float_preview_u8(result.tectonics.orogeny_field, robust_percentiles=(0.0, 100.0))

    out_dir = resolve_output_dir(
        args.out,
        parsed_seed.canonical,
        args.w,
        args.h,
        overwrite=args.overwrite,
    )

    write_height_npy(out_dir / "height.npy", result.height_m)
    write_png_u16(out_dir / "height_16.png", height_16)
    write_png_u8(out_dir / "hillshade.png", shade)
    write_png_u8(out_dir / "land_mask.png", mask_8)
    write_png_u8(out_dir / "debug_mask_potential.png", potential_8)
    write_png_u8(out_dir / "debug_uplift.png", uplift_8)
    write_png_u8(out_dir / "debug_plates.png", plates_8)
    write_png_u8(out_dir / "debug_warped_plate_ids.png", warped_plates_8)
    write_png_u8(out_dir / "debug_boundary_warp_map.png", boundary_warp_map_8)
    write_png_u8(out_dir / "debug_boundary_type.png", boundary_type_8)
    write_png_u8(out_dir / "debug_convergence.png", convergence_8)
    write_png_u8(out_dir / "debug_rift.png", rift_8)
    write_png_u8(out_dir / "debug_transform.png", transform_8)
    write_png_u8(out_dir / "debug_crust.png", crust_8)
    write_png_u8(out_dir / "debug_orogeny.png", orogeny_8)

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
            },
            "tectonics": {
                "plate_count": result.tectonics.plate_count,
                "boundary_pixels": int(result.tectonics.boundary_mask.sum()),
            },
        }
        meta = {
            **deterministic_meta,
            "generated_at_utc": timestamp,
            "original_seed": parsed_seed.original,
            "generation_seconds": generation_seconds,
            "python_version": platform.python_version(),
            "numpy_version": np.__version__,
        }
        write_json(out_dir / "deterministic_meta.json", deterministic_meta)
        write_json(out_dir / "meta.json", meta)

    print(f"Generated terrain: {out_dir}")
    print(
        "Land fraction "
        f"{result.mask_metrics.land_fraction:.3f}; "
        f"dominant landmass ratio {result.mask_metrics.largest_land_ratio:.3f}"
    )
    print(f"Generation time: {generation_seconds:.3f} s ({args.w}x{args.h})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
