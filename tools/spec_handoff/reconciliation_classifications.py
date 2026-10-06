"""Evidence-bound repository-wide classification of dynamic inventory records."""
from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any

from .inventory import inventory
from .relationships import build_relationship_graph
from .spec_ids import build_registry_projection

TAXONOMY = {
    "CANONICAL_ACTIVE", "HISTORICAL_REVISION", "SUPERSEDED", "RENUMBER_ALIAS",
    "IMPLEMENTATION_EVIDENCE", "RECOVERY_EVIDENCE", "DUPLICATE_REVISION",
    "STALE_REFERENCE", "ORPHANED_RECORD", "VALID_NON_CANONICAL", "UNRESOLVED_AUTHORITY",
}
ARTIFACT = Path("specs/_status/reconciliation-classifications.json")
HISTORY_DECISIONS = {
    "specs/_history/spec-id-conflicts/058-agency-creator-intelligence-upgrade": (
        "VALID_NON_CANONICAL", "Retained historical Agency Creator evidence; retired system is not canonical.",
        "specs/project/canonical-spec-handoff-reconciliation/handoff/evidence/duplicate-authority-resolution-20261006.md"),
    "specs/_history/spec-id-conflicts/162-163-gap-closure": (
        "IMPLEMENTATION_EVIDENCE", "Combined gap-closure implementation evidence, not a standalone canonical Spec.",
        "specs/project/canonical-spec-handoff-reconciliation/handoff/evidence/duplicate-authority-resolution-20261006.md"),
}


def _sha(path: Path) -> str | None:
    try:
        if path.is_file():
            return hashlib.sha256(path.read_bytes()).hexdigest()
        if path.is_dir():
            digest = hashlib.sha256()
            for item in sorted(
                p for p in path.rglob("*")
                if p.is_file() and not p.is_symlink()
                and p.name != ARTIFACT.name
                and "handoff" not in p.relative_to(path).parts
            ):
                digest.update(item.relative_to(path).as_posix().encode())
                digest.update(hashlib.sha256(item.read_bytes()).digest())
            return digest.hexdigest()
    except OSError:
        return None
    return None


def _manifest(repo: Path, record: dict[str, Any]) -> dict[str, Any]:
    path = repo / record["path"] / "handoff/manifest.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _references_to_candidate(repo: Path, record: dict[str, Any]) -> list[dict[str, Any]]:
    spec_id = record.get("spec_id")
    if not spec_id:
        return []
    matcher = re.compile(rf"\b(?:spec(?:ification)?|feature)\s*(?:#|no\.?\s*)?{re.escape(str(spec_id))}\b|{re.escape(record['slug'])}", re.I)
    references = []
    for source in inventory(repo)["records"]:
        if source.get("record_kind") != "CANONICAL_SPEC" or not source.get("spec_path"):
            continue
        source_path = repo / source["spec_path"]
        try:
            lines = source_path.read_text(encoding="utf-8").splitlines()
        except (OSError, UnicodeError):
            continue
        matched_lines = [number for number, line in enumerate(lines, 1) if matcher.search(line)]
        if matched_lines:
            references.append({"path": source["spec_path"], "lines": matched_lines, "sha256": source.get("digest")})
    return references


