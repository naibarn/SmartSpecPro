# Implementation Sections Index

<!-- PROJECT_CONFIG
runtime: python-uv
test_command: cd python-backend && uv run pytest tests/ -v
test_command_frontend: cd apps/web && pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-schema
section-02-registry
section-03-executors
section-04-expression
section-05-skill-nodes
section-06-loop-executor
section-07-compiler
section-08-workflow-api
section-09-sse-stream
section-10-basenode
section-11-dynamic-config
section-12-execution-viz
section-13-template-browser
section-14-editor-refactor
section-15-integration
END_MANIFEST -->

## Overview

This implementation redesigns the workflow editor from non-functional template nodes to a production-ready system with typed data flow, database-backed templates, real-time execution visualization, and full integration with backend services.

**Key architectural decisions:**
- Python backend as single source of truth for node type registry
- Dual runtime (Python backend + TypeScript frontend) with coordinated testing
- Backend-first implementation (sections 1-9) followed by frontend (10-14)
- Parallel execution optimized through 10 batches

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-schema | - | 02, 13 | Yes |
| section-02-registry | 01 | 03, 04, 05, 06, 10 | No |
| section-03-executors | 02 | 07 | Yes (with 04, 05, 06) |
| section-04-expression | 02 | 07 | Yes (with 03, 05, 06) |
| section-05-skill-nodes | 02 | 07 | Yes (with 03, 04, 06) |
| section-06-loop-executor | 02 | 07 | Yes (with 03, 04, 05) |
| section-07-compiler | 02, 03, 04, 05, 06 | 08 | No |
| section-08-workflow-api | 07 | 09 | No |
| section-09-sse-stream | 08 | 12 | Yes (with 10) |
| section-10-basenode | 02 | 11, 12, 14 | Yes (with 09) |
| section-11-dynamic-config | 10 | 14 | Yes (with 13) |
| section-12-execution-viz | 09, 10 | 14 | No |
| section-13-template-browser | 01 | 14 | Yes (with 11) |
| section-14-editor-refactor | 10, 11, 12, 13 | 15 | No |
| section-15-integration | all | - | No |

## Execution Order (Batches)

**Batch 1** (Foundation):
1. section-01-schema

**Batch 2** (Registry):
2. section-02-registry

**Batch 3** (Backend Core - Parallel):
3. section-03-executors
4. section-04-expression
5. section-05-skill-nodes
6. section-06-loop-executor

**Batch 4** (Compiler):
7. section-07-compiler

**Batch 5** (Workflow API):
8. section-08-workflow-api

**Batch 6** (SSE + Frontend Start - Parallel):
9. section-09-sse-stream
10. section-10-basenode

**Batch 7** (Frontend Config - Parallel):
11. section-11-dynamic-config
12. section-13-template-browser

**Batch 8** (Execution Visualization):
13. section-12-execution-viz

**Batch 9** (Editor Integration):
14. section-14-editor-refactor

**Batch 10** (Integration Tests):
15. section-15-integration

## Section Summaries

### section-01-schema
**Database Schema + Migrations**

Create tables: `workflows` (user drafts), `workflow_templates` (marketplace), `template_categories`, `template_ratings`. Add GIN indexes for tags and full-text search. Drizzle migration for Node.js side.

**Test focus:** Schema validation, FK constraints, tenant isolation, default values, UNIQUE constraints.

**Key files:**
- `apps/web/drizzle/schema.ts` (Drizzle schema)
- `apps/web/drizzle/0XXX_workflow_tables.sql` (migration)
- `python-backend/tests/test_workflow_schema.py` (tests)

---

### section-02-registry
**Backend Node Type Registry + API Endpoints**

Implement `NodeTypeSpec`, `InputSpec`, `OutputSpec` data classes. Create registry singleton with core node types (llm_call, rag_query, conditional, loop, approval_gate, generate_image). Add API endpoints: `/node-types`, `/available-models`, `/rag-collections`, `/available-approvers`, `/image-providers`.

**Test focus:** Registry operations, API response format, tenant scoping, authentication, recommendation sorting.

**Key files:**
- `python-backend/app/orchestrator/node_registry.py` (registry core)
- `python-backend/app/api/workflow.py` (API endpoints)
- `python-backend/tests/test_node_registry.py` (unit tests)
- `python-backend/tests/test_node_type_api.py` (API tests)

---

### section-03-executors
**Node Executors (Backend)**

Implement executor classes: `LLMExecutor`, `RAGExecutor`, `ConditionalExecutor`, `ApprovalExecutor`, `ImageExecutor`. Each integrates with existing services (LLM Gateway, HybridRAG, ApprovalDBService, MediaTaskService). Credit checks before execution, deductions after.

**Test focus:** Service integration, credit enforcement, error propagation, output format, security (expression safety for ConditionalExecutor).

**Key files:**
- `python-backend/app/orchestrator/node_executors/base.py` (protocol)
- `python-backend/app/orchestrator/node_executors/llm_executor.py`
- `python-backend/app/orchestrator/node_executors/rag_executor.py`
- `python-backend/app/orchestrator/node_executors/conditional_executor.py`
- `python-backend/app/orchestrator/node_executors/approval_executor.py`
- `python-backend/app/orchestrator/node_executors/image_executor.py`
- `python-backend/tests/test_node_executors.py` (tests)

