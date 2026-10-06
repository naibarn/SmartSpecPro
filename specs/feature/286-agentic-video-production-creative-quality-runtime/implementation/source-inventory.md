# Spec 286 R1.7 G0.1 — Source Inventory

**Repository:** `naibarn/SmartSpecPro`  
**Commit:** `4f4e35fadd388a8950cf801cb45c64de46c645c9`  
**Purpose:** Concrete source anchors for implementation. Paths below are authoritative only for the audited commit; implementation must refresh the map if `main` moves materially.

## Core Spec 133 / Video Intelligence

| Source | SHA | Role |
|---|---|---|
| `specs/feature/133-content-video-intelligence-platform/implementation-progress.md` | `65ebd8060d8172593b2bd30c551a574630e7b1eb` | As-built progress and closed gaps |
| `specs/feature/133-content-video-intelligence-platform/implementation-contracts.md` | `8926e39bacd9c0c17fb87a00fe979ec15aa44e6a` | Contract/source ownership map |
| `apps/web/shared/videoIntelligence/projectSchemas.ts` | `5ffad7ef281147af473e3fdfc595cca95c196ded` | Canonical `VideoProjectDocument` |
| `apps/web/shared/videoIntelligence/brandKit.ts` | `6f60a2d96c2e8de8813d09381ced9ba1929d21c6` | Brand Kit shared contract |
| `apps/web/shared/videoIntelligence/motionTemplates.ts` | `c71aa74538aa90ca8e059505e9ce82f41c0712d8` | Motion template metadata |
| `apps/web/shared/videoIntelligence/qaLedger.ts` | `c9eade8b76be492dd71714540928a1d78c936509` | Persisted QA ledger shape |
| `apps/web/server/remotion/templates/index.ts` | `5d2af54404d613d836b24687aa1a3dbd55c84901` | Concrete Motion Template Registry |
| `apps/web/server/services/videoProjectCompiler.ts` | `4b622d5048c4bef69c8d1121621a0269e407ef71` | Neutral document → Remotion compilation |
| `apps/web/server/services/videoProjectRepo.ts` | `9e415f95dfa4ee88b4c0f01d5f91b4fbddbf2932` | Project/revision/Brand persistence |
| `apps/web/server/routers/videoProjects.ts` | `2e9055094bf63f81f0538d4ed518461d1e4f757c` | Canonical project tRPC surface |
| `apps/web/server/services/videoProjectAssetResolver.ts` | `2b53d6e8e51ad45269ddc37c0bb6e3f5da974518` | Owner-checked assets/checksum/SSRF gate |
| `apps/web/drizzle/manual_video_intelligence_tables.sql` | `b9ff3e928bf9b789d349767f36ad04f5104b175b` | Physical tables |

## Planning / QA / repair

| Source | SHA | Role |
|---|---|---|
| `specs/feature/142-video-intelligence-structured-planning-qa-engine/verification-report.md` | `c6b5e948953a1903aac7f007d1f7e5f9e035905b` | Feature 142 verification |
| `apps/web/server/services/videoProjectQualityLoop.ts` | `45be3bc3d39241bf04dc528c02c7dd5e982a18d5` | Bounded QA loop |
| `apps/web/server/services/videoProjectReviewAdapter.ts` | `2e50cde39e13040205e30288484ecda9cbf71c6e` | Skill-first structured review |
| `apps/web/server/services/videoProjectRepairApplier.ts` | `4e26a54bf1e3c63ab1a12dce54a6da14a116b60a` | Deterministic/stage repair |
| `apps/web/server/services/videoProjectMotionDirector.ts` | `a6daa31db0a5678012df83d072f1bffade3f83cd` | Non-destructive motion candidates |
| `apps/web/server/services/videoProjectScenePlanAdapter.ts` | `cc25da8cd29793cba602410b05479af7a7a9c940` | Scene-plan Skill adapter |
| `apps/web/server/services/videoIntelligenceJobs.ts` | `ea18e4c00b2bde5d80d4ecbe2547a4fa51f2ccf2` | Durable job coordination |
| `apps/web/server/services/videoIntelligenceObservability.ts` | `6bab00e230078c67ac27266e08fc507848d52e83` | Existing VI observability |

## Remotion / executor

| Source | SHA | Role |
|---|---|---|
| `packages/remotion-render/src/remotionRenderVideoSchema.ts` | `d17a55fa2cb2300327a0fb60b7eeb07b08b858e8` | Canonical worker payload/version contract |
| `packages/remotion-render/src/renderVideoJob.ts` | `de7ce7cde82bb713bf7b2a483a5e94832377536c` | Shared render job pipeline |
| `apps/web/server/services/remotionRuntimeAdapter.ts` | `d67db33285e5051c467b35804515e043174f5553` | Server Remotion execution adapter |
| `apps/web/shared/workerRuntime.ts` | `4ca2a76bbab32d0007d26688dce5ab190791b99b` | Re-exported runtime contracts |
| `specs/feature/145-hermes-remotion-render-executor/implementation/evidence.md` | `3c6f04bd30129062b331ce22ca3d297dd8d00e3b` | Executor implementation evidence |

