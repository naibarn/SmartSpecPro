# Feature 193 — Web Video Editor Smart Camera and Silence Parity

**Status:** IMPLEMENTED LOCALLY — browser parity path, shared evidence/cut-map
contracts, Worker composition-scan routing, and render handoff are implemented
locally. Target-account Worker connectivity, production render recovery, and
browser fixture evidence remain deployment gates.
**Created:** 2026-09-15
**Scope:** Web Video Editor playback/editing, Smart Camera (Face Focus and Face + Activity), Quick Silence Cut, browser capability detection, and heavy-work handoff to Worker App through Feature 186.
**Owner:** Web Video Editor with Worker App / Media Intelligence
**Related features:** [Feature 184 — Web Video Editor Headless Worker](../184-web-video-editor-headless-worker/spec.md), [Feature 186 — Unified Job Control Plane Adapters](../186-unified-job-control-plane-adapters/spec.md), [Feature 191 — Smart Director Face + Activity Auto-Reframe](../191-smart-director-face-activity-auto-reframe/spec.md), and [Silence Detection](../selence-dectection/spec.md).

## Outcome

The Web Video Editor provides the same user-visible editing capabilities as the
Worker App while keeping normal use independent of a Worker machine:

- Face Focus, Face + Activity, playback, framing marks, preview, and Quick
  Silence Cut work in the browser when the device has sufficient capability.
- Full Scan, large or unsupported media analysis, proxy/transcode work, and
  final render/export are durable `worker_jobs` operations.
- Browser preview and Worker render consume the same normalized camera plan and
  silence-cut plan, so a render does not silently choose a different crop than
  the preview.
- A missing Worker affects only operations that genuinely require it. It does
  not disable editing, playback, local analysis, or timeline review.

The browser is the default interactive editor. Worker execution is an optional
accelerator for analysis and the required execution boundary for heavy encode
and render work.

## Ownership and compatibility boundary

Feature 193 owns Web parity, browser capability routing, editor UI state,
analysis evidence promotion, and render handoff. It does not redefine the
camera algorithm, the canonical job ledger, or the headless project format:

- Feature 191 owns Smart Director semantics, `CompositionObservation`,
  `CompositionPlan`, `CameraMotionPlan`, marks, Quick versus Full Scan meaning,
  and the camera policy.
- Feature 186 owns `worker_jobs`, leases, attempts, outbox, idempotency,
  cancellation, recovery, settlement, and adapter lifecycle.
- Feature 184 owns the canonical project and headless Worker execution
  boundary.
- The existing Silence Detection feature owns dialog interaction and timeline
  editing semantics. This feature adds browser/Worker routing and parity; it
  does not create a second silence editor.

Existing `auto_face`, `auto_object`, and `manual_keyframes` values remain API
compatibility aliases during migration. New Web UI writes the explicit modes
`off`, `face_focus`, `face_activity`, and `manual_keyframes`.

| Legacy value | New logical mode | Behavior |
|---|---|---|
| `off` | `off` | No automatic camera; authored transforms and marks remain intact. |
| `auto_face` | `face_focus` | Five-point face anchor with safe-margin tracking. |
| `auto` | `face_activity` | Face anchor plus associated hand/object/activity targeting. |
| `auto_object` | `face_activity` | Face anchor plus the selected/object-seeded activity target. |
| `manual_keyframes` | `manual_keyframes` | Manual marks/keyframes are authoritative. |

The alias is resolved once when loading the project and is persisted with the
new mode on the next revision save. A legacy value must never select a second
planner or silently disable the face safety constraint.

## Non-goals

- No new generic `jobs` table or browser-owned job ledger.
- No requirement that a user keep Worker App running for ordinary editing.
- No CPU-heavy video encode, FFmpeg process, or large model inference on the
  React event loop.
- No upload of raw camera frames or user media to an unapproved third-party
  vision service.
- No replacement of the Feature 191 planner with a Web-only crop algorithm.
- No automatic regeneration, duplicate provider submission, duplicate credit
  charge, or destructive rewrite of an existing project.

