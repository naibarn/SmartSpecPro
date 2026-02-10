# TDD Plan: Workflow Editor Node System Redesign

Companion document to `claude-plan.md`. Defines tests to write BEFORE implementing each section.

## Testing Stack

**Python Backend (pytest):**
- Framework: pytest with markers (unit, integration, e2e, auth, credits, llm)
- 80% minimum coverage enforced
- Existing fixtures in `conftest.py`
- Test files in `python-backend/tests/`
- Run: `cd python-backend && uv run pytest tests/ -v`

**Frontend (Vitest):**
- Framework: Vitest (configured via Vite)
- Test files co-located or in `__tests__/` dirs
- Run: `cd apps/web && pnpm test`

---

## Section 1: Database Schema + Migrations

### Tests to Write

```python
# tests/test_workflow_schema.py

# Test: workflows table creation — insert a workflow with required fields, verify it persists
# Test: workflows table — workflowJson column stores and retrieves valid JSON (nodes array, edges array)
# Test: workflows table — status enum only accepts valid values (draft, compiled, running, completed, failed)
# Test: workflows table — userId FK constraint rejects non-existent user
# Test: workflows table — tenantId scoping (two tenants, each sees only own workflows)
# Test: workflows table — schemaVersion defaults to '1.0'
# Test: workflows table — updatedAt auto-updates on modification

# Test: workflow_templates table — insert with required fields succeeds
# Test: workflow_templates table — isPublic defaults to false
# Test: workflow_templates table — tags array stores and retrieves correctly (GIN indexed)
# Test: workflow_templates table — status enum accepts valid values (draft, pending_review, published, archived)
# Test: workflow_templates table — downloadCount defaults to 0

# Test: template_categories table — hierarchical (parentId self-FK works)
# Test: template_categories table — slug unique constraint enforced

# Test: template_ratings table — UNIQUE(templateId, userId) prevents duplicate ratings
# Test: template_ratings table — rating value constrained between 1-5

# Test: search_vector tsvector — full-text search finds templates by name keyword
# Test: search_vector tsvector — full-text search finds templates by description keyword
# Test: GIN index on tags — array contains operator (@>) works for tag filtering
```

---

## Section 2: Backend Node Type Registry + API Endpoints

### Tests to Write

```python
# tests/test_node_registry.py

# Test: NodeTypeSpec creation — all required fields present
# Test: InputSpec — data_type and ui_type are separate fields (not conflated)
# Test: OutputSpec — data_type validates against known types (text, json, array, image, number, boolean, any)
# Test: registry — register_node_type adds to registry, get_node_type retrieves it
# Test: registry — get_all_node_types returns all registered types
# Test: registry — duplicate type registration raises error
# Test: registry — core node types (llm_call, rag_query, conditional, loop, approval_gate, generate_image) all registered

# tests/test_node_type_api.py

# Test: GET /api/v1/workflow/node-types — returns all registered node types as JSON
# Test: GET /api/v1/workflow/node-types — response includes inputs with data_type, ui_type, accepts_connection fields
# Test: GET /api/v1/workflow/node-types — response includes outputs with data_type fields
# Test: GET /api/v1/workflow/node-types — includes skill nodes alongside core nodes
# Test: GET /api/v1/workflow/node-types — unauthenticated request returns 401

# Test: GET /api/v1/workflow/available-models — returns models with cost and quality info
# Test: GET /api/v1/workflow/available-models — models sorted by recommendation score
# Test: GET /api/v1/workflow/available-models — includes Recommended badge on top entry

# Test: GET /api/v1/workflow/rag-collections — returns collections scoped to tenant
# Test: GET /api/v1/workflow/rag-collections — empty list when tenant has no collections

# Test: GET /api/v1/workflow/available-approvers — returns users for tenant
# Test: GET /api/v1/workflow/available-approvers — respects tenant isolation

# Test: GET /api/v1/workflow/image-providers — returns available providers with size options
```

---

## Section 3: Node Executors (Backend)

### Tests to Write

