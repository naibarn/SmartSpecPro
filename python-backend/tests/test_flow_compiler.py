"""Tests for flow_compiler"""
import pytest

from app.orchestrator.flow_compiler import CompilationError, FlowCompiler


@pytest.mark.unit
def test_compile_simple_flow():
    compiler = FlowCompiler()
    flow = {
        "nodes": [
            {
                "id": "n1",
                "type": "llm",
                "data": {"label": "Generate", "config": {"model": "gpt-4"}},
            },
            {
                "id": "n2",
                "type": "approval",
                "data": {"label": "Approve", "config": {"gate_id": "approve_1"}},
            },
        ],
        "edges": [{"source": "n1", "target": "n2"}],
    }
    result = compiler.compile(flow)
    assert len(result["nodes"]) == 2
    assert result["nodes"][0]["type"] == "llm_call"
    assert result["nodes"][1]["type"] == "approval_gate"


@pytest.mark.unit
def test_compile_empty_flow_raises():
    compiler = FlowCompiler()
    with pytest.raises(CompilationError, match="at least one node"):
        compiler.compile({"nodes": [], "edges": []})


@pytest.mark.unit
def test_loop_requires_max_iterations():
    compiler = FlowCompiler()
    flow = {
        "nodes": [{"id": "loop1", "type": "loop", "data": {"config": {}}}],
        "edges": [],
    }
    with pytest.raises(CompilationError, match="max_iterations"):
        compiler.compile(flow)


@pytest.mark.unit
def test_loop_max_iterations_limit():
    compiler = FlowCompiler()
    flow = {
        "nodes": [
            {
                "id": "loop1",
                "type": "loop",
                "data": {"config": {"max_iterations": 200}},
            }
        ],
        "edges": [],
    }
    with pytest.raises(CompilationError, match="cannot exceed 100"):
        compiler.compile(flow)


@pytest.mark.unit
def test_compile_with_metadata():
    compiler = FlowCompiler()
    flow = {"nodes": [{"id": "n1", "type": "llm", "data": {}}], "edges": []}
    metadata = {"name": "my_flow", "version": "2.0.0"}
    result = compiler.compile(flow, metadata=metadata)
    assert result["name"] == "my_flow"
    assert result["version"] == "2.0.0"


@pytest.mark.unit
def test_node_type_mapping():
    compiler = FlowCompiler()
    flow = {
        "nodes": [
            {"id": "n1", "type": "image", "data": {}},
            {"id": "n2", "type": "video", "data": {}},
            {"id": "n3", "type": "combine", "data": {}},
        ],
        "edges": [
            {"source": "n1", "target": "n2"},
            {"source": "n2", "target": "n3"},
        ],
    }
    result = compiler.compile(flow)
    assert result["nodes"][0]["type"] == "generate_image"
    assert result["nodes"][1]["type"] == "generate_video"
    assert result["nodes"][2]["type"] == "combine_videos"