def classify_record(repo: Path, record: dict[str, Any]) -> dict[str, Any]:
    kind, path = record["record_kind"], record["path"]
    target = None
    if kind == "CANONICAL_SPEC":
        manifest = _manifest(repo, record)
        if manifest.get("authority", {}).get("status") == "MERGED_INTO":
            classification = "SUPERSEDED"
            successors = manifest.get("authority", {}).get("successors", [])
            target = successors[0] if len(successors) == 1 else None
            reason = "Canonical handoff explicitly records merged authority; partial residual requirements remain in its ledger."
            action = "Preserve this record and its residual ledger; continue remaining requirements under the named successor."
            validation = "PASS_EXPLICIT_SUCCESSOR"
        elif record.get("relationships", {}).get("duplicate_ids") or record.get("relationships", {}).get("duplicate_revisions"):
            classification = "UNRESOLVED_AUTHORITY"
            reason = "Inventory reports a duplicate canonical ID or revision requiring authority review."
            action = "Resolve the duplicate authority before treating this record as active."
            validation = "BLOCKED_DUPLICATE_AUTHORITY"
        else:
            classification = "CANONICAL_ACTIVE"
            reason = "Valid spec.md under a configured canonical root; unique ID/revision and canonical handoff are present."
            action = "Retain as current canonical authority; implementation completion remains independently governed by its handoff."
            validation = "PASS_UNIQUE_CANONICAL_RECORD"
    elif kind == "HISTORICAL_CANDIDATE":
        classification, reason = "VALID_NON_CANONICAL", "Configured alternate-root candidate without normative spec.md; retained as historical/source evidence."
        action, validation = "Preserve outside canonical authority; do not initialize an active handoff from its ID-like path.", "PASS_CONFIGURED_ALTERNATE_ROOT"
    elif kind == "HISTORICAL_SPEC":
        if path in HISTORY_DECISIONS:
            classification, reason, source = HISTORY_DECISIONS[path]
            target = "specs/feature/162-vertical-drama-broll-media-intelligence-worker" if classification == "IMPLEMENTATION_EVIDENCE" else None
            action, validation = "Preserve evidence in history and exclude it from canonical Spec authority.", "PASS_HISTORICAL_DECISION_EVIDENCE"
        else:
            classification, target = "UNRESOLVED_AUTHORITY", None
            reason = "Historical Spec has no matching repository authority/disposition decision record."
            action, validation = "Find the governing history/authority evidence; retain the record outside canonical roots until resolved.", "BLOCKED_MISSING_HISTORICAL_DECISION"
    elif kind == "DUPLICATE_SPEC_COPY":
        classification = "DUPLICATE_REVISION"
        target = record.get("problem", "").removeprefix("DUPLICATE_SPEC_COPY_OF:") or None
        reason = "Nested spec.md is byte-identical to its authoritative ancestor copy."
        action, validation = "Keep the duplicate visible in inventory; use the ancestor as authority and exclude this copy from canonical projection.", "PASS_IDENTICAL_DIGEST_AND_ANCESTOR"
    elif kind == "MALFORMED_CANDIDATE":
        classification, reason = "UNRESOLVED_AUTHORITY", "Configured canonical-root candidate has no normative spec.md; intent/approval source has not been established."
        action, validation = "Recover the approved normative source or record an authoritative non-Spec disposition; do not promote companion drafts by inference.", "BLOCKED_MISSING_NORMATIVE_SOURCE"
    elif kind in {"PLANNING_ARTIFACT", "PROJECT_REQUIREMENTS", "COLLECTION_ENTRY_NO_SPEC"}:
        classification, reason = "VALID_NON_CANONICAL", f"{kind} is a legitimate planning, project-requirement, or collection artifact outside canonical Spec authority."
        action, validation = "Retain as supporting inventory evidence; do not count as an independent canonical Spec.", "PASS_INVENTORY_RECORD_KIND"
    else:
        classification, target = "UNRESOLVED_AUTHORITY", None
        reason = f"Inventory record kind {kind!r} has no registered evidence-led disposition rule."
        action, validation = "Review the new inventory kind and establish its authority/provenance before classification.", "BLOCKED_UNMAPPED_INVENTORY_KIND"

    source_path = repo / record["path"]
    evidence = [{"path": record.get("spec_path") or path, "sha256": record.get("digest") or _sha(source_path)}]
    if kind == "HISTORICAL_SPEC" and path in HISTORY_DECISIONS:
        evidence.append({"path": HISTORY_DECISIONS[path][2], "sha256": _sha(repo / HISTORY_DECISIONS[path][2])})
    if kind == "DUPLICATE_SPEC_COPY" and target:
        evidence.append({"path": f"{target}/spec.md", "sha256": _sha(repo / target / "spec.md")})
    if kind == "MALFORMED_CANDIDATE":
        evidence.append({"path": f"{path}/claude-spec.md", "sha256": _sha(repo / path / "claude-spec.md")})
    result = {
        "record_key": record["record_key"], "path": path, "record_kind": kind,
        "spec_id": record.get("spec_id"), "classification": classification,
        "canonical_target": target, "provenance_relationship": record.get("problem") or record.get("root_kind"),
        "reason": reason, "action_taken": action, "validation_state": validation,
        "evidence": evidence,
    }
    if kind == "MALFORMED_CANDIDATE":
        result["related_evidence"] = _references_to_candidate(repo, record)
    return result


def build_classifications(repo: Path, *, baseline_sha: str) -> dict[str, Any]:
    data = inventory(repo)
    rows = [classify_record(repo, row) for row in data["records"]]
    review_path = repo / "specs/_status/ambiguity-review.json"
    review = json.loads(review_path.read_text(encoding="utf-8"))
    review_keys = {r["record_key"] for r in review["records"]}
    for row in rows:
        row["in_reconciliation_review"] = row["record_key"] in review_keys
    review_rows = [row for row in rows if row["record_key"] in review_keys]
    categories = Counter({category: 0 for category in TAXONOMY})
    categories.update(row["classification"] for row in rows)
    review_categories = Counter({category: 0 for category in TAXONOMY})
    review_categories.update(row["classification"] for row in review_rows)
    graph = build_relationship_graph(repo, data)
    alias_projection = build_registry_projection(repo, data)
    return {
        "schema_version": 1, "baseline_sha": baseline_sha,
        "inventory_record_count": len(rows), "reconciliation_review_count": len(review_rows),
        "relationship_edge_count": graph["edge_count"],
        "renumber_alias_count": len(alias_projection["aliases"]),
        "canonical_spec_count": data["invariants"]["canonical_spec_count"],
        "duplicate_canonical_authority_count": sum(bool(r["relationships"]["duplicate_ids"]) for r in data["records"] if r["record_kind"] == "CANONICAL_SPEC"),
        "classification_counts": dict(sorted(categories.items())),
        "review_classification_counts": dict(sorted(review_categories.items())),
        "records": rows,
    }


