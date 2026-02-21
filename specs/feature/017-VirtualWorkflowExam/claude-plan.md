# Implementation Plan — Feature 017: Virtual Workflow Examples

## Overview

SmartSpecPro ships with a fully functional workflow engine (57 registered node types, LangGraph runtime, ReactFlow visual editor, AI generation endpoint) but presents users with a blank canvas. The `workflowTemplates` database table and `TemplateBrowser` UI component already exist in the codebase but contain no content. This feature fills that gap by delivering:

1. **60 curated workflow example templates** — one per use case across 15 industry categories
2. **A full Gallery page** — browse, filter, preview, and one-click import templates
3. **An enhanced AI workflow generator** — few-shot prompting from curated examples, plus a Pydantic validation + retry pipeline

The implementation is additive: no existing tables or components are removed, only extended.

---

## Architecture Context

### Existing Infrastructure (do not redesign)

The workflow system comprises three layers:

- **Python backend** (`python-backend/app/orchestrator/`): LangGraph runtime, NodeRegistry, WorkflowCompiler, NodeAdapter, 100+ NodeExecutors. The `WorkflowGenerator` Celery task already exists and accepts a natural language prompt.
- **Node.js backend** (`apps/web/server/routers/workflow.ts`): tRPC router that proxies compile/execute calls to Python and owns CRUD operations.
- **Frontend** (`apps/web/client/src/pages/WorkflowEditor.tsx`): ReactFlow canvas with `useNodeRegistry` hook, `TemplateBrowser` component, and `AutoCreateWorkflowModal`.

### Relevant Schema

The `workflowTemplates` table already contains: `id`, `name`, `description`, `authorId` (NOT NULL FK to users), `tenantId`, `workflowJson`, `categoryId` (FK to `templateCategories`), `status`, `isPublic`, `downloadCount`, `tags` (json — already exists), `searchVector` (tsvector — already exists for FTS), `createdAt`, `updatedAt`. It needs the following new columns: `previewSvg` (text), `industry` (json array), `stepCount` (integer), `estimatedSetupMinutes` (integer), `templateKey` (varchar(50), unique — used as idempotent upsert key).

The `workflowJson` field stores a ReactFlow JSON object with `nodes[]` and `edges[]` arrays. Each node carries a `data.nodeType` key that maps to the NodeRegistry (e.g., `"llm_call"`, `"schedule_trigger"`). The `type` field on each node is the ReactFlow renderer type — it must be `"workflow"` (the registered custom node component name), not `"workflowNode"` or any other value.

---

## Section 1: Database Schema Extension

The first task is extending `workflowTemplates` with the new columns needed for rich gallery display.

### Database Safety Protocol

Before making any schema changes, follow the mandatory backup protocol:

```bash
mkdir -p .db-backups
pg_dump "$DATABASE_URL" --data-only --table=workflowTemplates \
  --file=".db-backups/workflowTemplates_$(date +%Y%m%d_%H%M%S).sql"
pg_dump "$DATABASE_URL" --data-only --table=templateCategories \
  --file=".db-backups/templateCategories_$(date +%Y%m%d_%H%M%S).sql"
psql "$DATABASE_URL" -c "SELECT count(*) FROM \"workflowTemplates\"; SELECT count(*) FROM \"templateCategories\";"
```

After migration, verify row counts match the pre-migration baseline.

### New Columns

Add these columns to `drizzle/schema.ts` in the `workflowTemplates` table definition:
- `previewSvg`: `text` — stores a pre-generated SVG string of the workflow topology diagram
- `industry`: `json` typed as `string[]` — list of industry/sector names (e.g., `["E-commerce", "Retail"]`)
- `stepCount`: `integer` — number of nodes in the workflow (computed at seed time)
- `estimatedSetupMinutes`: `integer` — rough setup effort estimate
- `templateKey`: `varchar(50)` with `unique()` constraint — stable slug identifier (e.g., `"tpl-001"`) used as the `ON CONFLICT` target for idempotent upserts

**Note:** `tags` (json) already exists on the table — do not re-add it. `downloadCount` also already exists (the column is `downloadCount`, not `usageCount`).

After updating the schema, run `pnpm db:push` to apply the migration. This is a safe, additive-only migration (nullable columns on a table that is currently empty in production).

---

