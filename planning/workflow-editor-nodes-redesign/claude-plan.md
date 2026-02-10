# Implementation Plan: Workflow Editor Node System Redesign

## 1. Background and Goals

SmartSpecPro's workflow editor currently has a ReactFlow canvas with 5 non-functional node types and 2 hardcoded example workflows. The nodes look like workflow components but have no real configuration, no data flow, and no connection to backend services. This plan redesigns the entire node system to be production-ready — each node connects to real backend services, data flows between nodes with typed ports, and templates are stored in a database marketplace.

### What We're Building

1. **Functional node types** — LLM Call, RAG Query, Conditional, Loop, Approval Gate, Generate Image, plus auto-generated Skill Nodes from the existing skills registry
2. **Typed data flow** — Nodes have typed input/output ports with visual connections, plus expression syntax (`{{nodeId.output}}`) for fine-grained access in text fields
3. **Workflow persistence** — Users can save/resume workflow drafts (separate from templates)
4. **Template marketplace** — Database-backed template storage with public marketplace, tenant-private templates, search, categories, and ratings
5. **Real-time execution visualization** — Canvas highlighting (nodes light up as they execute) plus a log panel showing step-by-step progress
6. **Smart model recommendation** — LLM node suggests optimal model based on task, cost, and user credits
7. **Pre-execution cost estimation** — Show estimated credit cost before running a workflow

### What Already Exists (Honest Assessment)

The codebase has backend infrastructure but much of it needs connection or completion:

**Ready to use:**
- **LLM Gateway** — Multi-provider (OpenAI, Anthropic, Google, Groq, OpenRouter) with credit tracking — fully implemented
- **HybridRAG Engine** — BM25 + vector + reranker with pgvector — fully implemented
- **ApprovalDBService** (`app/services/approval_db_service.py`) — Database-backed approval CRUD — fully implemented
- **Skills Engine** — Markdown-based skill definitions with `schemas/input.schema.json` — fully implemented
- **MediaTaskService** — Image/video generation via Celery workers — fully implemented
- **tRPC Workflow Router** — 5 procedures (compile, list, execute, getStatus, cancel) proxying to Python — fully implemented

**Partially implemented (needs work):**
- **FlowCompiler** (`app/orchestrator/flow_compiler.py`) — Maps 14 node types, but most executor functions referenced do NOT exist yet (e.g., `send_email`, `send_telegram`, `extract_data`). Only the compilation logic works; execution handlers must be built.
- **WorkflowOrchestrator** (`app/orchestrator/orchestrator.py`) — Supports `llm` and `kilo_cli` step types only. No code paths for conditional, loop, image, RAG, or approval execution. Needs substantial extension.
- **Workflow API endpoints** (`app/api/workflows.py`) — `list_workflows`, `execute_workflow`, `get_workflow_report` return hardcoded placeholder responses. Must be implemented.

**Does NOT exist:**
- `workflows` table for user workflow persistence (only templates exist conceptually)
- Node executor framework
- Expression resolver
- SSE execution streaming
- Approval integration within orchestrator
- Any workflow template database tables

### Architecture Approach

Follow n8n's node architecture: each node type declares typed inputs, typed outputs, and an execution method. Data flows between nodes as structured items (`{ json: {...}, binary?: {...} }`). The **Python backend is the single source of truth** for node type definitions — the frontend dynamically fetches the node registry from an API endpoint and renders accordingly. This eliminates frontend/backend registry sync issues.

---

## 2. Node Type System (Shared Foundation)

### 2.1 Node Type Registry — Backend as Source of Truth

The **Python backend** maintains the single node type registry. The frontend has NO hardcoded node definitions — it fetches everything from `GET /api/v1/workflow/node-types`.

**Backend registry** (`python-backend/app/orchestrator/node_registry.py`):

```python
@dataclass
class NodeTypeSpec:
    type: str
    display_name: str
    description: str
    icon: str              # Lucide icon name (frontend renders)
    color: str             # Tailwind color name
    category: str          # 'ai', 'flow_control', 'human', 'skills', 'media'
    inputs: list[InputSpec]
    outputs: list[OutputSpec]
    executor: str          # Python dotpath to executor class

@dataclass
class InputSpec:
    name: str
    display_name: str
    data_type: str         # Port data type: 'text', 'json', 'array', 'image', 'number', 'boolean', 'any'
    ui_type: str           # UI control: 'text', 'textarea', 'number', 'slider', 'select', 'multiselect', 'toggle', 'json_editor'
    required: bool
    accepts_connection: bool  # Can receive data from upstream node port
    default: Any = None
    options: list[dict] | None = None    # For select/multiselect
    options_endpoint: str | None = None  # Dynamic options from API (e.g., '/api/v1/workflow/available-models')
    validation: dict | None = None       # {min, max, pattern, min_length, max_length}
    placeholder: str | None = None

@dataclass
class OutputSpec:
    name: str
    display_name: str
    data_type: str  # 'text', 'json', 'array', 'image', 'number', 'boolean', 'any'
```

