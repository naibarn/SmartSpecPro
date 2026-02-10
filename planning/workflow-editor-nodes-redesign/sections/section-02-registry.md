Now I have all the context I need. Let me generate the content for section-02-registry by extracting the relevant information from the plans.

# Section 02: Backend Node Type Registry + API Endpoints

## Overview

This section implements the **backend node type registry** as the single source of truth for all workflow node definitions. The frontend will have NO hardcoded node types — it fetches everything from `GET /api/v1/workflow/node-types`. This eliminates frontend/backend sync issues and enables dynamic node types (including auto-generated skill nodes).

**Dependencies:** Requires section-01-schema (database tables).

**Blocks:** All executor sections (03, 04, 05, 06), frontend BaseNode (10).

---

## Architecture

Following n8n's node architecture pattern, each node type declares:
- Typed inputs (with `data_type` for port compatibility and `ui_type` for form rendering)
- Typed outputs (with `data_type` for port compatibility)
- An executor reference (Python dotpath to executor class)

The registry is a singleton that loads core node types on startup. Later sections will add skill node auto-generation to this registry.

---

## Tests (Write These FIRST)

Create `/home/dev/projects/SmartSpecPro/python-backend/tests/test_node_registry.py`:

```python
"""
Tests for node type registry system.
Run: cd python-backend && uv run pytest tests/test_node_registry.py -v
"""
import pytest
from app.orchestrator.node_registry import (
    NodeTypeSpec,
    InputSpec,
    OutputSpec,
    NodeRegistry,
)

# Test: NodeTypeSpec creation — all required fields present
def test_node_type_spec_creation():
    """NodeTypeSpec can be created with all required fields."""
    spec = NodeTypeSpec(
        type="llm_call",
        display_name="LLM Call",
        description="Send prompt to LLM",
        icon="brain",
        color="blue",
        category="ai",
        inputs=[],
        outputs=[],
        executor="app.orchestrator.node_executors.llm_executor.LLMExecutor",
    )
    assert spec.type == "llm_call"
    assert spec.category == "ai"

# Test: InputSpec — data_type and ui_type are separate fields (not conflated)
def test_input_spec_separate_type_fields():
    """InputSpec has distinct data_type and ui_type fields."""
    input_spec = InputSpec(
        name="prompt",
        display_name="Prompt",
        data_type="text",
        ui_type="textarea",
        required=True,
        accepts_connection=True,
    )
    assert input_spec.data_type == "text"
    assert input_spec.ui_type == "textarea"
    assert input_spec.data_type != input_spec.ui_type

# Test: OutputSpec — data_type validates against known types
def test_output_spec_valid_data_types():
    """OutputSpec accepts all valid data types."""
    valid_types = ["text", "json", "array", "image", "number", "boolean", "any"]
    for dt in valid_types:
        spec = OutputSpec(name="output", display_name="Output", data_type=dt)
        assert spec.data_type == dt

# Test: registry — register_node_type adds to registry, get_node_type retrieves it
def test_registry_register_and_retrieve():
    """Can register and retrieve node types from registry."""
    registry = NodeRegistry()
    spec = NodeTypeSpec(
        type="test_node",
        display_name="Test",
        description="Test node",
        icon="test",
        color="gray",
        category="test",
        inputs=[],
        outputs=[],
        executor="app.test.TestExecutor",
    )
    registry.register_node_type(spec)
    retrieved = registry.get_node_type("test_node")
    assert retrieved is not None
    assert retrieved.type == "test_node"

# Test: registry — get_all_node_types returns all registered types
def test_registry_get_all():
    """get_all_node_types returns complete registry."""
    registry = NodeRegistry()
    spec1 = NodeTypeSpec(type="node1", display_name="N1", description="", icon="", color="", category="", inputs=[], outputs=[], executor="")
    spec2 = NodeTypeSpec(type="node2", display_name="N2", description="", icon="", color="", category="", inputs=[], outputs=[], executor="")
    registry.register_node_type(spec1)
    registry.register_node_type(spec2)
    all_types = registry.get_all_node_types()
    assert len(all_types) >= 2
    assert any(t.type == "node1" for t in all_types)
    assert any(t.type == "node2" for t in all_types)

# Test: registry — duplicate type registration raises error
def test_registry_duplicate_registration_error():
    """Registering same type twice raises error."""
    registry = NodeRegistry()
    spec = NodeTypeSpec(type="dup", display_name="Dup", description="", icon="", color="", category="", inputs=[], outputs=[], executor="")
    registry.register_node_type(spec)
    with pytest.raises(ValueError, match="already registered"):
        registry.register_node_type(spec)

# Test: registry — core node types all registered
def test_registry_core_nodes_registered():
    """All core node types are registered on startup."""
    registry = NodeRegistry.get_instance()
    core_types = ["llm_call", "rag_query", "conditional", "loop", "approval_gate", "generate_image"]
    for node_type in core_types:
        spec = registry.get_node_type(node_type)
        assert spec is not None, f"Core node type {node_type} not registered"
```

