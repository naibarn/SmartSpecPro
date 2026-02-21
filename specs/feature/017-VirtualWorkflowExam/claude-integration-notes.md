# Integration Notes — Feature 017 Opus Review

## What I'm Integrating (and Why)

### BLOCKER — Fixed
**authorId NOT NULL constraint**: Plan incorrectly assumed `authorId` could be null. Actual schema has `NOT NULL`. Fix: seeder must create/find a "system" user first and use its ID.

**node.type "workflowNode" → "workflow"**: All template JSON examples and Pydantic validator were using `"workflowNode"` but the actual ReactFlow registration and WorkflowGenerator use `"workflow"`. Fixed throughout.

**Pydantic V2 API**: `@validator` → `@field_validator`, `values` → `info.data`, `.dict()` → `.model_dump()`. Critical since the project uses Pydantic v2.

**categoryId FK vs string category**: The `workflowTemplates` table uses `categoryId` (FK to `templateCategories`), not a string category column. Plan must seed `templateCategories` first and map category names to IDs. Added as a step before template seeding.

**usageCount → downloadCount**: The existing column is `downloadCount`, not `usageCount`.

**SVG dangerouslySetInnerHTML XSS risk**: Added DOMPurify sanitization step before rendering SVG. Use `<img src="data:image/svg+xml;base64,...">` pattern instead of direct innerHTML injection.

### HIGH — Fixed
**templateKey**: Made the decision clear — add `templateKey varchar(50) unique` to schema as the conflict target. No ambiguity.

**validationError + hint fields**: Added to `WorkflowGenerateStatusResponse` Pydantic model explicitly.

**Celery retry interaction**: Clarified that application-level retry loop sets `max_retries=0` at the Celery level to prevent double-retrying.

**previewSvg in list vs detail**: Removed previewSvg from `listTemplates` response — only returned by `getTemplate`. Saves ~200KB per page load.

**Few-shot token budget**: Added 3000-token budget cap. Clarified that few-shot examples REPLACE (not add to) the 3 built-in examples in the system prompt. Static selection strategy (one per category) explicitly chosen over semantic search.

### MEDIUM — Fixed
**searchVector**: Plan now notes to use PostgreSQL's `searchVector` tsvector column (already exists in schema) for full-text search instead of ILIKE.

**templateCategories seeding**: Added explicit step to seed 15 categories before seeding templates.

**NodeRegistry in validator**: Use hardcoded set of 57 known node types (built from spec) rather than importing NodeRegistry at validation time to avoid circular dependencies.

**Loading/error states**: Added to Gallery section — skeletons, empty state, error state.

**Category counts**: Clarified that a separate `listTemplateCategories` query with grouped counts is added, returned alongside the list.

### LOW — Fixed
**Database Safety Protocol**: Added backup/verify steps to Section 1.

**TemplateBrowser relationship**: Clarified that WorkflowGallery is a standalone page; TemplateBrowser remains as a quick-access modal inside the editor. They serve different UX contexts.

**Component unit tests**: Added specifications for tRPC endpoint tests and Gallery component tests.

**E2E test setup**: Added seeder prerequisite to E2E test description.

## What I'm NOT Integrating (and Why)

**SVG generator: cycle handling detail (loop/retry nodes)**: The reviewer is right that loops create cycles, but for a visual preview SVG, a simple fallback (strip back-edges, render as DAG) is acceptable. Users don't need to see loop cycles in the preview — they see the graph in the actual editor. The "strip back-edges and render as DAG" approach is already implied by the algorithm; I'll add a note but not redesign the algorithm.

**SVG canvas size concern (800x400)**: For a preview SVG, readability of labels matters less than topology visibility. Will add a note that large workflows (15+ nodes) scale down proportionally and labels truncate earlier. The SVG is a preview, not a full editor canvas.

**parentId group nodes in SVG**: Template JSON files will be authored without loop groups for simplicity. Templates using `loop` nodes will not nest child nodes inside group containers. This keeps template authoring simple.

**Template deletion on re-seed**: Explicitly out of scope. Old templates persist if removed from JSON files. Manual admin deletion is the process. This is correct for v1.

**searchVector utilization**: Actually integrating this (changed to use it). The column already exists — use it properly.

**Seeder timeout per template**: Added a simple try/catch with error logging per template and a 10-second timeout for SVG generation. Seeder logs errors and continues (doesn't abort on one bad template).