**Key design decisions (from Opus review):**
- `data_type` and `ui_type` are separate fields — data_type determines port compatibility, ui_type determines form control rendering
- `options_endpoint` allows dynamic option loading (models, collections, approvers) without hardcoding
- No frontend registry file — the frontend calls `GET /api/v1/workflow/node-types` on mount and caches with TanStack Query

**ReactFlow node type mapping:** The frontend uses a single `BaseNode` ReactFlow type for ALL nodes. The logical node type is stored in `node.data.nodeType`. This avoids the current brittle `id.split('-')[0]` pattern.

```typescript
// One ReactFlow type for all workflow nodes
const nodeTypes: NodeTypes = { workflow: BaseNode };

// Logical type in data
const newNode: Node = {
  id: `${nodeType}-${Date.now()}`,
  type: 'workflow',           // Always 'workflow' for ReactFlow
  data: {
    nodeType: 'llm_call',     // Logical type from registry
    label: 'LLM Call',
    config: {},               // User-configured values
  },
};
```

### 2.2 Node Execution Interface

Each node type in the backend implements a common executor interface:

```python
class NodeExecutor(Protocol):
    async def execute(
        self,
        node_config: dict,
        inputs: dict[str, NodeExecutionData],
        context: ExecutionContext,
    ) -> dict[str, NodeExecutionData]:
        """Execute node and return outputs keyed by output name."""
```

`ExecutionContext` carries tenant_id, user_id, credit balance, session info, and a reference to the execution state.

### 2.3 Data Type System

Define data types that flow between node ports:

```python
@dataclass
class NodeExecutionData:
    json: dict              # Primary data payload
    binary: dict | None     # Binary attachments (images, files)
    metadata: dict | None   # Node execution metadata (timing, costs)
```

Port type compatibility matrix determines which outputs can connect to which inputs:
- `text` → `text`, `any`
- `json` → `json`, `text` (auto-stringify), `any`
- `array` → `array`, `json`, `any`
- `image` → `image`, `any`
- `number` → `number`, `text`, `any`
- `boolean` → `boolean`, `any`
- `any` → accepts all types

---

## 3. Core Node Types

### 3.1 LLM Call Node

**Purpose:** Send a prompt to an LLM and return the response.

**Inputs:**
- `prompt` (data_type: text, ui_type: textarea, required, accepts_connection) — Prompt template supporting `{{variable}}` expressions
- `systemPrompt` (data_type: text, ui_type: textarea, optional) — System message
- `model` (data_type: text, ui_type: select, required, options_endpoint: `/api/v1/workflow/available-models`) — Smart recommendation with override
- `temperature` (data_type: number, ui_type: slider, default: 0.7, validation: {min: 0, max: 2})
- `maxTokens` (data_type: number, ui_type: number, optional)
- `contextData` (data_type: json, ui_type: json_editor, optional, accepts_connection) — Additional context

**Outputs:**
- `response` (data_type: text) — LLM response text
- `usage` (data_type: json) — Token counts, cost, model used

**Backend executor:** Calls the existing LLM Gateway. Checks user credit balance before execution. Deducts credits after successful call.

**Smart model recommendation:** The `available-models` endpoint returns models sorted by recommendation score. Score factors: cost per token, quality rating, user's remaining credits. Frontend shows a "Recommended" badge on the top suggestion.

### 3.2 RAG Query Node

**Purpose:** Retrieve relevant documents from a knowledge base collection.

**Inputs:**
- `query` (text, textarea, required, accepts_connection) — Search query
- `collection` (text, select, required, options_endpoint: `/api/v1/workflow/rag-collections`)
- `topK` (number, number, default: 5, validation: {min: 1, max: 20})
- `searchMode` (text, select, default: 'hybrid', options: [vector, hybrid, bm25])
- `scoreThreshold` (number, slider, default: 0.5, validation: {min: 0, max: 1})
- `metadataFilter` (json, json_editor, optional) — Filter by source, date, tags

