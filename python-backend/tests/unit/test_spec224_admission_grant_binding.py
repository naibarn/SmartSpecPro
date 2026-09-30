"""Fail-closed tests for the admission identity embedded in protected grants."""

import hashlib
import json
from datetime import datetime, timedelta, timezone

import pytest

from app.services.approval_db_service import ApprovalDBService
from app.api.approvals import Spec224RecoveryGrantIssue, Spec224RecoveryGrantValidation


def _scope(admission_binding=None):
    source_commit = "a" * 40
    source_files = [
        {
            "path": "python-backend/app/services/approval_db_service.py",
            "sha256": "b" * 64,
        }
    ]
    source_manifest = {
        "files": source_files,
        "schemaVersion": "spec224.source-manifest.v1",
        "sourceCommit": source_commit,
    }
    scope = {
        "sourceCommit": source_commit,
        "sourceSha256": hashlib.sha256(
            json.dumps(
                source_manifest,
                sort_keys=True,
                separators=(",", ":"),
                ensure_ascii=False,
            ).encode("utf-8")
        ).hexdigest(),
        "sourceFiles": source_files,
        "workpackageId": "WP-RUNTIME-ADMISSION-01",
        "allowedWriteSet": [source_files[0]["path"]],
        "allowedOperations": ["protected_dispatch"],
        "forbiddenOperations": [
            "production",
            "paid_provider",
            "cloudflare_migration",
            "shared_worktree",
        ],
        "runtimeScope": "local-test-runner",
        "environmentScope": "isolated-non-production",
        "expiresAt": (datetime.now(timezone.utc) + timedelta(hours=1))
        .isoformat()
        .replace("+00:00", "Z"),
        "runtimeBinding": {
            "tenantId": "tenant-test",
            "ownerId": 7,
            "runId": "run-test",
            "workerJobId": "job-test",
            "attempt": 1,
            "revision": 1,
            "decisionEpoch": 1,
            "developmentRunFencingVersion": 1,
            "workerJobFencingVersion": 1,
            "runnerId": "runner-test",
            "runnerSessionId": "session-test",
            "capabilitySnapshotId": "capability-test",
            "capabilitySnapshotRevision": "capability-r1",
        },
    }
    if admission_binding is not None:
        scope["admissionBinding"] = {
            **admission_binding,
            "sourceSha256": scope["sourceSha256"],
        }
    return scope


def _admission_binding():
    return {
        "tenantId": "tenant-test",
        "ownerId": 7,
        "runId": "run-test",
        "workerJobId": "job-test",
        "workPackageId": "WP-RUNTIME-ADMISSION-01",
        "attemptId": "attempt-test",
        "attempt": 1,
        "revision": 1,
        "decisionEpoch": 1,
        "developmentRunFencingVersion": 1,
        "workerJobFencingVersion": 1,
        "sourceCommit": "a" * 40,
        "sourceTree": "c" * 40,
        "sourceSha256": "b" * 64,
        "sourceManifestDigest": "2" * 64,
        "profileId": "spec224-runtime-test",
        "profileVersion": 1,
        "profileDigest": "d" * 64,
        "bundleDigest": "e" * 64,
        "artifactEvidenceDigest": "f" * 64,
        "attestationId": "1" * 64,
        "runnerId": "runner-test",
        "runnerSessionId": "session-test",
        "capabilitySnapshotId": "capability-test",
        "capabilitySnapshotRevision": "capability-r1",
    }


def test_protected_grant_requires_complete_admission_binding():
    with pytest.raises(ValueError, match="ADMISSION_BINDING_REQUIRED"):
        ApprovalDBService._recovery_grant_scope(_scope())


def test_recovery_grant_scope_rejects_unknown_fields():
    with pytest.raises(ValueError, match="SCOPE_KEYS_INVALID"):
        ApprovalDBService._recovery_grant_scope({**_scope(), "callerSaysGrantApproved": True})


def test_protected_grant_normalizes_complete_profile_bundle_and_attestation_binding():
    binding = _admission_binding()
    input_scope = _scope(binding)

    normalized = ApprovalDBService._recovery_grant_scope(input_scope)

    assert normalized["admissionBinding"] == input_scope["admissionBinding"]


@pytest.mark.parametrize(
    "change",
    [
        {"sourceTree": "not-a-tree"},
        {"profileDigest": "short"},
        {"bundleDigest": "short"},
        {"artifactEvidenceDigest": "short"},
        {"attestationId": "short"},
        {"workerJobId": "different-job"},
        {"runnerSessionId": "replaced-session"},
        {"workerJobFencingVersion": 2},
    ],
)
def test_protected_grant_rejects_malformed_or_inconsistent_admission_binding(change):
    binding = {**_admission_binding(), **change}

    with pytest.raises(ValueError, match="ADMISSION_BINDING"):
        ApprovalDBService._recovery_grant_scope(_scope(binding))


def test_api_validation_contract_preserves_admission_binding_aliases_and_forbids_extras():
    binding = _admission_binding()
    payload = {
        "schemaVersion": "spec224.recovery-grant-validation.v1",
        "grantId": "0" * 36,
        "tenantId": binding["tenantId"],
        "sourceCommit": binding["sourceCommit"],
        "sourceSha256": binding["sourceSha256"],
        "workpackageId": binding["workPackageId"],
        "operation": "protected_dispatch",
        "path": "apps/web/server/services/externalAgentTaskExecutor.ts",
        "runtimeScope": "local-test-runner",
        "environmentScope": "isolated-non-production",
        "admissionBinding": binding,
    }

    model = Spec224RecoveryGrantValidation.model_validate(payload)

    assert model.model_dump(by_alias=True)["admissionBinding"] == binding
    with pytest.raises(ValueError):
        Spec224RecoveryGrantValidation.model_validate(
            {**payload, "admissionBinding": {**binding, "callerSaysAttestationValid": True}}
        )
    with pytest.raises(ValueError):
        Spec224RecoveryGrantValidation.model_validate({**payload, "callerSaysGrantValid": True})
    with pytest.raises(ValueError):
        Spec224RecoveryGrantValidation.model_validate({**payload, "schemaVersion": "v0"})


def test_recovery_grant_issue_api_rejects_unknown_fields():
    payload = {"idempotencyKey": "spec224-test-key", "scope": _scope()}

    assert Spec224RecoveryGrantIssue.model_validate(payload).idempotency_key == "spec224-test-key"
    with pytest.raises(ValueError):
        Spec224RecoveryGrantIssue.model_validate({**payload, "callerIsOwner": True})
