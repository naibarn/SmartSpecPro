Now I have all the context. Let me generate the section content for section-07-compiler. Based on the index.md, this section is about FlowCompiler Updates. Let me extract the relevant content from the plan and TDD documents.

# Section 07: FlowCompiler Updates

## Overview

This section updates the existing `FlowCompiler` (`python-backend/app/orchestrator/flow_compiler.py`) to support the new node type registry system, validate typed port connections, detect explicit loop groups, and generate expression metadata. The compiler transforms a ReactFlow graph (nodes + edges) into an executable workflow specification.

**Key Changes from Current Implementation:**
- Replace hardcoded `NODE_TYPE_MAP` with dynamic registry loading
- Add port type compatibility validation for all edges
- Detect loop groups via parent-child node relationships
- Validate all required inputs are configured or connected
- Generate expression resolution metadata
- Validate DAG structure (no cycles except explicit loop groups)
- Support skill nodes alongside core nodes

**Dependencies:**
- Section 02 (Node Registry) — Registry must exist
- Section 03 (Node Executors) — Executor interface
- Section 04 (Expression Resolver) — Expression parsing
- Section 05 (Skill Nodes) — Skill node types in registry
- Section 06 (Loop Executor) — Loop group semantics

**Blocks:**
- Section 08 (Workflow API) — Depends on working compiler

---

## Tests First

