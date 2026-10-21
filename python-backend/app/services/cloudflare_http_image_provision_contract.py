"""One bounded canonical HTTP image recipe/publication, without VM activation."""
import re
from datetime import datetime
from app.services.cloudflare_origin_provision_contract import validate_grant_identity, plan_digest
from app.services.cloudflare_native_provision_contract import namespace

CONTRACT = "cloudflare-staging-http-image-v1"
POLICY_SCHEMA = "cloudflare.staging-http-image-provision-policy.v1"
GRANT_SCHEMA = "cloudflare.staging-http-image-provision-grant.v1"


def validate_plan(value):
    fields = {"namespace", "runtime", "sourceSha", "buildId", "configurationExpiresAt",
              "buildBudgetSeconds", "maxImageBytes", "maxPublishedImages"}
    if (not isinstance(value, dict) or set(value) != fields
        or not isinstance(value["namespace"], str) or not re.fullmatch(r"smartspec-staging-[a-f0-9]{12}", value["namespace"])
        or value["runtime"] not in ("node-http", "python-http")
        or not isinstance(value["sourceSha"], str) or not re.fullmatch(r"[a-f0-9]{40}", value["sourceSha"])
        or not isinstance(value["buildId"], str)
        or not re.fullmatch(re.escape(value["sourceSha"]) + r"-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}", value["buildId"])
        or type(value["buildBudgetSeconds"]) is not int or value["buildBudgetSeconds"] != 180
        or type(value["maxImageBytes"]) is not int or value["maxImageBytes"] != 1073741824
        or type(value["maxPublishedImages"]) is not int or value["maxPublishedImages"] != 1):
        raise ValueError("CLOUDFLARE_HTTP_IMAGE_PLAN_INVALID")
    try:
        if datetime.fromisoformat(value["configurationExpiresAt"].replace("Z", "+00:00")).tzinfo is None:
            raise ValueError()
    except (ValueError, TypeError, AttributeError) as exc:
        raise ValueError("CLOUDFLARE_HTTP_IMAGE_EXPIRY_INVALID") from exc
    return dict(value)


def normalize_grant(value):
    if not isinstance(value, dict) or value.get("schemaVersion") != GRANT_SCHEMA:
        raise ValueError("CLOUDFLARE_HTTP_IMAGE_GRANT_INVALID")
    plan = validate_plan(value.get("plan"))
    if value.get("planDigest") != plan_digest(plan) or plan["namespace"] != namespace(value.get("tenantId"), value.get("projectId")):
        raise ValueError("CLOUDFLARE_HTTP_IMAGE_SCOPE_INVALID")
    validate_grant_identity(value, GRANT_SCHEMA)
    return {**value, "plan": plan, "actions": ["provision"]}
