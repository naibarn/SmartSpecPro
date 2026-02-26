"""Sandbox Audit Service — structured lifecycle event emission."""

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import structlog

logger = structlog.get_logger()

# Default JSONL audit log directory (matches existing Node.js pattern)
DEFAULT_AUDIT_LOG_DIR = os.getenv("AUDIT_LOG_DIR", "logs/audit")

SANDBOX_EVENT_TYPES = [
    "sandbox_job_accepted",
    "sandbox_created",
    "sandbox_executing",
    "sandbox_completed",
    "sandbox_failed",
    "sandbox_deleted",
]


class SandboxAuditService:
    """Emit structured audit events for sandbox lifecycle stages."""

    def __init__(self, audit_log_dir: Optional[str] = None):
        self._audit_log_dir = audit_log_dir or DEFAULT_AUDIT_LOG_DIR

    def emit(
        self,
        event_type: str,
        sandbox_job_id: str,
        tenant_id: str,
        user_id: int,
        feature_type: str,
        profile_slug: str,
        timing_data: Optional[dict] = None,
        cost_data: Optional[dict] = None,
        error_data: Optional[dict] = None,
    ) -> None:
        """Emit a single audit event to the JSONL log file.

        Event is written as one JSON line to logs/audit/audit-YYYY-MM-DD.jsonl.
        Also emits via structlog for standard log aggregation.
        """
        event = self._build_event(
            event_type=event_type,
            sandbox_job_id=sandbox_job_id,
            tenant_id=tenant_id,
            user_id=user_id,
            feature_type=feature_type,
            profile_slug=profile_slug,
            timing_data=timing_data,
            cost_data=cost_data,
            error_data=error_data,
        )

        self._write_jsonl(event)

        logger.info(
            "sandbox_audit_event",
            event_type=event_type,
            sandbox_job_id=sandbox_job_id,
            tenant_id=tenant_id,
        )

    def _build_event(
        self,
        event_type: str,
        sandbox_job_id: str,
        tenant_id: str,
        user_id: int,
        feature_type: str,
        profile_slug: str,
        timing_data: Optional[dict] = None,
        cost_data: Optional[dict] = None,
        error_data: Optional[dict] = None,
    ) -> dict:
        """Build the audit event dictionary."""
        event = {
            "eventType": event_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "sandboxJobId": sandbox_job_id,
            "tenantId": tenant_id,
            "userId": user_id,
            "featureType": feature_type,
            "profileSlug": profile_slug,
        }

        if timing_data is not None:
            event["timing"] = timing_data

        if cost_data is not None:
            event["cost"] = cost_data

        if error_data is not None:
            event["error"] = error_data

        return event

    def _write_jsonl(self, event: dict) -> None:
        """Append event as JSON line to daily audit log file."""
        log_dir = Path(self._audit_log_dir)
        log_dir.mkdir(parents=True, exist_ok=True)

        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        log_file = log_dir / f"audit-{today}.jsonl"

        with open(log_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(event, ensure_ascii=False) + "\n")
