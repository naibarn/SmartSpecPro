"""Send Notification node executor -- multi-channel notification dispatch."""

from typing import Any

import structlog

from app.orchestrator.expression_resolver import ExpressionResolver
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

from .notification_providers.base import NotificationProvider, NotificationResult
from .notification_providers.discord_provider import DiscordProvider
from .notification_providers.email_provider import EmailProvider
from .notification_providers.slack_provider import SlackProvider
from .notification_providers.sms_provider import SMSProvider
from .notification_providers.telegram_provider import TelegramProvider

logger = structlog.get_logger()

# Provider registry -- maps notificationType config values to provider classes
PROVIDERS: dict[str, type[NotificationProvider]] = {
    "email": EmailProvider,
    "sms": SMSProvider,
    "slack": SlackProvider,
    "discord": DiscordProvider,
    "telegram": TelegramProvider,
}


class NotificationExecutor:
    """
    Executor for Send Notification workflow nodes.

    Dispatches notifications to the appropriate channel provider based on the
    notificationType configuration field. Supports template variable resolution
    via ExpressionResolver for {{nodeId.output.field}} syntax in message and
    subject fields.

    Output ports:
        - messageId (str): Provider-specific message identifier
        - status (str): "sent" | "queued" | "failed"
        - deliveryTime (float): Milliseconds taken to send
        - providerResponse (dict): Raw provider response details
    """

    def __init__(self):
        self._expression_resolver = ExpressionResolver()

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """
        Execute notification send.

        Extracts notification configuration from inputs (with config fallback),
        resolves template expressions, validates the recipient format, and
        dispatches to the appropriate provider.

        All errors are non-fatal: the node returns status="failed" in its output
        ports rather than raising an exception, so downstream nodes can react
        (e.g., a conditional branch on {{send_notification_1.status}} == "failed").

        Args:
            data: Node execution data with notification config.
            context: Execution context with workflow/execution IDs.

        Returns:
            dict with output ports: messageId, status, deliveryTime, providerResponse.
        """
        config = data.config
        inputs = data.inputs
        state = data.state

        # --- 1. Extract configuration ---
        notification_type = (
            inputs.get("notificationType") or config.get("notificationType", "email")
        ).lower()

        recipient = inputs.get("recipient") or config.get("recipient")
        subject = inputs.get("subject") or config.get("subject")
        message = inputs.get("message") or config.get("message", "")
        attachments = inputs.get("attachments") or config.get("attachments")

        # --- 2. Validate required fields ---
        if not recipient:
            return self._error_result("Recipient is required")

        if not message:
            return self._error_result("Message body is required")

        # --- 3. Resolve template expressions in message and subject ---
        if isinstance(message, str) and state:
            try:
                message = self._expression_resolver.resolve(message, state)
            except ValueError as e:
                logger.warning(
                    "notification_expression_error",
                    field="message",
                    error=str(e),
                    workflow_id=context.workflow_id,
                )
                # Continue with partially-resolved message

        if isinstance(subject, str) and state:
            try:
                subject = self._expression_resolver.resolve(subject, state)
            except ValueError as e:
                logger.warning(
                    "notification_expression_error",
                    field="subject",
                    error=str(e),
                    workflow_id=context.workflow_id,
                )
                # Continue with partially-resolved subject

        # --- 4. Resolve provider ---
        if notification_type not in PROVIDERS:
            return self._error_result(
                f"Unsupported notification type: '{notification_type}'. "
                f"Supported: {', '.join(PROVIDERS.keys())}"
            )

        provider = PROVIDERS[notification_type]()

        # --- 5. Validate recipient format ---
        recipients = [recipient] if isinstance(recipient, str) else list(recipient)
        for r in recipients:
            if not provider.validate_recipient(r):
                return self._error_result(
                    f"Invalid recipient format for {notification_type}: '{r}'"
                )

        # --- 6. Send notification ---
        logger.info(
            "notification_sending",
            notification_type=notification_type,
            recipient_count=len(recipients),
            workflow_id=context.workflow_id,
            execution_id=context.execution_id,
        )

        result: NotificationResult = await provider.send(
            recipient=recipient,
            message=message,
            subject=subject,
            attachments=attachments,
        )

        # --- 7. Log result ---
        logger.info(
            "notification_result",
            notification_type=notification_type,
            status=result.status,
            message_id=result.message_id,
            delivery_time_ms=result.delivery_time_ms,
            workflow_id=context.workflow_id,
            execution_id=context.execution_id,
            error=result.error,
        )

        # --- 8. Return output ports ---
        return {
            "messageId": result.message_id,
            "status": result.status,
            "deliveryTime": result.delivery_time_ms,
            "providerResponse": result.provider_response,
        }

    @staticmethod
    def _error_result(error_msg: str) -> dict[str, Any]:
        """Return a standardized error output for validation failures."""
        return {
            "messageId": "",
            "status": "failed",
            "deliveryTime": 0,
            "providerResponse": {"error": error_msg},
        }
