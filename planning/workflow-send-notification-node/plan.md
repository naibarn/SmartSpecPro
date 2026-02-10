# Send Notification Workflow Node -- Implementation Plan

## 1. Problem Statement

The workflow engine needs a `send_notification` node that allows workflows to send
notifications through multiple channels (Email, SMS, Slack, Discord, Telegram). This
enables workflows to notify users, teams, or external systems as part of automated
processes -- for example, sending an email when a content generation task completes,
or posting to Slack when an approval is needed.

## 2. Architecture Overview

### 2.1 Multi-Provider Strategy Pattern

The executor uses the **Strategy pattern** with a `NotificationProvider` abstract base
class. Each channel (email, SMS, Slack, Discord, Telegram) is a concrete strategy.
The executor dispatches to the correct provider based on the `notificationType` config
field.

```
NotificationExecutor
  |
  +-- resolve_provider(notificationType) -> NotificationProvider
  |
  +-- providers/
       +-- EmailProvider        (Phase 1 - production-ready)
       +-- SMSProvider          (Phase 2 - stub)
       +-- SlackProvider        (Phase 3 - stub)
       +-- DiscordProvider      (Phase 3 - stub)
       +-- TelegramProvider     (Phase 3 - stub, reuse existing bot API code)
```

### 2.2 File Layout

```
python-backend/app/orchestrator/node_executors/output_executors/
  +-- __init__.py                         (existing)
  +-- response_executor.py                (existing)
  +-- webhook_response_executor.py        (existing)
  +-- notification_executor.py            (NEW - main executor)
  +-- notification_providers/             (NEW - provider directory)
       +-- __init__.py                    (exports base + factory)
       +-- base.py                        (NotificationProvider ABC)
       +-- email_provider.py              (Phase 1 - production-ready)
       +-- sms_provider.py               (Phase 2 - Twilio stub)
       +-- slack_provider.py             (Phase 3 - webhook stub)
       +-- discord_provider.py           (Phase 3 - webhook stub)
       +-- telegram_provider.py          (Phase 3 - bot API stub)
```

### 2.3 Data Flow

```
Workflow Engine
  |
  v
NodeExecutionData (config + resolved inputs)
  |
  v
NotificationExecutor.execute()
  |-- 1. Extract & validate config
  |-- 2. Resolve template variables via ExpressionResolver
  |-- 3. Dispatch to provider via resolve_provider()
  |-- 4. Provider.send() -> NotificationResult
  |-- 5. Return output ports (messageId, status, deliveryTime, providerResponse)
  v
dict[str, Any] output ports
```

## 3. Detailed Design

### 3.1 Provider Base Class

**File:** `notification_providers/base.py`

```python
"""Base notification provider interface."""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass
class NotificationResult:
    """Result from a notification send attempt."""
    message_id: str          # Provider-specific message identifier
    status: str              # "sent" | "queued" | "failed"
    delivery_time_ms: float  # Milliseconds taken to send
    provider_response: dict  # Raw provider response
    error: str | None = None # Error message if status == "failed"


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
```

### 3.2 Email Provider (Phase 1 -- Production-Ready)

**File:** `notification_providers/email_provider.py`

Key design decisions:

1. **Reuses `app.services.email_service.EmailService`** for SMTP configuration and
   the Dramatiq background actor. Does NOT duplicate SMTP config.

2. **Adds a direct `send_and_wait()` method** that returns a message ID synchronously
   (within the workflow context we need to report status back to the node output ports).
   The existing `send_email()` fires-and-forgets via Dramatiq; the workflow executor
   needs confirmation.

3. **Two sending modes:**
   - `sync` (default for workflows): Sends directly via SMTP in a thread pool and
     returns the SMTP message-id. Uses `asyncio.to_thread()` to keep the event loop
     non-blocking.
   - `async` (optional): Delegates to Dramatiq actor, returns status `"queued"`.

4. **HTML message support:** The `message` field from the node config is treated as
   the body. If it contains HTML tags, it is sent as HTML with a plaintext fallback
   (strip tags). If it is plain text, it is wrapped in a simple HTML template.

