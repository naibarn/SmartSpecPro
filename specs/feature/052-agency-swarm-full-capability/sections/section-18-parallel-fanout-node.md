I now have comprehensive context. Here is the section content:

# Section 18 — Parallel Fan-Out Node

## Section ID
`section-18-parallel-fanout-node`

## Dependencies
- **section-01-database-migration**: `agencyAgents.nodeType` column must accept `"parallel_fan_out"`, `AgencyNodeData` types extended.
- **section-07-agency-context**: `AgencyRunContext` class must exist with async `get()`/`set()` and `asyncio.Lock` for shared state across branches.

## Blocks
- **section-22-ai-creator-v2**: AI Creator must know the `parallel_fan_out` node type for prompt generation.

## Overview

This section adds a new `parallel_fan_out` node type to the agency builder. The node fans a task out to N concurrent branches via `asyncio.gather`, then merges results using one of four strategies: `wait_all`, `first_complete`, `majority`, or `custom_prompt`. Each branch gets a cloned `ExecutionContext` (deep-copied results/knowledge) but shares the same `AgencyRunContext` instance for cross-branch communication. Credits are tracked per branch, and a run-level budget check cancels remaining branches when exceeded.

---

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/client/src/components/agency/nodes/ParallelFanOutNodeCard.tsx` | ReactFlow node card (cyan, Split icon) |
| `apps/web/server/services/__tests__/parallelFanOutValidation.test.ts` | Vitest tests for saveBuilder validation |
| `python-backend/tests/unit/services/test_parallel_fan_out.py` | pytest tests for orchestrator handler |

## Files to Modify

| File | Change |
|------|--------|
| `apps/web/client/src/components/agency/nodes/types.ts` | Add `"parallel_fan_out"` to `AgencyNodeType` union |
| `apps/web/client/src/components/agency/nodes/BaseAgencyNode.tsx` | Add case for `"parallel_fan_out"` in switch |
| `apps/web/client/src/components/agency/NodePropertyPanel.tsx` | Add `ParallelFanOutForm` dispatch case |
| `apps/web/server/routers/agency.ts` | Extend `saveBuilder` Zod validation for `parallel_fan_out` nodeConfig |
| `python-backend/app/services/agency_orchestrator.py` | Add `"parallel_fan_out"` case + `_execute_parallel_fan_out()` method, add `clone()` to `ExecutionContext` |

---

## TDD Test Specifications

### Python Tests (`python-backend/tests/unit/services/test_parallel_fan_out.py`)

All tests use pytest with `asyncio_mode = auto`.

```
# pytest: N branches execute concurrently via asyncio.gather
#   - Create orchestrator with a parallel_fan_out node pointing to 3 agent stubs
#   - Assert all 3 branches executed (mock adapter tracks calls)
#   - Assert asyncio.gather was used (branches run concurrently, not sequentially)

# pytest: wait_all merge waits for all branches
#   - 3 branches with different simulated delays
#   - mergeStrategy = "wait_all"
#   - Assert result contains output from ALL 3 branches

# pytest: first_complete returns immediately on first branch completion
#   - 3 branches: one resolves fast (10ms), two slow (5s)
#   - mergeStrategy = "first_complete"
#   - Assert result contains only the fast branch output
#   - Assert total execution time < 1s (not waiting for slow branches)

# pytest: custom_prompt merge calls LLM Gateway
#   - 2 branches both complete
#   - mergeStrategy = "custom_prompt", mergePrompt = "Summarize..."
#   - Mock LLM Gateway call, assert it receives all branch results + mergePrompt
#   - Assert final result is LLM response

# pytest: timeout per branch enforced
#   - 1 branch exceeds timeoutMs (simulated 200ms timeout, branch takes 5s)
#   - continueOnError = true
#   - Assert timed-out branch returns error, other branches succeed

# pytest: continueOnError=true doesn't stop on branch failure
#   - 3 branches, one raises exception
#   - continueOnError = true
#   - Assert remaining 2 branches still complete successfully

# pytest: continueOnError=false stops on branch failure
#   - 3 branches, one raises exception
#   - continueOnError = false
#   - Assert asyncio.gather propagates the exception

# pytest: maxConcurrent capped at 10 server-side
#   - nodeConfig specifies maxConcurrent = 25
#   - Assert orchestrator clamps to 10
#   - Only 10 branches run concurrently (use semaphore tracking)

# pytest: credits tracked per branch separately
#   - 3 branches, each producing step_attempts with cost data
#   - Assert ctx.step_attempts contains separate entries per branch with branch_id label

# pytest: ExecutionContext.clone() deep-copies results but shares AgencyRunContext
#   - Create ExecutionContext, set results["node-a"] = "old"
#   - Clone it
#   - Mutate clone.results["node-a"] = "new"
#   - Assert original.results["node-a"] == "old" (deep copy)
#   - (AgencyRunContext sharing tested via section-07 integration)

