# Combined Specification — Feature 017: Virtual Workflow Examples

## 1. Problem Statement

SmartSpecPro has a fully functional workflow engine (57 node types, LangGraph runtime, visual ReactFlow editor, AI generation endpoint) but presents users with a **blank canvas**. There are no example workflows to inspire, guide, or onboard new users. The `workflowTemplates` DB table and `TemplateBrowser` UI component already exist but are empty.

Feature 017 fills this gap with:
1. **60 curated workflow example templates** covering 15 industry/use-case categories
2. **A full-featured Gallery page** for browsing, previewing, and importing templates
3. **An enhanced AI generator** with few-shot prompting and a Pydantic validation pipeline

---

## 2. Scope

### In Scope
- 60 JSON workflow definition files (one per use case from spec.md)
- A TypeScript/Node.js loader script that seeds the templates into `workflowTemplates`
- A `previewSvg` column on `workflowTemplates` (schema migration)
- SVG diagram generator utility (generates workflow topology SVG from JSON at seed time)
- New **Gallery page** (`/workflows/gallery`) with:
  - Category filter sidebar (15 categories)
  - Template card grid (name, category, node count, industry tags)
  - Template detail drawer (description, SVG diagram, node badge list, "Use This Template" CTA)
- Enhancement to `WorkflowGenerator` Celery task:
  - Few-shot examples from the curated templates fed into the LLM prompt
  - Pydantic schema validation with up to 3 retry attempts on failure
  - Validation error surfaced to user after all 3 retries fail

### Out of Scope
- User-submitted templates and approval workflow
- Tenant-scoped template visibility
- Animated or interactive node diagram (ReactFlow canvas preview)
- Generation of template SVGs at runtime (all pre-generated at seed time)
- New node types (the 57 existing nodes are sufficient for all 60 use cases)

---

## 3. Template Catalog

### 3.1 Category Taxonomy (15 Categories)

| Category Name | Spec Group | Template Count |
|---|---|---|
| Sales & Marketing | A | 8 |
| HR & People | B | 5 |
| Finance & Accounting | C | 4 |
| IT & DevOps | D | 4 |
| Healthcare | E | 3 |
| Education | F | 4 |
| Government & Public | G | 3 |
| Personal Productivity | H | 5 |
| Real Estate | I | 2 |
| Logistics & Supply Chain | J | 2 |
| Content & Media | K | 3 |
| Food & Restaurant | L | 2 |
| Legal & Compliance | M | 2 |
| Customer Service | N | 3 |
| AI & Automation | O | 10 |
| **Total** | | **60** |

### 3.2 Template JSON File Structure

Each template stored as `templates/{id}-{slug}.json`:

```json
{
  "id": "tpl-001",
  "name": "Daily Sales Report",
  "description": "Summarizes yesterday's sales and emails a report to management every morning at 7 AM. Compares vs previous week and highlights top products.",
  "category": "Sales & Marketing",
  "industry": ["E-commerce", "Retail", "B2B"],
  "tags": ["schedule", "reporting", "email", "database", "beginner"],
  "stepCount": 6,
  "estimatedSetupMinutes": 10,
  "workflowJson": {
    "nodes": [
      {
        "id": "n1",
        "type": "workflowNode",
        "position": { "x": 100, "y": 200 },
        "data": {
          "nodeType": "schedule_trigger",
          "label": "Every morning at 7 AM",
          "config": {
            "schedule": "0 7 * * *",
            "timezone": "Asia/Bangkok"
          }
        }
      },
      {
        "id": "n2",
        "type": "workflowNode",
        "position": { "x": 350, "y": 200 },
        "data": {
          "nodeType": "database_query",
          "label": "Get yesterday's sales",
          "config": {
            "queryType": "SELECT",
            "query": "SELECT product_name, SUM(quantity) as units_sold, SUM(total_price) as revenue FROM orders WHERE DATE(created_at) = CURRENT_DATE - INTERVAL '1 day' GROUP BY product_name ORDER BY revenue DESC LIMIT 20",
            "database": "{{env.DATABASE_URL}}"
          }
        }
      }
    ],
    "edges": [
      { "id": "e1", "source": "n1", "target": "n2", "sourceHandle": "output", "targetHandle": "input" }
    ]
  }
}
```

