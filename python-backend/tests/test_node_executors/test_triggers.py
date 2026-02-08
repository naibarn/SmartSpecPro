"""Tests for Section 04: Trigger Node Executors.

Tests manual_trigger, webhook_trigger, schedule_trigger, and queue_trigger executors.
"""
import pytest
from datetime import datetime, timezone
from unittest.mock import MagicMock

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.node_executors.trigger_executors.manual_trigger_executor import (
    ManualTriggerExecutor,
)
from app.orchestrator.node_executors.trigger_executors.webhook_trigger_executor import (
    WebhookTriggerExecutor,
)
from app.orchestrator.node_executors.trigger_executors.schedule_trigger_executor import (
    ScheduleTriggerExecutor,
)
from app.orchestrator.node_executors.trigger_executors.queue_trigger_executor import (
    QueueTriggerExecutor,
)


# ============================================================================
# Manual Trigger Tests
# ============================================================================


@pytest.mark.unit
class TestManualTriggerExecutor:
    """Tests for ManualTriggerExecutor."""

    @pytest.mark.asyncio
    async def test_manual_trigger_basic(self):
        """Manual trigger returns userId, timestamp, and params."""
        executor = ManualTriggerExecutor()

        context = ExecutionContext(
            user_id=123,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={},
        )

        data = NodeExecutionData(
            node_id="trigger-1",
            node_type="manual_trigger",
            config={},
            inputs={},
            state={},
        )

        result = await executor.execute(data, context)

        assert result["userId"] == 123
        assert "timestamp" in result
        assert result["params"] == {}

        # Verify timestamp is ISO 8601 format and timezone-aware
        timestamp = result["timestamp"]
        parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        assert parsed.tzinfo is not None

    @pytest.mark.asyncio
    async def test_manual_trigger_with_params(self):
        """Manual trigger includes trigger_params from extra_data."""
        executor = ManualTriggerExecutor()

        trigger_params = {"input1": "value1", "input2": 42}

        context = ExecutionContext(
            user_id=456,
            tenant_id="tenant-2",
            workflow_id="wf-2",
            execution_id="exec-2",
            credits_available=100.0,
            extra_data={"trigger_params": trigger_params},
        )

        data = NodeExecutionData(
            node_id="trigger-1",
            node_type="manual_trigger",
            config={},
            inputs={},
            state={},
        )

        result = await executor.execute(data, context)

        assert result["userId"] == 456
        assert result["params"] == trigger_params


# ============================================================================
# Webhook Trigger Tests
# ============================================================================


