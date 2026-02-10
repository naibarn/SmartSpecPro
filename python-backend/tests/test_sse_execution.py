"""Tests for SSE workflow execution streaming."""
import pytest
from httpx import AsyncClient
from app.main import app
from app.models import User


@pytest.mark.asyncio
async def test_sse_endpoint_returns_event_stream_content_type(async_client: AsyncClient, test_user: User):
    """Test GET /execute/{id}/stream returns event-stream content type."""
    execution_id = "exec-test-123"

    response = await async_client.get(
        f"/api/v1/workflows/execute/{execution_id}/stream",
        headers={"Authorization": f"Bearer {test_user.token}"},
    )

    # SSE returns 200 and starts streaming
    assert response.status_code == 200
    assert response.headers["content-type"] == "text/event-stream; charset=utf-8"


@pytest.mark.asyncio
async def test_sse_authenticates_via_session_cookie(async_client: AsyncClient, test_user: User):
    """Test SSE authenticates via session cookie (not just bearer token)."""
    execution_id = "exec-test-123"

    # Make request WITH session cookie
    response = await async_client.get(
        f"/api/v1/workflows/execute/{execution_id}/stream",
        cookies={"session": test_user.session_id},
    )

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_sse_rejects_unauthenticated_request(async_client: AsyncClient):
    """Test SSE unauthenticated request returns 401."""
    execution_id = "exec-test-123"

    # Request without auth
    response = await async_client.get(
        f"/api/v1/workflows/execute/{execution_id}/stream",
    )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_sse_emits_node_start_event(async_client: AsyncClient, test_user: User, test_execution):
    """Test SSE emits node_start event when node begins execution."""
    execution_id = test_execution.execution_id

    async with async_client.stream(
        "GET",
        f"/api/v1/workflows/execute/{execution_id}/stream",
        headers={"Authorization": f"Bearer {test_user.token}"},
    ) as response:
        # Read first event
        async for line in response.aiter_lines():
            if line.startswith("event:"):
                assert "node_start" in line
                break
            if line.startswith("data:"):
                import json
                data = json.loads(line.replace("data: ", ""))
                assert "nodeId" in data
                assert "nodeName" in data
                assert "timestamp" in data
                break


@pytest.mark.asyncio
async def test_sse_emits_node_complete_event(async_client: AsyncClient, test_user: User, test_execution):
    """Test SSE emits node_complete event with output summary and duration."""
    execution_id = test_execution.execution_id

    node_complete_received = False

    async with async_client.stream(
        "GET",
        f"/api/v1/workflows/execute/{execution_id}/stream",
        headers={"Authorization": f"Bearer {test_user.token}"},
    ) as response:
        async for line in response.aiter_lines():
            if line.startswith("event:") and "node_complete" in line:
                node_complete_received = True
            if node_complete_received and line.startswith("data:"):
                import json
                data = json.loads(line.replace("data: ", ""))
                assert "nodeId" in data
                assert "nodeName" in data
                assert "output" in data  # Summary of outputs
                assert "durationMs" in data
                assert "timestamp" in data
                break


@pytest.mark.asyncio
async def test_sse_emits_node_error_event(async_client: AsyncClient, test_user: User, test_execution_with_error):
    """Test SSE emits node_error event with error details."""
    execution_id = test_execution_with_error.execution_id

    node_error_received = False

    async with async_client.stream(
        "GET",
        f"/api/v1/workflows/execute/{execution_id}/stream",
        headers={"Authorization": f"Bearer {test_user.token}"},
    ) as response:
        async for line in response.aiter_lines():
            if line.startswith("event:") and "node_error" in line:
                node_error_received = True
            if node_error_received and line.startswith("data:"):
                import json
                data = json.loads(line.replace("data: ", ""))
                assert "nodeId" in data
                assert "nodeName" in data
                assert "error" in data
                assert data["error"] != ""
                break


@pytest.mark.asyncio
async def test_sse_emits_workflow_complete_event(async_client: AsyncClient, test_user: User, test_execution):
    """Test SSE emits workflow_complete event after all nodes finish."""
    execution_id = test_execution.execution_id

    workflow_complete_received = False

    async with async_client.stream(
        "GET",
        f"/api/v1/workflows/execute/{execution_id}/stream",
        headers={"Authorization": f"Bearer {test_user.token}"},
    ) as response:
        async for line in response.aiter_lines():
            if line.startswith("event:") and "workflow_complete" in line:
                workflow_complete_received = True
            if workflow_complete_received and line.startswith("data:"):
                import json
                data = json.loads(line.replace("data: ", ""))
                assert "executionId" in data
                assert "totalDurationMs" in data
                assert "nodeResults" in data  # Summary of all results
                break


