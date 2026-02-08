Now I'll generate the section content for section-06-loop-executor. Let me extract the relevant information from the plans and create a complete, self-contained implementation section.

# Section 06: Loop Executor + Loop Group

## Overview

This section implements the Loop node executor and compiler support for explicit loop groups. The Loop node iterates over data or repeats operations using one of three modes: **count** (fixed iterations), **data** (array iteration), or **while** (condition-based). Unlike implicit cycle detection, this design uses ReactFlow's parent-child node relationships to define an explicit Loop Group — nodes placed inside the loop container become the loop body.

**Dependencies:**
- Section 02 (Node Registry) — Loop node type must be registered
- Existing services: Expression resolver (for `while` and `breakCondition`), `simpleeval` library

**What this enables:**
- Count-based loops: Repeat N times
- Data iteration: Process each item in an array
- While loops: Continue until condition becomes false
- Loop state tracking: Current iteration index, accumulated results
- Safety limits: Max iterations (default 100), break conditions
- Parent-child node relationships in ReactFlow for visual loop grouping

---

## Tests First

Before implementing, write these tests in `python-backend/tests/test_loop_executor.py`:

```python
# tests/test_loop_executor.py

import pytest
from app.orchestrator.node_executors.loop_executor import LoopExecutor
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

# Test: loop — count mode executes body N times
# Expected: 5 iterations, results array has 5 entries, final index is 4

# Test: loop — data mode iterates over array, setting item variable each iteration
# Expected: 3 iterations for array of 3 items, each iteration receives correct item

# Test: loop — while mode evaluates condition each iteration, stops when false
# Expected: Loop stops when condition evaluates to false, partial results collected

# Test: loop — maxIterations safety limit prevents infinite loops (default 100)
# Expected: Loop stops after 100 iterations even if while condition still true

# Test: loop — breakCondition expression stops loop mid-execution
# Expected: Loop terminates early when breakCondition evaluates to true

# Test: loop — results array collects all iteration outputs
# Expected: Each iteration output appended to results array

# Test: loop — index variable increments each iteration
# Expected: index starts at 0, increments to N-1

# Test: loop — empty array in data mode produces empty results (zero iterations)
# Expected: No iterations executed, results array is empty

# Test: loop — nested data access (iterating over array of dicts)
# Expected: itemVariable correctly references dict fields (e.g., item.name)
```

Write these tests in `python-backend/tests/test_loop_group_compiler.py`:

```python
# tests/test_loop_group_compiler.py

import pytest
from app.orchestrator.flow_compiler import FlowCompiler

# Test: FlowCompiler — detects parent-child node relationships (parentId)
# Expected: Nodes with parentId field identified as loop body nodes

# Test: FlowCompiler — identifies loop body nodes from parent-child hierarchy
# Expected: All child nodes of loop node marked as loop body

# Test: FlowCompiler — validates loop body contains at least one node
# Expected: Empty loop body raises CompilationError

# Test: FlowCompiler — rejects cycles outside of explicit loop groups
# Expected: Cycle detection ignores edges within loop groups, rejects other cycles
```

---

## Background

### Why Explicit Loop Groups?

Implicit cycle detection (detecting edges that point backwards) is fragile — it's difficult to distinguish intentional loops from accidental cycles, and UI feedback is unclear. Instead, we use **explicit Loop Groups**: the Loop node acts as a visual container. Users drag nodes inside it to define the loop body. ReactFlow supports parent-child node relationships via the `parentId` field.

### Loop Modes

1. **Count mode:** User specifies `iterations` (integer). Loop executes body exactly N times.
2. **Data mode:** User connects an array input. Loop iterates over each item, setting `itemVariable` to the current item each iteration.
3. **While mode:** User specifies a `condition` expression (evaluated with `simpleeval`). Loop continues while condition is true.

All modes respect `maxIterations` (default 100) to prevent infinite loops. Optional `breakCondition` allows early termination.

### Loop State

During execution, the loop executor maintains state:
- **Current iteration index** (0-based)
- **Current item** (in data mode)
- **Accumulated results** (array of outputs from each iteration)

This state is accessible to loop body nodes via the execution context.

---

## Implementation Details

### 1. Loop Node Type Definition

Add to the node registry (`python-backend/app/orchestrator/node_registry.py`):

```python
NodeTypeSpec(
    type="loop",
    display_name="Loop",
    description="Iterate over data or repeat operations",
    icon="Repeat",  # Lucide icon
    color="purple",
    category="flow_control",
    inputs=[
        InputSpec(
            name="data",
            display_name="Data",
            data_type="any",
            ui_type="text",
            required=False,
            accepts_connection=True,
            placeholder="Connect array for data iteration",
        ),
    ],
    outputs=[
        OutputSpec(
            name="item",
            display_name="Current Item",
            data_type="any",
        ),
        OutputSpec(
            name="index",
            display_name="Current Index",
            data_type="number",
        ),
        OutputSpec(
            name="results",
            display_name="Results",
            data_type="array",
        ),
    ],
    executor="app.orchestrator.node_executors.loop_executor.LoopExecutor",
)
```

