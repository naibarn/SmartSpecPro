"""Versioned Spec-ID allocation and provenance aliases.

Aliases are lookup metadata only. Canonical authority continues to come from
the configured inventory roots and each Spec's own normative document.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

REGISTRY_PATH = Path("specs/_config/spec-id-registry.json")
_ID = re.compile(r"^\d{3,}$")
_DATED_CANDIDATE = re.compile(r"^\d{4}-\d{2}-\d{2}-")
_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_SHA1 = re.compile(r"^[0-9a-f]{40}$")
_ALIAS_FIELDS = {
    "old_spec_id", "new_spec_id", "logical_title", "old_path",
    "canonical_path", "source_digest", "canonical_digest",
    "disposition_reason", "authority_evidence", "baseline_sha",
    "integrated_sha", "effective_state", "semantic_reference_repair_status",
}


def empty_registry() -> dict[str, Any]:
    return {
        "schema_version": 1,
        "registry_version": 1,
        "reserved_spec_ids": [],
        "historical_spec_ids": [],
        "aliases": [],
        "historical_dispositions": [],
    }


def load_registry(repo: Path) -> dict[str, Any]:
    path = repo / REGISTRY_PATH
    if not path.exists():
        return empty_registry()
    value = json.loads(path.read_text(encoding="utf-8"))
    errors = validate_registry(value)
    if errors:
        raise ValueError("invalid Spec-ID registry: " + "; ".join(errors))
    return value


def _valid_id(value: Any) -> bool:
    return isinstance(value, str) and bool(_ID.fullmatch(value))


def validate_registry(registry: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if registry.get("schema_version") != 1 or registry.get("registry_version") != 1:
        errors.append("unsupported schema_version or registry_version")
    for field in ("reserved_spec_ids", "historical_spec_ids", "aliases", "historical_dispositions"):
        if not isinstance(registry.get(field), list):
            errors.append(f"{field} must be a list")
    reserved = registry.get("reserved_spec_ids", [])
    historical = registry.get("historical_spec_ids", [])
    for field, values in (("reserved_spec_ids", reserved), ("historical_spec_ids", historical)):
        for value in values:
            spec_id = value if isinstance(value, str) else value.get("spec_id") if isinstance(value, dict) else None
            if not _valid_id(spec_id):
                errors.append(f"{field} contains invalid Spec ID {spec_id!r}")

    aliases = registry.get("aliases", [])
    by_source: dict[tuple[str, str], set[str]] = {}
    graph: dict[str, set[str]] = {}
    for index, alias in enumerate(aliases):
        if not isinstance(alias, dict):
            errors.append(f"aliases[{index}] must be an object")
            continue
        missing = _ALIAS_FIELDS - alias.keys()
        if missing:
            errors.append(f"aliases[{index}] missing {', '.join(sorted(missing))}")
            continue
        old_id, new_id = alias["old_spec_id"], alias["new_spec_id"]
        if not _valid_id(old_id) or not _valid_id(new_id):
            errors.append(f"aliases[{index}] has invalid old/new Spec ID")
        if old_id == new_id:
            errors.append(f"aliases[{index}] cannot alias an ID to itself")
        if not alias["old_path"] or not alias["canonical_path"]:
            errors.append(f"aliases[{index}] requires old_path and canonical_path")
        if not isinstance(alias["authority_evidence"], list) or not alias["authority_evidence"]:
            errors.append(f"aliases[{index}] requires authority_evidence")
        if not isinstance(alias["source_digest"], str) or not isinstance(alias["canonical_digest"], str):
            errors.append(f"aliases[{index}] requires source and canonical digests")
        elif not _SHA256.fullmatch(alias["source_digest"]) or not _SHA256.fullmatch(alias["canonical_digest"]):
            errors.append(f"aliases[{index}] digests must be lowercase SHA-256 values")
        if not isinstance(alias["baseline_sha"], str) or not _SHA1.fullmatch(alias["baseline_sha"]):
            errors.append(f"aliases[{index}] baseline_sha must be a Git SHA-1")
        if alias["integrated_sha"] is not None and (
            not isinstance(alias["integrated_sha"], str) or not _SHA1.fullmatch(alias["integrated_sha"])
        ):
            errors.append(f"aliases[{index}] integrated_sha must be null or a Git SHA-1")
        source_key = (str(old_id), str(alias["old_path"]))
        by_source.setdefault(source_key, set()).add(str(new_id))
        graph.setdefault(str(old_id), set()).add(str(new_id))
    for source, targets in by_source.items():
        if len(targets) > 1:
            errors.append(f"alias source {source[0]} at {source[1]} has multiple targets")
    for old_id, targets in graph.items():
        if len(targets) > 1:
            errors.append(f"historical Spec ID {old_id} resolves to multiple targets")
    if _has_cycle(graph):
        errors.append("alias graph contains a loop")
    return errors


def _has_cycle(graph: dict[str, set[str]]) -> bool:
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(node: str) -> bool:
        if node in visiting:
            return True
        if node in visited:
            return False
        visiting.add(node)
        if any(visit(child) for child in graph.get(node, set())):
            return True
        visiting.remove(node)
        visited.add(node)
        return False

    return any(visit(node) for node in graph)


def occupied_ids(inventory: dict[str, Any], registry: dict[str, Any]) -> set[str]:
    occupied = {
        str(row["spec_id"])
        for row in inventory.get("records", [])
        if row.get("spec_id") is not None
        and _valid_id(str(row["spec_id"]))
        and (
            (row.get("root_kind") == "CANONICAL" and not (
                row.get("record_kind") == "PLANNING_ARTIFACT"
                and _DATED_CANDIDATE.match(str(row.get("slug", "")))
            ))
            or row.get("record_kind") == "HISTORICAL_SPEC"
            or (row.get("record_kind") == "HISTORICAL_CANDIDATE" and not _DATED_CANDIDATE.match(str(row.get("slug", ""))))
        )
    }
    occupied.update(value if isinstance(value, str) else value["spec_id"] for value in registry.get("reserved_spec_ids", []))
    occupied.update(value if isinstance(value, str) else value["spec_id"] for value in registry.get("historical_spec_ids", []))
    for alias in registry.get("aliases", []):
        occupied.update((str(alias["old_spec_id"]), str(alias["new_spec_id"])))
    return occupied


def next_safe_ids(inventory: dict[str, Any], registry: dict[str, Any], count: int = 3) -> list[str]:
    """Allocate strictly above every observed/held ID, never filling historical gaps."""
    if count < 0:
        raise ValueError("count must be non-negative")
    held = occupied_ids(inventory, registry)
    numeric = [int(value) for value in held if _valid_id(value)]
    candidate = max(numeric, default=-1) + 1
    result = []
    while len(result) < count:
        while f"{candidate:03d}" in held:
            candidate += 1
        result.append(f"{candidate:03d}")
        held.add(f"{candidate:03d}")
        candidate += 1
    return result


def resolve_spec_id(spec_id: str, registry: dict[str, Any], *, old_path: str | None = None,
                    canonical_spec_ids: set[str] | None = None) -> str | None:
    """Resolve a historical ID deterministically when identity evidence is supplied.

    For a colliding old ID with a current canonical owner, a bare lookup retains
    that owner. The displaced Spec resolves through its preserved old path.
    """
    if old_path is None and canonical_spec_ids and spec_id in canonical_spec_ids:
        return spec_id
    matches = [a for a in registry.get("aliases", []) if a.get("old_spec_id") == spec_id]
    if old_path is not None:
        matches = [a for a in matches if a.get("old_path") == old_path]
    if len(matches) == 1:
        return str(matches[0]["new_spec_id"])
    if len(matches) > 1:
        raise ValueError(f"ambiguous alias for Spec ID {spec_id}; provide old_path")
    return None


def build_registry_projection(repo: Path, inventory: dict[str, Any]) -> dict[str, Any]:
    registry = load_registry(repo)
    target_rows = [
        row
        for row in inventory.get("records", [])
        if row.get("record_kind") == "CANONICAL_SPEC" and row.get("root_kind") == "CANONICAL"
    ]
    targets = {
        (str(row.get("spec_id")), str(row.get("spec_path"))): str(row.get("digest"))
        for row in target_rows
    }
    unresolved = [
        {"new_spec_id": row.get("new_spec_id"), "canonical_path": row.get("canonical_path"), "canonical_digest": row.get("canonical_digest")}
        for row in registry["aliases"]
        if targets.get((str(row.get("new_spec_id")), str(row.get("canonical_path")))) != row.get("canonical_digest")
        or sum(1 for target in target_rows if str(target.get("spec_id")) == str(row.get("new_spec_id"))) != 1
    ]
    if unresolved:
        raise ValueError(f"Spec-ID alias target is not a canonical inventory record: {unresolved}")
    return {
        "schema_version": registry["schema_version"],
        "registry_version": registry["registry_version"],
        "aliases": registry["aliases"],
        "historical_dispositions": registry["historical_dispositions"],
        "reserved_spec_ids": registry["reserved_spec_ids"],
        "historical_spec_ids": registry["historical_spec_ids"],
        "occupied_spec_ids": sorted(occupied_ids(inventory, registry), key=lambda value: (int(value), value)),
        "next_safe_spec_ids": next_safe_ids(inventory, registry, 5),
        "alias_creates_authority": False,
    }
