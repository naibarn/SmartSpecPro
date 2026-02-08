Now I'll generate the section content for section-15-integration based on the test definitions and the full plan.

# Integration Testing (Section 15)

## Overview

Section 15 completes the workflow editor redesign by implementing comprehensive end-to-end tests that verify all components work together correctly. This section is the final validation checkpoint before the feature is production-ready. Tests cover full workflow execution cycles, service integration, real-time visualization, template lifecycle management, credit enforcement, and multi-tenant isolation.

**Dependencies:** All sections 1-14 must be completed.
**Rationale:** Integration tests require all components in place to validate cross-layer interactions.

## Test Structure

All integration tests follow this pattern:
1. Set up test database with users, tenants, and credentials
2. Create a workflow graph (nodes + edges)
3. Compile the workflow
4. Execute the workflow
5. Verify execution results, state changes, side effects
6. Clean up

Test files are organized by concern:
- `python-backend/tests/integration/test_workflow_e2e.py` — Full workflow execution cycles
- `python-backend/tests/integration/test_template_lifecycle.py` — Template CRUD and marketplace interactions
- `python-backend/tests/integration/test_execution_streaming.py` — SSE event delivery
- `python-backend/tests/integration/test_credit_flow.py` — Credit deduction accuracy
- `python-backend/tests/integration/test_tenant_isolation.py` — Multi-tenant boundaries

## Test Categories

### Category 1: Basic Workflow Execution

**Test: E2E — Simple LLM Call**

- Create single LLM Call node with hardcoded prompt
- Compile workflow
- Execute workflow
- Verify: response output contains non-empty text
- Verify: usage output contains token count and cost
- Verify: execution status is `completed`

**Test: E2E — Multi-Node Chain: RAG → LLM → Output**

- Create RAG Query node with collection + query
- Connect RAG output (documents) to LLM node
- LLM prompt uses `{{rag_node.context}}`
- Compile
- Execute
- Verify: RAG returns documents array
- Verify: LLM receives concatenated context
- Verify: final output uses enriched context

**Implementation guidance:**
- Use test fixtures to create mock collection with sample documents
- Verify expression resolution in LLM prompt before execution
- Confirm data flows through edges (not bypassed)

### Category 2: Conditional Branching

**Test: E2E — Conditional True Path**

- Create: LLM Call → Conditional → Image Gen (true) → End
- Conditional checks: LLM response length > 100 chars
- Execute
- Verify: Conditional evaluates true
- Verify: Image Gen node executes
- Verify: End node (implied) completes

**Test: E2E — Conditional False Path**

- Same graph as above
- Mock LLM to return response < 100 chars
- Verify: Conditional evaluates false
- Verify: Image Gen node is skipped (status: skipped)
- Verify: downstream nodes not executed

**Test: E2E — Complex Condition (AND / OR)**

- Conditional with visual mode: (response_length > 100) AND (contains "success")
- Execute with data matching both → true path
- Execute with data matching only one → false path
- Verify: AND/OR logic applied correctly

**Implementation guidance:**
- Mock LLM responses deterministically
- Verify that skipped nodes appear in execution log but not in backend execution
- Confirm status transitions in execution store

### Category 3: Loop Iteration

**Test: E2E — Loop Count Mode**

- Create: Loop (count=3) → LLM Call (inside loop) → Collect Results
- Inside loop, LLM node gets `{{loop.item}}` (should be iteration index)
- Execute
- Verify: Loop executes 3 times
- Verify: results array has 3 outputs
- Verify: index increments: 0, 1, 2

**Test: E2E — Loop Data Mode**

- Create: Loop (data=["item1", "item2", "item3"]) → LLM Call → Results
- LLM prompt: "Process: {{loop.item}}"
- Execute
- Verify: Loop iterates 3 times (one per array item)
- Verify: LLM called with "Process: item1", "Process: item2", "Process: item3"
- Verify: results array contains 3 LLM responses

**Test: E2E — Loop While Mode with Break**

