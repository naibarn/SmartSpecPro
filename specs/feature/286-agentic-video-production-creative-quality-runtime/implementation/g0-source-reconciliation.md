# Spec 286 R1.7 — G0.1 Source Reconciliation Report

**Status:** SOURCE-RECONCILED / PHYSICAL-MAPPING-PARTIALLY-CONFIRMED / NO NEW DDL AUTHORIZED  
**Repository:** `naibarn/SmartSpecPro`  
**Branch:** `main`  
**Audited commit:** `4f4e35fadd388a8950cf801cb45c64de46c645c9`  
**Audit date:** 2026-10-05  
**Architecture revision:** Spec 286 R1.7 Contract-Normalized, 93-pass architecture audit retained  
**Purpose:** Bind Spec 286's logical contracts to the actual SmartAIHub video stack before implementation and prevent duplicate runtimes, tables, APIs, timelines, job authorities, QA systems, or renderers.

---

## 1. Executive G0 decision

SmartAIHub's current video implementation is **not a greenfield baseline**.

The audited `main` already contains a substantial, implemented video-production foundation:

- Spec 133 Content & Video Intelligence foundation;
- Feature 142 structured planning / QA / repair;
- Feature 143 Video Studio layer + timeline editor P0–P3;
- Feature 145 Remotion executor/runtime integration;
- durable `worker_jobs`;
- `video_projects` + immutable `video_project_revisions`;
- `qaLedger`;
- Brand Kit;
- Motion Template Registry;
- Remotion compilation and render packages;
- non-destructive motion candidates;
- narration/audio/caption paths;
- owner-checked asset resolution and checksum manifests;
- Video Studio UI and revision conflict handling;
- Video Editor canonical revision subsystem.

Therefore the controlling implementation rule for Spec 286 is:

```text
REUSE FIRST
→ EXTEND EXISTING CONTRACTS
→ ADD DERIVED PROJECTIONS
→ ADD VERSIONED R2/LIBRARY ARTIFACTS
→ ONLY THEN consider new transactional records
```

**G0.1 does not authorize a new `video_productions` table, new video job table, second timeline model, second QA ledger, second Capability Registry, or second Remotion runtime.**

The highest-value missing layer remains the agentic creative-production runtime around the existing foundation:

```text
creative direction
reference/style intelligence
rendered visual evidence
creative critic
timecoded/evidence-bound issue semantics
impact-aware targeted repair
final verification
delivery/package receipts
safe generated-motion sandbox
```

---

## 2. Audit method and evidence limits

### 2.1 Method

The audit used the connected GitHub repository directly and:

1. resolved the exact `main` commit;
2. traversed the complete repository tree;
3. fetched implementation files and implementation evidence directly;
4. compared Spec 286 logical contracts against source modules, database migrations, router actions, worker contracts, tests, and UI surfaces.

### 2.2 Evidence classification

| Classification | Meaning |
|---|---|
| `CONFIRMED_REUSE` | Exact existing source owner/contract found and suitable as canonical basis |
| `CONFIRMED_EXTEND` | Existing owner found; Spec 286 needs additive fields/behavior only |
| `DERIVED_PROJECTION` | Must be computed from existing canonical records; should not create another SoT |
| `ARTIFACT_ONLY` | Prefer immutable Library/R2 JSON/media artifact, not transactional DB table |
| `ADAPTER_REQUIRED` | Existing lower-level owner exists; add normalized Spec 286 adapter/action |
| `NO_MATCH_IN_AUDITED_VIDEO_SURFACE` | No equivalent found in the audited video surfaces; **not proof of global absence** |
| `G0_BLOCKED_LOCAL_RG` | Local repository grep/source check still mandatory before introducing a new physical schema/API |

### 2.3 Limitations

- GitHub code search for this repository was not indexed, so absence was **not** inferred from empty search results.
- Direct repository-tree traversal and file reads were used instead.
- `apps/web/drizzle/schema.ts` is ~1.18 MB and was not reliably range-readable through the connector; physical DB evidence was instead cross-checked through:
  - `manual_video_intelligence_tables.sql`;
  - repository/data-access code;
  - Spec 133 implementation progress, which records schema/database verification.
- This audit did not connect to the live production database.
- This audit did not run a live browser visual QA pass.
- Before creating any new table/action/module, Codex/Orchestra MUST run a local `rg`/AST/source search in the implementation checkout.

