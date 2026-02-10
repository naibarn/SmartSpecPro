"""Tests for registry-based FlowCompiler."""
import pytest
from app.orchestrator.flow_compiler import FlowCompiler, CompilationError
from app.orchestrator.node_registry import NodeRegistry, NodeTypeSpec, InputSpec, OutputSpec


@pytest.fixture
def compiler():
    """Create FlowCompiler with fresh registry."""
    registry = NodeRegistry()

    # Register test node types
    registry.register_node_type(NodeTypeSpec(
        type="llm_call",
        display_name="LLM Call",
        inputs=[
            InputSpec(name="prompt", display_name="Prompt", data_type="text", ui_type="textarea", required=True),
            InputSpec(name="model", display_name="Model", data_type="text", ui_type="select", required=False),
        ],
        outputs=[
            OutputSpec(name="text", display_name="Generated Text", data_type="text"),
            OutputSpec(name="usage", display_name="Token Usage", data_type="json"),
        ],
        executor="app.orchestrator.node_executors.llm_executor.LLMExecutor",
    ))

    registry.register_node_type(NodeTypeSpec(
        type="conditional",
        display_name="Conditional",
        inputs=[
            InputSpec(name="condition", display_name="Condition", data_type="boolean", ui_type="text", required=True),
        ],
        outputs=[
            OutputSpec(name="true", display_name="True Branch", data_type="any"),
            OutputSpec(name="false", display_name="False Branch", data_type="any"),
        ],
        executor="app.orchestrator.node_executors.conditional_executor.ConditionalExecutor",
    ))

    registry.register_node_type(NodeTypeSpec(
        type="loop",
        display_name="Loop",
        inputs=[
            InputSpec(name="data", display_name="Data", data_type="array", ui_type="text", required=True),
        ],
        outputs=[
            OutputSpec(name="item", display_name="Current Item", data_type="any"),
            OutputSpec(name="results", display_name="Results", data_type="array"),
        ],
        executor="app.orchestrator.node_executors.loop_executor.LoopExecutor",
    ))

    return FlowCompiler(registry=registry)


def test_compile_simple_flow(compiler):
    """Test compiling a simple two-node flow."""
    flow_json = {
        "nodes": [
            {
                "id": "node1",
                "data": {
                    "nodeType": "llm_call",
                    "label": "Generate Text",
                    "config": {"prompt": "Hello {{node0.output.text}}"},
                },
            },
        ],
        "edges": [],
    }

    manifest = compiler.compile(flow_json, metadata={"name": "test_flow"})

    assert manifest["name"] == "test_flow"
    assert len(manifest["steps"]) == 1
    assert manifest["steps"][0]["node_type"] == "llm_call"
    assert manifest["steps"][0]["executor"] == "app.orchestrator.node_executors.llm_executor.LLMExecutor"


def test_detect_expressions(compiler):
    """Test expression detection in node configs."""
    flow_json = {
        "nodes": [
            {
                "id": "node1",
                "data": {
                    "nodeType": "llm_call",
                    "label": "Generate",
                    "config": {"prompt": "Value: {{node0.output.text}}"},
                },
            },
        ],
        "edges": [],
    }

    manifest = compiler.compile(flow_json)

    assert "node1" in manifest["expressions"]
    assert "prompt" in manifest["expressions"]["node1"]


def test_validate_port_compatibility_success(compiler):
    """Test valid port type connection."""
    flow_json = {
        "nodes": [
            {
                "id": "node1",
                "data": {"nodeType": "llm_call", "label": "LLM", "config": {"prompt": "Test"}},
            },
            {
                "id": "node2",
                "data": {"nodeType": "llm_call", "label": "LLM2", "config": {}},
            },
        ],
        "edges": [
            {
                "source": "node1",
                "target": "node2",
                "sourceHandle": "text",
                "targetHandle": "prompt",
            },
        ],
    }

    # Should not raise - text → text is compatible
    manifest = compiler.compile(flow_json)
    assert len(manifest["edges"]) == 1


