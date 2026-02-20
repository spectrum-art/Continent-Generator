"""Deterministic splittable RNG streams."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib

import numpy as np


def _normalize_seed(seed: int) -> int:
    return int(seed) & ((1 << 64) - 1)


def derive_seed(parent_seed: int, key: str, *, namespace: str = "terrain-ms0") -> int:
    """Derive a deterministic child seed from a parent seed and label."""

    payload = f"{namespace}:{_normalize_seed(parent_seed)}:{key}".encode("utf-8")
    digest = hashlib.blake2b(payload, digest_size=8, person=b"rngfork00").digest()
    return int.from_bytes(digest, byteorder="big", signed=False)


@dataclass(frozen=True)
class RngStream:
    """Immutable RNG stream that can be forked by deterministic stage names."""

    seed: int
    namespace: str = "terrain-ms0"

    def fork(self, key: str) -> "RngStream":
        if not key:
            raise ValueError("fork key must be non-empty")
        return RngStream(derive_seed(self.seed, key, namespace=self.namespace), self.namespace)

    def generator(self) -> np.random.Generator:
        return np.random.Generator(np.random.PCG64(np.uint64(_normalize_seed(self.seed))))
