"""Command-line entry point for canonical Spec handoff operations."""
from __future__ import annotations

import argparse
import json
import os
import tempfile
from pathlib import Path

from .contracts import completion_eligible, validate_ledger
from .inventory import inventory, json_bytes
from .index import build_views, generate_spec_status, status_drift, write_views
from .reconcile import reconcile_all, reconcile_one
from .store import initialize, read_manifest, render_status


def filter_records(rows: list[dict], name: str) -> list[dict]:
    key = name.upper().replace("-", "_")
    active = {"ACTIVE_CANONICAL", "ACTIVE_SUPPORTING", "LEGACY_COMPATIBILITY"}
    if key == "COMPLETE": predicate = lambda row: row.get("completion_eligible") is True
    elif key == "CURRENT_ACTIVE": predicate = lambda row: row.get("disposition") in active
    elif key == "CURRENT_INCOMPLETE": predicate = lambda row: row.get("disposition") in active and not row.get("completion_eligible")
    elif key == "VALIDATION_ONLY": predicate = lambda row: row.get("continuation") == "VALIDATION_ONLY"
    elif key == "CONTINUE_REQUIRED": predicate = lambda row: row.get("continuation") == "CONTINUE_REQUIRED"
    elif key == "CONTINUE_RECOMMENDED": predicate = lambda row: row.get("continuation") == "CONTINUE_RECOMMENDED"
    elif key == "CONTINUE_OPTIONAL": predicate = lambda row: row.get("continuation") == "CONTINUE_OPTIONAL"
    elif key == "DO_NOT_CONTINUE": predicate = lambda row: str(row.get("continuation", "")).startswith("DO_NOT_CONTINUE")
    elif key in {"SUPERSEDED_FULL", "SUPERSEDED_PARTIAL", "RETIRED", "HISTORICAL_ONLY"}: predicate = lambda row: row.get("disposition") == key
    elif key == "LOW_CONFIDENCE": predicate = lambda row: row.get("confidence") in {"LOW", "UNRESOLVED"}
    elif key == "AUTHORITY_CONFLICT": predicate = lambda row: row.get("authority") == "AUTHORITY_CONFLICT"
    elif key == "STALE_EVIDENCE": predicate = lambda row: row.get("evidence_freshness") in {"STALE", "STALE_EVIDENCE"}
    elif key == "TRUE_BLOCKER": predicate = lambda row: row.get("true_blockers", 0) > 0
    else: raise ValueError(f"unknown status filter: {name}")
    return [row for row in rows if predicate(row)]


