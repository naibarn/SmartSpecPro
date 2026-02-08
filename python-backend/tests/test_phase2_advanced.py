"""Tests for Phase 2.3 & 2.4 workflow nodes (Advanced Triggers & Flow Control)."""
import pytest

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.node_executors.flow_executors.switch_executor import SwitchExecutor
from app.orchestrator.node_executors.flow_executors.wait_executor import WaitExecutor
from app.orchestrator.node_executors.output_executors.webhook_response_executor import (
    WebhookResponseExecutor,
)
from app.orchestrator.node_executors.trigger_executors.error_trigger_executor import (
    ErrorTriggerExecutor,
)
from app.orchestrator.node_executors.trigger_executors.event_trigger_executor import (
    EventTriggerExecutor,
)
from app.orchestrator.node_executors.trigger_executors.file_upload_trigger_executor import (
    FileUploadTriggerExecutor,
)
from app.orchestrator.node_executors.trigger_executors.schedule_trigger_executor import (
    ScheduleTriggerExecutor,
)
from app.orchestrator.node_executors.trigger_executors.webhook_trigger_executor import (
    WebhookTriggerExecutor,
)
from app.orchestrator.node_registry import NodeRegistry


class TestPhase2AdvancedNodes:
    """Test Phase 2.3 & 2.4 node registrations."""

    def test_all_phase2_advanced_nodes_registered(self):
        """Test all Phase 2.3 & 2.4 nodes are registered."""
        registry = NodeRegistry.get_instance()
        all_types = registry.get_all_node_types()
        type_names = [nt.type for nt in all_types]

        # Phase 2.3 nodes
        assert "webhook_trigger" in type_names
        assert "schedule_trigger" in type_names
        assert "event_trigger" in type_names
        assert "file_upload_trigger" in type_names

        # Phase 2.4 nodes
        assert "switch" in type_names
        assert "wait" in type_names
        assert "webhook_response" in type_names
        assert "error_trigger" in type_names

    def test_total_node_count(self):
        """Test that we now have 21 total nodes (7 original + 14 new)."""
        registry = NodeRegistry.get_instance()
        all_types = registry.get_all_node_types()

        # Phase 1: 7 nodes
        # Phase 2.1: 3 nodes
        # Phase 2.2: 3 nodes
        # Phase 2.3: 4 nodes
        # Phase 2.4: 4 nodes
        # Total: 21 nodes
        assert len(all_types) == 21


@pytest.mark.asyncio
class TestWebhookTriggerExecutor:
    """Test webhook trigger executor."""

    async def test_returns_webhook_data(self):
        """Test that webhook request data is returned."""
        executor = WebhookTriggerExecutor()
        context = ExecutionContext(
            user_id=123,
            tenant_id="tenant_1",
            workflow_id="wf_1",
            execution_id="exec_1",
            extra_data={
                "webhook_request": {
                    "body": {"key": "value"},
                    "headers": {"Content-Type": "application/json"},
                    "query": {"param": "test"},
                }
            },
        )
        data = NodeExecutionData(
            node_id="webhook_1",
            node_type="webhook_trigger",
            config={},
            inputs={},
            state={},
        )

        result = await executor.execute(data, context)

        assert result["body"] == {"key": "value"}
        assert result["headers"] == {"Content-Type": "application/json"}
        assert result["query"] == {"param": "test"}


@pytest.mark.asyncio
class TestScheduleTriggerExecutor:
    """Test schedule trigger executor."""

    async def test_returns_timestamp(self):
        """Test that execution timestamp is returned."""
        executor = ScheduleTriggerExecutor()
        context = ExecutionContext(
            user_id=123,
            tenant_id="tenant_1",
            workflow_id="wf_1",
            execution_id="exec_1",
            extra_data={"scheduled_time": "2026-02-08T09:00:00Z"},
        )
        data = NodeExecutionData(
            node_id="schedule_1",
            node_type="schedule_trigger",
            config={},
            inputs={},
            state={},
        )

        result = await executor.execute(data, context)

        assert result["timestamp"] == "2026-02-08T09:00:00Z"


@pytest.mark.asyncio
class TestEventTriggerExecutor:
    """Test event trigger executor."""

    async def test_returns_event_data(self):
        """Test that event data is returned."""
        executor = EventTriggerExecutor()
        context = ExecutionContext(
            user_id=123,
            tenant_id="tenant_1",
            workflow_id="wf_1",
            execution_id="exec_1",
            extra_data={
                "trigger_event": {"type": "user.created", "data": {"userId": 456}}
            },
        )
        data = NodeExecutionData(
            node_id="event_1",
            node_type="event_trigger",
            config={},
            inputs={},
            state={},
        )

        result = await executor.execute(data, context)

        assert result["eventType"] == "user.created"
        assert result["event"] == {"userId": 456}