## Execution policy

The router chooses the least expensive valid execution path. Capability is
measured per browser session and per Worker class; an optimistic UI flag is not
evidence that an operation can run.

| Operation | Browser without Worker | Browser with Worker available | Worker-required path |
|---|---|---|---|
| Face Focus preview | Local lightweight face landmarks/tracking; manual marks remain available | Same local preview, with optional Full Scan request | `media.composition_scan` for Full Scan or browser-degraded media |
| Face + Activity preview | Local person/hand/activity sampling when capability and budget allow; otherwise Face Focus or manual marks with a clear degraded badge | Same, plus Full Scan promotion | `media.composition_scan` for authoritative composition evidence |
| Quick Silence Cut | Local Web Audio/AudioWorklet or Web Worker analysis and non-destructive cuts | Same; Worker fallback available | `media.silence_detect` when local decode, size, codec, or budget fails |
| Waveform/probe/proxy | Existing bounded browser path where supported | Browser path first | `media.waveform`, `media.probe`, or `media.proxy` according to policy |
| Final render/export | Project remains editable; render is queued for an approved hosted Worker or clearly reported unavailable | Submit canonical render job | `video.render` through Feature 186; no browser encode fallback for heavy output |

Provider/Worker saturation never rejects a valid edit. It leaves an accepted
canonical job queued and visible, subject to the independent application
backlog budget defined by Feature 186.

## Shared contracts

### Composition contract

Web and Worker use the shared implementations in
`packages/shared/src/video-editor/cameraMotion.ts` and
`packages/shared/src/video-editor/compositionScan.ts` wherever the runtime
allows. A browser detector produces observations; the shared planner produces
the normalized plan; the Worker render consumes that plan. A second Web-only
composition algorithm is not allowed.

Every observation and plan is bound to:

```text
sourceFingerprint
projectRevisionId
markRevision
trimRange
aspectProfile
analysisMode
policyFingerprint
capabilityProfileFingerprint
contractVersion
```

The plan includes a deterministic `planFingerprint`, source-space geometry,
safe margins, stage/keyframe timing, and provenance (`browser_quick`,
`worker_full_scan`, or `manual`). Browser Quick plans are provisional. A Full
Scan may replace one only when source, revision, trim, aspect, marks, policy,
and contract all match; otherwise the old plan is marked stale and the UI asks
for a new analysis.

### Five-point face contract

Face Focus is a five-point face anchor contract in every runtime. The minimum
face evidence for a usable `face_focus` observation is:

```text
left_eye, right_eye, nose_tip, left_mouth, right_mouth
```

The shared evidence extension is logically equivalent to:

```ts
type FaceKeypoint5 = {
  leftEye: PointEvidence;
  rightEye: PointEvidence;
  noseTip: PointEvidence;
  leftMouth: PointEvidence;
  rightMouth: PointEvidence;
  faceTrackId: string;
  faceRoi: NormalizedRect;
  roll: number;
};

type ActivityEvidence = {
  associatedFaceTrackId: string;
  targetTrackId: string;
  targetKind: "hand" | "object" | "activity";
  timeMs: number;
  confidence: number;
  visible: boolean;
};
```

`PointEvidence`, `NormalizedRect`, and these fields must be added to the
versioned shared composition evidence contract rather than defined separately
inside the Web component or Worker renderer.

Each point has normalized source coordinates, confidence, visibility, and the
detector/model fingerprint. The observation also carries a derived face ROI,
roll estimate, and a stable face track ID. Browser and Worker adapters may use
more landmarks internally, but they must reduce to this same five-point
contract before calling the shared planner. If one point is temporarily
missing, the adapter may derive it only from valid bounded face geometry and
must lower confidence; it must not invent a new face position. If the five
points cannot be reconstructed within the configured gap budget, the planner
uses its bounded face-loss fallback and marks the evidence degraded.

The five points are used in both playback and render to calculate the protected
face ROI. A face bounding box alone is a compatibility fallback for legacy
projects and is never reported as `five_point_face_ready`.

