from __future__ import annotations

import hashlib

import numpy as np

from terrain.config import GeneratorConfig
from terrain.heightfield import generate_heightfield
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
    assert np.array_equal(tect_a.convergence_field, tect_b.convergence_field)
    assert np.array_equal(tect_a.orogeny_field, tect_b.orogeny_field)
    assert np.array_equal(tect_a.rift_field, tect_b.rift_field)
    assert _sha256_bytes(tect_a.plate_ids) == _sha256_bytes(tect_b.plate_ids)
    assert int(tect_a.boundary_mask.sum()) > 0


def test_tectonic_fields_are_structured_not_uniform() -> None:
    parsed = parse_seed("MistyForge")
    cfg = GeneratorConfig()
    result = generate_heightfield(256, 128, 5000.0, RngStream(parsed.seed_hash), config=cfg)

    tect = result.tectonics
    land_orogeny = tect.orogeny_field[result.land_mask]

    assert int(tect.boundary_mask.sum()) > 0
    assert int((tect.boundary_type == 1).sum()) > 0
    assert float(np.var(land_orogeny)) > 1e-4
    assert float(np.max(tect.rift_field)) > 0.01
