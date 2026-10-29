"""Exact staging Tunnel/Access/CA/Hyperdrive intent; no billing, IAM or activation."""
import re
from datetime import datetime
from app.services.cloudflare_origin_provision_contract import validate_grant_identity, plan_digest
from app.services.cloudflare_native_provision_contract import namespace

CONTRACT = "cloudflare-staging-private-db-v1"
POLICY_SCHEMA = "cloudflare.staging-private-database-provision-policy.v1"
GRANT_SCHEMA = "cloudflare.staging-private-database-provision-grant.v1"
RENEWAL_CONTRACT = "cloudflare-staging-private-db-renewal-v1"
RENEWAL_POLICY_SCHEMA = "cloudflare.staging-private-database-renewal-policy.v1"
RENEWAL_GRANT_SCHEMA = "cloudflare.staging-private-database-renewal-grant.v1"


def validate_plan(value):
    fields = {"namespace", "hostname", "zoneId", "tunnelId", "databaseName", "caSha256", "connectionLimit", "configurationExpiresAt"}
    if (not isinstance(value, dict) or set(value) not in (fields, fields | {"publicRunnerCatalogSourceJobId"})
        or value["hostname"] != "db-staging.smartaihub.app"
        or not isinstance(value["namespace"], str) or not re.fullmatch(r"smartspec-staging-[a-f0-9]{12}", value["namespace"])
        or not isinstance(value["zoneId"], str) or not re.fullmatch(r"[a-f0-9]{32}", value["zoneId"])
        or not isinstance(value["tunnelId"], str) or not re.fullmatch(r"[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}", value["tunnelId"])
        or not isinstance(value["databaseName"], str) or not re.fullmatch(r"[a-zA-Z0-9_]{1,63}", value["databaseName"])
        or not isinstance(value["caSha256"], str) or not re.fullmatch(r"[a-f0-9]{64}", value["caSha256"])
        or type(value["connectionLimit"]) is not int or value["connectionLimit"] != 5):
        raise ValueError("CLOUDFLARE_PRIVATE_DATABASE_PLAN_INVALID")
    source = value.get("publicRunnerCatalogSourceJobId")
    if "publicRunnerCatalogSourceJobId" in value and (not isinstance(source, str) or not re.fullmatch(r"[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}", source)):
        raise ValueError("CLOUDFLARE_PRIVATE_DATABASE_PUBLIC_CATALOG_SOURCE_INVALID")
    try:
        if datetime.fromisoformat(value["configurationExpiresAt"].replace("Z", "+00:00")).tzinfo is None:
            raise ValueError()
    except (ValueError, TypeError, AttributeError) as exc:
        raise ValueError("CLOUDFLARE_PRIVATE_DATABASE_EXPIRY_INVALID") from exc
    return dict(value)


def normalize_grant(value):
    validate_grant_identity(value, GRANT_SCHEMA)
    plan = validate_plan(value["plan"])
    if value["planDigest"] != plan_digest(plan) or plan["namespace"] != namespace(value["tenantId"], value["projectId"]):
        raise ValueError("CLOUDFLARE_PRIVATE_DATABASE_SCOPE_INVALID")
    return {**value, "plan": plan, "actions": ["provision"]}


