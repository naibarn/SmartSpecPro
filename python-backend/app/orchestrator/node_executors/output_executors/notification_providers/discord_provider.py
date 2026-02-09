"""Discord notification provider -- stub for webhook integration."""

import re
import time
import uuid
from typing import Any

import structlog

from .base import NotificationProvider, NotificationResult

logger = structlog.get_logger()

# Discord webhook URL pattern
DISCORD_WEBHOOK_RE = re.compile(r"^https://discord\.com/api/webhooks/\d+/.+$")


class DiscordProvider(NotificationProvider):
    """Send notifications via Discord webhook.

    STUB IMPLEMENTATION -- returns a simulated success result.
    Replace with actual httpx POST to Discord webhook URL when ready
    for production.

    Future implementation should:
    - Accept webhook URL as recipient (per-workflow) or use
      DISCORD_DEFAULT_WEBHOOK_URL from settings as fallback
    - POST JSON payload: {"content": message} or embed format
    - Use httpx.AsyncClient for non-blocking HTTP
    - Handle 429 rate limiting with retry_after from Discord response
    - Support embeds for rich formatting
    """

    def validate_recipient(self, recipient: str) -> bool:
        """Validate Discord webhook URL format."""
        return bool(DISCORD_WEBHOOK_RE.match(recipient))

    async def send(
        self,
        recipient: str | list[str],
        message: str,
        subject: str | None = None,
        attachments: list[dict] | None = None,
        extra: dict[str, Any] | None = None,
    ) -> NotificationResult:
        """
        Send Discord notification (stub).

        Args:
            recipient: Discord webhook URL(s).
            message: Message content (supports Discord markdown).
            subject: Used as embed title if provided.
            attachments: Ignored for Discord stub.
            extra: Extra parameters (unused).

        Returns:
            NotificationResult with stub outcome.
        """
        start_time = time.monotonic()

        recipients = [recipient] if isinstance(recipient, str) else list(recipient)
        message_id = f"discord-stub-{uuid.uuid4().hex[:12]}"
        elapsed_ms = (time.monotonic() - start_time) * 1000

        # TODO: Replace with actual Discord webhook call:
        #   async with httpx.AsyncClient() as client:
        #       payload = {"content": message}
        #       if subject:
        #           payload = {
        #               "embeds": [{
        #                   "title": subject,
        #                   "description": message,
        #               }]
        #           }
        #       response = await client.post(recipient, json=payload)
        #       response.raise_for_status()

        logger.info(
            "discord_stub_send",
            message_id=message_id,
            recipient_count=len(recipients),
            note="stub_provider",
        )

        return NotificationResult(
            message_id=message_id,
            status="sent",
            delivery_time_ms=elapsed_ms,
            provider_response={
                "provider": "discord_webhook_stub",
                "recipients": recipients,
                "note": "Stub provider -- Discord message not actually sent. "
                "Integrate Discord webhook for production use.",
            },
        )