**Outputs:**
- `documents` (array) — Retrieved chunks with scores
- `context` (text) — Concatenated document text
- `metadata` (json) — Retrieval stats

**Backend executor:** Calls existing `HybridRAG` engine. Uses `EmbeddingService` for query embedding and `pgvector_store` for retrieval.

### 3.3 Conditional Node

**Purpose:** Branch workflow execution based on conditions.

**Inputs:**
- `value` (any, required, accepts_connection) — Value to evaluate

**Configuration (stored in node config, NOT input ports):**
- `mode` — 'visual' or 'advanced'
- **Visual mode:** Array of condition rules:
  - `field` — JSONPath to value field
  - `operator` — equals, notEquals, greaterThan, lessThan, greaterOrEqual, lessOrEqual, contains, startsWith, endsWith, isEmpty, isNotEmpty, matchesRegex
  - `compareValue` — Comparison target
  - `combineWith` — AND / OR
- **Advanced mode:** Expression string with variable autocomplete

**Outputs:**
- `true` (any) — Data forwarded when condition true
- `false` (any) — Data forwarded when condition false

**Backend executor:** Uses `simpleeval` library for safe expression evaluation. Restricted to: comparison operators, string methods (`len`, `str`, `int`, `float`), property access. Explicit deny: no `import`, no `exec/eval`, no `__dunder__` access, no function definitions. Max expression length: 1000 chars. Execution timeout: 5 seconds.

### 3.4 Loop Node — Explicit Loop Group

**Purpose:** Iterate over data or repeat operations.

**Design (from Opus review):** Use an **explicit Loop Group** approach rather than implicit cycle detection. The Loop node acts as a container — the user defines which nodes are "inside" the loop by placing them within a designated zone on the canvas.

**Implementation:** ReactFlow supports parent-child node relationships. The Loop node becomes a parent node with an expanded area. Nodes dragged inside it become children (loop body). The FlowCompiler reads the parent-child hierarchy to determine loop body.

**Configuration:**
- `loopType` (select: count / data / while)
  - **count:** `iterations` (number)
  - **data:** Connected array input as iteration source, `itemVariable` name
  - **while:** `condition` expression (uses `simpleeval`)
- `maxIterations` (number, default: 100, safety limit)
- `breakCondition` (expression, optional)

**Inputs:**
- `data` (any, accepts_connection) — Array for data iteration, or passthrough

**Outputs:**
- `item` (any) — Current iteration item (inside loop)
- `results` (array) — Collected results after loop completes
- `index` (number) — Current iteration index

**Backend executor:** Manages loop state in execution context. Each iteration executes the child sub-graph. Results accumulated and emitted after completion.

### 3.5 Approval Gate Node

**Purpose:** Pause workflow execution until a human approves or rejects.

**Inputs:**
- `data` (json, accepts_connection) — Data to present to approver

**Configuration:**
- `approvers` (multiselect, options_endpoint: `/api/v1/workflow/available-approvers`) — Users/roles
- `message` (textarea) — Message for approver, supports `{{variable}}`
- `timeout` (number, minutes, default: 60)
- `requiredApprovals` (number, default: 1)

**Outputs:**
- `approved` (json) — Original data + approval metadata
- `rejected` (json) — Original data + rejection details

**Backend executor:** Creates `ApprovalRequest` via `ApprovalDBService.create_request()`. Checkpoints workflow state. Resumes when approval/rejection received.

### 3.6 Generate Image Node

**Purpose:** Generate an image using AI models.

**Inputs:**
- `prompt` (text, textarea, required, accepts_connection) — Image description
- `negativePrompt` (text, textarea, optional)

**Configuration:**
- `provider` (select, options_endpoint: `/api/v1/workflow/image-providers`)
- `size` (select: 1024x1024, 1024x1792, 1792x1024)
- `quality` (select: standard, hd)
- `style` (select: natural, vivid)

**Outputs:**
- `imageUrl` (text) — Generated image URL
- `metadata` (json) — Provider, cost, generation parameters

**Backend executor:** Creates media task via `MediaTaskService` + Celery. Polls for completion. Returns uploaded image URL.

---

## 4. Skill Nodes (Auto-Generated)

### 4.1 Skill Discovery