**Key conventions for template JSON:**
- `id`: Sequential `tpl-001` through `tpl-060`
- Node `config` values: Always use illustrative, realistic values (not empty strings)
- Credentials: Use `{{env.VAR_NAME}}` or `"{{your_database_connection}}"` style placeholders — never real values
- Prompts: Write complete, production-ready example prompts for `llm_call` nodes
- SQL queries: Write real SELECT queries that work against common schema patterns
- Cron expressions: Use real, common expressions (daily, weekly, hourly)
- Node positions: Arrange left-to-right with 250px horizontal spacing, grouped vertically for parallel branches

---

## 4. SVG Diagram Generation

### 4.1 Requirements

Generate a simplified topology SVG from `workflowJson` at seed time:
- Node boxes: rounded rect, color-coded by category (`llm_call` = blue, `conditional` = purple, `http_request` = green, etc.)
- Node label: truncated to 20 chars if needed
- Arrows: thin directional lines between nodes
- Layout: auto-layout via topological sort (left to right)
- Output: Inline SVG string, stored in `workflowTemplates.previewSvg`
- Dimensions: 800×400px canvas, scale to fit all nodes

### 4.2 Color Coding by Category

| Node Category | Color |
|---|---|
| ai | #3B82F6 (blue) |
| flow_control | #8B5CF6 (purple) |
| data | #F97316 (orange) |
| triggers | #10B981 (green) |
| integrations | #06B6D4 (cyan) |
| outputs | #EF4444 (red) |
| observability | #6B7280 (gray) |

### 4.3 Implementation

Utility function `generateWorkflowSvg(workflowJson: WorkflowJson): string`:
- Located in `apps/web/server/lib/workflowSvgGenerator.ts`
- Used by the loader script at seed time
- Exported for potential future use (e.g., re-generating on template update)

---

## 5. Database Changes

### 5.1 Schema Addition

Add `previewSvg` column to `workflowTemplates`:

```sql
ALTER TABLE "workflowTemplates" ADD COLUMN "previewSvg" text;
```

Also add `industry` and `tags` JSON columns if not already present:

```sql
ALTER TABLE "workflowTemplates" ADD COLUMN IF NOT EXISTS "industry" json DEFAULT '[]';
ALTER TABLE "workflowTemplates" ADD COLUMN IF NOT EXISTS "tags" json DEFAULT '[]';
ALTER TABLE "workflowTemplates" ADD COLUMN IF NOT EXISTS "stepCount" integer;
ALTER TABLE "workflowTemplates" ADD COLUMN IF NOT EXISTS "estimatedSetupMinutes" integer;
```

Update `drizzle/schema.ts` and run `pnpm db:push`.

### 5.2 Seeding Strategy

Template seeding is idempotent:
```sql
INSERT INTO "workflowTemplates" (...) VALUES (...)
ON CONFLICT ("id") DO UPDATE SET ...
```

Loader script location: `scripts/seed-workflow-templates.ts`

System templates use `authorId = null` (or a designated system user ID) and `isPublic = true`.

---

## 6. Gallery Page

### 6.1 Route

`/workflows/gallery` — protected route (requires authentication)

