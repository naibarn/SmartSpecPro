import ast
import builtins
import inspect
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api import approvals
from app.api.approvals import Spec224ExternalAgentApprovalCreate
from app.core.config import settings


def request() -> Spec224ExternalAgentApprovalCreate:
    return Spec224ExternalAgentApprovalCreate(
        tenantId="tenant-224",
        requesterId=109,
        jobId="job-224",
        operationKey="external-agent:task-224:plan-1:1",
        provider="codex",
        providerRequestId="provider-request-1",
        runnerId="runner-224",
        runnerSessionId="session-224",
        capabilitySnapshotId="snapshot-224",
        capabilitySnapshotRevision="revision-1",
        fencingVersion=4,
        actionId="tool-call-1",
        semanticState={"tool": "workspace.edit", "scope": "bounded"},
        correlationKey="spec224:job-224:provider-request-1",
        approvers=[207],
    )


def test_spec224_internal_approval_requires_server_marker_and_scope(monkeypatch):
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "gateway-secret", raising=False)
    monkeypatch.setenv("SMARTSPEC_SPEC224_EXTERNAL_APPROVAL_TENANT_ID", "tenant-224")
    monkeypatch.setenv("SMARTSPEC_SPEC224_EXTERNAL_APPROVAL_APPROVER_USER_ID", "207")

    approvals._assert_spec224_external_internal("gateway-secret", request())

    with pytest.raises(HTTPException) as wrong_token:
        approvals._assert_spec224_external_internal("wrong-secret", request())
    assert wrong_token.value.status_code == 401

    with pytest.raises(HTTPException) as wrong_tenant:
        approvals._assert_spec224_external_internal(
            "gateway-secret", request().model_copy(update={"tenant_id": "other-tenant"})
        )
    assert wrong_tenant.value.status_code == 403


def test_spec224_internal_approval_requires_distinct_configured_approver(monkeypatch):
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "gateway-secret", raising=False)
    monkeypatch.setenv("SMARTSPEC_SPEC224_EXTERNAL_APPROVAL_TENANT_ID", "tenant-224")
    monkeypatch.delenv("SMARTSPEC_SPEC224_EXTERNAL_APPROVAL_APPROVER_USER_ID", raising=False)
    with pytest.raises(HTTPException) as missing:
        approvals._assert_spec224_external_internal("gateway-secret", request())
    assert missing.value.status_code == 503

    monkeypatch.setenv("SMARTSPEC_SPEC224_EXTERNAL_APPROVAL_APPROVER_USER_ID", "109")
    with pytest.raises(HTTPException) as self_approval:
        approvals._assert_spec224_external_internal(
            "gateway-secret", request().model_copy(update={"approvers": [109]})
        )
    assert self_approval.value.status_code == 403


def test_spec224_resume_payload_is_bounded_and_server_owned():
    payload = approvals._spec224_external_resume_payload(
        request(), approval_request_id="approval-224", decision="approved", approver_id=207
    )
    assert payload["jobId"] == "job-224"
    assert payload["tenantId"] == "tenant-224"
    assert payload["approvalRequestId"] == "approval-224"
    assert payload["decision"] == "approved"
    assert payload["approverId"] == 207
    assert "token" not in str(payload).lower()


def test_spec224_resume_payload_rejects_secret_like_semantic_state():
    with pytest.raises(ValueError, match="SECRET"):
        approvals._spec224_external_resume_payload(
            request().model_copy(update={"semantic_state": {"accessToken": "redacted"}}),
            approval_request_id="approval-224",
            decision="approved",
            approver_id=207,
        )


def test_spec224_resume_record_rejects_provider_or_scope_tampering():
    continuation = request().model_dump(by_alias=True)
    continuation["provider"] = "unknown"
    with pytest.raises(ValueError, match="PROVIDER"):
        approvals._spec224_external_resume_payload_from_record(
            continuation, "approval-224", "approved", 207
        )


@pytest.mark.asyncio
async def test_spec224_grant_validation_forwards_strict_runtime_binding(monkeypatch):
    monkeypatch.setattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "gateway-secret", raising=False)
    runtime_binding = {
        "tenantId": "tenant-224",
        "ownerId": 207,
        "runId": "run-224",
        "workerJobId": "job-224",
        "attempt": 2,
        "revision": 7,
        "decisionEpoch": 3,
        "developmentRunFencingVersion": 11,
        "workerJobFencingVersion": 19,
        "runnerId": "runner-224",
        "runnerSessionId": "session-224",
        "capabilitySnapshotId": "snapshot-224",
        "capabilitySnapshotRevision": "revision-1",
    }
    payload = approvals.Spec224RecoveryGrantValidation(
        schemaVersion="spec224.recovery-grant-validation.v1",
        grantId="0d2fca34-3d1c-40d4-8f66-dc6a22cc2e04",
        tenantId="tenant-224",
        sourceCommit="a" * 40,
        sourceSha256="b" * 64,
        workpackageId="WP-RECOVERY-04",
        operation="protected_dispatch",
        path="apps/web/server/services/externalAgentTaskExecutor.ts",
        runtimeScope="local-test-runner",
        environmentScope="isolated-non-production",
        runtimeBinding=runtime_binding,
    )
    seen = {}

    class FakeGrantService:
        def __init__(self, _db):
            pass

        async def validate_spec224_recovery_grant_contract(self, **kwargs):
            seen.update(kwargs)
            return {
                "schemaVersion": "spec224.recovery-grant-validation.v1",
                "result": "VALID",
                "valid": True,
                "grantId": payload.grant_id,
                "grantVersion": 1,
                "scopeDigest": "a" * 64,
                "validatedAt": "2026-10-09T00:00:00Z",
            }

    monkeypatch.setattr(approvals, "ApprovalDBService", FakeGrantService)
    result = await approvals.validate_spec224_recovery_grant(
        payload, x_internal_token="gateway-secret", db=object()
    )

    assert result["valid"] is True
    assert result["schemaVersion"] == "spec224.recovery-grant-validation.v1"
    assert result["result"] == "VALID"
    assert seen["runtime_binding"] == runtime_binding


