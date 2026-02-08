# Section 10: Flow Compiler Implementation

**Phase**: 3 - Virtual Flow Builder
**Estimated Time**: 6-7 days
**Priority**: Critical
**Dependencies**: Sections 06, 09

---

## Overview

Compile ReactFlow JSON to LangGraph StateGraph (preset node library approach).

---

## Goals

- ✅ Compiler validates flow structure
- ✅ Each node type maps to Python function
- ✅ Loops have max iteration limits
- ✅ Conditionals use safe expression evaluation
- ✅ Compiled manifest validates against schema

---

## Implementation

```python
# app/orchestrator/flow_compiler.py
class FlowCompiler:
    def compile(self, flow_json: dict) -> dict:
        """Compile ReactFlow JSON to manifest"""
        manifest = {"nodes": [], "edges": []}

        for node in flow_json["nodes"]:
            if node["type"] == "llm":
                manifest["nodes"].append({
                    "id": node["id"],
                    "function": "llm_call_node",
                    "params": node["data"]["config"]
                })
            elif node["type"] == "approval":
                manifest["nodes"].append({
                    "id": node["id"],
                    "function": "approval_gate_node",
                    "params": {"gate_id": node["data"]["gate_id"]}
                })
            elif node["type"] == "loop":
                if "max_iterations" not in node["data"]:
                    raise CompilationError("Loop requires max_iterations")
                manifest["nodes"].append({
                    "id": node["id"],
                    "function": "loop_node",
                    "params": node["data"]
                })

        manifest["edges"] = flow_json["edges"]

        # Validate compiled manifest
        validate_manifest(manifest)

        return manifest
```

---

## Completion Checklist

- [ ] Compiler implemented
- [ ] Validation works
- [ ] Loop limits enforced
- [ ] Tests pass

**Estimated Completion**: 6-7 days
