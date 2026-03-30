"""Social workflow approval gate executor."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

import structlog
from langgraph.types import interrupt
from sqlalchemy import text

from app.core.database import AsyncSessionLocal
from app.orchestrator.hitl import ApprovalType, InterruptPayload
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger(__name__)

MIN_TIMEOUT_MINUTES = 1
MAX_TIMEOUT_MINUTES = 10080


def _coerce_confidence(value: Any) -> float:
    try:
        return max(0.0, min(1.0, float(value)))
    except (TypeError, ValueError):
        return 0.0


def _coerce_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


class SocialApprovalGateExecutor:
    """Pause or auto-approve a social action based on confidence."""

    async def _create_social_approval(
        self,
        *,
        context: ExecutionContext,
        action_type: str,
        content: str,
        confidence: float,
        page_id: int,
    ) -> int | None:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                text(
                    """
                    INSERT INTO social_human_approvals (
                      "tenantId", "pageId", "entityType", "entityId",
                      "proposedContent", confidence, status, "requestedBySystem",
                      "createdAt", "updatedAt"
                    ) VALUES (
                      :tenant_id, :page_id, :entity_type, :entity_id,
                      :proposed_content, :confidence, 'pending', true,
                      :created_at, :updated_at
                    )
                    RETURNING id
                    """
                ),
                {
                    "tenant_id": context.tenant_id,
                    "page_id": page_id,
                    "entity_type": action_type,
                    "entity_id": _coerce_int(context.extra_data.get("social_entity_id"), 0),
                    "proposed_content": content,
                    "confidence": confidence,
                    "created_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc),
                },
            )
            row = result.fetchone()
            await db.commit()
            return int(row[0]) if row else None

    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        action_type = str(data.inputs.get("actionType") or data.config.get("actionType") or "reply")
        content = str(data.inputs.get("content") or data.config.get("content") or "")
        confidence = _coerce_confidence(data.inputs.get("confidence") or data.config.get("confidence"))
        threshold = _coerce_confidence(data.inputs.get("autoApproveThreshold") or data.config.get("autoApproveThreshold") or 0.95)
        page_id = _coerce_int(data.inputs.get("pageId") or data.config.get("pageId") or context.extra_data.get("social_page_id"), 0)

        if confidence >= threshold:
            logger.info(
                "social_approval_auto_approved",
                node_id=data.node_id,
                action_type=action_type,
                confidence=confidence,
                threshold=threshold,
            )
            return {
                "approved": True,
                "content": content,
                "reviewerNote": "Auto-approved by policy threshold",
            }

        approval_id = f"social-approval-{uuid4().hex[:12]}"
        approval_db_id = await self._create_social_approval(
            context=context,
            action_type=action_type,
            content=content,
            confidence=confidence,
            page_id=page_id,
        )

        payload = InterruptPayload(
            node_id=data.node_id,
            message=f"Review required for social {action_type}",
            approval_type=ApprovalType.APPROVE_REJECT,
            timeout_minutes=max(MIN_TIMEOUT_MINUTES, min(int(data.config.get("timeoutMinutes", 60)), MAX_TIMEOUT_MINUTES)),
            required_approvers=1,
            data={
                "actionType": action_type,
                "content": content,
                "confidence": confidence,
                "approvalDbId": approval_db_id,
                "pageId": page_id,
            },
            approval_id=approval_id,
        )

        logger.info(
            "social_approval_interrupt",
            node_id=data.node_id,
            action_type=action_type,
            confidence=confidence,
            approval_db_id=approval_db_id,
        )

        response = interrupt(payload.to_dict())
        if not isinstance(response, dict):
            response = {"approved": False, "comment": "Unexpected response format"}

        approved = bool(response.get("approved"))
        reviewer_note = str(response.get("reviewerNote") or response.get("comment") or "")
        edited_content = str(response.get("content") or response.get("editedContent") or content)

        async with AsyncSessionLocal() as db:
            if approval_db_id is not None:
                await db.execute(
                    text(
                        """
                        UPDATE social_human_approvals
                        SET status = :status,
                            "reviewedByUserId" = :reviewed_by_user_id,
                            "decisionNote" = :decision_note,
                            "updatedAt" = :updated_at
                        WHERE id = :approval_id
                        """
                    ),
                    {
                        "approval_id": approval_db_id,
                        "status": "approved" if approved else "rejected",
                        "reviewed_by_user_id": response.get("approved_by"),
                        "decision_note": reviewer_note or None,
                        "updated_at": datetime.now(timezone.utc),
                    },
                )
                await db.commit()

        return {
            "approved": approved,
            "content": edited_content,
            "reviewerNote": reviewer_note,
        }
