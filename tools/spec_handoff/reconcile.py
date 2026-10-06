"""Conservative evidence reconciliation for canonical Spec records."""
from __future__ import annotations

import hashlib
import json
import copy
import re
from pathlib import Path
from typing import Any

from .contracts import new_manifest, utc_now
from .inventory import inventory, json_bytes
from .relationships import build_relationship_graph
from .source_evidence import collect_git_times, collect_source_evidence_for_inventory, git_file_times
from .store import _atomic_write, _file_lock, handoff_dir, read_manifest, render_status

_NORMATIVE = re.compile(r"\b(must|shall|required|acceptance criteria|must not|shall not)\b", re.I)
_REQ_ID = re.compile(r"\b((?:REQ|FR|NFR|AC|R)[-_ ]?\d+[A-Z0-9._-]*)\b", re.I)
_MANUAL_FIELDS = ("disposition", "continuation_assessment", "authority", "lifecycle")


def extract_requirements(spec_path: Path, spec_id: str, digest: str) -> dict[str, Any]:
    text = spec_path.read_text(encoding="utf-8")
    lines = text.splitlines()
    in_requirements = False
    current_level = 0
    selected: list[tuple[int, str]] = []
    for number, line in enumerate(lines, start=1):
        heading = re.match(r"^(#{1,6})\s+(.+?)\s*#*\s*$", line)
        if heading:
            level = len(heading.group(1))
            title = heading.group(2).casefold()
            if in_requirements and level <= current_level:
                in_requirements = False
            if any(word in title for word in ("requirement", "acceptance criteria", "functional scope", "non-functional")):
                in_requirements, current_level = True, level
            continue
        candidate = line.strip()
        if not candidate or candidate.startswith("<!--") or re.fullmatch(r"[| :\-]+", candidate):
            continue
        is_normative = bool(_NORMATIVE.search(candidate))
        if (in_requirements and re.match(r"^(?:[-*+]\s+|\d+[.)]\s+|\|)", candidate)) or is_normative:
            selected.append((number, candidate))
    requirements = []
    seen: set[str] = set()
    seen_text: dict[str, dict[str, Any]] = {}
    for number, statement in selected:
        normalized = re.sub(r"\s+", " ", re.sub(r"^(?:[-*+]\s+|\d+[.)]\s+)", "", statement)).strip(" |`*_ ").casefold()
        if normalized in seen_text:
            seen_text[normalized]["authority_refs"].append(f"{spec_path.as_posix()}#L{number}")
            continue
        match = _REQ_ID.search(statement)
        req_id = match.group(1).upper().replace(" ", "-") if match else "REQ-" + hashlib.sha256(f"{spec_id}:{number}:{statement}".encode()).hexdigest()[:12].upper()
        if req_id in seen:
            req_id = req_id + "-" + str(number)
        seen.add(req_id)
        line_digest = hashlib.sha256(statement.encode("utf-8")).hexdigest()
        requirements.append({
            "requirement_id": req_id,
            "authority_source": f"{spec_path.as_posix()}#L{number}",
            "authority_refs": [f"{spec_path.as_posix()}#L{number}"],
            "requirement_text": statement,
            "requirement_digest": line_digest,
            "source_spec_digest": digest,
            "applicability": "UNASSESSED",
            "current_relevance": "UNASSESSED",
            "successor_mapping": [],
            "implementation_status": "UNVERIFIED",
            "implementation_evidence": [],
            "verification_method": "Determine from current implementation and applicable lifecycle obligations.",
            "verification_evidence": [],
            "evidence_sha": None,
            "evidence_freshness": "UNKNOWN",
            "blocker": None,
            "next_action": "Assess current relevance, implementation mapping, and required evidence.",
            "final_state": "OPEN",
        })
        seen_text[normalized] = requirements[-1]
    if not requirements:
        requirements.append({
            "requirement_id": "UNPARSED-SPEC-" + hashlib.sha256(spec_id.encode()).hexdigest()[:8].upper(),
            "authority_source": spec_path.as_posix(),
            "requirement_text": "Normative requirement extraction needs review; no safe structured requirement set was detected.",
            "requirement_digest": digest,
            "source_spec_digest": digest,
            "applicability": "UNASSESSED", "current_relevance": "UNASSESSED", "successor_mapping": [],
            "implementation_status": "UNVERIFIED", "implementation_evidence": [],
            "verification_method": "Manual requirement extraction and mapping review.", "verification_evidence": [],
            "evidence_sha": None, "evidence_freshness": "UNKNOWN", "blocker": None,
            "next_action": "Review normative Spec and extract requirement-level ledger entries.", "final_state": "OPEN",
        })
    return {"schema_version": 1, "spec_id": spec_id, "spec_digest": digest, "generation": 0, "requirements": requirements}


