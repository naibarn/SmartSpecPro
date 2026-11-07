# P0 Implementation Spec — Non-Blocking CPE Foundation

## Accepted outcome

Optional CPE work cannot add a new condition for normal image/video creation. `generationStatus` and advisory `cpeAssessmentStatus` are separate facts: a CPE warning, low score, unavailable service, failed analysis, or skipped enhancement may change the latter and diagnostics, but not the former or generation eligibility. Existing hard controls remain unchanged.

## Normative conflict resolution

Reconcile Feature 157's generic `provider_ready`, `awaiting_action`, `succeeded`, final-QC and rollout wording with the newer critical CPE directive. For image/video submission, hard eligibility is limited to existing authorization, tenant/asset ownership, explicit user approval, cancellation, content safety/rights, configured and capable provider, valid credit/budget, current owner-bound inputs, and essential technical/artifact integrity. Subjective CPE criteria are advisory and cannot be mapped to a blocking severity/state. Feature 157's deterministic safety/lineage and exact-once accounting requirements remain in force.

## Existing implementation to preserve

- `verticalDramaEpisodePipeline.ts`: `generateRealStoryboard`, `generateRealStartFramePlan`, optional shot-scene intent, optional scene continuity and warning diagnostics.
- `verticalDramaQc.ts`: QC severity and `stageBlocksPaidGeneration` boundary.
- `verticalDramaProvider.ts` and `verticalDramaProviderRouting.ts`: provider capability, authorization and hard blocker handling.
- `verticalDramaEpisodeStageJobs.ts` and canonical `worker_jobs` plus outbox.
- Existing episode runs/artifacts, media ownership, credit service, explicit user controls and feature-off behavior.

## Implementation boundaries

First reconcile current source/tests and canonical handoffs for Features 137/138/149/150/155/157/167/170/173/175 and Quick 167/186/191/298. Do not mint a new SPEC ID here. Add or change a shared result shape only when current service contracts cannot express advisory failure separately. No new CPE queue, renderer, state machine, asset store, or mandatory approval.

## Acceptance

For CPE off, missing, timed out, malformed, stale, or advisory-failed, image/video requests retain the same baseline eligibility and current authorized provider/billing checks. Tests prove no advisory-induced failed stage, approval/wait state, asset replacement, duplicate credit, or user cancellation override. Hard controls continue to block when they truly apply.