- Create: Loop (while: itemIndex < 5, breakCondition: response contains "STOP") → LLM → Results
- Mock LLM to return "STOP" on iteration 3
- Verify: Loop executes 3 times (not all 5)
- Verify: break condition halts iteration

**Test: E2E — Nested Data (Loop over Array of Objects)**

- Input data: `[{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]`
- Inside loop: LLM prompt uses `{{loop.item.name}}` and `{{loop.item.age}}`
- Verify: nested field access works

**Test: E2E — Max Iterations Safety**

- Create: Loop (count=200, maxIterations=100)
- Execute
- Verify: Loop stops at 100 iterations (safety enforced)
- Verify: no hang or timeout

**Implementation guidance:**
- Use parent-child node relationships to place nodes inside loop
- Mock parent-child structure in test graph
- Verify loop state management (item, index variables)
- Confirm result accumulation

### Category 4: Approval Gate

**Test: E2E — Approval Gate → Approved Path**

- Create: LLM Call → Approval Gate (timeout: 5 min) → Image Gen (approved) → End
- Mock approval request creation
- Simulate approval response
- Execute
- Verify: Approval creates ApprovalRequest in DB
- Verify: Workflow pauses and waits for approval
- Verify: Upon approval, routes to approved output
- Verify: Image Gen executes

**Test: E2E — Approval Gate → Rejected Path**

- Same as above, but simulate rejection
- Verify: Routes to rejected output instead
- Verify: Image Gen skipped

**Test: E2E — Approval Timeout**

- Approval with timeout=1 second
- Don't simulate approval
- Execute
- Verify: After 1 second, approval request auto-rejects
- Verify: Routes to rejected output

**Test: E2E — Multiple Approvers**

- Approval node configured for 2 approvers
- Only 1 approver responds
- Verify: Workflow still waiting (requiredApprovals=2)
- All 2 respond
- Verify: Workflow proceeds

**Implementation guidance:**
- Mock ApprovalDBService responses
- Use task scheduling or manual time advancement for timeout testing
- Verify checkpoint/resume mechanism works

### Category 5: Skill Node Integration

**Test: E2E — Skill Node Execution**

- Create: Manual input (text) → Skill Node (e.g., "Enhance Prompt") → LLM Call → Output
- Configure skill with input values
- Execute
- Verify: Skill executor receives correct inputs
- Verify: Skill returns expected output (enhanced prompt)
- Verify: LLM uses enhanced prompt as input

**Test: E2E — Skill Node with Expression**

- Skill node input uses `{{upstream_node.output}}`
- Execute
- Verify: Expression resolved before skill execution

**Implementation guidance:**
- Use a real skill from registry (e.g., "enhance-prompt")
- Mock skill execution if needed to control output
- Verify schema validation against skill's input schema

### Category 6: Template Lifecycle

**Test: E2E — Template Save → List → Load → Execute**

- Create and save workflow as template (name: "RAG + LLM Template", tags: ["rag", "llm"])
- Search templates: query="RAG" → finds template
- Filter by tag: "llm" → finds template
- Load template → creates new workflow from template JSON
- Execute loaded workflow
- Verify: Template appears in marketplace
- Verify: Download count increments
- Verify: Loaded workflow structure matches original

**Test: E2E — Tenant-Private Template Isolation**

- User A creates private template
- User B lists templates
- Verify: User B doesn't see User A's private template
- User A publishes template
- User B lists templates
- Verify: User B now sees published template

**Test: E2E — Template Rating (Self-Rating Prevention)**

- User A creates template
- User A tries to rate own template
- Verify: Fails (authorId != userId check)
- User B rates template with 5 stars
- User B tries to rate again
- Verify: Fails (UNIQUE constraint prevents duplicate)
- User C rates with 3 stars
- Verify: Average rating is 4 stars (5 + 3) / 2

**Test: E2E — Template Categories**

- Create category hierarchy: "AI" → "LLM" → "Language Models"
- Save template under "Language Models"
- Filter templates by category
- Verify: Category filtering works
- Verify: Hierarchical parent-child relationships preserved

**Implementation guidance:**
- Test all CRUD operations: create, read (list/get), update, delete
- Verify template JSON validation (no malicious content)
- Test pagination: list 10 templates per page
- Test sorting: popular, top-rated, newest

