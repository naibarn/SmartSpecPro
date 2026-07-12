<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-neutral-schema-audio-layer-compiler
section-02-motion-template-registry
section-03-worker-contract-golden-fixtures
section-04-queue-lane-a-worker
section-05-db-tables-brand-kit
section-06-claim-validation-qa-loop
section-07-router-async-queue-harness
section-08-studios-ui
END_MANIFEST -->

# Feature 133 — Implementation Sections Index (Phase 1 / MVP)

Source of truth: `../claude-plan.md` (architecture/how) + `../claude-plan-tdd.md`
(tests-first) + `../claude-spec.md` (Phase-1 scope) + `../claude-research.md`
(exact reuse signatures & test conventions) + `../spec.md` (full platform,
authoritative for intent; §6 is the normative render contract).

Work directory root for all code: `/home/dev/projects/SmartSpecPro/apps/web`
(pnpm workspace). Follow the repo TDD + Database Safety protocols.

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-neutral-schema-audio-layer-compiler | - | 02, 04, 06, 07 | Yes (foundation) |
| section-02-motion-template-registry | 01 | 06, 07, 08 | Yes (after 01) |
| section-03-worker-contract-golden-fixtures | 01 | 04 | Yes (after 01) |
| section-04-queue-lane-a-worker | 01, 03 | 07 | No |
| section-05-db-tables-brand-kit | - | 07 | Yes (independent) |
| section-06-claim-validation-qa-loop | 01, 02 | 07 | Yes (after 01,02) |
| section-07-router-async-queue-harness | 01, 02, 04, 05, 06 | 08 | No (integrator) |
| section-08-studios-ui | 07 | - | No (surface) |

## Execution Order (batches)

- **Batch 1 (parallel):** section-01, section-05 (05 is DB-only, no code deps on 01).
- **Batch 2 (parallel):** section-02, section-03 (both need 01).
- **Batch 3 (parallel):** section-04 (needs 01,03), section-06 (needs 01,02).
- **Batch 4:** section-07 (integrator — needs 01,02,04,05,06).
- **Batch 5:** section-08 (UI surface — needs 07).

## Section summaries

1. **section-01-neutral-schema-audio-layer-compiler** — `VideoProjectDocument`
   Zod schema (`shared/videoIntelligence/projectSchemas.ts`), additive `audio`
   layer variant on `RemotionLayerSchema` + its render in
   `GenericTemplateComposition.tsx`, the pure `videoProjectCompiler.ts`
   (template expansion, caption-cue→text-layer, frame offset, 40-layer split,
   brand-lock enforcement, cost model). Plan §2, §4.3; TDD Section 1.
2. **section-02-motion-template-registry** — `shared/videoIntelligence/motionTemplates.ts`
   metadata + `server/remotion/templates/*` 10 pure `layer_pack` builders +
   registry guard + `selectTemplatesFor`. Plan §4; TDD Section 2.
3. **section-03-worker-contract-golden-fixtures** — new consts + schema in
   `shared/workerRuntime.ts` (`remotionRenderVideoWorkerInputSchema`,
   PROGRESS_STAGES / FAILURE_CODES / CAPABILITY_FAMILIES / version consts),
   event-contract branch in `workerRegistryService.assertRuntimeSpecificJobEventContract`,
   golden fixtures in `shared/__fixtures__/` + round-trip test. Plan §3; TDD
   Section 3.
4. **section-04-queue-lane-a-worker** — `queueRemotionRenderVideoJob`
   (`workerSchedulerService.ts`, capability gating + preview cap + credits),
   Lane-A dispatch branch in `hyperframesRenderWorker.ts` calling
   `executeRemotionRender` + post-passes, pure `buildLoudnormPassArgs` +
   ass_burn/segment_concat argv reuse. Plan §5; TDD Section 4.
5. **section-05-db-tables-brand-kit** — Drizzle migration for `video_projects`,
   `video_project_revisions`, `brand_kits` (Database Safety Protocol). Plan §6;
   TDD Section 5.