# pytest: budget exceeded mid-branch cancels remaining branches
#   - Set a credit budget on the run context
#   - First branch exhausts the budget
#   - Assert remaining branches are cancelled (cooperative cancellation flag checked)
```

### Vitest Tests (`apps/web/server/services/__tests__/parallelFanOutValidation.test.ts`)

```
# Vitest: saveBuilder validates parallel_fan_out branches array has >= 2 entries
#   - Submit node with 1 branch -> expect validation error
#   - Submit node with 2 branches -> expect success

# Vitest: saveBuilder validates mergeStrategy is one of 4 allowed values
#   - mergeStrategy = "invalid" -> expect validation error
#   - Each of "wait_all", "first_complete", "majority", "custom_prompt" -> expect success

# Vitest: saveBuilder validates maxConcurrent between 1 and 10
#   - maxConcurrent = 0 -> error
#   - maxConcurrent = 11 -> error
#   - maxConcurrent = 5 -> success

# Vitest: saveBuilder validates mergePrompt required when mergeStrategy is custom_prompt
#   - mergeStrategy = "custom_prompt" without mergePrompt -> error
#   - mergeStrategy = "custom_prompt" with mergePrompt (<=1000 chars) -> success

# Vitest: saveBuilder validates branch targetNodeId references exist
#   - Branch with targetNodeId not in agency nodes -> validation error

# Vitest: saveBuilder validates timeoutMs is positive integer with reasonable bounds
#   - timeoutMs = 0 -> error
#   - timeoutMs = 600001 -> error (max 10 min)
#   - timeoutMs = 120000 -> success
```

---

## Implementation Details

### 1. Type Extension (`types.ts`)

Add `"parallel_fan_out"` to the `AgencyNodeType` union:

```typescript
export type AgencyNodeType =
  | "agent"
  | "supervisor"
  // ... existing types ...
  | "parallel_fan_out";
```

### 2. nodeConfig Schema (Zod — `agency.ts`)

Define a `parallelFanOutConfigSchema` within the `saveBuilder` procedure's `.superRefine()` block for nodes where `nodeType === "parallel_fan_out"`:

```
parallelFanOutConfigSchema:
  branches: z.array(z.object({
    id: z.string().min(1),
    targetNodeId: z.string().min(1),
    taskDescription: z.string().max(500).optional(),
    label: z.string().max(100).optional(),
  })).min(2, "At least 2 branches required"),
  mergeStrategy: z.enum(["wait_all", "first_complete", "majority", "custom_prompt"]),
  mergePrompt: z.string().max(1000).optional(),
  timeoutMs: z.number().int().min(1000).max(600000).default(120000),
  maxConcurrent: z.number().int().min(1).max(10).default(5),
  continueOnError: z.boolean().default(true),
  dynamicBranchSource: z.object({
    nodeId: z.string(),
    outputField: z.string(),
    taskTemplate: z.string().max(500),
  }).optional(),
```

Cross-validation in `.superRefine()`:
- If `mergeStrategy === "custom_prompt"`, require `mergePrompt` to be non-empty.
- Each `branch.targetNodeId` must reference a node that exists in the same agency payload.

### 3. Python Orchestrator (`agency_orchestrator.py`)

#### 3a. `ExecutionContext.clone()`

Add a `clone()` method to `ExecutionContext`:

```
def clone(self) -> ExecutionContext:
    """Deep-copy results/knowledge/history for branch isolation.
    
    Shares: user_token, tenant_id, user_id, task_metadata (read-only refs).
    Deep-copies: results, knowledge, history, step_attempts.
    """
```

- Use `copy.deepcopy()` for `results`, `knowledge`, `history`.
- Share (shallow copy) `user_token`, `tenant_id`, `user_id`, `task_metadata`.
- Initialize fresh `step_attempts` list (each branch accumulates its own).

#### 3b. Match Case in `_execute_node()`

Add to the `match node_type:` block:

```python
case "parallel_fan_out":
    result = await self._execute_parallel_fan_out(node, ctx)
    return result  # Fan-out handles its own edge following
