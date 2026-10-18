"""Focused API boundary tests for authenticated SPEC-224 policy decisions."""

import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.api import approvals
from app.models.approval import ApprovalStatus


def _request(**overrides):
    values = {
        "tenantId": "tenant-a",
        "idempotencyKey": "decision-key-0001",
        "projectId": "project-a",
        "environment": "development",
        "profileId": "windows-codex-v1",
        "operation": "spec224.development.run",
        "runId": "run-a",
        "provider": "codex",
        "executionId": "job-a",
        "attemptId": "attempt-a",
        "workspaceId": "workspace-a",
        "authorizationGrantRef": "auth-grant-a",
        "runnerId": "runner-a",
        "runnerSessionId": "session-a",
        "capabilitySnapshotId": "snapshot-a",
        "capabilitySnapshotRevision": "7",
        "resourceScopes": [{"kind": "development_run", "id": "run-a"}],
        "budgetMinorUnits": 100,
        "currency": "USD",
        "expiresAt": "2026-10-18T10:00:00Z",
    }
    return approvals.Spec224DevelopmentPolicyDecisionRequest.model_validate(
        {**values, **overrides}
    )


def test_policy_decision_actor_comes_from_authenticated_user(monkeypatch):
    observed = {}
    decision = {
        "schemaVersion": "spec224.development-policy-decision.v1",
        "decision": "APPROVED",
        "actorUserId": 42,
    }
    approval = SimpleNamespace(
        id="approval-a",
        status=ApprovalStatus.APPROVED,
        extra_data={"spec224DevelopmentPolicyDecisionV1": decision},
        tenant_id="tenant-a",
        project_id="project-a",
        execution_id="job-a",
        requester_id=42,
        expires_at=datetime(2026, 10, 18, 10, tzinfo=timezone.utc),
        payload={"profileId": "windows-codex-v1"},
    )

    class FakeApprovalService:
        def __init__(self, _db):
            pass

        async def decide_spec224_development_policy(self, **kwargs):
            observed.update(kwargs)
            return approval

    monkeypatch.setattr(approvals, "ApprovalDBService", FakeApprovalService)

    response = asyncio.run(
        approvals.decide_spec224_development_policy(
            _request(),
            current_user=SimpleNamespace(id=42),
            current_tenant_id="tenant-a",
            db=object(),
        )
    )

    assert observed["actor_id"] == 42
    assert observed["tenant_id"] == "tenant-a"
    assert response["decision"]["actorUserId"] == 42


def test_policy_decision_rejects_body_actor_and_tenant_context_mismatch(monkeypatch):
    with pytest.raises(ValidationError):
        _request(actorId=7)

    class UnexpectedApprovalService:
        def __init__(self, _db):
            raise AssertionError("must reject before policy service")

    monkeypatch.setattr(approvals, "ApprovalDBService", UnexpectedApprovalService)
    with pytest.raises(approvals.HTTPException) as exc:
        asyncio.run(
            approvals.decide_spec224_development_policy(
                _request(),
                current_user=SimpleNamespace(id=42),
                current_tenant_id="tenant-b",
                db=object(),
            )
        )
    assert exc.value.status_code == 403