---

## 3. As-built implementation baseline

### 3.1 Spec 133 — confirmed implemented foundation

Evidence:

- `specs/feature/133-content-video-intelligence-platform/implementation-progress.md`
- `specs/feature/133-content-video-intelligence-platform/implementation-contracts.md`

Source evidence confirms implementation of the neutral project schema, compiler, DB/repository, Brand Kit, Motion Template Registry, worker contract/render path, QA loop, router, Studio UI, captions and asset-security fixes.

Important implication:

> Spec 286 MUST extend this implementation. It is not permission to implement Spec 133 again.

### 3.2 Feature 142 — confirmed structured QA/planning implementation

Evidence:

- `specs/feature/142-video-intelligence-structured-planning-qa-engine/verification-report.md`
- `apps/web/server/services/videoProjectQualityLoop.ts`
- `apps/web/server/services/videoProjectRepairApplier.ts`
- `apps/web/server/services/videoProjectReviewAdapter.ts`
- `apps/web/server/services/videoProjectScenePlanAdapter.ts`

Existing runtime already has:

- Skill-first scene planning;
- structured quality review;
- deterministic quality metrics;
- stage-scoped repair;
- bounded quality loops;
- spend/trace reporting;
- QA ledger persistence.

Spec 286 therefore adds **rendered-evidence creative review and richer issue/repair semantics**, not a second QA engine.

### 3.3 Feature 143 — confirmed Video Studio timeline/editor P0–P3

Evidence:

- `specs/feature/143-video-studio-layer-timeline-editor/spec.md`
- `apps/web/client/src/components/videoStudio/timelineProjection.ts`
- `apps/web/client/src/components/videoStudio/timelineEdits.ts`
- `apps/web/client/src/components/videoStudio/useTimelineHistory.ts`

Existing system already has:

- timeline projection from `VideoProjectDocument`;
- layer editing;
- layer locks;
- local undo/redo;
- asset picker;
- audio timing/fades;
- format/UI work;
- explicit note that P4 advanced effects/transitions were deferred.

Spec 286 MUST NOT introduce a second NLE/timeline truth.

### 3.4 Feature 145 — confirmed Remotion executor implementation

Evidence:

- `specs/feature/145-hermes-remotion-render-executor/implementation/evidence.md`
- `packages/remotion-render/src/remotionRenderVideoSchema.ts`
- `packages/remotion-render/src/renderVideoJob.ts`
- `apps/remotion-executor/*`

This is an existing execution/provider surface and should participate in Spec 286 placement/capability adapters.

---

## 4. Canonical physical authorities found

| Concern | Existing canonical physical authority |
|---|---|
| Video project/document | `video_projects.document` + `VideoProjectDocumentSchema` |
| Project revision/fencing | `video_projects.revision` + `video_project_revisions` |
| Brand | `brand_kits` + shared `BrandKit` |
| QA history | `video_projects.qaLedger` |
| Project CRUD/actions | `videoProjects` tRPC router |
| Logical render configuration | `videoProjectCompiler.ts` → `RemotionTemplateConfig` |
| Motion capability fast path | `MOTION_TEMPLATE_META` + `MOTION_TEMPLATE_REGISTRY` |
| Motion alternatives | `Scene.motionCandidates` / `selectedMotionCandidateId` |
| Physical job authority | `worker_jobs` |
| Video Intelligence async work | `videoIntelligenceJobs.ts`, backed by `worker_jobs` |
| Remotion worker contract | `@smartspec/remotion-render` schema |
| Deterministic rendering | `packages/remotion-render` + runtime adapters/executors |
| Media asset identity/access | Library/media assets + `videoProjectAssetResolver.ts` |
| Result media | Library/R2-backed artifact path |
| Video Studio timeline | derived projection from `VideoProjectDocument` |
| Video Editor canonical timeline | Feature 184 Video Editor revision tables/document |
| Audit/operational signals | current audit logger + job events + VI observability |
| Billing/provider usage | existing callLLM/provider usage/worker billing owners |

---

## 5. G0 logical-to-physical mapping

