"""Tests for workflow API endpoints."""
import pytest
from unittest.mock import Mock, patch
from app.api.workflows import compile_flow, FlowCompileRequest
from app.orchestrator.flow_compiler import CompilationError
from app.models.user import User


@pytest.mark.unit
async def test_compile_flow_success():
    """Test successful flow compilation."""
    # Create mock user
    mock_user = Mock(spec=User)
    mock_user.id = 1
    mock_user.email = "test@example.com"

    # Create request
    request = FlowCompileRequest(
        nodes=[
            {"id": "node1", "type": "llm", "data": {"label": "Test LLM"}},
            {"id": "node2", "type": "approval", "data": {"label": "Approval Gate"}},
        ],
        edges=[
            {"source": "node1", "target": "node2", "label": "next"}
        ],
        metadata={"name": "test_flow", "version": "1.0.0"}
    )

    # Call endpoint
    response = await compile_flow(request, current_user=mock_user)

    # Verify response
    assert response.success is True
    assert response.manifest is not None
    assert response.error is None
    assert response.manifest["name"] == "test_flow"
    assert response.manifest["version"] == "1.0.0"
    assert response.manifest["author"] == "test@example.com"
    assert len(response.manifest["nodes"]) == 2
    assert len(response.manifest["edges"]) == 1


@pytest.mark.unit
async def test_compile_flow_validation_error():
    """Test flow compilation with validation error."""
    # Create mock user
    mock_user = Mock(spec=User)
    mock_user.id = 1
    mock_user.email = "test@example.com"

    # Create invalid request (no nodes)
    request = FlowCompileRequest(
        nodes=[],
        edges=[],
    )

    # Call endpoint
    response = await compile_flow(request, current_user=mock_user)

    # Verify error response
    assert response.success is False
    assert response.manifest is None
    assert response.error is not None
    assert "must have at least one node" in response.error


@pytest.mark.unit
async def test_compile_flow_loop_limit_exceeded():
    """Test flow compilation with loop exceeding max iterations."""
    # Create mock user
    mock_user = Mock(spec=User)
    mock_user.id = 1
    mock_user.email = "test@example.com"

    # Create request with invalid loop
    request = FlowCompileRequest(
        nodes=[
            {
                "id": "loop1",
                "type": "loop",
                "data": {
                    "label": "Infinite Loop",
                    "config": {"max_iterations": 200}  # Exceeds limit of 100
                }
            }
        ],
        edges=[],
    )

    # Call endpoint
    response = await compile_flow(request, current_user=mock_user)

    # Verify error response
    assert response.success is False
    assert response.manifest is None
    assert response.error is not None
    assert "cannot exceed 100" in response.error


@pytest.mark.unit
async def test_compile_flow_default_author():
    """Test that author defaults to user email."""
    # Create mock user
    mock_user = Mock(spec=User)
    mock_user.id = 1
    mock_user.email = "user@smartspecpro.com"

    # Create request without author metadata
    request = FlowCompileRequest(
        nodes=[{"id": "node1", "type": "llm", "data": {}}],
        edges=[],
    )

    # Call endpoint
    response = await compile_flow(request, current_user=mock_user)

    # Verify author was set from user email
    assert response.success is True
    assert response.manifest["author"] == "user@smartspecpro.com"


@pytest.mark.unit
async def test_compile_flow_invalid_edge_reference():
    """Test flow compilation with edge referencing non-existent node."""
    # Create mock user
    mock_user = Mock(spec=User)
    mock_user.id = 1
    mock_user.email = "test@example.com"

    # Create request with invalid edge
    request = FlowCompileRequest(
        nodes=[
            {"id": "node1", "type": "llm", "data": {}},
        ],
        edges=[
            {"source": "node1", "target": "nonexistent"}  # Invalid target
        ],
    )

    # Call endpoint
    response = await compile_flow(request, current_user=mock_user)

    # Verify error response
    assert response.success is False
    assert response.manifest is None
    assert response.error is not None
    assert "non-existent node" in response.error or "not found" in response.error
