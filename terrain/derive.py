"""Derived raster products from heightfields."""

from __future__ import annotations

import numpy as np


def hillshade(
    height_m: np.ndarray,
    *,
    meters_per_pixel: float,
    azimuth_deg: float = 315.0,
    altitude_deg: float = 45.0,
    z_factor: float = 1.0,
) -> np.ndarray:
    """Compute an 8-bit grayscale hillshade from a heightfield."""

    if height_m.ndim != 2:
        raise ValueError("height_m must be a 2D array")
    if meters_per_pixel <= 0:
        raise ValueError("meters_per_pixel must be positive")

    dz_dy, dz_dx = np.gradient(height_m.astype(np.float32), meters_per_pixel, meters_per_pixel)
    dz_dx = dz_dx * float(z_factor)
    dz_dy = dz_dy * float(z_factor)

    slope = np.pi / 2.0 - np.arctan(np.hypot(dz_dx, dz_dy))
    aspect = np.arctan2(-dz_dx, dz_dy)

    azimuth = np.deg2rad(azimuth_deg)
    altitude = np.deg2rad(altitude_deg)

    shaded = (
        np.sin(altitude) * np.sin(slope)
        + np.cos(altitude) * np.cos(slope) * np.cos(azimuth - aspect)
    )
    shaded = np.clip(shaded, 0.0, 1.0)
    return np.round(shaded * 255.0).astype(np.uint8)


def height_preview_u16(height_m: np.ndarray, *, robust_percentiles: tuple[float, float] = (1.0, 99.0)) -> np.ndarray:
    """Map float height values to 16-bit preview grayscale."""

    lo, hi = np.percentile(height_m, robust_percentiles)
    scale = max(hi - lo, 1e-6)
    norm = np.clip((height_m - lo) / scale, 0.0, 1.0)
    return np.round(norm * 65535.0).astype(np.uint16)


def float_preview_u8(values: np.ndarray, *, robust_percentiles: tuple[float, float] = (1.0, 99.0)) -> np.ndarray:
    """Map float values to 8-bit preview grayscale."""

    lo, hi = np.percentile(values, robust_percentiles)
    scale = max(hi - lo, 1e-6)
    norm = np.clip((values - lo) / scale, 0.0, 1.0)
    return np.round(norm * 255.0).astype(np.uint8)


def land_mask_u8(mask: np.ndarray) -> np.ndarray:
    """Encode boolean land mask to 8-bit preview image."""

    return np.where(mask, 255, 0).astype(np.uint8)


def plate_ids_u8(plate_ids: np.ndarray, plate_count: int) -> np.ndarray:
    """Encode integer plate IDs into 8-bit grayscale for debugging."""

    if plate_count <= 1:
        return np.zeros_like(plate_ids, dtype=np.uint8)
    scaled = plate_ids.astype(np.float32) / float(plate_count - 1)
    return np.round(np.clip(scaled, 0.0, 1.0) * 255.0).astype(np.uint8)


def boundary_type_u8(boundary_type: np.ndarray) -> np.ndarray:
    """Encode boundary types to deterministic grayscale classes."""

    lut = np.array([0, 85, 170, 255], dtype=np.uint8)
    clipped = np.clip(boundary_type.astype(np.int16), 0, 3)
    return lut[clipped]


def signed_preview_u8(values: np.ndarray, *, clip: float = 1.0) -> np.ndarray:
    """Map signed float values in [-clip, clip] into 8-bit [0, 255]."""

    normalized = np.clip(values.astype(np.float32) / max(clip, 1e-6), -1.0, 1.0)
    encoded = (normalized * 0.5) + 0.5
    return np.round(encoded * 255.0).astype(np.uint8)
