# Section 06 — Story-cued wardrobe and look ledger

## Scope

Add an episode/scene-aware look ledger that references existing identity locks,
wardrobe rules, character variants, visual bible, and scene/frame continuity.

## Owned paths

- `apps/web/shared/verticalDramaSeries/longFormContracts.ts`
- `apps/web/shared/verticalDramaSeries/sceneContinuity.ts`
- `apps/web/shared/verticalDramaSeries/seriesLookLock.ts`
- `apps/web/server/services/verticalDramaCharacterVariantPlanner.ts`
- visual prompt/continuity integration and tests

## Design

The look must have a story cue: event, location, weather, time, role, or
continuity. A user-authored look is explicit and scoped. The ledger carries
look ID, cue refs, first/last use, state such as wet/dirty/injured, and approved
assets. It never changes canonical character identity.

## TDD acceptance

- Gala, rural, travel, sleep, combat, and cleanup transitions create valid
  look rows and structured prompt facts.
- An uncued automatic look is rejected.
- Continuous scenes retain the same look; damage/wetness/repair persists until
  an explicit transition.
- Existing frame/scene wardrobe drift remains detectable.

## UI/UX Contract

### Target User / JTBD

N/A — look admission and visual continuity service; look diagnostics are
rendered in Section 09.

### Surface Inventory

N/A.

### Component Map

N/A.

### State Matrix

N/A — look status is a typed ledger state.

### Responsive Matrix

N/A.

### Accessibility Acceptance

N/A — no browser surface is changed here.

### Copy Contract

N/A.

### Browser Evidence Required

N/A — visual prompt and continuity tests are sufficient for this section.

## Implementation notes

`verticalDramaLongFormDomain.ts` now requires explicit story cues for outfit
ledger entries, carries state/timeline, and rejects unexplained same-episode
look changes or state resets.
