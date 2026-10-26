#!/usr/bin/env python3
"""Prepare and run work from an exact, policy-approved Git revision.

Repository policy is read from .development-repository.toml at the repository
root (or --policy). The developer checkout is never reset, cleaned, or switched.
"""

from __future__ import annotations

import argparse
import contextlib
import errno
import hashlib
import importlib.util
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


_FILE_LOCK_SPEC = importlib.util.spec_from_file_location(
    "canonical_source_portable_file_lock", Path(__file__).with_name("portable_file_lock.py")
)
if _FILE_LOCK_SPEC is None or _FILE_LOCK_SPEC.loader is None:
    raise ImportError("portable lifecycle file lock is unavailable")
_FILE_LOCK_MODULE = importlib.util.module_from_spec(_FILE_LOCK_SPEC)
_FILE_LOCK_SPEC.loader.exec_module(_FILE_LOCK_MODULE)
FileLock = _FILE_LOCK_MODULE.FileLock


@contextlib.contextmanager
def _nonblocking_file_lock(path: Path):
    try:
        lock = FileLock(path).acquire(blocking=False)
    except BlockingIOError as exc:
        raise LifecycleError("SOURCE_LEASE_ACTIVE") from exc
    except OSError as exc:
        raise _os_resource_failure(path, exc) from exc
    try:
        yield lock
    finally:
        try:
            lock.release()
        except OSError as exc:
            raise _os_resource_failure(path, exc) from exc


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


def _platform_name() -> str:
    if sys.platform == "win32":
        return "windows"
    if sys.platform == "darwin":
        return "macos"
    return "linux"


_PLATFORM_PATH_KEYS = frozenset({
    "source_root",
    "lease_root",
    "source_fallback_roots",
    "canonical_user_workspace",
    "recovery_root",
})


def _select_platform_values(values: dict[str, Any]) -> dict[str, Any]:
    """Overlay approved platform paths without changing shared repository identity."""
    platforms = values.get("platforms", {})
    if not isinstance(platforms, dict):
        raise LifecycleError("REPOSITORY_POLICY_INVALID: platforms must be a table")
    platform = _platform_name()
    overrides = platforms.get(platform, {})
    if not isinstance(overrides, dict):
        raise LifecycleError(f"REPOSITORY_POLICY_INVALID: repository.platforms.{platform} must be a table")
    unsupported = sorted(set(overrides) - _PLATFORM_PATH_KEYS)
    if unsupported:
        names = ", ".join(unsupported)
        raise LifecycleError(
            f"REPOSITORY_POLICY_INVALID: repository.platforms.{platform} may override only approved path keys; "
            f"unsupported keys: {names}"
        )
    selected = dict(values)
    selected.update(overrides)
    selected["_platform"] = platform
    return selected