def test_validate_port_compatibility_failure(compiler):
    """Test incompatible port type connection."""
    flow_json = {
        "nodes": [
            {
                "id": "node1",
                "data": {"nodeType": "llm_call", "label": "LLM", "config": {"prompt": "Test"}},
            },
            {
                "id": "node2",
                "data": {"nodeType": "loop", "label": "Loop", "config": {}},
            },
        ],
        "edges": [
            {
                "source": "node1",
                "target": "node2",
                "sourceHandle": "text",  # text type
                "targetHandle": "data",  # expects array type
            },
        ],
    }

    # Should raise - text → array is incompatible
    with pytest.raises(CompilationError, match="Incompatible port types"):
        compiler.compile(flow_json)


def test_validate_required_inputs_configured(compiler):
    """Test required input validation with configured value."""
    flow_json = {
        "nodes": [
            {
                "id": "node1",
                "data": {
                    "nodeType": "llm_call",
                    "label": "LLM",
                    "config": {"prompt": "Hello world"},  # Required input configured
                },
            },
        ],
        "edges": [],
    }

    # Should succeed - prompt is configured
    manifest = compiler.compile(flow_json)
    assert len(manifest["steps"]) == 1


def test_validate_required_inputs_connected(compiler):
    """Test required input validation with connection."""
    flow_json = {
        "nodes": [
            {
                "id": "node1",
                "data": {"nodeType": "llm_call", "label": "LLM1", "config": {"prompt": "Test"}},
            },
            {
                "id": "node2",
                "data": {"nodeType": "llm_call", "label": "LLM2", "config": {}},  # prompt not configured
            },
        ],
        "edges": [
            {
                "source": "node1",
                "target": "node2",
                "sourceHandle": "text",
                "targetHandle": "prompt",  # But connected from node1
            },
        ],
    }

    # Should succeed - prompt is connected
    manifest = compiler.compile(flow_json)
    assert len(manifest["steps"]) == 2


def test_validate_required_inputs_missing(compiler):
    """Test required input validation fails when missing."""
    flow_json = {
        "nodes": [
            {
                "id": "node1",
                "data": {
                    "nodeType": "llm_call",
                    "label": "LLM",
                    "config": {},  # Missing required 'prompt'
                },
            },
        ],
        "edges": [],
    }

    # Should fail - prompt is neither configured nor connected
    with pytest.raises(CompilationError, match="Missing required input 'prompt'"):
        compiler.compile(flow_json)


def test_detect_loop_groups(compiler):
    """Test loop group detection from parent-child relationships."""
    flow_json = {
        "nodes": [
            {
                "id": "loop1",
                "data": {"nodeType": "loop", "label": "Loop", "config": {"data": "[1,2,3]"}},
            },
            {
                "id": "child1",
                "parentId": "loop1",
                "data": {"nodeType": "llm_call", "label": "LLM", "config": {"prompt": "Test"}},
            },
            {
                "id": "child2",
                "parentId": "loop1",
                "data": {"nodeType": "llm_call", "label": "LLM2", "config": {"prompt": "Test"}},
            },
        ],
        "edges": [],
    }

    manifest = compiler.compile(flow_json)

    assert len(manifest["loop_groups"]) == 1
    assert manifest["loop_groups"][0]["loop_id"] == "loop1"
    assert set(manifest["loop_groups"][0]["child_ids"]) == {"child1", "child2"}


def test_validate_dag_no_cycles(compiler):
    """Test DAG validation passes for acyclic graph."""
    flow_json = {
        "nodes": [
            {"id": "node1", "data": {"nodeType": "llm_call", "label": "N1", "config": {"prompt": "Test"}}},
            {"id": "node2", "data": {"nodeType": "llm_call", "label": "N2", "config": {"prompt": "Test"}}},
            {"id": "node3", "data": {"nodeType": "llm_call", "label": "N3", "config": {"prompt": "Test"}}},
        ],
        "edges": [
            {"from": "node1", "to": "node2", "source": "node1", "target": "node2", "sourceHandle": "text", "targetHandle": "prompt"},
            {"from": "node2", "to": "node3", "source": "node2", "target": "node3", "sourceHandle": "text", "targetHandle": "prompt"},
        ],
    }

    # Should succeed - no cycles
    manifest = compiler.compile(flow_json)
    assert len(manifest["steps"]) == 3