## Video Studio / editor

| Source | SHA | Role |
|---|---|---|
| `apps/web/client/src/pages/VideoStudioWorkspacePage.tsx` | `9645d30b73a348d6bea3766813411f095fbd1efa` | Current Video Studio workspace |
| `specs/feature/143-video-studio-layer-timeline-editor/spec.md` | `ad9368c564bdc12a9f6b79958d0eece26f1759aa` | Implemented P0–P3 as-built record |
| `apps/web/client/src/components/videoStudio/timelineProjection.ts` | `a904091308cabfaf64fde7fb84688300a94d9e0d` | Derived timeline projection |
| `apps/web/client/src/components/videoStudio/timelineEdits.ts` | `c00f062a237304933101e164e3a0ea60466b2fa1` | Pure layer edit operations |
| `apps/web/client/src/components/videoStudio/useTimelineHistory.ts` | `c379fb723028e46c35f7f0657b05a9cade36a4f6` | Client undo/redo |
| `apps/web/server/services/videoEditorProjectRevisionService.ts` | `612744ae706b9158f9aa2d383ac4c400ac5c48a4` | Video Editor immutable revisions |
| `apps/web/drizzle/0288_feature_184_video_editor_revisions.sql` | `5866fa60a122890fb3253335deb80928a503af1f` | Video Editor physical revision/job tables |

## Existing test anchors

The following test families are present on the audited commit and SHOULD be reused/extended rather than replaced:

- `apps/web/shared/videoIntelligence/__tests__/projectSchemas.test.ts`
- `apps/web/shared/videoIntelligence/__tests__/motionTemplates.select.test.ts`
- `apps/web/shared/videoIntelligence/__tests__/qaLedger.test.ts`
- `apps/web/server/services/__tests__/videoProjectCompiler.test.ts`
- `apps/web/server/services/__tests__/videoProjectQualityLoop.test.ts`
- `apps/web/server/services/__tests__/videoProjectQualityMetrics.test.ts`
- `apps/web/server/services/__tests__/videoProjectRepairApplier.test.ts`
- `apps/web/server/services/__tests__/videoProjectRepairRewriter.test.ts`
- `apps/web/server/services/__tests__/videoProjectRepo.test.ts`
- `apps/web/server/services/__tests__/videoProjectReviewAdapter.test.ts`
- `apps/web/server/services/__tests__/videoProjectScenePlanAdapter.test.ts`
- `apps/web/server/services/__tests__/videoProjectScenePlanner.test.ts`
- `apps/web/server/services/__tests__/videoProjectMotionDirector.test.ts`
- `apps/web/server/services/__tests__/videoProjectAssetResolver.test.ts`
- `apps/web/server/services/__tests__/videoIntelligenceJobs.test.ts`
- `apps/web/server/services/__tests__/videoIntelligenceObservability.test.ts`
- `apps/web/server/routers/__tests__/videoProjects.crud.test.ts`
- `apps/web/server/routers/__tests__/videoProjects.render.test.ts`
- `apps/web/server/routers/__tests__/videoProjects.stages.test.ts`
- `apps/web/server/routers/__tests__/videoProjects.jobExecutor.test.ts`
- `apps/web/client/src/pages/__tests__/VideoStudioWorkspacePage.test.tsx`
- `apps/web/client/src/components/videoStudio/__tests__/QaPanel.test.tsx`
- `apps/web/client/src/components/videoStudio/__tests__/MotionPanel.test.tsx`
- `apps/web/client/src/components/videoStudio/__tests__/RenderPanel.test.tsx`
- `apps/web/client/src/components/videoStudio/__tests__/timelineProjection.test.ts`
- `apps/web/client/src/components/videoStudio/__tests__/timelineEdits.test.ts`
- `apps/web/client/src/components/videoStudio/__tests__/useTimelineHistory.test.ts`
- `apps/web/server/workers/__tests__/remotionRenderVideoDispatch.test.ts`
- `apps/web/server/workers/__tests__/remotionRenderVideoSidecarMode.test.ts`
- `packages/remotion-render/src/remotionExecutorRuntimePackSchema.test.ts`

Also preserve the existing Remotion parity harness and fixtures under:

- `apps/web/scripts/remotion-parity-test.ts`
- `apps/web/test-fixtures/remotion-parity/`
- `apps/web/test-results/remotion-parity/`