Create `/home/dev/projects/SmartSpecPro/python-backend/tests/test_node_type_api.py`:

```python
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

# Test: empty list when tenant has no collections
def test_rag_collections_empty(client: TestClient, auth_headers_no_collections: dict):
    """Returns empty array when no collections exist."""
    response = client.get("/api/v1/workflow/rag-collections", headers=auth_headers_no_collections)
    assert response.status_code == 200
    assert response.json()["collections"] == []

# Test: GET /api/v1/workflow/available-approvers — returns users for tenant
def test_available_approvers_success(client: TestClient, auth_headers: dict):
    """GET /available-approvers returns tenant users."""
    response = client.get("/api/v1/workflow/available-approvers", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "approvers" in data

# Test: respects tenant isolation
def test_available_approvers_tenant_isolation(client: TestClient, auth_headers_tenant_a: dict, auth_headers_tenant_b: dict):
    """Each tenant sees only their own users."""
    resp_a = client.get("/api/v1/workflow/available-approvers", headers=auth_headers_tenant_a)
    resp_b = client.get("/api/v1/workflow/available-approvers", headers=auth_headers_tenant_b)
    approvers_a = set(a["id"] for a in resp_a.json()["approvers"])
    approvers_b = set(a["id"] for a in resp_b.json()["approvers"])
    assert approvers_a != approvers_b  # Different tenants have different users

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
```

---

## Implementation Details

### 1. Node Type Data Classes

Create `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_registry.py`:

**Core data structures:**

```python
"""
Node type registry - single source of truth for all workflow node definitions.
"""
from dataclasses import dataclass, field
from typing import Any, Protocol

@dataclass
class InputSpec:
    """Specification for a node input."""
    name: str
    display_name: str
    data_type: str  # Port data type: text, json, array, image, number, boolean, any
    ui_type: str  # UI control: text, textarea, number, slider, select, multiselect, toggle, json_editor
    required: bool
    accepts_connection: bool  # Can receive data from upstream node port
    default: Any = None
    options: list[dict] | None = None  # For select/multiselect (static options)
    options_endpoint: str | None = None  # For dynamic options (API endpoint)
    validation: dict | None = None  # {min, max, pattern, min_length, max_length}
    placeholder: str | None = None

@dataclass
class OutputSpec:
    """Specification for a node output."""
    name: str
    display_name: str
    data_type: str  # Port data type: text, json, array, image, number, boolean, any

@dataclass
class NodeTypeSpec:
    """Complete specification for a node type."""
    type: str  # Unique identifier (e.g., "llm_call")
    display_name: str
    description: str
    icon: str  # Lucide icon name
    color: str  # Tailwind color name (blue, green, purple, etc.)
    category: str  # ai, flow_control, human, skills, media
    inputs: list[InputSpec]
    outputs: list[OutputSpec]
    executor: str  # Python dotpath to executor class (e.g., "app.orchestrator.node_executors.llm_executor.LLMExecutor")
```

**Registry singleton:**

```python
class NodeRegistry:
    """Singleton registry for all node types."""
    _instance = None
    
    def __init__(self):
        self._node_types: dict[str, NodeTypeSpec] = {}
    
    @classmethod
    def get_instance(cls) -> "NodeRegistry":
        """Get singleton instance."""
        if cls._instance is None:
            cls._instance = cls()
            cls._instance._register_core_nodes()
        return cls._instance
    
    def register_node_type(self, spec: NodeTypeSpec) -> None:
        """Register a node type. Raises ValueError if already registered."""
        if spec.type in self._node_types:
            raise ValueError(f"Node type '{spec.type}' is already registered")
        self._node_types[spec.type] = spec
    
    def get_node_type(self, node_type: str) -> NodeTypeSpec | None:
        """Get node type by identifier."""
        return self._node_types.get(node_type)
    
    def get_all_node_types(self) -> list[NodeTypeSpec]:
        """Get all registered node types."""
        return list(self._node_types.values())
    
    def _register_core_nodes(self) -> None:
        """Register core node types."""
        # LLM Call, RAG Query, Conditional, Loop, Approval Gate, Generate Image
        # Full definitions below...
```

