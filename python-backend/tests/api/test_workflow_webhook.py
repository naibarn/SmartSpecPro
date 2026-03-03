"""
Tests for POST /api/v1/workflows/internal/{workflow_id}/webhook-trigger

Covers:
- Gateway token authentication
- Workflow not found → 404
- Smart webhook node detection
- Celery task dispatch (mocked)
- Response shape
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ── Fixtures ──────────────────────────────────────────────────────────────────

WORKFLOW_WITH_WEBHOOK_NODE = {
    "nodes": [
        {"id": "node-abc", "type": "webhook_trigger", "data": {}},
        {"id": "node-xyz", "type": "llm", "data": {}},
    ],
    "edges": [],
}

WORKFLOW_WITHOUT_WEBHOOK_NODE = {
    "nodes": [
        {"id": "node-1", "type": "llm", "data": {}},
        {"id": "node-2", "type": "output", "data": {}},
    ],
    "edges": [],
}

WORKFLOW_WITH_TRIGGER_NODE = {
    "nodes": [
        {"id": "trigger-node", "data": {"nodeType": "trigger", "id": "trigger-node"}},
        {"id": "node-2", "data": {"type": "llm"}},
    ],
    "edges": [],
}


def make_workflow(workflow_json: dict, workflow_id: int = 1) -> MagicMock:
    wf = MagicMock()
    wf.id = workflow_id
    wf.workflowJson = workflow_json
    wf.status = "active"
    return wf


# ── Helper: build request body ─────────────────────────────────────────────────

def make_request_body(
    input_data: dict | None = None,
    webhook_trigger_id: str | None = "trig-uuid-1",
) -> dict:
    return {
        "input_data": input_data or {"type": "order.created", "orderId": "123"},
        "webhook_trigger_id": webhook_trigger_id,
    }


# ── Tests ──────────────────────────────────────────────────────────────────────

@pytest.mark.unit
class TestInternalWebhookTriggerAuth:
    """Authentication tests for the internal webhook trigger endpoint."""

    @pytest.mark.asyncio
    async def test_missing_auth_header_returns_401(self):
        """Request without Authorization header is rejected."""
        from app.api.workflows import _verify_gateway_auth
        from fastapi import HTTPException

        mock_settings = MagicMock()
        mock_settings.SMARTSPEC_WEB_GATEWAY_TOKEN = "valid-token"
        with patch("app.core.config.settings", mock_settings):
            with pytest.raises(HTTPException) as exc_info:
                await _verify_gateway_auth(authorization=None)
        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_wrong_token_returns_401(self):
        """Request with wrong Bearer token is rejected."""
        from app.api.workflows import _verify_gateway_auth
        from fastapi import HTTPException

        mock_settings = MagicMock()
        mock_settings.SMARTSPEC_WEB_GATEWAY_TOKEN = "correct-token"
        with patch("app.core.config.settings", mock_settings):
            with pytest.raises(HTTPException) as exc_info:
                await _verify_gateway_auth(authorization="Bearer wrong-token")
        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_correct_token_passes(self):
        """Request with correct Bearer token passes without error."""
        from app.api.workflows import _verify_gateway_auth

        mock_settings = MagicMock()
        mock_settings.SMARTSPEC_WEB_GATEWAY_TOKEN = "correct-token"
        with patch("app.core.config.settings", mock_settings):
            # Should not raise
            result = await _verify_gateway_auth(authorization="Bearer correct-token")
        assert result is None

    @pytest.mark.asyncio
    async def test_unconfigured_token_returns_500(self):
        """Missing SMARTSPEC_WEB_GATEWAY_TOKEN config returns 500."""
        from app.api.workflows import _verify_gateway_auth
        from fastapi import HTTPException

        mock_settings = MagicMock()
        mock_settings.SMARTSPEC_WEB_GATEWAY_TOKEN = ""
        with patch("app.core.config.settings", mock_settings):
            with pytest.raises(HTTPException) as exc_info:
                await _verify_gateway_auth(authorization="Bearer some-token")
        assert exc_info.value.status_code == 500


@pytest.mark.unit
class TestInternalWebhookTriggerNodeDetection:
    """Tests for smart webhook trigger node detection."""

    @pytest.mark.asyncio
    async def test_workflow_not_found_returns_404(self):
        """Returns 404 when workflow does not exist in DB."""
        from app.api.workflows import internal_webhook_trigger, InternalWebhookTriggerRequest
        from fastapi import HTTPException

        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute = AsyncMock(return_value=mock_result)

        body = InternalWebhookTriggerRequest(
            input_data={"type": "test"},
            webhook_trigger_id="trig-1",
        )

        with pytest.raises(HTTPException) as exc_info:
            await internal_webhook_trigger(
                workflow_id=999,
                body=body,
                _auth=None,
                db=mock_db,
            )
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_dispatches_with_webhook_node_id_when_found(self):
        """When workflow has a webhook trigger node, that node's ID is used."""
        from app.api.workflows import internal_webhook_trigger, InternalWebhookTriggerRequest

        workflow = make_workflow(WORKFLOW_WITH_WEBHOOK_NODE)
        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = workflow
        mock_db.execute = AsyncMock(return_value=mock_result)

        body = InternalWebhookTriggerRequest(
            input_data={"type": "order.created"},
            webhook_trigger_id="trig-uuid-1",
        )

        mock_task = MagicMock()
        mock_task.id = "celery-task-abc"

        with patch(
            "app.tasks.workflow_tasks.execute_webhook_workflow"
        ) as mock_celery:
            mock_celery.delay.return_value = mock_task
            result = await internal_webhook_trigger(
                workflow_id=1,
                body=body,
                _auth=None,
                db=mock_db,
            )

        # Should use the webhook_trigger node's ID
        call_kwargs = mock_celery.delay.call_args.kwargs
        assert call_kwargs["workflow_id"] == "1"
        assert call_kwargs["node_id"] == "node-abc"
        assert call_kwargs["webhook_request"]["method"] == "POST"
        assert call_kwargs["webhook_request"]["body"] == {"type": "order.created"}
        assert call_kwargs["webhook_request"]["input_data"] == {"type": "order.created"}

        assert result["nodeId"] == "node-abc"
        assert result["hasWebhookTriggerNode"] is True
        assert result["executionId"] == "celery-task-abc"
        assert result["status"] == "triggered"

    @pytest.mark.asyncio
    async def test_dispatches_with_direct_node_when_no_webhook_node(self):
        """When workflow has no webhook trigger node, nodeId='direct' is used."""
        from app.api.workflows import internal_webhook_trigger, InternalWebhookTriggerRequest

        workflow = make_workflow(WORKFLOW_WITHOUT_WEBHOOK_NODE)
        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = workflow
        mock_db.execute = AsyncMock(return_value=mock_result)

        body = InternalWebhookTriggerRequest(
            input_data={"type": "payment.completed"},
            webhook_trigger_id="trig-uuid-2",
        )

        mock_task = MagicMock()
        mock_task.id = "celery-task-xyz"

        with patch(
            "app.tasks.workflow_tasks.execute_webhook_workflow"
        ) as mock_celery:
            mock_celery.delay.return_value = mock_task
            result = await internal_webhook_trigger(
                workflow_id=2,
                body=body,
                _auth=None,
                db=mock_db,
            )

        # Should fall back to "direct" node_id
        call_args = mock_celery.delay.call_args
        assert call_args.kwargs["node_id"] == "direct"
        assert result["hasWebhookTriggerNode"] is False
        assert result["nodeId"] == "direct"

    @pytest.mark.asyncio
    async def test_detects_trigger_node_type_in_data_field(self):
        """Detects webhook node when type is nested in node.data.nodeType."""
        from app.api.workflows import internal_webhook_trigger, InternalWebhookTriggerRequest

        workflow = make_workflow(WORKFLOW_WITH_TRIGGER_NODE)
        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = workflow
        mock_db.execute = AsyncMock(return_value=mock_result)

        body = InternalWebhookTriggerRequest(input_data={})

        mock_task = MagicMock()
        mock_task.id = "task-id"

        with patch("app.tasks.workflow_tasks.execute_webhook_workflow") as mock_celery:
            mock_celery.delay.return_value = mock_task
            result = await internal_webhook_trigger(
                workflow_id=3,
                body=body,
                _auth=None,
                db=mock_db,
            )

        assert result["hasWebhookTriggerNode"] is True
        assert result["nodeId"] == "trigger-node"

    @pytest.mark.asyncio
    async def test_response_contains_required_fields(self):
        """Response includes executionId, workflowId, nodeId, status, timestamp."""
        from app.api.workflows import internal_webhook_trigger, InternalWebhookTriggerRequest

        workflow = make_workflow(WORKFLOW_WITH_WEBHOOK_NODE, workflow_id=5)
        mock_db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = workflow
        mock_db.execute = AsyncMock(return_value=mock_result)

        body = InternalWebhookTriggerRequest(input_data={"key": "value"})
        mock_task = MagicMock()
        mock_task.id = "exec-abc123"

        with patch("app.tasks.workflow_tasks.execute_webhook_workflow") as mock_celery:
            mock_celery.delay.return_value = mock_task
            result = await internal_webhook_trigger(
                workflow_id=5,
                body=body,
                _auth=None,
                db=mock_db,
            )

        assert result["executionId"] == "exec-abc123"
        assert result["workflowId"] == 5
        assert result["status"] == "triggered"
        assert "timestamp" in result
        assert "nodeId" in result