### Category 7: Real-Time Execution Visualization

**Test: E2E — SSE Stream Delivery**

- Create multi-node workflow: LLM → Conditional → (Image | End)
- Start execution
- Client opens SSE connection
- Verify event stream receives (in order):
  - `node_start` (LLM node)
  - `node_complete` (LLM node, with response summary)
  - `node_start` (Conditional node)
  - `node_complete` (Conditional node)
  - `node_start` (Image node)
  - `node_complete` (Image node)
  - `workflow_complete` (final event)
- All events have timestamps, nodeId, nodeName

**Test: E2E — SSE Reconnection with Last-Event-ID**

- Start execution
- Client receives node_start event (event ID = "1")
- Network drops (client disconnects)
- Execute node, emit node_complete (event ID = "2")
- Client reconnects with Last-Event-ID="1"
- Verify: Server replays events since ID=1
- Client receives node_complete (missed event)
- Receives next events without duplicates

**Test: E2E — SSE Error Event**

- Create LLM node with invalid config (missing required field)
- Start execution
- Verify: node_error event emitted with error message
- Verify: workflow_error event follows
- Verify: execution status is failed

**Implementation guidance:**
- Mock long-running LLM calls to observe node transitions
- Verify event ordering (no node_complete before node_start)
- Test network interruption using client-side hooks
- Verify event closures and cleanup

### Category 8: Cost Estimation and Credit Enforcement

**Test: E2E — Cost Estimation Pre-Execution**

- Create workflow: 2x LLM nodes, 1x Image node
- Call estimate-cost endpoint
- Verify: Returns estimated credits (e.g., 120 credits)
- Verify: Estimate within 20% of actual execution

**Test: E2E — Cost Estimation Accuracy (20% Margin)**

- Run multiple workflows and compare estimate vs actual
- Calculate margin: `(actual - estimate) / estimate`
- Verify: All margins within ±20%

**Test: E2E — Insufficient Credits Block Execution**

- User has 50 credits
- Workflow estimated at 100 credits
- Try to execute
- Verify: Execution rejected with InsufficientCreditsError
- Verify: User credits unchanged

**Test: E2E — Credit Deduction After Success**

- User starts with 500 credits
- Execute LLM node (costs 25 credits)
- Verify: User credits decreased to 475
- Verify: provider_usage_log records transaction with traceId
- Verify: creditTransactions table records deduction

**Test: E2E — No Credit Deduction on Failure**

- Execute LLM with bad API key (mocked to fail)
- Verify: Execution fails
- Verify: Credits NOT deducted

**Test: E2E — Multi-Step Deduction Accuracy**

- Execute workflow: LLM (25 credits) → Image (50 credits) → LLM (25 credits) = 100 total
- Verify: Final balance decreased by exactly 100
- Verify: Each step logged individually in provider_usage_log
- Verify: Total cost_usd matches sum of steps

**Implementation guidance:**
- Use fixture to set deterministic user credit balance
- Mock LLM responses with known token counts for reproducibility
- Verify atomic transactions (all-or-nothing)
- Check both credit_transactions and provider_usage_log tables

### Category 9: Tenant Isolation

**Test: E2E — Workflows Isolated by Tenant**

- Create 2 tenants (A, B)
- User A creates workflow X
- User B tries to load workflow X
- Verify: Access denied (404 or 403)
- User B lists workflows
- Verify: Workflow X not in list

**Test: E2E — Templates Isolated (Private)**

- User A (tenant A) creates private template T
- User B (tenant B) lists templates
- Verify: T not visible to B
- User C (tenant A, different user) lists templates
- Verify: T not visible to C (different user, private)

**Test: E2E — Templates Visible (Public + Same Tenant)**

- User A (tenant A) publishes template T as public
- User B (tenant B) lists templates
- Verify: T visible to B (public)
- User C (tenant A, different user) lists templates
- Verify: T visible to C (public, same tenant)

**Test: E2E — RAG Collections Scoped to Tenant**

