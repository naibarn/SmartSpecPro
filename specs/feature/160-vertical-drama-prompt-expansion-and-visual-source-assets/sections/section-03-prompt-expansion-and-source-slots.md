# Section 03 — Prompt Expansion and Source Slots

## Objective

Implement the optional dialog-first prompt expansion flow, bounded skill/web research, editable apply/CAS behavior, source-slot suggestions, prompt generation, and managed image/upload source admission.

## Dependencies

- Sections 01–02.
- Existing promptEnhancementService.ts, webSearchToolInjector.ts, skillModelFallback.ts, verticalDramaSourcePackService.ts, existing source-pack router procedures, and managed media/credit paths.

## Ownership

- Add apps/web/server/services/verticalDramaPromptExpansionService.ts.
- Extend apps/web/server/services/promptEnhancementService.ts only through a narrow adapter if needed; do not fork generic skill execution.
- Extend apps/web/server/routers/verticalDramaSeries.ts with preview/get/apply/retry, slot suggestion/edit, slot prompt, and slot media procedures.
- Extend shared/source-pack contracts and verticalDramaSourcePackService.ts additively.
- Add focused client components under apps/web/client/src/components/verticalDramaSeries/ and integrate the existing planning surface.
- Add server/client tests.

## Server contract

Preview input: owner-scoped series/draft session, original prompt, prompt hash, profile hint, locale, research permission, and idempotency key. Preview output: run/revision/status, expanded editable brief, profile classification, researched findings with source metadata, uncertain claims, proposed visual slots, prompt suggestions, and warnings.

Preview never mutates the premise. Apply requires original prompt hash and preview revision, uses compare-and-swap, persists only the approved brief/expanded prompt/slot plan, records audit metadata, and returns the existing planning-flow pointer. A stale hash returns a recoverable conflict and current prompt without overwriting it.

Use the existing skill-first prompt enhancement and web-search injection path. Identifiable locations, software, systems, and current events request bounded research when enabled. Broad topics without evidence are explicitly illustrative/creative. Malformed LLM JSON, unknown IDs/URLs, search failure, provider failure, and oversized output become visible warnings or recoverable errors; they never become authoritative facts.

Slot suggestion derives deterministic bounded slot keys from the approved brief/profile. Slot edits use optimistic revision. Prompt generation uses the slot description/semantic role. Image generation reuses current managed media/credit admission and stores origin=ai_generated, disclosure, and illustrative evidence defaults. Uploaded/imported media registers against canonical managed media_assets; do not expose provider URLs as durable source identity.

## UI/UX Contract

### Target User / JTBD

- Role: creator/editor preparing a review, documentary, news, or Vertical Drama premise.
- Goal: understand and edit the AI interpretation before applying it, then plan visual sources without losing the original prompt.
- Entry point: existing planning premise field and source/media planning surface.
- Success outcome: preview is decision-ready, editable, cited when researched, and cancel-safe.

### Existing Pattern Reference

- Reuse AIDraftModal.tsx for async preview/cancel/error semantics, CreateSeriesWizard.tsx and source-pack components for staged edits, and VerticalDramaStoryboardPanel.tsx for media role selection.
- Targeted rg searched prompt preview, upload/history, source-pack, and reference-picker patterns under apps/web/client/src.
- Decision: reuse existing dialog/card/button/badge primitives; add an evidence/research summary because existing prompt preview does not expose citations and uncertainty.

### Surface Inventory

| Surface | Change |
|---|---|
| planning premise | optional “ขยายโจทย์ด้วย AI” action |
| expansion dialog | editable brief, research sources, warnings, slots, apply/cancel |
| source-slot card | modality/origin/evidence/rights/disclosure and actions |
| prompt/image action | per-slot generation/upload state |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| VerticalDramaPromptExpansionDialog | client/src/components/verticalDramaSeries/ | edit buffer, CAS apply, cancel, focus | preview/apply mutations |
| VisualResearchSummary | same | sources, as-of, uncertainty | preview result |
| VisualSourceSlotCard | same | slot display and actions | slot contract/mutations |
| planning integration | existing series detail/planning component | entry/return flow | dialog callbacks |

### State Matrix

Cover idle, loading, success, partial research, empty, error, stale conflict, disabled apply, hover/focus/selected slot, upload/generation progress, and completed slot. Original prompt remains unchanged in cancel/error/stale paths.

### Responsive Matrix

Use mobile 390x844 full-height sheet with sticky actions, tablet 768x1024 collapsing two-column layout, desktop 1440x900 side-by-side preview/research, and extended small-mobile 360x800/laptop 1024x768/wide-desktop 1280x800 checks for dense cards and planning navigation.

### Accessibility Acceptance

Labelled dialog and inputs, focus trap/restoration, Escape cancel, keyboard apply/retry, visible focus, accessible names for icon actions, text equivalents for warnings/status, no color-only meaning, reduced motion.

### Visual/token direction

Reuse existing theme/Tailwind semantic tokens, dialog/card/badge/button/input/toast primitives, current typography/radius/elevation, and balanced planning density. No raw hex or new global reset.

### Copy Contract

Thai-first with English fallback: “ขยายโจทย์ด้วย AI”, “ตรวจสอบข้อมูล”, “แหล่งข้อมูล”, “ยังไม่ได้ยืนยัน”, “นำไปใช้”, “ยกเลิก”, “สร้าง Prompt”, “สร้างภาพประกอบ”; errors explain search/generation/storage/stale causes while preserving text.

### Browser Evidence Required

Capture idle/loading/success/edited/cancel/apply/error and source-slot states at required viewports. Verify console, keyboard path, focus, overflow, accessible names, and no loss of original prompt.

## Tests-first requirements

Test preview idempotency/CAS, research classification, search-unavailable degradation, malformed output, unknown proposal fields, slot key stability, media-origin defaults, owner/tenant scope, flag-off parity, and all dialog states with mocked tRPC hooks.

## Acceptance

- Dialog is optional and apply-only; existing flow remains normal after confirmation.
- User can edit and cancel without data loss.
- Research sources and uncertainty are visible before apply.
- Broad topics are not presented as researched facts.
- Source slots support prompt generation and AI image/upload media without creating a parallel media registry.

## Implementation record

- Added `promptExpansion.ts` shared schemas, stable prompt hashing, profile classification, deterministic slot derivation, safe model-output parsing, and per-slot prompt generation.
- Added `verticalDramaPromptExpansionService.ts` with preview/idempotency persistence and owner-scoped compare-and-swap apply.
- Added migration `0244_vertical_drama_prompt_expansion.sql` and ORM ledger for preview/apply audit state.
- Added `previewPromptExpansion`, `applyPromptExpansion`, and `generateSourceSlotPrompt` procedures. Preview attempts the existing unified skill runtime with `auto_web_search`, then visibly degrades to a deterministic editable preview when the provider/skill is unavailable.
- Added `VerticalDramaPromptExpansionDialog`; the original premise is unchanged until the user confirms, and confirmation writes the edited text back into the existing wizard field.
- Focused proof: 4 prompt-expansion tests plus schema/core tests passed; whole-workspace typecheck remains baseline-red outside this feature and is tracked in implementation evidence.
