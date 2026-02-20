from terrain.config import MaskConfig
from terrain.mask import generate_land_mask
from terrain.rng import RngStream
from terrain.seed import parse_seed


def test_land_fraction_and_dominant_landmass_ratio() -> None:
    parsed = parse_seed("MistyForge")
    rng = RngStream(parsed.seed_hash)

    result = generate_land_mask(
        256,
        128,
        rng,
        config=MaskConfig(fragmentation=0.2),
    )

    assert 0.15 <= result.metrics.land_fraction <= 0.65
    assert result.metrics.largest_land_ratio >= 0.55
    assert result.metrics.num_components >= 1
