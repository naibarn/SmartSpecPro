I have all the context needed. Here is the section content:

# Section 19 -- Loop / Retry Node

## Overview

This section implements the `loop_retry` node type, a flow-control node that repeatedly executes a target node until an exit condition is met or a safety guard triggers. It supports four exit-condition evaluation modes, feedback injection between iterations, and per-iteration trace logging for observability.

**Feature**: 2.20 Loop / Retry Node (NEW)
**Phase**: 5 -- New Node Types & Skill Integration
**Depends on**: section-01-database-migration (schema must include loop_retry in nodeType validation), section-07-agency-context (AgencyRunContext for context_check exit mode and feedback storage), section-15-observability-tracing (per-iteration trace span logging)
**Blocks**: section-22-ai-creator-v2 (creator must generate loop_retry nodes)

---

## Files to Create

| File | Purpose |
|------|---------|
| `python-backend/app/services/agency_loop_handler.py` | Loop execution logic, exit-condition evaluators, feedback injection |
| `python-backend/tests/unit/test_agency_loop_handler.py` | Unit tests for loop handler |
| `apps/web/client/src/components/agency/nodes/LoopRetryNodeCard.tsx` | ReactFlow node card (amber, RefreshCw icon) |

## Files to Modify

| File | Change |
|------|--------|
| `apps/web/client/src/components/agency/nodes/types.ts` | Add `"loop_retry"` to `AgencyNodeType` union |
| `apps/web/client/src/components/agency/nodes/BaseAgencyNode.tsx` | Add `case "loop_retry"` to switch dispatcher, import LoopRetryNodeCard |
| `apps/web/client/src/components/agency/NodePropertyPanel.tsx` | Add `LoopRetryForm` section for configuring exit conditions, target node, feedback, safety guards |
| `apps/web/server/routers/agency.ts` | Add `loop_retry` nodeConfig Zod validation in `saveBuilder` (LoopRetryConfig schema) |
| `python-backend/app/services/agency_orchestrator.py` | Add `case "loop_retry"` to match statement in `_execute_node`, delegate to loop handler |

---

## Tests -- Write First

### Python Unit Tests

All tests go in `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_loop_handler.py`.

```
# Test 1: loop exits when max_iterations reached
#   - Configure loop with maxIterations=3, exit condition that never matches
#   - Verify loop runs exactly 3 times and returns last iteration result
#   - Verify returned metadata includes iteration_count=3

# Test 2: loop exits when rule_based exit condition met
#   - Configure exitCondition mode="rule_based", rules=[{field: "status", operator: "equals", value: "done"}]
#   - Target node returns {"status": "done"} on iteration 2
#   - Verify loop stops after iteration 2

# Test 3: loop exits when llm_evaluate exit condition met
#   - Configure exitCondition mode="llm_evaluate", evaluationPrompt="Is the result satisfactory?"
#   - Mock LLM Gateway to return "yes" on iteration 2
#   - Verify loop stops after iteration 2

# Test 4: loop exits when context_check exit condition met
#   - Configure exitCondition mode="context_check", contextKey="quality_score"
#   - AgencyRunContext has quality_score set to "pass" on iteration 2
#   - Verify loop stops after iteration 2

# Test 5: maxIterations server-side capped at 20
#   - Configure maxIterations=50
#   - Verify handler clamps to 20 before executing

# Test 6: feedback injected between iterations
#   - Configure feedbackMode="auto"
#   - Verify that iteration 2 receives augmented input with iteration 1 result as feedback
#   - Verify feedback format includes iteration number and prior output

# Test 7: custom_prompt feedback mode uses feedbackPrompt template
#   - Configure feedbackMode="custom_prompt", feedbackPrompt="Improve the following: {previous_output}"
#   - Verify iteration 2 input substitutes {previous_output} with iteration 1 result

# Test 8: total timeout enforced
#   - Configure timeoutMs=100 (very short), target node sleeps 200ms per iteration
#   - Verify loop aborts after timeout and returns partial result with timeout status

# Test 9: every iteration logged in trace
#   - Run loop for 3 iterations
#   - Verify trace_logger.log_iteration called 3 times with correct iteration index, input, output, condition_result

# Test 10: credit cap of 50 per loop node enforced
#   - Mock credit tracker to report 51 credits consumed after iteration 2
#   - Verify loop aborts with credit_cap_exceeded status

# Test 11: loopTargetNodeId validated to exist in same agency
#   - Configure loopTargetNodeId pointing to non-existent node
#   - Verify handler raises ValueError with descriptive message

# Test 12: rule_based evaluation with different operators
#   - Test operators: equals, contains, regex, gt, lt, gte, lte, exists
#   - Verify each operator evaluates correctly against target node output

# Test 13: delayBetweenIterationsMs inserts pause between iterations
#   - Configure delayBetweenIterationsMs=50, maxIterations=2
#   - Verify total elapsed time >= 50ms (delay applied after iteration 1)

# Test 14: loop with exit condition mode="max_iterations" (simplest mode)
#   - No rules, no LLM, just iterate N times
#   - Verify clean execution and result aggregation
```

