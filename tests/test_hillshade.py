from __future__ import annotations

import numpy as np

from terrain.config import GeneratorConfig
from terrain.derive import hillshade
from terrain.heightfield import generate_heightfield
from terrain.rng import RngStream
from terrain.seed import parse_seed


def test_hillshade_vertical_exaggeration_changes_output() -> None:
    parsed = parse_seed("MistyForge")
    config = GeneratorConfig()
    result = generate_heightfield(256, 128, 5000.0, RngStream(parsed.seed_hash), config=config)

    shade_1x = hillshade(result.h_geomorph, meters_per_pixel=5000.0, hillshade_vertical_exaggeration=1.0)
    shade_6x = hillshade(result.h_geomorph, meters_per_pixel=5000.0, hillshade_vertical_exaggeration=6.0)

    assert not np.array_equal(shade_1x, shade_6x)
    mad = float(np.mean(np.abs(shade_6x.astype(np.float32) - shade_1x.astype(np.float32))))
    assert mad > 1.5