@pytest.mark.asyncio
async def test_sse_emits_workflow_error_event(async_client: AsyncClient, test_user: User, test_execution_with_fatal_error):
    """Test SSE emits workflow_error event on unrecoverable failure."""
    execution_id = test_execution_with_fatal_error.execution_id

    workflow_error_received = False

    async with async_client.stream(
        "GET",
        f"/api/v1/workflows/execute/{execution_id}/stream",
        headers={"Authorization": f"Bearer {test_user.token}"},
    ) as response:
        async for line in response.aiter_lines():
            if line.startswith("event:") and "workflow_error" in line:
                workflow_error_received = True
            if workflow_error_received and line.startswith("data:"):
                import json
                data = json.loads(line.replace("data: ", ""))
                assert "executionId" in data
                assert "error" in data
                assert data["error"] != ""
                # failedNodeId is optional
                break


@pytest.mark.asyncio
async def test_sse_supports_last_event_id_reconnection(async_client: AsyncClient, test_user: User, test_execution):
    """Test SSE supports Last-Event-ID reconnection (replays missed events)."""
    execution_id = test_execution.execution_id

    # First connection: receive some events
    received_event_ids = []
    async with async_client.stream(
        "GET",
        f"/api/v1/workflows/execute/{execution_id}/stream",
        headers={"Authorization": f"Bearer {test_user.token}"},
    ) as response:
        count = 0
        async for line in response.aiter_lines():
            if line.startswith("id:"):
                event_id = line.replace("id: ", "").strip()
                received_event_ids.append(event_id)
                count += 1
                if count >= 3:  # Get first 3 events, then disconnect
                    break

    # Reconnect with Last-Event-ID pointing to 2nd event
    if len(received_event_ids) >= 2:
        last_event_id = received_event_ids[1]

        async with async_client.stream(
            "GET",
            f"/api/v1/workflows/execute/{execution_id}/stream",
            headers={
                "Authorization": f"Bearer {test_user.token}",
                "Last-Event-ID": last_event_id,
            },
        ) as response:
            # Should replay event #3 before continuing
            first_replayed_id = None
            async for line in response.aiter_lines():
                if line.startswith("id:"):
                    first_replayed_id = line.replace("id: ", "").strip()
                    break

            # First event should be the one after last_event_id
            assert first_replayed_id == received_event_ids[2]


@pytest.mark.asyncio
async def test_sse_closes_connection_after_workflow_complete(async_client: AsyncClient, test_user: User, test_short_execution):
    """Test SSE closes connection when workflow completes."""
    execution_id = test_short_execution.execution_id

    workflow_complete_seen = False
    connection_closed = False

    async with async_client.stream(
        "GET",
        f"/api/v1/workflows/execute/{execution_id}/stream",
        headers={"Authorization": f"Bearer {test_user.token}"},
    ) as response:
        async for line in response.aiter_lines():
            if "workflow_complete" in line:
                workflow_complete_seen = True

            # After workflow_complete, connection should close soon
            if workflow_complete_seen:
                # Try to read one more line - should get empty or connection close
                try:
                    next_line = await response.aiter_lines().__anext__()
                    if not next_line:
                        connection_closed = True
                        break
                except StopAsyncIteration:
                    connection_closed = True
                    break

    assert workflow_complete_seen
    assert connection_closed


# Fixtures

@pytest.fixture
def test_execution(db_session):
    """Create a test execution record."""
    # Stub: would create execution record in DB
    class MockExecution:
        execution_id = "exec-test-123"

    return MockExecution()


@pytest.fixture
def test_execution_with_error(db_session):
    """Create a test execution that will have a node error."""
    class MockExecution:
        execution_id = "exec-test-error-123"

    return MockExecution()


@pytest.fixture
def test_execution_with_fatal_error(db_session):
    """Create a test execution that will have a workflow-level error."""
    class MockExecution:
        execution_id = "exec-test-fatal-123"

    return MockExecution()


@pytest.fixture
def test_short_execution(db_session):
    """Create a test execution that completes quickly."""
    class MockExecution:
        execution_id = "exec-test-short-123"

    return MockExecution()
