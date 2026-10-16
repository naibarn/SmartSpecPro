"""SPEC WorkUnit entry point reusing the durable Agents SDK/Codex runtime.

This deliberately exposes a fixed repository allowlist and one fixed focused
test command; model output never becomes shell input.
"""
from __future__ import annotations

import hashlib
import difflib
import json
import os
import re
import subprocess
import sys
import time
import uuid
from collections import Counter
from contextlib import nullcontext
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from agents import Runner, RunHooks, SQLiteSession, set_tracing_disabled
from agents.exceptions import MaxTurnsExceeded
from agents.run_state import RunState

from adaptive_routing import LUNA_MODEL_ID, RoutingConfigurationError, classify_failure, select_profile
from durable_store import DurableRunStore
from model_admission import ModelAdmissionDenied, ModelAdmissionWait
from run_experiment import (
    make_agent, maybe_crash, now, parse_result_json,
    run_browser_uat as run_miniapp_browser_uat,
)
from spec_workunit_contract import WorkUnitContract, load_contract

EXPERIMENT_ROOT = Path(__file__).resolve().parents[2]
REPLANNER_INSTRUCTIONS = (
    "Revise the prior implementation plan in response to concrete test/reviewer/source evidence. "
    "Keep all work within the validated WorkUnit authority. This planner receives read-only tools; "
    "that does not describe the implementation agent's tools. The next implementation phase receives "
    "scoped patch_file and write_file tools from the validated contract. Do not tell the implementer "
    "that writes are unavailable or prohibited when the contract authorizes them; use only those "
    "registered host tools, never shell or an alternate write channel. Return JSON "
    "{task_instruction:string, acceptance:string[]}; include a specific changed strategy."
)


class CapacityWaitError(RuntimeError):
    pass


class UnproductiveImplementationPhase(RuntimeError):
    """A durable implementation checkpoint needs a fresh plan, not more of the same tool retries."""


class NoProgressPhaseError(RuntimeError):
    """MaxTurnsExceeded repeated without a completed turn, receipt, source, or test delta."""


class BoundedTurnBudgetExceeded(RuntimeError):
    """A validated Developer WorkUnit needs additional scoped authorization."""


def turn_budget_group(phase: str) -> str:
    if phase == "planning" or re.fullmatch(r"planning-\d+", phase) or phase == "replanning":
        return "planning"
    if phase == "implementation":
        return "implementation"
    if phase in {"review", "verification"}:
        return "review"
    raise BoundedTurnBudgetExceeded(f"Unrecognized bounded phase: {phase}")


class BoundedFastLaneTurns:
    """Use the existing immutable event journal, counting SDK turns, not tokens/calls.

    Attempt/fencing changes and scope renewals never reset these allowances.
    Limits come only from the contract already validated by load_contract.
    """
    def __init__(self, store: DurableRunStore, contract: WorkUnitContract):
        self.store = store
        authorization = contract.raw.get("continuationBudgetAuthorization")
        if authorization:
            binding = contract.raw.get("canonicalJobBinding") or {}
            expected = {key: binding.get(key) for key in ("jobId", "runId", "tenantId", "actorId")}
            expected.update(workspaceId=contract.raw.get("workspaceId"), sourceRevision=contract.raw.get("sourceRevision"),
                            originalAuthorizationReceiptSha256=contract.raw.get("originalAuthorizationReceiptSha256"))
            try:
                expiry = datetime.fromisoformat(authorization["expiresAt"]).timestamp()
                valid = (all(authorization.get(key) == value and value is not None for key, value in expected.items())
                         and expiry > time.time() and float(contract.raw["scopeExpiresAt"]) <= expiry
                         and bool(authorization["authorizationReference"]))
            except (KeyError, TypeError, ValueError):
                valid = False
            if not valid:
                raise BoundedTurnBudgetExceeded("Scoped continuation budget authority is invalid or expired")
        effective_budget = authorization["budget"] if authorization else {
            "planMaxTurns": contract.plan_max_turns, "implementationMaxTurns": contract.implementation_max_turns,
            "reviewMaxTurns": contract.review_max_turns, "maxAttempts": contract.raw["budget"].get("maxAttempts", 3),
        }
        self.limits = {"planning": effective_budget["planMaxTurns"], "implementation": effective_budget["implementationMaxTurns"],
                       "review": effective_budget["reviewMaxTurns"]}
        self.max_attempts = effective_budget.get("maxAttempts", 3)
        if any(type(value) is not int or value < 1 for value in (*self.limits.values(), self.max_attempts)) or (
                authorization and (self.limits["planning"] > 8 or self.limits["implementation"] > 30
                                   or self.limits["review"] > 8 or self.max_attempts > 3)):
            raise BoundedTurnBudgetExceeded("Validated turn/attempt allowance is missing or invalid")
        store.event("workunit.turn_budget.bound", {"contractDigest": contract.digest, "limits": self.limits,
                                                   "maxAttempts": self.max_attempts},
                    stable_key=f"workunit:turn-budget:{contract.digest}")

    def counts(self) -> dict[str, int]:
        counts = {}
        for row in self.store.connection.execute("SELECT phase_id,checkpoint_json FROM phases"):
            events = self.store.connection.execute(
                "SELECT payload_json FROM events WHERE kind='workunit.sdk_turn.admitted' AND json_extract(payload_json,'$.phaseId')=?",
                (row["phase_id"],),
            ).fetchall()
            if events:
                counts[row["phase_id"]] = max(json.loads(event[0])["sdkTurn"] for event in events)
            else:
                # Older in-progress runs have no admission journal. A serialized
                # SDK cursor is conservative evidence; model-call counts are not
                # interchangeable with SDK turns. Ambiguity must fail closed.
                checkpoint = json.loads(row["checkpoint_json"]) if row["checkpoint_json"] else {}
                cursor = checkpoint.get("current_turn")
                has_calls = self.store.connection.execute("SELECT 1 FROM model_calls WHERE phase_id=? LIMIT 1", (row["phase_id"],)).fetchone()
                if (checkpoint and (type(cursor) is not int or cursor < 0)) or (has_calls and (type(cursor) is not int or cursor < 1)):
                    raise BoundedTurnBudgetExceeded("Legacy SDK turn consumption requires reconciliation")
                counts[row["phase_id"]] = cursor if type(cursor) is int and cursor > 0 else 0
        return counts

    def allowance(self, phase: str, attempt: int) -> tuple[int, int, int]:
        group = turn_budget_group(phase)
        if attempt > self.max_attempts:
            raise BoundedTurnBudgetExceeded("Authorized WorkUnit attempt allowance exhausted")
        counts = self.counts()
        used_elsewhere = sum(counts[row["phase_id"]] for row in self.store.connection.execute("SELECT phase_id,name FROM phases")
                             if row["phase_id"] != self.store.phase_id(phase, attempt) and turn_budget_group(row["name"]) == group)
        consumed_here = counts.get(self.store.phase_id(phase, attempt), 0)
        return self.limits[group] - used_elsewhere, consumed_here, used_elsewhere + consumed_here

    def admit(self, phase: str, attempt: int, sdk_turn: int) -> None:
        limit, consumed, _ = self.allowance(phase, attempt)
        if type(sdk_turn) is not int or sdk_turn < 1 or sdk_turn > limit:
            raise BoundedTurnBudgetExceeded("Authorized aggregate SDK turn allowance exhausted")
        # A restart may replay the same SDK turn to reconcile its existing model
        # receipt. It gets no new allowance and the model's own durable identity
        # prevents provider redispatch. Gaps are ambiguous, never free capacity.
        if sdk_turn > consumed + 1:
            raise BoundedTurnBudgetExceeded("SDK turn cursor requires reconciliation")
        self.store.event("workunit.sdk_turn.admitted", {
            "phaseId": self.store.phase_id(phase, attempt), "group": turn_budget_group(phase), "sdkTurn": sdk_turn,
        }, stable_key=f"workunit:sdk-turn:{self.store.phase_id(phase, attempt)}:{sdk_turn}")


def bounded_fast_lane_turns(store: DurableRunStore) -> BoundedFastLaneTurns | None:
    contract = getattr(store, "validated_workunit_contract", None)
    if contract is None or contract.raw.get("schema") != "agents-sdk-developer-workunit-contract.v1":
        return None
    return BoundedFastLaneTurns(store, contract)


def park_bounded_turn_budget(store: DurableRunStore, phase: str, attempt: int, detail: str) -> None:
    store.state.update(status="WAITING_AUTHORIZATION", functionalDeliveryStatus="PARTIAL_CONTINUABLE",
                       nextAction="authorize_additional_scoped_turn_budget")
    evidence = {"phaseId": store.phase_id(phase, attempt), "phase": phase, "attempt": attempt, "detail": detail}
    store.state["boundedTurnBudgetExhausted"] = evidence
    store.event("workunit.turn_budget.exhausted", evidence,
                stable_key=f"workunit:turn-budget-exhausted:{hashlib.sha256(json.dumps(evidence, sort_keys=True).encode()).hexdigest()}")
    store.commit_state()
    raise SystemExit(75)


