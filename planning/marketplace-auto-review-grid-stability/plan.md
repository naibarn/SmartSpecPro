# Marketplace Auto Review — Storyboard Grid Image Stability Fix

Date: 2026-07-05
Status: In progress (autonomous execution per user request)

## Problem Statement

The auto storyboard review pipeline generates 3 storyboard grid images (each one 9:16 image
containing a strict 3x3 grid = 9 frames) with product reference (@Image1) and character
reference (@Image2). Vision QA repeatedly flags the same failures across all repair rounds:

- `grid_structure_issue` / `storyboard_grid_layout_mismatch`
- `product_reference_mismatch` (shape/color/material drift, invented parts)
- `character_reference_mismatch` (identity < 90% similar)

Evidence from `logs/audit/audit-2026-07-05.jsonl`, run `mar_6f21ea342bfb8d039651766b54a447b9`
(product `mp_9423fdaf72243a97cb0b3edab359793b`):

1. All 3 repair attempts used `google-banana-2-lite` (weakest tier) — no model escalation.
2. Final image prompts (3.5–3.7k chars) contained **zero repair feedback** — no mention of
   previous failure reasons. Each repair attempt is an independent re-roll with the same
   success probability.
3. The prompt-builder LLM skill receives `repairInstruction` in its inputs
   (marketplaceAutoReviewService.ts:8965) but is free to drop it from the final prompt —
   and did, in all observed attempts.
4. QA verdict (18640-18652) hard-fails on `storyboardGridGeometryUncertain` — a local pixel
   edge-detector (storyboardGridGeometry.ts, 6% window, 0.66 confidence) that falls back on
   ~perceptually-fine grids — even when the vision model itself passed all checks. This burns
   repair budget on false failures.

## Root Causes

1. **No feedback loop**: QA `reasonCodes` + `repairInstruction` never reliably reach the image
   model. Repair = blind re-roll.
2. **No model escalation**: repair attempts reuse the same (user-selected, weak) image model.
3. **False-fail from geometry detector**: fallback-thirds detection alone vetoes a pass verdict.
4. **Low-contrast gutters**: generation prompt asks only for "clean narrow gutters", making both
   model grid compliance and edge detection less reliable.

## Affected Files

- `apps/web/server/services/marketplaceAutoReviewService.ts` (all fixes)
- `apps/web/server/services/__tests__/marketplaceAutoReviewService.test.ts` (new tests)

## Changes

### A. Deterministic targeted-repair block appended to final image prompt
New helper `ensureTargetedRepairDirectiveInImagePrompt(prompt, unit)` (modeled on
`ensureMinorSafetyClothingLockInImagePrompt`, line 1411). When the unit carries
`repairReasonCodes`/`repairInstruction` and the prompt lacks a `TARGETED REPAIR` marker,
append a block that maps each reason code to an explicit corrective sentence
(product → copy @Image1 exactly; character → preserve @Image2 identity; grid → 3x3 equal
cells; text → remove all text) plus the QA repair instruction compacted to ~500 chars
(not 90). Applied server-side after the prompt-skill output, so the LLM can no longer drop it.
Respects `MARKETPLACE_AUTO_REVIEW_IMAGE_PROMPT_MAX_CHARS`.

### B. Image model escalation ladder on repair attempts — REVERTED (2026-07-05)
Originally: `google-banana-2-lite` → `google-banana-2` when `attempt >= 2`.
**Removed per user decision**: the UI has an explicit image-model picker; repair attempts
must reuse exactly the user-selected model. Model choice belongs to the user.
(`effectiveImageModel = imageModel` with an explanatory comment in scheduleImageAttempt.)

### C. Geometry-uncertain becomes a warning, not a hard fail
In `runStoryboardGridVisionQa` verdict (≈18640): drop `!storyboardGridGeometryUncertain`
from the pass condition. If the vision model passed everything (strict 3x3, 3 cols, 3 rows,
9 frames, product + character + minor-safety OK), a low-confidence local edge detection no
longer forces a repair round. `storyboard_grid_geometry_uncertain` stays in reasonCodes for
observability, and the splitter's equal-thirds fallback is acceptable because the vision model
confirmed equal panels.

