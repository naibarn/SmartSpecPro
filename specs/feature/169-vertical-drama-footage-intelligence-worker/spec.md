# Feature 169 — Worker Footage Intelligence, HyperFrames Transcription and B-roll Render

**Status:** Implementation-ready specification  
**Date:** 2026-08-30  
**Owner:** Worker App / Media Pipeline  
**Depends on:** Feature 162 Worker-first media intelligence, Feature 168 Web contract, Feature 160 B-roll/visual-source contract, Worker runtime pack, FFmpeg/FFprobe, pinned HyperFrames runtime

## 1. Objective

ทำให้ Worker App เป็น execution boundary สำหรับ footage จริงของ Special Tie-in ตั้งแต่ probe จนถึง render สุดท้าย โดยไม่ให้ Web Server decode, transcode, transcribe หรือ render วิดีโอหนักใน request

```text
Managed upload or local source
  -> Worker claim
  -> ffprobe
  -> extract audio + VAD/dead-air
  -> HyperFrames transcribe / whisper.cpp
  -> scene/keyframe/visual analysis
  -> bounded Footage Story Guide
  -> user-approved trim plan
  -> prepared footage artifact
  -> user B-roll placement plan
  -> Worker composition/render/QC
  -> durable artifact + manifest + status
```

## 2. Scope boundary

### In scope

- Worker job types for footage probe, analysis, transcription, preparation and final composition
- direct use of bundled/pinned HyperFrames CLI or its equivalent whisper.cpp invocation
- Thai transcription with `large-v3` and language-aware model selection
- word-level transcript tokens and cue output
- speech/silence ranges and transcript-to-prepared timeline mapping
- FFmpeg trim/concat, crop/reframe, proxy, thumbnail, waveform and QC
- scene boundaries and bounded representative keyframes
- semantic guide generation from bounded media evidence
- managed artifact upload with checksum and provenance
- Remotion/HyperFrames composition of base footage and AI B-roll
- durable progress, heartbeat, cancellation, retry and idempotent completion

### Out of scope

- running arbitrary shell commands from user input
- sending local filesystem paths to the Server
- mutating original footage
- unbounded video upload to an LLM
- automatic speaker diarization claims
- GPU-only requirement for ordinary FFmpeg/transcription jobs
- replacing the server credit ledger
- exposing Worker-local source selection in the Web MVP; `worker_local` remains a separately authenticated desktop path for future/advanced use

## 3. Existing capability findings

The Worker runtime already contains FFmpeg/FFprobe media processing and an official HyperFrames CLI. The bundled CLI reports:

```text
hyperframes transcribe <INPUT>
  --model tiny.en|base.en|small.en|medium.en|large-v3
  --language <code>
  --json
```

The CLI produces word-level timestamp output and can import JSON/SRT/VTT. The current web service in `apps/web/server/services/hyperframesTranscriptionService.ts` currently copies managed media to a temporary Server directory, extracts mono 16kHz audio and invokes `whisper-cli` directly. That path is suitable as a compatibility reference but must not remain the Special Tie-in production path when a Worker App is available.

The runtime pack currently has version drift between application dependencies and bundled HyperFrames. Worker release packaging must pin and doctor-check one version; a request must never run `npx` in a way that installs packages or downloads a model during execution. The pinned executable/version/model checksums are included in every analysis result.

## 4. Shared job contract

Worker consumes the versioned contract defined by Feature 168 §5. The minimum job payloads are:

### 4.1 `footage_probe_analyze`

```text
jobId, tenantId, userId, seriesId, sourceAssetId, sourceRevision,
sourceRef, sourceMode, requestedLanguage, transcriptionPolicy,
analysisProfile, outputPolicy, contractVersion
```

`sourceMode` is one of:

- `managed_upload`: Worker receives a short-lived authorized storage reference and downloads directly to its private work root
- `worker_local`: Worker reads a bound local source root and publishes only approved derived artifacts

The Server must not send an arbitrary local path. The Worker validates storage scope, expiry, checksum and local-root allowlist before opening a file.

