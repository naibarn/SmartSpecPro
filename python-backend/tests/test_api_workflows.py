"""Tests for Section 14: Workflow API endpoints with LangGraph runtime integration.

Tests POST /compile, POST /execute, GET /execute/{id}/stream, POST /execute/{id}/resume,
GET /dlq, and POST /dlq/{id}/reprocess endpoints.
"""

import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.models.workflow_execution import WorkflowExecution
from app.models.workflow_dlq import WorkflowDeadLetterQueue


@pytest.fixture
def mock_current_user():
    """Create a mock authenticated user."""
    user = MagicMock()
    user.id = 1
    user.email = "test@example.com"
    user.currentTenantId = "tenant-1"
    user.creditBalance = 100.0
    user.is_active = True
    return user


@pytest.fixture
def valid_workflow_nodes():
    """Minimal valid ReactFlow nodes for compilation."""
    return [
        {
            "id": "trigger-1",
            "type": "manual_trigger",
            "position": {"x": 0, "y": 0},
            "data": {"label": "Start", "config": {}},
        },
        {
            "id": "node-1",
            "type": "set_variable",
            "position": {"x": 200, "y": 0},
            "data": {"label": "Set Fields", "config": {"fields": []}},
        },
    ]


@pytest.fixture
def valid_workflow_edges():
    """Minimal valid ReactFlow edges."""
    return [
        {
            "id": "e1",
            "source": "trigger-1",
            "target": "node-1",
            "sourceHandle": "output",
            "targetHandle": "input",
        }
    ]


# ============================================================================
# POST /compile endpoint tests
# ============================================================================


@pytest.mark.integration
class TestCompileEndpoint:
    """Tests for POST /api/v1/workflows/compile."""

    async def test_compile_endpoint_success(
        self, mock_current_user, valid_workflow_nodes, valid_workflow_edges
    ):
        """Valid ReactFlow JSON compiles successfully."""
        # Mock WorkflowCompiler
        with patch("app.api.workflows.WorkflowCompiler") as MockCompiler:
            mock_result = MagicMock()
            mock_result.manifest = {
                "nodes": valid_workflow_nodes,
                "edges": valid_workflow_edges,
                "_compiledMetadata": {"compiled_at": "2026-02-09T10:00:00Z"},
            }
            mock_result.warnings = None
            MockCompiler.return_value.compile.return_value = mock_result

            # Mock auth
            with patch("app.api.workflows.get_current_user", return_value=mock_current_user):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.post(
                        "/api/v1/workflows/compile",
                        json={
                            "nodes": valid_workflow_nodes,
                            "edges": valid_workflow_edges,
                        },
                    )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["manifest"] is not None
        assert "_compiledMetadata" in data["manifest"]

    async def test_compile_endpoint_validation_error(self, mock_current_user):
        """Invalid workflow returns 200 with success=false and errors list."""
        from app.orchestrator.workflow_compiler import CompilationError

        with patch("app.api.workflows.WorkflowCompiler") as MockCompiler:
            MockCompiler.return_value.compile.side_effect = CompilationError(
                ["Cycle detected in workflow", "Missing trigger node"]
            )

            with patch("app.api.workflows.get_current_user", return_value=mock_current_user):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.post(
                        "/api/v1/workflows/compile",
                        json={
                            "nodes": [{"id": "n1", "type": "unknown"}],
                            "edges": [],
                        },
                    )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
        assert isinstance(data["errors"], list)
        assert len(data["errors"]) >= 1

    async def test_compile_endpoint_warnings(
        self, mock_current_user, valid_workflow_nodes, valid_workflow_edges
    ):
        """Unreachable nodes produce warnings but compilation still succeeds."""
        with patch("app.api.workflows.WorkflowCompiler") as MockCompiler:
            mock_result = MagicMock()
            mock_result.manifest = {"nodes": valid_workflow_nodes, "edges": valid_workflow_edges}
            mock_result.warnings = ["Node 'orphan-1' is unreachable"]
            MockCompiler.return_value.compile.return_value = mock_result

            with patch("app.api.workflows.get_current_user", return_value=mock_current_user):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as client:
                    response = await client.post(
                        "/api/v1/workflows/compile",
                        json={
                            "nodes": valid_workflow_nodes,
                            "edges": valid_workflow_edges,
                        },
                    )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["warnings"] is not None
        assert len(data["warnings"]) > 0


# ============================================================================
# POST /execute endpoint tests
# ============================================================================