def _supporting_evidence(spec_dir: Path) -> list[dict[str, str]]:
    evidence: list[dict[str, str]] = []
    useful = {"requirements.md", "brief.md", "claude-spec.md", "claude-plan.md", "plan.md", "completion.md", "release-gate.md", "project-manifest.md"}
    for path in sorted(spec_dir.rglob("*")):
        if not path.is_file() or path.is_symlink() or "handoff" in path.parts:
            continue
        if path.name in useful or path.parts[-2:-1] and path.parts[-2] in {"sections", "reviews", "audits", "implementation", "evidence"}:
            try:
                digest = hashlib.sha256(path.read_bytes()).hexdigest()
            except OSError:
                continue
            evidence.append({"path": path.as_posix(), "kind": "SUPPORTING_ARTIFACT", "digest": digest})
    return evidence


def _apply_manual(manifest: dict[str, Any]) -> dict[str, Any]:
    manual = manifest.get("manual_decisions", {})
    for field in _MANUAL_FIELDS:
        if field in manual:
            manifest[field] = manual[field]
    return manifest


def reconcile_one(spec_dir: Path, repo: Path, *, write: bool = False, inventory_record: dict[str, Any] | None = None, relationship_claims: list[dict[str, Any]] | None = None, source_references: list[dict[str, Any]] | None = None, observed_times: dict[str, str | None] | None = None) -> dict[str, Any]:
    spec_path = spec_dir / "spec.md"
    raw = spec_path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    previous = read_manifest(spec_dir)
    had_manifest = previous is not None
    if previous is None:
        text = raw.decode("utf-8")
        title = next((line[2:].strip() for line in text.splitlines() if line.startswith("# ")), spec_dir.name)
        match = re.match(r"^(\d{1,4})", spec_dir.name)
        spec_id = match.group(1) if match else spec_dir.name
        identity = {"spec_id": spec_id, "slug": spec_dir.name, "title": title, "canonical_path": spec_path.relative_to(repo).as_posix(), "revision": inventory_record.get("revision") if inventory_record else None, "digest": digest, "metadata": {"spec_created_at": None, "spec_last_changed_at": None, "implementation_last_touched_at": None, "last_evidence_at": None, "last_runtime_reference_at": None}}
        previous = new_manifest(identity)
        previous["reconciliation"]["mode"] = "INFERRED_SNAPSHOT"
    before = copy.deepcopy(previous)
    changed_spec = previous.get("identity", {}).get("digest") != digest
    if changed_spec:
        previous["identity"]["digest"] = digest
        previous["concurrency"]["expected_spec_digest"] = digest
        previous["reconciliation"]["stale_fields"] = sorted(set(previous["reconciliation"].get("stale_fields", [])) | {"requirements", "implementation_mapping", "verification", "continuation_assessment"})
        previous["lifecycle"]["previous_state"] = previous["lifecycle"].get("current_state")
        previous["lifecycle"]["current_state"] = "VALIDATION_PENDING"
        previous["continuation_assessment"] = {
            "decision": "RECONCILIATION_REQUIRED", "confidence": "UNRESOLVED",
            "rationale": "The normative Spec digest changed after the prior reconciliation.",
            "residual_requirements": [], "evidence": [spec_path.relative_to(repo).as_posix(), digest],
            "next_action": "Reconcile requirements and invalidate only affected evidence.",
        }
        previous["reconciliation"]["reconciled_at"] = utc_now()
    evidence = [{"path": spec_path.relative_to(repo).as_posix(), "kind": "NORMATIVE_SPEC", "digest": digest}] + _supporting_evidence(spec_dir)
    reconciled_at = previous["reconciliation"].get("reconciled_at") or utc_now()
    source_references = source_references or []
    metadata = previous["identity"].setdefault("metadata", {"spec_created_at": None, "spec_last_changed_at": None, "implementation_last_touched_at": None, "last_evidence_at": None, "last_runtime_reference_at": None})
    if not metadata.get("spec_created_at") or not metadata.get("spec_last_changed_at"):
        observed_times = observed_times or git_file_times(repo, spec_path.relative_to(repo).as_posix())
        metadata["spec_created_at"] = metadata.get("spec_created_at") or observed_times["created_at"]
        metadata["spec_last_changed_at"] = metadata.get("spec_last_changed_at") or observed_times["last_changed_at"]
    metadata["last_evidence_at"] = reconciled_at
    current_refs = [ref for ref in source_references if ref["kind"] in {"SOURCE", "TEST"}]
    previous["relevance_assessment"] = {
        "current_architecture_fit": "UNASSESSED", "successor_or_supersession": "CANDIDATE_RELATIONSHIPS_FOUND" if relationship_claims else "UNASSESSED",
        "current_runtime_dependency": "SOURCE_REFERENCES_FOUND" if any(ref["kind"] == "SOURCE" for ref in current_refs) else "NO_DIRECT_REFERENCE_FOUND",
        "current_product_relevance": "UNASSESSED", "residual_requirements": [],
        "security_data_compliance_obligations": "REVIEW_REQUIRED", "implementation_equivalence": "UNASSESSED",
        "conflict_duplication_risk": "REVIEW_REQUIRED" if relationship_claims else "UNASSESSED",
        "active_references": source_references[:500], "deployment_reality": "UNVERIFIED", "evidence": evidence[:100],
    }
    duplicate_ids = []
    try:
        global_inventory = None if inventory_record is not None else inventory(repo)
    except (OSError, ValueError, FileNotFoundError):
        global_inventory = {"records": []}
    own = inventory_record or next((record for record in global_inventory["records"] if record.get("path") == spec_dir.relative_to(repo).as_posix()), None)
    if own:
        duplicate_ids = own.get("relationships", {}).get("duplicate_ids", [])
    conflicts = [{"kind": "DUPLICATE_SPEC_ID", "paths": duplicate_ids}] if duplicate_ids else []
    manual = previous.get("manual_decisions", {})
    if not manual.get("authority"):
        previous["authority"] = {"status": "AUTHORITY_CONFLICT" if conflicts else "UNRESOLVED", "confidence": "LOW" if conflicts else "UNRESOLVED", "predecessors": [], "successors": [], "claims": relationship_claims or [], "conflicts": conflicts, "evidence": evidence[:20]}
    if not manual.get("disposition"):
        previous["disposition"] = {"value": "DORMANT_UNRESOLVED", "rationale": "Current product/architecture relevance is not proven by deterministic repository evidence alone.", "confidence": "UNRESOLVED", "evidence": evidence[:20]}
    if not manual.get("continuation_assessment"):
        decision = "RECONCILIATION_REQUIRED"
        rationale = "Incomplete status, file age, and Spec number are insufficient to justify continuation."
        if conflicts:
            rationale = "Duplicate identity requires explicit authority resolution before continuation."
        previous["continuation_assessment"] = {"decision": decision, "confidence": "UNRESOLVED", "rationale": rationale, "residual_requirements": [], "evidence": evidence[:20] + [{"kind": "SOURCE_REFERENCE", **ref} for ref in source_references[:20]], "next_action": "Review consolidated ambiguity evidence and assess current relevance."}
    previous["reconciliation"].update({"mode": "AUTOMATED_CONSERVATIVE", "confidence": "LOW" if evidence or source_references else "UNRESOLVED", "sources": evidence[:100] + [{"kind": "SOURCE_REFERENCE", **ref} for ref in source_references[:100]], "inferred_fields": ["authority.status", "disposition.value", "continuation_assessment.decision"], "unproven_fields": ["current relevance", "implementation equivalence", "deployment reality", "acceptance"], "reconciled_at": reconciled_at})
    previous["lifecycle"]["updated_at"] = previous["reconciliation"]["reconciled_at"]
    _apply_manual(previous)
    ledger = extract_requirements(spec_path, previous["identity"]["spec_id"], digest)
    ledger_path = handoff_dir(spec_dir) / "requirement-ledger.json"
    if ledger_path.exists():
        old_ledger = json.loads(ledger_path.read_text(encoding="utf-8"))
        if old_ledger.get("spec_digest") == digest and previous.get("manual_decisions", {}).get("requirements"):
            ledger["requirements"] = previous["manual_decisions"]["requirements"]
            ledger["generation"] = old_ledger.get("generation", 0)
    summary = {"total": len(ledger["requirements"]), "applicable": 0, "pass": 0, "fail": 0, "unresolved": 0, "blocked_true_external": 0, "not_applicable": 0}
    for requirement in ledger["requirements"]:
        state = requirement.get("final_state", "OPEN")
        if state == "PASS": summary["pass"] += 1
        elif state == "FAIL": summary["fail"] += 1
        elif state == "BLOCKED_TRUE_EXTERNAL": summary["blocked_true_external"] += 1
        elif state == "NOT_APPLICABLE": summary["not_applicable"] += 1
        else: summary["unresolved"] += 1
    previous["requirements_summary"] = summary
    previous["identity"]["digest"] = digest
    previous["updated_at"] = previous["reconciliation"]["reconciled_at"]
    comparable_before = copy.deepcopy(before)
    comparable_after = copy.deepcopy(previous)
    for value in (comparable_before, comparable_after):
        value.pop("generation", None)
        value.pop("updated_at", None)
    state_changed = (not had_manifest) or comparable_before != comparable_after
    previous["generation"] = before.get("generation", 0) + (1 if state_changed else 0)
    status = render_status(previous, ledger)
    result = {"manifest": previous, "ledger": ledger, "evidence_count": len(evidence), "status": status}
    if write:
        target = handoff_dir(spec_dir)
        with _file_lock(target / ".write.lock"):
            _atomic_write(target / "manifest.json", json_bytes(previous))
            _atomic_write(ledger_path, json_bytes(ledger))
            _atomic_write(target / "STATUS.md", status.encode("utf-8"))
            history = target / "history.jsonl"
            event_type = "CURRENT_TRANSITION" if changed_spec else "RECONCILIATION_SNAPSHOT"
            event = {"event_type": event_type, "observed_at": previous["reconciliation"]["reconciled_at"], "provenance": "INFERRED", "spec_digest": digest, "confidence": previous["reconciliation"]["confidence"], "evidence_count": len(evidence)}
            existing_events = history.read_text(encoding="utf-8").splitlines() if history.exists() else []
            fingerprint = hashlib.sha256(json.dumps(event, sort_keys=True).encode()).hexdigest()
            if not any(json.loads(line).get("fingerprint") == fingerprint for line in existing_events if line.strip()):
                event["fingerprint"] = fingerprint
                with history.open("ab") as stream:
                    stream.write((json.dumps(event, sort_keys=True) + "\n").encode("utf-8"))
    return result