```python
# tests/test_node_executors.py

# --- LLM Executor ---
# Test: LLM executor — calls LLM Gateway with correct model and prompt
# Test: LLM executor — resolves {{variable}} expressions in prompt before calling
# Test: LLM executor — returns response text in 'response' output and usage in 'usage' output
# Test: LLM executor — checks user credit balance before execution, raises InsufficientCreditsError
# Test: LLM executor — deducts credits after successful call
# Test: LLM executor — propagates LLM Gateway errors as node execution error

# --- RAG Executor ---
# Test: RAG executor — calls HybridRAG with correct collection and query
# Test: RAG executor — respects searchMode (vector, hybrid, bm25)
# Test: RAG executor — applies topK and scoreThreshold parameters
# Test: RAG executor — returns documents array, context text, and metadata
# Test: RAG executor — raises error when collection not found

# --- Conditional Executor ---
# Test: Conditional executor — visual mode equals operator (match → true output, no match → false)
# Test: Conditional executor — visual mode notEquals operator
# Test: Conditional executor — visual mode greaterThan/lessThan with numeric values
# Test: Conditional executor — visual mode contains operator with string
# Test: Conditional executor — visual mode isEmpty/isNotEmpty
# Test: Conditional executor — visual mode AND combiner (both conditions must pass)
# Test: Conditional executor — visual mode OR combiner (either condition passes)
# Test: Conditional executor — advanced mode with simpleeval expression
# Test: Conditional executor — security: rejects expressions with __dunder__ access
# Test: Conditional executor — security: rejects expressions with import/exec/eval
# Test: Conditional executor — security: enforces max expression length (1000 chars)
# Test: Conditional executor — security: times out after 5 seconds

# --- Approval Executor ---
# Test: Approval executor — creates ApprovalRequest via ApprovalDBService
# Test: Approval executor — pauses workflow and returns checkpoint
# Test: Approval executor — routes to 'approved' output when approved
# Test: Approval executor — routes to 'rejected' output when rejected
# Test: Approval executor — times out and rejects after configured timeout

# --- Image Executor ---
# Test: Image executor — creates media task via MediaTaskService
# Test: Image executor — returns imageUrl and metadata on success
# Test: Image executor — checks credits before execution
# Test: Image executor — handles generation failure gracefully
```

---

## Section 4: Expression Resolver (Backend)

### Tests to Write

```python
# tests/test_expression_resolver.py

# Test: resolve — replaces single {{nodeId.outputName}} with actual value from execution state
# Test: resolve — replaces {{nodeId.outputName.field.nested}} with nested dict access
# Test: resolve — replaces multiple expressions in same string
# Test: resolve — preserves text around expressions ("Hello {{node1.response}}, your score is {{node2.score}}")
# Test: resolve — string with no expressions returns unchanged
# Test: resolve — raises ExpressionResolutionError for {{nonExistentNode.output}}
# Test: resolve — raises ExpressionResolutionError for {{existingNode.nonExistentOutput}}
# Test: resolve — handles None values (returns empty string or "null")
# Test: resolve — handles numeric values (converts to string in text context)
# Test: resolve — handles boolean values
# Test: resolve — handles array/dict values (JSON stringifies)
# Test: resolve — max expression length enforcement (>1000 chars rejected)
# Test: resolve — no eval() used (pure string replacement + dict lookup)
# Test: resolve — malicious expression {{__class__.__mro__}} does not execute
```

---

## Section 5: Skill Node Auto-Generation

### Tests to Write

```python
# tests/test_skill_nodes.py

# Test: discover_skills — scans skills registry and finds skills with schemas/input.schema.json
# Test: discover_skills — skips skills without schemas/input.schema.json
# Test: schema_to_node_mapping — string field maps to (data_type: text, ui_type: text)
# Test: schema_to_node_mapping — string field with enum maps to (data_type: text, ui_type: select) with options
# Test: schema_to_node_mapping — number field maps to (data_type: number, ui_type: number)
# Test: schema_to_node_mapping — boolean field maps to (data_type: boolean, ui_type: toggle)
# Test: schema_to_node_mapping — array of strings maps to (data_type: array, ui_type: multiselect)
# Test: schema_to_node_mapping — all generated inputs have accepts_connection: true
# Test: skill_executor — validates inputs against schema before execution
# Test: skill_executor — calls existing skill execution pipeline
# Test: skill_executor — returns result text and metadata json
# Test: GET /api/v1/workflow/skill-nodes — returns list of auto-generated skill node types
```

