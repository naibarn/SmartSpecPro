"""Base notification provider interface."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass
class NotificationResult:
    """Result from a notification send attempt."""

    message_id: str  # Provider-specific message identifier
    status: str  # "sent" | "queued" | "failed"
    delivery_time_ms: float  # Milliseconds taken to send
    provider_response: dict  # Raw provider response
    error: str | None = None  # Error message if status == "failed"


class NotificationProvider(ABC):
    """Abstract base for all notification channel providers."""

    @abstractmethod
    async def send(
        self,
        recipient: str | list[str],
        message: str,
        subject: str | None = None,
        attachments: list[dict] | None = None,
        extra: dict[str, Any] | None = None,
    ) -> NotificationResult:
        """
        Send a notification through this channel.

        Args:
            recipient: Single recipient or list of recipients.
                       Format varies by provider (email, phone, webhook URL, chat_id).
            message: The notification body (HTML for email, plain text for others).
            subject: Subject line (email only, ignored by other providers).
            attachments: List of attachment dicts (email only).
                         Each dict: {"filename": str, "content": bytes | str, "mime_type": str}
            extra: Provider-specific extra parameters.

        Returns:
            NotificationResult with send outcome.
        """
        ...

    @abstractmethod
    def validate_recipient(self, recipient: str) -> bool:
        """
        Validate that a recipient string is well-formed for this provider.

        Args:
            recipient: The recipient identifier to validate.

        Returns:
            True if valid format, False otherwise.
        """
        ...
