"""Slack notification provider -- stub for webhook integration."""

import re
import time
import uuid
from typing import Any

import structlog

from .base import NotificationProvider, NotificationResult

logger = structlog.get_logger()

# Slack webhook URL pattern
SLACK_WEBHOOK_RE = re.compile(r"^https://hooks\.slack\.com/services/T[A-Z0-9]+/B[A-Z0-9]+/.+$")


class SlackProvider(NotificationProvider):
    """Send notifications via Slack webhook.

    STUB IMPLEMENTATION -- returns a simulated success result.
    Replace with actual httpx POST to Slack webhook URL when ready
    for production.

    Future implementation should:
    - Accept webhook URL as recipient (per-workflow) or use
      SLACK_DEFAULT_WEBHOOK_URL from settings as fallback
    - POST JSON payload: {"text": message} or rich Block Kit format
    - Use httpx.AsyncClient for non-blocking HTTP
    - Handle 429 rate limiting with Retry-After header
    """

    def validate_recipient(self, recipient: str) -> bool:
        """Validate Slack webhook URL format."""
        return bool(SLACK_WEBHOOK_RE.match(recipient))

    async def send(
        self,
        recipient: str | list[str],
        message: str,
        subject: str | None = None,
        attachments: list[dict] | None = None,
        extra: dict[str, Any] | None = None,
    ) -> NotificationResult:
        """
        Send Slack notification (stub).

        Args:
            recipient: Slack incoming webhook URL(s).
            message: Message text (supports Slack mrkdwn format).
            subject: Used as a bold header line if provided.
            attachments: Ignored for Slack stub.
            extra: Extra parameters (unused).

        Returns:
            NotificationResult with stub outcome.
        """
        start_time = time.monotonic()

        recipients = [recipient] if isinstance(recipient, str) else list(recipient)
        message_id = f"slack-stub-{uuid.uuid4().hex[:12]}"
        elapsed_ms = (time.monotonic() - start_time) * 1000

        # TODO: Replace with actual Slack webhook call:
        #   async with httpx.AsyncClient() as client:
        #       payload = {"text": message}
        #       if subject:
        #           payload["text"] = f"*{subject}*\n{message}"
        #       response = await client.post(recipient, json=payload)
        #       response.raise_for_status()

        logger.info(
            "slack_stub_send",
            message_id=message_id,
            recipient_count=len(recipients),
            note="stub_provider",
        )

        return NotificationResult(
            message_id=message_id,
            status="sent",
            delivery_time_ms=elapsed_ms,
            provider_response={
                "provider": "slack_webhook_stub",
                "recipients": recipients,
                "note": "Stub provider -- Slack message not actually sent. "
                "Integrate Slack webhook for production use.",
            },
        )
