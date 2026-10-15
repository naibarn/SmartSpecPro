"""Provision, supervise, and resume an authenticated local Developer WorkUnit."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
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
                      registered: dict[str, Any], task_id: str, scope_expires_at: float,
                      canonical_binding: dict[str, Any] | None = None) -> dict[str, Any]:
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
    if canonical_binding:
        auth["canonicalJobIdentity"] = {key: canonical_binding[key] for key in ("jobId", "runId", "tenantId", "actorId")}
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
        "scopeTtlSeconds": int(request.get("scopeTtlSeconds", 8 * 60 * 60)),
        "authority": {
            "source": "authenticated-github-developer-policy", "productionAccess": False,
            "sharedDatabaseWrite": False, "gateway": False, "runnerDispatch": False,
            "provider": "codex-subscription",
            "isolatedTestDatabase": False,
        },
        "implementationGuidance": request.get("implementationGuidance"),
    }
    if canonical_binding:
        contract["canonicalJobBinding"] = canonical_binding
    return contract


def _canonical_digest(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def _verify_resume_scope(contract: dict[str, Any], request: dict[str, Any], binding: dict[str, Any],
                         receipt_path: Path) -> tuple[dict[str, Any], str]:
    """Bind a resumed process to the immutable Job request and original receipt."""
    expected_binding = contract.get("canonicalJobBinding")
    for key in ("jobId", "runId", "tenantId", "actorId"):
        if expected_binding is None or expected_binding.get(key) != binding.get(key):
            raise ContractError("canonical WorkUnit resume identity changed")
    if contract.get("sourceRevision") != request.get("sourceRevision"):
        raise ContractError("canonical WorkUnit source baseline changed")
    expected_budget = request.get("budget", {
        "maxAttempts": 3, "implementationMaxTurns": 12, "planMaxTurns": 4, "reviewMaxTurns": 4,
    })
    expected_tools = ["list_files", "read_file", "read_range", "write_file", "patch_file", "run_focused_tests"]
    browser = request.get("browserUat")
    if browser and browser.get("status") == "configured":
        expected_tools.append("run_browser_uat")
    fields = {
        "requirementText": request.get("task"),
        "acceptanceCriteria": request.get("acceptanceCriteria"),
        "allowedFiles": request.get("allowedFiles"),
        "writableFiles": request.get("writableFiles"),
        "patchableFiles": request.get("patchableFiles", []),
        "allowedTools": expected_tools,
        "tests": request.get("tests"),
        "browserUat": browser,
        "budget": expected_budget,
        "implementationGuidance": request.get("implementationGuidance"),
        "scopeTtlSeconds": int(request.get("scopeTtlSeconds", 8 * 60 * 60)),
    }
    if any(contract.get(key) != value for key, value in fields.items()):
        raise ContractError("canonical WorkUnit resume scope differs from its persisted Job request")
    try:
        receipt_bytes = receipt_path.read_bytes()
        receipt = json.loads(receipt_bytes)
    except (OSError, json.JSONDecodeError) as exc:
        raise ContractError("original Developer authorization receipt is missing or invalid") from exc
    expected_receipt = {
        "schema": "developer-local-workunit-authorization.v1",
        "taskId": contract.get("taskId"), "workspaceId": contract.get("workspaceId"),
        "sourceSha": contract.get("sourceRevision"),
        "allowedFiles": contract.get("allowedFiles"), "writableFiles": contract.get("writableFiles"),
        "allowedTools": contract.get("allowedTools"), "budget": contract.get("budget"),
        "productionAccess": False, "runnerDispatch": False,
    }
    if any(receipt.get(key) != value for key, value in expected_receipt.items()):
        raise ContractError("original Developer authorization receipt does not match the persisted WorkUnit scope")
    if receipt.get("developerIdentity", {}).get("login") != request.get("developerLogin"):
        raise ContractError("original authorization receipt Developer does not match the persisted Job")
    original_expiry = contract.get("originalScopeExpiresAt", contract.get("scopeExpiresAt"))
    if receipt.get("scopeExpiresAt") != original_expiry:
        raise ContractError("original Developer authorization expiry changed")
    receipt_digest = hashlib.sha256(receipt_bytes).hexdigest()
    pinned_digest = contract.get("originalAuthorizationReceiptSha256")
    if pinned_digest and pinned_digest != receipt_digest:
        raise ContractError("original Developer authorization receipt changed")
    return receipt, receipt_digest


def _validate_continuation_grant(grant: dict[str, Any] | None, *, contract: dict[str, Any],
                                 request: dict[str, Any], binding: dict[str, Any],
                                 receipt_digest: str, receipt_path: Path,
                                 continuation_path: Path) -> dict[str, Any]:
    if not isinstance(grant, dict) or grant.get("schema") != "spec224.developer-continuation-grant.v1":
        raise ContractError("WAITING_AUTHORIZATION: no server-issued bounded continuation grant")
    expected = {
        "jobId": binding.get("jobId"), "runId": binding.get("runId"),
        "tenantId": binding.get("tenantId"), "actorId": binding.get("actorId"),
        "attemptId": binding.get("attemptId"), "fencingVersion": binding.get("fencingVersion"),
        "developerLogin": contract.get("developerIdentity", {}).get("login"),
        "workspaceId": contract.get("workspaceId"), "sourceRevision": contract.get("sourceRevision"),
        "originalAuthorizationReceiptSha256": receipt_digest,
        "scopeDigest": _canonical_digest({key: request[key] for key in (
            "developerLogin", "sourceRevision", "task", "allowedFiles", "writableFiles", "patchableFiles",
            "tests", "acceptanceCriteria", "budget", "browserUat", "implementationGuidance", "scopeTtlSeconds",
        ) if key in request}),
    }
    if any(grant.get(key) != value for key, value in expected.items()):
        raise ContractError("WAITING_AUTHORIZATION: continuation grant does not match the original WorkUnit")
    try:
        issued_at = datetime.fromisoformat(str(grant["issuedAt"])).timestamp()
        expires_at = datetime.fromisoformat(str(grant["scopeExpiresAt"])).timestamp()
        max_ttl = int(request.get("scopeTtlSeconds", 8 * 60 * 60))
    except (KeyError, TypeError, ValueError) as exc:
        raise ContractError("WAITING_AUTHORIZATION: continuation grant time bounds are invalid") from exc
    if not 300 <= max_ttl <= 86_400 or not issued_at > float(contract.get("scopeExpiresAt", 0)) or not issued_at < expires_at <= issued_at + max_ttl:
        raise ContractError("WAITING_AUTHORIZATION: continuation grant exceeds the original bounded scope")
    try:
        receipts = [json.loads(line) for line in continuation_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    except FileNotFoundError:
        receipts = []
    except (OSError, json.JSONDecodeError) as exc:
        raise ContractError("continuation authorization audit trail is invalid") from exc
    ordinal = len(receipts) + 1
    max_continuations = int(request.get("budget", {}).get("maxAttempts", 3))
    if grant.get("continuationOrdinal") != ordinal or ordinal > max_continuations:
        raise ContractError("WAITING_AUTHORIZATION: bounded continuation attempt allowance is exhausted")
    if not receipt_path.is_file():
        raise ContractError("original Developer authorization receipt is missing")
    return {**grant, "scopeExpiresAtEpoch": expires_at, "continuationOrdinal": ordinal}


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


def _run(contract_path: Path, evidence: Path, *, crash_at: str, run_id: str | None = None,
         canonical_admission_response_fd: int | None = None,
         canonical_admission_request_fd: int | None = None) -> int:
    contract = json.loads(contract_path.read_text(encoding="utf-8"))
    workspace = Path(contract["workspace"]).resolve()
    state_path = evidence / "run-state.json"
    persisted_run_id = json.loads(state_path.read_text(encoding="utf-8")).get("runId") if state_path.is_file() else None
    run_id = persisted_run_id or run_id or str(uuid.uuid4())
    if persisted_run_id and run_id != persisted_run_id:
        raise ContractError("canonical WorkUnit run identity changed during resume")
    command = [sys.executable, str(HERE / "supervise_run.py"), "--workspace", str(workspace),
               "--spec-contract", str(contract_path), "--evidence-dir", str(evidence), "--run-id", run_id,
               "--crash-at", crash_at]
    if (canonical_admission_response_fd is None) != (canonical_admission_request_fd is None):
        raise ContractError("canonical model admission requires both private IPC descriptors")
    if canonical_admission_response_fd is not None and canonical_admission_request_fd is not None:
        from model_admission import ModelAdmissionDenied, validate_private_admission_fds
        try:
            validate_private_admission_fds(canonical_admission_response_fd, canonical_admission_request_fd)
        except ModelAdmissionDenied as exc:
            raise ContractError(str(exc)) from exc
        command += ["--canonical-admission-response-fd", str(canonical_admission_response_fd),
                    "--canonical-admission-request-fd", str(canonical_admission_request_fd)]
    environment = os.environ.copy()
    environment.pop("OPENAI_API_KEY", None)
    last_renewal = time.monotonic()
    with subprocess.Popen(command, cwd=HERE, env=environment,
                          pass_fds=(canonical_admission_response_fd, canonical_admission_request_fd)
                          if canonical_admission_response_fd is not None and canonical_admission_request_fd is not None else ()) as child:
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
    request = json.loads(args.request.read_text(encoding="utf-8"))
    _validate_request(request, repo)
    canonical_binding = json.loads(args.canonical_job_binding_file.read_text(encoding="utf-8")) if args.canonical_job_binding_file else None
    if canonical_binding:
        expected = {"jobId", "runId", "tenantId", "actorId", "attemptId", "fencingVersion"}
        if set(canonical_binding) != expected or not all(isinstance(canonical_binding[key], str) and canonical_binding[key] for key in ("jobId", "runId", "tenantId", "attemptId")) or type(canonical_binding["actorId"]) is not int or type(canonical_binding["fencingVersion"]) is not int or canonical_binding["fencingVersion"] < 1:
            raise ContractError("canonical job binding is invalid")
    task_id = str(canonical_binding["runId"]) if canonical_binding else str(uuid.uuid4())
    policy = AUTHORITY.load_source_policy(repo, args.policy)
    destination = Path(policy["source_root"]) / "developer-fast-lane" / task_id
    evidence = Path(args.evidence_root).resolve() / task_id
    contract_path = evidence / "contract.json"
    if canonical_binding and contract_path.is_file():
        contract = json.loads(contract_path.read_text(encoding="utf-8"))
        if contract.get("developerIdentity", {}).get("login") != identity["login"]:
            raise ContractError("canonical job resume identity or Developer identity changed")
        receipt_path = evidence / "authorization-receipt.json"
        continuation_path = evidence / "continuation-receipts.jsonl"
        original_receipt, receipt_digest = _verify_resume_scope(contract, request, canonical_binding, receipt_path)
        source_sha = str(contract.get("sourceRevision", ""))
        if not re.fullmatch(r"[a-f0-9]{40}", source_sha):
            raise ContractError("canonical WorkUnit source baseline is invalid")
        source_check = subprocess.run(
            ["git", "cat-file", "-e", f"{source_sha}^{{commit}}"], cwd=repo,
            text=True, capture_output=True, check=False,
        )
        if source_check.returncode:
            raise ContractError("original WorkUnit source commit is no longer available")
        grant = None
        try:
            grant = json.loads(args.continuation_grant_file.read_text(encoding="utf-8")) if args.continuation_grant_file else None
        except (OSError, json.JSONDecodeError) as exc:
            raise ContractError("WAITING_AUTHORIZATION: server continuation grant is unavailable") from exc
        if grant:
            grant = _validate_continuation_grant(
                grant, contract=contract, request=request, binding=canonical_binding,
                receipt_digest=receipt_digest, receipt_path=receipt_path,
                continuation_path=continuation_path,
            )
        elif float(contract.get("scopeExpiresAt", 0)) <= time.time():
            raise ContractError("WAITING_AUTHORIZATION: expired WorkUnit scope needs server reauthorization")
        claim = AUTHORITY.claim_registered_workspace(
            repo, args.policy, contract["workspaceId"], task_id=task_id,
            expected_head_sha=source_sha, developer_login=identity["login"],
            owner_session_id=_session_id(), owner_pid=os.getpid(), owner_lease_seconds=300,
        )
        if claim.get("workspaceId") != contract["workspaceId"] or claim.get("taskId") != task_id or claim.get("sourceSha") != source_sha:
            raise ContractError("workspace ownership transfer receipt does not match the original WorkUnit")
        if grant:
            prior_expiry = contract["scopeExpiresAt"]
            contract["originalScopeExpiresAt"] = contract.get("originalScopeExpiresAt", original_receipt["scopeExpiresAt"])
            contract["originalAuthorizationReceiptSha256"] = receipt_digest
            contract["scopeExpiresAt"] = grant["scopeExpiresAtEpoch"]
            contract["authorizationDigest"] = hashlib.sha256(json.dumps({
                "developer": contract["developerIdentity"], "taskId": contract["taskId"],
                "task": contract["requirementText"], "acceptanceCriteria": contract["acceptanceCriteria"],
                "sourceSha": contract["sourceRevision"], "workspaceId": contract["workspaceId"],
                "allowedFiles": contract["allowedFiles"], "writableFiles": contract["writableFiles"],
                "patchableFiles": contract["patchableFiles"], "allowedTools": contract["allowedTools"],
                "tests": contract["tests"], "browserUat": contract["browserUat"], "budget": contract["budget"],
                "expiresAt": contract["scopeExpiresAt"], "productionAccess": False,
                "sharedDatabaseWrite": False, "runnerDispatch": False,
                "canonicalJobIdentity": {key: canonical_binding[key] for key in ("jobId", "runId", "tenantId", "actorId")},
            }, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
            contract["sourceSpecDigest"] = contract["authorizationDigest"]
            continuation_receipt = {
                "schema": "spec224.developer-continuation-receipt.v1",
                "continuationId": grant["continuationId"], "jobId": canonical_binding["jobId"],
                "runId": task_id, "tenantId": canonical_binding["tenantId"], "actorId": canonical_binding["actorId"],
                "attemptId": canonical_binding["attemptId"], "fencingVersion": canonical_binding["fencingVersion"],
                "workspaceId": contract["workspaceId"], "sourceRevision": source_sha,
                "originalAuthorizationReceiptSha256": receipt_digest,
                "originalScopeExpiresAt": prior_expiry, "scopeExpiresAt": grant["scopeExpiresAt"],
                "claimReceiptId": claim.get("receiptId"), "ownerFencingVersion": claim.get("ownerFencingVersion"),
                "repositoryPermission": identity["permission"], "issuedAt": grant["issuedAt"],
            }
            with continuation_path.open("a", encoding="utf-8") as stream:
                stream.write(json.dumps(continuation_receipt, sort_keys=True) + "\n")
                stream.flush()
                os.fsync(stream.fileno())
        elif not contract.get("originalAuthorizationReceiptSha256"):
            contract["originalScopeExpiresAt"] = original_receipt["scopeExpiresAt"]
            contract["originalAuthorizationReceiptSha256"] = receipt_digest
        contract.setdefault("originalDeveloperIdentity", original_receipt["developerIdentity"])
        contract["developerIdentity"] = identity
        contract.update({
            "ownerSessionId": _session_id(), "ownerPid": os.getpid(),
            "ownerProcessStart": AUTHORITY._process_start(os.getpid()),
            "ownerFencingVersion": claim["ownerFencingVersion"],
            "workspaceLeaseExpiresAt": claim["leaseExpiresAt"],
            "canonicalJobBinding": canonical_binding,
        })
        contract["authorizationDigest"] = hashlib.sha256(json.dumps({
            "developer": contract["developerIdentity"], "taskId": contract["taskId"],
            "task": contract["requirementText"], "acceptanceCriteria": contract["acceptanceCriteria"],
            "sourceSha": contract["sourceRevision"], "workspaceId": contract["workspaceId"],
            "allowedFiles": contract["allowedFiles"], "writableFiles": contract["writableFiles"],
            "patchableFiles": contract["patchableFiles"], "allowedTools": contract["allowedTools"],
            "tests": contract["tests"], "browserUat": contract["browserUat"], "budget": contract["budget"],
            "expiresAt": contract["scopeExpiresAt"], "productionAccess": False,
            "sharedDatabaseWrite": False, "runnerDispatch": False,
            "canonicalJobIdentity": {key: canonical_binding[key] for key in ("jobId", "runId", "tenantId", "actorId")},
        }, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        contract["sourceSpecDigest"] = contract["authorizationDigest"]
        _write_json(contract_path, contract)
        return _run(contract_path, evidence, crash_at=args.crash_at, run_id=canonical_binding["runId"],
                    canonical_admission_response_fd=args.canonical_admission_response_fd,
                    canonical_admission_request_fd=args.canonical_admission_request_fd)
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
    registered = AUTHORITY.create_registered_worktree(
        repo, args.policy, destination, base_sha=base_sha, role="TASK_WORKTREE",
        task_id=task_id, session_id=_session_id(), owner_pid=os.getpid(), owner_lease_seconds=300,
    )
    workspace = Path(registered["workspace"]).resolve()
    scope_expires_at = time.time() + args.scope_ttl_seconds
    contract = _request_contract(request, identity=identity, workspace=workspace, registered=registered,
                                 task_id=task_id, scope_expires_at=scope_expires_at,
                                 canonical_binding=canonical_binding)
    evidence.mkdir(parents=True, exist_ok=True, mode=0o700)
    contract_path = evidence / "contract.json"
    _write_json(contract_path, contract)
    authorization_receipt = {
        "schema": "developer-local-workunit-authorization.v1", "taskId": task_id,
        "workspaceId": registered["workspace_id"], "sourceSha": base_sha,
        "developerIdentity": identity, "ownerSessionId": _session_id(), "ownerPid": os.getpid(),
        "ownerFencingVersion": registered["owner_fencing_version"],
        "allowedFiles": contract["allowedFiles"], "writableFiles": contract["writableFiles"],
        "allowedTools": contract["allowedTools"], "budget": contract["budget"],
        "scopeExpiresAt": scope_expires_at, "productionAccess": False, "runnerDispatch": False,
    }
    authorization_receipt_path = evidence / "authorization-receipt.json"
    _write_json(authorization_receipt_path, authorization_receipt)
    os.chmod(authorization_receipt_path, 0o400)
    contract["originalScopeExpiresAt"] = scope_expires_at
    contract["originalAuthorizationReceiptSha256"] = hashlib.sha256(authorization_receipt_path.read_bytes()).hexdigest()
    _write_json(contract_path, contract)
    return _run(contract_path, evidence, crash_at=args.crash_at,
                run_id=canonical_binding["runId"] if canonical_binding else None,
                canonical_admission_response_fd=args.canonical_admission_response_fd,
                canonical_admission_request_fd=args.canonical_admission_request_fd)


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
    new.add_argument("--canonical-job-binding-file", type=Path)
    new.add_argument("--continuation-grant-file", type=Path)
    new.add_argument("--canonical-admission-response-fd", type=int)
    new.add_argument("--canonical-admission-request-fd", type=int)
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
