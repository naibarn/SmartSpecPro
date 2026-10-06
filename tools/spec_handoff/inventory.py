"""Dynamic, deterministic inventory of configured Spec collections."""
from __future__ import annotations

import hashlib
import json
import os
import re
import tomllib
from pathlib import Path
from typing import Any

_ID = re.compile(r"^(?P<id>\d{1,4})(?:[-_ ].*)?$")
_REV = re.compile(r"\b(?:rev(?:ision)?|version)\s*[:#-]?\s*v?(\d+(?:\.\d+){0,3})\b", re.I)


def load_config(repo: Path) -> dict[str, Any]:
    path = repo / "specs/_config/handoff-roots.toml"
    with path.open("rb") as stream:
        config = tomllib.load(stream)
    settings = config.get("spec_handoff", {})
    if settings.get("schema_version") != 1:
        raise ValueError("unsupported specs/_config/handoff-roots.toml schema_version")
    settings.setdefault("planning_roots", [])
    for key in ("canonical_roots", "alternate_roots", "planning_roots"):
        if not isinstance(settings.get(key), list) or not all(isinstance(item, str) for item in settings[key]):
            raise ValueError(f"spec_handoff.{key} must be a list of relative paths")
        for item in settings[key]:
            candidate = Path(item)
            if candidate.is_absolute() or ".." in candidate.parts:
                raise ValueError(f"Spec roots must remain inside the repository: {item}")
    configured = [(kind, Path(item).parts) for kind in ("canonical_roots", "alternate_roots") for item in settings[kind]]
    for index, (kind_a, path_a) in enumerate(configured):
        for kind_b, path_b in configured[index + 1:]:
            if path_a[:len(path_b)] == path_b or path_b[:len(path_a)] == path_a:
                raise ValueError(f"configured Spec roots must not overlap: {Path(*path_a)} and {Path(*path_b)}")
    return settings


def _read_spec(path: Path) -> tuple[str | None, str | None, str | None, str | None]:
    try:
        raw = path.read_bytes()
        text = raw.decode("utf-8")
    except (OSError, UnicodeError) as exc:
        return None, None, None, f"SPEC_READ_ERROR:{type(exc).__name__}"
    digest = hashlib.sha256(raw).hexdigest()
    if not text.strip():
        return None, digest, None, "EMPTY_SPEC"
    title = None
    for line in text.splitlines()[:80]:
        heading = re.match(r"^\s*#\s+(.+?)\s*#*\s*$", line)
        if heading:
            title = heading.group(1).strip()
            break
    revision = next(iter(_REV.findall(text[:12000])), None)
    return title, digest, revision, None


def _id_for(path: Path) -> str | None:
    match = _ID.match(path.name)
    return match.group("id") if match else None


def _identical_spec_parent(path: Path, root: Path, repo: Path, spec_id: str | None, digest: str | None) -> str | None:
    if not spec_id or not digest:
        return None
    for ancestor in path.parents:
        if ancestor == root:
            break
        ancestor_spec = ancestor / "spec.md"
        if _id_for(ancestor) != spec_id or not ancestor_spec.is_file() or ancestor_spec.is_symlink():
            continue
        _, ancestor_digest, _, _ = _read_spec(ancestor_spec)
        if ancestor_digest == digest:
            return ancestor.relative_to(repo).as_posix()
    return None