## Section 2: SVG Diagram Generator Utility

Before seeding templates, a utility is needed to convert a `workflowJson` object into a compact SVG topology diagram. This SVG is generated once per template during seeding and stored in `previewSvg`.

### Location
`apps/web/server/lib/workflowSvgGenerator.ts`

### Function Signature

```typescript
function generateWorkflowSvg(workflowJson: WorkflowJson): string
```

Accepts the same `WorkflowJson` type used throughout the workflow system. Returns an inline SVG string (no `<html>` wrapper, just `<svg>...</svg>`).

### Algorithm

The generator uses a topological sort to determine node rendering order, then lays them out left-to-right on an 800×400 canvas. Parallel branches are stacked vertically. The process:

1. **Build adjacency list** from `edges[]`
2. **Topological sort** to get rendering order (Kahn's algorithm; if cycles detected, fall back to original node order)
3. **Assign column positions**: each node's column = longest path from any trigger node
4. **Assign row positions**: within each column, stack nodes vertically with 80px spacing
5. **Render nodes**: rounded rectangles (140×50px) colored by `nodeType` category; label = node `data.label` truncated to 18 chars
6. **Render edges**: curved SVG paths (cubic bezier) from center-right of source to center-left of target; arrow marker at target end
7. **Fit to canvas**: scale the bounding box to fit within the 800×400 viewport with 40px padding

### Color Map by Category

Each `nodeType` maps to a category (the same `category` field in the NodeRegistry). The color map:

| Category | Fill Color | Example Nodes |
|---|---|---|
| `triggers` | `#10B981` (green) | `schedule_trigger`, `webhook_trigger` |
| `ai` | `#3B82F6` (blue) | `llm_call`, `rag_query`, `multi_model_router` |
| `flow_control` | `#8B5CF6` (purple) | `conditional`, `loop`, `parallel`, `retry` |
| `data` | `#F97316` (orange) | `database_query`, `transformer`, `filter` |
| `integrations` / `integration` | `#06B6D4` (cyan) | `http_request`, `storage_action` |
| `outputs` | `#EF4444` (red) | `send_email`, `send_notification` |
| `observability` | `#6B7280` (gray) | `metrics_collector`, `secrets_vault` |
| `skills` / `media` / `human` | `#F59E0B` (amber) | `skill`, `generate_image`, `approval_gate` |

The category for an unknown `nodeType` defaults to gray. Since the generator runs at seed time (server-side), it can query the node type list from the registry or use a static lookup table built from the 57 known types.

---

## Section 3: Template JSON Files (60 Files)

Create 60 template JSON files at `specs/feature/017-VirtualWorkflowExam/templates/`. These are the canonical source of truth for all example workflows. They are plain JSON, not TypeScript, so they can be consumed by any seeder.

### File Naming
`tpl-{NNN}-{kebab-slug}.json` where NNN is zero-padded (001–060).

### Per-File Structure

Each JSON file must include:
- `id` — matches the filename prefix (`"tpl-001"`)
- `name` — human-readable title (English, descriptive, action-oriented)
- `description` — 2–4 sentences explaining who uses it, when, and what problem it solves
- `category` — one of the 15 category names (see taxonomy in Appendix A)
- `industry` — array of 1–3 sector strings
- `tags` — array of searchable tags (trigger type, output type, complexity level, key app types)
- `stepCount` — integer, total node count
- `estimatedSetupMinutes` — integer, honest estimate for a typical user
- `workflowJson` — the full ReactFlow JSON with realistic node configs

### Template Quality Requirements

**Node `type` field**: Every node object in `workflowJson.nodes` must have `type: "workflow"`. This is the ReactFlow custom node component name registered in the editor (`WorkflowNodeComponent` is registered under the key `"workflow"`). Do NOT use `"workflowNode"`, `"custom"`, or any other string — using the wrong type causes ReactFlow to fall back to the default node renderer and silently breaks the editor.

**Node positions**: Lay out nodes with 250px horizontal spacing and 150px vertical spacing for parallel branches. The canvas origin is (100, 200).

**Node labels**: Every node must have a specific, descriptive `data.label` (not just the node type). Example: "Query yesterday's orders" not "database_query".

**Config values**: Every `data.config` must be populated with realistic example values:
- `schedule_trigger.config.schedule` — use actual cron expressions (`"0 7 * * *"` not `""`)
- `llm_call.config.prompt` — write a complete, production-quality prompt template
- `database_query.config.query` — write a real SELECT/INSERT/UPDATE statement against common schema patterns
- `http_request.config.url` — use real API endpoint URL patterns (not `http://example.com`)
- `send_email.config.subject` — write the actual email subject line

**Credential placeholders**: For any value that would require a real secret, use `"{{env.DATABASE_URL}}"`, `"{{env.SLACK_WEBHOOK_URL}}"`, or `"{{secrets.OPENAI_API_KEY}}"` style placeholders. Never use real values.

### Category Distribution

All 60 use cases from `spec.md` must be converted. The mapping from spec group to category is:

| Spec Group | Category Name | Templates |
|---|---|---|
| A (Business/Sales/Marketing) | Sales & Marketing | tpl-001 to tpl-008 |
| B (HR) | HR & People | tpl-009 to tpl-013 |
| C (Finance) | Finance & Accounting | tpl-014 to tpl-017 |
| D (IT/DevOps) | IT & DevOps | tpl-018 to tpl-021 |
| E (Healthcare) | Healthcare | tpl-022 to tpl-024 |
| F (Education) | Education | tpl-025 to tpl-028 |
| G (Government) | Government & Public | tpl-029 to tpl-031 |
| H (Personal) | Personal Productivity | tpl-032 to tpl-036 |
| I (Real Estate) | Real Estate | tpl-037 to tpl-038 |
| J (Logistics) | Logistics & Supply Chain | tpl-039 to tpl-040 |
| K (Content/Media) | Content & Media | tpl-041 to tpl-043 |
| L (Restaurant) | Food & Restaurant | tpl-044 to tpl-045 |
| M (Legal) | Legal & Compliance | tpl-046 to tpl-047 |
| N (Customer Service) | Customer Service | tpl-048 to tpl-050 |
| O (Advanced/AI) | AI & Automation | tpl-051 to tpl-060 |

---

## Section 4: Seeder Script

The seeder is an idempotent TypeScript script that reads the 60 JSON files, generates the SVG for each, and upserts into the database.

### Location
`scripts/seed-workflow-templates.ts`

### Step 0: Seed `templateCategories` First

**Critical**: `workflowTemplates.categoryId` is a foreign key to `templateCategories`. Template seeding will fail with an FK violation if categories don't exist. The seeder must:

1. Upsert the 15 categories into `templateCategories` (with name as unique conflict target)
2. Build a `Map<string, number>` of category name → category ID
3. Use this map to resolve each template's `category` string to a numeric `categoryId`

The 15 category names are defined in Appendix A.

### Step 1: Resolve System User

**Critical**: `workflowTemplates.authorId` has a `NOT NULL` constraint with a FK to `users`. System templates cannot use `authorId = null`. The seeder must:

1. Query `SELECT id FROM users WHERE email = 'system@smartspecpro.internal' LIMIT 1`
2. If not found, insert a system user: `{ email: 'system@smartspecpro.internal', name: 'System', role: 'system' }` (or the minimal required fields for the `users` table)
3. Store the returned `id` as `systemUserId`
4. Use `systemUserId` as `authorId` for all 60 templates

### Step 2: Seed Templates

For each of the 60 JSON files:
1. Parse JSON, validate it matches the expected structure (log error with filename and continue — do not abort)
2. Apply a 10-second timeout to the SVG generation step (`generateWorkflowSvg`)
3. Generate the `previewSvg` by calling `generateWorkflowSvg(template.workflowJson)`. On timeout or error, set `previewSvg = null` and log a warning
4. Compute `stepCount = template.workflowJson.nodes.length` (if not already in JSON)
5. Resolve `categoryId` from the category map built in Step 0
6. Upsert into `workflowTemplates` using Drizzle's `onConflictDoUpdate` targeting the `templateKey` unique column. On conflict, update all fields including `previewSvg`, `workflowJson`, `name`, `description`

Print a per-template result: `[OK] tpl-001 | [WARN] tpl-042 (SVG timeout) | [ERROR] tpl-017 (parse error)`
Print a final summary: `Seeded 60 templates: 58 OK, 1 warned (SVG), 1 errored`

### Idempotency Strategy

The `templateKey` varchar column (added in Section 1) is the `ON CONFLICT` target. The `templateKey` value comes directly from the JSON file's `id` field (e.g., `"tpl-001"`). On re-seed, all fields are updated in place — no duplicate rows are created.

### System Template Ownership

System templates: `tenantId = null`, `authorId = systemUserId` (resolved in Step 1), `isPublic = true`, `status = 'published'`. The `null` tenantId means a system-level resource visible to all tenants.

### Running the Seeder

```
cd apps/web && npx tsx ../../scripts/seed-workflow-templates.ts
```

Must be safe to run multiple times. Should exit with code 0 on success, 1 on unrecoverable error (e.g., cannot connect to DB, cannot create system user).

---

## Section 5: tRPC Endpoints for Gallery

Add three new procedures to the workflow tRPC router (`apps/web/server/routers/workflow.ts`):

### `workflow.listTemplates`

A `protectedProcedure` query. Input: optional `category` (string), optional `search` (string), optional `tags` (string array), `limit` (number, default 24), `offset` (number, default 0). Executes a Drizzle query against `workflowTemplates` where `isPublic = true` and `status = 'published'`.

- **Category filter**: `WHERE categoryId = (SELECT id FROM templateCategories WHERE name = $category)`
- **Full-text search**: Use the existing `searchVector` tsvector column — `WHERE searchVector @@ plainto_tsquery($search)`. Do not use ILIKE; the column is already maintained for this purpose.
- **Returns**: Array of template summary objects — all columns **except** `workflowJson` (too large for list) and **except** `previewSvg` (200KB per template × 24 cards = 4.8MB per page load — omit from list). Returns `total` count for pagination.

The Gallery card grid does not show the SVG diagram — only the detail drawer does. The SVG is fetched lazily via `getTemplate` when the user opens a card.

### `workflow.listTemplateCategories`

A `protectedProcedure` query (no input). Returns the list of categories with template counts:

```sql
SELECT tc.id, tc.name, count(wt.id) as templateCount
FROM templateCategories tc
LEFT JOIN workflowTemplates wt ON wt.categoryId = tc.id
  AND wt.isPublic = true AND wt.status = 'published'
GROUP BY tc.id, tc.name
ORDER BY tc.name
```

Used by the Gallery sidebar to show category names with counts. Called once on page load and cached.

### `workflow.getTemplate`

A `protectedProcedure` query. Input: `id` (number). Returns the full template record including `workflowJson` and `previewSvg`. Used by the detail drawer when a user opens a card.

### `workflow.useTemplate`

A `protectedProcedure` mutation. Input: `templateId` (number), optional `name` (string). Fetches the template's `workflowJson`, creates a new row in `workflows` with `status = 'draft'`, the current user's `userId` and `tenantId`, and the template's `workflowJson`. Increments `workflowTemplates.downloadCount` for the source template (the column is `downloadCount`, not `usageCount`). Returns the new workflow's `id`. The frontend uses this ID to redirect to the editor.

---

## Section 6: Gallery Page (Frontend)

### Route

Add `/workflows/gallery` to the app's router (Wouter). This is a protected route, same auth guard as the workflow editor.

### File Structure

```
apps/web/client/src/
  pages/
    WorkflowGallery.tsx          # Page component (manages filter state, pagination)
  components/workflow/
    GalleryTemplateCard.tsx      # Card for the template grid
    GalleryDetailDrawer.tsx      # Slide-in detail panel
    GalleryCategories.tsx        # Sidebar category list with counts
```

### Page Component (`WorkflowGallery.tsx`)

Manages state: selected category (default: all), search query (debounced 300ms), current page, `selectedTemplateId`. Uses `workflow.listTemplates` query (TanStack Query) with these state values as input. Uses `workflow.listTemplateCategories` for the sidebar counts (separate query, cached).

**Loading state**: While `listTemplates` is fetching, render 24 skeleton cards (gray placeholder rectangles matching card dimensions).

**Error state**: If `listTemplates` fails, show a centered error card: "Could not load templates. Please try again." with a retry button that calls `refetch()`.

**Empty state**: If `listTemplates` returns 0 results (e.g., search matches nothing), show: "No templates found matching your filters." with a "Clear filters" button.

Renders a three-column responsive grid of `GalleryTemplateCard` components. Opening a card sets `selectedTemplateId`, which causes `GalleryDetailDrawer` to open and fires `workflow.getTemplate` to load the full record (including `previewSvg`).

### Template Card (`GalleryTemplateCard.tsx`)

Displays:
- Template `name` (bold, one line)
- `description` (two lines, `line-clamp-2` Tailwind class)
- Category badge (colored pill matching category color)
- `stepCount` chip (`"6 steps"`)
- Up to 3 `industry` tags as small chips
- "Preview" button (opens detail drawer)

Clicking anywhere on the card (except the button) also opens the detail drawer.

### Categories Sidebar (`GalleryCategories.tsx`)

Uses `workflow.listTemplateCategories` data (from the separate query in the parent page). Renders "All" at the top (count = total published templates), then each category name with its count. Active category is highlighted. Clicking a category updates the filter state in `WorkflowGallery`.

### Detail Drawer (`GalleryDetailDrawer.tsx`)

Uses the existing `Sheet` component from the UI library (Radix Sheet). Opens from the right side. Width: 520px. The drawer calls `workflow.getTemplate` with `selectedTemplateId` to fetch the full record (including `previewSvg`). Show a `Skeleton` placeholder while the query is loading.

Contents:
- Header: template name, close button
- Meta row: category badge, step count, setup time estimate
- SVG preview: **do NOT use `dangerouslySetInnerHTML`** (XSS risk). Instead, render as a sandboxed image:
  ```tsx
  const svgBase64 = btoa(unescape(encodeURIComponent(previewSvg)));
  <img
    src={`data:image/svg+xml;base64,${svgBase64}`}
    alt="Workflow topology diagram"
    className="w-full rounded-lg border"
  />
  ```
  This approach sandboxes the SVG — embedded scripts cannot execute. If `DOMPurify` is already a project dependency, use it to sanitize before the base64 conversion as defense-in-depth.
- Description section: full `description` text
- "Nodes used" section: each unique `nodeType` from the fetched template's `workflowJson.nodes` rendered as a `<Badge>` (use the same color map as the SVG generator)
- "Industries" section: industry chips
- Footer: full-width "Use This Template →" button

### "Use This Template" Flow

The detail drawer's CTA button:
1. Calls `workflow.useTemplate` mutation with `templateId`
2. Shows a loading spinner on the button while mutation is in-flight
3. On success: closes the drawer, shows a Sonner toast "Template loaded — configure your connections and run.", then navigates to `/workflow/{newWorkflowId}` using Wouter's `useLocation`
4. On error: shows an error toast "Could not load template. Please try again."

### Navigation Integration

Add a "Gallery" link to the workflow-related navigation. The exact placement depends on the existing sidebar/topbar structure — add it adjacent to the existing workflow list/editor links.

---

## Section 7: Enhanced AI Workflow Generator (Python)

### Location of Changes

`python-backend/app/orchestrator/workflow_generator.py` — the existing Celery task that handles `POST /api/v1/workflows/generate`.

### Sub-deliverable A: Pydantic Validation Schema

Create `python-backend/app/orchestrator/workflow_validator.py` with Pydantic v2 models for the workflow JSON structure. **This project uses Pydantic v2 (`pydantic>=2.7.4`)**. Use v2 API throughout — never v1 syntax.

```python
from pydantic import BaseModel, field_validator, model_validator
from typing import Any

# Hardcoded set of 57 known node types — do NOT import NodeRegistry here
# (circular dependency risk). Build this set from the node_registry.py
# type strings at module load time (copy-paste from registry, not import).
KNOWN_NODE_TYPES: frozenset[str] = frozenset({
    "manual_trigger", "schedule_trigger", "webhook_trigger", "event_trigger",
    "llm_call", "rag_query", "embedding_generator", "multi_model_router",
    "prompt_template", "output_parser",
    "conditional", "loop", "parallel", "join", "subworkflow",
    "retry", "circuit_breaker", "try_catch", "delay",
    "database_query", "transformer", "filter", "aggregator",
    "csv_parser", "template_engine", "read_file", "write_file",
    "http_request", "graphql_request", "websocket_client",
    "storage_action", "send_email", "send_notification",
    "metrics_collector", "logger_node", "secrets_vault",
    "generate_image", "skill", "approval_gate",
    # ... all 57 types
})

TRIGGER_NODE_TYPES: frozenset[str] = frozenset({
    "manual_trigger", "schedule_trigger", "webhook_trigger", "event_trigger",
})


class NodeData(BaseModel):
    nodeType: str
    label: str
    config: dict[str, Any] = {}


class WorkflowNode(BaseModel):
    id: str
    type: str = "workflow"   # Must be "workflow" — the ReactFlow custom component name
    position: dict[str, float]
    data: NodeData


class WorkflowEdge(BaseModel):
    id: str
    source: str
    target: str
    sourceHandle: str = "output"
    targetHandle: str = "input"


class GeneratedWorkflow(BaseModel):
    nodes: list[WorkflowNode]
    edges: list[WorkflowEdge]

    @model_validator(mode="after")
    def validate_workflow(self) -> "GeneratedWorkflow":
        node_ids = {n.id for n in self.nodes}
        node_types = {n.data.nodeType for n in self.nodes}

        # Validator 1: at least one trigger node
        if not node_types & TRIGGER_NODE_TYPES:
            raise ValueError(
                f"Workflow must have at least one trigger node. "
                f"Known triggers: {sorted(TRIGGER_NODE_TYPES)}"
            )

        # Validator 2: edges reference existing node IDs
        for edge in self.edges:
            if edge.source not in node_ids:
                raise ValueError(f"Edge source '{edge.source}' not found in nodes")
            if edge.target not in node_ids:
                raise ValueError(f"Edge target '{edge.target}' not found in nodes")

        # Validator 3: all nodeType values are in the known set
        for node in self.nodes:
            if node.data.nodeType not in KNOWN_NODE_TYPES:
                raise ValueError(
                    f"Unknown nodeType '{node.data.nodeType}'. "
                    f"Use one of the registered node types."
                )

        return self
```

**Important Pydantic v2 notes:**
- Use `@model_validator(mode="after")` instead of `@validator` (v1)
- Access sibling fields via `self` (not `values` dict) in `mode="after"`
- Use `.model_dump()` instead of `.dict()` when serializing
- Use `.model_validate(data)` instead of `Model(**data)` for explicit validation

### Sub-deliverable B: Retry Loop

Replace the current single LLM call in the generator with an application-level retry loop. **Critical**: Set Celery's own retry to `max_retries=0` on this task to prevent double-retrying (application loop retries 3×; if Celery also retried on exception, you'd get up to 9 total attempts).

