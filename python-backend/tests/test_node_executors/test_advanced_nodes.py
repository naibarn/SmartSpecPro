"""Tests for Phase 2.3 & 2.4: Advanced Trigger and Flow Control Node Executors.

Tests event_trigger, file_upload_trigger, error_trigger, switch, wait, and webhook_response.
"""
import pytest
import asyncio
from datetime import datetime, timezone
from unittest.mock import MagicMock

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.node_executors.trigger_executors.event_trigger_executor import (
    EventTriggerExecutor,
)
from app.orchestrator.node_executors.trigger_executors.file_upload_trigger_executor import (
    FileUploadTriggerExecutor,
)
from app.orchestrator.node_executors.trigger_executors.error_trigger_executor import (
    ErrorTriggerExecutor,
)
from app.orchestrator.node_executors.flow_executors.switch_executor import (
    SwitchExecutor,
)
from app.orchestrator.node_executors.flow_executors.wait_executor import (
    WaitExecutor,
)
from app.orchestrator.node_executors.output_executors.webhook_response_executor import (
    WebhookResponseExecutor,
)


# ============================================================================
# Event Trigger Tests (Phase 2.3)
# ============================================================================


@pytest.mark.unit
class TestEventTriggerExecutor:
    """Tests for EventTriggerExecutor."""

    @pytest.mark.asyncio
    async def test_event_trigger_basic(self):
        """Event trigger returns event data and type."""
        executor = EventTriggerExecutor()

        trigger_event = {
            "type": "user.created",
            "data": {"userId": 123, "email": "test@example.com"},
        }

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={"trigger_event": trigger_event},
        )

        data = NodeExecutionData(
            node_id="event-1",
            node_type="event_trigger",
            config={"eventType": "user.created"},
            inputs={},
            state={},
        )

        result = await executor.execute(data, context)

        assert result["event"] == trigger_event["data"]
        assert result["eventType"] == "user.created"

    @pytest.mark.asyncio
    async def test_event_trigger_no_data_raises(self):
        """Event trigger raises ValueError if trigger_event is missing."""
        executor = EventTriggerExecutor()

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={},
        )

        data = NodeExecutionData(
            node_id="event-1",
            node_type="event_trigger",
            config={},
            inputs={},
            state={},
        )

        with pytest.raises(ValueError, match="No event data provided"):
            await executor.execute(data, context)

    @pytest.mark.asyncio
    async def test_event_trigger_type_mismatch_raises(self):
        """Event trigger raises ValueError if event type doesn't match config."""
        executor = EventTriggerExecutor()

        trigger_event = {
            "type": "user.updated",
            "data": {"userId": 123},
        }

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={"trigger_event": trigger_event},
        )

        data = NodeExecutionData(
            node_id="event-1",
            node_type="event_trigger",
            config={"eventType": "user.created"},  # Expecting different type
            inputs={},
            state={},
        )

        with pytest.raises(ValueError, match="Event type mismatch"):
            await executor.execute(data, context)

    @pytest.mark.asyncio
    async def test_event_trigger_with_filter(self):
        """Event trigger applies filter from config."""
        executor = EventTriggerExecutor()

        trigger_event = {
            "type": "skill.completed",
            "data": {"skillId": "enhance-prompt", "status": "success"},
        }

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={"trigger_event": trigger_event},
        )

        data = NodeExecutionData(
            node_id="event-1",
            node_type="event_trigger",
            config={
                "eventType": "skill.completed",
                "filter": {"status": "success"},
            },
            inputs={},
            state={},
        )

        result = await executor.execute(data, context)
        assert result["event"]["status"] == "success"

    @pytest.mark.asyncio
    async def test_event_trigger_filter_mismatch_raises(self):
        """Event trigger raises ValueError if filter doesn't match."""
        executor = EventTriggerExecutor()

        trigger_event = {
            "type": "skill.completed",
            "data": {"skillId": "enhance-prompt", "status": "failed"},
        }

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={"trigger_event": trigger_event},
        )

        data = NodeExecutionData(
            node_id="event-1",
            node_type="event_trigger",
            config={
                "eventType": "skill.completed",
                "filter": {"status": "success"},  # Expecting success
            },
            inputs={},
            state={},
        )

        with pytest.raises(ValueError, match="Event filtered out"):
            await executor.execute(data, context)