@pytest.mark.asyncio
class TestFileUploadTriggerExecutor:
    """Test file upload trigger executor."""

    async def test_returns_file_info(self):
        """Test that file information is returned."""
        executor = FileUploadTriggerExecutor()
        context = ExecutionContext(
            user_id=123,
            tenant_id="tenant_1",
            workflow_id="wf_1",
            execution_id="exec_1",
            extra_data={
                "uploaded_file": {
                    "fileUrl": "https://s3.example.com/file.pdf",
                    "fileName": "document.pdf",
                    "fileSize": 1024 * 500,  # 500 KB
                    "mimeType": "application/pdf",
                }
            },
        )
        data = NodeExecutionData(
            node_id="upload_1",
            node_type="file_upload_trigger",
            config={},
            inputs={"maxSize": 10, "acceptedTypes": ["application/pdf"]},
            state={},
        )

        result = await executor.execute(data, context)

        assert result["fileUrl"] == "https://s3.example.com/file.pdf"
        assert result["fileName"] == "document.pdf"
        assert result["fileSize"] == 1024 * 500
        assert result["mimeType"] == "application/pdf"

    async def test_rejects_oversized_file(self):
        """Test that oversized files are rejected."""
        executor = FileUploadTriggerExecutor()
        context = ExecutionContext(
            user_id=123,
            tenant_id="tenant_1",
            workflow_id="wf_1",
            execution_id="exec_1",
            extra_data={
                "uploaded_file": {
                    "fileUrl": "https://s3.example.com/large.pdf",
                    "fileName": "large.pdf",
                    "fileSize": 1024 * 1024 * 15,  # 15 MB
                    "mimeType": "application/pdf",
                }
            },
        )
        data = NodeExecutionData(
            node_id="upload_1",
            node_type="file_upload_trigger",
            config={},
            inputs={"maxSize": 10, "acceptedTypes": ["*/*"]},
            state={},
        )

        with pytest.raises(ValueError, match="exceeds maximum allowed size"):
            await executor.execute(data, context)

    async def test_rejects_wrong_file_type(self):
        """Test that wrong file types are rejected."""
        executor = FileUploadTriggerExecutor()
        context = ExecutionContext(
            user_id=123,
            tenant_id="tenant_1",
            workflow_id="wf_1",
            execution_id="exec_1",
            extra_data={
                "uploaded_file": {
                    "fileUrl": "https://s3.example.com/file.txt",
                    "fileName": "file.txt",
                    "fileSize": 1024,
                    "mimeType": "text/plain",
                }
            },
        )
        data = NodeExecutionData(
            node_id="upload_1",
            node_type="file_upload_trigger",
            config={},
            inputs={"maxSize": 10, "acceptedTypes": ["image/*", "application/pdf"]},
            state={},
        )

        with pytest.raises(ValueError, match="is not in accepted types"):
            await executor.execute(data, context)


@pytest.mark.asyncio
class TestErrorTriggerExecutor:
    """Test error trigger executor."""

    async def test_returns_error_data(self):
        """Test that error data is returned."""
        executor = ErrorTriggerExecutor()
        context = ExecutionContext(
            user_id=123,
            tenant_id="tenant_1",
            workflow_id="wf_1",
            execution_id="exec_1",
            extra_data={
                "trigger_error": {
                    "error": {"message": "Node execution failed", "code": "EXEC_ERROR"},
                    "workflowId": "failed_wf_123",
                    "timestamp": "2026-02-08T10:00:00Z",
                }
            },
        )
        data = NodeExecutionData(
            node_id="error_1",
            node_type="error_trigger",
            config={},
            inputs={},
            state={},
        )

        result = await executor.execute(data, context)

        assert result["error"] == {"message": "Node execution failed", "code": "EXEC_ERROR"}
        assert result["workflowId"] == "failed_wf_123"
        assert result["timestamp"] == "2026-02-08T10:00:00Z"


