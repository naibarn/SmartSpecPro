"""Validate a scoped SPEC WorkUnit contract against canonical handoff state.

The contract is conductor supplied. Model output can never widen its authority
or provide a subprocess command.
"""
from __future__ import annotations

import hashlib
import contextlib
import importlib.util
import json
import os
import re
import sqlite3
import subprocess
import sys
import time
from urllib.parse import urlsplit
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class ContractError(ValueError):
    pass


def _sha(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _repo_root(path: Path) -> Path:
    result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"], cwd=path,
        text=True, capture_output=True, check=False,
    )
    if result.returncode:
        raise ContractError("workspace is not a Git worktree")
    return Path(result.stdout.strip()).resolve()


def _lease_expiry_is_current(contract_expiry: Any, registry_expiry: Any) -> bool:
    """Allow a monotonic renewal while requiring the registry lease to remain live."""
    if (
        not isinstance(contract_expiry, (int, float)) or isinstance(contract_expiry, bool)
        or not isinstance(registry_expiry, (int, float)) or isinstance(registry_expiry, bool)
    ):
        return False
    return registry_expiry >= contract_expiry and registry_expiry > time.time()


def _safe_paths(value: Any, field: str, *, allow_missing: bool = False) -> tuple[str, ...]:
    if not isinstance(value, list) or not value or any(not isinstance(item, str) for item in value):
        raise ContractError(f"{field} must be a non-empty array of repository-relative paths")
    result: list[str] = []
    for item in value:
        path = Path(item)
        if path.is_absolute() or ".." in path.parts or not item or "\\" in item:
            raise ContractError(f"{field} contains an unsafe path")
        normalized = path.as_posix()
        if normalized != item or normalized in result:
            raise ContractError(f"{field} contains a duplicate or non-canonical path")
        result.append(normalized)
    return tuple(result)


def _developer_authorization_digest(raw: dict[str, Any]) -> str:
    scope = {
        "developer": raw.get("developerIdentity"), "taskId": raw.get("taskId"),
        "task": raw.get("requirementText"), "acceptanceCriteria": raw.get("acceptanceCriteria"),
        "sourceSha": raw.get("sourceRevision"), "workspaceId": raw.get("workspaceId"),
        "allowedFiles": raw.get("allowedFiles"), "writableFiles": raw.get("writableFiles"),
        "patchableFiles": raw.get("patchableFiles"), "allowedTools": raw.get("allowedTools"),
        "tests": raw.get("tests"), "browserUat": raw.get("browserUat"),
        "budget": raw.get("budget"), "expiresAt": raw.get("scopeExpiresAt"),
        "productionAccess": False, "sharedDatabaseWrite": False, "runnerDispatch": False,
    }
    if raw.get("continuationBudgetAuthorization") is not None:
        scope["continuationBudgetAuthorization"] = raw["continuationBudgetAuthorization"]
    canonical_binding = raw.get("canonicalJobBinding")
    if isinstance(canonical_binding, dict):
        scope["canonicalJobIdentity"] = {key: canonical_binding.get(key) for key in ("jobId", "runId", "tenantId", "actorId")}
    try:
        encoded = json.dumps(scope, sort_keys=True, separators=(",", ":")).encode()
    except (TypeError, ValueError) as exc:
        raise ContractError("developer task scope is not serializable") from exc
    return hashlib.sha256(encoded).hexdigest()


