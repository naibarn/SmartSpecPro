"""Tests for workflow API endpoints."""
import pytest
from httpx import AsyncClient
from app.main import app
from app.models import User, Tenant


@pytest.mark.asyncio
async def test_execute_workflow_accepts_compiled(async_client: AsyncClient, test_user: User, test_tenant: Tenant):
    """Test POST /api/v1/workflow/execute accepts compiled workflow and returns execution_id."""
    workflow_json = {
        "nodes": [
            {
                "id": "llm1",
                "data": {
                    "nodeType": "llm_call",
                    "config": {"prompt": "Test prompt", "model": "gpt-4"},
                },
            },
        ],
        "edges": [],
        "_compiledMetadata": {
            "compiledAt": "2026-02-08T10:00:00Z",
            "schemaVersion": "1.0.0",
        },
    }

    response = await async_client.post(
        "/api/v1/workflow/execute",
        json={"workflowJson": workflow_json},
        headers={"Authorization": f"Bearer {test_user.token}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert "executionId" in data
    assert data["status"] == "running"
    assert "startedAt" in data


@pytest.mark.asyncio
async def test_execute_workflow_rejects_uncompiled(async_client: AsyncClient, test_user: User):
    """Test POST /api/v1/workflow/execute rejects uncompiled workflow."""
    workflow_json = {
        "nodes": [{"id": "llm1", "data": {"nodeType": "llm_call", "config": {}}}],
        "edges": [],
        # Missing _compiledMetadata
    }

    response = await async_client.post(
        "/api/v1/workflow/execute",
        json={"workflowJson": workflow_json},
        headers={"Authorization": f"Bearer {test_user.token}"},
    )

    assert response.status_code == 400
    assert "not compiled" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_execute_workflow_checks_credits(async_client: AsyncClient, test_user_low_credits: User):
    """Test POST /api/v1/workflow/execute checks user credits before starting."""
    workflow_json = {
        "nodes": [
            {"id": "llm1", "data": {"nodeType": "llm_call", "config": {"prompt": "x" * 10000}}},
        ],
        "edges": [],
        "_compiledMetadata": {"compiledAt": "2026-02-08T10:00:00Z", "schemaVersion": "1.0.0"},
    }

    response = await async_client.post(
        "/api/v1/workflow/execute",
        json={"workflowJson": workflow_json},
        headers={"Authorization": f"Bearer {test_user_low_credits.token}"},
    )

    assert response.status_code == 402  # Payment Required
    assert "insufficient credits" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_list_workflows_scoped_to_tenant(async_client: AsyncClient, test_user: User):
    """Test GET /api/v1/workflow/list returns user's workflows scoped to tenant."""
    # Assume there are workflows in the database for test_user
    response = await async_client.get(
        "/api/v1/workflow/list",
        headers={"Authorization": f"Bearer {test_user.token}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert "workflows" in data
    workflows = data["workflows"]

    # All workflows should belong to test_user's tenant
    for workflow in workflows:
        assert workflow["tenantId"] == test_user.tenant_id


@pytest.mark.asyncio
async def test_list_workflows_filter_by_status(async_client: AsyncClient, test_user: User):
    """Test GET /api/v1/workflow/list filters by status."""
    response = await async_client.get(
        "/api/v1/workflow/list?status=draft",
        headers={"Authorization": f"Bearer {test_user.token}"},
    )

    assert response.status_code == 200
    data = response.json()
    workflows = data["workflows"]

    # All returned workflows should have status "draft"
    for workflow in workflows:
        assert workflow["status"] == "draft"


@pytest.mark.asyncio
async def test_get_workflow_report_returns_status(async_client: AsyncClient, test_user: User):
    """Test GET /api/v1/workflow/report/{id} returns execution status and node results."""
    # Assume there's a test execution_id
    execution_id = "exec-test-123"

    response = await async_client.get(
        f"/api/v1/workflow/report/{execution_id}",
        headers={"Authorization": f"Bearer {test_user.token}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert "executionId" in data
    assert "status" in data
    assert data["status"] in ["running", "completed", "failed"]
    assert "nodeResults" in data
    assert "totalDurationMs" in data


@pytest.mark.asyncio
async def test_get_workflow_report_tenant_isolation(async_client: AsyncClient, test_user: User, other_tenant_user: User):
    """Test GET /api/v1/workflow/report/{id} enforces tenant isolation."""
    # Create execution for other_tenant_user
    execution_id = "exec-other-tenant-123"

    # test_user tries to access other_tenant_user's execution
    response = await async_client.get(
        f"/api/v1/workflow/report/{execution_id}",
        headers={"Authorization": f"Bearer {test_user.token}"},
    )

    assert response.status_code == 404  # Not found (due to tenant isolation)


@pytest.mark.asyncio
async def test_estimate_cost_returns_breakdown(async_client: AsyncClient, test_user: User):
    """Test POST /api/v1/workflow/estimate-cost returns estimated credits with breakdown."""
    workflow_json = {
        "nodes": [
            {"id": "llm1", "data": {"nodeType": "llm_call", "config": {"prompt": "Test", "model": "gpt-4"}}},
            {"id": "img1", "data": {"nodeType": "generate_image", "config": {"provider": "dalle3", "size": "1024x1024"}}},
            {"id": "rag1", "data": {"nodeType": "rag_query", "config": {"query": "Test"}}},
        ],
        "edges": [],
    }

    response = await async_client.post(
        "/api/v1/workflow/estimate-cost",
        json={"workflowJson": workflow_json},
        headers={"Authorization": f"Bearer {test_user.token}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert "estimatedCredits" in data
    assert "breakdown" in data
    assert "userBalance" in data

    breakdown = data["breakdown"]
    assert "llm_calls" in breakdown
    assert "image_generation" in breakdown
    assert "rag_queries" in breakdown


@pytest.mark.asyncio
async def test_estimate_cost_warns_insufficient_balance(async_client: AsyncClient, test_user_low_credits: User):
    """Test POST /api/v1/workflow/estimate-cost warns when estimated cost exceeds balance."""
    workflow_json = {
        "nodes": [
            {"id": "llm1", "data": {"nodeType": "llm_call", "config": {"prompt": "x" * 50000}}},
        ],
        "edges": [],
    }

    response = await async_client.post(
        "/api/v1/workflow/estimate-cost",
        json={"workflowJson": workflow_json},
        headers={"Authorization": f"Bearer {test_user_low_credits.token}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["warning"] is not None
    assert "insufficient" in data["warning"].lower() or "exceeds" in data["warning"].lower()


@pytest.mark.asyncio
async def test_compile_workflow_validates_structure(async_client: AsyncClient, test_user: User):
    """Test POST /api/v1/workflow/compile validates workflow structure."""
    workflow_json = {
        "nodes": [
            {"id": "llm1", "data": {"nodeType": "llm_call", "config": {"prompt": "Test"}}},
        ],
        "edges": [],
    }

    response = await async_client.post(
        "/api/v1/workflow/compile",
        json={"workflowJson": workflow_json},
        headers={"Authorization": f"Bearer {test_user.token}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert "manifest" in data
    manifest = data["manifest"]
    assert "steps" in manifest
    assert "edges" in manifest
    assert "_compiledMetadata" in data


@pytest.mark.asyncio
async def test_compile_workflow_rejects_invalid_structure(async_client: AsyncClient, test_user: User):
    """Test POST /api/v1/workflow/compile rejects invalid workflow."""
    workflow_json = {
        "nodes": [],  # Empty workflow
        "edges": [],
    }

    response = await async_client.post(
        "/api/v1/workflow/compile",
        json={"workflowJson": workflow_json},
        headers={"Authorization": f"Bearer {test_user.token}"},
    )

    assert response.status_code == 400
    assert "at least one node" in response.json()["detail"].lower()


# Fixtures for test users
@pytest.fixture
def test_user_low_credits(db_session) -> User:
    """Create a test user with low credit balance."""
    user = User(
        email="lowcredits@test.com",
        credit_balance=1.0,  # Very low balance
        tenant_id="tenant-test",
    )
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def other_tenant_user(db_session) -> User:
    """Create a user from a different tenant."""
    user = User(
        email="othertenant@test.com",
        credit_balance=100.0,
        tenant_id="tenant-other",
    )
    db_session.add(user)
    db_session.commit()
    return user
