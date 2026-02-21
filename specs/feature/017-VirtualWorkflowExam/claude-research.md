# Research Findings — Feature 017: Virtual Workflow Examples

## 1. Existing SmartSpecPro Codebase

### 1.1 Workflow Data Model (ReactFlow JSON)

The system stores workflows as ReactFlow JSON. Each workflow record in the `workflows` table contains:

```typescript
interface WorkflowJson {
  nodes: Array<{
    id: string;                          // UUID
    type: string;                        // ReactFlow type (visual only)
    position: { x: number; y: number };  // Canvas position
    data: {
      nodeType: string;   // Registry key e.g. "llm_call"
      label: string;      // Display name
      config: Record<string, unknown>;  // Node-specific settings
    };
  }>;
  edges: Array<{
    id: string;
    source: string;        // Source node id
    target: string;        // Target node id
    sourceHandle?: string; // Output port name
    targetHandle?: string; // Input port name
  }>;
}
```

After compilation, a `_compiledMetadata` block is added. The compiled manifest is what the LangGraph runtime executes.

### 1.2 DB Schema — Relevant Tables

| Table | Key Columns | Notes |
|---|---|---|
| `workflows` | id, name, description, workflowJson, userId, tenantId, status, defaultModel | User-authored workflow drafts |
| `workflowTemplates` | id, name, description, workflowJson, categoryId, authorId, status, isPublic, usageCount | **Already exists** — template marketplace |
| `workflowExecutions` | id, workflowId, status, inputData, outputData, startedAt | Execution records |
| `workflowSchedules` | workflowId, cronExpression, isActive, nextRun | Cron triggers |

**Important:** `workflowTemplates` table already exists with `isPublic`, `usageCount`, `categoryId` — the schema is already ready for a template library feature.

### 1.3 Frontend Workflow Editor

- **Built on ReactFlow** — visual DAG editor
- Key components:
  - `BaseNode` — renders each node with dynamic config panel
  - `DynamicNodeConfig` — auto-generates form from node spec
  - `TemplateBrowser` — **already exists** for browsing/loading templates
  - `AutoCreateWorkflowModal` — **already exists** for AI-generated workflows
- **`useNodeRegistry`** hook fetches all 57 node types from `/api/v1/workflows/node-types`

### 1.4 tRPC + Python API

**Node.js tRPC** (`apps/web/server/routers/workflow.ts`) covers:
- `save`, `load`, `listSaved`, `delete` — CRUD
- `compile`, `execute`, `getExecution`, `streamExecution` — runtime
- `estimateCost`, `resumeExecution` — helpers

**Python FastAPI** (`python-backend/app/api/workflows.py`) includes:
- `POST /api/v1/workflows/generate` — **NL prompt → workflow JSON** (Celery async)
- `GET /api/v1/workflows/generate/status/{task_id}` — poll generation status

**The NL-to-workflow generation endpoint already exists.** Feature 017 needs to populate example templates, define their storage format, and surface them in the UI.

### 1.5 Workflow Generation (Existing)

`WorkflowGenerator` is implemented as a Celery task. It:
1. Takes a natural language description
2. Calls an LLM (via the provider registry)
3. Returns ReactFlow JSON for the canvas

The generator exists but there is no curated template library or example gallery surfaced to users.

### 1.6 Testing Setup

- **pytest** with async support, markers: `unit`, `integration`, `slow`
- `python-backend/tests/test_api_workflows.py` — API endpoint tests
- `python-backend/tests/integration/test_workflow_e2e.py` — end-to-end tests
- **Coverage**: 80% minimum enforced
- Frontend: Vitest (apps/web)

---

## 2. Industry Research: Template Library Design

### 2.1 How Leading Tools Structure Templates

**n8n** (8,344+ templates, largest open library):
- Categories: AI, Marketing, Sales, Content Creation, IT Ops, Document Ops, Support, Finance, HR, Engineering, SecOps, Building Blocks
- Per-template metadata: `name`, `description`, `categories[]`, `nodes[]` (list of node types used — key for discoverability), `views`, `author`, `createdAt/updatedAt`, `tags[]`
- Custom server endpoint: self-hosted n8n can point to a private template server following the same JSON/API contract