```python
@celery_app.task(bind=True, max_retries=0)  # Application-level retry handles retries
def generate_workflow_task(self, prompt: str, ...):
    last_error: str | None = None

    for attempt in range(1, 4):  # 3 attempts
        llm_prompt = build_prompt(prompt, previous_error=last_error)
        raw_response = call_llm(llm_prompt)

        try:
            parsed = json.loads(raw_response)
            workflow = GeneratedWorkflow.model_validate(parsed)  # Pydantic v2
            return workflow.model_dump()  # Pydantic v2 (not .dict())
        except (json.JSONDecodeError, ValidationError) as e:
            last_error = format_error_for_llm(e)
            if attempt == 3:
                raise WorkflowGenerationError(
                    error="Workflow generation failed after 3 attempts.",
                    validation_error=last_error,
                    hint=derive_hint(e),
                )
```

When passing `previous_error` back to the LLM, include the specific field path and error message so the model can correct the exact issue. Append the error as a new correction instruction turn — do not re-send the full system prompt.

### Sub-deliverable C: Few-Shot Examples

At module load time (or after first call), load 5 representative templates from the database. **Selection strategy**: static — one template per major category bucket: AI/LLM, data processing, integration/HTTP, schedule-triggered, event/webhook-triggered. The 5 specific `templateKey` values to load are determined at implementation time from the 60 seeded templates and hardcoded in the module (do not use semantic search — static selection is simpler, predictable, and avoids DB round-trips per generation request).