---

## Section 6: Loop Executor + Loop Group

### Tests to Write

```python
# tests/test_loop_executor.py

# Test: loop — count mode executes body N times
# Test: loop — data mode iterates over array, setting item variable each iteration
# Test: loop — while mode evaluates condition each iteration, stops when false
# Test: loop — maxIterations safety limit prevents infinite loops (default 100)
# Test: loop — breakCondition expression stops loop mid-execution
# Test: loop — results array collects all iteration outputs
# Test: loop — index variable increments each iteration
# Test: loop — empty array in data mode produces empty results (zero iterations)
# Test: loop — nested data access (iterating over array of dicts)

# tests/test_loop_group_compiler.py

# Test: FlowCompiler — detects parent-child node relationships (parentId)
# Test: FlowCompiler — identifies loop body nodes from parent-child hierarchy
# Test: FlowCompiler — validates loop body contains at least one node
# Test: FlowCompiler — rejects cycles outside of explicit loop groups
```

---

## Section 7: FlowCompiler Updates

### Tests to Write

```python
# tests/test_flow_compiler_v2.py

# Test: compile — loads node types from registry (not hardcoded NODE_TYPE_MAP)
# Test: compile — validates all node types in flow exist in registry
# Test: compile — validates port type compatibility for all edges
# Test: compile — incompatible port connection (e.g., image → number) raises CompilationError
# Test: compile — validates all required inputs are either configured or connected
# Test: compile — missing required input raises CompilationError with node name and input name
# Test: compile — detects loop groups from parent-child relationships
# Test: compile — validates DAG structure (no cycles outside loop groups)
# Test: compile — generates expression resolution metadata
# Test: compile — handles skill nodes alongside core nodes
# Test: compile — enforces loop max iterations in compilation output
```

---

## Section 8: Workflow API Implementation

### Tests to Write

```python
# tests/test_workflow_api.py

# Test: POST /api/v1/workflow/execute — accepts compiled workflow, starts execution, returns execution_id
# Test: POST /api/v1/workflow/execute — rejects uncompiled workflow
# Test: POST /api/v1/workflow/execute — checks user credits before starting
# Test: GET /api/v1/workflow/list — returns user's workflows scoped to tenant
# Test: GET /api/v1/workflow/report/{id} — returns execution status and node results
# Test: GET /api/v1/workflow/report/{id} — tenant isolation (can't see other tenant's executions)
# Test: POST /api/v1/workflow/estimate-cost — returns estimated credits for LLM + media + skill nodes
# Test: POST /api/v1/workflow/estimate-cost — warns when estimated cost exceeds balance
```

```typescript
// apps/web/server/routers/__tests__/workflow.test.ts

// Test: workflow.save — creates new workflow draft
// Test: workflow.save — updates existing workflow (upsert)
// Test: workflow.load — retrieves workflow by id for current user
// Test: workflow.load — rejects loading another user's workflow
// Test: workflow.list — returns workflows with status filter
// Test: workflow.delete — soft deletes workflow
```

---

## Section 9: SSE Execution Stream

### Tests to Write

```python
# tests/test_sse_execution.py

# Test: GET /execute/{id}/stream — returns event-stream content type
# Test: SSE — authenticates via session cookie (not header)
# Test: SSE — unauthenticated request returns 401
# Test: SSE — emits node_start event when node begins execution
# Test: SSE — emits node_complete event with output summary and duration
# Test: SSE — emits node_error event with error details
# Test: SSE — emits workflow_complete event after all nodes finish
# Test: SSE — emits workflow_error event on unrecoverable failure
# Test: SSE — supports Last-Event-ID reconnection (replays missed events)
# Test: SSE — closes connection when workflow completes
```

---

## Section 10: Frontend BaseNode + useNodeRegistry

### Tests to Write

