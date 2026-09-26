from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.api import approvals
from app.api.approvals import P213CertificationApprovalCreate
from app.core.config import settings


def certification_request() -> P213CertificationApprovalCreate:
    return P213CertificationApprovalCreate(
        tenantId="tenant-p213",
        requesterId=109,
        projectRef="p213-certification",
        purpose="p213_certification",
        fixture="approval_required",
        riskClass="explicit_approval_test",
        issuedBy="server",
        jobId="job-p213",
        operationKey="computer-use:job-p213:1",
        runnerId="runner-p213",
        runnerSessionId="session-p213",
        capabilitySnapshotId="snapshot-p213",
        capabilitySnapshotRevision="revision-p213",
        fencingVersion=4,
        actionId="semantic-action:sha256:action",
        actionDescription="click button:Continue",
        actionDigest="decision:sha256:action",
        domFingerprint="observation:sha256:dom",
        correlationKey="p213:job-p213:semantic-action:sha256:action",
        approvers=[1],
    )


def test_p213_internal_approval_requires_server_marker_and_binding(monkeypatch):
    monkeypatch.setenv("P213_CERTIFICATION_MODE", "true")
    monkeypatch.setenv("P213_CERTIFICATION_TENANT_ID", "tenant-p213")
    monkeypatch.setenv("P213_CERTIFICATION_REQUESTER_USER_ID", "109")
    monkeypatch.setenv("P213_CERTIFICATION_APPROVER_USER_ID", "1")
    monkeypatch.setenv("P213_CERTIFICATION_PROJECT_REF", "p213-certification")
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "gateway-secret", raising=False)

    approvals._assert_p213_internal("gateway-secret", certification_request())

    with pytest.raises(HTTPException) as wrong_marker:
        approvals._assert_p213_internal("gateway-secret", certification_request().model_copy(update={"tenant_id": "other-tenant"}))
    assert wrong_marker.value.status_code == 403

    with pytest.raises(HTTPException) as wrong_token:
        approvals._assert_p213_internal("wrong-secret", certification_request())
    assert wrong_token.value.status_code == 401


def test_p213_internal_requires_configured_distinct_approver(monkeypatch):
    monkeypatch.setenv("P213_CERTIFICATION_MODE", "true")
    monkeypatch.setenv("P213_CERTIFICATION_TENANT_ID", "tenant-p213")
    monkeypatch.setenv("P213_CERTIFICATION_REQUESTER_USER_ID", "109")
    monkeypatch.delenv("P213_CERTIFICATION_APPROVER_USER_ID", raising=False)
    monkeypatch.setenv("P213_CERTIFICATION_PROJECT_REF", "p213-certification")
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "gateway-secret", raising=False)

    with pytest.raises(HTTPException) as missing:
        approvals._assert_p213_internal("gateway-secret", certification_request())
    assert missing.value.status_code == 503
    assert missing.value.detail == "P213_CERTIFICATION_APPROVER_NOT_CONFIGURED"

    monkeypatch.setenv("P213_CERTIFICATION_APPROVER_USER_ID", "109")
    with pytest.raises(HTTPException) as self_approval:
        approvals._assert_p213_internal("gateway-secret", certification_request().model_copy(update={"approvers": [109]}))
    assert self_approval.value.status_code == 403
    assert self_approval.value.detail == "P213_CERTIFICATION_APPROVER_MUST_BE_DISTINCT"

    monkeypatch.setenv("P213_CERTIFICATION_APPROVER_USER_ID", "1")
    with pytest.raises(HTTPException) as binding:
        approvals._assert_p213_internal("gateway-secret", certification_request().model_copy(update={"approvers": [110]}))
    assert binding.value.status_code == 403
    assert binding.value.detail == "P213_CERTIFICATION_APPROVER_BINDING_MISMATCH"


def test_p213_internal_requires_configured_project(monkeypatch):
    monkeypatch.setenv("P213_CERTIFICATION_MODE", "true")
    monkeypatch.setenv("P213_CERTIFICATION_TENANT_ID", "tenant-p213")
    monkeypatch.setenv("P213_CERTIFICATION_REQUESTER_USER_ID", "109")
    monkeypatch.setenv("P213_CERTIFICATION_APPROVER_USER_ID", "1")
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "gateway-secret", raising=False)

    with pytest.raises(HTTPException) as missing:
        approvals._assert_p213_internal(
            "gateway-secret",
            certification_request().model_copy(update={"project_ref": ""}),
        )
    assert missing.value.status_code == 503
    assert missing.value.detail == "P213_CERTIFICATION_PROJECT_NOT_CONFIGURED"

    monkeypatch.setenv("P213_CERTIFICATION_PROJECT_REF", "p213-certification")
    with pytest.raises(HTTPException) as mismatch:
        approvals._assert_p213_internal(
            "gateway-secret",
            certification_request().model_copy(update={"project_ref": "other-project"}),
        )
    assert mismatch.value.status_code == 403
    assert mismatch.value.detail == "P213_CERTIFICATION_PROJECT_MISMATCH"


