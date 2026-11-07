# P0 Implementation Plan — Non-Blocking CPE Foundation

## Outcome and invariants

Close CPE as a verified optional enhancement boundary. Keep generated-media state separate from advisory-QC state. An advisory finding can produce a report, warning, or suggestion; it cannot set an image/video generation stage to failed, remove an asset, hold generation for approval, or activate paid repair. Existing hard checks remain authoritative.

## Requirement ledger

| ID | Requirement | Current state | Completion predicate |
|---|---|---|---|
| P0-SPEC | Canonical owner is identified for each source requirement; old broad assurance wording is reconciled | Multiple related handoffs unresolved; Feature 157 has broad final-gate language | Every mapped requirement points to its canonical owner/status and source/test evidence; critical CPE policy wins any aesthetic-gate conflict |
| P0-STATE | Advisory assessment cannot mutate production eligibility or media readiness | Several services already fail open, but there is no complete cross-stage matrix | Adversarial tests vary CPE state while asserting image/video eligibility, explicit controls, and hard gates independently |
| P0-FAIL | Disabled/missing/timeout/invalid/stale enhancement falls back safely | Existing scene-intent and continuity fallbacks are partial evidence | All failure classes return current baseline inputs plus bounded diagnostics and never introduce a wait |
| P0-SAFE | No relaxation of authorization, tenant, budget, provider, safety, cancellation, or artifact integrity | Existing mechanisms remain | Hard-failure controls still deny their unsafe operation in the same tested scenarios |

## Execution order

1. Re-read canonical ledgers for the listed feature records and compare their unresolved IDs to source/tests. Reuse existing owners and amend the correct canonical record through its writer; this roadmap is not a competing ledger.
2. Write the explicit hard/advisory classification table and reconcile Feature 157's API state, paid-stage readiness, and QC severity mapping. Ensure subjective codes cannot become `blocking`.
3. Reuse current run warnings/artifacts for advisory results. If a new type is needed, make it additive and keep it out of paid admission checks; persist only evidence necessary for replay and user inspection.
4. Extend the existing pipeline test harness around `generateRealStoryboard` and `generateRealStartFramePlan`; include a small cross-boundary fixture for image/video eligibility and the episode router.
5. Run the P0 focused suite and record command, revision, test names/count, and outcome in a report. Do not call P0 complete from unit tests alone if authenticated UI/API proof is required by the canonical handoff.

## Owned paths

Read/reconcile: `specs/_status/spec-index.json`, listed existing Feature specs and `handoff/` files, `apps/web/server/services/verticalDramaEpisodePipeline.ts`, `verticalDramaQc.ts`, `verticalDramaProvider.ts`, `verticalDramaProviderRouting.ts`, `verticalDramaEpisodeStageJobs.ts`, existing run/artifact and credit services.

Potential implementation ownership, only after reconciliation: relevant `apps/web/shared/verticalDramaSeries/` contract, `apps/web/server/services/verticalDramaEpisodePipeline.ts`, QC/provider tests, and narrowly scoped authenticated Vertical Drama API/UI tests. Do not touch unrelated dirty workspace paths.

## Dependencies and fallback

P0 blocks all later CPE phases. If canonical ledger ownership is unclear, keep the source-mapped gap in this phase and continue independent code inspection; do not create a duplicate SPEC. If the shared advisory type is unnecessary, retain existing types and add only the missing tests.

## Definition of done

- The parity property is demonstrated: CPE state does not change baseline image/video eligibility.
- Fail-open behavior is observable via safe warning/diagnostics and bounded timing/attempts.
- Hard provider, authorization, budget, tenant, safety, cancellation and verified-artifact checks still block correctly.
- No new UI wait/approval, duplicate provider job, duplicate credit charge, or change to the active successful asset.
- Canonical ledger state is updated only with fresh evidence by the existing handoff process.

No production deploy is part of this phase.
