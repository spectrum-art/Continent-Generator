from __future__ import annotations

import hashlib

import numpy as np

from terrain.config import GeneratorConfig
from terrain.derive import hillshade
from terrain.heightfield import generate_heightfield
from terrain.rng import RngStream
from terrain.seed import parse_seed


def _hash_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def test_height_and_hillshade_are_deterministic() -> None:
    parsed = parse_seed("MistyForge")
    config = GeneratorConfig()

    run_a = generate_heightfield(256, 128, 5000.0, RngStream(parsed.seed_hash), config=config)
    run_b = generate_heightfield(256, 128, 5000.0, RngStream(parsed.seed_hash), config=config)

    hill_a = hillshade(run_a.height_m, meters_per_pixel=5000.0)
    hill_b = hillshade(run_b.height_m, meters_per_pixel=5000.0)

    assert np.array_equal(run_a.height_m, run_b.height_m)
    assert np.array_equal(hill_a, hill_b)
    assert _hash_bytes(run_a.height_m.tobytes()) == _hash_bytes(run_b.height_m.tobytes())
    assert _hash_bytes(hill_a.tobytes()) == _hash_bytes(hill_b.tobytes())