For `managed_upload`, `sourceRef` is a short-lived signed download reference or an authorized Worker storage token, never a public URL. The Worker may renew it through the control plane only for the same job/source fingerprint. For `worker_local`, the source path is resolved only from the bound allowlisted root.

Managed downloads must support bounded Range/resume and checksum verification. If the reference expires or the source changes, the Worker requests a scoped renewal or returns `source_reference_expired`/`source_fingerprint_mismatch`; it must not fetch an unscoped URL or silently continue with a partial file.

### 4.2 `footage_prepare`

```text
analysisRevisionId,
sourceRevision,
segments: [{ sourceInMs, sourceOutMs, keep, reason }],
trimPolicy,
baseAudioPolicy,
fitPolicy,
outputProfile,
approvalFingerprint
```

MVP supports multiple kept segments so middle dead-air can be removed by concat. The original time map is persisted for transcript and B-roll alignment.

### 4.3 `footage_broll_render`

```text
preparedArtifactId,
preparedRevision,
baseDurationMs,
placements: [{ storyBeatId, startMs, endMs, sourceMediaAssetId, sourceInMs,
  sourceOutMs, placementMode, fitMode, baseAudioPolicy, brollAudioPolicy }],
storyRevisionId,
shotPlanRevisionId,
assetManifest,
renderProfile
```

Worker validates every placement against the prepared duration, source media type, artifact readiness, allowed fit/audio policy and source revision before rendering.

The shared enum contract is: `placementMode = overlay | cutaway | replace`; `fitMode = cover | contain | crop`; `baseAudioPolicy = preserve | mute | selected_ranges`; `brollAudioPolicy = mute | mix | replace`. Wire times are integer milliseconds, and every placement must include a `storyBeatId` so a render can be traced back to the reviewed story and one of the nine beats.

The three external job types are added to the shared Worker catalog with explicit capability families and no implicit aliasing:

| Web job | Worker executor | capability | terminal artifact |
|---|---|---|---|
| `footage_probe_analyze` | probe/analyze pipeline | `vd-footage-analysis` | `vd-footage-guide-v1` |
| `footage_prepare` | FFmpeg prepare pipeline | `vd-footage-prepare` | prepared video + source time map |
| `footage_broll_render` | existing `remotion_render_video` executor with `GenericTemplate` video layers | `vd-footage-broll-render` | protected final MP4 + manifest |

`footage_broll_render` is not sent as `video_assembly` or `hyperframes_final_composite` in this feature. The Server adapter compiles one base-footage video layer and timed AI B-roll video layers into the existing Remotion schema; overlay/cutaway/replacement and audio policy are explicit layer data. If the Remotion executor or its platform contract is not ready, fail with `unsupported_composition_executor` before claiming/charging execution. Never fall back to Server rendering.

## 5. Worker pipeline

### Stage A — intake and probe

1. Claim the job with tenant/user/series scope and heartbeat.
2. Resolve source into an isolated work directory.
3. Verify checksum when provided; reject incomplete or changed source.
4. Run FFprobe using an allowlisted binary and structured JSON output.
5. Record canonical `durationMs`, streams, dimensions, rotation, FPS, time base, codec, bitrate, sample rate, channels and audio presence.
6. Reject unsupported/corrupt input with a typed error; do not create a misleading ready artifact.

### Stage B — audio and dead-air analysis

1. Extract a temporary mono 16kHz WAV locally.
2. Run VAD/silence analysis and record leading, trailing and middle silence ranges.
3. Run black-frame, freeze-frame and duplicate-frame checks where profile permits.
4. Keep all ranges in original source time. Do not delete middle silence automatically; create a suggested segment plan.
5. Preserve meaningful pauses around speech as reviewable suggestions rather than treating every low-volume interval as dead air.
6. A suggested cut must not overlap a transcript speech range (including the configured padding) unless the user explicitly approves an override. VAD/black-frame evidence alone is never permission to cut spoken content.

### Stage C — HyperFrames transcription

Preferred Worker invocation is the pinned bundled command, conceptually:

```bash
<runtime-root>/node/bin/node <runtime-root>/hyperframes/node_modules/hyperframes/dist/cli.js transcribe source.mp4 \
  --language th \
  --model large-v3 \
  --dir <isolated-project-dir> \
  --json
```

`npx hyperframes transcribe ...` is a developer-equivalent command only when the exact pinned package is already installed; it is not a production Worker execution command. Production resolves `runtime-pack/manifest.json`, selects the platform-specific bundled Node (`node/bin/node` for Linux/macOS runtime packs, `node/node.exe` for Windows), verifies the manifest/checksum and invokes the exact `hyperframes/node_modules/hyperframes/dist/cli.js`. It must not depend on PATH, npm auto-install or network downloads. If the wrapper uses the lower-level `whisper-cli` invocation, it must preserve the same HyperFrames output semantics and be covered by the same contract tests.

Rules:

- default Thai model: `large-v3`
- default English model may be `small.en`; language/model compatibility must be explicit
- model path and binary are provisioned/verified during Worker install or doctor, not downloaded in a user request
- transcription is performed on the original source before cuts so timestamps remain authoritative
- output includes word-level tokens, language, model, duration, speech onset and transcript fingerprint
- output includes token-quality/status metadata, runtime/model checksums and whether the result is complete, partial or unavailable
- empty/uncertain speech is a valid analysis result; it is not a successful non-empty transcript
- transcription failure must not block deterministic trim if the user did not require transcript, but the UI must show the guide is incomplete

The Worker writes a bounded transcript artifact, plus VTT/SRT only when requested by the web contract. It must not store raw audio outside the isolated job cleanup policy. The artifact records `analysisStatus` (`complete`, `partial`, `unavailable`), `timelineTimebase: "milliseconds"`, transcript fingerprint, runtime manifest version and model checksum; a missing transcript is represented by status/reason, never by an empty successful transcript.

### Stage D — scene and keyframe analysis

1. Detect shot/scene boundaries using deterministic visual differences and bounded sampling.
2. Extract representative keyframes per scene with a configurable maximum count.
3. Store thumbnails/contact sheet as derived protected artifacts.
4. Add visual labels only when a registered local or remote visual analyzer is available.
5. Label visual output as `observation`, `suggestion`, `unknown` or `user_confirmed`; never promote observation to Character DNA, Scene Visual State or product claim.

If a VLM is not available in the Worker, send only bounded keyframes and metadata through the existing server Skill/LLM boundary. Never upload the full original video for semantic analysis.

Any remote visual analysis request must carry tenant authorization, retention policy and a maximum keyframe count/byte budget. Its result is advisory and must not be used to identify a speaker, prove a claim, rewrite DNA or silently add a scene.

### Stage E — Footage Story Guide

Worker combines probe, speech ranges, silence ranges, scene ranges, keyframes and transcript into `vd-footage-guide-v1`. The guide must contain:

- hard technical facts
- timed transcript/cues
- usable ranges and reasons
- visual observations with confidence
- recommended tie-in directions
- continuity warnings
- unknowns and prohibited inferences
- source/revision/model fingerprints
- status for each analysis source and explicit unknowns when a source is unavailable

The guide is an input artifact for Web Skill generation, not a script generated by Worker. The Web Skill may summarize it into human prose, but cannot alter source timestamps.

### Stage F — prepared footage

1. Receive only a user-approved or policy-approved segment plan.
2. Execute trim/concat locally with explicit source ranges.
3. Apply 9:16 fit/crop only when requested by the output profile.
4. Generate a new MP4, poster, proxy and optional waveform.
5. Create a bidirectional `sourceTimeMap`: prepared-to-original for playback/evidence and original-to-prepared for transcript/marker projection. Dropped ranges map to `null`, and every kept segment records its source fingerprint and exact integer-millisecond bounds.
6. Run technical QC: duration, dimensions, decode, audio policy, black/freeze checks and output size.
7. Upload the derived artifact and bounded metadata with checksum.
8. Publish `preparedArtifactId` and revision only after QC passes. A low-cost proxy/preview is marked `artifactRole=preview`, is never the canonical prepared revision, and cannot satisfy the final render input or create a second credit charge.