6. **section-06-claim-validation-qa-loop** — pure `validateProjectClaims`,
   `videoProjectQualityLoop` (single-round DI), deterministic metric helpers,
   cost estimator, `skills/video-project-quality-review/` skill folder. Plan §7,
   §8; TDD Section 6.
7. **section-07-router-async-queue-harness** — `videoProjects` tRPC router (CRUD
   w/ optimistic concurrency, stage runners, TTS narration, exportCaptions,
   compile/queueRender), `videoProjectAssetResolver.ts` + `buildAssetManifest`,
   `video_intelligence_jobs` BullMQ queue, render smoke harness script, router
   registration. Plan §9; TDD Section 7.
8. **section-08-studios-ui** — feature flags (F133A/B/C + motion), routes +
   `VideoStudioListPage`/`VideoStudioWorkspacePage`, Catalog + Motion flows,
   `@remotion/player` preview, RenderJobsPage label, sidebar, i18n. Plan §10;
   TDD Section 8.

## Cross-Section Consistency Resolutions (AUTHORITATIVE — read before implementing)

These resolve ownership/ordering ambiguities found in the Phase-C cross-section
review (`../reviews/section-cross-consistency-round-1.md`). Where a section body
disagrees, THIS list wins.

1. **`shared/videoIntelligence/cost.ts` is created by section-01 only.**
   `estimateRenderCost` + `RenderCostEstimate` live there (depends only on the
   frozen `RemotionTemplateConfig`). Section-02 creates ONLY `cost.test.ts` and
   imports `estimateRenderCost` — it must not re-create the module. The compiler
   (section-01) imports it from `cost.ts`.

2. **Feature flags are added first, by section-04.** The four F133 flags
   (`videoIntelligencePlatformEnabled` F133A, `remotionRenderVideoJobEnabled`
   F133B, `videoIntelligenceCatalogStudioEnabled` F133C,
   `videoIntelligenceMotionStudioEnabled` F133-motion) are added to
   `shared/featureFlags.ts` (3-edit pattern) as section-04's first step, because
   section-04 (queue, F133B) and section-07 (router, F133A) consume them in
   batch 1. Section-08 grep-guards and completes/verifies all four — never
   double-declares a key (a duplicate object key is a tsc error).

3. **`BrandKit` compiler type lives in `shared/videoIntelligence/` (section-01).**
   Client-safe, no DB import: `{ colors, fonts, captionPresetId, locks }`.
   Section-05's `brand_kits` row (`BrandKitRow`) is a structural superset;
   section-07 loads a row and passes the token subset as `ctx.brandKit`.

4. **`SegmentPlan` shape is owned by section-01** (`{ parts: { index,
   durationInFrames }[] }`); section-03's `.passthrough()` schema accepts it (and
   imports `SegmentPlanSchema` from section-01 if exported).

5. **`ResolvedCatalogFacts` is resolved by section-07 at render time.**
   `queueRender(final)` for a catalog project loads
   `listMarketplaceInsightsByProduct` for `sourceRefs.productIds`
   (`claimResolutionsJson` + latest price facts) → `ResolvedCatalogFacts` → passes
   to `validateProjectClaims` (section-06). Motion projects pass `null` and skip
   the claim gate.

## Global constraints (every section)

- **Reuse-first** (`claude-plan.md` §12): never rebuild the Remotion engine,
  ffmpeg builders, TTS, transcription, worker fabric, storage, or feature-flag
  plumbing. Extend via additive variants / new consts + a consumer branch / new
  pure services / new tables. Private helpers are extended in-file or replaced by
  a fresh pure helper — never imported cross-module (research C2).
- **Tests first** per `claude-plan-tdd.md`; run the full existing suite after
  each section — frozen contracts (RemotionTemplateConfig, VD render graph,
  worker domain) must stay green. `pnpm check` (tsc) is part of the gate.
- **Security**: tenant+owner isolation on every new table/query; SVG
  validate-don't-strip; no scene3d/user code; asset URLs via storage proxy /
  staged local server (allowlist); no secrets in skill prompts.
- **Data safety**: backup affected tables → `pnpm db:push` → verify row counts →
  complete the migration cycle immediately (section-05).