5. **Attachment support:** Accepts attachment descriptors from the config. For Phase 1,
   supports base64-encoded content or URL references. URL attachments are fetched via
   `httpx` before composing the MIME message.

```python
"""Email notification provider -- production-ready."""
import asyncio
import re
import smtplib
import time
import uuid
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email import encoders
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
    """Send notifications via SMTP email."""

    def __init__(self):
        self.smtp_host = getattr(settings, "SMTP_HOST", "smtp.gmail.com")
        self.smtp_port = getattr(settings, "SMTP_PORT", 587)
        self.smtp_user = getattr(settings, "SMTP_USER", "")
        self.smtp_password = getattr(settings, "SMTP_PASSWORD", "")
        self.from_email = getattr(settings, "FROM_EMAIL", "noreply@smartspec.com")
        self.from_name = getattr(settings, "FROM_NAME", "SmartSpec")

    def validate_recipient(self, recipient: str) -> bool:
        return bool(EMAIL_RE.match(recipient))

    async def send(
        self,
        recipient: str | list[str],
        message: str,
        subject: str | None = None,
        attachments: list[dict] | None = None,
        extra: dict[str, Any] | None = None,
    ) -> NotificationResult:
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

        # Create message body
        body_part = MIMEMultipart("alternative")
        if is_html:
            plain_text = TAG_RE.sub("", message)
            body_part.attach(MIMEText(plain_text, "plain"))
            body_part.attach(MIMEText(message, "html"))
        else:
            body_part.attach(MIMEText(message, "plain"))
            # Wrap in simple HTML
            html_body = f"<html><body><p>{message}</p></body></html>"
            body_part.attach(MIMEText(html_body, "html"))

        msg.attach(body_part)

        # Process attachments (if any)
        if attachments:
            # ... attachment processing logic ...
            pass

        # Generate message ID
        message_id = f"<{uuid.uuid4().hex}@smartspec.workflow>"
        msg["Message-ID"] = message_id

        # Send via SMTP in thread pool
        try:
            await asyncio.to_thread(self._send_smtp, msg, recipients)
            elapsed_ms = (time.monotonic() - start_time) * 1000

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
        except smtplib.SMTPRecipientsRefused as e:
            elapsed_ms = (time.monotonic() - start_time) * 1000
            return NotificationResult(
                message_id="",
                status="failed",
                delivery_time_ms=elapsed_ms,
                provider_response={"error_detail": str(e)},
                error=f"Recipients refused: {str(e)}",
            )
        except smtplib.SMTPException as e:
            elapsed_ms = (time.monotonic() - start_time) * 1000
            return NotificationResult(
                message_id="",
                status="failed",
                delivery_time_ms=elapsed_ms,
                provider_response={"error_detail": str(e)},
                error=f"SMTP error: {str(e)}",
            )
        except Exception as e:
            elapsed_ms = (time.monotonic() - start_time) * 1000
            logger.error("email_send_error", error=str(e))
            return NotificationResult(
                message_id="",
                status="failed",
                delivery_time_ms=elapsed_ms,
                provider_response={"error_detail": str(e)},
                error=f"Unexpected error: {str(e)}",
            )

    def _send_smtp(self, msg: MIMEMultipart, recipients: list[str]) -> None:
        """Blocking SMTP send (runs in thread pool)."""
        with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
            server.starttls()
            if self.smtp_user and self.smtp_password:
                server.login(self.smtp_user, self.smtp_password)
            server.sendmail(self.from_email, recipients, msg.as_string())
```

### 3.3 Stub Providers (Phase 2-3)

Each stub returns a `NotificationResult` with `status="sent"` and a note indicating
it is a placeholder. The stubs validate recipient format correctly so tests can
exercise the validation path.

**SMS Provider stub (`sms_provider.py`):**
- Validates phone number format: `+` followed by 10-15 digits
- Returns placeholder result with `provider="twilio_stub"`
- TODO comment for Twilio `client.messages.create()` integration