### 6.2 Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  WORKFLOW GALLERY                                [Search...]     │
├──────────────┬──────────────────────────────────────────────────┤
│ Categories   │  Template Cards (3-column grid)                  │
│ ──────────── │  ┌────────────┐ ┌────────────┐ ┌────────────┐  │
│ All (60)     │  │ Daily      │ │ Lead        │ │ Employee   │  │
│ Sales &      │  │ Sales Rpt  │ │ Scoring     │ │ Onboarding │  │
│   Marketing  │  │ ● ●●●●●    │ │ ● ●●●●●    │ │ ● ●●●●●    │  │
│ HR & People  │  │ Sales &    │ │ Sales &    │ │ HR &       │  │
│ Finance      │  │ Marketing  │ │ Marketing  │ │ People     │  │
│ IT & DevOps  │  │ 6 steps    │ │ 8 steps    │ │ 10 steps   │  │
│ Healthcare   │  └────────────┘ └────────────┘ └────────────┘  │
│ Education    │                                                   │
│ ...          │  [Load more / pagination]                        │
└──────────────┴──────────────────────────────────────────────────┘
```

### 6.3 Template Card

Each card displays:
- Template name (bold)
- Short description (2 lines, truncated)
- Category badge (colored)
- Step count + industry tags (chips)
- "Preview" button → opens detail drawer

### 6.4 Template Detail Drawer

Slides in from the right on card click/preview:

```
┌─────────────────────────────────────────────────┐
│ Daily Sales Report                    [X Close] │
│ Sales & Marketing  |  6 steps  |  ~10 min setup │
├─────────────────────────────────────────────────┤
│ [SVG Diagram Preview]                           │
│  schedule_trigger → database_query → llm_call   │
│  → template_engine → send_email                 │
├─────────────────────────────────────────────────┤
│ Description                                     │
│ Summarizes yesterday's sales and emails a       │
│ report to management every morning at 7 AM...   │
│                                                 │
│ Nodes Used                                      │
│ [schedule_trigger] [database_query] [llm_call]  │
│ [template_engine] [send_email]                  │
│                                                 │
│ Industries                                      │
│ [E-commerce] [Retail] [B2B]                    │
├─────────────────────────────────────────────────┤
│         [Use This Template →]                   │
└─────────────────────────────────────────────────┘
```

### 6.5 "Use This Template" Action

1. Calls `workflow.save` tRPC mutation with the template's `workflowJson`
2. Creates a new workflow draft (status = 'draft') owned by the current user
3. Redirects to `/workflows/{newId}` (the workflow editor)
4. Shows a toast: "Template loaded! Configure your connections and run."

---

## 7. Enhanced AI Workflow Generator

### 7.1 Few-Shot Prompting

`WorkflowGenerator` Celery task enhanced to:
1. At startup, load 5 representative example templates from `workflowTemplates` where `isPublic = true` (one per major category)
2. Include them in the system prompt as few-shot examples:

```python
SYSTEM_PROMPT = """
You are a workflow automation expert for SmartSpecPro.
Generate workflow JSON definitions from user descriptions.

The workflow JSON must follow this exact schema:
{SCHEMA_JSON}

Here are example workflows to guide your output format:
{FEW_SHOT_EXAMPLES}

RULES:
- Use only node types from the registry: {NODE_TYPES}
- Every workflow must have exactly one trigger node
- Use {{env.VAR_NAME}} for any credentials or API keys
- Include descriptive labels for each node
"""
```

3. Few-shot examples selected by semantic similarity to user's prompt (via cosine similarity on embeddings, or simpler keyword matching)

### 7.2 Pydantic Validation Pipeline

**Validation schema** (`python-backend/app/orchestrator/workflow_validator.py`):

```python
class NodeData(BaseModel):
    nodeType: str
    label: str
    config: dict = {}

class WorkflowNode(BaseModel):
    id: str
    type: str
    position: dict[str, float]
    data: NodeData

class WorkflowEdge(BaseModel):
    id: str
    source: str
    target: str
    sourceHandle: str = "output"
    targetHandle: str = "input"

class WorkflowJson(BaseModel):
    nodes: list[WorkflowNode]
    edges: list[WorkflowEdge]

    @validator('nodes')
    def must_have_trigger(cls, nodes):
        trigger_types = {'manual_trigger', 'webhook_trigger', 'schedule_trigger',
                        'event_trigger', 'file_upload_trigger', 'queue_trigger', 'error_trigger'}
        types = {n.data.nodeType for n in nodes}
        if not types.intersection(trigger_types):
            raise ValueError("Workflow must contain at least one trigger node")
        return nodes

    @validator('edges')
    def edges_reference_valid_nodes(cls, edges, values):
        if 'nodes' in values:
            node_ids = {n.id for n in values['nodes']}
            for edge in edges:
                if edge.source not in node_ids:
                    raise ValueError(f"Edge source '{edge.source}' not found in nodes")
                if edge.target not in node_ids:
                    raise ValueError(f"Edge target '{edge.target}' not found in nodes")
        return edges
```

**Retry loop** (max 3 attempts):

```python
async def generate_with_validation(prompt: str) -> tuple[dict, int]:
    last_error = None
    for attempt in range(1, 4):
        raw_json = await llm_generate(prompt, previous_error=last_error)
        try:
            parsed = json.loads(raw_json)
            validated = WorkflowJson(**parsed)
            return validated.dict(), attempt
        except (json.JSONDecodeError, ValidationError) as e:
            last_error = str(e)
            if attempt == 3:
                raise WorkflowGenerationError(
                    f"Failed to generate valid workflow after 3 attempts. Last error: {last_error}"
                )
