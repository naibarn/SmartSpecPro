# Completeness Review Round 12

Date: 2026-05-31
Scope: mid-run product/evidence/policy changes, downstream invalidation, stale approval handling, and safe partial artifact reuse.

## Result

The plan now covers a subtle but important long-running automation risk: product and policy inputs can change while a storyboard/video run is active. Earlier rounds covered evidence freshness, post-publish invalidation, and background rechecks, but the plan needed a first-class contract for deciding what to preserve, what to recheck, and what to invalidate during the run itself.

## Findings Fixed

1. Mid-run input changes were not represented as their own durable decision.
   - Added `RunInputChangeImpactEnvelope`.
   - It compares previous/current product, evidence, policy, profile, review, and user-edit snapshots.
   - It records detected changes, impacted stages, artifact actions, invalidated approvals, invalidated credit estimates, invalidated QA refs, and final impact status.

2. The plan needed explicit partial reuse behavior.
   - Added rules to preserve safe artifacts with recheck evidence instead of regenerating everything.
   - Added rules to invalidate downstream concepts, prompts, generated media, QA, approvals, package metadata, and finalization only when they depend on stale refs.

3. Stale approval and stale credit behavior needed stronger guarantees.
   - Approval decisions remain valid only for exact evidence, policy snapshot, artifact refs, output mode, and export variant.
   - Credit estimates/reservations are recomputed only when changed inputs affect provider, duration, output count, repair scope, render profile, package requirements, or distribution profile.
   - Invalidated refs remain auditable but cannot authorize spend, render, publish, or reuse.

4. UI and rollout needed input-change visibility.
   - Timeline now must show changed input, impacted stages, preserved artifacts, invalidated artifacts, next action, and whether the system is rechecking, repairing, replanning, regenerating, or blocking.
   - Rollout/test gates now cover product image removal, distribution profile edit, price/offer/CTA change, and stale approval invalidation.

## Verdict

The plan is stronger for real long-running automation. It can now handle product rescans, evidence purge, selected variant changes, user edits, policy/profile changes, and rights changes without either silently using stale artifacts or wastefully restarting the entire job.
