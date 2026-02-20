from __future__ import annotations

import hashlib

import numpy as np

from terrain.config import GeneratorConfig
from terrain.mask import generate_land_mask
from terrain.rng import RngStream
from terrain.seed import parse_seed
from terrain.tectonics import generate_tectonic_scaffold


def _sha256_bytes(data: np.ndarray) -> str:
    return hashlib.sha256(data.tobytes()).hexdigest()


def test_plate_partition_is_deterministic() -> None:
    parsed = parse_seed("MistyForge")
    cfg = GeneratorConfig()

    land = generate_land_mask(192, 96, RngStream(parsed.seed_hash).fork("mask"), config=cfg.mask).land_mask

    tect_a = generate_tectonic_scaffold(
        192,
        96,
        land,
        RngStream(parsed.seed_hash).fork("tectonics"),
        config=cfg.tectonics,
    )
    tect_b = generate_tectonic_scaffold(
        192,
        96,
        land,
        RngStream(parsed.seed_hash).fork("tectonics"),
        config=cfg.tectonics,
    )

    assert tect_a.plate_count == tect_b.plate_count
    assert np.array_equal(tect_a.plate_ids, tect_b.plate_ids)
    assert np.array_equal(tect_a.boundary_type, tect_b.boundary_type)
    assert _sha256_bytes(tect_a.plate_ids) == _sha256_bytes(tect_b.plate_ids)
    assert int(tect_a.boundary_mask.sum()) > 0