```typescript
// apps/web/client/src/components/workflow/nodes/__tests__/BaseNode.test.tsx

// Test: BaseNode — renders node label from data.label
// Test: BaseNode — renders correct icon for node type (from registry lookup)
// Test: BaseNode — renders input Handles for inputs with accepts_connection: true
// Test: BaseNode — renders output Handles for all outputs
// Test: BaseNode — color-codes handles by data_type (blue for text, green for json, etc.)
// Test: BaseNode — shows selected state styling when node is selected
// Test: BaseNode — renders config summary on node face

// apps/web/client/src/lib/workflow/__tests__/useNodeRegistry.test.ts

// Test: useNodeRegistry — fetches node types from /api/v1/workflow/node-types
// Test: useNodeRegistry — caches response (doesn't refetch on re-render)
// Test: useNodeRegistry — getNodeType returns definition for known type
// Test: useNodeRegistry — getNodeType returns undefined for unknown type

// apps/web/client/src/lib/workflow/__tests__/dataTypes.test.ts

// Test: isCompatibleConnection — text → text is valid
// Test: isCompatibleConnection — text → any is valid
// Test: isCompatibleConnection — image → number is invalid
// Test: isCompatibleConnection — any → any is valid
// Test: isCompatibleConnection — json → text is valid (auto-stringify)
```

---

## Section 11: Frontend DynamicNodeConfig + ExpressionInput

### Tests to Write

```typescript
// apps/web/client/src/components/workflow/config/__tests__/DynamicNodeConfig.test.tsx

// Test: DynamicNodeConfig — renders text input for ui_type: text
// Test: DynamicNodeConfig — renders textarea for ui_type: textarea
// Test: DynamicNodeConfig — renders slider for ui_type: slider with min/max
// Test: DynamicNodeConfig — renders select dropdown for ui_type: select
// Test: DynamicNodeConfig — renders toggle switch for ui_type: toggle
// Test: DynamicNodeConfig — fetches async options from options_endpoint
// Test: DynamicNodeConfig — shows loading spinner while fetching options
// Test: DynamicNodeConfig — shows validation errors for invalid input
// Test: DynamicNodeConfig — connected inputs show connection indicator instead of form control

// apps/web/client/src/components/workflow/config/__tests__/ExpressionInput.test.tsx

// Test: ExpressionInput — renders as text input
// Test: ExpressionInput — detects {{ trigger and shows autocomplete dropdown
// Test: ExpressionInput — autocomplete lists upstream nodes and their outputs
// Test: ExpressionInput — selecting autocomplete option inserts {{nodeId.output}}
// Test: ExpressionInput — highlights expression tokens visually
// Test: ExpressionInput — validates that referenced nodes exist in graph

// apps/web/client/src/components/workflow/config/__tests__/ConditionBuilder.test.tsx

// Test: ConditionBuilder — visual mode renders operator dropdown and compare value field
// Test: ConditionBuilder — visual mode allows adding multiple conditions with AND/OR
// Test: ConditionBuilder — advanced mode renders expression text area
// Test: ConditionBuilder — switching modes preserves equivalent expression where possible
```

---

## Section 12: Frontend Execution Visualization

### Tests to Write

```typescript
// apps/web/client/src/components/workflow/execution/__tests__/ExecutionOverlay.test.tsx

// Test: ExecutionOverlay — pending node shows default styling
// Test: ExecutionOverlay — running node shows blue pulsing border (CSS animation)
// Test: ExecutionOverlay — success node shows green border with checkmark
// Test: ExecutionOverlay — failed node shows red border with X
// Test: ExecutionOverlay — skipped node shows gray dashed border

// apps/web/client/src/components/workflow/execution/__tests__/ExecutionLogPanel.test.tsx

// Test: ExecutionLogPanel — renders chronological log entries
// Test: ExecutionLogPanel — each entry shows timestamp, node name, status, duration
// Test: ExecutionLogPanel — expandable entries show data details
// Test: ExecutionLogPanel — error entries display error message
// Test: ExecutionLogPanel — "Copy output" button copies data to clipboard
// Test: ExecutionLogPanel — auto-scrolls to latest entry

// apps/web/client/src/components/workflow/execution/__tests__/CostEstimation.test.tsx

// Test: CostEstimation — shows estimated credits for workflow
// Test: CostEstimation — shows user's current balance
// Test: CostEstimation — disables Run button when estimate exceeds balance
// Test: CostEstimation — shows warning when estimate is close to balance

// apps/web/client/src/stores/__tests__/executionStore.test.ts

// Test: executionStore — initial state: not executing, empty statuses
// Test: executionStore — startExecution sets isExecuting true
// Test: executionStore — updateNodeStatus updates specific node status
// Test: executionStore — addLog appends to log array
// Test: executionStore — completeExecution sets isExecuting false
```

