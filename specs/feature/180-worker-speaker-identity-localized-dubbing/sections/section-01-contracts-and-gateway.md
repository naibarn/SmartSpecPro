# Section 01 — Contracts and Gateway

> v2 implementation prerequisite: read ../contracts-v2.md and the v2 section dependency graph. Both local and cloud execution are supported through one control plane. Existing v1 scope remains unless explicitly revised there.

## Goal

Create the shared contract foundation for Feature 180 without introducing a second queue, artifact store or billing system.

## Implementation scope

- Add strict schemas for `SpeakerIdentityRegistryV1`, `VoiceConsentRecordV1`, `LocalizedSubtitlePlanV1`, `VoiceBindingV1`, `StemSeparationReportV1`, `DubbingCueAudioV1`, `LocalizedDubbingEditMapV1` and `LocalizedDubbingQcReportV1`.
- Add a lineage envelope with artifact kind, checksum, duration/timebase, timeline transform, dependency IDs and render-plan hash; allow `seriesId: null` for standalone projects.
- Extend worker job/operation enums, progress states, stable failure codes and bounded artifact references in the existing worker runtime contracts.
- Add server orchestration boundary for capability preflight, tenant/project ownership, idempotency, job dispatch and managed artifact publication.
- Define source-path handoff, preflight/create/claim/progress/cancel/publish/download contracts and minimum worker runtime compatibility.
- Define standalone `seriesId: null`, stable no-subtitle/provider/resource failure codes, additive migration markers and GPU/VRAM admission metadata.
- Add explicit provider capability descriptors, including UVoice ordinary TTS, UVoice clone `unverified_api`, ElevenLabs clone/TTS and skill execution.
- Integrate existing credit reservation/reconciliation paths; do not duplicate balance or transaction logic.

## Contract decisions

Use integer milliseconds and opaque workspace-local IDs. Every mutation carries a stable idempotency key and an input artifact checksum. Worker payloads may contain signed artifact/job references but never provider credentials, arbitrary URLs or raw biometric material.

The gateway must distinguish preflight rejection, provider failure, worker failure and publication failure. Replayed requests return the persisted result. A provider capability unavailable response must not fall back to another provider unless that provider was explicitly selected and preflighted.

## TDD stubs

- Schema and secret-rejection tests.
- Tenant and project scope tests.
- Idempotent dispatch and duplicate-delivery tests.
- Credit reserve/reconcile/refund tests.
- Capability matrix and stable error tests.
- Additive migration/rollback, stale-lineage/hash and cancel-after-dispatch tests.
- No-subtitle source preparation, rate-limit retry-after and GPU/VRAM capacity tests.

## Exit criteria

All later sections can import one canonical set of contracts, gateway helpers, failure codes and credit/idempotency semantics. Existing worker runtime tests remain green.

## UI/UX Contract

### Target User / JTBD

Editors need understandable preflight, credit and provider status before starting a paid stage.

### Surface Inventory

Gateway status appears in the Speakers & Dubbing panel and the existing job/progress surfaces.

### Component Map

`CapabilityPreflightSummary` owns readiness and repair actions; `CreditEstimate` owns estimate/reservation/reconciliation display; server gateway owns truth.

### State Matrix

Show loading, ready, blocked, reservation-pending, running, reconciled, failed and canceled states. Never display a paid action as ready when preflight is incomplete.

### Responsive Matrix

Use the parent panel layout at 1440×900, 1280×800, 768×1024 and 390×844; status and primary repair action must remain visible or in the single scroll surface.

### Accessibility Acceptance

Expose status as text with programmatic labels, live progress updates and keyboard-reachable repair actions. Do not rely on color alone.

### Copy Contract

Thai primary copy must state what is ready, what is missing, estimated credits and the next action; retain stable English technical error codes.

### Browser Evidence Required

Capture ready, blocked, reservation failure and reconciled states with the primary action visible and no provider secret or raw path shown.

## v2 required integration

Implement AudioScope, UtteranceRef, AudioPlan, VoiceProfile/Binding, AudioArtifactRef and ExecutionPolicy from contracts-v2.md, plus normalized table/index/unique constraints, preflight expiry/revalidation, size limits and fencing. Do not upload worker_local inputs implicitly.

## Lifecycle schema and migration additions

Read ../voice-lifecycle-v2.md. Add exact named fields and API types there. Extend persistence with proposed audio_voice_datasets, audio_voice_dataset_revisions, audio_voice_training_runs and audio_trained_voice_models, referencing existing artifact/job/attempt ledgers. Dataset revisions uniquely key (tenantId,datasetId,revision); training runs key tenant/idempotency and frozen manifest hash; models key tenant/artifact checksum/base revision. Index rights ancestor edges and training status/updatedAt for reconciliation. Store explicit dependency edges for revocation traversal, with tenant-constrained endpoints and cycle rejection. Reference imports reuse existing upload records or add scoped expiry/receipt metadata without a second binary store. No unreviewed consent backfill. Enforce clone-mode/trained-mode field exclusivity and dataset size/recipe quotas.

## Convergence audit requirements

Apply lifecycle sections 8–10 and contracts recovery clarifications; they refine earlier general wording. Use VoiceOwnerScope for profiles/datasets, AudioScope for executions. Include applicable C5-01 through C5-07 regression cases in ../claude-plan-tdd.md. Release reporting distinguishes core A+B, optional providers C and training D.
