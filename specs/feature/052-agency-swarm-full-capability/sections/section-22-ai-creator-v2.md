I now have sufficient context. Let me produce the section content.

# Section 22 -- AI Creator v2 (10-Phase Pipeline)

## Overview

Upgrade the AI Agency Creator from a 7-phase pipeline to a 10-phase pipeline that generates production-ready agencies using all 14 node types. Three new LLM-backed phases are inserted between the existing INTERVIEW and DESIGN phases: **PLAN**, **REVIEW_PLAN** (iterative loop, max 3), and **REVIEW_DESIGN** (iterative loop, max 3). The existing VALIDATE phase is enhanced with rules for the 6 new node types. The frontend stepper is updated from 7 steps to 10.

**Section ID**: `section-22-ai-creator-v2`

**Depends on**: section-17 (conditional_branch), section-18 (parallel_fan_out), section-19 (loop_retry), section-20 (skill_integration), section-21 (error_handler & data_transform)

**Blocks**: none (final batch)

---

## Key Files

| File | Action | Purpose |
|------|--------|---------|
| `python-backend/app/tasks/agency_creator_task.py` | Modify | Add 3 new LLM phases, enhance VALIDATE, add credit/call tracking |
| `python-backend/app/api/agency_creator.py` | Modify | New SSE events for plan/review phases |
| `python-backend/tests/test_agency_creator_v2.py` | Create | Unit tests for all new phases |
| `python-backend/tests/test_agency_creator_security.py` | Modify | Add security checks for new functions |
| `apps/web/client/src/components/agency/AutoCreateAgencyModal.tsx` | Modify | 10-step stepper, review iteration display |
| `apps/web/server/routers/agency.ts` | Modify | Extend autoCreateStatus to return new phase data |

---

## Tests (Write First)

### File: `python-backend/tests/test_agency_creator_v2.py`

```
# pytest: PLAN phase generates planSteps with valid nodeTypes
#   - Mock _llm_call to return a plan JSON with planSteps array
#   - Call _llm_plan() with requirement, intent, answers, available_skills, model, user_id
#   - Assert result has "planSteps" key
#   - Assert each step has "nodeType" in the 14 valid types

# pytest: REVIEW_PLAN phase catches missing error handler
#   - Mock _llm_call to return {"verdict": "needs_fix", "fixedPlan": {...}, "issues": ["no error handler"]}
#   - Call _llm_review_plan(plan, model, user_id)
#   - Assert result has verdict "needs_fix" and issues list is non-empty

# pytest: REVIEW_PLAN exits after 1 iteration if first verdict = "pass"
#   - Mock _llm_call to return {"verdict": "pass"}
#   - Call the review loop helper
#   - Assert _llm_call was called exactly once for plan review

# pytest: REVIEW_PLAN max 3 loops
#   - Mock _llm_call to always return {"verdict": "needs_fix", "fixedPlan": {...}}
#   - Call the review loop helper
#   - Assert loop ran at most 3 iterations (check call count)
#   - Assert final plan is the last fixedPlan (not an error)

# pytest: DESIGN phase generates nodeConfig for conditional_branch
#   - Mock _llm_call to return spec with conditional_branch node and nodeConfig containing rules, defaultTargetNodeId
#   - Call _llm_design with planSteps that include conditional_branch
#   - Assert the resulting spec has correct nodeConfig structure

# pytest: DESIGN phase generates nodeConfig for parallel_fan_out
#   - Similar to above, verify branches and mergeStrategy in nodeConfig

# pytest: REVIEW_DESIGN validates all nodes connected (no orphans)
#   - Mock _llm_call to return {"verdict": "needs_fix", "issues": ["node-5 is orphaned"]}
#   - Call _llm_review_design(spec, model, user_id)
#   - Assert verdict is "needs_fix" and issues mention orphan

# pytest: VALIDATE catches conditional_branch without default target
#   - Construct spec with conditional_branch node missing defaultTargetNodeId
#   - Call _validate_spec(spec)
#   - Assert defaultTargetNodeId was auto-assigned or error noted

# pytest: VALIDATE catches loop_retry with maxIterations > 20
#   - Construct spec with loop_retry node where nodeConfig.maxIterations = 50
#   - Call _validate_spec(spec)
#   - Assert maxIterations clamped to 20

# pytest: VALIDATE catches parallel_fan_out with < 2 branches
#   - Construct spec with parallel_fan_out node with only 1 branch
#   - Call _validate_spec(spec)
#   - Assert validation adds a second branch or flags the issue

# pytest: total LLM calls capped at 12 per creation
#   - Track _llm_call invocations via mock side_effect counter
#   - Run full _design_async with worst-case review loops (3+3)
#   - Assert total _llm_call count <= 12

# pytest: total credits capped at 50 per creation
#   - Mock _llm_call to return usage with token counts
#   - Run full pipeline
#   - Assert cumulative credit charge <= 50

# pytest: fallback uses prior phase result on LLM failure
#   - Mock _llm_call to return None for PLAN phase
#   - Call _llm_plan()
#   - Assert fallback plan returned (minimal valid structure with agent nodes)

# pytest: requirement "quality check + parallel research" produces agency with conditional + parallel nodes
#   - Integration-style: mock _llm_call with realistic responses
#   - Verify final spec contains both conditional_branch and parallel_fan_out node types
```

