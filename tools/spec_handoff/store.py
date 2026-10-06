"""Canonical handoff store with optimistic concurrency and atomic updates."""
from __future__ import annotations

import contextlib
import hashlib
import json
import os
import tempfile
from pathlib import Path
from typing import Any, Iterator

from .contracts import new_manifest, utc_now, validate_ledger, validate_manifest
from .inventory import json_bytes


class StaleWriteError(RuntimeError):
    """Raised when a writer's generation, spec digest, or canonical SHA is stale."""


@contextlib.contextmanager
def _file_lock(path: Path) -> Iterator[None]:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+b") as stream:
        if os.name == "nt":  # pragma: no cover - exercised on Windows CI
            import msvcrt
            stream.seek(0)
            msvcrt.locking(stream.fileno(), msvcrt.LK_LOCK, 1)
            try:
                yield
            finally:
                stream.seek(0)
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            fcntl.flock(stream.fileno(), fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(stream.fileno(), fcntl.LOCK_UN)


def _atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def handoff_dir(spec_dir: Path) -> Path:
    return spec_dir / "handoff"


def read_manifest(spec_dir: Path) -> dict[str, Any] | None:
    path = handoff_dir(spec_dir) / "manifest.json"
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _identity(spec_dir: Path, repo: Path) -> dict[str, Any]:
    spec = spec_dir / "spec.md"
    raw = spec.read_bytes()
    text = raw.decode("utf-8")
    title = next((line.lstrip("# ").strip() for line in text.splitlines() if line.startswith("# ")), spec_dir.name)
    import re
    match = re.match(r"^(\d{1,4})", spec_dir.name)
    revision = re.search(r"\b(?:rev(?:ision)?|version)\s*[:#-]?\s*v?(\d+(?:\.\d+){0,3})\b", text[:12000], re.I)
    return {"spec_id": match.group(1) if match else spec_dir.name, "slug": spec_dir.name, "title": title,
            "canonical_path": spec.relative_to(repo).as_posix(), "revision": revision.group(1) if revision else None,
            "digest": hashlib.sha256(raw).hexdigest(), "metadata": {"spec_created_at": None, "spec_last_changed_at": None,
            "implementation_last_touched_at": None, "last_evidence_at": None, "last_runtime_reference_at": None}}


def initialize(spec_dir: Path, repo: Path, *, dry_run: bool = False) -> dict[str, Any]:
    spec_dir, repo = spec_dir.resolve(), repo.resolve()
    identity = _identity(spec_dir, repo)
    target = handoff_dir(spec_dir)
    if dry_run:
        existing = read_manifest(spec_dir)
        if existing:
            if existing.get("identity", {}).get("digest") != identity["digest"]:
                raise StaleWriteError("spec digest changed; reconcile before initialize")
            return existing
        manifest = new_manifest(identity)
        return manifest
    with _file_lock(target / ".write.lock"):
        existing = read_manifest(spec_dir)
        if existing:
            if existing.get("identity", {}).get("digest") != identity["digest"]:
                raise StaleWriteError("spec digest changed; reconcile before initialize")
            return existing
        manifest = new_manifest(identity)
        ledger = {"schema_version": 1, "spec_id": identity["spec_id"], "spec_digest": identity["digest"], "generation": 0, "requirements": []}
        status = render_status(manifest, ledger)
        _atomic_write(target / "manifest.json", json_bytes(manifest))
        _atomic_write(target / "requirement-ledger.json", json_bytes(ledger))
        _atomic_write(target / "STATUS.md", status.encode("utf-8"))
        event = {"event_type": "RECONCILIATION_SNAPSHOT", "observed_at": utc_now(), "evidence": [identity["canonical_path"], identity["digest"]], "state": "DISCOVERING", "provenance": "INFERRED"}
        _atomic_write(target / "history.jsonl", (json.dumps(event, sort_keys=True) + "\n").encode("utf-8"))
        return manifest


def update_manifest(spec_dir: Path, *, expected_generation: int, expected_spec_digest: str,
                    expected_canonical_sha: str | None, changes: dict[str, Any], repo: Path) -> dict[str, Any]:
    target = handoff_dir(spec_dir)
    with _file_lock(target / ".write.lock"):
        manifest = read_manifest(spec_dir)
        if manifest is None:
            raise FileNotFoundError(f"No canonical handoff in {target}")
        actual_digest = hashlib.sha256((spec_dir / "spec.md").read_bytes()).hexdigest()
        if manifest.get("generation") != expected_generation:
            raise StaleWriteError("manifest generation changed")
        if actual_digest != expected_spec_digest or manifest["identity"].get("digest") != expected_spec_digest:
            raise StaleWriteError("Spec digest changed; reconcile before retry")
        actual_sha = manifest.get("integration", {}).get("canonical_sha")
        if actual_sha != expected_canonical_sha:
            raise StaleWriteError("canonical SHA changed")
        updated = json.loads(json.dumps(manifest))
        for dotted, value in changes.items():
            parts = dotted.split(".")
            if not parts or parts[0] not in {"authority", "disposition", "continuation_assessment", "lifecycle", "relevance_assessment", "implementation", "integration", "verification", "deployment", "acceptance", "dependencies", "blockers", "continuation", "reconciliation", "manual_decisions"}:
                raise ValueError(f"manifest field is derived or not writable: {dotted}")
            current = updated
            for part in parts[:-1]:
                if part not in current or not isinstance(current[part], dict):
                    raise ValueError(f"invalid manifest path: {dotted}")
                current = current[part]
            current[parts[-1]] = value
        updated["generation"] = expected_generation + 1
        updated["updated_at"] = utc_now()
        updated["concurrency"]["expected_spec_digest"] = actual_digest
        updated["concurrency"]["expected_canonical_sha"] = updated.get("integration", {}).get("canonical_sha")
        errors = validate_manifest(updated)
        if errors:
            raise ValueError("manifest validation failed: " + "; ".join(errors))
        ledger_path = target / "requirement-ledger.json"
        ledger = json.loads(ledger_path.read_text(encoding="utf-8")) if ledger_path.exists() else {"requirements": []}
        _atomic_write(target / "manifest.json", json_bytes(updated))
        _atomic_write(target / "STATUS.md", render_status(updated, ledger).encode("utf-8"))
        event = {"event_type": "CURRENT_TRANSITION", "observed_at": updated["updated_at"], "generation": updated["generation"], "changes": sorted(changes), "provenance": "OBSERVED"}
        with (target / "history.jsonl").open("ab") as stream:
            stream.write((json.dumps(event, sort_keys=True) + "\n").encode("utf-8"))
            stream.flush()
            os.fsync(stream.fileno())
        return updated


def update_requirement_ledger(spec_dir: Path, *, expected_manifest_generation: int,
                              expected_ledger_generation: int, expected_spec_digest: str,
                              expected_canonical_sha: str | None, requirement_id: str,
                              changes: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    target = handoff_dir(spec_dir)
    with _file_lock(target / ".write.lock"):
        manifest = read_manifest(spec_dir)
        ledger_path = target / "requirement-ledger.json"
        if manifest is None or not ledger_path.is_file():
            raise FileNotFoundError("canonical manifest and requirement ledger are required")
        ledger = json.loads(ledger_path.read_text(encoding="utf-8"))
        actual_digest = hashlib.sha256((spec_dir / "spec.md").read_bytes()).hexdigest()
        if manifest.get("generation") != expected_manifest_generation:
            raise StaleWriteError("manifest generation changed")
        if ledger.get("generation") != expected_ledger_generation:
            raise StaleWriteError("requirement ledger generation changed")
        if actual_digest != expected_spec_digest or ledger.get("spec_digest") != expected_spec_digest or manifest["identity"].get("digest") != expected_spec_digest:
            raise StaleWriteError("Spec digest changed; reconcile before retry")
        if manifest.get("integration", {}).get("canonical_sha") != expected_canonical_sha:
            raise StaleWriteError("canonical SHA changed")
        updated_ledger = json.loads(json.dumps(ledger))
        requirement = next((row for row in updated_ledger["requirements"] if row.get("requirement_id") == requirement_id), None)
        if requirement is None:
            raise KeyError(f"unknown requirement_id: {requirement_id}")
        allowed = {"applicability", "current_relevance", "successor_mapping", "implementation_status", "implementation_evidence", "verification_method", "verification_evidence", "evidence_sha", "evidence_freshness", "blocker", "next_action", "final_state", "applicability_rationale"}
        unknown = set(changes) - allowed
        if unknown:
            raise ValueError("requirement fields are derived or not writable: " + ", ".join(sorted(unknown)))
        requirement.update(changes)
        updated_ledger["generation"] = expected_ledger_generation + 1
        errors = validate_ledger(updated_ledger, canonical_sha=expected_canonical_sha)
        if errors:
            raise ValueError("requirement ledger validation failed: " + "; ".join(errors))
        updated_manifest = json.loads(json.dumps(manifest))
        updated_manifest["generation"] = expected_manifest_generation + 1
        updated_manifest["updated_at"] = utc_now()
        summary = {"total": len(updated_ledger["requirements"]), "applicable": 0, "pass": 0, "fail": 0, "unresolved": 0, "blocked_true_external": 0, "not_applicable": 0}
        for row in updated_ledger["requirements"]:
            state = row.get("final_state", "OPEN")
            if row.get("applicability") == "APPLICABLE": summary["applicable"] += 1
            if state == "PASS": summary["pass"] += 1
            elif state == "FAIL": summary["fail"] += 1
            elif state == "BLOCKED_TRUE_EXTERNAL": summary["blocked_true_external"] += 1
            elif state == "NOT_APPLICABLE": summary["not_applicable"] += 1
            else: summary["unresolved"] += 1
        updated_manifest["requirements_summary"] = summary
        _atomic_write(target / "manifest.json", json_bytes(updated_manifest))
        _atomic_write(ledger_path, json_bytes(updated_ledger))
        _atomic_write(target / "STATUS.md", render_status(updated_manifest, updated_ledger).encode("utf-8"))
        event = {"event_type": "CURRENT_TRANSITION", "observed_at": updated_manifest["updated_at"], "provenance": "OBSERVED", "requirement_id": requirement_id, "changes": sorted(changes), "manifest_generation": updated_manifest["generation"], "ledger_generation": updated_ledger["generation"]}
        with (target / "history.jsonl").open("ab") as stream:
            stream.write((json.dumps(event, sort_keys=True) + "\n").encode("utf-8"))
            stream.flush()
            os.fsync(stream.fileno())
        return updated_manifest, updated_ledger


def render_status(manifest: dict[str, Any], ledger: dict[str, Any]) -> str:
    """Generated projection; edits are discarded by the next writer."""
    identity = manifest.get("identity", {})
    disp = manifest.get("disposition", {})
    assessment = manifest.get("continuation_assessment", {})
    lifecycle = manifest.get("lifecycle", {})
    summary = manifest.get("requirements_summary", {})
    return "\n".join([
        "<!-- GENERATED FROM manifest.json AND requirement-ledger.json; DO NOT EDIT -->",
        f"# {identity.get('spec_id', 'UNKNOWN')} — {identity.get('title', 'Untitled')}", "",
        f"- Disposition: `{disp.get('value', 'INVALID_OR_UNKNOWN')}` ({disp.get('confidence', 'UNRESOLVED')})",
        f"- Lifecycle: `{lifecycle.get('current_state', 'DISCOVERING')}`",
        f"- Continuation: `{assessment.get('decision', 'RECONCILIATION_REQUIRED')}` ({assessment.get('confidence', 'UNRESOLVED')})",
        f"- Requirements: {summary.get('pass', 0)} pass / {summary.get('unresolved', 0)} unresolved of {summary.get('total', len(ledger.get('requirements', [])))}",
        f"- Next action: {assessment.get('next_action', 'Reconcile evidence.')}",
        f"- Manifest generation: {manifest.get('generation', 0)}", "",
    ])
