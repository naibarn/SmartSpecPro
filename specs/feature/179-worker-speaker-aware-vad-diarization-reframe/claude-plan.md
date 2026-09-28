# Feature 179 Implementation Plan

## 1. Scope and guiding model

Implement a user-directed speaker-aware media intelligence workflow across the Web contract/server boundary and Worker App/Tauri runtime. The workflow is a graph of optional stages, not a fixed pipeline. A recipe is only a convenience preset; the user can reorder or disable stages as long as required inputs exist and the final render explicitly declares its parent edit map.

The canonical data flow is:

```text
source or approved derived artifact
  -> optional subtitle/transcript evidence
  -> optional VAD / diarization / visual scan
  -> user-reviewable evidence artifact
  -> optional condensation/editorial plan
  -> optional speaker-aware reframe plan
  -> composed immutable edit map
  -> FFmpeg or Remotion render
  -> probe/QC/publication
```

The only mandatory invariants are: source/output references are immutable, coordinate spaces are explicit, adapter policy is recorded, stale inputs block downstream execution, and destructive render requires approval. Every adapter result includes actual backend/model/runtime evidence.

## 2. Target files and ownership

### Shared Web contracts and pure logic

- Extend `apps/web/shared/verticalDramaMedia/contracts.ts` with versioned Feature 179 schemas and job kinds.
- Add `apps/web/shared/verticalDramaMedia/speakerAwareContracts.ts` for focused schemas/types if the existing contract file becomes too large.
- Add `apps/web/shared/verticalDramaMedia/speakerAwareWorkflow.ts` for recipe compilation, stage validation, evidence fusion, smoothing/debounce, condensation proposals, and composed edit-map hashing.
- Add Vitest tests beside these modules.

### Web server

- Extend worker-job admission/scheduling/callback paths in `apps/web/server/routers/workerJobs.ts`, `apps/web/server/services/workerSchedulerService.ts`, `workerCallbackService.ts`, and `workerArtifactService.ts` only through existing abstractions.
- Add a focused service (for example `speakerAwareMediaService.ts`) for job payload creation, artifact publication, parent hash/stale checks, and review/approval transitions.
- Add router procedures for recipe/stage submission, adapter preflight, artifact retrieval, review corrections, and render approval. Keep tenant/series authorization and existing idempotency patterns.
- Surface the review/status summary in the existing Web production surface (`VerticalDramaProductionEpisodesPanel.tsx` or its current production-episode child) only when a Feature 179 artifact exists; the Web UI must not duplicate Worker inference controls or invent a second job state machine.
- Avoid a new database table unless existing worker job/artifact metadata cannot persist the versioned payload. If a migration is unavoidable, add an additive migration and test ledger ordering.

### Worker App UI

- Modify `MediaVideoEditorPlayer.tsx` only for shared preview integration: display evidence overlays, selected focus/active speaker, dead-air threshold, playable edit-map behavior, and review state.
- Add a dedicated `SpeakerAwareWorkflowPanel.tsx` under `screens/media-workspace/` for recipe/stage/adapter configuration, preflight, scan progress, evidence review, condensation review, and approval.
- Reuse existing `ProjectSettingsModal`, `AutoSubtitleModal`, silence controls, timeline/waveform, and render controls rather than inventing alternate interaction models.
- Modify `MediaWorkspaceHost.tsx` or its existing parent boundary to own query/polling state; keep the panel presentational and deterministic.
- Add styles using existing media-studio classes/tokens; do not add a global reset.

The Web surface owns server-backed artifact/job status and approval navigation; the Worker surface owns local media preview, evidence visualization, and worker preflight. Both read the same artifact contract and must display the same policy/model hashes.

### Rust/Tauri Worker runtime

- Add contract/job constants and validation in `worker_executor.rs`/`worker_loop.rs`.
- Add `speaker_aware_pipeline.rs` for job orchestration, checkpointing, artifact manifest, capability checks, and safe external adapter invocation.
- Add `speaker_aware_adapters.rs` with a common adapter trait/registry and explicit implementations for configured runtime commands. An adapter may return `unavailable`/`failed`; it must never fabricate detections.
- Extend `media_pipeline.rs` with composition helpers only where existing FFmpeg allowlisting supports them. Keep command construction allowlisted and path-safe.
- Add Rust unit tests for admission, policy, stale hashes, checkpoint resume, and unavailable adapters.