**Zapier**:
- Template title format: "Verb + trigger app + action app" (e.g., "Send Slack message for every new Gmail email in a label")
- Description: 2–4 sentences explaining who uses it, when, and what problem it solves
- Pre-populated field mappings reduce setup friction

**Make.com Blueprints**:
- Full scenario exported as JSON (modules + connections + settings)
- Credentials stripped — must reconnect after import
- Webhook URLs regenerated on import

### 2.2 What Makes a Good Template (UX Research)

1. **Concrete, action-oriented title** — verb + source + destination
2. **Node/step count visible** — "6 steps" signals complexity upfront
3. **Required apps logos** — visual recognition before reading
4. **Credential-free portability** — no embedded secrets
5. **Popularity/usage count** — social proof
6. **Last updated date** — warns against stale templates
7. **Tags orthogonal to categories** — app tags, trigger type, pattern type, complexity

---

## 3. Industry Research: Workflow JSON Schema Best Practices

### 3.1 n8n Schema (De Facto Standard)

```json
{
  "name": "Workflow Name",
  "id": "uuid",
  "nodes": [
    {
      "id": "node-uuid",
      "name": "Node Display Name",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [240, 300],
      "parameters": { "url": "...", "method": "GET" }
    }
  ],
  "connections": {
    "Source Node Name": {
      "main": [[{ "node": "Target Node Name", "type": "main", "index": 0 }]]
    }
  },
  "tags": [{ "id": "tag-id", "name": "tag-name" }],
  "meta": { "templateCredsSetupCompleted": true }
}
```

Key decisions:
- Connections keyed by node name (human-readable but fragile on rename)
- `typeVersion` per-node for backwards compatibility
- `position [x, y]` preserved in node object

### 3.2 SmartSpecPro Existing Format vs Best Practices

SmartSpecPro's `workflowJson.nodes[].data.nodeType` matches the registry concept. `edges[]` as a separate array (like n8n `connections`) is already the right approach.

**Gaps to address for example templates:**
- No `meta.description` / `meta.author` / `meta.version` at the root
- No `tags[]` on the workflow JSON (though `workflowTemplates.categoryId` handles categories)
- Example templates need pre-populated `config` values that are illustrative but don't contain real credentials

### 3.3 Key Schema Best Practices Summary

| Concern | Best Practice |
|---|---|
| Node identity | UUID-based IDs, human-readable names separate |
| Connections | Separate connections/edges structure |
| Versioning | `typeVersion` per-node, `$schema` at root |
| Credentials | Reference `{ id, name }` only — never embed secrets |
| Metadata | `name`, `description`, `author`, `version`, `createdAt` at root |
| Parameters | Support placeholder values and `{{env.SECRET_NAME}}` patterns |

---

## 4. Industry Research: LLM-Powered Workflow Generation

### 4.1 Production Examples

**Zapier Copilot** (production, 2024-2025):
- User describes automation in plain English
- LLM produces multi-step Zap outline: trigger + actions with app/event suggestions
- **Confirmation per step** — no silent actions, user reviews before apply
- Also works across tables, forms, chatbots — unified AI interface

**n8n AI Workflow Maker** (community proof-of-concept):
- GPT + Pinecone embeddings → n8n workflow JSON from natural language
- Limitation: generates structure but doesn't fully populate parameters or connect all components

### 4.2 Prompting Strategies for Workflow JSON Generation

**Two-phase generation (highest accuracy):**
```
Phase 1 (free reasoning): Think through which nodes are needed, their connections,
                           and what parameters each requires.
Phase 2 (constrained output): Output the workflow JSON conforming to the schema: { ... }
```

**Few-shot examples:** Provide 2–3 (description → JSON) pairs in context — dramatically improves field-level accuracy.

**Chain-of-thought for node identification:**
```
1. Identify trigger type (manual/schedule/webhook/event)
2. List required node types in order
3. Describe data flow between nodes
4. Generate the JSON
```

