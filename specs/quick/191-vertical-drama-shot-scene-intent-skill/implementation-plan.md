# Implementation Plan

## Objective

Implement and wire a new `vertical-drama-shot-scene-intent` skill that produces a
per-shot semantic scene contract and safely corrects automatic character/caller
references before start-frame planning.

## Files

- Add skill bundle under `apps/web/skills/vertical-drama-shot-scene-intent/`:
  `SKILL.md`, `skill.md`, `skill.json`, and bounded input/output schemas.
- Add `apps/web/server/services/verticalDramaShotSceneIntent.ts` with the bounded
  Zod contract, prompt builder, skill loader, LLM runner, pure validator, and
  storyboard projection helper.
- Update `verticalDramaEpisodePipeline.ts` to load bounded previous-episode
  context, invoke the semantic pass after storyboard generation, apply the pure
  projection, and include its credit charge in candidate accounting.
- Update `verticalDramaStoryboardGeneration.ts` only if the shared output type
  needs an additive `scene_intent` passthrough or an error mapping seam.
- Add focused tests beside the new service and pipeline tests; do not touch
  provider or production data.

## Data flow

1. Generate the existing nine-shot storyboard.
2. Build a bounded semantic input from shot text, canonical dialogue, roster keys,
   and the previous episode's final shot/continuity context.
3. Run the new skill once for the episode with structured JSON validation.
4. Validate role disjointness, roster ownership, dialogue routing, communication
   topology, and confidence.
5. For automatic shots, set physical/caller refs from the contract and add the
   derived `scene_intent` block. For ambiguous shots, return a repairable,
   review-required failure before persistence.
6. Existing start-frame projection consumes the corrected refs and dual-view
   compatibility fields; manual frame selections remain untouched.

## Error and safety behavior

- Unknown character keys, duplicate role membership, invalid dual-view sides, or
  unsupported communication modes fail closed.
- A low-confidence/`needs_review` shot returns a bounded repairable error and does
  not proceed to image generation.
- Authored synopsis and dialogue remain unchanged; only derived storyboard
  metadata is written.
- Character references are server-validated against the already tenant-scoped
  roster. No client-supplied tenant or provider fields enter the skill contract.
- LLM retries are bounded and use the existing credit/idempotency conventions.

## Rollout

The pass is invoked directly only for new real storyboard generation and repair
candidates; dry-run/plan-only paths remain provider-free. A later rollout flag can
be added if production canary evidence requires it, but this implementation does
not create a second partial path that could persist an unreviewed cast. No
migration or deployment is part of this change.

## Acceptance criteria

- A character mentioned in narration but not visible is not in physical or caller
  refs.
- Phone/video callers are screen-only; voice-only, door-separated, and text-only
  participants are represented without physical portrait injection.
- Dual view is emitted only for genuinely separate physical views/locations.
- Manual cast selections remain authoritative during start-frame regeneration.
- All new service/pipeline tests pass without real LLM/provider calls.
