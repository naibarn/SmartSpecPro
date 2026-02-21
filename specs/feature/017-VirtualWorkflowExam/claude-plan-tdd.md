# TDD Plan — Feature 017: Virtual Workflow Examples

## Testing Context

**Existing codebase testing setup (from research):**
- **Python**: pytest with `@pytest.mark.asyncio`, markers: `unit`, `integration`, `slow`. 80% coverage enforced. Test files in `python-backend/tests/`. Fixtures in `conftest.py`.
- **TypeScript**: Vitest. Test files adjacent to source (`__tests__/` subdirs or `*.test.ts` co-located). `pnpm test` to run.
- **Coverage minimum**: 80% (enforced in CI for Python; enforced for TypeScript via `pnpm test:coverage`).

**TDD order**: Write failing test → implement → verify test passes. Do not skip the failing-first step.

---

## Section 1: Database Schema Extension

Write these before touching `drizzle/schema.ts`:

```typescript
// Test (apps/web/drizzle/__tests__/schema.test.ts):
// - workflowTemplates table definition includes 'previewSvg' text column
// - workflowTemplates table definition includes 'industry' json column typed string[]
// - workflowTemplates table definition includes 'stepCount' integer column
// - workflowTemplates table definition includes 'estimatedSetupMinutes' integer column
// - workflowTemplates table definition includes 'templateKey' varchar(50) with unique constraint
// - 'tags' column already exists — no duplicate definition
// - 'downloadCount' column already exists — 'usageCount' does NOT appear in schema
```

**Note**: These are static type/schema introspection tests — verify the Drizzle schema definition, not DB state. The schema.ts change is low-risk (nullable columns) so these can be minimal smoke checks.

---

## Section 2: SVG Diagram Generator Utility

Write these before implementing `workflowSvgGenerator.ts`:

```typescript
// File: apps/web/server/lib/__tests__/workflowSvgGenerator.test.ts

// Unit tests:
// - generateWorkflowSvg({nodes: [], edges: []}) returns a valid SVG string (starts with '<svg')
// - Single trigger node → SVG contains the node's label text
// - Linear workflow A→B→C → SVG contains 3 node rectangles and 2 path/arrow elements
// - Parallel workflow A→B, A→C, B→D, C→D → renders without throwing, contains 4 rects
// - Node with unknown nodeType → falls back to gray fill (#6B7280)
// - schedule_trigger nodeType → uses green fill (#10B981)
// - llm_call nodeType → uses blue fill (#3B82F6)
// - conditional nodeType → uses purple fill (#8B5CF6)
// - Loop workflow (cycle in edges) → does not throw; strips back-edge, renders as DAG
// - Node label longer than 18 chars → label is truncated in SVG output
// - generateWorkflowSvg output passes DOMParser SVG parse (no malformed XML)
```

---

## Section 3: Template JSON Files (60 Files)

Write these before creating any `.json` files:

```typescript
// File: specs/feature/017-VirtualWorkflowExam/__tests__/templateFiles.test.ts

// For each file in templates/tpl-*.json (parameterized test):
// - File parses as valid JSON
// - Has required top-level keys: id, name, description, category, industry, tags,
//   stepCount, estimatedSetupMinutes, workflowJson
// - workflowJson.nodes is a non-empty array
// - workflowJson.edges is an array (may be empty for single-node)
// - Every node has type === "workflow" (not "workflowNode" or anything else)
// - Every node has data.nodeType in the set of 57 known node types
// - Every edge.source and edge.target reference an existing node.id
// - At least one node has a trigger nodeType
// - stepCount === workflowJson.nodes.length
// - category matches one of the 15 defined category names
// - No node config value contains a real-looking API key (regex: /[A-Za-z0-9]{32,}/)
```

---

## Section 4: Seeder Script

Write these before implementing `seed-workflow-templates.ts`:

```typescript
// File: scripts/__tests__/seedWorkflowTemplates.test.ts

// Integration tests (require DB):
// - Seeder creates system user if system@smartspecpro.internal doesn't exist
// - Seeder reuses existing system user on subsequent runs (no duplicate user)
// - Seeder seeds all 15 templateCategories before any template insert
// - categoryId is a valid FK (every template row has categoryId matching a templateCategories row)
// - After first run: exactly 60 rows in workflowTemplates with isPublic=true, status='published'
// - After second run (re-seed): row count remains exactly 60 (idempotency)
// - After second run: a modified template JSON is reflected in the updated row (upsert works)
// - Every seeded template has templateKey set and unique
// - Every seeded template has authorId === systemUser.id (not null)
// - SVG generation failure (malformed template) → script logs warning, continues, doesn't abort
// - All seeded templates have non-null previewSvg (for templates that generated successfully)
// - Script exits with code 0 on complete success, code 1 on DB connection failure
```

---

## Section 5: tRPC Endpoints for Gallery

Write these before implementing the procedures in `workflow.ts`:

