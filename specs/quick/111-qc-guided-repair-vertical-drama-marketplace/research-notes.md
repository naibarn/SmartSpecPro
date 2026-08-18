# Research notes

## Existing Vertical Drama path

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaDraftQualityQcPanel.tsx`
  already renders a deterministic repair plan and confirmation dialog.
- `CreateSeriesWizard.tsx` currently implements `repairDraftQualityQc()` by
  calling `startDraftQualityQc(1)`, so repair is not a distinct command.
- `verticalDramaDraftQualityQc.ts` already owns revise/evaluate, additive merge,
  immutable checks, story-control allowlists, completeness checks, and QC ledger
  persistence.
- `verticalDramaDraftLedger.ts` stores immutable JSON versions and parent/version
  metadata; `verticalDramaDraftQualityQcJobs.ts` persists recoverable QC state.
- `verticalDramaSeries.ts` exposes start/status/select QC procedures with owner,
  tenant, version, and fingerprint checks.

## Existing Marketplace path

- `MarketplaceDraftQualityQcPanel.tsx` only starts initial QC; it has no repair
  plan or repair callback.
- `marketplaceAutoReviewDraftQualityQc.ts` performs baseline plus automatic
  improvement rounds and currently validates complete replacement, immutable
  fields, and shot contract.
- `marketplaceAutoReviewService.ts` builds the QC candidate from run metadata,
  queues `draft_quality_qc`, then applies `result.best.draft` directly to run
  metadata.
- `marketplaceAutoReviewArtifacts` already stores immutable JSON artifacts with
  run/stage/kind/hash indexes; reuse it for candidate snapshots and repair
  lineage instead of adding a table.
- `marketplaceCapture.ts` exposes `startAutoReviewDraftQualityQc`; approval uses
  `assertMarketplaceAutoReviewCreativeQcApproved` and must remain a pass gate.
- Both `StagedCheckpointReviewPanel` and `AutoReviewPlanReviewPanel` host the
  Marketplace QC panel; `StagedCheckpointReviewSurface` owns the mutation hook.

## Relevant safety evidence

- Existing Vertical Drama story-control memory/continuity gates reject malformed
  contracts rather than silently normalizing them.
- Existing Marketplace staged plan revisions invalidate downstream prompt/image/
  video artifacts when the plan changes.
- The worktree contains many unrelated edits and untracked files; no broad
  formatting, staging, cleanup, or reset is allowed.

## Focused test surfaces

- Vertical shared/service/router/UI Draft QC tests.
- Marketplace shared/service QC tests and staged review panel tests.
- New repair service/router/state tests should use injected LLM and storage/job
  dependencies where possible.