The rollout manifest must record the five-point quality parameters per runtime:
minimum point confidence, minimum visible-point count (five for the ready
state), maximum tolerated point gap, maximum evidence age, and face-safe-margin
policy. These values are configuration and evidence, not hidden constants in a
browser component. A runtime that cannot meet them reports `browser_degraded`
or requests Full Scan.

### Browser analysis evidence

The Web adapter exposes a runtime-neutral port similar to:

```ts
interface BrowserVideoAnalysisAdapter {
  capabilities(): Promise<BrowserAnalysisCapabilities>;
  analyzeFace(input: BrowserAnalysisInput): Promise<FaceEvidenceChunk[]>;
  analyzeFaceActivity(input: BrowserAnalysisInput): Promise<ActivityEvidenceChunk[]>;
  detectSilence(input: BrowserAudioAnalysisInput): Promise<SilenceEvidence>;
}
```

The adapter is lazy-loaded, runs in a Web Worker or AudioWorklet where
possible, and reports a bounded capability fingerprint. The concrete landmark
or audio library is an implementation decision subject to bundle size,
licensing, browser support, and model-parity review. Model output is evidence,
not canonical status or a final plan.

### Silence contract

The existing `SilenceDetectionDialog` remains the review surface. Local and
Worker detection both normalize to the existing dead-air range shape plus:

```text
sourceFingerprint, projectRevisionId, audioStreamIndex,
thresholdDb, minSilenceMs, paddingBeforeMs, paddingAfterMs,
analysisFingerprint, provenance, confidence
```

Timeline cuts are non-destructive edit operations. The final render envelope
contains the normalized ranges and fingerprint; the Worker verifies they still
match the source/revision before applying them. If they do not match, it
re-detects through the approved operation or returns a review-required error.

The cut map is a sorted, non-overlapping list of half-open source ranges to
remove plus a deterministic source-to-edited-time prefix map. Browser playback,
seek, subtitles/overlays, camera-plan lookup, and Worker render all use this
same map. Applying Quick Silence Cut to the timeline therefore changes what is
played and rendered together; it cannot be an audio-only preview toggle. An
edited playhead maps back to source time before looking up a face/activity
keyframe, and removed source ranges have no playable camera frame.

## Browser behavior

### Face Focus

Face Focus keeps the selected face safely inside the output frame and may
smoothly reframe within the configured safe margin. It must not force the face
to remain centered after the initial framing decision. Manual marks and
explicitly authored keyframes take precedence according to the Feature 191
policy.

The browser samples at a bounded cadence, interpolates between observations,
and retains the last valid track for short detector gaps. A prolonged gap does
not extrapolate indefinitely: it freezes within safe bounds, falls back to the
last trusted plan, or requests Full Scan based on policy. The UI exposes the
provenance and stale/degraded state instead of claiming continuous tracking.

### Face + Activity

Face + Activity starts with the face as a safety anchor, then scores movement
attached to the subject (hands, held objects, upper-body motion, and approved
activity regions). The active point may move away from the face after the first
framing segment, provided the face remains inside the configured safe margin.
The planner applies hysteresis, minimum dwell time, bounded pan/zoom velocity,
and a reacquisition timeout so a transient detector miss cannot move the crop
to an empty background for several seconds.

Every activity observation must include an `associatedFaceTrackId` (or an
explicit `manualTarget` relationship), source time, target kind, confidence,
visibility, and evidence freshness. An activity region from another person or
an unassociated background motion cannot pull the camera. When the association
is uncertain, the planner lowers activity confidence and keeps the five-point
face ROI as the protected priority.

When only face landmarks are available, the mode remains usable as a degraded
Face + Activity preview and clearly reports `activity_unavailable`. It must not
silently pretend that a hand/object track exists. A user can continue editing,
place a manual activity mark, or request a Worker Full Scan.

### Quick Silence Cut

Quick Silence Cut runs locally for media within the browser decode and CPU
budget. It uses the existing threshold, minimum duration, and padding controls,
shows detected ranges before changing the timeline, and applies reversible
non-destructive cuts. Analysis is cancelled and its temporary buffers are
released when the source or revision changes.