**Configuration fields** (stored in `node_config`, NOT input ports):
- `loopType` (select: "count" | "data" | "while")
- `iterations` (number, for count mode, default: 1)
- `itemVariable` (text, for data mode, default: "item")
- `condition` (expression, for while mode)
- `maxIterations` (number, default: 100)
- `breakCondition` (expression, optional)

### 2. LoopExecutor Implementation

File: `python-backend/app/orchestrator/node_executors/loop_executor.py`

**Stub with docstring:**

```python
"""
Loop executor for count, data, and while iteration modes.
Manages loop state, executes child sub-graph per iteration, collects results.
"""

from typing import Any
from app.orchestrator.node_executors.base import NodeExecutor, ExecutionContext, NodeExecutionData
from app.orchestrator.expression_resolver import resolve_expression, ExpressionResolutionError
import simpleeval

class LoopExecutor(NodeExecutor):
    """
    Executes loop iterations with three modes:
    - count: Fixed number of iterations
    - data: Iterate over array items
    - while: Continue while condition is true
    """
    
    async def execute(
        self,
        node_config: dict,
        inputs: dict[str, NodeExecutionData],
        context: ExecutionContext,
    ) -> dict[str, NodeExecutionData]:
        """
        Execute loop iterations.
        
        Args:
            node_config: Loop configuration (loopType, iterations, condition, etc.)
            inputs: Input data (data array for data mode)
            context: Execution context with child node graph reference
        
        Returns:
            dict with keys:
                - results: Array of all iteration outputs
                - item: Final iteration item (for compatibility)
                - index: Final iteration index
        
        Raises:
            ValueError: Invalid loop configuration
            ExpressionResolutionError: Invalid condition/breakCondition
        """
        pass  # Implementation details omitted (stub only)
```

**Key implementation steps** (documented, not fully coded):

1. **Read loop configuration:**
   - `loopType = node_config.get("loopType", "count")`
   - `maxIterations = node_config.get("maxIterations", 100)`
   - `breakCondition = node_config.get("breakCondition")`

2. **Initialize loop state:**
   - `results = []`
   - `index = 0`

3. **Determine iteration source:**
   - **Count mode:** `range(node_config["iterations"])`
   - **Data mode:** `inputs["data"].json` (must be array)
   - **While mode:** Evaluate `node_config["condition"]` each iteration

4. **Iteration loop:**
   ```python
   while index < maxIterations:
       # Set loop variables in context
       context.set_loop_variable("index", index)
       if loopType == "data":
           context.set_loop_variable(itemVariable, current_item)
       
       # Execute child sub-graph
       iteration_output = await execute_loop_body(context)
       results.append(iteration_output)
       
       # Check break condition
       if breakCondition and evaluate_break_condition(breakCondition, context):
           break
       
       # Check while condition (if applicable)
       if loopType == "while" and not evaluate_condition(node_config["condition"], context):
           break
       
       index += 1
   ```

5. **Return results:**
   ```python
   return {
       "results": NodeExecutionData(json=results),
       "item": NodeExecutionData(json=results[-1] if results else None),
       "index": NodeExecutionData(json=index),
   }
   ```

**Safety measures:**
- `maxIterations` enforced (default 100, configurable)
- `simpleeval` timeout (5 seconds) for condition evaluation
- Empty array in data mode → zero iterations (not an error)
- Invalid condition expression → raise `ExpressionResolutionError`

### 3. Loop Body Execution

The loop executor needs a reference to the child nodes (loop body). The `ExecutionContext` must provide:
- `get_loop_body_nodes() -> list[str]` — Returns list of child node IDs
- `set_loop_variable(name: str, value: Any)` — Sets loop variable for child nodes
- `execute_subgraph(node_ids: list[str]) -> dict` — Executes child nodes and returns outputs

**Integration with FlowCompiler:**
- During compilation, the compiler detects parent-child relationships
- Nodes with `parentId` matching the loop node ID are marked as loop body
- Compiler stores loop body node IDs in the compiled workflow metadata

### 4. FlowCompiler Updates

File: `python-backend/app/orchestrator/flow_compiler.py`

**Changes needed:**

1. **Detect parent-child relationships:**
   ```python
   for node in workflow_json["nodes"]:
       if "parentId" in node:
           parent_id = node["parentId"]
           child_id = node["id"]
           # Store in loop_groups dict: {parent_id: [child_id1, child_id2, ...]}
   ```

2. **Validate loop bodies:**
   ```python
   for loop_node_id, body_node_ids in loop_groups.items():
       if not body_node_ids:
           raise CompilationError(f"Loop node {loop_node_id} has no body nodes")
   ```

