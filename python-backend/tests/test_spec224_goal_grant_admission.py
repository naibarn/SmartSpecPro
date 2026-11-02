"""Unit coverage for the explicit Start action issuing a bounded Goal Grant."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest


@pytest.mark.asyncio
async def test_explicit_goal_start_persists_approved_bounded_grant(monkeypatch):
    from app.api import approvals
    from app.models.approval import ApprovalRequest, ApprovalStatus
    from app.models.audit_log import AuditLog

    class FakeApprovalService:
        def __init__(self, _db):
            pass

        async def get_request_by_correlation(self, _key, _tenant_id):
            return None

    class FakeSession:
        def __init__(self):
            self.added = []

        async def execute(self, _statement, _params=None):
            return None

        def add(self, record):
            self.added.append(record)

        async def commit(self):
            pass

        async def refresh(self, _record):
            pass

    monkeypatch.setattr(approvals, "ApprovalDBService", FakeApprovalService)
    now = datetime.now(timezone.utc)
    goal_id = "goal-unit-test"
    payload = {
        "kind": "spec224_goal_delegation_grant",
        "grantId": goal_id,
        "goalId": goal_id,
        "actorId": 7,
        "provider": "codex",
        "workspaceId": "smartaihub-platform",
        "repositoryRef": "runner:runner-1/smartaihub-platform",
        "sourceSha": "a" * 40,
        "allowedActions": ["implement", "test"],
        "writeScope": ["apps/saas-core/**"],
        "capabilities": ["agent.external_task"],
        "budgetLimitMinorUnits": 100,
        "currency": "USD",
        "issuedAt": now.isoformat(),
        "expiresAt": (now + timedelta(hours=1)).isoformat(),
    }
    session = FakeSession()
    result = await approvals.create_spec224_goal_grant_approval(
        approvals.Spec224GoalGrantApprovalCreate(
            project_id="project-1", goal_id=goal_id, payload=payload
        ),
        SimpleNamespace(id=7, role="admin", currentTenantId="tenant-1"),
        "tenant-1",
        session,
    )

    assert isinstance(result, ApprovalRequest)
    assert result.status == ApprovalStatus.APPROVED
    assert result.required_approvers == 0
    assert result.current_approvals == 0
    assert result.extra_data["spec224GoalGrantIssuerV1"] == "owner_explicit_goal_start"
    assert result.payload == payload
    assert any(isinstance(record, AuditLog) and record.action == "spec224.goal_grant.owner_started"
               for record in session.added)


@pytest.mark.asyncio
async def test_platform_goal_grant_uses_provider_quota_without_tenant_budget(monkeypatch):
    from app.api import approvals
    from app.models.approval import ApprovalRequest, ApprovalStatus

    class FakeApprovalService:
        def __init__(self, _db):
            pass

        async def get_request_by_correlation(self, _key, _tenant_id):
            return None

    class FakeSession:
        def __init__(self):
            self.added = []

        async def execute(self, _statement, _params=None):
            return None

        def add(self, record):
            self.added.append(record)

        async def commit(self):
            pass

        async def refresh(self, _record):
            pass

    now = datetime.now(timezone.utc)
    goal_id = "goal-provider-managed"
    payload = {
        "kind": "spec224_goal_delegation_grant",
        "grantId": goal_id,
        "goalId": goal_id,
        "actorId": 7,
        "provider": "codex",
        "workspaceId": "smartaihub-platform",
        "repositoryRef": "runner:runner-1/smartaihub-platform",
        "sourceSha": "a" * 40,
        "allowedActions": ["implement", "test"],
        "writeScope": ["apps/saas-core/**"],
        "capabilities": ["agent.external_task"],
        "economicsMode": "provider_managed",
        "budgetLimitMinorUnits": None,
        "currency": None,
        "issuedAt": now.isoformat(),
        "expiresAt": (now + timedelta(hours=1)).isoformat(),
    }
    monkeypatch.setattr(approvals, "ApprovalDBService", FakeApprovalService)
    session = FakeSession()

    result = await approvals.create_spec224_goal_grant_approval(
        approvals.Spec224GoalGrantApprovalCreate(
            project_id="project-1", goal_id=goal_id, payload=payload
        ),
        SimpleNamespace(id=7, role="user", currentTenantId="tenant-1"),
        "tenant-1",
        session,
    )

    assert isinstance(result, ApprovalRequest)
    assert result.status == ApprovalStatus.APPROVED
    assert result.payload["economicsMode"] == "provider_managed"
    assert result.payload["budgetLimitMinorUnits"] is None
    assert result.payload["currency"] is None
    assert "provider account quota" in result.description


@pytest.mark.asyncio
async def test_replaying_explicit_start_recovers_matching_legacy_pending_grant(monkeypatch):
    from app.api import approvals
    from app.models.approval import ApprovalRequest, ApprovalStatus
    from app.models.audit_log import AuditLog

    now = datetime.now(timezone.utc)
    goal_id = "goal-legacy-pending"
    payload = {
        "kind": "spec224_goal_delegation_grant",
        "grantId": goal_id,
        "goalId": goal_id,
        "actorId": 7,
        "provider": "codex",
        "workspaceId": "smartaihub-platform",
        "repositoryRef": "runner:runner-1/smartaihub-platform",
        "sourceSha": "a" * 40,
        "allowedActions": ["implement", "test"],
        "writeScope": ["apps/saas-core/**"],
        "capabilities": ["agent.external_task"],
        "budgetLimitMinorUnits": 100,
        "currency": "USD",
        "issuedAt": now.isoformat(),
        "expiresAt": (now + timedelta(hours=1)).isoformat(),
    }

    class FakeApprovalService:
        def __init__(self, _db):
            pass

        async def get_request_by_correlation(self, _key, _tenant_id):
            return existing

    class FakeSession:
        def __init__(self):
            self.added = []
            self.commits = 0

        async def execute(self, _statement, _params=None):
            return None

        def add(self, record):
            self.added.append(record)

        async def commit(self):
            self.commits += 1

        async def refresh(self, _record):
            pass

    existing = ApprovalRequest(
        id="approval-legacy-pending",
        request_type=approvals.ApprovalType.CUSTOM,
        title="Legacy pending Goal Grant",
        tenant_id="tenant-1",
        requester_id=7,
        requester_type="user",
        execution_id=goal_id,
        status=ApprovalStatus.PENDING,
        payload=payload,
        action_digest=approvals.hashlib.sha256(
            approvals.json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest(),
        extra_data={"legacy": True},
        required_approvers=1,
        current_approvals=0,
        expires_at=(now + timedelta(hours=1)).replace(tzinfo=None),
    )
    monkeypatch.setattr(approvals, "ApprovalDBService", FakeApprovalService)
    session = FakeSession()

    result = await approvals.create_spec224_goal_grant_approval(
        approvals.Spec224GoalGrantApprovalCreate(
            project_id="project-1", goal_id=goal_id, payload=payload
        ),
        SimpleNamespace(id=7, role="admin", currentTenantId="tenant-1"),
        "tenant-1",
        session,
    )

    assert result is existing
    assert existing.status == ApprovalStatus.APPROVED
    assert existing.required_approvers == 0
    assert existing.current_approvals == 0
    assert existing.extra_data["spec224GoalGrantIssuerV1"] == "owner_explicit_goal_start"
    assert existing.extra_data["legacy"] is True
    assert session.commits == 1
    assert any(isinstance(record, AuditLog) and record.action == "spec224.goal_grant.owner_started_replay"
               for record in session.added)
