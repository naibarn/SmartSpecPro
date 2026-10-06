## Section 02: Long-Form Block Family and Slot Budget Schemas

### Goal

Add text-heavy layouts that are intentionally designed for dense content.

### Scope

- define long-form component recipes
- define slot budget metadata for all recipes
- establish compact-vs-long-form family boundaries

### Deliverables

- at least one long-form recipe family end-to-end
- slot budget schema
- recipe metadata for fit engine consumption

### Key Decisions

- long-form recipes must still be editable and component-based
- they should not be treated as fallback hacks; they are first-class layouts

### As-Built

- Status:
  - implemented
- Files changed:
  - `apps/web/shared/presentation/contentProfile.ts`
  - `apps/web/shared/presentation/componentRecipes.ts`
  - `apps/web/shared/presentation/componentRecipes.test.ts`
  - `apps/web/shared/presentation/componentRecipeSlotBindings.ts`
  - `apps/web/server/services/aiPresentationComponentRecipes.ts`
  - `apps/web/server/services/aiPresentationService.ts`
  - `apps/web/server/services/__tests__/aiPresentationLayoutEngine.test.ts`
  - `apps/web/server/services/__tests__/aiPresentationService.test.ts`
  - `apps/web/client/src/lib/presentationComponentCatalog.ts`
  - `apps/web/client/src/lib/presentationBlockPresets.ts`
  - `apps/web/client/src/pages/PresentationEditor.tsx`
- What shipped:
  - added the first long-form component recipe, `sectioned-explainer`, as a first-class built-in component across shared metadata, server builders, and editor catalog surfaces
  - introduced shared layout-family metadata and slot-budget metadata so recipes can declare whether they are `structured` or `long_form` and expose bounded text expectations per slot
  - wired `Draft with AI` routing to recognize dense multi-section slides and route them into `sectioned-explainer` while keeping compact recipes alive for timeline, stat, framework, and quote/process cases
  - added manual insert support for the new long-form block in the block library and AI override label mapping in the editor
  - tightened content-profile density sensitivity enough for long-form candidates to surface earlier without letting `sectioned-explainer` steal compact metric/timeline/framework slides
- Tests added or updated:
  - `apps/web/shared/presentation/componentRecipes.test.ts`
  - `apps/web/shared/presentation/contentProfile.test.ts`
  - `apps/web/server/services/__tests__/aiPresentationLayoutEngine.test.ts`
  - `apps/web/server/services/__tests__/aiPresentationService.test.ts`
- Deviations from plan:
  - only the first long-form family (`sectioned-explainer`) shipped in this section; `article-focus` and `profile-board` remain planned follow-ups rather than part of the initial implementation slice
  - the slot-budget metadata is introduced now, but Section 03 still needs to consume it more deeply for recipe-aware compaction and fit scoring
- Follow-ups for later sections:
  - replace narrative truncation-only behavior with LLM compaction that targets these long-form slot budgets directly
  - unify relayout recipe selection with the same compact-vs-long-form routing rules used in Draft with AI

#### Follow-up: article-focus & profile-board recipes (2026-03-14)

- **article-focus**: Single-heading narrative layout with left-side flowing article (eyebrow, title, lead, body, footnote) and right-side key-points card. Slot budgets: body 1200 chars / 12 lines, key-points 5 items. Layout family: `long_form`.
- **profile-board**: Structured bio/resume with portrait, name/role header, bio section, and 3-column bottom (experience, skills, contact). Slot budgets: bio-body 600 chars / 6 lines, experience-items 4, skills-items 6, contact-items 4. Layout family: `long_form`.
- Files touched:
  - `shared/presentation/componentRecipes.ts` — AI guidance, slot budgets, slot targets, media slots, frame styles
  - `shared/presentation/componentRecipeSlotBindings.ts` — `createArticleFocusSlotBindings`, `createProfileBoardSlotBindings`
  - `server/services/aiPresentationComponentRecipes.ts` — local binding wrappers + `buildArticleFocusFallback`, `buildProfileBoardFallback` + switch cases
  - `client/src/lib/presentationComponentCatalog.ts` — builder functions, slot definitions, preview SVGs, catalog entries
  - `client/src/lib/presentationBlockPresets.ts` — presets for editor block library