If the browser cannot decode the asset, the asset exceeds the configured local
duration/size budget, or the analysis exceeds the time budget, the dialog
offers `media.silence_detect` through the control plane. It never blocks the
rest of the editor while waiting for that job.

### Capability states

The UI uses explicit states: `browser_ready`, `browser_degraded`,
`worker_available`, `worker_running`, `stale`, `unsupported`, and
`worker_required_for_render`. Capability badges include a reason and do not
expose raw model errors or secrets. `workerHandoff` is no longer the gate for
local analysis; it only influences routing of operations that need a Worker.

## Playhead and preview application contract

Playback uses the same plan application function as render. The player maps
the edited playhead to source time, evaluates the active keyframe segment, and
applies the normalized crop (`x`, `y`, `scale`, easing) after rotation and trim
mapping. It never recomputes a crop from the current face position in a
separate UI-only path. Seek, play, pause, reverse, dropped-frame recovery, and
loop playback all evaluate the plan at the requested source timestamp.

The playback pipeline must:

1. keep the five-point face ROI inside the safe margin whenever the active plan
   is valid;
2. blend toward an activity target only while its evidence is fresh, associated
   with the same person, and accepted by the shared planner;
3. hold the last valid composition for the bounded detector-gap interval, then
   widen or use the documented safe fallback; and
4. expose `provisional_quick_plan`, `five_point_face_ready`,
   `activity_partial`, `stale`, or `needs_review` without hiding a gap behind a
   frozen UI label.

The playback viewport is a preview of the render transform. A browser-only
visual effect or CSS transform that is absent from the saved plan is not
allowed to affect the parity comparison.

### Play/render behavior matrix

| Feature | During browser play/preview | During Worker render |
|---|---|---|
| Face Focus | Evaluate five-point face ROI and shared keyframes at source time; preserve safe margins through detector gaps | Apply the same promoted `CompositionPlan`/`CameraMotionPlan`; validate five-point evidence and source/plan fingerprints before encoding |
| Face + Activity | Evaluate face anchor plus associated hand/object/activity target with freshness, hysteresis, and reacquisition rules | Apply the same activity target tracks and fallback decisions; never replace them with a center crop because browser evidence was provisional |
| Quick Silence Cut | Remap edited playhead over non-destructive cut ranges, keep audio/video synchronization, and preview the post-cut timeline before save | Apply the saved normalized ranges to the same source-time map; reject or re-detect when the source/revision/audio stream fingerprint changed |

The plan and cut map are evaluated in source time before rasterization. The
edited-time map is deterministic and persisted with the project revision, so
seeking to a point before or after a cut cannot resurrect removed audio or
desynchronize the camera plan.

## Worker jobs and heavy-work handoff

### Full composition scan

Add a `media.composition_scan` operation to the Web media contract. Its
canonical Feature 186 job type is `video.composition_scan`, matching the shared
contract in Feature 191. During migration, the older
`media.composition_analysis` and `media.reframe` names are compatibility aliases
that must resolve to this one operation; they must not create a second analysis
ledger or algorithm. The envelope contains:

- canonical `jobId`, contract version, tenant and server-derived actor scope;
- managed source asset reference and authoritative source fingerprint;
- project revision, trim range, aspect profile, mode, marks, and policy
  fingerprints;
- bounded analysis options and required capabilities; and
- a deterministic operation/dedupe key.

The transport and domain contract versions are separate and explicit. The
Feature 186 control-plane envelope uses its accepted transport version (for
example `feature-186-v1`), while the nested composition payload uses the
shared composition contract version (`feature-191.v1`). The adapter must map
and validate both versions before enqueueing and before claim. During the
compatibility window the executor may accept both only through an explicit
allowlist; an unrecognized or accidentally mixed version is rejected before
analysis and remains operator-visible, rather than becoming a permanently
queued job.

The authoritative stage sequence is:

```text
probe → sample → face_5point → track → activity_associate → plan → ready
```

