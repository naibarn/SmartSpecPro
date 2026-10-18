from datetime import datetime, timezone

import pytest

from app.services.spec224_development_policy import (
    SPEC224_DEVELOPMENT_POLICY_SCHEMA,
    evaluate_development_policy,
    policy_version,
    validate_policy_definition,
)


def _policy(**overrides):
    policy = {
        "schemaVersion": SPEC224_DEVELOPMENT_POLICY_SCHEMA,
        "environmentAllowlist": ["development", "test"],
        "profileAllowlist": ["profile:spec224-quick"],
        "initiatorUserIds": [42],
        "operations": ["spec224.development.run"],
        "resourceScopes": [
            {"kind": "development_run", "id": "run:1"},
            {"kind": "worker_job", "id": "job:1"},
            {"kind": "attempt", "id": "attempt:1"},
            {"kind": "workspace", "id": "workspace:dev-1"},
            {"kind": "runner", "id": "runner:1"},
            {"kind": "runner_session", "id": "session:1"},
            {"kind": "capability_snapshot", "id": "snapshot:1"},
        ],
        "maxBudgetMinorUnits": 2500,
        "currency": "USD",
        "maxTtlSeconds": 1800,
        "expiresAt": "2026-10-18T13:00:00Z",
    }
    return {**policy, **overrides}


def _request(**overrides):
    request = {
        "tenantId": "tenant:dev-1",
        "projectId": "project:spec224",
        "environment": "development",
        "profileId": "profile:spec224-quick",
        "operation": "spec224.development.run",
        "runId": "run:1",
        "provider": "codex",
        "executionId": "job:1",
        "attemptId": "attempt:1",
        "workspaceId": "workspace:dev-1",
        "authorizationGrantRef": "grant:codex-1",
        "runnerId": "runner:1",
        "runnerSessionId": "session:1",
        "capabilitySnapshotId": "snapshot:1",
        "capabilitySnapshotRevision": "7",
        "resourceScopes": [
            {"kind": "development_run", "id": "run:1"},
            {"kind": "worker_job", "id": "job:1"},
            {"kind": "attempt", "id": "attempt:1"},
            {"kind": "workspace", "id": "workspace:dev-1"},
            {"kind": "runner", "id": "runner:1"},
            {"kind": "runner_session", "id": "session:1"},
            {"kind": "capability_snapshot", "id": "snapshot:1"},
        ],
        "budgetMinorUnits": 1500,
        "currency": "USD",
        "expiresAt": "2026-10-18T12:30:00Z",
    }
    return {**request, **overrides}


def _evaluate(policy=None, request=None, **kwargs):
    return evaluate_development_policy(
        policy=policy or _policy(),
        policy_id="policy:spec224-dev",
        tenant_id="tenant:dev-1",
        project_id="project:spec224",
        actor_id=kwargs.pop("actor_id", 42),
        request=request or _request(),
        now=kwargs.pop("now", datetime(2026, 10, 18, 12, 0, tzinfo=timezone.utc)),
    )


def test_policy_validation_rejects_production_allowlist():
    with pytest.raises(ValueError, match="SPEC224_POLICY_ENVIRONMENT_INVALID"):
        validate_policy_definition(_policy(environmentAllowlist=["production"]))


def test_policy_version_is_stable_and_changes_with_scope():
    original = policy_version("p1", "t1", "proj1", _policy())
    assert policy_version("p1", "t1", "proj1", _policy()) == original
    assert policy_version("p1", "t1", "proj1", _policy(maxBudgetMinorUnits=2501)) != original


def test_matching_development_request_is_approved_with_policy_version():
    result = _evaluate()
    assert result["decision"] == "APPROVE"
    assert result["reason"] == "POLICY_MATCH"
    assert len(result["policyVersion"]) == 64
    assert result["expiresAt"] == "2026-10-18T12:30:00Z"


@pytest.mark.parametrize(
    ("request_data", "actor_id", "reason"),
    [
        (_request(environment="production"), 42, "SPEC224_POLICY_ENVIRONMENT_DENIED"),
        (_request(profileId="profile:other"), 42, "SPEC224_POLICY_PROFILE_DENIED"),
        (_request(resourceScopes=[{"kind": "workspace", "id": "workspace:other"}]), 42, "SPEC224_POLICY_RESOURCE_SCOPE_DENIED"),
        (_request(budgetMinorUnits=2501), 42, "SPEC224_POLICY_BUDGET_DENIED"),
        (_request(expiresAt="2026-10-18T12:31:00Z"), 42, "SPEC224_POLICY_REQUEST_EXPIRY_DENIED"),
        (_request(), 43, "SPEC224_POLICY_ACTOR_NOT_DELEGATED"),
    ],
)
def test_policy_denies_unmatched_scope_and_authority(request_data, actor_id, reason):
    assert _evaluate(request=request_data, actor_id=actor_id) == {"decision": "DENY", "reason": reason}


def test_policy_denies_mismatched_tenant_or_project():
    result = _evaluate(request=_request(projectId="project:other"))
    assert result == {"decision": "DENY", "reason": "SPEC224_POLICY_SCOPE_MISMATCH"}


def test_policy_denies_expired_policy():
    result = _evaluate(
        policy=_policy(expiresAt="2026-10-18T11:59:59Z"),
    )
    assert result == {"decision": "DENY", "reason": "SPEC224_POLICY_EXPIRED"}