## 3. Contract design

Use strict Zod schemas and serde-compatible JSON shapes. All records contain `contractVersion`, `createdAt`, `sourceArtifactRef` or `parentArtifactRef`, and a checksum/hash where content identity matters.

### Workflow and stages

`WorkflowRecipeV1` contains `workflowId`, display metadata, ordered `stages`, optional `requestedStages`, and a user-editable `lockedStages` list. `EditStageV1` contains `stageId`, `kind`, `enabled`, `order`, `inputArtifactRef`, `outputArtifactKind`, `requires`, and stage-local configuration. Supported stage kinds are `subtitle_editorial_cut`, `vad_scan`, `diarization_scan`, `visual_track_scan`, `active_speaker_fusion`, `condensation_plan`, `speaker_reframe`, `manual_review`, `compose_edit_map`, `ffmpeg_render`, and `remotion_render`.

Stage validation must reject missing dependencies, duplicate output ownership, invalid time coordinate spaces, or a downstream stage pointing at a stale parent. It must allow subtitle-first then reframe, reframe-first then condensation, scan-only, and manual-only workflows.

### Adapter policy

`AdapterPolicyV1` is user-owned and immutable per job. It has per-stage selections for `vad`, `diarization`, `face`, `person`, and `activeSpeaker`, each with `enabledAdapters`, `primary`, `fallbackPolicy`, `required`, and resource limits. `fallbackPolicy` is `deny`, `allow_listed`, or `report_unknown`; `allow_listed` requires an ordered allow-list. The server stores the policy snapshot/hash in every job and result.

`AdapterCapabilityV1` reports `adapterId`, `version`, `status` (`ready`, `missing_model`, `missing_runtime`, `gpu_unavailable`, `incompatible`, `disabled`, `error`), runtime/device, model checksum, supported sample rates/input types, and a human-readable remediation key. A selected adapter with a non-ready capability blocks the stage unless the policy explicitly allows a listed fallback that is ready.

### Evidence

- `SubtitleEvidenceV1`: source kind (`authored_subtitle`, `observed_asr`), format, language, cue ranges, confidence, checksum, and conflict markers.
- `VadSegmentV1`: start/end, speech confidence, adapter evidence, sample rate, threshold/profile, and `isSpeech`.
- `DiarizationSegmentV1`: speaker ID, start/end, confidence, adapter evidence.
- `VisualTrackV1`: stable track ID, kind (`face`, `person`, `body_only`, `manual`), boxes/keypoints, posture (`seated`, `standing`, `unknown`), confidence, detector evidence, and track continuity.
- `ActiveSpeakerEvidenceV1`: time window, `speakerId`, `activeFaceTrackId`/`activePersonTrackId`, speech confidence, visual confidence, fused confidence, basis, and conflict state.
- `ScanArtifactV1`: full/partial scan status, coverage, source hash, adapter policy hash, counts, evidence references, cancel/resume checkpoint, and artifact checksum.

The contract must preserve conflicts instead of overwriting them: subtitle/ASR disagreement, VAD/diarization mismatch, multiple possible active speakers, missing visual evidence, and unstable positions are explicit review states.

### Edit map

`ComposedEditMapV1` is the only render input for speaker-aware/dead-air output. It includes source timeline ranges, retained/removal decision, reason codes (`dead_air`, `manual_cut`, `condensation`, `speaker_jump`, `user_keep`), crop/reframe keyframes, camera action (`hold`, `slow_move`, `cut_to_track`, `cut_to_wide`, `manual_lock`), active track ID, and a mapping from output time to source time. It has `parentArtifactHashes`, `manualRevision`, `workflowRevision`, and `approvalState`.

Manual cuts and silence cuts are merged deterministically. Adjacent compatible ranges are coalesced; conflicting user decisions win over automated suggestions; automated suggestions remain visible as provenance. FFmpeg and Remotion receive this exact structure, never independently recompute silence or speaker edits.

## 4. Worker adapter/runtime design

Create a registry that resolves only adapters declared by the policy. The registry performs preflight before claiming an expensive scan. It checks executable/model paths, model checksum/version, sample rate/input format, device/GPU availability, and adapter license/runtime metadata.

Initial adapters:

- `SileroOnnx`: baseline full-scan VAD; emits deterministic frame/interval evidence.
- `FireRedOnnx`: benchmarkable VAD; enabled only when installed and selected.
- `TenVad`: low-latency preview VAD; not authoritative for final render unless explicitly selected for that job.
- `WebRtcVad`: low-resource fallback only when explicitly allow-listed.
- `PyannoteDiarization`: optional multi-speaker diarization; missing dependencies produce a truthful blocked result.
- `MediaPipeFace`: face boxes/keypoints for visual tracking.
- `PersonBody`: person/body detector for non-facing subjects; posture may be `unknown`.
- `ActiveSpeakerFusion`: deterministic synchronizer that combines speech windows, diarization IDs, visual tracks, mouth/face evidence if available, and continuity priors. It must expose uncertainty instead of forcing one speaker.

Use a bounded external-process adapter boundary where Rust cannot embed a model. Standardize JSONL input/output, timeout, cancellation, stderr capture, exit code, model identity, and output checksum. Store no raw credentials or absolute host paths in artifacts. A missing model, unsupported runtime, timeout, or malformed output is a typed failure.

### Tracking and camera behavior

Track continuity uses IoU/center distance plus a stable-ID assignment window. Focus selection applies minimum hold duration, two-window confirmation, confidence hysteresis, and a lost-target grace period. While a target remains in the safe crop region, emit `hold`; when it approaches an edge, emit a bounded slow move; when a new active speaker is confidently selected, emit `cut_to_track` only if the recipe permits cuts. No oscillation: do not re-center on every detection, and do not move toward a lower-confidence background track. Manual locks override automation until the user releases them.

## 5. Full scan and durable jobs

Add job types:

- `speaker_aware_media_scan`: runs selected evidence stages over a source/derived artifact, checkpointing by time window and adapter. It is idempotent by source hash + policy hash + requested stages.
- `speaker_aware_edit_plan`: consumes a scan artifact and optional subtitle/condensation/manual inputs, emits a reviewable plan and composed edit map candidate.

Payloads include `workflowMode`, `requestedStages`, `inputArtifactRef`, `parentEditMapHash`, `adapterPolicySnapshot/hash`, `outputStage`, `idempotencyKey`, and explicit `approvalRequired`. The Worker must claim only jobs whose required capability snapshot is ready. Callback/publication is hash-verified and idempotent; duplicate callbacks do not create duplicate artifacts.

Scan lifecycle: queued → claimed → running → checkpointed → uploading → verifying → completed/published, or failed/canceled/expired. Cancellation preserves the last valid checkpoint. Retry resumes only if source/policy/model hashes are unchanged; otherwise it creates a new job and marks the old result stale.

## 6. Subtitle/transcript and condensation

Parse embedded or sidecar SRT/VTT/ASS through existing Worker subtitle utilities and normalize to cue intervals. Treat authored subtitles as editorial evidence and ASR as observed evidence. When both exist, show disagreement and use the configured priority only for a proposal; never silently rewrite authored text.

Condensation is a separate editable stage. It groups transcript/subtitle cues into topic windows, proposes keep/remove/shorten decisions with reasons, and outputs a candidate edit map. The user can inspect exact text and source ranges, restore any removed window, and approve. The stage can run before or after visual/speaker scanning. It may use an existing transcribe/LLM service only through a versioned contract; unavailable summarization is reported as unavailable, not approximated as successful condensation.

## 7. Web and Worker UI/UX contract

### Target user / JTBD

- Role: editor/producer preparing long drama/interview footage.
- Goal: choose a workflow, understand why a segment is kept/cut and which person is speaking, then approve a safe render.
- Entry point: existing Worker Media Studio editor and Web production/worker-job status surfaces.
- Success: user can run subtitle-first 16:9 or speaker-aware 9:16 flows, review evidence, customize stages/adapter policy, and render without losing manual/dead-air edits.

### Existing pattern reference

Search performed with bounded `rg` across `apps/worker-app/src/screens/media-workspace` and `apps/web/client/src/components/verticalDramaSeries`. Reuse `ProjectSettingsModal`, `AutoSubtitleModal`, the Quick Silence Cut controls, `mediaWorkspaceTimeline.ts`, existing worker job summary panels, and existing render approval/status patterns. Diverge only by placing complex configuration in a dedicated panel so the timeline/player remains usable.