**Core node definitions** (define inside `_register_core_nodes`):

- **LLM Call Node:**
  - Inputs: prompt (text, textarea), systemPrompt (text, textarea), model (text, select with options_endpoint), temperature (number, slider), maxTokens (number, number), contextData (json, json_editor)
  - Outputs: response (text), usage (json)
  - Executor: `app.orchestrator.node_executors.llm_executor.LLMExecutor`

- **RAG Query Node:**
  - Inputs: query (text, textarea), collection (text, select with options_endpoint), topK (number, number), searchMode (text, select), scoreThreshold (number, slider), metadataFilter (json, json_editor)
  - Outputs: documents (array), context (text), metadata (json)
  - Executor: `app.orchestrator.node_executors.rag_executor.RAGExecutor`

- **Conditional Node:**
  - Inputs: value (any, accepts_connection)
  - Configuration stored in node config (not input ports): mode, conditions array
  - Outputs: true (any), false (any)
  - Executor: `app.orchestrator.node_executors.conditional_executor.ConditionalExecutor`

- **Loop Node:**
  - Inputs: data (any, accepts_connection)
  - Configuration: loopType, iterations, itemVariable, condition, maxIterations, breakCondition
  - Outputs: item (any), results (array), index (number)
  - Executor: `app.orchestrator.node_executors.loop_executor.LoopExecutor`

- **Approval Gate Node:**
  - Inputs: data (json, accepts_connection)
  - Configuration: approvers (multiselect with options_endpoint), message (textarea), timeout (number), requiredApprovals (number)
  - Outputs: approved (json), rejected (json)
  - Executor: `app.orchestrator.node_executors.approval_executor.ApprovalExecutor`

- **Generate Image Node:**
  - Inputs: prompt (text, textarea), negativePrompt (text, textarea)
  - Configuration: provider (select with options_endpoint), size (select), quality (select), style (select)
  - Outputs: imageUrl (text), metadata (json)
  - Executor: `app.orchestrator.node_executors.image_executor.ImageExecutor`

**Note:** Full input/output definitions should be implemented as specified in the plan. The above are structural examples.

---

### 2. API Endpoints

Add to `/home/dev/projects/SmartSpecPro/python-backend/app/api/workflow.py`:

**Endpoint: GET /api/v1/workflow/node-types**

```python
@router.get("/node-types")
async def get_node_types(
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Get all registered node types.
    Returns core nodes + skill nodes (skill nodes added in section-05).
    """
    registry = NodeRegistry.get_instance()
    node_types = registry.get_all_node_types()
    
    return {
        "node_types": [
            {
                "type": spec.type,
                "display_name": spec.display_name,
                "description": spec.description,
                "icon": spec.icon,
                "color": spec.color,
                "category": spec.category,
                "inputs": [
                    {
                        "name": inp.name,
                        "display_name": inp.display_name,
                        "data_type": inp.data_type,
                        "ui_type": inp.ui_type,
                        "required": inp.required,
                        "accepts_connection": inp.accepts_connection,
                        "default": inp.default,
                        "options": inp.options,
                        "options_endpoint": inp.options_endpoint,
                        "validation": inp.validation,
                        "placeholder": inp.placeholder,
                    }
                    for inp in spec.inputs
                ],
                "outputs": [
                    {
                        "name": out.name,
                        "display_name": out.display_name,
                        "data_type": out.data_type,
                    }
                    for out in spec.outputs
                ],
                "executor": spec.executor,
            }
            for spec in node_types
        ]
    }
```

**Endpoint: GET /api/v1/workflow/available-models**

```python
@router.get("/available-models")
async def get_available_models(
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Get available LLM models with cost and quality info, sorted by recommendation.
    """
    # TODO: Integrate with existing LLM Gateway provider registry
    # For now, return stub structure
    models = [
        {
            "id": "gpt-4o-mini",
            "name": "GPT-4o Mini",
            "provider": "openai",
            "cost_per_token": 0.00015,
            "quality_rating": 8.5,
            "recommendation_score": 9.2,
            "recommended": True,
        },
        # ... more models from provider registry
    ]
    
    # Sort by recommendation_score descending
    models.sort(key=lambda m: m.get("recommendation_score", 0), reverse=True)
    
    return {"models": models}
```