**Token budget**: The 5 examples must fit within a **3000-token cap**. If a template's `workflowJson` is too large, truncate the `config` values (replace long strings with `"..."`) until it fits. If all 5 still exceed 3000 tokens, use 3 examples.

**Placement**: The few-shot examples **replace** (not supplement) the built-in example workflows already in the system prompt. The current system prompt has 3 hardcoded toy examples; the curated templates are more realistic and supersede them. Remove the 3 built-in examples when adding the curated ones.

Format each example as:
```
# Example {N}: {template name}
Description: {template description}
Workflow JSON:
{json.dumps(workflowJson, indent=2)}
```

**Caching**: Load once into module-level state for the Celery worker process lifetime. Refresh every 24 hours (simple `time.time()` check at call time).

### Generator Response to Frontend

The existing `GET /api/v1/workflows/generate/status/{task_id}` endpoint returns status + result via the `WorkflowGenerateStatusResponse` Pydantic model. Add `validationError` and `hint` fields to this model (Pydantic v2 syntax):

```python
class WorkflowGenerateStatusResponse(BaseModel):
    status: str  # "pending" | "running" | "completed" | "failed"
    result: dict | None = None
    error: str | None = None
    validationError: str | None = None   # NEW: specific validation message
    hint: str | None = None              # NEW: user-facing corrective hint
```

