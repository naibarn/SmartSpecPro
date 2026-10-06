# Spec 286 R1.7 G0.1 — Source-Reconciled Traceability Matrix

**Audited commit:** `4f4e35fadd388a8950cf801cb45c64de46c645c9`

`Existing evidence` means the current source/test already protects part of the requirement. `New evidence` is the Spec 286 work still required.

| Req ID | Requirement | Existing source/test evidence | G0 disposition | New evidence required |
|---|---|---|---|---|
| `VID-ARCH-001` | Reuse Spec 133 deterministic foundation | `projectSchemas.ts`; `videoProjectCompiler.test.ts`; `videoProjects.render.test.ts` | REUSE | anti-duplication architecture test |
| `VID-ARCH-002` | No second job/capability/timeline authority | `videoIntelligenceJobs.ts`; Feature 143 timeline projection; worker jobs | REUSE/ADAPTER | source guard for forbidden new authorities |
| `VID-DATA-001` | Revisioned resumable production | `videoProjectRepo.test.ts`; project revisions | EXTEND/PROJECTION | manifest assembler continuity test |
| `VID-DATA-002` | Immutable source snapshot/digest | `videoProjectAssetResolver.test.ts`; asset manifest sha256 | EXTEND | remote mutable-source snapshot tests A61 |
| `VID-ACT-001` | Revision/idempotency fencing | `videoProjects.crud.test.ts`; `VideoProjectRevisionConflictError` | REUSE/EXTEND | stale review/action policy-epoch tests |
| `VID-ACT-002` | Production state transition guards | existing job/project statuses | PROJECTION | dedicated state-machine contract tests |
| `VID-EVT-001` | Normalized causal events | `videoIntelligenceObservability.test.ts`; job events | ADAPTER | event-envelope schema/causation tests |
| `VID-MEDIA-001` | Visible pixel changes receive render evidence | `RemotionProjectPreview.test.tsx`; render tests | NEW EXTENSION | contact-sheet/evidence extraction tests |
| `VID-MEDIA-002` | Explicit CFR/VFR/drop-frame/sample clocks | current schema uses integer ms/fps; no full rational model | NEW EXTENSION | A37/A38 deterministic timing fixtures |
| `VID-MEDIA-003` | Explicit color/HDR pipeline | Remotion/render foundation exists | NEW EXTENSION | HDR/SDR golden tests A23 |
| `VID-MEDIA-004` | Audio channel/stem integrity | existing audio tracks + post-pass tests | EXTEND | channel/stem/M&E fixtures A41 |
| `VID-CRE-001` | Director Brief before expensive autonomous production | existing `brief` JSONB + scene planning | EXTEND | typed Director Brief schema + UI/plan tests |
| `VID-CRE-002` | Registry fast path, not creative ceiling | `motionTemplates.select.test.ts`; `videoProjectMotionDirector.test.ts` | REUSE + NEW SANDBOX | sandbox fallback tests A8 |
| `VID-QA-001` | Deterministic QC separate from creative critic | `videoProjectQualityMetrics.test.ts`; `videoProjectQualityLoop.test.ts` | EXTEND | creative critic contract/evidence tests |
| `VID-QA-002` | Acceptance uses score + confidence/coverage | current review score only | EXTEND | confidence/calibration tests A58 |
| `VID-QA-003` | Semantic fidelity outranks beauty | claim validation + repair tests partially cover | EXTEND | semantic fidelity fixtures A24/A65 |
| `VID-REP-001` | Local issue → targeted repair | `videoProjectRepairApplier.test.ts` | REUSE/EXTEND | impact-plan and evidence-bound repair tests A57 |
| `VID-REP-002` | Partial rerender seam verification | segmented render exists; seam QC not confirmed | NEW EXTENSION | boundary visual/audio fixture A62 |
| `VID-REP-003` | Keep-best regression protection | quality loop tracks best review | EXTEND | rendered candidate keep-best test |
| `VID-SEC-001` | Generated code sandbox only | no trusted arbitrary generated code path found in audited VI surface | NEW | sandbox isolation/security suite A8 |
| `VID-SEC-002` | No raw shell/filter capability surface | strict Remotion worker schema + runtime package | REUSE/EXTEND | normalized media-provider negative tests |
| `VID-SEC-003` | Untrusted media quarantine | SSRF/owner/checksum guards exist | EXTEND | hostile SVG/font/container tests A31 |
| `VID-SEC-004` | Hash != authorization / tenant isolation | `videoProjectRepo.test.ts`; asset resolver scoping | REUSE/EXTEND | cross-tenant cache test A17 |
| `VID-RGT-001` | Revalidate rights/consent at delivery/reuse | product/source claim checks partly exist | NEW OWNER ADAPTER | A18 policy integration |
| `VID-RGT-002` | Render right != redistribution right | no complete VI export-license matrix confirmed | NEW OWNER ADAPTER | A35 |
| `VID-UX-001` | Review UI shows evidence/issues/repair impact | `QaPanel.test.tsx` | EXTEND | evidence frame/timecode + impact UI E2E |
| `VID-UX-002` | Mobile/tablet review | current responsive Video Studio exists | EXTEND | responsive real-device/browser acceptance |
| `VID-INT-001` | Film uses shared runtime | shared Remotion foundation exists | ADAPTER | scoped Film integration A6 |
| `VID-INT-002` | Video Editor round-trip declares loss | Video Editor immutable revisions exist | EXTEND | interchange loss report A59 |
| `VID-INT-003` | Localization can recompose timing | narration timing exists | EXTEND | localized temporal variant A19 |
| `VID-DEL-001` | Preview PASS != final PASS | preview/final profiles exist | EXTEND | final verification A11 |
| `VID-DEL-002` | Atomic digest-bound package | artifact/job/result foundation exists | NEW ARTIFACT SERVICE | wrong-sidecar test A32 |
| `VID-DEL-003` | Approval exact hash/scope | stage approval exists | EXTEND OWNER | derivative approval A20 |
| `VID-DEL-004` | Proxy cannot silently become master | renderer/result lineage partial | EXTEND | master/proxy lineage A43 |
| `VID-DEL-005` | Portable archive excludes secrets | no equivalent confirmed | NEW ARTIFACT WORKFLOW | restore A72 |
| `VID-OPS-001` | Material provider fallback disclosed | model/provider routing exists | EXTEND | substitution decision A15 |
| `VID-OPS-002` | Truthful cancellation reconciliation | executor cancellation surfaces exist | ADAPTER | too-late/late completion A67 |
| `VID-OPS-003` | Circuit break systemic failures | VI model resolver/observability precedent exists | EXTEND OWNER | chaos/circuit tests A55 |
| `VID-OPS-004` | Object-store/SoR partial commit reconciled | asset/library/job services exist | EXTEND | failure injection A71 |
| `VID-OPS-005` | Resource admission | Remotion executor admission/tests exist | REUSE/EXTEND | concurrent load/OOM A22 |

