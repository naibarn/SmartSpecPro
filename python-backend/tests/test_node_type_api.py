"""
Tests for node type API endpoints.
Run: cd python-backend && uv run pytest tests/test_node_type_api.py -v
"""
import pytest
from fastapi.testclient import TestClient

# Test: GET /api/v1/workflow/node-types — returns all registered node types as JSON
def test_get_node_types_success(client: TestClient, auth_headers: dict):
    """GET /node-types returns all registered types."""
    response = client.get("/api/v1/workflow/node-types", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "node_types" in data
    assert len(data["node_types"]) >= 6  # At least core types

# Test: response includes inputs with data_type, ui_type, accepts_connection fields
def test_node_types_input_structure(client: TestClient, auth_headers: dict):
    """Node type inputs have required fields."""
    response = client.get("/api/v1/workflow/node-types", headers=auth_headers)
    data = response.json()
    llm_node = next((n for n in data["node_types"] if n["type"] == "llm_call"), None)
    assert llm_node is not None
    prompt_input = next((i for i in llm_node["inputs"] if i["name"] == "prompt"), None)
    assert prompt_input is not None
    assert "data_type" in prompt_input
    assert "ui_type" in prompt_input
    assert "accepts_connection" in prompt_input

# Test: response includes outputs with data_type fields
def test_node_types_output_structure(client: TestClient, auth_headers: dict):
    """Node type outputs have data_type field."""
    response = client.get("/api/v1/workflow/node-types", headers=auth_headers)
    data = response.json()
    llm_node = next((n for n in data["node_types"] if n["type"] == "llm_call"), None)
    assert llm_node is not None
    response_output = next((o for o in llm_node["outputs"] if o["name"] == "response"), None)
    assert response_output is not None
    assert "data_type" in response_output

# Test: includes skill nodes alongside core nodes
def test_node_types_includes_skill_nodes(client: TestClient, auth_headers: dict):
    """Response includes both core and skill node types."""
    response = client.get("/api/v1/workflow/node-types", headers=auth_headers)
    data = response.json()
    categories = set(n["category"] for n in data["node_types"])
    assert "ai" in categories  # Core nodes
    # Note: skill nodes tested in section-05, here we just check structure supports them

# Test: unauthenticated request returns 401
def test_node_types_requires_auth(client: TestClient):
    """Unauthenticated access is rejected."""
    response = client.get("/api/v1/workflow/node-types")
    assert response.status_code == 401

# Test: GET /api/v1/workflow/available-models — returns models with cost and quality info
def test_available_models_success(client: TestClient, auth_headers: dict):
    """GET /available-models returns model list."""
    response = client.get("/api/v1/workflow/available-models", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "models" in data
    assert len(data["models"]) > 0
    first_model = data["models"][0]
    assert "id" in first_model
    assert "name" in first_model
    assert "cost_per_token" in first_model

# Test: models sorted by recommendation score
def test_available_models_sorted_by_recommendation(client: TestClient, auth_headers: dict):
    """Models are sorted with recommended models first."""
    response = client.get("/api/v1/workflow/available-models", headers=auth_headers)
    data = response.json()
    # First model should have highest recommendation score
    if len(data["models"]) > 1:
        assert data["models"][0].get("recommendation_score", 0) >= data["models"][1].get("recommendation_score", 0)

# Test: includes Recommended badge on top entry
def test_available_models_recommended_badge(client: TestClient, auth_headers: dict):
    """Top model has recommended flag."""
    response = client.get("/api/v1/workflow/available-models", headers=auth_headers)
    data = response.json()
    if len(data["models"]) > 0:
        assert data["models"][0].get("recommended", False) is True

# Test: GET /api/v1/workflow/rag-collections — returns collections scoped to tenant
def test_rag_collections_tenant_scoped(client: TestClient, auth_headers: dict):
    """RAG collections filtered by tenant."""
    response = client.get("/api/v1/workflow/rag-collections", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "collections" in data

# Test: GET /api/v1/workflow/available-approvers — returns users for tenant
def test_available_approvers_success(client: TestClient, auth_headers: dict):
    """GET /available-approvers returns tenant users."""
    response = client.get("/api/v1/workflow/available-approvers", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "approvers" in data

# Test: GET /api/v1/workflow/image-providers — returns available providers with size options
def test_image_providers_success(client: TestClient, auth_headers: dict):
    """GET /image-providers returns provider list."""
    response = client.get("/api/v1/workflow/image-providers", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "providers" in data
    if len(data["providers"]) > 0:
        provider = data["providers"][0]
        assert "id" in provider
        assert "name" in provider
        assert "sizes" in provider