# ============================================================================
# File Upload Trigger Tests (Phase 2.3)
# ============================================================================


@pytest.mark.unit
class TestFileUploadTriggerExecutor:
    """Tests for FileUploadTriggerExecutor."""

    @pytest.mark.asyncio
    async def test_file_upload_trigger_basic(self):
        """File upload trigger returns file info."""
        executor = FileUploadTriggerExecutor()

        uploaded_file = {
            "fileUrl": "https://example.com/file.pdf",
            "fileName": "document.pdf",
            "fileSize": 1024 * 1024,  # 1 MB
            "mimeType": "application/pdf",
        }

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={"uploaded_file": uploaded_file},
        )

        data = NodeExecutionData(
            node_id="file-1",
            node_type="file_upload_trigger",
            config={},
            inputs={},
            state={},
        )

        result = await executor.execute(data, context)

        assert result["fileUrl"] == uploaded_file["fileUrl"]
        assert result["fileName"] == uploaded_file["fileName"]
        assert result["fileSize"] == uploaded_file["fileSize"]
        assert result["mimeType"] == uploaded_file["mimeType"]

    @pytest.mark.asyncio
    async def test_file_upload_trigger_size_limit(self):
        """File upload trigger validates file size against maxSize config."""
        executor = FileUploadTriggerExecutor()

        uploaded_file = {
            "fileUrl": "https://example.com/large.pdf",
            "fileName": "large.pdf",
            "fileSize": 20 * 1024 * 1024,  # 20 MB
            "mimeType": "application/pdf",
        }

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={"uploaded_file": uploaded_file},
        )

        data = NodeExecutionData(
            node_id="file-1",
            node_type="file_upload_trigger",
            config={},
            inputs={"maxSize": 10},  # Max 10 MB
            state={},
        )

        with pytest.raises(ValueError, match="File size.*exceeds maximum"):
            await executor.execute(data, context)

    @pytest.mark.asyncio
    async def test_file_upload_trigger_type_validation_exact(self):
        """File upload trigger validates file type (exact match)."""
        executor = FileUploadTriggerExecutor()

        uploaded_file = {
            "fileUrl": "https://example.com/image.jpg",
            "fileName": "image.jpg",
            "fileSize": 1024,
            "mimeType": "image/jpeg",
        }

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={"uploaded_file": uploaded_file},
        )

        data = NodeExecutionData(
            node_id="file-1",
            node_type="file_upload_trigger",
            config={},
            inputs={"acceptedTypes": ["image/jpeg", "image/png"]},
            state={},
        )

        result = await executor.execute(data, context)
        assert result["mimeType"] == "image/jpeg"

    @pytest.mark.asyncio
    async def test_file_upload_trigger_type_validation_wildcard(self):
        """File upload trigger validates file type (wildcard match)."""
        executor = FileUploadTriggerExecutor()

        uploaded_file = {
            "fileUrl": "https://example.com/image.png",
            "fileName": "image.png",
            "fileSize": 1024,
            "mimeType": "image/png",
        }

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={"uploaded_file": uploaded_file},
        )

        data = NodeExecutionData(
            node_id="file-1",
            node_type="file_upload_trigger",
            config={},
            inputs={"acceptedTypes": ["image/*"]},  # Accept all images
            state={},
        )

        result = await executor.execute(data, context)
        assert result["mimeType"] == "image/png"

    @pytest.mark.asyncio
    async def test_file_upload_trigger_type_rejection(self):
        """File upload trigger rejects non-accepted file types."""
        executor = FileUploadTriggerExecutor()

        uploaded_file = {
            "fileUrl": "https://example.com/document.pdf",
            "fileName": "document.pdf",
            "fileSize": 1024,
            "mimeType": "application/pdf",
        }

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={"uploaded_file": uploaded_file},
        )

        data = NodeExecutionData(
            node_id="file-1",
            node_type="file_upload_trigger",
            config={},
            inputs={"acceptedTypes": ["image/*"]},  # Only images
            state={},
        )

        with pytest.raises(ValueError, match="File type.*is not in accepted types"):
            await executor.execute(data, context)


