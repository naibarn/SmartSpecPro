# TDD implementation plan — Web Media Workspace parity

This file mirrors `claude-plan.md`. Each bullet is a test-first deliverable;
`deep-implement` should add the smallest failing test, implement the contract,
then run the focused command. Tests must use deterministic fixtures and mocks
for R2, Worker, AI providers, microphone and GPU unless a section explicitly
requires staging evidence. Repository-wide TypeScript typecheck is deferred by
user request because of memory pressure.

## Section 01 — shared contracts

- Contract tests accept valid `NleProjectDocumentV2`, `UploadSession`,
  `MediaJobEnvelopeV1`, `AnalysisArtifact` and `RenderRequest` and reject unknown
  major versions, unsafe fields, duplicate roles, local paths and expiring URLs.
- Compatibility tests prove editor stages map to existing `worker_jobs` statuses
  and that `encoding` remains an event stage inside `running`.
- Hash tests prove attempt/lease metadata does not change the immutable plan
  hash and that equivalent old Web/Worker payloads project deterministically.
- Compatibility tests prove `nle.web.1`/existing wire operations map to the
  enriched document without dropping keyframe/privacy/subtitle/overlay/audio
  fields, and unsupported Workers are rejected before claim.
- Transition tests cover upload, analysis, render and review state machines,
  retryability, cancellation and stale-result/apply CAS.
- Upload session transition tests cover `created → uploading → completing →
  completed` and abort/expiry/failed terminal paths with no premature asset
  publication.
- Cross-language fixtures parse identically in TypeScript and Rust.

## Section 02 — Bin and R2 ingest

- Component tests cover default Bin selection, one/multiple picker files,
  drag/drop, per-file progress, retry, cancel, partial success, duplicate,
  unsupported and expired-session states.
- Service tests cover simple PUT, multipart part ordering/ETag resume, bounded
  per-file/global concurrency, checksum/size/MIME failure, server checksum
  fallback, 64 MiB threshold/32 MiB part defaults, CORS policy and abort/expiry
  cleanup, basename/object-key safety and concurrent-complete fencing.
- Router tests cover tenant/project authorization, asset/link idempotency,
  object existence and no persisted expiring URL/local path.
- Compatibility tests map the existing `presigned` response to `simple` and
  prove an unavailable presigner returns a real multipart session rather than a
  method-only placeholder.
- Browser fixture proves a video and image can be added to separate tracks from
  Bin, Library and Media History.
- Route/component regression tests prove initial `sidebarView` is `bin` and no
  `localPath`, `path` or `originalPath` is persisted or sent in the Web
  project/Worker envelope; only managed asset references survive serialization.

## Section 03 — Transform/keyframes/camera

- Pure reducer tests cover base Transform versus evaluated Keyframes, hold/
  linear/ease interpolation, epsilon replacement, finite/clamped values, pin,
  move/delete, bake-to-base, undo/redo and still/video parity.
- Component tests cover pointer drag, numeric input, keyboard nudging, lock
  versus pin, scrub-to-keyframe, pin add/seek/delete/show-hide controls,
  auto-focus review and stale focus rejection.
- Render fixture compares browser evaluator output with Worker evaluator output
  at exact frame times.

## Section 04 — silence/audio/ducking

- Analysis contract tests cover threshold/padding/VAD validation, named Worker
  presets, missing audio, confidence, independent marker/highlight visibility,
  edit-map review, expected-revision apply and inverse undo.
- Waveform tests cover zoom, keep/silent ranges, split/merge, preview and no
  silent mutation.
- Extract-audio tests cover stream absence, channel/sample-rate options,
  lineage, source immutability, time offset/alignment and managed artifact
  publication.
- Ducking tests cover preset expansion, dB/envelope bounds, sidechain mapping,
  EBU R128/loudness QC metadata, allowlisted FFmpeg filter compilation and
  mute/solo/lock semantics.

## Section 05 — AI music/recording/speaker/subtitles

- AI music tests cover preflight, credit reserve/release, policy/quota errors,
  idempotent submit, artifact provenance and A-track placement.
- AI Media Studio tests cover transparent image, one-to-three-reference video
  and audio draft requests, typed job routing, provenance and managed-asset
  placement without a direct browser provider call.
