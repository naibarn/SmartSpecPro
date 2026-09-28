# Orchestra Contracts — Feature 133 deep-implement

Ownership boundaries per wave (disjoint file sets — no two same-wave agents touch
the same file). Cross-section type/enum contracts are frozen by the section files
+ index.md resolutions.

## Wave 1
- **section-01 (ssp-backend)** OWNS:
  - `apps/web/shared/videoIntelligence/projectSchemas.ts` (new)
  - `apps/web/shared/videoIntelligence/cost.ts` (new — cost model; resolution #1)
  - `apps/web/shared/videoIntelligence/BrandKit` type (in shared/videoIntelligence/)
  - `apps/web/shared/remotion/layerTemplateSchemas.ts` (MODIFY — additive `audio` variant only)
  - `apps/web/server/remotion/GenericTemplateComposition.tsx` (MODIFY — `audio` case)
  - `apps/web/server/services/videoProjectCompiler.ts` (new)
  - tests under `shared/videoIntelligence/__tests__`, `shared/remotion/__tests__`,
    `server/services/__tests__/videoProjectCompiler.test.ts`
  - EXPORTS consumed downstream: `VideoProjectDocument(Schema)`, `SceneSchema`,
    `AudioTrackSchema`, `ClaimRecord(Schema)`, `TemplateBuildContext`,
    `AssetResolver`, `RenderCostEstimate`, `estimateRenderCost`, `SegmentPlan`,
    `BrandKit`, `VideoProjectCompileError`, `BrandLockViolationError`.

## WAVE 1 COMPLETE (verified) — updated real signatures for downstream sections

**`compileVideoProject` gained an additive 3rd optional param** (deviation from
the section-01 doc's 2-arg signature, made necessary because compile is
synchronous so a lazy `import()` of the registry wasn't possible):

```ts
// apps/web/server/services/videoProjectCompiler.ts
export type MotionTemplateBuilder = {
  build(params: Record<string, unknown>, ctx: TemplateBuildContext): RemotionLayer[];
  paramsSchema?: { parse(input: unknown): Record<string, unknown> };
};
export type TemplateRegistryLookup = (templateId: string) => MotionTemplateBuilder | undefined;
export type CompileVideoProjectDeps = { resolveTemplate?: TemplateRegistryLookup };

export function compileVideoProject(
  document: VideoProjectDocument,
  ctx: TemplateBuildContext,
  deps?: CompileVideoProjectDeps,   // NEW — optional, defaults to "no templates known"
): CompileResult
```

**ACTION FOR section-02**: `server/remotion/templates/index.ts`'s
`MOTION_TEMPLATE_REGISTRY` entries must structurally satisfy `MotionTemplateBuilder`
(`{ build, paramsSchema? }`) so section-07 can pass
`{ resolveTemplate: id => MOTION_TEMPLATE_REGISTRY[id] }` as `compileVideoProject`'s
3rd arg without an adapter. If your registry's `MotionTemplate` shape differs
(e.g. wraps `build`/`paramsSchema` inside a `meta` object), either match the
structural shape directly or export a tiny adapter function
`toTemplateRegistryLookup(registry): TemplateRegistryLookup` for section-07 to use.

**ACTION FOR section-07**: when compiling, pass
`compileVideoProject(document, ctx, { resolveTemplate: <lookup over section-02's registry> })`.

Other Wave-1 facts to reuse (do not re-derive):
- `BrandKit = { colors, fonts, captionPresetId, locks }` — `apps/web/shared/videoIntelligence/brandKit.ts`.
- `RemotionAudioLayer` — additive variant in `shared/remotion/layerTemplateSchemas.ts`, already wired into `GenericTemplateComposition.tsx`.
- DB: `video_projects`, `video_project_revisions`, `brand_kits` tables live and migrated;
  `videoProjectRepo.ts` exports `insertVideoProject, getVideoProject, listVideoProjects,
  saveVideoProjectDocument (optimistic concurrency), listVideoProjectRevisions,
  restoreVideoProjectRevision, insertBrandKit, getBrandKit, listBrandKits, updateBrandKit,
  deleteBrandKit` + `VideoProjectRevisionConflictError`, `VideoProjectNotFoundError`,
  `ProjectAuthScope`. Table symbols: `videoProjects`, `videoProjectRevisions`, `brandKits`
  (from `drizzle/schema.ts`).
- Known pre-existing typecheck noise (NOT caused by this feature — ignore in gates):
  ioredis 5.10/5.11 dual-version errors in `notificationWebhookService.ts`,
  `verticalDramaStoryJobs.ts`, `webhookDeliveryService.ts`, `webhookDispatchQueue.ts`;
  Radix `ref` type errors in `packages/ui/src/components/ui/*.tsx`. 129 total pre-existing
  errors as of Wave 1 gate — track this baseline number in future gates.
- **section-05 (ssp-database, SOLE DB writer)** OWNS:
  - `apps/web/drizzle/schema.ts` (MODIFY — append `video_projects`,
    `video_project_revisions`, `brand_kits` + `$infer` exports)
  - migration (`pnpm db:push` or manual sql) — BACKUP FIRST
  - `apps/web/server/services/videoProjectRepo.ts` (new)
  - `server/services/__tests__/videoProjectRepo.test.ts`

## Wave 2
- **section-02 (ssp-backend)** OWNS:
  - `apps/web/shared/videoIntelligence/motionTemplates.ts` (new — metadata + select)
  - `apps/web/server/remotion/templates/*.ts` (new — 10 builders + index registry)
  - tests under `server/remotion/templates/__tests__`, `shared/videoIntelligence/__tests__/{cost.test.ts,motionTemplates.select.test.ts}`
  - NOTE resolution #1: cost.ts is created by section-01; section-02 writes only cost.test.ts.
- **section-03 (ssp-backend)** OWNS:
  - `apps/web/shared/workerRuntime.ts` (MODIFY — add remotion_render_video consts + schema)
  - `apps/web/server/services/workerRegistryService.ts` (MODIFY — event-contract ternary branch only)
  - `apps/web/shared/__fixtures__/remotionRenderVideoWorkerInput-{valid,invalid}.json` (new)
  - tests: `shared/__tests__/remotionRenderVideoWorkerInput.test.ts`,
    `server/services/__tests__/assertRuntimeSpecificJobEventContract.remotion.test.ts`

## WAVE 2 COMPLETE (section-02 verified) — registry integration confirmed

`MOTION_TEMPLATE_REGISTRY[id]` = `{ meta, paramsSchema: ZodTypeAny, build }` is
structurally assignable to `MotionTemplateBuilder` **directly** (verified empirically
via `pnpm check`, 0 new errors) — **no adapter needed**.

**ACTION FOR section-07**: pass
`compileVideoProject(document, ctx, { resolveTemplate: id => MOTION_TEMPLATE_REGISTRY[id] })`
directly, importing `MOTION_TEMPLATE_REGISTRY` from `server/remotion/templates/index.ts`.

Other facts: `luxury_end_card` template takes `logoAssetId` as a builder param
(not `ctx.brandKit.logo` — BrandKit has no `logo` field, only colors/fonts/
captionPresetId/locks). `selectTemplatesFor` + `MOTION_TEMPLATE_META` exported
from `shared/videoIntelligence/motionTemplates.ts` (client-safe) for section-08's
template picker.

**KNOWN PRE-EXISTING INFRA ISSUE (not Feature 133, do not chase in future gates):**
running the FULL `pnpm test` suite (not scoped to Feature 133 files) shows 168
failing test files — a vitest "Worker exited unexpectedly" crash plus an
`agencyStream.test.ts` db-mock bug. Confirmed pre-existing (section-02 only added
new files, touched nothing existing). **Gates for this feature must run scoped
test paths, not the full suite**, to avoid noise from this unrelated issue.

## WAVE 2 COMPLETE (section-03 verified) — updated real signatures

section-03's section file on disk was found empty/broken; the agent
reconstructed it correctly from claude-plan.md/claude-research.md/spec.md and
delivered per the original design. Two deviations downstream sections must know:

- **`remotionRenderVideoSegmentPlanSchema`** in `shared/workerRuntime.ts` is a
  LOCAL structurally-compatible schema (`{ parts: { index, durationInFrames }[] }`),
  NOT an import of section-01's `SegmentPlan` type (that type lives in
  `server/services/videoProjectCompiler.ts` — importing it into `shared/` would
  create a shared→server dependency). Any real `SegmentPlan` value satisfies it.
- **`compositionId` is `z.literal("GenericTemplate")`**, re-declared (not imported
  from `server/remotion/Root.tsx`'s `GENERIC_TEMPLATE_COMPOSITION_ID`, since that
  file is server-only `.tsx`). Section-07/04 must keep this literal in sync with
  `GENERIC_TEMPLATE_COMPOSITION_ID` by convention — no compile-time link exists.
- ALL objects in `remotionRenderVideoWorkerInputSchema` are `.strict()` (unlike
  the existing hyperframes schema) — this is intentional per spec §6.2 (drift guard).

Exports from `apps/web/shared/workerRuntime.ts` for section-04/07 to import:
`REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES` (non-empty — THE anti-mis-claim gate),
`REMOTION_RENDER_VIDEO_PROGRESS_STAGES`, `REMOTION_RENDER_VIDEO_FAILURE_CODES`,
`REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION` ("2026-07-12"),
`REMOTION_RENDER_VIDEO_RENDERER_POLICY_VERSION` ("remotion-1"),
`remotionRenderVideoWorkerInputSchema`, `RemotionRenderVideoWorkerInput` type.

Regression: 97 pre-existing worker-domain tests all still pass (workerRuntime,
workerRegistryService, workerJobMonitorService, workerArtifactService,
workerRuntime routes). Typecheck delta: 0 (still 129 baseline, none in section-03 files).

## Wave 3
- **section-04 (ssp-backend)** OWNS:
  - `apps/web/shared/featureFlags.ts` (MODIFY — 4 F133 flags, created here; resolution #2)
  - `apps/web/server/services/workerSchedulerService.ts` (MODIFY — queueRemotionRenderVideoJob)
  - `apps/web/server/workers/hyperframesRenderWorker.ts` (MODIFY — remotion_render_video dispatch branch)
  - `apps/web/server/services/remotionPostPassArgs.ts` (new)
  - tests: queue, post-pass argv, dispatch stage-sequence.
- **section-06 (ssp-backend)** OWNS:
  - `apps/web/server/services/validateProjectClaims.ts` (new)
  - `apps/web/server/services/videoProjectQualityMetrics.ts` (new)
  - `apps/web/server/services/videoProjectQualityLoop.ts` (new)
  - `apps/web/skills/video-project-quality-review/` (new skill folder)
  - tests for each.

## Wave 4
- **section-07 (ssp-backend)** OWNS:
  - `apps/web/server/services/videoProjectAssetResolver.ts` (new)
  - `apps/web/server/routers/videoProjects.ts` (new)
  - `apps/web/server/services/videoIntelligenceJobs.ts` (new BullMQ queue)
  - `apps/web/server/routers.ts` (MODIFY — register router)
  - `apps/web/scripts/video-intelligence-render-smoke.ts` (new) + package.json script
  - tests: router crud/render, asset resolver, jobs.

## Wave 5
- **section-08 (ssp-frontend)** OWNS:
  - `apps/web/shared/featureFlags.ts` (verify/complete — grep-guard, no double-declare)
  - `apps/web/client/src/App.tsx` (MODIFY — routes + guard)
  - `apps/web/client/src/pages/VideoStudioListPage.tsx`, `VideoStudioWorkspacePage.tsx` (new)
  - `apps/web/client/src/components/videoStudio/*` (new)
  - `apps/web/client/src/pages/RenderJobsPage.tsx` (MODIFY — label)
  - `packages/shared/src/constants/menu.ts` (MODIFY — sidebar)
  - `apps/web/package.json` (add @remotion/player)
  - client tests.