`face_5point` is mandatory for `face_focus` and `face_activity`. For
`face_activity`, `activity_associate` must produce either a valid activity
association or an explicit `activity_partial`/`needs_review` outcome. A job
cannot be promoted as approved while either required stage is missing.

The job stores checkpoint evidence and progress in the control plane. It may be
restarted or reconciled without creating a second job. The result is a managed
analysis artifact containing observations, the normalized plan, plan
fingerprint, five-point face evidence, activity tracks, capability provenance,
and warnings. A guarded promotion command updates the project revision only
when the fingerprints still match. The local Web route currently validates and
returns bounded promotion evidence; the durable project-revision write remains
an explicit Feature 184 persistence gate until the revision endpoint is wired
in the target deployment.

### Heavy silence analysis and media preparation

`media.silence_detect`, `media.waveform`, `media.probe`, and `media.proxy` use
the existing `MediaJobEnvelope` and executor policy. The Web adapter submits
them only after local capability/budget checks fail or the user explicitly
requests Worker analysis. Their results are references to managed artifacts;
raw provider responses and unbounded logs are not placed in project JSON.

`media.silence_detect` returns source-time ranges tied to the selected audio
stream and detection parameters. The browser cut-map reducer and Worker render
must use the same half-open range convention, padding, and minimum-duration
rules. A range is never applied only to the audio preview while leaving video
time unchanged.

The current Web `MediaJobClient.detectDeadAir` path is a compatibility adapter
for `media.silence_detect`; it must not become a second result source. Likewise,
the current `render_mp4_h264` request is a compatibility alias for the
canonical `video.render` envelope and must preserve the same project revision,
camera plan, cut map, and idempotency key.

### Final render/export

Final export submits a canonical `video.render` job through the Feature 186
editor media router. The envelope includes the saved canonical project
revision, source asset references, normalized `CameraMotionPlan`, the
source-to-edited-time silence cut map/fingerprint, render profile, and an
idempotency key derived from the revision and render request. Existing Web
render endpoints may remain as a compatibility shim, but they must converge on
the same canonical job and must not encode on the browser main thread.
The hosted compatibility FFmpeg renderer consumes the same
`MediaClip.cameraMotionPlan` with a bounded frame-time crop expression; an
invalid or stale plan is rejected or fenced from render rather than silently
reduced to a static crop.

For `face_focus`, the render envelope includes the five-point face evidence or
its immutable managed artifact reference and the derived protected ROI. For
`face_activity`, it also includes the selected activity track IDs, association
evidence, freshness window, and fallback policy. The Worker rejects a plan that
has no valid face anchor for a requested face mode, unless the user explicitly
approved a `needs_review`/manual fallback.

Routing order is:

1. an approved connected Worker App with the required capability;
2. an approved hosted Worker/worker-pull executor when tenant policy permits;
3. a durable queued state with an actionable “Worker required for render”
   message when no executor is available.

The third state preserves the project and does not report a false render
success. Cancellation, retry, lease fencing, and settlement follow Feature
186; a browser tab closing does not cancel a queued render.

## Project and persistence rules

Extend the existing `Clip.smartCamera` and project metadata compatibly with:

```text
mode, analysisStatus, analysisProvenance,
sourceFingerprint, projectRevisionId, markRevision,
planFingerprint, planRef, capabilityProfileFingerprint,
lastAnalysisJobId, staleReason, warnings
```

Silence metadata retains the current dead-air fields and adds the analysis
fingerprint/provenance needed to validate a render. Large evidence and plans
use managed storage references or approved analysis artifacts. No raw frames,
credentials, signed URLs with unnecessary lifetime, or unrestricted model
output are persisted in the project.

Browser Quick results may remain session-local until the user saves or
explicitly promotes them. A promoted result is attached to a project revision
and can be invalidated by source, trim, aspect, mark, policy, or contract
changes. A Worker result never mutates a newer revision.

