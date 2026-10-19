"""
Database-backed Approval Service
Phase 3: SaaS Readiness

This service provides persistent storage for approval requests using SQLAlchemy models.
It complements the in-memory ApprovalService for production use cases.
"""

import hashlib
import json
import re
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from uuid import NAMESPACE_URL, uuid4, uuid5

import structlog
from sqlalchemy import and_, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.approval import (
    ApprovalRule,
    ApprovalRequest,
    ApprovalResponse,
    ApprovalStatus,
    ApprovalType,
)
from app.models.audit_log import AuditLog
from app.models.tenant import Tenant, TenantUser
from app.models.user import Role, User
from app.services.cloudflare_staging_policy import CloudflareStagingPolicyAuthority
from app.services.spec224_development_policy import (
    SPEC224_DEVELOPMENT_POLICY_SCHEMA,
    evaluate_development_policy,
    policy_version,
    validate_policy_definition,
)

logger = structlog.get_logger(__name__)


def _canonical_policy_scope(value: dict) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)

_SPEC224_CANONICAL_UUID = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)

_CF_STAGING_GRANT_SCHEMA = "cloudflare.staging-deployment-grant.v1"
_CF_STAGING_TARGET = "smartspec-cloudflare-staging"
_CF_STAGING_ACTIONS = {"deploy", "rollback", "bootstrap"}
_CF_STAGING_SHA = re.compile(r"^[0-9a-f]{40}$")
_CF_STAGING_DIGEST = re.compile(r"^[0-9a-f]{64}$")


def normalize_cloudflare_staging_grant_payload(value: dict) -> dict:
    """Validate and normalize the single supported Cloudflare staging grant shape."""
    if not isinstance(value, dict):
        raise ValueError("CLOUDFLARE_STAGING_GRANT_PAYLOAD_INVALID")
    required = {
        "schemaVersion", "grantRef", "tenantId", "requesterUserId", "projectId",
        "executorId", "targetId", "environment", "artifactRef", "sourceSha",
        "buildDigest", "actions", "rollbackDeploymentId", "rollbackArtifactRef",
        "rollbackSourceSha", "rollbackBuildDigest", "expiresAt", "revokedAt",
    }
    policy_fields = {"accountRef", "jobId"}
    if set(value) not in (required, required | policy_fields):
        raise ValueError("CLOUDFLARE_STAGING_GRANT_FIELDS_INVALID")
    if policy_fields <= set(value) and (
        not isinstance(value["accountRef"], str) or not re.fullmatch(r"[a-f0-9]{32}", value["accountRef"])
        or not isinstance(value["jobId"], str) or not _SPEC224_CANONICAL_UUID.fullmatch(value["jobId"])
    ):
        raise ValueError("CLOUDFLARE_STAGING_GRANT_POLICY_BINDING_INVALID")
    if value["schemaVersion"] != _CF_STAGING_GRANT_SCHEMA:
        raise ValueError("CLOUDFLARE_STAGING_GRANT_SCHEMA_INVALID")
    if value["targetId"] != _CF_STAGING_TARGET or value["environment"] != "staging":
        raise ValueError("CLOUDFLARE_STAGING_GRANT_TARGET_INVALID")
    for field in ("grantRef", "tenantId", "projectId", "executorId", "artifactRef"):
        if not isinstance(value[field], str) or not value[field].strip() or len(value[field]) > 255:
            raise ValueError("CLOUDFLARE_STAGING_GRANT_FIELD_INVALID")
    if type(value["requesterUserId"]) is not int or value["requesterUserId"] <= 0:
        raise ValueError("CLOUDFLARE_STAGING_GRANT_REQUESTER_INVALID")
    bootstrap = value["actions"] == ["bootstrap"]
    if isinstance(value["actions"], list) and "bootstrap" in value["actions"] and not bootstrap:
        raise ValueError("CLOUDFLARE_STAGING_GRANT_ACTIONS_INVALID")
    rollback_fields = ("rollbackDeploymentId", "rollbackArtifactRef", "rollbackSourceSha", "rollbackBuildDigest")
    if bootstrap and any(value[field] is not None for field in rollback_fields):
        raise ValueError("CLOUDFLARE_STAGING_GRANT_ROLLBACK_INVALID")
    for field in (("sourceSha",) if bootstrap else ("sourceSha", "rollbackSourceSha")):
        if not isinstance(value[field], str) or not _CF_STAGING_SHA.fullmatch(value[field]):
            raise ValueError("CLOUDFLARE_STAGING_GRANT_SOURCE_SHA_INVALID")
    for field in (("buildDigest",) if bootstrap else ("buildDigest", "rollbackBuildDigest")):
        if not isinstance(value[field], str) or not _CF_STAGING_DIGEST.fullmatch(value[field]):
            raise ValueError("CLOUDFLARE_STAGING_GRANT_BUILD_DIGEST_INVALID")
    if value["artifactRef"] != f"sha256:{value['buildDigest']}" or (not bootstrap and value["rollbackArtifactRef"] != f"sha256:{value['rollbackBuildDigest']}"):
        raise ValueError("CLOUDFLARE_STAGING_GRANT_ARTIFACT_REF_INVALID")
    if not isinstance(value["actions"], list) or not value["actions"]:
        raise ValueError("CLOUDFLARE_STAGING_GRANT_ACTIONS_INVALID")
    if any(not isinstance(action, str) or action not in _CF_STAGING_ACTIONS for action in value["actions"]):
        raise ValueError("CLOUDFLARE_STAGING_GRANT_ACTIONS_INVALID")
    if len(set(value["actions"])) != len(value["actions"]):
        raise ValueError("CLOUDFLARE_STAGING_GRANT_ACTIONS_INVALID")
    for field in (() if bootstrap else ("rollbackDeploymentId", "rollbackArtifactRef")):
        if not isinstance(value[field], str) or not value[field].strip() or len(value[field]) > 255:
            raise ValueError("CLOUDFLARE_STAGING_GRANT_ROLLBACK_INVALID")
    if not isinstance(value["expiresAt"], str):
        raise ValueError("CLOUDFLARE_STAGING_GRANT_EXPIRY_INVALID")
    try:
        expires_at = datetime.fromisoformat(value["expiresAt"].replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("CLOUDFLARE_STAGING_GRANT_EXPIRY_INVALID") from exc
    if expires_at.tzinfo is None:
        raise ValueError("CLOUDFLARE_STAGING_GRANT_EXPIRY_INVALID")
    if value["revokedAt"] is not None:
        if not isinstance(value["revokedAt"], str):
            raise ValueError("CLOUDFLARE_STAGING_GRANT_REVOCATION_INVALID")
        try:
            revoked_at = datetime.fromisoformat(value["revokedAt"].replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("CLOUDFLARE_STAGING_GRANT_REVOCATION_INVALID") from exc
        if revoked_at.tzinfo is None:
            raise ValueError("CLOUDFLARE_STAGING_GRANT_REVOCATION_INVALID")
    return {**value, "actions": sorted(value["actions"])}


def _spec224_recovery_grant_fence_identity(tenant_id: str, grant_id: str) -> str:
    """Build the cross-service lock key from canonical UUID identities only."""
    if (
        not isinstance(tenant_id, str)
        or not isinstance(grant_id, str)
        or not _SPEC224_CANONICAL_UUID.fullmatch(tenant_id)
        or not _SPEC224_CANONICAL_UUID.fullmatch(grant_id)
    ):
        raise ValueError("SPEC224_RECOVERY_GRANT_FENCE_IDENTITY_INVALID")
    return f"spec224:recovery-grant:{tenant_id.lower()}:{grant_id.lower()}"


async def _record_spec224_start_containment_intents(
    db: AsyncSession, *, grant_id: str, tenant_id: str, grant: dict,
    actor_id: int, reason: str, revoked_at: str,
) -> dict:
    """Persist idempotent containment intent for an already-started bound job.

    This writes only to the canonical worker_job_events stream. It does not
    mutate job state or claim that a Runner cancellation was delivered.
    Caller holds the cross-service grant fence and commits the transaction.
    """
    runtime_binding = grant.get("scope", {}).get("runtimeBinding")
    if not isinstance(runtime_binding, dict):
        return {"intentIds": [], "reviewEventIds": [], "reviewRequired": False, "reviewReasons": []}
    worker_job_id = runtime_binding.get("workerJobId")
    if not isinstance(worker_job_id, str) or not worker_job_id.strip():
        raise ValueError("SPEC224_RECOVERY_GRANT_RUNTIME_BINDING_INVALID")

    result = await db.execute(text(
        'SELECT "tenantId", attempt, "fencingVersion", status, "statusReason", "leaseExpiresAt" '
        'FROM worker_jobs WHERE id = :worker_job_id FOR UPDATE'
    ), {"worker_job_id": worker_job_id})
    job = result.mappings().one_or_none()
    bound_attempt = runtime_binding.get("attempt")
    attempt_id_result = await db.execute(text(
        'SELECT id, "finishedAt", "leaseExpiresAt", "leaseGeneration" '
        'FROM worker_job_attempts WHERE "workerJobId" = :worker_job_id '
        'AND attempt = :attempt FOR UPDATE'
    ), {"worker_job_id": worker_job_id, "attempt": bound_attempt})
    canonical_attempt = attempt_id_result.mappings().one_or_none()
    canonical_attempt_id = canonical_attempt["id"] if canonical_attempt else None
    outcome = {"intentIds": [], "reviewEventIds": [], "reviewRequired": False, "reviewReasons": []}

    async def append_event(event_type: str, event_key: str, attempt_id: Optional[str], payload: dict) -> bool:
        existing_result = await db.execute(text(
            'SELECT "eventType", "payloadJson" FROM worker_job_events '
            'WHERE "workerJobId" = :worker_job_id AND "eventIdempotencyKey" = :event_key LIMIT 1'
        ), {"worker_job_id": worker_job_id, "event_key": event_key})
        existing = existing_result.mappings().one_or_none()
        if existing is not None:
            existing_payload = existing["payloadJson"]
            if isinstance(existing_payload, str):
                try:
                    existing_payload = json.loads(existing_payload)
                except json.JSONDecodeError:
                    return False
            return existing["eventType"] == event_type and existing_payload == payload
        sequence_result = await db.execute(text(
            'SELECT COALESCE(MAX("eventSequence"), 0) + 1 '
            'FROM worker_job_events WHERE "workerJobId" = :worker_job_id'
        ), {"worker_job_id": worker_job_id})
        await db.execute(text(
            'INSERT INTO worker_job_events '
            '("workerJobId", "eventType", "eventSequence", "eventIdempotencyKey", "attemptId", "payloadJson") '
            'VALUES (:worker_job_id, :event_type, :event_sequence, :event_key, :attempt_id, CAST(:payload AS jsonb))'
        ), {
            "worker_job_id": worker_job_id, "event_type": event_type,
            "event_sequence": int(sequence_result.scalar_one()), "event_key": event_key,
            "attempt_id": attempt_id,
            "payload": json.dumps(payload, sort_keys=True, separators=(",", ":")),
        })
        return True

    async def add_review_intent(
        source_event_key: Optional[str], attempt_id: Optional[str], reason_code: str,
        *, grant_correlated: bool = True,
    ) -> None:
        outcome["reviewRequired"] = True
        if reason_code not in outcome["reviewReasons"]:
            outcome["reviewReasons"].append(reason_code)
        if not job or job["tenantId"] != tenant_id or canonical_attempt_id is None:
            return
        source_identity = source_event_key or "missing-event-key"
        source_digest = hashlib.sha256(source_identity.encode("utf-8")).hexdigest()
        review_key = (
            f"spec224:protected-start-review:{grant_id}:{source_digest}"
            if grant_correlated
            else f"spec224:protected-start-unattributed-review:{worker_job_id}:{source_digest}"
        )
        review_payload = {
            "schemaVersion": "spec224.protected-execution-containment-review.v1",
            "tenantId": tenant_id, "workerJobId": worker_job_id,
            "sourceStartEventIdempotencyKey": source_event_key,
            "reasonCode": reason_code, "actorId": actor_id, "reason": reason,
            "revokedAt": revoked_at, "deliveryState": "OPERATOR_REVIEW_REQUIRED",
        }
        if grant_correlated:
            review_payload["grantId"] = grant_id
        else:
            review_payload["authorityAttribution"] = "UNATTRIBUTED"
        if await append_event(
            "SPEC224_PROTECTED_EXECUTION_CONTAINMENT_REVIEW_REQUIRED",
            review_key, attempt_id, review_payload,
        ):
            outcome["reviewEventIds"].append(review_key)
            return
        # A conflicting review marker is not overwritten and does not prevent
        # owner revocation; the durable grant revocation records the unresolved
        # review condition even if both event keys have been corrupted.
        outcome["reviewReasons"].append("REVIEW_MARKER_CONFLICT")

    if not job or job["tenantId"] != tenant_id or canonical_attempt_id is None:
        outcome["reviewRequired"] = True
        outcome["reviewReasons"].append(
            "JOB_TENANT_BINDING_MISMATCH" if not job or job["tenantId"] != tenant_id else "ATTEMPT_BINDING_MISSING"
        )
        return outcome
    current_state_matches = (
        job["attempt"] == bound_attempt
        and job["fencingVersion"] == runtime_binding.get("workerJobFencingVersion")
        and job["status"] == "running"
        and not str(job["statusReason"] or "").startswith("cancel_requested:")
        and job["leaseExpiresAt"] is not None
        and job["leaseExpiresAt"] > datetime.now(timezone.utc)
        and canonical_attempt["finishedAt"] is None
        and canonical_attempt["leaseExpiresAt"] is not None
        and canonical_attempt["leaseExpiresAt"] > datetime.now(timezone.utc)
    )
    if not current_state_matches:
        outcome["reviewRequired"] = True
        outcome["reviewReasons"].append("CURRENT_JOB_OR_LEASE_BINDING_STALE")
        return outcome

    # Match canonical lock order: job row -> attempt row -> event stream. Both
    # Node appendJobEvent and this Python revocation share this advisory key.
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:worker_job_id))"),
        {"worker_job_id": worker_job_id},
    )

    result = await db.execute(text(
        'SELECT "eventType", "eventIdempotencyKey", "attemptId", "payloadJson" '
        'FROM worker_job_events WHERE "workerJobId" = :worker_job_id '
        'AND "eventType" = \'SPEC224_PROTECTED_EXECUTION_STARTED\' '
        'ORDER BY "eventSequence", "createdAt", id'
    ), {"worker_job_id": worker_job_id})
    start_rows = result.mappings().all()
    for row in start_rows:
        payload = row["payloadJson"]
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except json.JSONDecodeError:
                if row["attemptId"] == canonical_attempt_id:
                    await add_review_intent(
                        row["eventIdempotencyKey"], row["attemptId"], "MALFORMED_START_PAYLOAD",
                        grant_correlated=False,
                    )
                continue
        if not isinstance(payload, dict):
            if row["attemptId"] == canonical_attempt_id:
                await add_review_intent(
                    row["eventIdempotencyKey"], row["attemptId"], "MALFORMED_START_PAYLOAD",
                    grant_correlated=False,
                )
            continue
        if payload.get("grantId") != grant_id:
            continue
        operation_id = payload.get("operationId")
        if (
            payload.get("schemaVersion") != "spec224.protected-execution-start.v1"
            or payload.get("tenantId") != tenant_id
            or payload.get("workerJobId") != worker_job_id
            or payload.get("attemptId") != canonical_attempt_id
            or row["attemptId"] != canonical_attempt_id
            or payload.get("attempt") != bound_attempt
            or payload.get("leaseGeneration") != canonical_attempt["leaseGeneration"]
            or payload.get("workerJobFencingVersion") != runtime_binding.get("workerJobFencingVersion")
            or payload.get("grantVersion") != (grant.get("auditEvents") or [{}])[0].get("version")
            or payload.get("grantScopeDigest") != grant.get("scopeDigest")
            or not isinstance(operation_id, str)
            or not operation_id.strip()
            or len(operation_id) > 120
        ):
            await add_review_intent(row["eventIdempotencyKey"], row["attemptId"], "START_BINDING_CONFLICT")
            continue

        event_key = f"spec224:protected-start-containment:{grant_id}:{operation_id}"
        if len(event_key) > 200:
            await add_review_intent(row["eventIdempotencyKey"], row["attemptId"], "CONTAINMENT_IDENTITY_TOO_LONG")
            continue
        intent_payload = {
            "schemaVersion": "spec224.protected-execution-containment.v1",
            "evidenceClass": payload.get("evidenceClass", "UNCLASSIFIED"),
            "tenantId": tenant_id,
            "workerJobId": worker_job_id,
            "grantId": grant_id,
            "grantVersion": payload.get("grantVersion"),
            "grantScopeDigest": grant.get("scopeDigest"),
            "sourceStartEventIdempotencyKey": row["eventIdempotencyKey"],
            "operationId": operation_id,
            "attemptId": row["attemptId"],
            "actorId": actor_id,
            "reason": reason,
            "revokedAt": revoked_at,
            "deliveryState": "PENDING_CANONICAL_CONSUMER",
        }
        if not await append_event(
            "SPEC224_PROTECTED_EXECUTION_CONTAINMENT_REQUIRED",
            event_key, row["attemptId"], intent_payload,
        ):
            await add_review_intent(row["eventIdempotencyKey"], row["attemptId"], "CONTAINMENT_IDEMPOTENCY_CONFLICT")
            continue
        outcome["intentIds"].append(event_key)
    return outcome