```python
# python-backend/tests/test_flow_compiler_v2.py

import pytest
from app.orchestrator.flow_compiler import FlowCompiler
from app.orchestrator.node_registry import NodeRegistry
from app.orchestrator.exceptions import CompilationError


@pytest.fixture
def compiler():
    """FlowCompiler instance with registry."""
    return FlowCompiler(registry=NodeRegistry.get_instance())


@pytest.fixture
def simple_llm_flow():
    """Simple flow: single LLM Call node."""
    return {
        "nodes": [
            {
                "id": "llm-1",
                "type": "workflow",
                "data": {
                    "nodeType": "llm_call",
                    "label": "LLM Call",
                    "config": {
                        "prompt": "Write a poem",
                        "model": "gpt-4o-mini",
                        "temperature": 0.7
                    }
                }
            }
        ],
        "edges": []
    }


@pytest.fixture
def connected_flow():
    """Flow: RAG Query → LLM Call (RAG output feeds LLM input)."""
    return {
        "nodes": [
            {
                "id": "rag-1",
                "type": "workflow",
                "data": {
                    "nodeType": "rag_query",
                    "label": "RAG Query",
                    "config": {
                        "query": "machine learning",
                        "collection": "docs",
                        "topK": 5
                    }
                }
            },
            {
                "id": "llm-1",
                "type": "workflow",
                "data": {
                    "nodeType": "llm_call",
                    "label": "LLM Call",
                    "config": {
                        "prompt": "Summarize: {{rag-1.context}}",
                        "model": "gpt-4o-mini"
                    }
                }
            }
        ],
        "edges": [
            {
                "id": "e1",
                "source": "rag-1",
                "target": "llm-1",
                "sourceHandle": "context",
                "targetHandle": "contextData"
            }
        ]
    }


# Test: compile — loads node types from registry (not hardcoded NODE_TYPE_MAP)
def test_compile_loads_from_registry(compiler, simple_llm_flow):
    """Compiler loads node types from registry, not hardcoded map."""
    compiled = compiler.compile(simple_llm_flow)
    assert compiled is not None
    assert len(compiled["steps"]) == 1
    assert compiled["steps"][0]["node_type"] == "llm_call"


# Test: compile — validates all node types in flow exist in registry
def test_compile_validates_node_types(compiler):
    """Unknown node type raises CompilationError."""
    flow = {
        "nodes": [
            {
                "id": "unknown-1",
                "type": "workflow",
                "data": {
                    "nodeType": "nonexistent_type",
                    "label": "Unknown Node",
                    "config": {}
                }
            }
        ],
        "edges": []
    }
    with pytest.raises(CompilationError, match="Unknown node type: nonexistent_type"):
        compiler.compile(flow)


# Test: compile — validates port type compatibility for all edges
def test_compile_validates_port_compatibility(compiler):
    """Incompatible port connection raises CompilationError."""
    flow = {
        "nodes": [
            {
                "id": "img-1",
                "type": "workflow",
                "data": {
                    "nodeType": "generate_image",
                    "label": "Image",
                    "config": {"prompt": "sunset"}
                }
            },
            {
                "id": "llm-1",
                "type": "workflow",
                "data": {
                    "nodeType": "llm_call",
                    "label": "LLM",
                    "config": {"prompt": "{{img-1.imageUrl}}", "model": "gpt-4o"}
                }
            }
        ],
        "edges": [
            {
                "id": "e1",
                "source": "img-1",
                "target": "llm-1",
                "sourceHandle": "metadata",  # json type
                "targetHandle": "maxTokens"  # number type
            }
        ]
    }
    # json → number is incompatible (would need explicit conversion)
    with pytest.raises(CompilationError, match="Incompatible port types"):
        compiler.compile(flow)


# Test: compile — incompatible port connection (e.g., image → number) raises CompilationError
def test_compile_rejects_image_to_number(compiler):
    """image → number port connection is invalid."""
    flow = {
        "nodes": [
            {
                "id": "img-1",
                "type": "workflow",
                "data": {
                    "nodeType": "generate_image",
                    "label": "Image",
                    "config": {"prompt": "cat"}
                }
            },
            {
                "id": "llm-1",
                "type": "workflow",
                "data": {
                    "nodeType": "llm_call",
                    "label": "LLM",
                    "config": {"prompt": "test", "model": "gpt-4o"}
                }
            }
        ],
        "edges": [
            {
                "id": "e1",
                "source": "img-1",
                "target": "llm-1",
                "sourceHandle": "imageUrl",  # image type
                "targetHandle": "maxTokens"  # number type
            }
        ]
    }
    with pytest.raises(CompilationError, match="Incompatible port types: image -> number"):
        compiler.compile(flow)


# Test: compile — validates all required inputs are either configured or connected
def test_compile_validates_required_inputs(compiler):
    """Missing required input raises CompilationError."""
    flow = {
        "nodes": [
            {
                "id": "llm-1",
                "type": "workflow",
                "data": {
                    "nodeType": "llm_call",
                    "label": "LLM Call",
                    "config": {
                        # Missing required 'prompt' and 'model'
                        "temperature": 0.7
                    }
                }
            }
        ],
        "edges": []
    }
    with pytest.raises(CompilationError, match="Missing required input"):
        compiler.compile(flow)


# Test: compile — missing required input raises CompilationError with node name and input name
def test_compile_error_message_includes_node_and_input(compiler):
    """Error message identifies which node and input is missing."""
    flow = {
        "nodes": [
            {
                "id": "llm-1",
                "type": "workflow",
                "data": {
                    "nodeType": "llm_call",
                    "label": "My LLM Node",
                    "config": {
                        "model": "gpt-4o"
                        # Missing 'prompt'
                    }
                }
            }
        ],
        "edges": []
    }
    with pytest.raises(CompilationError, match="Node 'llm-1' \\(My LLM Node\\): Missing required input 'prompt'"):
        compiler.compile(flow)


# Test: compile — detects loop groups from parent-child relationships
def test_compile_detects_loop_groups(compiler):
    """Loop node with child nodes creates a loop group in compiled output."""
    flow = {
        "nodes": [
            {
                "id": "loop-1",
                "type": "workflow",
                "data": {
                    "nodeType": "loop",
                    "label": "Loop",
                    "config": {
                        "loopType": "count",
                        "iterations": 3
                    }
                }
            },
            {
                "id": "llm-1",
                "type": "workflow",
                "parentId": "loop-1",  # Child of loop-1
                "data": {
                    "nodeType": "llm_call",
                    "label": "LLM in Loop",
                    "config": {
                        "prompt": "Iteration {{loop-1.index}}",
                        "model": "gpt-4o-mini"
                    }
                }
            }
        ],
        "edges": []
    }
    compiled = compiler.compile(flow)
    assert "loop_groups" in compiled
    assert "loop-1" in compiled["loop_groups"]
    assert "llm-1" in compiled["loop_groups"]["loop-1"]["body_nodes"]


# Test: compile — validates DAG structure (no cycles outside loop groups)
def test_compile_rejects_cycles(compiler):
    """Cycle detection outside explicit loop groups raises CompilationError."""
    flow = {
        "nodes": [
            {
                "id": "llm-1",
                "type": "workflow",
                "data": {
                    "nodeType": "llm_call",
                    "label": "LLM 1",
                    "config": {"prompt": "{{llm-2.response}}", "model": "gpt-4o"}
                }
            },
            {
                "id": "llm-2",
                "type": "workflow",
                "data": {
                    "nodeType": "llm_call",
                    "label": "LLM 2",
                    "config": {"prompt": "{{llm-1.response}}", "model": "gpt-4o"}
                }
            }
        ],
        "edges": [
            {"id": "e1", "source": "llm-1", "target": "llm-2"},
            {"id": "e2", "source": "llm-2", "target": "llm-1"}  # Creates cycle
        ]
    }
    with pytest.raises(CompilationError, match="Cycle detected"):
        compiler.compile(flow)


# Test: compile — generates expression resolution metadata
def test_compile_generates_expression_metadata(compiler, connected_flow):
    """Compiled output includes expression metadata for resolution."""
    compiled = compiler.compile(connected_flow)
    # Check that llm-1 step has expression metadata
    llm_step = next(s for s in compiled["steps"] if s["node_id"] == "llm-1")
    assert "expressions" in llm_step
    assert "prompt" in llm_step["expressions"]
    assert llm_step["expressions"]["prompt"] == ["rag-1.context"]


# Test: compile — handles skill nodes alongside core nodes
def test_compile_handles_skill_nodes(compiler):
    """Skill nodes from registry are compiled correctly."""
    flow = {
        "nodes": [
            {
                "id": "skill-1",
                "type": "workflow",
                "data": {
                    "nodeType": "skill_enhance_prompt",  # Assuming this exists in registry
                    "label": "Enhance Prompt",
                    "config": {
                        "prompt": "Write a story"
                    }
                }
            }
        ],
        "edges": []
    }
    # This test assumes skill nodes are registered — may need fixture setup
    try:
        compiled = compiler.compile(flow)
        assert compiled is not None
        assert compiled["steps"][0]["node_type"] == "skill_enhance_prompt"
    except CompilationError as e:
        # If skill not registered, that's expected — this test validates the compiler
        # doesn't crash on skill nodes
        if "Unknown node type" in str(e):
            pytest.skip("Skill node not registered in test environment")
        raise


# Test: compile — enforces loop max iterations in compilation output
def test_compile_includes_loop_max_iterations(compiler):
    """Loop config includes max iterations safety limit."""
    flow = {
        "nodes": [
            {
                "id": "loop-1",
                "type": "workflow",
                "data": {
                    "nodeType": "loop",
                    "label": "Loop",
                    "config": {
                        "loopType": "while",
                        "condition": "{{someVar}} < 10",
                        "maxIterations": 50  # Custom limit
                    }
                }
            }
        ],
        "edges": []
    }
    compiled = compiler.compile(flow)
    loop_step = compiled["steps"][0]
    assert loop_step["config"]["maxIterations"] == 50


# Additional edge case tests

def test_compile_accepts_optional_inputs_missing(compiler):
    """Optional inputs can be omitted without error."""
    flow = {
        "nodes": [
            {
                "id": "llm-1",
                "type": "workflow",
                "data": {
                    "nodeType": "llm_call",
                    "label": "LLM",
                    "config": {
                        "prompt": "Hello",
                        "model": "gpt-4o"
                        # systemPrompt (optional) is missing — should be OK
                    }
                }
            }
        ],
        "edges": []
    }
    compiled = compiler.compile(flow)
    assert compiled is not None


def test_compile_empty_flow(compiler):
    """Empty flow (no nodes) compiles without error."""
    flow = {"nodes": [], "edges": []}
    compiled = compiler.compile(flow)
    assert compiled["steps"] == []


def test_compile_disconnected_nodes(compiler):
    """Multiple disconnected nodes compile as parallel steps."""
    flow = {
        "nodes": [
            {
                "id": "llm-1",
                "type": "workflow",
                "data": {
                    "nodeType": "llm_call",
                    "label": "LLM 1",
                    "config": {"prompt": "A", "model": "gpt-4o"}
                }
            },
            {
                "id": "llm-2",
                "type": "workflow",
                "data": {
                    "nodeType": "llm_call",
                    "label": "LLM 2",
                    "config": {"prompt": "B", "model": "gpt-4o"}
                }
            }
        ],
        "edges": []
    }
    compiled = compiler.compile(flow)
    assert len(compiled["steps"]) == 2
```

