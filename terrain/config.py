"""Configuration models for terrain generation."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


DEFAULT_WIDTH = 2048
DEFAULT_HEIGHT = 1024
DEFAULT_MPP = 5000.0


@dataclass(frozen=True)
class MaskConfig:
    """Controls continent and island mask synthesis."""

    target_land_fraction: float = 0.36
    min_land_fraction: float = 0.15
    max_land_fraction: float = 0.65
    dominant_land_ratio: float = 0.55
    fragmentation: float = 0.2
    base_octaves: int = 5
    warp_octaves: int = 3
    warp_strength_px: float = 28.0
    coast_bias_strength: float = 0.70
    smooth_iterations: int = 2
    threshold_relaxation: float = 0.04


@dataclass(frozen=True)
class HeightConfig:
    """Controls macro and detail terrain amplitudes in meters."""

    base_land_lift_m: float = 80.0
    continentality_height_m: float = 2300.0
    ridge_height_m: float = 3000.0
    basin_height_m: float = 900.0
    crust_height_m: float = 460.0
    orogeny_strength_m: float = 2600.0
    rift_strength_m: float = 950.0
    transform_strength_m: float = 280.0
    tectonic_detail_m: float = 140.0
    detail_land_m: float = 180.0
    detail_ocean_m: float = 70.0
    ocean_depth_m: float = 3200.0
    max_ocean_depth_m: float = 5200.0
    max_land_height_m: float = 6800.0
    min_land_height_m: float = 5.0
    uplift_warp_strength_px: float = 20.0
    ocean_shelf_blend: float = 0.55
    shelf_depth_power: float = 1.7


@dataclass(frozen=True)
class TectonicsConfig:
    """Controls plate-proxy tectonic scaffold generation."""

    min_plate_count: int = 6
    max_plate_count: int = 12
    site_min_distance: float = 0.12
    plate_warp_base_res: int = 2
    plate_warp_octaves: int = 3
    plate_warp_strength_px: float = 120.0
    boundary_jitter_base_res: int = 10
    boundary_jitter_octaves: int = 3
    boundary_jitter_strength_px: float = 14.0
    boundary_convergence_threshold: float = 0.25
    blur_passes: int = 3
    orogeny_radius_px: int = 10
    rift_radius_px: int = 8
    transform_radius_px: int = 6
    crust_radius_px: int = 26
    shelf_radius_px: int = 20
    orogeny_gamma: float = 0.8
    rift_gamma: float = 0.9
    transform_gamma: float = 1.2
    crust_power: float = 1.3
    shelf_power: float = 1.8


@dataclass(frozen=True)
class RenderConfig:
    """Derived raster rendering configuration."""

    hillshade_azimuth_deg: float = 315.0
    hillshade_altitude_deg: float = 45.0
    hillshade_z_factor: float = 8.0


@dataclass(frozen=True)
class GeneratorConfig:
    """Primary generation configuration."""

    mask: MaskConfig = field(default_factory=MaskConfig)
    height: HeightConfig = field(default_factory=HeightConfig)
    tectonics: TectonicsConfig = field(default_factory=TectonicsConfig)
    render: RenderConfig = field(default_factory=RenderConfig)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
