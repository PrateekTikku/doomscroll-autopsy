"""Shared helpers for the T1 pipeline: paths, schema loading, canonical prompt format.

The student prompt format is a contract with T2 (fine-tune) and M6 (the extension builds the
same string at runtime). Do not change it without updating `training/README.md` and M6.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parent
SHARED = ROOT.parent / "shared"
DATA = ROOT / "data"

NAMING = "naming"
AUTOPSY = "autopsy"
TASKS = (NAMING, AUTOPSY)

SCHEMA_FILES = {
    "territory-description": "territory-description.schema.json",
    "naming-output": "naming-output.schema.json",
    "daily-facts": "daily-facts.schema.json",
}

# The student prompt: one fixed instruction line, a blank line, then the input as compact JSON.
STUDENT_INSTRUCTION = {
    NAMING: (
        "Name this browsing territory and suggest a label. "
        'Reply with JSON only: {"name": "...", "suggested_label": "deep|shallow|drain", "why": "..."}.'
    ),
    AUTOPSY: (
        "Write tonight's autopsy of this browser day in the calm, factual coach voice, "
        "120-180 words, using only numbers from the facts."
    ),
}


def compact_json(obj) -> str:
    """Canonical JSON: keys in insertion (schema) order, no spaces, UTF-8 kept as is."""
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False)


def student_prompt(task: str, obj) -> str:
    return f"{STUDENT_INSTRUCTION[task]}\n\n{compact_json(obj)}"


@lru_cache(maxsize=None)
def load_schema(name: str) -> dict:
    return json.loads((SHARED / SCHEMA_FILES[name]).read_text())


@lru_cache(maxsize=None)
def schema_validator(name: str) -> Draft202012Validator:
    schema = load_schema(name)
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def load_personas() -> list[dict]:
    return json.loads((SHARED / "personas.json").read_text())["personas"]


def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open() as f:
        return [json.loads(line) for line in f if line.strip()]


def append_jsonl(path: Path, record: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")