**Endpoint: GET /api/v1/workflow/rag-collections**

```python
@router.get("/rag-collections")
async def get_rag_collections(
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Get RAG collections for current tenant.
    """
    # TODO: Query pgvector collections filtered by tenant_id
    # For now, return stub
    return {
        "collections": [
            {"id": "default", "name": "Default Collection", "doc_count": 42}
        ]
    }
```

**Endpoint: GET /api/v1/workflow/available-approvers**

```python
@router.get("/available-approvers")
async def get_available_approvers(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Get users available as approvers for current tenant.
    """
    # Query users in same tenant
    result = await db.execute(
        select(User.id, User.name, User.email)
        .where(User.tenant_id == current_user.tenant_id)
        .where(User.id != current_user.id)  # Exclude self
    )
    users = result.all()
    
    return {
        "approvers": [
            {"id": u.id, "name": u.name, "email": u.email}
            for u in users
        ]
    }
```

**Endpoint: GET /api/v1/workflow/image-providers**

```python
@router.get("/image-providers")
async def get_image_providers(
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    Get available image generation providers.
    """
    # TODO: Integrate with MediaTaskService provider registry
    return {
        "providers": [
            {
                "id": "openai",
                "name": "DALL-E 3",
                "sizes": ["1024x1024", "1024x1792", "1792x1024"],
                "qualities": ["standard", "hd"],
                "styles": ["natural", "vivid"],
            },
            # ... more providers
        ]
    }
```

---

## Port Type Compatibility Matrix

Define in `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/data_types.py`:

```python
"""
Data type system for workflow node ports.
"""

PORT_TYPE_COMPATIBILITY = {
    "text": {"text", "any"},
    "json": {"json", "text", "any"},  # json can stringify to text
    "array": {"array", "json", "any"},
    "image": {"image", "any"},
    "number": {"number", "text", "any"},
    "boolean": {"boolean", "any"},
    "any": {"text", "json", "array", "image", "number", "boolean", "any"},
}

def is_compatible_connection(source_type: str, target_type: str) -> bool:
    """Check if source port type can connect to target port type."""
    return target_type in PORT_TYPE_COMPATIBILITY.get(source_type, set())
```

---

## File Paths Summary

**New files:**
- `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_registry.py` (registry core)
- `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/data_types.py` (type system)
- `/home/dev/projects/SmartSpecPro/python-backend/tests/test_node_registry.py` (unit tests)
- `/home/dev/projects/SmartSpecPro/python-backend/tests/test_node_type_api.py` (API tests)

**Modified files:**
- `/home/dev/projects/SmartSpecPro/python-backend/app/api/workflow.py` (add 5 new endpoints)

---

## Dependencies

**Requires:** Section 01 (database schema for tenant/user tables used in approvers endpoint).

**Blocks:** Sections 03, 04, 05, 06 (executors need registry), section 10 (frontend needs node-types API).

---

## Validation Checklist

After implementation, verify:

1. All 6 core node types registered on startup
2. GET /node-types returns valid JSON with all fields
3. data_type and ui_type are distinct fields (not the same value)
4. All inputs marked `accepts_connection: true` can receive connections
5. options_endpoint fields reference valid API paths
6. All executors reference valid Python dotpaths (even if classes don't exist yet)
7. Unauthenticated requests return 401
8. available-models returns sorted list with recommended flag on first entry
9. rag-collections and available-approvers respect tenant_id filtering
10. pytest passes all tests in test_node_registry.py and test_node_type_api.py

---

## Security Notes

- All endpoints require authentication (JWT/session)
- Tenant isolation enforced on collections and approvers
- No user input in this section (registry is read-only from frontend perspective)
- Executor dotpaths are not executed here (just stored as strings)

---

## Next Steps

After completing this section:
- **Section 03** can implement LLM, RAG, Conditional, Approval, Image executors
- **Section 04** can build expression resolver
- **Section 05** can add skill node auto-generation to the registry
- **Section 06** can implement loop executor
- **Section 10** can build frontend BaseNode that fetches from node-types API