def verify_github_developer_permission(root: Path, expected_login: str | None = None) -> dict[str, str]:
    """Verify the authenticated remote subject and repository write permission via GitHub API."""
    remote = subprocess.run(
        ["git", "remote", "get-url", "origin"], cwd=root, text=True,
        capture_output=True, check=False,
    )
    if remote.returncode:
        raise ContractError("authenticated developer policy requires the configured origin remote")
    value = remote.stdout.strip()
    if value.startswith("git@") and ":" in value:
        host, path = value[4:].split(":", 1)
        parsed_host = host
        repo_path = path
    else:
        parsed = urlsplit(value)
        parsed_host = parsed.hostname or ""
        repo_path = parsed.path.lstrip("/")
    repo_path = repo_path.removesuffix(".git").strip("/")
    parts = repo_path.split("/")
    if not parsed_host or len(parts) != 2 or any(not part or part in {".", ".."} for part in parts):
        raise ContractError("origin does not identify one GitHub repository")
    try:
        identity = subprocess.run(
            ["gh", "api", "--hostname", parsed_host, "user"], cwd=root,
            text=True, capture_output=True, check=False, timeout=15,
        )
        if identity.returncode:
            raise ContractError("authenticated GitHub developer identity is unavailable")
        actor = str(json.loads(identity.stdout).get("login", ""))
        if not actor or (expected_login is not None and actor != expected_login):
            raise ContractError("developer identity does not match the authenticated GitHub API subject")
        permission_result = subprocess.run(
            ["gh", "api", "--hostname", parsed_host,
             f"repos/{parts[0]}/{parts[1]}/collaborators/{actor}/permission"],
            cwd=root, text=True, capture_output=True, check=False, timeout=15,
        )
        if permission_result.returncode:
            raise ContractError("GitHub repository permission could not be verified")
        permission = str(json.loads(permission_result.stdout).get("permission", ""))
    except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
        raise ContractError("GitHub developer permission check failed closed") from exc
    if permission not in {"write", "maintain", "admin"}:
        raise ContractError("GitHub repository write permission is required for local source changes")
    return {"login": actor, "permission": permission, "repository": "/".join(parts), "host": parsed_host}


def _process_start(pid: int) -> str | None:
    try:
        raw = Path(f"/proc/{pid}/stat").read_text(encoding="ascii")
        fields = raw[raw.rfind(")") + 2 :].split()
        return fields[19] if len(fields) > 19 else None
    except (OSError, IndexError):
        return None


def verify_developer_workspace_claim(root: Path, raw: dict[str, Any]) -> int:
    """Recheck task/session/process/lease/fence from the existing workspace registry."""
    if raw.get("ownerSessionId") != os.environ.get("CODEX_SESSION_ID"):
        raise ContractError("developer task session is not the current authenticated Codex session")
    if type(raw.get("scopeExpiresAt")) not in {int, float} or raw["scopeExpiresAt"] <= time.time():
        raise ContractError("developer task scope expired before the scoped operation")
    owner_pid = raw.get("ownerPid")
    process_start = raw.get("ownerProcessStart")
    if type(owner_pid) is not int or owner_pid < 1 or not isinstance(process_start, str):
        raise ContractError("developer task process identity is incomplete")
    try:
        os.kill(owner_pid, 0)
    except OSError as exc:
        raise ContractError("developer task owner process is not active") from exc
    current_start = _process_start(owner_pid)
    if current_start is not None and current_start != process_start:
        raise ContractError("developer task owner process identity changed")
    common = Path(subprocess.run(
        ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
        cwd=root, text=True, capture_output=True, check=True,
    ).stdout.strip())
    registry = common / "workspace-authority.sqlite3"
    if not registry.is_file():
        raise ContractError("workspace authority registry is unavailable")
    connection = sqlite3.connect(f"file:{registry}?mode=ro", uri=True)
    try:
        row = connection.execute(
            "SELECT location, role, task_id, lifecycle_state, owner_session_id, owner_pid, owner_process_start, owner_lease_expires_at, owner_fencing_version "
            "FROM workspaces WHERE workspace_id=?",
            (raw.get("workspaceId"),),
        ).fetchone()
    except sqlite3.DatabaseError as exc:
        raise ContractError("workspace registry does not support fenced developer ownership") from exc
    finally:
        connection.close()
    if not row:
        raise ContractError("developer task workspace is not registered")
    location, role, task_id, lifecycle, session_id, pid, start, expiry, fence = row
    if (
        Path(location).resolve() != root or role != "TASK_WORKTREE"
        or task_id != raw.get("taskId") or lifecycle in {"RETIRED", "MISSING"}
        or session_id != raw.get("ownerSessionId") or pid != owner_pid or start != process_start
        or type(fence) is not int or fence < 1 or fence != raw.get("ownerFencingVersion")
        or not _lease_expiry_is_current(raw.get("workspaceLeaseExpiresAt"), expiry)
    ):
        raise ContractError("developer task workspace lease, source owner, or fence no longer matches")
    return fence