**Function calling / tool use:** Define workflow schema as a function parameter schema — most reliable for guaranteed schema compliance.

### 4.3 Validation Pipeline

Multi-layer validation (recommended):
1. **Syntactic**: Valid JSON parse
2. **Schema**: Validate against workflow JSON Schema (Pydantic/Zod)
3. **Semantic**: Node IDs referenced in edges exist in nodes, trigger nodes have no incoming connections, no circular dependencies
4. **Application**: Node `type` values exist in registry, parameter values valid for node type
5. **Retry with error feedback**: Re-prompt LLM with specific validation error if fails (max 3 attempts)

### 4.4 Constrained Decoding (when controlling inference)

| Library | Method | Best For |
|---|---|---|
| Guidance/llguidance | Grammar-based token sampling | Highest compliance, fastest |
| Outlines | JSON Schema → automaton | Guaranteed valid JSON |
| Instructor | Pydantic re-prompting | Cloud APIs (OpenAI, Anthropic) |
| OpenAI Structured Outputs | Native JSON Schema via API | Simplest for OpenAI |

SmartSpecPro already uses Anthropic/OpenAI APIs — **Instructor pattern** (Pydantic validation + auto-retry) is the most appropriate approach.

---

## 5. Recommended Architecture for Feature 017

### 5.1 Template Storage Format

Since `workflowTemplates` table already exists, example templates should be:
- Stored as rows in `workflowTemplates` with `isPublic = true`, `status = 'published'`
- `workflowJson` field = actual ReactFlow JSON (with placeholder/example config values)
- Add `tags` JSON column to `workflowTemplates` if not present

### 5.2 Template Metadata Schema (Extended)

```json
{
  "name": "Daily Sales Report",
  "description": "Summarizes yesterday's sales and emails to management every morning at 7 AM",
  "category": "Business / Sales",
  "tags": ["schedule", "reporting", "email", "beginner"],
  "nodeTypes": ["schedule_trigger", "database_query", "llm_call", "template_engine", "send_email"],
  "stepCount": 5,
  "industry": ["E-commerce", "Retail", "B2B"],
  "estimatedSetupMinutes": 10,
  "workflowJson": { ... }
}
```

### 5.3 AI Generation Enhancement

The existing `WorkflowGenerator` Celery task should be enhanced to:
1. Use few-shot examples (from the template library) in its prompt
2. Apply Pydantic schema validation with auto-retry
3. Populate illustrative (non-secret) parameter values
4. Add descriptive labels to nodes

### 5.4 Testing Approach

- **Unit**: Test each example template's JSON parses and validates against the schema
- **Integration**: Test that each template can be loaded into the editor without errors
- **E2E**: Test that the workflow generator produces valid JSON when given descriptions similar to the 60 use cases
- Use existing `conftest.py` fixtures (`valid_workflow_nodes`, `valid_workflow_edges`)

---

## Sources

- n8n Template Library: https://n8n.io/workflows/, https://docs.n8n.io/workflows/templates/
- n8n JSON Format: https://latenode.com/blog/..., https://generactorai.com/blog/n8n/...
- Zapier Zap Templates: https://docs.zapier.com/platform/publish/zap-templates
- Zapier AI Zap Generation: https://help.zapier.com/hc/en-us/articles/15703650952077
- Make.com Blueprints: https://help.make.com/blueprints
- Azure WDL Schema: https://learn.microsoft.com/en-us/azure/logic-apps/workflow-definition-language-schema
- ComfyUI Workflow JSON: https://docs.comfy.org/specs/workflow_json
- FlowSpec (portable schema): https://github.com/woodyhayday/FlowSpec
- JSONSchemaBench (LLM structured output): https://arxiv.org/html/2501.10868v1
- LLM Structured Output Libraries: https://simmering.dev/blog/structured_output/
- n8n AI Workflow Maker: https://community.n8n.io/t/n8n-ai-workflow-maker/20143
- Zapier Copilot: https://zapier.com/blog/ai-workflow-features/