def validate_classifications(repo: Path, document: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    current = inventory(repo)["records"]
    expected = {row["record_key"] for row in current}
    rows = document.get("records", [])
    actual = [row.get("record_key") for row in rows]
    if len(actual) != len(set(actual)):
        errors.append("classification record keys are not unique")
    if set(actual) != expected:
        errors.append(f"classification coverage differs from dynamic inventory: missing={len(expected-set(actual))}, extra={len(set(actual)-expected)}")
    for row in rows:
        if row.get("classification") not in TAXONOMY:
            errors.append(f"{row.get('record_key')}: unknown classification")
        if not row.get("path") or not row.get("reason") or not row.get("action_taken") or not row.get("validation_state") or not row.get("evidence"):
            errors.append(f"{row.get('record_key')}: incomplete evidence/disposition fields")
        if row.get("classification") in {"SUPERSEDED", "DUPLICATE_REVISION", "RENUMBER_ALIAS"} and not row.get("canonical_target"):
            errors.append(f"{row.get('record_key')}: required canonical target missing")
        if not (repo / str(row.get("path", ""))).exists():
            errors.append(f"{row.get('record_key')}: classified record path is missing")
        for proof in row.get("evidence", []):
            if not proof.get("path") or not isinstance(proof.get("sha256"), str) or not re.fullmatch(r"[0-9a-f]{64}", proof["sha256"]):
                errors.append(f"{row.get('record_key')}: source/record evidence lacks a valid SHA-256")
    review_path = repo / "specs/_status/ambiguity-review.json"
    review_keys = {row["record_key"] for row in json.loads(review_path.read_text(encoding="utf-8"))["records"]}
    expected_rows = {row["record_key"]: dict(classify_record(repo, row), in_reconciliation_review=row["record_key"] in review_keys) for row in current}
    for row in rows:
        source = expected_rows.get(row.get("record_key"))
        if source is not None and row != source:
            errors.append(f"{row.get('record_key')}: classification/evidence does not match current source inventory")
    if document.get("inventory_record_count") != len(expected):
        errors.append("inventory_record_count does not match dynamic inventory")
    if document.get("reconciliation_review_count") != len(review_keys) or sum(row.get("in_reconciliation_review") is True for row in rows) != len(review_keys):
        errors.append("reconciliation review membership/count differs from the generated ambiguity-review projection")
    if document.get("duplicate_canonical_authority_count") != 0:
        errors.append("duplicate canonical authority remains")
    try:
        alias_projection = build_registry_projection(repo, inventory(repo))
    except (OSError, ValueError, KeyError, TypeError) as exc:
        errors.append(f"alias/provenance registry is invalid: {exc}")
    else:
        if document.get("renumber_alias_count") != len(alias_projection["aliases"]):
            errors.append("renumber_alias_count does not match the validated alias registry")
    unresolved = [row for row in rows if row.get("classification") == "UNRESOLVED_AUTHORITY"]
    if any(not row.get("validation_state", "").startswith("BLOCKED_") or not row.get("reason") for row in unresolved):
        errors.append("unresolved authority lacks a concrete blocker and reason")
    canonical_ids = {str(row.get("spec_id")) for row in current if row.get("record_kind") == "CANONICAL_SPEC"}
    canonical_paths = {row["path"] for row in current if row.get("record_kind") == "CANONICAL_SPEC"}
    for row in rows:
        target = row.get("canonical_target")
        if row.get("classification") == "SUPERSEDED" and target not in canonical_ids:
            errors.append(f"{row.get('record_key')}: superseded target is not a current canonical Spec ID")
        if row.get("classification") in {"DUPLICATE_REVISION", "IMPLEMENTATION_EVIDENCE"} and target and target.startswith("specs/") and target not in canonical_paths:
            errors.append(f"{row.get('record_key')}: canonical path target does not resolve")
    actual_counts = Counter({category: 0 for category in TAXONOMY})
    actual_counts.update(row.get("classification") for row in rows)
    actual_counts = dict(sorted(actual_counts.items()))
    if document.get("classification_counts") != actual_counts:
        errors.append("classification_counts do not match classified records")
    review_counts = Counter({category: 0 for category in TAXONOMY})
    review_counts.update(row["classification"] for row in rows if row.get("in_reconciliation_review") is True)
    review_counts = dict(sorted(review_counts.items()))
    if document.get("review_classification_counts") != review_counts:
        errors.append("review_classification_counts do not match classified review records")
    if not re.fullmatch(r"[0-9a-f]{40}", document.get("baseline_sha", "")):
        errors.append("baseline_sha must be a full 40-character commit SHA")
    return errors
