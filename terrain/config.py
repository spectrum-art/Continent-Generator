"""Configuration models for terrain generation."""

from dataclasses import dataclass


DEFAULT_WIDTH = 2048
DEFAULT_HEIGHT = 1024
DEFAULT_MPP = 5000.0


@dataclass(frozen=True)
class GeneratorConfig:
    """Primary generation configuration."""

    fragmentation: float = 0.2


@dataclass(frozen=True)
class RenderConfig:
    """Derived raster rendering configuration."""

    hillshade_azimuth_deg: float = 315.0
    hillshade_altitude_deg: float = 45.0