| Spec 286 logical contract | G0.1 disposition | Existing owner / physical binding | Migration now? | Decision |
|---|---|---|---:|---|
| `VideoProductionManifestV1` | `DERIVED_PROJECTION` | `video_projects` + current revision + `qaLedger` + jobs + Library/R2 + receipts | **No** | Build an assembler/projection first; no `video_productions` table |
| `DirectorBriefV1` | `CONFIRMED_EXTEND` | `video_projects.brief` JSONB + revision-aware project services | No initial table | Add versioned typed subobject/adapter; ensure revision semantics |
| `ObservedVideoStyleGuideV1` | `ARTIFACT_ONLY` | Library/R2 JSON artifact referenced from project/production projection | No | New artifact type/provider output, not table |
| `BeatGridV1` | `ARTIFACT_ONLY` | Derived analysis JSON artifact + media capability | No | Persist only as immutable reusable analysis artifact |
| `AudioProductionPlanV1` | `DERIVED_PROJECTION` | `VideoProjectDocument.audioTracks` + narration settings + beat/stem artifacts | No | Materialize as artifact only when approval/handoff needs it |
| `VideoQualityScorecardV1` | `CONFIRMED_EXTEND` | `video_projects.qaLedger` / `QaLedgerReview` | No initial table | Add optional deterministic status/confidence/evidence refs/dimensions |
| `VideoIssueV1` | `CONFIRMED_EXTEND` | `QaLedgerReviewIssue` | No initial table | Add stable issue ID, scene/layer/time/evidence/repair target fields |
| Repair ledger / attempts | `DERIVED_PROJECTION` | `quality_repair` jobs + revision reasons + QA ledger + repair results | No | Add immutable repair receipt artifact if job result is insufficient |
| `ProductionStageStateV1` | `DERIVED_PROJECTION` | `worker_jobs`, VI jobs, render status, project pointers | **No** | No second stage/job table |
| Production state | `DERIVED_PROJECTION` | project status + active/terminal jobs + QA/approval/delivery refs | **No** | State-machine adapter/projection |
| Generated Motion candidate metadata | `CONFIRMED_EXTEND` | existing `Scene.motionCandidates` for registry candidates | No | Sandbox component source/build becomes artifact ref; do not replace scene schema |
| Provider/capability execution receipts | `CONFIRMED_REUSE` | worker job output/events + provider usage log + trace IDs + render receipts | No | Normalize into Spec 286 receipt projection |
| `VideoProductionReceiptV1` | `ARTIFACT_ONLY` | final immutable JSON receipt referencing canonical rows/artifacts | No | Build at finalization |
| `FinalizedDeliveryPackageV1` | `ARTIFACT_ONLY` | Library/R2 package manifest + existing approval/publish owners | No | Do not create publication authority |
| `ProductionSourceSnapshotV1` | `CONFIRMED_EXTEND` | current owner-checked asset resolver + checksum manifest + Library/R2 + `sourceRefs` | No initial table | Add immutable snapshot/ref semantics; reuse asset identity/checksums |
| `VideoEditJournalEntryV1` | `CONFIRMED_EXTEND` | durable `video_project_revisions` + local CommandBus undo/redo | No initial table | Add durable operation metadata/receipt; do not create generic undo DB |
| `VideoProductionContextProjectionV1` | `DERIVED_PROJECTION` | current document + Brand Kit + QA ledger + source refs + locks/claims + jobs | No | Ephemeral bounded context + digest in decision receipt |
| `PortableVideoProductionArchiveV1` | `ARTIFACT_ONLY` | authorized archive artifact in Library/R2 | No | Export/import workflow |
| `VideoProductionEventV1` | `ADAPTER_REQUIRED` | existing job events + audit logger + provider/render events | No new event DB | Standardized projection/envelope over current events |
| Production branch semantics | `CONFIRMED_EXTEND` | `video_project_revisions`; Video Editor has stronger immutable revision precedent | TBD only if metadata cannot fit | Start with revision metadata/branch artifact; no new project SoT |
| Production decision provenance | `ARTIFACT_ONLY` / projection | trace IDs + Skill/model/provider metadata + immutable receipt | No | Never depend on hidden CoT |

### 5.1 Hard anti-duplication decision

The following new physical stores are **NOT AUTHORIZED by G0.1**:

```text
video_productions
video_production_stages
video_production_jobs
video_production_qa
video_production_timeline
video_capability_registry
video_delivery_jobs
video_event_store_v2
```

If implementation later proposes one, it MUST provide a source-grounded proof that projection/artifact/extension over the existing owner cannot satisfy the requirement.

---

## 6. Existing action/API mapping

