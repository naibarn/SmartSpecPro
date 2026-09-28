# Implementation Plan

## Objective

Add a policy-safe rewrite stage for Vertical Drama episode covers that runs on
the final prompt before either media transport, preserves allowed visual
intent, blocks inherently disallowed requests, and leaves existing ownership,
credit, idempotency, and provider-failure behavior intact.

## Work order

1. Add the dedicated `vertical-drama-episode-cover-safety-rewriter` skill with
   a strict JSON contract and minimal-change rules for violence, coercion,
   sexualization, and age ambiguity.
2. Extend the shared safety service with a `vertical_drama_cover` mode,
   skill-specific loading, bounded metadata, hash validation, and reuse of a
   validated prepared marker.
3. Extend episode-cover JSONB state with an additive safety summary and update
   `generateEpisodeCover` to prepare the assembled prompt before credits and
   transport. Pass the same safe prompt to Hermes and normal media; use the
   existing marker for the normal media call to prevent duplicate rewriting.
4. Add focused tests for service behavior, cover state/persistence, block/
   outage behavior, hash reuse, and defense-in-depth marker validation.
5. Run focused tests, affected typecheck if practical, and `git diff --check`.

## Affected files

- `apps/web/skills/vertical-drama-episode-cover-safety-rewriter/SKILL.md`
- `apps/web/skills/vertical-drama-episode-cover-safety-rewriter/skill.md`
- `apps/web/server/services/imagePromptSafetyService.ts`
- `apps/web/server/services/__tests__/imagePromptSafetyService.test.ts`
- `apps/web/server/services/mediaGenerationService.ts`
- `apps/web/shared/verticalDramaSeries/episodeCover.ts`
- `apps/web/server/services/verticalDramaEpisodeCover.ts`
- `apps/web/server/routers/verticalDramaEpisodes.ts`
- adjacent episode-cover/router/service tests

## Security and integrity

- Existing tenant ownership and reference authorization remain unchanged.
- The safety LLM receives prompt text and reference count, never media URLs or
  credentials.
- The prepared marker is accepted only when its safe-prompt hash matches the
  actual request prompt and is never provider-facing.
- Blocked or unavailable safety review must happen before credit reservation
  and task enqueue.

## Acceptance and verification

- Safe prompts remain unchanged; risky allowed prompts are minimally rewritten.
- Disallowed prompts and malformed medium/high-risk responses do not submit.
- Hermes and normal media receive byte-equivalent safe prompts.
- Existing normal non-VD safety behavior remains unchanged.
- Focused tests and diff checks pass; browser/provider/production proof remains
  explicitly separate.

## Implementation result

- Completed the dedicated skill, cover-specific service mode, pre-credit router
  preparation, Hermes/normal-media prompt propagation, persisted safety summary,
  exact-hash reuse guard, and Python marker validation.
- Focused web tests: 43 passed. Python safety tests: 10 passed; Ruff passed.
- `git diff --check` passed. Full web typecheck was attempted but did not
  complete within the local verification window; no provider/browser/
  production replay was performed.