The `failed` case now returns:
```json
{
  "status": "failed",
  "error": "Workflow generation failed after 3 attempts.",
  "validationError": "Workflow must have at least one trigger node. Known triggers: [...]",
  "hint": "Try describing when the workflow should start (e.g., 'every morning at 7 AM' or 'when a webhook is received')."
}
```

The `hint` is derived from the validation error type:
- No trigger node → hint about describing a trigger event/schedule
- Unknown `nodeType` → hint to be more specific about what tools/apps are involved
- Invalid edge references → hint to simplify the workflow description

The `AutoCreateWorkflowModal` in the frontend reads `validationError` and `hint` from the status response when `status === "failed"` and renders them as structured error UI (not just a generic "generation failed" message).

---

## Section 8: Testing Plan

### Unit Tests (Python)

File: `python-backend/tests/test_workflow_validator.py`

Test cases for `GeneratedWorkflow` Pydantic model:
- Valid minimal workflow (trigger + one action) passes validation
- Workflow with no trigger node raises `ValidationError` with "no trigger" in message
- Workflow with edge referencing non-existent node ID raises `ValidationError`
- Workflow with hallucinated `nodeType` (not in registry) raises `ValidationError`
- Workflow with valid parallel branches (multiple incoming edges to `join` node) passes

File: `python-backend/tests/test_workflow_generator.py` (extend existing)