```

Note: like `"router"`, `parallel_fan_out` handles its own downstream execution and should NOT fall through to the generic edge-following logic.

#### 3c. `_execute_parallel_fan_out()` Method

Signature: `async def _execute_parallel_fan_out(self, node: NodeRow, ctx: ExecutionContext) -> str`

Logic:

1. **Parse config**: Extract `branches`, `mergeStrategy`, `mergePrompt`, `timeoutMs`, `maxConcurrent`, `continueOnError`, `dynamicBranchSource` from `node["node_config"]`.

2. **Resolve dynamic branches** (if `dynamicBranchSource` is set):
   - Read the output of `dynamicBranchSource.nodeId` from `ctx.results`.
   - Parse as JSON array.
   - For each item, create a branch entry using `taskTemplate` with `{item}` placeholder.
   - Cap at 10 total branches.

3. **Clamp maxConcurrent**: `max_concurrent = min(config.get("maxConcurrent", 5), 10)`.

4. **Create semaphore**: `sem = asyncio.Semaphore(max_concurrent)`.

5. **Define branch coroutine**:
   ```
   async def run_branch(branch, branch_ctx):
       async with sem:
           target_node = self.nodes.get(branch["targetNodeId"])
           if not target_node:
               return f"[Branch {branch['id']}: target not found]"
           # Optionally inject taskDescription into branch_ctx.input
           if branch.get("taskDescription"):
               branch_ctx.input = branch["taskDescription"] + "\n\n" + ctx.input
           return await asyncio.wait_for(
               self._execute_node(target_node, branch_ctx),
               timeout=timeout_seconds,
           )
   ```

6. **Launch branches**: For each branch, call `ctx.clone()` to create an isolated context. Gather all with `asyncio.gather(*tasks, return_exceptions=continueOnError)`.

7. **Merge results** based on `mergeStrategy`:
   - `wait_all`: Concatenate all successful results with branch labels.
   - `first_complete`: Use `asyncio.wait(tasks, return_when=FIRST_COMPLETED)` instead of `gather`. Cancel remaining tasks.
   - `majority`: Parse branch results as votes (string equality or LLM-assisted), pick the most common.
   - `custom_prompt`: Assemble all branch results into a single prompt with `mergePrompt`, call LLM Gateway via the existing `_llm_classify`-style HTTP call pattern.

8. **Credit tracking**: After each branch completes, copy `branch_ctx.step_attempts` into `ctx.step_attempts` with a `branch_id` label.

9. **Budget check**: After each branch resolves, check a `ctx.budget_exceeded` flag (set cooperatively by credit tracking logic). If exceeded, cancel pending branch tasks.

10. **Store merged result** in `ctx.results[node_id]` and return it.

### 4. Frontend Node Card (`ParallelFanOutNodeCard.tsx`)

Follow the pattern from `AggregatorNodeCard.tsx`:

- **Color theme**: cyan (`border-cyan-300`, `ring-cyan-500`, `text-cyan-500`, `bg-cyan-50`, `border-cyan-200`)
- **Icon**: `Split` from lucide-react
- **Layout**:
  - Single target handle at top (input)
  - Multiple source handles at bottom (one per branch, spread evenly)
  - Display node name, branch count badge, merge strategy badge
  - Validation error indicator (red AlertCircle)
- **Props**: `NodeProps<AgencyNodeData>` (standard pattern)
- **Card dimensions**: `w-52` (same as other cards)

### 5. BaseAgencyNode Dispatcher Update

Add import and case:

```typescript
import { ParallelFanOutNodeCard } from "./ParallelFanOutNodeCard";

// In switch:
case "parallel_fan_out":
  return <ParallelFanOutNodeCard {...props} />;
```

### 6. NodePropertyPanel — ParallelFanOutForm

Add a new form section within `NodePropertyPanel.tsx` dispatched when `nodeType === "parallel_fan_out"`:

- **Branch list**: Editable list of branches (add/remove buttons). Each branch has:
  - Label (text input)
  - Target node (dropdown of sibling nodes, same as Router target picker)
  - Task description (optional textarea)
- **Min 2 branches enforced** in UI (disable remove when 2 remain)
- **Merge strategy**: Select dropdown with 4 options
- **Merge prompt**: Textarea, shown only when `custom_prompt` selected
- **Advanced section** (collapsible):
  - Timeout (number input, ms)
  - Max concurrent (number input, 1-10)
  - Continue on error (switch toggle)
- **Dynamic branch source** (collapsible advanced):
  - Source node dropdown
  - Output field (text input)
  - Task template (textarea with `{item}` placeholder hint)

---

## Edge Cases and Safety

| Scenario | Handling |
|----------|----------|
| Branch target node deleted | Validation error on save (targetNodeId must exist) |
| All branches fail | Return error summary string, do not crash the run |
| Circular reference (branch targets the fan-out itself) | Detect during `saveBuilder` validation; reject |
| Dynamic branches produce 0 items | Return empty result with warning log |
| Dynamic branches produce >10 items | Clamp to first 10, log warning |
| `first_complete` with all branches failing | Return error after all branches tried |
| `custom_prompt` LLM call fails | Fall back to `wait_all` concatenation with warning |
| Branch modifies shared AgencyRunContext | Safe — `asyncio.Lock` in AgencyRunContext (from section-07) |

---

## Integration Notes

- The `parallel_fan_out` node type must be added to the Drizzle schema CHECK constraint or accepted by the `nodeType` varchar(30) column (section-01). Since the existing column is `varchar(30)` with no DB-level CHECK, only Zod validation in `saveBuilder` needs updating.
- The `AGENT_NODE_TYPES` set at the top of `agency_orchestrator.py` does NOT include `parallel_fan_out`, so the orchestrator will correctly be activated when this node type is present.
- For `first_complete` merge strategy, use `asyncio.wait(..., return_when=asyncio.FIRST_COMPLETED)` and explicitly cancel the remaining tasks to avoid resource leaks.
- The `custom_prompt` merge strategy follows the same LLM Gateway HTTP call pattern used by `_llm_classify()` in the router node handler.