@contextlib.contextmanager
def developer_workspace_write_guard(root: Path, raw: dict[str, Any]):
    """Hold the registry writer lock across a scoped filesystem mutation."""
    expected_fence = verify_developer_workspace_claim(root, raw)
    common = Path(subprocess.run(
        ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
        cwd=root, text=True, capture_output=True, check=True,
    ).stdout.strip())
    registry = common / "workspace-authority.sqlite3"
    connection = sqlite3.connect(registry, timeout=20, isolation_level=None)
    try:
        connection.execute("PRAGMA busy_timeout = 20000")
        connection.execute("BEGIN IMMEDIATE")
        row = connection.execute(
            "SELECT location, role, task_id, lifecycle_state, owner_session_id, owner_pid, owner_process_start, owner_lease_expires_at, owner_fencing_version "
            "FROM workspaces WHERE workspace_id=?",
            (raw.get("workspaceId"),),
        ).fetchone()
        if not row:
            raise ContractError("developer task workspace disappeared before write")
        location, role, task_id, lifecycle, session_id, pid, start, expiry, fence = row
        if (
            Path(location).resolve() != root or role != "TASK_WORKTREE" or task_id != raw.get("taskId")
            or lifecycle in {"RETIRED", "MISSING"} or session_id != raw.get("ownerSessionId")
            or pid != raw.get("ownerPid") or start != raw.get("ownerProcessStart")
            or fence != expected_fence or fence != raw.get("ownerFencingVersion")
            or not _lease_expiry_is_current(raw.get("workspaceLeaseExpiresAt"), expiry)
        ):
            raise ContractError("developer workspace owner/fence changed before write")
        yield expected_fence
        connection.execute("COMMIT")
    except BaseException:
        if connection.in_transaction:
            connection.execute("ROLLBACK")
        raise
    finally:
        connection.close()


@dataclass(frozen=True)
class WorkUnitContract:
    raw: dict[str, Any]
    root: Path
    spec_id: str
    work_unit: str
    requirement_id: str
    requirement_text: str
    requirement_digest: str
    source_revision: str
    workspace_id: str
    task_id: str
    owner_session_id: str
    allowed_files: tuple[str, ...]
    writable_files: tuple[str, ...]
    test_paths: tuple[str, ...]
    acceptance: tuple[str, ...]
    max_attempts: int
    implementation_max_turns: int
    plan_max_turns: int
    review_max_turns: int
    browser_uat: dict[str, Any] | None
    allowed_tools: tuple[str, ...]
    database_mode: str

    @property
    def binding(self) -> dict[str, str]:
        return {
            "specId": self.spec_id,
            "workUnit": self.work_unit,
            "requirementId": self.requirement_id,
            "requirementDigest": self.requirement_digest,
            "sourceSpecDigest": str(self.raw["sourceSpecDigest"]),
            "sourceRevision": self.source_revision,
            "workspaceId": self.workspace_id,
            "taskId": self.task_id,
            "ownerSessionId": self.owner_session_id,
            "workspace": str(self.root),
        }

    @property
    def test_command(self) -> list[str]:
        if self.raw["tests"]["runner"] == "pytest":
            project_python = self.root / "python-backend/.venv/bin/python"
            interpreter = str(project_python) if project_python.is_file() else sys.executable
            coverage_flag = ["--no-cov"] if importlib.util.find_spec("pytest_cov") else []
            return [interpreter, "-m", "pytest", *coverage_flag, "-q", *self.test_paths]
        package_root = self.raw["tests"]["cwd"]
        package_paths = [Path(path).relative_to(package_root).as_posix() for path in self.test_paths]
        return ["pnpm", "--dir", package_root, "exec", "vitest", "run", *package_paths]

    @property
    def digest(self) -> str:
        return _sha(json.dumps(self.raw, sort_keys=True, separators=(",", ":")))


