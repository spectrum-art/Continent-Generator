from __future__ import annotations

import json

from cli.main import main


def test_runtime_fields_only_in_meta_json(tmp_path) -> None:
    out_dir = tmp_path / "out"
    code = main(
        [
            "--seed",
            "MistyForge",
            "--out",
            str(out_dir),
            "--w",
            "96",
            "--h",
            "64",
            "--mpp",
            "5000",
            "--overwrite",
        ]
    )
    assert code == 0

    base = out_dir / "mistyforge" / "96x64"
    meta = json.loads((base / "meta.json").read_text(encoding="utf-8"))
    deterministic_meta = json.loads((base / "deterministic_meta.json").read_text(encoding="utf-8"))

    assert "generation_seconds" in meta
    assert meta["generation_seconds"] >= 0.0
    assert "generated_at_utc" in meta

    assert "generation_seconds" not in deterministic_meta
    assert "generated_at_utc" not in deterministic_meta
