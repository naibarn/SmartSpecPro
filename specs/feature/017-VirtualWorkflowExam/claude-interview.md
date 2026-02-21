# Interview Transcript — Feature 017: Virtual Workflow Examples

Date: 2026-02-20

---

## Q1: What exactly should Feature 017 build ON TOP of what already exists?

**Context:** The codebase already has `workflowTemplates` table, `TemplateBrowser` component, and `AutoCreateWorkflowModal` for NL generation.

**Answer:** Populate the template library with the 60 example workflows from spec.md.

**Notes:** Primary deliverable is filling the existing infrastructure with real, curated content (all 60 use cases). The existing `TemplateBrowser` is the starting point, but the gallery UX also needs to be upgraded (see Q6).

---

## Q2: Should template workflow JSONs contain realistic placeholder configs or just node topology?

**Answer:** Full realistic configs with illustrative values (Recommended).

**Notes:** Pre-fill fields with example values that show users what to configure — makes templates immediately useful and educational. Example: llm_call node should have an example prompt, schedule_trigger should have a real cron expression, database_query should have an example SQL query. No real credentials — use `{{env.DATABASE_URL}}` or descriptive placeholders like `"SELECT * FROM orders WHERE created_at > {{yesterday}}"`.

---

## Q3: Should the AI workflow generation (LLM → workflow JSON) be enhanced?

**Answer:** Yes — both few-shot examples AND validation pipeline.

**Notes:** Most comprehensive improvement. The 60 curated examples become both a template library for users AND training examples for the generator. Two sub-tasks:
1. Feed curated examples as few-shot context to `WorkflowGenerator`
2. Add Pydantic validation with auto-retry when LLM generates invalid JSON

---

## Q4: How should the 60 example templates be seeded into the database?

**Answer:** JSON files + a loader script.

**Notes:**
- 60 individual `.json` files stored in `specs/feature/017-VirtualWorkflowExam/templates/`
- A loader script (TypeScript or Python) reads the JSON files and upserts into `workflowTemplates` table
- Idempotent — re-running the loader does not create duplicates
- JSON files serve as the canonical source of truth and can be version-controlled

---

## Q5: What category taxonomy should be used for the 60 templates?

**Answer:** Hybrid: spec groups + n8n categories mapped together.

**Notes:** Map the 15 spec.md groups (A–O) to n8n-style category names:
- A (Business/Sales/Marketing) → "Sales & Marketing"
- B (HR) → "HR & People"
- C (Finance) → "Finance & Accounting"
- D (IT/DevOps) → "IT & DevOps"
- E (Healthcare) → "Healthcare"
- F (Education) → "Education"
- G (Government) → "Government & Public"
- H (Personal) → "Personal Productivity"
- I (Real Estate) → "Real Estate"
- J (Logistics) → "Logistics & Supply Chain"
- K (Content/Media) → "Content & Media"
- L (Restaurant/Food) → "Food & Restaurant"
- M (Legal/Compliance) → "Legal & Compliance"
- N (Customer Service) → "Customer Service"
- O (Advanced) → split between applicable categories + "AI & Automation"

---

## Q6: Should Feature 017 include new UI work beyond TemplateBrowser?

**Answer:** Full new Gallery page with preview, node diagram, and one-click import.

**Components:**
- Dedicated Gallery route (`/workflows/gallery` or similar)
- Category sidebar/filter bar
- Template card grid (name, description, category, step count, industry tags)
- Template detail drawer/modal with:
  - Full description and use case
  - Node topology SVG diagram
  - Node type list (as badges)
  - "Use This Template" button → loads into editor

---

## Q7: Where should validation errors be surfaced for the AI generation pipeline?

**Answer:** Show validation error details when retries exhausted.

**Notes:**
- Auto-retry silently up to 3 attempts
- On each retry, include the specific validation error in the re-prompt
- Only surface error to user after all 3 retries fail
- Error message should show: which field was invalid, what was expected, and a "Try rephrasing your description" hint

---

## Q8: What fidelity for node diagram preview in Gallery?

**Answer:** Static SVG/image showing node topology (generated from JSON).

**Notes:**
- Lightweight, fast page loads — not a full ReactFlow canvas
- Generated at seed time (see Q10), not at runtime
- Shows: node boxes with labels, directional arrows for connections
- Color-coded by node category (AI = blue, Flow = purple, Data = orange, etc.)

---

## Q9: Access control requirements for template gallery?

**Answer:** All authenticated users can view and use all 60 templates.

**Notes:** Simple auth check — any logged-in user sees all 60 templates. No tenant-scoping, no approval workflow needed for this feature. The 60 templates are "system" templates (tenantId = null or a special system tenant ID).

---

## Q10: Do all 60 templates need to be created now?

**Answer:** Create all 60 templates in one go.

**Notes:** Deliver the complete library as part of this feature. All 60 use cases from spec.md should have corresponding `.json` files.

---

## Q11: Should the SVG node diagram be generated at seed time or on-the-fly?

**Answer:** Generated at seed time and stored as SVG string in the template record.

**Notes:**
- The loader script generates the SVG from the workflow JSON during seeding
- SVG is stored in a `previewSvg` column on `workflowTemplates`
- No runtime cost for the gallery page
- SVG is regenerated when templates are re-seeded (idempotent)
- A utility function `generateWorkflowSvg(workflowJson)` will be needed

---

## Summary of Decisions

| Decision | Choice |
|---|---|
| Primary scope | Seed all 60 templates + new Gallery page + enhanced AI generator |
| Template content | Full realistic configs with illustrative values |
| Seeding method | JSON files + loader script (idempotent) |
| Template storage | `workflowTemplates` table, system-level (not tenant-scoped) |
| Category taxonomy | Hybrid: spec groups mapped to n8n-style names (15 categories) |
| Gallery UI | Full new page: filter sidebar + card grid + detail drawer with SVG diagram |
| Diagram preview | Static SVG generated at seed time, stored in `previewSvg` column |
| AI generator | Few-shot examples from curated templates + Pydantic validation + 3x retry |
| Validation error UX | Silent retry 3x, show detailed error only on final failure |
| Access control | All authenticated users see all 60 templates |
| Rollout | All 60 templates in Feature 017 |
