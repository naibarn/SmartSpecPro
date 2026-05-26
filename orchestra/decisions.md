[2026-05-25T00:34:23Z] DECISION: Start a fresh orchestra session for the Production Director concept-card planning task.
  Context: Existing `orchestra/` directory had no `snapshot.json`, so it was treated as stale session state and archived.
  Alternatives considered: Reuse old session files, but they were from unrelated previous work and could pollute this plan.

[2026-05-25T00:34:23Z] DECISION: Treat this request as planning-only, not implementation.
  Context: The user asked "วางแผนงาน" and existing Media Studio files already had uncommitted edits.
  Alternatives considered: Implement immediately, but product-code edits would risk mixing with existing dirty work before plan approval.

[2026-05-25T00:34:23Z] DECISION: Recommend manual per-card infographic generation as MVP default.
  Context: Image generation likely consumes credits and provider resources. Manual generation gives users control while still enabling rich previews.
  Alternatives considered: Auto-generate all four images immediately; deferred because it may surprise users and increase cost.

[2026-05-25T00:52:00Z] DECISION: Implement the approved plan with manual card-level infographic generation.
  Context: The user explicitly approved implementation after the planning pass. The UI now offers four concept cards, per-card regeneration, infographic generation, and fullscreen preview without auto-spending image generation credits.
  Alternatives considered: Auto-generate images for every concept after planning; deferred to avoid hidden cost and slower planning UX.

[2026-05-25T00:52:00Z] DECISION: Store project default media model choices on the Production goal/space contract.
  Context: Production plan generation and downstream node snapshots need stable image/video model choices to avoid accidentally using a tab-selected or provider-default model.
  Alternatives considered: Keep using current Media Studio tab selections only; rejected because project-level production planning needs explicit defaults.

[2026-05-25T01:08:00Z] DECISION: Reconcile infographic image tasks from media history without a frontend timeout.
  Context: Image generation can legitimately take up to 30 minutes. The card now stores local/backend/provider task ids, keeps queued/generating state, and only marks failed when the provider task status becomes failed or cancelled.
  Alternatives considered: Add a 30-minute frontend timeout; rejected because backend/provider status is the source of truth.

[2026-05-25T01:08:00Z] DECISION: Clear infographic output metadata when a single concept card is regenerated.
  Context: Regenerated concept text/storyboard may no longer match the previously generated image.
  Alternatives considered: Preserve old image for comparison; deferred to a future prompt-history feature.
