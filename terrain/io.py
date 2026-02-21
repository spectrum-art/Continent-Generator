"""Output serialization for generated terrain artifacts."""

from __future__ import annotations

import json
from pathlib import Path
import shutil
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


def safe_clean_output_dir(target: Path, *, out_root: Path, project_root: Path) -> None:
    """Delete all children of target directory with strict path-safety guards."""

    out_root_r = out_root.resolve()
    project_root_r = project_root.resolve()
    target_r = target.resolve()
    target_r.relative_to(out_root_r)
    out_root_r.relative_to(project_root_r)

    if not target_r.exists():
        target_r.mkdir(parents=True, exist_ok=True)
        return

    for child in target_r.iterdir():
        if child.is_symlink() or child.is_file():
            child.unlink()
        elif child.is_dir():
            shutil.rmtree(child)


def move_tree_contents(src_dir: Path, dst_dir: Path) -> None:
    """Move all files from src_dir into dst_dir."""

    for child in src_dir.iterdir():
        shutil.move(str(child), str(dst_dir / child.name))


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
