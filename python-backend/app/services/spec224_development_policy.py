"""Policy evaluation for bounded SPEC-224 non-production approval decisions.

This module has no default allow policy. Callers must load an active,
tenant-owned policy from the approval authority and pass authenticated actor
and canonical resource bindings into the evaluator.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Any


SPEC224_DEVELOPMENT_POLICY_SCHEMA = "spec224.development-policy.v1"
NON_PRODUCTION_ENVIRONMENTS = frozenset({"development", "test", "non-production"})


def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def policy_version(policy_id: str, tenant_id: str, project_id: str, policy: dict[str, Any]) -> str:
    """Return a stable version digest for the immutable policy definition."""
    return hashlib.sha256(
        _canonical({
            "schemaVersion": SPEC224_DEVELOPMENT_POLICY_SCHEMA,
            "policyId": policy_id,
            "tenantId": tenant_id,
            "projectId": project_id,
            "policy": policy,
        }).encode("utf-8")
    ).hexdigest()


def validate_policy_definition(value: Any) -> dict[str, Any]:
    """Validate the bounded policy document stored in an ApprovalRule row."""
    fields = {
        "schemaVersion", "environmentAllowlist", "profileAllowlist",
        "initiatorUserIds", "operations", "resourceScopes",
        "maxBudgetMinorUnits", "currency", "maxTtlSeconds", "expiresAt",
    }
    if not isinstance(value, dict) or set(value) != fields:
        raise ValueError("SPEC224_POLICY_FIELDS_INVALID")
    if value["schemaVersion"] != SPEC224_DEVELOPMENT_POLICY_SCHEMA:
        raise ValueError("SPEC224_POLICY_SCHEMA_INVALID")
    environments = value["environmentAllowlist"]
    if (
        not isinstance(environments, list)
        or not environments
        or any(item not in NON_PRODUCTION_ENVIRONMENTS for item in environments)
        or len(set(environments)) != len(environments)
    ):
        raise ValueError("SPEC224_POLICY_ENVIRONMENT_INVALID")
    for field in ("profileAllowlist", "operations"):
        items = value[field]
        if (
            not isinstance(items, list)
            or not items
            or any(not isinstance(item, str) or not item.strip() or len(item) > 255 for item in items)
            or len(set(items)) != len(items)
        ):
            raise ValueError(f"SPEC224_POLICY_{field.upper()}_INVALID")
    actors = value["initiatorUserIds"]
    if (
        not isinstance(actors, list)
        or not actors
        or any(type(actor) is not int or actor < 1 for actor in actors)
        or len(set(actors)) != len(actors)
    ):
        raise ValueError("SPEC224_POLICY_INITIATORS_INVALID")
    scopes = value["resourceScopes"]
    if (
        not isinstance(scopes, list)
        or not scopes
        or any(
            not isinstance(scope, dict)
            or set(scope) != {"kind", "id"}
            or not isinstance(scope["kind"], str)
            or not scope["kind"].strip()
            or not isinstance(scope["id"], str)
            or not scope["id"].strip()
            or len(scope["kind"]) > 80
            or len(scope["id"]) > 255
            for scope in scopes
        )
        or len({_canonical(scope) for scope in scopes}) != len(scopes)
    ):
        raise ValueError("SPEC224_POLICY_RESOURCE_SCOPES_INVALID")
    if type(value["maxBudgetMinorUnits"]) is not int or value["maxBudgetMinorUnits"] < 0:
        raise ValueError("SPEC224_POLICY_BUDGET_INVALID")
    if not isinstance(value["currency"], str) or len(value["currency"]) != 3 or not value["currency"].isalpha():
        raise ValueError("SPEC224_POLICY_CURRENCY_INVALID")
    if type(value["maxTtlSeconds"]) is not int or not 1 <= value["maxTtlSeconds"] <= 86_400:
        raise ValueError("SPEC224_POLICY_TTL_INVALID")
    if not isinstance(value["expiresAt"], str):
        raise ValueError("SPEC224_POLICY_EXPIRY_INVALID")
    try:
        expires_at = datetime.fromisoformat(value["expiresAt"].replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("SPEC224_POLICY_EXPIRY_INVALID") from exc
    if expires_at.tzinfo is None:
        raise ValueError("SPEC224_POLICY_EXPIRY_INVALID")
    return value


def evaluate_development_policy(
    *,
    policy: dict[str, Any],
    policy_id: str,
    tenant_id: str,
    project_id: str,
    actor_id: int,
    request: dict[str, Any],
    now: datetime | None = None,
) -> dict[str, Any]:
    """Evaluate a request against one loaded immutable tenant/project policy."""
    current = now or datetime.now(timezone.utc)
    current = current.replace(tzinfo=timezone.utc) if current.tzinfo is None else current.astimezone(timezone.utc)
    try:
        policy = validate_policy_definition(policy)
    except ValueError as exc:
        return {"decision": "DENY", "reason": str(exc)}

    if not tenant_id or not project_id or not policy_id:
        return {"decision": "DENY", "reason": "SPEC224_POLICY_BINDING_REQUIRED"}
    if type(actor_id) is not int or actor_id not in policy["initiatorUserIds"]:
        return {"decision": "DENY", "reason": "SPEC224_POLICY_ACTOR_NOT_DELEGATED"}
    if request.get("tenantId") != tenant_id or request.get("projectId") != project_id:
        return {"decision": "DENY", "reason": "SPEC224_POLICY_SCOPE_MISMATCH"}
    environment = request.get("environment")
    if environment not in NON_PRODUCTION_ENVIRONMENTS or environment not in policy["environmentAllowlist"]:
        return {"decision": "DENY", "reason": "SPEC224_POLICY_ENVIRONMENT_DENIED"}
    if request.get("profileId") not in policy["profileAllowlist"]:
        return {"decision": "DENY", "reason": "SPEC224_POLICY_PROFILE_DENIED"}
    if request.get("operation") not in policy["operations"]:
        return {"decision": "DENY", "reason": "SPEC224_POLICY_OPERATION_DENIED"}

    required_bindings = (
        "runId", "provider", "executionId", "attemptId", "workspaceId",
        "authorizationGrantRef", "runnerId", "runnerSessionId",
        "capabilitySnapshotId", "capabilitySnapshotRevision",
    )
    if any(not isinstance(request.get(field), str) or not request[field].strip() for field in required_bindings):
        return {"decision": "DENY", "reason": "SPEC224_POLICY_RUNTIME_BINDING_REQUIRED"}
    if request["provider"] != "codex":
        return {"decision": "DENY", "reason": "SPEC224_POLICY_PROVIDER_DENIED"}

    scopes = request.get("resourceScopes")
    allowed_scopes = {_canonical(scope) for scope in policy["resourceScopes"]}
    if (
        not isinstance(scopes, list)
        or not scopes
        or any(_canonical(scope) not in allowed_scopes for scope in scopes)
        or len({_canonical(scope) for scope in scopes}) != len(scopes)
    ):
        return {"decision": "DENY", "reason": "SPEC224_POLICY_RESOURCE_SCOPE_DENIED"}
    required_scopes = {
        _canonical({"kind": kind, "id": request[field]})
        for kind, field in (
            ("development_run", "runId"),
            ("worker_job", "executionId"),
            ("attempt", "attemptId"),
            ("workspace", "workspaceId"),
            ("runner", "runnerId"),
            ("runner_session", "runnerSessionId"),
            ("capability_snapshot", "capabilitySnapshotId"),
        )
    }
    if not required_scopes.issubset({_canonical(scope) for scope in scopes}):
        return {"decision": "DENY", "reason": "SPEC224_POLICY_RUNTIME_SCOPE_INCOMPLETE"}

    budget = request.get("budgetMinorUnits")
    currency = request.get("currency")
    if (
        type(budget) is not int
        or budget < 0
        or budget > policy["maxBudgetMinorUnits"]
        or not isinstance(currency, str)
        or currency.upper() != policy["currency"].upper()
    ):
        return {"decision": "DENY", "reason": "SPEC224_POLICY_BUDGET_DENIED"}

    try:
        request_expiry = datetime.fromisoformat(str(request.get("expiresAt", "")).replace("Z", "+00:00"))
        policy_expiry = datetime.fromisoformat(policy["expiresAt"].replace("Z", "+00:00"))
    except ValueError:
        return {"decision": "DENY", "reason": "SPEC224_POLICY_EXPIRY_INVALID"}
    if request_expiry.tzinfo is None or policy_expiry.tzinfo is None:
        return {"decision": "DENY", "reason": "SPEC224_POLICY_EXPIRY_INVALID"}
    request_expiry = request_expiry.astimezone(timezone.utc)
    policy_expiry = policy_expiry.astimezone(timezone.utc)
    if policy_expiry <= current:
        return {"decision": "DENY", "reason": "SPEC224_POLICY_EXPIRED"}
    if request_expiry <= current or request_expiry > min(
        policy_expiry, current + timedelta(seconds=policy["maxTtlSeconds"])
    ):
        return {"decision": "DENY", "reason": "SPEC224_POLICY_REQUEST_EXPIRY_DENIED"}

    return {
        "decision": "APPROVE",
        "reason": "POLICY_MATCH",
        "policyVersion": policy_version(policy_id, tenant_id, project_id, policy),
        "expiresAt": request_expiry.isoformat().replace("+00:00", "Z"),
    }