Spec 286's normalized action surface SHOULD adapt the current `videoProjects` router where possible.

| Spec 286 action | Existing route / owner | G0.1 disposition |
|---|---|---|
| `video.production.create` | `videoProjects.create` | `REUSE` |
| `video.production.plan` | `runScenePlanStage`, `runAutoDraftStage`, `runContentDraft`, `runMotionStage` | `ADAPTER` |
| `video.production.preflight` | `getStageEstimate`, `getRenderCostEstimate`, `getLayerBudget`, `compileProject` | `ADAPTER` |
| `video.production.preview.render` | `queueRender(profile=preview)` + `getRenderStatus` | `ADAPTER` |
| `video.production.review.run` | `runQualityReview` | `REUSE/EXTEND` |
| `video.production.repair.propose` | review `repairInstructions`; no full impact-plan action found | `NEW ADDITIVE READ-ONLY ACTION` after local repo grep |
| `video.production.repair.apply` | `applyQualityRepairs` | `REUSE/EXTEND` |
| `video.production.final.render` | `queueRender(profile=final)` | `ADAPTER` |
| `video.production.final.verify` | no single high-level route found; compose from render status + new QC/semantic gates | `NEW ADDITIVE ORCHESTRATION ACTION` |
| `video.production.approve` | `approveStage` exists; final exact-hash/package approval is not equivalent | `EXTEND EXISTING APPROVAL BOUNDARY` |
| `video.production.delivery.finalize` | no equivalent found in audited Video Intelligence surface | `NEW ADDITIVE SERVICE`, artifact-only output |
| `video.production.deliver` | handoff to current product/publish owner | `ADAPTER`, not new publisher |
| `video.production.cancel` | worker/MCP/Remotion executor cancellation exists; no generic Video Studio action confirmed | `ADAPTER_REQUIRED` |
| `video.production.pause/resume` | existing durable job/runtime/session authorities | `ADAPTER_REQUIRED`, no local state table |
| `video.production.restore` | `restoreRevision` | `REUSE` |
| `video.production.branch.create/merge` | revisions exist; branch semantics not confirmed | `G0_BLOCKED_LOCAL_RG` before new schema |
| `video.production.archive.export/import` | no equivalent found in audited video surface | `NEW ADDITIVE ARTIFACT WORKFLOW` |

---

## 7. Source evidence inventory

The G0 implementer pack pins the repository at `4f4e35fadd388a8950cf801cb45c64de46c645c9`. Representative implementation evidence:

| Area | Source |
|---|---|
| Neutral schema | `apps/web/shared/videoIntelligence/projectSchemas.ts` |
| Brand Kit | `apps/web/shared/videoIntelligence/brandKit.ts` |
| Motion metadata | `apps/web/shared/videoIntelligence/motionTemplates.ts` |
| Motion server registry | `apps/web/server/remotion/templates/index.ts` |
| Compiler | `apps/web/server/services/videoProjectCompiler.ts` |
| Project persistence | `apps/web/server/services/videoProjectRepo.ts` |
| Router/API | `apps/web/server/routers/videoProjects.ts` |
| QA ledger | `apps/web/shared/videoIntelligence/qaLedger.ts` |
| QA loop | `apps/web/server/services/videoProjectQualityLoop.ts` |
| Review Skill adapter | `apps/web/server/services/videoProjectReviewAdapter.ts` |
| Repair engine | `apps/web/server/services/videoProjectRepairApplier.ts` |
| Scene planner adapter | `apps/web/server/services/videoProjectScenePlanAdapter.ts` |
| Motion director | `apps/web/server/services/videoProjectMotionDirector.ts` |
| Asset resolver/checksums/SSRF | `apps/web/server/services/videoProjectAssetResolver.ts` |
| VI durable jobs | `apps/web/server/services/videoIntelligenceJobs.ts` |
| VI observability | `apps/web/server/services/videoIntelligenceObservability.ts` |
| Remotion worker schema | `packages/remotion-render/src/remotionRenderVideoSchema.ts` |
| Remotion job pipeline | `packages/remotion-render/src/renderVideoJob.ts` |
| Remotion runtime adapter | `apps/web/server/services/remotionRuntimeAdapter.ts` |
| Video Studio UI | `apps/web/client/src/pages/VideoStudioWorkspacePage.tsx` |
| Timeline projection | `apps/web/client/src/components/videoStudio/timelineProjection.ts` |
| Timeline edits | `apps/web/client/src/components/videoStudio/timelineEdits.ts` |
| Undo/redo hook | `apps/web/client/src/components/videoStudio/useTimelineHistory.ts` |
| DB physical tables | `apps/web/drizzle/manual_video_intelligence_tables.sql` |
| Video Editor revisions | `apps/web/server/services/videoEditorProjectRevisionService.ts` |
| Video Editor migration | `apps/web/drizzle/0288_feature_184_video_editor_revisions.sql` |

