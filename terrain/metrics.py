"""Terrain quality and connectivity metrics."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class ConnectivityMetrics:
    """Connected component and coverage summary for a boolean land mask."""

    num_components: int
    largest_component_area: int
    total_land_pixels: int
    largest_land_ratio: float
    land_fraction: float


def connected_components_metrics(mask: np.ndarray, *, connectivity: int = 8) -> ConnectivityMetrics:
    """Compute connected component statistics for a land mask."""

    if mask.ndim != 2:
        raise ValueError("mask must be 2D")
    if connectivity not in (4, 8):
        raise ValueError("connectivity must be 4 or 8")

    mask_bool = mask.astype(bool, copy=False)
    height, width = mask_bool.shape
    total_pixels = height * width
    total_land = int(mask_bool.sum())

    if total_land == 0:
        return ConnectivityMetrics(0, 0, 0, 0.0, 0.0)

    flat = mask_bool.ravel()
    visited = np.zeros(flat.shape[0], dtype=np.uint8)
    sizes: list[int] = []

    for start in np.flatnonzero(flat):
        if visited[start]:
            continue
        visited[start] = 1
        stack = [int(start)]
        component_size = 0

        while stack:
            current = stack.pop()
            component_size += 1
            y = current // width
            x = current - y * width

            for ny in range(max(0, y - 1), min(height, y + 2)):
                for nx in range(max(0, x - 1), min(width, x + 2)):
                    if ny == y and nx == x:
                        continue
                    if connectivity == 4 and ny != y and nx != x:
                        continue
                    idx = ny * width + nx
                    if flat[idx] and not visited[idx]:
                        visited[idx] = 1
                        stack.append(idx)

        sizes.append(component_size)

    largest = max(sizes)
    return ConnectivityMetrics(
        num_components=len(sizes),
        largest_component_area=largest,
        total_land_pixels=total_land,
        largest_land_ratio=float(largest / total_land),
        land_fraction=float(total_land / total_pixels),
    )