def reconcile_all(repo: Path, *, write: bool = False) -> dict[str, Any]:
    discovered = inventory(repo)
    graph = build_relationship_graph(repo, discovered)
    source_map = collect_source_evidence_for_inventory(repo, discovered)
    observed_times = collect_git_times(repo, [record["spec_path"] for record in discovered["records"] if record["root_kind"] == "CANONICAL" and record["record_kind"] == "CANONICAL_SPEC" and record.get("spec_path")])
    claims: dict[str, list[dict[str, Any]]] = {}
    for edge in graph["edges"]:
        claims.setdefault(edge["predecessor_spec_id"], []).append(edge)
        if edge.get("successor_spec_id"):
            claims.setdefault(edge["successor_spec_id"], []).append(edge)
    outcomes = []
    for record in discovered["records"]:
        if record["root_kind"] == "CANONICAL" and record["record_kind"] in {"CANONICAL_SPEC", "INVALID_SPEC"} and record.get("spec_path"):
            try:
                outcome = reconcile_one(repo / record["path"], repo, write=write, inventory_record=record, relationship_claims=claims.get(str(record.get("spec_id")), []), source_references=source_map.get(str(record.get("spec_id")), []), observed_times=observed_times.get(record["spec_path"]))
                manifest = outcome["manifest"]
                outcomes.append({"record_key": record["record_key"], "spec_id": manifest["identity"]["spec_id"], "generation": manifest["generation"], "disposition": manifest["disposition"]["value"], "lifecycle": manifest["lifecycle"]["current_state"], "continuation": manifest["continuation_assessment"]["decision"], "confidence": manifest["reconciliation"]["confidence"], "requirements": len(outcome["ledger"]["requirements"]), "evidence": outcome["evidence_count"]})
            except (OSError, UnicodeError, ValueError) as exc:
                outcomes.append({"record_key": record["record_key"], "error": f"{type(exc).__name__}: {exc}"})
    return {"inventory": {"record_count": discovered["invariants"]["record_count"], "canonical_spec_count": discovered["invariants"]["canonical_spec_count"], "counts": discovered["counts"], "walk_complete": discovered["invariants"]["walk_complete"]}, "relationship_graph": {"edge_count": graph["edge_count"]}, "reconciled": len(outcomes), "outcomes": outcomes, "write": write}