def _atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp_name, path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="spec-handoff")
    parser.add_argument("--repo", type=Path, default=Path.cwd(), help="repository root")
    commands = parser.add_subparsers(dest="command", required=True)
    inv = commands.add_parser("inventory", help="read-only dynamic Spec inventory")
    inv.add_argument("--output", type=Path, help="write JSON inventory to this path")
    inv.add_argument("--dry-run", action="store_true", help="print only; default when --output is omitted")
    init = commands.add_parser("init", help="initialize canonical handoff files for one valid Spec")
    init_target = init.add_mutually_exclusive_group(required=True)
    init_target.add_argument("--spec-dir", type=Path)
    init_target.add_argument("--all", action="store_true")
    init.add_argument("--write", action="store_true", help="persist files; default is dry-run")
    init.add_argument("--dry-run", action="store_true")
    status = commands.add_parser("status", help="show or regenerate generated status projection")
    status.add_argument("--spec-dir", type=Path)
    status.add_argument("--global", dest="global_status", action="store_true")
    status.add_argument("--filter", dest="status_filter")
    status.add_argument("--regenerate", action="store_true")
    validate = commands.add_parser("validate", help="validate a handoff and its requirement ledger")
    validate.add_argument("--spec-dir", type=Path)
    reconcile = commands.add_parser("reconcile", help="conservatively reconcile Spec evidence")
    target = reconcile.add_mutually_exclusive_group(required=True)
    target.add_argument("--spec-dir", type=Path)
    target.add_argument("--all", action="store_true")
    reconcile.add_argument("--write", action="store_true", help="persist results; default is dry-run")
    reconcile.add_argument("--output", type=Path)
    index = commands.add_parser("index", help="generate or check global derived views")
    index.add_argument("--write", action="store_true", help="write generated views; default prints invariant summary")
    index.add_argument("--check", action="store_true", help="fail if generated views drift from source manifests")
    validate.add_argument("--all", action="store_true", help="validate every indexed canonical handoff and global invariants")
    next_cmd = commands.add_parser("next", help="show the next justified continuation candidates")
    next_cmd.add_argument("--limit", type=int, default=20)
    stale = commands.add_parser("stale", help="find stale spec and exact-SHA evidence")
    relationships = commands.add_parser("relationships", help="show known and candidate Spec relationships")
    update = commands.add_parser("update", help="optimistically update canonical manifest through the shared writer")
    update.add_argument("--spec-dir", type=Path, required=True)
    update.add_argument("--expected-generation", type=int, required=True)
    update.add_argument("--expected-spec-digest", required=True)
    update.add_argument("--expected-canonical-sha")
    update.add_argument("--changes-json", required=True, help="JSON object containing dotted manifest paths")
    update_req = commands.add_parser("requirement-update", help="optimistically update one canonical requirement row")
    update_req.add_argument("--spec-dir", type=Path, required=True)
    update_req.add_argument("--expected-manifest-generation", type=int, required=True)
    update_req.add_argument("--expected-ledger-generation", type=int, required=True)
    update_req.add_argument("--expected-spec-digest", required=True)
    update_req.add_argument("--expected-canonical-sha")
    update_req.add_argument("--requirement-id", required=True)
    update_req.add_argument("--changes-json", required=True)
    args = parser.parse_args(argv)
    if args.command == "inventory":
        result = inventory(args.repo)
        data = json_bytes(result)
        if args.output and not args.dry_run:
            _atomic_write(args.output, data)
            print(f"inventory written: {args.output} ({result['invariants']['record_count']} records)")
        else:
            print(data.decode("utf-8"), end="")
        return 0 if result["invariants"]["walk_complete"] else 2
    if args.command == "init":
        persist = args.write and not args.dry_run
        if args.all:
            report = inventory(args.repo)
            outcomes = []
            for record in report["records"]:
                if record["root_kind"] == "CANONICAL" and record["record_kind"] == "CANONICAL_SPEC":
                    value = initialize(args.repo / record["path"], args.repo, dry_run=not persist)
                    outcomes.append({"path": record["path"], "spec_id": value["identity"]["spec_id"], "generation": value["generation"]})
            print(json.dumps({"initialized_or_present": len(outcomes), "records": outcomes, "write": persist}, indent=2))
        else:
            if not args.spec_dir:
                parser.error("init requires --spec-dir or --all")
            value = initialize(args.spec_dir, args.repo, dry_run=not persist)
            print(json_bytes(value).decode("utf-8"), end="")
        return 0
    if args.command == "status":
        if args.global_status:
            rows = build_views(args.repo)["spec-index.json"]["records"]
            if args.status_filter:
                rows = filter_records(rows, args.status_filter)
            print(json.dumps({"filter": args.status_filter or "ALL", "record_count": len(rows), "records": rows}, indent=2))
            return 0
        if not args.spec_dir:
            parser.error("status requires --spec-dir or --global")
        handoff = args.spec_dir / "handoff"
        value = read_manifest(args.spec_dir)
        if value is None:
            parser.error(f"no handoff manifest found in {handoff}")
        ledger_path = handoff / "requirement-ledger.json"
        ledger = json.loads(ledger_path.read_text(encoding="utf-8")) if ledger_path.exists() else {"requirements": []}
        rendered = render_status(value, ledger)
        if args.regenerate:
            from .store import _atomic_write
            _atomic_write(handoff / "STATUS.md", rendered.encode("utf-8"))
        print(rendered, end="")
        return 0
    if args.command == "validate":
        from .contracts import validate_manifest
        if args.all:
            discovered = inventory(args.repo)
            missing = []
            invalid = []
            for record in discovered["records"]:
                if record["root_kind"] == "CANONICAL" and record["record_kind"] == "CANONICAL_SPEC":
                    manifest = read_manifest(args.repo / record["path"])
                    if manifest is None:
                        missing.append(record["path"])
                    else:
                        errors = validate_manifest(manifest)
                        if manifest.get("identity", {}).get("digest") != record.get("digest"):
                            errors.append("manifest identity digest is stale against normative Spec")
                        ledger_path = args.repo / record["path"] / "handoff/requirement-ledger.json"
                        if ledger_path.exists():
                            ledger = json.loads(ledger_path.read_text(encoding="utf-8"))
                            ledger_errors = validate_ledger(ledger, canonical_sha=manifest.get("integration", {}).get("canonical_sha"))
                            if ledger.get("spec_digest") != record.get("digest"):
                                ledger_errors.append("requirement ledger digest is stale against normative Spec")
                            errors.extend(ledger_errors)
                        else:
                            errors.append("missing requirement-ledger.json")
                        if errors: invalid.append({"path": record["path"], "errors": errors})
            views = build_views(args.repo)
            report = {"discovered_records": discovered["invariants"]["record_count"], "indexed_records": views["spec-index.json"]["record_count"], "canonical_specs": discovered["invariants"]["canonical_spec_count"], "missing_handoffs": missing, "invalid_manifests": invalid, "generated_status_drift": status_drift(args.repo), "global_index_equal": views["reconciliation-report.json"]["invariant_discovered_equals_indexed"], "walk_complete": discovered["invariants"]["walk_complete"]}
            print(json.dumps(report, indent=2))
            return 0 if not missing and not invalid and not report["generated_status_drift"] and report["global_index_equal"] and report["walk_complete"] else 2
        if not args.spec_dir:
            parser.error("validate requires --spec-dir or --all")
        manifest = read_manifest(args.spec_dir)
        if manifest is None:
            print("missing manifest")
            return 2
        ledger_path = args.spec_dir / "handoff/requirement-ledger.json"
        ledger = json.loads(ledger_path.read_text(encoding="utf-8")) if ledger_path.exists() else {"requirements": []}
        errors = validate_manifest(manifest)
        errors.extend(validate_ledger(ledger, canonical_sha=manifest.get("integration", {}).get("canonical_sha")))
        eligible, reasons = completion_eligible(manifest, ledger)
        print(json.dumps({"valid": not errors, "completion_eligible": eligible, "validation_errors": errors, "completion_reasons": reasons}, indent=2))
        return 0 if not errors else 2
    if args.command == "reconcile":
        result = reconcile_all(args.repo, write=args.write) if args.all else reconcile_one(args.spec_dir, args.repo, write=args.write)
        if not args.all:
            result = {"identity": result["manifest"]["identity"], "generation": result["manifest"]["generation"], "disposition": result["manifest"]["disposition"], "lifecycle": result["manifest"]["lifecycle"], "continuation_assessment": result["manifest"]["continuation_assessment"], "requirements": len(result["ledger"]["requirements"]), "evidence_count": result["evidence_count"], "write": args.write}
        data = json_bytes(result)
        if args.output:
            from .store import _atomic_write
            _atomic_write(args.output, data)
            print(f"reconciliation report written: {args.output}")
        else:
            print(data.decode("utf-8"), end="")
        return 0
    if args.command == "index":
        views = build_views(args.repo)
        drift = []
        for name, content in views.items():
            path = args.repo / "specs/_status" / name
            expected = content.encode("utf-8") if isinstance(content, str) else json_bytes(content)
            if not path.is_file() or path.read_bytes() != expected:
                drift.append(name)
        per_spec_drift = status_drift(args.repo)
        if args.write:
            for record in inventory(args.repo)["records"]:
                if record["root_kind"] == "CANONICAL" and record["record_kind"] == "CANONICAL_SPEC" and read_manifest(args.repo / record["path"]):
                    generate_spec_status(args.repo / record["path"])
            write_views(args.repo, views)
            per_spec_drift = status_drift(args.repo)
        print(json.dumps({"record_count": views["spec-index.json"]["record_count"], "canonical_spec_count": views["spec-index.json"]["canonical_spec_count"], "global_invariant": views["reconciliation-report.json"]["invariant_discovered_equals_indexed"], "drift": drift, "per_spec_status_drift": per_spec_drift, "written": args.write}, indent=2))
        return 2 if args.check and (drift or per_spec_drift) else 0
    if args.command in {"next", "stale", "relationships"}:
        views = build_views(args.repo)
        if args.command == "next":
            print(json.dumps(views["continuation-queue.json"]["records"][:max(0, args.limit)], indent=2))
        elif args.command == "stale":
            result = []
            for record in inventory(args.repo)["records"]:
                if record["root_kind"] != "CANONICAL" or record["record_kind"] != "CANONICAL_SPEC": continue
                manifest = read_manifest(args.repo / record["path"])
                if not manifest: result.append({"path": record["path"], "kind": "HANDOFF_MISSING"}); continue
                if manifest.get("identity", {}).get("digest") != record.get("digest"): result.append({"path": record["path"], "kind": "SPEC_DIGEST_CHANGED"})
                canonical_sha = manifest.get("integration", {}).get("canonical_sha")
                verification = manifest.get("verification", {})
                if verification.get("status") == "PASS" and verification.get("sha") != canonical_sha: result.append({"path": record["path"], "kind": "VERIFICATION_SHA_STALE"})
            print(json.dumps(result, indent=2))
        else:
            result = []
            for row in views["spec-index.json"]["records"]:
                if row.get("successors") or row.get("relationship_claims") or row.get("relationships", {}).get("duplicate_ids") or row.get("relationships", {}).get("duplicate_revisions"):
                    result.append({"path": row["path"], "spec_id": row.get("spec_id"), "successors": row.get("successors", []), "relationship_claims": row.get("relationship_claims", []), "candidates": row.get("relationships", {})})
            print(json.dumps(result, indent=2))
        return 0
    if args.command == "update":
        from .store import update_manifest
        changes_path = Path(args.changes_json)
        changes = json.loads(changes_path.read_text(encoding="utf-8") if changes_path.is_file() else args.changes_json)
        if not isinstance(changes, dict):
            parser.error("--changes-json must decode to an object")
        updated = update_manifest(args.spec_dir, expected_generation=args.expected_generation,
                                  expected_spec_digest=args.expected_spec_digest,
                                  expected_canonical_sha=args.expected_canonical_sha,
                                  changes=changes, repo=args.repo)
        print(json.dumps({"generation": updated["generation"], "digest": updated["identity"]["digest"], "canonical_sha": updated["integration"].get("canonical_sha")}, indent=2))
        return 0
    if args.command == "requirement-update":
        from .store import update_requirement_ledger
        changes_path = Path(args.changes_json)
        changes = json.loads(changes_path.read_text(encoding="utf-8") if changes_path.is_file() else args.changes_json)
        if not isinstance(changes, dict):
            parser.error("--changes-json must decode to an object")
        manifest, ledger = update_requirement_ledger(args.spec_dir,
            expected_manifest_generation=args.expected_manifest_generation,
            expected_ledger_generation=args.expected_ledger_generation,
            expected_spec_digest=args.expected_spec_digest,
            expected_canonical_sha=args.expected_canonical_sha,
            requirement_id=args.requirement_id, changes=changes)
        print(json.dumps({"manifest_generation": manifest["generation"], "ledger_generation": ledger["generation"], "canonical_sha": manifest["integration"].get("canonical_sha")}, indent=2))
        return 0
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
