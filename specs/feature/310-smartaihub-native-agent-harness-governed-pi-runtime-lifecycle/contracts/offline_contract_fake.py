"""Offline decision fake for SPEC-310 proposal fixtures; never dispatches work."""

from __future__ import annotations

from typing import Any


def _deny(code: str, **fields: Any) -> dict[str, Any]:
    return {"decision": "DENY", "code": code, "sideEffects": [], **fields}


def evaluate_fixture(intent: dict[str, Any]) -> dict[str, Any]:
    """Evaluate only fixture claims and return a proposed decision shape."""
    scopes = set(intent.get("actorScopes", []))
    if "llm:chat" in scopes and not intent.get("attemptGrantRef"):
        return _deny("EXECUTION_GRANT_REQUIRED")
    if intent.get("actorCredentialKind") == "runner-device" or not intent.get(
        "desktopActorRef", "fixture-actor"
    ):
        return _deny("UNAUTHENTICATED_ACTOR")
    if intent.get("enrollmentStatus") == "not-found":
        return _deny("UNENROLLED_DEVICE")
    if intent.get("tenantRef") and intent.get("attemptGrantTenantRef") != intent.get("tenantRef"):
        return _deny("TENANT_SCOPE_MISMATCH")
    if intent.get("grantStatus") in {"revoked", "expired"}:
        return _deny("GRANT_REVOKED_OR_EXPIRED")
    if intent.get("attemptRef") and intent.get("grantAttemptRef") != intent.get("attemptRef"):
        return _deny("ATTEMPT_OR_FENCE_MISMATCH")
    if intent.get("grantFenceRef") and intent.get("grantFenceRef") != intent.get("leaseFenceRef"):
        return _deny("ATTEMPT_OR_FENCE_MISMATCH")
    if intent.get("runnerDeviceRef") and intent.get("grantRunnerDeviceRef") not in {
        None,
        intent.get("runnerDeviceRef"),
    }:
        return _deny("ATTEMPT_OR_FENCE_MISMATCH")
    if intent.get("canonicalRequestDigest") and intent.get("priorCanonicalRequestDigest"):
        if intent["canonicalRequestDigest"] == intent["priorCanonicalRequestDigest"]:
            return {"decision": "REPLAY_EXISTING_ADMISSION", "jobCount": 1}
        return _deny("IDEMPOTENCY_CONFLICT", jobCount=1)
    contract = intent.get("contract")
    if contract and contract.rsplit("v", 1)[-1] != "1":
        return _deny("UNSUPPORTED_CONTRACT")
    if intent.get("workspaceRef") is None:
        operation = intent.get("requestedOperationClass")
        if operation == "filesystem-or-repository":
            return _deny("WORKSPACE_DENIED")
        if operation == "read-only-analysis-report":
            return {"decision": "REQUIRES_CANONICAL_POLICY_ADMISSION", "gitRequired": False}
    if intent.get("grantWorkspaceRef") and intent.get("grantWorkspaceRef") != intent.get("workspaceRef"):
        return _deny("WORKSPACE_DENIED")
    requested = set(intent.get("requestedCapabilityRefs", []))
    effective = set(intent.get("effectiveCapabilityGrantRefs", []))
    if not requested.issubset(effective):
        return _deny("CAPABILITY_DENIED")
    if intent.get("gatewayStatus") == "unavailable":
        return _deny("GATEWAY_UNAVAILABLE", providerCalls=0)
    if intent.get("cancelRequested") and not intent.get("processTerminationObserved"):
        return {"attemptTerminal": False, "action": "RECONCILE_CANONICAL_ATTEMPT"}
    if intent.get("claimedDigest") and intent.get("verifiedDigest"):
        if intent["claimedDigest"] != intent["verifiedDigest"]:
            return _deny("ARTIFACT_INTEGRITY_MISMATCH", published=False)
    return {"decision": "FIXTURE_ONLY_NO_ADMISSION", "sideEffects": []}