Test cases for the retry loop:
- First attempt succeeds → result returned, no retries
- First attempt fails validation, second succeeds → result returned after 1 retry
- All 3 attempts fail → `WorkflowGenerationError` raised with final error details

### Unit Tests (TypeScript)

File: `apps/web/server/lib/__tests__/workflowSvgGenerator.test.ts`

Test cases for `generateWorkflowSvg`:
- Empty workflow (0 nodes) → returns valid SVG string
- Single trigger node → SVG contains the node label
- Linear workflow (A → B → C) → SVG contains 3 node rects and 2 arrows
- Parallel workflow (A → B, A → C, B → D, C → D) → SVG renders without errors
- Node with unknown `nodeType` → falls back to gray color

### Unit Tests (TypeScript — tRPC Endpoints)

File: `apps/web/server/routers/__tests__/workflowTemplates.test.ts`

- `listTemplates` returns only `isPublic = true` and `status = 'published'` templates
- `listTemplates` with category filter returns only templates in that category
- `listTemplates` with search query uses `searchVector` (mock DB to verify FTS syntax)
- `listTemplates` response does NOT include `workflowJson` or `previewSvg` fields
- `listTemplateCategories` returns all 15 categories with correct counts
- `getTemplate` returns full record including `workflowJson` and `previewSvg`
- `useTemplate` creates a new workflow row with caller's `userId` and `tenantId`
- `useTemplate` increments `downloadCount` on the source template

