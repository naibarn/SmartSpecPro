"""Generated repository-wide Spec views derived from inventory and handoffs."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .contracts import completion_eligible
from .inventory import inventory, json_bytes
from .store import handoff_dir, read_manifest, render_status, _atomic_write


def _record_view(repo: Path, record: dict[str, Any]) -> dict[str, Any]:
    base = {key: record.get(key) for key in ("record_key", "root_kind", "configured_root", "path", "spec_path", "record_kind", "spec_id", "slug", "title", "revision", "digest", "problem", "relationships")}
    if record["root_kind"] == "CANONICAL" and record["record_kind"] == "CANONICAL_SPEC":
        manifest = read_manifest(repo / record["path"])
        if manifest is None:
            base.update({"authority": "UNRESOLVED", "disposition": "INVALID_OR_UNKNOWN", "lifecycle": "DISCOVERING", "continuation": "RECONCILIATION_REQUIRED", "confidence": "UNRESOLVED", "verification": "UNKNOWN", "deployment": "UNKNOWN", "acceptance": "UNKNOWN", "requirements": {"pass": 0, "open": 0, "total": 0}, "primary_blocker": "HANDOFF_REQUIRED", "next_action": "Initialize and reconcile canonical handoff.", "evidence_freshness": "UNKNOWN", "last_reconciled": None, "successors": []})
            return base
        ledger_path = handoff_dir(repo / record["path"]) / "requirement-ledger.json"
        ledger = json.loads(ledger_path.read_text(encoding="utf-8")) if ledger_path.exists() else {"requirements": []}
        requirements = ledger.get("requirements", [])
        summary = manifest.get("requirements_summary", {})
        blockers = manifest.get("blockers", [])
        active_refs = manifest.get("relevance_assessment", {}).get("active_references", [])
        reference_counts = {kind: sum(1 for reference in active_refs if reference.get("kind") == kind) for kind in ("SOURCE", "TEST", "DOCUMENTATION_OR_CONFIG")}
        completion, completion_reasons = completion_eligible(manifest, ledger)
        base.update({
            "authority": manifest.get("authority", {}).get("status", "UNRESOLVED"),
            "disposition": manifest.get("disposition", {}).get("value", "INVALID_OR_UNKNOWN"),
            "lifecycle": manifest.get("lifecycle", {}).get("current_state", "DISCOVERING"),
            "continuation": manifest.get("continuation_assessment", {}).get("decision", "RECONCILIATION_REQUIRED"),
            "confidence": manifest.get("reconciliation", {}).get("confidence", "UNRESOLVED"),
            "relevance_assessment": manifest.get("relevance_assessment", {}),
            "declared_claims": manifest.get("relevance_assessment", {}).get("declared_claims", []),
            "declared_status_claims": [claim for claim in manifest.get("relevance_assessment", {}).get("declared_claims", []) if claim.get("claim_kind") == "DECLARED_STATUS"],
            "declared_relationship_claims": [claim for claim in manifest.get("relevance_assessment", {}).get("declared_claims", []) if claim.get("claim_kind") == "DECLARED_RELATIONSHIP"],
            "section_status_claims": [claim for claim in manifest.get("relevance_assessment", {}).get("declared_claims", []) if claim.get("claim_kind") == "SECTION_STATUS_ASSERTION"],
            "current_reference_counts": reference_counts,
            "implementation_last_touched_at": manifest.get("identity", {}).get("metadata", {}).get("implementation_last_touched_at"),
            "spec_created_at": manifest.get("identity", {}).get("metadata", {}).get("spec_created_at"),
            "spec_last_changed_at": manifest.get("identity", {}).get("metadata", {}).get("spec_last_changed_at"),
            "verification": manifest.get("verification", {}).get("status", "UNKNOWN"),
            "deployment": manifest.get("deployment", {}).get("status", "UNKNOWN"),
            "acceptance": manifest.get("acceptance", {}).get("status", "UNKNOWN"),
            "requirements": {"pass": summary.get("pass", 0), "open": summary.get("unresolved", 0), "total": summary.get("total", len(requirements))},
            "primary_blocker": blockers[0] if blockers else None,
            "next_action": manifest.get("continuation_assessment", {}).get("next_action", "Reconcile current evidence."),
            "evidence_freshness": manifest.get("verification", {}).get("freshness", "UNKNOWN"),
            "last_reconciled": manifest.get("reconciliation", {}).get("reconciled_at"),
            "successors": manifest.get("authority", {}).get("successors", []),
            "relationship_claims": manifest.get("authority", {}).get("claims", []),
            "canonical_sha": manifest.get("integration", {}).get("canonical_sha"),
            "completion_eligible": completion,
            "completion_reasons": completion_reasons,
            "true_blockers": sum(1 for blocker in blockers if isinstance(blocker, dict) and blocker.get("classification") == "TRUE_EXTERNAL"),
        })
        if record.get("configured_root") == "specs/security" and manifest.get("continuation_assessment", {}).get("decision") == "RECONCILIATION_REQUIRED":
            base["next_action"] = "Map each security requirement to current implementation and regression tests; assess current exposure and retain unresolved status where exact coverage or fresh verification is missing."
        return base
    not_spec = record["record_kind"] in {"PLANNING_ARTIFACT", "PROJECT_REQUIREMENTS", "COLLECTION_ENTRY_NO_SPEC", "DUPLICATE_SPEC_COPY"}
    if record["record_kind"] == "DUPLICATE_SPEC_COPY":
        next_action = "Keep this identical nested copy visible as an inventory record; canonical handoff belongs to the matching ancestor Spec."
    elif not_spec:
        next_action = "This record is an inventory item, not a canonical Spec handoff."
    elif record.get("record_kind") in {"MALFORMED_CANDIDATE", "INVALID_SPEC"}:
        next_action = "Keep this configured-root candidate visible as malformed; locate its normative spec.md or record why it is intentionally absent before initializing a handoff."
    else:
        next_action = "Review this candidate's identity and canonical-root classification."
    base.update({"authority": "NOT_APPLICABLE" if not_spec else "UNRESOLVED", "disposition": "INVALID_OR_UNKNOWN" if not_spec else "DORMANT_UNRESOLVED", "lifecycle": "NOT_A_CANONICAL_SPEC", "continuation": "NOT_APPLICABLE" if not_spec else "RECONCILIATION_REQUIRED", "confidence": "NOT_APPLICABLE" if not_spec else "UNRESOLVED", "verification": "UNKNOWN", "deployment": "UNKNOWN", "acceptance": "UNKNOWN", "requirements": {"pass": 0, "open": 0, "total": 0}, "primary_blocker": record.get("problem"), "next_action": next_action, "evidence_freshness": "UNKNOWN", "last_reconciled": None, "successors": []})
    return base


def _priority(record: dict[str, Any]) -> str:
    if record.get("disposition") in {"SUPERSEDED_FULL", "RETIRED", "HISTORICAL_ONLY", "CANCELLED_EXPLICIT", "MERGED_INTO"} or str(record.get("continuation", "")).startswith("DO_NOT_CONTINUE"):
        return "EXCLUDED"
    if record.get("disposition") not in {"ACTIVE_CANONICAL", "ACTIVE_SUPPORTING", "LEGACY_COMPATIBILITY"}:
        return "REVIEW_ONLY"
    if record.get("relevance_assessment", {}).get("security_data_compliance_obligations") == "CURRENT" and record.get("continuation") == "CONTINUE_REQUIRED":
        return "P0"
    if record.get("continuation") == "CONTINUE_REQUIRED" and isinstance(record.get("primary_blocker"), dict) and record["primary_blocker"].get("recoverable") is True:
        return "P3"
    if record.get("continuation") == "CONTINUE_REQUIRED":
        return "P1"
    if record.get("continuation") == "VALIDATION_ONLY":
        return "P2"
    if record.get("continuation") == "CONTINUE_RECOMMENDED":
        return "P4"
    if record.get("continuation") in {"CONTINUE_OPTIONAL", "MAINTENANCE_ONLY"}:
        return "P4"
    return "REVIEW_ONLY"


def _review_priority(record: dict[str, Any]) -> str:
    """Prioritize evidence review without implying implementation continuation."""
    if record.get("record_kind") in {"MALFORMED_CANDIDATE", "INVALID_SPEC"}:
        return "R0_DATA_INTEGRITY"
    if record.get("configured_root") == "specs/security":
        return "R0_SECURITY"
    if record.get("authority") == "AUTHORITY_CONFLICT":
        return "R1_IDENTITY_CONFLICT"
    refs = record.get("current_reference_counts", {})
    if refs.get("SOURCE", 0):
        return "R1_RUNTIME_REFERENCE"
    if refs.get("TEST", 0):
        return "R2_TEST_REFERENCE"
    if record.get("declared_relationship_claims"):
        return "R3_RELATIONSHIP_CLAIM"
    if record.get("declared_status_claims"):
        return "R4_STATUS_CLAIM"
    return "R5_NO_DIRECT_EVIDENCE"


def build_views(repo: Path) -> dict[str, Any]:
    discovered = inventory(repo)
    rows = [_record_view(repo, record) for record in discovered["records"]]
    # Stable sorting uses semantic priority; Spec IDs and age never influence rank.
    priority_order = {"P0": 0, "P1": 1, "P2": 2, "P3": 3, "P4": 4, "REVIEW_ONLY": 5, "EXCLUDED": 6}
    queue = []
    excluded = []
    for row in rows:
        priority = _priority(row)
        item = {"priority": priority, "record_key": row["record_key"], "spec_id": row.get("spec_id"), "path": row["path"], "decision": row["continuation"], "rationale": row.get("next_action"), "confidence": row["confidence"]}
        if priority == "EXCLUDED":
            excluded.append(item)
        elif priority != "REVIEW_ONLY":
            queue.append(item)
    queue.sort(key=lambda item: (priority_order[item["priority"]], item["path"].casefold(), item["path"]))
    ambiguity = [dict(row, review_priority=_review_priority(row)) for row in rows if row.get("confidence") in {"LOW", "UNRESOLVED"} or row.get("authority") == "AUTHORITY_CONFLICT" or row.get("record_kind") in {"MALFORMED_CANDIDATE", "INVALID_SPEC"}]
    review_order = {"R0_DATA_INTEGRITY": 0, "R0_SECURITY": 1, "R1_IDENTITY_CONFLICT": 2, "R1_RUNTIME_REFERENCE": 3, "R2_TEST_REFERENCE": 4, "R3_RELATIONSHIP_CLAIM": 5, "R4_STATUS_CLAIM": 6, "R5_NO_DIRECT_EVIDENCE": 7}
    ambiguity.sort(key=lambda row: (review_order[row["review_priority"]], row["path"].casefold(), row["path"]))
    counts: dict[str, int] = {}
    for row in rows:
        for key, value in (("record_kind", row["record_kind"]), ("disposition", row.get("disposition")), ("lifecycle", row.get("lifecycle")), ("continuation", row.get("continuation")), ("confidence", row.get("confidence")), ("verification", row.get("verification")), ("deployment", row.get("deployment")), ("acceptance", row.get("acceptance"))):
            if value is not None:
                counts[f"{key}.{value}"] = counts.get(f"{key}.{value}", 0) + 1
        counts[f"completion.{ 'ELIGIBLE' if row.get('completion_eligible') else 'INELIGIBLE' if row.get('record_kind') == 'CANONICAL_SPEC' else 'NOT_APPLICABLE'}"] = counts.get(f"completion.{ 'ELIGIBLE' if row.get('completion_eligible') else 'INELIGIBLE' if row.get('record_kind') == 'CANONICAL_SPEC' else 'NOT_APPLICABLE'}", 0) + 1
    index = {"schema_version": 1, "generated_from": "configured roots + per-Spec handoff manifests", "record_count": len(rows), "canonical_spec_count": discovered["invariants"]["canonical_spec_count"], "records": rows, "counts": counts}
    report = {"schema_version": 1, "inventory": discovered, "indexed_record_count": len(rows), "invariant_discovered_equals_indexed": len(rows) == discovered["invariants"]["record_count"], "reconciliation_confidence_counts": {key: value for key, value in counts.items() if key.startswith("confidence.")}, "records": rows}
    status_lines = ["<!-- GENERATED FROM spec-index.json; DO NOT EDIT -->", "# Repository Spec Status", "", f"- Discovered records: {len(rows)}", f"- Canonical `spec.md` records: {discovered['invariants']['canonical_spec_count']}", f"- Global index invariant: {'PASS' if report['invariant_discovered_equals_indexed'] else 'FAIL'}", "- Declared status/relationship claims are evidence candidates; they do not set authority or continuation.", "", "| Spec / Record | Kind | Disposition | Lifecycle | Continuation | Confidence | Verification | Declared claim | Next action |", "|---|---|---|---|---|---|---|---|---|"]
    for row in rows:
        claim_values = [claim.get("value", "") for claim in row.get("declared_claims", []) if claim.get("claim_kind") != "SECTION_STATUS_ASSERTION"]
        claim_summary = "; ".join(value.replace("|", "\\|").replace("\n", " ")[:90] for value in claim_values[:2])
        status_lines.append(f"| [{row.get('spec_id') or '—'} {row.get('title')}]({row['path']}) | {row['record_kind']} | {row.get('disposition')} | {row.get('lifecycle')} | {row.get('continuation')} | {row.get('confidence')} | {row.get('verification')} | {claim_summary} | {row.get('next_action')} |")
    review_queue = [{"priority": row["review_priority"], "record_key": row["record_key"], "spec_id": row.get("spec_id"), "path": row["path"], "authority": row.get("authority"), "confidence": row.get("confidence"), "reference_counts": row.get("current_reference_counts", {}), "declared_claim_count": len(row.get("declared_claims", [])), "next_action": row.get("next_action")} for row in ambiguity]
    return {"spec-index.json": index, "SPEC-STATUS.md": "\n".join(status_lines) + "\n", "reconciliation-report.json": report, "continuation-queue.json": {"schema_version": 1, "records": queue, "excluded": excluded, "reconciliation_review": review_queue}, "ambiguity-review.json": {"schema_version": 1, "record_count": len(ambiguity), "records": ambiguity}}


def write_views(repo: Path, views: dict[str, Any]) -> None:
    destination = repo / "specs/_status"
    for name, content in views.items():
        data = content.encode("utf-8") if isinstance(content, str) else json_bytes(content)
        _atomic_write(destination / name, data)


def generate_spec_status(spec_dir: Path) -> None:
    manifest = read_manifest(spec_dir)
    if manifest is None:
        raise FileNotFoundError("manifest.json is required to generate STATUS.md")
    ledger_path = handoff_dir(spec_dir) / "requirement-ledger.json"
    ledger = json.loads(ledger_path.read_text(encoding="utf-8")) if ledger_path.exists() else {"requirements": []}
    _atomic_write(handoff_dir(spec_dir) / "STATUS.md", render_status(manifest, ledger).encode("utf-8"))


def status_drift(repo: Path) -> list[str]:
    discovered = inventory(repo)
    drift: list[str] = []
    for record in discovered["records"]:
        if record["root_kind"] != "CANONICAL" or record["record_kind"] != "CANONICAL_SPEC":
            continue
        spec_dir = repo / record["path"]
        manifest = read_manifest(spec_dir)
        ledger_path = handoff_dir(spec_dir) / "requirement-ledger.json"
        if manifest is None or not ledger_path.is_file():
            continue
        ledger = json.loads(ledger_path.read_text(encoding="utf-8"))
        expected = render_status(manifest, ledger).encode("utf-8")
        status_path = handoff_dir(spec_dir) / "STATUS.md"
        if not status_path.is_file() or status_path.read_bytes() != expected:
            drift.append((status_path.relative_to(repo)).as_posix())
    return drift