def luna_repair_failure_evidence(store: DurableRunStore, iterations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return only real code-failure receipts after a persisted Luna repair call."""
    by_iteration = {item.get("iteration"): item for item in iterations if isinstance(item, dict)}
    evidence = []
    rows = store.connection.execute(
        """SELECT m.role,m.status,m.selection_json,p.name,p.attempt
           FROM model_calls m JOIN phases p ON p.phase_id=m.phase_id
           WHERE p.name='implementation' AND m.status='completed' ORDER BY m.rowid"""
    ).fetchall()
    for row in rows:
        if row["role"] not in {"implementer", "repairer"}:
            continue
        try:
            selection = json.loads(row["selection_json"] or "{}")
        except (TypeError, ValueError, json.JSONDecodeError):
            continue
        attempt = int(row["attempt"])
        if selection.get("requestedModel") != LUNA_MODEL_ID or attempt < 2:
            continue
        prior = by_iteration.get(attempt - 1, {}).get("testReceipt") or {}
        after = by_iteration.get(attempt, {}).get("testReceipt") or {}
        prior_category, _ = classify_failure(
            "\n".join(str(prior.get(key) or "") for key in ("stderr", "stdout")),
            exit_code=prior.get("exitCode"), tests_executed=not bool(prior.get("missingTestPaths")),
            signal=prior.get("signal") or prior.get("terminationSignal"),
        )
        after_category, signature = classify_failure(
            "\n".join(str(after.get(key) or "") for key in ("stderr", "stdout")),
            exit_code=after.get("exitCode"), tests_executed=not bool(after.get("missingTestPaths")),
            signal=after.get("signal") or after.get("terminationSignal"),
        )
        if prior_category == "code_failure" and after_category == "code_failure":
            evidence.append({
                "category": after_category, "signature": signature, "iteration": attempt,
                "requestedModel": LUNA_MODEL_ID, "repairAttempted": True,
                "sourceRevision": after.get("revision") or after.get("sourceRevision"),
            })
    return evidence


def make_workunit_agent(role: str, instructions: str, repo_tools: Any, agent_tools: list[Any], on_receipt: Any,
                        store: DurableRunStore, phase_id: str, task_context: str) -> Any:
    profile, reason, evidence = select_profile(role, task_context, store.state.get("iterations", []))
    authorization_json = os.environ.get("SMARTSPEC_CODEX_ESCALATION_AUTHORIZATION")
    try:
        escalation_authorization = json.loads(authorization_json) if authorization_json else None
    except json.JSONDecodeError as exc:
        raise RoutingConfigurationError("SMARTSPEC_CODEX_ESCALATION_AUTHORIZATION must be valid JSON") from exc
    if escalation_authorization is not None and not isinstance(escalation_authorization, dict):
        raise RoutingConfigurationError("SMARTSPEC_CODEX_ESCALATION_AUTHORIZATION must be a JSON object")
    if escalation_authorization:
        iterations = store.state.get("iterations", [])
        latest_iteration = max(
            (item for item in iterations if isinstance(item, dict) and isinstance(item.get("iteration"), int)),
            key=lambda item: item["iteration"], default={},
        )
        latest_test = latest_iteration.get("testReceipt") or {}
        if latest_test.get("exitCode") == 0 or bool((latest_iteration.get("review") or {}).get("complete")):
            escalation_authorization = None
    if escalation_authorization:
        repair_failure_evidence = luna_repair_failure_evidence(store, store.state.get("iterations", []))
        escalation_authorization = {
            **escalation_authorization,
            "lunaRepairAttempted": bool(repair_failure_evidence),
            "failureEvidence": repair_failure_evidence,
        }
    if escalation_authorization and os.environ.get("SMARTSPEC_CODEX_ASTRA_OPT_IN") == "true":
        escalation_authorization = {**escalation_authorization, "astraOptIn": True}
    routing = {"profile": profile.value, "selectionReason": reason, "failureEvidence": evidence,
               "escalationAuthorization": escalation_authorization}
    admission = getattr(store, "model_admission_transport", None)
    return make_agent(
        role, instructions, repo_tools, on_receipt, agent_tools, store, phase_id,
        routing=routing, admission=admission,
        admission_required=bool(store.state.get("canonicalModelAdmissionRequired")),
    )


def repeated_patch_rejection_reason(receipts: list[dict[str, Any]], minimum: int = 3) -> tuple[str, int] | None:
    reasons: Counter[str] = Counter()
    examples: dict[str, str] = {}
    trailing_errors: list[tuple[str, str]] = []
    for row in receipts:
        if row.get("tool") != "patch_file":
            continue
        if row.get("status") == "completed":
            trailing_errors.clear()
            continue
        if row.get("status") != "superseded":
            continue
        try:
            error = json.loads(str(row.get("result_json") or "{}")).get("error")
        except json.JSONDecodeError:
            continue
        if error:
            original = str(error)
            signature = re.sub(r" at line \d+", " at line <line>", original)
            signature = re.sub(r"\(matched \d+\)", "(matched <count>)", signature)
            trailing_errors.append((signature, original))
    for signature, original in trailing_errors:
        reasons[signature] += 1
        examples.setdefault(signature, original)
    reason, count = reasons.most_common(1)[0] if reasons else ("", 0)
    return (examples.get(reason, reason), count) if count >= minimum else None


def repeated_patch_rejection_for_phase(store: DurableRunStore, phase: str, attempt: int) -> tuple[str, int] | None:
    # Scoped tools use stable human-readable phase keys (for example,
    # implementation-2); Agents SDK RunState rows use UUID phase IDs.
    tool_phase_id = f"{phase}-{attempt}"
    rows = store.connection.execute(
        "SELECT tool,status,result_json FROM tool_receipts WHERE phase_id=? AND tool='patch_file' ORDER BY updated_at,rowid",
        (tool_phase_id,),
    ).fetchall()
    return repeated_patch_rejection_reason([dict(row) for row in rows])


def unexecuted_patch_dispatch_streak(model_calls: list[dict[str, Any]], receipts: list[dict[str, Any]]) -> int:
    """Count trailing patch dispatches that the Agents SDK did not execute as host tools."""
    ordered_calls = sorted(model_calls, key=lambda row: str(row.get("updated_at", "")))
    ordered_receipts = sorted(receipts, key=lambda row: str(row.get("updated_at", "")))
    streak = 0
    for index, call in enumerate(ordered_calls):
        try:
            dispatch = json.loads(str(call.get("response_text") or "{}"))
        except json.JSONDecodeError:
            streak = 0
            continue
        if dispatch.get("action") != "call_tool" or dispatch.get("name") != "patch_file":
            streak = 0
            continue
        call_time = str(call.get("updated_at", ""))
        next_call_time = str(ordered_calls[index + 1].get("updated_at", "")) if index + 1 < len(ordered_calls) else "\uffff"
        was_executed = any(
            call_time <= str(row.get("updated_at", "")) <= next_call_time
            for row in ordered_receipts
        )
        streak = 0 if was_executed else streak + 1
    return streak


def is_capacity_error(error: BaseException) -> bool:
    """Recognize temporary subscription capacity errors without treating code errors as waits."""
    if isinstance(error, CapacityWaitError):
        return True
    if isinstance(error, RoutingConfigurationError):
        return False
    status = getattr(error, "status_code", None) or getattr(error, "http_status", None)
    if status is not None:
        return status == 429
    text = f"{type(error).__name__}: {error}".lower()
    message_status = re.search(r"\bhttp(?:/\d(?:\.\d)?)?(?:\s+error)?\s*(\d{3})\b|\bstatus(?:_code| code)?\s*[=:]\s*(\d{3})\b", text)
    if message_status:
        return int(message_status.group(1) or message_status.group(2)) == 429
    return bool(re.search(
        r"\brate[_ ]limit\b|(?:\bquota\b.{0,24}\b(?:exhaust(?:ed|ion)?|exceed(?:ed)?|limit|reached)\b|"
        r"\b(?:exhaust(?:ed|ion)?|exceed(?:ed)?).{0,24}\bquota\b)|"
        r"\bcapacity\s+(?:unavailable|exhausted|exceeded|busy)\b|\bserver (?:is )?overloaded\b|"
        r"\btoo many requests\b|\busage limit\b|"
        r"\bresource exhausted\b|\bhttp\s*429\b|\b429 too many requests\b",
        text,
    ))


def capacity_retry_after(state: dict[str, Any], *, now_utc: datetime | None = None) -> str:
    count = int(state.get("capacityWaitCount", 0)) + 1
    state["capacityWaitCount"] = count
    delay_seconds = min(30 * (2 ** min(count - 1, 5)), 900)
    return ((now_utc or datetime.now(timezone.utc)) + timedelta(seconds=delay_seconds)).isoformat()


def next_turn_limit(current_limit: int, segment_limit: int) -> int:
    """Extend a bounded Agents SDK segment while preserving its RunState identity."""
    return current_limit + segment_limit


def changed_source_paths(before: dict[str, str], after: dict[str, str]) -> list[str]:
    return sorted(path for path in set(before) | set(after) if before.get(path) != after.get(path))


def iteration_evidence_summary(iterations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Reference durable source/test history without replaying full logs into each phase."""
    summary = []
    for item in iterations:
        if not isinstance(item, dict):
            continue
        receipt = item.get("testReceipt")
        receipt = receipt if isinstance(receipt, dict) else {}
        failure_text = "\n".join(str(receipt.get(key) or "") for key in ("stderr", "stdout"))
        category, signature = classify_failure(
            failure_text, exit_code=receipt.get("exitCode"),
            tests_executed=not bool(receipt.get("missingTestPaths")),
            signal=receipt.get("signal") or receipt.get("terminationSignal"),
        )
        summary.append({
            "iteration": item.get("iteration"),
            "changedPaths": item.get("changedPaths", []),
            "testReceiptRef": f"run-state.json#/iterations/{item.get('iteration')}/testReceipt",
            "test": {
                "exitCode": receipt.get("exitCode"),
                "revision": receipt.get("revision"),
                "sourceRevision": receipt.get("sourceRevision"),
                "changedPaths": receipt.get("changedPaths", []),
                "failureCategory": category,
                "failureSignature": signature,
                "stdoutBytes": len(str(receipt.get("stdout") or "").encode("utf-8")),
                "stderrBytes": len(str(receipt.get("stderr") or "").encode("utf-8")),
            },
        })
    return summary


CONTRACT_SCOPE_FIELDS = (
    "specId", "workUnit", "requirementId", "requirementDigest", "requirementText",
    "sourceRevision", "workspaceId", "taskId", "ownerSessionId",
    "workspace", "allowedFiles", "writableFiles", "patchableFiles", "tests", "authority",
    "browserUat", "acceptanceCriteria", "allowedTools",
    "developerIdentity",
)


def contract_scope_snapshot(raw: dict[str, Any]) -> dict[str, Any]:
    """Capture the authority and acceptance surface, excluding editable guidance/budget."""
    snapshot = {field: raw.get(field) for field in CONTRACT_SCOPE_FIELDS}
    if raw.get("schema") == "agents-sdk-developer-workunit-contract.v1":
        snapshot.pop("ownerSessionId", None)
    binding = raw.get("canonicalJobBinding")
    if isinstance(binding, dict):
        snapshot["canonicalJobIdentity"] = {key: binding.get(key) for key in ("jobId", "runId", "tenantId", "actorId")}
    return snapshot


def prior_contract_scope_from_model_calls(store: DurableRunStore) -> dict[str, Any] | None:
    """Recover the original scope for runs created before it was projected in RunState."""
    rows = store.connection.execute(
        "SELECT request_json FROM model_calls WHERE role LIKE 'planner_%' ORDER BY rowid"
    ).fetchall()
    for row in rows:
        try:
            envelope = json.loads(row["request_json"])
            match = re.search(r"Request JSON:\n(.*)", str(envelope.get("instruction", "")), re.S)
            if not match:
                continue
            request = json.loads(match.group(1))
            messages = request.get("input", [])
            content = messages[0].get("content") if messages and isinstance(messages[0], dict) else None
            payload = json.loads(content) if isinstance(content, str) else None
            scope = payload.get("workunit_scope") if isinstance(payload, dict) else None
            if not isinstance(scope, dict):
                continue
            restored = dict(scope)
            restored["requirementText"] = payload.get("canonical_requirement")
            restored["acceptanceCriteria"] = payload.get("acceptanceCriteria")
            return contract_scope_snapshot(restored)
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            continue
    return None


def is_ready_for_user_test(test_receipt: dict[str, Any], review: dict[str, Any] | None,
                           verification: dict[str, Any] | None, pending_receipts: list[Any]) -> bool:
    """Require independent confirmation of a usable slice without closing the SPEC requirement."""
    return bool(
        test_receipt.get("exitCode") == 0
        and not pending_receipts
        and review and review.get("functionalReadyForUserTest") is True
        and verification and verification.get("functionalReadyForUserTest") is True
    )


def browser_source_hash(contract: WorkUnitContract) -> str:
    """Hash only the contract-authorized browser app files, matching its UAT receipt."""
    browser = contract.browser_uat or {}
    project_path = Path(str(browser.get("projectPath", ""))).as_posix().rstrip("/")
    files = []
    for relative in sorted(contract.allowed_files):
        if not relative.startswith(project_path + "/"):
            continue
        target = contract.root / relative
        if target.is_file() and target.suffix.lower() in {".html", ".js", ".mjs", ".css"}:
            files.append([Path(relative).name, hashlib.sha256(target.read_bytes()).hexdigest()])
    return hashlib.sha256(json.dumps(files, separators=(",", ":")).encode()).hexdigest()


def project_browser_uat(contract: WorkUnitContract, run_id: str, receipts: list[dict[str, Any]],
                        pending_receipts: list[Any]) -> dict[str, Any]:
    """Project a Browser UAT result only from a completed, run/source/workspace-bound receipt."""
    browser = contract.browser_uat
    if browser is None or browser.get("status") != "configured":
        return {"status": "UNVERIFIED", "reason": "No authorized browser UAT adapter is configured in this WorkUnit contract"}
    if pending_receipts:
        return {"status": "PENDING", "reason": "Unresolved tool receipts remain", "pendingToolReceiptCount": len(pending_receipts)}
    if not receipts:
        return {"status": "PENDING", "reason": "No completed Browser UAT receipt exists for this run"}

    receipt = receipts[0]
    result = receipt.get("result")
    if isinstance(result, str):
        try:
            result = json.loads(result)
        except json.JSONDecodeError:
            result = None
    result = result if isinstance(result, dict) else receipt
    expected_source = browser_source_hash(contract)
    expected = {
        "runId": run_id,
        "taskId": contract.task_id,
        "workspaceId": contract.workspace_id,
        "workspace": str(contract.root),
        "sourceRevision": contract.source_revision,
        "projectPath": str(browser.get("projectPath", "")),
        "contractSourceSha256": expected_source,
        "sourceSha256": expected_source,
        "toolOperationId": receipt.get("operation_id"),
    }
    mismatches = [key for key, value in expected.items() if result.get(key) != value]
    if mismatches:
        return {"status": "FAILED", "reason": "Browser receipt binding mismatch", "mismatchedBindings": mismatches,
                "runId": run_id, "sourceRevision": contract.source_revision, "workspaceId": contract.workspace_id}
    if receipt.get("status", "completed") != "completed":
        return {"status": "PENDING", "reason": "Browser tool receipt is not completed", "runId": run_id}
    browser_result = result.get("result")
    runner = result.get("runner") if isinstance(result.get("runner"), dict) else {}
    if (result.get("schema") != "agents-sdk-miniapp-browser-uat.v1" or browser_result != "PASS"
            or runner.get("exitCode") != 0 or result.get("pageErrors")
            or result.get("unexpectedConsoleErrors") or result.get("blockedExternalRequests")):
        return {"status": "FAILED", "reason": "Browser UAT did not pass cleanly", "browserResult": browser_result,
                "runId": run_id, "sourceRevision": contract.source_revision, "workspaceId": contract.workspace_id,
                "sourceSha256": result.get("contractSourceSha256")}
    return {"status": "PASS", "runId": run_id, "taskId": contract.task_id,
            "workspaceId": contract.workspace_id, "workspace": str(contract.root),
            "sourceRevision": contract.source_revision, "sourceSha256": result["contractSourceSha256"],
            "browserResult": "PASS", "toolOperationId": receipt.get("operation_id"),
            "browserOperationId": result.get("operationId"),
            "completedToolReceipt": True, "pendingToolReceiptCount": 0}


def terminal_workunit_status(normative_complete: bool, ready_for_user_test: bool, browser_required: bool,
                             browser_status: str, pending_receipt_count: int) -> str:
    """Keep normative WorkUnit completion distinct from functional Browser UAT."""
    if pending_receipt_count:
        return "PARTIAL_CONTINUABLE"
    if normative_complete:
        if browser_required and browser_status != "PASS":
            return "awaiting_browser_uat"
        return "VERIFIED_COMPLETE"
    if ready_for_user_test:
        return "IMPLEMENTED_READY_FOR_USER_TEST"
    return "PARTIAL_CONTINUABLE"


def source_hashes(contract: WorkUnitContract) -> dict[str, str]:
    return {p: hashlib.sha256((contract.root / p).read_bytes()).hexdigest() for p in contract.allowed_files if (contract.root / p).is_file()}

def cumulative_source_paths(iterations: list[dict[str, Any]], current_paths: list[str]) -> list[str]:
    """Keep every still-relevant path from prior cycles visible to later phases."""
    paths = set(current_paths)
    for iteration in iterations:
        changed = iteration.get("changedPaths", [])
        if isinstance(changed, list):
            paths.update(path for path in changed if isinstance(path, str))
    return sorted(paths)

def source_diff_from_baseline(contract: WorkUnitContract) -> tuple[list[str], str]:
    """Return the current allowlisted diff against the contract's original revision."""
    result = subprocess.run(
        ["git", "diff", "--no-ext-diff", "--unified=8", contract.source_revision, "--", *contract.allowed_files],
        cwd=contract.root, text=True, capture_output=True, check=True,
    )
    names = subprocess.run(
        ["git", "diff", "--name-only", contract.source_revision, "--", *contract.allowed_files],
        cwd=contract.root, text=True, capture_output=True, check=True,
    )
    tracked = {path for path in names.stdout.splitlines() if path}
    untracked = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard", "--", *contract.allowed_files],
        cwd=contract.root, text=True, capture_output=True, check=True,
    )
    added = {path for path in untracked.stdout.splitlines() if path in contract.allowed_files}
    extra_diff = []
    for path in sorted(added - tracked):
        target = contract.root / path
        if not target.is_file():
            continue
        lines = target.read_text(encoding="utf-8", errors="replace").splitlines(keepends=True)
        extra_diff.extend(difflib.unified_diff([], lines, fromfile="/dev/null", tofile=path))
    return sorted(tracked | added), (result.stdout + ("\n" if result.stdout and extra_diff else "") + "".join(extra_diff))[:60000]


