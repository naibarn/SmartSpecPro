# Implementation Plan

## Objective

Make child age-stage character generation safe and recoverable. A child
age-stage variant should pass prompt validation as `child`, while a base adult
character with an explicit child request should receive a user-actionable
precondition that opens the existing Add Look dialog.

## Affected files

- `apps/web/shared/verticalDramaSeries/ageStageVariant.ts` — stable client/server
  marker and parser.
- `apps/web/server/services/verticalDramaCharacterImageGeneration.ts` — visual
  tier resolver, payload field, and params.
- `apps/web/server/routers/verticalDramaCharacters.ts` — thread variant type
  and fail early for base-adult child requests across preview/image/sheet paths.
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx`
  — open and prefill age-stage confirmation flow.
- Focused service/router/UI tests for the above.

## Approach

1. Add a pure shared marker/parser for `age_stage_variant_required`.
2. Extend visual prompt params with `variantType` and calculate an effective
   visual tier. For an `age_stage` row, explicit child keywords or age below
   the child threshold win over the parent's canonical tier. For all other
   rows, preserve current behavior.
3. Serialize the effective visual tier as the skill's `role_tier`, and include
   `variant_type` as a factual field. Keep the stored `roleTier` unchanged.
4. In router prompt entry points, pass `character.variantType`. For a base row
   with adult canonical tier and an explicit child custom instruction, throw a
   `PRECONDITION_FAILED` with the stable marker before the paid prompt call.
5. In the panel, intercept that marker for preview/direct image/sheet errors,
   find the requested character, and open the existing variant dialog prefilled
   with `age_stage`, an age-derived label, and the original custom instruction.
   The existing explicit credit confirmation, variant creation, image polling,
   and roster invalidation then complete the flow.
6. Add regression coverage before/alongside implementation and run focused
   checks.

## Acceptance criteria

- A `lead_male` parent with an `age_stage` description of six years resolves to
  visual tier `child`, sends `role_tier=child` to the skill, and does not fail
  the adult lead beauty gate.
- The persisted variant still has `roleTier=lead_male`.
- A base adult character with custom instruction `เด็กชายอายุ 6 ขวบ` returns a
  recoverable precondition marker, not `INTERNAL_SERVER_ERROR` after an LLM call.
- The panel opens the Add Look dialog in age-stage mode and preserves the
  requested brief for the confirmed generation.
- Existing outfit, adult age-stage, standalone child, and adult lead flows
  retain their current behavior.
- Tenant scoping, credit confirmation, and async polling remain unchanged.

## Risks and mitigations

- Over-detecting child intent could block a legitimate standalone child base;
  only explicit child custom instructions on adult-tier base rows trigger the
  recoverable precondition.
- A variant may be created but its image may fail; the existing pending/failed
  polling state remains visible and the shot is never bound without an approved
  portrait.
- Existing dirty changes may overlap the service/test files; edit only targeted
  hunks and run diff checks.
