from __future__ import annotations

from PIL import Image
import numpy as np

from terrain.config import GeneratorConfig
from terrain.derive import height_preview_u16
from terrain.heightfield import generate_heightfield
from terrain.io import write_png_u16
from terrain.metrics import ConnectivityMetrics
from terrain.rng import RngStream
from terrain.seed import parse_seed


def _generate_small_default() -> tuple[GeneratorConfig, np.ndarray, ConnectivityMetrics]:
    parsed = parse_seed("MistyForge")
    config = GeneratorConfig()
    result = generate_heightfield(256, 128, 5000.0, RngStream(parsed.seed_hash), config=config)
    return config, result.height_m, result.mask_metrics


def test_sanity_metrics_default_small_grid() -> None:
    _, height_m, metrics = _generate_small_default()

    assert 0.15 <= metrics.land_fraction <= 0.65
    assert metrics.largest_land_ratio >= 0.55
    assert float(np.max(height_m)) < 9000.0
    assert np.isfinite(height_m).all()


def test_height_preview_encoding_is_16bit(tmp_path) -> None:
    _, height_m, _ = _generate_small_default()
    preview = height_preview_u16(height_m)

    out_path = tmp_path / "height_16.png"
    write_png_u16(out_path, preview)

    with Image.open(out_path) as image:
        assert image.mode in {"I", "I;16"}
        assert image.size == (256, 128)