def test_spec224_recovery_grant_validation_route_is_registered():
    route = next(
        (
            item
            for item in approvals.router.routes
            if getattr(item, "path", None)
            == "/api/v1/approvals/internal/spec224-recovery-grants/validate"
        ),
        None,
    )
    assert route is not None
    assert "POST" in route.methods


def test_spec224_runtime_binding_rejects_extra_or_coerced_fields():
    binding = {
        "tenantId": "tenant-224",
        "ownerId": 207,
        "runId": "run-224",
        "workerJobId": "job-224",
        "attempt": 1,
        "revision": 0,
        "decisionEpoch": 0,
        "developmentRunFencingVersion": 0,
        "workerJobFencingVersion": 0,
        "runnerId": "runner-224",
        "runnerSessionId": "session-224",
        "capabilitySnapshotId": "snapshot-224",
        "capabilitySnapshotRevision": "revision-1",
    }
    with pytest.raises(ValidationError):
        approvals.Spec224RuntimeBinding(**{**binding, "untrusted": "field"})
    with pytest.raises(ValidationError):
        approvals.Spec224RuntimeBinding(**{**binding, "ownerId": True})


@pytest.mark.asyncio
async def test_legacy_approval_resume_fails_closed_without_loading_retired_runtime(monkeypatch):
    source = inspect.getsource(approvals._resume_workflow_after_decision)
    tree = ast.parse(source)
    forbidden_modules = {"langgraph", "app.orchestrator", "app.orchestrator.workflow_compiler"}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported = {alias.name for alias in node.names}
        elif isinstance(node, ast.ImportFrom):
            imported = {node.module or ""}
        else:
            continue
        assert not any(
            module == forbidden or module.startswith(f"{forbidden}.")
            for module in imported
            for forbidden in forbidden_modules
        )
    assert not any(
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "import_module"
        for node in ast.walk(tree)
    )

    attempted_imports = []
    original_import = builtins.__import__

    def track_retired_imports(name, *args, **kwargs):
        if name == "langgraph" or name.startswith("app.orchestrator"):
            attempted_imports.append(name)
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", track_retired_imports)
    legacy_approval = SimpleNamespace(
        id="legacy-approval",
        execution_id="legacy-execution",
        tenant_id="tenant-legacy",
        extra_data={},
    )

    await approvals._resume_workflow_after_decision(
        legacy_approval,
        decision="approved",
        approver_id=207,
        comment=None,
    )

    assert attempted_imports == []


@pytest.mark.asyncio
async def test_spec224_external_approval_stays_on_durable_reconciler_path(monkeypatch):
    attempted_imports = []
    original_import = builtins.__import__

    def track_retired_imports(name, *args, **kwargs):
        if name == "langgraph" or name.startswith("app.orchestrator"):
            attempted_imports.append(name)
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", track_retired_imports)
    external_approval = SimpleNamespace(
        id="spec224-approval",
        execution_id="job-224",
        tenant_id="tenant-224",
        extra_data={"spec224ExternalAgentResume": {"operationId": "operation-224"}},
    )

    await approvals._resume_workflow_after_decision(
        external_approval,
        decision="approved",
        approver_id=207,
        comment=None,
    )

    assert attempted_imports == []


@pytest.mark.asyncio
async def test_p213_approval_stays_on_canonical_worker_job_resume(monkeypatch):
    resumed = []

    async def resume_p213(**kwargs):
        resumed.append(kwargs)

    monkeypatch.setattr(approvals, "_resume_p213_worker_job_after_decision", resume_p213)
    p213_approval = SimpleNamespace(
        id="p213-approval",
        execution_id="worker-job-213",
        tenant_id="tenant-213",
        extra_data={"p213WorkerJobResume": {"projectRef": "project-213"}},
    )

    await approvals._resume_workflow_after_decision(
        p213_approval,
        decision="rejected",
        approver_id=207,
        comment="not approved",
    )

    assert resumed == [{
        "approval_request": p213_approval,
        "decision": "rejected",
        "approver_id": 207,
    }]