def load_contract(contract_path: Path, workspace: Path) -> WorkUnitContract:
    try:
        raw = json.loads(contract_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ContractError(f"cannot read WorkUnit contract: {exc}") from exc
    if not isinstance(raw, dict) or raw.get("schema") not in {
        "agents-sdk-spec-workunit-contract.v1",
        "agents-sdk-developer-workunit-contract.v1",
    }:
        raise ContractError("unsupported WorkUnit contract schema")
    developer_task = raw.get("schema") == "agents-sdk-developer-workunit-contract.v1"

    root = _repo_root(workspace).resolve()
    requested_workspace = Path(str(raw.get("workspace", ""))).resolve()
    if requested_workspace != root:
        raise ContractError("contract workspace does not match the selected Git worktree")
    head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=root, text=True, capture_output=True, check=True).stdout.strip()
    if raw.get("sourceRevision") != head:
        raise ContractError("contract sourceRevision does not match the selected worktree HEAD")

    spec_id = str(raw.get("specId", ""))
    requirement_id = str(raw.get("requirementId", ""))
    work_unit = str(raw.get("workUnit", ""))
    if developer_task:
        developer_identity = raw.get("developerIdentity")
        if not isinstance(developer_identity, dict) or not isinstance(developer_identity.get("login"), str):
            raise ContractError("authenticated developer identity evidence is required")
        verified_identity = verify_github_developer_permission(root, developer_identity["login"])
        if any(developer_identity.get(key) != value for key, value in verified_identity.items()):
            raise ContractError("developer authorization evidence is stale or changed")
        if (
            not re.fullmatch(r"DEV-[A-F0-9]{12}", requirement_id)
            or not re.fullmatch(r"DEV-WU-[A-F0-9]{12}", work_unit)
            or not str(raw.get("requirementText", "")).strip()
            or hashlib.sha256(str(raw.get("requirementText", "")).encode()).hexdigest() != raw.get("requirementDigest")
        ):
            raise ContractError("developer task identity or digest is invalid")
        scope_expiry = raw.get("scopeExpiresAt")
        if type(scope_expiry) not in {int, float} or scope_expiry <= time.time():
            raise ContractError("developer task scope is expired or has no bounded expiry")
        if spec_id != "DEVELOPER-TASK":
            raise ContractError("developer work units must use the developer-task scope")
    elif not re.fullmatch(r"SPEC-[0-9]{3,4}", spec_id) or not re.fullmatch(r"REQ-[A-F0-9]{12}", requirement_id):
        raise ContractError("SPEC or requirement identity is invalid")
    if not developer_task and not re.fullmatch(r"[A-Z0-9][A-Z0-9_-]{2,95}", work_unit):
        raise ContractError("WorkUnit identity is invalid")

    if developer_task:
        if raw.get("sourceSpecDigest") != raw.get("authorizationDigest"):
            raise ContractError("developer task authorization digest binding is invalid")
        if raw.get("authorizationDigest") != _developer_authorization_digest(raw):
            raise ContractError("developer task authorization digest does not match its scoped contract")
    canonical_binding = raw.get("canonicalJobBinding")
    if canonical_binding is not None:
        if (not isinstance(canonical_binding, dict) or
            not all(isinstance(canonical_binding.get(key), str) and canonical_binding[key] for key in ("jobId", "runId", "tenantId", "attemptId")) or
            canonical_binding.get("runId") != raw.get("taskId") or
            type(canonical_binding.get("actorId")) is not int or canonical_binding["actorId"] <= 0 or
            type(canonical_binding.get("fencingVersion")) is not int or canonical_binding["fencingVersion"] < 1):
            raise ContractError("canonical Task Control binding is invalid")
        canonical_text = str(raw["requirementText"])
        canonical_digest = str(raw["requirementDigest"])
    else:
        index_path = root / "specs/_status/spec-index.json"
        index = json.loads(index_path.read_text(encoding="utf-8"))
        entry = next((row for row in index.get("records", []) if row.get("record_kind") == "CANONICAL_SPEC" and row.get("spec_id") == spec_id.removeprefix("SPEC-")), None)
        if not entry or entry.get("authority") != "ACTIVE_CANONICAL" or entry.get("disposition") != "ACTIVE_CANONICAL":
            raise ContractError("SPEC is not an active canonical implementation authority")
        spec_dir = root / str(entry.get("path", ""))
        manifest = json.loads((spec_dir / "handoff/manifest.json").read_text(encoding="utf-8"))
        ledger = json.loads((spec_dir / "handoff/requirement-ledger.json").read_text(encoding="utf-8"))
        requirement = next((row for row in ledger.get("requirements", []) if row.get("requirement_id") == requirement_id), None)
        if requirement is None:
            raise ContractError("canonical requirement is missing from the ledger")
        if requirement.get("final_state") not in {"OPEN", "PARTIAL"}:
            raise ContractError("requirement is not eligible for implementation")
        canonical_text = str(requirement.get("requirement_text", ""))
        canonical_digest = str(requirement.get("requirement_digest", ""))
        if raw.get("requirementText") != canonical_text or raw.get("requirementDigest") != canonical_digest:
            raise ContractError("contract requirement text or digest differs from the canonical ledger")
        if raw.get("sourceSpecDigest") != manifest.get("identity", {}).get("digest"):
            raise ContractError("contract source SPEC digest differs from the canonical manifest")
        if work_unit not in {manifest.get("continuation", {}).get("next_ready_workunit"), manifest.get("integration", {}).get("pending_workunit")}:
            raise ContractError("WorkUnit is not the canonical handoff's ready or pending WorkUnit")

    allowed = _safe_paths(raw.get("allowedFiles"), "allowedFiles", allow_missing=True)
    writable = _safe_paths(raw.get("writableFiles"), "writableFiles", allow_missing=True)
    if not set(writable).issubset(allowed):
        raise ContractError("writableFiles must be a subset of allowedFiles")
    for rel in allowed:
        target = (root / rel).resolve()
        if root not in target.parents:
            raise ContractError("allowed file resolves outside the selected worktree")
    patchable = raw.get("patchableFiles", [])
    if not isinstance(patchable, list) or any(not isinstance(path, str) for path in patchable) or not set(patchable).issubset(writable):
        raise ContractError("patchableFiles must be a subset of writableFiles")

    tests = raw.get("tests")
    if not isinstance(tests, dict) or tests.get("runner") not in {"vitest", "pytest"}:
        raise ContractError("test runner must use a registered Vitest or pytest command adapter")
    runner = tests["runner"]
    cwd = str(tests.get("cwd", ""))
    if runner == "vitest" and cwd != "apps/web":
        raise ContractError("Vitest command cwd is outside the registered package boundary")
    if runner == "pytest" and cwd not in {"python-backend", "."}:
        raise ContractError("pytest command cwd is outside the registered package boundary")
    test_paths = _safe_paths(tests.get("paths"), "tests.paths")
    required_prefix = "apps/web/" if runner == "vitest" else ("python-backend/" if cwd == "python-backend" else "")
    if any((required_prefix and not path.startswith(required_prefix)) or path not in allowed for path in test_paths):
        raise ContractError("test paths must be repository-relative paths listed in allowedFiles and inside the test package")

    authority = raw.get("authority")
    expected_authority = "authenticated-github-developer-policy" if developer_task else "canonical-spec-handoff"
    if not isinstance(authority, dict) or authority.get("source") != expected_authority:
        raise ContractError("authority must come from the canonical SPEC handoff or authenticated developer policy")
    if authority.get("productionAccess") is not False or authority.get("sharedDatabaseWrite") is not False or authority.get("gateway") is not False:
        raise ContractError("production, shared DB writes, and Gateway access must be explicitly denied")
    if authority.get("provider") != "codex-subscription":
        raise ContractError("only the existing Codex subscription route is supported")
    database_mode = str(tests.get("databaseMode", "none"))
    if database_mode not in {"none", "isolated_local"}:
        raise ContractError("databaseMode must be none or an isolated local test database")
    if database_mode == "isolated_local" and authority.get("isolatedTestDatabase") is not True:
        raise ContractError("isolated database tests require an explicit disposable test database authority")

    workspace_id, task_id = str(raw.get("workspaceId", "")), str(raw.get("taskId", ""))
    owner_session_id = str(raw.get("ownerSessionId", ""))
    if not workspace_id or not task_id or not owner_session_id:
        raise ContractError("registered workspaceId, taskId, and ownerSessionId are required")
    if developer_task:
        if str(task_id) != str(raw.get("taskId")):
            raise ContractError("developer task binding is invalid")
        verify_developer_workspace_claim(root, raw)
    else:
        common = Path(subprocess.run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], cwd=root, text=True, capture_output=True, check=True).stdout.strip())
        registry = common / "workspace-authority.sqlite3"
        if not registry.is_file():
            raise ContractError("workspace authority registry is unavailable")
        connection = sqlite3.connect(f"file:{registry}?mode=ro", uri=True)
        try:
            row = connection.execute(
                "SELECT location, role, task_id, lifecycle_state, owner_session_id FROM workspaces WHERE workspace_id=?",
                (workspace_id,),
            ).fetchone()
        finally:
            connection.close()
        if not row or Path(row[0]).resolve() != root or row[1] != "TASK_WORKTREE" or row[2] != task_id or row[3] in {"RETIRED", "MISSING"} or row[4] != owner_session_id:
            raise ContractError("workspace ownership does not match the registered TASK_WORKTREE")

    budget = raw.get("budget")
    if not isinstance(budget, dict):
        raise ContractError("budget is required")
    # maxAttempts is accepted only as a legacy hint; it never bounds mission
    # continuation. Turn values are per SDK segment and MaxTurnsExceeded
    # resumes from the official RunState checkpoint.
    values: dict[str, int] = {"maxAttempts": 1}
    legacy_attempts = budget.get("maxAttempts", 1)
    if type(legacy_attempts) is not int or legacy_attempts < 1:
        raise ContractError("legacy budget.maxAttempts, when present, must be a positive integer")
    caps = {"implementationMaxTurns": (1, 30), "planMaxTurns": (1, 8), "reviewMaxTurns": (1, 8)}
    for key, (lower, upper) in caps.items():
        value = budget.get(key)
        if type(value) is not int or not lower <= value <= upper:
            raise ContractError(f"budget.{key} must be between {lower} and {upper}")
        values[key] = value
    acceptance = raw.get("acceptanceCriteria")
    if not isinstance(acceptance, list) or not acceptance or any(not isinstance(item, str) or not item.strip() for item in acceptance):
        raise ContractError("acceptanceCriteria must be a non-empty list of statements")
    guidance = raw.get("implementationGuidance")
    if guidance is not None and (not isinstance(guidance, str) or len(guidance) > 5000):
        raise ContractError("implementationGuidance must be a bounded trusted conductor note")
    browser_uat = raw.get("browserUat")
    if browser_uat is not None and not isinstance(browser_uat, dict):
        raise ContractError("browserUat must be an object or null")
    if browser_uat and browser_uat.get("status") not in {"configured", "unavailable"}:
        raise ContractError("browserUat status must be explicit")
    tools_available = ["list_files", "read_file", "read_range", "write_file", "patch_file", "run_focused_tests"]
    if browser_uat and browser_uat.get("status") == "configured":
        tools_available.append("run_browser_uat")
    if developer_task:
        requested_tools = raw.get("allowedTools")
        if (not isinstance(requested_tools, list) or not requested_tools
                or any(name not in tools_available for name in requested_tools)
                or len(set(requested_tools)) != len(requested_tools)):
            raise ContractError("developer task allowedTools contains an unknown or duplicate host tool")
        tools_available = [name for name in tools_available if name in requested_tools]

    return WorkUnitContract(
        raw=raw, root=root, spec_id=spec_id, work_unit=work_unit,
        requirement_id=requirement_id, requirement_text=canonical_text,
        requirement_digest=canonical_digest, source_revision=head,
        workspace_id=workspace_id, task_id=task_id, owner_session_id=owner_session_id, allowed_files=allowed,
        writable_files=writable, test_paths=test_paths,
        acceptance=tuple(acceptance), max_attempts=legacy_attempts,
        implementation_max_turns=values["implementationMaxTurns"],
        plan_max_turns=values["planMaxTurns"], review_max_turns=values["reviewMaxTurns"],
        browser_uat=browser_uat, allowed_tools=tuple(tools_available), database_mode=database_mode,
    )