---

### section-04-expression
**Expression Resolver (Backend)**

Build expression resolver for `{{nodeId.output.field}}` syntax. Regex-based token parsing, dict lookup from execution state, safe replacement (no eval). Max length 1000 chars. Nested field access support.

**Test focus:** Valid expressions, invalid references, nested fields, type handling (None, numeric, boolean, arrays), security bypass attempts, max length enforcement.

**Key files:**
- `python-backend/app/orchestrator/expression_resolver.py`
- `python-backend/tests/test_expression_resolver.py` (tests)

---

### section-05-skill-nodes
**Skill Node Auto-Generation**

Scan skills registry for `schemas/input.schema.json`. Map JSON Schema fields to `InputSpec` (string → text, enum → select, etc.). Generate `NodeTypeSpec` for each skill. Implement `SkillExecutor` that validates inputs and calls existing skill pipeline.

**Test focus:** Schema discovery, field mapping, validation, skill execution integration, missing schema handling.

**Key files:**
- `python-backend/app/orchestrator/skill_discovery.py`
- `python-backend/app/orchestrator/node_executors/skill_executor.py`
- `python-backend/tests/test_skill_nodes.py` (tests)

---

### section-06-loop-executor
**Loop Executor + Loop Group**

Implement `LoopExecutor` with three modes: count, data (array iteration), while (condition). ReactFlow parent-child support for explicit loop groups. Loop state management, result collection, max iterations safety (default 100), break condition.

**Test focus:** All loop modes, iteration state, result collection, max iterations, break conditions, nested data access.

**Key files:**
- `python-backend/app/orchestrator/node_executors/loop_executor.py`
- `python-backend/tests/test_loop_executor.py` (tests)
- `python-backend/tests/test_loop_group_compiler.py` (compiler integration tests)

---

### section-07-compiler
**FlowCompiler Updates**

Update `flow_compiler.py` to load node types from registry (not hardcoded). Validate port type compatibility, required inputs, DAG structure (no cycles except loop groups), loop group detection (parent-child). Generate expression metadata.

**Test focus:** Registry loading, port validation, missing inputs, loop groups, DAG validation, skill node support.

**Key files:**
- `python-backend/app/orchestrator/flow_compiler.py` (updated)
- `python-backend/tests/test_flow_compiler_v2.py` (tests)

---

### section-08-workflow-api
**Workflow API Implementation**

Replace placeholder endpoints in `workflows.py` with real implementations: list (DB query), execute (orchestrator invocation), report (status + results). Add `estimate-cost` endpoint. Implement tRPC router procedures: save, load, list, delete (user workflows).

**Test focus:** CRUD operations, tenant isolation, credit checks, cost estimation accuracy, authentication.

**Key files:**
- `python-backend/app/api/workflow.py` (Python endpoints)
- `apps/web/server/routers/workflow.ts` (tRPC router)
- `python-backend/tests/test_workflow_api.py` (Python tests)
- `apps/web/server/routers/__tests__/workflow.test.ts` (tRPC tests)

---

### section-09-sse-stream
**SSE Execution Stream**

Implement `GET /execute/{id}/stream` with cookie-based auth. Event types: node_start, node_complete, node_error, workflow_complete, workflow_error. Last-Event-ID reconnection support. Orchestrator integration for event emission.

**Test focus:** Event emission timing, authentication, reconnection, event format, connection lifecycle.

**Key files:**
- `python-backend/app/api/workflow.py` (SSE endpoint)
- `python-backend/app/orchestrator/orchestrator.py` (event emission integration)
- `python-backend/tests/test_sse_execution.py` (tests)

---

### section-10-basenode
**Frontend BaseNode + useNodeRegistry**

Create single `BaseNode` ReactFlow component for all node types. Read `node.data.nodeType` to look up definition. Render icon, color, handles (color-coded by data_type). Implement `useNodeRegistry` TanStack Query hook. Build type compatibility checker (`isValidConnection`). Static color map (no dynamic Tailwind interpolation).

**Test focus:** Node rendering, handle generation, color-coding, registry fetching, type compatibility matrix.

**Key files:**
- `apps/web/client/src/components/workflow/nodes/BaseNode.tsx`
- `apps/web/client/src/lib/workflow/useNodeRegistry.ts`
- `apps/web/client/src/lib/workflow/dataTypes.ts`
- `apps/web/client/src/lib/workflow/colorMap.ts`
- `apps/web/client/src/components/workflow/nodes/__tests__/BaseNode.test.tsx`
- `apps/web/client/src/lib/workflow/__tests__/useNodeRegistry.test.ts`
- `apps/web/client/src/lib/workflow/__tests__/dataTypes.test.ts`

---

### section-11-dynamic-config
**Frontend DynamicNodeConfig + ExpressionInput**

Build `DynamicNodeConfig` component that renders forms from `InputSpec` definitions. UI type mapping (text, textarea, slider, select, toggle, json_editor). Async option loading for `options_endpoint` fields. `ExpressionInput` with `{{` autocomplete, upstream node detection, token highlighting. `ConditionBuilder` visual + advanced modes.