@pytest.mark.unit
class TestWebhookTriggerExecutor:
    """Tests for WebhookTriggerExecutor."""

    @pytest.mark.asyncio
    async def test_webhook_trigger_basic(self):
        """Webhook trigger returns body, headers, query, method, path."""
        executor = WebhookTriggerExecutor()

        webhook_request = {
            "method": "POST",
            "body": {"message": "Hello"},
            "headers": {"content-type": "application/json"},
            "query": {"param": "value"},
            "path": "/webhook/abc123",
        }

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={"webhook_request": webhook_request},
        )

        data = NodeExecutionData(
            node_id="webhook-1",
            node_type="webhook_trigger",
            config={},
            inputs={},
            state={},
        )

        result = await executor.execute(data, context)

        assert result["body"] == {"message": "Hello"}
        assert result["headers"]["content-type"] == "application/json"
        assert result["query"] == {"param": "value"}
        assert result["method"] == "POST"
        assert result["path"] == "/webhook/abc123"

    @pytest.mark.asyncio
    async def test_webhook_trigger_no_data_raises(self):
        """Webhook trigger raises ValueError if webhook_request is missing."""
        executor = WebhookTriggerExecutor()

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={},
        )

        data = NodeExecutionData(
            node_id="webhook-1",
            node_type="webhook_trigger",
            config={},
            inputs={},
            state={},
        )

        with pytest.raises(ValueError, match="No webhook request data provided"):
            await executor.execute(data, context)

    @pytest.mark.asyncio
    async def test_webhook_trigger_method_validation(self):
        """Webhook trigger validates method against allowedMethods config."""
        executor = WebhookTriggerExecutor()

        webhook_request = {
            "method": "DELETE",
            "body": {},
            "headers": {},
            "query": {},
            "path": "/webhook/abc",
        }

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={"webhook_request": webhook_request},
        )

        data = NodeExecutionData(
            node_id="webhook-1",
            node_type="webhook_trigger",
            config={"allowedMethods": ["GET", "POST"]},
            inputs={},
            state={},
        )

        with pytest.raises(ValueError, match="HTTP method 'DELETE' is not allowed"):
            await executor.execute(data, context)

    @pytest.mark.asyncio
    async def test_webhook_trigger_json_body_parsing(self):
        """Webhook trigger parses JSON body from string."""
        executor = WebhookTriggerExecutor()

        webhook_request = {
            "method": "POST",
            "body": '{"key": "value"}',  # JSON string
            "headers": {"content-type": "application/json"},
            "query": {},
            "path": "/webhook/abc",
        }

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={"webhook_request": webhook_request},
        )

        data = NodeExecutionData(
            node_id="webhook-1",
            node_type="webhook_trigger",
            config={},
            inputs={},
            state={},
        )

        result = await executor.execute(data, context)

        # Body should be parsed to dict
        assert result["body"] == {"key": "value"}

    @pytest.mark.asyncio
    async def test_webhook_trigger_header_redaction(self):
        """Webhook trigger redacts sensitive headers."""
        executor = WebhookTriggerExecutor()

        webhook_request = {
            "method": "POST",
            "body": {},
            "headers": {
                "authorization": "Bearer secret-token",
                "cookie": "session=abc123",
                "x-api-key": "sk-1234567890",
                "content-type": "application/json",
            },
            "query": {},
            "path": "/webhook/abc",
        }

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={"webhook_request": webhook_request},
        )

        data = NodeExecutionData(
            node_id="webhook-1",
            node_type="webhook_trigger",
            config={},
            inputs={},
            state={},
        )

        result = await executor.execute(data, context)

        # Sensitive headers should be redacted
        assert result["headers"]["authorization"] == "[REDACTED]"
        assert result["headers"]["cookie"] == "[REDACTED]"
        assert result["headers"]["x-api-key"] == "[REDACTED]"
        # Non-sensitive headers should pass through
        assert result["headers"]["content-type"] == "application/json"


# ============================================================================
# Schedule Trigger Tests
# ============================================================================


@pytest.mark.unit
class TestScheduleTriggerExecutor:
    """Tests for ScheduleTriggerExecutor."""

    @pytest.mark.asyncio
    async def test_schedule_trigger_basic(self):
        """Schedule trigger returns timestamp, cronExpression, nextRun, timezone."""
        executor = ScheduleTriggerExecutor()

        scheduled_time = datetime.now(timezone.utc).isoformat()

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={"scheduled_time": scheduled_time},
        )

        data = NodeExecutionData(
            node_id="schedule-1",
            node_type="schedule_trigger",
            config={
                "schedule": "0 9 * * 1",  # Every Monday at 9am
                "timezone": "UTC",
            },
            inputs={},
            state={},
        )

        result = await executor.execute(data, context)

        assert result["timestamp"] == scheduled_time
        assert result["cronExpression"] == "0 9 * * 1"
        assert result["timezone"] == "UTC"
        assert result["nextRun"] is not None

    @pytest.mark.asyncio
    async def test_schedule_trigger_invalid_cron(self):
        """Schedule trigger raises ValueError for invalid cron expression."""
        executor = ScheduleTriggerExecutor()

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={},
        )

        data = NodeExecutionData(
            node_id="schedule-1",
            node_type="schedule_trigger",
            config={
                "schedule": "invalid cron expression",
                "timezone": "UTC",
            },
            inputs={},
            state={},
        )

        with pytest.raises(ValueError, match="Invalid cron expression"):
            await executor.execute(data, context)

    @pytest.mark.asyncio
    async def test_schedule_trigger_next_run_calculation(self):
        """Schedule trigger calculates next run time."""
        executor = ScheduleTriggerExecutor()

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={},
        )

        data = NodeExecutionData(
            node_id="schedule-1",
            node_type="schedule_trigger",
            config={
                "schedule": "0 0 * * *",  # Daily at midnight
                "timezone": "UTC",
            },
            inputs={},
            state={},
        )

        result = await executor.execute(data, context)

        assert result["nextRun"] is not None
        # nextRun should be a valid ISO 8601 timestamp
        next_run = datetime.fromisoformat(result["nextRun"].replace("Z", "+00:00"))
        assert next_run > datetime.now(timezone.utc)


