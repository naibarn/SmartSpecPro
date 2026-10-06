# Spec 286 R1.7 G0.1 — Action / Route Mapping

The normalized Spec 286 action API is a semantic surface. It SHOULD adapt existing `videoProjects` tRPC routes and existing job/runtime owners rather than create a parallel router.

| Normalized action | Current implementation | Disposition |
|---|---|---|
| `video.production.create` | `videoProjects.create` | REUSE |
| `video.production.plan` | `runScenePlanStage`, `runAutoDraftStage`, `runContentDraft`, `runMotionStage` | ADAPTER |
| `video.production.preflight` | `getStageEstimate`, `getRenderCostEstimate`, `getLayerBudget`, `compileProject` | ADAPTER |
| `video.production.preview.render` | `queueRender(profile=preview)` + `getRenderStatus` | ADAPTER |
| `video.production.review.run` | `runQualityReview` | REUSE / EXTEND |
| `video.production.repair.propose` | current review `repairInstructions`; no full impact-plan endpoint confirmed | ADD READ-ONLY IMPACT/PROPOSAL ACTION after local duplicate search |
| `video.production.repair.apply` | `applyQualityRepairs` | REUSE / EXTEND |
| `video.production.final.render` | `queueRender(profile=final)` | ADAPTER |
| `video.production.final.verify` | no single aggregate route confirmed | ADD ORCHESTRATION ACTION over existing render + new gates |
| `video.production.approve` | `approveStage` exists | EXTEND for exact final/package digest and scope |
| `video.production.delivery.finalize` | no equivalent confirmed in audited VI surface | NEW ADDITIVE SERVICE; output is package manifest artifact |
| `video.production.deliver` | canonical publish/handoff owner | ADAPTER ONLY |
| `video.production.cancel` | worker/Remotion/Hermes cancellation exists outside generic VI route | ADAPTER to canonical cancellation |
| `video.production.pause` | job/session owner | ADAPTER; no local state table |
| `video.production.resume` | job/session owner | ADAPTER; revalidate policy/revision |
| `video.production.restore` | `restoreRevision` | REUSE |
| `video.production.branch.create/merge` | revision foundation exists; exact branch semantics not confirmed | LOCAL RG + additive semantics only if needed |
| `video.production.archive.export/import` | no equivalent confirmed | NEW ARTIFACT WORKFLOW |

## Existing `videoProjects` surface confirmed on audited main

```text
create
duplicate
updateAutomationMode
get
list
listByProduct
listPickerAssets
updateBrief
updateSourceRefs
saveDocument
setBrandKit
listRevisions
restoreRevision
delete
runScenePlanStage
runAutoDraftStage
runContentDraft
getContentDraft
acceptContentDraft
runMotionStage
createBrollPromptDraft
selectMotionCandidate
runNarrationStage
runNarrationStageAsync
runQualityReview
applyQualityRepairs
listRecommendedStageModels
getStageEstimate
getLayerBudget
approveStage
rejectStage
exportCaptions
getRenderCostEstimate
compileProject
queueRender
listMotionTemplates
getGenerationJobStatus
getActiveGenerationJob
getNarrationAssets
getRenderStatus
brandKits
```

## Implementation invariant

Do not expose the normalized action layer as a second source of truth.

Conceptually:

```text
Spec 286 normalized action
    ↓
existing `videoProjects` / job / approval / publish owner
    ↓
canonical state
```

not:

```text
Spec 286 router v2
    ↓
new state tables
    ↓
existing system
```
