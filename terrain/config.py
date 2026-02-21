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
    continentality_height_m: float = 1900.0
    ridge_height_m: float = 3000.0
    basin_height_m: float = 900.0
    crust_height_m: float = 460.0
    orogeny_strength_m: float = 2600.0
    rift_strength_m: float = 950.0
    transform_strength_m: float = 280.0
    tectonic_detail_m: float = 140.0
    interior_basin_strength_m: float = 1200.0
    stress_uplift_m: float = 520.0
    collision_damping: float = 0.22
    craton_detail_reduction: float = 0.55
    detail_land_m: float = 180.0
    detail_ocean_m: float = 70.0
    ocean_depth_m: float = 3200.0
    max_ocean_depth_m: float = 5200.0
    max_land_height_m: float = 6800.0
    min_land_height_m: float = 5.0
    uplift_warp_strength_px: float = 20.0
    ocean_shelf_blend: float = 0.55
    shelf_depth_power: float = 1.7
    erosion_thermal_strength: float = 0.055
    erosion_hydraulic_strength: float = 0.025
    erosion_iterations: int = 2
    detail_flow_damp_strength: float = 1.0
    detail_flow_damp_curve: float = 1.2
    detail_flow_threshold_cells: float = 500.0
    tectonic_noise_lambda_km: float = 200.0
    tectonic_noise_floor: float = 0.2
    tectonic_noise_distance_mode: str = "off"


@dataclass(frozen=True)
class TectonicsConfig:
    """Controls plate-proxy tectonic scaffold generation."""

    min_plate_count: int = 6
    max_plate_count: int = 12
    site_min_distance: float = 0.12
    plate_warp_octave_frequencies: tuple[float, ...] = (1.0, 2.3, 5.0, 11.0)
    plate_warp_octave_amplitudes: tuple[float, ...] = (1.0, 0.6, 0.35, 0.2)
    plate_warp_base_res: int = 2
    plate_warp_strength_px: float = 260.0
    tangent_warp_fraction: float = 0.72
    normal_warp_fraction: float = 0.28
    boundary_fragment_base_res: int = 14
    boundary_fragment_octaves: int = 3
    boundary_fragment_strength: float = 0.35
    min_lithosphere_thickness_px: int = 9
    thickness_search_radius_px: int = 26
    curvature_limit: float = 0.64
    curvature_smooth_radius_px: int = 2
    boundary_convergence_threshold: float = 0.25
    blur_passes: int = 3
    orogeny_radius_px: int = 8
    rift_radius_px: int = 8
    transform_radius_px: int = 6
    crust_radius_px: int = 26
    shelf_radius_px: int = 20
    orogeny_gamma: float = 0.9
    rift_gamma: float = 0.9
    transform_gamma: float = 1.2
    triple_junction_radius_px: int = 7
    triple_junction_boost: float = 0.7
    orogeny_tangent_base_res: int = 7
    orogeny_tangent_octaves: int = 4
    deformation_max_radius_px: int = 64
    sigma_convergent_base_px: float = 24.0
    sigma_divergent_base_px: float = 16.0
    sigma_transform_base_px: float = 10.0
    segment_noise_base_res: int = 12
    segment_noise_octaves: int = 3
    collision_softmax_temperature: float = 0.35
    crust_blend_radius_px: int = 12
    crust_boundary_sigma_px: float = 12.0
    stress_decay_power: float = 1.25
    interior_basin_base_res: int = 3
    interior_basin_octaves: int = 4
    interior_basin_radius_px: int = 18
    interior_basin_power: float = 1.4
    crust_power: float = 1.3
    shelf_power: float = 1.8


@dataclass(frozen=True)
class HydrologyConfig:
    """Controls hydrology, river carving, lakes, erosion, and shoreline shaping."""

    hydro_smooth_sigma_px: float = 2.0
    hydro_lakes: float = 0.35
    hydro_capture_strength: float = 0.6
    hydro_capture_max_sill: float = 1400.0
    hydro_capture_min_basin_pixels: int = 2000
    hydro_capture_max_link_length_px: int = 512
    hydro_outlet_merge_radius_px: int = 8
    hydro_outlet_min_basin_pixels: int = 900
    river_accum_threshold_base: float = 0.002
    river_frequency: float = 0.5
    river_max_width_px: float = 6.0
    river_max_incision_m: float = 220.0
    river_width_power: float = 0.5
    lake_encouragement: float = 0.5
    breach_search_radius_px: int = 32
    breach_slope_bias: float = 1.2
    erosion_stream_power_k: float = 0.04
    erosion_stream_power_m: float = 0.5
    erosion_stream_power_n: float = 1.0
    erosion_diffusion_strength: float = 0.015
    erosion_iterations: int = 2
    shore_falloff_strength_m: float = 180.0
    shore_falloff_power: float = 1.4
    depression_fill_enabled: bool = False
    depression_flat_epsilon_m: float = 0.02
    depression_breach_enabled: bool = True
    depression_breach_max_saddle_m: float = 25.0
    trunk_sinuosity_min_flow_cells: float = 500.0


@dataclass(frozen=True)
class GeomorphConfig:
    """Controls static hierarchical fluvial incision on hydro-conditioned height."""

    geomorph_incision_strength: float = 0.002
    geomorph_incision_m: float = 0.6
    geomorph_incision_n: float = 1.0
    geomorph_max_depth_m: float = 800.0
    geomorph_valley_blur_sigma_px: float = 1.5
    geomorph_a_min: float = 0.01
    geomorph_ridge_preserve: float = 0.45
    geomorph_use_physical_stream_power: bool = True
    geomorph_power_scale_percentile: float = 99.9


@dataclass(frozen=True)
class RenderConfig:
    """Derived raster rendering configuration."""

    hillshade_azimuth_deg: float = 315.0
    hillshade_altitude_deg: float = 45.0
    hillshade_vertical_exaggeration: float = 6.0


@dataclass(frozen=True)
class GeneratorConfig:
    """Primary generation configuration."""

    debug_tier: int = 0
    mask: MaskConfig = field(default_factory=MaskConfig)
    height: HeightConfig = field(default_factory=HeightConfig)
    tectonics: TectonicsConfig = field(default_factory=TectonicsConfig)
    hydrology: HydrologyConfig = field(default_factory=HydrologyConfig)
    geomorph: GeomorphConfig = field(default_factory=GeomorphConfig)
    render: RenderConfig = field(default_factory=RenderConfig)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
