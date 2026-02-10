"""SMS notification provider -- stub for Twilio integration."""

import re
import time
import uuid
from typing import Any

import structlog

from .base import NotificationProvider, NotificationResult

logger = structlog.get_logger()

# Phone number: + followed by 10-15 digits
PHONE_RE = re.compile(r"^\+\d{10,15}$")


class SMSProvider(NotificationProvider):
    """Send notifications via SMS (Twilio).

    STUB IMPLEMENTATION -- returns a simulated success result.
    Replace with actual Twilio client.messages.create() integration
    when ready for production.

    Future implementation should:
    - Use TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER from settings
    - Call client.messages.create(to=recipient, from_=from_number, body=message)
    - Return the Twilio message SID as message_id
    """

    def validate_recipient(self, recipient: str) -> bool:
        """Validate phone number format: + followed by 10-15 digits."""
        return bool(PHONE_RE.match(recipient))

    async def send(
        self,
        recipient: str | list[str],
        message: str,
        subject: str | None = None,
        attachments: list[dict] | None = None,
        extra: dict[str, Any] | None = None,
    ) -> NotificationResult:
        """
        Send SMS notification (stub).

        Args:
            recipient: Phone number(s) in E.164 format (e.g., +1234567890).
            message: SMS body text.
            subject: Ignored for SMS.
            attachments: Ignored for SMS.
            extra: Extra parameters (unused).

        Returns:
            NotificationResult with stub outcome.
        """
        start_time = time.monotonic()

        recipients = [recipient] if isinstance(recipient, str) else list(recipient)
        message_id = f"sms-stub-{uuid.uuid4().hex[:12]}"
        elapsed_ms = (time.monotonic() - start_time) * 1000

        # TODO: Replace with actual Twilio API call:
        #   from twilio.rest import Client
        #   client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        #   twilio_msg = client.messages.create(
        #       to=recipient,
        #       from_=settings.TWILIO_FROM_NUMBER,
        #       body=message,
        #   )
        #   return NotificationResult(
        #       message_id=twilio_msg.sid,
        #       status="sent",
        #       ...
        #   )

        logger.info(
            "sms_stub_send",
            message_id=message_id,
            recipient_count=len(recipients),
            note="stub_provider",
        )

        return NotificationResult(
            message_id=message_id,
            status="sent",
            delivery_time_ms=elapsed_ms,
            provider_response={
                "provider": "twilio_stub",
                "recipients": recipients,
                "note": "Stub provider -- SMS not actually sent. "
                "Integrate Twilio for production use.",
            },
        )
