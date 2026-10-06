# Spec 286 R1.7 G0.1 — Source-Reconciled Physical Mapping

**Repository:** `naibarn/SmartSpecPro`  
**Audited commit:** `4f4e35fadd388a8950cf801cb45c64de46c645c9`  
**Decision:** Projection/artifact/extension first. **No new Spec 286 production table is authorized by G0.1.**

## 1. Mapping status vocabulary

```text
CONFIRMED_REUSE
CONFIRMED_EXTEND
DERIVED_PROJECTION
ARTIFACT_ONLY
ADAPTER_REQUIRED
NO_MATCH_IN_AUDITED_VIDEO_SURFACE
G0_BLOCKED_LOCAL_RG
```

`NO_MATCH_IN_AUDITED_VIDEO_SURFACE` is not proof of repository-wide absence because GitHub code search is not indexed. A local checkout grep/AST search is mandatory before creating a new physical contract.

## 2. Mandatory G0 mapping

| Logical contract | Disposition | Physical owner/binding | Source evidence | Migration |
|---|---|---|---|---:|
| `VideoProductionManifestV1` | `DERIVED_PROJECTION` | `video_projects` + revision + QA/job/artifact/receipt refs | `videoProjectRepo.ts`, `manual_video_intelligence_tables.sql` | No |
| `DirectorBriefV1` | `CONFIRMED_EXTEND` | `video_projects.brief` JSONB | migration SQL + `videoProjects.updateBrief` | No initial |
| `ObservedVideoStyleGuideV1` | `ARTIFACT_ONLY` | Library/R2 JSON artifact | Library/asset owner to confirm locally | No |
| `BeatGridV1` | `ARTIFACT_ONLY` | reusable analysis artifact | media capability/provider adapter | No |
| `AudioProductionPlanV1` | `DERIVED_PROJECTION` | `VideoProjectDocument.audioTracks` + narration settings + analysis refs | `projectSchemas.ts` | No |
| `VideoQualityScorecardV1` | `CONFIRMED_EXTEND` | `video_projects.qaLedger` / `QaLedgerReview` | `qaLedger.ts`, `videoProjectQualityLoop.ts` | No initial |
| `VideoIssueV1` | `CONFIRMED_EXTEND` | `QaLedgerReviewIssue` | `qaLedger.ts` | No initial |
| Repair ledger / attempts | `DERIVED_PROJECTION` | quality-repair jobs + project revisions + QA ledger | `videoProjectRepairApplier.ts`, `videoIntelligenceJobs.ts` | No |
| `ProductionStageStateV1` | `DERIVED_PROJECTION` | worker/VI/render job state + project pointers | `videoIntelligenceJobs.ts`, `videoProjects.get*Status` | No |
| Production state projection | `DERIVED_PROJECTION` | project status + job/review/approval/delivery projections | router/repo | No |
| Generated Motion candidate metadata | `CONFIRMED_EXTEND` | `Scene.motionCandidates` + artifact ref for sandbox code/build | `projectSchemas.ts`, `videoProjectMotionDirector.ts` | No initial |
| Provider/capability receipts | `CONFIRMED_REUSE` | job output/events + provider usage trace + render receipts | job/review/scene-plan adapters | No |
| `VideoProductionReceiptV1` | `ARTIFACT_ONLY` | immutable JSON artifact referencing canonical records | Library/R2 | No |
| `FinalizedDeliveryPackageV1` | `ARTIFACT_ONLY` | package manifest + exact artifact digests | Library/R2 + existing publish owner | No |
| `ProductionSourceSnapshotV1` | `CONFIRMED_EXTEND` | asset checksum/manifest + Library/R2 + `sourceRefs` | `videoProjectAssetResolver.ts` | No initial |
| `VideoEditJournalEntryV1` | `CONFIRMED_EXTEND` | durable project revisions + client CommandBus history | `videoProjectRepo.ts`, `useTimelineHistory.ts` | No initial |
| `VideoProductionContextProjectionV1` | `DERIVED_PROJECTION` | current project/brand/QA/source/job/lock/claim state | existing owners | No |
| `PortableVideoProductionArchiveV1` | `ARTIFACT_ONLY` | authorized archive artifact | Library/R2 | No |
| `VideoProductionEventV1` | `ADAPTER_REQUIRED` | job events + audit logger + provider/render events | `videoIntelligenceObservability.ts` + jobs | No new event DB |
| Branch semantics | `CONFIRMED_EXTEND` / `G0_BLOCKED_LOCAL_RG` | project revisions; Video Editor revision precedent | revision services | TBD only if required |
| Decision provenance | `ARTIFACT_ONLY` / projection | trace/Skill/model/provider refs + immutable receipt | current tracing/billing/Skill adapters | No |

## 3. Existing DB bindings confirmed

### `video_projects`

Existing fields include:

```text
id
tenantId
userId
studioType
name
status
automationMode
brief
document
revision
brandKitId
sourceRefs
qaLedger
renderJobId
previewJobId
resultLibraryItemId
createdAt
updatedAt
```

### `video_project_revisions`

Existing immutable revision history:

```text
projectId
revision
document
createdBy
reason
createdAt
```

### `brand_kits`

Existing brand owner:

```text
logoAssetId
colors
fonts
captionPresetId
locks
```

## 4. Physical decisions

### 4.1 `VideoProductionManifestV1`

**Do not create a table.**

Implement first as an assembler:

```text
video_projects
+ current video_project_revision
+ qaLedger
+ worker/render jobs
+ source/asset manifests
+ immutable receipt artifacts
→ VideoProductionManifest projection
```

Only propose materialization later if measured read/continuation requirements prove a projection is inadequate.

### 4.2 `VideoQualityScorecardV1` / `VideoIssueV1`

Extend existing QA ledger shapes with optional backward-compatible fields. Preserve old ledger entries.

Suggested additive optional issue fields:

```text
issueId
sceneId
layerId
startTime
endTime
evidenceRefs[]
repairTarget
preserveRefs[]
findingCode
```

Suggested scorecard additions:

```text
deterministicStatus
confidence
evidenceRefs[]
criticVersionRef
coverageRef
```

### 4.3 Generated Motion Sandbox

Existing registry candidates already belong in `Scene.motionCandidates`.

Sandbox-generated source/builds SHOULD be Library/R2 artifacts with:

```text
artifactRef
contentDigest
runtime/dependency fingerprint
security/conformance receipt refs
ephemeral/promotion lifecycle
```

Do not place arbitrary generated source code directly inside the trusted template registry or project JSON.

### 4.4 Event normalization

Implement `VideoProductionEventV1` as an adapter/envelope over existing events.

Do not create `video_events_v2`.

### 4.5 Delivery / receipts / archives

Prefer immutable artifact manifests.

Do not create transactional package/archive tables unless a later code-grounded owner review proves artifact-only persistence is insufficient.

## 5. Hard pre-DDL rule

Before adding any new physical table/enum/persistent API:

```bash
rg -n "VideoProduction|ProductionManifest|DeliveryPackage|BeatGrid|StyleGuide|ProductionReceipt|SourceSnapshot|EditJournal|production.*event" .
```

Then inspect semantic equivalents, not only exact names.

An equivalent existing owner wins.

