[2026-06-07T09:46:00Z] DECISION: Use direct-standard-light Orchestra execution.
  Context: Codex standard mode; user requested Orchestra but not explicit sub-agent delegation.
  Alternatives considered: multi-agent dispatch, skipped because direct diagnosis and focused backend patch were sufficient.

[2026-06-07T09:46:00Z] DECISION: Handoff exhausted whole-storyboard image QA failure to Storyboard Review with warnings instead of looping.
  Context: The user goal is to reach Storyboard Review after repair attempts; existing UI copy already promised handoff after 3 rounds.
  Alternatives considered: terminal blocked_needs_user, rejected because it would still not create the review surface the user needs for manual frame correction.

[2026-06-07T09:46:00Z] DECISION: Do not persist new advance_run outbox jobs when schedulerSource is auto or outbox:*.
  Context: The observed run had hundreds of queued jobs generated recursively by background/outbox advances.
  Alternatives considered: pruning old outbox rows only, rejected because it would treat the symptom without fixing queue amplification.

[2026-06-07T09:56:00Z] DECISION: Treat final-provider prompt 3x3 layout fragments as hard preflight blockers.
  Context: DB evidence showed the Auto defaults and skill input snapshot carried the exact 3x3 preset, but the final skill-generated prompt sent to the image provider was allowed through with missing layout wording because runtime-backed contract issues were softened to warnings.
  Alternatives considered: only strengthening UI/default payload, rejected because the observed run already had `frameStrategy=storyboard_3x3_split` and `layoutPreset=canvas_9_16_grid_3x3_frame_9_16_exact`; the actual gap was final prompt enforcement.

[2026-06-07T11:58:00Z] DECISION: Stabilize running stage-attempt snapshots and complete warning-complete stages with timestamps.
  Context: The production run had thousands of `image_generation:<advanceAttempt>` rows stuck in `running`, and `image_generation` had `status=completed_with_warnings` without `completedAt`, making status projections look stuck even after the run could complete.
  Alternatives considered: database cleanup only, rejected because future auto scheduler ticks would recreate the same noisy attempt ledger until code stopped keying non-terminal attempts by advance tick.

[2026-06-07T12:04:00Z] DECISION: Run operational retention cleanup opportunistically on new Auto Review starts.
  Context: The user wants old job/status data pruned automatically to prevent database bloat without deleting Storyboard Review projects or user-visible outputs.
  Alternatives considered: deleting old run/stage/artifact rows, rejected because those are product history and project outputs; cleanup is limited to terminal-run operational tables older than 3 days.

[2026-06-07T14:45:00Z] DECISION: Allow parallel Marketplace Auto Review runs per product.
  Context: The Auto UI was blocked even with no run rows for the product because compliance risk was a hard blocker, and the database still enforced a same-user/same-product active unique index.
  Alternatives considered: keeping active-run resume as the primary action, rejected because the product requirement is to start a new Auto run even while an older run is active; idempotency keys remain the duplicate request guard.

[2026-06-13T02:27:06Z] DECISION: Continue the existing Orchestra session for the recurring intermittent preflight failure.
  Context: Existing `orchestra/` artifacts contain prior RCA/fixes for the same Marketplace Auto Review storyboard-grid prompt failure, including prompt hardening and repair/status fixes.
  Alternatives considered: archiving and starting fresh, rejected because it would hide the exact prior-fix trail needed to identify why the issue still escapes.

[2026-06-13T02:35:26Z] DECISION: Remove the backend storyboard-grid contract-lock patch and fail fast on incomplete skill output.
  Context: The recurring production failure showed the underlying skill/runtime output still intermittently omitted exact 9:16/3x3 anchors. The old service-level contract lock could make invalid skill output look valid, while some runtime-backed issues were downgraded to warnings.
  Alternatives considered: adding another post-skill patch or retry fallback, rejected because it would keep hiding the source defect and make failures appear random.

[2026-06-13T02:48:54Z] DECISION: Treat storyboard-grid prompt quality gaps as warnings, not permanent pre-provider blockers.
  Context: User clarified the product goal: the workflow should still generate multiple image attempts so users can choose or manually repair in Storyboard Review, while skill output quality is improved at the source.
  Alternatives considered: keeping hard blockers for exact 3x3/frame/product-lock prompt gaps, rejected because it stops the job before any selectable image exists.

[2026-06-13T03:29:15Z] DECISION: Fix Product Detail status freshness at the React Query boundary instead of adding another backend fallback.
  Context: The stale-until-F5 symptom matched a frontend cache/polling race: `listAutoReviewRuns` was invalidated with `{ productId, limit: 8 }` while the visible query often used `{ productId, limit: 3, summary: true }`, and polling stopped when the current cache had no active run.
  Alternatives considered: increasing backend status fallbacks or requiring manual refresh, rejected because the backend already had newer state and the UI cache was not reliably asking for it.