**Slack Provider stub (`slack_provider.py`):**
- Validates webhook URL format: `https://hooks.slack.com/services/...`
- Returns placeholder result with `provider="slack_webhook_stub"`
- TODO comment for `httpx.AsyncClient.post()` to webhook URL

**Discord Provider stub (`discord_provider.py`):**
- Validates webhook URL format: `https://discord.com/api/webhooks/...`
- Returns placeholder result with `provider="discord_webhook_stub"`
- TODO comment for `httpx.AsyncClient.post()` to webhook URL

**Telegram Provider stub (`telegram_provider.py`):**
- Validates chat_id format: numeric string or `@channel_name`
- Reuses the `send_telegram_message()` function from
  `app.api.telegram_webhook` for the actual API call shape
- Returns placeholder result with `provider="telegram_bot_stub"`
- TODO comment referencing the existing `get_bot_token()` + `send_telegram_message()`

### 3.4 Main Executor

**File:** `notification_executor.py`

```python
"""Send Notification node executor -- multi-channel notification dispatch."""
import time
from typing import Any

import structlog

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.expression_resolver import ExpressionResolver
from .notification_providers.base import NotificationResult
from .notification_providers.email_provider import EmailProvider
from .notification_providers.sms_provider import SMSProvider
from .notification_providers.slack_provider import SlackProvider
from .notification_providers.discord_provider import DiscordProvider
from .notification_providers.telegram_provider import TelegramProvider

logger = structlog.get_logger()

# Provider registry
PROVIDERS = {
    "email": EmailProvider,
    "sms": SMSProvider,
    "slack": SlackProvider,
    "discord": DiscordProvider,
    "telegram": TelegramProvider,
}


class NotificationExecutor:
    """
    Executor for Send Notification workflow nodes.

    Dispatches notifications to the appropriate channel provider
    based on the notificationType configuration field.
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

        Args:
            data: Node execution data with notification config.
            context: Execution context.

        Returns:
            dict with output ports:
                - messageId (str): Provider message ID
                - status (str): "sent" | "queued" | "failed"
                - deliveryTime (float): Milliseconds
                - providerResponse (dict): Raw provider response
        """
        config = data.config
        inputs = data.inputs
        state = data.state

        # --- 1. Extract configuration ---
        notification_type = (
            inputs.get("notificationType")
            or config.get("notificationType", "email")
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

        # --- 3. Resolve template expressions in message ---
        if isinstance(message, str):
            message = self._expression_resolver.resolve(message, state)

        if isinstance(subject, str):
            subject = self._expression_resolver.resolve(subject, state)

        # --- 4. Resolve provider ---
        if notification_type not in PROVIDERS:
            return self._error_result(
                f"Unsupported notification type: '{notification_type}'. "
                f"Supported: {', '.join(PROVIDERS.keys())}"
            )

        provider = PROVIDERS[notification_type]()

        # --- 5. Validate recipient format ---
        recipients = (
            [recipient] if isinstance(recipient, str) else list(recipient)
        )
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
        """Return a standardized error output."""
        return {
            "messageId": "",
            "status": "failed",
            "deliveryTime": 0,
            "providerResponse": {"error": error_msg},
        }
```

### 3.5 Node Registry Spec

Added to `_register_core_nodes()` in `node_registry.py`:

