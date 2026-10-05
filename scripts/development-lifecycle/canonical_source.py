#!/usr/bin/env python3
"""Prepare and run work from an exact, policy-approved Git revision.

Repository policy is read from .development-repository.toml at the repository
root (or --policy). The developer checkout is never reset, cleaned, or switched.
"""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
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


def load_policy(repo: Path, policy_path: Path | None = None) -> dict[str, str]:
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
        }
    except (OSError, KeyError, TypeError, tomllib.TOMLDecodeError) as exc:
        raise LifecycleError(f"REPOSITORY_POLICY_INVALID: {path}: {exc}") from exc
    if not all(policy.values()):
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
    return policy


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


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

    root = Path(policy["source_root"]) / _hash(policy["repository_id"])[:20]
    workspace = root / f"{revision}-{purpose}"
    lease_dir = Path(policy["source_root"]) / ".development-leases" / _hash(policy["repository_id"])[:20]
    lease_dir.mkdir(parents=True, exist_ok=True)
    state_path = lease_dir / f"{revision}-{purpose}.json"
    active_path = lease_dir / f"{revision}-{purpose}.active"
    root.mkdir(parents=True, exist_ok=True)

    with state_path.with_suffix(".lock").open("a+") as state_lock:
        fcntl.flock(state_lock, fcntl.LOCK_EX)
        with active_path.open("a+") as active_lock:
            try:
                fcntl.flock(active_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as exc:
                raise LifecycleError("SOURCE_LEASE_ACTIVE") from exc

            if workspace.exists():
                head = git(workspace, "rev-parse", "HEAD")
                dirty = git(workspace, "status", "--porcelain=v1", "--untracked-files=all")
                if head != revision or dirty:
                    raise LifecycleError("ISOLATED_SOURCE_WORKSPACE_DIRTY_OR_MISMATCHED")
            else:
                git(repo, "worktree", "add", "--detach", str(workspace), revision)

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
                "source_verified": True,
                "created_at": time.time(),
                "expires_at": time.time() + lease_seconds,
            }
            _write_json_atomic(state_path, lease)
    lease["lease_file"] = str(state_path)
    return lease


def run_with_lease(lease_file: Path, lease_id: str, generation: int, command: Sequence[str]) -> int:
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
            return subprocess.run(list(command), cwd=workspace).returncode
        finally:
            stop.set()
            thread.join(timeout=1)
            with lease_lock_path.open("a+") as state_lock:
                fcntl.flock(state_lock, fcntl.LOCK_EX)
                current = json.loads(lease_file.read_text(encoding="utf-8"))
                if current.get("lease_id") == lease_id and current.get("fencing_generation") == generation:
                    current["expires_at"] = 0
                    _write_json_atomic(lease_file, current)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="action", required=True)
    policy_command = commands.add_parser("policy")
    policy_command.add_argument("--repository", required=True, type=Path)
    policy_command.add_argument("--policy", type=Path)
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
    args = parser.parse_args(argv)
    try:
        if args.action == "policy":
            repo = Path(git(args.repository, "rev-parse", "--show-toplevel")).resolve()
            print(json.dumps({"repository_root": str(repo), **load_policy(repo, args.policy)}, sort_keys=True))
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
        command = args.command[1:] if args.command and args.command[0] == "--" else args.command
        return run_with_lease(args.lease_file, args.lease_id, args.fencing_generation, command)
    except LifecycleError as exc:
        print(json.dumps({"status": str(exc)}, sort_keys=True), file=sys.stderr)
        return 20


if __name__ == "__main__":
    raise SystemExit(main())