def reconcile_interrupted_write_intents(store: DurableRunStore, contract: WorkUnitContract) -> list[dict[str, Any]]:
    """Settle completed file writes after a crash without replaying or overwriting them."""
    settled = []
    for row in store.pending_tool_receipts():
        if row.get("tool") != "write_file":
            continue
        operation_id = row["operation_id"]
        try:
            value = json.loads(row.get("input_json") or "{}")
            path, content = value.get("path"), value.get("content")
            if path not in contract.writable_files or not isinstance(content, str):
                store.supersede_tool(operation_id, {"status": "UNVERIFIED", "reason": "interrupted write is outside the current task allowlist"}, reason="write intent cannot be safely reconciled")
                continue
            target = contract.root / path
            expected = hashlib.sha256(content.encode()).hexdigest()
            actual = hashlib.sha256(target.read_bytes()).hexdigest() if target.is_file() else None
            if actual == expected:
                receipt = {"message": f"Reconciled interrupted write {path}; sha256={expected}", "sha256": expected}
                store.complete_tool(operation_id, receipt, effect_hash=expected, recovered=True)
                settled.append({"operationId": operation_id, "path": path, "status": "RECOVERED_EXACT_EFFECT"})
            else:
                store.supersede_tool(operation_id, {"status": "SUPERSEDED", "expectedSha256": expected, "currentSha256": actual}, reason="interrupted write effect differs; recovery does not overwrite current source")
                settled.append({"operationId": operation_id, "path": path, "status": "SUPERSEDED_SOURCE_CHANGED"})
        except Exception as exc:
            store.event("tool.intent.reconciliation_failed", {"operationId": operation_id, "tool": "write_file", "error": f"{type(exc).__name__}: {exc}"})
    if settled:
        store.event("tool.write_intents.reconciled", {"receipts": settled}, stable_key=f"tool:write-intents-reconciled:{store.run_id}:{len(settled)}")
    return settled

def task_source_context(contract: WorkUnitContract) -> dict[str, str]:
    """Capture bounded context ranges declared by the trusted WorkUnit contract."""
    windows = contract.raw.get("contextRanges", {})
    result = {}
    remaining_chars = 24000
    for path, spans in windows.items():
        if path not in contract.allowed_files or not isinstance(spans, list):
            raise ValueError("contextRanges must reference allowlisted files and line spans")
        lines = (contract.root / path).read_text(encoding="utf-8").splitlines()
        chunks = []
        for span in spans:
            if not isinstance(span, list) or len(span) != 2:
                raise ValueError("each context range must be [startLine, endLine]")
            start, end = span
            if type(start) is not int or type(end) is not int or start < 1 or end < start or end - start > 300:
                raise ValueError("context ranges are limited to 301 lines")
            chunk = "\n".join(f"{i}: {lines[i-1]}" for i in range(start, min(end, len(lines)) + 1))
            chunk = chunk[:remaining_chars]
            remaining_chars -= len(chunk)
            if chunk:
                chunks.append(chunk)
            if remaining_chars <= 0:
                break
        result[path] = "\n\n".join(chunks)
        if remaining_chars <= 0:
            break
    return result