3. **Cycle detection with loop exemption:**
   ```python
   # When building dependency graph, ignore edges within loop groups
   for edge in edges:
       if is_edge_within_loop_group(edge, loop_groups):
           continue  # Don't add to DAG (loop-internal edge)
       dag.add_edge(edge.source, edge.target)
   
   # Then check for cycles in the DAG (should be acyclic outside loops)
   ```

4. **Store loop metadata in compiled output:**
   ```python
   compiled_workflow["loop_groups"] = loop_groups
   ```

### 5. ReactFlow Parent-Child Setup (Frontend Context)

Although this is primarily a backend section, the frontend must support parent-child nodes. Here's what the frontend team needs to know:

**Node structure for loop containers:**
```typescript
const loopNode: Node = {
  id: "loop-1",
  type: "workflow",
  data: {
    nodeType: "loop",
    label: "Loop",
    config: { loopType: "count", iterations: 5 },
  },
  position: { x: 100, y: 100 },
  style: {
    width: 400,
    height: 300,
    border: "2px dashed #8b5cf6",
    backgroundColor: "rgba(139, 92, 246, 0.05)",
  },
};

const childNode: Node = {
  id: "llm-1",
  type: "workflow",
  data: { nodeType: "llm_call", label: "LLM Call" },
  parentId: "loop-1",  // This makes it a child of the loop
  position: { x: 50, y: 50 },  // Relative to parent
  extent: "parent",  // Constrain within parent bounds
};
```

**ReactFlow configuration:**
```typescript
<ReactFlow
  nodes={nodes}
  edges={edges}
  nodeTypes={nodeTypes}
  onNodesChange={onNodesChange}
  // ... other props
/>
```

ReactFlow automatically handles parent-child rendering and drag constraints.

---

## File Paths Summary

**Create:**
- `python-backend/app/orchestrator/node_executors/loop_executor.py` — LoopExecutor class
- `python-backend/tests/test_loop_executor.py` — Executor tests
- `python-backend/tests/test_loop_group_compiler.py` — Compiler integration tests

**Modify:**
- `python-backend/app/orchestrator/node_registry.py` — Add loop node type
- `python-backend/app/orchestrator/flow_compiler.py` — Parent-child detection, loop validation, cycle exemption
- `python-backend/app/orchestrator/node_executors/__init__.py` — Register LoopExecutor

**Frontend context (for later sections):**
- `apps/web/client/src/components/workflow/nodes/BaseNode.tsx` — Render loop container styling
- `apps/web/client/src/components/workflow/config/LoopConfig.tsx` — Loop mode selector (count/data/while)

---

## Integration Points

### With Expression Resolver (Section 04)
- `while` condition uses `resolve_expression()` to evaluate expressions like `{{index}} < 10`
- `breakCondition` uses the same resolver
- Loop variables (`index`, `item`) must be accessible to expressions

### With Node Executors (Section 03)
- Loop body may contain LLM, RAG, Conditional, or any other node type
- Each iteration executes the full child sub-graph
- Child node outputs become loop iteration results

### With FlowCompiler (Section 07)
- Compiler provides loop body node IDs to executor
- Compiler validates loop structure during compilation
- Compiled workflow includes loop metadata

---

## Security & Safety

1. **Max iterations enforcement:** Default 100, configurable per loop, enforced before each iteration.
2. **Condition evaluation timeout:** `simpleeval` evaluator has 5-second timeout to prevent ReDoS or infinite eval loops.
3. **Expression safety:** No `eval()`, no `exec()`, no `__dunder__` access in conditions (handled by `simpleeval` + expression resolver).
4. **Memory limits:** Loop results array size limited by Python's memory, but consider adding max result size (e.g., 10,000 items).
5. **Empty data handling:** Empty array in data mode is valid (zero iterations, empty results).

---

## Testing Checklist

Before marking this section complete, ensure all tests pass:

- [ ] Count mode: 5 iterations → 5 results
- [ ] Data mode: Array of 3 items → 3 iterations, correct item each time
- [ ] While mode: Condition false after N iterations → loop stops
- [ ] Max iterations: While true loop stops at 100 iterations
- [ ] Break condition: Mid-loop break → partial results
- [ ] Empty array: Zero iterations → empty results
- [ ] Nested data: Array of dicts → `item.field` access works
- [ ] Parent-child detection: Compiler finds loop body nodes
- [ ] Empty loop body: Compilation error raised
- [ ] Cycle exemption: Edges within loop group ignored by DAG validator

---

## Next Steps

After completing this section:
- **Section 07 (FlowCompiler)** will integrate loop validation into the full compilation pipeline
- **Section 11 (DynamicNodeConfig)** will build the frontend loop configuration UI (mode selector, condition builder)
- **Section 15 (Integration Tests)** will test end-to-end loop workflows (e.g., data loop over array → LLM call per item → collect results)