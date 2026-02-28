# Research Brief: Virtual Workflow Engine (LangGraph-based)

## Findings

SmartSpecPro's virtual workflow engine is a **production-grade LangGraph runtime** that compiles ReactFlow visual workflows into executable state graphs. The engine supports parallel execution, checkpointing, streaming, multi-tenancy, and extensible node types via a registry pattern.

**Key discoveries:**
1. The workflow engine is **fully asynchronous** with strict concurrency control (semaphore-based)
2. Nodes execute via a **protocol-based adapter** system, allowing arbitrary node types to be registered
3. State flows through a **TypedDict with reducers** for safe concurrent updates
4. **No explicit parallel orchestrator node exists yet** — parallel branches are handled via LangGraph's native fan-out edges
5. **Agent/Supervisor integration exists** but agents are currently only used in a separate routing layer, not yet embedded as workflow nodes
6. **Extension points are mature** — adding new node types (like "Agency Node") requires minimal boilerplate

---

## Current Architecture

### 1. LangGraph Runtime (`langgraph_runtime.py`)

**Location:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/langgraph_runtime.py`

**Core class:** `LangGraphRuntime` (lines 26–305)

**Key responsibilities:**
- Lazy-initialize PostgreSQL checkpointer (line 57–67)
- Compile ReactFlow JSON → LangGraph StateGraph (line 82–104)
- Execute compiled graphs with semaphore-bounded concurrency (line 110–164)
- Stream execution events via `astream_events(version="v2")` (line 166–204)
- Resume interrupted workflows from checkpoints (line 210–237)
- Build standardized LangGraph config with multi-tenant thread IDs (line 243–269)

**Key methods:**

```python
async def compile(
    workflow_json: dict[str, Any],
    metadata: dict[str, Any] | None = None,
) -> Any:
    """Compile ReactFlow → LangGraph CompiledStateGraph."""
    # Returns compiled graph ready for execution

async def execute(
    compiled_graph: Any,
    input_data: dict[str, Any],
    config: dict[str, Any],
) -> dict[str, Any]:
    """Execute compiled workflow to completion."""
    # Initializes WorkflowState, runs graph, returns final state

async def execute_stream(
    compiled_graph: Any,
    input_data: dict[str, Any],
    config: dict[str, Any],
) -> AsyncIterator[dict[str, Any]]:
    """Execute with streaming events (astream_events v2)."""
    # Yields LangGraph events for real-time UI updates