---

## Implementation Details

### File: `python-backend/app/orchestrator/flow_compiler.py`

**Current state:** Exists with hardcoded `NODE_TYPE_MAP` (14 node types). Has compilation logic but references non-existent executor functions.

**Changes needed:**

1. **Replace hardcoded NODE_TYPE_MAP with registry**

```python
from app.orchestrator.node_registry import NodeRegistry

class FlowCompiler:
    def __init__(self, registry: NodeRegistry | None = None):
        self.registry = registry or NodeRegistry.get_instance()
    
    def compile(self, flow: dict) -> dict:
        """Compile ReactFlow graph to executable workflow."""
        # Load node types from registry dynamically
        # ...
```

2. **Add port type compatibility validation**

Use the type compatibility matrix from Section 2:
- `text` → `text`, `any`
- `json` → `json`, `text` (auto-stringify), `any`
- `array` → `array`, `json`, `any`
- `image` → `image`, `any`
- `number` → `number`, `text`, `any`
- `boolean` → `boolean`, `any`
- `any` → accepts all types

```python
def _validate_edge_compatibility(self, edge: dict, nodes_by_id: dict) -> None:
    """Validate source and target port data types are compatible."""
    source_node = nodes_by_id[edge["source"]]
    target_node = nodes_by_id[edge["target"]]
    
    source_type_spec = self.registry.get_node_type(source_node["data"]["nodeType"])
    target_type_spec = self.registry.get_node_type(target_node["data"]["nodeType"])
    
    source_output = next(
        (o for o in source_type_spec.outputs if o.name == edge["sourceHandle"]),
        None
    )
    target_input = next(
        (i for i in target_type_spec.inputs if i.name == edge["targetHandle"]),
        None
    )
    
    if not source_output or not target_input:
        raise CompilationError(f"Invalid handle reference in edge {edge['id']}")
    
    if not self._is_compatible_type(source_output.data_type, target_input.data_type):
        raise CompilationError(
            f"Incompatible port types: {source_output.data_type} -> {target_input.data_type}"
        )

def _is_compatible_type(self, source_type: str, target_type: str) -> bool:
    """Check if source type can connect to target type."""
    if target_type == "any":
        return True
    if source_type == target_type:
        return True
    if target_type == "text" and source_type in ("json", "number", "boolean"):
        return True  # Auto-stringify
    if target_type == "json" and source_type == "array":
        return True
    if target_type == "array" and source_type == "json":
        return True
    return False
```