Markers: `@pytest.mark.unit`, `@pytest.mark.agency`, `@pytest.mark.asyncio`.

### TypeScript Vitest Tests

Tests in `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/agencyLoopRetry.test.ts`.

```
# Test 1: saveBuilder validates loop_retry nodeConfig — valid config passes
#   - Submit a node with nodeType="loop_retry" and valid LoopRetryConfig
#   - Verify no validation errors

# Test 2: saveBuilder rejects loop_retry with maxIterations > 20
#   - Submit maxIterations: 50
#   - Verify Zod error on maxIterations field

# Test 3: saveBuilder rejects loop_retry with timeoutMs > 600000
#   - Submit timeoutMs: 1_000_000
#   - Verify Zod error

# Test 4: saveBuilder rejects loop_retry without loopTargetNodeId
#   - Submit config missing loopTargetNodeId
#   - Verify required field error

# Test 5: saveBuilder validates loopTargetNodeId exists in submitted nodes
#   - Submit loopTargetNodeId pointing to a node ID not in the nodes array
#   - Verify .superRefine cross-field validation error

# Test 6: saveBuilder validates evaluationPrompt max length 500
#   - Submit evaluationPrompt with 600 chars
#   - Verify Zod error on max length
```

### Frontend Component Tests

Tests in `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/nodes/__tests__/LoopRetryNodeCard.test.tsx`.

```
# Test 1: renders with RefreshCw icon and amber border
# Test 2: displays node name and iteration count from nodeConfig
# Test 3: shows validation error indicator when validationErrors present
```

---

## Implementation Guidance

### 1. TypeScript Types -- AgencyNodeType Extension

In `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/nodes/types.ts`:

- Add `"loop_retry"` to the `AgencyNodeType` union type.

### 2. Zod Validation -- LoopRetryConfig Schema

In `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts`, add a Zod schema for the `loop_retry` nodeConfig:

```
LoopRetryConfig:
  loopTargetNodeId: z.string().uuid()                       # required
  exitCondition:
    mode: z.enum(["max_iterations", "rule_based", "llm_evaluate", "context_check"])
    maxIterations: z.number().int().min(1).max(20)          # server cap
    rules: z.array(RuleSchema).optional()                   # for rule_based mode
    evaluationPrompt: z.string().max(500).optional()        # for llm_evaluate mode
    contextKey: z.string().max(100).optional()              # for context_check mode
  feedbackMode: z.enum(["auto", "custom_prompt"]).default("auto")
  feedbackPrompt: z.string().max(500).optional()            # for custom_prompt mode
  delayBetweenIterationsMs: z.number().int().min(0).max(30000).default(0)
  timeoutMs: z.number().int().min(1000).max(600000).default(300000)
```

Add a `.superRefine()` cross-field validation in `saveBuilder` that checks: for every node with `nodeType === "loop_retry"`, its `nodeConfig.loopTargetNodeId` must reference an `id` present in the submitted `nodes` array.