# ============================================================================
# Error Trigger Tests (Phase 2.4)
# ============================================================================


@pytest.mark.unit
class TestErrorTriggerExecutor:
    """Tests for ErrorTriggerExecutor."""

    @pytest.mark.asyncio
    async def test_error_trigger_basic(self):
        """Error trigger returns error details."""
        executor = ErrorTriggerExecutor()

        trigger_error = {
            "error": {
                "message": "Workflow failed",
                "type": "execution_error",
                "node_id": "node-5",
            },
            "workflowId": "wf-abc123",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={"trigger_error": trigger_error},
        )

        data = NodeExecutionData(
            node_id="error-1",
            node_type="error_trigger",
            config={},
            inputs={},
            state={},
        )

        result = await executor.execute(data, context)

        assert result["error"] == trigger_error["error"]
        assert result["workflowId"] == "wf-abc123"
        assert result["timestamp"] == trigger_error["timestamp"]

    @pytest.mark.asyncio
    async def test_error_trigger_no_data_raises(self):
        """Error trigger raises ValueError if trigger_error is missing."""
        executor = ErrorTriggerExecutor()

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={},
        )

        data = NodeExecutionData(
            node_id="error-1",
            node_type="error_trigger",
            config={},
            inputs={},
            state={},
        )

        with pytest.raises(ValueError, match="No error data provided"):
            await executor.execute(data, context)

    @pytest.mark.asyncio
    async def test_error_trigger_workflow_id_validation(self):
        """Error trigger validates workflow ID against watchWorkflow config."""
        executor = ErrorTriggerExecutor()

        trigger_error = {
            "error": {"message": "Workflow failed", "type": "execution_error"},
            "workflowId": "wf-different",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={"trigger_error": trigger_error},
        )

        data = NodeExecutionData(
            node_id="error-1",
            node_type="error_trigger",
            config={"watchWorkflow": "wf-expected"},  # Expecting specific workflow
            inputs={},
            state={},
        )

        with pytest.raises(ValueError, match="Workflow ID mismatch"):
            await executor.execute(data, context)

    @pytest.mark.asyncio
    async def test_error_trigger_error_type_filtering(self):
        """Error trigger filters by error type."""
        executor = ErrorTriggerExecutor()

        trigger_error = {
            "error": {"message": "Timeout", "type": "timeout"},
            "workflowId": "wf-1",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={"trigger_error": trigger_error},
        )

        data = NodeExecutionData(
            node_id="error-1",
            node_type="error_trigger",
            config={"errorTypes": ["validation"]},  # Only validation errors
            inputs={},
            state={},
        )

        with pytest.raises(ValueError, match="Error type.*is not in configured types"):
            await executor.execute(data, context)


# ============================================================================
# Switch Executor Tests (Phase 2.4)
# ============================================================================


@pytest.mark.unit
class TestSwitchExecutor:
    """Tests for SwitchExecutor."""

    @pytest.mark.asyncio
    async def test_switch_executor_exact_match(self):
        """Switch executor matches value to case."""
        executor = SwitchExecutor()

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={},
        )

        data = NodeExecutionData(
            node_id="switch-1",
            node_type="switch",
            config={},
            inputs={
                "value": "option-b",
                "cases": [
                    {"match": "option-a", "label": "Case A"},
                    {"match": "option-b", "label": "Case B"},
                    {"match": "option-c", "label": "Case C"},
                ],
                "defaultCase": "default",
            },
            state={},
        )

        result = await executor.execute(data, context)

        assert result["matched"] == "Case B"
        assert result["value"] == "option-b"
        assert context.extra_data["switch_matched_case"] == "Case B"

    @pytest.mark.asyncio
    async def test_switch_executor_default_case(self):
        """Switch executor returns default case when no match."""
        executor = SwitchExecutor()

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={},
        )

        data = NodeExecutionData(
            node_id="switch-1",
            node_type="switch",
            config={},
            inputs={
                "value": "option-z",  # Not in cases
                "cases": [
                    {"match": "option-a", "label": "Case A"},
                    {"match": "option-b", "label": "Case B"},
                ],
                "defaultCase": "default-case",
            },
            state={},
        )

        result = await executor.execute(data, context)

        assert result["matched"] == "default-case"
        assert result["value"] == "option-z"