---

## Section 13: Frontend Template Browser + Save

### Tests to Write

```typescript
// apps/web/client/src/components/workflow/templates/__tests__/TemplateBrowser.test.tsx

// Test: TemplateBrowser — renders search input
// Test: TemplateBrowser — search triggers debounced API call (not on every keystroke)
// Test: TemplateBrowser — renders category filter chips
// Test: TemplateBrowser — renders sort dropdown (Popular, Top Rated, Newest)
// Test: TemplateBrowser — renders grid of TemplateCard components
// Test: TemplateBrowser — shows pagination controls
// Test: TemplateBrowser — shows loading skeleton while fetching

// apps/web/client/src/components/workflow/templates/__tests__/TemplateCard.test.tsx

// Test: TemplateCard — renders name, description, author
// Test: TemplateCard — renders rating stars from average rating
// Test: TemplateCard — renders download count
// Test: TemplateCard — "Use Template" button calls onUseTemplate callback

// apps/web/client/src/components/workflow/templates/__tests__/SaveTemplateModal.test.tsx

// Test: SaveTemplateModal — renders name, description, category, tags fields
// Test: SaveTemplateModal — renders public/private toggle (default private)
// Test: SaveTemplateModal — validates required fields (name)
// Test: SaveTemplateModal — submit calls template save API
```

```typescript
// apps/web/server/routers/__tests__/workflowTemplates.test.ts

// Test: templates.list — returns published public templates
// Test: templates.list — includes tenant-private templates for current tenant
// Test: templates.list — excludes other tenants' private templates
// Test: templates.list — search filters by name and description
// Test: templates.list — filters by category
// Test: templates.list — filters by tags
// Test: templates.list — pagination works (limit + offset)
// Test: templates.create — saves template as draft for current tenant
// Test: templates.rate — creates rating for template
// Test: templates.rate — prevents self-rating (authorId !== userId)
// Test: templates.rate — prevents duplicate ratings (UNIQUE constraint)
// Test: templates.useTemplate — increments download count and returns workflowJson
```

---

## Section 14: Frontend WorkflowEditor Refactor

### Tests to Write

```typescript
// apps/web/client/src/pages/__tests__/WorkflowEditor.test.tsx

// Test: WorkflowEditor — uses single 'workflow' ReactFlow type (BaseNode for all)
// Test: WorkflowEditor — node sidebar populated from useNodeRegistry (not hardcoded)
// Test: WorkflowEditor — adding a node creates node with data.nodeType field
// Test: WorkflowEditor — clicking a node opens DynamicNodeConfig panel
// Test: WorkflowEditor — isValidConnection checks port type compatibility
// Test: WorkflowEditor — Compile button visible and calls compileMutation
// Test: WorkflowEditor — Run button triggers cost estimation first
// Test: WorkflowEditor — example workflows loaded from TemplateBrowser (not hardcoded array)
// Test: WorkflowEditor — save workflow calls workflow.save tRPC procedure
// Test: WorkflowEditor — load workflow from URL params calls workflow.load
```

---

## Section 15: Integration Testing

### Tests to Write

```python
# tests/integration/test_workflow_e2e.py

# Test: E2E — simple workflow: LLM Call → output (compile + execute + verify result)
# Test: E2E — RAG + LLM: RAG Query → LLM Call (RAG context feeds LLM prompt)
# Test: E2E — Conditional branching: LLM → Conditional → (true: Image, false: End)
# Test: E2E — Loop: Data loop over array → LLM Call per item → collect results
# Test: E2E — Approval: LLM → Approval Gate → (approved: Image, rejected: End)
# Test: E2E — Skill node: Enhance Prompt skill → LLM Call → output
# Test: E2E — Template save → list → load → execute cycle
# Test: E2E — SSE stream delivers events for multi-node workflow
# Test: E2E — Cost estimation matches actual execution cost (within 20% margin)
# Test: E2E — Insufficient credits prevents workflow execution
# Test: E2E — Tenant isolation: user A cannot see user B's workflows
```
