## Section 01: Content Profiler and Mode Router Foundation

### Goal

Create a shared content-profile object and the first version of a mode router.

### Scope

- derive content profile from markdown/narrative
- measure headings, paragraphs, bullets, sections, text density
- infer semantic signals
- output candidate layout modes with reasons

### Deliverables

- shared content profile schema
- initial mode router
- tests for Thai long-form and section-heavy content
- provider/cost guardrail inputs to routing
- source paragraph/section identifiers in the profile
- deck-level consistency inputs

### Key Decisions

- profile should be shared between server routing and future editor explanation surfaces
- profile should remain deterministic and not depend on LLM
- routing must consider provider capability and user mode locks before mode selection finalizes
- routing should not optimize each slide independently if that makes the deck visually incoherent

### As-Built

- Status:
  - implemented
- Files changed:
  - `apps/web/shared/presentation/contentProfile.ts`
  - `apps/web/shared/presentation/contentProfile.test.ts`
  - `apps/web/shared/presentation/contracts.ts`
  - `apps/web/shared/presentation/contracts.test.ts`
  - `apps/web/shared/presentation/normalizers.ts`
  - `apps/web/server/services/aiPresentationService.ts`
  - `apps/web/server/services/__tests__/aiPresentationService.test.ts`
- What shipped:
  - added a shared deterministic content-profile builder that derives paragraph ids, section ids, text density, bullet counts, and semantic signals from AI slide narrative
  - added an initial shared layout-mode router that ranks `structured_block`, `long_form_block`, `llm_layout_dsl`, and `full_slide_media` with deck-consistency penalties and feature-gate blockers
  - extended persisted `slideContent.aiDesign` to accept v1 routing metadata such as `schemaVersion`, `mode`, `candidateModes`, `fitScore`, `sourceTrace`, `fallbackHistory`, and `mediaModeMetadata`
  - wired Draft with AI generation to persist `mode` and `candidateModes` in `aiDesign`
  - added a targeted guard so dense long-form prose stops auto-selecting compact component recipes, while short structured slides keep existing compact recipe behavior
- Tests added or updated:
  - `apps/web/shared/presentation/contentProfile.test.ts`
  - `apps/web/shared/presentation/contracts.test.ts`
  - `apps/web/server/services/__tests__/aiPresentationService.test.ts`
- Deviations from plan:
  - long-form, DSL, and full-slide-media remain metadata-first in this section; the router records and ranks them, but only `structured_block` is currently enabled in live routing until later sections implement those render paths
  - mode-lock conflict handling remains schema-ready but not yet surfaced in editor UX; that work stays in later sections
- Follow-ups for later sections:
  - enable `long_form_block` in routing once Section 02 lands real long-form recipe families
  - reuse the shared router in relayout/editor explanation surfaces so both generation and relayout show the same mode reasoning