API endpoint `GET /api/v1/workflow/skill-nodes` that:
1. Scans the skills registry for all registered skills
2. For each skill, reads `schemas/input.schema.json` (note: path is `schemas/` subdirectory, NOT root)
3. Skills without `schemas/input.schema.json` are skipped (not all skills have schemas)
4. Generates a `NodeTypeSpec` with inputs mapped from schema fields
5. Returns the list of skill node types
6. Results cached on startup, invalidated when skills change

### 4.2 Schema-to-Node Mapping

Each field in `schemas/input.schema.json` maps to a node input:

| JSON Schema Type | data_type | ui_type |
|------------------|-----------|---------|
| `string` | text | text |
| `string` with `enum` | text | select |
| `number` / `integer` | number | number |
| `boolean` | boolean | toggle |
| `string` with `format: textarea` | text | textarea |
| `array` of strings | array | multiselect |
| `object` | json | json_editor |

Every input gets `accepts_connection: true` for dual-mode operation.

### 4.3 Skill Node Execution

The backend executor for all skill nodes:
1. Receive input values (from connections and/or manual config)
2. Validate against the skill's `schemas/input.schema.json`
3. Call the existing skill execution pipeline
4. Return: `result` (text) and `metadata` (json)

### 4.4 Expected Skill Nodes

Based on the skills registry: Video Skill, Image Skill, Enhance Prompt, Image & Video Skill, Document Generate, Slide Generate, Graphic Info, and others as they exist.

---

## 5. Data Flow and Expression System

### 5.1 Typed Port Connections

Each Handle gets an `id` corresponding to the input/output name. The `isValidConnection` callback checks type compatibility using the matrix from section 2.3.