- MediaRecorder tests mock permission, device enumeration, supported MIME,
  chunking, pause/resume, retake/discard-take, monitor playback, capture
  latency/time offset, unplugged device, stop cleanup and upload retry without
  persisting raw device IDs.
- Speaker-plan tests cover stage events, confidence, rename/merge/edit, stale
  apply and audit.
- Subtitle tests cover SRT/VTT parsing and export, monotonic cues, overlap
  policy, encoding/timebase conversion, metadata-safe filenames, styles, safe
  area, generated-versus-approved provenance, sidecar/burned-in selection and
  render inclusion.

## Section 06 — blur/tracking

- Privacy tests reject render when a requested interval has no manual region or
  approved verified track; low-confidence intervals require review.
- Region reducer tests cover normalized coordinates, feather/strength, shape,
  keyframe motion and correction.
- Worker fixture verifies typed blur options and output privacy metadata.

## Section 07 — render/export

- Preflight tests cover deterministic Auto selection and the Remotion/FFmpeg
  tie-break reason, Manual Remotion, Manual FFmpeg, GPU admission, unresolved review gates, credits, idempotency and
  revision pinning, plus a non-empty canonical-project unsupported report
  blocking lossful output until capability or explicit flattening is selected.
- Executor tests cover allowlisted argv/composition, stage events, cancellation,
  QC/checksum/MIME, retry/replay, monotonic event fencing, GPU device/profile
  metadata and duplicate publication.
- MP3 tests cover format metadata and audio-only artifact; still tests cover
  metadata-safe filename, color/dimensions, local capture and render-faithful
  fallback without blank success.

## Section 08 — preview/ruler/timeline

- Component tests cover frame/camera/render-faithful modes, fit/zoom/quality
  without document mutation, safe-area/center/grid guide exclusion from output
  and reduced motion.
- Ratio tests cover 16:9/9:16/1:1/custom canvas commands, fit/fill/crop preview,
  invalid dimension/area limits, revision warnings and source-dimension
  preservation.
- Project settings tests cover resolution, FPS/timebase and canvas changes with
  revision/hash updates and no mutation of source media.
- Ruler tests cover adaptive major/minor ticks, frame/timecode labels,
  keyframe/clip/silence markers, snap indicators, zoom and scroll synchronization.
- Timeline tests use 20+ tracks to verify vertical/horizontal scroll, virtual
  rows, add/rename/lock/mute/solo/visibility and keyboard shortcuts.
- Frame capture tests cover PNG/JPEG, device-pixel ratio, CORS failure and
  render-still job handoff.

## Section 09 — symbols and AI code overlays

- Catalog tests cover search/filter, license/source metadata, insertion and
  pagination/virtualization, sanitizer rejection of scripts, handlers, external
  references and unsafe filters.
- Manifest tests cover CSS/React/Three.js allowlists, versioning, prompt audit,
  opaque-origin/CSP/sandbox boundary, postMessage schema, resource/time limits,
  deterministic seed, skill manifest slug/hash pinning and invalid runtime/SSRF
  recovery.
- Remotion fixture renders an approved manifest and proves arbitrary source code
  is never passed to the executor.

## Section 10 — persistence, results, rollout and proof

- Migration tests cover the next available migration after the latest Drizzle
  journal entry (0289 is present in the current worktree), upload session/part
  and analysis-artifact shape, unknown-field preservation, indexes, tombstones
  and legacy project reads without a second artifact registry.
- Worker Jobs tests cover canonical route, redirect query preservation,
  operation labels, reconnect, stale review/apply, artifact publication and
  historical render jobs.
- Route tests prove `/video-editor?legacy=1` is hidden/redirected in default and
  canary cohorts while remaining available only behind the time-bounded rollback
  flag.
- Draft AI compatibility tests cover prompt/draft version preservation, typed
  Worker routing, credit/consent and no direct provider call from the browser.
- Worker App parity tests cover compound/decompose, Ken Burns, CapCut draft,
  Project settings, portable project JSON import/export, AI Media Studio and
  explicit managed replacements for local folder/Explorer actions.
- Rollout tests cover flag precedence/cache invalidation, canary stop metrics,
  retention/delete guards, active-job cancellation/fencing, migration dry-run,
  audit redaction and rollback.
- An authenticated browser-to-Worker integration fixture records all eighteen
  acceptance paths and separately marks pending R2, microphone, GPU, provider,
  deployment, performance and typecheck evidence.
