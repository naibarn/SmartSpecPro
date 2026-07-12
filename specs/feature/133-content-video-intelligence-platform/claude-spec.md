# Feature 133 — Synthesized Spec for Phase 1 (MVP) Implementation

> This is the **implementation-scoped** specification the plan is built from.
> The authoritative full-platform spec is `spec.md` (all 25 sections); this
> file narrows it to Phase 1 and folds in the interview decisions
> (`claude-interview.md`) and the exact reuse signatures
> (`claude-research.md`). Where this file and `spec.md` differ, `spec.md`
> governs *intent* and this file governs *Phase-1 scope*.

Feature branch base: `main`. Feature dir: `specs/feature/133-content-video-intelligence-platform/`.

---

## 1. Phase 1 objective

Deliver an end-to-end **Neutral Project → compiled Remotion config →
`remotion_render_video` worker job → rendered MP4 → library item**, exposed
through two thin studio surfaces (Catalog Video Studio + Motion Studio), with
the full server⇄worker render **contract in place from day one** even though
only Lane A (server-side in-process worker) executes it in this phase.

Success = a user can, in the running app: pick a marketplace product (or author
a raw project in Motion Studio) → generate/edit a scene plan → generate
narration (TTS) → preview in-browser (`@remotion/player`) → submit a render →
watch it complete on `/render-jobs` → get an MP4 library item — with a single QA
review pass available, brand-kit locks enforced, and product claims validated.

## 2. In-scope (Phase 1)

1. **Neutral Project Schema + compiler** (spec §5) — `VideoProjectDocument`
   Zod schema in `apps/web/shared/videoIntelligence/projectSchemas.ts`;
   `compileVideoProject(document, resolvedAssets): RemotionTemplateConfig` in
   `server/services/videoProjectCompiler.ts`. Reuses the frozen
   `RemotionTemplateConfigSchema` as the compile target (research A1).
2. **`audio` layer type** (spec §5.3) — additive variant on
   `RemotionLayerSchema` in `shared/remotion/layerTemplateSchemas.ts`, rendered
   as Remotion `<Audio>` in `GenericTemplateComposition.tsx`. All existing layer
   tests stay green.
3. **`remotion_render_video` worker job — full contract** (spec §6):
   - `remotionRenderVideoWorkerInputSchema` + `REMOTION_RENDER_VIDEO_{PROGRESS_STAGES,
     FAILURE_CODES,CAPABILITY_FAMILIES}` in `shared/workerRuntime.ts` (embeds
     `RemotionTemplateConfigSchema`; mirrors the `comfy_*`/hyperframes precedent
     — research A5).
   - `queueRemotionRenderVideoJob` in `workerSchedulerService.ts` (research A6),
     capability-family gating non-empty (spec §6.3), credit reservation via
     `reserveWorkerJobCredits` (research A6).
   - `remotion_render_video` branch in `assertRuntimeSpecificJobEventContract`
     (research A7).
   - **Lane A execution**: branch in `hyperframesRenderWorker.ts` calling
     `executeRemotionRender` directly (Remotion-native, no engine resolution —
     research A2/A8) + post-passes.
   - **Golden-fixture round-trip test** (spec §6.7) — canonical payload JSON in
     `shared/__fixtures__/`, asserted by the TS schema test (research B6). The
     Rust side is Phase 6.
4. **Post-passes** (spec §5.4-5.5): loudnorm (factor a pure
   `buildLoudnormPassArgs`, reusing the VD filter string `loudnorm=I=-16:TP=-1.5:LRA=11`
   — research A9), optional ASS caption burn (reuse `buildAssSubtitleFile`),
   segment concat (reuse `buildConcatFfmpegArgs`). Argv built by pure functions,
   executed via injectable `FfmpegRunner` (research A9/B3).
5. **Caption cues → Remotion text layers + SRT/VTT export** (spec §5.5) — reuse
   `renderTranscriptCuesAsVtt/Srt` (research A11).
6. **~10 `layer_pack` MVP motion templates** (spec §7.2) — code registry in
   `shared/videoIntelligence/motionTemplates.ts` + pure
   `(params, ctx) => RemotionLayer[]` builders. 2D only; no `scene3d` in Phase 1.
   Metadata style mirrors `shared/hyperframes/templates.ts`.
7. **`video_projects` + `video_project_revisions` tables** (spec §14.1) —
   Drizzle, additive migration, Database Safety Protocol. FK types per research
   A14 (`libraryItems.id` integer, `mediaAssets.id` bigint).
8. **tRPC `videoProjects` router core** (spec §15.1-15.2) — CRUD + stage runners
   (scene plan, narration/TTS, single QA review) + `compileProject`,
   `queueRender`, `getRenderCostEstimate`; render status via existing
   `workerJobs` router. Async generation on new BullMQ queue
   `video_intelligence_jobs` (spec §15.3, VD story-jobs pattern).
9. **Catalog Video Studio** (spec §8.2) — product-sourced flow reading
   `getMarketplaceProductWithAccess`/`listProductImages`/`listInsightsByProduct`
   (research A13); catalog is source of truth; claim validation (spec §11) using
   `claimResolutionsJson`.
