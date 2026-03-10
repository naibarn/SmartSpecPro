"""Browser policy audit artifact helpers."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone

from app.services.browser_policy_contract import BrowserPolicyDecisionEnvelope


def _build_integrity_hash(
    *,
    timestamp: str,
    trace_id: str | None,
    tenant_id: str,
    execution_id: str | None,
    action_type: str,
    decision: str,
    reason_codes: list[str],
    approval_state: str,
    outcome: str,
    evidence: dict,
    previous_event_hash: str | None,
) -> str:
    payload = {
        "timestamp": timestamp,
        "trace_id": trace_id,
        "tenant_id": tenant_id,
        "execution_id": execution_id,
        "action_type": action_type,
        "decision": decision,
        "reason_codes": reason_codes,
        "approval_state": approval_state,
        "outcome": outcome,
        "evidence": evidence,
        "previous_event_hash": previous_event_hash,
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()


def build_browser_policy_audit_artifacts(
    *,
    decision: BrowserPolicyDecisionEnvelope,
    approval_state: str,
    outcome: str,
    previous_event_hash: str | None = None,
    raw_dom_snippet: str | None = None,
    full_screenshot_base64: str | None = None,
) -> dict[str, dict]:
    del raw_dom_snippet
    del full_screenshot_base64

    timestamp = datetime.now(timezone.utc).isoformat()
    event_hash = _build_integrity_hash(
        timestamp=timestamp,
        trace_id=decision.traceId,
        tenant_id=decision.tenantId,
        execution_id=decision.executionId,
        action_type=decision.actionType,
        decision=decision.decision,
        reason_codes=list(decision.reasonCodes),
        approval_state=approval_state,
        outcome=outcome,
        evidence=decision.evidence.model_dump(),
        previous_event_hash=previous_event_hash,
    )

    jsonl_event = {
        "eventType": "browser_policy_decision",
        "timestamp": timestamp,
        "traceId": decision.traceId,
        "tenantId": decision.tenantId,
        "userId": decision.userId,
        "workflowId": decision.workflowId,
        "executionId": decision.executionId,
        "actionType": decision.actionType,
        "actionClass": decision.actionClass,
        "pageSensitivity": decision.pageSensitivity,
        "decision": decision.decision,
        "reasonCodes": list(decision.reasonCodes),
        "approvalState": approval_state,
        "outcome": outcome,
        "evidence": decision.evidence.model_dump(),
        "integrity": {
            "previousEventHash": previous_event_hash,
            "eventHash": event_hash,
        },
    }

    return {
        "jsonl_event": jsonl_event,
        "db_record": {
            **jsonl_event,
            "createdAt": timestamp,
        },
    }


def verify_browser_policy_audit_chain(events: list[dict]) -> dict[str, object]:
    previous_event_hash: str | None = None

    for event in events:
        expected = _build_integrity_hash(
            timestamp=event["timestamp"],
            trace_id=event.get("traceId"),
            tenant_id=event["tenantId"],
            execution_id=event.get("executionId"),
            action_type=event["actionType"],
            decision=event["decision"],
            reason_codes=list(event["reasonCodes"]),
            approval_state=event["approvalState"],
            outcome=event["outcome"],
            evidence=event["evidence"],
            previous_event_hash=previous_event_hash,
        )
        if (
            event["integrity"]["previousEventHash"] != previous_event_hash
            or event["integrity"]["eventHash"] != expected
        ):
            return {"valid": False, "failed_at_trace_id": event.get("traceId")}
        previous_event_hash = event["integrity"]["eventHash"]

    return {"valid": True, "failed_at_trace_id": None}