class ScopedRepoTools:
    def __init__(self, store: DurableRunStore, phase_id: str, writable: bool, contract: WorkUnitContract):
        self.store, self.phase_id, self.writable = store, phase_id, writable
        self.contract = contract
        self.root = contract.root

    def _path(self, path: str) -> Path:
        if path not in self.contract.allowed_files:
            raise PermissionError("Path is outside this validated WorkUnit allowlist")
        target = (self.root / path).resolve()
        if target == self.root or self.root not in target.parents:
            raise PermissionError("Path resolves outside the selected task worktree")
        return target

    def _assert_current_owner(self) -> None:
        if self.contract.raw.get("schema") == "agents-sdk-developer-workunit-contract.v1":
            from spec_workunit_contract import verify_developer_workspace_claim
            verify_developer_workspace_claim(self.root, self.contract.raw)

    def list_files(self) -> list[str]:
        """List only files named by the validated WorkUnit contract."""
        return [p for p in self.contract.allowed_files if self._path(p).is_file()]

    def read_file(self, path: str) -> str:
        """Read an allowlisted source file. This tool is read-only."""
        target = self._path(path)
        return target.read_text(encoding="utf-8")[:20000] if target.exists() else "<file does not exist>"

    def read_range(self, path: str, start_line: int, end_line: int) -> str:
        """Read at most 300 lines from an allowlisted file; read-only source inspection."""
        target = self._path(path)
        if start_line < 1 or end_line < start_line or end_line - start_line > 300:
            raise ValueError("Read range must be at most 300 lines")
        lines = target.read_text(encoding="utf-8").splitlines()
        return "\n".join(f"{i}: {lines[i-1]}" for i in range(start_line, min(end_line, len(lines)) + 1))

    def write_file(self, path: str, content: str) -> str:
        """Write an allowlisted small source/test/migration file inside this task worktree. This is an authorized host-executed write; never use shell writes."""
        if not self.writable:
            raise PermissionError("Review tools are read-only")
        self._assert_current_owner()
        target = self._path(path)
        if path in set(self.contract.raw.get("patchableFiles", [])) and target.exists():
            raise PermissionError("This large/structured file requires the scoped patch_file tool")
        if len(content.encode()) > 100000:
            raise ValueError("File exceeds 100 KB limit")
        if path not in self.contract.writable_files:
            raise PermissionError("Path is not writable under this WorkUnit contract")
        value = {"path": path, "content": content, **self.contract.binding}
        operation_id = str(uuid.uuid5(uuid.UUID(self.store.run_id), f"tool:{self.phase_id}:write_file:{hashlib.sha256(json.dumps(value,sort_keys=True).encode()).hexdigest()}"))
        receipt = self.store.begin_tool(operation_id, self.phase_id, "write_file", value)
        if receipt["status"] == "completed":
            return json.loads(receipt["result_json"])["message"]
        raw = content.encode()
        sha = hashlib.sha256(raw).hexdigest()
        if self.contract.raw.get("schema") == "agents-sdk-developer-workunit-contract.v1":
            from spec_workunit_contract import developer_workspace_write_guard
            guard = developer_workspace_write_guard(self.root, self.contract.raw)
        else:
            guard = nullcontext()
        with guard:
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.is_file() and hashlib.sha256(target.read_bytes()).hexdigest() == sha:
                message = f"Reconciled existing {path}; sha256={sha}"
                self.store.complete_tool(operation_id, {"message": message, "sha256": sha}, effect_hash=sha, recovered=True)
                return message
            temp = target.with_name(f".{target.name}.{operation_id}.tmp")
            with temp.open("wb") as stream:
                stream.write(raw)
                stream.flush()
                __import__("os").fsync(stream.fileno())
            temp.replace(target)
            maybe_crash(self.store, "tool.write_file.after_effect", operation_id)
            message = f"Wrote {path}; sha256={sha}"
        self.store.complete_tool(operation_id, {"message": message, "sha256": sha}, effect_hash=sha)
        return message

    def patch_file(self, path: str, patch: str) -> str:
        """Apply exact-context Update File hunks; numbered hunk headers disambiguate repeated source text. Authorized host-executed write, bounded to this file; never use shell writes."""
        if not self.writable:
            raise PermissionError("Review tools are read-only")
        self._assert_current_owner()
        target_path = Path(path)
        if target_path.is_absolute() or ".." in target_path.parts:
            raise PermissionError("Patch target must be a repository-relative path without traversal")
        if path not in set(self.contract.raw.get("patchableFiles", [])) or len(patch.encode()) > 30000:
            raise PermissionError("Patch target is not authorized or patch exceeds 30 KB")
        if path not in self.contract.writable_files:
            raise PermissionError("Path is not writable under this WorkUnit contract")
        if f"*** Update File: {path}" not in patch or "*** Add File:" in patch or "*** Delete File:" in patch:
            raise ValueError("Patch must use scoped Update File hunks for exactly the authorized path")
        value = {"path": path, "patch": patch, **self.contract.binding}
        op = str(uuid.uuid5(uuid.UUID(self.store.run_id), f"tool:{self.phase_id}:patch_file:{hashlib.sha256(json.dumps(value,sort_keys=True).encode()).hexdigest()}"))
        cached = self.store.begin_tool(op, self.phase_id, "patch_file", value)
        if cached["status"] == "completed":
            return json.loads(cached["result_json"])["message"]
        def reject(message: str) -> None:
            row = self.store.get_tool_receipt(op)
            if row and row.get("status") == "intent":
                self.store.supersede_tool(op, {"status": "PATCH_REJECTED", "error": message}, reason="scoped patch validation failed")
        target = self._path(path)
        original = target.read_text(encoding="utf-8")
        lines = patch.splitlines()
        if not lines or lines[0] != "*** Begin Patch" or lines[-1] != "*** End Patch":
            reject("Patch must have Begin Patch and End Patch markers")
            raise ValueError("Patch must have Begin Patch and End Patch markers")
        update_headers = [line for line in lines if line.startswith("*** Update File:")]
        if update_headers != [f"*** Update File: {path}"]:
            reject("Patch must update exactly its authorized path")
            raise ValueError("Patch must update exactly its authorized path")

        hunks: list[tuple[int | None, list[str], list[str]]] = []
        old_lines: list[str] = []
        new_lines: list[str] = []
        in_hunk = False
        hunk_start: int | None = None
        for line in lines[2:-1]:
            if line.startswith("@@"):
                if in_hunk:
                    if not old_lines:
                        reject("Each patch hunk needs exact old context")
                        raise ValueError("Each patch hunk needs exact old context")
                    hunks.append((hunk_start, old_lines, new_lines))
                old_lines, new_lines, in_hunk = [], [], True
                header = re.match(r"^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@", line)
                hunk_start = int(header.group(1)) if header else None
                continue
            if not in_hunk:
                continue
            if line.startswith("\\ No newline"):
                continue
            if line.startswith(" "):
                old_lines.append(line[1:]); new_lines.append(line[1:])
            elif line.startswith("-"):
                old_lines.append(line[1:])
            elif line.startswith("+"):
                new_lines.append(line[1:])
            else:
                reject("Patch hunk contains an invalid line")
                raise ValueError("Patch hunk contains an invalid line")
        if in_hunk:
            if not old_lines:
                reject("Each patch hunk needs exact old context")
                raise ValueError("Each patch hunk needs exact old context")
            hunks.append((hunk_start, old_lines, new_lines))
        if not hunks:
            reject("Patch contains no update hunks")
            raise ValueError("Patch contains no update hunks")

        updated = original
        line_delta = 0
        for start_line, old_hunk, new_hunk in hunks:
            old_text, new_text = "\n".join(old_hunk), "\n".join(new_hunk)
            if old_text == new_text:
                continue
            if start_line is not None:
                target_lines = updated.splitlines()
                index = start_line - 1 + line_delta
                if index < 0 or target_lines[index:index + len(old_hunk)] != old_hunk:
                    message = f"Numbered patch context did not match at line {start_line}; refresh source and retry"
                    reject(message)
                    raise ValueError(message)
                target_lines[index:index + len(old_hunk)] = new_hunk
                line_delta += len(new_hunk) - len(old_hunk)
                updated = "\n".join(target_lines) + ("\n" if original.endswith("\n") else "")
                continue
            count = updated.count(old_text)
            if count == 0 and updated.count(new_text) == 1:
                continue
            if count != 1:
                message = f"Patch context must match exactly once (matched {count}); refresh source and retry"
                reject(message)
                raise ValueError(message)
            updated = updated.replace(old_text, new_text, 1)
        if self.contract.raw.get("schema") == "agents-sdk-developer-workunit-contract.v1":
            from spec_workunit_contract import developer_workspace_write_guard
            guard = developer_workspace_write_guard(self.root, self.contract.raw)
        else:
            guard = nullcontext()
        with guard:
            if target.read_text(encoding="utf-8") != original:
                reject("Source changed while preparing the patch; refresh source and retry")
                raise ValueError("Source changed while preparing the patch; refresh source and retry")
            if updated == original:
                message = f"Reconciled already-applied patch for {path}"
            else:
                temp = target.with_name(f".{target.name}.{op}.tmp")
                temp.write_text(updated, encoding="utf-8")
                temp.replace(target)
                maybe_crash(self.store, "tool.patch_file.after_effect", op)
                message = f"Applied scoped patch to {path}"
        self.store.complete_tool(op, {"message": message, "path": path}, effect_hash=hashlib.sha256(patch.encode()).hexdigest(), recovered="Reconciled" in message)
        return message

    def run_focused_tests(self) -> str:
        self._assert_current_owner()
        """Run only the WorkUnit's predeclared tests; no model-provided command is executed."""
        revision = hashlib.sha256("".join(hashlib.sha256(self._path(p).read_bytes()).hexdigest() for p in self.contract.allowed_files if self._path(p).is_file()).encode()).hexdigest()
        command = self.contract.test_command
        value = {"revision": revision, "command": command, **self.contract.binding}
        operation_id = str(uuid.uuid5(uuid.UUID(self.store.run_id), f"tool:{self.phase_id}:run_focused_tests:{hashlib.sha256(json.dumps(value,sort_keys=True).encode()).hexdigest()}"))
        cached = self.store.begin_tool(operation_id, self.phase_id, "run_focused_tests", value)
        if cached["status"] == "completed":
            return cached["result_json"]
        missing_paths = [path for path in self.contract.test_paths if not (self.root / path).is_file()]
        if missing_paths:
            receipt = {"command": command, "revision": revision, "databaseMode": self.contract.database_mode,
                       **self.contract.binding, "exitCode": 2, "missingTestPaths": missing_paths,
                       "stdout": "", "stderr": "Required test files are missing; no tests were run.",
                       "durationMs": 0, "recordedAt": now()}
            self.store.complete_tool(operation_id, receipt, effect_hash=revision)
            return json.dumps(receipt)
        started = time.monotonic()
        env = os.environ.copy()
        if self.contract.database_mode == "isolated_local":
            database_url = env.get("DATABASE_URL", "")
            parsed = urlsplit(database_url)
            database_name = parsed.path.removeprefix("/")
            if (
                parsed.scheme not in {"postgres", "postgresql"}
                or parsed.hostname not in {"localhost", "127.0.0.1"}
                or not 55400 <= (parsed.port or 0) <= 55999
                or not database_name.startswith(f"{self.contract.spec_id.lower().replace('-', '')}_")
                or not database_name.endswith("_test")
                or parsed.password not in {None, ""}
            ):
                raise RuntimeError("isolated_local tests require a disposable localhost test database on the isolated port range")
            env["RUN_DB_INTEGRATION_TESTS"] = "true"
        else:
            env["RUN_DB_INTEGRATION_TESTS"] = "false"
        if self.contract.raw["tests"]["runner"] == "pytest" and any(path.startswith("python-backend/") for path in self.contract.test_paths):
            python_backend = str(self.root / "python-backend")
            existing_pythonpath = env.get("PYTHONPATH", "")
            env["PYTHONPATH"] = python_backend + (os.pathsep + existing_pythonpath if existing_pythonpath else "")
        result = subprocess.run(command, cwd=self.root, env=env, text=True, capture_output=True, timeout=240, check=False)
        maybe_crash(self.store, "tool.run_focused_tests.after_effect", operation_id)
        database_url = env.get("DATABASE_URL", "")
        stdout = result.stdout.replace(database_url, "[REDACTED_DATABASE_URL]") if database_url else result.stdout
        stderr = result.stderr.replace(database_url, "[REDACTED_DATABASE_URL]") if database_url else result.stderr
        stdout = re.sub(r"postgres(?:ql)?://[^\s]+", "[REDACTED_DATABASE_URL]", stdout)
        stderr = re.sub(r"postgres(?:ql)?://[^\s]+", "[REDACTED_DATABASE_URL]", stderr)
        receipt = {"command": command, "revision": revision, "databaseMode": self.contract.database_mode, **self.contract.binding, "exitCode": result.returncode,
                   "stdout": stdout[-12000:], "stderr": stderr[-12000:],
                   "durationMs": round((time.monotonic()-started)*1000), "recordedAt": now()}
        self.store.complete_tool(operation_id, receipt, effect_hash=revision)
        return json.dumps(receipt)

    def run_browser_uat(self) -> str:
        """Run the existing loopback Chromium UAT only for the contract's scoped Mini-App directory."""
        browser = self.contract.browser_uat
        if not browser or browser.get("status") != "configured":
            raise PermissionError("Browser UAT is not authorized by this WorkUnit contract")
        self._assert_current_owner()
        relative = str(browser.get("projectPath", ""))
        project_path = Path(relative)
        if project_path.is_absolute() or ".." in project_path.parts or not relative:
            raise PermissionError("Browser UAT project path is invalid")
        project = (self.root / project_path).resolve()
        if self.root not in project.parents or not project.is_dir():
            raise PermissionError("Browser UAT project must be an existing directory inside the task workspace")
        scoped = [path for path in self.contract.allowed_files if path.startswith(project_path.as_posix().rstrip("/") + "/")]
        if not any(Path(path).name == "index.html" for path in scoped):
            raise PermissionError("Browser UAT project must include an allowlisted index.html")
        files = []
        for path in sorted(scoped):
            target = self._path(path)
            if target.is_file() and target.suffix.lower() in {".html", ".js", ".mjs", ".css"}:
                files.append([Path(path).name, hashlib.sha256(target.read_bytes()).hexdigest()])
        source_sha = hashlib.sha256(json.dumps(files, separators=(",", ":")).encode()).hexdigest()
        harness_sha = hashlib.sha256((Path(__file__).parent / "harness/browser_uat.cjs").read_bytes()).hexdigest()
        operation_input = {"sourceSha256": source_sha, "projectPath": project_path.as_posix(), "harnessSha256": harness_sha}
        operation_id = str(uuid.uuid5(
            uuid.UUID(self.store.run_id),
            f"tool:{self.phase_id}:run_browser_uat:{hashlib.sha256(json.dumps(operation_input, sort_keys=True).encode()).hexdigest()}"
        ))
        existing = self.store.begin_tool(operation_id, self.phase_id, "run_browser_uat", operation_input)
        if existing["status"] == "completed":
            return str(existing["result_json"])
        result = run_miniapp_browser_uat(project, operation_id=operation_id)
        result["projectPath"] = project_path.as_posix()
        result["contractSourceSha256"] = source_sha
        result["harnessSha256"] = harness_sha
        result.update({"runId": self.store.run_id, "taskId": self.contract.task_id,
                       "workspaceId": self.contract.workspace_id, "workspace": str(self.contract.root),
                       "sourceRevision": self.contract.source_revision, "toolOperationId": operation_id})
        self.store.complete_tool(operation_id, result, effect_hash=source_sha)
        return json.dumps(result, ensure_ascii=False)

    def tools(self, writable: bool) -> list[Any]:
        from functools import wraps
        import inspect
        from agents import function_tool
        names = ("list_files", "read_file", "write_file", "patch_file", "run_focused_tests") if writable else ("list_files", "read_file", "run_focused_tests")
        if self.contract.browser_uat and self.contract.browser_uat.get("status") == "configured":
            names = (*names, "run_browser_uat")
        names = (*names, "read_range")
        names = tuple(name for name in names if name in self.contract.allowed_tools)
        wrapped = []
        for name in names:
            impl = getattr(self, name)
            @wraps(impl)
            async def call(*args: Any, _impl: Any = impl, **kwargs: Any) -> Any:
                return _impl(*args, **kwargs)
            call.__signature__ = inspect.signature(impl)
            wrapped.append(function_tool(call, name_override=name))
        return wrapped

    @property
    def contract(self) -> WorkUnitContract:
        return self._contract

    @contract.setter
    def contract(self, value: WorkUnitContract) -> None:
        self._contract = value

    @property
    def binding(self) -> dict[str, str]:
        return self.contract.binding


