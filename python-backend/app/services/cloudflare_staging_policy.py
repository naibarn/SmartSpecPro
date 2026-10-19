"""Bounded Cloudflare staging policy branch of the existing ApprovalDBService.

Uses only ApprovalRule, ApprovalRequest and AuditLog persistence. A policy never
confers provider IAM and cannot authorize production or an unbound worker job.
"""
import hashlib
import json
import re
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import select, text

from app.models.approval import ApprovalRequest, ApprovalRule, ApprovalType
from app.models.audit_log import AuditLog
from app.services.cloudflare_origin_provision_contract import (CONTRACT as PROVISION_CONTRACT, POLICY_SCHEMA as PROVISION_SCHEMA, GRANT_SCHEMA as PROVISION_GRANT, validate_plan, plan_digest)

SCHEMA = "cloudflare.staging-policy.v1"
ORIGIN_SCHEMA = "cloudflare.staging-origin-policy.v2"
ORIGIN_GRANT = "cloudflare.staging-origin-grant.v2"
ORIGIN_CONTRACT = "cloudflare-staging-origin-v2"
TARGET = "smartspec-cloudflare-staging"


def _version(value: dict) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def validate_origin_configuration_pair(ref, digest, *, allow_none=False):
    if allow_none and ref is None and digest is None:
        return
    if not isinstance(digest, str) or not re.fullmatch(r"[a-f0-9]{64}", digest) or ref != "cf-origin:" + digest:
        raise ValueError("CLOUDFLARE_STAGING_ORIGIN_BINDING_INVALID")


def validate_staging_policy(value: dict, now: datetime) -> dict:
    provision = isinstance(value, dict) and value.get("contractVersion") == PROVISION_CONTRACT
    origin = isinstance(value, dict) and value.get("contractVersion") == ORIGIN_CONTRACT
    fields = {"accountRef", "executorId", "actorUserId", "targetId", "environment", "artifacts", "maxOperations", "expiresAt", "allowBootstrap"}
    if origin:
        fields = (fields - {"artifacts", "allowBootstrap"}) | {"contractVersion", "releases"}
    if provision:
        fields = (fields - {"artifacts", "allowBootstrap"}) | {"contractVersion", "plan", "planDigest"}
    if not isinstance(value, dict) or set(value) != fields:
        raise ValueError("CLOUDFLARE_STAGING_POLICY_FIELDS_INVALID")
    if value["targetId"] != TARGET or value["environment"] != "staging" or (not origin and not provision and type(value["allowBootstrap"]) is not bool):
        raise ValueError("CLOUDFLARE_STAGING_POLICY_TARGET_INVALID")
    if not isinstance(value["accountRef"], str) or not re.fullmatch(r"[a-f0-9]{32}", value["accountRef"]):
        raise ValueError("CLOUDFLARE_STAGING_POLICY_ACCOUNT_INVALID")
    if not isinstance(value["executorId"], str) or not re.fullmatch(r"cf-staging-executor:[a-z0-9][a-z0-9._-]{2,119}", value["executorId"]):
        raise ValueError("CLOUDFLARE_STAGING_POLICY_EXECUTOR_INVALID")
    if type(value["actorUserId"]) is not int or value["actorUserId"] <= 0 or type(value["maxOperations"]) is not int or not 1 <= value["maxOperations"] <= 4:
        raise ValueError("CLOUDFLARE_STAGING_POLICY_BUDGET_INVALID")
    if provision:
        plan = validate_plan(value["plan"])
        expiry = datetime.fromisoformat(plan["configurationExpiresAt"].replace("Z", "+00:00"))
        if value["maxOperations"] != 1 or value["planDigest"] != plan_digest(plan) or not now < expiry <= now + timedelta(days=30):
            raise ValueError("CLOUDFLARE_ORIGIN_PROVISION_POLICY_INVALID")
    artifacts = [] if provision else value["releases"] if origin else value["artifacts"]
    if not provision and (not isinstance(artifacts, list) or not 1 <= len(artifacts) <= 2):
        raise ValueError("CLOUDFLARE_STAGING_POLICY_ARTIFACT_INVALID")
    for artifact in artifacts:
        if (not isinstance(artifact, dict) or set(artifact) != ({"artifactRef", "sourceSha", "buildDigest", "configurationRef", "configurationDigest"} if origin else {"artifactRef", "sourceSha", "buildDigest"})
            or not isinstance(artifact["sourceSha"], str) or not re.fullmatch(r"[a-f0-9]{40}", artifact["sourceSha"])
            or not isinstance(artifact["buildDigest"], str) or not re.fullmatch(r"[a-f0-9]{64}", artifact["buildDigest"])
            or artifact["artifactRef"] != "sha256:" + artifact["buildDigest"]):
            raise ValueError("CLOUDFLARE_STAGING_POLICY_ARTIFACT_INVALID")
        if origin:
            validate_origin_configuration_pair(artifact["configurationRef"], artifact["configurationDigest"], allow_none=True)
    if origin and not any(a["configurationRef"] is not None for a in artifacts):
        raise ValueError("CLOUDFLARE_STAGING_ORIGIN_BINDING_INVALID")
    try:
        expiry = datetime.fromisoformat(value["expiresAt"].replace("Z", "+00:00"))
    except (AttributeError, TypeError, ValueError) as exc:
        raise ValueError("CLOUDFLARE_STAGING_POLICY_EXPIRY_INVALID") from exc
    if expiry.tzinfo is None or expiry <= now or expiry > now + timedelta(hours=4):
        raise ValueError("CLOUDFLARE_STAGING_POLICY_EXPIRY_INVALID")
    return {**value, "plan": plan} if provision else {**value, ("releases" if origin else "artifacts"): [dict(a) for a in artifacts]}