### D. High-contrast gutter instruction
Generation lock strings ("clean narrow gutters") → "clean narrow solid black gutter lines"
in the grid layout locks (≈1527, ≈14778, ≈9706, skill feedback texts ≈8746/8769). Improves
model grid compliance and edge-detector confidence.

### E. Raise repair-instruction compaction limit
`build3x3StoryboardPrompt` fallback path: `compactImagePromptText(repairInstruction, 90)` →
500 (line ≈14826).

## Risk Assessment

- A, D, E: prompt-only; bounded by existing max-chars guard. Low risk.
- B: +5 credits/repair when escalating lite→full (35→40). Behavior unchanged for non-lite models.
- C: relaxes one QA gate — only in the case where the stronger signal (vision model) fully
  passed. Real broken grids still fail via `isStrict3x3`/columns/rows/frameCount checks.

## Verification

1. New unit tests for the repair-directive helper + escalation resolver + verdict change.
2. `pnpm vitest run server/services/__tests__/marketplaceAutoReviewService.test.ts`
3. `pnpm check` (typecheck)
4. Restart `smartspec-web` and observe next auto-review run's audit log: repair prompts must
   contain `TARGETED REPAIR`, repair attempt ≥2 must use `google-banana-2`.

## Progress

- [x] Investigation (audit logs + code trace)
- [x] Implementation A–E
- [x] Tests
- [x] Typecheck + test suite
- [x] Service restart + report (service reloaded 2026-07-05 15:29 with fixes live;
      healthz OK on localhost:3000 and https://smartaihub.app)

## Follow-up: user-selectable Vision QA model (2026-07-05)

Per user request, the vision QA model is now user-selectable per run instead of fixed by
quality mode. New "โมเดลตรวจ QA (Vision)" dropdown in BOTH the standard options grid and the
"ตัวเลือก Auto ขั้นสูง" (Hyperframes auto-plan overrides) panel; options come live from
`llmProviders.availableModels` with a curated fallback in
`shared/marketplaceAutoReview/contracts.ts`. Precedence at all THREE QA sites (grid layout,
shot frames, and video clip continuity — the last one previously ignored quality mode
entirely): `MARKETPLACE_AUTO_REVIEW_VISION_MODEL` env > user override
(`metadata.visionQaModelOverride`) > quality-mode default (gpt-4o-mini / gpt-4o premium).
Wire path: UI select → `HyperframesAutoPlanOverrideInputSchema.visionQaModel` (or direct
`startAutoReview.visionQaModel`) → `startMarketplaceAutoReviewRun` → run metadata →
`effectiveQualityModePolicy`.

## Implementation Notes (2026-07-05)

- Fix A hooked into both `prepareMarketplaceAutoReviewImagePromptForSubmit`
  code paths (grid and non-grid) at the same layer as the minor-safety lock,
  right before preflight validation, so the submitted `prompt` always carries
  the directive.
- Fix D: to stay within `MARKETPLACE_AUTO_REVIEW_IMAGE_PROMPT_MAX_CHARS`
  (3800), the two prompt-embedded LAYOUT LOCK strings (duplicated per grid
  prompt: top + after SHOT-BY-SHOT header) use "clean narrow solid black
  gutter lines" without the "between panels" suffix; the FINAL GRID/TEXT LOCK
  and feedback/repair-instruction strings (single-occurrence per prompt) keep
  "between panels" for clarity.
- 3 pre-existing test failures in `marketplaceAutoReviewService.test.ts`
  (`preflights 3x3 prompts...`, `keeps a full 9-shot...`, `does not truncate
  storyboard frames...`) were confirmed failing on the `main` baseline before
  this change (same `prompt_too_long_for_image_provider` blocker / missing
  MINOR SAFETY CLOTHING LOCK) — unrelated to fixes A–E, left as-is.