The `RuleSchema` should match the same structure used in section-17 (conditional_branch) for consistency:
```
RuleSchema:
  field: z.string()
  operator: z.enum(["equals", "contains", "regex", "gt", "lt", "gte", "lte", "exists"])
  value: z.union([z.string(), z.number()]).optional()
```

### 3. Python Loop Handler

Create `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_loop_handler.py`.

The handler class `LoopHandler` should:

- Accept references to: the orchestrator instance (for calling `_execute_node` on the target), the `AgencyRunContext` (from section-07), and an optional trace logger (from section-15).
- Clamp `maxIterations` to 20 server-side regardless of config.
- Implement four exit-condition evaluator functions:
  - `_eval_max_iterations(iteration, config)` -- always False (loop until max)
  - `_eval_rule_based(output, rules)` -- parse output as JSON, evaluate field/operator/value rules. Reuse the same operator evaluation logic as section-17 conditional_branch (extract to a shared utility in `python-backend/app/services/agency_condition_evaluator.py` if section-17 is implemented first, or define inline and refactor later).
  - `_eval_llm_evaluate(output, prompt, ctx)` -- call LLM Gateway with a fixed system template and the evaluation prompt + output as user message. Parse response for "yes"/"no"/"true"/"false" determination.
  - `_eval_context_check(context, key)` -- read `AgencyRunContext.get(key)`, truthy check.
- Implement feedback injection:
  - `auto` mode: prepend `"[Iteration {n} feedback] Previous output:\n{output}\n\nPlease improve or continue."` to the input.
  - `custom_prompt` mode: resolve `{previous_output}`, `{iteration}`, `{original_input}` placeholders in `feedbackPrompt`.
- Track total credits via a callback or by reading `ExecutionContext.step_attempts` length delta.
- Enforce `timeoutMs` using `asyncio.wait_for` wrapping the entire loop.
- Enforce credit cap of 50 per loop node -- check after each iteration.
- Apply `delayBetweenIterationsMs` via `asyncio.sleep` between iterations (not after last).
- Log each iteration to the trace logger (section-15 dependency): span with iteration index, input snippet, output snippet, exit condition result, duration.
- Return a result dict: `{ result: str, iterations: int, exit_reason: str, iteration_details: list }`.

The main `execute` method signature:

```python
async def execute(
    self,
    node: NodeRow,
    ctx: ExecutionContext,
    orchestrator: "AgencyOrchestrator",
    run_context: "AgencyRunContext | None" = None,
    trace_logger: "TraceLogger | None" = None,
) -> str:
    """Execute the loop/retry node. Returns final result text."""
```

### 4. Orchestrator Integration

In `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_orchestrator.py`:

- Import `LoopHandler` from `agency_loop_handler`.
- Add to `_execute_node` match statement:

```python
case "loop_retry":
    handler = LoopHandler()
    result = await handler.execute(
        node, ctx, self,
        run_context=getattr(self, "run_context", None),
        trace_logger=getattr(self, "trace_logger", None),
    )
```

The handler calls back into the orchestrator's `_execute_node` to run the target node, passing the same `ExecutionContext`. This avoids duplicating node-dispatch logic.

### 5. Frontend -- LoopRetryNodeCard

Create `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/nodes/LoopRetryNodeCard.tsx`.

Visual design:
- Amber border color (`border-amber-300`, selected: `ring-amber-500 border-amber-500`).
- `RefreshCw` icon from lucide-react (amber-500 color).
- Display node name, exit condition mode badge, and `maxIterations` count.
- Show validation error dot (red) when `validationErrors` present.
- Input handle (top) and output handle (bottom), same style as RouterNodeCard.

### 6. Frontend -- BaseAgencyNode Dispatcher

In `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/nodes/BaseAgencyNode.tsx`:

- Import `LoopRetryNodeCard`.
- Add `case "loop_retry": return <LoopRetryNodeCard {...props} />;` before the `default` case.

### 7. Frontend -- NodePropertyPanel LoopRetryForm

In `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/NodePropertyPanel.tsx`:

Add a `LoopRetryForm` section (rendered when `nodeType === "loop_retry"`) containing:

- **Target Node Selector**: dropdown of all other nodes in the agency (by name), sets `nodeConfig.loopTargetNodeId`.
- **Exit Condition Mode**: select with options `max_iterations`, `rule_based`, `llm_evaluate`, `context_check`.
- **Max Iterations**: number input (1-20), always shown.
- **Rules Builder** (shown when mode is `rule_based`): reusable from section-17's conditional branch rules UI. Each rule: field name input, operator select, value input, add/remove buttons.
- **Evaluation Prompt** (shown when mode is `llm_evaluate`): textarea, max 500 chars.
- **Context Key** (shown when mode is `context_check`): text input, max 100 chars.
- **Feedback Mode**: select (`auto` or `custom_prompt`).
- **Feedback Prompt** (shown when `custom_prompt`): textarea, max 500 chars, with placeholder showing available variables: `{previous_output}`, `{iteration}`, `{original_input}`.
- **Advanced Settings** (collapsible):
  - Delay Between Iterations (ms): number input, 0-30000.
  - Total Timeout (ms): number input, 1000-600000, default 300000.

---

## Integration Points

### With Section 07 (Agency Context)
- The `context_check` exit condition mode reads from `AgencyRunContext.get(contextKey)`.
- Each iteration may store intermediate results in the context.
- If `run_context` is `None` (section-07 not yet wired), the `context_check` mode should return False (never exits via context, falls through to maxIterations).

### With Section 15 (Observability Tracing)
- Each iteration should create a trace span via the `trace_logger` (if available).
- Span data: `{ type: "loop_iteration", nodeId, iteration, input_preview (first 200 chars), output_preview (first 200 chars), exit_condition_result: bool, durationMs }`.
- If `trace_logger` is `None` (section-15 not yet wired), skip trace logging gracefully.

### With Section 17 (Conditional Branch)
- The rule evaluation logic (field/operator/value against a JSON object) is shared. If section-17 is implemented first, import from `agency_condition_evaluator.py`. If section-19 is implemented first, create the evaluator and section-17 can import from it.

### With Section 09 (SSE Streaming)
- The loop handler should emit SSE events if an event emitter is available:
  - `loop_iteration_start { nodeId, iteration }` before each iteration.
  - `loop_iteration_end { nodeId, iteration, exitConditionMet }` after each iteration.
  - `loop_complete { nodeId, totalIterations, exitReason }` when loop finishes.
- If no event emitter is wired, skip silently.

### With Section 22 (AI Creator v2)
- The creator's DESIGN phase must generate valid `LoopRetryConfig` for loop_retry nodes.
- The creator's VALIDATE phase must check: `maxIterations <= 20`, `loopTargetNodeId` exists.

---

## Safety Guards Summary

| Guard | Limit | Enforcement |
|-------|-------|-------------|
| maxIterations | 20 | Server-side clamp in LoopHandler before loop starts |
| timeoutMs | 600,000 ms (10 min) | `asyncio.wait_for` wrapping entire loop |
| Credit cap | 50 credits per loop node | Check `step_attempts` delta after each iteration |
| delayBetweenIterationsMs | 30,000 ms (30 sec) | Zod validation + server-side clamp |
| evaluationPrompt length | 500 chars | Zod validation |
| feedbackPrompt length | 500 chars | Zod validation |

---

## Error Handling

- If the target node (`loopTargetNodeId`) does not exist at execution time, raise a descriptive error and abort the loop. Do not silently return empty.
- If `llm_evaluate` mode fails (LLM error), treat the condition as not met and continue to next iteration (log warning). After 3 consecutive LLM failures, abort loop with `llm_evaluate_failed` exit reason.
- If credit cap is exceeded, abort with `credit_cap_exceeded` exit reason and return the last successful iteration's output.
- If timeout fires, abort with `timeout` exit reason and return the last successful iteration's output.
- All errors should be logged via structlog with `node_id`, `iteration`, and `exit_reason` fields.