# Section 03 — Unified QC enforcement

## Ownership

Define and enforce one server-side production QC policy across draft creation, paid media generation, repair/re-review, and final assembly.

## Target files

- `apps/web/shared/featureFlags.ts`
- `apps/web/server/services/verticalDramaProductionQcGate.ts` (new preferred seam)
- `apps/web/server/routers/verticalDramaSeries.ts`
- `apps/web/server/routers/verticalDramaEpisodes.ts`
- `apps/web/server/services/verticalDramaEpisodePipeline.ts`
- `apps/web/server/services/verticalDramaProviderRouting.ts`
- `apps/web/server/services/verticalDramaEpisodeStageJobs.ts`
- `apps/web/client/src/components/verticalDramaSeries/CreateSeriesWizard.tsx`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`

## TDD

Write fail-closed gate tests for missing/failed/stale QC, tie-in QC, unavailable provider QC, dry-run, legacy compatibility, and successful pass. Add router tests proving all three paid/final entry points call the shared resolver.

## Acceptance

- UI state cannot bypass server policy.
- Every block returns an actionable next step.
- Provider QC is explicitly `passed`, `failed`, or `unavailable`; no implicit pass.
- Repair/re-review updates the exact artifact consumed by the gate.
- Gate receipts include the consumed content revision and policy version; stale passes are rejected.
- Final assembly is covered by the same policy, not only start-frame/video generation.

## UI/UX Contract

- **Target user / job-to-be-done:** creator must know whether the current draft/episode is ready, what blocked it, and which single action unlocks the next paid step.
- **Surface inventory:** Create-Series Wizard draft QC panel; episode storyboard/production wizard QC card; start-frame/video/assembly action states; repair/re-review result state.
- **Component map:** reuse `VerticalDramaDraftQualityQcPanel`, the existing storyboard quality-review card, and production-wizard status rows; add a shared gate-status view model rather than three independent status vocabularies.
- **State matrix:** `not_run`, `queued`, `running`, `passed`, `failed_repairable`, `blocked_missing_reference`, `blocked_missing_qc`, `unavailable`, `override_audited`, `ready`.
- **Responsive/accessibility:** blocked reasons and next actions must remain visible at narrow widths; use semantic status text and live-region updates for queued/running/completed QC; do not encode pass/fail by color alone.
- **Copy contract:** Thai is the default. Every blocking state must name the missing prerequisite and action, for example “ยังไม่มีผล QC — ตรวจคุณภาพก่อนสร้างภาพ”; English fallback must carry the same meaning. Avoid saying “ผ่านแล้ว” when the result is only advisory or structural.
- **Browser evidence required:** no-preset and selected-preset create gates, sequel/special-edition lineage states, uploaded-reference missing/resolved states, QC repair/re-review, and final assembly blocked/pass states.

## Risks

Avoid making advisory quality review appear to be final approval. Preserve grandfather behavior for existing records but make the compatibility path explicit and auditable. Do not call a dry-run routing plan a provider artifact or visual-QC pass.
