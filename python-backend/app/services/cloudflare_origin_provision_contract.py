"""Exact protected staging ingress intent; not Worker deployment authority."""
import hashlib
import json
import re
from datetime import datetime

CONTRACT = "cloudflare-staging-origin-provision-v1"
POLICY_SCHEMA = "cloudflare.staging-origin-provision-policy.v1"
GRANT_SCHEMA = "cloudflare.staging-origin-provision-grant.v1"


def plan_digest(plan):
    return hashlib.sha256(json.dumps(plan, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def validate_plan(value):
    fields = {"hostname", "zoneId", "tunnelId", "teamName", "publicOrigin", "configurationExpiresAt"}
    if (not isinstance(value, dict) or set(value) != fields
        or value["hostname"] != "origin-staging.smartaihub.app"
        or not isinstance(value["zoneId"], str) or not re.fullmatch(r"[a-f0-9]{32}", value["zoneId"])
        or not isinstance(value["tunnelId"], str) or not re.fullmatch(r"[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}", value["tunnelId"])
        or not isinstance(value["teamName"], str) or not re.fullmatch(r"[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?", value["teamName"])
        or not isinstance(value["publicOrigin"], str) or not re.fullmatch(r"https://smartspec-cloudflare-staging\.[a-z0-9-]+\.workers\.dev", value["publicOrigin"])):
        raise ValueError("CLOUDFLARE_ORIGIN_PROVISION_PLAN_INVALID")
    try:
        expiry = datetime.fromisoformat(value["configurationExpiresAt"].replace("Z", "+00:00"))
        if expiry.tzinfo is None:
            raise ValueError()
    except (TypeError, AttributeError, ValueError) as exc:
        raise ValueError("CLOUDFLARE_ORIGIN_PROVISION_EXPIRY_INVALID") from exc
    return dict(value)


def normalize_grant(value):
    fields = {"schemaVersion", "grantRef", "tenantId", "projectId", "requesterUserId", "executorId",
              "targetId", "environment", "accountRef", "jobId", "actions", "plan", "planDigest", "expiresAt", "revokedAt"}
    if (not isinstance(value, dict) or set(value) != fields or value["schemaVersion"] != GRANT_SCHEMA
        or value["targetId"] != "smartspec-cloudflare-staging" or value["environment"] != "staging"
        or value["actions"] != ["provision"] or type(value["requesterUserId"]) is not int or value["requesterUserId"] <= 0
        or not isinstance(value["accountRef"], str) or not re.fullmatch(r"[a-f0-9]{32}", value["accountRef"])):
        raise ValueError("CLOUDFLARE_ORIGIN_PROVISION_GRANT_INVALID")
    for key in ("grantRef", "jobId"):
        if not isinstance(value[key], str) or not re.fullmatch(r"[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}", value[key]):
            raise ValueError("CLOUDFLARE_ORIGIN_PROVISION_GRANT_INVALID")
    for key in ("tenantId", "projectId", "executorId"):
        if not isinstance(value[key], str) or not 1 <= len(value[key]) <= (36 if key != "executorId" else 200):
            raise ValueError("CLOUDFLARE_ORIGIN_PROVISION_GRANT_INVALID")
    plan = validate_plan(value["plan"])
    if value["planDigest"] != plan_digest(plan):
        raise ValueError("CLOUDFLARE_ORIGIN_PROVISION_DIGEST_INVALID")
    for key in ("expiresAt", "revokedAt"):
        if key == "revokedAt" and value[key] is None:
            continue
        try:
            if datetime.fromisoformat(value[key].replace("Z", "+00:00")).tzinfo is None:
                raise ValueError()
        except (TypeError, AttributeError, ValueError) as exc:
            raise ValueError("CLOUDFLARE_ORIGIN_PROVISION_EXPIRY_INVALID") from exc
    return {**value, "plan": plan, "actions": ["provision"]}