Per-file SHAs are listed in `implementation/source-inventory.md`.

---

## 8. What Spec 286 still needs to build

After reconciliation, the true new work is narrower than the architecture document appears.

### 8.1 Highest-value new runtime

```text
Director Brief / Creative Direction
Reference Style Intelligence
Video Design System enrichment
Rendered evidence extraction / contact sheets
Deterministic QC expansion
Multimodal Creative Critic
Evidence/timecoded issue semantics
Impact-plan / targeted repair orchestration
Partial-rerender seam validation
Final verification / exact package gate
Generated Motion Sandbox
Production receipts / archives
```

### 8.2 Existing capabilities to extend, not rebuild

```text
Motion Registry
QA loop
Repair applier
Motion candidates
VideoProjectDocument
Brand Kit
Video Studio timeline/editor
Remotion worker/runtime
worker_jobs
Video Editor revision model
Library/R2 artifact identity
```

---

## 9. G0.1 implementation blockers / owner confirmations

G0.1 closes the broad architectural ambiguity, but the following remain real implementation gates.

### B1 — Canonical Spec number registry

`286` remains provisional until the canonical SmartSpecPro feature registry confirms it is free.

### B2 — Local full-repository duplicate grep before any new physical schema/API

Because GitHub code search is not indexed, Codex/Orchestra MUST run local `rg`/AST discovery for each proposed new persistent/action contract immediately before implementation.

### B3 — Library/R2 artifact-type binding

The exact existing Library metadata/type mechanism for new JSON artifacts such as:

- style guide;
- Beat Grid;
- production receipt;
- delivery package manifest;
- archive;

must be confirmed from the local checkout before adding a new artifact-type enum/table.

### B4 — Final approval/delivery owner

`approveStage` exists, but Spec 286's **exact final artifact/package hash** approval must be reconciled with the latest canonical approval/publication owner before implementation.

### B5 — Film/Creator integration

Film Studio and Creator Workspace integration remains adapter work; their latest source contracts must be reconciled when WP8 starts. They MUST NOT be pulled into WP1–WP5 as a prerequisite.

### B6 — Live performance / visual baseline

Historic implementation evidence is strong at code/test level but does not certify the contemporary visual-quality target that motivated Spec 286. WP0.4 must capture fresh baseline renders from current `main`.

---

## 10. G0.1 gate result

```text
G0 ARCHITECTURE OWNER RECONCILIATION        PASS
SPEC 133 IMPLEMENTATION EXISTS              PASS
FEATURE 142 QA/REPAIR EXISTS                PASS
FEATURE 143 TIMELINE/EDITOR EXISTS          PASS
REMOTION EXECUTION FOUNDATION EXISTS        PASS
VIDEO PROJECT DURABLE REVISION MODEL EXISTS PASS
DUPLICATE VIDEO JOB AUTHORITY NEEDED        NO
DUPLICATE VIDEO TIMELINE NEEDED             NO
DUPLICATE VIDEO QA LEDGER NEEDED            NO
NEW VIDEO PRODUCTION TABLE AUTHORIZED        NO
ARTIFACT/PROJECTION-FIRST PATH              APPROVED
LOCAL FULL-REPO PRE-DDL GREP                REQUIRED
LIVE VISUAL QUALITY BASELINE                REQUIRED
RUNTIME CERTIFICATION                       PENDING
```

Recommended next implementation sequence:

```text
WP0.4 current-main baseline/golden capture
→ WP1.1 normalized contracts as adapters/types
→ WP1.2 production-state projection
→ WP1.3 action/event/error adapters
→ WP1.4 manifest/receipt assembler over existing durable records
→ WP3.1 rendered visual evidence
→ WP3.2 deterministic QC expansion
→ WP4 creative director/critic
→ WP5 targeted repair/partial rerender
```

Do **not** start with a database migration.

---

**End of G0.1 Source Reconciliation Report.**