def run_phase(store: DurableRunStore, phase: str, attempt: int, agent: Any, content: str, max_turns: int,
              progress_probe: Any = None) -> Any:
    phase_id = store.phase_id(phase, attempt)
    existing = store.get_phase(phase_id)
    if existing and existing.get("status") == "completed":
        from types import SimpleNamespace
        result = json.loads(existing["output_json"])
        return SimpleNamespace(final_output=result["finalOutput"], new_items=[])
    budget = None
    try:
        budget = bounded_fast_lane_turns(store)
        if budget:
            limit, consumed, _ = budget.allowance(phase, attempt)
            if limit < consumed or (limit == consumed and existing is None):
                raise BoundedTurnBudgetExceeded("Authorized aggregate SDK turn allowance exhausted")
    except BoundedTurnBudgetExceeded as exc:
        park_bounded_turn_budget(store, phase, attempt, str(exc))
    if existing and existing.get("status") == "needs_replan":
        raise NoProgressPhaseError(f"{phase} phase already has a durable no-progress diagnosis; use a fresh phase for replanning")
    phase_input = {"input": content, "maxTurns": max_turns}
    if existing:
        # Source snapshots can legitimately change after an implementation
        # tool runs. A resumed running phase must keep its originally persisted
        # prompt instead of rebinding the same phase ID to mutated source.
        phase_input = json.loads(existing["input_json"])
        content = phase_input["input"]
        max_turns = int(phase_input["maxTurns"])
    phase_row = store.start_phase(phase, attempt, phase_input, max_turns)
    if phase_row["status"] == "completed":
        from types import SimpleNamespace
        result = json.loads(phase_row["output_json"])
        return SimpleNamespace(final_output=result["finalOutput"], new_items=[])
    session = SQLiteSession(phase_row["phase_id"], db_path=store.evidence_dir / "agents-sessions.sqlite3")
    def progress_snapshot() -> dict[str, Any]:
        source = progress_probe() if callable(progress_probe) else None
        return store.meaningful_progress(source)

    async def invoke():
        checkpoint = json.loads(phase_row["checkpoint_json"]) if phase_row.get("checkpoint_json") else None
        # Independently authorized legacy workflows retain their SDK segment
        # continuation. Developer Fast Lane instead restores its hard allowance
        # from the validated contract and the durable SDK turn journal.
        turn_limit = max_turns
        if checkpoint and not budget:
            turn_limit = max(max_turns, int(checkpoint.get("max_turns", max_turns)))
        if budget:
            turn_limit, _, _ = budget.allowance(phase, attempt)
            if checkpoint:
                # MaxTurnsExceeded increments the SDK cursor before rejecting
                # the next turn. Preserve the raw checkpoint on disk; only the
                # restored cursor excludes that demonstrably undispatched turn.
                checkpoint = dict(checkpoint)
                prior_limit = checkpoint.get("max_turns")
                if type(prior_limit) is int and checkpoint.get("current_turn", 0) > prior_limit:
                    checkpoint["current_turn"] = budget.counts().get(phase_id, 0)
                responses = checkpoint.get("model_responses")
                if "model_responses" in checkpoint and responses is None and checkpoint.get("last_model_response") is None:
                    responses = []  # A capacity/admission error before the first response.
                step = checkpoint.get("current_step") or {}
                if (isinstance(responses, list) and step.get("type") in {None, "next_step_run_again"}
                        and len(responses) < checkpoint.get("current_turn", 0)):
                    # The SDK increments before calling the adapter. Admission or
                    # reconciliation can interrupt that turn without a response.
                    # Resume that same credit; the adapter reconciles its stable
                    # ModelCallId before any provider dispatch. Raw evidence and
                    # the durable admitted-turn count remain unchanged.
                    checkpoint["current_turn"] = len(responses)
                checkpoint["max_turns"] = turn_limit
        initial_progress = progress_snapshot()
        store.observe_phase_progress(phase_row["phase_id"], initial_progress)
        store.initialize_turn_limit_progress(phase_row["phase_id"], initial_progress)
        run_input = await RunState.from_json(agent, checkpoint) if checkpoint else content
        class BudgetHooks(RunHooks):
            async def on_llm_start(self, context, current_agent, system_prompt, input_items):
                budget.admit(phase, attempt, streamed.current_turn)

        while True:
            options = {"hooks": BudgetHooks()} if budget else {}
            streamed = Runner.run_streamed(agent, run_input, max_turns=turn_limit, session=session, **options)
            try:
                async for _ in streamed.stream_events():
                    if store.save_checkpoint(phase_row["phase_id"], streamed.to_state().to_json()):
                        store.observe_phase_progress(phase_row["phase_id"], progress_snapshot())
            except MaxTurnsExceeded:
                state_json = streamed.to_state().to_json()
                progress = progress_snapshot()
                store.observe_phase_progress(phase_row["phase_id"], progress)
                no_progress_segments = store.record_no_progress_segment(phase_row["phase_id"], progress)
                if budget:
                    store.save_checkpoint(phase_id, state_json)
                    raise BoundedTurnBudgetExceeded("MaxTurnsExceeded reached the authorized SDK turn boundary")
                if no_progress_segments >= 1:
                    diagnosis = (
                        "Agents SDK raised MaxTurnsExceeded without a completed tool receipt, allowlisted source change, "
                        "or verified test outcome. Model responses alone do not justify extending max_turns; replan in a fresh phase."
                    )
                    store.mark_phase_needs_replan(phase_row["phase_id"], diagnosis=diagnosis, progress=progress)
                    raise NoProgressPhaseError(diagnosis)
                previous_limit = turn_limit
                turn_limit = next_turn_limit(turn_limit, max_turns)
                state_json["max_turns"] = turn_limit
                store.save_checkpoint(phase_row["phase_id"], state_json)
                run_input = await RunState.from_json(agent, state_json)
                store.event("phase.turn_limit_continued", {
                    "phaseId": phase_row["phase_id"], "attempt": attempt,
                    "previousLimit": previous_limit, "continuedLimit": turn_limit,
                }, stable_key=f"phase:{phase_row['phase_id']}:turn-limit-continuation:{turn_limit}")
                if phase == "implementation":
                    repeated = repeated_patch_rejection_for_phase(store, phase, attempt)
                    if repeated:
                        reason, count = repeated
                        raise UnproductiveImplementationPhase(
                            f"Implementation checkpoint preserved after {count} repeated patch rejections: {reason}. "
                            "The next durable development iteration must diagnose the rejection pattern and choose a different patch strategy."
                        )
                    model_calls = store.connection.execute(
                        "SELECT updated_at,response_text FROM model_calls WHERE phase_id=? AND role='implementer' ORDER BY updated_at",
                        (phase_row["phase_id"],),
                    ).fetchall()
                    patch_receipts = store.connection.execute(
                        "SELECT updated_at FROM tool_receipts WHERE phase_id=? AND tool='patch_file' ORDER BY updated_at,rowid",
                        (f"{phase}-{attempt}",),
                    ).fetchall()
                    unexecuted_streak = unexecuted_patch_dispatch_streak(
                        [dict(row) for row in model_calls], [dict(row) for row in patch_receipts]
                    )
                    if unexecuted_streak >= 3:
                        store.event("implementation.patch_dispatch_unexecuted", {
                            "phaseId": phase_row["phase_id"], "attempt": attempt,
                            "consecutiveDispatches": unexecuted_streak,
                        }, stable_key=f"phase:{phase_row['phase_id']}:unexecuted-patch-dispatch:{unexecuted_streak}")
                        raise UnproductiveImplementationPhase(
                            f"Implementation checkpoint preserved after {unexecuted_streak} consecutive patch_file dispatches were not executed by the Agents SDK host. "
                            "The next durable development iteration must inspect the tool dispatch/schema path and choose a safe alternate implementation approach."
                        )
                continue
            except Exception:
                # A wait/error can happen before the next stream event. Persist
                # the pending SDK cursor and input before handing off recovery.
                store.save_checkpoint(phase_id, streamed.to_state().to_json())
                raise
            break
        output = {"finalOutput": streamed.final_output, "lastResponseId": streamed.last_response_id}
        store.complete_phase(phase_row["phase_id"], output)
        if phase == "verification":
            maybe_crash(store, "verification.after_phase_complete", phase_row["phase_id"])
        return streamed
    try:
        import asyncio
        return asyncio.run(invoke())
    except Exception as exc:
        if isinstance(exc, BoundedTurnBudgetExceeded):
            park_bounded_turn_budget(store, phase, attempt, str(exc))
        if isinstance(exc, ModelAdmissionWait):
            canonical_scheduler_owned = getattr(store, "model_admission_transport", None) is not None
            if exc.reason == "provider_capacity":
                store.wait_for_capacity(retry_after=exc.next_eligible_at, detail="Codex Subscription reported HTTP 429; canonical scheduler owns retry eligibility",
                                        canonical_scheduler_owned=canonical_scheduler_owned)
            else:
                store.wait_for_budget(next_eligible_at=exc.next_eligible_at, operation_key=exc.operation_key,
                                      canonical_scheduler_owned=canonical_scheduler_owned)
            store.commit_state()
            print(json.dumps(store.state, ensure_ascii=False, indent=2))
            store.close()
            raise SystemExit(75) from exc
        if is_capacity_error(exc):
            retry_after = capacity_retry_after(store.state)
            store.wait_for_capacity(retry_after=retry_after, detail=f"{type(exc).__name__}: {exc}")
            raise CapacityWaitError(f"Codex subscription capacity unavailable; durable retry at {retry_after}") from exc
        if isinstance(exc, (RoutingConfigurationError, ModelAdmissionDenied)):
            store.state["routingBlocker"] = {"status": "BLOCKED_MODEL_POLICY", "detail": f"{type(exc).__name__}: {exc}"[:1000]}
            store.finish_run(False, terminal_status="BLOCKED_MODEL_POLICY")
            store.commit_state()
            raise SystemExit(1) from exc
        raise
    finally:
        session.close()