class CloudflareStagingPolicyAuthority:
    """Mixin: all mutations remain transactions of the existing approval service."""

    async def _require_cloudflare_policy_owner(self, tenant_id: str, actor_id: int):
        # Query canonical columns only; the older Python Tenant shape has unrelated
        # legacy columns and must not redirect owner checks to legacy owner_id.
        result = await self.db.execute(text(
            'SELECT t."ownerId", t."isActive", u.role, u."isDisabled" FROM tenants t JOIN users u ON u.id = :actor '
            'WHERE t.id = :tenant FOR UPDATE OF t'
        ), {"actor": actor_id, "tenant": tenant_id})
        owner = result.mappings().one_or_none()
        if not owner or owner["ownerId"] != actor_id or not owner["isActive"] or owner["role"] != "admin" or owner["isDisabled"]:
            raise PermissionError("CLOUDFLARE_STAGING_POLICY_ACTIVE_OWNER_ADMIN_REQUIRED")

    async def _check_cloudflare_policy_bindings(self, tenant_id: str, project_id: str, policy: dict, expires_at: datetime, active_origin_ref=None):
        result = await self.db.execute(text(
            'SELECT p.project_id, t."runtimePolicy" FROM canonical_projects p JOIN provider_deployment_targets t '
            'ON t."tenantId" = p.tenant_id AND t."projectId" = p.project_id '
            'JOIN runner_nodes r ON r."tenantId" = p.tenant_id AND r."runnerId" = :executor '
            'WHERE p.tenant_id = :tenant AND p.project_id = :project AND p.lifecycle = \'ACTIVE\' '
            'AND p.owner_principal_id = :principal AND t.enabled = true '
            'AND t.provider = \'cloudflare\' AND t.environment = \'staging\' '
            'AND t."deploymentTargetId" = :target AND t."workerRef" = :target AND t."accountRef" = :account '
            'AND t."containerApplicationRef" IS NULL '
            'AND r."ownerUserId" = :actor AND r."trustState" = \'trusted\' AND r."revokedAt" IS NULL '
            'AND r.profile = \'cloudflare_staging_executor\' AND r."snapshotExpiresAt" >= :expiry'
        ), {"tenant": tenant_id, "project": project_id, "executor": policy["executorId"], "account": policy["accountRef"],
            "target": TARGET, "principal": f"user:{policy['actorUserId']}", "actor": policy["actorUserId"], "expiry": expires_at})
        binding = result.mappings().first()
        if binding is None:
            raise PermissionError("CLOUDFLARE_STAGING_POLICY_RUNTIME_BINDING_DENIED")
        if policy.get("contractVersion") == PROVISION_CONTRACT:
            return
        origin = policy.get("contractVersion") == ORIGIN_CONTRACT
        allowed_refs = {release["configurationRef"] for release in policy["releases"]} if origin else {None}
        if binding["runtimePolicy"] not in allowed_refs or (origin and (binding["runtimePolicy"] is None or
                (active_origin_ref is not None and binding["runtimePolicy"] != active_origin_ref))):
            raise PermissionError("CLOUDFLARE_STAGING_POLICY_ORIGIN_BINDING_DENIED")

    async def create_cloudflare_staging_policy(self, *, tenant_id: str, project_id: str, actor_id: int, definition: dict):
        await self._require_cloudflare_policy_owner(tenant_id, actor_id)
        now = datetime.now(timezone.utc)
        policy = validate_staging_policy(definition, now)
        if policy["actorUserId"] != actor_id:
            raise PermissionError("CLOUDFLARE_STAGING_POLICY_ACTOR_DENIED")
        expiry = datetime.fromisoformat(policy["expiresAt"].replace("Z", "+00:00"))
        await self._check_cloudflare_policy_bindings(tenant_id, project_id, policy, expiry)
        rule = ApprovalRule(
            id=str(uuid4()), name="Bounded Cloudflare staging policy", tenant_id=tenant_id, project_id=project_id,
            trigger_type=ApprovalType.DEPLOYMENT,
            conditions={"schemaVersion": PROVISION_SCHEMA if policy.get("contractVersion") == PROVISION_CONTRACT else ORIGIN_SCHEMA if policy.get("contractVersion") == ORIGIN_CONTRACT else SCHEMA, "ownerUserId": actor_id, "definition": policy, "version": _version(policy)},
            approver_roles=[], approver_users=[], required_approvals=0, timeout_minutes=240, timeout_action="reject",
            auto_approve_conditions={}, is_active=True,
        )
        self.db.add(rule)
        self.db.add(AuditLog(user_id=str(actor_id), user_role="tenant_owner", action="cloudflare.staging_policy.created",
            resource_type="approval_rule", resource_id=rule.id, details={"tenantId": tenant_id, "projectId": project_id, "policyVersion": _version(policy)}))
        await self.db.commit()
        await self.db.refresh(rule)
        return rule

    async def revoke_cloudflare_staging_policy(self, *, tenant_id: str, actor_id: int, policy_id: str):
        await self._require_cloudflare_policy_owner(tenant_id, actor_id)
        result = await self.db.execute(select(ApprovalRule).where(ApprovalRule.id == policy_id, ApprovalRule.tenant_id == tenant_id).with_for_update())
        rule = result.scalar_one_or_none()
        if not rule or (rule.conditions or {}).get("schemaVersion") not in (SCHEMA, ORIGIN_SCHEMA, PROVISION_SCHEMA):
            raise ValueError("CLOUDFLARE_STAGING_POLICY_NOT_FOUND")
        if rule.is_active:
            rule.is_active = False
            self.db.add(AuditLog(user_id=str(actor_id), user_role="tenant_owner", action="cloudflare.staging_policy.revoked",
                resource_type="approval_rule", resource_id=rule.id, details={"tenantId": tenant_id}))
        await self.db.commit()
        return rule

    async def authorize_cloudflare_staging_policy_grant(self, policy_id: str, grant: dict, *, now=None):
        current = now or datetime.now(timezone.utc)
        # Same owner -> rule lock order as creation/revocation; serializes the budget.
        await self._require_cloudflare_policy_owner(grant["tenantId"], grant["requesterUserId"])
        result = await self.db.execute(select(ApprovalRule).where(ApprovalRule.id == policy_id,
            ApprovalRule.tenant_id == grant["tenantId"], ApprovalRule.project_id == grant["projectId"],
            ApprovalRule.trigger_type == ApprovalType.DEPLOYMENT).with_for_update())
        rule = result.scalar_one_or_none()
        conditions = rule.conditions if rule and isinstance(rule.conditions, dict) else {}
        provision = grant.get("schemaVersion") == PROVISION_GRANT
        origin = grant.get("schemaVersion") == ORIGIN_GRANT
        if not rule or not rule.is_active or conditions.get("schemaVersion") != (PROVISION_SCHEMA if provision else ORIGIN_SCHEMA if origin else SCHEMA):
            raise PermissionError("CLOUDFLARE_STAGING_POLICY_UNAVAILABLE")
        policy = validate_staging_policy(conditions.get("definition"), current)
        if origin != (policy.get("contractVersion") == ORIGIN_CONTRACT) or provision != (policy.get("contractVersion") == PROVISION_CONTRACT):
            raise PermissionError("CLOUDFLARE_STAGING_POLICY_SCOPE_DENIED")
        if conditions.get("version") != _version(policy) or conditions.get("ownerUserId") != grant["requesterUserId"]:
            raise PermissionError("CLOUDFLARE_STAGING_POLICY_VERSION_DENIED")
        if (grant.get("accountRef") != policy["accountRef"] or grant["executorId"] != policy["executorId"]
            or grant["requesterUserId"] != policy["actorUserId"] or not grant.get("jobId") or len(grant["actions"]) != 1
            or (origin and grant["actions"][0] not in ("deploy", "rollback"))
            or (grant["actions"] == ["bootstrap"] and not policy["allowBootstrap"])):
            raise PermissionError("CLOUDFLARE_STAGING_POLICY_SCOPE_DENIED")
        if provision and (grant["actions"] != ["provision"] or grant["plan"] != policy["plan"] or grant["planDigest"] != policy["planDigest"]):
            raise PermissionError("CLOUDFLARE_STAGING_POLICY_SCOPE_DENIED")
        for prefix in (() if provision else ("", "rollback")):
            if prefix and grant["actions"] == ["bootstrap"]:
                continue
            fields = ("artifactRef", "sourceSha", "buildDigest") if not prefix else ("rollbackArtifactRef", "rollbackSourceSha", "rollbackBuildDigest")
            artifact = dict(zip(("artifactRef", "sourceSha", "buildDigest"), (grant[f] for f in fields)))
            if origin:
                config_fields = ("configurationRef", "configurationDigest") if not prefix else ("rollbackConfigurationRef", "rollbackConfigurationDigest")
                artifact.update(zip(("configurationRef", "configurationDigest"), (grant[f] for f in config_fields)))
                validate_origin_configuration_pair(artifact["configurationRef"], artifact["configurationDigest"], allow_none=bool(prefix))
            if artifact not in policy["releases" if origin else "artifacts"]:
                raise PermissionError("CLOUDFLARE_STAGING_POLICY_ARTIFACT_DENIED")
        expiry = datetime.fromisoformat(grant["expiresAt"].replace("Z", "+00:00"))
        if expiry > datetime.fromisoformat(policy["expiresAt"].replace("Z", "+00:00")):
            raise PermissionError("CLOUDFLARE_STAGING_POLICY_EXPIRY_DENIED")
        if origin:
            await self._check_cloudflare_policy_bindings(grant["tenantId"], grant["projectId"], policy, expiry, active_origin_ref=grant["configurationRef"])
        else:
            await self._check_cloudflare_policy_bindings(grant["tenantId"], grant["projectId"], policy, expiry)
        result = await self.db.execute(select(ApprovalRequest).where(ApprovalRequest.tenant_id == grant["tenantId"],
            ApprovalRequest.project_id == grant["projectId"], ApprovalRequest.correlation_key.like("cf-staging-grant:%")))
        prior = [r for r in result.scalars().all() if (r.extra_data or {}).get("cloudflareStagingPolicyDecisionV1", {}).get("policyId") == policy_id and r.id != grant["grantRef"]]
        if (len(prior) >= policy["maxOperations"] or any((r.payload or {}).get("jobId") == grant["jobId"] for r in prior)
            or (grant["actions"] == ["bootstrap"] and any((r.payload or {}).get("actions") == ["bootstrap"] for r in prior))):
            raise PermissionError("CLOUDFLARE_STAGING_POLICY_BUDGET_EXHAUSTED")
        return {"policyId": policy_id, "policyVersion": _version(policy), "ownerUserId": conditions["ownerUserId"]}

    async def validate_cloudflare_staging_policy_decision(self, request, now):
        decision = (request.extra_data or {}).get("cloudflareStagingPolicyDecisionV1")
        if not isinstance(decision, dict) or set(decision) != {"policyId", "policyVersion", "ownerUserId"}:
            return False
        try:
            expected = await self.authorize_cloudflare_staging_policy_grant(decision["policyId"], request.payload, now=now)
        except (ValueError, PermissionError):
            return False
        return expected == decision