def test_validate_dag_rejects_cycles(compiler):
    """Test DAG validation rejects cycles outside loop groups."""
    flow_json = {
        "nodes": [
            {"id": "node1", "data": {"nodeType": "llm_call", "label": "N1", "config": {"prompt": "Test"}}},
            {"id": "node2", "data": {"nodeType": "llm_call", "label": "N2", "config": {"prompt": "Test"}}},
        ],
        "edges": [
            {"from": "node1", "to": "node2", "source": "node1", "target": "node2", "sourceHandle": "text", "targetHandle": "prompt"},
            {"from": "node2", "to": "node1", "source": "node2", "target": "node1", "sourceHandle": "text", "targetHandle": "prompt"},
        ],
    }

    # Should fail - cycle detected
    with pytest.raises(CompilationError, match="contains cycles"):
        compiler.compile(flow_json)


def test_validate_dag_allows_loop_group_cycles(compiler):
    """Test DAG validation allows cycles within loop groups."""
    flow_json = {
        "nodes": [
            {"id": "loop1", "data": {"nodeType": "loop", "label": "Loop", "config": {"data": "[1,2,3]"}}},
            {
                "id": "child1",
                "parentId": "loop1",
                "data": {"nodeType": "llm_call", "label": "LLM1", "config": {"prompt": "Test"}},
            },
            {
                "id": "child2",
                "parentId": "loop1",
                "data": {"nodeType": "llm_call", "label": "LLM2", "config": {"prompt": "Test"}},
            },
        ],
        "edges": [
            # Cycle within loop group - should be allowed
            {"from": "child1", "to": "child2", "source": "child1", "target": "child2", "sourceHandle": "text", "targetHandle": "prompt"},
            {"from": "child2", "to": "child1", "source": "child2", "target": "child1", "sourceHandle": "text", "targetHandle": "prompt"},
        ],
    }

    # Should succeed - cycles allowed within loop groups
    manifest = compiler.compile(flow_json)
    assert len(manifest["loop_groups"]) == 1


def test_unknown_node_type(compiler):
    """Test compilation fails for unknown node type."""
    flow_json = {
        "nodes": [
            {
                "id": "node1",
                "data": {"nodeType": "unknown_type", "label": "Unknown", "config": {}},
            },
        ],
        "edges": [],
    }

    with pytest.raises(CompilationError, match="Unknown node type: unknown_type"):
        compiler.compile(flow_json)


def test_duplicate_node_ids(compiler):
    """Test compilation fails for duplicate node IDs."""
    flow_json = {
        "nodes": [
            {"id": "node1", "data": {"nodeType": "llm_call", "label": "N1", "config": {"prompt": "Test"}}},
            {"id": "node1", "data": {"nodeType": "llm_call", "label": "N2", "config": {"prompt": "Test"}}},
        ],
        "edges": [],
    }

    with pytest.raises(CompilationError, match="Duplicate node IDs"):
        compiler.compile(flow_json)


def test_edge_references_missing_node(compiler):
    """Test compilation fails for edges referencing non-existent nodes."""
    flow_json = {
        "nodes": [
            {"id": "node1", "data": {"nodeType": "llm_call", "label": "N1", "config": {"prompt": "Test"}}},
        ],
        "edges": [
            {"from": "node1", "to": "node999", "source": "node1", "target": "node999", "sourceHandle": "text", "targetHandle": "prompt"},
        ],
    }

    with pytest.raises(CompilationError, match="Edge target 'node999' not found"):
        compiler.compile(flow_json)


def test_empty_flow(compiler):
    """Test compilation fails for empty flow."""
    flow_json = {"nodes": [], "edges": []}

    with pytest.raises(CompilationError, match="Flow must have at least one node"):
        compiler.compile(flow_json)


def test_metadata_defaults(compiler):
    """Test manifest uses default metadata when not provided."""
    flow_json = {
        "nodes": [
            {"id": "node1", "data": {"nodeType": "llm_call", "label": "N1", "config": {"prompt": "Test"}}},
        ],
        "edges": [],
    }

    manifest = compiler.compile(flow_json)

    assert manifest["name"] == "unnamed_flow"
    assert manifest["version"] == "1.0.0"
    assert manifest["author"] == "user@smartspecpro.com"
    assert manifest["description"] == "Compiled from visual flow editor"