### Unit Tests (TypeScript — Gallery Components)

File: `apps/web/client/src/components/workflow/__tests__/GalleryTemplateCard.test.tsx`

- Renders template name, description (truncated), category badge, step count
- "Preview" button click fires `onSelect` callback with template ID
- Category badge color matches expected color for each category

File: `apps/web/client/src/components/workflow/__tests__/GalleryDetailDrawer.test.tsx`

- Renders skeleton while loading
- Renders SVG as `<img>` tag with `data:image/svg+xml;base64,...` src (not dangerouslySetInnerHTML)
- "Use This Template" button shows loading spinner during mutation
- On successful mutation: drawer closes, toast shown, navigate called

### Integration Test (Seeder)

File: `scripts/__tests__/seedWorkflowTemplates.test.ts`

- All 60 JSON files parse without error
- All 60 templates have `type: "workflow"` (not `"workflowNode"`) on all nodes
- All 60 templates pass `WorkflowJson` TypeScript type validation
- Seeder inserts exactly 60 rows into `workflowTemplates`
- Re-running seeder updates existing rows (idempotency check: row count remains 60)
- All 60 templates have a non-empty `previewSvg` after seeding

### E2E Test

File: `apps/web/client/src/pages/__tests__/WorkflowGallery.e2e.ts` (Vitest or Playwright)

