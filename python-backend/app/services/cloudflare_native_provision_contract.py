"""Bounded Queue/R2/Vectorize staging metadata; no activation, IAM or DB exposure."""
import hashlib
import re
from datetime import datetime
from app.services.cloudflare_origin_provision_contract import validate_grant_identity, plan_digest

CONTRACT = "cloudflare-staging-native-provision-v1"
POLICY_SCHEMA = "cloudflare.staging-native-provision-policy.v1"
GRANT_SCHEMA = "cloudflare.staging-native-provision-grant.v1"


def namespace(tenant_id, project_id):
    return "smartspec-staging-" + hashlib.sha256(f"{tenant_id}|{project_id}".encode()).hexdigest()[:12]


def validate_plan(value):
    if (not isinstance(value, dict)
        or set(value) != {"namespace", "vectorDimensions", "vectorMetric", "configurationExpiresAt"}
        or not isinstance(value["namespace"], str)
        or not re.fullmatch(r"smartspec-staging-[a-f0-9]{12}", value["namespace"])
        or type(value["vectorDimensions"]) is not int or value["vectorDimensions"] != 768
        or value["vectorMetric"] != "cosine"):
        raise ValueError("CLOUDFLARE_NATIVE_PROVISION_PLAN_INVALID")
    try:
        if datetime.fromisoformat(value["configurationExpiresAt"].replace("Z", "+00:00")).tzinfo is None:
            raise ValueError()
    except (ValueError, TypeError, AttributeError) as exc:
        raise ValueError("CLOUDFLARE_NATIVE_PROVISION_EXPIRY_INVALID") from exc
    return dict(value)


def normalize_grant(value):
    # Reuse the original grant's strict identity/expiry checks without weakening it.
    if not isinstance(value, dict) or value.get("schemaVersion") != GRANT_SCHEMA:
        raise ValueError("CLOUDFLARE_NATIVE_PROVISION_GRANT_INVALID")
    plan = validate_plan(value.get("plan"))
    if (value.get("planDigest") != plan_digest(plan)
        or plan["namespace"] != namespace(value.get("tenantId"), value.get("projectId"))):
        raise ValueError("CLOUDFLARE_NATIVE_PROVISION_SCOPE_INVALID")
    validate_grant_identity(value, GRANT_SCHEMA)
    return {**value, "plan": plan, "actions": ["provision"]}
