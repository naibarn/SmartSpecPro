#!/usr/bin/env python3
"""Shared local workspace authority, convergence, recovery, and retirement resolver.

The registry lives in Git's common directory so linked worktrees share one
transactional authority. Git/filesystem state is observation only; workspace
roles are assigned explicitly by repository policy or a register command.
"""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import json
import os
import shutil
import socket
import sqlite3
import subprocess
import sys
import time
import tomllib
import uuid
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Iterator


ROLES = {
    "CANONICAL_USER_WORKSPACE",
    "TASK_WORKTREE",
    "SESSION_WORKTREE",
    "INTEGRATION_WORKTREE",
    "RECOVERY_WORKSPACE",
    "EXTERNAL_WORKSPACE",
    "UNKNOWN_WORKSPACE",
}
RETIRABLE_ROLES = {"TASK_WORKTREE", "SESSION_WORKTREE", "INTEGRATION_WORKTREE"}


class WorkspaceAuthorityError(RuntimeError):
    pass


def _git(repo: Path, *args: str, check: bool = True, binary: bool = False) -> str | bytes:
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        text=not binary,
        capture_output=True,
    )
    if check and result.returncode:
        stderr = result.stderr.decode(errors="replace") if binary else result.stderr
        raise WorkspaceAuthorityError(f"GIT_COMMAND_FAILED: git {' '.join(args)}: {stderr.strip()}")
    return result.stdout


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def _sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _repo_root(repo: Path) -> Path:
    return Path(str(_git(repo, "rev-parse", "--show-toplevel")).strip()).resolve()


def _common_dir(repo: Path) -> Path:
    value = Path(str(_git(repo, "rev-parse", "--path-format=absolute", "--git-common-dir")).strip())
    return value.resolve()


def _git_dir(repo: Path) -> Path:
    value = Path(str(_git(repo, "rev-parse", "--path-format=absolute", "--git-dir")).strip())
    return value.resolve()


def _canonical_remote_url(repo: Path, remote: str) -> str | None:
    value = str(_git(repo, "remote", "get-url", remote, check=False) or "").strip()
    if not value:
        return None
    normalized = value.removesuffix(".git").rstrip("/")
    if normalized.startswith("git@") and ":" in normalized:
        host, path = normalized[4:].split(":", 1)
        normalized = f"ssh://{host.lower()}/{path.lower()}"
    elif "://" in normalized:
        scheme, rest = normalized.split("://", 1)
        host, separator, path = rest.partition("/")
        normalized = f"{scheme.lower()}://{host.lower()}{separator}{path.lower()}"
    return normalized


def _process_start(pid: int) -> str | None:
    try:
        raw = Path(f"/proc/{pid}/stat").read_text(encoding="ascii")
        fields = raw[raw.rfind(")") + 2 :].split()
        return fields[19] if len(fields) > 19 else None
    except (OSError, IndexError):
        return None


def _pid_alive(pid: int, expected_start: str | None) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        pass
    except OSError:
        return False
    actual_start = _process_start(pid)
    return expected_start is None or actual_start is None or actual_start == expected_start


def _safe_id(value: str, code: str) -> str:
    value = value.strip()
    if not value or len(value) > 240 or any(ord(char) < 32 for char in value):
        raise WorkspaceAuthorityError(code)
    return value


def load_workspace_policy(repo: Path, policy_path: Path | None = None) -> dict[str, Any]:
    root = _repo_root(repo)
    path = (policy_path or root / ".development-repository.toml").expanduser().resolve()
    try:
        source = tomllib.loads(path.read_text(encoding="utf-8"))["repository"]
        repository_id = _safe_id(str(source["repository_id"]), "REPOSITORY_ID_INVALID")
        policy: dict[str, Any] = {
            "project_id": _safe_id(str(source.get("project_id", repository_id)), "PROJECT_ID_INVALID"),
            "repository_id": repository_id,
            "remote": _safe_id(str(source["remote"]), "CANONICAL_REMOTE_INVALID"),
            "canonical_ref": _safe_id(str(source["canonical_ref"]), "CANONICAL_REF_INVALID"),
        }
        if "canonical_user_workspace" in source:
            policy["canonical_user_workspace"] = str(Path(str(source["canonical_user_workspace"])).expanduser().resolve())
        if "recovery_root" in source:
            policy["recovery_root"] = str(Path(str(source["recovery_root"])).expanduser().resolve())
    except (OSError, KeyError, TypeError, tomllib.TOMLDecodeError) as exc:
        raise WorkspaceAuthorityError(f"REPOSITORY_POLICY_INVALID: {path}: {exc}") from exc
    if not policy["canonical_ref"].startswith("refs/heads/"):
        raise WorkspaceAuthorityError("CANONICAL_REF_INVALID")
    if not root.exists():
        raise WorkspaceAuthorityError("REPOSITORY_ROOT_MISSING")
    return policy


def _registry_path(repo: Path) -> Path:
    return _common_dir(repo) / "workspace-authority.sqlite3"