```python
# Send Notification Node
self.register_node_type(
    NodeTypeSpec(
        type="send_notification",
        display_name="Send Notification",
        description="Send notifications via Email, SMS, Slack, Discord, or Telegram",
        icon="bell",
        color="indigo",
        category="outputs",
        inputs=[
            InputSpec(
                name="notificationType",
                display_name="Channel",
                data_type="text",
                ui_type="select",
                required=True,
                accepts_connection=False,
                default="email",
                options=[
                    {"label": "Email", "value": "email"},
                    {"label": "SMS", "value": "sms"},
                    {"label": "Slack", "value": "slack"},
                    {"label": "Discord", "value": "discord"},
                    {"label": "Telegram", "value": "telegram"},
                ],
            ),
            InputSpec(
                name="recipient",
                display_name="Recipient",
                data_type="text",
                ui_type="text",
                required=True,
                accepts_connection=True,
                placeholder="Email, phone, webhook URL, or chat ID...",
            ),
            InputSpec(
                name="subject",
                display_name="Subject",
                data_type="text",
                ui_type="text",
                required=False,
                accepts_connection=True,
                placeholder="Email subject line (email only)...",
            ),
            InputSpec(
                name="message",
                display_name="Message",
                data_type="text",
                ui_type="textarea",
                required=True,
                accepts_connection=True,
                placeholder="Notification message. Use {{nodeId.output}} for dynamic values...",
            ),
            InputSpec(
                name="attachments",
                display_name="Attachments",
                data_type="array",
                ui_type="json_editor",
                required=False,
                accepts_connection=True,
                placeholder='[{"filename": "report.pdf", "url": "https://..."}]',
            ),
        ],
        outputs=[
            OutputSpec(name="messageId", display_name="Message ID", data_type="text"),
            OutputSpec(name="status", display_name="Status", data_type="text"),
            OutputSpec(name="deliveryTime", display_name="Delivery Time (ms)", data_type="number"),
            OutputSpec(name="providerResponse", display_name="Provider Response", data_type="json"),
        ],
        executor="app.orchestrator.node_executors.output_executors.notification_executor.NotificationExecutor",
    )
)
```

### 3.6 Template Variable Interpolation Strategy

The executor uses the existing `ExpressionResolver` class from
`app.orchestrator.expression_resolver` for all `{{variable}}` resolution.

**How it works:**

1. The `message` and `subject` fields support `{{nodeId.outputPort.field}}` syntax.
2. Before sending, the executor calls `ExpressionResolver.resolve(text, state)` where
   `state` is `data.state` (the accumulated outputs from all previously-executed nodes).
3. The resolver already handles:
   - Safe character validation (alphanumeric, underscores, hyphens, dots only)
   - Depth limiting (max 10 dot-separated parts)
   - Expression count limiting (max 50 per text block)
   - Graceful fallback (unresolved expressions remain as `{{...}}`)

**Example:**
```
Message: "Hello {{form_1.values.name}}, your report is ready: {{llm_1.response}}"
State: {
  "form_1": {"values": {"name": "Alice"}},
  "llm_1": {"response": "Q3 revenue increased 15%"}
}
Result: "Hello Alice, your report is ready: Q3 revenue increased 15%"
```

No additional template engine is needed. The existing resolver covers all requirements.

## 4. Frontend Integration Notes

The frontend does NOT need any code changes. The `useNodeRegistry` hook fetches all
node types from the backend API, and the `DynamicNodeConfig` component renders inputs
dynamically based on the `InputSpec` definitions. Adding the registry entry on the
backend is sufficient for the node to appear in the workflow editor.

However, there are two UX considerations for a future enhancement (not in this plan):

1. **Conditional field visibility:** The `subject` and `attachments` fields only apply
   to email. A future `visible_when` field on `InputSpec` could hide them for other
   notification types. For now, they simply have no effect when using non-email channels.

2. **Recipient placeholder text:** The placeholder says "Email, phone, webhook URL,
   or chat ID..." which is correct but generic. A future `placeholder_per_option` map
   on `InputSpec` could show channel-specific hints.

## 5. Configuration Variables

### 5.1 Existing Settings (No Changes Needed for Phase 1)

The email provider reuses settings already defined in `app.core.config.Settings`:

| Setting | Source | Used By |
|---------|--------|---------|
| `SMTP_HOST` | `settings` (getattr with default) | EmailProvider |
| `SMTP_PORT` | `settings` (getattr with default) | EmailProvider |
| `SMTP_USER` | `settings` (getattr with default) | EmailProvider |
| `SMTP_PASSWORD` | `settings` (getattr with default) | EmailProvider |
| `FROM_EMAIL` | `settings` (getattr with default) | EmailProvider |
| `FROM_NAME` | `settings` (getattr with default) | EmailProvider |