### Surface inventory

| Surface | Owner | Change |
|---|---|---|
| Worker Media Studio toolbar | `MediaVideoEditorPlayer.tsx` | workflow status, selected stage/adapter, focus evidence badge |
| Speaker-aware Workflow panel | new `SpeakerAwareWorkflowPanel.tsx` | recipe/stage ordering, adapter policy, preflight, scan controls |
| Waveform/timeline | `mediaWorkspaceTimeline.ts` + timeline component | threshold line, dead-air/manual ranges, edit-map overlays, playable skipping |
| Evidence review | new panel section | speaker/face/body track list, confidence/conflict badges, jump-to-source |
| Condensation review | new panel section | text/topic decisions and restore controls |
| Render controls | existing render area | parent edit-map hash, approval state, FFmpeg/Remotion parity status |
| Web job status | existing worker job surfaces | scan/edit-plan progress, artifacts, failure remediation |

### Component map

| Component | Owns | Consumes |
|---|---|---|
| `SpeakerAwareWorkflowPanel` | user selections and review actions | workflow query, capabilities, scan artifact, edit plan |
| `StageOrderEditor` | enabled/order/recipe customization | `WorkflowRecipeV1` |
| `AdapterPolicyEditor` | per-stage adapters/fallback rules | `AdapterPolicyV1`, capability snapshot |
| `EvidenceTrackList` | evidence rows and jump-to-time | `ScanArtifactV1` |
| `CondensationReview` | keep/remove/shorten edits | subtitle/transcript evidence + proposal |
| `EditMapReviewBar` | stale/approval/render state | `ComposedEditMapV1` |

### State matrix

| State | Expected UI |
|---|---|
| loading/preflight | skeleton or progress; disable run; show current stage |
| empty | explain no scan/evidence and offer selected recipe/run |
| unavailable | adapter-specific reason and install/config remediation; no success badge |
| running | cancellable progress with coverage, active adapter, checkpoint |
| partial | show usable artifact as partial and require explicit continue/resume |
| conflict | show both evidence sources, mark review required, block destructive render |
| success | artifact hash, provenance, counts, review/edit/render actions |
| stale | show parent changed and require rescan/replan |
| disabled/hover/focus/selected | visible semantic states and keyboard reachable controls |

### Responsive matrix

| Viewport | Behavior |
|---|---|
| mobile 390x844 | panel becomes single-column stepper; timeline evidence opens as bottom sheet; no horizontal page overflow |
| tablet 768x1024 | panel and preview stack; stage list remains scrollable with sticky run/review footer |
| laptop 1024x768 | preserve player/timeline minimum width; panel scrolls independently |
| desktop 1440x900 | two-column panel/player with evidence list; render bar remains visible |
| small-mobile 360x800 | extended risk case: compact labels/tooltips and horizontal chip scroller only inside toolbar |
| wide-desktop 1280x800 | extended risk case: cap evidence columns and keep action buttons reachable |

### Accessibility acceptance

Keyboard navigation reaches stage reorder, adapter selection, scan/cancel, evidence jump, keep/remove, and approval controls. Every icon-only action has an accessible name. Focus is visible. Status uses `role=status`/`role=alert` appropriately. Contrast follows existing dark studio tokens. Reduced-motion disables slow preview animation while preserving the final keyframe plan. Confidence must not be conveyed by color alone.

### Design token extraction

Reuse existing Worker media tokens/classes from `apps/worker-app/src/styles.css`: dark navy surfaces, blue selected controls, teal success, amber warning, red failure, existing border radii and compact dense layout. Do not introduce a new global color system, reset, or raw full-screen modal. Motion uses existing transitions and a reduced-motion override; scan progress and evidence density stay operational rather than decorative.

### Copy contract

Use concise Thai-first labels with English technical terms in parentheses where useful: `วิเคราะห์ผู้พูด`, `ตัวตรวจจับเสียง`, `ผลตรวจใบหน้า/บุคคล`, `หลักฐานคำบรรยาย`, `รอการตรวจสอบ`, `ไม่พร้อมใช้งาน`, `เลือกขั้นตอน`, `ตัดตามคำบรรยายก่อน`, `สร้างแผนตัดต่อ`, `อนุมัติเพื่อเรนเดอร์`. Errors must state the failed adapter/stage and next action. Empty states must distinguish “ยังไม่ได้สแกน” from “ไม่มีหลักฐาน”. English fallback follows existing locale behavior.