@contextlib.contextmanager
def _db(repo: Path) -> Iterator[sqlite3.Connection]:
    path = _registry_path(repo)
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        pass
    else:
        os.close(descriptor)
    os.chmod(path, 0o600)
    connection = sqlite3.connect(path, timeout=20, isolation_level=None)
    try:
        os.chmod(path, 0o600)
        connection.execute("PRAGMA busy_timeout = 20000")
        connection.execute("PRAGMA journal_mode = DELETE")
        connection.execute("PRAGMA foreign_keys = ON")
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS projects (
              project_id TEXT NOT NULL,
              repository_id TEXT NOT NULL,
              canonical_remote TEXT NOT NULL,
              canonical_ref TEXT NOT NULL,
              canonical_sha TEXT,
              canonical_workspace_id TEXT,
              canonical_workspace_location TEXT,
              convergence_state TEXT NOT NULL DEFAULT 'UNKNOWN',
              updated_at TEXT NOT NULL,
              PRIMARY KEY (project_id, repository_id)
            );
            CREATE TABLE IF NOT EXISTS workspaces (
              workspace_id TEXT PRIMARY KEY,
              project_id TEXT NOT NULL,
              repository_id TEXT NOT NULL,
              common_dir TEXT NOT NULL,
              git_dir TEXT NOT NULL,
              location TEXT NOT NULL,
              generation INTEGER NOT NULL,
              role TEXT NOT NULL,
              head_sha TEXT,
              branch TEXT,
              upstream TEXT,
              dirty INTEGER NOT NULL DEFAULT 0,
              dirty_path_count INTEGER NOT NULL DEFAULT 0,
              owner_session_id TEXT,
              owner_pid INTEGER,
              owner_host TEXT,
              owner_process_start TEXT,
              owner_lease_expires_at REAL,
              owner_state TEXT NOT NULL DEFAULT 'NONE',
              task_id TEXT,
              created_by TEXT,
              created_at TEXT NOT NULL,
              last_verified_state TEXT,
              last_verified_at TEXT,
              convergence_state TEXT NOT NULL DEFAULT 'UNKNOWN',
              lifecycle_state TEXT NOT NULL DEFAULT 'ACTIVE',
              recovery_linkage TEXT,
              FOREIGN KEY(project_id, repository_id) REFERENCES projects(project_id, repository_id)
            );
            CREATE UNIQUE INDEX IF NOT EXISTS one_canonical_user_workspace
              ON workspaces(project_id, repository_id)
              WHERE role='CANONICAL_USER_WORKSPACE' AND lifecycle_state NOT IN ('RETIRED','MISSING');
            CREATE INDEX IF NOT EXISTS workspace_project_location
              ON workspaces(project_id, repository_id, location);
            CREATE TABLE IF NOT EXISTS receipts (
              receipt_id TEXT PRIMARY KEY,
              project_id TEXT NOT NULL,
              repository_id TEXT NOT NULL,
              workspace_id TEXT,
              kind TEXT NOT NULL,
              source_sha TEXT,
              target_sha TEXT,
              result_json TEXT NOT NULL,
              created_at TEXT NOT NULL
            );
            """
        )
        yield connection
    finally:
        connection.close()


def _ensure_project(db: sqlite3.Connection, policy: dict[str, Any]) -> None:
    db.execute(
        """INSERT INTO projects(project_id, repository_id, canonical_remote, canonical_ref, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(project_id, repository_id) DO UPDATE SET
             canonical_remote=excluded.canonical_remote,
             canonical_ref=excluded.canonical_ref,
             updated_at=excluded.updated_at""",
        (policy["project_id"], policy["repository_id"], policy["remote"], policy["canonical_ref"], _now()),
    )


def _identity_file(git_dir: Path) -> Path:
    return git_dir / "workspace-authority-id"


def _workspace_identity(repo: Path) -> tuple[str, int]:
    git_dir = _git_dir(repo)
    identity_path = _identity_file(git_dir)
    try:
        workspace_id = identity_path.read_text(encoding="ascii").strip()
    except OSError:
        workspace_id = ""
    if not workspace_id:
        workspace_id = f"workspace:{uuid.uuid4()}"
        temporary = identity_path.with_suffix(f".{uuid.uuid4().hex}.tmp")
        temporary.write_text(workspace_id + "\n", encoding="ascii")
        os.chmod(temporary, 0o600)
        try:
            os.link(temporary, identity_path)
        except FileExistsError:
            workspace_id = identity_path.read_text(encoding="ascii").strip()
        finally:
            temporary.unlink(missing_ok=True)
    return workspace_id, 1


def _git_facts(repo: Path) -> dict[str, Any]:
    root = _repo_root(repo)
    head = str(_git(root, "rev-parse", "HEAD")).strip()
    branch = str(_git(root, "symbolic-ref", "--quiet", "--short", "HEAD", check=False) or "").strip() or "DETACHED"
    upstream = str(_git(root, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}", check=False) or "").strip() or None
    status = str(_git(root, "status", "--porcelain=v1", "--untracked-files=all"))
    dirty_paths = status.splitlines()
    return {
        "root": root,
        "head_sha": head,
        "branch": branch,
        "upstream": upstream,
        "dirty": bool(status),
        "dirty_path_count": len(dirty_paths),
    }


def _owner_state(row: dict[str, Any]) -> str:
    session_id = row.get("owner_session_id")
    pid = row.get("owner_pid")
    expires = row.get("owner_lease_expires_at")
    if not session_id and not pid:
        return "NO_ACTIVE_SESSION"
    if expires is None or float(expires) <= time.time():
        return "STALE_CLOSED_SESSION"
    if row.get("owner_host") == socket.gethostname() and pid:
        return "ACTIVE_SESSION" if _pid_alive(int(pid), row.get("owner_process_start")) else "STALE_CLOSED_SESSION"
    if row.get("owner_host") and row.get("owner_host") != socket.gethostname():
        return "ACTIVE_SESSION"
    return "STALE_CLOSED_SESSION"


def _workspace_by_id(db: sqlite3.Connection, workspace_id: str) -> dict[str, Any] | None:
    cursor = db.execute("SELECT * FROM workspaces WHERE workspace_id=?", (workspace_id,))
    row = cursor.fetchone()
    if row is None:
        return None
    data = dict(zip([column[0] for column in cursor.description], row))
    data["dirty"] = bool(data["dirty"])
    data["session_state"] = _owner_state(data)
    return data


def _upsert_workspace(
    repo: Path,
    policy: dict[str, Any],
    workspace: Path,
    *,
    role: str | None = None,
    task_id: str | None = None,
    created_by: str | None = None,
    owner_session_id: str | None = None,
    owner_pid: int | None = None,
    owner_lease_seconds: int | None = None,
) -> dict[str, Any]:
    workspace = _repo_root(workspace)
    workspace_common_dir = _common_dir(workspace)
    if workspace_common_dir != _common_dir(repo):
        source_url = _canonical_remote_url(repo, policy["remote"])
        workspace_url = _canonical_remote_url(workspace, policy["remote"])
        if role != "EXTERNAL_WORKSPACE" or not source_url or workspace_url != source_url:
            raise WorkspaceAuthorityError("WORKSPACE_REPOSITORY_INSTANCE_MISMATCH")
    common_dir = _common_dir(repo)
    git_dir = _git_dir(workspace)
    workspace_id, _ = _workspace_identity(workspace)
    facts = _git_facts(workspace)
    with _db(repo) as db:
        db.execute("BEGIN IMMEDIATE")
        try:
            if not workspace.is_dir():
                raise WorkspaceAuthorityError("WORKSPACE_DISAPPEARED_DURING_REGISTRATION")
            if (
                _common_dir(workspace) != workspace_common_dir
                or _git_dir(workspace) != git_dir
                or _workspace_identity(workspace)[0] != workspace_id
                or _git_facts(workspace) != facts
            ):
                raise WorkspaceAuthorityError("WORKSPACE_CHANGED_DURING_REGISTRATION")
            _ensure_project(db, policy)
            old = _workspace_by_id(db, workspace_id)
            if role is None:
                role = old["role"] if old else "UNKNOWN_WORKSPACE"
                configured = policy.get("canonical_user_workspace")
                if not old and configured and str(workspace) == configured:
                    role = "CANONICAL_USER_WORKSPACE"
            if role not in ROLES:
                raise WorkspaceAuthorityError("WORKSPACE_ROLE_INVALID")
            if role == "CANONICAL_USER_WORKSPACE":
                project = db.execute(
                    "SELECT canonical_workspace_id FROM projects WHERE project_id=? AND repository_id=?",
                    (policy["project_id"], policy["repository_id"]),
                ).fetchone()
                existing_id = project[0] if project else None
                existing = _workspace_by_id(db, existing_id) if existing_id else None
                if existing_id and existing_id != workspace_id and existing and existing["lifecycle_state"] not in {"RETIRED", "MISSING"}:
                    raise WorkspaceAuthorityError("CANONICAL_WORKSPACE_ALREADY_REGISTERED")
            generation = old["generation"] if old else 1 + db.execute(
                "SELECT COUNT(*) FROM workspaces WHERE project_id=? AND repository_id=? AND location=?",
                (policy["project_id"], policy["repository_id"], str(workspace)),
            ).fetchone()[0]
            owner_start = _process_start(owner_pid) if owner_pid else None
            now = _now()
            expires = time.time() + owner_lease_seconds if owner_lease_seconds else None
            previous_owner = old or {}
            session = owner_session_id if owner_session_id is not None else previous_owner.get("owner_session_id")
            pid = owner_pid if owner_pid is not None else previous_owner.get("owner_pid")
            host = socket.gethostname() if owner_pid is not None else previous_owner.get("owner_host")
            process_start = owner_start if owner_pid is not None else previous_owner.get("owner_process_start")
            expiry = expires if owner_lease_seconds is not None else previous_owner.get("owner_lease_expires_at")
            owner_state = "LEASED" if session or pid else "NONE"
            db.execute(
                """INSERT INTO workspaces(
                   workspace_id,project_id,repository_id,common_dir,git_dir,location,generation,role,
                   head_sha,branch,upstream,dirty,dirty_path_count,owner_session_id,owner_pid,owner_host,
                   owner_process_start,owner_lease_expires_at,owner_state,task_id,created_by,created_at,
                   last_verified_state,last_verified_at,convergence_state,lifecycle_state,recovery_linkage
                   ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                   ON CONFLICT(workspace_id) DO UPDATE SET
                   location=excluded.location,role=excluded.role,head_sha=excluded.head_sha,
                   branch=excluded.branch,upstream=excluded.upstream,dirty=excluded.dirty,
                   dirty_path_count=excluded.dirty_path_count,owner_session_id=excluded.owner_session_id,
                   owner_pid=excluded.owner_pid,owner_host=excluded.owner_host,
                   owner_process_start=excluded.owner_process_start,
                   owner_lease_expires_at=excluded.owner_lease_expires_at,owner_state=excluded.owner_state,
                   task_id=COALESCE(excluded.task_id,workspaces.task_id),
                   created_by=COALESCE(excluded.created_by,workspaces.created_by),
                   last_verified_state=excluded.last_verified_state,last_verified_at=excluded.last_verified_at,
                   lifecycle_state=CASE
                     WHEN workspaces.lifecycle_state='RETIRED'
                       OR excluded.head_sha != workspaces.head_sha
                       OR excluded.dirty != workspaces.dirty
                       OR excluded.owner_session_id IS NOT workspaces.owner_session_id
                     THEN 'ACTIVE' ELSE workspaces.lifecycle_state END""",
                (
                    workspace_id, policy["project_id"], policy["repository_id"], str(workspace_common_dir), str(git_dir),
                    str(workspace), generation, role, facts["head_sha"], facts["branch"], facts["upstream"],
                    int(facts["dirty"]), facts["dirty_path_count"], session, pid, host, process_start,
                    expiry, owner_state, task_id, created_by or os.environ.get("USER"), now,
                    "OBSERVED", now, "UNKNOWN", "ACTIVE", old.get("recovery_linkage") if old else None,
                ),
            )
            if role == "CANONICAL_USER_WORKSPACE":
                db.execute(
                    """UPDATE projects SET canonical_workspace_id=?,canonical_workspace_location=?,
                       canonical_sha=?,convergence_state=?,updated_at=? WHERE project_id=? AND repository_id=?""",
                    (workspace_id, str(workspace), facts["head_sha"], "OBSERVED", now, policy["project_id"], policy["repository_id"]),
                )
            db.commit()
        except Exception:
            db.rollback()
            raise
        result = _workspace_by_id(db, workspace_id)
        assert result is not None
        return result


def _discover_worktrees(repo: Path) -> list[Path]:
    raw = str(_git(repo, "worktree", "list", "--porcelain"))
    result: list[Path] = []
    for block in raw.split("\n\n"):
        for line in block.splitlines():
            if line.startswith("worktree "):
                result.append(Path(line[len("worktree ") :]).resolve())
                break
    return result


def resolve_project_authority(repo: Path, policy_path: Path | None = None) -> dict[str, Any]:
    repo = _repo_root(repo)
    policy = load_workspace_policy(repo, policy_path)
    _upsert_workspace(repo, policy, repo)
    canonical_path = policy.get("canonical_user_workspace")
    if canonical_path and Path(canonical_path).exists():
        if _common_dir(Path(canonical_path)) == _common_dir(repo):
            _upsert_workspace(repo, policy, Path(canonical_path), role="CANONICAL_USER_WORKSPACE")
    for path in _discover_worktrees(repo):
        _upsert_workspace(repo, policy, path)
    with _db(repo) as db:
        _ensure_project(db, policy)
        project = db.execute(
            "SELECT * FROM projects WHERE project_id=? AND repository_id=?",
            (policy["project_id"], policy["repository_id"]),
        ).fetchone()
        if project is None:
            raise WorkspaceAuthorityError("PROJECT_AUTHORITY_NOT_REGISTERED")
        keys = [column[0] for column in db.execute("SELECT * FROM projects LIMIT 0").description]
        rows = db.execute(
            "SELECT * FROM workspaces WHERE project_id=? AND repository_id=? ORDER BY created_at,workspace_id",
            (policy["project_id"], policy["repository_id"]),
        ).fetchall()
        project_data = dict(zip(keys, project))
        workspaces = []
        for row in rows:
            item = dict(zip([column[0] for column in db.execute("SELECT * FROM workspaces LIMIT 0").description], row))
            item["dirty"] = bool(item["dirty"])
            item["session_state"] = _owner_state(item)
            workspaces.append(item)
    project_data["workspaces"] = workspaces
    project_data["workspace_count"] = len(workspaces)
    project_data["active_sessions"] = sum(row["session_state"] == "ACTIVE_SESSION" for row in workspaces)
    return project_data


def get_canonical_user_workspace(repo: Path, policy_path: Path | None = None) -> dict[str, Any]:
    repo = _repo_root(repo)
    policy = load_workspace_policy(repo, policy_path)
    configured = policy.get("canonical_user_workspace")
    if not configured:
        raise WorkspaceAuthorityError("CANONICAL_USER_WORKSPACE_NOT_CONFIGURED")
    canonical = Path(configured)
    if not canonical.exists():
        raise WorkspaceAuthorityError("CANONICAL_USER_WORKSPACE_MISSING")
    return _upsert_workspace(repo, policy, canonical, role="CANONICAL_USER_WORKSPACE")


def register_workspace(
    repo: Path,
    policy_path: Path | None,
    workspace: Path,
    *,
    role: str,
    task_id: str | None = None,
    created_by: str | None = None,
    owner_session_id: str | None = None,
    owner_pid: int | None = None,
    owner_lease_seconds: int | None = None,
) -> dict[str, Any]:
    repo = _repo_root(repo)
    policy = load_workspace_policy(repo, policy_path)
    return _upsert_workspace(
        repo, policy, workspace, role=role, task_id=task_id, created_by=created_by,
        owner_session_id=owner_session_id, owner_pid=owner_pid,
        owner_lease_seconds=owner_lease_seconds,
    )


def observe_workspace(repo: Path, policy_path: Path | None, workspace: Path) -> dict[str, Any]:
    repo = _repo_root(repo)
    policy = load_workspace_policy(repo, policy_path)
    return _upsert_workspace(repo, policy, workspace)


def resolve_workspace_role(repo: Path, policy_path: Path | None, workspace: Path) -> str:
    return str(observe_workspace(repo, policy_path, workspace)["role"])


def _remote_tracking_ref(policy: dict[str, Any]) -> str:
    branch = str(policy["canonical_ref"]).removeprefix("refs/heads/")
    return f"refs/remotes/{policy['remote']}/{branch}"


def _fetch_canonical(repo: Path, policy: dict[str, Any]) -> str:
    tracking = _remote_tracking_ref(policy)
    _git(repo, "fetch", "--no-tags", policy["remote"], f"+{policy['canonical_ref']}:{tracking}")
    tip = str(_git(repo, "rev-parse", f"{tracking}^{{commit}}")).strip()
    if len(tip) not in {40, 64}:
        raise WorkspaceAuthorityError("CANONICAL_SHA_INVALID")
    return tip


def _is_ancestor(repo: Path, left: str, right: str) -> bool:
    return subprocess.run(
        ["git", "-C", str(repo), "merge-base", "--is-ancestor", left, right], capture_output=True
    ).returncode == 0


def detect_workspace_divergence(
    repo: Path, policy_path: Path | None, workspace: Path | None = None
) -> dict[str, Any]:
    repo = _repo_root(repo)
    policy = load_workspace_policy(repo, policy_path)
    target = _fetch_canonical(repo, policy)
    canonical = Path(str(workspace or policy.get("canonical_user_workspace") or repo)).resolve()
    registered = observe_workspace(repo, policy_path, canonical)
    facts = _git_facts(canonical)
    if facts["dirty"]:
        relation = "DIRTY"
    elif facts["head_sha"] == target:
        relation = "SYNCED"
    elif _is_ancestor(canonical, facts["head_sha"], target):
        relation = "BEHIND_CANONICAL"
    elif _is_ancestor(canonical, target, facts["head_sha"]):
        relation = "AHEAD_OF_CANONICAL"
    else:
        relation = "DIVERGED_FROM_CANONICAL"
    return {
        "project_id": policy["project_id"], "repository_id": policy["repository_id"],
        "canonical_ref": policy["canonical_ref"], "canonical_sha": target,
        "workspace_id": registered["workspace_id"], "workspace_role": registered["role"],
        "workspace_location": str(canonical), "workspace_sha": facts["head_sha"],
        "workspace_branch": facts["branch"], "dirty": facts["dirty"],
        "dirty_path_count": facts["dirty_path_count"], "divergence": relation,
        "session_state": registered["session_state"],
    }


def _write_bytes(path: Path, content: bytes) -> dict[str, Any]:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    os.chmod(path, 0o600)
    return {"path": str(path), "bytes": len(content), "sha256": _sha256(content)}


def _safe_recovery_root(repo: Path, policy: dict[str, Any]) -> Path:
    configured = policy.get("recovery_root")
    root = Path(configured).resolve() if configured else _common_dir(repo) / "workspace-recovery"
    common_dir = _common_dir(repo)
    if root == repo or root in repo.parents or (repo in root.parents and common_dir not in root.parents):
        raise WorkspaceAuthorityError("RECOVERY_ROOT_UNSAFE")
    existed = root.exists()
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    if not existed:
        os.chmod(root, 0o700)
    elif root.stat().st_mode & 0o077:
        raise WorkspaceAuthorityError("RECOVERY_ROOT_PERMISSIONS_UNSAFE")
    return root


def preserve_dirty_workspace(
    repo: Path,
    policy_path: Path | None,
    workspace: Path | None = None,
) -> dict[str, Any]:
    repo = _repo_root(repo)
    policy = load_workspace_policy(repo, policy_path)
    target = Path(str(workspace or repo)).resolve()
    facts = _git_facts(target)
    if not facts["dirty"]:
        raise WorkspaceAuthorityError("WORKSPACE_NOT_DIRTY")
    registered = observe_workspace(repo, policy_path, target)
    root = _safe_recovery_root(repo, policy)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    recovery = root / policy["project_id"] / registered["workspace_id"].replace(":", "-") / stamp
    recovery.mkdir(parents=True, mode=0o700)
    os.chmod(recovery, 0o700)
    staged = bytes(_git(target, "diff", "--cached", "--binary", "HEAD", binary=True))
    unstaged = bytes(_git(target, "diff", "--binary", binary=True))
    staged_record = _write_bytes(recovery / "staged.patch", staged)
    unstaged_record = _write_bytes(recovery / "unstaged.patch", unstaged)
    status = bytes(_git(target, "status", "--porcelain=v1", "-z", "--untracked-files=all", binary=True))
    status_record = _write_bytes(recovery / "status.porcelain.z", status)
    untracked_raw = bytes(_git(target, "ls-files", "--others", "--exclude-standard", "-z", binary=True))
    copied = []
    for raw_path in untracked_raw.split(b"\0"):
        if not raw_path:
            continue
        relative = os.fsdecode(raw_path)
        posix = PurePosixPath(relative)
        if posix.is_absolute() or ".." in posix.parts:
            raise WorkspaceAuthorityError("UNTRACKED_PATH_UNSAFE")
        source = target / relative
        dest = recovery / "untracked" / Path(*posix.parts)
        if source.is_symlink():
            link = os.readlink(source)
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.symlink_to(link)
            copied.append({"path": relative, "kind": "symlink", "target": link, "sha256": _sha256(os.fsencode(link))})
        elif source.is_file():
            record = _write_bytes(dest, source.read_bytes())
            record["path"] = relative
            record["kind"] = "file"
            copied.append(record)
        else:
            raise WorkspaceAuthorityError("UNTRACKED_PATH_TYPE_UNSUPPORTED")
    manifest = {
        "schema_version": 1,
        "project_id": policy["project_id"],
        "repository_id": policy["repository_id"],
        "workspace_id": registered["workspace_id"],
        "workspace_location": str(target),
        "workspace_role": registered["role"],
        "head_sha": facts["head_sha"],
        "branch": facts["branch"],
        "dirty_path_count": facts["dirty_path_count"],
        "captured_at": _now(),
        "staged_patch": staged_record,
        "unstaged_patch": unstaged_record,
        "status": status_record,
        "untracked": copied,
        "disposition": "PRESERVED_UNCLASSIFIED",
        "recovery_path": str(recovery),
    }
    manifest_path = recovery / "manifest.json"
    manifest_bytes = (json.dumps(manifest, sort_keys=True, indent=2) + "\n").encode()
    manifest_record = _write_bytes(manifest_path, manifest_bytes)
    manifest["manifest_sha256"] = manifest_record["sha256"]
    with _db(repo) as db:
        db.execute("BEGIN IMMEDIATE")
        try:
            db.execute("UPDATE workspaces SET recovery_linkage=?,convergence_state='RECOVERY_PENDING',last_verified_at=? WHERE workspace_id=?", (str(manifest_path), _now(), registered["workspace_id"]))
            db.execute("UPDATE projects SET convergence_state='RECOVERY_PENDING',updated_at=? WHERE project_id=? AND repository_id=?", (_now(), policy["project_id"], policy["repository_id"]))
            db.commit()
        except Exception:
            db.rollback()
            raise
    return {"status": "DIRTY_WORK_PRESERVED", "workspace_id": registered["workspace_id"], "recovery_path": str(recovery), "manifest": str(manifest_path), "manifest_sha256": manifest_record["sha256"], "dirty_path_count": facts["dirty_path_count"]}


def _local_commit_classification(repo: Path, head: str, target: str) -> dict[str, Any]:
    if _is_ancestor(repo, head, target):
        return {"state": "ALREADY_IN_CANONICAL", "unique_commits": []}
    result = subprocess.run(
        ["git", "-C", str(repo), "cherry", target, head], text=True, capture_output=True
    )
    if result.returncode:
        raise WorkspaceAuthorityError("COMMIT_EQUIVALENCE_CLASSIFICATION_FAILED")
    output = result.stdout
    rows = [line for line in output.splitlines() if line.startswith(("+", "-"))]
    unique = [line[2:] for line in rows if line.startswith("+")]
    equivalent = [line[2:] for line in rows if line.startswith("-")]
    return {
        "state": "UNIQUE_LOCAL_COMMITS" if unique else "PATCH_EQUIVALENT",
        "unique_commits": unique,
        "patch_equivalent_commits": equivalent,
    }


def _patch_id(repo: Path, base: str, head: str) -> str | None:
    diff = subprocess.run(
        ["git", "-C", str(repo), "diff", "--no-ext-diff", "--binary", base, head],
        capture_output=True,
    )
    if diff.returncode:
        raise WorkspaceAuthorityError("STASH_PATCH_READ_FAILED")
    identified = subprocess.run(
        ["git", "patch-id", "--stable"], input=diff.stdout, capture_output=True
    )
    if identified.returncode:
        raise WorkspaceAuthorityError("STASH_PATCH_CLASSIFICATION_FAILED")
    fields = identified.stdout.decode("ascii", errors="replace").split()
    return fields[0] if fields else None


def _classify_stashes(repo: Path, target: str) -> list[dict[str, str]]:
    stash_output = str(_git(repo, "stash", "list", "--format=%H") or "").strip()
    stash_commits = [line.strip() for line in stash_output.splitlines() if line.strip()]
    if not stash_commits:
        return []
    history_count = int(str(_git(repo, "rev-list", "--no-merges", "--count", target)).strip())
    history = subprocess.run(
        ["git", "-C", str(repo), "log", "--no-merges", "--max-count=5000", "-p", target],
        capture_output=True,
    )
    if history.returncode:
        raise WorkspaceAuthorityError("STASH_CANONICAL_HISTORY_READ_FAILED")
    identified = subprocess.run(
        ["git", "patch-id", "--stable"], input=history.stdout, capture_output=True
    )
    if identified.returncode:
        raise WorkspaceAuthorityError("STASH_PATCH_CLASSIFICATION_FAILED")
    canonical_patch_ids = {
        line.split()[0]
        for line in identified.stdout.decode("ascii", errors="replace").splitlines()
        if line.split()
    }
    history_truncated = history_count > 5000

    classifications: list[dict[str, str]] = []
    for stash_commit in stash_commits:
        parents = str(_git(repo, "show", "-s", "--format=%P", stash_commit)).split()
        if not parents:
            classifications.append({"stash_commit": stash_commit, "state": "UNCLASSIFIED_INVALID_STASH"})
            continue
        parent = parents[0]
        patch_id = _patch_id(repo, parent, stash_commit)
        if not patch_id:
            state = "UNCLASSIFIED_EMPTY_PATCH"
        elif patch_id in canonical_patch_ids:
            state = "PATCH_EQUIVALENT_IN_CANONICAL"
        elif history_truncated:
            state = "UNCLASSIFIED_HISTORY_BOUND"
        else:
            state = "UNIQUE_OR_UNPROVEN_STASH"
        classifications.append({"stash_commit": stash_commit, "state": state})
    return classifications


def _preserve_local_commits(repo: Path, policy: dict[str, Any], workspace: dict[str, Any], target: str) -> str | None:
    commits = _local_commit_classification(repo, workspace["head_sha"], target)
    if not commits["unique_commits"]:
        return None
    root = _safe_recovery_root(repo, policy)
    destination = root / policy["project_id"] / workspace["workspace_id"].replace(":", "-") / f"commits-{workspace['head_sha'][:12]}.bundle"
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if not destination.exists():
        recovery_ref = f"refs/workspace-authority/recovery/{uuid.uuid4()}"
        _git(repo, "update-ref", recovery_ref, workspace["head_sha"])
        try:
            _git(repo, "bundle", "create", str(destination), recovery_ref, f"^{target}")
        finally:
            _git(repo, "update-ref", "-d", recovery_ref)
        os.chmod(destination, 0o600)
        _git(repo, "bundle", "verify", str(destination))
    return str(destination)


def _branch_in_other_worktree(repo: Path, branch: str, selected: Path) -> str | None:
    raw = str(_git(repo, "worktree", "list", "--porcelain"))
    path = None
    current_branch = None
    for line in raw.splitlines() + [""]:
        if line.startswith("worktree "):
            path = Path(line[9:]).resolve()
            current_branch = None
        elif line.startswith("branch "):
            current_branch = line[7:].removeprefix("refs/heads/")
        elif not line and path is not None:
            if current_branch == branch and path != selected:
                return str(path)
            path = None
            current_branch = None
    return None


def converge_canonical_workspace(
    repo: Path,
    policy_path: Path | None = None,
    *,
    integrated_sha: str | None = None,
    task_id: str | None = None,
    max_ref_refreshes: int = 3,
) -> dict[str, Any]:
    repo = _repo_root(repo)
    policy = load_workspace_policy(repo, policy_path)
    canonical = get_canonical_user_workspace(repo, policy_path)
    target_root = Path(canonical["location"]).resolve()
    initial = detect_workspace_divergence(repo, policy_path, target_root)
    if initial["dirty"]:
        return {"status": "DIRTY_WORK_PRESERVED", "divergence": initial, "recovery_receipt": preserve_dirty_workspace(repo, policy_path, target_root)}
    requested_sha = None
    if integrated_sha:
        requested_sha = str(_git(repo, "rev-parse", f"{integrated_sha}^{{commit}}", check=False) or "").strip()
        if not requested_sha:
            raise WorkspaceAuthorityError("INTEGRATION_SHA_NOT_FOUND")
    branch = str(policy["canonical_ref"]).removeprefix("refs/heads/")
    last_tip = ""
    for _ in range(max_ref_refreshes):
        tip = _fetch_canonical(target_root, policy)
        last_tip = tip
        if requested_sha and not _is_ancestor(target_root, requested_sha, tip):
            return {"status": "INTEGRATION_SHA_NOT_CANONICAL", "integrated_sha": requested_sha, "canonical_sha": tip}
        facts = _git_facts(target_root)
        if facts["dirty"]:
            return {"status": "DIRTY_WORK_PRESERVED", "divergence": initial, "recovery_receipt": preserve_dirty_workspace(repo, policy_path, target_root)}
        classification = _local_commit_classification(target_root, facts["head_sha"], tip)
        if classification["unique_commits"]:
            bundle = _preserve_local_commits(target_root, policy, {**canonical, **facts}, tip)
            return {"status": "BLOCKED_UNPUSHED_INTENDED_WORK", "workspace_sha": facts["head_sha"], "canonical_sha": tip, "commit_classification": classification, "recovery_bundle": bundle}
        if facts["branch"] != branch:
            other = _branch_in_other_worktree(target_root, branch, target_root)
            if not other and classification["state"] not in {"ALREADY_IN_CANONICAL", "PATCH_EQUIVALENT"}:
                return {"status": "BLOCKED_BRANCH_RECONCILIATION", "workspace_sha": facts["head_sha"], "canonical_sha": tip}
            # The registered user workspace may be on a stale branch while the
            # canonical branch is open in another checkout. Keep its branch
            # identity and let the guarded fast-forward below converge this path.
            if not other:
                switch = subprocess.run(["git", "-C", str(target_root), "switch", branch], text=True, capture_output=True)
                if switch.returncode:
                    tracking = _remote_tracking_ref(policy)
                    if _git(target_root, "show-ref", "--verify", f"refs/heads/{branch}", check=False):
                        return {"status": "BLOCKED_BRANCH_RECONCILIATION", "reason": switch.stderr.strip()[:500], "canonical_sha": tip}
                    _git(target_root, "switch", "--track", "-c", branch, tracking)
                facts = _git_facts(target_root)
        if facts["head_sha"] != tip:
            if not _is_ancestor(target_root, facts["head_sha"], tip):
                return {"status": "BLOCKED_DIVERGED", "workspace_sha": facts["head_sha"], "canonical_sha": tip, "commit_classification": classification}
            _git(target_root, "merge", "--ff-only", tip)
        latest = _fetch_canonical(target_root, policy)
        actual = str(_git(target_root, "rev-parse", "HEAD")).strip()
        if latest != tip:
            continue
        clean = not bool(str(_git(target_root, "status", "--porcelain=v1", "--untracked-files=all")))
        if actual != tip or not clean:
            return {"status": "CANONICAL_VERIFICATION_FAILED", "workspace_sha": actual, "canonical_sha": latest, "dirty": not clean}
        registered = _upsert_workspace(repo, policy, target_root, role="CANONICAL_USER_WORKSPACE")
        receipt = {
            "schema_version": 1,
            "receipt_id": f"workspace-convergence:{uuid.uuid4()}",
            "project_id": policy["project_id"],
            "repository_id": policy["repository_id"],
            "task_id": task_id,
            "session_id": os.environ.get("CODEX_SESSION_ID") or os.environ.get("CLAUDE_SESSION_ID"),
            "workspace_id": registered["workspace_id"],
            "workspace_role": "CANONICAL_USER_WORKSPACE",
            "workspace_location": str(target_root),
            "canonical_ref": policy["canonical_ref"],
            "integrated_sha": requested_sha or tip,
            "canonical_sha": tip,
            "canonical_user_workspace_sha": actual,
            "dirty": False,
            "result": "USER_WORKSPACE_CONVERGED",
            "verified_at": _now(),
            "actor": os.environ.get("CODEX_SESSION_ID") or os.environ.get("CLAUDE_SESSION_ID") or f"pid:{os.getpid()}",
        }
        with _db(repo) as db:
            db.execute("BEGIN IMMEDIATE")
            try:
                db.execute("UPDATE workspaces SET last_verified_state='CANONICAL_VERIFIED',last_verified_at=?,convergence_state='USER_WORKSPACE_CONVERGED' WHERE workspace_id=?", (receipt["verified_at"], registered["workspace_id"]))
                db.execute("UPDATE projects SET canonical_sha=?,convergence_state='USER_WORKSPACE_CONVERGED',updated_at=? WHERE project_id=? AND repository_id=?", (tip, receipt["verified_at"], policy["project_id"], policy["repository_id"]))
                db.execute("INSERT INTO receipts(receipt_id,project_id,repository_id,workspace_id,kind,source_sha,target_sha,result_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)", (receipt["receipt_id"], policy["project_id"], policy["repository_id"], registered["workspace_id"], "CANONICAL_CONVERGENCE", receipt["integrated_sha"], tip, json.dumps(receipt, sort_keys=True), receipt["verified_at"]))
                db.commit()
            except Exception:
                db.rollback()
                raise
        receipt_root = _safe_recovery_root(repo, policy) / policy["project_id"] / "receipts"
        receipt_root.mkdir(parents=True, exist_ok=True, mode=0o700)
        receipt_path = receipt_root / f"{receipt['receipt_id'].split(':', 1)[-1]}.json"
        _write_bytes(receipt_path, (json.dumps(receipt, sort_keys=True, indent=2) + "\n").encode())
        receipt["receipt_path"] = str(receipt_path)
        return {"status": "USER_WORKSPACE_CONVERGED", "receipt": receipt}
    return {"status": "CANONICAL_ADVANCED_DURING_CONVERGENCE", "last_checked_sha": last_tip, "refresh_limit": max_ref_refreshes}


def verify_canonical_convergence(
    repo: Path,
    policy_path: Path | None = None,
    *,
    integrated_sha: str | None = None,
    task_workspace_id: str | None = None,
) -> dict[str, Any]:
    divergence = detect_workspace_divergence(repo, policy_path)
    reasons = []
    if divergence["workspace_role"] != "CANONICAL_USER_WORKSPACE":
        reasons.append("CANONICAL_WORKSPACE_ROLE_INVALID")
    if divergence["divergence"] != "SYNCED":
        reasons.append("USER_WORKSPACE_NOT_SYNCED")
    if divergence["dirty"]:
        reasons.append("USER_WORKSPACE_DIRTY")
    if integrated_sha and not _is_ancestor(Path(divergence["workspace_location"]), integrated_sha, divergence["canonical_sha"]):
        reasons.append("INTEGRATED_SHA_NOT_CANONICAL")
    retirement = None
    if task_workspace_id:
        with _db(_repo_root(repo)) as db:
            task = _workspace_by_id(db, task_workspace_id)
        if not task or task["lifecycle_state"] != "RETIRED":
            reasons.append("TASK_WORKTREE_NOT_RETIRED")
            retirement = task["lifecycle_state"] if task else "UNKNOWN"
        elif task["session_state"] == "ACTIVE_SESSION":
            reasons.append("TASK_SESSION_STILL_ACTIVE")
    return {
        "status": "CANONICAL_CONVERGENCE_VERIFIED" if not reasons else "CONVERGENCE_PENDING",
        "project_id": divergence["project_id"], "repository_id": divergence["repository_id"],
        "integrated_sha": integrated_sha, "canonical_sha": divergence["canonical_sha"],
        "canonical_user_workspace_id": divergence["workspace_id"],
        "canonical_user_workspace_sha": divergence["workspace_sha"],
        "canonical_user_workspace_dirty": divergence["dirty"],
        "task_workspace_id": task_workspace_id, "task_workspace_lifecycle": retirement,
        "reasons": reasons, "verified_at": _now(),
    }


def clear_workspace_owner(repo: Path, policy_path: Path | None, workspace_id: str) -> dict[str, Any]:
    repo = _repo_root(repo)
    policy = load_workspace_policy(repo, policy_path)
    with _db(repo) as db:
        db.execute("BEGIN IMMEDIATE")
        try:
            db.execute("UPDATE workspaces SET owner_session_id=NULL,owner_pid=NULL,owner_host=NULL,owner_process_start=NULL,owner_lease_expires_at=NULL,owner_state='NONE' WHERE workspace_id=? AND project_id=? AND repository_id=?", (workspace_id, policy["project_id"], policy["repository_id"]))
            db.commit()
            result = _workspace_by_id(db, workspace_id)
        except Exception:
            db.rollback()
            raise
    if not result:
        raise WorkspaceAuthorityError("WORKSPACE_NOT_REGISTERED")
    return result


def retire_completed_worktree(
    repo: Path,
    policy_path: Path | None,
    workspace_id: str,
    *,
    apply: bool = False,
) -> dict[str, Any]:
    repo = _repo_root(repo)
    policy = load_workspace_policy(repo, policy_path)
    with _db(repo) as db:
        workspace = _workspace_by_id(db, workspace_id)
    if not workspace:
        raise WorkspaceAuthorityError("WORKSPACE_NOT_REGISTERED")
    if workspace["role"] not in RETIRABLE_ROLES:
        return {"status": "RETIREMENT_BLOCKED_ROLE", "role": workspace["role"], "workspace_id": workspace_id}
    if workspace["session_state"] == "ACTIVE_SESSION":
        return {"status": "RETIREMENT_BLOCKED_LIVE_OWNER", "workspace_id": workspace_id}
    path = Path(workspace["location"])
    if not path.exists():
        return {
            "status": "RETIREMENT_BLOCKED_MISSING_WITHOUT_RECOVERY_PROOF",
            "workspace_id": workspace_id,
            "recovery_linkage": workspace.get("recovery_linkage"),
        }
    facts = _git_facts(path)
    if facts["dirty"]:
        preserved = preserve_dirty_workspace(repo, policy_path, path)
        return {"status": "RETIREMENT_BLOCKED_DIRTY", "workspace_id": workspace_id, "recovery_receipt": preserved}
    ignored = bytes(_git(path, "ls-files", "--others", "--ignored", "--exclude-standard", "-z", binary=True))
    if ignored:
        return {"status": "RETIREMENT_BLOCKED_IGNORED_CONTENT", "workspace_id": workspace_id, "ignored_path_count": len([item for item in ignored.split(b"\0") if item])}
    canonical_sha = _fetch_canonical(path, policy)
    stash_classification = _classify_stashes(path, canonical_sha)
    if stash_classification:
        return {
            "status": "RETIREMENT_BLOCKED_STASH_PRESENT",
            "workspace_id": workspace_id,
            "stash_classification": stash_classification,
        }
    classification = _local_commit_classification(path, facts["head_sha"], canonical_sha)
    if classification["unique_commits"]:
        bundle = _preserve_local_commits(path, policy, {**workspace, **facts}, canonical_sha)
        return {"status": "RETIREMENT_BLOCKED_UNPUSHED_INTENDED_WORK", "workspace_id": workspace_id, "commit_classification": classification, "recovery_bundle": bundle}
    candidate = {"workspace_id": workspace_id, "workspace": str(path), "role": workspace["role"], "head_sha": facts["head_sha"], "canonical_sha": canonical_sha, "commit_classification": classification, "active_owner": False, "dirty": False, "ignored_path_count": 0, "recovery_linkage": workspace.get("recovery_linkage"), "status": "RETIREMENT_DRY_RUN"}
    if not apply:
        with _db(repo) as db:
            db.execute(
                "UPDATE workspaces SET lifecycle_state='RETIREABLE',last_verified_state='RETIREMENT_DRY_RUN',last_verified_at=? WHERE workspace_id=?",
                (_now(), workspace_id),
            )
        return candidate
    if workspace["lifecycle_state"] != "RETIREABLE":
        return {"status": "RETIREMENT_DRY_RUN_REQUIRED", "workspace_id": workspace_id}
    with _db(repo) as db:
        db.execute("BEGIN IMMEDIATE")
        try:
            latest = _workspace_by_id(db, workspace_id)
            if not latest or latest["lifecycle_state"] != "RETIREABLE":
                db.rollback()
                return {"status": "RETIREMENT_STATE_CHANGED_RETRY_DRY_RUN", "workspace_id": workspace_id}
            if latest["session_state"] == "ACTIVE_SESSION":
                db.rollback()
                return {"status": "RETIREMENT_BLOCKED_LIVE_OWNER", "workspace_id": workspace_id}
            if latest["generation"] != workspace["generation"] or latest["role"] != workspace["role"]:
                db.rollback()
                return {"status": "RETIREMENT_STATE_CHANGED_RETRY_DRY_RUN", "workspace_id": workspace_id}
            path = Path(latest["location"])
            if not path.is_dir():
                db.rollback()
                return {"status": "RETIREMENT_BLOCKED_MISSING_WITHOUT_RECOVERY_PROOF", "workspace_id": workspace_id, "recovery_linkage": latest.get("recovery_linkage")}
            final_facts = _git_facts(path)
            if final_facts != facts:
                db.rollback()
                if final_facts["dirty"]:
                    preserved = preserve_dirty_workspace(repo, policy_path, path)
                    return {"status": "RETIREMENT_BLOCKED_DIRTY", "workspace_id": workspace_id, "recovery_receipt": preserved}
                return {"status": "RETIREMENT_STATE_CHANGED_RETRY_DRY_RUN", "workspace_id": workspace_id}
            ignored = bytes(_git(path, "ls-files", "--others", "--ignored", "--exclude-standard", "-z", binary=True))
            if ignored:
                db.rollback()
                return {"status": "RETIREMENT_BLOCKED_IGNORED_CONTENT", "workspace_id": workspace_id, "ignored_path_count": len([item for item in ignored.split(b"\0") if item])}
            stash_classification = _classify_stashes(path, canonical_sha)
            if stash_classification:
                db.rollback()
                return {"status": "RETIREMENT_BLOCKED_STASH_PRESENT", "workspace_id": workspace_id, "stash_classification": stash_classification}
            final_classification = _local_commit_classification(path, final_facts["head_sha"], canonical_sha)
            if final_classification["unique_commits"]:
                bundle = _preserve_local_commits(path, policy, {**latest, **final_facts}, canonical_sha)
                db.rollback()
                return {"status": "RETIREMENT_BLOCKED_UNPUSHED_INTENDED_WORK", "workspace_id": workspace_id, "commit_classification": final_classification, "recovery_bundle": bundle}

            retired_at = _now()
            receipt = {
                "schema_version": 1,
                "receipt_id": f"worktree-retirement:{uuid.uuid4()}",
                "project_id": policy["project_id"],
                "repository_id": policy["repository_id"],
                "workspace_id": workspace_id,
                "previous_path": str(path),
                "workspace_role": latest["role"],
                "task_id": latest.get("task_id"),
                "workspace_sha": final_facts["head_sha"],
                "canonical_sha": canonical_sha,
                "integration_verified": not bool(final_classification["unique_commits"]),
                "recovery_linkage": latest.get("recovery_linkage"),
                "owner_state": latest["session_state"],
                "result": "WORKTREE_RETIRED",
                "actor": os.environ.get("CODEX_SESSION_ID") or os.environ.get("CLAUDE_SESSION_ID") or f"pid:{os.getpid()}",
                "retired_at": retired_at,
            }
            _git(repo, "worktree", "remove", str(path))
            db.execute("UPDATE workspaces SET lifecycle_state='RETIRED',last_verified_state='WORKTREE_RETIRED',last_verified_at=?,convergence_state='RETIRED',owner_session_id=NULL,owner_pid=NULL,owner_host=NULL,owner_process_start=NULL,owner_lease_expires_at=NULL,owner_state='NONE' WHERE workspace_id=?", (retired_at, workspace_id))
            db.execute("INSERT INTO receipts(receipt_id,project_id,repository_id,workspace_id,kind,source_sha,target_sha,result_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)", (receipt["receipt_id"], policy["project_id"], policy["repository_id"], workspace_id, "WORKTREE_RETIREMENT", final_facts["head_sha"], canonical_sha, json.dumps(receipt, sort_keys=True), retired_at))
            db.commit()
        except Exception:
            db.rollback()
            raise
    candidate["status"] = "WORKTREE_RETIRED"
    candidate["retired_at"] = retired_at
    candidate["receipt"] = receipt
    return candidate


def collect_worktrees(
    repo: Path,
    policy_path: Path | None = None,
    *,
    mode: str = "AUDIT_ONLY",
) -> dict[str, Any]:
    """Conservatively audit registered temporary worktrees; retirement is opt-in."""
    if mode not in {"AUDIT_ONLY", "RETIRE_SAFE", "REPORT_ONLY"}:
        raise WorkspaceAuthorityError("WORKTREE_COLLECTOR_MODE_INVALID")
    repo = _repo_root(repo)
    policy = load_workspace_policy(repo, policy_path)
    with _db(repo) as db:
        rows = db.execute(
            "SELECT workspace_id FROM workspaces WHERE project_id=? AND repository_id=? ORDER BY workspace_id",
            (policy["project_id"], policy["repository_id"]),
        ).fetchall()
        workspaces = [_workspace_by_id(db, row[0]) for row in rows]
    results: list[dict[str, Any]] = []
    for workspace in workspaces:
        if not workspace:
            continue
        wid = workspace["workspace_id"]
        if workspace["lifecycle_state"] == "RETIRED":
            results.append({"workspace_id": wid, "classification": "RETIRED"})
            continue
        if workspace["role"] == "UNKNOWN_WORKSPACE" or workspace["role"] == "EXTERNAL_WORKSPACE":
            results.append({"workspace_id": wid, "classification": "UNKNOWN_OWNER", "path": workspace["location"]})
            continue
        if workspace["role"] == "RECOVERY_WORKSPACE":
            results.append({"workspace_id": wid, "classification": "RECOVERY_REQUIRED", "path": workspace["location"]})
            continue
        if workspace["role"] not in RETIRABLE_ROLES:
            results.append({"workspace_id": wid, "classification": "ACTIVE", "role": workspace["role"]})
            continue
        if workspace["lifecycle_state"] == "INTEGRATING":
            results.append({"workspace_id": wid, "classification": "INTEGRATING"})
            continue
        if workspace["session_state"] == "ACTIVE_SESSION":
            results.append({"workspace_id": wid, "classification": "ACTIVE", "reason": "LIVE_OWNER_OR_LEASE"})
            continue
        if mode == "REPORT_ONLY":
            results.append({"workspace_id": wid, "classification": "BLOCKED", "reason": "NOT_AUDITED"})
            continue
        preview = retire_completed_worktree(repo, policy_path, wid)
        if preview.get("status") == "RETIREMENT_DRY_RUN":
            if mode == "RETIRE_SAFE":
                final = retire_completed_worktree(repo, policy_path, wid, apply=True)
                results.append({"workspace_id": wid, "classification": "RETIRED" if final.get("status") == "WORKTREE_RETIRED" else "BLOCKED", "result": final})
            else:
                results.append({"workspace_id": wid, "classification": "RETIREABLE", "result": preview})
        else:
            results.append({"workspace_id": wid, "classification": "BLOCKED", "result": preview})
    return {"status": "WORKTREE_AUDIT_COMPLETE", "mode": mode, "audited_at": _now(), "workspaces": results}


def _cli() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("resolve", "inspect", "register", "converge", "verify", "preserve", "retire", "collect"))
    parser.add_argument("--repository", type=Path, default=Path.cwd())
    parser.add_argument("--policy", type=Path)
    parser.add_argument("--workspace", type=Path)
    parser.add_argument("--role", choices=sorted(ROLES))
    parser.add_argument("--task-id")
    parser.add_argument("--session-id")
    parser.add_argument("--owner-pid", type=int)
    parser.add_argument("--owner-lease-seconds", type=int, default=300)
    parser.add_argument("--integrated-sha")
    parser.add_argument("--workspace-id")
    parser.add_argument("--apply", action="store_true", help="apply a retirement; default is dry-run")
    parser.add_argument("--mode", choices=("AUDIT_ONLY", "RETIRE_SAFE", "REPORT_ONLY"), default="AUDIT_ONLY")
    args = parser.parse_args()
    repo = _repo_root(args.repository)
    try:
        if args.action in {"resolve", "inspect"}:
            result = resolve_project_authority(repo, args.policy)
            result["status"] = "AUTHORITY_RESOLVED"
        elif args.action == "register":
            if not args.workspace or not args.role:
                raise WorkspaceAuthorityError("REGISTER_WORKSPACE_AND_ROLE_REQUIRED")
            result = register_workspace(repo, args.policy, args.workspace, role=args.role, task_id=args.task_id, owner_session_id=args.session_id, owner_pid=args.owner_pid, owner_lease_seconds=args.owner_lease_seconds if args.session_id or args.owner_pid else None)
            result["status"] = "WORKSPACE_REGISTERED"
        elif args.action == "converge":
            result = converge_canonical_workspace(repo, args.policy, integrated_sha=args.integrated_sha, task_id=args.task_id)
        elif args.action == "verify":
            result = verify_canonical_convergence(repo, args.policy, integrated_sha=args.integrated_sha, task_workspace_id=args.workspace_id)
        elif args.action == "preserve":
            result = preserve_dirty_workspace(repo, args.policy, args.workspace)
        elif args.action == "collect":
            result = collect_worktrees(repo, args.policy, mode=args.mode)
        else:
            if not args.workspace_id:
                raise WorkspaceAuthorityError("WORKSPACE_ID_REQUIRED")
            result = retire_completed_worktree(repo, args.policy, args.workspace_id, apply=args.apply)
        print(json.dumps(result, sort_keys=True))
        return 0 if result.get("status", "").endswith(("CONVERGED", "VERIFIED", "RETIRED", "DRY_RUN")) or result.get("status") in {"ALREADY_CURRENT", "OBSERVED", "AUTHORITY_RESOLVED", "WORKSPACE_REGISTERED", "DIRTY_WORK_PRESERVED"} else 20
    except WorkspaceAuthorityError as exc:
        print(str(exc), file=sys.stderr)
        return 20


if __name__ == "__main__":
    raise SystemExit(_cli())