def load_policy(repo: Path, policy_path: Path | None = None) -> dict[str, Any]:
    repo = Path(git(repo, "rev-parse", "--show-toplevel")).resolve()
    path = (policy_path or repo / ".development-repository.toml").resolve()
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
        values = data["repository"]
        if not isinstance(values, dict):
            raise LifecycleError("REPOSITORY_POLICY_INVALID: repository must be a table")
        values = _select_platform_values(values)
        platform = values["_platform"]
        policy = {
            "repository_id": str(values["repository_id"]).strip(),
            "remote": str(values["remote"]).strip(),
            "canonical_ref": str(values["canonical_ref"]).strip(),
            "source_root": str(values["source_root"]).strip(),
            "lease_root": str(values.get("lease_root", values["source_root"])).strip(),
            "build_target": str(values.get("build_target", "web-build")).strip(),
            "canonical_user_workspace": str(values.get("canonical_user_workspace", "")).strip(),
            "source_fallback_roots": [str(item).strip() for item in values.get("source_fallback_roots", [])],
        }
        release = values.get("release", {})
        if not isinstance(release, dict):
            raise LifecycleError("REPOSITORY_POLICY_INVALID: repository.release must be a table")
        allow_immutable = release.get("allow_approved_immutable_candidates", False)
        required_ancestors = release.get("required_source_ancestors", [])
        if not isinstance(allow_immutable, bool) or not isinstance(required_ancestors, list) or any(
            not isinstance(revision, str) or not re.fullmatch(r"[a-f0-9]{40,64}", revision)
            for revision in required_ancestors
        ):
            raise LifecycleError("REPOSITORY_POLICY_INVALID: repository.release candidate policy is malformed")
        policy["release"] = {
            "allow_approved_immutable_candidates": allow_immutable,
            "required_source_ancestors": required_ancestors,
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
        if platform == "windows":
            raise LifecycleError("PLATFORM_POLICY_REQUIRED: repository.platforms.windows.source_root")
        raise LifecycleError("REPOSITORY_POLICY_INVALID: source_root must be absolute")
    source_root = source_root.resolve()
    if _inside(source_root, repo):
        raise LifecycleError("SOURCE_ROOT_INSIDE_DEVELOPER_CHECKOUT")
    policy["source_root"] = str(source_root)
    lease_root = Path(policy["lease_root"]).expanduser()
    if not lease_root.is_absolute():
        if platform == "windows":
            raise LifecycleError("PLATFORM_POLICY_REQUIRED: repository.platforms.windows.lease_root")
        raise LifecycleError("REPOSITORY_POLICY_INVALID: lease_root must be absolute")
    lease_root = lease_root.resolve()
    if _inside(lease_root, repo):
        raise LifecycleError("SOURCE_ROOT_INSIDE_DEVELOPER_CHECKOUT")
    policy["lease_root"] = str(lease_root)
    fallback_roots = []
    for configured in policy["source_fallback_roots"]:
        candidate = Path(configured).expanduser()
        if not candidate.is_absolute():
            if platform == "windows":
                raise LifecycleError("PLATFORM_POLICY_REQUIRED: repository.platforms.windows.source_fallback_roots")
            raise LifecycleError("REPOSITORY_POLICY_INVALID: source_fallback_roots must be absolute")
        candidate = candidate.resolve()
        if _inside(candidate, repo):
            raise LifecycleError("SOURCE_ROOT_INSIDE_DEVELOPER_CHECKOUT")
        if candidate != source_root and candidate not in fallback_roots:
            fallback_roots.append(candidate)
    policy["source_fallback_roots"] = fallback_roots
    return policy


MIN_SOURCE_BYTES = 1024 * 1024 * 1024
MIN_WEB_BUILD_BYTES = 5 * 1024 * 1024 * 1024
MIN_SOURCE_INODES = 10_000


def _filesystem_evidence(path: Path) -> dict[str, Any]:
    probe = path
    while not probe.exists() and probe != probe.parent:
        probe = probe.parent
    try:
        usage = shutil.disk_usage(probe)
        device = probe.stat().st_dev
        if os.name == "nt":
            mount = Path(probe.anchor)
            available_bytes = usage.free
            available_inodes = None  # NTFS allocates file records dynamically; no POSIX inode counter exists.
            inode_capacity_not_applicable = True
        else:
            stats = os.statvfs(probe)
            mount = probe
            while mount.parent != mount and mount.parent.stat().st_dev == device:
                mount = mount.parent
            available_bytes = stats.f_bavail * stats.f_frsize
            # Some Linux NTFS3 mounts report all three inode counters as zero
            # because the filesystem does not expose a POSIX inode capacity.
            # Treat that as unavailable evidence, not exhausted capacity.
            inode_capacity_not_applicable = stats.f_files == 0
            available_inodes = None if inode_capacity_not_applicable else stats.f_favail
        return {
            "path": str(path), "mount_path": str(mount), "device": device,
            "available_bytes": available_bytes,
            "available_inodes": available_inodes,
            "inode_capacity_not_applicable": inode_capacity_not_applicable,
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


@contextlib.contextmanager
def _file_lock(path: Path):
    try:
        lock = FileLock(path).acquire()
    except OSError as exc:
        raise _os_resource_failure(path, exc) from exc
    try:
        yield lock
    finally:
        try:
            lock.release()
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


def _admit_roots(
    policy: dict[str, Any],
    repo: Path | None = None,
    *,
    minimum_available_bytes: int = MIN_SOURCE_BYTES,
) -> tuple[list[tuple[Path, dict[str, Any]]], list[dict[str, Any]]]:
    admitted: list[tuple[Path, dict[str, Any]]] = []
    rejected: list[dict[str, Any]] = []
    for root in _workspace_roots(policy):
        evidence = _filesystem_evidence(root)
        if evidence.get("error"):
            rejected.append({**evidence, "reason": "FILESYSTEM_UNAVAILABLE"})
        elif not evidence["writable"]:
            rejected.append({**evidence, "reason": "EACCES"})
        elif evidence["available_bytes"] < minimum_available_bytes:
            rejected.append({**evidence, "reason": "ENOSPC", "required_bytes": minimum_available_bytes})
        elif evidence["available_inodes"] is not None and evidence["available_inodes"] < MIN_SOURCE_INODES:
            rejected.append({**evidence, "reason": "INODE_EXHAUSTION", "required_inodes": MIN_SOURCE_INODES})
        else:
            admitted.append((root, evidence))
    if repo is not None:
        common_dir = Path(git(repo, "rev-parse", "--path-format=absolute", "--git-common-dir"))
        metadata = _filesystem_evidence(common_dir)
        if metadata.get("error") or not metadata.get("writable") or metadata.get("available_bytes", 0) < 16 * 1024 * 1024 or (metadata.get("available_inodes") is not None and metadata["available_inodes"] < 128):
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
    ready = (allow_dirty or not dirty_paths) and not in_progress and ancestor
    if in_progress:
        next_action = "RESOLVE_OR_HANDOFF_GIT_OPERATION"
    elif not ancestor:
        next_action = "RECONCILE_WITH_FETCHED_CANONICAL_SHA"
    elif dirty_paths and not allow_dirty:
        next_action = "RECONCILE_OWNED_WORK_IN_PRIMARY_CHECKOUT"
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


def _cloudflare_staging_bundle(root: Path, source_revision: str) -> dict[str, Any] | None:
    """Verify the canonical staging bundle manifest and every referenced build byte."""
    root = root.resolve()
    manifest_path = root / "apps/cloudflare/.staging-artifact/bundle-manifest.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(manifest, dict) or manifest.get("format") != "cloudflare-staging-build-bundle-v1":
        return None
    if manifest.get("sourceSha") != source_revision:
        return None
    modules, assets = manifest.get("moduleFiles"), manifest.get("assets")
    if not isinstance(modules, list) or not modules or not isinstance(assets, list) or not assets:
        return None
    main_module = manifest.get("mainModule")
    compatibility_date = manifest.get("compatibilityDate")
    if not isinstance(main_module, str) or not re.fullmatch(r"[A-Za-z0-9._/-]{1,512}", main_module):
        return None
    if not isinstance(compatibility_date, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", compatibility_date):
        return None
    module_candidate = root / "apps/cloudflare/.staging-artifact/modules"
    asset_candidate = root / "apps/web/dist/public"
    if module_candidate.is_symlink() or asset_candidate.is_symlink():
        return None
    module_root = module_candidate.resolve()
    asset_root = asset_candidate.resolve()
    try:
        module_root.relative_to(root)
        asset_root.relative_to(root)
    except ValueError:
        return None
    try:
        public_source_root = (root / "apps/web/client/public").resolve(strict=True)
        public_source_root.relative_to(root)
    except (OSError, ValueError):
        return None
    if not public_source_root.is_dir() or public_source_root.is_symlink():
        return None

    def is_within(path: Path, boundary: Path) -> bool:
        try:
            path.relative_to(boundary)
            return True
        except ValueError:
            return False

    canonical_entries: list[tuple[str, str, int]] = []
    names: set[str] = set()
    try:
        for group, entries, base in (("modules", modules, module_root), ("public", assets, asset_root)):
            for entry in entries:
                if not isinstance(entry, dict):
                    return None
                name = entry.get("name")
                if (
                    not isinstance(name, str)
                    or not name
                    or len(name) > 512
                    or name.startswith("/")
                    or "\\" in name
                    or any(ord(character) < 32 or ord(character) == 127 for character in name)
                ):
                    return None
                if any(part in ("", ".", "..") for part in name.split("/")):
                    return None
                canonical_name = f"{group}/{name}"
                if canonical_name in names:
                    return None
                names.add(canonical_name)
                candidate = base / name
                try:
                    path = candidate.resolve(strict=True)
                    if group == "modules":
                        if candidate.is_symlink() or any(parent.is_symlink() for parent in candidate.parents if parent != base.parent):
                            return None
                        path.relative_to(module_root)
                    elif not is_within(path, asset_root) and not is_within(path, public_source_root):
                        return None
                except (OSError, RuntimeError, ValueError):
                    return None
                if not path.is_file():
                    return None
                file_hash = hashlib.sha256()
                with path.open("rb") as stream:
                    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                        file_hash.update(chunk)
                digest = file_hash.hexdigest()
                size = path.stat().st_size
                if entry.get("sha256") != digest or entry.get("size") != size:
                    return None
                canonical_entries.append((canonical_name, digest, size))
    except (OSError, ValueError):
        return None
    if f"modules/{main_module}" not in names or not any(name.startswith("public/") for name in names):
        return None
    canonical_entries.sort(key=lambda row: row[0])
    digest_manifest = "\n".join(f"{name}\0{digest}\0{size}" for name, digest, size in canonical_entries)
    build_digest = hashlib.sha256(digest_manifest.encode()).hexdigest()
    if manifest.get("buildDigest") != build_digest:
        return None
    return {
        "status": "BUNDLE_READY",
        "source_sha": source_revision,
        "build_digest": build_digest,
        "artifact_ref": f"sha256:{build_digest}",
        "main_module": main_module,
        "compatibility_date": compatibility_date,
        "module_count": len(modules),
        "asset_count": len(assets),
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


def _sync_published_build_receipt(repo: Path, policy: dict[str, Any], result_path: Path) -> Path:
    """Keep fallback build receipts visible to the existing primary authority.

    Copy only the final authentic bytes, within this repository's approved
    platform roots. Never expand the runtime's receipt search path or replace
    a different receipt. The source remains available if replication fails.
    """
    authoritative = load_policy(repo) if (repo / ".development-repository.toml").is_file() else policy
    for key in ("repository_id", "remote", "canonical_ref", "lease_root", "build_target"):
        if policy[key] != authoritative[key]:
            raise LifecycleError("CANONICAL_RECEIPT_POLICY_MISMATCH")
    repository_key = _hash(authoritative["repository_id"])[:20]
    approved = [root.resolve() for root in _workspace_roots(authoritative)]
    source = result_path.absolute()
    if source.is_symlink() or source.resolve() != source or source.parent not in [
        root / ".development-build-results" / repository_key for root in approved
    ]:
        raise LifecycleError("CANONICAL_RECEIPT_ROOT_NOT_APPROVED")
    receipt_bytes = source.read_bytes()
    receipt = json.loads(receipt_bytes)
    revision = receipt.get("source_revision", "")
    bundle = receipt.get("cloudflare_staging_artifact", {})
    source_root = source.parents[2]
    if (
        receipt.get("status") != "BUILD_PASSED"
        or receipt.get("source_verified") is not True
        or receipt.get("canonical_ref") != authoritative["canonical_ref"]
        or not re.fullmatch(r"[a-f0-9]{40}", revision)
        or not source.name.startswith(revision + "-")
        or receipt.get("result_file") != str(source)
        or receipt.get("isolated_workspace") != str(source_root / repository_key / f"{revision}-build")
        or bundle.get("status") != "PUBLISHED"
        or bundle.get("source_sha") != revision
        or not re.fullmatch(r"[a-f0-9]{64}", bundle.get("build_digest", ""))
        or bundle.get("artifact_ref") != "sha256:" + bundle.get("build_digest", "")
    ):
        raise LifecycleError("CANONICAL_PUBLISHED_RECEIPT_REQUIRED")
    source_policy = (
        load_policy(source_root)
        if (source_root / ".development-repository.toml").is_file()
        else authoritative
    )
    if not source_candidate_is_eligible(
        source_root, revision, str(receipt.get("canonical_tip_after_build", "")),
        source_policy.get("release", {}), source_policy["remote"], source_policy["canonical_ref"],
    ):
        raise LifecycleError("CANONICAL_PUBLISHED_RECEIPT_REQUIRED")
    destination = approved[0] / ".development-build-results" / repository_key / source.name
    if destination == source:
        return source
    temporary = None
    try:
        if destination.parent.resolve() != destination.parent or destination.is_symlink():
            raise LifecycleError("CANONICAL_RECEIPT_ROOT_NOT_APPROVED")
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.parent.resolve() != destination.parent or destination.is_symlink():
            raise LifecycleError("CANONICAL_RECEIPT_ROOT_NOT_APPROVED")
        if not destination.exists():
            fd, temporary = tempfile.mkstemp(prefix=f".{destination.name}.", dir=destination.parent)
            with os.fdopen(fd, "wb") as stream:
                stream.write(receipt_bytes)
                stream.flush()
                os.fsync(stream.fileno())
            try:
                os.link(temporary, destination)
            except FileExistsError:
                pass  # A concurrent identical copy is safe; compare below.
        if destination.is_symlink() or destination.read_bytes() != receipt_bytes:
            raise LifecycleError("CANONICAL_RECEIPT_REPLICATION_CONFLICT")
    except OSError as exc:
        raise _os_resource_failure(destination, exc) from exc
    finally:
        if temporary is not None:
            os.unlink(temporary)
    return destination


def _source_consumers(workspace: Path) -> list[int]:
    """Check visible process references in addition to the authoritative leases."""
    if not Path('/proc').is_dir():
        raise LifecycleError('SOURCE_RETENTION_PROCESS_INSPECTION_UNAVAILABLE')
    consumers = []
    prefix = str(workspace) + os.sep
    for proc in Path('/proc').glob('[0-9]*'):
        references = []
        for item in (proc / 'cwd', proc / 'exe'):
            try:
                references.append(os.readlink(item))
            except OSError:
                pass
        try:
            for item in (proc / 'fd').iterdir():
                try:
                    references.append(os.readlink(item))
                except OSError:
                    pass
        except OSError:
            pass  # Privileged login/system helpers hide their descriptors.
        try:
            command = (proc / 'cmdline').read_bytes().decode('utf-8', errors='replace')
        except OSError:
            command = ''
        if any(item == str(workspace) or item.startswith(prefix) for item in references) or prefix in command:
            consumers.append(int(proc.name))
    return consumers


def _generated_build_path(value: str) -> bool:
    return bool(re.fullmatch(
        r'(?:node_modules/|(?:apps|packages)/[^/]+/node_modules/|'
        r'apps/web/(?:dist/|dist-prev-[0-9]+-[0-9]+/|\.build-atomic\.lock)|'
        r'apps/cloudflare/(?:\.staging-artifact/|\.wrangler/tmp/)|'
        r'packages/[^/]+/(?:dist/|tsconfig\.tsbuildinfo))', value
    ))


@contextlib.contextmanager
def _source_release_lock(path: Path):
    # Promotion creates this lock as root. flock can coordinate on an existing
    # read-only descriptor without changing its owner or permissions.
    import fcntl
    stream = path.open('rb') if path.exists() else path.open('a+b')
    try:
        try:
            fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise LifecycleError('RELEASE_IN_PROGRESS') from exc
        yield
    finally:
        stream.close()


def _retained_release_revisions(repo: Path, release_root: Path) -> set[str]:
    protected_revisions: set[str] = set()
    # Release directories are independently materialized, but retain their
    # source tuples too, including rollback and a concurrently prepared one.
    if release_root.exists():
        for directory in release_root.iterdir():
            if directory.is_symlink() or not directory.is_dir():
                continue
            manifest = directory / 'release-manifest.json'
            if not manifest.exists():
                continue
            try:
                release = json.loads(manifest.read_text(encoding='utf-8'))
                protected_revisions.add(str(release['source_revision']))
            except (OSError, ValueError, KeyError) as exc:
                raise LifecycleError('SOURCE_RETENTION_RELEASE_MANIFEST_INVALID') from exc
        for link in release_root.iterdir():
            if link.is_symlink():
                for workspace in _registered_worktrees(repo):
                    if _inside(link.resolve(), workspace):
                        protected_revisions.add(workspace.name.split('-')[0])
    return protected_revisions


def _collect_build_artifacts(repo: Path, policy: dict[str, Any], protected: set[str], *, apply: bool) -> dict[str, Any]:
    """Collect reproducible prepared artifacts, preserving all release receipts."""
    key = _hash(policy['repository_id'])[:20]
    report: dict[str, Any] = {'artifact_eligible': [], 'artifact_removed': [], 'artifact_retained': []}
    canonical = git(repo, 'rev-parse', f"{policy['remote']}/{policy['canonical_ref'].removeprefix('refs/heads/')}^{{commit}}")
    for root in _workspace_roots(policy):
        results = root / '.development-build-results' / key
        store = results / 'artifacts'
        if not store.is_dir() or store.is_symlink():
            continue
        with _source_release_lock(store / '.artifact-publish.lock'):
            candidates = []
            for directory in store.iterdir():
                if directory.is_symlink() or not directory.is_dir() or os.path.ismount(directory):
                    continue
                try:
                    manifest = json.loads((directory / 'release-manifest.json').read_text(encoding='utf-8'))
                    revision = manifest['sourceSha']
                    receipt_path = Path(manifest['canonicalBuildResult'])
                    receipt = json.loads(receipt_path.read_text(encoding='utf-8'))
                    if (manifest.get('schemaVersion') != 1 or manifest.get('releaseId') != directory.name
                        or not re.fullmatch(r'smartspec-web-' + re.escape(revision) + r'-[0-9a-f]{12}', directory.name)
                        or receipt_path.resolve().parent != results.resolve()
                        or receipt.get('source_revision') != revision or receipt.get('status') != 'BUILD_PASSED'
                        or manifest.get('frontendSourceSha') != revision or manifest.get('backendSourceSha') != revision
                        or not re.fullmatch(r'sha256:[0-9a-f]{64}', manifest.get('releaseArtifactDigest', ''))):
                        raise ValueError('artifact identity/receipt mismatch')
                    candidates.append(((directory / 'release-manifest.json').stat().st_mtime, directory, revision))
                except (OSError, ValueError, TypeError, KeyError):
                    report['artifact_retained'].append({'path': str(directory), 'reason': 'UNKNOWN_ARTIFACT'})
            recent = {item[1] for item in sorted(candidates, reverse=True)[:2]}
            for last_use, directory, revision in candidates:
                reason = None
                if revision in protected:
                    reason = 'SERVING_OR_RETAINED_SOURCE'
                elif directory in recent or time.time() - last_use < 3600:
                    reason = 'RECENT_ARTIFACT'
                elif subprocess.run(['git', '-C', str(repo), 'merge-base', '--is-ancestor', revision, canonical], capture_output=True).returncode:
                    reason = 'ARTIFACT_SOURCE_NOT_INTEGRATED'
                elif _source_consumers(directory):
                    reason = 'ARTIFACT_PROCESS_ACTIVE'
                if reason:
                    report['artifact_retained'].append({'path': str(directory), 'reason': reason})
                    continue
                report['artifact_eligible'].append(str(directory))
                if apply:
                    try:
                        # Prepared artifacts freeze directory modes. Make only
                        # this verified disposable tree writable, without
                        # following symlinks or chmodding shared file inodes.
                        for current, directories, _files in os.walk(directory, followlinks=False):
                            if os.path.ismount(current):
                                raise OSError('nested artifact mount preserved')
                            os.chmod(current, Path(current).stat().st_mode | 0o700)
                            directories[:] = [name for name in directories if not (Path(current) / name).is_symlink()]
                        shutil.rmtree(directory)
                        report['artifact_removed'].append(str(directory))
                    except OSError as exc:
                        report['artifact_retained'].append({'path': str(directory), 'reason': f'ARTIFACT_REMOVE_FAILED: {exc}'})
    return report


def collect_prepared_artifacts(repo: Path, policy_path: Path | None = None, *, apply: bool = False,
                               release_root: Path = Path('/home/dev/production-releases')) -> dict[str, Any]:
    policy = load_policy(repo, policy_path)
    lease_dir = Path(policy['lease_root']) / _hash(policy['repository_id'])[:20]
    lease_dir.mkdir(parents=True, exist_ok=True)
    with _source_release_lock(lease_dir / 'production-release.lock'):
        protected = _retained_release_revisions(repo, release_root)
        leases = []
        for state_path in lease_dir.glob('*-build.json'):
            try:
                state = json.loads(state_path.read_text(encoding='utf-8'))
                if state.get('repository_id') == policy['repository_id'] and Path(state['isolated_workspace']).exists():
                    leases.append((state_path.stat().st_mtime, state))
            except (OSError, ValueError, KeyError, TypeError):
                continue
        for _last_use, state in sorted(leases, key=lambda item: item[0], reverse=True)[:2]:
            protected.add(state['source_revision'])
        for _last_use, state in leases:
            if state.get('expires_at', 0) > time.time():
                protected.add(state['source_revision'])
        return {'status': 'APPLIED' if apply else 'DRY_RUN',
                **_collect_build_artifacts(repo, policy, protected, apply=apply)}


def collect_build_sources(
    repo: Path, policy_path: Path | None = None, *, apply: bool = False,
    min_idle_seconds: int = 3600, keep_recent: int = 2,
    release_root: Path = Path('/home/dev/production-releases'),
    build_lock_held: bool = False,
) -> dict[str, Any]:
    """Retire only integrated, inactive, generated build sources; retain receipts.

    Takes the builder/release locks and the exact tuple's lease locks. Unknown
    workspaces, user content, serving/rollback releases and fresh artifacts stay.
    No branch deletion, reset, forced worktree removal or global Git pruning.
    """
    if min_idle_seconds < 3600 or keep_recent < 2:
        raise LifecycleError('SOURCE_RETENTION_MINIMUM: one hour and two recent builds')
    repo = Path(git(repo, 'rev-parse', '--show-toplevel')).resolve()
    policy = load_policy(repo, policy_path)
    key = _hash(policy['repository_id'])[:20]
    lease_dir = Path(policy['lease_root']) / key
    lease_dir.mkdir(parents=True, exist_ok=True)
    locks = contextlib.ExitStack()
    with locks:
        if not build_lock_held:
            locks.enter_context(_nonblocking_file_lock(lease_dir / 'canonical-build.lock'))
        locks.enter_context(_source_release_lock(lease_dir / 'production-release.lock'))
        protected_revisions = _retained_release_revisions(repo, release_root)
        entries = []
        for state_path in lease_dir.glob('*-build.json'):
            try:
                lease = json.loads(state_path.read_text(encoding='utf-8'))
                revision = lease['source_revision']
                workspace = Path(lease['isolated_workspace'])
                if (lease.get('repository_id') != policy['repository_id'] or lease.get('purpose') != 'build'
                    or state_path.stem != f'{revision}-build' or not re.fullmatch(r'[0-9a-f]{40,64}', revision)
                    or workspace.is_symlink() or workspace.resolve() not in {
                        root / key / f'{revision}-build' for root in _workspace_roots(policy)
                    } or not workspace.exists()):
                    continue
                last_use = max(float(lease.get('created_at', 0)), state_path.stat().st_mtime)
                results = workspace.parents[1] / '.development-build-results' / key
                for receipt_path in results.glob(f'{revision}-*.json'):
                    receipt = json.loads(receipt_path.read_text(encoding='utf-8'))
                    if receipt.get('isolated_workspace') == str(workspace):
                        last_use = max(last_use, float(receipt.get('completed_at', 0)), receipt_path.stat().st_mtime)
                entries.append((last_use, workspace, state_path, lease))
            except (OSError, ValueError, KeyError, TypeError):
                continue  # Never infer ownership from corrupt/unknown metadata.
        recent = {item[1] for item in sorted(entries, key=lambda item: item[0], reverse=True)[:keep_recent]}
        canonical = git(repo, 'rev-parse', f"{policy['remote']}/{policy['canonical_ref'].removeprefix('refs/heads/')}^{{commit}}")
        report: dict[str, Any] = {'status': 'APPLIED' if apply else 'DRY_RUN', 'min_idle_seconds': min_idle_seconds,
                                 'keep_recent': keep_recent, 'eligible': [], 'removed': [], 'retained': []}
        for last_use, workspace, state_path, observed in entries:
            reason = None
            if workspace in recent:
                reason = 'RECENT_BUILD'
            elif observed['source_revision'] in protected_revisions:
                reason = 'SERVING_OR_RETAINED_RELEASE'
            elif time.time() - last_use < min_idle_seconds:
                reason = 'RECENT_ACTIVITY'
            if reason:
                report['retained'].append({'path': str(workspace), 'reason': reason})
                continue
            try:
                with _nonblocking_file_lock(state_path.with_suffix('.lock')):
                    with _nonblocking_file_lock(state_path.with_suffix('.active')):
                        current = json.loads(state_path.read_text(encoding='utf-8'))
                        if current != observed or current.get('expires_at', 0) > time.time():
                            raise LifecycleError('SOURCE_LEASE_CHANGED_OR_ACTIVE')
                        if workspace.resolve() not in _registered_worktrees(repo):
                            raise LifecycleError('WORKSPACE_NOT_REGISTERED')
                        if git(workspace, 'branch', '--show-current') or git(workspace, 'rev-parse', 'HEAD') != current['source_revision']:
                            raise LifecycleError('SOURCE_REVISION_OR_BRANCH_CHANGED')
                        if subprocess.run(['git', '-C', str(repo), 'merge-base', '--is-ancestor', current['source_revision'], canonical], capture_output=True).returncode:
                            raise LifecycleError('SOURCE_NOT_INTEGRATED')
                        changes = git(workspace, 'status', '--porcelain=v1', '-z', '--ignored=matching', '--untracked-files=normal')
                        for entry in changes.split('\0'):
                            if entry and (not entry.startswith('!! ') or not _generated_build_path(entry[3:])):
                                raise LifecycleError('SOURCE_HAS_USER_OR_UNKNOWN_CONTENT')
                        if _source_consumers(workspace):
                            raise LifecycleError('SOURCE_PROCESS_ACTIVE')
                        report['eligible'].append(str(workspace))
                        if apply:
                            git(repo, 'worktree', 'remove', str(workspace))
                            # Keep lease/fence and build receipts as historical
                            # evidence; future preparation increments the fence.
                            report['removed'].append(str(workspace))
            except (LifecycleError, OSError, ValueError) as exc:
                report['retained'].append({'path': str(workspace), 'reason': str(exc)})
        try:
            report.update(_collect_build_artifacts(repo, policy, protected_revisions | {item[3]['source_revision'] for item in entries if item[1] in recent}, apply=apply))
        except (LifecycleError, OSError) as exc:
            report.update({'artifact_status': 'DEFERRED', 'artifact_error': str(exc)})
            if apply:
                report['status'] = 'PARTIAL'
        return report


def prepare_source(
    repo: Path,
    *,
    purpose: str,
    source_revision: str | None = None,
    required_revision: str | None = None,
    policy_path: Path | None = None,
    lease_seconds: int = 900,
    minimum_available_bytes: int = MIN_SOURCE_BYTES,
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

    admitted, rejected = _admit_roots(
        policy, repo, minimum_available_bytes=minimum_available_bytes
    )
    if not admitted:
        reason = "RESOURCE_BLOCKED" if rejected and all(item.get("reason") in {"ENOSPC", "INODE_EXHAUSTION", "EACCES", "EROFS", "GIT_METADATA_CAPACITY"} for item in rejected) else "WORKSPACE_ADMISSION_FAILED"
        raise LifecycleError(f"{reason}: no authorized source filesystem passed preflight; evidence={json.dumps(rejected, sort_keys=True)}")
    lease_evidence = _filesystem_evidence(Path(policy["lease_root"]))
    if lease_evidence.get("error") or not lease_evidence.get("writable") or (lease_evidence.get("available_inodes") is not None and lease_evidence["available_inodes"] < 1000):
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
    with _file_lock(state_path.with_suffix(".lock")):
        with _nonblocking_file_lock(active_path):

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
    with _nonblocking_file_lock(active_path):
        with _file_lock(lease_lock_path):
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
                with _file_lock(lease_lock_path):
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
            with _file_lock(lease_lock_path):
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


def source_candidate_is_eligible(repo: Path, source_sha: str, canonical_sha: str,
                                 release_policy: dict[str, Any], remote: str = "origin",
                                 canonical_ref: str = "refs/heads/main") -> bool:
    required = release_policy.get("required_source_ancestors", [])
    if not isinstance(required, list) or any(
        not isinstance(item, str) or not re.fullmatch(r"[a-f0-9]{40,64}", item) for item in required
    ):
        return False

    def ancestor(older: str, newer: str) -> bool:
        return subprocess.run(
            ["git", "-C", str(repo), "merge-base", "--is-ancestor", older, newer],
            capture_output=True,
            check=False,
        ).returncode == 0

    if not all(ancestor(required_sha, source_sha) for required_sha in required):
        return False
    if source_sha == canonical_sha:
        return True
    if subprocess.run(
        ["git", "-C", str(repo), "cat-file", "-e", f"{canonical_sha}^{{commit}}"],
        capture_output=True,
        check=False,
    ).returncode != 0:
        fetched = subprocess.run(
            ["git", "-C", str(repo), "fetch", "--no-tags", remote, canonical_ref],
            capture_output=True,
            check=False,
        )
        if fetched.returncode or subprocess.run(
            ["git", "-C", str(repo), "cat-file", "-e", f"{canonical_sha}^{{commit}}"],
            capture_output=True,
            check=False,
        ).returncode != 0:
            return False
    return release_policy.get("allow_approved_immutable_candidates") is True and ancestor(source_sha, canonical_sha)


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


def _cloudflare_artifact_publication_process(
    repo: Path, result_dir: Path, source_sha: str, build_id: str,
    *, canonical_user_workspace: Path | None = None,
) -> tuple[list[str], dict[str, str]]:
    """Load the caller's server configuration only in the publisher process.

    Exact-source worktrees intentionally contain no ignored .env files. Keep
    credentials out of the build and artifact; dotenv reads the caller's server
    env, or the configured canonical workspace's env when the caller has none.
    A fallback workspace must belong to this exact Git repository. Never scan
    unrelated worktrees or copy env contents into the build/artifact.
    """
    environment = os.environ.copy()
    environment["SMARTSPEC_CANONICAL_BUILD_RESULTS_ROOT"] = str(result_dir.resolve())
    pnpm = shutil.which("pnpm")
    corepack = shutil.which("corepack") if not pnpm else None
    if pnpm:
        command = [pnpm]
    elif corepack:
        command = [corepack, "pnpm"]
    else:
        command = ["pnpm"]
    command.extend(["--filter", "@smartspec/web", "exec", "tsx"])
    configured_path = environment.get("SMARTSPEC_ARTIFACT_ENV_FILE") or environment.get("DOTENV_CONFIG_PATH")
    env_file = Path(configured_path).expanduser() if configured_path else repo / "apps/web/.env"
    if not env_file.is_absolute():
        env_file = repo / env_file
    env_source = "explicit" if configured_path else "caller"
    if not configured_path and not env_file.is_file() and canonical_user_workspace is not None:
        canonical = canonical_user_workspace.expanduser()
        if canonical.is_absolute():
            canonical = canonical.resolve()
            candidate = canonical / "apps/web/.env"
            if candidate.is_file():
                try:
                    if Path(git(canonical, "rev-parse", "--show-toplevel")).resolve() != canonical:
                        raise LifecycleError("ARTIFACT_ENV_WORKSPACE_ROOT_REQUIRED")
                    caller_common = Path(git(repo, "rev-parse", "--git-common-dir"))
                    canonical_common = Path(git(canonical, "rev-parse", "--git-common-dir"))
                    if not caller_common.is_absolute():
                        caller_common = repo / caller_common
                    if not canonical_common.is_absolute():
                        canonical_common = canonical / canonical_common
                    if caller_common.resolve() == canonical_common.resolve():
                        env_file, env_source = candidate, "canonical_workspace"
                except LifecycleError:
                    # An unavailable/foreign checkout never becomes a secret
                    # source. Injected runner configuration can still work.
                    pass
    if configured_path or env_file.is_file():
        environment["DOTENV_CONFIG_PATH"] = str(env_file.resolve())
        environment["DOTENV_CONFIG_QUIET"] = "true"
        # dotenv treats the string "false" as truthy; remove the option so
        # credentials injected by the runner retain precedence.
        environment.pop("DOTENV_CONFIG_OVERRIDE", None)
        command.extend(["--require", "dotenv/config"])
        environment["SMARTSPEC_ARTIFACT_ENV_SOURCE"] = env_source
    else:
        environment["SMARTSPEC_ARTIFACT_ENV_SOURCE"] = "process"
    command.extend([
        "scripts/publish-cloudflare-staging-artifact.ts",
        "--source-sha", source_sha,
        "--build-id", build_id,
    ])
    return command, environment


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
    minimum_available_bytes = (
        MIN_WEB_BUILD_BYTES if build_target == "smartspec-web" else MIN_SOURCE_BYTES
    )
    admitted_roots, rejected_roots = _admit_roots(
        policy, repo, minimum_available_bytes=minimum_available_bytes
    )
    if not admitted_roots:
        reason = "RESOURCE_BLOCKED" if rejected_roots else "WORKSPACE_ADMISSION_FAILED"
        raise LifecycleError(f"{reason}: no authorized source filesystem passed preflight; evidence={json.dumps(rejected_roots, sort_keys=True)}")
    lease_dir = Path(policy["lease_root"]) / repository_key
    lease_dir.mkdir(parents=True, exist_ok=True)
    global_lock_path = lease_dir / "canonical-build.lock"

    # One build at a time per repository. Resolve the canonical tip only after
    # obtaining the lock so queued builds do not start from an older snapshot.
    with _file_lock(global_lock_path):
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

        if policy['repository_id'] == 'smartspecpro' and sys.platform == 'linux':
            try:
                retention = collect_build_sources(repo, policy_path, apply=True, build_lock_held=True)
                print(f"[canonical-build] source retention: removed={len(retention['removed'])} retained={len(retention['retained'])}", file=sys.stderr, flush=True)
            except (LifecycleError, OSError) as exc:
                print(f"[canonical-build] source retention deferred: {exc}", file=sys.stderr, flush=True)
        started_at = time.time()
        lease = prepare_source(
            repo,
            purpose="build",
            source_revision=canonical_tip,
            policy_path=policy_path,
            lease_seconds=lease_seconds,
            minimum_available_bytes=minimum_available_bytes,
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
        cloudflare_bundle = (
            _cloudflare_staging_bundle(Path(str(lease["isolated_workspace"])), str(lease["source_revision"]))
            if exit_code == 0 and lease["canonical_ref"] == "refs/heads/main"
            else None
        )
        latest_tip = remote_canonical_tip(repo, policy)
        resource_blocked = exit_code == 137 or termination_signal == "SIGKILL"
        if resource_blocked:
            status = "RESOURCE_BLOCKED"
            primary_workspace_sync = {"status": "SKIPPED_RESOURCE_BLOCKED", "head": git(repo, "rev-parse", "HEAD")}
        elif latest_tip != lease["source_revision"] and source_candidate_is_eligible(
            Path(str(lease["isolated_workspace"])), lease["source_revision"], latest_tip,
            policy.get("release", {}), policy["remote"], policy["canonical_ref"],
        ):
            status = "BUILD_PASSED"
            primary_workspace_sync = {"status": "SKIPPED_CANONICAL_ADVANCED", "head": git(repo, "rev-parse", "HEAD")}
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
            "cloudflare_staging_artifact": cloudflare_bundle or {"status": "PUBLISH_PENDING", "reason": "canonical_staging_bundle_unavailable"},
            "isolated_workspace": lease["isolated_workspace"],
            "primary_workspace_sync": primary_workspace_sync,
        }
        result_root = Path(str(lease["isolated_workspace"])).parents[1]
        result_dir = result_root / ".development-build-results" / repository_key
        result_dir.mkdir(parents=True, exist_ok=True)
        result_path = result_dir / f"{lease['source_revision']}-{uuid.uuid4()}.json"
        result["result_file"] = str(result_path)
        _write_json_atomic(result_path, result)
        if status == "BUILD_PASSED" and cloudflare_bundle:
            publish_command, publisher_environment = _cloudflare_artifact_publication_process(
                repo, result_dir, str(lease["source_revision"]), result_path.stem,
                canonical_user_workspace=Path(policy["canonical_user_workspace"]) if policy.get("canonical_user_workspace") else None,
            )
            result["cloudflare_staging_artifact"]["configuration_source"] = publisher_environment["SMARTSPEC_ARTIFACT_ENV_SOURCE"]
            try:
                publication = subprocess.run(
                    publish_command,
                    cwd=str(lease["isolated_workspace"]),
                    text=True,
                    capture_output=True,
                    env=publisher_environment,
                    timeout=180,
                )
                parsed = None
                for line in reversed(publication.stdout.splitlines()):
                    try:
                        parsed = json.loads(line)
                        break
                    except ValueError:
                        continue
                if (
                    publication.returncode == 0
                    and isinstance(parsed, dict)
                    and parsed.get("status") == "PUBLISHED"
                    and parsed.get("sourceSha") == lease["source_revision"]
                    and parsed.get("buildDigest") == cloudflare_bundle["build_digest"]
                    and parsed.get("artifactRef") == cloudflare_bundle["artifact_ref"]
                ):
                    result["cloudflare_staging_artifact"].update({
                        "status": "PUBLISHED",
                        "artifact_ref": parsed.get("artifactRef"),
                    })
                else:
                    result["cloudflare_staging_artifact"].update({
                        "status": "PUBLISH_PENDING",
                        "reason": parsed.get("reason") if isinstance(parsed, dict) else "publisher_unavailable",
                    })
                    diagnostic = parsed.get("diagnosticCode") if isinstance(parsed, dict) else None
                    if isinstance(diagnostic, str) and re.fullmatch(r"[A-Z][A-Z0-9_]{4,99}", diagnostic):
                        result["cloudflare_staging_artifact"]["diagnostic_code"] = diagnostic
            except (OSError, subprocess.TimeoutExpired):
                result["cloudflare_staging_artifact"].update({"status": "PUBLISH_PENDING", "reason": "publisher_unavailable"})
            _write_json_atomic(result_path, result)
            if result["cloudflare_staging_artifact"]["status"] == "PUBLISHED":
                primary_receipt = _sync_published_build_receipt(repo, policy, result_path)
                print(f"[canonical-build] primary receipt={primary_receipt}", file=sys.stderr, flush=True)
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
    max_stale_rebuilds: int = 0,
) -> dict[str, Any]:
    """Build the pinned canonical tip and preserve a valid artifact if main advances.

    Development builds default to no stale-source retries: the result keeps its
    exact source SHA and artifact digest and reports a newer canonical tip.
    Callers that must publish the latest revision can opt into bounded retries.
    Resource or code failures are returned immediately, not retried.
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
    build.add_argument("--max-stale-rebuilds", type=int, default=0)
    build.add_argument("command", nargs=argparse.REMAINDER)
    artifacts = commands.add_parser("collect-artifacts")
    artifacts.add_argument("--repository", required=True, type=Path)
    artifacts.add_argument("--policy", type=Path)
    artifacts.add_argument("--apply", action="store_true")
    artifacts.add_argument("--release-root", type=Path, default=Path("/home/dev/production-releases"))
    collect = commands.add_parser("collect")
    collect.add_argument("--repository", required=True, type=Path)
    collect.add_argument("--policy", type=Path)
    collect.add_argument("--apply", action="store_true")
    collect.add_argument("--release-root", type=Path, default=Path("/home/dev/production-releases"))
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
        if args.action == "collect-artifacts":
            print(json.dumps(collect_prepared_artifacts(args.repository, args.policy, apply=args.apply, release_root=args.release_root), sort_keys=True))
            return 0
        if args.action == "collect":
            result = collect_build_sources(args.repository, args.policy, apply=args.apply, release_root=args.release_root)
            print(json.dumps(result, sort_keys=True))
            return 0
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
            return int(result["exit_code"])
        command = args.command[1:] if args.command and args.command[0] == "--" else args.command
        return run_with_lease(args.lease_file, args.lease_id, args.fencing_generation, command)
    except LifecycleError as exc:
        print(json.dumps({"status": str(exc)}, sort_keys=True), file=sys.stderr)
        return 20


if __name__ == "__main__":
    raise SystemExit(main())
