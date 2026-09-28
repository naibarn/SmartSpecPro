# Synthesized Specification — Feature 178

## Goal

Implement a truthful, durable, group-native MiniMax Music 3 plan/mix pipeline for each publishable Production Episode, while making the Production-tab audio workflow discoverable before and after Production Episode assembly.

## Required behavior

- Production Episode scope is explicit and distinct from Sub-Episode scope.
- The group final cut is a managed, checksummed, revisioned artifact before Worker admission.
- Web/skill owns group semantic analysis, critique, plan review, rights and authorization.
- Worker owns ASR/edit-map, genuine MiniMax Music 3 generation, audio processing, FFmpeg score mix, post-encode and QC, plus artifact publication.
- Every transition is durable, idempotent, tenant-owned, and truthful on failure.
- Existing member-level Feature 176/177 records remain backward compatible and are shown only as source/member context.
- The Production tab always exposes an audio readiness heading, including the no-group empty state.
- The group card exposes plan, rights, queue, takes, mix/QC, playback/provenance and read-only states.
- The semantic sequence remains `analyze_regions` → `critique_plan` → optional
  revision/re-critique → `compile_music_caption` → `critique_caption` → exact
  caption authorization, with timing origins preserved.
- Rights revocation, license/attribution provenance, bounded artifacts, GPU
  feasibility, durable attempt ledger and feature-flagged canary rollout are
  part of completion.

## Constraints

- No mock, stock, synthetic, alternate-model, silent provider fallback, fabricated metrics or URL-only media admission.
- Additive migrations only; deterministic backfill only; no invented checksums or data mutation during diagnosis.
- Preserve existing unrelated dirty work.
- Focused tests/parse/build/smoke are acceptable when `npm run check` is too memory-intensive.

## Technical baseline

- Web: React, tRPC, Drizzle/PostgreSQL, shared Zod contracts, existing Worker scheduler and Feature 176/177 services.
- Worker: Tauri/Rust loop, TypeScript UI/contracts, FFmpeg media pipeline, GPU/MiniMax runtime.
- Existing UI surface: `VerticalDramaSeriesDetailPage` → `VerticalDramaProductionEpisodesPanel` → Production Episode cards.
- Existing audio surface: episode-scoped `VerticalDramaEmotionScorePanel`, `verticalDramaAudioScoring` router/services, and audio Worker job contracts.
- Final-cut completion boundary: `verticalDramaFfmpegAssemblyRunner.ts` must
  persist managed artifact identity into the group projection, not only a URL.

## UI finding

The current `Sound & Music Score` heading exists only inside a card rendered when `productionEpisodesManifest.episodes` is non-empty. The supplied screenshot is the pre-assembly form, so no card and no heading are rendered. The plan must add a readiness section to the empty/pre-assembly state and a group-native lane to completed/pending cards.

## Success criteria

An engineer can implement the feature from the plan without guessing scope, data ownership, payload identity, state transitions, UI states, responsive behavior, accessibility, migration/backfill safety, or verification evidence.
