<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-schema-extension
section-02-svg-generator
section-03-template-json-files
section-04-seeder-script
section-05-trpc-endpoints
section-06-gallery-frontend
section-07-python-validator
section-08-python-generator
END_MANIFEST -->

# Implementation Sections Index — Feature 017: Virtual Workflow Examples

This feature is a mixed TypeScript + Python implementation. The primary test command is `pnpm test` (Vitest, TypeScript sections). Python sections use `cd python-backend && uv run pytest -m unit`.

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-schema-extension | — | 04, 05 | Yes (foundation) |
| section-02-svg-generator | — | 04 | Yes (independent utility) |
| section-03-template-json-files | — | 04 | Yes (content files only) |
| section-04-seeder-script | 01, 02, 03 | 05c (few-shot), 08c | No |
| section-05-trpc-endpoints | 01 | 06 | No |
| section-06-gallery-frontend | 05 | — | No |
| section-07-python-validator | — | 08 | Yes (independent) |
| section-08-python-generator | 07, 04 | — | No |

## Execution Order

1. **section-01, section-02, section-03, section-07** — no dependencies, fully parallel
2. **section-04, section-05** — after section-01; section-04 also needs 02 + 03
3. **section-06** — after section-05
4. **section-08** — after section-07 + section-04 (needs seeded data for few-shot)

**Optimal batching:**
- Batch 1 (parallel): section-01, section-02, section-03, section-07
- Batch 2 (serial after batch 1): section-04
- Batch 3 (parallel after section-01): section-05
- Batch 4 (serial): section-06
- Batch 5 (serial): section-08

## Section Summaries

### section-01-schema-extension
Extend `apps/web/drizzle/schema.ts` with 5 new columns on `workflowTemplates` (`previewSvg`, `industry`, `stepCount`, `estimatedSetupMinutes`, `templateKey` unique). Run `pnpm db:push`. Includes the mandatory DB safety protocol backup steps.

### section-02-svg-generator
Create `apps/web/server/lib/workflowSvgGenerator.ts` — a pure TypeScript function `generateWorkflowSvg(workflowJson)` that produces a compact SVG topology diagram via topological sort + left-to-right layout. Includes color map by node category and unit tests.

### section-03-template-json-files
Create all 60 template JSON files in `specs/feature/017-VirtualWorkflowExam/templates/`. Each file: `tpl-NNN-kebab-slug.json` with realistic configs, correct `type: "workflow"` on all nodes, `templateKey` field, and valid node topology. Includes a parameterized validation test suite that verifies all 60 files.

### section-04-seeder-script
Create `scripts/seed-workflow-templates.ts` — an idempotent TypeScript seeder that: (1) seeds 15 `templateCategories`, (2) creates/finds the system user, (3) upserts all 60 templates with generated SVGs. Uses `templateKey` as the upsert conflict target. Per-template try/catch with 10s SVG timeout. Integration tests for idempotency.

### section-05-trpc-endpoints
Add `workflow.listTemplates`, `workflow.listTemplateCategories`, `workflow.getTemplate`, and `workflow.useTemplate` procedures to `apps/web/server/routers/workflow.ts`. Implements FTS via `searchVector`, excludes `previewSvg`/`workflowJson` from list response, increments `downloadCount` on use. Includes tRPC unit tests.

### section-06-gallery-frontend
Create the `WorkflowGallery` page and supporting components (`GalleryTemplateCard`, `GalleryDetailDrawer`, `GalleryCategories`). Add `/workflows/gallery` route in Wouter. SVG rendered as `<img data:image/svg+xml;base64,...>` (not dangerouslySetInnerHTML). Loading/error/empty states. Navigation link. Component unit tests and E2E test.

### section-07-python-validator
Create `python-backend/app/orchestrator/workflow_validator.py` with Pydantic v2 models (`NodeData`, `WorkflowNode`, `WorkflowEdge`, `GeneratedWorkflow`). Hardcoded set of 57 known node types (no NodeRegistry import). Three `@model_validator` checks: trigger presence, edge ID references, known node types. Adds `validationError`/`hint` fields to `WorkflowGenerateStatusResponse`. Unit tests.

### section-08-python-generator
Enhance `python-backend/app/orchestrator/workflow_generator.py`: (1) replace single LLM call with 3-attempt retry loop using `GeneratedWorkflow.model_validate()` + `max_retries=0` at Celery level, (2) add few-shot examples from DB (5 static templates, 3000-token cap, replaces built-in examples). Update `AutoCreateWorkflowModal` to display `validationError` + `hint` on failure. Unit tests for retry logic and few-shot caching.