@pytest.mark.asyncio
class TestSwitchExecutor:
    """Test switch executor."""

    async def test_matches_case(self):
        """Test that value is matched against cases."""
        executor = SwitchExecutor()
        context = ExecutionContext(
            user_id=123,
            tenant_id="tenant_1",
            workflow_id="wf_1",
            execution_id="exec_1",
        )
        data = NodeExecutionData(
            node_id="switch_1",
            node_type="switch",
            config={},
            inputs={
                "value": "approved",
                "cases": [
                    {"match": "approved", "label": "case_approved"},
                    {"match": "rejected", "label": "case_rejected"},
                ],
                "defaultCase": "default",
            },
            state={},
        )

        result = await executor.execute(data, context)

        assert result["matched"] == "case_approved"
        assert result["value"] == "approved"
        assert context.extra_data["switch_matched_case"] == "case_approved"

    async def test_uses_default_case(self):
        """Test that default case is used when no match."""
        executor = SwitchExecutor()
        context = ExecutionContext(
            user_id=123,
            tenant_id="tenant_1",
            workflow_id="wf_1",
            execution_id="exec_1",
        )
        data = NodeExecutionData(
            node_id="switch_1",
            node_type="switch",
            config={},
            inputs={
                "value": "unknown",
                "cases": [
                    {"match": "approved", "label": "case_approved"},
                    {"match": "rejected", "label": "case_rejected"},
                ],
                "defaultCase": "case_default",
            },
            state={},
        )

        result = await executor.execute(data, context)

        assert result["matched"] == "case_default"


@pytest.mark.asyncio
class TestWaitExecutor:
    """Test wait executor."""

    async def test_waits_and_returns_timestamp(self):
        """Test that wait pauses execution and returns resume time."""
        import time

        executor = WaitExecutor()
        context = ExecutionContext(
            user_id=123,
            tenant_id="tenant_1",
            workflow_id="wf_1",
            execution_id="exec_1",
        )
        data = NodeExecutionData(
            node_id="wait_1",
            node_type="wait",
            config={},
            inputs={"duration": 1, "unit": "seconds"},
            state={},
        )

        start_time = time.time()
        result = await executor.execute(data, context)
        elapsed = time.time() - start_time

        assert "resumedAt" in result
        assert elapsed >= 1  # Should have waited at least 1 second

    async def test_validates_duration(self):
        """Test that invalid duration is rejected."""
        executor = WaitExecutor()
        context = ExecutionContext(
            user_id=123,
            tenant_id="tenant_1",
            workflow_id="wf_1",
            execution_id="exec_1",
        )
        data = NodeExecutionData(
            node_id="wait_1",
            node_type="wait",
            config={},
            inputs={"duration": -5, "unit": "seconds"},
            state={},
        )

        with pytest.raises(ValueError, match="Invalid duration"):
            await executor.execute(data, context)

    async def test_rejects_excessive_wait(self):
        """Test that wait exceeding 7 days is rejected."""
        executor = WaitExecutor()
        context = ExecutionContext(
            user_id=123,
            tenant_id="tenant_1",
            workflow_id="wf_1",
            execution_id="exec_1",
        )
        data = NodeExecutionData(
            node_id="wait_1",
            node_type="wait",
            config={},
            inputs={"duration": 8, "unit": "days"},
            state={},
        )

        with pytest.raises(ValueError, match="exceeds maximum allowed"):
            await executor.execute(data, context)


@pytest.mark.asyncio
class TestWebhookResponseExecutor:
    """Test webhook response executor."""

    async def test_stores_response_in_context(self):
        """Test that webhook response is stored in context."""
        executor = WebhookResponseExecutor()
        context = ExecutionContext(
            user_id=123,
            tenant_id="tenant_1",
            workflow_id="wf_1",
            execution_id="exec_1",
        )
        data = NodeExecutionData(
            node_id="response_1",
            node_type="webhook_response",
            config={},
            inputs={
                "statusCode": 201,
                "body": {"success": True, "id": 123},
                "headers": {"X-Custom-Header": "value"},
            },
            state={},
        )

        result = await executor.execute(data, context)

        assert result == {}  # Terminal node
        assert "webhook_response" in context.extra_data
        assert context.extra_data["webhook_response"]["statusCode"] == 201
        assert context.extra_data["webhook_response"]["body"] == {"success": True, "id": 123}
        assert context.extra_data["webhook_response"]["headers"] == {"X-Custom-Header": "value"}

    async def test_validates_status_code(self):
        """Test that invalid status code is replaced with 200."""
        executor = WebhookResponseExecutor()
        context = ExecutionContext(
            user_id=123,
            tenant_id="tenant_1",
            workflow_id="wf_1",
            execution_id="exec_1",
        )
        data = NodeExecutionData(
            node_id="response_1",
            node_type="webhook_response",
            config={},
            inputs={"statusCode": 999, "body": {}},
            state={},
        )

        await executor.execute(data, context)

        assert context.extra_data["webhook_response"]["statusCode"] == 200