```typescript
// File: apps/web/server/routers/__tests__/workflowTemplates.test.ts

// listTemplates:
// - Returns only templates with isPublic=true AND status='published'
// - Respects limit/offset pagination (default limit=24)
// - Category filter: only returns templates in that category
// - Search: uses searchVector FTS, not ILIKE (verify SQL via Drizzle query builder)
// - Response objects do NOT contain workflowJson field
// - Response objects do NOT contain previewSvg field
// - Returns total count alongside items

// listTemplateCategories:
// - Returns all 15 categories (after seeding)
// - Each category entry has: id, name, templateCount
// - templateCount is 0 for categories with no published public templates
// - Total templateCount across all categories equals total published public templates

// getTemplate:
// - Returns full template record including workflowJson and previewSvg
// - Returns 404 (tRPC NOT_FOUND) for non-existent id
// - Requires authentication (unauthenticated call throws UNAUTHORIZED)

// useTemplate:
// - Creates a new row in workflows with status='draft'
// - New workflow has caller's userId and tenantId
// - New workflow workflowJson matches the template's workflowJson
// - Increments downloadCount on the source template (not usageCount)
// - Returns the new workflow's id
// - Requires authentication
```

---

## Section 6: Gallery Page (Frontend)

Write these before implementing the React components:

```typescript
// File: apps/web/client/src/components/workflow/__tests__/GalleryTemplateCard.test.tsx

// GalleryTemplateCard:
// - Renders template name in bold
// - Renders truncated description (2-line clamp)
// - Renders category badge with correct color for category
// - Renders stepCount as "{N} steps"
// - Renders up to 3 industry tags (4th+ tags not rendered)
// - Clicking card fires onSelect callback with template id
// - Clicking "Preview" button fires onSelect callback with template id

// File: apps/web/client/src/components/workflow/__tests__/GalleryDetailDrawer.test.tsx

// GalleryDetailDrawer (when closed):
// - Does not render sheet content

// GalleryDetailDrawer (when open, loading):
// - Renders Skeleton placeholder components while getTemplate query is loading

// GalleryDetailDrawer (when open, loaded):
// - Renders SVG as <img> with src starting "data:image/svg+xml;base64,"
// - Does NOT render dangerouslySetInnerHTML for SVG
// - Renders node type badges for each unique nodeType in workflowJson.nodes
// - "Use This Template" button is present and enabled
// - Clicking "Use This Template" calls useTemplate mutation with correct templateId
// - During mutation: button shows loading spinner, is disabled
// - On mutation success: onClose callback called, navigate to /workflow/{id}

// File: apps/web/client/src/pages/__tests__/WorkflowGallery.test.tsx

// WorkflowGallery page:
// - Renders 24 skeleton cards while listTemplates is loading
// - Renders template cards once query resolves
// - Shows error state message when listTemplates query fails
// - Shows empty state message when query returns 0 results
// - Clicking a category in sidebar updates filter state
// - Search input is debounced (test with timer mocks)
```

---

## Section 7: Enhanced AI Workflow Generator (Python)

Write these before implementing the validator or retry loop:

```python
# File: python-backend/tests/test_workflow_validator.py
# (use @pytest.mark.unit)

# GeneratedWorkflow model:
# - Valid workflow with trigger + one action → passes validation
# - Workflow with zero nodes → raises ValidationError
# - Workflow with nodes but no trigger nodeType → raises ValidationError mentioning "trigger"
# - Workflow with hallucinated nodeType (e.g. "fake_node") → raises ValidationError mentioning the bad type
# - Workflow with edge referencing non-existent source id → raises ValidationError
# - Workflow with edge referencing non-existent target id → raises ValidationError
# - Workflow with parallel branches (2 sources, join) → passes validation
# - Node with type "workflow" → accepted (correct type)
# - Node with type "workflowNode" → still parsed (Pydantic doesn't validate type string against enum),
#   but tests must confirm validator doesn't break on it (type field is informational for ReactFlow)

# WorkflowGenerateStatusResponse model:
# - Model includes validationError field (Optional[str], defaults to None)
# - Model includes hint field (Optional[str], defaults to None)
# - Model serializes with validationError=None when not set
```

```python
# File: python-backend/tests/test_workflow_generator.py (extend existing)
# (use @pytest.mark.unit with mocked LLM calls)

# Retry loop:
# - First attempt returns valid JSON → workflow returned, LLM called exactly once
# - First attempt fails validation, second returns valid JSON → returned, LLM called twice
# - All 3 attempts fail → WorkflowGenerationError raised
# - WorkflowGenerationError includes validationError message and hint
# - Each retry prompt includes the previous ValidationError message
# - Celery task decorator sets max_retries=0 (verify via task.max_retries attribute)

# Few-shot examples:
# - Module-level cache is populated after first call
# - Cache is NOT refreshed if less than 24 hours since last load
# - Cache IS refreshed if 24+ hours since last load
# - Total token count of examples ≤ 3000 (using token estimator)
# - Built-in hardcoded examples are removed from system prompt when curated ones are loaded
```

---

## Section 8: Testing Plan (Meta-tests)

The testing section itself describes what tests to write — the above stubs ARE those tests. For completeness, these integration/E2E level checks should be run after everything is implemented:

```typescript
// E2E prerequisite check (beforeAll):
// - Query DB: SELECT count(*) FROM workflowTemplates WHERE isPublic=true → must be 60

// E2E gallery flow:
// - Navigate to /workflows/gallery → 24 cards visible
// - Category sidebar shows 15 categories with non-zero counts
// - Click "IT & DevOps" → 4 cards visible
// - Type "daily sales" in search → cards filter in real-time (after debounce)
// - Click any card → drawer opens, SVG rendered as <img>
// - Click "Use This Template" → redirected to /workflow/{id}
// - Verify new workflow exists in DB with correct workflowJson

// E2E AI generation (with validation failure):
// - Send prompt that will fail validation (mock LLM to return invalid JSON 3 times)
// - UI shows validationError and hint text after 3 failed attempts
// - "Try rephrasing" link visible in error state
```