def main() -> int:
    import argparse, uuid
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", required=True, type=Path, help="Registered, owned task worktree")
    parser.add_argument("--contract", required=True, type=Path, help="Conductor-supplied canonical WorkUnit contract JSON")
    parser.add_argument("--evidence-dir", required=True, type=Path, help="Durable run evidence directory outside the task worktree")
    parser.add_argument("--run-id", default=str(uuid.uuid4()))
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--continuation", action="store_true", help="Start a new WorkUnit iteration without counting it as crash recovery")
    parser.add_argument("--diagnose-no-progress", action="store_true", help="Force a fresh diagnostic planning/replan strategy after a no-progress continuation")
    parser.add_argument("--canonical-admission-response-fd", type=int, help="Private server-to-Python response descriptor")
    parser.add_argument("--canonical-admission-request-fd", type=int, help="Private Python-to-server request descriptor")
    args = parser.parse_args()
    if (args.canonical_admission_response_fd is None) != (args.canonical_admission_request_fd is None):
        parser.error("canonical model admission requires both private IPC descriptors")
    if args.canonical_admission_response_fd is not None:
        from model_admission import ModelAdmissionDenied, validate_private_admission_fds
        try:
            validate_private_admission_fds(args.canonical_admission_response_fd, args.canonical_admission_request_fd)
        except ModelAdmissionDenied as exc:
            parser.error(str(exc))
    contract = load_contract(args.contract, args.workspace)
    evidence = args.evidence_dir.resolve()
    if contract.root == evidence or contract.root in evidence.parents:
        parser.error("--evidence-dir must be outside the owned task worktree")
    state = {"schema": "agents-sdk-spec-workunit.v1", "runId": args.run_id,
             "mode": "AGENTS_SDK_CODEX_SUBSCRIPTION_EXPERIMENT", "specId": "SPEC-038",
             **contract.binding, "contractDigest": contract.digest,
             "contractScopeSnapshot": contract_scope_snapshot(contract.raw),
             "createdAt": now(), "status": "running", "modelReceipts": [], "operatorEvents": []}
    state["specId"] = contract.spec_id
    store = DurableRunStore(evidence, run_id=args.run_id, initial_state=None if args.resume else state,
                            resume=args.resume, count_restart=args.resume and not args.continuation)
    state = store.state
    store.validated_workunit_contract = contract
    if args.canonical_admission_response_fd is not None:
        from model_admission import FdCanonicalModelAdmissionTransport
        store.model_admission_transport = FdCanonicalModelAdmissionTransport(
            args.canonical_admission_response_fd, args.canonical_admission_request_fd,
        )
    if contract.raw.get("schema") == "agents-sdk-developer-workunit-contract.v1" or contract.raw.get("canonicalJobBinding"):
        state["canonicalModelAdmissionRequired"] = True
    if state.get("workspaceId") != contract.workspace_id:
        store.close()
        raise RuntimeError("Resumed run contract/workspace binding differs from its original state")
    current_scope = contract_scope_snapshot(contract.raw)
    previous_scope = state.get("contractScopeSnapshot") or prior_contract_scope_from_model_calls(store)
    if state.get("contractDigest") != contract.digest:
        if previous_scope is None or previous_scope != current_scope:
            store.close()
            raise RuntimeError("Resumed run contract/workspace binding differs from its original state")
        previous_digest = state.get("contractDigest")
        state["contractDigest"] = contract.digest
        state["contractScopeSnapshot"] = current_scope
        store.event("workunit.contract_guidance_refreshed", {
            "previousContractDigest": previous_digest,
            "currentContractDigest": contract.digest,
            "scopeDigest": hashlib.sha256(json.dumps(current_scope, sort_keys=True, separators=(",", ":")).encode()).hexdigest(),
        }, stable_key=f"workunit:contract-guidance:{previous_digest}:{contract.digest}")
        store.commit_state()
    elif not state.get("contractScopeSnapshot"):
        state["contractScopeSnapshot"] = current_scope
        store.commit_state()
    if args.diagnose_no_progress:
        diagnosis = "Supervisor observed an exit-75 continuation without meaningful progress; diagnose the prior phase and choose a fresh phase/strategy."
        findings = list(state.get("lastFindings", []))
        if diagnosis not in findings:
            findings.append(diagnosis)
        state["lastFindings"] = findings
        if state.get("plan") is None:
            state["plannerIteration"] = int(state.get("plannerIteration", 0)) + 1
        else:
            state["iterationInProgress"] = False
        store.event("development.no_progress_diagnostic_applied", {
            "plannerIteration": state.get("plannerIteration", 0),
            "developmentIteration": state.get("developmentIteration", 0),
            "phase": "planning" if state.get("plan") is None else "implementation",
            "reason": diagnosis,
        }, stable_key=f"development:no-progress-diagnosis:{state.get('plannerIteration', 0)}:{state.get('developmentIteration', 0)}")
        store.commit_state()
    reconciled_writes = reconcile_interrupted_write_intents(store, contract)
    if reconciled_writes:
        state.setdefault("recoveredToolReceipts", []).extend(reconciled_writes)
        store.commit_state()
    state["status"] = "running"
    state.pop("retryAfter", None)
    state.pop("capacityWaitDetail", None)
    state.pop("canonicalWaitPersisted", None)
    state.pop("canonicalWaitReason", None)
    store.commit_state()
    def receipt(item: dict[str, Any]) -> None:
        if all(row.get("turnId") != item.get("turnId") for row in state.setdefault("modelReceipts", [])):
            state["modelReceipts"].append(item)
        state["capacityWaitCount"] = 0
        store.commit_state()
    goal = (f"Implement {contract.spec_id} {contract.requirement_id}: {contract.requirement_text}. "
            "First compare the complete normative requirement with the scoped acceptance criteria. If criteria cover only part, state the gap and plan only this authorized slice without claiming the requirement passes. "
            "Inspect the canonical requirement and source, identify the actual root cause, make the smallest safe implementation, add focused regressions, run the provided checks, diagnose and repair failures. "
            "Use only the registered host tools and the exact allowlist. Never use shell or model output to construct commands. No tool exposes direct database operations; test code written under the allowlist may use the fixed focused-test adapter to seed and query only the isolated localhost test database declared in this contract, with disposable fixtures/cleanup and no production/shared database access. If needed, integration tests may create only the SPEC-specific test schema in that disposable database; do not add a standalone migration runner. Never call Gateway or direct provider APIs. "
            "Acceptance criteria: " + json.dumps(contract.acceptance, ensure_ascii=False))
    context = task_source_context(contract)
    workunit_scope = {
        **contract.binding,
        "allowedFiles": contract.allowed_files,
        "writableFiles": contract.writable_files,
        "patchableFiles": tuple(contract.raw.get("patchableFiles", [])),
        "tests": contract.raw["tests"],
        "authority": contract.raw["authority"],
        "browserUat": contract.browser_uat,
        "implementationGuidance": contract.raw.get("implementationGuidance"),
        "note": "Contract-listed writable paths may be new files and can be created with write_file; list_files reports only files that already exist. These Agents SDK function tools execute in the validated host worktree regardless of the Codex runtime's visible cwd or mounted workspace. Contract validation has already authorized this exact workspace; use repository-relative paths and do not infer tool availability from Codex's own filesystem.",
    }
    plan_tools = ScopedRepoTools(store, "planning", False, contract)
    planner_iteration = int(state.get("plannerIteration", 0))
    if state.get("plan") is None:
        planning_name = "planning" if planner_iteration == 0 else f"planning-{planner_iteration}"
        planner_instructions = "You are the read-only planning phase of an authorized implementation run. Do not modify files or run tests yourself. Produce a concrete implementation and verification plan for the next phase; the read-only limit applies only to this planner, not to the authorized implementer or tests. Return JSON {task_instruction:string, acceptance:string[]}; never claim that implementation is unauthorized."
        if planner_iteration > 0 or state.get("lastFindings"):
            planner_instructions += " Diagnose the prior phase findings and MaxTurns/no-progress evidence; choose a materially different phase strategy rather than repeating an SDK continuation that made no meaningful progress."
        plan_agent = make_workunit_agent(f"planner_{planner_iteration + 1}", planner_instructions, plan_tools,
                                         plan_tools.tools(False), receipt, store, store.phase_id(planning_name), contract.requirement_text)
        try:
            plan_result = run_phase(
                store, planning_name, 0, plan_agent,
                json.dumps({"goal": goal, "canonical_requirement": contract.requirement_text,
                            "acceptanceCriteria": contract.acceptance, "workunit_scope": workunit_scope,
                            "verified_source_context": context, "priorFindings": state.get("lastFindings", [])}, ensure_ascii=False),
                contract.plan_max_turns, progress_probe=lambda: source_hashes(contract),
            )
        except NoProgressPhaseError as exc:
            findings = [f"Planning phase stalled and was diagnosed for automatic replanning: {exc}"]
            state["plannerIteration"] = planner_iteration + 1
            state["lastFindings"] = findings
            store.continue_development(iteration=int(state.get("developmentIteration", 0)), findings=findings,
                                       reason="MaxTurnsExceeded repeated without meaningful progress; start a fresh diagnostic planning phase")
            store.commit_state(); print(json.dumps(state, ensure_ascii=False, indent=2)); store.close()
            return 75
        try:
            state["plan"] = parse_result_json(plan_result.final_output)
        except Exception as exc:
            findings = [f"Planner output did not satisfy the plan contract: {type(exc).__name__}: {exc}"]
            state["plannerIteration"] = planner_iteration + 1
            state["lastFindings"] = findings
            store.continue_development(iteration=int(state.get("developmentIteration", 0)), findings=findings, reason="planner response needs a fresh durable planning phase")
            store.commit_state(); print(json.dumps(state, ensure_ascii=False, indent=2)); store.close()
            return 75
        store.commit_state()
    plan = state["plan"]
    # A process restart leaves iterationInProgress set and resumes the same
    # stable phase IDs. A settled partial iteration advances to a new durable
    # implementation/review cycle, independent of process restart count.
    continuing_same_iteration = bool(state.get("iterationInProgress"))
    attempt = int(state.get("developmentIteration", 0)) + (0 if continuing_same_iteration else 1)
    attempt = max(attempt, 1)
    budget = bounded_fast_lane_turns(store)
    if budget and attempt > budget.max_attempts:
        park_bounded_turn_budget(store, "implementation", attempt, "Authorized WorkUnit attempt allowance exhausted")
    if not continuing_same_iteration:
        state.pop("lastReview", None)
        state.pop("verification", None)
    state["developmentIteration"] = attempt
    state["iterationInProgress"] = True
    store.commit_state()
    findings = list(state.get("lastFindings", []))
    if attempt > 1 and findings:
        replan_agent = make_workunit_agent(f"replanner_{attempt}", REPLANNER_INSTRUCTIONS, plan_tools,
                                           plan_tools.tools(False), receipt, store, store.phase_id("replanning", attempt), contract.requirement_text)
        try:
            revised = run_phase(store, "replanning", attempt, replan_agent, json.dumps({
                "goal": goal, "priorPlan": plan, "findings": findings,
                "previousIterations": iteration_evidence_summary(state.get("iterations", [])),
                "currentSource": task_source_context(contract), "workunit_scope": workunit_scope,
            }, ensure_ascii=False), contract.plan_max_turns, progress_probe=lambda: source_hashes(contract))
            plan = parse_result_json(revised.final_output)
            state["plan"] = plan
        except NoProgressPhaseError as exc:
            findings = [f"Replanner hit a no-progress MaxTurns boundary; continue from the prior plan and diagnose during implementation: {exc}", *findings]
            state["lastFindings"] = findings
        except Exception as exc:
            findings = [f"Replanner response did not satisfy its output contract: {type(exc).__name__}: {exc}", *findings]
        store.commit_state()

    acceptance = False
    iteration_starts = state.setdefault("iterationStartHashes", {})
    if str(attempt) not in iteration_starts:
        iteration_starts[str(attempt)] = source_hashes(contract)
        store.commit_state()
    before_hashes = iteration_starts[str(attempt)]
    tools = ScopedRepoTools(store, f"implementation-{attempt}", True, contract)
    agent = make_workunit_agent("implementer", "This phase is explicitly authorized to implement the canonical requirement within the validated WorkUnit contract. The planner's read-only restriction applies only to the planner; the implementation agent receives the scoped patch_file and write_file tools built from this contract. Treat any planner claim that source editing is unavailable or prohibited as a mistaken description of its own read-only tools, ignore that claim, and make authorized edits with the registered host tools. The Python host validated and binds the exact repository root before this model call. Agents SDK function tools execute in that host worktree even when Codex's visible cwd or mounted workspace differs; do not claim tool access is unavailable based on Codex's own filesystem. Use only repository-relative paths exactly as listed. Implement the supplied canonical requirement and acceptance criteria, diagnose failures from actual test receipts, and repair within the declared WorkUnit scope. If the current source already satisfies a criterion, verify it and avoid reformatting. Use only supplied host tools; call no shell, provider, Gateway, database, or migration operations. Use patch_file for explicitly declared patchable files and include numbered hunk headers with exact surrounding context so repeated lines are unambiguous. Use write_file for new allowlisted files.", tools,
                       tools.tools(True), receipt, store, store.phase_id("implementation", attempt), contract.requirement_text)
    implementation_input = {
        "goal": goal, "iteration": attempt, "plan": plan,
        "canonical_requirement": contract.requirement_text,
        "acceptanceCriteria": contract.acceptance, "workunit_scope": workunit_scope,
        "verified_source_context": context,
        "repairInput": {
            "independentReviewerFindings": findings,
            "testFailures": [item for item in findings if "test" in item.lower() or "exitcode" in item.lower()],
            "priorIterationEvidence": iteration_evidence_summary(state.get("iterations", [])),
            "unresolvedNormativeRequirements": state.get("unresolvedRequirements", []),
            "changedFilesFromPriorIterations": cumulative_source_paths(
                state.get("iterations", []), state.get("sourceDelta", [])
            ),
            "sourceDiffFromWorkUnitBaseline": source_diff_from_baseline(contract)[1],
        },
    }
    try:
        result = run_phase(store, "implementation", attempt, agent, json.dumps(implementation_input, ensure_ascii=False),
                           contract.implementation_max_turns, progress_probe=lambda: source_hashes(contract))
    except Exception as exc:
        detail = f"{type(exc).__name__}: {exc}"
        if is_capacity_error(exc):
            if state.get("status") != "WAITING_CAPACITY":
                retry_after = capacity_retry_after(state)
                store.wait_for_capacity(retry_after=retry_after, detail=detail)
            store.commit_state()
            print(json.dumps(state, ensure_ascii=False, indent=2)); store.close()
            return 75
        after_failure_hashes = source_hashes(contract)
        changed_paths = changed_source_paths(before_hashes, after_failure_hashes)
        baseline_changed_paths, _ = source_diff_from_baseline(contract)
        findings = [f"Implementation phase interrupted: {detail}", *findings]
        unproductive_boundary = isinstance(exc, (UnproductiveImplementationPhase, NoProgressPhaseError))
        state.setdefault("iterations", []).append({
            "iteration": attempt,
            "status": "partial_continuable_replan_required" if unproductive_boundary else "phase_interrupted",
            "findings": findings,
            "changedPaths": changed_paths,
        })
        state["lastFindings"] = findings
        state["sourceDelta"] = baseline_changed_paths
        state["functionalDeliveryStatus"] = "PARTIAL_CONTINUABLE"
        if unproductive_boundary:
            state["iterationInProgress"] = False
        store.continue_development(
            iteration=attempt,
            findings=findings,
            reason="replan after repeated non-progressing patch rejections" if unproductive_boundary else "implementation phase needs durable continuation",
        )
        store.commit_state(); print(json.dumps(state, ensure_ascii=False, indent=2)); store.close()
        return 75

    test_tools = ScopedRepoTools(store, f"verification-{attempt}", False, contract)
    try:
        test_receipt = json.loads(test_tools.run_focused_tests())
    except Exception as exc:
        test_receipt = {"exitCode": 124 if isinstance(exc, subprocess.TimeoutExpired) else 2,
                        "command": contract.test_command, "stdout": "",
                        "stderr": f"Focused test adapter failed: {type(exc).__name__}: {exc}",
                        "recordedAt": now()}
    browser_receipt = None
    if contract.browser_uat and contract.browser_uat.get("status") == "configured":
        try:
            browser_receipt = json.loads(test_tools.run_browser_uat())
        except Exception as exc:
            browser_receipt = {"result": "UNVERIFIED", "failure": f"{type(exc).__name__}: {exc}"}
        test_receipt["browserUat"] = browser_receipt
        if browser_receipt.get("result") != "PASS":
            test_receipt["exitCode"] = max(1, int(test_receipt.get("exitCode", 0)))
    after_hashes = source_hashes(contract)
    changed_paths = changed_source_paths(before_hashes, after_hashes)
    baseline_changed_paths, source_diff = source_diff_from_baseline(contract)
    test_receipt["changedPaths"] = changed_paths
    test_receipt["sourceBefore"] = before_hashes
    test_receipt["sourceAfter"] = after_hashes
    test_receipt["workUnitBaselineChangedPaths"] = baseline_changed_paths
    iteration_record: dict[str, Any] = {
        "iteration": attempt, "output": str(result.final_output), "testReceipt": test_receipt,
        "changedPaths": changed_paths, "workUnitBaselineChangedPaths": baseline_changed_paths,
    }
    state.setdefault("iterations", []).append(iteration_record)
    state.setdefault("attempts", []).append({"attempt": attempt, "output": str(result.final_output), "testReceipt": test_receipt})
    store.commit_state()
    if test_receipt["exitCode"] != 0:
        failure_detail = test_receipt.get("stderr") or test_receipt.get("stdout", "")[-3000:] or json.dumps(browser_receipt, ensure_ascii=False)[:3000]
        findings = [f"Focused tests or configured Browser UAT failed (exit {test_receipt['exitCode']}): {failure_detail}"]
    else:
        review_tools = ScopedRepoTools(store, f"review-{attempt}", False, contract)
        review = make_workunit_agent(
            f"independent_reviewer_{attempt}",
            "Independently inspect the exact normative requirement, current diff, tests and actual receipt. "
            "Use sourceDiffFromWorkUnitBaseline and workUnitBaselineChangedPaths as the cumulative source evidence "
            "from the contract sourceRevision; sourceDelta is cumulative and iterationSourceDelta is only the current "
            "cycle. Do not infer that a path is unchanged because it is absent from the current iteration delta or a "
            "test receipt's changedPaths. Decide whether the stated acceptance is complete; identify uncovered "
            "requirement language and any evidence gaps. Separately decide whether the implemented slice is functionally "
            "usable and safe for user testing despite any clearly listed incomplete acceptance/UAT items. Set "
            "functionalReadyForUserTest=true only when focused behavior works, tests pass, no known code defect or "
            "unsafe behavior remains, and remaining findings are limited to explicit scope/evidence/UAT gaps. Return "
            "JSON {complete:boolean,functionalReadyForUserTest:boolean,findings:string[],evidence:string[]}; read-only.",
            review_tools, review_tools.tools(False), receipt, store, store.phase_id("review", attempt), contract.requirement_text,
        )
        snapshot = {path: (contract.root / path).read_text(encoding="utf-8")[:20000] for path in contract.allowed_files if (contract.root / path).is_file()}
        try:
            reviewed = parse_result_json(run_phase(store,"review",attempt,review,json.dumps({"goal":goal,"canonical_requirement":contract.requirement_text,"acceptanceCriteria":contract.acceptance,"workunit_scope":workunit_scope,"source_snapshot":snapshot,"sourceDelta":baseline_changed_paths,"iterationSourceDelta":changed_paths,"sourceDiffFromWorkUnitBaseline":source_diff,"iterationEvidence":iteration_evidence_summary(state.get("iterations", [])),"test_receipt":test_receipt,**contract.binding}),contract.review_max_turns,progress_probe=lambda: source_hashes(contract)).final_output)
        except Exception as exc:
            if is_capacity_error(exc):
                raise
            reviewed = {"complete": False, "findings": [f"Independent review needs a fresh iteration: {type(exc).__name__}: {exc}"], "evidence": []}
        state.setdefault("reviews", []).append(reviewed)
        iteration_record["review"] = reviewed
        state["lastReview"] = reviewed
        store.commit_state()
        findings = list(reviewed.get("findings", []))
        state["unresolvedRequirements"] = findings if not reviewed.get("complete") else []
        if not reviewed.get("complete") and not findings:
            findings = ["Independent reviewer could not confirm all acceptance criteria; inspect uncovered normative scope and evidence."]
        if reviewed.get("complete") and not findings or reviewed.get("functionalReadyForUserTest") is True:
            verifier = make_workunit_agent(f"independent_final_verifier_{attempt}", "Independently verify the exact normative requirement and whether the implemented slice is functionally usable and safe for user testing. Keep these judgments separate: complete is true only when full normative acceptance is proven; functionalReadyForUserTest may be true for a usable slice with explicit remaining acceptance/UAT gaps, but only if focused tests pass and no known code defect remains. Return JSON {complete:boolean,functionalReadyForUserTest:boolean,findings:string[],evidence:string[]}. Read-only.", review_tools,
                                           review_tools.tools(False), receipt, store, store.phase_id("verification", attempt), contract.requirement_text)
            try:
                verified = parse_result_json(run_phase(store,"verification",attempt,verifier,json.dumps({"goal":goal,"canonical_requirement":contract.requirement_text,"acceptanceCriteria":contract.acceptance,"workunit_scope":workunit_scope,"review":reviewed,"test":test_receipt,"source_snapshot":snapshot,"sourceDiffFromWorkUnitBaseline":source_diff,"workUnitBaselineChangedPaths":baseline_changed_paths,"iterationEvidence":iteration_evidence_summary(state.get("iterations", [])),**contract.binding}),contract.review_max_turns,progress_probe=lambda: source_hashes(contract)).final_output)
            except Exception as exc:
                if is_capacity_error(exc):
                    raise
                verified = {"complete": False, "findings": [f"Independent verification needs a fresh iteration: {type(exc).__name__}: {exc}"], "evidence": []}
            state["verification"] = verified
            acceptance = bool(verified.get("complete") and not verified.get("findings"))
            iteration_record["verification"] = verified
            findings = list(verified.get("findings", []))
            state["unresolvedRequirements"] = findings if not acceptance else []
            if not acceptance and not findings:
                findings = ["Independent final verifier did not confirm complete normative acceptance; identify and close the remaining evidence gap."]
            store.commit_state()

    pending = store.pending_tool_receipts()
    state["pendingToolReceiptCount"] = len(pending)
    if pending:
        acceptance = False
        findings = ["Unresolved scoped tool intents remain and require receipt reconciliation.", *findings]
        state["receiptSettlementError"] = findings[0]
    state["modelAcceptance"] = bool(acceptance)
    browser_rows = store.connection.execute(
        "SELECT operation_id,status,result_json FROM tool_receipts WHERE tool='run_browser_uat' ORDER BY updated_at DESC,rowid DESC"
    ).fetchall()
    browser_receipts = []
    for row in browser_rows:
        try:
            result = json.loads(row["result_json"]) if row["result_json"] else None
        except (TypeError, json.JSONDecodeError):
            result = None
        browser_receipts.append({"operation_id": row["operation_id"], "status": row["status"], "result": result})
    browser_projection = project_browser_uat(contract, store.run_id, browser_receipts, pending)
    state["browserUat"] = {**browser_projection, "contract": contract.browser_uat}
    # This Development WorkUnit proves only its own normative requirement and
    # functional browser slice. It never closes the parent SPEC-224 handoff.
    state["specCompletionStatus"] = "NOT_CLAIMED"
    state["durationMs"] = round((time.time() - __import__("datetime").datetime.fromisoformat(state["createdAt"]).timestamp()) * 1000)
    state["codexTurnCount"] = len(state.get("modelReceipts", []))
    state["subscriptionTokenUsage"] = {k:sum(int(((r.get("usage") or {}).get("last") or {}).get(k,0)) for r in state.get("modelReceipts",[])) for k in ("inputTokens","outputTokens","totalTokens","cachedInputTokens")}
    completed_turns = store.connection.execute("SELECT COUNT(DISTINCT turn_id) FROM model_calls WHERE turn_id IS NOT NULL AND status IN ('turn_completed','completed')").fetchone()[0]
    unknown_turns = store.connection.execute("SELECT COUNT(*) FROM model_calls WHERE status IN ('planned','thread_started','turn_running','turn_reconciling')").fetchone()[0]
    state["modelTurnTelemetry"] = {"completedTurns": int(completed_turns), "unknownOrUnsettledCalls": int(unknown_turns)}
    store._refresh_event_projection()
    ready_for_user_test = is_ready_for_user_test(test_receipt, state.get("lastReview"), state.get("verification"), pending)
    state["readyForUserTest"] = ready_for_user_test
    browser_required = bool(contract.browser_uat and contract.browser_uat.get("status") == "configured")
    terminal_status = terminal_workunit_status(
        acceptance, ready_for_user_test, browser_required, browser_projection["status"], len(pending)
    )
    if terminal_status == "VERIFIED_COMPLETE":
        state["iterationInProgress"] = False
        state["functionalDeliveryStatus"] = "VERIFIED_COMPLETE"
        store.finish_run(True, terminal_status="VERIFIED_COMPLETE")
        return_code = 0
    elif terminal_status == "awaiting_browser_uat":
        state["iterationInProgress"] = False
        state["functionalDeliveryStatus"] = "AWAITING_BROWSER_UAT"
        state["nextAction"] = "rerun_or_reconcile_browser_uat_for_bound_source"
        store.finish_run(True, terminal_status="awaiting_browser_uat")
        return_code = 0
    elif terminal_status == "IMPLEMENTED_READY_FOR_USER_TEST":
        state["iterationInProgress"] = False
        state["functionalDeliveryStatus"] = "IMPLEMENTED_READY_FOR_USER_TEST"
        state["nextAction"] = "collect_user_test_feedback_and_continue_remaining_acceptance"
        store.finish_run(False, terminal_status="IMPLEMENTED_READY_FOR_USER_TEST")
        return_code = 0
    else:
        state["lastFindings"] = findings
        state["sourceDelta"] = baseline_changed_paths
        state["iterationInProgress"] = False
        state["functionalDeliveryStatus"] = "PARTIAL_CONTINUABLE"
        store.continue_development(iteration=attempt, findings=findings, reason="tests, review, or independent verification found remaining work")
        return_code = 75
    store.commit_state()
    print(json.dumps(state,ensure_ascii=False,indent=2)); store.close()
    return return_code


if __name__ == "__main__":
    set_tracing_disabled(True)
    raise SystemExit(main())