**Test focus:** Form rendering, async options, validation, connected inputs, expression autocomplete, condition builder modes.

**Key files:**
- `apps/web/client/src/components/workflow/config/DynamicNodeConfig.tsx`
- `apps/web/client/src/components/workflow/config/ExpressionInput.tsx`
- `apps/web/client/src/components/workflow/config/ConditionBuilder.tsx`
- `apps/web/client/src/components/workflow/config/__tests__/DynamicNodeConfig.test.tsx`
- `apps/web/client/src/components/workflow/config/__tests__/ExpressionInput.test.tsx`
- `apps/web/client/src/components/workflow/config/__tests__/ConditionBuilder.test.tsx`

---

### section-12-execution-viz
**Frontend Execution Visualization**

Create `ExecutionOverlay` component for node status styling (pending, running, success, failed, skipped). CSS animations (no dynamic Tailwind). `ExecutionLogPanel` with chronological entries, expandable details, copy-to-clipboard. `CostEstimation` component with balance check. Zustand `executionStore` for state management. SSE client integration.

**Test focus:** Status overlays, log panel rendering, cost estimation warnings, store operations, SSE event handling.

**Key files:**
- `apps/web/client/src/components/workflow/execution/ExecutionOverlay.tsx`
- `apps/web/client/src/components/workflow/execution/ExecutionLogPanel.tsx`
- `apps/web/client/src/components/workflow/execution/CostEstimation.tsx`
- `apps/web/client/src/stores/executionStore.ts`
- `apps/web/client/src/components/workflow/execution/__tests__/ExecutionOverlay.test.tsx`
- `apps/web/client/src/components/workflow/execution/__tests__/ExecutionLogPanel.test.tsx`
- `apps/web/client/src/components/workflow/execution/__tests__/CostEstimation.test.tsx`
- `apps/web/client/src/stores/__tests__/executionStore.test.ts`

---

### section-13-template-browser
**Frontend Template Browser + Save**

Replace hardcoded example workflows with `TemplateBrowser`. Search (debounced full-text), category filters, sort dropdown, grid of `TemplateCard` components, pagination. `SaveTemplateModal` for publishing. Implement tRPC `workflowTemplates` router: list, getById, create, publish, rate, useTemplate, categories. Template validation, tenant isolation, self-rating prevention.

**Test focus:** Search/filter/sort, pagination, template CRUD, tenant isolation, rating constraints, download counter.

**Key files:**
- `apps/web/client/src/components/workflow/templates/TemplateBrowser.tsx`
- `apps/web/client/src/components/workflow/templates/TemplateCard.tsx`
- `apps/web/client/src/components/workflow/templates/SaveTemplateModal.tsx`
- `apps/web/server/routers/workflowTemplates.ts`
- `apps/web/client/src/components/workflow/templates/__tests__/TemplateBrowser.test.tsx`
- `apps/web/client/src/components/workflow/templates/__tests__/TemplateCard.test.tsx`
- `apps/web/client/src/components/workflow/templates/__tests__/SaveTemplateModal.test.tsx`
- `apps/web/server/routers/__tests__/workflowTemplates.test.ts`

---

### section-14-editor-refactor
**Frontend WorkflowEditor Refactor**

Update `WorkflowEditor.tsx` to use `BaseNode` (single ReactFlow type). Remove hardcoded nodes array (load from `useNodeRegistry`). Remove hardcoded example workflows (use `TemplateBrowser`). Integrate `DynamicNodeConfig`, execution visualization, SSE client. Make Compile button visible. Add cost estimation before Run.

**Test focus:** Single node type usage, registry-driven sidebar, template loading, config panel integration, compile/run buttons, cost check.

**Key files:**
- `apps/web/client/src/pages/WorkflowEditor.tsx` (major refactor)
- `apps/web/client/src/pages/__tests__/WorkflowEditor.test.tsx` (tests)

---

### section-15-integration
**Integration Testing**

End-to-end workflow execution tests: simple LLM, RAG + LLM chain, conditional branching, loop iteration, approval gate, skill node. Template lifecycle (save → list → load → execute). SSE stream delivery. Cost estimation accuracy. Credit enforcement. Tenant isolation verification.

**Test focus:** Full workflows, cross-layer integration, credit flow, tenant boundaries, real service calls.

**Key files:**
- `python-backend/tests/integration/test_workflow_e2e.py`

---

## Notes

- **Dual runtime testing:** Backend tests via pytest (`python-backend/`), frontend tests via Vitest (`apps/web/`). Run both test suites for full coverage.
- **Backend-first approach:** Sections 1-9 establish backend infrastructure, sections 10-14 consume it via API.
- **Parallel batches:** Batches 3, 6, and 7 can run sections in parallel within the batch to speed implementation.
- **Critical path:** 01 → 02 → (03, 04, 05, 06) → 07 → 08 → 09 → (10, 12) → 14 → 15
- **Frontend can start early:** Section 10 (BaseNode) only needs section 02 (node-types API), so frontend work can begin before backend executors are complete.
