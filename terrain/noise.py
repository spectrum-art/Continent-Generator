"""Noise functions used by terrain pipeline."""

from __future__ import annotations

import numpy as np


def _smoothstep(t: np.ndarray) -> np.ndarray:
    return t * t * (3.0 - 2.0 * t)


def value_noise_2d(
    width: int,
    height: int,
    rng: np.random.Generator,
    *,
    res_x: int,
    res_y: int,
) -> np.ndarray:
    """Generate value noise in [-1, 1] from a coarse random lattice."""

    if width <= 0 or height <= 0:
        raise ValueError("width and height must be positive")
    if res_x < 1 or res_y < 1:
        raise ValueError("res_x and res_y must be >= 1")

    grid = rng.uniform(-1.0, 1.0, size=(res_y + 1, res_x + 1)).astype(np.float32)

    xs = np.linspace(0.0, float(res_x), num=width, endpoint=False, dtype=np.float32)
    ys = np.linspace(0.0, float(res_y), num=height, endpoint=False, dtype=np.float32)

    x0 = np.floor(xs).astype(np.int32)
    y0 = np.floor(ys).astype(np.int32)
    x1 = np.minimum(x0 + 1, res_x)
    y1 = np.minimum(y0 + 1, res_y)

    tx = _smoothstep(xs - x0)
    ty = _smoothstep(ys - y0)

    g00 = grid[y0[:, None], x0[None, :]]
    g10 = grid[y0[:, None], x1[None, :]]
    g01 = grid[y1[:, None], x0[None, :]]
    g11 = grid[y1[:, None], x1[None, :]]

    top = g00 * (1.0 - tx[None, :]) + g10 * tx[None, :]
    bottom = g01 * (1.0 - tx[None, :]) + g11 * tx[None, :]
    noise = top * (1.0 - ty[:, None]) + bottom * ty[:, None]
    return noise.astype(np.float32)


def fbm_noise(
    width: int,
    height: int,
    rng: np.random.Generator,
    *,
    base_res: int = 2,
    octaves: int = 5,
    lacunarity: float = 2.0,
    gain: float = 0.5,
) -> np.ndarray:
    """Generate fBm value noise in approximately [-1, 1]."""

    field = np.zeros((height, width), dtype=np.float32)
    amplitude = 1.0
    total_amplitude = 0.0
    aspect = width / max(height, 1)

    for octave in range(octaves):
        freq = lacunarity**octave
        res_y = max(1, int(round(base_res * freq)))
        res_x = max(1, int(round(res_y * aspect)))
        layer = value_noise_2d(width, height, rng, res_x=res_x, res_y=res_y)
        field += amplitude * layer
        total_amplitude += amplitude
        amplitude *= gain

    if total_amplitude == 0:
        return field
    return (field / total_amplitude).astype(np.float32)


def bilinear_sample(field: np.ndarray, sample_x: np.ndarray, sample_y: np.ndarray) -> np.ndarray:
    """Sample `field` at float pixel coordinates using bilinear interpolation."""

    height, width = field.shape
    x = np.clip(sample_x, 0.0, width - 1.001)
    y = np.clip(sample_y, 0.0, height - 1.001)

    x0 = np.floor(x).astype(np.int32)
    y0 = np.floor(y).astype(np.int32)
    x1 = np.minimum(x0 + 1, width - 1)
    y1 = np.minimum(y0 + 1, height - 1)

    tx = x - x0
    ty = y - y0

    g00 = field[y0, x0]
    g10 = field[y0, x1]
    g01 = field[y1, x0]
    g11 = field[y1, x1]

    top = g00 * (1.0 - tx) + g10 * tx
    bottom = g01 * (1.0 - tx) + g11 * tx
    return (top * (1.0 - ty) + bottom * ty).astype(np.float32)


def warp_field(field: np.ndarray, warp_x: np.ndarray, warp_y: np.ndarray, *, strength_px: float) -> np.ndarray:
    """Domain-warp `field` using displacement vectors in [-1, 1]."""

    height, width = field.shape
    yy, xx = np.indices((height, width), dtype=np.float32)
    sample_x = xx + warp_x.astype(np.float32) * strength_px
    sample_y = yy + warp_y.astype(np.float32) * strength_px
    return bilinear_sample(field, sample_x, sample_y)
