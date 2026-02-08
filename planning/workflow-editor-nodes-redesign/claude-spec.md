# Complete Specification: Workflow Editor Node System Redesign

## 1. Overview

Redesign the SmartSpecPro workflow editor from a non-functional template demo into a production-ready visual workflow builder inspired by n8n, LangFlow, and Flowise. Users will create, configure, execute, and monitor multi-step AI workflows using real, connected node types.

## 2. Current State

### What Exists
- ReactFlow v11 canvas with custom nodes (Handle components for source/target)
- 5 node types (LLM, Approval, Conditional, Loop, Generate Image) — all non-functional templates
- 2 hardcoded example workflows (Social Media Post, Content Summarizer)
- tRPC router proxying to Python backend (compile, list, execute, getStatus, cancel)
- Python FlowCompiler converting ReactFlow JSON → LangGraph manifest (14 node types mapped)
- WorkflowOrchestrator with PostgreSQL checkpointing
- Full LLM Gateway (OpenAI, Anthropic, Google, Groq, OpenRouter)
- HybridRAG engine (BM25 + vector + reranker) with pgvector
- ApprovalDBService with request/response lifecycle
- Skills engine with skill.md, input.schema.json, ui.schema.json
- 30+ backend services including media generation, email, notifications

### What's Missing
- Real node configuration connected to backend services
- Typed inputs/outputs for data flow between nodes
- Variable reference system (hybrid: ports + expressions)
- Skill-based nodes (auto-generated from skill schemas)
- Database-backed template management with marketplace
- Compile button in UI
- Real-time execution visualization (canvas + log panel)
- Per-node error handling
- Smart model recommendation for LLM node

## 3. Architecture

### 3.1 Node Type System