def inventory(repo: Path) -> dict[str, Any]:
    repo = repo.resolve()
    config = load_config(repo)
    records: list[dict[str, Any]] = []
    diagnostics: list[dict[str, str]] = []
    roots = [("CANONICAL", item) for item in config["canonical_roots"]] + [("ALTERNATE", item) for item in config["alternate_roots"]]
    seen: set[tuple[str, str]] = set()
    for root_kind, root_name in roots:
        root_rel = Path(root_name)
        root = repo / root_rel
        if root.is_symlink():
            diagnostics.append({"code": "ROOT_SYMLINK_NOT_FOLLOWED", "path": root_rel.as_posix()})
            continue
        if not root.is_dir():
            diagnostics.append({"code": "ROOT_MISSING", "path": root_rel.as_posix()})
            continue
        spec_dirs: set[Path] = set()
        id_dirs: set[Path] = set()
        walk_errors: list[str] = []
        for base, names, files in os.walk(root, followlinks=False, onerror=lambda e: walk_errors.append(str(e))):
            base_path = Path(base)
            names[:] = sorted(name for name in names if not (base_path / name).is_symlink())
            if base_path != root and "spec.md" in files:
                spec_dirs.add(base_path)
            companions = {"requirements.md", "request.md", "brief.md", "plan.md", "claude-spec.md", "project-manifest.md"}
            is_root_child = base_path.parent == root
            is_candidate = bool(_id_for(base_path)) and bool(companions.intersection(files))
            if base_path != root and ((root_kind == "CANONICAL" and is_root_child) or is_candidate):
                id_dirs.add(base_path)
        for error in walk_errors:
            diagnostics.append({"code": "ROOT_TRAVERSAL_ERROR", "path": root_rel.as_posix(), "detail": error})
        for path in sorted(spec_dirs | id_dirs):
            rel = path.relative_to(repo).as_posix()
            key = (root_kind, rel)
            if key in seen:
                continue
            seen.add(key)
            spec_path = path / "spec.md"
            has_spec = spec_path.is_file() and not spec_path.is_symlink()
            spec_link = spec_path.is_symlink()
            title, digest, revision, problem = _read_spec(spec_path) if has_spec else (None, None, None, "SPEC_SYMLINK_NOT_FOLLOWED" if spec_link else None)
            duplicate_parent = _identical_spec_parent(path, root, repo, _id_for(path), digest) if has_spec and root_kind == "CANONICAL" else None
            if root_kind == "ALTERNATE":
                kind = "HISTORICAL_SPEC" if has_spec else "HISTORICAL_CANDIDATE"
            elif duplicate_parent:
                kind = "DUPLICATE_SPEC_COPY"
            elif has_spec:
                kind = "CANONICAL_SPEC" if problem is None else "INVALID_SPEC"
            elif root_name in config["planning_roots"]:
                kind = "PLANNING_ARTIFACT"
            elif root_name in config["canonical_roots"] and any((path / relative).is_file() for relative in ("requirements.md", "requirements.deep-project/requirements.md")):
                kind = "PROJECT_REQUIREMENTS"
            elif root_kind == "CANONICAL" and path.parent == root and _id_for(path):
                kind = "MALFORMED_CANDIDATE"
            elif root_kind == "CANONICAL" and path.parent == root:
                kind = "COLLECTION_ENTRY_NO_SPEC"
            else:
                kind = "MALFORMED_CANDIDATE"
            records.append({
                "record_key": f"{root_kind.lower()}:{rel}", "root_kind": root_kind,
                "configured_root": root_rel.as_posix(), "path": rel,
                "spec_path": (spec_path.relative_to(repo).as_posix() if has_spec else None),
                "record_kind": kind, "spec_id": _id_for(path),
                "slug": path.name, "title": title or path.name,
                "revision": revision, "digest": digest,
                "problem": problem or (f"DUPLICATE_SPEC_COPY_OF:{duplicate_parent}" if duplicate_parent else "MISSING_SPEC_MD" if not has_spec and kind == "MALFORMED_CANDIDATE" else None),
                "relationships": {"duplicate_ids": [], "duplicate_revisions": []},
            })
    records.sort(key=lambda row: (row["root_kind"], row["path"].casefold(), row["path"]))
    by_id: dict[str, list[dict[str, Any]]] = {}
    by_revision: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for record in records:
        if record["spec_id"] and record["record_kind"] in {"CANONICAL_SPEC", "INVALID_SPEC"}:
            by_id.setdefault(record["spec_id"], []).append(record)
            if record["revision"]:
                by_revision.setdefault((record["spec_id"], record["revision"]), []).append(record)
    for grouped in by_id.values():
        if len(grouped) > 1:
            paths = sorted(row["path"] for row in grouped)
            for row in grouped:
                row["relationships"]["duplicate_ids"] = [path for path in paths if path != row["path"]]
    for grouped in by_revision.values():
        if len(grouped) > 1:
            paths = sorted(row["path"] for row in grouped)
            for row in grouped:
                row["relationships"]["duplicate_revisions"] = [path for path in paths if path != row["path"]]
    counts: dict[str, int] = {}
    for record in records:
        counts[record["record_kind"]] = counts.get(record["record_kind"], 0) + 1
    return {
        "schema_version": 1,
        "repository_root": str(repo),
        "canonical_roots": config["canonical_roots"],
        "alternate_roots": config["alternate_roots"],
        "records": records,
        "diagnostics": diagnostics,
        "counts": counts,
        "invariants": {
            "record_count": len(records),
            "canonical_spec_count": counts.get("CANONICAL_SPEC", 0),
            "invalid_candidate_count": sum(count for kind, count in counts.items() if kind in {"INVALID_SPEC", "MALFORMED_CANDIDATE"}),
            "walk_complete": not any(item["code"] in {"ROOT_MISSING", "ROOT_TRAVERSAL_ERROR"} for item in diagnostics),
        },
    }


def json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")