async def resume(
    compiled_graph: Any,
    thread_id: str,
    command: Any,
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Resume from interrupt point using LangGraph Command object."""
```

**State management:**
- Thread ID is namespaced as `{tenant_id}:{execution_id}` for multi-tenant isolation
- Concurrency controlled via `asyncio.Semaphore(max_parallel_workflows)` (default: 10)
- Config includes user context, credits, memory services, episodic memory

**Checkpointing:**
- Factory creates PostgreSQL (production) or MemorySaver (testing) checkpointer
- Passed to compiled graph via `graph.compile(checkpointer=...)`
- Enables HITL resumption and failure recovery

---

### 2. Workflow Compiler (`workflow_compiler.py`)

**Location:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/workflow_compiler.py`

**Core class:** `WorkflowCompiler` (lines 40–457)

**Compilation pipeline:**

```
ReactFlow JSON
    ↓ (Phase 1)
Validate graph (DAG, cycles, triggers, port compatibility)
    ↓ (Phase 2)
Build StateGraph by registering nodes + edges
    ↓ (Phase 3)
Compile with checkpointer
    ↓
CompiledStateGraph (ready for execution)
```

**Phase 1: Validation** (`_validate_graph`, lines 104–172):
- **Unique node IDs**: No duplicates
- **Exactly 1 trigger node**: Entry point (types: `manual_trigger`, `event_trigger`, `webhook_trigger`, `schedule_trigger`, `file_upload_trigger`)
- **Edge references**: All sources/targets exist
- **No orphan nodes**: Every non-trigger has ≥1 incoming edge
- **No cycles** (DAG enforcement): DFS-based cycle detection (lines 173–206)
- **Port compatibility**: Source output type compatible with target input type (lines 208–272)

**Phase 2: Graph building** (`_build_state_graph`, lines 278–324):
1. Create `StateGraph(WorkflowState)` with typed state
2. Instantiate executors from registry for each node (lines 302–305)
3. Wrap executors with `make_langgraph_node` adapter (lines 309–315)
4. Register nodes in graph (line 316)
5. Set trigger node as entry point (line 319)
6. Route edges (normal + conditional, lines 321–322)

**Phase 3: Routing** (`_add_edges`, lines 326–421):
- **Terminal nodes** (no outgoing edges): Connect to `END`
- **Conditional nodes** (`if`, `switch`): Generate routing function based on node output
- **Forking nodes**: Multiple outgoing edges = LangGraph parallel fan-out
- **Routing function**: Inspects `node_outputs[node_id]` to determine next node

**Executor instantiation** (lines 423–456):
- Allowlist enforced: Only paths starting with `app.orchestrator.node_executors.*`
- Dynamic import: `importlib.import_module(module_path)`
- Instantiated with no-arg constructor: `cls()`

**Return value:** `CompileResult` with compiled graph + warnings

---

### 3. Node Adapter (`node_adapter.py`)

**Location:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_adapter.py`

**Core function:** `make_langgraph_node()` (lines 24–139)

**Purpose:** Wraps `NodeExecutor` protocol into LangGraph async node function

**Generated node function signature:**
```python
async def _node_fn(state: WorkflowState, config: RunnableConfig) -> dict:
    """
    Executes the wrapped executor and returns a state update.
    """
```

**Execution steps:**
1. **Build ExecutionContext** (lines 50–62):
   - Extract from `config["configurable"]`
   - Include user_id, tenant_id, workflow_id, execution_id, credits_available
   - Pass extra_data (memory_service, episodic_memory, form_values)

2. **Resolve inputs** (lines 64–65):
   - Call `_resolve_inputs(state, node_config)`
   - Replace `{{node_id.field}}` patterns with upstream values from `node_outputs`

3. **Build NodeExecutionData** (lines 68–74):
   ```python
   data = NodeExecutionData(
       node_id=node_id,
       node_type=node_type,
       config=node_config,
       inputs=resolved_inputs,
       state=state.get("node_outputs", {}),  # All upstream outputs
   )
   ```

4. **Execute** (line 85):
   ```python
   output = await executor.execute(data, context)
   ```

5. **Check output size** (line 88):
   - Warn if >1 MB (full externalization to Redis/S3 is TODO)

6. **Return state delta** (lines 100–104):
   ```python
   return {
       "node_outputs": {node_id: output},  # Merged via _merge_dicts reducer
       "current_node": node_id,
       "audit_trail": [audit_entry, audit_complete],
   }
   ```

7. **Error handling** (lines 106–133):
   - Catch all exceptions
   - Log full traceback
   - Return error in state without terminating graph (caller handles)

**Input resolution** (`_resolve_inputs`, lines 142–181):
- Pattern: `{{ref_node_id.field.path}}`
- Regex: `r"\{\{(\w+)\.(\w+(?:\.\w+)*)\}\}"`
- Navigate nested dicts with dot notation
- Return original value if pattern not found

---

### 4. Node Executor Protocol & Base Classes

**Location:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/base.py`

**Data structures:**

```python
@dataclass
class ExecutionContext:
    """Context for node execution."""
    user_id: int
    tenant_id: str | None
    workflow_id: str
    execution_id: str
    credits_available: int = 0
    extra_data: dict[str, Any] = {}  # memory_service, episodic_memory, etc.

@dataclass
class NodeExecutionData:
    """Data passed to executor."""
    node_id: str
    node_type: str
    config: dict[str, Any]          # Static config from visual editor
    inputs: dict[str, Any]          # Resolved values from upstream
    state: dict[str, Any]           # All node_outputs so far

@dataclass
class NodeExecutionResult:
    """Optional structured result (if executor returns this)."""
    outputs: dict[str, Any]
    success: bool = True
    error: str | None = None
    metadata: dict[str, Any] = {}

class NodeExecutor(Protocol):
    """Protocol that all executors must implement."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """Return dict mapping output port names to values."""
        ...
```

**Key insight:** `NodeExecutor` is a **Protocol, not a base class**. Executors only need an `async execute()` method — duck typing is fully supported.

---

### 5. Workflow State (`workflow_state.py`)

**Location:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/workflow_state.py`

**TypedDict with Annotated reducers:**

```python
class WorkflowState(TypedDict, total=False):
    """LangGraph state for workflow execution."""

    # node_outputs: {node_id → result dict} — merge reducer for parallel safety
    node_outputs: Annotated[dict[str, Any], _merge_dicts]

    # current_node: last node executed (last-writer-wins reducer)
    current_node: Annotated[str, _last_value]

    # messages: LLM conversation history (append-only, uses add_messages)
    messages: Annotated[list, add_messages]

    # errors: accumulated errors (append-only)
    errors: Annotated[list[dict], _append_list]

    # audit_trail: execution events (append-only)
    audit_trail: Annotated[list[dict], _append_list]

    # cache_hits: counter (last-writer-wins)
    cache_hits: Annotated[int, _last_value]

    # schema_version: for checkpoint migration (last-writer-wins)
    schema_version: Annotated[int, _last_value]
```

**Reducers:**
- `_merge_dicts`: Safe dict merge for parallel node updates (no conflicts)
- `_last_value`: Last-writer-wins (for scalar fields)
- `_append_list`: Append-only accumulation (for audit trails, errors)
- `add_messages`: LangGraph's built-in message reducer

**Critical insight:** ALL fields must have a reducer if nodes can run concurrently. LangGraph raises `INVALID_CONCURRENT_GRAPH_UPDATE` otherwise.

---

### 6. Node Registry (`node_registry.py`)

**Location:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_registry.py`

**Core classes:**

```python
@dataclass
class InputSpec:
    """Node input port specification."""
    name: str                          # "prompt", "model", etc.
    display_name: str
    data_type: str                     # text, json, array, image, number, boolean, any
    ui_type: str                       # textarea, select, slider, toggle, json_editor
    required: bool
    accepts_connection: bool           # Can receive upstream data
    default: Any = None
    options: list[dict] | None = None  # Static options for select
    options_endpoint: str | None = None # Dynamic options API endpoint
    validation: dict | None = None     # {min, max, pattern, min_length, max_length}
    depends_on: str | None = None      # Parent field for dependent selects

@dataclass
class OutputSpec:
    """Node output port specification."""
    name: str                          # "response", "usage", etc.
    display_name: str
    data_type: str                     # text, json, array, image, number, boolean, any

@dataclass
class NodeTypeSpec:
    """Complete node type definition."""
    type: str                          # "llm_call", "skill_execute", etc.
    display_name: str
    description: str
    icon: str                          # Lucide icon name
    color: str                         # Tailwind color (blue, green, purple, etc.)
    category: str                      # ai, flow_control, human, skills, media
    inputs: list[InputSpec]
    outputs: list[OutputSpec]
    executor: str                      # Dotpath: "app.orchestrator.node_executors.llm_executor.LLMExecutor"

class NodeRegistry(singleton):
    """Singleton registry for all node types."""

    def register_node_type(self, spec: NodeTypeSpec) -> None:
        """Register a new node type."""

    def get_node_type(self, node_type: str) -> NodeTypeSpec | None:
        """Retrieve registered node spec."""

    def get_all_node_types(self) -> list[NodeTypeSpec]:
        """List all registered types."""
```

**Built-in node types registered** (line 81–):
- `llm_call`: LLM chat completion
- `rag_query`: Vector DB retrieval
- `conditional`: If/branching
- (More: trigger nodes, skill nodes, data transform nodes, etc.)

**Each spec maps to an executor dotpath**, allowing the compiler to instantiate the right executor class at runtime.

---

### 7. Concrete Executors

**LLM Executor** (`node_executors/llm_executor.py`, lines 16–150+):
- Routes through Node.js `/api/llm/v2/chat` gateway
- Credit checking, provider selection, fallback, cost calculation
- Returns `{"response": str, "usage": dict}`

**Skill Executor** (`node_executors/skill_executor.py`, lines 10–114):
- Validates skill_id format (alphanumeric + underscore/hyphen, max 100 chars)
- Loads skill from registry (TODO: integrate SkillRegistryService)
- Validates inputs against schema
- Executes custom handler or LLM-based execution
- Returns `{"outputs": dict, "skill_id": str, "skill_version": str, "cost": float}`

**Parallel Executor** (`node_executors/flow_executors/parallel_executor.py`, lines 11–65):
- **Current limitation**: Executes sequentially (lines 28–38)
- TODO: True parallel execution requires runtime engine changes
- Returns `{"results": dict, "errors": dict, "completed_branches": int, "failed_branches": int}`

**Join Executor** (`node_executors/flow_executors/parallel_executor.py`, lines 68–143):
- Waits for parallel branches
- Join strategies: `all` (default), `any`, `n`
- Merge strategies: `array`, `object`, `concat`, `sum`
- Returns `{"joined": bool, "results": list, "merged": Any, "total_results": int}`

---

### 8. Workflow API Endpoints (`api/workflows.py`)

**Location:** `/home/dev/projects/SmartSpecPro/python-backend/app/api/workflows.py`

**Key endpoints:**

```python
@router.post("/api/v1/workflows/compile")
async def compile_workflow(body: FlowCompileRequest) -> FlowCompileResponse:
    """Compile ReactFlow JSON to manifest."""
    # Calls WorkflowCompiler.compile()

@router.post("/api/v1/workflows/execute")
async def execute_workflow(body: ExecuteWorkflowRequest) -> ExecuteWorkflowResponse:
    """Start workflow execution (returns executionId immediately)."""
    # Calls LangGraphRuntime.execute() or execute_stream()

@router.post("/api/v1/workflows/execute/stream")
async def execute_workflow_stream(body: ExecuteWorkflowRequest) -> StreamingResponse:
    """Execute workflow with SSE streaming."""
    # Yields events from astream_events(version="v2")

@router.post("/api/v1/workflows/resume")
async def resume_workflow(body: ResumeWorkflowRequest) -> ResumeWorkflowResponse:
    """Resume from HITL interrupt."""
    # Calls LangGraphRuntime.resume(compiled_graph, thread_id, command)
```

**Request shapes:**

```python
class ExecuteWorkflowRequest:
    workflowJson: dict                # Compiled workflow JSON
    workflow_id: int | None           # Saved workflow ID
    tenant_id: str | None             # Tenant context
    input_data: dict[str, Any] | None # Trigger input data
```

---

### 9. Agent Integration (Supervisor Pattern)

**Location:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/agents/supervisor.py`

**Supervisor Agent** (lines 135–):
- Routes tasks to Kilo (macro-planning) or OpenCode (micro-implementation)
- Analyzes task type via keyword matching + classification
- Manages token budgets and credits
- Returns `SupervisorResult` with routing decision

**Handoff Protocol** (`agents/handoff_protocol.py`, lines 177–):
- Manages task execution between Kilo and OpenCode
- Tracks `HandoffSession`, `TaskExecution`, `HandoffDirection`
- Supports sequential/parallel task execution
- Callback hooks: `on_task_complete()`, `on_progress()`

**Key insight:** Agents are currently used **outside the workflow engine** for code generation and planning. They are **NOT yet integrated as workflow nodes**. An "Agency Node" would bridge this gap by allowing workflows to dispatch tasks to agents and retrieve results.

---

## Risks

### 1. **No built-in agent/agency node yet**
- Supervisor and agents exist in a separate system
- Workflows cannot directly invoke agent tasks
- Risk: Duplicate orchestration logic if both agent system and workflow system coexist

### 2. **Parallel executor is sequential**
- `ParallelExecutor` explicitly runs branches sequentially (line 28–38)
- Comment: "True parallel execution requires runtime engine changes"
- Risk: Workflows with fan-out branches don't execute in parallel; they're serialized

### 3. **Output size externalization is TODO**
- Outputs >1 MB are truncated with warning (line 194)
- Full Redis/S3 externalization is not yet implemented (line 199)
- Risk: Large outputs (media, reports) may be silently truncated

### 4. **Expression resolver is limited**
- Only supports `{{nodeId.field.path}}` patterns
- No complex expressions (arithmetic, conditionals, function calls)
- Risk: Workflows need custom logic for computed fields

### 5. **Executor instantiation has no dependency injection**
- Executors instantiated with no-arg constructor (line 449)
- No way to pass config, services, or dependencies to executors
- Risk: Executors cannot easily integrate with the broader DI container

### 6. **No built-in metrics/observability in LangGraph runtime**
- Streaming only yields raw LangGraph events
- No built-in step duration, input/output size, cost tracking
- Risk: Performance analysis requires external tooling

### 7. **State size unbounded**
- `node_outputs` accumulates all node results
- For long workflows with large outputs, state grows linearly
- Risk: Memory/database pressure in long-running executions

### 8. **HITL/Resume semantics are underspecified**
- `resume()` accepts a `Command` object but no doc on what values are valid
- No clear protocol for pause points (which nodes can interrupt, how to resume)
- Risk: HITL workflows may deadlock or resume incorrectly

---

## Options

### Option A: "Agency Node" as a lightweight executor

**Description:** Create a new executor that dispatches to the existing Supervisor + Handoff Protocol system.

**Implementation:**
```python
# app/orchestrator/node_executors/agency_executor.py

class AgencyExecutor:
    """Execute a task via the Supervisor agent."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """
        1. Extract task description from inputs
        2. Create SupervisorTask
        3. Call supervisor.process_task()
        4. Return result as node outputs
        """
        task_description = data.inputs.get("task", "")
        project_id = context.extra_data.get("project_id")

        supervisor = SupervisorAgent(
            kilo_manager=...,
            credit_service=...,
        )

        task = SupervisorTask(
            task_id=data.node_id,
            project_id=project_id,
            user_id=context.user_id,
            prompt=task_description,
            context={
                "workflow_id": context.workflow_id,
                "execution_id": context.execution_id,
                "upstream_outputs": data.state,
            },
        )

        result = await supervisor.process_task(task)

        return {
            "task_result": result.executor_result,
            "executor_type": result.routing_decision.executor.value,
            "tokens_used": result.tokens_used,
            "cost": result.cost,
        }
```

**Pros:**
- Minimal changes to runtime/compiler
- Reuses existing agent infrastructure
- Easy to add to registry

**Cons:**
- Supervisor is designed for code-generation workflows, not general orchestration
- Agent results may not fit node output spec
- Credit/token accounting may double-count

---

### Option B: Embedded multi-agent orchestrator (LangGraph subgraph)

**Description:** Define a subgraph node that runs an embedded LangGraph workflow with multiple agents (Kilo, OpenCode, etc.) as nodes.

**Implementation:**
```python
# app/orchestrator/node_executors/multi_agent_executor.py

class MultiAgentExecutor:
    """Execute a sub-workflow with multiple specialized agents."""

    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        """
        1. Build a LangGraph subgraph from agent definitions
        2. Add Kilo node, OpenCode node, Supervisor node
        3. Compile and execute the subgraph
        4. Return final state
        """
        subgraph = StateGraph(WorkflowState)

        # Add Kilo node
        subgraph.add_node("kilo", KiloExecutorNode(context))

        # Add OpenCode node
        subgraph.add_node("opencode", OpenCodeExecutorNode(context))

        # Routing: Supervisor decides which to execute
        subgraph.add_node("supervisor", SupervisorNode(context))
        subgraph.set_entry_point("supervisor")

        # Conditional edges based on supervisor decision
        subgraph.add_conditional_edges(
            "supervisor",
            lambda state: state["executor_type"],  # Route to "kilo" or "opencode"
        )

        # Both agents eventually route to output
        subgraph.add_edge("kilo", "output")
        subgraph.add_edge("opencode", "output")

        # Compile and run
        compiled_subgraph = subgraph.compile(checkpointer=context.extra_data.get("checkpointer"))
        final_state = await compiled_subgraph.ainvoke({
            "task": data.inputs.get("task"),
            "context": data.state,
        })

        return {
            "result": final_state.get("output"),
            "agents_used": final_state.get("agents_used", []),
        }
```

**Pros:**
- Full control over agent orchestration
- Agents execute within workflow state/checkpoint system
- Natural parallel/conditional execution of agents

**Cons:**
- Significant implementation complexity
- Agents must be refactored to node executors
- Subgraph nesting adds state complexity

---

### Option C: Deferred execution (spawn background task, poll for results)

**Description:** Agency node submits task to Celery, returns task_id, and polls for completion in a loop node.

**Implementation:**
```python
# Simplified version

class AgencyNode:
    """Spawn an agent task and return task_id."""

    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        task = SupervisorTask(...)
        task_id = str(uuid4())

        # Submit to Celery queue
        process_supervisor_task.delay(task_id, task.dict())

        return {
            "task_id": task_id,
            "status": "pending",
        }

class PollAgencyNode:
    """Poll for agency task result."""

    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        task_id = data.inputs.get("task_id")
        status = get_task_status(task_id)

        if status.completed:
            return {
                "result": status.result,
                "status": "completed",
            }
        else:
            # Use retry/wait node to poll again
            return {
                "status": status.state,
                "retry": True,
            }
```

**Pros:**
- Clean separation: agents run independently
- Backpressure-aware (doesn't block runtime)
- Easy to add timeout/retry logic

**Cons:**
- Polling is inefficient
- Requires manual retry/wait node choreography
- Harder to debug long-running tasks

---

## Recommendation

**Adopt Option A: "Agency Node" as a lightweight executor** with the following refinements:

1. **Create `AgencyExecutor`** that wraps the Supervisor + Handoff Protocol
   - Location: `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/agency_executor.py`
   - Accepts `task_description`, `mode` (planning/implementation), `max_tokens` as inputs
   - Routes to Supervisor for classification and execution

2. **Register in NodeRegistry** as a new node type:
   ```python
   NodeTypeSpec(
       type="agency",
       display_name="AI Agency Task",
       description="Dispatch a task to an AI agent (Kilo for planning, OpenCode for implementation)",
       category="ai",
       inputs=[
           InputSpec(name="task", ..., data_type="text", ui_type="textarea"),
           InputSpec(name="mode", ..., data_type="text", ui_type="select",
                     options=[{"label": "Auto", "value": "auto"}, ...]),
           InputSpec(name="max_tokens", ..., data_type="number", ui_type="number"),
       ],
       outputs=[
           OutputSpec(name="result", data_type="json"),
           OutputSpec(name="executor_type", data_type="text"),
           OutputSpec(name="tokens_used", data_type="number"),
       ],
       executor="app.orchestrator.node_executors.agency_executor.AgencyExecutor",
   )
   ```

3. **Ensure credit/token accounting** doesn't double-count:
   - Agency node stores result in `node_outputs`
   - Downstream nodes can reference via `{{agency_node.result}}`
   - Supervisor deducts from `context.credits_available`
   - Audit trail logs supervisor's cost

4. **Add HITL support** for long-running agent tasks:
   - If Supervisor task takes >5s, emit a checkpoint event
   - Client can poll or receive SSE update
   - Resume workflow with user-provided adjustments (e.g., "regenerate")

5. **Future optimization (Option B)**: Once agents are more mature, embed them as a subgraph for tighter control.

**Rationale:**
- Reuses existing, battle-tested agent infrastructure
- Minimal disruption to compiler/runtime
- Straightforward to debug (supervisor logs are preserved)
- Naturally handles credit/token accounting
- Clear input/output contract for visual workflow editor

---

## Open Questions

1. **How should long-running agency tasks handle timeouts?**
   - Option A: Emit checkpoint and allow user to resume
   - Option B: Auto-retry with exponential backoff
   - Option C: Configurable timeout with fallback behavior
   - **Recommendation:** Make it configurable on the node

2. **Should agency results be cached?**
   - If the same task is executed multiple times in a workflow, should the second execution reuse the cached result?
   - Impacts performance but reduces API calls
   - **Recommendation:** Add optional `cache_key` input and check `context.extra_data["cache"]` before calling supervisor

3. **How do we handle agent-generated side effects?**
   - Agents may create files, write to databases, etc.
   - Should these be considered part of workflow outputs?
   - **Recommendation:** Have supervisor return a `side_effects` list in results, surfaced to audit trail

4. **Can agency nodes be composed (agency within agency)?**
   - Can a spawned Kilo task dispatch an OpenCode task, which itself uses a workflow containing an agency node?
   - Risk of infinite recursion or deadlock
   - **Recommendation:** Add a `nesting_depth` counter; fail if depth > 3

5. **What is the failure mode if Supervisor/agents are unavailable?**
   - Currently, LLMExecutor returns an error dict; should AgencyExecutor do the same?
   - Should the workflow terminate or try fallback?
   - **Recommendation:** Return error dict; let downstream retry node handle recovery

6. **Should AgencyExecutor support streaming results?**
   - If a Kilo task generates a long spec, can it stream back line-by-line?
   - Would require bidirectional event handling in node_adapter
   - **Recommendation:** Phase 2 enhancement; start with buffered results only

7. **How does credit estimation work for agency nodes?**
   - Cost estimator must predict agent tokens without running the agent
   - Currently, estimator has no access to task description
   - **Recommendation:** Return a nominal estimate (e.g., 1000 tokens) until supervisor confirms

---

## Extension Points for Adding Agency Node

### 1. Create the Executor

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/agency_executor.py`

```python
from typing import Any
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.agents.supervisor import SupervisorAgent, SupervisorTask
import uuid

class AgencyExecutor:
    """Execute a task via Supervisor agent routing."""

    def __init__(self):
        self.supervisor = None

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        """
        Execute agency task by routing through Supervisor.

        Inputs:
            task: Task description (string)
            mode: "auto" | "planning" | "implementation" (optional)
            max_tokens: Token budget (optional, default 10000)

        Outputs:
            result: Final result from agent execution (dict or string)
            executor_type: "kilo" | "opencode" (string)
            tokens_used: Number of tokens consumed (int)
            cost: Cost in credits (float)
        """
        task_description = data.inputs.get("task", "")
        mode = data.inputs.get("mode", "auto")
        max_tokens = data.inputs.get("max_tokens", 10000)

        if not task_description or len(task_description.strip()) == 0:
            return {
                "result": None,
                "executor_type": "error",
                "tokens_used": 0,
                "cost": 0.0,
                "error": "Agency node requires a non-empty 'task' input",
            }

        # Create supervisor if needed (lazy init)
        if self.supervisor is None:
            from app.services.kilo_session_manager import KiloSessionManager
            from app.services.credit_service import CreditService

            self.supervisor = SupervisorAgent(
                kilo_manager=KiloSessionManager(),
                credit_service=CreditService(),
                default_token_budget=max_tokens,
            )

        # Create task for supervisor
        supervisor_task = SupervisorTask(
            task_id=f"wf_{data.node_id}_{uuid.uuid4().hex[:8]}",
            project_id=context.extra_data.get("project_id", "unknown"),
            user_id=context.user_id,
            prompt=task_description,
            context={
                "workflow_id": context.workflow_id,
                "execution_id": context.execution_id,
                "node_id": data.node_id,
                "upstream_outputs": data.state,
            },
            metadata={
                "forced_mode": mode if mode != "auto" else None,
                "max_tokens": max_tokens,
            },
        )

        # Execute via supervisor
        try:
            result = await self.supervisor.process_task(supervisor_task)

            return {
                "result": result.executor_result or {},
                "executor_type": result.routing_decision.executor.value,
                "tokens_used": result.tokens_used,
                "cost": result.cost,
            }
        except Exception as e:
            import structlog
            logger = structlog.get_logger()
            logger.error(
                "agency_executor_error",
                node_id=data.node_id,
                error=str(e),
            )
            return {
                "result": None,
                "executor_type": "error",
                "tokens_used": 0,
                "cost": 0.0,
                "error": str(e),
            }
```

### 2. Register in NodeRegistry

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_registry.py`

Add to `_register_core_nodes()` method (around line 81):

```python
# Agency Node
self.register_node_type(
    NodeTypeSpec(
        type="agency",
        display_name="AI Agency Task",
        description="Dispatch a task to an AI agent for planning or implementation",
        icon="zap",  # or "brain-circuit"
        color="purple",
        category="ai",
        inputs=[
            InputSpec(
                name="task",
                display_name="Task Description",
                data_type="text",
                ui_type="textarea",
                required=True,
                accepts_connection=True,
                placeholder="Describe what you need the agent to do...",
            ),
            InputSpec(
                name="mode",
                display_name="Agent Mode",
                data_type="text",
                ui_type="select",
                required=False,
                accepts_connection=False,
                default="auto",
                options=[
                    {"label": "Auto (Supervisor decides)", "value": "auto"},
                    {"label": "Planning (Kilo)", "value": "planning"},
                    {"label": "Implementation (OpenCode)", "value": "implementation"},
                ],
            ),
            InputSpec(
                name="max_tokens",
                display_name="Max Tokens",
                data_type="number",
                ui_type="number",
                required=False,
                accepts_connection=False,
                default=10000,
                validation={"min": 100, "max": 100000},
            ),
        ],
        outputs=[
            OutputSpec(name="result", display_name="Task Result", data_type="json"),
            OutputSpec(name="executor_type", display_name="Executor Type (kilo/opencode)", data_type="text"),
            OutputSpec(name="tokens_used", display_name="Tokens Used", data_type="number"),
            OutputSpec(name="cost", display_name="Cost (credits)", data_type="number"),
        ],
        executor="app.orchestrator.node_executors.agency_executor.AgencyExecutor",
    )
)
```

### 3. Update Node Adapter (if needed)

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_adapter.py`

No changes needed if AgencyExecutor follows the protocol. The adapter already handles:
- Input resolution from `{{upstream.field}}`
- State merging
- Error handling
- Output size checking

### 4. Add Tests

**File:** `/home/dev/projects/SmartSpecPro/python-backend/tests/test_agency_executor.py`

```python
import pytest
from app.orchestrator.node_executors.agency_executor import AgencyExecutor
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

@pytest.mark.asyncio
async def test_agency_executor_with_valid_task():
    executor = AgencyExecutor()
    context = ExecutionContext(
        user_id=1,
        tenant_id="test_tenant",
        workflow_id="test_wf",
        execution_id="test_exec",
        credits_available=10000,
        extra_data={"project_id": "proj_123"},
    )
    data = NodeExecutionData(
        node_id="agency_node_1",
        node_type="agency",
        config={},
        inputs={"task": "Create a spec for a user authentication system", "mode": "auto"},
        state={},
    )

    result = await executor.execute(data, context)

    assert "result" in result
    assert "executor_type" in result
    assert "tokens_used" in result
    assert "cost" in result
    assert result.get("error") is None

@pytest.mark.asyncio
async def test_agency_executor_empty_task():
    executor = AgencyExecutor()
    context = ExecutionContext(user_id=1, tenant_id="test", workflow_id="wf", execution_id="exec", credits_available=10000)
    data = NodeExecutionData(
        node_id="agency_node_1",
        node_type="agency",
        config={},
        inputs={"task": ""},
        state={},
    )

    result = await executor.execute(data, context)

    assert result.get("executor_type") == "error"
    assert "error" in result
```

### 5. Update Workflow Compiler Validation (if needed)

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/workflow_compiler.py`

No changes needed. The compiler already supports arbitrary node types via the registry.

### 6. API Documentation

Update `/docs` or OpenAPI schema to include agency node in available node types. When calling `/api/v1/workflows/execute`, the workflow JSON will reference the agency node, which will be compiled and executed automatically.

---

## Summary Table: Node Executor Integration Points

| Component | File | What to Change | Why |
|-----------|------|---|---|
| **Executor Implementation** | `node_executors/agency_executor.py` | Create new file with `AgencyExecutor` class | Implement the task execution logic |
| **Node Registry** | `node_registry.py` | Add `NodeTypeSpec` entry in `_register_core_nodes()` | Register the node type for UI + compiler |
| **Node Adapter** | `node_adapter.py` | No changes | Already handles input resolution, error handling, state merging |
| **Workflow Compiler** | `workflow_compiler.py` | No changes | Already supports arbitrary node types via registry |
| **Workflow State** | `workflow_state.py` | No changes | State schema is flexible (TypedDict with `total=False`) |
| **LangGraph Runtime** | `langgraph_runtime.py` | No changes | Compiler handles registration of nodes |
| **API Endpoints** | `api/workflows.py` | No changes | Endpoints already compile and execute arbitrary workflows |
| **Tests** | `tests/test_agency_executor.py` | Create test file | Cover happy path, error cases, timeout scenarios |

---

## Code References

### Key Files and Line Numbers

| File | Component | Lines | Purpose |
|------|-----------|-------|---------|
| `langgraph_runtime.py` | `LangGraphRuntime` class | 26–305 | Main runtime engine |
| `langgraph_runtime.py` | `execute()` method | 110–164 | Execute to completion |
| `langgraph_runtime.py` | `execute_stream()` method | 166–204 | Execute with streaming |
| `langgraph_runtime.py` | `resume()` method | 210–237 | Resume from checkpoint |
| `workflow_compiler.py` | `WorkflowCompiler` class | 40–457 | Compile ReactFlow → LangGraph |
| `workflow_compiler.py` | `_validate_graph()` | 104–172 | Validate DAG, triggers, ports |
| `workflow_compiler.py` | `_check_cycles()` | 173–206 | DFS-based cycle detection |
| `workflow_compiler.py` | `_build_state_graph()` | 278–324 | Build StateGraph |
| `workflow_compiler.py` | `_instantiate_executor()` | 423–456 | Load executor via importlib |
| `node_adapter.py` | `make_langgraph_node()` | 24–139 | Wrap executor into LG node function |
| `node_adapter.py` | `_resolve_inputs()` | 142–181 | Resolve `{{nodeId.field}}` patterns |
| `node_executors/base.py` | `ExecutionContext` | 6–15 | Execution context dataclass |
| `node_executors/base.py` | `NodeExecutionData` | 18–26 | Node input/config/state |
| `node_executors/base.py` | `NodeExecutor` protocol | 39–53 | Protocol all executors must implement |
| `workflow_state.py` | `WorkflowState` TypedDict | 22–50 | Canonical state schema with reducers |
| `node_registry.py` | `NodeRegistry` singleton | 51–79 | Registry for node types |
| `node_registry.py` | `InputSpec` dataclass | 8–24 | Input port specification |
| `node_registry.py` | `OutputSpec` dataclass | 27–33 | Output port specification |
| `node_registry.py` | `NodeTypeSpec` dataclass | 36–48 | Complete node type definition |
| `node_executors/llm_executor.py` | `LLMExecutor.execute()` | 27–150+ | LLM call via Node.js gateway |
| `node_executors/skill_executor.py` | `SkillExecutor.execute()` | 25–114 | Skill execution |
| `node_executors/flow_executors/parallel_executor.py` | `ParallelExecutor` | 11–65 | Parallel branch execution |
| `api/workflows.py` | `execute_workflow()` | ~450+ | HTTP endpoint for execution |
| `agents/supervisor.py` | `SupervisorAgent` class | 135–200+ | Agent routing and classification |
| `agents/handoff_protocol.py` | `HandoffProtocol` class | 177+ | Kilo ↔ OpenCode coordination |
| `expression_resolver.py` | `ExpressionResolver.resolve()` | 17–50 | Resolve `{{expr}}` patterns |

