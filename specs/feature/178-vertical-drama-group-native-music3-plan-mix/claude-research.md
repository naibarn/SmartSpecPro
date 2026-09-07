# Deep Plan Research — Feature 178

## Research decision

- Codebase research: yes. This is an existing git repository with Web, Worker App, PostgreSQL/Drizzle, shared contracts, and existing Features 176/177 implementation.
- Web research: skipped. The requested architecture is governed by the repository's existing Feature 176/177 contracts and MiniMax/Worker runtime policy; no new external API or library decision is required at planning time.
- Testing research: yes. Existing focused Vitest, Rust, Worker TypeScript, migration ledger, and bounded no-credit smoke patterns are the required verification surfaces. Full `npm run check` is excluded when the RAM constraint is active.
- SocratiCode: unavailable in this session; targeted `rg` and line-range reads were used as the fallback.

## Existing architecture findings

### Production grouping and UI

- `apps/web/client/src/pages/VerticalDramaSeriesDetailPage.tsx` mounts `VerticalDramaProductionEpisodesPanel` for the `production` tab and passes `seriesId` plus archive `readOnly` state.
- `VerticalDramaProductionEpisodesPanel.tsx` owns the create form, polls `verticalDramaSeries.get`, and renders `ProductionEpisodeCard` only when `productionEpisodesManifest.episodes` is non-empty.
- The current `Sound & Music Score` lane is inside `ProductionEpisodeCard`, so an empty/new Production page has no audio heading. This matches the supplied screenshot: it shows the creation form and button, not a completed group card.
- The current lane embeds the existing `VerticalDramaEmotionScorePanel` once per member Sub-Episode. This is a safe compatibility aggregation, not a group-native plan/mix.
- Current UI uses shadcn-style `Card`, `Badge`, `Button`, native `<details>/<summary>`, `data-testid`, Tailwind semantic classes, and 3-second query polling in the member panel. Feature 178 should reuse these patterns and add an always-visible readiness section.

### Production manifest and artifact boundary

- `apps/web/shared/verticalDramaSeries/assembly.ts` defines `VerticalDramaProductionEpisodeGroupState` and the series-level JSONB `VerticalDramaProductionEpisodesManifest`.
- The current manifest has group index, group size, ordered member episode numbers, status, video URL, duration, render options, BGM, credits, and overlays. `subEpisodeIds` has been added additively for stable member mapping.
- `verticalDramaProductionEpisodeAssembly.ts` loads owned episode rows, groups usable compiled videos, persists pending groups, queues `production_episode_group` FFmpeg jobs, and patches completed/failed state.
- The current production completion path stores a URL but does not yet expose a complete checksummed managed artifact contract equivalent to per-episode compiled video. Group-native audio must close this gap before queueing Worker media jobs.

### Existing audio contracts

- `verticalDramaAudioAnalyses`, `verticalDramaEmotionPlans`, and `verticalDramaEmotionPlanRevisions` are episode-scoped and require `episodeId`.
- `verticalDramaAudioScoring.ts` creates skill-first semantic analysis, validates plan hashes, separates critique/approval/rights, and the coordinator queues `episode_audio_analyze`, `minimax_music3_generate`, and `episode_score_mix` only after final-cut/binding/artifact gates.
- `audioScoringContracts.ts` requires `seriesId` and `episodeId` in the base payload. It already carries checksummed media refs, edit-map refs, plan hash/revision, rights snapshot, runtime identity, analysis artifacts, and selected take refs.
- `workerRegistryService.ts` and Worker Rust code already publish transcript, edit-map, music-take, score-mix, export, and QC artifacts with provenance. The group-native extension should add an explicit scope rather than overload episode IDs.

### Worker and FFmpeg findings

- Worker Rust dispatches the current audio kinds in `worker_loop.rs`; `run_episode_score_mix` in `media_pipeline.rs` performs the existing deterministic audio mix graph and post-encode flow.
- Existing capability admission distinguishes GPU-required MiniMax generation from CPU-heavy analysis/mix. The group contract must preserve this admission and truthful failures for missing GPU/runtime/model.
- The current Worker code is capable of a group source if the payload provides a managed source ref, checksum, revision, and group scope. It must not download an arbitrary `videoUrl`.

## UI evidence and limitation

- Local source evidence confirms the route wiring and conditional rendering described above.
- A read-only `curl` to the hosted URL returned HTTP 200 and the application shell, but this environment did not have an authenticated browser session. It does not prove the hosted authenticated Production tab has the current bundle or database state.
- Browser screenshots at mobile/tablet/desktop are therefore a required implementation-phase gate, not a completed proof in this planning session.

## Testing conventions to carry into the plan

- Add focused Vitest tests for readiness/card state and member/group scope mapping.
- Add server service/router tests for ownership, stale group revisions, missing final-cut artifacts, idempotency, rights, and queue admission.
- Extend shared contract tests for explicit `production_episode` scope and mixed-scope rejection.
- Extend Worker TypeScript/Rust tests for group payload validation, artifact metadata, genuine MiniMax identity, FFmpeg mix inputs, post-encode QC, and terminal failure mapping.
- Apply additive Drizzle migration and verify migration ledger/state against the configured PostgreSQL database.
- Use targeted parse/build/smoke checks rather than `npm run check` when RAM is insufficient.

### Follow-up audit findings

- The group render completion boundary is `apps/web/server/services/verticalDramaFfmpegAssemblyRunner.ts`; the current group projection is primarily URL-based, so Feature 178 must persist managed storage/checksum/artifact revision there.
- Existing audio scheduler job kinds are `episode_audio_analyze`, `minimax_music3_generate` and `episode_score_mix`; Feature 178 uses these kinds with an explicit `production_episode` scope discriminator rather than inventing parallel names.
- The repository's tenant feature flag registry is `apps/web/shared/featureFlags.ts`; the plan defines `verticalDramaGroupNativeMusic3` as default-off while keeping the explanatory readiness card visible.
- Feature 176/177 require preserved timing origins, exact skill sequence/caption authorization, independent rights lifecycle, durable attempt ledger, bounded artifact parsing, and measured QC thresholds; these are now explicit Feature 178 acceptance gates.
- A group implementation must distinguish the assembly `compositionEditMap` from
  the Worker-produced ASR `speechEditMap`; requiring the latter as an initial
  input would create a circular dependency.
- Existing Worker output uses `score_mix_export` and `score_mix_qc` artifact
  types, so the shared artifact-kind contract must be extended consistently.
- The Production tab can show many groups; a batch readiness projection and
  bounded polling are required to avoid N+1 queries and unbounded timers.