- Tenant A has collection "Docs A"
- Tenant B tries to query "Docs A"
- Verify: Collection not found (403 or 404)

**Test: E2E — Approvers Scoped to Tenant**

- Tenant A has users [alice, bob]
- Tenant B has users [charlie, diana]
- Approval node in Tenant A workflow lists available approvers
- Verify: Only alice, bob appear (not charlie, diana)

**Implementation guidance:**
- Create test fixtures for multi-tenant setup
- Use context/request object to track current tenant
- Verify all DB queries include tenant filter
- Test both implicit (query scoping) and explicit (access check) isolation

## Testing Strategy

### Setup and Fixtures

All integration tests use:
- **Database transaction rollback** — Each test wraps in a transaction that rolls back after test completes. Prevents test data pollution.
- **Seeded test data** — Users, tenants, skills, collections, approvers created in fixtures (conftest.py).
- **Mocked external services** — LLM API calls, media generation, email notifications mocked to return deterministic responses.
- **Time control** — Use pytest-freezegun or similar to mock timers for approval timeout testing.

### Running Integration Tests

```bash
# Python backend integration tests
cd python-backend
uv run pytest tests/integration/ -v -m integration

# Frontend integration tests (if applicable)
cd apps/web
pnpm test integration
```

### Coverage Requirements

- **Backend:** Minimum 80% coverage (enforced by project policy)
- **Frontend:** Minimum 70% coverage for integration tests (looser because many interactions are mocked)

### Test Independence

No integration test depends on the result of another test. Each test:
1. Creates its own test data (users, workflows, templates)
2. Executes in isolation
3. Cleans up after itself

Tests can run in parallel (max 4 test workers).

## Implementation Notes

### Critical Paths to Test

1. **LLM Call** — Simplest path. Validates credit system, expression resolution, output format.
2. **RAG + LLM** — Validates data flow between nodes, nested field access.
3. **Conditional** — Validates evaluation engine, branching logic, skipped node handling.
4. **Loop** — Complex state management. Tests iteration, accumulation, break conditions.
5. **Approval** — Validates checkpoint/resume, multi-user flows, timeout.
6. **Skill nodes** — Validates schema discovery and execution pipeline integration.
7. **Templates** — Validates CRUD, tenant isolation, rating constraints.
8. **SSE** — Validates real-time UI updates, reconnection.

### Mock Strategy

| Component | Strategy |
|-----------|----------|
| LLM API | Mock responses with fixed tokens, cost |
| Media generation | Mock async task, return dummy URL |
| Email / Telegram | Mock send (no actual messages) |
| Database | Use test DB with transactions |
| Redis | Use test instance or in-memory cache |
| File uploads | Mock S3 with local temp directory |

### Debugging Failed Tests

1. Check execution logs in `provider_usage_log` table (has timestamps, costs, errors)
2. Check execution status in workflow execution state
3. Print test workflow JSON to verify graph structure
4. Use `pytest -vv` for detailed assertion output
5. Set breakpoints in executor code if logic is unclear

## File Locations

### Python Backend Tests

- `/home/dev/projects/SmartSpecPro/python-backend/tests/integration/test_workflow_e2e.py` — Basic execution cycles
- `/home/dev/projects/SmartSpecPro/python-backend/tests/integration/test_template_lifecycle.py` — Template CRUD
- `/home/dev/projects/SmartSpecPro/python-backend/tests/integration/test_execution_streaming.py` — SSE events
- `/home/dev/projects/SmartSpecPro/python-backend/tests/integration/test_credit_flow.py` — Credit deductions
- `/home/dev/projects/SmartSpecPro/python-backend/tests/integration/test_tenant_isolation.py` — Multi-tenant boundaries

### Frontend Tests (if applicable)

- `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/__tests__/integration/` — Full editor workflows

## Success Criteria

All integration tests pass:
```bash
python-backend/tests/integration/ — 100% pass rate
```

Coverage:
```bash
coverage report --include=app/orchestrator/,app/api/workflow.py
# Minimum 80% for backend
```

No integration test should take more than 30 seconds (indicates missing mock or infinite loop).