@pytest.mark.integration
class TestExecuteEndpoint:
    """Tests for POST /api/v1/workflows/execute."""

    async def test_execute_endpoint_starts(self, mock_current_user):
        """Compiled workflow starts execution and returns execution_id."""
        # Mock compiled workflow
        compiled_workflow = {
            "nodes": [],
            "edges": [],
            "_compiledMetadata": {"compiled_at": "2026-02-09T10:00:00Z"},
        }

        # Mock dependencies
        with patch("app.api.workflows.get_langgraph_runtime") as mock_runtime, \
             patch("app.api.workflows.CostEstimator") as MockEstimator, \
             patch("app.api.workflows.get_db") as mock_db, \
             patch("app.api.workflows.get_current_user", return_value=mock_current_user), \
             patch("app.api.workflows.register_execution"):

            # Setup mocks
            mock_runtime.return_value.compile = AsyncMock(return_value=MagicMock())
            mock_runtime.return_value.execute = AsyncMock()
            MockEstimator.return_value.estimate.return_value = {"total": 10.0, "breakdown": {}}

            # Mock DB
            mock_session = AsyncMock()
            mock_db.return_value = mock_session

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/v1/workflows/execute",
                    json={"workflowJson": compiled_workflow},
                )

        assert response.status_code == 200
        data = response.json()
        assert "executionId" in data
        assert data["status"] == "running"
        assert "startedAt" in data

    async def test_execute_endpoint_insufficient_credits(self, mock_current_user):
        """Returns 402 when credits are insufficient."""
        mock_current_user.creditBalance = 0.0

        compiled_workflow = {
            "nodes": [],
            "edges": [],
            "_compiledMetadata": {"compiled_at": "2026-02-09T10:00:00Z"},
        }

        with patch("app.api.workflows.CostEstimator") as MockEstimator, \
             patch("app.api.workflows.get_current_user", return_value=mock_current_user):

            MockEstimator.return_value.estimate.return_value = {"total": 50.0, "breakdown": {}}

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/v1/workflows/execute",
                    json={"workflowJson": compiled_workflow},
                )

        assert response.status_code == 402

    async def test_execute_endpoint_not_compiled(self, mock_current_user):
        """Returns 400 when workflow is not compiled."""
        with patch("app.api.workflows.get_current_user", return_value=mock_current_user):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/v1/workflows/execute",
                    json={"workflowJson": {"nodes": [], "edges": []}},
                )

        assert response.status_code == 400


# ============================================================================
# GET /execute/{id}/stream endpoint tests
# ============================================================================


@pytest.mark.integration
class TestStreamEndpoint:
    """Tests for GET /api/v1/workflows/execute/{id}/stream."""

    async def test_stream_endpoint_invalid_id(self, mock_current_user):
        """Invalid execution_id format returns 400."""
        with patch("app.api.workflows.get_current_user", return_value=mock_current_user):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get("/api/v1/workflows/execute/invalid-format/stream")

        assert response.status_code == 400

    async def test_stream_endpoint_not_found(self, mock_current_user):
        """Non-existent execution returns 404."""
        with patch("app.api.workflows.get_current_user", return_value=mock_current_user), \
             patch("app.api.workflows.get_db") as mock_db:

            # Mock DB returning no execution
            mock_session = AsyncMock()
            mock_result = AsyncMock()
            mock_result.scalar_one_or_none = AsyncMock(return_value=None)
            mock_session.execute = AsyncMock(return_value=mock_result)
            mock_db.return_value = mock_session

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get("/api/v1/workflows/execute/exec-000000000000/stream")

        assert response.status_code == 404


# ============================================================================
# POST /execute/{id}/resume endpoint tests
# ============================================================================


@pytest.mark.integration
class TestResumeEndpoint:
    """Tests for POST /api/v1/workflows/execute/{id}/resume."""

    async def test_resume_endpoint_not_found(self, mock_current_user):
        """Returns 404 for non-existent execution."""
        with patch("app.api.workflows.get_current_user", return_value=mock_current_user), \
             patch("app.api.workflows.get_db") as mock_db:

            # Mock DB returning no execution
            mock_session = AsyncMock()
            mock_result = AsyncMock()
            mock_result.scalar_one_or_none = AsyncMock(return_value=None)
            mock_session.execute = AsyncMock(return_value=mock_result)
            mock_db.return_value = mock_session

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/api/v1/workflows/execute/exec-000000000000/resume",
                    json={"response": {"approved": True}},
                )

        assert response.status_code == 404


# ============================================================================
# DLQ endpoint tests
# ============================================================================


@pytest.mark.integration
class TestDLQEndpoints:
    """Tests for DLQ list and reprocess endpoints."""

    async def test_dlq_list(self, mock_current_user):
        """GET /dlq returns paginated DLQ items for current tenant."""
        with patch("app.api.workflows.get_current_user", return_value=mock_current_user), \
             patch("app.api.workflows.get_db") as mock_db:

            # Mock DB returning DLQ items
            mock_session = AsyncMock()
            mock_count_result = AsyncMock()
            mock_count_result.scalar = AsyncMock(return_value=2)
            mock_items_result = AsyncMock()

            # Create mock DLQ items
            mock_item1 = MagicMock(spec=WorkflowDeadLetterQueue)
            mock_item1.id = 1
            mock_item1.workflow_id = "wf-1"
            mock_item1.execution_id = "exec-000000000001"
            mock_item1.node_id = "node-1"
            mock_item1.input_data = {}
            mock_item1.error = "Test error"
            mock_item1.retry_count = 0
            mock_item1.status = "pending"
            mock_item1.created_at = datetime.utcnow()

            mock_items_result.scalars = AsyncMock(return_value=MagicMock(all=lambda: [mock_item1]))

            # Setup mock session to return different results for count vs items queries
            async def mock_execute(query):
                # Simple heuristic: if query has func.count(), return count result
                if "count" in str(query).lower():
                    return mock_count_result
                return mock_items_result

            mock_session.execute = mock_execute
            mock_db.return_value = mock_session

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.get("/api/v1/workflows/dlq")

        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data

    async def test_dlq_reprocess_not_found(self, mock_current_user):
        """Returns 404 for non-existent DLQ item."""
        with patch("app.api.workflows.get_current_user", return_value=mock_current_user), \
             patch("app.api.workflows.get_db") as mock_db:

            # Mock DB returning no DLQ item
            mock_session = AsyncMock()
            mock_result = AsyncMock()
            mock_result.scalar_one_or_none = AsyncMock(return_value=None)
            mock_session.execute = AsyncMock(return_value=mock_result)
            mock_db.return_value = mock_session

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post("/api/v1/workflows/dlq/99999/reprocess")

        assert response.status_code == 404