A failed output never replaces the previous prepared revision.

### Stage G — final Footage + AI B-roll render

The Worker receives the prepared artifact and explicit placements. It must:

- validate base and B-roll source revisions
- preserve exact integer-millisecond `startMs/endMs` windows
- apply source in/out without overflow
- use overlay/cutaway semantics as requested
- default AI B-roll audio to mute unless explicitly approved
- preserve base footage audio according to the selected policy
- use the fixed `remotion_render_video`/`GenericTemplate` route only after all media is managed/authorized
- run final QC and publish a new episode/render revision

The selected route is fixed in this feature: the Server adapter emits the existing `remotion_render_video` contract with `GenericTemplate` video layers and records the platform contract/version in the job manifest before execution. `video_assembly` and `hyperframes_final_composite` are not valid executors for this job. If the Remotion executor is not capability-ready, the job fails closed with `unsupported_composition_executor`; it must not fall back to Server-side rendering.

## 6. Timing and transcript mapping

The source transcript remains in original time. When preparation keeps segments:

```text
original 00:00–00:03  -> dropped
original 00:03–00:15  -> prepared 00:00–00:12
original 00:20–00:28  -> prepared 00:12–00:20
```

The Worker must map transcript cues and scene markers into prepared time while retaining `originalStartMs/originalEndMs`. B-roll placements use prepared milliseconds; evidence and audit can always trace back to original time. The UI may display seconds, but the wire contract remains integer milliseconds.

No floating-point ambiguity may cause an end point to exceed the base duration. Normalize times to integer milliseconds and convert to frames using the declared FPS; reject a frame mapping that overflows. A small tolerance is allowed only for validation, never to hide overflow.

## 7. Runtime and resource policy

Worker runtime doctor must verify:

- FFmpeg and FFprobe versions and executable paths
- official HyperFrames CLI version
- `whisper-cli` binary availability
- required Whisper model files and checksums
- Node version required by the bundled CLI
- temporary workspace capacity
- upload/download capability
- available CPU/RAM/GPU profile

Backpressure rules:

- separate queues/concurrency for probe, transcription, encoding and final render
- default Whisper concurrency 1 per Worker; configurable safe maximum
- heartbeat and cancellation checkpoints between stages
- bounded stdout/stderr and artifact size
- cleanup of temporary WAV/keyframes after publication or failure
- retry only transient storage/network/provider errors; do not hot-loop corrupt input or missing runtime

Long jobs must be durable and resume/reconcile from persisted stage checkpoints. The browser must never hold the only wait loop.

Server DB/job ledger is authoritative for the job projection; Redis is optional acceleration only. Each stage emits idempotent events: `claimed`, `started`, `progress`, `artifact_staged`, `qc_passed`, `published`, `failed` or `cancelled`. Events include `eventId`, job ID, stage, status, attempt, monotonic per-job `sequenceNumber`, heartbeat, input/output fingerprints, occurred-at and trace ID. Worker posts them to the existing `POST /api/worker-jobs/:jobId/events` control-plane endpoint with execution token, device proof, lease owner token and assignment attempt. The response is `accepted/replayed` plus the latest projection. Duplicate events replay successfully; an old sequence is ignored/replayed; a conflicting fingerprint is terminal. On restart, the Worker reconciles an existing staged artifact and an unsent local event outbox before repeating expensive work. Event transport retries after token refresh only for transient failures and never causes a second media execution.

The Web contract owns `lastEventSequence`, stale-after calculation, terminal reconciliation and cancellation intent. A missing event, expired lease or disconnected Worker is not success; it becomes `worker_stale` after the declared timeout and is recoverable only through reconciliation/retry.

## 8. Security and privacy