### 5.2 Future Settings (Phase 2-3, Not Added Yet)

These will be needed when stubs become production implementations:

| Setting | Provider | Format |
|---------|----------|--------|
| `TWILIO_ACCOUNT_SID` | SMS | String |
| `TWILIO_AUTH_TOKEN` | SMS | String (encrypted) |
| `TWILIO_FROM_NUMBER` | SMS | `+1234567890` |
| `SLACK_DEFAULT_WEBHOOK_URL` | Slack | URL (optional system-wide default) |
| `DISCORD_DEFAULT_WEBHOOK_URL` | Discord | URL (optional system-wide default) |

Telegram already has `bot_token` stored in `system_settings` table (encrypted),
accessible via `get_bot_token()` in `app.api.telegram_webhook`.

## 6. Error Handling Matrix

| Error Scenario | Detection | Response |
|---|---|---|
| Missing recipient | `not recipient` check | Return `status="failed"`, error message |
| Missing message | `not message` check | Return `status="failed"`, error message |
| Invalid recipient format | `provider.validate_recipient()` returns False | Return `status="failed"`, format hint |
| Unsupported notification type | `notification_type not in PROVIDERS` | Return `status="failed"`, list supported types |
| SMTP connection failure | `smtplib.SMTPException` caught | Return `status="failed"`, SMTP error detail |
| SMTP auth failure | `smtplib.SMTPAuthenticationError` caught | Return `status="failed"`, auth error |
| Recipient refused | `smtplib.SMTPRecipientsRefused` caught | Return `status="failed"`, refused recipients list |
| Attachment too large | Size check > 25MB per file | Return `status="failed"`, size limit message |
| Expression resolution failure | `ExpressionResolver` raises ValueError | Caught, unresolved expr remains as `{{...}}` |
| Provider API timeout | `httpx.TimeoutException` (future providers) | Return `status="failed"`, timeout message |
| Rate limiting | Provider returns 429 | Return `status="failed"`, retry-after hint |
| Missing SMTP credentials | Empty `smtp_user` or `smtp_password` | SMTP proceeds without auth (may fail at server level) |

All errors are non-fatal to the workflow. The node returns `status="failed"` in its
output ports rather than raising an exception, so downstream nodes can react
(e.g., a conditional branch on `{{send_notification_1.status}}` == "failed").

## 7. Testing Strategy

### 7.1 Unit Tests

**File:** `python-backend/tests/test_notification_executor.py`