SPEC224_PROTECTED_RUNTIME_OPERATIONS = {
    "protected_dispatch",
    "protected_execute",
    "protected_approval_continuation",
    "protected_recovery",
}


class ApprovalDBService(CloudflareStagingPolicyAuthority):
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

    async def _require_spec224_policy_owner(self, tenant_id: str, actor_id: int) -> Tenant:
        tenant_result = await self.db.execute(
            select(Tenant).where(Tenant.id == tenant_id).with_for_update()
        )
        tenant = tenant_result.scalar_one_or_none()
        if tenant is None:
            raise ValueError("SPEC224_POLICY_TENANT_NOT_FOUND")
        if tenant.owner_id != actor_id:
            raise PermissionError("SPEC224_POLICY_TENANT_OWNER_REQUIRED")
        return tenant

    async def create_spec224_development_policy(
        self, *, tenant_id: str, project_id: str, actor_id: int, definition: dict,
    ) -> ApprovalRule:
        if not tenant_id or not project_id or len(project_id) > 255:
            raise ValueError("SPEC224_POLICY_SCOPE_INVALID")
        await self._require_spec224_policy_owner(tenant_id, actor_id)
        policy = validate_policy_definition(definition)
        try:
            expires_at = datetime.fromisoformat(policy["expiresAt"].replace("Z", "+00:00"))
        except (TypeError, ValueError) as exc:
            raise ValueError("SPEC224_POLICY_EXPIRY_INVALID") from exc
        now = datetime.now(timezone.utc)
        if expires_at.tzinfo is None or expires_at <= now or expires_at > now + timedelta(days=30):
            raise ValueError("SPEC224_POLICY_EXPIRY_OUT_OF_RANGE")
        policy_id = str(uuid4())
        rule = ApprovalRule(
            id=policy_id,
            name=f"SPEC-224 non-production policy {project_id[:60]}",
            description="Owner-authored bounded SPEC-224 development approval policy.",
            tenant_id=tenant_id,
            project_id=project_id,
            trigger_type=ApprovalType.CODE_EXECUTION,
            conditions={
                "schemaVersion": SPEC224_DEVELOPMENT_POLICY_SCHEMA,
                "ownerUserId": actor_id,
                "definition": policy,
            },
            approver_roles=[],
            approver_users=[],
            required_approvals=0,
            timeout_minutes=max(5, min(1440, int((expires_at - now).total_seconds() // 60))),
            timeout_action="reject",
            auto_approve_conditions={},
            priority=0,
            is_active=True,
        )
        self.db.add(rule)
        self.db.add(AuditLog(
            user_id=str(actor_id),
            user_role="tenant_owner",
            action="spec224.development_policy.created",
            resource_type="spec224_development_policy",
            resource_id=policy_id,
            details={"tenantId": tenant_id, "projectId": project_id, "schemaVersion": SPEC224_DEVELOPMENT_POLICY_SCHEMA},
        ))
        await self.db.commit()
        await self.db.refresh(rule)
        return rule

    async def revoke_spec224_development_policy(
        self, *, policy_id: str, tenant_id: str, actor_id: int,
    ) -> ApprovalRule:
        await self._require_spec224_policy_owner(tenant_id, actor_id)
        result = await self.db.execute(
            select(ApprovalRule).where(
                ApprovalRule.id == policy_id,
                ApprovalRule.tenant_id == tenant_id,
                ApprovalRule.trigger_type == ApprovalType.CODE_EXECUTION,
            ).with_for_update()
        )
        rule = result.scalar_one_or_none()
        if rule is None or not isinstance(rule.conditions, dict) or rule.conditions.get("schemaVersion") != SPEC224_DEVELOPMENT_POLICY_SCHEMA:
            raise ValueError("SPEC224_POLICY_NOT_FOUND")
        if rule.is_active:
            rule.is_active = False
            now = datetime.now(timezone.utc).replace(tzinfo=None)
            approval_result = await self.db.execute(
                select(ApprovalRequest).where(
                    ApprovalRequest.tenant_id == tenant_id,
                    ApprovalRequest.project_id == rule.project_id,
                    ApprovalRequest.status == ApprovalStatus.APPROVED,
                    ApprovalRequest.expires_at > now,
                    ApprovalRequest.correlation_key.like(f"spec224-policy:{policy_id}:%"),
                ).with_for_update()
            )
            revoked_approvals = list(approval_result.scalars().all())
            for approval in revoked_approvals:
                approval.status = ApprovalStatus.CANCELLED
                approval.revoked_at = now
                approval.resolved_at = now
            self.db.add(AuditLog(
                user_id=str(actor_id),
                user_role="tenant_owner",
                action="spec224.development_policy.revoked",
                resource_type="spec224_development_policy",
                resource_id=policy_id,
                details={
                    "tenantId": tenant_id,
                    "projectId": rule.project_id,
                    "revokedApprovalCount": len(revoked_approvals),
                },
            ))
            await self.db.commit()
            await self.db.refresh(rule)
        else:
            await self.db.rollback()
        return rule

    async def decide_spec224_development_policy(
        self, *,
        policy_id: str | None,
        tenant_id: str,
        project_id: str,
        actor_id: int,
        idempotency_key: str,
        request: dict,
        now: datetime | None = None,
    ) -> ApprovalRequest:
        if not isinstance(idempotency_key, str) or not 8 <= len(idempotency_key) <= 160:
            raise ValueError("SPEC224_POLICY_IDEMPOTENCY_KEY_INVALID")
        query = select(ApprovalRule).where(
            ApprovalRule.tenant_id == tenant_id,
            ApprovalRule.project_id == project_id,
            ApprovalRule.trigger_type == ApprovalType.CODE_EXECUTION,
            ApprovalRule.is_active.is_(True),
        )
        if policy_id:
            query = query.where(ApprovalRule.id == policy_id)
        result = await self.db.execute(query)
        candidates = [
            row for row in result.scalars().all()
            if isinstance(row.conditions, dict)
            and row.conditions.get("schemaVersion") == SPEC224_DEVELOPMENT_POLICY_SCHEMA
        ]
        if not candidates:
            raise ValueError("SPEC224_POLICY_NOT_ACTIVE")
        if len(candidates) != 1:
            raise ValueError("SPEC224_POLICY_AMBIGUOUS")
        rule = candidates[0]
        tenant_owner_user_id = int(rule.conditions.get("ownerUserId") or 0)
        tenant = await self._require_spec224_policy_owner(tenant_id, tenant_owner_user_id)
        actor_result = await self.db.execute(
            select(User.id).where(
                User.id == actor_id,
                User.isDisabled.is_(False),
                User.is_banned.is_(False),
            )
        )
        if actor_result.scalar_one_or_none() is None:
            raise PermissionError("SPEC224_POLICY_ACTOR_NOT_AUTHENTICATED")
        member_result = await self.db.execute(
            select(TenantUser.id).where(
                TenantUser.tenant_id == tenant_id,
                TenantUser.user_id == actor_id,
                TenantUser.is_active.is_(True),
            )
        )
        if actor_id != tenant.owner_id and member_result.scalar_one_or_none() is None:
            raise PermissionError("SPEC224_POLICY_ACTOR_TENANT_MEMBERSHIP_REQUIRED")
        result = await self.db.execute(
            select(ApprovalRule).where(
                ApprovalRule.id == rule.id,
                ApprovalRule.tenant_id == tenant_id,
                ApprovalRule.project_id == project_id,
                ApprovalRule.trigger_type == ApprovalType.CODE_EXECUTION,
                ApprovalRule.is_active.is_(True),
            ).with_for_update()
        )
        rule = result.scalar_one_or_none()
        if rule is None or not isinstance(rule.conditions, dict):
            raise ValueError("SPEC224_POLICY_NOT_ACTIVE")
        if rule.conditions.get("schemaVersion") != SPEC224_DEVELOPMENT_POLICY_SCHEMA:
            raise ValueError("SPEC224_POLICY_SCHEMA_INVALID")
        if int(rule.conditions.get("ownerUserId") or 0) != tenant_owner_user_id:
            raise ValueError("SPEC224_POLICY_OWNER_BINDING_INVALID")
        policy = rule.conditions.get("definition")
        if not isinstance(policy, dict):
            raise ValueError("SPEC224_POLICY_DEFINITION_INVALID")
        decision = evaluate_development_policy(
            policy=policy,
            policy_id=rule.id,
            tenant_id=tenant_id,
            project_id=project_id,
            actor_id=actor_id,
            request=request,
            now=now,
        )
        if decision.get("decision") != "APPROVE":
            raise PermissionError(str(decision.get("reason", "SPEC224_POLICY_DENIED")))

        canonical_request = {
            **request,
            "tenantId": tenant_id,
            "projectId": project_id,
            "actorId": actor_id,
            "policyId": rule.id,
            "policyVersion": decision["policyVersion"],
        }
        action_digest = hashlib.sha256(
            json.dumps(canonical_request, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()
        correlation_key = f"spec224-policy:{rule.id}:" + hashlib.sha256(
            f"{tenant_id}:{idempotency_key}".encode("utf-8")
        ).hexdigest()
        await self.db.execute(
            text("SELECT pg_advisory_xact_lock(hashtext(:lock_key))"),
            {"lock_key": correlation_key},
        )
        existing = await self.get_request_by_correlation(correlation_key, tenant_id)
        if existing:
            extra = existing.extra_data if isinstance(existing.extra_data, dict) else {}
            prior = extra.get("spec224DevelopmentPolicyDecisionV1")
            if existing.action_digest != action_digest or not isinstance(prior, dict):
                raise ValueError("SPEC224_POLICY_IDEMPOTENCY_CONFLICT")
            return existing

        request_id = str(uuid5(NAMESPACE_URL, correlation_key))
        audit_id = str(uuid4())
        decision_time = now or datetime.now(timezone.utc)
        decision_time = decision_time.replace(tzinfo=timezone.utc) if decision_time.tzinfo is None else decision_time.astimezone(timezone.utc)
        decision_record = {
            "schemaVersion": "spec224.development-policy-decision.v1",
            "policyId": rule.id,
            "policyVersion": decision["policyVersion"],
            "policyOwnerUserId": int(rule.conditions["ownerUserId"]),
            "actorUserId": actor_id,
            "decisionActor": "service:spec224-development-policy-authority",
            "decision": "APPROVED",
            "scope": canonical_request,
            "decidedAt": decision_time.isoformat().replace("+00:00", "Z"),
            "expiresAt": decision["expiresAt"],
            "auditRef": audit_id,
        }
        approval = ApprovalRequest(
            id=request_id,
            request_type=ApprovalType.CODE_EXECUTION,
            title="SPEC-224 policy-approved development operation",
            description="Approved by a tenant-owned bounded non-production policy.",
            tenant_id=tenant_id,
            project_id=project_id,
            execution_id=str(request.get("executionId") or "") or None,
            requester_id=actor_id,
            requester_type="user",
            status=ApprovalStatus.APPROVED,
            payload=canonical_request,
            extra_data={"spec224DevelopmentPolicyDecisionV1": decision_record},
            action_digest=action_digest,
            correlation_key=correlation_key,
            risk_level="low",
            risk_factors=["spec224_nonproduction_policy"],
            required_approvers=0,
            current_approvals=0,
            expires_at=datetime.fromisoformat(decision["expiresAt"].replace("Z", "+00:00")).replace(tzinfo=None),
            timeout_action="reject",
            resolved_at=decision_time.replace(tzinfo=None),
        )
        self.db.add(approval)
        self.db.add(AuditLog(
            id=audit_id,
            user_id=str(actor_id),
            user_role="spec224_development_policy",
            action="spec224.development_policy.decision_approved",
            resource_type="approval_request",
            resource_id=request_id,
            details={"tenantId": tenant_id, "projectId": project_id, "policyId": rule.id, "policyVersion": decision["policyVersion"], "decisionActor": decision_record["decisionActor"]},
        ))
        await self.db.commit()
        await self.db.refresh(approval)
        return approval

    async def create_cloudflare_staging_grant_request(
        self, *, tenant_id: str, requester_id: int, idempotency_key: str, payload: dict,
        policy_id: str | None = None,
    ) -> ApprovalRequest:
        """Create an admin-authorized, typed Cloudflare staging grant approval."""
        if not tenant_id or len(tenant_id) > 36:
            raise ValueError("CLOUDFLARE_STAGING_GRANT_TENANT_REQUIRED")
        if not isinstance(idempotency_key, str) or not 8 <= len(idempotency_key) <= 160:
            raise ValueError("CLOUDFLARE_STAGING_GRANT_IDEMPOTENCY_KEY_INVALID")
        role_result = await self.db.execute(select(User.role).where(User.id == requester_id))
        requester_role = role_result.scalar_one_or_none()
        if requester_role not in (Role.admin, Role.domain_admin):
            raise PermissionError("CLOUDFLARE_STAGING_GRANT_ADMIN_REQUIRED")

        grant = normalize_cloudflare_staging_grant_payload(payload)
        if grant["tenantId"] != tenant_id or grant["requesterUserId"] != requester_id:
            raise ValueError("CLOUDFLARE_STAGING_GRANT_REQUEST_BINDING_INVALID")
        if grant["revokedAt"] is not None:
            raise ValueError("CLOUDFLARE_STAGING_GRANT_INITIAL_REVOCATION_INVALID")
        expires_at = datetime.fromisoformat(grant["expiresAt"].replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        if expires_at <= now or expires_at > now + timedelta(days=30):
            raise ValueError("CLOUDFLARE_STAGING_GRANT_EXPIRY_OUT_OF_RANGE")

        correlation_key = "cf-staging-grant:" + hashlib.sha256(
            f"{tenant_id}:{idempotency_key}".encode("utf-8")
        ).hexdigest()
        grant_id = str(uuid5(NAMESPACE_URL, correlation_key))
        grant = normalize_cloudflare_staging_grant_payload({**grant, "grantRef": grant_id})

        policy_decision = None
        if policy_id:
            policy_decision = await self.authorize_cloudflare_staging_policy_grant(policy_id, grant)
        elif "jobId" in grant or "accountRef" in grant:
            raise ValueError("CLOUDFLARE_STAGING_GRANT_POLICY_REQUIRED")

        # Serialize idempotent create attempts without introducing a new table/index.
        await self.db.execute(
            text("SELECT pg_advisory_xact_lock(hashtext(:lock_key))"),
            {"lock_key": correlation_key},
        )
        existing = await self.get_request_by_correlation(correlation_key, tenant_id)
        if existing:
            existing_payload = existing.payload if isinstance(existing.payload, dict) else {}
            if (
                existing.request_type != ApprovalType.DEPLOYMENT
                or existing.requester_id != requester_id
                or existing_payload != grant
                or (existing.extra_data or {}).get("cloudflareStagingPolicyDecisionV1") != policy_decision
            ):
                raise ValueError("CLOUDFLARE_STAGING_GRANT_IDEMPOTENCY_CONFLICT")
            return existing

        request = ApprovalRequest(
            id=grant_id,
            request_type=ApprovalType.DEPLOYMENT,
            title="Cloudflare staging deployment grant",
            description="Admin-authorized grant request for the exact staging Worker target.",
            tenant_id=tenant_id,
            project_id=grant["projectId"],
            requester_id=requester_id,
            requester_type="user",
            status=ApprovalStatus.APPROVED if policy_decision else ApprovalStatus.PENDING,
            payload=grant,
            extra_data={
                "approvers": [],
                "cloudflareStagingGrantIssuerV1": "owner_staging_policy" if policy_decision else "admin_approval_workflow",
                **({"cloudflareStagingPolicyDecisionV1": policy_decision} if policy_decision else {}),
            },
            action_digest=hashlib.sha256(
                json.dumps(grant, sort_keys=True, separators=(",", ":")).encode("utf-8")
            ).hexdigest(),
            correlation_key=correlation_key,
            risk_level="critical",
            required_approvers=0 if policy_decision else 1,
            current_approvals=0,
            resolved_at=now.replace(tzinfo=None) if policy_decision else None,
            expires_at=expires_at.replace(tzinfo=None),
        )
        self.db.add(request)
        self.db.add(AuditLog(
            user_id=str(requester_id),
            user_role=str(requester_role.value if hasattr(requester_role, "value") else requester_role),
            action="cloudflare.staging_grant.policy_approved" if policy_decision else "cloudflare.staging_grant.requested",
            resource_type="cloudflare_staging_deployment_grant", resource_id=grant_id,
            details={
                "tenantId": tenant_id, "projectId": grant["projectId"],
                "targetId": _CF_STAGING_TARGET, "environment": "staging",
                "actionDigest": request.action_digest, "correlationKey": correlation_key,
                **({"policyDecision": policy_decision, "jobId": grant["jobId"], "accountRef": grant["accountRef"]} if policy_decision else {}),
            },
        ))
        await self.db.commit()
        await self.db.refresh(request)
        return request

    async def revoke_cloudflare_staging_grant(
        self, *, grant_ref: str, tenant_id: str, actor_id: int, reason: str,
    ) -> ApprovalRequest:
        """Revoke an existing staging grant idempotently, retaining an audit record."""
        if not reason or len(reason.strip()) < 4 or len(reason) > 500:
            raise ValueError("CLOUDFLARE_STAGING_GRANT_REVOCATION_REASON_INVALID")
        role_result = await self.db.execute(select(User.role).where(User.id == actor_id))
        if role_result.scalar_one_or_none() not in (Role.admin, Role.domain_admin):
            raise PermissionError("CLOUDFLARE_STAGING_GRANT_ADMIN_REQUIRED")
        result = await self.db.execute(
            select(ApprovalRequest).where(
                ApprovalRequest.id == grant_ref,
                ApprovalRequest.tenant_id == tenant_id,
                ApprovalRequest.request_type == ApprovalType.DEPLOYMENT,
            ).with_for_update()
        )
        request = result.scalar_one_or_none()
        if request is None:
            raise ValueError("CLOUDFLARE_STAGING_GRANT_NOT_FOUND")
        extra_data = request.extra_data if isinstance(request.extra_data, dict) else {}
        if extra_data.get("cloudflareStagingGrantIssuerV1") not in ("admin_approval_workflow", "owner_staging_policy"):
            raise ValueError("CLOUDFLARE_STAGING_GRANT_NOT_FOUND")
        grant = normalize_cloudflare_staging_grant_payload(
            request.payload if isinstance(request.payload, dict) else {}
        )
        if grant["grantRef"] != request.id:
            raise ValueError("CLOUDFLARE_STAGING_GRANT_PERSISTED_BINDING_INVALID")
        if request.revoked_at is not None:
            await self.db.commit()
            return request
        now = datetime.now(timezone.utc)
        grant["revokedAt"] = now.isoformat().replace("+00:00", "Z")
        request.payload = grant
        request.revoked_at = now.replace(tzinfo=None)
        self.db.add(AuditLog(
            user_id=str(actor_id), user_role="admin",
            action="cloudflare.staging_grant.revoked",
            resource_type="cloudflare_staging_deployment_grant", resource_id=grant_ref,
            details={"tenantId": tenant_id, "reason": reason.strip()},
        ))
        await self.db.commit()
        await self.db.refresh(request)
        return request

    async def resolve_cloudflare_staging_grant(
        self, grant_ref: str, *, now: Optional[datetime] = None,
    ) -> Optional[dict]:
        """Resolve only an approved, current grant from authoritative persisted approval rows."""
        result = await self.db.execute(
            select(ApprovalRequest).where(
                ApprovalRequest.id == grant_ref,
                ApprovalRequest.request_type == ApprovalType.DEPLOYMENT,
            )
        )
        request = result.scalar_one_or_none()
        if (
            request is None
            or request.status != ApprovalStatus.APPROVED
            or request.revoked_at is not None
            or request.resolved_at is None
            or request.current_approvals < request.required_approvers
        ):
            return None
        extra_data = request.extra_data if isinstance(request.extra_data, dict) else {}
        if extra_data.get("cloudflareStagingGrantIssuerV1") not in ("admin_approval_workflow", "owner_staging_policy"):
            return None
        try:
            grant = normalize_cloudflare_staging_grant_payload(
                request.payload if isinstance(request.payload, dict) else {}
            )
        except ValueError:
            return None
        if (
            grant["grantRef"] != request.id
            or grant["tenantId"] != request.tenant_id
            or grant["projectId"] != request.project_id
            or grant["requesterUserId"] != request.requester_id
            or grant["revokedAt"] is not None
        ):
            return None
        expires_at = datetime.fromisoformat(grant["expiresAt"].replace("Z", "+00:00"))
        issued_at = request.created_at
        if issued_at is None:
            return None
        if issued_at.tzinfo is None:
            issued_at = issued_at.replace(tzinfo=timezone.utc)
        current = now or datetime.now(timezone.utc)
        if current.tzinfo is None:
            current = current.replace(tzinfo=timezone.utc)
        if expires_at <= current or expires_at > issued_at + timedelta(days=30):
            return None
        if extra_data.get("cloudflareStagingGrantIssuerV1") == "owner_staging_policy":
            if request.action_digest != hashlib.sha256(json.dumps(grant, sort_keys=True, separators=(",", ":")).encode()).hexdigest():
                return None
            if not await self.validate_cloudflare_staging_policy_decision(request, current):
                return None
        elif "jobId" in grant or "accountRef" in grant:
            return None
        return grant

    @staticmethod
    def _recovery_grant_scope(value: dict) -> dict:
        """Normalize the exact, non-production P-RECOVERY scope before persistence."""
        if not isinstance(value, dict):
            raise ValueError("SPEC224_RECOVERY_GRANT_SCOPE_INVALID")
        required_keys = {
            "sourceCommit", "sourceSha256", "sourceFiles", "workpackageId",
            "allowedWriteSet", "allowedOperations", "forbiddenOperations",
            "runtimeScope", "environmentScope", "expiresAt",
        }
        optional_keys = {"runtimeBinding", "admissionBinding", "workspaceId"}
        if set(value).difference(required_keys | optional_keys) or required_keys.difference(value):
            raise ValueError("SPEC224_RECOVERY_GRANT_SCOPE_KEYS_INVALID")
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
        if "workspaceId" in value and (
            not isinstance(value["workspaceId"], str)
            or not value["workspaceId"].strip()
            or len(value["workspaceId"]) > 255
        ):
            raise ValueError("SPEC224_RECOVERY_GRANT_WORKSPACE_BINDING_INVALID")

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
        protected_operations = set(allowed_operations).intersection(SPEC224_PROTECTED_RUNTIME_OPERATIONS)
        if protected_operations:
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

        admission_binding = value.get("admissionBinding")
        if protected_operations and not isinstance(admission_binding, dict):
            raise ValueError("SPEC224_RECOVERY_GRANT_ADMISSION_BINDING_REQUIRED")
        normalized_admission_binding = None
        if admission_binding is not None:
            if not isinstance(runtime_binding, dict):
                raise ValueError("SPEC224_RECOVERY_GRANT_ADMISSION_BINDING_INVALID")
            expected_admission_keys = {
                "tenantId", "ownerId", "runId", "workerJobId", "workPackageId",
                "attemptId", "attempt", "revision", "decisionEpoch",
                "developmentRunFencingVersion", "workerJobFencingVersion",
                "sourceCommit", "sourceTree", "sourceSha256", "sourceManifestDigest",
                "profileId", "profileVersion",
                "profileDigest", "bundleDigest", "artifactEvidenceDigest", "attestationId",
                "runnerId", "runnerSessionId", "capabilitySnapshotId",
                "capabilitySnapshotRevision",
            }
            if set(admission_binding).difference(expected_admission_keys | {"workspaceId"}) or expected_admission_keys.difference(admission_binding):
                raise ValueError("SPEC224_RECOVERY_GRANT_ADMISSION_BINDING_INVALID")
            if "workspaceId" in admission_binding and (
                not isinstance(admission_binding["workspaceId"], str)
                or not admission_binding["workspaceId"].strip()
                or len(admission_binding["workspaceId"]) > 255
            ):
                raise ValueError("SPEC224_RECOVERY_GRANT_ADMISSION_BINDING_INVALID")
            if "workspaceId" in value and admission_binding.get("workspaceId") != value["workspaceId"]:
                raise ValueError("SPEC224_RECOVERY_GRANT_WORKSPACE_BINDING_MISMATCH")
            for key in (
                "tenantId", "runId", "workerJobId", "workPackageId", "attemptId",
                "profileId", "runnerId", "runnerSessionId", "capabilitySnapshotId",
                "capabilitySnapshotRevision",
            ):
                item = admission_binding.get(key)
                if not isinstance(item, str) or not item.strip() or len(item) > 255:
                    raise ValueError("SPEC224_RECOVERY_GRANT_ADMISSION_BINDING_INVALID")
            owner_id = admission_binding.get("ownerId")
            if not isinstance(owner_id, int) or isinstance(owner_id, bool) or owner_id <= 0:
                raise ValueError("SPEC224_RECOVERY_GRANT_ADMISSION_BINDING_INVALID")
            for key in (
                "attempt", "revision", "decisionEpoch", "developmentRunFencingVersion",
                "workerJobFencingVersion", "profileVersion",
            ):
                item = admission_binding.get(key)
                if not isinstance(item, int) or isinstance(item, bool) or item < 0:
                    raise ValueError("SPEC224_RECOVERY_GRANT_ADMISSION_BINDING_INVALID")
            if admission_binding["attempt"] < 1:
                raise ValueError("SPEC224_RECOVERY_GRANT_ADMISSION_BINDING_INVALID")
            for key in ("sourceCommit", "sourceTree", "sourceSha256", "sourceManifestDigest", "profileDigest", "bundleDigest", "artifactEvidenceDigest", "attestationId"):
                item = admission_binding.get(key)
                if not isinstance(item, str):
                    raise ValueError("SPEC224_RECOVERY_GRANT_ADMISSION_BINDING_INVALID")
                expected_pattern = r"[0-9a-f]{40,64}" if key in {"sourceCommit", "sourceTree"} else r"[0-9a-f]{64}"
                if not re.fullmatch(expected_pattern, item):
                    raise ValueError("SPEC224_RECOVERY_GRANT_ADMISSION_BINDING_INVALID")
            if (
                admission_binding["sourceCommit"] != commit
                or admission_binding["sourceSha256"] != source_digest
                or admission_binding["workPackageId"] != workpackage
                or admission_binding["tenantId"] != runtime_binding.get("tenantId")
                or admission_binding["ownerId"] != runtime_binding.get("ownerId")
                or admission_binding["attempt"] != runtime_binding.get("attempt")
                or admission_binding["runId"] != runtime_binding.get("runId")
                or admission_binding["workerJobId"] != runtime_binding.get("workerJobId")
                or admission_binding["revision"] != runtime_binding.get("revision")
                or admission_binding["decisionEpoch"] != runtime_binding.get("decisionEpoch")
                or admission_binding["developmentRunFencingVersion"] != runtime_binding.get("developmentRunFencingVersion")
                or admission_binding["workerJobFencingVersion"] != runtime_binding.get("workerJobFencingVersion")
                or admission_binding["runnerId"] != runtime_binding.get("runnerId")
                or admission_binding["runnerSessionId"] != runtime_binding.get("runnerSessionId")
                or admission_binding["capabilitySnapshotId"] != runtime_binding.get("capabilitySnapshotId")
                or admission_binding["capabilitySnapshotRevision"] != runtime_binding.get("capabilitySnapshotRevision")
            ):
                raise ValueError("SPEC224_RECOVERY_GRANT_ADMISSION_BINDING_MISMATCH")
            normalized_admission_binding = dict(admission_binding)

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
            **({"admissionBinding": normalized_admission_binding} if normalized_admission_binding is not None else {}),
            **({"workspaceId": value["workspaceId"]} if "workspaceId" in value else {}),
        }

    @staticmethod
    def _recovery_grant_audit_valid(grant: dict) -> bool:
        events = grant.get("auditEvents")
        scope = grant.get("scope")
        if not isinstance(events, list) or not events or not isinstance(scope, dict):
            return False
        scope_text = json.dumps(scope, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        if hashlib.sha256(scope_text.encode("utf-8")).hexdigest() != grant.get("scopeDigest"):
            return False
        previous = None
        for index, stored in enumerate(events):
            if not isinstance(stored, dict):
                return False
            event = {key: value for key, value in stored.items() if key != "eventDigest"}
            canonical = json.dumps(event, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
            digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
            if stored.get("eventDigest") != digest or event.get("previousEventDigest") != previous:
                return False
            if index == 0 and (
                event.get("eventType") != "issued"
                or event.get("version") != 1
                or event.get("grantId") != grant.get("grantId")
                or event.get("tenantId") != grant.get("tenantId")
                or event.get("ownerId") != grant.get("ownerId")
                or event.get("scopeDigest") != grant.get("scopeDigest")
                or ("authority" in grant and event.get("authority") != grant.get("authority"))
            ):
                return False
            previous = digest
        return True

    async def _validate_spec224_policy_grant_authority(
        self,
        *,
        policy_approval_ref: str,
        tenant_id: str,
        owner_id: int,
        actor_id: int,
        scope: dict,
        scope_digest: str,
    ) -> dict:
        """Resolve an active owner policy decision for this exact grant scope."""
        if not policy_approval_ref or len(policy_approval_ref) > 36:
            raise ValueError("SPEC224_POLICY_GRANT_APPROVAL_REF_INVALID")
        candidate_result = await self.db.execute(
            select(ApprovalRequest)
            .where(
                ApprovalRequest.id == policy_approval_ref,
                ApprovalRequest.tenant_id == tenant_id,
                ApprovalRequest.request_type == ApprovalType.CODE_EXECUTION,
            )
        )
        candidate = candidate_result.scalar_one_or_none()
        candidate_extra = candidate.extra_data if candidate and isinstance(candidate.extra_data, dict) else {}
        candidate_decision = candidate_extra.get("spec224DevelopmentPolicyDecisionV1")
        if not isinstance(candidate_decision, dict) or not isinstance(candidate_decision.get("policyId"), str):
            raise PermissionError("SPEC224_POLICY_GRANT_DECISION_INVALID")
        # Lock in the same rule → decision order used by policy revocation.
        rule_result = await self.db.execute(
            select(ApprovalRule)
            .where(
                ApprovalRule.id == candidate_decision["policyId"],
                ApprovalRule.tenant_id == tenant_id,
                ApprovalRule.project_id == candidate.project_id,
                ApprovalRule.is_active.is_(True),
            )
            .with_for_update(read=True)
        )
        rule = rule_result.scalar_one_or_none()
        policy_result = await self.db.execute(
            select(ApprovalRequest)
            .where(
                ApprovalRequest.id == policy_approval_ref,
                ApprovalRequest.tenant_id == tenant_id,
                ApprovalRequest.request_type == ApprovalType.CODE_EXECUTION,
            )
            .with_for_update(read=True)
        )
        policy_approval = policy_result.scalar_one_or_none()
        extra = policy_approval.extra_data if policy_approval and isinstance(policy_approval.extra_data, dict) else {}
        decision = extra.get("spec224DevelopmentPolicyDecisionV1")
        if (
            policy_approval is None
            or policy_approval.status != ApprovalStatus.APPROVED
            or policy_approval.revoked_at is not None
            or policy_approval.requester_id != actor_id
            or policy_approval.required_approvers != 0
            or policy_approval.current_approvals != 0
            or not isinstance(decision, dict)
            or decision.get("schemaVersion") != "spec224.development-policy-decision.v1"
            or decision.get("decision") != "APPROVED"
            or decision.get("actorUserId") != actor_id
            or decision.get("policyId") is None
            or decision.get("policyVersion") is None
            or decision.get("auditRef") is None
        ):
            raise PermissionError("SPEC224_POLICY_GRANT_DECISION_INVALID")
        if policy_approval.expires_at is None:
            raise PermissionError("SPEC224_POLICY_GRANT_DECISION_EXPIRED")
        approval_expiry = policy_approval.expires_at
        approval_expiry = approval_expiry.replace(tzinfo=timezone.utc) if approval_expiry.tzinfo is None else approval_expiry.astimezone(timezone.utc)
        if approval_expiry <= datetime.now(timezone.utc):
            raise PermissionError("SPEC224_POLICY_GRANT_DECISION_EXPIRED")

        decision_scope = decision.get("scope")
        if not isinstance(decision_scope, dict):
            raise PermissionError("SPEC224_POLICY_GRANT_SCOPE_INVALID")
        admission = scope.get("admissionBinding")
        runtime = scope.get("runtimeBinding")
        if (
            not isinstance(admission, dict)
            or not isinstance(runtime, dict)
            or not isinstance(scope.get("workspaceId"), str)
            or not scope["workspaceId"].strip()
            or any(not isinstance(admission.get(key), str) or not admission[key] for key in (
                "attemptId", "runnerId", "runnerSessionId", "capabilitySnapshotId",
                "capabilitySnapshotRevision", "profileId", "sourceTree", "sourceManifestDigest", "workspaceId",
            ))
            or any(not isinstance(runtime.get(key), str) or not runtime[key] for key in ("runId", "workerJobId"))
        ):
            raise PermissionError("SPEC224_POLICY_GRANT_BINDING_REQUIRED")
        expected_resource_scopes = {
            _canonical_policy_scope({"kind": "development_run", "id": runtime["runId"]}),
            _canonical_policy_scope({"kind": "worker_job", "id": runtime["workerJobId"]}),
            _canonical_policy_scope({"kind": "attempt", "id": admission["attemptId"]}),
            _canonical_policy_scope({"kind": "workspace", "id": scope["workspaceId"]}),
            _canonical_policy_scope({"kind": "runner", "id": admission["runnerId"]}),
            _canonical_policy_scope({"kind": "runner_session", "id": admission["runnerSessionId"]}),
            _canonical_policy_scope({"kind": "capability_snapshot", "id": admission["capabilitySnapshotId"]}),
            _canonical_policy_scope({"kind": "recovery_grant_scope", "id": scope_digest}),
        }
        resource_scopes = decision_scope.get("resourceScopes")
        if not isinstance(resource_scopes, list) or {
            _canonical_policy_scope(item) for item in resource_scopes if isinstance(item, dict)
        } != expected_resource_scopes:
            raise PermissionError("SPEC224_POLICY_GRANT_RESOURCE_SCOPE_MISMATCH")
        expected_decision_fields = {
            "tenantId": tenant_id,
            "actorId": actor_id,
            "operation": "spec224.recovery.grant.issue",
            "profileId": admission["profileId"],
            "runId": runtime["runId"],
            "executionId": runtime["workerJobId"],
            "attemptId": admission["attemptId"],
            "workspaceId": scope["workspaceId"],
            "runnerId": admission["runnerId"],
            "runnerSessionId": admission["runnerSessionId"],
            "capabilitySnapshotId": admission["capabilitySnapshotId"],
            "capabilitySnapshotRevision": admission["capabilitySnapshotRevision"],
            "sourceCommitSha": scope["sourceCommit"],
            "sourceSha256": scope["sourceSha256"],
            "workpackageId": scope["workpackageId"],
            "sourceTreeSha": admission["sourceTree"],
            "sourceManifestDigest": admission["sourceManifestDigest"],
        }
        if any(decision_scope.get(key) != value for key, value in expected_decision_fields.items()):
            raise PermissionError("SPEC224_POLICY_GRANT_BINDING_MISMATCH")
        grant_expiry = datetime.fromisoformat(scope["expiresAt"].replace("Z", "+00:00"))
        if grant_expiry > approval_expiry:
            raise PermissionError("SPEC224_POLICY_GRANT_EXPIRY_EXCEEDS_DECISION")
        expected_action_digest = hashlib.sha256(
            json.dumps(decision_scope, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()
        if policy_approval.action_digest != expected_action_digest:
            raise PermissionError("SPEC224_POLICY_GRANT_DECISION_DIGEST_INVALID")
        if policy_approval.payload != decision_scope:
            raise PermissionError("SPEC224_POLICY_GRANT_DECISION_PAYLOAD_MISMATCH")
        decision_audit_result = await self.db.execute(
            select(AuditLog).where(
                AuditLog.id == decision.get("auditRef"),
                AuditLog.user_id == str(actor_id),
                AuditLog.user_role == "spec224_development_policy",
                AuditLog.action == "spec224.development_policy.decision_approved",
                AuditLog.resource_type == "approval_request",
                AuditLog.resource_id == policy_approval.id,
            )
        )
        decision_audit = decision_audit_result.scalar_one_or_none()
        audit_details = decision_audit.details if decision_audit and isinstance(decision_audit.details, dict) else {}
        if (
            decision_audit is None
            or audit_details.get("tenantId") != tenant_id
            or audit_details.get("projectId") != policy_approval.project_id
            or audit_details.get("policyId") != decision.get("policyId")
            or audit_details.get("policyVersion") != decision.get("policyVersion")
        ):
            raise PermissionError("SPEC224_POLICY_GRANT_DECISION_AUDIT_INVALID")

        conditions = rule.conditions if rule and isinstance(rule.conditions, dict) else {}
        policy = conditions.get("definition")
        if (
            rule is None
            or conditions.get("schemaVersion") != SPEC224_DEVELOPMENT_POLICY_SCHEMA
            or conditions.get("ownerUserId") != owner_id
            or decision.get("policyId") != rule.id
            or policy_approval.project_id != decision_scope.get("projectId")
            or decision.get("policyVersion") != policy_version(rule.id, tenant_id, rule.project_id, policy)
        ):
            raise PermissionError("SPEC224_POLICY_GRANT_POLICY_REVOKED_OR_CHANGED")
        try:
            validate_policy_definition(policy)
        except (TypeError, ValueError) as exc:
            raise PermissionError("SPEC224_POLICY_GRANT_POLICY_INVALID") from exc
        actor_result = await self.db.execute(
            select(TenantUser.id).where(
                TenantUser.tenant_id == tenant_id,
                TenantUser.user_id == actor_id,
                TenantUser.is_active.is_(True),
            )
        )
        if actor_id != owner_id and actor_result.scalar_one_or_none() is None:
            raise PermissionError("SPEC224_POLICY_GRANT_ACTOR_MEMBERSHIP_REQUIRED")
        active_actor_result = await self.db.execute(
            select(User.id).where(
                User.id == actor_id,
                User.isDisabled.is_(False),
                User.is_banned.is_(False),
            )
        )
        if active_actor_result.scalar_one_or_none() is None:
            raise PermissionError("SPEC224_POLICY_GRANT_ACTOR_INACTIVE")
        owner_actor_result = await self.db.execute(
            select(Tenant.owner_id).where(Tenant.id == tenant_id)
        )
        if owner_actor_result.scalar_one_or_none() != owner_id:
            raise PermissionError("SPEC224_POLICY_GRANT_OWNER_BINDING_INVALID")
        return {
            "kind": "development_policy",
            "policyApprovalRef": policy_approval.id,
            "policyId": rule.id,
            "policyVersion": decision["policyVersion"],
            "actorUserId": actor_id,
            "decisionAuditRef": decision["auditRef"],
            "decisionActionDigest": expected_action_digest,
        }

    async def issue_spec224_recovery_grant(
        self,
        *,
        tenant_id: str,
        owner_id: int | None,
        idempotency_key: str,
        scope: dict,
        actor_id: int | None = None,
        policy_approval_ref: str | None = None,
    ) -> dict:
        """Issue a scoped grant as owner or from a separately scoped owner policy.

        Policy-backed grants persist their real policy decision reference and do
        not create a synthetic ApprovalResponse.
        """
        if not tenant_id or len(tenant_id) > 36 or not isinstance(idempotency_key, str) or not re.fullmatch(r"[A-Za-z0-9._:-]{8,160}", idempotency_key):
            raise ValueError("SPEC224_RECOVERY_GRANT_REQUEST_INVALID")
        normalized = self._recovery_grant_scope(scope)
        canonical_scope = json.dumps(normalized, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        scope_digest = hashlib.sha256(canonical_scope.encode("utf-8")).hexdigest()
        tenant_result = await self.db.execute(select(Tenant.owner_id).where(Tenant.id == tenant_id).with_for_update())
        canonical_owner_id = tenant_result.scalar_one_or_none()
        if not isinstance(canonical_owner_id, int):
            raise ValueError("SPEC224_RECOVERY_GRANT_TENANT_NOT_FOUND")
        policy_authority = None
        if policy_approval_ref:
            owner_id = canonical_owner_id
            if not isinstance(actor_id, int) or actor_id < 1 or "workspaceId" not in normalized:
                raise ValueError("SPEC224_POLICY_GRANT_BINDING_REQUIRED")
            policy_authority = await self._validate_spec224_policy_grant_authority(
                policy_approval_ref=policy_approval_ref,
                tenant_id=tenant_id,
                owner_id=owner_id,
                actor_id=actor_id,
                scope=normalized,
                scope_digest=scope_digest,
            )
        elif canonical_owner_id != owner_id or actor_id not in (None, owner_id):
            raise PermissionError("SPEC224_RECOVERY_GRANT_TENANT_OWNER_REQUIRED")
        runtime_binding = normalized.get("runtimeBinding")
        if runtime_binding is not None and (
            runtime_binding.get("tenantId") != tenant_id or runtime_binding.get("ownerId") != owner_id
        ):
            raise ValueError("SPEC224_RECOVERY_GRANT_RUNTIME_BINDING_INVALID")
        admission_binding = normalized.get("admissionBinding")
        if admission_binding is not None and (
            admission_binding.get("tenantId") != tenant_id
            or admission_binding.get("ownerId") != owner_id
        ):
            raise ValueError("SPEC224_RECOVERY_GRANT_ADMISSION_BINDING_INVALID")
        user_result = await self.db.execute(select(User.isDisabled).where(User.id == owner_id))
        disabled = user_result.scalar_one_or_none()
        if disabled is None or disabled:
            raise PermissionError("SPEC224_RECOVERY_GRANT_OWNER_INACTIVE")

        grant_identity = (
            f"smartaihub:spec224:recovery-grant:{tenant_id}:policy:{policy_approval_ref}:{idempotency_key}"
            if policy_approval_ref
            else f"smartaihub:spec224:recovery-grant:{tenant_id}:{owner_id}:{idempotency_key}"
        )
        grant_id = str(uuid5(NAMESPACE_URL, grant_identity))
        existing = await self.db.execute(select(ApprovalRequest).where(ApprovalRequest.id == grant_id).with_for_update())
        prior = existing.scalar_one_or_none()
        if prior:
            grant = (prior.extra_data or {}).get("spec224RecoveryGrantV1")
            if (
                not isinstance(grant, dict)
                or grant.get("scopeDigest") != scope_digest
                or grant.get("authority", {"kind": "tenant_owner"}) != (policy_authority or {"kind": "tenant_owner"})
            ):
                raise ValueError("SPEC224_RECOVERY_GRANT_IDEMPOTENCY_CONFLICT")
            return grant

        now = datetime.now(timezone.utc)
        event = {
            "eventType": "issued", "grantId": grant_id, "version": 1,
            "tenantId": tenant_id, "ownerId": owner_id, "scopeDigest": scope_digest,
            "sourceCommit": normalized["sourceCommit"], "sourceSha256": normalized["sourceSha256"],
            "authority": policy_authority or {"kind": "tenant_owner"},
            "issuedAt": now.isoformat().replace("+00:00", "Z"), "previousEventDigest": None,
        }
        event_text = json.dumps(event, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        grant = {
            "schemaVersion": "spec224.recovery-grant.v1", "grantId": grant_id, "version": 1,
            "tenantId": tenant_id, "ownerId": owner_id, "state": "active",
            "scope": normalized, "scopeDigest": scope_digest,
            "authority": policy_authority or {"kind": "tenant_owner"},
            "issuedAt": event["issuedAt"], "revocation": None,
            "auditEvents": [{**event, "eventDigest": hashlib.sha256(event_text.encode("utf-8")).hexdigest()}],
        }
        request = ApprovalRequest(
            id=grant_id, request_type=ApprovalType.SECURITY_SENSITIVE,
            title=f"P-RECOVERY scoped grant {normalized['workpackageId']}",
            description="Exact non-production recovery grant issued by the tenant owner or active owner-authorized policy.",
            tenant_id=tenant_id, requester_id=owner_id, requester_type="user",
            status=ApprovalStatus.APPROVED, payload={"kind": "spec224_recovery_grant", "scopeDigest": scope_digest},
            extra_data={"spec224RecoveryGrantV1": grant}, action_digest=scope_digest,
            correlation_key=f"spec224-recovery-grant:{tenant_id}:{idempotency_key}"[:255],
            risk_level="critical",
            required_approvers=0 if policy_authority else 1,
            current_approvals=0 if policy_authority else 1,
            created_at=now.replace(tzinfo=None), resolved_at=now.replace(tzinfo=None),
        )
        self.db.add(request)
        if not policy_authority:
            self.db.add(ApprovalResponse(
                id=str(uuid4()), request_id=grant_id, approver_id=owner_id,
                decision="approved", comment="Authenticated tenant-owner P-RECOVERY grant issuance.",
                created_at=now.replace(tzinfo=None),
            ))
        issued_by = actor_id if policy_authority else owner_id
        role = "spec224_development_policy" if policy_authority else "tenant_owner"
        self.db.add(AuditLog(
            user_id=str(issued_by), user_role=role, action="spec224.recovery_grant.issued",
            resource_type="spec224_recovery_grant", resource_id=grant_id,
            details={"tenantId": tenant_id, "scopeDigest": scope_digest, "eventDigest": grant["auditEvents"][0]["eventDigest"],
                     "authorityKind": role, "policyApprovalRef": policy_approval_ref},
        ))
        await self.db.commit()
        return grant

    async def revoke_spec224_recovery_grant(
        self, *, grant_id: str, tenant_id: str, owner_id: int, reason: str,
    ) -> dict:
        if not reason or len(reason.strip()) < 4 or len(reason) > 500:
            raise ValueError("SPEC224_RECOVERY_GRANT_REVOCATION_REASON_INVALID")
        # Resolve the lock identity from the persisted grant row first. The
        # unlocked read does not authorize revocation; every decision is made
        # again after the cross-service transaction fence is held.
        identity_result = await self.db.execute(
            select(ApprovalRequest.id, ApprovalRequest.tenant_id).where(
                ApprovalRequest.id == grant_id
            )
        )
        identity_row = identity_result.one_or_none()
        if identity_row is None or identity_row.tenant_id != tenant_id:
            raise ValueError("SPEC224_RECOVERY_GRANT_NOT_FOUND")
        fence_identity = _spec224_recovery_grant_fence_identity(
            str(identity_row.tenant_id), str(identity_row.id)
        )
        await self.db.execute(
            text(
                "SELECT pg_advisory_xact_lock(hashtextextended(:fence_identity, 224))"
            ),
            {"fence_identity": fence_identity},
        )
        tenant_result = await self.db.execute(
            select(Tenant.owner_id)
            .where(Tenant.id == tenant_id)
            .with_for_update()
        )
        if tenant_result.scalar_one_or_none() != owner_id:
            raise PermissionError("SPEC224_RECOVERY_GRANT_TENANT_OWNER_REQUIRED")
        result = await self.db.execute(
            select(ApprovalRequest)
            .where(
                ApprovalRequest.id == grant_id,
                ApprovalRequest.tenant_id == tenant_id,
            )
            .with_for_update()
        )
        request = result.scalar_one_or_none()
        grant = (request.extra_data or {}).get("spec224RecoveryGrantV1") if request else None
        if not isinstance(grant, dict) or grant.get("schemaVersion") != "spec224.recovery-grant.v1":
            raise ValueError("SPEC224_RECOVERY_GRANT_NOT_FOUND")
        if not self._recovery_grant_audit_valid(grant):
            # Revocation remains authoritative even if the embedded chain was
            # tampered. Do not trust its scope or append to a broken chain;
            # persist the independent canonical revoked_at + audit record.
            if grant.get("state") != "revoked" or request.revoked_at is None:
                revoked_at = datetime.now(timezone.utc)
                grant = {
                    **grant,
                    "state": "revoked",
                    "revocation": {
                        "actorId": owner_id,
                        "reason": reason.strip(),
                        "revokedAt": revoked_at.isoformat().replace("+00:00", "Z"),
                        "containmentIntentIds": [],
                        "containmentReviewEventIds": [],
                        "containmentReviewRequired": True,
                        "containmentReviewReasons": ["GRANT_AUDIT_INVALID"],
                    },
                    "auditIntegrity": "INVALID_OPERATOR_REVIEW_REQUIRED",
                }
                request.extra_data = {**(request.extra_data or {}), "spec224RecoveryGrantV1": grant}
                request.revoked_at = revoked_at.replace(tzinfo=None)
                self.db.add(AuditLog(
                    user_id=str(owner_id), user_role="tenant_owner",
                    action="spec224.recovery_grant.revoked_audit_integrity_failure",
                    resource_type="spec224_recovery_grant", resource_id=grant_id,
                    details={"tenantId": tenant_id, "reasonCode": "GRANT_AUDIT_INVALID"},
                ))
            await self.db.commit()
            return grant
        if grant.get("state") == "revoked":
            prior_revocation = grant.get("revocation") or {}
            containment = await _record_spec224_start_containment_intents(
                self.db, grant_id=grant_id, tenant_id=tenant_id, grant=grant,
                actor_id=int(prior_revocation.get("actorId", owner_id)),
                reason=str(prior_revocation.get("reason", reason.strip())),
                revoked_at=str(prior_revocation.get("revokedAt", "")),
            )
            containment_state = {
                "containmentIntentIds": sorted(containment["intentIds"]),
                "containmentReviewEventIds": sorted(containment["reviewEventIds"]),
                "containmentReviewRequired": containment["reviewRequired"],
                "containmentReviewReasons": sorted(set(containment["reviewReasons"])),
            }
            if any(prior_revocation.get(key) != value for key, value in containment_state.items()):
                revocation = {**prior_revocation, **containment_state}
                event = {
                    "eventType": "containment_intent_reconciled", "grantId": grant_id,
                    "version": int(grant.get("version", 0)) + 1, "tenantId": tenant_id,
                    "ownerId": owner_id, "scopeDigest": grant["scopeDigest"],
                    "previousEventDigest": grant["auditEvents"][-1].get("eventDigest"),
                    **containment_state,
                    "reconciledAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                }
                event_text = json.dumps(event, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
                grant = {
                    **grant, "version": event["version"], "revocation": revocation,
                    "auditEvents": [*grant.get("auditEvents", []), {
                        **event, "eventDigest": hashlib.sha256(event_text.encode("utf-8")).hexdigest()
                    }],
                }
                request.extra_data = {**(request.extra_data or {}), "spec224RecoveryGrantV1": grant}
                self.db.add(AuditLog(
                    user_id=str(owner_id), user_role="tenant_owner",
                    action="spec224.recovery_grant.containment_reconciled",
                    resource_type="spec224_recovery_grant", resource_id=grant_id,
                    details={"tenantId": tenant_id, "scopeDigest": grant["scopeDigest"],
                             **containment_state},
                ))
                await self.db.commit()
            else:
                # Release the transaction-scoped grant and event locks even
                # when this is a read-only idempotent revoke retry.
                await self.db.commit()
            return grant
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        revocation = {"actorId": owner_id, "reason": reason.strip(), "revokedAt": now}
        containment = await _record_spec224_start_containment_intents(
            self.db, grant_id=grant_id, tenant_id=tenant_id, grant=grant,
            actor_id=owner_id, reason=reason.strip(), revoked_at=now,
        )
        revocation.update({
            "containmentIntentIds": sorted(containment["intentIds"]),
            "containmentReviewEventIds": sorted(containment["reviewEventIds"]),
            "containmentReviewRequired": containment["reviewRequired"],
            "containmentReviewReasons": sorted(set(containment["reviewReasons"])),
        })
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

    async def validate_spec224_recovery_grant_contract(
        self, *, grant_id: str, tenant_id: str, source_commit: str, source_sha256: str,
        workpackage_id: str, operation: str, path: str, runtime_scope: str, environment_scope: str,
        runtime_binding: Optional[dict] = None,
        admission_binding: Optional[dict] = None,
    ) -> dict:
        """Return the versioned, fail-closed result consumed by the Node authority adapter."""
        validated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        result = await self.db.execute(
            select(ApprovalRequest).where(ApprovalRequest.id == grant_id)
        )
        request = result.scalar_one_or_none()
        grant = (request.extra_data or {}).get("spec224RecoveryGrantV1") if request else None
        grant_authority = grant.get("authority") if isinstance(grant, dict) else None
        if grant_authority is None:
            grant_authority = {"kind": "tenant_owner"}
        decision_result = "INVALID_NOT_FOUND"

        if isinstance(grant, dict) and grant.get("schemaVersion") == "spec224.recovery-grant.v1":
            if request.tenant_id != tenant_id or grant.get("tenantId") != tenant_id:
                decision_result = "INVALID_TENANT"
            elif grant.get("state") != "active" or request.revoked_at is not None:
                decision_result = "INVALID_REVOKED"
            elif (
                request.status != ApprovalStatus.APPROVED
                or request.request_type != ApprovalType.SECURITY_SENSITIVE
                or request.requester_id != grant.get("ownerId")
                or request.requester_type != "user"
                or not isinstance(grant_authority, dict)
                or request.required_approvers != (0 if grant_authority.get("kind") == "development_policy" else 1)
                or request.current_approvals != (0 if grant_authority.get("kind") == "development_policy" else 1)
                or request.action_digest != grant.get("scopeDigest")
                or not isinstance(request.payload, dict)
                or request.payload.get("kind") != "spec224_recovery_grant"
                or request.payload.get("scopeDigest") != grant.get("scopeDigest")
            ):
                decision_result = "INVALID_AUTHORITY"
            else:
                tenant_result = await self.db.execute(
                    select(Tenant.owner_id).where(Tenant.id == tenant_id)
                )
                owner_id = tenant_result.scalar_one_or_none()
                owner_result = await self.db.execute(
                    select(User.isDisabled).where(User.id == grant.get("ownerId"))
                )
                owner_disabled = owner_result.scalar_one_or_none()
                if owner_id != grant.get("ownerId") or owner_disabled is not False:
                    decision_result = "INVALID_OWNER"
                else:
                    authority = grant_authority
                    policy_authority_valid = False
                    if authority.get("kind") == "development_policy":
                        try:
                            checked_authority = await self._validate_spec224_policy_grant_authority(
                                policy_approval_ref=authority.get("policyApprovalRef"),
                                tenant_id=tenant_id,
                                owner_id=owner_id,
                                actor_id=authority.get("actorUserId"),
                                scope=grant.get("scope") if isinstance(grant.get("scope"), dict) else {},
                                scope_digest=grant.get("scopeDigest"),
                            )
                            policy_authority_valid = checked_authority == authority
                        except (PermissionError, ValueError, TypeError, KeyError):
                            policy_authority_valid = False
                    elif authority.get("kind") == "tenant_owner":
                        approval_result = await self.db.execute(
                            select(ApprovalResponse.approver_id)
                            .where(
                                ApprovalResponse.request_id == grant_id,
                                ApprovalResponse.decision == "approved",
                            )
                            .distinct()
                        )
                        approver_ids = set(approval_result.scalars().all())
                        policy_authority_valid = owner_id in approver_ids
                    else:
                        policy_authority_valid = False
                    if not policy_authority_valid:
                        decision_result = "INVALID_AUTHORITY"
                    else:
                        audit_result = await self.db.execute(
                            select(AuditLog).where(
                                AuditLog.resource_id == grant_id,
                                AuditLog.resource_type == "spec224_recovery_grant",
                                AuditLog.action == "spec224.recovery_grant.issued",
                            )
                        )
                        issuance_audit = audit_result.scalar_one_or_none()
                        audit_details = (
                            issuance_audit.details
                            if issuance_audit and isinstance(issuance_audit.details, dict)
                            else {}
                        )
                        if (
                            not self._recovery_grant_audit_valid(grant)
                            or issuance_audit is None
                            or issuance_audit.user_id != str(authority.get("actorUserId", owner_id))
                            or issuance_audit.user_role != ("spec224_development_policy" if authority.get("kind") == "development_policy" else "tenant_owner")
                            or audit_details.get("tenantId") != tenant_id
                            or audit_details.get("scopeDigest") != grant.get("scopeDigest")
                            or audit_details.get("authorityKind") != issuance_audit.user_role
                            or (authority.get("kind") == "development_policy" and audit_details.get("policyApprovalRef") != authority.get("policyApprovalRef"))
                            or audit_details.get("eventDigest")
                            != (grant.get("auditEvents") or [{}])[0].get("eventDigest")
                        ):
                            decision_result = "INVALID_AUDIT"
                        else:
                            scope = grant.get("scope")
                            if not isinstance(scope, dict):
                                decision_result = "INVALID_SCOPE"
                            else:
                                try:
                                    expires = datetime.fromisoformat(
                                        str(scope["expiresAt"]).replace("Z", "+00:00")
                                    )
                                except (KeyError, TypeError, ValueError):
                                    decision_result = "INVALID_SCOPE"
                                else:
                                    if expires.tzinfo is None:
                                        decision_result = "INVALID_SCOPE"
                                    elif expires <= datetime.now(timezone.utc):
                                        decision_result = "INVALID_EXPIRED"
                                    elif (
                                        scope.get("sourceCommit") != source_commit
                                        or scope.get("sourceSha256") != source_sha256
                                        or scope.get("workpackageId") != workpackage_id
                                        or scope.get("runtimeScope") != runtime_scope
                                        or scope.get("environmentScope") != environment_scope
                                        or not isinstance(scope.get("allowedOperations"), list)
                                        or not isinstance(scope.get("forbiddenOperations"), list)
                                        or not isinstance(scope.get("allowedWriteSet"), list)
                                        or operation not in scope["allowedOperations"]
                                        or operation in scope["forbiddenOperations"]
                                        or path not in scope["allowedWriteSet"]
                                    ):
                                        decision_result = "INVALID_SCOPE"
                                    elif any(
                                        scope.get(field) != supplied
                                        for field, supplied in (
                                            ("runtimeBinding", runtime_binding),
                                            ("admissionBinding", admission_binding),
                                        )
                                    ):
                                        decision_result = "INVALID_BINDING"
                                    else:
                                        decision_result = "VALID"

        return {
            "schemaVersion": "spec224.recovery-grant-validation.v1",
            "result": decision_result,
            "valid": decision_result == "VALID",
            "grantId": grant_id if decision_result not in {"INVALID_NOT_FOUND", "INVALID_TENANT"} else None,
            "grantVersion": grant.get("version") if decision_result == "VALID" else None,
            "scopeDigest": grant.get("scopeDigest") if decision_result == "VALID" else None,
            "validatedAt": validated_at,
        }

    async def validate_spec224_recovery_grant(self, **kwargs) -> bool:
        """Compatibility predicate for internal callers that need only allow/deny."""
        decision = await self.validate_spec224_recovery_grant_contract(**kwargs)
        return decision["valid"] is True

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
