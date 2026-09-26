#!/usr/bin/env python3
"""Build a read-only, evidence-labeled manifest of the Drizzle migration tree."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


CREATE_TABLE_RE = re.compile(
    r"\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"
    r"(?:(?:\"?([A-Za-z_][\w$]*)\"?)\s*\.\s*)?"
    r"\"?([A-Za-z_][\w$]*)\"?",
    re.IGNORECASE,
)
REFERENCES_RE = re.compile(
    r"\bREFERENCES\s+"
    r"(?:(?:\"?([A-Za-z_][\w$]*)\"?)\s*\.\s*)?"
    r"\"?([A-Za-z_][\w$]*)\"?",
    re.IGNORECASE,
)
MIGRATION_PREFIX_RE = re.compile(r"^(\d+)_")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _sql_without_comments(sql: str) -> str:
    sql = re.sub(r"/\*.*?\*/", " ", sql, flags=re.DOTALL)
    return re.sub(r"--[^\n]*", " ", sql)


def _table_names(pattern: re.Pattern[str], sql: str) -> set[str]:
    names = set()
    for schema, table in pattern.findall(_sql_without_comments(sql)):
        # PostgreSQL folds unquoted identifiers to lower-case. Lower-casing is
        # conservative for this manifest; quoted mixed-case names stay a caveat.
        names.add(table.lower())
    return names


def _git(root: Path, *args: str) -> str | None:
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=root,
            check=False,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        return None
    if result.returncode != 0:
        return None
    return result.stdout.strip()


def _git_file_evidence(root: Path, relative_path: str) -> dict[str, Any]:
    tracked = _git(root, "ls-files", "--error-unmatch", "--", relative_path) is not None
    status = _git(root, "status", "--porcelain=v1", "--untracked-files=all", "--", relative_path)
    if not tracked:
        git_status = "untracked" if status else "not_tracked_or_git_unavailable"
        return {
            "git_status": git_status,
            "ownership_status": "unassigned",
            "history_author_hint": None,
            "history_commit_hint": None,
            "ownership_note": "Git tracking/authorship is not proof of current file ownership.",
        }

    if not status:
        git_status = "tracked_clean"
    elif status.startswith("D") or status.endswith("D"):
        git_status = "tracked_deleted_or_staged_deleted"
    else:
        git_status = "tracked_modified"

    history = _git(root, "log", "-1", "--format=%h%x09%an", "--", relative_path)
    commit_hint = author_hint = None
    if history:
        pieces = history.split("\t", maxsplit=1)
        if pieces:
            commit_hint = pieces[0]
        if len(pieces) > 1:
            author_hint = pieces[1]
    return {
        "git_status": git_status,
        "ownership_status": "unassigned",
        "history_author_hint": author_hint,
        "history_commit_hint": commit_hint,
        "ownership_note": "Git history is provenance only; no authoritative owner registry was consulted.",
    }


def _migration_prefix(tag: str) -> int | None:
    match = MIGRATION_PREFIX_RE.match(tag)
    return int(match.group(1)) if match else None


def _read_related_snapshots(meta_dir: Path, root: Path) -> list[dict[str, Any]]:
    snapshots = []
    for tag in ("0146", "0147"):
        path = meta_dir / f"{tag}_snapshot.json"
        if not path.exists():
            snapshots.append({
                "tag": tag,
                "path": path.relative_to(root).as_posix(),
                "exists": False,
                "sha256": None,
                "id": None,
                "prevId": None,
            })
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        rel = path.relative_to(root).as_posix()
        snapshots.append({
            "tag": tag,
            "path": rel,
            "exists": True,
            "sha256": _sha256(path),
            "id": data.get("id"),
            "prevId": data.get("prevId"),
            **_git_file_evidence(root, rel),
        })
    return snapshots


def build_manifest(root: Path) -> dict[str, Any]:
    root = Path(root).resolve()
    drizzle = root / "apps/web/drizzle"
    journal_path = drizzle / "meta/_journal.json"
    if not journal_path.is_file():
        raise ValueError(f"missing Drizzle journal: {journal_path}")

    journal = json.loads(journal_path.read_text(encoding="utf-8"))
    journal_entries = journal.get("entries")
    if not isinstance(journal_entries, list):
        raise ValueError("Drizzle journal entries must be a JSON array")

    tags = [str(entry.get("tag", "")) for entry in journal_entries]
    indices = [entry.get("idx") for entry in journal_entries]
    duplicate_tags = sorted(tag for tag, count in Counter(tags).items() if tag and count > 1)
    duplicate_indices = sorted(index for index, count in Counter(indices).items() if count > 1)
    journal_by_tag: dict[str, dict[str, Any]] = {}
    for entry in journal_entries:
        tag = str(entry.get("tag", ""))
        if tag and tag not in journal_by_tag:
            journal_by_tag[tag] = entry

    sql_paths = sorted(drizzle.glob("*.sql"), key=lambda path: path.name)
    sql_by_tag = {path.stem: path for path in sql_paths}
    all_tags = sorted(set(journal_by_tag) | set(sql_by_tag), key=lambda tag: (
        _migration_prefix(tag) if _migration_prefix(tag) is not None else 10**12,
        tag,
    ))

    parsed: dict[str, dict[str, Any]] = {}
    table_producers: dict[str, list[str]] = defaultdict(list)
    for tag in all_tags:
        path = sql_by_tag.get(tag)
        if path is None:
            parsed[tag] = {"creates": set(), "references": set()}
            continue
        sql = path.read_text(encoding="utf-8", errors="replace")
        creates = _table_names(CREATE_TABLE_RE, sql)
        references = _table_names(REFERENCES_RE, sql)
        parsed[tag] = {"creates": creates, "references": references}
        for table in creates:
            table_producers[table].append(tag)

    tag_to_idx = {
        tag: entry.get("idx")
        for tag, entry in journal_by_tag.items()
    }
    migrations = []
    for tag in all_tags:
        path = sql_by_tag.get(tag)
        entry = journal_by_tag.get(tag)
        relative_path = path.relative_to(root).as_posix() if path else f"apps/web/drizzle/{tag}.sql"
        if entry is None:
            chain_status = "excluded_not_journaled"
            chain_reason = "SQL file has no entry in the current Drizzle journal."
        elif path is None:
            chain_status = "blocked_missing_sql"
            chain_reason = "Journal entry has no matching SQL file."
        else:
            chain_status = "journaled_pending_owner_and_target_approval"
            chain_reason = "Journal membership does not prove ownership, approval, or applied state."

        dependencies = []
        unresolved = []
        order_conflicts = []
        for referenced_table in sorted(parsed[tag]["references"] - parsed[tag]["creates"]):
            producers = [producer for producer in table_producers.get(referenced_table, []) if producer != tag]
            earlier = [
                producer for producer in producers
                if isinstance(tag_to_idx.get(tag), int)
                and isinstance(tag_to_idx.get(producer), int)
                and tag_to_idx[producer] < tag_to_idx[tag]
            ]
            if len(earlier) == 1:
                dependencies.append({
                    "table": referenced_table,
                    "migration": earlier[0],
                    "evidence": "static CREATE TABLE / REFERENCES match with earlier journal index",
                })
            elif len(earlier) > 1:
                closest = max(earlier, key=lambda item: tag_to_idx[item])
                dependencies.append({
                    "table": referenced_table,
                    "migration": closest,
                    "evidence": "static match; closest earlier table producer, heuristic",
                })
            elif not isinstance(tag_to_idx.get(tag), int):
                current_prefix = _migration_prefix(tag)
                prefix_candidates = [
                    producer for producer in producers
                    if current_prefix is not None
                    and _migration_prefix(producer) is not None
                    and _migration_prefix(producer) < current_prefix
                ]
                if prefix_candidates:
                    nearest_prefix = max(_migration_prefix(producer) for producer in prefix_candidates)
                    nearest = [
                        producer for producer in prefix_candidates
                        if _migration_prefix(producer) == nearest_prefix
                    ]
                    if len(nearest) == 1:
                        dependencies.append({
                            "table": referenced_table,
                            "migration": nearest[0],
                            "evidence": "static match with earlier numeric filename prefix; order must be verified by replay",
                        })
                    else:
                        order_conflicts.append({"table": referenced_table, "producers": sorted(nearest)})
                else:
                    order_conflicts.append({"table": referenced_table, "producers": sorted(producers)})
            elif producers:
                order_conflicts.append({"table": referenced_table, "producers": sorted(producers)})
            else:
                unresolved.append(referenced_table)

        git_evidence = _git_file_evidence(root, relative_path) if path else {
            "git_status": "missing",
            "ownership_status": "unassigned",
            "history_author_hint": None,
            "history_commit_hint": None,
            "ownership_note": "Missing SQL file; no owner can be inferred.",
        }
        migrations.append({
            "tag": tag,
            "journal_idx": entry.get("idx") if entry else None,
            "journal_when": entry.get("when") if entry else None,
            "path": relative_path,
            "exists": path is not None,
            "sha256": _sha256(path) if path else None,
            **git_evidence,
            "creates_tables": sorted(parsed[tag]["creates"]),
            "references_tables": sorted(parsed[tag]["references"]),
            "depends_on": dependencies,
            "unresolved_references": unresolved,
            "possible_order_conflicts": order_conflicts,
            "chain_status": chain_status,
            "chain_reason": chain_reason,
            "approval_status": "not_granted",
            "applied_status": "unknown",
            "applied_status_reason": "No approved target database was queried; never infer this from Git or journal state.",
        })

    related_snapshots = _read_related_snapshots(drizzle / "meta", root)
    snapshot_ids = [item.get("id") for item in related_snapshots if item.get("id")]
    duplicate_snapshot_ids = sorted(
        snapshot_id for snapshot_id, count in Counter(snapshot_ids).items() if count > 1
    )
    missing_sql = sorted(tag for tag in journal_by_tag if tag not in sql_by_tag)
    unjournaled_sql = sorted(tag for tag in sql_by_tag if tag not in journal_by_tag)

    schema_path = root / "apps/web/drizzle/schema.ts"
    schema_rel = schema_path.relative_to(root).as_posix()
    schema_source = {
        "path": schema_rel,
        "exists": schema_path.is_file(),
        "sha256": _sha256(schema_path) if schema_path.is_file() else None,
        **(_git_file_evidence(root, schema_rel) if schema_path.is_file() else {
            "git_status": "missing",
            "ownership_status": "unassigned",
            "history_author_hint": None,
            "history_commit_hint": None,
            "ownership_note": "Schema source file is missing.",
        }),
        "note": "This fingerprint identifies the declared Drizzle schema source only; it is not a database catalog fingerprint.",
    }
    config_path = root / "apps/web/drizzle.config.ts"
    package_path = root / "apps/web/package.json"
    content = {
        "manifest_version": 1,
        "migration_command": "cd apps/web && pnpm run db:migrate",
        "tooling": {
            "config_path": config_path.relative_to(root).as_posix(),
            "config_sha256": _sha256(config_path) if config_path.is_file() else None,
            "package_path": package_path.relative_to(root).as_posix(),
            "package_json_sha256": _sha256(package_path) if package_path.is_file() else None,
        },
        "schema_baseline": {
            "schema_definition": schema_source,
            "database_status": "not_observed_no_approved_target",
            "database_catalog_fingerprint": None,
            "expected_post_migration_schema_status": "pending_approved_empty_database_replay_and_catalog_verification",
        },
        "journal": {
            "path": journal_path.relative_to(root).as_posix(),
            "sha256": _sha256(journal_path),
            "version": journal.get("version"),
            "dialect": journal.get("dialect"),
            "entry_count": len(journal_entries),
            **_git_file_evidence(root, journal_path.relative_to(root).as_posix()),
        },
        "coverage_note": "Manifest inventories every root-level Drizzle SQL migration and compares it with the current journal. SQL dependency extraction is static and partial; no database is queried.",
        "consistency": {
            "duplicate_journal_tags": duplicate_tags,
            "duplicate_journal_indices": duplicate_indices,
            "journal_entries_missing_sql": missing_sql,
            "sql_files_missing_journal_entry": unjournaled_sql,
            "duplicate_0146_0147_snapshot_ids": duplicate_snapshot_ids,
        },
        "related_snapshots": related_snapshots,
        "migrations": migrations,
    }
    content["applied_status_policy"] = "unknown unless independently verified against the explicitly approved target"
    canonical = json.dumps(content, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    content["manifest_sha256"] = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return content


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd(), help="repository root")
    parser.add_argument("--output", type=Path, help="optional JSON output path; stdout is the default")
    args = parser.parse_args(argv)
    try:
        manifest = build_manifest(args.root)
    except (OSError, json.JSONDecodeError, ValueError) as error:
        print(f"migration manifest error: {error}", file=sys.stderr)
        return 2
    rendered = json.dumps(manifest, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    else:
        sys.stdout.write(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
