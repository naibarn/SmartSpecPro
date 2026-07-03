
## Gap-closure items (from completeness audit, 2026-07-03)
- [HIGH] section-08 ProviderRoutingPort not wired into pipeline (verticalDramaEpisodePipeline.ts:549 uses createStubProviderRoutingPort; real createVerticalDramaProviderRoutingPort never used). -> being wired by fix agent.
- [MED] section-08 QC not enforced as gate on runProviderJob (verticalDramaProvider.ts:270-333 gates only routing status + approved, not runQcForStage/stageBlocksPaidGeneration before lifecycle.create). Today jobs are forceMock dry-run so no real paid bypass, but should enforce. -> conductor to close.
- s07 COMPLETE, s09 COMPLETE (audit). Naming: verticalDrama<Name>.ts (no "Service" suffix) = intentional deviation, not a gap.
- [s01 COMPLETE] [s02 MED] VerticalDramaQcReport type missing in shared/verticalDramaSeries/contracts.ts (add run/stage-scoped report row type named in Core Contracts).
- [s03 HIGH] Dashboard menu entry not rendered (verticalDramaSeriesDashboardMenu consumed nowhere; verify menu constants -> client nav wiring).
- [s03 HIGH] VerticalDramaSubShotEditor.tsx missing (flag-gated editor: target-count, per-sub-shot camera/prompt/duration/transition, cut preview).
- [s03 MED] No client-side tests for section-03 (defer-able; server tests exist).
- [s03 LOW] VerticalDramaStageCard not a named component (inline in workspace) — functionally covered.

## UI-WIRING gaps (audit sections 4-6) — dominant incompleteness: components built but not mounted
- [s04 HIGH] VerticalDramaEpisodePage renders placeholder; mount VerticalDramaEpisodeWorkspace (phase progress/approval/runs/memory unreachable). Also wire VerticalDramaRepairDialog.
- [s05 HIGH] No character-stock tRPC surface — add createCharacter/updateCharacter/linkAsset procedures (service verticalDramaCharacterStock.ts exists).
- [s05 HIGH] VerticalDramaCharacterStockPanel missing; Characters tab is placeholder — build + mount.
- [s05 MED] VerticalDramaContactSheetPicker built but not mounted in start-frame stage.
- [s06 HIGH] StoryboardReviewPage.tsx not modified for vertical drama — mount VerticalDramaStoryboardReviewPanel for source==="vertical_drama_series".
- [s06 MED] client lib verticalDramaStoryboardReviewMetadata.ts (+ test) missing.
- [s04 MED] updateSeries + updateEpisodeDraft procedures absent.
- [s04 MED] approveCheckpoint (checkpoint 12) should append summarize_episode_to_series_memory event.
Verdict: services/contracts/components COMPLETE per plan; user-facing WIRING incomplete — this is the real gap to close (Wave C).

## Gap-closure A results (done)
- [s02] VerticalDramaQcReport type: ADDED. [s08] QC gate on runProviderJob: ADDED. 27 tests pass.
- [s03 menu] FALSE POSITIVE — menu item already exists (packages/shared/src/constants/menu.ts:51, requiresFeature verticalDramaSeriesDashboardMenu) and IS rendered via Dashboard.tsx → getResolvedMenuItems. Regression test added.
- [s03 SubShotEditor] component CREATED (VerticalDramaSubShotEditor.tsx); MOUNT into VerticalDramaEpisodeWorkspace video-motion step still pending (small follow-up).
## Wave C dispatched: C1 (episode workspace mount + updateSeries/updateEpisodeDraft + checkpoint→memory), C2 (characters router + panel + mount), C3 (storyboard review panel mount + metadata lib).
## After Wave C: wire verticalDramaCharactersRouter into server/routers.ts; mount SubShotEditor; full tsc; vitest; security gate.