### File: `python-backend/tests/test_agency_creator_security.py` (additions)

```
# pytest: _llm_plan signature has user_id, no user_jwt
# pytest: _llm_review_plan signature has user_id, no user_jwt
# pytest: _llm_review_design signature has user_id, no user_jwt
# pytest: new LLM functions use LLMGatewayClient (no Bearer auth)
```

---

## Implementation Details

### 1. New Phase Functions in `agency_creator_task.py`

Add three new async functions alongside existing `_llm_discover` and `_llm_design`:

#### `_llm_plan(requirement, intent, answers, available_skills, model, user_id) -> dict`

- System prompt includes all 14 node types with descriptions and when-to-use criteria
- System prompt lists `available_skills` (fetched from internal API) so the LLM can reference real skill IDs
- Returns JSON structure:
  ```
  {
    "topology": "orchestrator_worker" | "handoff_chain" | "hybrid" | "custom",
    "planSteps": [
      {
        "nodeType": "agent" | ... (14 types),
        "name": "string",
        "purpose": "string",
        "skillId": "optional-skill-id",
        "connections": ["other-step-name"]
      }
    ],
    "rationale": "string"
  }
  ```
- Fallback on LLM failure: return minimal plan with 1 supervisor + 1 agent
- Call `_llm_call()` with `max_tokens=2000`, `timeout=90.0`

#### `_llm_review_plan(plan, model, user_id) -> dict`

- System prompt contains 8 review criteria: completeness, dependencies, node types, error handling, quality gates, human oversight, skills usage, efficiency
- Returns: `{"verdict": "pass" | "needs_fix", "issues": [...], "fixedPlan": {...}}`
- On `"pass"`, use original plan
- On `"needs_fix"`, use `fixedPlan` as input to next iteration
- Loop max 3 times. After 3 `needs_fix` results, accept the last `fixedPlan`
- Call `_llm_call()` with `max_tokens=3000`, `timeout=90.0`

#### `_llm_review_design(spec, model, user_id) -> dict`

- System prompt contains 10 review criteria: connectivity, entry point, conditional completeness, loop safety, parallel completeness, error coverage, skill configs, edge types, tool assignments, credit safety
- Returns: `{"verdict": "pass" | "needs_fix", "issues": [...], "fixedSpec": {...}}`
- Same loop logic as REVIEW_PLAN (max 3 iterations)
- Call `_llm_call()` with `max_tokens=4000`, `timeout=120.0`

### 2. Enhanced `_llm_design` Prompt

Update the existing `_llm_design` system prompt to:

- Accept `planSteps` from the PLAN phase as additional input in the user message
- Include all 14 node types (currently only 7) with their `nodeConfig` schemas:
  - `conditional_branch`: `{ evaluationMode, rules[], categories[], defaultTargetNodeId }`
  - `parallel_fan_out`: `{ branches[], mergeStrategy, maxConcurrent, continueOnError, timeout }`
  - `loop_retry`: `{ exitCondition, maxIterations, feedbackTemplate, timeout, loopTargetNodeId }`
  - `skill_call`: `{ skillId, inputMapping: { field: { source, value/nodeId/key } } }`
  - `skill_discovery`: `{ confidenceThreshold, maxResults, category }`
  - `data_transform`: `{ mode, expression/template/condition, outputKey }`
  - `error_handler`: `{ watchedNodeIds, strategy, maxRetries, backoffMs, fallbackNodeId }`