# ============================================================================
# Wait Executor Tests (Phase 2.4)
# ============================================================================


@pytest.mark.unit
class TestWaitExecutor:
    """Tests for WaitExecutor."""

    @pytest.mark.asyncio
    async def test_wait_executor_seconds(self):
        """Wait executor pauses for specified seconds."""
        executor = WaitExecutor()

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={},
        )

        data = NodeExecutionData(
            node_id="wait-1",
            node_type="wait",
            config={},
            inputs={"duration": 0.1, "unit": "seconds"},  # Very short wait for testing
            state={},
        )

        start = asyncio.get_event_loop().time()
        result = await executor.execute(data, context)
        elapsed = asyncio.get_event_loop().time() - start

        assert elapsed >= 0.1
        assert "resumedAt" in result

    @pytest.mark.asyncio
    async def test_wait_executor_invalid_duration_raises(self):
        """Wait executor raises ValueError for invalid duration."""
        executor = WaitExecutor()

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={},
        )

        data = NodeExecutionData(
            node_id="wait-1",
            node_type="wait",
            config={},
            inputs={"duration": -5, "unit": "seconds"},  # Negative duration
            state={},
        )

        with pytest.raises(ValueError, match="Invalid duration"):
            await executor.execute(data, context)

    @pytest.mark.asyncio
    async def test_wait_executor_max_duration_exceeded(self):
        """Wait executor raises ValueError if duration exceeds 7 days."""
        executor = WaitExecutor()

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={},
        )

        data = NodeExecutionData(
            node_id="wait-1",
            node_type="wait",
            config={},
            inputs={"duration": 10, "unit": "days"},  # 10 days > 7 days max
            state={},
        )

        with pytest.raises(ValueError, match="exceeds maximum allowed"):
            await executor.execute(data, context)


# ============================================================================
# Webhook Response Executor Tests (Phase 2.4)
# ============================================================================


@pytest.mark.unit
class TestWebhookResponseExecutor:
    """Tests for WebhookResponseExecutor."""

    @pytest.mark.asyncio
    async def test_webhook_response_basic(self):
        """Webhook response stores response in context."""
        executor = WebhookResponseExecutor()

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={},
        )

        data = NodeExecutionData(
            node_id="response-1",
            node_type="webhook_response",
            config={},
            inputs={
                "statusCode": 200,
                "body": {"message": "Success"},
                "headers": {"Content-Type": "application/json"},
            },
            state={},
        )

        result = await executor.execute(data, context)

        # Terminal node returns empty dict
        assert result == {}

        # Check webhook_response stored in context
        assert "webhook_response" in context.extra_data
        webhook_response = context.extra_data["webhook_response"]
        assert webhook_response["statusCode"] == 200
        assert webhook_response["body"] == {"message": "Success"}
        assert webhook_response["headers"] == {"Content-Type": "application/json"}

    @pytest.mark.asyncio
    async def test_webhook_response_invalid_status_code(self):
        """Webhook response defaults to 200 for invalid status code."""
        executor = WebhookResponseExecutor()

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={},
        )

        data = NodeExecutionData(
            node_id="response-1",
            node_type="webhook_response",
            config={},
            inputs={
                "statusCode": 999,  # Invalid status code
                "body": {"message": "Test"},
            },
            state={},
        )

        await executor.execute(data, context)

        # Should default to 200
        assert context.extra_data["webhook_response"]["statusCode"] == 200
