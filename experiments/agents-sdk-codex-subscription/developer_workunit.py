"""Provision, supervise, and resume an authenticated local Developer WorkUnit."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from spec_workunit_contract import ContractError, verify_github_developer_permission


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
POLICY = REPO / ".development-repository.toml"
AUTHORITY_PATH = REPO / "scripts/development-lifecycle/workspace_authority.py"
SPEC = importlib.util.spec_from_file_location("developer_workunit_workspace_authority", AUTHORITY_PATH)
if SPEC is None or SPEC.loader is None:
    raise ImportError("existing Workspace Registry is unavailable")
AUTHORITY = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = AUTHORITY
SPEC.loader.exec_module(AUTHORITY)


def _session_id() -> str:
    value = os.environ.get("CODEX_SESSION_ID", "")
    if not value:
        raise ContractError("authenticated Codex session identity is unavailable")
    return value


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.chmod(temporary, 0o600)
    temporary.replace(path)


def _validate_request(request: dict[str, Any], workspace_root: Path) -> None:
    task = request.get("task")
    if not isinstance(task, str) or not task.strip() or len(task) > 12000:
        raise ContractError("request.task must be a bounded implementation request")
    allowed, writable = request.get("allowedFiles"), request.get("writableFiles")
    def paths(value: Any, name: str) -> list[str]:
        if not isinstance(value, list) or not value or any(not isinstance(item, str) for item in value):
            raise ContractError(f"request.{name} must be a non-empty list of paths")
        normalized = []
        for item in value:
            path = Path(item)
            if path.is_absolute() or ".." in path.parts or not item or "\\" in item or path.as_posix() != item:
                raise ContractError(f"request.{name} contains an unsafe or non-canonical path")
            target = (workspace_root / path).resolve()
            if target == workspace_root or workspace_root not in target.parents:
                raise ContractError(f"request.{name} resolves outside the task workspace")
            normalized.append(item)
        if len(set(normalized)) != len(normalized):
            raise ContractError(f"request.{name} contains duplicate paths")
        return normalized
    allowed = paths(allowed, "allowedFiles")
    writable = paths(writable, "writableFiles")
    if not set(writable).issubset(allowed):
        raise ContractError("request.writableFiles must be contained in request.allowedFiles")
    patchable = request.get("patchableFiles", [])
    if not isinstance(patchable, list) or any(path not in writable for path in patchable):
        raise ContractError("request.patchableFiles must be a subset of writableFiles")
    tests = request.get("tests")
    if not isinstance(tests, dict) or tests.get("runner") not in {"pytest", "vitest"}:
        raise ContractError("request.tests must select the existing pytest or Vitest adapter")
    cwd = tests.get("cwd")
    if (tests["runner"] == "vitest" and cwd != "apps/web") or (tests["runner"] == "pytest" and cwd not in {".", "python-backend"}):
        raise ContractError("request.tests.cwd is outside the fixed package boundary")
    test_paths = paths(tests.get("paths"), "tests.paths")
    required = "apps/web/" if tests["runner"] == "vitest" else ("python-backend/" if cwd == "python-backend" else "")
    if any(path not in allowed or (required and not path.startswith(required)) for path in test_paths):
        raise ContractError("request.tests.paths must be allowlisted and inside the selected test package")
    if tests.get("databaseMode", "none") != "none":
        raise ContractError("local Developer WorkUnits do not authorize database writes")
    criteria = request.get("acceptanceCriteria")
    if not isinstance(criteria, list) or not criteria or any(not isinstance(item, str) or not item.strip() for item in criteria):
        raise ContractError("request.acceptanceCriteria must be a non-empty list")
    browser = request.get("browserUat")
    if browser is not None:
        if not isinstance(browser, dict) or browser.get("status") not in {"configured", "unavailable"}:
            raise ContractError("request.browserUat must explicitly be configured or unavailable")
        if browser.get("status") == "configured":
            project = browser.get("projectPath")
            if not isinstance(project, str) or not project or Path(project).is_absolute() or ".." in Path(project).parts:
                raise ContractError("request.browserUat.projectPath is invalid")
            if f"{project.rstrip('/')}/index.html" not in allowed:
                raise ContractError("configured Browser UAT needs an allowlisted project index.html")
    budget = request.get("budget", {"implementationMaxTurns": 12, "planMaxTurns": 4, "reviewMaxTurns": 4})
    if not isinstance(budget, dict):
        raise ContractError("request.budget must be an object")
    for key, upper in (("implementationMaxTurns", 30), ("planMaxTurns", 8), ("reviewMaxTurns", 8)):
        value = budget.get(key)
        if type(value) is not int or not 1 <= value <= upper:
            raise ContractError(f"request.budget.{key} must be from 1 to {upper}")


def _request_contract(request: dict[str, Any], *, identity: dict[str, str], workspace: Path,
                      registered: dict[str, Any], task_id: str, scope_expires_at: float) -> dict[str, Any]:
    task = request.get("task")
    allowed = request.get("allowedFiles")
    writable = request.get("writableFiles")
    tests = request.get("tests")
    criteria = request.get("acceptanceCriteria")
    if not isinstance(task, str) or not task.strip() or len(task) > 12000:
        raise ContractError("request.task must be a bounded implementation request")
    if not isinstance(allowed, list) or not allowed or not isinstance(writable, list) or not writable:
        raise ContractError("request must declare a non-empty allowedFiles and writableFiles set")
    if not isinstance(tests, dict) or tests.get("runner") not in {"pytest", "vitest"}:
        raise ContractError("request.tests must select the existing pytest or Vitest adapter")
    if not isinstance(criteria, list) or not criteria or any(not isinstance(item, str) or not item.strip() for item in criteria):
        raise ContractError("request.acceptanceCriteria must be a non-empty list")
    tools = ["list_files", "read_file", "read_range", "write_file", "patch_file", "run_focused_tests"]
    browser = request.get("browserUat")
    if browser and browser.get("status") == "configured":
        tools.append("run_browser_uat")
    budget = request.get("budget", {
        "maxAttempts": 3, "implementationMaxTurns": 12, "planMaxTurns": 4, "reviewMaxTurns": 4,
    })
    auth = {
        "developer": identity, "taskId": task_id, "sourceSha": registered["base_sha"],
        "task": task, "acceptanceCriteria": criteria,
        "workspaceId": registered["workspace_id"], "allowedFiles": allowed,
        "writableFiles": writable, "patchableFiles": request.get("patchableFiles", []),
        "allowedTools": tools, "tests": tests, "browserUat": browser,
        "budget": budget, "expiresAt": scope_expires_at,
        "productionAccess": False, "sharedDatabaseWrite": False, "runnerDispatch": False,
    }
    authorization_digest = hashlib.sha256(
        json.dumps(auth, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    task_suffix = task_id.replace("-", "")[:12].upper()
    contract = {
        "schema": "agents-sdk-developer-workunit-contract.v1",
        "specId": "DEVELOPER-TASK", "workUnit": f"DEV-WU-{task_suffix}",
        "requirementId": f"DEV-{task_suffix}", "requirementText": task,
        "requirementDigest": hashlib.sha256(task.encode()).hexdigest(),
        "sourceSpecDigest": authorization_digest, "authorizationDigest": authorization_digest,
        "sourceRevision": registered["base_sha"], "workspace": str(workspace),
        "workspaceId": registered["workspace_id"], "taskId": task_id,
        "ownerSessionId": _session_id(), "ownerPid": os.getpid(),
        "ownerProcessStart": AUTHORITY._process_start(os.getpid()),
        "ownerFencingVersion": registered["owner_fencing_version"],
        "workspaceLeaseExpiresAt": registered["owner_lease_expires_at"],
        "scopeExpiresAt": scope_expires_at, "developerIdentity": identity,
        "allowedFiles": allowed, "writableFiles": writable,
        "patchableFiles": request.get("patchableFiles", []), "allowedTools": tools,
        "contextRanges": request.get("contextRanges", {}), "tests": tests,
        "browserUat": browser, "acceptanceCriteria": criteria,
        "budget": budget,
        "authority": {
            "source": "authenticated-github-developer-policy", "productionAccess": False,
            "sharedDatabaseWrite": False, "gateway": False, "provider": "codex-subscription",
            "isolatedTestDatabase": False,
        },
        "implementationGuidance": request.get("implementationGuidance"),
    }
    return contract


def _renew(workspace: Path, contract: dict[str, Any], lease_seconds: int = 300) -> dict[str, Any]:
    scope_remaining = int(contract["scopeExpiresAt"] - time.time())
    if scope_remaining <= 0:
        raise ContractError("Developer WorkUnit scope expired")
    lease = min(lease_seconds, scope_remaining)
    registered = AUTHORITY.register_workspace(
        REPO, POLICY, workspace, role="TASK_WORKTREE", task_id=contract["taskId"],
        owner_session_id=_session_id(), owner_pid=os.getpid(), owner_lease_seconds=lease,
    )
    if registered["workspace_id"] != contract["workspaceId"] or registered["owner_fencing_version"] != contract["ownerFencingVersion"]:
        raise ContractError("Workspace owner or fencing token changed during lease renewal")
    contract["workspaceLeaseExpiresAt"] = registered["owner_lease_expires_at"]
    return registered


def _run(contract_path: Path, evidence: Path, *, crash_at: str) -> int:
    contract = json.loads(contract_path.read_text(encoding="utf-8"))
    workspace = Path(contract["workspace"]).resolve()
    state_path = evidence / "run-state.json"
    run_id = json.loads(state_path.read_text(encoding="utf-8")).get("runId") if state_path.is_file() else str(uuid.uuid4())
    command = [sys.executable, str(HERE / "supervise_run.py"), "--workspace", str(workspace),
               "--spec-contract", str(contract_path), "--evidence-dir", str(evidence), "--run-id", run_id,
               "--crash-at", crash_at]
    environment = os.environ.copy()
    environment.pop("OPENAI_API_KEY", None)
    last_renewal = time.monotonic()
    with subprocess.Popen(command, cwd=HERE, env=environment) as child:
        while child.poll() is None:
            if time.monotonic() - last_renewal >= 60:
                _renew(workspace, contract)
                _write_json(contract_path, contract)
                last_renewal = time.monotonic()
            time.sleep(1)
        return int(child.returncode or 0)


def start(args: argparse.Namespace) -> int:
    if not 300 <= args.scope_ttl_seconds <= 86400:
        raise ContractError("scope TTL must be from 5 minutes to 24 hours")
    repo = Path(args.repository).resolve()
    identity = verify_github_developer_permission(repo, args.developer_login)
    remote_result = subprocess.run(
        ["git", "ls-remote", "origin", "refs/heads/main"], cwd=repo,
        text=True, capture_output=True, check=True, timeout=30,
    )
    remote_lines = remote_result.stdout.splitlines()
    if not remote_lines:
        raise ContractError("origin/main has no advertised source SHA")
    remote_sha = remote_lines[0].split()[0]
    base_sha = args.base_sha or remote_sha
    if base_sha != remote_sha:
        raise ContractError("requested source SHA is not the currently advertised origin/main SHA")
    subprocess.run(["git", "cat-file", "-e", f"{base_sha}^{{commit}}"], cwd=repo, check=True)
    request = json.loads(args.request.read_text(encoding="utf-8"))
    _validate_request(request, repo)
    task_id = str(uuid.uuid4())
    policy = AUTHORITY.load_source_policy(repo, args.policy)
    destination = Path(policy["source_root"]) / "developer-fast-lane" / task_id
    registered = AUTHORITY.create_registered_worktree(
        repo, args.policy, destination, base_sha=base_sha, role="TASK_WORKTREE",
        task_id=task_id, session_id=_session_id(), owner_pid=os.getpid(), owner_lease_seconds=300,
    )
    workspace = Path(registered["workspace"]).resolve()
    scope_expires_at = time.time() + args.scope_ttl_seconds
    contract = _request_contract(request, identity=identity, workspace=workspace, registered=registered,
                                 task_id=task_id, scope_expires_at=scope_expires_at)
    evidence = Path(args.evidence_root).resolve() / task_id
    evidence.mkdir(parents=True, exist_ok=True, mode=0o700)
    contract_path = evidence / "contract.json"
    _write_json(contract_path, contract)
    _write_json(evidence / "authorization-receipt.json", {
        "schema": "developer-local-workunit-authorization.v1", "taskId": task_id,
        "workspaceId": registered["workspace_id"], "sourceSha": base_sha,
        "developerIdentity": identity, "ownerSessionId": _session_id(), "ownerPid": os.getpid(),
        "ownerFencingVersion": registered["owner_fencing_version"],
        "allowedFiles": contract["allowedFiles"], "writableFiles": contract["writableFiles"],
        "allowedTools": contract["allowedTools"], "budget": contract["budget"],
        "scopeExpiresAt": scope_expires_at, "productionAccess": False, "runnerDispatch": False,
    })
    return _run(contract_path, evidence, crash_at=args.crash_at)


def resume(args: argparse.Namespace) -> int:
    evidence = Path(args.evidence).resolve()
    contract_path = evidence / "contract.json"
    contract = json.loads(contract_path.read_text(encoding="utf-8"))
    identity = verify_github_developer_permission(Path(contract["workspace"]), str(contract["developerIdentity"].get("login", "")))
    if identity != contract["developerIdentity"] or contract["scopeExpiresAt"] <= time.time():
        raise ContractError("Developer identity changed or the original WorkUnit scope has expired")
    claim = AUTHORITY.claim_registered_workspace(
        REPO, POLICY, contract["workspaceId"], task_id=contract["taskId"],
        expected_head_sha=contract["sourceRevision"], developer_login=identity["login"],
        owner_session_id=_session_id(), owner_pid=os.getpid(),
        owner_lease_seconds=min(3600, max(30, int(contract["scopeExpiresAt"] - time.time()))),
    )
    contract.update({
        "ownerSessionId": _session_id(), "ownerPid": os.getpid(),
        "ownerProcessStart": AUTHORITY._process_start(os.getpid()),
        "ownerFencingVersion": claim["ownerFencingVersion"],
        "workspaceLeaseExpiresAt": claim["leaseExpiresAt"],
    })
    _write_json(contract_path, contract)
    with (evidence / "continuation-receipts.jsonl").open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(claim, sort_keys=True) + "\n")
    return _run(contract_path, evidence, crash_at=args.crash_at)


def main() -> int:
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="action", required=True)
    new = commands.add_parser("start", help="Create a registered, least-privilege local Developer WorkUnit")
    new.add_argument("request", type=Path, help="JSON task scope, paths, tests, acceptance and budget")
    new.add_argument("--repository", type=Path, default=REPO)
    new.add_argument("--policy", type=Path, default=POLICY)
    new.add_argument("--developer-login")
    new.add_argument("--base-sha")
    new.add_argument("--evidence-root", type=Path, default=Path.home() / ".cache/codex/developer-workunits")
    new.add_argument("--scope-ttl-seconds", type=int, default=8 * 60 * 60)
    new.add_argument("--crash-at", default="")
    new.set_defaults(handler=start)
    continued = commands.add_parser("resume", help="Fenced claim and durable resume of an expired local task owner")
    continued.add_argument("evidence", type=Path)
    continued.add_argument("--crash-at", default="")
    continued.set_defaults(handler=resume)
    args = parser.parse_args()
    try:
        return args.handler(args)
    except (ContractError, AUTHORITY.WorkspaceAuthorityError, OSError, ValueError, KeyError) as exc:
        print(json.dumps({"status": "BLOCKED_AUTHORITY_OR_CONTRACT", "reason": str(exc)}), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