- Include `available_skills` list so LLM can assign correct `skillId` values

### 3. Enhanced `_validate_spec`

Add validation rules for the 6 new node types after existing validations:

- **conditional_branch**: Must have `nodeConfig.defaultTargetNodeId` pointing to an existing node. If missing, auto-assign to the first non-conditional node. Must have at least one rule or category.
- **parallel_fan_out**: Must have `nodeConfig.branches` array with >= 2 entries. Must have `mergeStrategy`. Clamp `maxConcurrent` to range [2, 10].
- **loop_retry**: Clamp `nodeConfig.maxIterations` to [1, 20]. Must have `exitCondition`. Must have `loopTargetNodeId` pointing to existing node.
- **error_handler**: `nodeConfig.watchedNodeIds` must reference existing node IDs. `maxRetries` clamped to [0, 5].
- **skill_call**: If `nodeConfig.skillId` is present, keep as-is (cannot validate at creation time without DB query).
- **skill_discovery**: Set defaults for missing `confidenceThreshold` (0.7) and `maxResults` (5).
- **data_transform**: Must have `mode` field. Default `outputKey` to `"transform_result"` if missing.

Add the new node types to `valid_tool_ids` usage: nodes of type `skill_call`, `skill_discovery`, `data_transform`, `error_handler` should NOT have tool assignments (strip `toolIds` for those types).

### 4. Pipeline Flow Changes in `_design_async`

Current flow (7 phases): DESIGN -> VALIDATE -> IMPLEMENT -> VERIFY -> DOCUMENT

New flow (phases 3-10 in `_design_async`):

```
Phase 3: PLAN       → _llm_plan()
Phase 4: REVIEW_PLAN → loop _llm_review_plan() up to 3x
Phase 5: DESIGN     → _llm_design() (enhanced, receives planSteps)
Phase 6: REVIEW_DESIGN → loop _llm_review_design() up to 3x
Phase 7: VALIDATE   → _validate_spec() (enhanced)
Phase 8: IMPLEMENT  → _implement_agency() (unchanged)
Phase 9: VERIFY     → (unchanged)
Phase 10: DOCUMENT  → _llm_document() (unchanged)
```

Each phase calls `_set_status()` with the new phase name. New status messages:
- `"plan"`: "Planning agency architecture..."
- `"review_plan"`: "Reviewing plan (iteration N/3)..."
- `"review_design"`: "Reviewing design (iteration N/3)..."

#### Skill Discovery Integration

Before calling `_llm_plan`, fetch available skills:

```python
# In _design_async, before PLAN phase:
available_skills = await _fetch_available_skills(tenant_id)
```

`_fetch_available_skills(tenant_id)` calls `GET /api/internal/skills/list?tenantId={tenant_id}` using X-Internal-Token auth (same pattern as `_implement_agency`). Returns a list of `{ id, name, category, description }`. On failure, returns empty list (non-blocking).

#### LLM Call Budget

Add a call counter and credit accumulator to `_design_async`:

```python
llm_call_count = 0
total_credits = 0.0
MAX_LLM_CALLS = 12
MAX_CREDITS = 50.0
```

Wrap `_llm_call` in a budget-aware helper that increments the counter and raises if limits exceeded. On budget exhaustion, use the last valid result and skip remaining review iterations.

#### Timeout

- `soft_time_limit=540` (9 min), `time_limit=600` (10 min) on `create_agency_design_task`
- These are already set; no change needed

#### Fallback Strategy

On any LLM failure within a phase:
- **PLAN failure**: Use `_fallback_plan(requirement, intent)` returning a minimal 2-node plan (supervisor + agent)
- **REVIEW_PLAN failure**: Accept the current plan as-is (skip review)
- **DESIGN failure**: Use existing `_fallback_agency_spec(requirement)`
- **REVIEW_DESIGN failure**: Accept the current spec as-is (skip review)

### 5. Celery Task Structure

The two-task split remains unchanged:
- **Task 1** (`create_agency_discover_task`): Phases 1-2 (DISCOVER, INTERVIEW) -- no changes
- **Task 2** (`create_agency_design_task`): Phases 3-10 (PLAN through DOCUMENT) -- enhanced

### 6. Frontend: `AutoCreateAgencyModal.tsx`

Update the `PHASES` constant from 7 to 10 steps:

```typescript
const PHASES = [
  { id: "discover", label: "Discover" },
  { id: "interview", label: "Interview" },
  { id: "plan", label: "Plan" },
  { id: "review_plan", label: "Review Plan" },
  { id: "design", label: "Design" },
  { id: "review_design", label: "Review Design" },
  { id: "validate", label: "Validate" },
  { id: "implement", label: "Implement" },
  { id: "verify", label: "Verify" },
  { id: "document", label: "Document" },
  { id: "done", label: "Done" },
];
```

Add state for review iterations:

```typescript
const [planReviewIteration, setPlanReviewIteration] = useState(0);
const [designReviewIteration, setDesignReviewIteration] = useState(0);
```

In the poll handler, detect `review_plan` and `review_design` phases and extract iteration count from `status.message` (e.g., "Reviewing plan (iteration 2/3)..."). Display iteration badges on the stepper steps for review phases.

No new tRPC procedures are needed -- the existing `autoCreateStatus` poll returns phase name and message, which already accommodates the new phases.

### 7. tRPC Router Changes (Minimal)

The existing `autoCreateStatus` procedure in `apps/web/server/routers/agency.ts` already returns the raw Redis status (minus internal `_` fields). Since new phases just use new `phase` string values, no schema changes are needed. The frontend uses a string-based phase check, so new phase names are automatically supported.

### 8. SSE Events (Optional Enhancement)

If section-09 (SSE streaming backend) is complete, emit new SSE events during creation:
- `plan_created` -- after PLAN phase completes
- `plan_review_iteration` -- after each REVIEW_PLAN iteration (includes iteration number and verdict)
- `design_review_iteration` -- after each REVIEW_DESIGN iteration

These events are published to Redis channel `agency-creator:{task_id}` using the same pattern as the status updates. This is an optional enhancement over the polling mechanism.

---

## Node Type Reference for LLM Prompts

The PLAN and DESIGN prompts must include descriptions of all 14 node types. Use this catalog:

| Node Type | Category | When to Use |
|-----------|----------|-------------|
| `agent` | AI Agents | General-purpose AI worker with tools |
| `supervisor` | AI Agents | Coordinates other agents, delegates tasks |
| `router` | Flow Control | Routes messages to different agents based on content |
| `aggregator` | Flow Control | Collects outputs from multiple agents, synthesizes |
| `conditional_branch` | Flow Control | Branches execution based on rules, LLM classification, or context |
| `parallel_fan_out` | Flow Control | Runs N branches concurrently, merges results |
| `loop_retry` | Flow Control | Repeats a sub-flow until exit condition met |
| `knowledge_base` | Data & Skills | Injects RAG knowledge into the flow |
| `skill_call` | Data & Skills | Executes a specific SmartSpecPro skill with input mapping |
| `skill_discovery` | Data & Skills | Auto-detects the best skill for a task |
| `data_transform` | Data & Skills | Transforms data between nodes (JSONPath, template, filter) |
| `error_handler` | Resilience | Catches errors from watched nodes, applies retry/fallback/skip |
| `human_approval` | Human in Loop | Pauses execution for human review |
| `browser_session` | Human in Loop | Opens interactive browser session |

---

## Security Considerations

- All new `_llm_*` functions accept `user_id` (int), never `user_jwt` -- matches existing pattern
- LLM calls go through `LLMGatewayClient` with `X-Internal-Token` auth
- `available_skills` list is fetched via internal API with `X-Internal-Token` -- no user credentials in Celery tasks
- Credit cap (50) prevents runaway LLM spending during creation
- LLM call cap (12) prevents infinite review loops
- Review loop max (3 per phase) is enforced programmatically, not by LLM decision
- `_safe_json_parse` is reused for all new LLM response parsing -- strips markdown code blocks

---

## Dependency Notes

- **Sections 17-21 must be complete** before this section can generate agencies with the 6 new node types. The validation rules in `_validate_spec` reference nodeConfig schemas defined in those sections.
- **Section 01 (database migration)** must be complete for the new columns referenced by the DESIGN phase (e.g., `nodeConfig` structures for new node types).
- **Section 20 (skill integration)** is needed for the skill discovery integration in the PLAN phase -- specifically the internal skills list API.
- The existing `_implement_agency` function calls `POST /api/internal/agency/create` which must accept the new node types in the `agents` array. This is handled by the existing `saveBuilder` procedure once sections 17-21 add those node types to the Zod validation.