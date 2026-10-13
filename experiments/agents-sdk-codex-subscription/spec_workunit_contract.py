"""Validate a scoped SPEC WorkUnit contract against canonical handoff state.

The contract is conductor supplied. Model output can never widen its authority
or provide a subprocess command.
"""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import subprocess
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
            return ["python3", "-m", "pytest", "-q", *self.test_paths]
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
    if not isinstance(raw, dict) or raw.get("schema") != "agents-sdk-spec-workunit-contract.v1":
        raise ContractError("unsupported WorkUnit contract schema")

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
    if not re.fullmatch(r"SPEC-[0-9]{3,4}", spec_id) or not re.fullmatch(r"REQ-[A-F0-9]{12}", requirement_id):
        raise ContractError("SPEC or requirement identity is invalid")
    if not re.fullmatch(r"[A-Z0-9][A-Z0-9_-]{2,95}", work_unit):
        raise ContractError("WorkUnit identity is invalid")

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
        raise ContractError("contract requirement text/digest differs from the canonical ledger")
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
    if not isinstance(authority, dict) or authority.get("source") != "canonical-spec-handoff":
        raise ContractError("authority must come from the canonical SPEC handoff")
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
    caps = {"maxAttempts": (1, 4), "implementationMaxTurns": (1, 30), "planMaxTurns": (1, 8), "reviewMaxTurns": (1, 8)}
    values: dict[str, int] = {}
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

    return WorkUnitContract(
        raw=raw, root=root, spec_id=spec_id, work_unit=work_unit,
        requirement_id=requirement_id, requirement_text=canonical_text,
        requirement_digest=canonical_digest, source_revision=head,
        workspace_id=workspace_id, task_id=task_id, owner_session_id=owner_session_id, allowed_files=allowed,
        writable_files=writable, test_paths=test_paths,
        acceptance=tuple(acceptance), max_attempts=values["maxAttempts"],
        implementation_max_turns=values["implementationMaxTurns"],
        plan_max_turns=values["planMaxTurns"], review_max_turns=values["reviewMaxTurns"],
        browser_uat=browser_uat, database_mode=database_mode,
    )