3. **Validate required inputs**

```python
def _validate_required_inputs(self, node: dict) -> None:
    """Ensure all required inputs are configured or connected."""
    node_type_spec = self.registry.get_node_type(node["data"]["nodeType"])
    config = node["data"].get("config", {})
    
    for input_spec in node_type_spec.inputs:
        if not input_spec.required:
            continue
        
        # Check if value is in config
        if input_spec.name in config and config[input_spec.name]:
            continue
        
        # Check if input is connected (edge exists with this node as target)
        if self._is_input_connected(node["id"], input_spec.name):
            continue
        
        # Required input missing
        raise CompilationError(
            f"Node '{node['id']}' ({node['data']['label']}): "
            f"Missing required input '{input_spec.name}'"
        )

def _is_input_connected(self, node_id: str, input_name: str) -> bool:
    """Check if an input has an incoming edge."""
    return any(
        e["target"] == node_id and e["targetHandle"] == input_name
        for e in self.flow["edges"]
    )
```

4. **Detect loop groups**

```python
def _detect_loop_groups(self, nodes: list) -> dict:
    """Identify loop nodes and their children (body nodes)."""
    loop_groups = {}
    
    for node in nodes:
        if node["data"]["nodeType"] == "loop":
            loop_id = node["id"]
            body_nodes = [
                n["id"] for n in nodes
                if n.get("parentId") == loop_id
            ]
            loop_groups[loop_id] = {
                "body_nodes": body_nodes,
                "config": node["data"]["config"]
            }
    
    return loop_groups
```

5. **Generate expression metadata**

Parse `{{nodeId.output}}` tokens from all text fields and store references.

```python
import re

EXPRESSION_PATTERN = re.compile(r'\{\{([^}]+)\}\}')

def _extract_expressions(self, config: dict) -> dict[str, list[str]]:
    """Extract {{nodeId.output}} expressions from config values."""
    expressions = {}
    
    for key, value in config.items():
        if not isinstance(value, str):
            continue
        
        matches = EXPRESSION_PATTERN.findall(value)
        if matches:
            expressions[key] = matches
    
    return expressions
```

6. **Validate DAG structure (no cycles)**

Use topological sort to detect cycles outside of loop groups.

```python
def _validate_dag(self, nodes: list, edges: list, loop_groups: dict) -> None:
    """Ensure graph is a DAG (no cycles except in loop groups)."""
    # Build adjacency list, excluding loop body internal edges
    graph = defaultdict(list)
    
    for edge in edges:
        source = edge["source"]
        target = edge["target"]
        
        # Skip edges inside loop bodies (they're expected to form cycles)
        if self._is_edge_inside_loop(source, target, loop_groups):
            continue
        
        graph[source].append(target)
    
    # Topological sort — raises error if cycle detected
    visited = set()
    rec_stack = set()
    
    def has_cycle(node_id: str) -> bool:
        visited.add(node_id)
        rec_stack.add(node_id)
        
        for neighbor in graph[node_id]:
            if neighbor not in visited:
                if has_cycle(neighbor):
                    return True
            elif neighbor in rec_stack:
                return True
        
        rec_stack.remove(node_id)
        return False
    
    for node in nodes:
        if node["id"] not in visited:
            if has_cycle(node["id"]):
                raise CompilationError("Cycle detected in workflow graph")
```