- Managed upload references are short-lived and scoped to tenant/user/series.
- Local source mode never exposes local paths or source bytes to Server.
- Worker filesystem access is restricted to an allowlisted root and per-job directory.
- No user-provided command, filter graph or executable path is accepted without an allowlisted profile.
- Transcript may contain personal data; store only within the authorized tenant boundary with retention policy and no public cache.
- Derived artifacts inherit source ownership and disclosure/rights metadata.
- A Worker result is not publishable until checksum, QC and server-side ownership reconciliation pass.
- Worker sends usage/result events to Server; it never reserves, finalizes or refunds credits.
- Logs must not contain signed URLs, transcript contents, local paths or raw personal data.

## 9. Implementation map

Likely owned files:

- `apps/worker-app/src-tauri/src/worker_executor.rs`
- `apps/worker-app/src-tauri/src/worker_loop.rs`
- `apps/worker-app/src-tauri/src/commands.rs`
- `apps/worker-app/src-tauri/src/media_pipeline.rs`
- `apps/worker-app/src-tauri/src/runtime_manifest.rs`
- `apps/worker-app/runtime-pack/hyperframes-sidecar/render.mjs`
- `apps/worker-app/runtime-pack/node/bin/hyperframes`
- `apps/web/shared/workerRuntime.ts`
- `apps/web/server/services/hyperframesTranscriptionService.ts` only for shared compatibility/legacy path and tests; Special Tie-in must dispatch to Worker

The Worker must not own web-specific Skill prompts, product claims, character DNA or credit deduction.

## 10. Test-first plan

1. Rust unit tests for safe source resolution, probe normalization, time-map math, segment bounds, audio policy, artifact manifest and unknown-job rejection.
2. Rust integration fixtures for leading/trailing/middle silence, speech, black/frozen frames, multiple scenes and corrupt media.
3. HyperFrames CLI compatibility test for `transcribe --help`, Thai model selection, word-level transcript artifact and missing-runtime error.
4. Worker job tests for queued/running/heartbeat/cancel/retry/idempotent completion.
5. Cross-runtime contract fixtures shared with Feature 168 for guide, transcript, prepared artifact and B-roll render payload.
6. Render tests proving exact B-roll start/end, muted default, source in/out, no overflow, base-audio policy, preview/final artifact separation and failed-QC non-publication.
7. Storage tests proving derived-only publication and checksum/tenant reconciliation.
8. Benchmark tests for CPU/RAM/time budgets and concurrency backpressure.
9. Event/reconciliation tests for duplicate delivery, Worker restart, expired signed URL and staged artifact reuse.

## 11. Acceptance criteria

1. Worker can process a Thai video and produce word-level transcript tokens using provisioned HyperFrames/Whisper runtime.
2. Worker can identify and expose leading/trailing/middle silence without destructive auto-delete.
3. Worker can create an approved prepared artifact with an original-to-prepared time map.
4. Web receives a guide that can ground Tie-in story generation without uploading full video to the LLM.
5. Worker can render prepared footage with AI B-roll at exact requested seconds.
6. Worker handles no-audio footage and transcript-unavailable mode with explicit status.
7. Missing CLI, binary, model, storage or corrupt input produce actionable typed failures and no false-ready artifact.
8. Jobs survive browser close/F5 and reconcile after Worker restart.
9. Normal Vertical Drama generation and existing Worker jobs remain compatible.
10. One authenticated end-to-end run proves upload → analyze → transcript → prepare → story guide → B-roll render → protected playback.
11. Runtime doctor proves the exact bundled HyperFrames executable, Whisper binary, Thai model and checksums used by the run.

## 12. Rollout

Ship in this order:

1. runtime doctor and contract fixtures
2. probe/transcript/analysis job with artifact persistence
3. prepared-footage review and time-map UI integration
4. Skill guide integration and story review gate
5. B-roll render executor and QC
6. enable tenant flag after live Worker runtime and real Thai transcription/render evidence

The existing Server-side Storyboard Review transcription path remains as a separately guarded legacy path until all callers are migrated. It must not be used implicitly as a fallback for the Special Tie-in Worker flow, because that would reintroduce Server CPU load and create ambiguous credit/job ownership.