10. **Motion Studio (thin)** [interview Q1] — catalog-independent authoring:
    template pick + param edit + preview + render over the same
    `video_projects` document.
11. **TTS narration** [interview Q2] — `ttsService.synthesize` (research A12) →
    `audio` layer → loudnorm.
12. **Brand Kit minimal + locks** [interview Q3] — `brand_kits` table (colors/
    fonts/logo/caption preset + `locks`); locks enforced as hard constraints in
    the compiler (spec §10.3). A locked color/font violation fails compile
    (deterministic check).
13. **Single-round QA** (spec §12) — `videoProjectQualityLoop` with the VD DI
    shape (research A10), one review round in MVP; judge skill
    `video-project-quality-review` + deterministic metrics fed in; claim
    validation included.
14. **`@remotion/player` client preview** (spec §8.6) — render
    `GenericTemplateComposition` in-browser from the compiled config (2D
    templates; poster fallback not needed since no scene3d in Phase 1).
15. **Feature flags** F133A/F133B/F133C (+ F133 Motion Studio gate) per research
    A16; `remotion_render_video` honors F133B as kill-switch.
16. **UI** (spec §16) — `/video-studio` list + `/video-studio/:id` workspace
    (stage rail, per-stage panels, Player preview, QA scorecard, Preview/Final
    render). Reuse Media Studio / storyboard-review / presentation-editor
    patterns. Thai-first i18n.

## 3. Out of scope (deferred to later phases — do NOT build)

- AI Content Studio, Review Remix Studio (Phases 2/4).
- `scene3d` templates + R3F scene library growth, pre-render caching (Phase 5).
- Worker App fleet (Lane B) Rust dispatch + Remotion runtime pack (Phase 6) —
  but the contract/golden-fixture it will consume ships now.
- Media Intelligence `media_clip_index` + semantic search (Phase 4).
- Full multi-round auto-improve QA loop / Auto mode / campaign multi-version
  (Phase 3).
- Expert-mode Video Editor bridge, Vertical Drama export adapter (Phase 6).
- Advanced Brand Kit fields beyond colors/fonts/logo/caption/locks.

## 4. Reuse-first hard rules (spec §2 — enforced)

Do NOT rebuild: the Remotion Phase 7 engine (`RemotionTemplateConfig`,
`GenericTemplateComposition`, `executeRemotionRender`), the ffmpeg builders
(`verticalDramaFinalRenderGraph`/`...EpisodeVideoAssembly`), TTS, transcription,
the worker fabric (`worker_jobs`, claim/event/artifact APIs, `RenderJobsPage`),
storage, or feature-flag plumbing. Extend via: additive schema variant, new
exported consts + a consumer ternary branch, new pure services, new tables.
Private helpers (research C2) are extended in-file or re-factored as fresh pure
helpers — never imported cross-module.

## 5. Cross-cutting requirements

- **Contract fidelity (the render-mismatch guard):** shared Zod schema is the
  single server source of truth; capability-family gating prevents mis-claim;
  per-jobType event/failure enums are enforced; golden fixtures lock the payload
  shape (spec §6, research C1/C3).
- **Security (spec §17):** tenant + owner isolation on every new table/query;
  SVG stays validate-don't-strip; no scene3d/user code in Phase 1; asset URLs
  resolve to storage proxy / staged local server (allowlist); no secrets in
  skill prompts.
- **Data safety (Database Safety Protocol):** backup affected tables before
  `pnpm db:push`, verify row counts, complete the migration cycle immediately.
- **TDD (repo protocol + research Part B):** pure-fn tests for compiler /
  template builders / cost model / loudnorm argv; contract + golden-fixture
  round-trip; mocked-db tRPC tests; QA-loop DI-effect tests; a script-harness
  render smoke (not a Vitest test).
- **Observability (spec §19):** shared `traceId` across audit JSONL +
  `worker_job_events`; render payload embeds `videoProjectId`/`revision` for
  reproducibility.
- **Error codes (spec §20):** `VI_*` client-facing set +
  `REMOTION_RENDER_VIDEO_FAILURE_CODES` worker set.

## 6. Acceptance criteria (Phase 1 done)

1. `VideoProjectDocument` validates and compiles to a schema-valid
   `RemotionTemplateConfig`; invalid docs fail at save/compile, never in a
   worker.
2. A `remotion_render_video` job queued → claimed by the server lane → renders →
   uploads → appears completed on `/render-jobs` with a downloadable MP4 library
   item.
3. A hyperframes-only worker's capability hints do NOT match a
   `remotion_render_video` job (asserted in tests).
4. Golden-fixture round-trip test passes for `remotionRenderVideoWorkerInputSchema`.
5. Catalog Video Studio produces a narrated product video from a real
   marketplace product with claims validated (unmapped/prohibited claims
   flagged; `final` blocked on violation).
6. Motion Studio produces a rendered video from a raw authored project (no
   catalog dependency).
7. Brand-kit locks: a project violating a locked color/font fails compile with a
   clear error.
8. Single QA review pass returns a scorecard + issues; deterministic metrics
   computed in TS and fed to the judge.
9. `@remotion/player` preview matches the worker render for a 2D template.
10. `pnpm check` clean; all existing suites (remotion template/composition, VD
    render-graph, worker domain) stay green; new tests cover each new branch.
