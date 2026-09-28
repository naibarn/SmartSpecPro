"""
Database-backed Approval Service
Phase 3: SaaS Readiness

This service provides persistent storage for approval requests using SQLAlchemy models.
It complements the in-memory ApprovalService for production use cases.
"""

import structlog
import hashlib
import json
import re
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from uuid import NAMESPACE_URL, uuid4, uuid5
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.approval import (
    ApprovalRequest,
    ApprovalResponse,
    ApprovalStatus,
    ApprovalType,
)
from app.models.user import User, Role
from app.models.tenant import Tenant
from app.models.audit_log import AuditLog

logger = structlog.get_logger(__name__)

SPEC224_PROTECTED_RUNTIME_OPERATIONS = {
    "protected_dispatch",
    "protected_execute",
    "protected_approval_continuation",
    "protected_recovery",
}


class ApprovalDBService:
    """
    Database-backed approval service for persistent approval request storage.

    This service provides CRUD operations for approval requests and responses
    using SQLAlchemy async sessions. It's designed to work alongside or replace
    the in-memory ApprovalService for production environments.
    """

    def __init__(self, db_session: AsyncSession):
        """
        Initialize the approval database service.

        Args:
            db_session: SQLAlchemy async session for database operations
        """
        self.db = db_session
        self._logger = logger.bind(service="approval_db")

    @staticmethod
    def _recovery_grant_scope(value: dict) -> dict:
        """Normalize the exact, non-production P-RECOVERY scope before persistence."""
        if not isinstance(value, dict):
            raise ValueError("SPEC224_RECOVERY_GRANT_SCOPE_INVALID")
        commit = value.get("sourceCommit")
        source_digest = value.get("sourceSha256")
        workpackage = value.get("workpackageId")
        runtime = value.get("runtimeScope")
        environment = value.get("environmentScope")
        if not isinstance(commit, str) or not re.fullmatch(r"[0-9a-f]{40,64}", commit):
            raise ValueError("SPEC224_RECOVERY_GRANT_SOURCE_COMMIT_INVALID")
        if not isinstance(source_digest, str) or not re.fullmatch(r"[0-9a-f]{64}", source_digest):
            raise ValueError("SPEC224_RECOVERY_GRANT_SOURCE_DIGEST_INVALID")
        if not isinstance(workpackage, str) or not re.fullmatch(r"WP-[A-Z0-9-]{3,80}", workpackage):
            raise ValueError("SPEC224_RECOVERY_GRANT_WORKPACKAGE_INVALID")
        if runtime not in {"python-approval", "node-control-plane", "local-test-runner"}:
            raise ValueError("SPEC224_RECOVERY_GRANT_RUNTIME_INVALID")
        if environment != "isolated-non-production":
            raise ValueError("SPEC224_RECOVERY_GRANT_ENVIRONMENT_INVALID")

        source_files = value.get("sourceFiles")
        write_set = value.get("allowedWriteSet")
        operations = value.get("allowedOperations")
        forbidden = value.get("forbiddenOperations")
        if not isinstance(source_files, list) or not source_files or len(source_files) > 500:
            raise ValueError("SPEC224_RECOVERY_GRANT_SOURCE_FILES_INVALID")
        if not isinstance(write_set, list) or not write_set or len(write_set) > 200:
            raise ValueError("SPEC224_RECOVERY_GRANT_WRITE_SET_INVALID")
        if not isinstance(operations, list) or not operations or len(operations) > 20:
            raise ValueError("SPEC224_RECOVERY_GRANT_OPERATIONS_INVALID")
        required_forbidden = {"production", "paid_provider", "cloudflare_migration", "shared_worktree"}
        if not isinstance(forbidden, list) or not required_forbidden.issubset(set(forbidden)):
            raise ValueError("SPEC224_RECOVERY_GRANT_FORBIDDEN_SCOPE_INCOMPLETE")

        def safe_path(path: object) -> str:
            if not isinstance(path, str) or not path or len(path) > 500 or path.startswith(("/", "\\")):
                raise ValueError("SPEC224_RECOVERY_GRANT_PATH_INVALID")
            if "\\" in path or any(part in {"", ".", ".."} for part in path.split("/")) or any(ch in path for ch in "*?[]"):
                raise ValueError("SPEC224_RECOVERY_GRANT_PATH_INVALID")
            if path == ".env" or path.endswith("/.env") or ".pem" in path.lower() or "secret" in path.lower():
                raise ValueError("SPEC224_RECOVERY_GRANT_SENSITIVE_PATH_FORBIDDEN")
            return path

        normalized_sources: list[dict] = []
        for entry in source_files:
            if not isinstance(entry, dict) or not re.fullmatch(r"[0-9a-f]{64}", str(entry.get("sha256", ""))):
                raise ValueError("SPEC224_RECOVERY_GRANT_SOURCE_FILE_HASH_INVALID")
            normalized_sources.append({"path": safe_path(entry.get("path")), "sha256": entry["sha256"]})
        normalized_sources.sort(key=lambda entry: entry["path"])
        if len({entry["path"] for entry in normalized_sources}) != len(normalized_sources):
            raise ValueError("SPEC224_RECOVERY_GRANT_SOURCE_PATH_DUPLICATE")
        source_manifest = {
            "files": normalized_sources,
            "schemaVersion": "spec224.source-manifest.v1",
            "sourceCommit": commit,
        }
        expected_source_digest = hashlib.sha256(json.dumps(
            source_manifest, sort_keys=True, separators=(",", ":"), ensure_ascii=False
        ).encode("utf-8")).hexdigest()
        if source_digest != expected_source_digest:
            raise ValueError("SPEC224_RECOVERY_GRANT_SOURCE_MANIFEST_DIGEST_MISMATCH")
        normalized_write_set = sorted({safe_path(path) for path in write_set})
        if len(normalized_write_set) != len(write_set):
            raise ValueError("SPEC224_RECOVERY_GRANT_WRITE_PATH_DUPLICATE")
        if not set(normalized_write_set).issubset({entry["path"] for entry in normalized_sources}):
            raise ValueError("SPEC224_RECOVERY_GRANT_WRITE_SET_OUTSIDE_SOURCE")
        allowed_operations = sorted(set(operations))
        if len(allowed_operations) != len(operations) or any(op not in {
            "read_source", "modify_owned_paths", "run_focused_tests", "commit_owned_changes",
            *SPEC224_PROTECTED_RUNTIME_OPERATIONS,
        } for op in allowed_operations):
            raise ValueError("SPEC224_RECOVERY_GRANT_OPERATION_INVALID")

        runtime_binding = value.get("runtimeBinding")
        if allowed_operations and set(allowed_operations).intersection(SPEC224_PROTECTED_RUNTIME_OPERATIONS):
            if not isinstance(runtime_binding, dict):
                raise ValueError("SPEC224_RECOVERY_GRANT_RUNTIME_BINDING_REQUIRED")
        if runtime_binding is not None:
            expected_binding_keys = {
                "tenantId", "ownerId", "runId", "workerJobId", "attempt", "revision",
                "decisionEpoch", "developmentRunFencingVersion", "workerJobFencingVersion",
                "runnerId", "runnerSessionId", "capabilitySnapshotId", "capabilitySnapshotRevision",
            }
            if not isinstance(runtime_binding, dict) or set(runtime_binding) != expected_binding_keys:
                raise ValueError("SPEC224_RECOVERY_GRANT_RUNTIME_BINDING_INVALID")
            for key in ("tenantId", "runId", "workerJobId", "runnerId", "runnerSessionId", "capabilitySnapshotId", "capabilitySnapshotRevision"):
                item = runtime_binding.get(key)
                if not isinstance(item, str) or not item.strip() or len(item) > 255:
                    raise ValueError("SPEC224_RECOVERY_GRANT_RUNTIME_BINDING_INVALID")
            if not isinstance(runtime_binding.get("ownerId"), int) or isinstance(runtime_binding["ownerId"], bool) or runtime_binding["ownerId"] <= 0:
                raise ValueError("SPEC224_RECOVERY_GRANT_RUNTIME_BINDING_INVALID")
            for key in ("attempt", "revision", "decisionEpoch", "developmentRunFencingVersion", "workerJobFencingVersion"):
                item = runtime_binding.get(key)
                if not isinstance(item, int) or isinstance(item, bool) or item < 0:
                    raise ValueError("SPEC224_RECOVERY_GRANT_RUNTIME_BINDING_INVALID")
            if runtime_binding["attempt"] < 1:
                raise ValueError("SPEC224_RECOVERY_GRANT_RUNTIME_BINDING_INVALID")

        expires_at = value.get("expiresAt")
        try:
            expiry = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("SPEC224_RECOVERY_GRANT_EXPIRY_INVALID") from exc
        if expiry.tzinfo is None:
            raise ValueError("SPEC224_RECOVERY_GRANT_EXPIRY_INVALID")
        now = datetime.now(timezone.utc)
        expiry = expiry.astimezone(timezone.utc)
        if expiry <= now or expiry > now + timedelta(days=14):
            raise ValueError("SPEC224_RECOVERY_GRANT_EXPIRY_OUT_OF_RANGE")
        return {
            "sourceCommit": commit,
            "sourceSha256": source_digest,
            "sourceFiles": normalized_sources,
            "workpackageId": workpackage,
            "allowedWriteSet": normalized_write_set,
            "allowedOperations": allowed_operations,
            "forbiddenOperations": sorted(required_forbidden),
            "runtimeScope": runtime,
            "environmentScope": environment,
            "expiresAt": expiry.isoformat().replace("+00:00", "Z"),
            **({"runtimeBinding": runtime_binding} if runtime_binding is not None else {}),
        }

    @staticmethod
    def _recovery_grant_audit_valid(grant: dict) -> bool:
        events = grant.get("auditEvents")
        if not isinstance(events, list) or not events:
            return False
        previous = None
        for stored in events:
            if not isinstance(stored, dict):
                return False
            event = {key: value for key, value in stored.items() if key != "eventDigest"}
            canonical = json.dumps(event, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
            digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
            if stored.get("eventDigest") != digest or event.get("previousEventDigest") != previous:
                return False
            previous = digest
        return True

    async def issue_spec224_recovery_grant(
        self, *, tenant_id: str, owner_id: int, idempotency_key: str, scope: dict,
    ) -> dict:
        """Issue a scoped grant only as an authenticated tenant-owner action.

        The grant, ApprovalRequest/ApprovalResponse and AuditLog are committed in
        one transaction. No service or client-supplied approval reference is trusted.
        """
        if not tenant_id or len(tenant_id) > 36 or not isinstance(idempotency_key, str) or not re.fullmatch(r"[A-Za-z0-9._:-]{8,160}", idempotency_key):
            raise ValueError("SPEC224_RECOVERY_GRANT_REQUEST_INVALID")
        normalized = self._recovery_grant_scope(scope)
        canonical_scope = json.dumps(normalized, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        scope_digest = hashlib.sha256(canonical_scope.encode("utf-8")).hexdigest()
        tenant_result = await self.db.execute(select(Tenant.owner_id).where(Tenant.id == tenant_id).with_for_update())
        if tenant_result.scalar_one_or_none() != owner_id:
            raise PermissionError("SPEC224_RECOVERY_GRANT_TENANT_OWNER_REQUIRED")
        runtime_binding = normalized.get("runtimeBinding")
        if runtime_binding is not None and (
            runtime_binding.get("tenantId") != tenant_id or runtime_binding.get("ownerId") != owner_id
        ):
            raise ValueError("SPEC224_RECOVERY_GRANT_RUNTIME_BINDING_INVALID")
        user_result = await self.db.execute(select(User.isDisabled).where(User.id == owner_id))
        disabled = user_result.scalar_one_or_none()
        if disabled is None or disabled:
            raise PermissionError("SPEC224_RECOVERY_GRANT_OWNER_INACTIVE")

        grant_id = str(uuid5(NAMESPACE_URL, f"smartaihub:spec224:recovery-grant:{tenant_id}:{owner_id}:{idempotency_key}"))
        existing = await self.db.execute(select(ApprovalRequest).where(ApprovalRequest.id == grant_id).with_for_update())
        prior = existing.scalar_one_or_none()
        if prior:
            grant = (prior.extra_data or {}).get("spec224RecoveryGrantV1")
            if not isinstance(grant, dict) or grant.get("scopeDigest") != scope_digest:
                raise ValueError("SPEC224_RECOVERY_GRANT_IDEMPOTENCY_CONFLICT")
            return grant

        now = datetime.now(timezone.utc)
        event = {
            "eventType": "issued", "grantId": grant_id, "version": 1,
            "tenantId": tenant_id, "ownerId": owner_id, "scopeDigest": scope_digest,
            "sourceCommit": normalized["sourceCommit"], "sourceSha256": normalized["sourceSha256"],
            "issuedAt": now.isoformat().replace("+00:00", "Z"), "previousEventDigest": None,
        }
        event_text = json.dumps(event, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        grant = {
            "schemaVersion": "spec224.recovery-grant.v1", "grantId": grant_id, "version": 1,
            "tenantId": tenant_id, "ownerId": owner_id, "state": "active",
            "scope": normalized, "scopeDigest": scope_digest,
            "issuedAt": event["issuedAt"], "revocation": None,
            "auditEvents": [{**event, "eventDigest": hashlib.sha256(event_text.encode("utf-8")).hexdigest()}],
        }
        request = ApprovalRequest(
            id=grant_id, request_type=ApprovalType.SECURITY_SENSITIVE,
            title=f"P-RECOVERY scoped grant {normalized['workpackageId']}",
            description="Authenticated tenant-owner issuance of an exact non-production recovery grant.",
            tenant_id=tenant_id, requester_id=owner_id, requester_type="user",
            status=ApprovalStatus.APPROVED, payload={"kind": "spec224_recovery_grant", "scopeDigest": scope_digest},
            extra_data={"spec224RecoveryGrantV1": grant}, action_digest=scope_digest,
            correlation_key=f"spec224-recovery-grant:{tenant_id}:{idempotency_key}"[:255],
            risk_level="critical", required_approvers=1, current_approvals=1,
            created_at=now.replace(tzinfo=None), resolved_at=now.replace(tzinfo=None),
        )
        self.db.add(request)
        self.db.add(ApprovalResponse(
            id=str(uuid4()), request_id=grant_id, approver_id=owner_id,
            decision="approved", comment="Authenticated tenant-owner P-RECOVERY grant issuance.",
            created_at=now.replace(tzinfo=None),
        ))
        self.db.add(AuditLog(
            user_id=str(owner_id), user_role="tenant_owner", action="spec224.recovery_grant.issued",
            resource_type="spec224_recovery_grant", resource_id=grant_id,
            details={"tenantId": tenant_id, "scopeDigest": scope_digest, "eventDigest": grant["auditEvents"][0]["eventDigest"]},
        ))
        await self.db.commit()
        return grant

    async def revoke_spec224_recovery_grant(
        self, *, grant_id: str, tenant_id: str, owner_id: int, reason: str,
    ) -> dict:
        if not reason or len(reason.strip()) < 4 or len(reason) > 500:
            raise ValueError("SPEC224_RECOVERY_GRANT_REVOCATION_REASON_INVALID")
        tenant_result = await self.db.execute(select(Tenant.owner_id).where(Tenant.id == tenant_id).with_for_update())
        if tenant_result.scalar_one_or_none() != owner_id:
            raise PermissionError("SPEC224_RECOVERY_GRANT_TENANT_OWNER_REQUIRED")
        result = await self.db.execute(select(ApprovalRequest).where(
            ApprovalRequest.id == grant_id, ApprovalRequest.tenant_id == tenant_id,
        ).with_for_update())
        request = result.scalar_one_or_none()
        grant = (request.extra_data or {}).get("spec224RecoveryGrantV1") if request else None
        if not isinstance(grant, dict) or grant.get("schemaVersion") != "spec224.recovery-grant.v1":
            raise ValueError("SPEC224_RECOVERY_GRANT_NOT_FOUND")
        if grant.get("state") == "revoked":
            return grant
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        revocation = {"actorId": owner_id, "reason": reason.strip(), "revokedAt": now}
        event = {"eventType": "revoked", "grantId": grant_id, "version": int(grant.get("version", 0)) + 1,
                 "tenantId": tenant_id, "ownerId": owner_id, "scopeDigest": grant["scopeDigest"],
                 "previousEventDigest": grant["auditEvents"][-1].get("eventDigest"), **revocation}
        event_text = json.dumps(event, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        grant = {**grant, "version": event["version"], "state": "revoked", "revocation": revocation,
                 "auditEvents": [*grant.get("auditEvents", []), {**event, "eventDigest": hashlib.sha256(event_text.encode("utf-8")).hexdigest()}]}
        request.extra_data = {**(request.extra_data or {}), "spec224RecoveryGrantV1": grant}
        request.revoked_at = datetime.utcnow()
        self.db.add(AuditLog(
            user_id=str(owner_id), user_role="tenant_owner", action="spec224.recovery_grant.revoked",
            resource_type="spec224_recovery_grant", resource_id=grant_id,
            details={"tenantId": tenant_id, "scopeDigest": grant["scopeDigest"], "eventDigest": grant["auditEvents"][-1]["eventDigest"]},
        ))
        await self.db.commit()
        return grant

    async def validate_spec224_recovery_grant(
        self, *, grant_id: str, tenant_id: str, source_commit: str, source_sha256: str,
        workpackage_id: str, operation: str, path: str, runtime_scope: str, environment_scope: str,
        runtime_binding: Optional[dict] = None,
    ) -> bool:
        result = await self.db.execute(select(ApprovalRequest).where(
            ApprovalRequest.id == grant_id, ApprovalRequest.tenant_id == tenant_id,
        ))
        request = result.scalar_one_or_none()
        grant = (request.extra_data or {}).get("spec224RecoveryGrantV1") if request else None
        if not isinstance(grant, dict) or grant.get("schemaVersion") != "spec224.recovery-grant.v1" or grant.get("state") != "active":
            return False
        if (
            request.status != ApprovalStatus.APPROVED
            or request.revoked_at is not None
            or request.request_type != ApprovalType.SECURITY_SENSITIVE
            or request.requester_type != "user"
            or request.requester_id != grant.get("ownerId")
            or request.action_digest != grant.get("scopeDigest")
            or (request.payload or {}).get("kind") != "spec224_recovery_grant"
            or (request.payload or {}).get("scopeDigest") != grant.get("scopeDigest")
            or request.current_approvals < request.required_approvers
        ):
            return False
        tenant_result = await self.db.execute(select(Tenant.owner_id).where(Tenant.id == tenant_id))
        if tenant_result.scalar_one_or_none() != grant.get("ownerId"):
            return False
        owner_result = await self.db.execute(select(User.isDisabled).where(User.id == grant.get("ownerId")))
        if owner_result.scalar_one_or_none() is not False:
            return False
        if not self._recovery_grant_audit_valid(grant):
            return False
        issued_event = grant["auditEvents"][0]
        approval_result = await self.db.execute(select(ApprovalResponse.id).where(
            ApprovalResponse.request_id == grant_id,
            ApprovalResponse.approver_id == grant.get("ownerId"),
            ApprovalResponse.decision == "approved",
        ).limit(1))
        if approval_result.scalar_one_or_none() is None:
            return False
        audit_result = await self.db.execute(select(AuditLog.details).where(
            AuditLog.user_id == str(grant.get("ownerId")),
            AuditLog.action == "spec224.recovery_grant.issued",
            AuditLog.resource_type == "spec224_recovery_grant",
            AuditLog.resource_id == grant_id,
        ).limit(1))
        audit_details = audit_result.scalar_one_or_none()
        if (
            not isinstance(audit_details, dict)
            or audit_details.get("tenantId") != tenant_id
            or audit_details.get("scopeDigest") != grant.get("scopeDigest")
            or audit_details.get("eventDigest") != issued_event.get("eventDigest")
        ):
            return False
        scope = grant.get("scope")
        if not isinstance(scope, dict):
            return False
        try:
            expires = datetime.fromisoformat(str(scope["expiresAt"]).replace("Z", "+00:00"))
        except (KeyError, ValueError):
            return False
        if expires <= datetime.now(timezone.utc):
            return False
        if (scope.get("sourceCommit") != source_commit or scope.get("sourceSha256") != source_sha256
            or scope.get("workpackageId") != workpackage_id or scope.get("runtimeScope") != runtime_scope
            or scope.get("environmentScope") != environment_scope or operation not in scope.get("allowedOperations", [])
            or operation in scope.get("forbiddenOperations", []) or path not in scope.get("allowedWriteSet", [])):
            return False
        if operation in SPEC224_PROTECTED_RUNTIME_OPERATIONS:
            if not isinstance(runtime_binding, dict) or scope.get("runtimeBinding") != runtime_binding:
                return False
            if runtime_binding.get("tenantId") != tenant_id or runtime_binding.get("ownerId") != grant.get("ownerId"):
                return False
        canonical_scope = json.dumps(scope, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        return hashlib.sha256(canonical_scope.encode("utf-8")).hexdigest() == grant.get("scopeDigest")

    @staticmethod
    def _record_spec224_decision_intent(
        request: ApprovalRequest,
        decision: str,
        actor_id: Optional[int],
        decided_at: datetime,
    ) -> None:
        """Persist a versioned, replayable delivery intent on its authority row."""
        raw_extra_data = getattr(request, "extra_data", None)
        extra_data = raw_extra_data if isinstance(raw_extra_data, dict) else {}
        correlation = extra_data.get("spec224ExternalAgentResume")
        if not isinstance(correlation, dict):
            return
        required = ("jobId", "tenantId", "operationKey", "providerRequestId")
        if any(not isinstance(correlation.get(key), str) or not correlation[key] for key in required):
            return
        if correlation["jobId"] != request.execution_id or correlation["tenantId"] != request.tenant_id:
            return

        correlation = dict(correlation)
        if "requesterId" not in correlation and isinstance(getattr(request, "requester_id", None), int):
            correlation["requesterId"] = request.requester_id

        decided_at = decided_at.replace(tzinfo=timezone.utc) if decided_at.tzinfo is None else decided_at
        decided_at_text = decided_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        decision_epoch = 1
        delivery_id = str(uuid5(NAMESPACE_URL, f"smartaihub:spec224:approval:{request.id}:{decision_epoch}"))
        event = {
            "schemaVersion": "spec224.approval-decision.v1",
            "deliveryId": delivery_id,
            "decisionEpoch": decision_epoch,
            "approvalRequestId": request.id,
            "tenantId": request.tenant_id,
            "jobId": request.execution_id,
            "operationId": correlation["operationKey"],
            "decision": decision,
            "actorId": actor_id,
            "decidedAt": decided_at_text,
            "correlation": correlation,
        }
        canonical = json.dumps(event, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        extra_data = dict(extra_data)
        extra_data["spec224ExternalAgentResume"] = correlation
        extra_data["spec224DecisionDeliveryV1"] = {
            "event": event,
            "canonicalPayload": canonical,
            "payloadDigest": digest,
            "state": "pending",
            "receipt": None,
            "updatedAt": decided_at_text,
        }
        request.extra_data = extra_data

    @staticmethod
    def _read_spec224_delivery(request: ApprovalRequest) -> Optional[dict]:
        extra_data = request.extra_data if isinstance(request.extra_data, dict) else {}
        delivery = extra_data.get("spec224DecisionDeliveryV1")
        if not isinstance(delivery, dict):
            return None
        event = delivery.get("event")
        digest = delivery.get("payloadDigest")
        canonical = delivery.get("canonicalPayload")
        if not isinstance(event, dict) or not isinstance(digest, str) or not isinstance(canonical, str):
            return None
        try:
            decoded = json.loads(canonical)
        except (TypeError, ValueError):
            return None
        if decoded != event or hashlib.sha256(canonical.encode("utf-8")).hexdigest() != digest:
            return None
        return delivery

    async def get_spec224_decision_delivery(
        self, request_id: str, tenant_id: str, job_id: str, operation_id: str
    ) -> Optional[dict]:
        request = await self.get_request(request_id, tenant_id=tenant_id)
        if not request or request.execution_id != job_id:
            return None
        delivery = self._read_spec224_delivery(request)
        if not delivery:
            return None
        event = delivery["event"]
        if (
            event.get("tenantId") != tenant_id
            or event.get("jobId") != job_id
            or event.get("operationId") != operation_id
            or event.get("decision") != request.status.value
        ):
            return None
        return delivery

    async def claim_spec224_decision_deliveries(
        self,
        worker_id: str,
        limit: int = 25,
        lease_seconds: int = 60,
        now: Optional[datetime] = None,
    ) -> list[dict]:
        """Claim persisted Spec 224 decisions for the existing Node reconciler.

        ApprovalRequest remains the decision authority. The lease is delivery
        coordination metadata only; the worker job and its event stream remain
        the execution authority.
        """
        worker_id = worker_id.strip()
        if not worker_id or len(worker_id) > 160 or not 1 <= limit <= 100 or not 5 <= lease_seconds <= 300:
            raise ValueError("SPEC224_DECISION_CLAIM_INVALID")

        now = now or datetime.now(timezone.utc)
        now = now.replace(tzinfo=timezone.utc) if now.tzinfo is None else now.astimezone(timezone.utc)
        now_text = now.isoformat(timespec="milliseconds").replace("+00:00", "Z")
        lease_expires = now + timedelta(seconds=lease_seconds)
        lease_expires_text = lease_expires.isoformat(timespec="milliseconds").replace("+00:00", "Z")
        delivery_json = ApprovalRequest.extra_data["spec224DecisionDeliveryV1"]
        lease_expiry_json = delivery_json["leaseExpiresAt"].as_string()
        stmt = (
            select(ApprovalRequest)
            .where(
                ApprovalRequest.status.in_((ApprovalStatus.APPROVED, ApprovalStatus.REJECTED, ApprovalStatus.EXPIRED, ApprovalStatus.CANCELLED)),
                delivery_json["state"].as_string().in_(("pending", "acknowledged")),
                or_(
                    delivery_json["leaseExpiresAt"].is_(None),
                    lease_expiry_json <= now_text,
                ),
            )
            .order_by(ApprovalRequest.resolved_at.asc(), ApprovalRequest.created_at.asc(), ApprovalRequest.id.asc())
            .limit(limit)
            .with_for_update(skip_locked=True)
        )
        result = await self.db.execute(stmt)
        requests = result.scalars().all()
        claims: list[dict] = []
        for request in requests:
            delivery = self._read_spec224_delivery(request)
            if not delivery:
                continue
            event = delivery["event"]
            if (
                event.get("approvalRequestId") != request.id
                or event.get("tenantId") != request.tenant_id
                or event.get("jobId") != request.execution_id
                or event.get("decision") != request.status.value
                or not isinstance(event.get("operationId"), str)
            ):
                continue
            prior_epoch = delivery.get("leaseEpoch", 0)
            if not isinstance(prior_epoch, int) or prior_epoch < 0:
                continue
            lease_epoch = prior_epoch + 1
            updated = dict(delivery)
            updated.update({
                "leaseOwner": worker_id,
                "leaseEpoch": lease_epoch,
                "leaseExpiresAt": lease_expires_text,
                "leaseClaimedAt": now_text,
            })
            extra_data = dict(request.extra_data or {})
            extra_data["spec224DecisionDeliveryV1"] = updated
            request.extra_data = extra_data
            claims.append({
                "approvalRef": request.id,
                "tenantId": request.tenant_id,
                "jobId": request.execution_id,
                "operationId": event["operationId"],
                "deliveryId": event["deliveryId"],
                "payloadDigest": delivery["payloadDigest"],
                "leaseOwner": worker_id,
                "leaseEpoch": lease_epoch,
                "leaseExpiresAt": lease_expires_text,
            })
        if claims:
            await self.db.commit()
        else:
            await self.db.rollback()
        return claims

    async def acknowledge_spec224_decision_delivery(
        self,
        request_id: str,
        tenant_id: str,
        job_id: str,
        operation_id: str,
        delivery_id: str,
        payload_digest: str,
        receipt: dict,
        lease_owner: str,
        lease_epoch: int,
        now: Optional[datetime] = None,
    ) -> bool:
        request = await self._get_request_for_update(request_id, tenant_id)
        if not request or request.execution_id != job_id:
            await self.db.rollback()
            return False
        delivery = self._read_spec224_delivery(request)
        if not delivery:
            await self.db.rollback()
            return False
        event = delivery["event"]
        if (
            event.get("tenantId") != tenant_id
            or event.get("jobId") != job_id
            or event.get("operationId") != operation_id
            or event.get("deliveryId") != delivery_id
            or event.get("decision") != request.status.value
            or delivery.get("payloadDigest") != payload_digest
        ):
            await self.db.rollback()
            return False
        if delivery.get("state") == "acknowledged":
            previous_receipt = delivery.get("receipt")
            matched = (
                isinstance(previous_receipt, dict)
                and previous_receipt.get("deliveryId") == delivery_id
                and previous_receipt.get("payloadDigest") == payload_digest
                and previous_receipt == receipt
            )
            # A previously committed identical ACK is a read-only idempotent
            # replay. Its original lease may have expired or been superseded;
            # that cannot authorize a new state transition, and no transition
            # occurs on this path.
            await self.db.rollback()
            return matched
        now = now or datetime.now(timezone.utc)
        now = now.replace(tzinfo=timezone.utc) if now.tzinfo is None else now.astimezone(timezone.utc)
        lease_expiry = delivery.get("leaseExpiresAt")
        try:
            parsed_expiry = datetime.fromisoformat(str(lease_expiry).replace("Z", "+00:00"))
        except (TypeError, ValueError):
            await self.db.rollback()
            return False
        if (
            delivery.get("leaseOwner") != lease_owner
            or delivery.get("leaseEpoch") != lease_epoch
            or parsed_expiry <= now
        ):
            await self.db.rollback()
            return False
        delivery = dict(delivery)
        delivery["state"] = "acknowledged"
        delivery["receipt"] = receipt
        delivery["updatedAt"] = now.isoformat().replace("+00:00", "Z")
        extra_data = dict(request.extra_data or {})
        extra_data["spec224DecisionDeliveryV1"] = delivery
        request.extra_data = extra_data
        await self.db.commit()
        return True

    async def _get_request_for_update(
        self, request_id: str, tenant_id: Optional[str] = None
    ) -> Optional[ApprovalRequest]:
        stmt = select(ApprovalRequest).where(ApprovalRequest.id == request_id)
        if tenant_id:
            stmt = stmt.where(ApprovalRequest.tenant_id == tenant_id)
        result = await self.db.execute(stmt.with_for_update())
        return result.scalar_one_or_none()

    async def create_request(
        self,
        request_type: ApprovalType,
        title: str,
        description: Optional[str] = None,
        tenant_id: Optional[str] = None,
        requester_id: Optional[int] = None,
        requester_type: str = "agent",
        project_id: Optional[str] = None,
        execution_id: Optional[str] = None,
        payload: Optional[dict] = None,
        extra_data: Optional[dict] = None,
        action_digest: Optional[str] = None,
        dom_fingerprint: Optional[str] = None,
        screenshot_hash: Optional[str] = None,
        correlation_key: Optional[str] = None,
        risk_level: str = "medium",
        risk_factors: Optional[List[str]] = None,
        required_approvers: int = 1,
        expires_at: Optional[datetime] = None,
        timeout_action: str = "reject",
    ) -> ApprovalRequest:
        """
        Create a new approval request in the database.

        Args:
            request_type: Type of approval (CODE_EXECUTION, DEPLOYMENT, etc.)
            title: Short title describing the request
            description: Detailed description (optional)
            tenant_id: Tenant ID for multi-tenant isolation
            requester_id: User ID of the requester (if applicable)
            requester_type: Type of requester ("agent", "user", "system")
            project_id: Associated project ID
            execution_id: Associated execution ID
            payload: Request payload data
            extra_data: Additional metadata
            action_digest: Stable digest for browser approval replay checks
            dom_fingerprint: Stable DOM fingerprint for context validation
            screenshot_hash: Optional screenshot digest for evidence correlation
            correlation_key: Stable idempotency key for retries
            risk_level: Risk level ("low", "medium", "high", "critical")
            risk_factors: List of identified risk factors
            required_approvers: Number of approvals needed
            expires_at: Expiration timestamp (auto-reject after this)
            timeout_action: Action on timeout ("reject", "approve", "escalate")

        Returns:
            Created ApprovalRequest instance
        """
        # Validate required tenant_id for security isolation
        if not tenant_id:
            raise ValueError("tenant_id is required for approval request creation")

        request_id = str(uuid4())

        # Create request instance
        request = ApprovalRequest(
            id=request_id,
            request_type=request_type,
            title=title,
            description=description,
            tenant_id=tenant_id,
            project_id=project_id,
            execution_id=execution_id,
            requester_id=requester_id,
            requester_type=requester_type,
            status=ApprovalStatus.PENDING,
            payload=payload or {},
            extra_data=extra_data or {},
            action_digest=action_digest,
            dom_fingerprint=dom_fingerprint,
            screenshot_hash=screenshot_hash,
            correlation_key=correlation_key,
            risk_level=risk_level,
            risk_factors=risk_factors or [],
            required_approvers=required_approvers,
            current_approvals=0,
            expires_at=expires_at,
            timeout_action=timeout_action,
        )

        # Save to database
        self.db.add(request)
        await self.db.commit()
        await self.db.refresh(request)

        self._logger.info(
            "approval_request_created",
            request_id=request_id,
            request_type=request_type.value,
            title=title,
            tenant_id=tenant_id,
            requester_id=requester_id,
        )

        return request

    async def get_request(self, request_id: str, tenant_id: Optional[str] = None) -> Optional[ApprovalRequest]:
        """
        Retrieve an approval request by ID.

        Args:
            request_id: UUID of the approval request
            tenant_id: Optional tenant ID for security filtering

        Returns:
            ApprovalRequest instance or None if not found
        """
        request = await self._get_request_for_update(request_id, tenant_id)

        if request:
            # Check for expiration
            if (
                request.status == ApprovalStatus.PENDING
                and request.expires_at
                and datetime.utcnow() > request.expires_at
            ):
                request = await self._get_request_for_update(request_id, tenant_id)
                if (
                    request
                    and request.status == ApprovalStatus.PENDING
                    and request.expires_at
                    and datetime.utcnow() > request.expires_at
                ):
                    request.status = ApprovalStatus.EXPIRED
                    request.resolved_at = datetime.utcnow()
                    self._record_spec224_decision_intent(request, "expired", None, request.resolved_at)
                    await self.db.commit()

                    self._logger.info(
                        "approval_request_expired",
                        request_id=request_id,
                        expires_at=request.expires_at.isoformat(),
                    )

        return request

    async def get_request_by_correlation(
        self,
        correlation_key: str,
        tenant_id: str,
    ) -> Optional[ApprovalRequest]:
        """Return the existing approval for one tenant-scoped idempotency key."""
        stmt = (
            select(ApprovalRequest)
            .where(
                and_(
                    ApprovalRequest.correlation_key == correlation_key,
                    ApprovalRequest.tenant_id == tenant_id,
                )
            )
            .order_by(ApprovalRequest.created_at.desc())
            .limit(1)
        )
        result = await self.db.execute(stmt)
        request = result.scalar_one_or_none()
        if request and request.status == ApprovalStatus.PENDING and request.expires_at and datetime.utcnow() > request.expires_at:
            request = await self._get_request_for_update(request.id, tenant_id)
            if request and request.status == ApprovalStatus.PENDING and request.expires_at and datetime.utcnow() > request.expires_at:
                request.status = ApprovalStatus.EXPIRED
                request.resolved_at = datetime.utcnow()
                self._record_spec224_decision_intent(request, "expired", None, request.resolved_at)
                await self.db.commit()
        return request

    async def list_pending_requests(
        self,
        tenant_id: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[ApprovalRequest]:
        """
        List all pending approval requests, optionally filtered by tenant.

        Args:
            tenant_id: Filter by tenant ID (None = all tenants)
            limit: Maximum number of results
            offset: Pagination offset

        Returns:
            List of pending ApprovalRequest instances
        """
        stmt = (
            select(ApprovalRequest)
            .where(ApprovalRequest.status == ApprovalStatus.PENDING)
            .order_by(ApprovalRequest.created_at.desc())
            .limit(limit)
            .offset(offset)
        )

        if tenant_id:
            stmt = stmt.where(ApprovalRequest.tenant_id == tenant_id)

        result = await self.db.execute(stmt)
        requests = result.scalars().all()

        return list(requests)

    async def list_requests(
        self,
        tenant_id: Optional[str] = None,
        status: Optional[ApprovalStatus] = None,
        request_type: Optional[ApprovalType] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[ApprovalRequest]:
        """
        List approval requests with optional filters.

        Args:
            tenant_id: Filter by tenant ID
            status: Filter by approval status
            request_type: Filter by request type
            limit: Maximum number of results
            offset: Pagination offset

        Returns:
            List of ApprovalRequest instances
        """
        stmt = (
            select(ApprovalRequest)
            .order_by(ApprovalRequest.created_at.desc())
            .limit(limit)
            .offset(offset)
        )

        filters = []
        if tenant_id:
            filters.append(ApprovalRequest.tenant_id == tenant_id)
        if status:
            filters.append(ApprovalRequest.status == status)
        if request_type:
            filters.append(ApprovalRequest.request_type == request_type)

        if filters:
            stmt = stmt.where(and_(*filters))

        result = await self.db.execute(stmt)
        requests = result.scalars().all()

        return list(requests)

    async def submit_decision(
        self,
        request_id: str,
        approver_id: int,
        decision: str,
        comment: Optional[str] = None,
        tenant_id: Optional[str] = None,
        skip_auth_check: bool = False,
    ) -> ApprovalResponse:
        """
        Submit an approval decision (approved or rejected).

        Args:
            request_id: UUID of the approval request
            approver_id: User ID of the approver
            decision: Decision ("approved" or "rejected")
            comment: Optional comment explaining the decision
            tenant_id: Optional tenant ID for security validation
            skip_auth_check: If True, skip can_user_approve() check (for internal/system use only)

        Returns:
            Created ApprovalResponse instance

        Raises:
            ValueError: If request not found or not in PENDING status
            PermissionError: If the user is not authorized to approve this request
        """
        # Serialize decisions on the authority row before checking a retry. A
        # matching response is a safe replay; a different decision by the same
        # actor is a conflict and must never create a second response.
        request = await self._get_request_for_update(request_id, tenant_id)
        if not request:
            raise ValueError(f"Approval request {request_id} not found")
        prior_result = await self.db.execute(
            select(ApprovalResponse).where(
                and_(
                    ApprovalResponse.request_id == request_id,
                    ApprovalResponse.approver_id == approver_id,
                )
            )
        )
        prior_response = prior_result.scalar_one_or_none()
        if prior_response:
            if prior_response.decision == decision:
                return prior_response
            raise ValueError("Conflicting decision replay for approval request")

        # Validate that the approver is authorized before processing
        if not skip_auth_check:
            can_approve = await self.can_user_approve(
                request_id=request_id,
                user_id=approver_id,
            )
            if not can_approve:
                self._logger.warning(
                    "submit_decision_unauthorized",
                    request_id=request_id,
                    approver_id=approver_id,
                )
                raise PermissionError(
                    f"User {approver_id} is not authorized to approve request {request_id}"
                )

        if request.status != ApprovalStatus.PENDING:
            raise ValueError(
                f"Cannot submit decision for request in {request.status.value} status"
            )

        # Create response
        response_id = str(uuid4())
        response = ApprovalResponse(
            id=response_id,
            request_id=request_id,
            approver_id=approver_id,
            decision=decision,
            comment=comment,
        )

        self.db.add(response)

        # Update request based on decision
        if decision == "rejected":
            # Single rejection ends the request
            request.status = ApprovalStatus.REJECTED
            request.resolved_at = datetime.utcnow()
        elif decision == "approved":
            # Increment approval count
            request.current_approvals += 1

            # Check if fully approved
            if request.current_approvals >= request.required_approvers:
                request.status = ApprovalStatus.APPROVED
                request.resolved_at = datetime.utcnow()

        if request.status in (ApprovalStatus.APPROVED, ApprovalStatus.REJECTED):
            self._record_spec224_decision_intent(request, decision, approver_id, request.resolved_at or datetime.utcnow())

        await self.db.commit()
        await self.db.refresh(response)

        self._logger.info(
            "approval_decision_submitted",
            request_id=request_id,
            response_id=response_id,
            approver_id=approver_id,
            decision=decision,
            new_status=request.status.value,
        )

        return response

    async def cleanup_expired_requests(
        self,
        timeout_minutes: int = 10080,  # 7 days default
    ) -> int:
        """
        Mark expired pending requests as EXPIRED.

        Args:
            timeout_minutes: Mark requests pending for longer than this as expired

        Returns:
            Number of requests marked as expired
        """
        cutoff_time = datetime.utcnow() - timedelta(minutes=timeout_minutes)

        stmt = (
            select(ApprovalRequest)
            .where(
                and_(
                    ApprovalRequest.status == ApprovalStatus.PENDING,
                    or_(
                        ApprovalRequest.expires_at < datetime.utcnow(),
                        ApprovalRequest.created_at < cutoff_time,
                    ),
                )
            )
            .with_for_update(skip_locked=True)
        )

        result = await self.db.execute(stmt)
        expired_requests = result.scalars().all()

        count = 0
        for request in expired_requests:
            request.status = ApprovalStatus.EXPIRED
            request.resolved_at = datetime.utcnow()
            self._record_spec224_decision_intent(request, "expired", None, request.resolved_at)
            count += 1

        if count > 0:
            await self.db.commit()
            self._logger.info(
                "expired_requests_cleaned_up",
                count=count,
                timeout_minutes=timeout_minutes,
            )

        return count

    async def count_requests(
        self,
        tenant_id: Optional[str] = None,
        status: Optional[str] = None,
        request_type: Optional[str] = None,
        project_id: Optional[str] = None,
        user_id: Optional[int] = None,
    ) -> int:
        """
        Count approval requests matching the given filters.

        Args:
            tenant_id: Filter by tenant ID
            status: Filter by approval status
            request_type: Filter by request type
            project_id: Filter by project ID
            user_id: Filter by user ID (for user-specific requests)

        Returns:
            Count of matching requests
        """
        from sqlalchemy import func

        stmt = select(func.count(ApprovalRequest.id))

        filters = []
        if tenant_id:
            filters.append(ApprovalRequest.tenant_id == tenant_id)
        if status:
            filters.append(ApprovalRequest.status == status)
        if request_type:
            filters.append(ApprovalRequest.request_type == request_type)
        if project_id:
            filters.append(ApprovalRequest.project_id == project_id)

        if filters:
            stmt = stmt.where(and_(*filters))

        result = await self.db.execute(stmt)
        count = result.scalar()
        return count or 0

    async def list_pending_for_user(
        self,
        user_id: int,
        tenant_id: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[ApprovalRequest]:
        """
        List pending approval requests where the user is a designated approver.

        Filters by the approvers list stored in extra_data->'approvers'.
        If a request has no approvers list in extra_data (legacy/fallback),
        it is still returned for backward compatibility (visible to all
        authenticated users in the tenant).

        Args:
            user_id: User ID to check approval permissions for
            tenant_id: Filter by tenant ID
            limit: Maximum number of results
            offset: Pagination offset

        Returns:
            List of pending ApprovalRequest instances the user can approve
        """
        user_id_str = str(user_id)
        is_admin = await self._is_user_admin(user_id)

        # Portable query path (works across SQLite/Postgres/MySQL):
        # fetch pending requests by tenant, then apply approver filtering in Python.
        stmt = (
            select(ApprovalRequest)
            .where(ApprovalRequest.status == ApprovalStatus.PENDING)
            .order_by(ApprovalRequest.created_at.desc())
        )
        if tenant_id:
            stmt = stmt.where(ApprovalRequest.tenant_id == tenant_id)

        result = await self.db.execute(stmt)
        pending_requests = list(result.scalars().all())

        filtered: List[ApprovalRequest] = []
        for request in pending_requests:
            if is_admin:
                filtered.append(request)
                continue

            extra_data_raw = request.extra_data
            extra_data = extra_data_raw if isinstance(extra_data_raw, dict) else {}
            approvers = extra_data.get("approvers")

            # Legacy fallback: if approvers list is missing/malformed, keep request visible.
            if approvers is None or not isinstance(approvers, list):
                filtered.append(request)
                continue

            if user_id_str in {str(value) for value in approvers}:
                filtered.append(request)

        requests = filtered[offset : offset + limit]

        self._logger.debug(
            "list_pending_for_user",
            user_id=user_id,
            tenant_id=tenant_id,
            count=len(requests),
            total_filtered=len(filtered),
        )

        return list(requests)

    async def _has_already_responded(
        self,
        request_id: str,
        user_id: int,
    ) -> bool:
        """
        Check if a user has already submitted a response for this request.

        Args:
            request_id: UUID of the approval request
            user_id: User ID to check

        Returns:
            True if the user has already responded, False otherwise
        """
        stmt = select(ApprovalResponse).where(
            and_(
                ApprovalResponse.request_id == request_id,
                ApprovalResponse.approver_id == user_id,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none() is not None

    async def _is_user_admin(self, user_id: int) -> bool:
        """
        Check if a user has admin or domain_admin role.

        Args:
            user_id: User ID to check

        Returns:
            True if the user is an admin or domain_admin
        """
        # Select only the authorization field. The Python User model includes
        # optional legacy columns that are not present in every supported
        # SmartSpec schema baseline; loading the full entity makes an otherwise
        # valid approval decision fail with UndefinedColumnError.
        stmt = select(User.role).where(User.id == user_id)
        result = await self.db.execute(stmt)
        role = result.scalar_one_or_none()
        return role in (Role.admin, Role.domain_admin)

    async def can_user_approve(
        self,
        request_id: str,
        user_id: int,
    ) -> bool:
        """
        Check if a user is authorized to approve a specific request.

        Authorization is granted if ALL of the following are true:
        1. The request exists and is in PENDING status
        2. The user has not already responded to this request
        3. The user is listed in extra_data['approvers'] OR has admin/domain_admin role

        Args:
            request_id: UUID of the approval request
            user_id: User ID to check permissions for

        Returns:
            True if user can approve, False otherwise
        """
        # Check if request exists and is pending
        request = await self.get_request(request_id)
        if not request:
            self._logger.debug(
                "can_user_approve_request_not_found",
                request_id=request_id,
                user_id=user_id,
            )
            return False
        if request.status != ApprovalStatus.PENDING:
            self._logger.debug(
                "can_user_approve_not_pending",
                request_id=request_id,
                user_id=user_id,
                status=request.status.value,
            )
            return False

        # Check if user has already responded to this request
        if await self._has_already_responded(request_id, user_id):
            self._logger.info(
                "can_user_approve_already_responded",
                request_id=request_id,
                user_id=user_id,
            )
            return False

        # Prevent self-approval (requester cannot approve their own request)
        if request.requester_id is not None and str(user_id) == str(request.requester_id):
            self._logger.info(
                "can_user_approve_self_approval_blocked",
                request_id=request_id,
                user_id=user_id,
            )
            return False

        # Admin/domain_admin users can always approve (bypass approver list)
        if await self._is_user_admin(user_id):
            self._logger.debug(
                "can_user_approve_admin_bypass",
                request_id=request_id,
                user_id=user_id,
            )
            return True

        # Check if user is in the designated approvers list from extra_data
        extra_data = request.extra_data or {}
        approvers = extra_data.get("approvers")

        if approvers is not None:
            # approvers is a list of user ID strings, e.g. ["1", "5", "12"]
            user_id_str = str(user_id)
            if user_id_str not in approvers:
                self._logger.info(
                    "can_user_approve_not_in_approvers_list",
                    request_id=request_id,
                    user_id=user_id,
                    approvers_count=len(approvers),
                )
                return False

        # If no approvers list is set in extra_data, allow any authenticated user
        # (backwards-compatible behavior for requests created without an approvers list)
        return True

    async def submit_response(
        self,
        request_id: str,
        approver_id: int,
        decision: str,
        comment: Optional[str] = None,
    ) -> Optional[ApprovalRequest]:
        """
        Submit an approval response and update request status.

        This is an alias for submit_decision that returns the updated request.
        Authorization is enforced via submit_decision -> can_user_approve().

        Args:
            request_id: UUID of the approval request
            approver_id: User ID of the approver
            decision: Decision ("approved" or "rejected")
            comment: Optional comment explaining the decision

        Returns:
            Updated ApprovalRequest or None if failed

        Raises:
            PermissionError: If the user is not authorized to approve this request
        """
        try:
            await self.submit_decision(
                request_id=request_id,
                approver_id=approver_id,
                decision=decision,
                comment=comment,
            )
            # Return the updated request
            return await self.get_request(request_id)
        except PermissionError:
            # Re-raise authorization errors so callers can return 403
            raise
        except ValueError as e:
            self._logger.warning(
                "submit_response_failed",
                request_id=request_id,
                error=str(e),
            )
            return None

    async def list_responses(
        self,
        request_id: str,
    ) -> List[ApprovalResponse]:
        """
        List all responses for a specific approval request.

        Args:
            request_id: UUID of the approval request

        Returns:
            List of ApprovalResponse instances
        """
        stmt = (
            select(ApprovalResponse)
            .where(ApprovalResponse.request_id == request_id)
            .order_by(ApprovalResponse.created_at.asc())
        )
        result = await self.db.execute(stmt)
        responses = result.scalars().all()
        return list(responses)

    async def cancel_request(
        self,
        request_id: str,
        cancelled_by: int,
        reason: Optional[str] = None,
        tenant_id: Optional[str] = None,
    ) -> Optional[ApprovalRequest]:
        """
        Cancel a pending approval request.

        Args:
            request_id: UUID of the approval request
            cancelled_by: User ID who cancelled the request
            reason: Optional cancellation reason
            tenant_id: Optional tenant ID for security validation

        Returns:
            Updated ApprovalRequest or None if not found
        """
        request = await self._get_request_for_update(request_id, tenant_id)
        if not request:
            return None

        if request.status == ApprovalStatus.CANCELLED and request.requester_id == cancelled_by:
            delivery = self._read_spec224_delivery(request)
            event = delivery.get("event") if delivery else None
            if (
                (tenant_id is None or request.tenant_id == tenant_id)
                and isinstance(event, dict)
                and event.get("decision") == "cancelled"
                and event.get("actorId") == cancelled_by
            ):
                # A repeated caller cancellation is an idempotent replay only
                # when the persisted Spec 224 intent proves the same actor.
                return request

        if request.status != ApprovalStatus.PENDING:
            self._logger.warning(
                "cannot_cancel_non_pending_request",
                request_id=request_id,
                status=request.status.value,
            )
            return None

        if request.requester_id != cancelled_by:
            self._logger.warning(
                "approval_cancel_requester_mismatch",
                request_id=request_id,
                cancelled_by=cancelled_by,
                tenant_id=tenant_id,
            )
            return None

        if tenant_id and request.tenant_id != tenant_id:
            self._logger.warning(
                "approval_cancel_tenant_mismatch",
                request_id=request_id,
                tenant_id=tenant_id,
            )
            return None

        request.status = ApprovalStatus.CANCELLED
        request.resolved_at = datetime.utcnow()
        self._record_spec224_decision_intent(request, "cancelled", cancelled_by, request.resolved_at)

        await self.db.commit()

        self._logger.info(
            "approval_request_cancelled",
            request_id=request_id,
            cancelled_by=cancelled_by,
            tenant_id=request.tenant_id,
            reason=reason,
        )

        return request

    # ==========================================
    # Approval Rule Methods (Stub implementations)
    # ==========================================

    async def create_rule(self, **kwargs):
        """
        Create an approval rule.
        Stub implementation - to be implemented with ApprovalRule model.
        """
        self._logger.warning("create_rule_not_implemented", kwargs=kwargs)
        raise NotImplementedError("Approval rules are not yet implemented")

    async def list_rules(
        self,
        tenant_id: Optional[str] = None,
        project_id: Optional[str] = None,
        trigger_type: Optional[str] = None,
        is_active: bool = True,
    ):
        """
        List approval rules.
        Stub implementation - returns empty list.
        """
        self._logger.debug("list_rules_stub_called")
        return []

    async def get_rule(self, rule_id: str):
        """
        Get approval rule by ID.
        Stub implementation - returns None.
        """
        self._logger.debug("get_rule_stub_called", rule_id=rule_id)
        return None

    async def update_rule(self, rule_id: str, **kwargs):
        """
        Update an approval rule.
        Stub implementation - to be implemented.
        """
        self._logger.warning("update_rule_not_implemented", rule_id=rule_id)
        raise NotImplementedError("Approval rules are not yet implemented")

    async def delete_rule(self, rule_id: str):
        """
        Delete an approval rule.
        Stub implementation - to be implemented.
        """
        self._logger.debug("delete_rule_stub_called", rule_id=rule_id)
        pass  # No-op for now

    async def toggle_rule(self, rule_id: str, is_active: bool):
        """
        Toggle approval rule active status.
        Stub implementation - returns None.
        """
        self._logger.debug("toggle_rule_stub_called", rule_id=rule_id, is_active=is_active)
        return None
# mypy: ignore-errors
