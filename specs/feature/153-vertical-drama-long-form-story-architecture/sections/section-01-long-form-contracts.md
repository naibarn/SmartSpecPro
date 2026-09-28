# Section 01 — Long-form contracts and blueprint admission

## Scope

Define additive shared contracts for `quality_120` and `extended_long_form`,
blueprint/arc/sub-arc/block/episode IDs, duration recommendation, memory/look/
cast/world/retry/SLO fingerprints, and source-compatible admission. Keep
`targetEpisodeCount` technical compatibility through 1000 and preserve legacy
60-second profiles.

## Owned paths

- `apps/web/shared/verticalDramaSeries/longFormContracts.ts` (new)
- `apps/web/shared/verticalDramaSeries/storyControl.ts`
- `apps/web/shared/verticalDramaSeries/durationProfiles.ts`
- `apps/web/server/services/verticalDramaStoryGenerationContracts.ts`
- focused shared/router tests

## Draft-pipeline alignment

The draft candidate must include a canonical relationship-graph revision,
readiness (`ready`, `compatibility_backfill`, or `needs_repair`), graph and
dependency-index fingerprints, and unresolved relation questions before
`generateStoryBible` can be considered ready for deep generation. Preserve the
legacy `relationshipMap` reader, but never let it bypass the strict graph gate.

Register the existing `vertical_drama_10s_x9_shots` profile as the strict
90-second quality profile: nine 10-second shots, matching speech bands and
production-manifest mapping.
Plan admission must use resumable season-skeleton chunks for 120–1000 episodes;
one oversized `episodeBreakdown` response is not an accepted implementation.

Strict mode must also resolve the existing `contentBudget.ts` and
`dialogueQuality.ts` policy into persisted episode/per-shot speech budgets.
The canonical `contentBudget` is required on new plan items; the legacy
optional speech-budget flag cannot disable the strict contract.

The immutable blueprint/run contract must fingerprint the resolved speech,
benchmark, anti-drift, plan-chunk, execution, and pricing policies separately;
changing any one makes dependent work stale.

It must also pin the Feature 151 adapter contract, Feature 152 assurance
contract, provider-policy fingerprint, safety-policy version, locale, and
relationship vocabulary/alias catalog fingerprint, plus the relationship
redaction policy version/fingerprint used for generation and diagnostics.

The adapter must map the long-form profile to the existing
`VerticalDramaDurationPlan` fields (`contractVersion`, `logicalShotCount`,
`shotDurationsSeconds`, `renderSegmentDurationsSeconds`, `status`, and
`source`) and then to assembly's logical/render segment schedule. Tests must
prove that both logical and render runtime sum to the declared profile and
that a legacy 60-second plan cannot be mixed into a strict 90-second run.

The resolved plan policy must use 10 episodes per chunk by default, allow no
more than 20, require zero overlap and contiguous coverage, and persist a
deterministic idempotency key plus predecessor coverage fingerprint.

## Design

Use Zod at runtime and pure TypeScript types for client-safe contracts. Stable
IDs and canonical fingerprints must be deterministic. `recommendedMode` is
derived from requested count; it is not a hard count validator. The long-form
contract is additive to Feature 152 and is included in contract hashing.

## TDD acceptance

- 120 maps to quality mode and reports 10,800 seconds at 90 seconds.
- 121/150/500 map to extended mode without rejection when budget permits.
- 1000 remains parseable; budget/policy can still block admission.
- interval gaps, overlaps, unknown parent IDs, duplicate IDs, stale fingerprints,
  and incompatible duration profiles are blocking findings.
- plan chunks reject gaps, overlaps, stale predecessors, missing policy values,
  and idempotency-key changes on replay.
- benchmark, anti-drift, cast-density, credit/retry, and memory-compaction
  policies cannot enter a paid run without resolved versioned values.
- legacy data receives derived IDs and reduced confidence;
- 90-second profile and staged plan chunks remain compatible with legacy 60s.

## Dependencies and proof

This section owns no migration; Section 10 performs the storage preflight and
adds the graph revision/index migration if Phase A JSON/event/snapshot storage
cannot satisfy the mandatory atomic lookup contract. Run focused shared
contract tests and router input tests before downstream sections.

## UI/UX Contract

### Target User / JTBD

N/A — shared contract and admission layer; Section 09 owns user surfaces.

### Surface Inventory

N/A.

### Component Map

N/A.

### State Matrix

N/A — states are defined by the server contract and rendered in Section 09.

### Responsive Matrix

N/A.

### Accessibility Acceptance

N/A — no browser surface is changed here.

### Copy Contract

N/A.

### Browser Evidence Required

N/A — unit/router proof is sufficient for this section.

## Implementation notes

Implemented in `apps/web/shared/verticalDramaSeries/longFormContracts.ts`,
`durationProfiles.ts`, and the typed `longForm` extension of the story run
contract. Focused tests cover mode/count admission, exact 90-second mapping,
chunk continuity, graph policy fingerprints, and legacy-safe compatibility.