## Existing tests to preserve as regression gates

```text
apps/web/shared/videoIntelligence/__tests__/projectSchemas.test.ts
apps/web/shared/videoIntelligence/__tests__/motionTemplates.select.test.ts
apps/web/shared/videoIntelligence/__tests__/qaLedger.test.ts
apps/web/server/services/__tests__/videoProjectCompiler.test.ts
apps/web/server/services/__tests__/videoProjectQualityLoop.test.ts
apps/web/server/services/__tests__/videoProjectQualityMetrics.test.ts
apps/web/server/services/__tests__/videoProjectRepairApplier.test.ts
apps/web/server/services/__tests__/videoProjectRepairRewriter.test.ts
apps/web/server/services/__tests__/videoProjectRepo.test.ts
apps/web/server/services/__tests__/videoProjectReviewAdapter.test.ts
apps/web/server/services/__tests__/videoProjectScenePlanAdapter.test.ts
apps/web/server/services/__tests__/videoProjectScenePlanner.test.ts
apps/web/server/services/__tests__/videoProjectMotionDirector.test.ts
apps/web/server/services/__tests__/videoProjectAssetResolver.test.ts
apps/web/server/services/__tests__/videoIntelligenceJobs.test.ts
apps/web/server/services/__tests__/videoIntelligenceObservability.test.ts
apps/web/server/routers/__tests__/videoProjects.crud.test.ts
apps/web/server/routers/__tests__/videoProjects.render.test.ts
apps/web/server/routers/__tests__/videoProjects.stages.test.ts
apps/web/server/routers/__tests__/videoProjects.jobExecutor.test.ts
apps/web/client/src/pages/__tests__/VideoStudioWorkspacePage.test.tsx
apps/web/client/src/components/videoStudio/__tests__/QaPanel.test.tsx
apps/web/client/src/components/videoStudio/__tests__/MotionPanel.test.tsx
apps/web/client/src/components/videoStudio/__tests__/RenderPanel.test.tsx
apps/web/client/src/components/videoStudio/__tests__/timelineProjection.test.ts
apps/web/client/src/components/videoStudio/__tests__/timelineEdits.test.ts
apps/web/client/src/components/videoStudio/__tests__/useTimelineHistory.test.ts
apps/web/server/workers/__tests__/remotionRenderVideoDispatch.test.ts
apps/web/server/workers/__tests__/remotionRenderVideoSidecarMode.test.ts
packages/remotion-render/src/remotionExecutorRuntimePackSchema.test.ts
```

## G0 traceability rule

Before implementing a new requirement, the task packet SHALL state:

```text
REQ ID
existing source owner
existing regression tests
exact files to extend
new test file(s)
forbidden duplicate owner(s)
```

If the task cannot identify these, it is not implementation-ready.
