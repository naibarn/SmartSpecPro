# Research Notes

## Confirmed production evidence

- Episode 42 / series 6 selected `higgsfield/grok_video`.
- The persisted clip retained two dialogue lines but the video prompt retained
  zero verbatim lines and the UI showed separate TTS.
- The Higgsfield DB row lacks `configJson.hasAudio` and
  `configJson.nativeAudio`.
- Current storyboard shot 4 differs from its persisted start-frame and motion
  prompt artifacts, proving downstream artifact drift.

## Root causes

- `deriveVerticalDramaCapabilities()` infers native audio only from
  `hasAudio === true || nativeAudio === true`.
- Kie Grok Imagine Video 1.5 has explicit true flags, while DB-only Higgsfield
  and older Kie rows do not.
- `McpMediaModelSeed` has no audio capability field and `buildConfigJson()`
  overwrites DB config without one.
- `grok-video-3` has an explicit stale false flag.
- Tests cover entries independently, not the family invariant.
- Speaker-switch generation returns `data.prompt` without the single-speaker
  verbatim compliance correction.
- Prompt length QC has no protected-fragment contract.
- Storyboard persistence updates only `storyboard`, leaving downstream JSON
  columns live.

## Relevant modules/tests

- `apps/web/server/services/modelRegistry.ts`
- `apps/web/server/services/__tests__/verticalDramaModelCapabilities.test.ts`
- `apps/web/server/routers/__tests__/mediaModels.verticalDramaCapabilityParity.test.ts`
- `apps/web/scripts/seed-media-models-mcp-providers.ts`
- `apps/web/scripts/__tests__/seed-media-models-mcp-providers.test.ts`
- `apps/web/server/services/verticalDramaVideoMotionPromptGeneration.ts`
- `apps/web/server/services/verticalDramaPromptQc.ts`
- corresponding service tests
- `apps/web/shared/verticalDramaSeries/contracts.ts`
- `apps/web/server/services/verticalDramaEpisodePipeline.ts`
- `apps/web/server/routers/verticalDramaEpisodes.ts`
- storyboard panel/copy/tests for stale state

## Dependency/config/security scan

- Node `crypto` is sufficient for deterministic storyboard SHA-256; no new
  dependency is needed.
- No auth/tenant contract changes are required. Existing episode updates remain
  scoped by tenant/user/series/episode.
- The backfill must preserve tenant-independent catalog data and avoid logging
  prompts/dialogue.
- SocratiCode was used during diagnosis; its transport closed during planning,
  so this pass used targeted shell reads.

## Dirty-worktree risk

The MCP seed, episode router, pipeline, and storyboard UI already contain
unrelated modifications. Edits must be hunk-scoped and verified with targeted
diffs; never stage or rewrite entire files mechanically.

