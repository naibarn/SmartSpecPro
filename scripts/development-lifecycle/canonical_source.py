#!/usr/bin/env python3
"""Prepare and run work from an exact, policy-approved Git revision.

Repository policy is read from .development-repository.toml at the repository
root (or --policy). The developer checkout is never reset, cleaned, or switched.
"""

from __future__ import annotations

import argparse
import errno
import fcntl
import hashlib
import json
import os
import re
import signal
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import tomllib
import uuid
from pathlib import Path
from typing import Any, Sequence


class LifecycleError(RuntimeError):
    pass


def git(repo: Path, *args: str, check: bool = True) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), *args], text=True, capture_output=True
    )
    if check and result.returncode:
        detail = result.stderr.strip() or result.stdout.strip()
        raise LifecycleError(f"GIT_COMMAND_FAILED: git {' '.join(args)}: {detail}")
    return result.stdout.strip()


def _inside(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def load_policy(repo: Path, policy_path: Path | None = None) -> dict[str, Any]:
    repo = Path(git(repo, "rev-parse", "--show-toplevel")).resolve()
    path = (policy_path or repo / ".development-repository.toml").resolve()
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
        values = data["repository"]
        policy = {
            "repository_id": str(values["repository_id"]).strip(),
            "remote": str(values["remote"]).strip(),
            "canonical_ref": str(values["canonical_ref"]).strip(),
            "source_root": str(values["source_root"]).strip(),
            "lease_root": str(values.get("lease_root", values["source_root"])).strip(),
            "build_target": str(values.get("build_target", "web-build")).strip(),
            "source_fallback_roots": [str(item).strip() for item in values.get("source_fallback_roots", [])],
        }
    except (OSError, KeyError, TypeError, tomllib.TOMLDecodeError) as exc:
        raise LifecycleError(f"REPOSITORY_POLICY_INVALID: {path}: {exc}") from exc
    if not isinstance(values.get("source_fallback_roots", []), list):
        raise LifecycleError("REPOSITORY_POLICY_INVALID: source_fallback_roots must be an array of absolute paths")
    if not all(policy[key] for key in ("repository_id", "remote", "canonical_ref", "source_root", "lease_root", "build_target")):
        raise LifecycleError(f"REPOSITORY_POLICY_INVALID: empty value in {path}")
    if not policy["canonical_ref"].startswith("refs/heads/"):
        raise LifecycleError("REPOSITORY_POLICY_INVALID: canonical_ref must be a fully qualified branch ref")
    source_root = Path(policy["source_root"]).expanduser()
    if not source_root.is_absolute():
        raise LifecycleError("REPOSITORY_POLICY_INVALID: source_root must be absolute")
    source_root = source_root.resolve()
    if _inside(source_root, repo):
        raise LifecycleError("SOURCE_ROOT_INSIDE_DEVELOPER_CHECKOUT")
    policy["source_root"] = str(source_root)
    lease_root = Path(policy["lease_root"]).expanduser()
    if not lease_root.is_absolute():
        raise LifecycleError("REPOSITORY_POLICY_INVALID: lease_root must be absolute")
    lease_root = lease_root.resolve()
    if _inside(lease_root, repo):
        raise LifecycleError("SOURCE_ROOT_INSIDE_DEVELOPER_CHECKOUT")
    policy["lease_root"] = str(lease_root)
    fallback_roots = []
    for configured in policy["source_fallback_roots"]:
        candidate = Path(configured).expanduser()
        if not candidate.is_absolute():
            raise LifecycleError("REPOSITORY_POLICY_INVALID: source_fallback_roots must be absolute")
        candidate = candidate.resolve()
        if _inside(candidate, repo):
            raise LifecycleError("SOURCE_ROOT_INSIDE_DEVELOPER_CHECKOUT")
        if candidate != source_root and candidate not in fallback_roots:
            fallback_roots.append(candidate)
    policy["source_fallback_roots"] = fallback_roots
    return policy


MIN_SOURCE_BYTES = 1024 * 1024 * 1024
MIN_SOURCE_INODES = 10_000


def _filesystem_evidence(path: Path) -> dict[str, Any]:
    probe = path
    while not probe.exists() and probe != probe.parent:
        probe = probe.parent
    try:
        stats = os.statvfs(probe)
        usage = shutil.disk_usage(probe)
        device = probe.stat().st_dev
        mount = probe
        while mount.parent != mount and mount.parent.stat().st_dev == device:
            mount = mount.parent
        return {
            "path": str(path), "mount_path": str(mount), "device": device,
            "available_bytes": stats.f_bavail * stats.f_frsize,
            "available_inodes": stats.f_favail,
            "total_bytes": usage.total,
            "writable": os.access(probe, os.W_OK | os.X_OK),
        }
    except OSError as exc:
        return {"path": str(path), "error": f"{exc.__class__.__name__}: {exc}", "errno": exc.errno}


def _resource_code(detail: str) -> str | None:
    patterns = (
        ("ENOSPC", r"\bENOSPC\b|no space left on device|disk full"),
        ("EDQUOT", r"\bEDQUOT\b|disk quota exceeded|quota exceeded"),
        ("EACCES", r"\bEACCES\b|permission denied|operation not permitted"),
        ("EROFS", r"\bEROFS\b|read-only file system"),
        ("EMFILE", r"\bEMFILE\b|too many open files"),
    )
    for code, pattern in patterns:
        if re.search(pattern, detail, re.IGNORECASE):
            return code
    return None


def _os_resource_failure(path: Path, exc: OSError) -> LifecycleError:
    code = errno.errorcode.get(exc.errno, "UNKNOWN")
    status = "RESOURCE_BLOCKED" if code in {"ENOSPC", "EDQUOT", "EACCES", "EROFS", "EMFILE"} else "WORKSPACE_ADMISSION_FAILED"
    return LifecycleError(
        f"{status}: errno={exc.errno} code={code} path={path}; "
        f"error={exc.__class__.__name__}: {exc}; evidence={json.dumps(_filesystem_evidence(path), sort_keys=True)}"
    )


def _open_lock(path: Path) -> Any:
    try:
        return path.open("a+")
    except OSError as exc:
        raise _os_resource_failure(path, exc) from exc


def _registered_worktrees(repo: Path) -> set[Path]:
    listing = git(repo, "worktree", "list", "--porcelain")
    return {
        Path(line.removeprefix("worktree ")).resolve()
        for line in listing.splitlines()
        if line.startswith("worktree ")
    }


def _workspace_roots(policy: dict[str, Any]) -> list[Path]:
    return [Path(policy["source_root"]), *[Path(item) for item in policy["source_fallback_roots"]]]


def _admit_roots(policy: dict[str, Any], repo: Path | None = None) -> tuple[list[tuple[Path, dict[str, Any]]], list[dict[str, Any]]]:
    admitted: list[tuple[Path, dict[str, Any]]] = []
    rejected: list[dict[str, Any]] = []
    for root in _workspace_roots(policy):
        evidence = _filesystem_evidence(root)
        if evidence.get("error"):
            rejected.append({**evidence, "reason": "FILESYSTEM_UNAVAILABLE"})
        elif not evidence["writable"]:
            rejected.append({**evidence, "reason": "EACCES"})
        elif evidence["available_bytes"] < MIN_SOURCE_BYTES:
            rejected.append({**evidence, "reason": "ENOSPC", "required_bytes": MIN_SOURCE_BYTES})
        elif evidence["available_inodes"] < MIN_SOURCE_INODES:
            rejected.append({**evidence, "reason": "INODE_EXHAUSTION", "required_inodes": MIN_SOURCE_INODES})
        else:
            admitted.append((root, evidence))
    if repo is not None:
        common_dir = Path(git(repo, "rev-parse", "--path-format=absolute", "--git-common-dir"))
        metadata = _filesystem_evidence(common_dir)
        if metadata.get("error") or not metadata.get("writable") or metadata.get("available_bytes", 0) < 16 * 1024 * 1024 or metadata.get("available_inodes", 0) < 128:
            rejected.append({**metadata, "reason": "GIT_METADATA_CAPACITY", "required_bytes": 16 * 1024 * 1024, "required_inodes": 128})
            admitted = []
    return admitted, rejected


def _rollback_attempt(repo: Path, workspace: Path, reservation: tuple[int, int] | None) -> str:
    """Remove only the exact directory inode reserved by this attempt before Git ran."""
    if reservation is None or not workspace.exists():
        return "NOT_NEEDED"
    current_stat = workspace.stat()
    if (current_stat.st_dev, current_stat.st_ino) != reservation:
        return "NOT_REMOVED_OWNERSHIP_CHANGED"
    registered = False
    listing = git(repo, "worktree", "list", "--porcelain")
    current = None
    for line in [*listing.splitlines(), ""]:
        if line.startswith("worktree "):
            current = Path(line.removeprefix("worktree ")).resolve()
        elif not line and current is not None:
            if current == workspace.resolve():
                registered = True
            current = None
    if registered:
        removed = subprocess.run(["git", "-C", str(repo), "worktree", "remove", "--force", str(workspace)], text=True, capture_output=True)
        if removed.returncode:
            return f"OWNED_WORKTREE_REMOVE_FAILED: {(removed.stderr or removed.stdout).strip()}"
        return "OWNED_WORKTREE_REMOVED"
    # This exact path did not exist immediately before this attempt and is not registered.
    shutil.rmtree(workspace)
    return "OWNED_PARTIAL_DIRECTORY_REMOVED"


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def inspect_workspace_baseline(
    repo: Path, policy_path: Path | None = None, *, allow_dirty: bool = False
) -> dict[str, Any]:
    """Fetch the configured trunk and verify this clean worktree contains it."""
    repo = Path(git(repo, "rev-parse", "--show-toplevel")).resolve()
    policy = load_policy(repo, policy_path)
    git(repo, "fetch", "--no-tags", policy["remote"], policy["canonical_ref"])
    canonical_sha = git(repo, "rev-parse", "FETCH_HEAD^{commit}")
    local_sha = git(repo, "rev-parse", "HEAD^{commit}")
    branch = git(repo, "branch", "--show-current", check=False)
    canonical_branch = policy["canonical_ref"].removeprefix("refs/heads/")
    dirty_paths = git(repo, "status", "--porcelain=v1", "--untracked-files=all").splitlines()
    operation_markers = ("MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-apply", "rebase-merge")
    in_progress = any(
        (Path(path) if Path(path).is_absolute() else repo / path).exists()
        for marker in operation_markers
        for path in (git(repo, "rev-parse", "--git-path", marker),)
    )
    ancestor = subprocess.run(
        ["git", "-C", str(repo), "merge-base", "--is-ancestor", canonical_sha, local_sha],
        capture_output=True,
    ).returncode == 0
    on_canonical_branch = branch == canonical_branch
    ready = (allow_dirty or not dirty_paths) and not in_progress and ancestor and not on_canonical_branch
    if in_progress:
        next_action = "RESOLVE_OR_HANDOFF_GIT_OPERATION"
    elif not ancestor:
        next_action = "RECONCILE_WITH_FETCHED_CANONICAL_SHA"
    elif on_canonical_branch:
        next_action = "CREATE_ISOLATED_WORKTREE_FROM_FETCHED_CANONICAL_SHA"
    elif dirty_paths and not allow_dirty:
        next_action = "PRESERVE_DIRTY_WORK_AND_PREPARE_FRESH_WORKTREE"
    else:
        next_action = "CONTINUE_ON_CURRENT_BASELINE"
    return {
        "status": "BASELINE_READY" if ready else "BASELINE_RECONCILIATION_REQUIRED",
        "ready": ready,
        "repository_id": policy["repository_id"],
        "remote": policy["remote"],
        "canonical_ref": policy["canonical_ref"],
        "canonical_sha": canonical_sha,
        "local_sha": local_sha,
        "branch": branch or None,
        "canonical_branch": canonical_branch,
        "on_canonical_branch": on_canonical_branch,
        "dirty_paths": dirty_paths,
        "dirty_paths_allowed_for_planning": allow_dirty,
        "git_operation_in_progress": in_progress,
        "contains_fetched_canonical": ancestor,
        "next_action": next_action,
    }


def _artifact_manifest(root: Path) -> dict[str, Any] | None:
    """Hash a successful build output without following links outside the artifact root."""
    if not root.is_dir():
        return None
    files: list[tuple[str, str, int]] = []
    for path in sorted(root.rglob("*")):
        if path.is_symlink() or not path.is_file():
            continue
        relative = path.relative_to(root).as_posix()
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        files.append((relative, digest.hexdigest(), path.stat().st_size))
    if not files:
        return None
    canonical = "\n".join(f"{path}\0{digest}\0{size}" for path, digest, size in files)
    return {
        "artifact_digest": f"sha256:{hashlib.sha256(canonical.encode()).hexdigest()}",
        "artifact_path": str(root),
        "artifact_file_count": len(files),
    }


def _write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(payload, stream, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def prepare_source(
    repo: Path,
    *,
    purpose: str,
    source_revision: str | None = None,
    required_revision: str | None = None,
    policy_path: Path | None = None,
    lease_seconds: int = 900,
) -> dict[str, Any]:
    repo = Path(git(repo, "rev-parse", "--show-toplevel")).resolve()
    policy = load_policy(repo, policy_path)
    if purpose not in {"build", "test", "package", "deploy", "verify"}:
        raise LifecycleError("PURPOSE_INVALID")
    if lease_seconds < 30 or lease_seconds > 86_400:
        raise LifecycleError("LEASE_DURATION_INVALID")

    # Fetch only the configured policy ref. No assumption is made about branch naming.
    git(repo, "fetch", "--no-tags", policy["remote"], policy["canonical_ref"])
    canonical_tip = git(repo, "rev-parse", "FETCH_HEAD^{commit}")
    revision = canonical_tip if source_revision is None else git(
        repo, "rev-parse", f"{source_revision}^{{commit}}", check=False
    )
    if not revision:
        raise LifecycleError("SOURCE_REVISION_NOT_FOUND")
    ancestry = subprocess.run(
        ["git", "-C", str(repo), "merge-base", "--is-ancestor", revision, canonical_tip],
        capture_output=True,
    )
    if ancestry.returncode != 0:
        raise LifecycleError("SOURCE_REVISION_OUTSIDE_CANONICAL_HISTORY")
    if required_revision:
        required = git(repo, "rev-parse", f"{required_revision}^{{commit}}", check=False)
        if not required:
            raise LifecycleError("REQUIRED_REVISION_NOT_FOUND")
        check = subprocess.run(
            ["git", "-C", str(repo), "merge-base", "--is-ancestor", required, revision],
            capture_output=True,
        )
        if check.returncode != 0:
            raise LifecycleError("REQUIRED_REVISION_NOT_INCLUDED")
        required_revision = required

    admitted, rejected = _admit_roots(policy, repo)
    if not admitted:
        reason = "RESOURCE_BLOCKED" if rejected and all(item.get("reason") in {"ENOSPC", "INODE_EXHAUSTION", "EACCES", "EROFS", "GIT_METADATA_CAPACITY"} for item in rejected) else "WORKSPACE_ADMISSION_FAILED"
        raise LifecycleError(f"{reason}: no authorized source filesystem passed preflight; evidence={json.dumps(rejected, sort_keys=True)}")
    lease_evidence = _filesystem_evidence(Path(policy["lease_root"]))
    if lease_evidence.get("error") or not lease_evidence.get("writable") or lease_evidence.get("available_inodes", 0) < 1000:
        raise LifecycleError(f"RESOURCE_BLOCKED: lease registry root is not writable/admissible; evidence={json.dumps(lease_evidence, sort_keys=True)}")
    lease_dir = Path(policy["lease_root"]) / _hash(policy["repository_id"])[:20]
    try:
        lease_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        evidence = _filesystem_evidence(lease_dir)
        code = "RESOURCE_BLOCKED" if exc.errno in {13, 28, 122} else "WORKSPACE_ADMISSION_FAILED"
        raise LifecycleError(f"{code}: errno={exc.errno} {exc.__class__.__name__}: {exc}; evidence={json.dumps(evidence, sort_keys=True)}") from exc
    state_path = lease_dir / f"{revision}-{purpose}.json"
    active_path = lease_dir / f"{revision}-{purpose}.active"
    with _open_lock(state_path.with_suffix(".lock")) as state_lock:
        fcntl.flock(state_lock, fcntl.LOCK_EX)
        with _open_lock(active_path) as active_lock:
            try:
                fcntl.flock(active_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as exc:
                raise LifecycleError("SOURCE_LEASE_ACTIVE") from exc

            workspace: Path | None = None
            for candidate_root, _evidence in admitted:
                candidate = candidate_root / _hash(policy["repository_id"])[:20] / f"{revision}-{purpose}"
                if not candidate.exists():
                    continue
                if candidate.resolve() not in _registered_worktrees(repo):
                    raise LifecycleError(f"WORKSPACE_REGISTRY_STALE: path={candidate}; path is not registered to this repository")
                try:
                    head = git(candidate, "rev-parse", "HEAD")
                    dirty = git(candidate, "status", "--porcelain=v1", "--untracked-files=all")
                except LifecycleError as exc:
                    raise LifecycleError(f"WORKSPACE_REGISTRY_STALE: path={candidate}; detail={exc}") from exc
                if head != revision or dirty:
                    raise LifecycleError(f"ISOLATED_SOURCE_WORKSPACE_DIRTY_OR_MISMATCHED: path={candidate}")
                workspace = candidate
                break

            attempts: list[dict[str, Any]] = []
            if workspace is None:
                last_code = None
                for candidate_root, evidence in admitted:
                    candidate = candidate_root / _hash(policy["repository_id"])[:20] / f"{revision}-{purpose}"
                    try:
                        candidate.parent.mkdir(parents=True, exist_ok=True)
                    except OSError as exc:
                        attempts.append({"path": str(candidate), "resource_code": errno.errorcode.get(exc.errno), "errno_number": exc.errno, "error": f"{exc.__class__.__name__}: {exc}", "rollback": "NOT_NEEDED", "filesystem": _filesystem_evidence(candidate)})
                        last_code = errno.errorcode.get(exc.errno)
                        if last_code in {"ENOSPC", "EDQUOT", "EACCES", "EROFS"}:
                            continue
                        raise _os_resource_failure(candidate.parent, exc) from exc
                    if candidate.exists():
                        continue
                    try:
                        candidate.mkdir()
                    except FileExistsError:
                        attempts.append({"path": str(candidate), "resource_code": "EEXIST", "error": "destination was claimed concurrently; preserved", "rollback": "NOT_OWNED", "filesystem": evidence})
                        raise LifecycleError(f"WORKSPACE_DESTINATION_CLAIMED: {candidate}")
                    except OSError as exc:
                        attempts.append({"path": str(candidate), "resource_code": errno.errorcode.get(exc.errno), "errno_number": exc.errno, "error": f"{exc.__class__.__name__}: {exc}", "rollback": "NOT_NEEDED", "filesystem": _filesystem_evidence(candidate)})
                        last_code = errno.errorcode.get(exc.errno)
                        if last_code in {"ENOSPC", "EDQUOT", "EACCES", "EROFS"}:
                            continue
                        raise _os_resource_failure(candidate, exc) from exc
                    reserved_stat = candidate.stat()
                    reservation = (reserved_stat.st_dev, reserved_stat.st_ino)
                    try:
                        git(repo, "worktree", "add", "--detach", str(candidate), revision)
                    except LifecycleError as exc:
                        message = str(exc)
                        code = _resource_code(message)
                        rollback = _rollback_attempt(repo, candidate, reservation)
                        errno_number = {"ENOSPC": 28, "EDQUOT": 122, "EACCES": 13, "EROFS": 30, "EMFILE": 24}.get(code)
                        attempts.append({"path": str(candidate), "resource_code": code, "errno_number": errno_number, "error": message, "rollback": rollback, "filesystem": evidence})
                        last_code = code
                        if code not in {"ENOSPC", "EDQUOT", "EACCES", "EROFS"}:
                            raise LifecycleError(f"WORKTREE_CREATE_FAILED: attempts={json.dumps(attempts, sort_keys=True)}") from exc
                        continue
                    workspace = candidate
                    break
                if workspace is None:
                    status = "RESOURCE_BLOCKED" if last_code in {"ENOSPC", "EDQUOT", "EACCES", "EROFS"} else "WORKTREE_CREATE_FAILED"
                    raise LifecycleError(f"{status}: all admitted worktree destinations failed; attempts={json.dumps(attempts, sort_keys=True)}")

            if git(workspace, "rev-parse", "HEAD") != revision or git(workspace, "status", "--porcelain=v1", "--untracked-files=all"):
                raise LifecycleError(f"ISOLATED_SOURCE_WORKSPACE_DIRTY_OR_MISMATCHED: path={workspace}")

            previous: dict[str, Any] = {}
            if state_path.exists():
                try:
                    previous = json.loads(state_path.read_text(encoding="utf-8"))
                except (OSError, json.JSONDecodeError):
                    raise LifecycleError("LEASE_STATE_CORRUPT")
                if previous.get("expires_at", 0) > time.time():
                    raise LifecycleError("SOURCE_LEASE_UNEXPIRED")
            generation = int(previous.get("fencing_generation", 0)) + 1
            lease = {
                "lease_id": str(uuid.uuid4()),
                "fencing_generation": generation,
                "repository_id": policy["repository_id"],
                "canonical_ref": policy["canonical_ref"],
                "source_revision": revision,
                "required_integrated_revision": required_revision,
                "purpose": purpose,
                "isolated_workspace": str(workspace),
                "workspace_filesystem": _filesystem_evidence(workspace),
                "workspace_recovery_attempts": attempts,
                "source_verified": True,
                "created_at": time.time(),
                "expires_at": time.time() + lease_seconds,
            }
            _write_json_atomic(state_path, lease)
    lease["lease_file"] = str(state_path)
    return lease


def run_with_lease(
    lease_file: Path,
    lease_id: str,
    generation: int,
    command: Sequence[str],
    *,
    stdout: Any = None,
) -> int:
    if not command:
        raise LifecycleError("COMMAND_REQUIRED")
    lease_file = lease_file.resolve()
    lease_lock_path = lease_file.with_suffix(".lock")
    active_path = lease_file.parent / (lease_file.name.removesuffix(".json") + ".active")
    with active_path.open("a+") as active_lock:
        try:
            fcntl.flock(active_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise LifecycleError("SOURCE_LEASE_ACTIVE") from exc
        with lease_lock_path.open("a+") as state_lock:
            fcntl.flock(state_lock, fcntl.LOCK_EX)
            try:
                lease = json.loads(lease_file.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as exc:
                raise LifecycleError("LEASE_STATE_CORRUPT") from exc
            if lease.get("lease_id") != lease_id or lease.get("fencing_generation") != generation:
                raise LifecycleError("SOURCE_LEASE_FENCED")
            if lease.get("expires_at", 0) <= time.time():
                raise LifecycleError("SOURCE_LEASE_EXPIRED")
            workspace = Path(lease["isolated_workspace"])
            if git(workspace, "rev-parse", "HEAD") != lease.get("source_revision"):
                raise LifecycleError("SOURCE_REVISION_CHANGED")
            if git(workspace, "status", "--porcelain=v1", "--untracked-files=all"):
                raise LifecycleError("ISOLATED_SOURCE_WORKSPACE_DIRTY")

        stop = threading.Event()

        def heartbeat() -> None:
            while not stop.wait(30):
                with lease_lock_path.open("a+") as state_lock:
                    fcntl.flock(state_lock, fcntl.LOCK_EX)
                    current = json.loads(lease_file.read_text(encoding="utf-8"))
                    if current.get("lease_id") != lease_id or current.get("fencing_generation") != generation:
                        stop.set()
                        return
                    current["expires_at"] = time.time() + 900
                    _write_json_atomic(lease_file, current)

        thread = threading.Thread(target=heartbeat, daemon=True)
        thread.start()
        try:
            return subprocess.run(list(command), cwd=workspace, stdout=stdout).returncode
        finally:
            stop.set()
            thread.join(timeout=1)
            with lease_lock_path.open("a+") as state_lock:
                fcntl.flock(state_lock, fcntl.LOCK_EX)
                current = json.loads(lease_file.read_text(encoding="utf-8"))
                if current.get("lease_id") == lease_id and current.get("fencing_generation") == generation:
                    current["expires_at"] = 0
                    _write_json_atomic(lease_file, current)


def remote_canonical_tip(repo: Path, policy: dict[str, str]) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), "ls-remote", "--exit-code", policy["remote"], policy["canonical_ref"]],
        text=True,
        capture_output=True,
    )
    if result.returncode:
        detail = result.stderr.strip() or result.stdout.strip()
        raise LifecycleError(f"CANONICAL_REF_UNAVAILABLE: {detail}")
    matches = [line.split("\t", 1)[0] for line in result.stdout.splitlines() if "\t" in line]
    if len(matches) != 1 or len(matches[0]) not in {40, 64}:
        raise LifecycleError("CANONICAL_REF_RESOLUTION_INVALID")
    return matches[0]


def sync_primary_workspace(repo: Path, canonical_ref: str, canonical_tip: str) -> dict[str, Any]:
    """Fast-forward the invoking checkout only when it is clean and on canonical."""
    branch = git(repo, "branch", "--show-current", check=False)
    head = git(repo, "rev-parse", "HEAD")
    canonical_branch = canonical_ref.removeprefix("refs/heads/")
    dirty = git(repo, "status", "--porcelain=v1", "--untracked-files=all")
    dirty_paths = [line[3:] for line in dirty.splitlines() if len(line) > 3]
    if branch != canonical_branch:
        return {
            "status": "BLOCKED_DIRTY_WRONG_BRANCH" if dirty else "BLOCKED_WRONG_BRANCH",
            "branch": branch or "DETACHED",
            "canonical_branch": canonical_branch,
            "head": head,
            "dirty_path_count": len(dirty_paths),
            "dirty_paths_sample": dirty_paths[:20],
        }
    if dirty:
        return {
            "status": "BLOCKED_DIRTY",
            "branch": branch,
            "head": head,
            "dirty_path_count": len(dirty_paths),
            "dirty_paths_sample": dirty_paths[:20],
        }
    ancestor = subprocess.run(
        ["git", "-C", str(repo), "merge-base", "--is-ancestor", head, canonical_tip],
        capture_output=True,
    )
    if ancestor.returncode != 0:
        return {"status": "BLOCKED_DIVERGED", "branch": branch, "head": head}
    if head == canonical_tip:
        return {"status": "ALREADY_CURRENT", "branch": branch, "head": head}
    updated = subprocess.run(
        ["git", "-C", str(repo), "merge", "--ff-only", canonical_tip],
        text=True,
        capture_output=True,
    )
    if updated.returncode != 0:
        return {
            "status": "SYNC_FAILED",
            "branch": branch,
            "head": head,
            "reason": (updated.stderr.strip() or updated.stdout.strip())[:500],
        }
    return {"status": "FAST_FORWARDED", "branch": branch, "head": canonical_tip}


def build_canonical(
    repo: Path,
    *,
    command: Sequence[str],
    required_revisions: Sequence[str] = (),
    build_target: str | None = None,
    policy_path: Path | None = None,
    lease_seconds: int = 900,
) -> dict[str, Any]:
    """Build only the fetched canonical tip, never the caller's branch/worktree."""
    repo = Path(git(repo, "rev-parse", "--show-toplevel")).resolve()
    policy = load_policy(repo, policy_path)
    build_target = build_target or str(policy.get("build_target", "web-build"))
    if not build_target.strip() or len(build_target) > 128:
        raise LifecycleError("BUILD_TARGET_INVALID")
    repository_key = _hash(policy["repository_id"])[:20]
    admitted_roots, rejected_roots = _admit_roots(policy, repo)
    if not admitted_roots:
        reason = "RESOURCE_BLOCKED" if rejected_roots else "WORKSPACE_ADMISSION_FAILED"
        raise LifecycleError(f"{reason}: no authorized source filesystem passed preflight; evidence={json.dumps(rejected_roots, sort_keys=True)}")
    lease_dir = Path(policy["lease_root"]) / repository_key
    lease_dir.mkdir(parents=True, exist_ok=True)
    global_lock_path = lease_dir / "canonical-build.lock"

    # One build at a time per repository. Resolve the canonical tip only after
    # obtaining the lock so queued builds do not start from an older snapshot.
    with global_lock_path.open("a+") as build_lock:
        fcntl.flock(build_lock, fcntl.LOCK_EX)
        required = [
            git(repo, "rev-parse", f"{revision}^{{commit}}", check=False)
            for revision in required_revisions
        ]
        if any(not revision for revision in required):
            raise LifecycleError("REQUIRED_REVISION_NOT_FOUND")
        canonical_tip = remote_canonical_tip(repo, policy)
        for revision in required:
            check = subprocess.run(
                ["git", "-C", str(repo), "merge-base", "--is-ancestor", revision, canonical_tip],
                capture_output=True,
            )
            if check.returncode != 0:
                raise LifecycleError(f"REQUIRED_REVISION_NOT_INCLUDED: {revision}")

        started_at = time.time()
        lease = prepare_source(
            repo,
            purpose="build",
            source_revision=canonical_tip,
            policy_path=policy_path,
            lease_seconds=lease_seconds,
        )
        if not command:
            command = ["bash", str(Path(str(lease["isolated_workspace"])) / "scripts/development-lifecycle/build_web.sh")]
            if not Path(command[1]).is_file():
                raise LifecycleError("CANONICAL_WEB_BUILD_SCRIPT_MISSING")
        print(
            f"[canonical-build] source={lease['source_revision']} ref={lease['canonical_ref']} target={build_target}",
            file=sys.stderr,
            flush=True,
        )
        try:
            command_exit_code = run_with_lease(
                Path(str(lease["lease_file"])),
                str(lease["lease_id"]),
                int(lease["fencing_generation"]),
                command,
                stdout=sys.stderr,
            )
        except OSError as exc:
            print(f"[canonical-build] command could not start: {exc}", file=sys.stderr)
            command_exit_code = 127
        termination_signal = None
        if command_exit_code < 0:
            signal_number = -command_exit_code
            try:
                termination_signal = signal.Signals(signal_number).name
            except ValueError:
                termination_signal = f"SIG{signal_number}"
            exit_code = 128 + signal_number
        else:
            exit_code = command_exit_code
        completed_at = time.time()
        artifact_root = Path(str(lease["isolated_workspace"])) / "apps/web/dist"
        artifact_manifest = _artifact_manifest(artifact_root) if exit_code == 0 else None
        latest_tip = remote_canonical_tip(repo, policy)
        resource_blocked = exit_code == 137 or termination_signal == "SIGKILL"
        if resource_blocked:
            status = "RESOURCE_BLOCKED"
            primary_workspace_sync = {"status": "SKIPPED_RESOURCE_BLOCKED", "head": git(repo, "rev-parse", "HEAD")}
        elif latest_tip != lease["source_revision"]:
            status = "STALE_CANONICAL_ADVANCED"
            primary_workspace_sync = {"status": "SKIPPED_CANONICAL_ADVANCED", "head": git(repo, "rev-parse", "HEAD")}
        elif exit_code == 0:
            status = "BUILD_PASSED"
            primary_workspace_sync = sync_primary_workspace(
                repo,
                str(lease["canonical_ref"]),
                str(lease["source_revision"]),
            )
        else:
            status = "BUILD_FAILED"
            primary_workspace_sync = {"status": "SKIPPED_BUILD_FAILED", "head": git(repo, "rev-parse", "HEAD")}

        command_digest = _hash("\0".join(command))
        result = {
            "status": status,
            "source_verified": True,
            "canonical_ref": lease["canonical_ref"],
            "source_revision": lease["source_revision"],
            "canonical_tip_after_build": latest_tip,
            "required_revisions": required,
            "build_target": build_target,
            "command_executable": Path(command[0]).name,
            "command_sha256": command_digest,
            "exit_code": exit_code,
            "termination_signal": termination_signal,
            "started_at": started_at,
            "completed_at": completed_at,
            "artifact": artifact_manifest,
            "isolated_workspace": lease["isolated_workspace"],
            "primary_workspace_sync": primary_workspace_sync,
        }
        result_root = Path(str(lease["isolated_workspace"])).parents[1]
        result_dir = result_root / ".development-build-results" / repository_key
        result_dir.mkdir(parents=True, exist_ok=True)
        result_path = result_dir / f"{lease['source_revision']}-{uuid.uuid4()}.json"
        result["result_file"] = str(result_path)
        _write_json_atomic(result_path, result)
        if primary_workspace_sync["status"].startswith("BLOCKED"):
            print(
                f"[canonical-build] primary workspace was left unchanged: {primary_workspace_sync['status']}",
                file=sys.stderr,
                flush=True,
            )
        print(json.dumps(result, sort_keys=True))
        return result


def build_latest_canonical(
    repo: Path,
    *,
    command: Sequence[str],
    required_revisions: Sequence[str] = (),
    build_target: str | None = None,
    policy_path: Path | None = None,
    lease_seconds: int = 900,
    max_stale_rebuilds: int = 2,
) -> dict[str, Any]:
    """Coalesce main advances into bounded retries; never deliver a stale success.

    Each retry takes the latest canonical SHA under the existing repository
    build lock. Resource or code failures are returned immediately, not retried.
    """
    if not 0 <= max_stale_rebuilds <= 3:
        raise LifecycleError("MAX_STALE_REBUILDS_OUT_OF_RANGE")
    for attempt in range(1, max_stale_rebuilds + 2):
        result = build_canonical(
            repo,
            command=command,
            required_revisions=required_revisions,
            build_target=build_target,
            policy_path=policy_path,
            lease_seconds=lease_seconds,
        )
        if result["status"] != "STALE_CANONICAL_ADVANCED":
            return {**result, "build_attempts": attempt}
        if attempt <= max_stale_rebuilds:
            print(
                "[canonical-build] main advanced; retrying on fresh canonical tip "
                f"({attempt}/{max_stale_rebuilds} stale rebuilds)",
                file=sys.stderr,
                flush=True,
            )
    return {**result, "build_attempts": max_stale_rebuilds + 1}


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="action", required=True)
    policy_command = commands.add_parser("policy")
    policy_command.add_argument("--repository", required=True, type=Path)
    policy_command.add_argument("--policy", type=Path)
    preflight = commands.add_parser("preflight")
    preflight.add_argument("--repository", required=True, type=Path)
    preflight.add_argument("--policy", type=Path)
    preflight.add_argument("--allow-dirty", action="store_true")
    prepare = commands.add_parser("prepare")
    prepare.add_argument("--repository", required=True, type=Path)
    prepare.add_argument("--policy", type=Path)
    prepare.add_argument("--source-revision")
    prepare.add_argument("--required-integrated-revision")
    prepare.add_argument("--purpose", required=True, choices=("build", "test", "package", "deploy", "verify"))
    prepare.add_argument("--lease-seconds", type=int, default=900)
    run = commands.add_parser("run")
    run.add_argument("--lease-file", required=True, type=Path)
    run.add_argument("--lease-id", required=True)
    run.add_argument("--fencing-generation", required=True, type=int)
    run.add_argument("command", nargs=argparse.REMAINDER)
    build = commands.add_parser("build")
    build.add_argument("--repository", required=True, type=Path)
    build.add_argument("--policy", type=Path)
    build.add_argument("--required-integrated-revision", action="append", default=[])
    build.add_argument("--build-target")
    build.add_argument("--lease-seconds", type=int, default=900)
    build.add_argument("--max-stale-rebuilds", type=int, default=2)
    build.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args(argv)
    try:
        if args.action == "policy":
            repo = Path(git(args.repository, "rev-parse", "--show-toplevel")).resolve()
            policy = load_policy(repo, args.policy)
            policy["source_fallback_roots"] = [str(item) for item in policy["source_fallback_roots"]]
            print(json.dumps({"repository_root": str(repo), **policy}, sort_keys=True))
            return 0
        if args.action == "preflight":
            result = inspect_workspace_baseline(
                args.repository, args.policy, allow_dirty=args.allow_dirty
            )
            print(json.dumps(result, sort_keys=True))
            return 0 if result["ready"] else 21
        if args.action == "prepare":
            result = prepare_source(
                args.repository,
                purpose=args.purpose,
                source_revision=args.source_revision,
                required_revision=args.required_integrated_revision,
                policy_path=args.policy,
                lease_seconds=args.lease_seconds,
            )
            print(json.dumps(result, sort_keys=True))
            return 0
        if args.action == "build":
            command = args.command[1:] if args.command and args.command[0] == "--" else args.command
            result = build_latest_canonical(
                args.repository,
                command=command,
                required_revisions=args.required_integrated_revision,
                build_target=args.build_target,
                policy_path=args.policy,
                lease_seconds=args.lease_seconds,
                max_stale_rebuilds=args.max_stale_rebuilds,
            )
            if result["status"] == "STALE_CANONICAL_ADVANCED":
                return 75
            return int(result["exit_code"])
        command = args.command[1:] if args.command and args.command[0] == "--" else args.command
        return run_with_lease(args.lease_file, args.lease_id, args.fencing_generation, command)
    except LifecycleError as exc:
        print(json.dumps({"status": str(exc)}, sort_keys=True), file=sys.stderr)
        return 20


if __name__ == "__main__":
    raise SystemExit(main())