def test_p213_approval_response_requires_the_configured_distinct_approver(monkeypatch):
    monkeypatch.setenv("P213_CERTIFICATION_MODE", "true")
    monkeypatch.setenv("P213_CERTIFICATION_TENANT_ID", "tenant-p213")
    monkeypatch.setenv("P213_CERTIFICATION_REQUESTER_USER_ID", "109")
    monkeypatch.setenv("P213_CERTIFICATION_APPROVER_USER_ID", "1")
    monkeypatch.setenv("P213_CERTIFICATION_PROJECT_REF", "p213-certification")
    request = SimpleNamespace(
        requester_id=109,
        tenant_id="tenant-p213",
        extra_data={"p213WorkerJobResume": {"projectRef": "p213-certification"}},
    )

    monkeypatch.delenv("P213_CERTIFICATION_MODE")
    with pytest.raises(HTTPException) as disabled:
        approvals._assert_p213_approver_identity(request, approver_id=1, tenant_id="tenant-p213")
    assert disabled.value.status_code == 503
    assert disabled.value.detail == "P213_CERTIFICATION_MODE_DISABLED"
    monkeypatch.setenv("P213_CERTIFICATION_MODE", "true")

    with pytest.raises(HTTPException) as wrong_approver:
        approvals._assert_p213_approver_identity(request, approver_id=110, tenant_id="tenant-p213")
    assert wrong_approver.value.status_code == 403
    assert wrong_approver.value.detail == "P213_CERTIFICATION_APPROVER_BINDING_MISMATCH"

    with pytest.raises(HTTPException) as wrong_tenant:
        approvals._assert_p213_approver_identity(request, approver_id=1, tenant_id="other-tenant")
    assert wrong_tenant.value.status_code == 403
    assert wrong_tenant.value.detail == "P213_CERTIFICATION_TENANT_MISMATCH"

    approvals._assert_p213_approver_identity(request, approver_id=1, tenant_id="tenant-p213")


def test_p213_resume_callback_uses_existing_gateway_without_localhost_fallback(monkeypatch):
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", "https://smartaihub.app", raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "gateway-secret", raising=False)
    post = AsyncMock(return_value=SimpleNamespace(status_code=200))

    class FakeClient:
        def __init__(self, **_kwargs):
            self.post = post

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

    monkeypatch.setattr(approvals.httpx, "AsyncClient", FakeClient)
    approval_request = SimpleNamespace(
        id="approval-p213",
        execution_id="job-p213",
        tenant_id="tenant-p213",
        extra_data={
            "p213WorkerJobResume": {
                "operationKey": "computer-use:job-p213:1",
                "runnerId": "runner-p213",
                "runnerSessionId": "session-p213",
                "capabilitySnapshotId": "snapshot-p213",
                "capabilitySnapshotRevision": "revision-p213",
                "fencingVersion": 4,
                "actionId": "semantic-action:sha256:action",
            }
        },
    )

    import asyncio
    asyncio.run(approvals._resume_p213_worker_job_after_decision(approval_request, "approved", 110))

    post.assert_awaited_once()
    url = post.await_args.args[0]
    payload = post.await_args.kwargs["json"]
    assert url == "https://smartaihub.app/api/internal/job-control-plane/approval-decision"
    assert payload["jobId"] == "job-p213"
    assert payload["approvalRequestId"] == "approval-p213"
    assert payload["decision"] == "approved"
    assert payload["approverId"] == 110


def test_p213_resume_callback_rejects_localhost(monkeypatch):
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_URL", "http://localhost:3000", raising=False)
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "gateway-secret", raising=False)
    post = AsyncMock()

    class FakeClient:
        def __init__(self, **_kwargs):
            self.post = post

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

    monkeypatch.setattr(approvals.httpx, "AsyncClient", FakeClient)
    approval_request = SimpleNamespace(
        id="approval-p213-localhost",
        execution_id="job-p213",
        tenant_id="tenant-p213",
        extra_data={"p213WorkerJobResume": {"actionId": "action-p213"}},
    )

    import asyncio
    asyncio.run(approvals._resume_p213_worker_job_after_decision(approval_request, "approved", 110))
    post.assert_not_awaited()