### Browser evidence required

Record `implementation/ui-browser-evidence.md` using the canonical viewport set (390x844, 768x1024, 1440x900 plus dense-layout extensions). Verify no new console errors, no unintended overflow, keyboard path, loading/empty/error/conflict/success states, and the ability to toggle Library/Bin-like panels without losing workflow state. If browser tooling cannot run, mark checks skipped with the exact reason; never call skipped checks pass.

## 8. Render integration

The composed edit map compiler produces:

1. retained source intervals and output-time mapping,
2. dead-air removal including profile threshold and manual ranges,
3. condensation/manual cuts,
4. crop/reframe keyframes and camera actions,
5. audio/subtitle/overlay alignment mapping.

FFmpeg receives an allowlisted filter/concat plan generated from this map. Remotion receives the same map in composition props and must apply source-time mapping before overlays/subtitles. Both paths probe output, verify duration/range mapping, checksum the result, and publish only after QC. If a renderer cannot represent a map feature, it fails with `render_contract_mismatch` rather than silently dropping a cut or camera action.

## 9. Security, reliability, and observability

- Validate tenant/series ownership before job creation, callbacks, artifact reads, and approval.
- Allowlist external binaries/adapters; reject traversal, URLs, credentials, and arbitrary shell fragments.
- Bound scan duration, process output, memory hints, and artifact sizes.
- Apply existing worker queue concurrency/lease limits per series and per worker, reject duplicate active scans by idempotency key, and use bounded backoff for callback/publication retries. Do not start a second GPU-heavy scan when an equivalent job is running.
- Log job ID, stage, adapter ID/version, policy hash, source hash, checkpoint, and failure code; never log raw media or credentials.
- Add metrics for preflight blocked, adapter failure, fallback denied, scan coverage, active-speaker conflict, stale plan, FFmpeg/Remotion parity failure, and publication failure.
- Ensure retries are idempotent and never duplicate paid generation or publication.

## 10. Section execution order

1. Contract schemas and pure workflow/edit-map helpers.
2. Adapter policy/capability registry and preflight.
3. Subtitle/transcript/VAD/diarization normalization.
4. Visual tracks and active-speaker fusion.
5. Durable scan/edit-plan jobs and artifact callbacks.
6. FFmpeg/Remotion composed-map render integration.
7. Worker UI and Web job/review surfaces.
8. End-to-end focused verification, browser evidence, rollout/runbook.

Each section must add tests before implementation, run focused checks, review its own diff, and leave explicit unavailable/runtime limitations. Cross-section work must use the exact contract names and hashes from section 1.

## 11. Rollout and acceptance gates

Feature flag the new worker job kinds and UI panel. Default existing Silence Cut/normal render behavior remains unchanged. Enable speaker-aware stages only when Worker preflight returns ready adapters. Acceptance requires:

- all existing focused media/timeline tests remain green;
- contract tests cover recipe order, adapter policy, stale parent, evidence conflicts, and render map parity;
- Rust tests cover job admission/checkpoints/typed failures;
- a local fixture proves a subtitle-first 16:9 cut can feed a later 9:16 speaker reframe;
- a multi-speaker fixture proves two speakers can be represented without forcing one face;
- manual cuts survive both FFmpeg and Remotion map compilation;
- unavailable adapters are visible and never reported as success;
- UI browser evidence is recorded or explicitly skipped;
- `git diff --check` passes. Full `npm run check` is intentionally not run due RAM constraint.

The acceptance matrix maps directly to the original Feature 179 requirements: workflow ordering/customization; authored subtitle/ASR provenance; four configurable VAD adapters; optional diarization; face and body-only tracks; multiple speakers; stable location/posture evidence; hold/slow-move/cut/manual-lock actions; full-scan cache/cancel/resume; immutable corrections; condensation review; durable scan/edit-plan jobs; artifact publication; FFmpeg and Remotion map parity; stale-input blocking; tenant authorization; truthful unavailable/runtime errors; and focused UI/browser evidence. Any item without executable evidence is reported as residual risk rather than marked complete.
