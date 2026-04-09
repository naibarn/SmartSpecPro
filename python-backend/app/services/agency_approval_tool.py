"""Human approval tool for agency agents -- request and await human decisions."""

from __future__ import annotations

import asyncio
import uuid
from typing import Any

import structlog

logger = structlog.get_logger(__name__)


class RequestApprovalTool:
    """Tool that agents can call to request human approval.

    On execution:
    1. Generates a unique approvalKey (UUID v4).
    2. Stores approval request in AgencyRunContext.
    3. Emits an SSE 'approval_required' event via AgencyEventEmitter.
    4. Returns a message to the agent indicating approval was requested.
    """

    def __init__(
        self,
        agent_name: str,
        run_context: Any,  # AgencyRunContext
        event_emitter: Any | None = None,  # AgencyEventEmitter
    ) -> None:
        self.agent_name = agent_name
        self._context = run_context
        self._emitter = event_emitter

    async def execute(
        self,
        step: str,
        summary: str,
        *,
        approval_key: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        """Request human approval for the given step.

        Args:
            step: What the agent is requesting approval for.
            summary: Context/details for the human reviewer.
            approval_key: Optional pre-generated key used for external tracking.
            metadata: Optional structured metadata for approver routing/quorum.

        Returns:
            A message string for the agent indicating approval was requested.
        """
        approval_key = approval_key or str(uuid.uuid4())
        metadata = metadata or {}

        # Store in context
        record = {
            "step": step,
            "summary": summary,
            "status": "pending",
            "agentName": self.agent_name,
        }
        if metadata:
            record["metadata"] = metadata
        await self._context.set(f"approval:{approval_key}", record)

        # Emit SSE event
        event_payload = {
            "approvalKey": approval_key,
            "step": step,
            "summary": summary,
            "agentName": self.agent_name,
        }
        if metadata:
            event_payload.update(metadata)

        if self._emitter:
            await self._emitter.emit("approval_required", event_payload)

        logger.info(
            "approval_requested",
            agent=self.agent_name,
            step=step,
            approval_key=approval_key,
        )

        return f"Approval requested. Waiting for human decision on: {step}"


async def await_approval_decision(
    context: Any,  # AgencyRunContext
    approval_key: str,
    step: str,
    timeout_seconds: float = 86400,  # 24 hours default
    poll_interval: float = 2.0,
) -> str:
    """Poll AgencyRunContext for approval decision.

    Returns a message string indicating the decision outcome.
    """
    try:
        async with asyncio.timeout(timeout_seconds):
            while True:
                record = await context.get(f"approval:{approval_key}")
                if record is None:
                    break

                status = record.get("status", "pending")

                if status == "approved":
                    # Mark as consumed
                    record["status"] = "consumed"
                    await context.set(f"approval:{approval_key}", record)
                    logger.info("approval_decision", key=approval_key, decision="approved")
                    return f"[Human approval: APPROVED for '{step}' — proceeding]"

                if status == "rejected":
                    feedback = record.get("feedback", "")
                    record["status"] = "consumed"
                    await context.set(f"approval:{approval_key}", record)
                    feedback_str = f" — feedback: {feedback}" if feedback else ""
                    logger.info("approval_decision", key=approval_key, decision="rejected")
                    return f"[Human approval: REJECTED for '{step}'{feedback_str}]"

                # Still pending -- wait and poll again
                await asyncio.sleep(poll_interval)

    except (asyncio.TimeoutError, TimeoutError):
        logger.warning("approval_timeout", key=approval_key, step=step)
        # Mark as timed out
        record = await context.get(f"approval:{approval_key}")
        if record:
            record["status"] = "timed_out"
            await context.set(f"approval:{approval_key}", record)
        return f"[Human approval: timed out for '{step}' — run terminated]"

    return f"[Human approval: approval record not found for '{step}']"


async def start_approval_subscriber(
    run_id: str,
    context: Any,  # AgencyRunContext
    redis_url: str | None = None,
) -> asyncio.Task:
    """Start a background task that subscribes to Redis approval decisions.

    Listens on channel `agency:approval:{run_id}` and updates AgencyRunContext
    when decisions arrive from the Node.js tRPC submitApproval procedure.
    """
    import json as json_mod
    import os

    import redis.asyncio as aioredis

    url = redis_url or os.getenv("REDIS_URL", "redis://localhost:6379/0")

    async def _listener():
        try:
            client = aioredis.from_url(url)
            pubsub = client.pubsub()
            await pubsub.subscribe(f"agency:approval:{run_id}")
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                try:
                    payload = json_mod.loads(message["data"])
                    approval_key = payload.get("approvalKey")
                    decision = payload.get("decision")
                    feedback = payload.get("feedback", "")
                    if approval_key and decision:
                        record = await context.get(f"approval:{approval_key}")
                        if record and record.get("status") == "pending":
                            record["status"] = decision
                            if feedback:
                                record["feedback"] = feedback
                            await context.set(f"approval:{approval_key}", record)
                            logger.info(
                                "approval_subscriber_updated",
                                key=approval_key,
                                decision=decision,
                            )
                except Exception as e:
                    logger.warning("approval_subscriber_parse_error", error=str(e)[:100])
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error("approval_subscriber_failed", error=str(e)[:100])

    task = asyncio.create_task(_listener())
    return task