Render submission must reference a saved project revision. If the browser has
unsaved Quick camera evidence or silence cuts, the editor must first commit a
new revision using the action idempotency key or refuse submission with a clear
save-required state; it must not send a transient in-memory cut map to the
Worker and call the result canonical.

## Failure, safety, and privacy

- Duplicate browser requests use an analysis fingerprint and do not create
  duplicate Worker jobs.
- Duplicate delivery, lost publish responses, worker restart, and stale
  callbacks converge through Feature 186 idempotency and fencing.
- A detector miss, low confidence, or unsupported browser capability results
  in a bounded fallback or review state; it never jumps to an empty frame.
- Browser analysis is origin-scoped and uses only user-authorized media. Model
  assets are pinned and integrity-checked; external network access is not
  required for the default local path.
- Worker jobs validate managed asset ownership, tenant scope, revision, and
  fingerprints server-side. Client routing fields are advisory only.
- Payload, evidence, progress, and event sizes are bounded. Logs contain
  canonical job ID and safe diagnostics, never lease tokens or credentials.
- Local analysis has explicit duration, decoded-pixel, memory, and wall-clock
  budgets. Exceeding one budget aborts cleanly and offers Worker fallback.
- Render results are settled through the existing artifact and billing guards;
  retrying a render cannot charge or publish the same artifact twice.

## Migration waves

### Wave 0 — shared contract and capability seam

Define the Web adapter ports, fingerprints, explicit modes, capability state,
and normalized plan/evidence fixtures. Reuse Feature 191 shared planner types
and Feature 186 media envelopes. No behavior switch is required yet.

### Wave 1 — browser Face Focus

Enable local Face Focus Quick analysis behind a feature flag, preserve manual
marks, and add stale/degraded badges. Keep the existing Worker request as an
optional Full Scan path.

### Wave 2 — browser Face + Activity

Add activity evidence sampling, hysteresis/reacquisition rules, and plan
promotion tests. When activity capability is absent, retain a truthful degraded
Face Focus path rather than disabling the editor.

### Wave 3 — browser Quick Silence Cut

Route the existing dialog through the local adapter first, preserve reversible
timeline edits, and invoke `media.silence_detect` only for explicit fallback or
user request. Remove any UI copy that implies Worker is required for Quick Cut.

### Wave 4 — authoritative Worker analysis

Enable `media.composition_scan` and heavy media fallbacks through the outbox
and PostgreSQL-pull/approved Worker adapters. Add checkpoint, cancellation,
promotion, and stale-result recovery evidence.

### Wave 5 — canonical render handoff

Converge Web export on `video.render`, pass the exact saved plan and silence
fingerprints, and expose Worker availability separately from editor readiness.
Keep the old render path only as a rollback-compatible shim until drain and
reconciliation evidence pass.

### Wave 6 — rollout and retirement

Canary by tenant and browser capability, compare browser preview with Worker
render on representative clips, measure crop safety and silence-cut parity,
then retire only superseded direct analysis/render paths. No dual side-effecting
producer is allowed.

Each wave records the active flag, owner, selected call sites, compatibility
projection, source/plan schema version, rollback flag, budgets, and evidence
links. A Worker outage rolls new heavy work back to a queued/reviewable state;
it does not roll back committed project history.

## Acceptance criteria

### Browser-first behavior

- With no Worker available, a user can open, play, trim, mark, preview, and save
  a project.
- Face Focus Quick works locally when browser capability is sufficient and
  produces five-point face evidence and preserves the face inside safe margins
  without forcing permanent centering.
- Face + Activity Quick follows the active movement when evidence is available,
  uses bounded reacquisition when it is not, and exposes degraded state rather
  than losing the subject for multiple seconds.
- Quick Silence Cut detects and previews local ranges, applies reversible cuts,
  remaps playhead time without audio/video drift, and remains usable without a
  Worker for media within the local budget.
- Play, pause, seek, reverse, and loop playback use the saved source-time
  camera plan and silence cut map; a detector gap never leaves both the face and
  activity outside the frame beyond the configured fallback interval.
- A missing Worker does not disable the three editor features; only heavy
  fallback and final render show a Worker-required state.