```python
"""Tests for send_notification workflow node executor."""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.node_executors.output_executors.notification_executor import (
    NotificationExecutor,
)
from app.orchestrator.node_executors.output_executors.notification_providers.base import (
    NotificationResult,
)


@pytest.fixture
def executor():
    return NotificationExecutor()


@pytest.fixture
def context():
    return ExecutionContext(
        user_id=1,
        tenant_id="test-tenant",
        workflow_id="wf-123",
        execution_id="exec-456",
    )


def make_data(config=None, inputs=None, state=None):
    return NodeExecutionData(
        node_id="notif_1",
        node_type="send_notification",
        config=config or {},
        inputs=inputs or {},
        state=state or {},
    )


# --- Validation Tests ---

class TestValidation:
    async def test_missing_recipient_returns_failed(self, executor, context):
        data = make_data(inputs={"message": "Hello"})
        result = await executor.execute(data, context)
        assert result["status"] == "failed"
        assert "Recipient" in result["providerResponse"]["error"]

    async def test_missing_message_returns_failed(self, executor, context):
        data = make_data(inputs={"recipient": "user@example.com"})
        result = await executor.execute(data, context)
        assert result["status"] == "failed"
        assert "Message" in result["providerResponse"]["error"]

    async def test_invalid_email_format_returns_failed(self, executor, context):
        data = make_data(inputs={
            "notificationType": "email",
            "recipient": "not-an-email",
            "message": "Hello",
        })
        result = await executor.execute(data, context)
        assert result["status"] == "failed"
        assert "Invalid recipient" in result["providerResponse"]["error"]

    async def test_unsupported_notification_type_returns_failed(self, executor, context):
        data = make_data(inputs={
            "notificationType": "fax",
            "recipient": "12345",
            "message": "Hello",
        })
        result = await executor.execute(data, context)
        assert result["status"] == "failed"
        assert "Unsupported" in result["providerResponse"]["error"]


# --- Template Resolution Tests ---

class TestTemplateResolution:
    async def test_resolves_message_variables(self, executor, context):
        data = make_data(
            inputs={
                "notificationType": "email",
                "recipient": "user@example.com",
                "message": "Hello {{form_1.values.name}}",
                "subject": "Report for {{form_1.values.name}}",
            },
            state={
                "form_1": {"values": {"name": "Alice"}}
            },
        )
        # Mock the email provider to capture the resolved message
        with patch(
            "...email_provider.EmailProvider.send",
            new_callable=AsyncMock,
        ) as mock_send:
            mock_send.return_value = NotificationResult(
                message_id="test-id",
                status="sent",
                delivery_time_ms=100,
                provider_response={},
            )
            result = await executor.execute(data, context)
            call_args = mock_send.call_args
            assert "Alice" in call_args.kwargs["message"]
            assert "Alice" in call_args.kwargs["subject"]


# --- Email Provider Tests ---

class TestEmailProvider:
    async def test_successful_send(self, executor, context):
        data = make_data(inputs={
            "notificationType": "email",
            "recipient": "user@example.com",
            "message": "Test notification",
            "subject": "Test Subject",
        })
        with patch("smtplib.SMTP") as mock_smtp:
            mock_instance = MagicMock()
            mock_smtp.return_value.__enter__ = MagicMock(return_value=mock_instance)
            mock_smtp.return_value.__exit__ = MagicMock(return_value=False)

            result = await executor.execute(data, context)
            assert result["status"] == "sent"
            assert result["messageId"] != ""
            assert result["deliveryTime"] > 0

    async def test_multiple_recipients(self, executor, context):
        data = make_data(inputs={
            "notificationType": "email",
            "recipient": ["a@example.com", "b@example.com"],
            "message": "Group notification",
        })
        with patch("smtplib.SMTP") as mock_smtp:
            mock_instance = MagicMock()
            mock_smtp.return_value.__enter__ = MagicMock(return_value=mock_instance)
            mock_smtp.return_value.__exit__ = MagicMock(return_value=False)

            result = await executor.execute(data, context)
            assert result["status"] == "sent"


# --- Stub Provider Tests ---

class TestStubProviders:
    async def test_sms_stub_returns_sent(self, executor, context):
        data = make_data(inputs={
            "notificationType": "sms",
            "recipient": "+1234567890",
            "message": "Test SMS",
        })
        result = await executor.execute(data, context)
        assert result["status"] == "sent"

    async def test_slack_stub_returns_sent(self, executor, context):
        data = make_data(inputs={
            "notificationType": "slack",
            "recipient": "https://hooks.slack.com/services/T00/B00/xxx",
            "message": "Test Slack",
        })
        result = await executor.execute(data, context)
        assert result["status"] == "sent"

    async def test_discord_stub_returns_sent(self, executor, context):
        data = make_data(inputs={
            "notificationType": "discord",
            "recipient": "https://discord.com/api/webhooks/123/abc",
            "message": "Test Discord",
        })
        result = await executor.execute(data, context)
        assert result["status"] == "sent"

    async def test_telegram_stub_returns_sent(self, executor, context):
        data = make_data(inputs={
            "notificationType": "telegram",
            "recipient": "123456789",
            "message": "Test Telegram",
        })
        result = await executor.execute(data, context)
        assert result["status"] == "sent"
```

### 7.2 Test Coverage Targets

