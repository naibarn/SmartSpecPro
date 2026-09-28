# Marketplace Auto Review — Storyboard Prompt Resilience (Never Block Image Generation)

Date: 2026-07-18
Status: In progress

## Problem Statement

Run `mp_f17e5e4ef9c2de38a54715bcb6c29a52` failed at stage `image_generation` with:

```
product-reference-storyboard LLM call failed: No endpoints found that support image input
```

and the whole run went `failed` → `storyboard_review` skipped (`run_failed_before_stage`),
even though `prompt_plan` had already completed successfully. The user got ZERO images.

### Root cause (evidence-backed)

1. **Stale capability flag**: `model_provider_map` had `supportsVision=true` for
   `z-ai/glm-5.2`, but OpenRouter's live catalog says `architecture.modality =
   "text->text"`, `input_modalities=["text"]`. The requirements matcher
   (`skillExecutionPolicy` → `selectBestLlmModel`) legitimately picked glm-5.2
   (cheapest match for `supportsVision + contextLength>=1M`), and OpenRouter rejected
   the image parts at runtime.
   - modelSyncService's OpenRouter path never maps `architecture.modality` →
     `supportsVision`, and merge (`next.supportsVision ?? current.supportsVision`)
     can never flip a stale `true` back to `false`.
   - **Data hotfix applied 2026-07-18**: `UPDATE model_provider_map SET
     "supportsVision"=false WHERE "modelId"='z-ai/glm-5.2'` (backup in `.db-backups/`).
2. **Zero-tolerance pipeline**: `productReferenceStoryboardSkillRunner` calls
   `executeWithFallback` with `disableProviderFallbacks: true`; any non-success →
   throw. In `marketplaceAutoReviewService.prepareMarketplaceAutoReviewImagePromptForSubmit`
   (storyboard_grid path, ~line 9270), only
   `ProductReferenceStoryboardSkillIncompleteOutputError` retries; every other error
   rethrows → `markRunFailed` → whole run terminal.

### Product requirement (from user)

Whatever fails mid-way, once a prompt exists the run MUST proceed to generate the
3 candidate images. The storyboard-prompt LLM refinement is an enhancer, not a gate.

## Affected Files

- `apps/web/server/services/intelligentModelSelector.ts` — export ranked candidate list
- `apps/web/server/services/productReferenceStoryboardSkillRunner.ts` — multi-model retry + text-only fallback
- `apps/web/server/services/marketplaceAutoReviewService.ts` — last-resort deterministic prompt fallback (storyboard_grid path)
- tests under `apps/web/server/services/__tests__/`

## Proposed Changes

### Layer 1 — model-level retry (runner)
1. `intelligentModelSelector.ts`: add `selectLlmModelCandidates(requirements, rows): string[]`
   returning the full ranked candidate list (same ordering as `selectBestLlmModel`).
2. `productReferenceStoryboardSkillRunner.ts` (`generate` path used by
   `runProductReferenceStoryboardPromptSkill`): when the vision LLM call fails with a
   model/endpoint-capability error (detect substrings like "support image input",
   "No endpoints found", or any provider 4xx tied to the model), retry the SAME
   messages with the next ranked vision-capable candidate (max 3 models total),
   excluding already-failed models. Log each hop (console + skillAudit fields).
3. Final in-runner fallback: retry once with **text-only messages** (drop
   `image_url` parts, keep a text note listing reference-image roles/counts) on the
   best available large-context model. Mark `skillAudit.visionFallback =
   "text_only"`.

### Layer 2 — pipeline guarantee (service)
4. In `prepareMarketplaceAutoReviewImagePromptForSubmit` storyboard_grid branch:
   wrap the whole prompt-skill attempt loop; if it ultimately throws anything other
   than the existing preflight/incomplete retry flow, DO NOT rethrow. Instead build a
   deterministic degraded prompt from the already-approved plan
   (`buildImagePromptForUnit(plan, unit, overlayTextMode)` + existing final-prompt
   optimizer + repair directive), set `skillRuntime.degradedFallback =
   "plan_prompt"` with the original error message, run preflight in ADVISORY mode
   (record result, never throw) and return the prompt so image generation always
   proceeds.
5. Surface degradation to the user: stage should complete as
   `completed_with_warnings` (existing status) when a degraded prompt was used —
   include a short warning in stage output so the UI shows it.

### Layer 3 — stop the drift class (sync)
6. `modelSyncService.ts` OpenRouter path: parse `architecture.modality` /
   `architecture.input_modalities`; when present and image input is absent, set
   `supportsVision=false` (authoritative from provider); when image input present,
   `true`. Investigate first whether `supportsVision` is admin-editable in UI — if
   yes, only auto-correct rows not manually locked (or log a mismatch warning
   instead of overwriting). Keep this change narrowly scoped to the OpenRouter
   normalizer.

## Risk Assessment

- Runner retry loop must not double-charge credits: verify how credits are reserved
  per LLM call in `executeSharedSkillTextRuntime` (each attempt is billed as its own
  call — acceptable, log it).
- Degraded prompt quality < skill prompt, but user explicitly prefers images over
  a failed run. Marked in audit for QA follow-up.
- Do NOT change model cost policy or global fallback behavior of other skills.
- `MARKETPLACE_AUTO_REVIEW_PROMPT_SKILL_PREFLIGHT_MAX_ATTEMPTS` loop semantics must
  stay identical for the incomplete-output path.

## Verification

1. Unit tests: candidate-list export; runner retries next model on "image input"
   error; runner text-only fallback; service degraded-prompt fallback returns a
   prompt and never throws.
2. `pnpm check` (scoped) + `pnpm vitest run` on touched test files.
3. Manual: re-run a marketplace auto review; confirm image_generation completes and
   storyboard_review runs.

Test files added/extended (all green):
- `server/services/intelligentModelSelector.test.ts` — 9 new
  `selectLlmModelCandidates` cases.
- `server/services/__tests__/productReferenceStoryboardVisionResilience.test.ts`
  (new) — 5 cases covering primary-success/no-fallback, next-model retry,
  exhausting all vision candidates before text-only, throwing only after
  every attempt (incl. text-only) fails, and `fallback_required` error
  description.
- `server/services/__tests__/marketplaceAutoReviewStoryboardPromptDegradedFallback.test.ts`
  (new) — 2 cases proving the degraded path never throws and carries
  `degradedFallback`/`degradedReason`/the `storyboard_prompt_degraded_fallback`
  warning.
- `server/services/modelSyncService.test.ts` — 3 new cases under
  "Layer 3 — OpenRouter architecture-derived supportsVision".

Total: 72 tests passed across the 5 touched/new test files. `pnpm check`
shows 0 new errors in the 4 touched source files (140 pre-existing errors
elsewhere in the monorepo, unrelated).

## Progress

- [x] Root cause identified with audit-log + DB + OpenRouter evidence
- [x] Data hotfix: glm-5.2 supportsVision=false (backup taken, counts verified)
- [x] Layer 1 runner retry + text-only fallback — `selectLlmModelCandidates`
      export (already existed on main; `selectBestLlmModel` refactored to
      call it + take `[0]`) in `intelligentModelSelector.ts`; new
      `runProductReferenceStoryboardVisionLlmCallWithFallback` +
      `buildTextOnlyVisionFallbackMessages` +
      `resolveProductReferenceStoryboardVisionCandidateModelIds` /
      `...TextOnlyFallbackModelId` helpers wired into the vision LLM
      `legacyExecute` closure of `runProductReferenceStoryboardPromptSkill`
      in `productReferenceStoryboardSkillRunner.ts`; `skillAudit` now carries
      `visionModelAttempts` / `visionFallback`.
- [x] Layer 2 service degraded-prompt guarantee —
      `buildDegradedMarketplaceAutoReviewStoryboardGridPromptFallback` +
      try/catch around the storyboard_grid prompt-skill attempt loop in
      `prepareMarketplaceAutoReviewImagePromptForSubmit`
      (`marketplaceAutoReviewService.ts`); preflight runs in advisory mode
      (never throws) and appends a `storyboard_prompt_degraded_fallback`
      warning to `preflight.warnings`.
- [x] Layer 3 sync modality mapping (safe-scoped) — `modelSyncService.ts`
      OpenRouter `convertModel` now derives `supportsVision` from
      `architecture.input_modalities` / `architecture.modality`.
      Confirmed `model_provider_map.supportsVision` IS admin-editable
      (`multiProvider.ts` `upsertModelMapping` /
      `bulkSetAdminModelCatalogEnabled`), so this sync path does NOT
      auto-write to `model_provider_map` — it only logs
      `[modelSync] vision_capability_mismatch` via
      `warnOnOpenRouterSupportsVisionMismatch`.
- [x] Tests + typecheck — see test files below; `pnpm check` shows 0 new
      errors in the 4 touched files (140 pre-existing errors elsewhere,
      unrelated to this change).
- [ ] Deploy (build:deploy + restart web) — not performed by this task per
      instructions ("Do NOT restart services").
