#!/usr/bin/env python3
"""Shared Git capability and conflict-resolution safety policy.

Conflict resolution is intentionally separate from ordinary staging.  The
resolver accepts only explicitly owned, currently unmerged paths and refuses
to proceed when the existing index contains paths outside that ownership.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
from pathlib import Path
from typing import Iterable

MIN_ADD_RESOLVED = (2, 56, 0)
_VERSION_RE = re.compile(r"git version (\d+)\.(\d+)\.(\d+)(?:\.|$)")
_CONFLICT_MARKER_RE = re.compile(r"^(?:<<<<<<<(?: |$)|=======\s*$|>>>>>>>|\|\|\|\|\|\|\|)(?:.*)$", re.M)


def parse_git_version(output: str) -> tuple[int, int, int]:
    match = _VERSION_RE.search(output.strip())
    if not match:
        raise ValueError(f"unrecognized Git version: {output!r}")
    return tuple(map(int, match.groups()))


def _run(root: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(["git", *args], cwd=root, check=check, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def _paths(root: Path, *args: str) -> list[str]:
    output = _run(root, *args).stdout
    return sorted(p.decode("utf-8", "surrogateescape") for p in output.split(b"\0") if p)


def git_version(root: Path) -> tuple[int, int, int]:
    return parse_git_version(_run(root, "--version").stdout.decode())


def inspect_git(root: Path) -> dict:
    root = root.resolve()
    version = git_version(root)
    git_dir = Path(_run(root, "rev-parse", "--git-dir").stdout.decode().strip())
    if not git_dir.is_absolute():
        git_dir = (root / git_dir).resolve()
    return {
        "gitVersion": ".".join(map(str, version)),
        "supportsAddResolved": version >= MIN_ADD_RESOLVED,
        "isMergeInProgress": (git_dir / "MERGE_HEAD").exists(),
        "isRebaseInProgress": (git_dir / "rebase-merge").exists() or (git_dir / "rebase-apply").exists(),
        "isCherryPickInProgress": (git_dir / "CHERRY_PICK_HEAD").exists(),
        "unmergedPaths": _paths(root, "diff", "--name-only", "--diff-filter=U", "-z"),
        # Exclude unmerged index entries: diff --cached --name-only otherwise
        # lists them even though they are not staged resolutions.
        "stagedPaths": _paths(root, "diff", "--cached", "--name-only", "--diff-filter=ACDMRT", "-z"),
        "unstagedPaths": _paths(root, "diff", "--name-only", "-z"),
    }


def _has_markers(path: Path) -> bool:
    try:
        data = path.read_bytes()
    except (FileNotFoundError, IsADirectoryError):
        return False  # deletion is a valid resolution
    if b"\0" in data:
        return False  # binary conflict; Git handles its index stages
    try:
        return bool(_CONFLICT_MARKER_RE.search(data.decode("utf-8", "strict")))
    except UnicodeDecodeError:
        return True  # fail closed for text-like, undecodable content


def resolve_conflicts(root: Path, intended_paths: Iterable[str], expected_remaining: Iterable[str] = ()) -> dict:
    root = root.resolve()
    normalize = (lambda p: p.replace("\\", "/")) if os.name == "nt" else (lambda p: p)
    intended = sorted(set(map(normalize, intended_paths)))
    expected_remaining = sorted(set(map(normalize, expected_remaining)))
    if not intended or any(not p or p.startswith("/") or ".." in Path(p).parts for p in intended):
        raise ValueError("provide non-empty repository-relative intended paths")
    state = inspect_git(root)
    before_staged = set(state["stagedPaths"])
    unmerged_before = set(state["unmergedPaths"])
    owned = sorted(unmerged_before.intersection(intended))
    unexpected_before = sorted(unmerged_before - set(intended) - set(expected_remaining))
    missing_expected = sorted(set(expected_remaining) - unmerged_before)
    if unexpected_before or missing_expected:
        raise RuntimeError(f"unmerged path inventory differs from declared scope; unexpected={unexpected_before}, missingExpected={missing_expected}")
    if set(intended) - unmerged_before:
        raise RuntimeError(f"requested paths are not unmerged: {sorted(set(intended) - unmerged_before)}")
    existing_outside = sorted(before_staged - set(intended))
    if existing_outside:
        raise RuntimeError(f"pre-existing staged paths outside operation ownership: {existing_outside}")
    if not owned:
        raise RuntimeError("no intended unmerged paths found")

    if state["supportsAddResolved"]:
        try:
            _run(root, "add", "--resolved", "--", *owned)
        except subprocess.CalledProcessError as exc:
            raise RuntimeError(exc.stderr.decode(errors="replace").strip() or "git add --resolved refused the selected paths") from exc
        method = "native --resolved"
    else:
        print("WARNING: native addResolved=false; using legacy-safe-resolution fallback", flush=True)
        remaining_markers = [p for p in owned if _has_markers(root / p)]
        if remaining_markers:
            raise RuntimeError(f"conflict markers remain in: {remaining_markers}")
        # Explicit path list only; never equivalent to broad -u/-A/. staging.
        _run(root, "add", "--", *owned)
        method = "legacy explicit-path fallback"

    after = inspect_git(root)
    remaining_owned = sorted(set(after["unmergedPaths"]).intersection(owned))
    unexpected_unmerged = sorted(set(after["unmergedPaths"]) - set(expected_remaining))
    staged_after = set(after["stagedPaths"])
    unexpected_staged = sorted(staged_after - before_staged - set(intended))
    preexisting_outside = sorted(before_staged - set(intended))
    check = _run(root, "diff", "--cached", "--check", check=False)
    result = {
        "method": method,
        "stagedBefore": sorted(before_staged),
        "intendedResolutionPaths": owned,
        "stagedAfter": sorted(staged_after),
        "remainingUnmergedPaths": after["unmergedPaths"],
        "expectedRemainingUnmergedPaths": expected_remaining,
        "unexpectedUnmergedPaths": unexpected_unmerged,
        "unexpectedStagedPaths": unexpected_staged,
        "preExistingStagedOutsideOwnership": preexisting_outside,
        "cachedCheckPassed": check.returncode == 0,
    }
    if remaining_owned or unexpected_unmerged or unexpected_staged or preexisting_outside or check.returncode:
        raise RuntimeError(json.dumps({**result, "remainingOwnedUnmerged": remaining_owned, "cachedCheckOutput": check.stderr.decode(errors="replace")}, sort_keys=True))
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    inspect_parser = sub.add_parser("inspect")
    inspect_parser.add_argument("--repo", type=Path, default=Path.cwd())
    resolve_parser = sub.add_parser("resolve")
    resolve_parser.add_argument("--repo", type=Path, default=Path.cwd())
    resolve_parser.add_argument("--path", action="append", required=True, help="owned repository-relative unmerged path; repeat as needed")
    resolve_parser.add_argument("--expected-unmerged", action="append", default=[], help="explicitly expected unresolved path; repeat as needed")
    args = parser.parse_args()
    try:
        result = inspect_git(args.repo) if args.command == "inspect" else resolve_conflicts(args.repo, args.path, args.expected_unmerged)
        print(json.dumps(result, indent=2))
        return 0
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as exc:
        print(f"git capability policy blocked: {exc}", file=__import__("sys").stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