# ============================================================================
# Queue Trigger Tests
# ============================================================================


@pytest.mark.unit
class TestQueueTriggerExecutor:
    """Tests for QueueTriggerExecutor."""

    @pytest.mark.asyncio
    async def test_queue_trigger_basic(self):
        """Queue trigger returns messages, messageCount, queueName, consumedAt."""
        executor = QueueTriggerExecutor()

        queue_messages = {
            "queue_name": "my-queue",
            "messages": [
                {"id": "msg-1", "data": {"field1": "value1"}},
                {"id": "msg-2", "data": {"field2": "value2"}},
            ],
            "consumed_at": datetime.now(timezone.utc).isoformat(),
        }

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={"queue_messages": queue_messages},
        )

        data = NodeExecutionData(
            node_id="queue-1",
            node_type="queue_trigger",
            config={"queueName": "my-queue", "consumerGroup": "default"},
            inputs={},
            state={},
        )

        result = await executor.execute(data, context)

        assert result["messages"] == queue_messages["messages"]
        assert result["messageCount"] == 2
        assert result["queueName"] == "my-queue"
        assert result["consumedAt"] == queue_messages["consumed_at"]

    @pytest.mark.asyncio
    async def test_queue_trigger_no_data_raises(self):
        """Queue trigger raises ValueError if queue_messages is missing."""
        executor = QueueTriggerExecutor()

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={},
        )

        data = NodeExecutionData(
            node_id="queue-1",
            node_type="queue_trigger",
            config={"queueName": "my-queue"},
            inputs={},
            state={},
        )

        with pytest.raises(ValueError, match="No queue message data provided"):
            await executor.execute(data, context)

    @pytest.mark.asyncio
    async def test_queue_trigger_queue_name_mismatch(self):
        """Queue trigger raises ValueError if queue names don't match."""
        executor = QueueTriggerExecutor()

        queue_messages = {
            "queue_name": "actual-queue",
            "messages": [{"id": "msg-1"}],
            "consumed_at": datetime.now(timezone.utc).isoformat(),
        }

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={"queue_messages": queue_messages},
        )

        data = NodeExecutionData(
            node_id="queue-1",
            node_type="queue_trigger",
            config={"queueName": "expected-queue"},
            inputs={},
            state={},
        )

        with pytest.raises(ValueError, match="Queue name mismatch"):
            await executor.execute(data, context)

    @pytest.mark.asyncio
    async def test_queue_trigger_batch_size_limit(self):
        """Queue trigger enforces max batch size of 100."""
        executor = QueueTriggerExecutor()

        # Create 150 messages (exceeds limit)
        messages = [{"id": f"msg-{i}", "data": {}} for i in range(150)]

        queue_messages = {
            "queue_name": "my-queue",
            "messages": messages,
            "consumed_at": datetime.now(timezone.utc).isoformat(),
        }

        context = ExecutionContext(
            user_id=1,
            tenant_id="tenant-1",
            workflow_id="wf-1",
            execution_id="exec-1",
            credits_available=100.0,
            extra_data={"queue_messages": queue_messages},
        )

        data = NodeExecutionData(
            node_id="queue-1",
            node_type="queue_trigger",
            config={"queueName": "my-queue", "batchSize": 50},
            inputs={},
            state={},
        )

        result = await executor.execute(data, context)

        # Should be truncated to 100 (max_batch limit)
        assert result["messageCount"] == 100
        assert len(result["messages"]) == 100
