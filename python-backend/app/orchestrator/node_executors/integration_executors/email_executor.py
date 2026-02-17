"""Email Executor - Send emails with rate limiting and validation."""

import logging
import re
from email.utils import parseaddr
from typing import Any

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = logging.getLogger(__name__)


class EmailExecutor:
    """
    Send emails with rate limiting and validation.

    Providers supported:
    - SMTP (local or external)
    - SendGrid
    - AWS SES

    Note: This is a stub implementation. Full implementation requires
    email provider configuration and async email service integration.
    """

    EMAIL_REGEX = re.compile(
        r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    )
    MAX_EMAIL_SIZE = 25 * 1024 * 1024  # 25MB
    RATE_LIMIT = 100  # emails per hour per tenant

    async def execute(
        self, data: NodeExecutionData, context: ExecutionContext
    ) -> dict[str, Any]:
        """Send email with validation and rate limiting."""
        to = data.inputs.get("to")
        cc = data.inputs.get("cc", [])
        bcc = data.inputs.get("bcc", [])
        subject = data.inputs.get("subject", "")
        body_text = data.inputs.get("body_text", "")
        body_html = data.inputs.get("body_html")
        from_email = data.inputs.get("from")  # Optional, uses default
        attachments = data.inputs.get("attachments", [])

        # Validate inputs
        self._validate_email(to, "to")
        for email in cc:
            self._validate_email(email, "cc")
        for email in bcc:
            self._validate_email(email, "bcc")

        if not subject and not body_text and not body_html:
            raise ValueError("Email must have subject or body")

        # Validate attachments size
        total_size = sum(len(a.get("content", "")) for a in attachments)
        if total_size > self.MAX_EMAIL_SIZE:
            raise ValueError(
                f"Attachments too large: {total_size} bytes (max {self.MAX_EMAIL_SIZE})"
            )

        # TODO: Implement rate limiting check
        # await self._check_rate_limit(context.tenant_id)

        # TODO: Send via configured provider
        # For now, return simulated success
        logger.warning(
            "EmailExecutor.execute() called - using stub implementation. "
            "Full email service integration required for production."
        )

        return {
            "success": True,
            "message_id": f"stub_{context.execution_id}",
            "to": to,
            "subject": subject,
            "note": "STUB: Email service not fully configured",
        }

    def _validate_email(self, email: str, field: str) -> None:
        """Validate email format."""
        if not email:
            raise ValueError(f"{field} is required")

        real_name, addr = parseaddr(email)
        if not addr or not self.EMAIL_REGEX.match(addr):
            raise ValueError(f"Invalid {field} email: {email}")

    async def _check_rate_limit(self, tenant_id: str) -> None:
        """Check tenant rate limit (placeholder)."""
        # TODO: Implement using Redis or in-memory counter
        pass
