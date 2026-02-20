"""Plate-proxy tectonic scaffold for structured uplift fields."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from terrain.config import TectonicsConfig
from terrain.rng import RngStream


@dataclass(frozen=True)
class TectonicsResult:
    """Generated tectonic fields for height composition and debugging."""

    plate_count: int
    plate_ids: np.ndarray
    boundary_type: np.ndarray
    convergence_field: np.ndarray
    orogeny_field: np.ndarray
    rift_field: np.ndarray
    transform_field: np.ndarray
    crust_thickness: np.ndarray
    shelf_proximity: np.ndarray


def generate_tectonic_scaffold(
    width: int,
    height: int,
    land_mask: np.ndarray,
    rng: RngStream,
    *,
    config: TectonicsConfig | None = None,
) -> TectonicsResult:
    """Generate tectonic scaffold fields.

    Milestone 1 commit 1 scaffolding only. The full implementation is
    added in subsequent commits.
    """

    if width <= 0 or height <= 0:
        raise ValueError("width and height must be positive")

    cfg = config or TectonicsConfig()
    zeros_f = np.zeros((height, width), dtype=np.float32)
    zeros_i = np.zeros((height, width), dtype=np.int16)
    return TectonicsResult(
        plate_count=cfg.min_plate_count,
        plate_ids=zeros_i,
        boundary_type=zeros_i.astype(np.int8),
        convergence_field=zeros_f,
        orogeny_field=zeros_f,
        rift_field=zeros_f,
        transform_field=zeros_f,
        crust_thickness=zeros_f,
        shelf_proximity=zeros_f,
    )