def validate_renewal_plan(value):
    """Renew only the lease on one receipt-bound staging role and its existing resources."""
    fields = {"configurationRef", "configurationDigest", "sourceProvisionJobId", "sourcePlan", "sourcePlanDigest",
        "resources", "serviceTokenExpiresAt", "refreshServiceTokenExpiry", "leaseExpiresAt", "authorizationExpiresAt"}
    ids = {"hyperdriveId", "caId", "accessApplicationId", "accessPolicyId", "serviceTokenId", "dnsRecordId"}
    if not isinstance(value, dict) or set(value) != fields:
        raise ValueError("CLOUDFLARE_PRIVATE_DATABASE_RENEWAL_PLAN_INVALID")
    source_plan = validate_plan(value["sourcePlan"])
    if (not isinstance(value["configurationDigest"], str) or not re.fullmatch(r"[a-f0-9]{64}", value["configurationDigest"])
        or value["configurationRef"] != "cf-origin:" + value["configurationDigest"]
        or not isinstance(value["sourceProvisionJobId"], str) or not re.fullmatch(r"[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}", value["sourceProvisionJobId"])
        or value["sourcePlanDigest"] != plan_digest(source_plan)
        or not isinstance(value["resources"], dict) or set(value["resources"]) != ids):
        raise ValueError("CLOUDFLARE_PRIVATE_DATABASE_RENEWAL_BINDING_INVALID")
    for resource_id in value["resources"].values():
        if not isinstance(resource_id, str) or not re.fullmatch(r"[a-f0-9]{32}|[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}", resource_id):
            raise ValueError("CLOUDFLARE_PRIVATE_DATABASE_RENEWAL_RESOURCE_INVALID")
    try:
        expires_at = datetime.fromisoformat(value["leaseExpiresAt"].replace("Z", "+00:00"))
        token_expires_at = datetime.fromisoformat(value["serviceTokenExpiresAt"].replace("Z", "+00:00"))
        authorization_expires_at = datetime.fromisoformat(value["authorizationExpiresAt"].replace("Z", "+00:00"))
        old_expiry = datetime.fromisoformat(source_plan["configurationExpiresAt"].replace("Z", "+00:00"))
        if (expires_at.tzinfo is None or token_expires_at.tzinfo is None or old_expiry.tzinfo is None or authorization_expires_at.tzinfo is None
            or type(value["refreshServiceTokenExpiry"]) is not bool
            or value["refreshServiceTokenExpiry"] != (token_expires_at < expires_at)
            or expires_at <= old_expiry or authorization_expires_at >= expires_at):
            raise ValueError()
    except (ValueError, TypeError, AttributeError) as exc:
        raise ValueError("CLOUDFLARE_PRIVATE_DATABASE_RENEWAL_EXPIRY_INVALID") from exc
    return {**value, "sourcePlan": source_plan, "resources": dict(value["resources"])}


def renewal_plan_digest(plan):
    # The short-lived authorization window is reissued by each read-only preflight. It remains
    # validated and bounds the grant, but is not part of the immutable reviewed operation plan.
    reviewed = validate_renewal_plan(plan)
    reviewed.pop("authorizationExpiresAt")
    return plan_digest(reviewed)


def normalize_renewal_grant(value):
    if not isinstance(value, dict):
        raise ValueError("CLOUDFLARE_PRIVATE_DATABASE_RENEWAL_GRANT_INVALID")
    fields = {"schemaVersion", "grantRef", "tenantId", "projectId", "requesterUserId", "executorId", "jobId", "accountRef",
        "targetId", "environment", "actions", "plan", "planDigest", "expiresAt", "revokedAt"}
    if set(value) != fields or value["schemaVersion"] != RENEWAL_GRANT_SCHEMA or value["targetId"] != "smartspec-cloudflare-staging" \
        or value["environment"] != "staging" or value["actions"] != ["renew_lease"] or value["revokedAt"] is not None:
        raise ValueError("CLOUDFLARE_PRIVATE_DATABASE_RENEWAL_GRANT_INVALID")
    plan = validate_renewal_plan(value["plan"])
    if value["planDigest"] != renewal_plan_digest(plan) or plan["sourcePlan"]["namespace"] != namespace(value["tenantId"], value["projectId"]):
        raise ValueError("CLOUDFLARE_PRIVATE_DATABASE_RENEWAL_SCOPE_INVALID")
    for name in ("grantRef", "jobId", "sourceProvisionJobId"):
        candidate = value["plan"].get(name) if name == "sourceProvisionJobId" else value[name]
        if not isinstance(candidate, str) or not re.fullmatch(r"[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}", candidate):
            raise ValueError("CLOUDFLARE_PRIVATE_DATABASE_RENEWAL_GRANT_INVALID")
    validate_grant_identity({**value, "actions": ["provision"]}, RENEWAL_GRANT_SCHEMA)
    return {**value, "plan": plan, "actions": ["renew_lease"]}
