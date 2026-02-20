import pytest

from terrain.seed import ParsedSeed, SeedParseError, parse_seed


def test_parse_seed_camel_case() -> None:
    parsed = parse_seed("MistyForge")

    assert isinstance(parsed, ParsedSeed)
    assert parsed.adjective == "misty"
    assert parsed.noun == "forge"
    assert parsed.canonical == "mistyforge"


def test_parse_seed_case_insensitive() -> None:
    a = parse_seed("mistyforge")
    b = parse_seed("MISTYFORGE")
    c = parse_seed("MistyForge")

    assert a.canonical == b.canonical == c.canonical
    assert a.seed_hash == b.seed_hash == c.seed_hash


def test_parse_seed_invalid_has_friendly_error() -> None:
    with pytest.raises(SeedParseError) as exc:
        parse_seed("Misty-Forge")

    message = str(exc.value)
    assert "Examples:" in message
    assert "MistyForge" in message
