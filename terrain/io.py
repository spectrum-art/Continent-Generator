"""Output serialization for generated terrain artifacts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image


def resolve_output_dir(
    out_root: str | Path,
    canonical_seed: str,
    width: int,
    height: int,
    *,
    overwrite: bool,
) -> Path:
    """Create and return the output directory for one generation run."""

    target = Path(out_root) / canonical_seed / f"{width}x{height}"
    if target.exists() and any(target.iterdir()) and not overwrite:
        raise FileExistsError(
            f"Output directory already exists and is not empty: {target}. Use --overwrite to replace files."
        )
    target.mkdir(parents=True, exist_ok=True)
    return target


def write_height_npy(path: str | Path, height_m: np.ndarray) -> None:
    np.save(Path(path), height_m.astype(np.float32), allow_pickle=False)


def write_png_u16(path: str | Path, raster_u16: np.ndarray) -> None:
    image = Image.fromarray(raster_u16.astype(np.uint16))
    image.save(Path(path))


def write_png_u8(path: str | Path, raster_u8: np.ndarray) -> None:
    image = Image.fromarray(raster_u8.astype(np.uint8), mode="L")
    image.save(Path(path))


def write_json(path: str | Path, payload: dict[str, Any]) -> None:
    text = json.dumps(payload, indent=2, sort_keys=True)
    Path(path).write_text(text + "\n", encoding="utf-8")