Handles are color-coded by data_type:
- text: blue (#3b82f6)
- json: green (#10b981)
- array: purple (#8b5cf6)
- image: pink (#ec4899)
- number: orange (#f59e0b)
- boolean: cyan (#06b6d4)
- any: gray (#6b7280)

### 5.2 Expression Engine

Text fields that support expressions show a special indicator. When a user types `{{`, an autocomplete dropdown appears showing available upstream nodes and their outputs.

Expression syntax: `{{nodeId.outputName}}` or `{{nodeId.outputName.field.nested}}`

**Frontend component:** `ExpressionInput` — text input with `{{` detection, autocomplete popup, expression token highlighting, upstream node validation.

**Backend resolver** (`python-backend/app/orchestrator/expression_resolver.py`):
- Parse `{{...}}` tokens using regex
- Look up referenced node outputs from execution state
- Replace tokens with actual values
- Raise `ExpressionResolutionError` for missing references

**Autocomplete performance:** Upstream dependency graph is memoized and only recomputed when the graph topology changes (edges added/removed), not on every keystroke.

### 5.3 Dual-Mode Inputs

Inputs with `accepts_connection: true` show a toggle:
- **Manual mode:** Standard form control (text field, dropdown, etc.)
- **Connected mode:** Port handle + connected node label

Port connection overrides manual value. UI clearly indicates active mode.

---

## 6. Workflow Persistence + Template Marketplace

### 6.1 Database Schema

Add to Drizzle schema (`apps/web/drizzle/schema.ts`):

**`workflows` table (user's active workflows):**
- id (serial, PK)
- name (varchar 255)
- description (text, nullable)
- workflowJson (jsonb) — ReactFlow state (nodes, edges, viewport)
- userId (integer, FK → users.id)
- tenantId (integer, FK)
- status (enum: draft, compiled, running, completed, failed)
- lastCompiledAt (timestamp, nullable)
- schemaVersion (varchar 10, default '1.0') — Forward compatibility
- createdAt, updatedAt (timestamps)

**`workflow_templates` table (marketplace):**
- id (serial, PK)
- name (varchar 255)
- description (text)
- workflowJson (jsonb) — Validated and sanitized ReactFlow state
- authorId (integer, FK → users.id)
- tenantId (integer, nullable)
- categoryId (integer, nullable, FK → template_categories.id)
- tags (text array, GIN indexed)
- isPublic (boolean, default false)
- isFeatured (boolean, default false)
- status (enum: draft, pending_review, published, archived)
- downloadCount (integer, default 0)
- version (varchar 20, default '1.0')
- createdAt, updatedAt (timestamps)

**`template_categories` table:**
- id (serial, PK)
- name (varchar 100)
- slug (varchar 100, unique)
- parentId (integer, nullable, self-FK)
- sortOrder (integer)

**`template_ratings` table:**
- id (serial, PK)
- templateId (FK → workflow_templates.id)
- userId (FK → users.id)
- rating (integer, 1-5)
- review (text, nullable)
- createdAt (timestamp)
- UNIQUE(templateId, userId)

**Search indexes:**
- GIN index on `workflow_templates.tags`
- Full-text search: Add `search_vector tsvector` column on `workflow_templates`, generated from name + description. Create GIN index.
- Author self-rating prevention: check `authorId != userId` in the rating tRPC procedure

**Template JSON validation:** On write, validate `workflowJson` structure:
- Must have `nodes` array and `edges` array
- All string values sanitized (strip HTML/script tags)
- Node types must exist in the registry
- Max JSON size: 1MB

### 6.2 Workflow tRPC Router (User Workflows)

New/updated `apps/web/server/routers/workflow.ts` procedures:
- `save` — Save/update workflow draft (upsert by id)
- `load` — Load workflow by id
- `list` — List user's workflows with status filter
- `delete` — Delete a workflow draft

### 6.3 Template tRPC Router

New router `apps/web/server/routers/workflowTemplates.ts`:
- `list` — Search, filter by category/tags, paginate, sort. **Tenant isolation:** show public templates + user's tenant private templates.
- `getById` — Get template. **Access check:** public OR same tenant.
- `create` — Save workflow as template (tenant-private by default)
- `publish` — Submit for public marketplace (status → pending_review)
- `approve` — Admin approves pending template (status → published)
- `rate` — Rate template (prevent self-rating by checking authorId)
- `categories` — List categories (hierarchical)
- `useTemplate` — Increment download count, return workflow JSON

### 6.4 Frontend Template Browser

Replace hardcoded example workflows with `TemplateBrowser` component:
- Search bar with debounced full-text search
- Category filter chips
- Sort dropdown (Popular, Top Rated, Newest)
- Grid of TemplateCard components
- TemplateCard: name, description, author, rating stars, download count, category badge, "Use Template" button
- Pagination

**SaveAsTemplate modal:** Editor header "Save as Template" button → modal with name, description, category, tags, public/private toggle.

---

## 7. Execution Visualization

### 7.1 SSE Execution Stream

**Endpoint:** `GET /api/v1/workflow/execute/{execution_id}/stream`

**Authentication:** Use cookie-based auth (existing session cookies). The `EventSource` API cannot send custom headers, but cookies are sent automatically. The SSE endpoint reads the session cookie for authentication.

**Event types:**
- `node_start` — `{ nodeId, nodeName, timestamp }`
- `node_complete` — `{ nodeId, nodeName, output: summary, durationMs, timestamp }`
- `node_error` — `{ nodeId, nodeName, error, timestamp }`
- `workflow_complete` — `{ executionId, totalDurationMs, nodeResults: summary }`
- `workflow_error` — `{ executionId, error, failedNodeId }`

**Reconnection:** If SSE connection drops (browser tab backgrounded, network hiccup), the frontend reconnects with `Last-Event-ID` header. The backend replays events since that ID.

### 7.2 Pre-Execution Cost Estimation

Before running, estimate total cost:
1. Count LLM nodes → estimate tokens based on prompt length × 2 (response estimate)
2. Count image/media nodes → use fixed cost per provider/size
3. Count skill nodes → estimate based on skill type
4. Sum and show: "Estimated cost: ~X credits. Your balance: Y credits."
5. If estimated > balance, show warning and disable Run button

### 7.3 Frontend Execution View

When running, editor enters "execution mode":

**Canvas:** Nodes get status overlays:
- Pending: default
- Running: blue pulsing border + spinner (use CSS animation, NOT Tailwind dynamic classes)
- Success: green border + checkmark
- Failed: red border + X
- Skipped: gray dashed border

**Log panel (right drawer):** Chronological execution steps. Each entry: timestamp, node name, status, duration. Expandable for data details. Error entries show error message. "Copy output" button.

### 7.4 Error Handling

Default: **Stop workflow + notify user.** Failed node highlighted red. Log panel scrolls to error. Toast notification. Subsequent nodes shown as "Skipped." In-app notification + optional email/Telegram.

---

## 8. Node Configuration Panel Redesign

### 8.1 Dynamic Config Panel

`DynamicNodeConfig` component:
1. Fetches node type definition from cached registry (TanStack Query)
2. Renders form controls based on each input's `ui_type`
3. For inputs with `options_endpoint`, fetches options dynamically
4. Shows connection indicator for connected inputs
5. Shows validation errors inline

**UI type → Component mapping:**
- `text` → TextInput (with ExpressionInput if accepts_connection)
- `textarea` → Textarea (with expression support)
- `number` → NumberInput with min/max
- `slider` → Slider component
- `select` → Select dropdown
- `multiselect` → Multi-select with search
- `toggle` → Switch component
- `json_editor` → CodeMirror JSON editor

### 8.2 Async Option Loading

Select inputs with `options_endpoint` use TanStack Query:
- `available-models` → staleTime: 5 minutes
- `rag-collections` → staleTime: 30 seconds
- `available-approvers` → staleTime: 1 minute
- Loading spinner in dropdown while fetching

### 8.3 Tailwind Color Fix

Do NOT use dynamic Tailwind class interpolation (`border-${color}-400`). Instead, use a color map:

```typescript
const colorMap: Record<string, { border: string; text: string; bg: string }> = {
  blue: { border: 'border-blue-400', text: 'text-blue-600', bg: 'bg-blue-50' },
  green: { border: 'border-green-400', text: 'text-green-600', bg: 'bg-green-50' },
  // ... all colors
};
```

This ensures Tailwind JIT purge sees all class names at build time.

---

## 9. Backend API Extensions

### 9.1 New Workflow API Endpoints

Add to `python-backend/app/api/workflow.py`:

- `GET /api/v1/workflow/node-types` — Returns all registered node types including skill nodes
- `GET /api/v1/workflow/available-models` — Available LLM models with cost/quality info, sorted by recommendation
- `GET /api/v1/workflow/rag-collections` — Vector store collections for tenant
- `GET /api/v1/workflow/available-approvers` — Users/roles for tenant
- `GET /api/v1/workflow/image-providers` — Available image generation providers
- `GET /api/v1/workflow/execute/{id}/stream` — SSE execution stream (cookie auth)
- `POST /api/v1/workflow/estimate-cost` — Pre-execution cost estimation

**Existing placeholder endpoints to implement:**
- `GET /api/v1/workflow/list` — Replace placeholder with real DB query
- `POST /api/v1/workflow/execute` — Replace placeholder with real execution
- `GET /api/v1/workflow/report/{id}` — Replace placeholder with real status

### 9.2 Node Executor Registry

```
python-backend/app/orchestrator/node_executors/
  __init__.py              # Executor registry mapping type → executor class
  base.py                  # NodeExecutor protocol + ExecutionContext + NodeExecutionData
  llm_executor.py          # LLM Call → LLM Gateway
  rag_executor.py          # RAG Query → HybridRAG
  conditional_executor.py  # Condition evaluation → simpleeval
  loop_executor.py         # Loop state management
  approval_executor.py     # Approval → ApprovalDBService
  image_executor.py        # Image gen → MediaTaskService
  skill_executor.py        # Generic skill → skill pipeline
```

### 9.3 Expression Resolver

`python-backend/app/orchestrator/expression_resolver.py`:
- Parse `{{nodeId.outputName.field}}` tokens via regex
- Look up referenced outputs from execution state
- Replace with actual values
- Security: no `eval()`, pure string replacement with dict lookups
- Max expression length: 1000 chars per field

### 9.4 FlowCompiler Updates

Update `python-backend/app/orchestrator/flow_compiler.py`:
- Load node types from registry instead of hardcoded `NODE_TYPE_MAP`
- Validate port type compatibility for all edges
- Detect loop groups (parent-child node relationships)
- Generate expression resolution metadata
- Validate all required inputs are configured or connected
- Validate DAG structure (no cycles except explicit loop groups)

---

## 10. Frontend Architecture

### 10.1 New Directory Structure

```
apps/web/client/src/
  lib/workflow/
    useNodeRegistry.ts     # TanStack Query hook for fetching node types from backend
    expressionEngine.ts    # Expression parsing and autocomplete logic
    dataTypes.ts           # Data type compatibility matrix
    colorMap.ts            # Tailwind color map (no dynamic interpolation)
  components/workflow/
    nodes/
      BaseNode.tsx         # Single ReactFlow node component for ALL node types
    config/
      DynamicNodeConfig.tsx    # Dynamic config panel from registry
      ExpressionInput.tsx      # Text input with {{}} autocomplete
      ConditionBuilder.tsx     # Visual condition builder
    execution/
      ExecutionOverlay.tsx     # Node status overlays
      ExecutionLogPanel.tsx    # Side log panel
      CostEstimation.tsx       # Pre-run cost estimate display
    templates/
      TemplateBrowser.tsx      # Template search and browse
      TemplateCard.tsx         # Single template card
      SaveTemplateModal.tsx    # Save as template modal
  stores/
    executionStore.ts          # Zustand store for execution state
```

### 10.2 BaseNode Component

Single `BaseNode` component renders ALL node types:
1. Reads `node.data.nodeType` to look up definition from cached registry
2. Renders appropriate icon and color (from color map)
3. Renders input Handles (left side) based on definition's inputs with `accepts_connection: true`
4. Renders output Handles (right side) based on definition's outputs
5. Color-codes handles by `data_type`
6. Shows config summary on node face
7. Shows execution status overlay when in execution mode

### 10.3 State Management

**Workflow state:** ReactFlow's `useNodesState` / `useEdgesState`
**Execution state:** Zustand store (isExecuting, nodeStatuses, logs, etc.)
**Template/registry state:** TanStack Query (server state with caching)

---

## 11. Implementation Order

Corrected order (from Opus review — API endpoints before frontend components):

1. **Database schema + migrations** — workflows, workflow_templates, template_categories, template_ratings tables
2. **Backend node type registry + API endpoints** — Registry, `/node-types`, `/available-models`, `/rag-collections`, `/available-approvers`
3. **Node executors (Backend)** — LLM, RAG, Conditional, Approval, Image executors
4. **Expression resolver (Backend)** — `simpleeval`-based resolver
5. **Skill node auto-generation** — Schema discovery + skill executor
6. **Loop executor + Loop Group** — Parent-child node support in compiler
7. **FlowCompiler updates** — Registry-based compilation, validation
8. **Workflow API implementation** — Replace placeholder endpoints with real logic
9. **SSE execution stream** — Real-time event streaming
10. **Frontend: BaseNode + useNodeRegistry** — Dynamic node rendering from API
11. **Frontend: DynamicNodeConfig + ExpressionInput** — Config panel + expressions
12. **Frontend: Execution visualization** — Overlays + log panel + cost estimation
13. **Frontend: Template browser + save** — Template CRUD UI
14. **Frontend: WorkflowEditor refactor** — Replace hardcoded nodes/templates
15. **Integration testing** — End-to-end workflow execution tests

---

## 12. Security Considerations

- **Expression safety:** Use `simpleeval` library with restricted functions. No `eval()`, no `exec()`, no `__dunder__` access. Max expression length 1000 chars. Execution timeout 5 seconds. Regex timeout for `matchesRegex` operator.
- **Credit enforcement:** LLM and media executors check balance before execution, deduct after. Atomic credit operations.
- **Tenant isolation:** All queries (templates, collections, approvers, workflows) scoped to current tenant. Private templates visible only to same-tenant users.
- **Template sanitization:** Validate `workflowJson` against JSON Schema on write. Strip HTML/JS from all string values. Max JSON size 1MB.
- **SSE authentication:** Cookie-based auth (session cookies sent automatically by EventSource).
- **Rate limiting:** Workflow execution rate-limited per user.
- **Input validation:** All node config values validated before execution.

---

## 13. Testing Strategy

### Unit Tests
- Node type registry validation (all required fields)
- Expression parser (valid tokens, invalid syntax, missing references, security bypass attempts)
- Condition evaluator (all operators, AND/OR, edge cases, ReDoS protection)
- Loop executor (count, data, while, break, max iterations safety)
- Data type compatibility matrix
- Template CRUD + tenant isolation
- Schema-to-node mapping for skill discovery

### Integration Tests
- LLM node → LLM Gateway round trip
- RAG node → HybridRAG query
- Approval node → ApprovalDBService create + respond
- Skill node → skill pipeline execution
- Full workflow: RAG → LLM → Conditional → (true: Image, false: End)
- Template save → list → load → execute
- SSE stream delivery
- Pre-execution cost estimation accuracy

### Frontend Tests (Vitest)
- BaseNode rendering with various node types
- DynamicNodeConfig form generation
- ExpressionInput autocomplete behavior
- ConditionBuilder visual mode
- TemplateBrowser search and filter
- ExecutionOverlay status transitions
- Color map completeness (all node colors render correctly)