Each node type follows this architecture (inspired by n8n's INodeType):

```typescript
interface WorkflowNodeType {
  type: string;                    // Unique identifier
  displayName: string;             // UI label
  description: string;             // Help text
  icon: LucideIcon;               // Node icon
  color: string;                  // Theme color
  category: NodeCategory;         // Grouping in palette
  inputs: NodeInput[];            // Typed input definitions
  outputs: NodeOutput[];          // Typed output definitions
  credentials?: string[];         // Required credential types
  executeMethod: string;          // Backend execution handler
}
```

**Node Categories:**
- AI & Language: LLM Call, RAG Query
- Flow Control: Conditional, Loop, Start, End
- Human: Approval Gate
- Skills: One per registered skill (auto-generated)
- Media: Generate Image, Generate Video
- Integration: HTTP Request, Email, Telegram, Webhook
- Data: Transform, Merge, Filter

### 3.2 Data Flow Model (Hybrid)

**Primary flow:** Typed port connections (visual drag)
- Each output port has a type: `text`, `json`, `image`, `array`, `any`
- Input ports declare accepted types
- ReactFlow handles validate type compatibility via `isValidConnection`

**Secondary flow:** Expression references in text fields
- Syntax: `{{nodeId.outputName}}` or `{{nodeId.outputName.field}}`
- Autocomplete dropdown showing available variables from connected upstream nodes
- Visual indicator when a text field contains expressions

**Data item format:**
```typescript
interface NodeExecutionData {
  json: Record<string, any>;     // Primary data payload
  binary?: Record<string, {      // Binary attachments
    data: Buffer;
    mimeType: string;
    fileName: string;
  }>;
  metadata?: {
    nodeId: string;
    executedAt: string;
    durationMs: number;
  };
}
```

### 3.3 Skill Nodes (Auto-Generated)

For each registered skill in the system:
1. Read `input.schema.json` to determine required inputs
2. Generate a node type with input ports matching schema fields
3. Each input field supports dual-mode:
   - **Form input:** User types value directly (text field, dropdown, etc.)
   - **Port connection:** Receives value from upstream node output
4. Output is typed based on skill output (usually `text` or `json`)
5. Execution calls the existing skill execution pipeline

**Skills to become nodes:** Video Skill, Image Skill, Enhance Prompt, Image & Video Skill, Document Generate, Slide Generate, Graphic Info, and all others in the registry.

### 3.4 Template Marketplace

**Storage:** Database-backed (PostgreSQL via Drizzle ORM)

**Schema:**
- `workflow_templates` — id, name, description, workflow_json, author_id, tenant_id, version, category_id, tags, is_public, is_featured, download_count, rating, status (draft/published/archived), created_at, updated_at
- `template_categories` — id, name, slug, parent_id, sort_order
- `template_ratings` — id, template_id, user_id, rating, review

**Access control:**
- Users can create templates (tenant-private by default)
- Users can publish to public marketplace (admin review required)
- Admins can feature/archive/moderate templates
- All users can browse and use published templates

**Features:** Full-text search, category filter, tag filter, sort by popularity/rating/recency

## 4. Node Type Specifications

### 4.1 LLM Call Node

**Inputs:**
- `prompt` (text, required) — Prompt template with `{{variable}}` support
- `systemPrompt` (text, optional) — System message
- `model` (select, required) — Smart recommendation with override, shows cost/quality rating
- `temperature` (slider, 0-2, default 0.7)
- `maxTokens` (number, optional)
- `contextData` (json, optional) — Additional context from upstream nodes

**Outputs:**
- `response` (text) — LLM response text
- `usage` (json) — Token counts, cost, model used
- `fullResponse` (json) — Complete response with metadata

**Backend:** Calls LLM Gateway/Proxy with user's credit balance check

**Smart Model Recommendation:**
- Analyze prompt complexity and length
- Suggest cost-effective model for task type
- Show estimated credit cost before execution
- Gray out models exceeding user's balance

### 4.2 RAG Query Node

**Inputs:**
- `query` (text, required) — Search query (supports `{{variable}}`)
- `collection` (select, required) — Knowledge base collection picker
- `topK` (number, default 5) — Number of results
- `searchMode` (select: vector/hybrid/bm25, default hybrid)
- `metadataFilter` (json, optional) — Filter by source, date, category
- `scoreThreshold` (slider, 0-1, default 0.5)

**Outputs:**
- `documents` (array) — Retrieved document chunks
- `context` (text) — Concatenated document text (ready for LLM prompt)
- `metadata` (json) — Retrieval stats, scores, sources

**Backend:** Calls existing HybridRAG engine + EmbeddingService

### 4.3 Conditional Node

**Inputs:**
- `value` (any, required) — Value to evaluate (from upstream node)

**Configuration:**
- **Visual mode (default):** Pick variable → operator (=, !=, >, <, >=, <=, contains, startsWith, endsWith, isEmpty, isNotEmpty, matchesRegex) → comparison value. Multiple conditions with AND/OR grouping.
- **Advanced mode:** Raw JavaScript expression with syntax highlighting and variable autocomplete

**Outputs:**
- `true` (any) — Passes data when condition is true
- `false` (any) — Passes data when condition is false

### 4.4 Approval Gate Node

**Inputs:**
- `data` (json, required) — Data to present to approver for review

**Configuration:**
- `approvers` (multi-select) — Pick users/roles from system database
- `timeout` (number, minutes) — Auto-reject after timeout
- `message` (text) — Message to show approver (supports `{{variable}}`)
- `requiredApprovals` (number, default 1) — How many approvals needed

**Outputs:**
- `approved` (json) — Original data + approval metadata
- `rejected` (json) — Original data + rejection reason

**Backend:** Creates ApprovalRequest via ApprovalDBService, waits for response

### 4.5 Loop Node

**Configuration:**
- `loopType` (select: count/data/while)
  - **Count:** `iterations` (number)
  - **Data:** `dataSource` (array from upstream node), `itemVariable` (string)
  - **While:** `condition` (expression)
- `maxIterations` (number, safety limit, default 100)
- `breakCondition` (expression, optional)
- `continueCondition` (expression, optional)

**Inputs:**
- `data` (any) — Data to iterate over or pass through

**Outputs:**
- `item` (any) — Current iteration item (inside loop)
- `results` (array) — Collected results after loop completes
- `index` (number) — Current iteration index

### 4.6 Generate Image Node

**Inputs:**
- `prompt` (text, required) — Image description (supports `{{variable}}`)
- `negativePrompt` (text, optional)

**Configuration:**
- `provider` (select: dall-e-3, stable-diffusion, midjourney)
- `size` (select: 1024x1024, 1024x1792, 1792x1024)
- `quality` (select: standard, hd)
- `style` (select: natural, vivid)

**Outputs:**
- `imageUrl` (text) — Generated image URL
- `metadata` (json) — Provider, cost, generation params

**Backend:** MediaTaskService + Celery worker

### 4.7 Skill Nodes (Auto-Generated Per Skill)

For each skill in the registry (e.g., "Video Ad Creator"):

**Inputs:** Auto-generated from `input.schema.json`
- Each schema field becomes an input port
- Dual-mode: form input OR port connection

**Outputs:**
- `result` (text) — Primary skill output
- `metadata` (json) — Execution details, cost

**Backend:** Existing skill execution pipeline

## 5. Execution System

### 5.1 Compilation

"Compile" button validates and transforms:
1. Validate all required inputs are configured or connected
2. Validate no circular dependencies (DAG check)
3. Validate type compatibility of all connections
4. Transform ReactFlow JSON → executable manifest
5. Save manifest to database

### 5.2 Execution

1. User clicks "Run" → sends manifest to Python backend
2. Backend creates execution record, starts processing
3. Topological sort determines execution order
4. Each node executes in order, passing data via state
5. SSE stream sends real-time updates to frontend

### 5.3 Real-Time Visualization

**Canvas highlighting:**
- Pending: default border
- Running: blue pulsing border + spinner
- Success: green border + checkmark
- Failed: red border + X icon
- Skipped: gray dashed border

**Log panel (side drawer):**
- Chronological list of execution steps
- Each entry shows: node name, status, duration, input/output summary
- Expandable to see full data
- Error messages with stack traces

### 5.4 Error Handling

Default behavior: **Stop workflow + notify user**
- Halt execution on first node failure
- Mark failed node in red on canvas
- Show error details in log panel
- Send notification (in-app + optional email/Telegram)
- Allow user to fix and re-run from failed node (future enhancement)

## 6. UI Components

### 6.1 Node Palette (Sidebar)

Reorganized by category:
- **AI & Language:** LLM Call, RAG Query
- **Flow Control:** Conditional, Loop
- **Human:** Approval Gate
- **Skills:** (auto-generated list)
- **Media:** Generate Image, Generate Video
- **Integration:** HTTP Request, Email, Telegram

Searchable with text filter. Drag-and-drop to canvas.

### 6.2 Node Configuration Panel

Right-side drawer that opens when a node is selected. Shows:
- Node name (editable)
- Description
- Input fields with appropriate UI controls
- Port connections indicator (which inputs are connected vs manual)
- Output preview (after execution)

### 6.3 Template Browser

Replaces hardcoded example list:
- Search bar with full-text search
- Category tabs/filter
- Grid/list view of templates
- Template card: name, description, node count, category, rating, downloads
- "Use Template" button loads into editor
- "Save as Template" button in editor header

## 7. Integration Points

| Component | Backend Service | How Connected |
|-----------|----------------|---------------|
| LLM Call | LLM Gateway (multi-provider) | POST via tRPC → Python API |
| RAG Query | HybridRAG + EmbeddingService | POST via tRPC → Python API |
| Approval Gate | ApprovalDBService | POST via tRPC → Python API |
| Skill Nodes | Skill execution pipeline | POST via tRPC → Python API |
| Generate Image | MediaTaskService + Celery | POST via tRPC → Python API |
| Model Picker | ProviderConfigService | GET available models |
| User/Role Picker | User DB + Role system | GET users/roles |
| Collection Picker | pgvector_store | GET collections |
| Template CRUD | New template service | CRUD via tRPC |
| Execution SSE | WorkflowOrchestrator | SSE stream |

## 8. Constraints

- ReactFlow v11 (no migration to v12)
- Existing database schema preserved (additive changes only)
- Python backend: FastAPI + SQLAlchemy async
- Frontend: React 19 + tRPC + TanStack Query
- Multi-tenancy isolation
- Credit-based usage tracking
- No breaking changes to existing skills system
