"""Exact staging Tunnel/Access/CA/Hyperdrive intent; no billing, IAM or activation."""
import re
from datetime import datetime
from app.services.cloudflare_origin_provision_contract import validate_grant_identity, plan_digest
from app.services.cloudflare_native_provision_contract import namespace

CONTRACT = "cloudflare-staging-private-db-v1"
POLICY_SCHEMA = "cloudflare.staging-private-database-provision-policy.v1"
GRANT_SCHEMA = "cloudflare.staging-private-database-provision-grant.v1"


def validate_plan(value):
    fields = {"namespace", "hostname", "zoneId", "tunnelId", "databaseName", "caSha256", "connectionLimit", "configurationExpiresAt"}
    if (not isinstance(value, dict) or set(value) != fields
        or value["hostname"] != "db-staging.smartaihub.app"
        or not isinstance(value["namespace"], str) or not re.fullmatch(r"smartspec-staging-[a-f0-9]{12}", value["namespace"])
        or not isinstance(value["zoneId"], str) or not re.fullmatch(r"[a-f0-9]{32}", value["zoneId"])
        or not isinstance(value["tunnelId"], str) or not re.fullmatch(r"[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}", value["tunnelId"])
        or not isinstance(value["databaseName"], str) or not re.fullmatch(r"[a-zA-Z0-9_]{1,63}", value["databaseName"])
        or not isinstance(value["caSha256"], str) or not re.fullmatch(r"[a-f0-9]{64}", value["caSha256"])
        or type(value["connectionLimit"]) is not int or value["connectionLimit"] != 5):
        raise ValueError("CLOUDFLARE_PRIVATE_DATABASE_PLAN_INVALID")
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