```

**Error surfacing to user:** When all 3 retries fail, the frontend receives:
```json
{
  "status": "failed",
  "error": "Could not generate a valid workflow after 3 attempts.",
  "validationError": "Workflow must contain at least one trigger node. The generated workflow had: llm_call, send_email but no trigger.",
  "hint": "Try describing your trigger: 'When a form is submitted...' or 'Every morning at 8 AM...'"
}
```

---

## 8. File Structure

```
specs/feature/017-VirtualWorkflowExam/
├── spec.md                          # Original use case inventory
├── claude-research.md               # Research findings
├── claude-interview.md              # Interview transcript
├── claude-spec.md                   # This file
└── templates/                       # 60 template JSON files
    ├── tpl-001-daily-sales-report.json
    ├── tpl-002-customer-review-response.json
    ├── tpl-003-lead-scoring-routing.json
    ├── ...
    └── tpl-060-subscription-renewal.json

apps/web/
├── client/src/
│   ├── pages/
│   │   └── WorkflowGallery.tsx      # NEW: Gallery page
│   └── components/workflow/
│       ├── GalleryCard.tsx           # NEW: Template card component
│       └── GalleryDetailDrawer.tsx   # NEW: Template detail slide-in
├── server/
│   ├── routers/workflow.ts           # MODIFY: Add gallery endpoints
│   └── lib/
│       └── workflowSvgGenerator.ts  # NEW: SVG generation utility
└── drizzle/schema.ts                 # MODIFY: Add previewSvg, industry, tags columns

scripts/
└── seed-workflow-templates.ts        # NEW: Idempotent seeder script

python-backend/app/orchestrator/
├── workflow_validator.py             # NEW: Pydantic validation schemas
└── workflow_generator.py             # MODIFY: Add few-shot + retry pipeline
```

---

## 9. tRPC Endpoints (New/Modified)

### 9.1 New Gallery Endpoints

Add to `apps/web/server/routers/workflow.ts`:

```typescript
// List templates with optional category filter
listTemplates: protectedProcedure
  .input(z.object({
    category: z.string().optional(),
    search: z.string().optional(),
    tags: z.array(z.string()).optional(),
    limit: z.number().default(24),
    offset: z.number().default(0),
  }))
  .query(...)

// Get single template detail
getTemplate: protectedProcedure
  .input(z.object({ id: z.number() }))
  .query(...)

// Use (clone) template as new workflow
useTemplate: protectedProcedure
  .input(z.object({ templateId: z.number(), name: z.string().optional() }))
  .mutation(...)
```

---

## 10. Acceptance Criteria

### Template Library
- [ ] 60 `.json` template files exist in `templates/` directory
- [ ] Each template has realistic, illustrative config values (not empty)
- [ ] All 60 templates load successfully into the workflow editor without errors
- [ ] `seed-workflow-templates.ts` runs idempotently (re-run produces no duplicates)
- [ ] All 60 templates have pre-generated `previewSvg` in the database

### Gallery Page
- [ ] `/workflows/gallery` route accessible to all authenticated users
- [ ] Category filter sidebar shows all 15 categories with correct counts
- [ ] Search filters templates by name and description
- [ ] Detail drawer opens on card click showing SVG diagram, description, node badges
- [ ] "Use This Template" creates a workflow draft and navigates to the editor
- [ ] Toast confirmation shown after template is loaded

### AI Generator Enhancement
- [ ] Generator includes 5 few-shot examples in its system prompt
- [ ] Generated JSON is validated against Pydantic schema
- [ ] Auto-retries up to 3 times on validation failure
- [ ] Validation error + hint surfaced to user after 3 failed attempts
- [ ] Success rate measurably improved (tracked via metrics)

### Tests
- [ ] Unit tests for `generateWorkflowSvg()` utility
- [ ] Unit tests for `WorkflowJson` Pydantic validator
- [ ] Integration test: seeder script populates DB correctly
- [ ] Integration test: all 60 templates pass schema validation
- [ ] E2E test: gallery page loads, filter by category, open detail, use template
