# Section 02 — Advisory and Hard-Control Contract

## Requirement IDs

NB-02, NB-03, NB-05, NB-06, NB-08

## Objective

Make it impossible for subjective CPE assessment state to become production-generation state.

## Owned scope

Inspect and, only if needed, narrowly extend `apps/web/shared/verticalDramaSeries/`, `verticalDramaEpisodePipeline.ts`, `verticalDramaQc.ts`, and `verticalDramaProvider.ts`. Keep queue and asset ownership with existing services.

## Prerequisites

Section 01's canonical ownership and gate conflict map.

## Tasks

1. Document two independent dimensions: task/media status and optional CPE assessment status. Reuse existing fields when they already express this.
2. Restrict CPE findings to advisory warning/info output. Separate safety/rights/ownership/budget/provider capability/cancel/technical integrity as existing hard checks.
3. For missing, timeout, invalid, stale or skipped CPE input, use the existing storyboard/shot contract and record a bounded diagnostic.
4. Ensure Feature 157 final-gate adapters do not consume advisory CPE verdict as `provider_ready` for normal image/video generation.
5. Confirm no new mandatory approval, wait status or autonomous retry is introduced.

## Completion predicate and evidence

For each injected advisory result, the server calculates the same baseline image/video eligibility; tests independently show hard-control denial remains intact. No new status migration is required unless source discovery proves no safe additive representation exists.

## Fallback and blocker strategy

If current contracts already separate the states, do not refactor them. If a cross-system hard/advisory boundary remains unclear, resolve it in the P0 contract before P1 work; continue independent test preparation.

## Focused tests and evidence

Use deterministic pipeline/router fixtures to compare baseline eligibility with disabled, missing, timed-out, malformed, stale, low-score, identity-warning and continuity-warning CPE results. Add negative controls for authorization, tenant/asset ownership, safety, provider capability, budget, cancellation and corrupt required media. Assert the same hard-control result is produced independently of the advisory result.

## Unresolved assumptions

Confirm whether current episode/run status fields can represent a completed media operation with a separate advisory report. Additive schema work is conditional on proving no existing representation is safe; do not assume a migration is needed.