---

## Compilation Output Format

The compiler produces a compiled workflow object:

```python
{
    "steps": [
        {
            "node_id": "llm-1",
            "node_type": "llm_call",
            "label": "LLM Call",
            "config": {
                "prompt": "Write a poem",
                "model": "gpt-4o-mini",
                "temperature": 0.7
            },
            "expressions": {
                "prompt": []  # No expressions in this example
            },
            "inputs": {
                "prompt": {"source": "config"},
                "model": {"source": "config"}
            },
            "outputs": ["response", "usage"]
        }
    ],
    "loop_groups": {
        "loop-1": {
            "body_nodes": ["llm-1", "rag-1"],
            "config": {
                "loopType": "count",
                "iterations": 5,
                "maxIterations": 100
            }
        }
    },
    "edges": [
        {
            "source": "rag-1",
            "target": "llm-1",
            "sourceHandle": "context",
            "targetHandle": "contextData"
        }
    ]
}
```

---

## Error Handling

All validation errors raise `CompilationError` with descriptive messages:

```python
# python-backend/app/orchestrator/exceptions.py

class CompilationError(Exception):
    """Raised when workflow compilation fails validation."""
    pass
```

Error messages must be actionable:
- `"Unknown node type: xyz"` — Node type not in registry
- `"Node 'abc-1' (My Node): Missing required input 'prompt'"` — Identifies exact node and input
- `"Incompatible port types: image -> number"` — Port type mismatch
- `"Cycle detected in workflow graph"` — DAG violation

---

## Integration Points

**With Node Registry (Section 02):**
- Calls `registry.get_node_type(nodeType)` for every node
- Accesses `inputs` and `outputs` lists for validation

**With Expression Resolver (Section 04):**
- Extracts expression tokens and stores in `expressions` metadata
- Resolver will use this metadata at execution time

**With Loop Executor (Section 06):**
- Detects loop nodes and their children
- Stores loop config including `maxIterations` safety limit

**With Workflow Orchestrator (Section 08):**
- Compiled workflow is passed to orchestrator's `execute()` method
- Orchestrator reads `steps`, `loop_groups`, and `edges` to execute workflow

---

## Security Considerations

1. **Max workflow size:** Limit number of nodes (e.g., 100 nodes max) to prevent DoS
2. **Expression validation:** Defer actual expression safety to Expression Resolver (Section 04)
3. **Config validation:** Validate config values against input validation rules (min/max, pattern, etc.)
4. **Loop safety:** Enforce `maxIterations` default (100) if not specified

---

## Testing Strategy

**Unit tests (test_flow_compiler_v2.py):**
- Registry loading
- Port type validation (all compatibility matrix cases)
- Required input validation
- Loop group detection
- DAG cycle detection
- Expression metadata extraction
- Skill node support
- Error message clarity

**Integration with other sections:**
- Registry must be populated before tests run (fixture)
- Skill nodes test may need skill registry setup
- Loop group tests validate parent-child relationships

---

## Implementation Checklist

1. Update `FlowCompiler.__init__()` to accept registry parameter
2. Replace `NODE_TYPE_MAP` lookups with `registry.get_node_type()`
3. Implement `_validate_edge_compatibility()` with type matrix
4. Implement `_validate_required_inputs()`
5. Implement `_detect_loop_groups()`
6. Implement `_extract_expressions()` with regex
7. Implement `_validate_dag()` with topological sort
8. Update `compile()` to call all validation methods
9. Update compiled output format to include `expressions` and `loop_groups`
10. Write all tests in `test_flow_compiler_v2.py`
11. Run tests: `cd python-backend && uv run pytest tests/test_flow_compiler_v2.py -v`
12. Verify 80% coverage for flow_compiler.py

---

## File Paths Reference

**Implementation:**
- `python-backend/app/orchestrator/flow_compiler.py` (update existing file)
- `python-backend/app/orchestrator/exceptions.py` (add CompilationError if not exists)

**Tests:**
- `python-backend/tests/test_flow_compiler_v2.py` (create new test file)

**Dependencies:**
- `python-backend/app/orchestrator/node_registry.py` (Section 02)
- `python-backend/app/orchestrator/node_executors/base.py` (Section 03)
- `python-backend/app/orchestrator/expression_resolver.py` (Section 04)