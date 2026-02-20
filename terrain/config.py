"""Configuration models for terrain generation."""

from __future__ import annotations

from dataclasses import dataclass, field


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
class GeneratorConfig:
    """Primary generation configuration."""

    mask: MaskConfig = field(default_factory=MaskConfig)


@dataclass(frozen=True)
class RenderConfig:
    """Derived raster rendering configuration."""

    hillshade_azimuth_deg: float = 315.0
    hillshade_altitude_deg: float = 45.0