**Prerequisite**: The seeder must have run successfully before E2E tests execute. Add a `beforeAll` hook that either runs the seeder or verifies that templates already exist in the test DB (`SELECT count(*) FROM "workflowTemplates" WHERE "isPublic" = true` must return 60).

- Gallery page renders 24 cards on initial load (loading skeletons visible briefly, then cards)
- Category filter "IT & DevOps" shows exactly 4 cards
- Search for "sales" returns cards containing "sales" in name or description
- Opening detail drawer: SVG renders as `<img>` (not raw SVG), node badges visible
- "Use This Template" creates a new workflow and redirects to editor
- Empty search result shows empty state message, not an error

---

## Appendix A: 15 Category Names

1. Sales & Marketing
2. HR & People
3. Finance & Accounting
4. IT & DevOps
5. Healthcare
6. Education
7. Government & Public
8. Personal Productivity
9. Real Estate
10. Logistics & Supply Chain
11. Content & Media
12. Food & Restaurant
13. Legal & Compliance
14. Customer Service
15. AI & Automation

---

## Appendix B: Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| SVG generator produces malformed SVG for complex workflows | Medium | Unit tests with parallel/loop topologies; fallback to simple list layout if topology fails. Loop nodes (which create cycles) — strip back-edges and render as DAG for preview purposes |
| 60 JSON files contain inconsistent schema (field typos, wrong types) | Medium | Seeder validates each file before upsert; logs error and continues (doesn't abort); summary shows all failures |
| AI generator few-shot examples too large for context window | Low | 3000-token hard cap on all examples; truncate config fields first; fall back to 3 examples if needed |
| `workflowTemplates` table doesn't exist yet (if feature 017 runs before prior features) | Low | Seeder checks table existence before inserting; schema.ts extension runs first |
| `previewSvg` column too large for some DB row limits | Very Low | SVG content for a 10-node workflow is ~3KB; within PostgreSQL's text column limits |
| Large workflows (15+ nodes) produce unreadable SVG at 800×400 | Low | SVG generator scales down proportionally — topology visibility > label readability for a preview |
| `authorId NOT NULL` prevents system template seeding | Medium | Seeder creates/finds a system user on first run (Step 1 in Section 4); fail fast if users table is inaccessible |

### TemplateBrowser vs. WorkflowGallery — UX Relationship

These are two distinct, complementary UI surfaces:

- **`TemplateBrowser`** (exists): A quick-access modal inside the workflow editor. Lets users load a template without leaving the editor. Not replaced by this feature — it continues to exist as is.
- **`WorkflowGallery`** (new): A standalone page at `/workflows/gallery`. Provides full browse/discover UX with filtering, search, category sidebar, and SVG preview. Intended for users who want to explore templates before creating a workflow.

Both query the same `workflowTemplates` table. The Gallery page is additive — it does not remove or change the TemplateBrowser.

---

## Appendix C: Dependency Order

Implementation must proceed in this order to avoid dependency conflicts:

1. Schema extension (Section 1) → `pnpm db:push`
2. SVG generator utility (Section 2) — needed by seeder
3. Template JSON files (Section 3) — content to be seeded
4. Seeder script (Section 4) — depends on 1, 2, 3
5. tRPC endpoints (Section 5) — depends on 1 (new columns queryable)
6. Gallery page (Section 6) — depends on 5
7. Pydantic validator (Section 7, part A) — independent
8. Generator retry loop (Section 7, part B) — depends on 7A
9. Few-shot loading (Section 7, part C) — depends on seeded data (4)
10. Tests (Section 8) — validates everything
