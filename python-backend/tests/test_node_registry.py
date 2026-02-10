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