### Shared-result and render parity

- Browser preview and Worker render use the same normalized planner contract.
- Five-point face evidence is accepted, fingerprinted, and consumed by both
  browser play and Worker render; legacy bbox-only evidence is visibly marked as
  degraded.
- A play/seek sample at any source timestamp resolves to the same camera
  transform and silence-cut time map used by render within the documented
  tolerance.
- A stale or mismatched plan cannot be silently rendered; the UI requests
  re-analysis or uses a guarded fallback.
- Final render applies the same camera and silence plans shown in the editor,
  with deterministic fingerprints recorded in the canonical job.
- A rendered Face Focus clip proves five visible face points or records an
  explicit degraded/manual approval; a Face + Activity clip proves the active
  target is associated with the protected face track.
- A rendered Quick Silence Cut clip has the same removed ranges, edited
  duration, subtitles/overlay timing, and audio/video synchronization shown in
  browser playback.
- Render submission creates one idempotent Feature 186 job before transport
  publication and survives browser closure or broker loss.

### Worker and recovery

- Full Scan, heavy silence fallback, proxy, and render use canonical envelopes,
  managed assets, server-derived tenant scope, leases, outbox, and retries.
- Composition scan tests prove the Feature 186 transport version and nested
  Feature 191 composition version are mapped explicitly; an unsupported or
  mixed version is rejected before claim and does not remain silently queued.
- Duplicate delivery, lost publish response, worker restart, cancellation,
  stale result, and database contention do not duplicate a provider call,
  credit charge, artifact, or project mutation.
- Checkpointed Full Scan can resume or be quarantined with operator evidence;
  it never creates a replacement canonical job.

### UI truthfulness and safety

- The UI distinguishes browser-ready, browser-degraded, Worker-running, stale,
  unsupported, and Worker-required-for-render states.
- No raw lease token, credential, signed URL, unrestricted payload, or provider
  response is exposed in the editor.
- Manual marks, authored keyframes, and existing timeline edits survive mode
  changes, Quick/Full Scan promotion, and render retry.

## Verification plan

1. Shared contract tests for source/plan fingerprints, mode aliases,
   deterministic dedupe keys, stale-result rejection, five-point face
   normalization, and planner parity.
2. Browser adapter tests for capability detection, detector gaps,
   five-point face confidence/visibility, reacquisition, bounded velocity, safe
   margins, local cancellation, memory cleanup, audio thresholds, source-time
   playhead remapping, and timeline reversibility.
3. Web UI tests for no-Worker editing, truthful capability badges, mode changes,
   stale analysis, dialog review, and Worker-required render messaging.
4. Feature 186 repository/adapter tests for composition scan, silence fallback,
   and render outbox publication, duplicate delivery, lease fencing, retry,
   cancellation, and settlement.
5. Representative media fixtures comparing browser Quick output with Worker
   Full Scan and final render: five-point face safety, activity retention, no
   multi-second empty framing, play/seek parity, audio/video sync, and
   silence-range parity within the documented tolerance.
6. Browser performance tests under the declared duration, decoded-pixel,
   memory, and wall-clock budgets, including low-power/mobile profiles.
7. Migration tests for old Smart Camera values, existing silence metadata,
   legacy render IDs, in-flight jobs, rollback flags, and project revisions.
8. Static call-site checks confirming business services do not directly call
   BullMQ, Celery, Redis, or provider APIs; compatibility shims are listed in
   the wave manifest.

## Rollout gates and open decisions

Before enabling each wave, record numeric local/Worker budgets, browser support
matrix, model and contract fingerprints, alert owners, rollback criteria, and
the evidence link. Production enablement additionally requires Feature 186
deployment/recovery proof, managed-asset access proof, and a render comparison
against the Worker App.

The concrete browser vision/audio library, hosted Worker availability policy,
and exact tolerance for browser-versus-Worker plan comparison remain
implementation decisions. They must be selected without changing the
browser-first execution policy or the shared Feature 191/186 ownership
boundaries.
