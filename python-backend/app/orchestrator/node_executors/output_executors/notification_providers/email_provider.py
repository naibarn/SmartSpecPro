"""Email notification provider -- production-ready SMTP implementation."""

import asyncio
import base64
import re
import smtplib
import time
import uuid
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

import structlog

from app.core.config import settings

from .base import NotificationProvider, NotificationResult

logger = structlog.get_logger()

# Simple HTML tag stripper for plaintext fallback
TAG_RE = re.compile(r"<[^>]+>")
# Basic email validation (RFC 5322 simplified)
EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")

MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024  # 25 MB per attachment
MAX_TOTAL_ATTACHMENT_SIZE = 50 * 1024 * 1024  # 50 MB total


class EmailProvider(NotificationProvider):
    """Send notifications via SMTP email.

    Uses SMTP settings from app.core.config.settings. Sends email
    in a thread pool via asyncio.to_thread() to avoid blocking the
    event loop.
    """

    def __init__(self):
        self.smtp_host = getattr(settings, "SMTP_HOST", "smtp.gmail.com")
        self.smtp_port = getattr(settings, "SMTP_PORT", 587)
        self.smtp_user = getattr(settings, "SMTP_USER", "")
        self.smtp_password = getattr(settings, "SMTP_PASSWORD", "")
        self.from_email = getattr(settings, "FROM_EMAIL", "noreply@smartspec.com")
        self.from_name = getattr(settings, "FROM_NAME", "SmartSpec")

    def validate_recipient(self, recipient: str) -> bool:
        """Validate email address format."""
        return bool(EMAIL_RE.match(recipient))

    async def send(
        self,
        recipient: str | list[str],
        message: str,
        subject: str | None = None,
        attachments: list[dict] | None = None,
        extra: dict[str, Any] | None = None,
    ) -> NotificationResult:
        """
        Send email via SMTP.

        The actual SMTP send is delegated to a thread pool via
        asyncio.to_thread() to keep the async event loop non-blocking.

        Args:
            recipient: Email address or list of email addresses.
            message: Email body. If HTML tags are detected, sent as HTML
                     with a plaintext fallback. Otherwise sent as plain
                     text with a simple HTML wrapper.
            subject: Email subject line. Defaults to "Notification from SmartSpec".
            attachments: Optional list of attachment dicts. Each dict should
                         contain "filename", "content" (base64 string or raw bytes),
                         and "mime_type".
            extra: Extra parameters (unused for email).

        Returns:
            NotificationResult with SMTP send outcome.
        """
        start_time = time.monotonic()

        # Normalize recipients
        recipients = [recipient] if isinstance(recipient, str) else list(recipient)

        # Validate all recipients
        invalid = [r for r in recipients if not self.validate_recipient(r)]
        if invalid:
            return NotificationResult(
                message_id="",
                status="failed",
                delivery_time_ms=0,
                provider_response={},
                error=f"Invalid email addresses: {', '.join(invalid)}",
            )

        # Build subject
        subject = subject or "Notification from SmartSpec"

        # Detect HTML vs plain text
        is_html = bool(re.search(r"<[a-z][\s\S]*>", message, re.IGNORECASE))

        # Build MIME message
        msg = MIMEMultipart("mixed")
        msg["Subject"] = subject
        msg["From"] = f"{self.from_name} <{self.from_email}>"
        msg["To"] = ", ".join(recipients)

        # Create message body with alternative parts
        body_part = MIMEMultipart("alternative")
        if is_html:
            plain_text = TAG_RE.sub("", message)
            body_part.attach(MIMEText(plain_text, "plain", "utf-8"))
            body_part.attach(MIMEText(message, "html", "utf-8"))
        else:
            body_part.attach(MIMEText(message, "plain", "utf-8"))
            html_body = f"<html><body><p>{message}</p></body></html>"
            body_part.attach(MIMEText(html_body, "html", "utf-8"))

        msg.attach(body_part)

        # Process attachments
        if attachments:
            total_size = 0
            for attachment in attachments:
                filename = attachment.get("filename", "attachment")
                content = attachment.get("content")
                mime_type = attachment.get("mime_type", "application/octet-stream")

                if not content:
                    continue

                # Decode base64 content if it's a string
                if isinstance(content, str):
                    try:
                        content_bytes = base64.b64decode(content)
                    except Exception:
                        logger.warning(
                            "email_attachment_decode_error",
                            filename=filename,
                        )
                        continue
                else:
                    content_bytes = content

                # Check individual attachment size
                if len(content_bytes) > MAX_ATTACHMENT_SIZE:
                    return NotificationResult(
                        message_id="",
                        status="failed",
                        delivery_time_ms=(time.monotonic() - start_time) * 1000,
                        provider_response={},
                        error=(
                            f"Attachment '{filename}' exceeds "
                            f"{MAX_ATTACHMENT_SIZE // (1024 * 1024)}MB limit"
                        ),
                    )

                total_size += len(content_bytes)
                if total_size > MAX_TOTAL_ATTACHMENT_SIZE:
                    return NotificationResult(
                        message_id="",
                        status="failed",
                        delivery_time_ms=(time.monotonic() - start_time) * 1000,
                        provider_response={},
                        error=(
                            f"Total attachment size exceeds "
                            f"{MAX_TOTAL_ATTACHMENT_SIZE // (1024 * 1024)}MB limit"
                        ),
                    )

                # Build MIME attachment
                maintype, _, subtype = mime_type.partition("/")
                part = MIMEBase(maintype or "application", subtype or "octet-stream")
                part.set_payload(content_bytes)
                encoders.encode_base64(part)
                part.add_header(
                    "Content-Disposition",
                    "attachment",
                    filename=filename,
                )
                msg.attach(part)

        # Generate message ID
        message_id = f"<{uuid.uuid4().hex}@smartspec.workflow>"
        msg["Message-ID"] = message_id

        # Send via SMTP in thread pool
        try:
            await asyncio.to_thread(self._send_smtp, msg, recipients)
            elapsed_ms = (time.monotonic() - start_time) * 1000

            logger.info(
                "email_sent",
                message_id=message_id,
                recipient_count=len(recipients),
                subject=subject,
            )

            return NotificationResult(
                message_id=message_id,
                status="sent",
                delivery_time_ms=elapsed_ms,
                provider_response={
                    "provider": "smtp",
                    "recipients": recipients,
                    "subject": subject,
                },
            )
        except smtplib.SMTPAuthenticationError as e:
            elapsed_ms = (time.monotonic() - start_time) * 1000
            logger.error("email_auth_error", error=str(e))
            return NotificationResult(
                message_id="",
                status="failed",
                delivery_time_ms=elapsed_ms,
                provider_response={"error_detail": str(e)},
                error=f"SMTP authentication failed: {str(e)}",
            )
        except smtplib.SMTPRecipientsRefused as e:
            elapsed_ms = (time.monotonic() - start_time) * 1000
            logger.error("email_recipients_refused", error=str(e))
            return NotificationResult(
                message_id="",
                status="failed",
                delivery_time_ms=elapsed_ms,
                provider_response={"error_detail": str(e)},
                error=f"Recipients refused: {str(e)}",
            )
        except smtplib.SMTPException as e:
            elapsed_ms = (time.monotonic() - start_time) * 1000
            logger.error("email_smtp_error", error=str(e))
            return NotificationResult(
                message_id="",
                status="failed",
                delivery_time_ms=elapsed_ms,
                provider_response={"error_detail": str(e)},
                error=f"SMTP error: {str(e)}",
            )
        except Exception as e:
            elapsed_ms = (time.monotonic() - start_time) * 1000
            logger.error("email_send_error", error=str(e), exc_info=True)
            return NotificationResult(
                message_id="",
                status="failed",
                delivery_time_ms=elapsed_ms,
                provider_response={"error_detail": str(e)},
                error=f"Unexpected error: {str(e)}",
            )

    def _send_smtp(self, msg: MIMEMultipart, recipients: list[str]) -> None:
        """Blocking SMTP send -- runs in thread pool via asyncio.to_thread()."""
        with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
            server.starttls()
            if self.smtp_user and self.smtp_password:
                server.login(self.smtp_user, self.smtp_password)
            server.sendmail(self.from_email, recipients, msg.as_string())
