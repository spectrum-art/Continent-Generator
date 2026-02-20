"""Seed parsing, canonicalization, and hashing utilities."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import re

ADJECTIVES = [
    "ancient",
    "ashen",
    "autumn",
    "bitter",
    "black",
    "bleak",
    "blue",
    "bold",
    "brisk",
    "bronze",
    "calm",
    "clear",
    "cold",
    "crimson",
    "dark",
    "dawn",
    "deep",
    "dusty",
    "eager",
    "ember",
    "faded",
    "fierce",
    "frozen",
    "gentle",
    "golden",
    "grand",
    "gray",
    "green",
    "grim",
    "hollow",
    "icy",
    "iron",
    "jagged",
    "keen",
    "lively",
    "lone",
    "long",
    "lunar",
    "misty",
    "mossy",
    "noble",
    "north",
    "old",
    "pale",
    "pine",
    "primal",
    "quiet",
    "rapid",
    "red",
    "remote",
    "rough",
    "royal",
    "rugged",
    "sable",
    "scarlet",
    "silent",
    "silver",
    "smoky",
    "snowy",
    "solid",
    "south",
    "spare",
    "spring",
    "stone",
    "storm",
    "strong",
    "summer",
    "swift",
    "timber",
    "vast",
    "verdant",
    "warm",
    "west",
    "white",
    "wild",
    "winter",
    "young",
]

NOUNS = [
    "anchor",
    "arch",
    "atlas",
    "basin",
    "beacon",
    "bend",
    "bluff",
    "bridge",
    "brook",
    "cairn",
    "canyon",
    "cape",
    "cavern",
    "citadel",
    "cliff",
    "coast",
    "cove",
    "crown",
    "delta",
    "dune",
    "fall",
    "fang",
    "field",
    "fjord",
    "forge",
    "forest",
    "gate",
    "glade",
    "gorge",
    "grove",
    "harbor",
    "haven",
    "height",
    "hill",
    "hollow",
    "isle",
    "keep",
    "knoll",
    "lagoon",
    "lake",
    "march",
    "marsh",
    "mesa",
    "moor",
    "mount",
    "peak",
    "plain",
    "point",
    "range",
    "reach",
    "reef",
    "rest",
    "ridge",
    "river",
    "shore",
    "sound",
    "spire",
    "spring",
    "steppe",
    "strait",
    "summit",
    "tarn",
    "thicket",
    "vale",
    "valley",
    "vault",
    "vista",
    "watch",
    "water",
    "way",
    "wilds",
    "wood",
    "yard",
]

ADJECTIVE_SET = frozenset(ADJECTIVES)
NOUN_SET = frozenset(NOUNS)

_CAMEL_RE = re.compile(r"[A-Z]+(?=[A-Z][a-z]|$)|[A-Z]?[a-z]+")
_ALPHA_RE = re.compile(r"^[A-Za-z]+$")

_EXAMPLE_SEEDS = ["MistyForge", "AncientHarbor", "CrimsonRidge", "SilentCove", "VerdantVale"]


class SeedParseError(ValueError):
    """Raised when a seed is invalid or ambiguous."""


@dataclass(frozen=True)
class ParsedSeed:
    """Validated seed parts and deterministic metadata."""

    original: str
    adjective: str
    noun: str
    canonical: str
    seed_hash: int


def canonical_seed(adjective: str, noun: str) -> str:
    """Return canonical lowercase concatenated seed."""

    return f"{adjective}{noun}"


def seed_hash64(seed: str) -> int:
    """Hash canonical seed to a deterministic unsigned 64-bit integer."""

    digest = hashlib.blake2b(
        seed.encode("ascii", errors="strict"),
        digest_size=8,
        person=b"terrainm0",
    ).digest()
    return int.from_bytes(digest, byteorder="big", signed=False)


def parse_seed(seed_text: str) -> ParsedSeed:
    """Parse `seed_text` into adjective+noun form using internal dictionaries."""

    if seed_text is None:
        raise SeedParseError(_error_message("Seed is required."))

    raw = seed_text.strip()
    if not raw:
        raise SeedParseError(_error_message("Seed cannot be empty."))

    if not _ALPHA_RE.fullmatch(raw):
        raise SeedParseError(
            _error_message("Seed must contain letters only (no spaces or symbols).")
        )

    candidate = _split_camel_case(raw)
    if candidate is not None:
        adjective, noun = candidate
        if adjective in ADJECTIVE_SET and noun in NOUN_SET:
            canonical = canonical_seed(adjective, noun)
            return ParsedSeed(raw, adjective, noun, canonical, seed_hash64(canonical))

    lowercase_seed = raw.lower()
    matches = _split_concatenated(lowercase_seed)
    if len(matches) == 1:
        adjective, noun = matches[0]
        canonical = canonical_seed(adjective, noun)
        return ParsedSeed(raw, adjective, noun, canonical, seed_hash64(canonical))

    if len(matches) > 1:
        options = ", ".join(canonical_seed(a, n) for a, n in matches[:4])
        raise SeedParseError(_error_message(f"Seed is ambiguous. Candidate splits: {options}."))

    raise SeedParseError(_error_message("Seed must be adjective+noun from the internal dictionaries."))


def _split_camel_case(raw: str) -> tuple[str, str] | None:
    parts = _CAMEL_RE.findall(raw)
    if len(parts) != 2:
        return None
    if "".join(parts) != raw:
        return None
    return parts[0].lower(), parts[1].lower()


def _split_concatenated(raw_lower: str) -> list[tuple[str, str]]:
    matches: list[tuple[str, str]] = []
    for i in range(2, len(raw_lower) - 1):
        adjective = raw_lower[:i]
        noun = raw_lower[i:]
        if adjective in ADJECTIVE_SET and noun in NOUN_SET:
            matches.append((adjective, noun))
    return matches


def _error_message(reason: str) -> str:
    examples = ", ".join(_EXAMPLE_SEEDS)
    return f"{reason} Examples: {examples}"
