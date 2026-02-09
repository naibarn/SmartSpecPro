"""Telegram notification provider -- stub for Bot API integration."""

import re
import time
import uuid
from typing import Any

import structlog

from .base import NotificationProvider, NotificationResult

logger = structlog.get_logger()

# Telegram chat_id: numeric (positive for users, negative for groups/channels)
# or @channel_name format
CHAT_ID_RE = re.compile(r"^(-?\d+|@[a-zA-Z][a-zA-Z0-9_]{4,})$")


class TelegramProvider(NotificationProvider):
    """Send notifications via Telegram Bot API.

    STUB IMPLEMENTATION -- returns a simulated success result.
    Replace with actual Telegram Bot API sendMessage call when
    ready for production.

    Future implementation should:
    - Reuse get_bot_token() from app.api.telegram_webhook
    - Reuse send_telegram_message() from app.api.telegram_webhook
    - Call the Telegram Bot API: POST /bot{token}/sendMessage
    - Support parse_mode="HTML" for rich formatting
    - Support chat_id as numeric ID or @channel_name
    """

    def validate_recipient(self, recipient: str) -> bool:
        """Validate Telegram chat_id format: numeric or @channel_name."""
        return bool(CHAT_ID_RE.match(recipient))

    async def send(
        self,
        recipient: str | list[str],
        message: str,
        subject: str | None = None,
        attachments: list[dict] | None = None,
        extra: dict[str, Any] | None = None,
    ) -> NotificationResult:
        """
        Send Telegram notification (stub).

        Args:
            recipient: Telegram chat_id(s) (numeric) or @channel_name(s).
            message: Message text (supports HTML parse_mode).
            subject: Prepended as bold header if provided.
            attachments: Ignored for Telegram stub.
            extra: Extra parameters (unused).

        Returns:
            NotificationResult with stub outcome.
        """
        start_time = time.monotonic()

        recipients = [recipient] if isinstance(recipient, str) else list(recipient)
        message_id = f"telegram-stub-{uuid.uuid4().hex[:12]}"
        elapsed_ms = (time.monotonic() - start_time) * 1000

        # TODO: Replace with actual Telegram Bot API call:
        #   from app.api.telegram_webhook import get_bot_token, send_telegram_message
        #   bot_token = await get_bot_token(db_session)
        #   full_message = f"<b>{subject}</b>\n{message}" if subject else message
        #   for chat_id in recipients:
        #       await send_telegram_message(
        #           bot_token=bot_token,
        #           chat_id=chat_id,
        #           text=full_message,
        #           parse_mode="HTML",
        #       )

        logger.info(
            "telegram_stub_send",
            message_id=message_id,
            recipient_count=len(recipients),
            note="stub_provider",
        )

        return NotificationResult(
            message_id=message_id,
            status="sent",
            delivery_time_ms=elapsed_ms,
            provider_response={
                "provider": "telegram_bot_stub",
                "recipients": recipients,
                "note": "Stub provider -- Telegram message not actually sent. "
                "Integrate Bot API via app.api.telegram_webhook for production use.",
            },
        )