| Component | Min Coverage |
|-----------|-------------|
| `notification_executor.py` | 90% |
| `notification_providers/base.py` | 100% (abstract, just types) |
| `notification_providers/email_provider.py` | 85% |
| `notification_providers/sms_provider.py` | 100% (stub) |
| `notification_providers/slack_provider.py` | 100% (stub) |
| `notification_providers/discord_provider.py` | 100% (stub) |
| `notification_providers/telegram_provider.py` | 100% (stub) |

## 8. Implementation Steps (Ordered)

### Step 1: Create provider base class and directory structure
- [ ] Create `notification_providers/` directory under `output_executors/`
- [ ] Create `notification_providers/__init__.py`
- [ ] Create `notification_providers/base.py` with `NotificationProvider` ABC and `NotificationResult`

### Step 2: Implement EmailProvider (production-ready)
- [ ] Create `notification_providers/email_provider.py`
- [ ] Reuse SMTP settings from `app.core.config.settings`
- [ ] Implement `validate_recipient()` with RFC 5322 simplified regex
- [ ] Implement `send()` with `asyncio.to_thread()` for non-blocking SMTP
- [ ] Handle HTML detection and plaintext fallback
- [ ] Add attachment support (base64 content or URL reference)
- [ ] Structured logging with structlog

### Step 3: Create stub providers
- [ ] Create `sms_provider.py` with phone number validation + placeholder result
- [ ] Create `slack_provider.py` with webhook URL validation + placeholder result
- [ ] Create `discord_provider.py` with webhook URL validation + placeholder result
- [ ] Create `telegram_provider.py` with chat_id validation + placeholder result

### Step 4: Implement NotificationExecutor
- [ ] Create `notification_executor.py` in `output_executors/`
- [ ] Wire up provider dispatch via `PROVIDERS` dict
- [ ] Integrate `ExpressionResolver` for `{{variable}}` resolution in message + subject
- [ ] Implement input validation (recipient, message required)
- [ ] Map `NotificationResult` to output port dict
- [ ] Add structured logging for send attempts and results

### Step 5: Register in NodeRegistry
- [ ] Add `send_notification` `NodeTypeSpec` to `_register_core_nodes()` in `node_registry.py`
- [ ] Verify the executor dotpath is correct
- [ ] Verify the node appears in `GET /api/v1/workflows/node-types` response

### Step 6: Write tests
- [ ] Create `tests/test_notification_executor.py`
- [ ] Test validation (missing recipient, missing message, invalid format)
- [ ] Test template variable resolution
- [ ] Test email send with mocked SMTP
- [ ] Test all stub providers return correct status
- [ ] Test error handling (SMTP failure, unsupported type)
- [ ] Verify coverage meets 80% threshold

### Step 7: Verify end-to-end
- [ ] Start dev server, confirm node appears in workflow editor
- [ ] Create a test workflow with the notification node
- [ ] Test email send with actual SMTP (manual verification)
- [ ] Run full test suite: `pytest` (ensure no regressions)

## 9. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| SMTP credentials not configured | Medium | Graceful error: return `status="failed"` with clear message |
| Blocking SMTP call | Low | `asyncio.to_thread()` prevents event loop blocking |
| Email not delivered (spam filter) | Low | Outside scope; provider response gives SMTP status |
| Expression resolver edge case | Low | Existing resolver is battle-tested with limits |
| Stub providers called in production | Low | Stubs return `status="sent"` with `note` field indicating placeholder |
| Large attachment blocking thread | Medium | Size validation before send; 25MB per-file and 50MB total cap |
| Node type name collision | None | `send_notification` is unique, verified against registry |

## 10. Future Enhancements (Out of Scope)

1. **Conditional field visibility** in the UI based on `notificationType` selection
2. **SendGrid provider** as alternative to SMTP for high-volume email
3. **Production Twilio integration** for SMS
4. **Retry logic** with exponential backoff for transient failures
5. **Delivery status webhooks** for async delivery confirmation
6. **Notification templates** stored in database, selectable by template ID
7. **Rate limiting** per-tenant per-channel to prevent abuse
8. **Batch sending** optimization for bulk notifications within a loop node
