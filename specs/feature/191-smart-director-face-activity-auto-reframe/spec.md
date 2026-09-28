# Feature 191 — Smart Director Face + Activity Auto-Reframe

**Status:** IMPLEMENTATION IN PROGRESS — shared Face + Activity planner,
Worker Quick/Full Scan preview path, Rust plan validation/render parity, a
capability-aware Python evidence contract, and the Feature 186 canonical scan
job boundary are implemented locally. New camera plans use
`camera.motion.v2`; the reader and native renderer retain compatibility with
`camera.motion.v1`. The current local Full Scan has face/motion evidence only
and is deliberately reported as degraded until a hand/object interaction
capability is installed and its evidence is accepted. Production completion
still requires real hand/object/object-detector capability evidence, deployment
recovery proof, and the rollout gates in this specification.

The current local browser Full Scan remains a face/motion-only fallback and
is not a production Full Scan producer. The server-side
`enqueueCompositionScanJob` helper, executor registration, checkpoint
contract, and Feature 186 job type are implemented and tested, but the Worker
App UI has not yet been wired to submit that canonical job and consume its
durable evidence artifact. Until that producer/consumer wiring and recovery
evidence exist, the UI must keep reporting the local result as degraded and
must not present it as an approved Face + Activity Full Scan.
**Created:** 2026-09-14
**Owner:** Worker App / Media Workspace / Media Intelligence
**Related features:**

- [Feature 162 — Vertical Drama B-roll Media Intelligence and Worker-first Editing](../162-vertical-drama-broll-media-intelligence-worker/spec.md)
- [Feature 163 — Worker App Sidebar and Series Media Workspace](../163-worker-app-sidebar-series-media-workspace/spec.md)
- [Feature 179 — Speaker-Aware VAD, Diarization and Adaptive Reframe Editing](../179-worker-speaker-aware-vad-diarization-reframe/spec.md)
- [Feature 184 — Web Video Editor Headless Worker](../184-web-video-editor-headless-worker/spec.md)
- [Feature 186 — Unified Job Control Plane Adapters](../186-unified-job-control-plane-adapters/spec.md)

This specification changes the behavior of the existing Smart Director
`auto` mode. It does not create a second job ledger, replace the existing
manual Mark-point workflow, or move media-composition logic into Feature 186.
Feature 186 supplies the durable analysis/render job lifecycle; this feature
owns the vision evidence, composition planner, preview behavior, and reframe
policy.

## 1. Executive decision

The existing `auto` mode becomes **Face + Activity**. Face detection remains an
important signal, but it is no longer the complete framing decision. Smart
Director combines face/person, hand/body, and active object/product evidence to
produce one temporal composition plan for both preview and final render.

The planner must keep the face visible while also keeping the object or action
that the person is performing inside the frame. It calculates zoom from the
actual required region, predicts movement to choose pan direction, and falls
back explicitly when the desired composition is impossible.

Two execution paths are supported:

1. **Quick mode:** produce a provisional plan during preview using sampled
   detections, tracking, existing manual Marks, and available local models.
2. **Full Scan mode:** scan the complete video before final render, persist
   temporal tracks and activity evidence, and generate the authoritative plan
   for the whole clip.

Full Scan is the quality path. Quick mode is the low-latency preview and
fallback path; it must not claim object-level understanding when the required
detector or track evidence is unavailable.

## 2. Problem and desired outcome

The current implementation can keep a detected face near a focus point, but a
person may be picking up, lifting, opening, presenting, or moving an object that
is outside the same crop. A fixed zoom and point-only focus signal cannot answer
how much of the person and object must remain visible or which direction the
camera should move next.

The desired outcome is a stable, explainable camera plan that:

- preserves the face and the active action in the same composition when the
  source framing allows it;
- zooms out automatically when the combined region becomes larger;
- pans toward the predicted movement direction before the subject leaves the
  crop;
- respects user-created Mark points and manual regions;
- remains smooth through detection noise, short occlusions, and subject entry
  or exit;
- uses the exact same plan for WYSIWYG preview and Worker/FFmpeg render; and
- reports low confidence or impossible framing instead of silently presenting a
  misleading crop.

## 3. Scope

### 3.1 In scope

- Change `smartDirectorMode = "auto"` to Face + Activity behavior.
- Preserve `face_focus`, `product_focus`, manual region, drag, wheel zoom, and
  multi-point Mark behavior.
- Add a shared temporal composition evidence and planner contract.
- Track face/person, hand/body, and object/product regions.
- Detect likely active interaction using proximity, motion persistence, and
  semantic/object evidence.
- Calculate safe ROI union, required zoom, predicted pan, smoothing, and
  fallback behavior.
- Provide Quick and Full Scan execution paths.
- Persist Full Scan evidence and the resulting camera plan as immutable,
  source-revision-bound analysis output.
- Run preview and final render from one compatible camera plan.
- Integrate analysis and render execution with the Feature 186 job contract.
- Add reviewable confidence, fallback, and impossible-composition states.

### 3.2 Out of scope

- Biometric identity or face recognition against real people.
- Voiceprint identification or named-speaker recognition.
- Automatic semantic understanding of every human action in the first release.
- Training a custom detector in the application runtime.
- Replacing the existing `productPins`/Mark data model in one migration.
- Changing the canonical `worker_jobs` ledger or adding another generic jobs
  table.
- Silent third-party upload of source video for analysis.
- Automatic destructive edits without a reviewable plan and source revision.

## 4. Existing contracts and current gap

The current shared camera contract stores keyframes as normalized `x`, `y`, and
`scale`. It supports `auto`, `face_focus`, and `product_focus`, but does not
carry a tracked region, required ROI, confidence, or target track IDs. The
automatic planner also contains periodic preset motion and fixed target-scale
defaults.

The Worker App player currently builds the plan from `focusX`, `focusY`,
`manualScale`, and `productPins`. The local media pipeline accepts a temporal
focus track containing only a point and confidence. A non-manual local reframe
without an AI track is rejected. These contracts are useful compatibility
boundaries but are insufficient for Face + Activity framing.

The implementation must extend these contracts additively and preserve old
plans through a compatibility reader. Existing plans remain renderable; new
plans use the new version and include the evidence required for review and
reconciliation.

### 4.1 Ownership and dependency boundary

The shared geometry/planner contract belongs in the shared video-editor package.
The Worker App owns local capability probing, frame sampling, detector/tracker
execution, and local render preparation. The hosted media-intelligence worker
may produce the same versioned evidence contract for a server-assisted scan.
The player owns provisional-plan display and user Marks, but it must not invent
a second camera-planning algorithm. Feature 186 owns dispatch, lease,
progress, cancellation, retry, and result settlement for the Full Scan job; it
does not own detector selection or crop geometry.

The dependency order is:

```text
shared evidence/geometry contract
  → planner and legacy projection
  → Worker capability + Quick tracking
  → Feature 186 Full Scan job
  → preview/render parity and review UI
  → canary and legacy auto-motion retirement
```

No wave may enable the new `auto` behavior for a job class until the earlier
contract and parity gates for that class have passed.

## 5. User modes and priority rules

### 5.1 Smart Director modes

| Mode | Behavior |
|---|---|
| `off` | No automatic camera plan. Existing manual behavior remains. |
| `auto` | **Face + Activity**. Uses Full Scan when available, otherwise Quick mode. |
| `face_focus` | Face/person-only compatibility mode. No object is added unless a manual Mark explicitly requires it. |
| `product_focus` | Existing Mark-driven product/object mode. Manual points remain authoritative. |

Quick versus Full Scan is an analysis policy, not a replacement for these
composition modes. The UI may expose it as `analysisQuality: "quick" | "full"`.

### 5.2 Target priority

The planner resolves competing evidence in this order:

1. Manual region or time-coded Mark point.
2. Explicitly selected object/product track.
3. Face plus hand/body plus active object interaction group.
4. Face plus person/body when no reliable object exists.
5. Face only.
6. Safe center or hold-last-valid fallback with a visible warning.

Manual Marks are hard anchors at their timestamps. Automatic motion may ease
into and out of them but may not overwrite them. Multiple Marks remain ordered
keyframes and retain the existing interpolation and hold behavior.

## 6. Canonical evidence and plan contract

The shared contract must introduce a versioned observation layer between vision
analysis and camera planning:

```ts
type TrackedRegionKind = "face" | "person" | "hand" | "object" | "interaction";

type TrackedRegion = {
  trackId: string;
  kind: TrackedRegionKind;
  label?: string;
  bbox: { x: number; y: number; width: number; height: number };
  confidence: number;
  visible: boolean;
  velocity?: { x: number; y: number };
  source: "manual_mark" | "face_detector" | "pose" | "hand_detector" | "object_detector" | "tracker";
};

type CompositionObservation = {
  timeMs: number;
  regions: TrackedRegion[];
  activeInteraction?: {
    regionTrackIds: string[];
    confidence: number;
    reason: "hand_proximity" | "held_object" | "persistent_motion" | "manual_target" | "semantic_match";
  };
  sceneId?: string;
};

type CompositionKeyframe = {
  timeMs: number;
  x: number;
  y: number;
  scale: number;
  targetTrackIds: string[];
  confidence: number;
  reason: "manual_mark" | "face_activity" | "face_person" | "face_only" | "fallback";
  easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out";
};

type CompositionPlan = {
  version: "composition.v1";
  sourceFingerprint: string;
  durationMs: number;
  analysisMode: "quick" | "full_scan";
  observations?: CompositionObservation[];
  evidenceRef?: string;
  keyframes: CompositionKeyframe[];
  fallback: "hold_last_valid_then_safe_center" | "zoom_out_then_pan" | "needs_review";
  diagnostics: { warnings: string[]; confidence: number };
};
```

The plan itself must remain bounded. Full-resolution observations belong in a
managed evidence artifact referenced by `evidenceRef`; an inline observation
array is limited to the configured summary window and must not exceed the
plan-size budget. The artifact stores sampled observations, tracker diagnostics,
and model/runtime metadata separately from lifecycle events.

Coordinate rules are part of the contract: all `bbox`, `x`, and `y` values are
normalized to the decoded, rotation-corrected source frame with origin at the
top-left; width and height are normalized by source width and height; `timeMs`
is source timeline time before trim mapping; and destination crop geometry is
defined by the requested output aspect profile. Values are finite, bounded to
their valid ranges, and rounded only at the render boundary. A trim or segment
mapping must preserve the source-time origin so a plan cannot drift after an
edit-map change.

Every observation and plan also carries a bounded `policyFingerprint` covering
the aspect profile, safe-margin policy, detector/tracker identities, sampling
policy, planner version, and Mark revision. This fingerprint is compared with
the source fingerprint before a plan can replace a provisional plan or start a
final render.

The existing `CameraMotionPlan` remains the render-compatible projection of
this contract. Its version must be incremented when the new evidence fields
become authoritative. The projection continues to provide `x`, `y`, `scale`,
and easing so current FFmpeg filters can consume it during migration.

## 7. Activity detection and target selection

Motion alone is not sufficient to identify the important object. Background
motion, camera shake, and other people can move without being the action the
user wants to preserve. Activity scoring therefore combines:

- hand/object proximity and overlap;
- hand and object velocity over a persistence window;
- object visibility and detector confidence;
- whether the object remains associated with the same person;
- an explicit user Mark or selected object track;
- shot intent or product priority when available; and
- track continuity through short occlusions.

The initial interaction group is normally `face + upper body + active hand(s) +
active object`. If the object is too far from the face, the planner uses the
minimum region that preserves the face and the action-bearing hand/object while
respecting the configured priority.

The planner must never present a generic moving region as a verified product or
action. Uncertain classification is recorded as `object_unknown` or
`activity_uncertain` and follows the configured fallback policy.

## 8. Composition planner

For each planning interval:

1. Resolve manual Marks and explicit user regions for that time range.
2. Select the highest-confidence target regions according to the priority
   rules.
3. Build their union bounding box and add a configurable safe margin.
4. Calculate the minimum crop/zoom that contains the union for the destination
   aspect ratio. Do not use a fixed target scale when the required region is
   larger or smaller.
5. Estimate the next target center from bounded velocity/trajectory history.
6. Pan toward the predicted center with a lead time bounded by the movement
   confidence and maximum pan velocity.
7. Apply deadband, hysteresis, and easing so small detector changes do not
   create jitter.
8. Clamp scale, pan position, acceleration, and crop margins to the execution
   profile.
9. Emit diagnostics when the union cannot fit, a target disappears, or a
   scene cut invalidates the previous trajectory.

The planner must use one documented crop coordinate convention. Given source
dimensions, destination aspect ratio, normalized union ROI, and safe margin, it
derives the visible source window at the candidate scale and verifies that the
entire protected ROI lies inside that window. Pan is then clamped to the set of
positions that keep the window inside the source. A numerically valid center
point is not sufficient evidence that the ROI is visible.

The implementation must expose pure functions for `unionProtectedRoi`,
`requiredScale`, `clampPanToVisibleWindow`, `predictTargetCenter`, and
`smoothCameraTrajectory`. They must return a diagnostic when the feasible pan
set is empty instead of silently clamping to an unrelated position.

If the target cannot fit at the allowed scale, the order is:

```text
zoom out → pan toward the highest-priority region → hold last valid target
→ safe center/wide fallback → needs_review when confidence is insufficient
```

Scene cuts reset velocity and smoothing state. Occlusion holds the last valid
target for a bounded interval, then eases to a wider composition rather than
teleporting the crop.

## 9. Quick mode

Quick mode is designed for immediate preview and low-resource devices.

### 9.1 Inputs

- existing face detection;
- person/body and hand landmarks when the runtime capability is installed;
- manual Marks as hard anchors and object seeds;
- lightweight object tracking between sampled frames;
- source dimensions, aspect ratio, and destination crop profile.

Capability probing must return a matrix for the requested mode: detector/model
identity, supported region kinds, sampling cadence, estimated latency, memory
budget, and quality tier. Quick mode chooses only a capability that has passed
the probe; it must not infer that an installed face model can detect products.

The detector cadence is adaptive and bounded. The implementation must measure
latency and avoid blocking the playback/render event loop. A provisional plan
may use the last known valid evidence while a new sample is being analyzed.

### 9.2 Limitations and truthful fallback

If no object detector or reliable object seed is available, Quick mode may still
produce Face + Person/Hand framing, but it must label the result as
`activity_partial` and must not claim that an arbitrary object is tracked.
The Full Scan action remains available to obtain authoritative object evidence.

### 9.3 Replacement by Full Scan

When Full Scan completes, its plan replaces the provisional plan only if the
source fingerprint, trim range, aspect ratio, and Mark revision still match.
Otherwise the result is stale and requires a new scan.

## 10. Full Scan mode

Full Scan is an offline, source-revision-bound analysis job:

```text
source snapshot
  → probe and normalize orientation
  → adaptive frame sampling and scene detection
  → face/person/pose/hand detection
  → object/product detection
  → temporal tracking and occlusion handling
  → activity/interaction scoring
  → composition planning
  → immutable CompositionPlan
  → preview and final render
```

The scan must not require uploading source bytes to a third party. Model and
runtime identity, sampling cadence, source fingerprint, and configuration are
stored with the result so a plan is reproducible and diagnosable.

The plan is invalidated when any of these change:

- source fingerprint or orientation;
- trim range or shot segment mapping;
- output aspect ratio or crop profile;
- Mark set or Mark revision;
- detector/tracker model or runtime identity;
- planner policy version.

Full Scan is resumable at bounded stage checkpoints. A worker restart may
resume from the last durable checkpoint for the same source and policy
fingerprint; it must not append a second active scan for the same idempotency
tuple. A cancelled or stale scan retains its diagnostic record but cannot be
promoted to the active composition plan.

## 11. Mark-point compatibility

Existing Mark points remain the user's direct camera-direction input.

- A Mark at time `t` becomes a hard composition anchor at `t`.
- A Mark with an optional scale retains its explicit scale unless the user
  chooses an adaptive-scale option.
- Between Marks, auto planning may use Face + Activity evidence and smoothly
  transition to the next Mark.
- If a Mark conflicts with an impossible crop, the system preserves the Mark
  position, reduces zoom when allowed, and reports a review warning rather than
  silently moving the target.
- Existing local storage and project metadata migrations must preserve Mark IDs,
  timestamps, normalized coordinates, pixel coordinates, and ordering.
- Adding, moving, deleting, or reordering a Mark increments `markRevision`,
  invalidates any pending promotion that used the previous revision, and
  causes the player to show the current manual plan immediately while a new
  Quick or Full plan is generated. A scan must never write a stale Mark set
  back into the project.

## 12. Preview/render parity

The browser preview and Worker render must consume the same approved normalized
`CompositionPlan` or its deterministic `CameraMotionPlan` projection. A Quick
preview may temporarily use a provisional plan, but it is not equivalent to an
approved Full Scan plan until promotion succeeds.
The browser may show a provisional Quick plan, but it must label that state and
must not present it as the final Full Scan result.

The render boundary must retain:

- source and trim-time mapping;
- destination aspect ratio and dimensions;
- keyframe timestamps and easing;
- safe margin and fallback policy;
- target track IDs and confidence diagnostics; and
- plan/model/runtime fingerprints.

Parity is measured in source-time coordinates before rasterization. For an
approved plan, preview and render must agree within one sampled frame or 40 ms
(whichever is larger) for keyframe time, and within 0.01 normalized units for
pan/ROI center after aspect-ratio conversion. Any larger difference is a
parity failure and blocks the affected rollout wave.

When a Full Scan plan is unavailable, the preview labels the output as
`provisional_quick_plan`; the final render must either use the approved Full
Scan plan or require an explicit user approval to render with the provisional
plan and its known limitations.

The local FFmpeg path must continue to accept legacy plans during migration and
must reject malformed or unsupported new plans before starting an encode.

## 13. Feature 186 job integration

Full Scan uses a canonical media-analysis job through Feature 186. The job
payload contains only the canonical source reference, source fingerprint,
analysis policy, Mark revision, output profile, and bounded routing metadata.
It does not contain provider credentials or arbitrary executable expressions.

The job lifecycle must expose progress stages such as:

```text
probe → sample → detect → track → activity_score → plan → ready
```

The job is idempotent for the tuple:

```text
sourceFingerprint + trimRange + aspectProfile + markRevision + analysisMode
  + policyFingerprint + runtimeCapabilityProfile
```

The tuple is part of the canonical idempotency key and must include the trim
range, destination aspect profile, analysis mode, policy fingerprint, and
capability profile. A job may carry a separate canonical `jobId`, but changing
any tuple member must not reuse the previous analysis artifact. Promotion
fencing compares the same tuple, including trim and aspect, before a result can
replace a provisional plan.

Repeated delivery must return the same analysis artifact and must not run a
second paid/provider side effect. Cancellation, stale source revisions,
worker loss, and retry follow Feature 186 lease and settlement rules.

The analysis artifact is an immutable managed result linked to the canonical
job. It is not a second job status source and must be reconciled by `job_id`.

### 13.1 Job envelope and promotion fencing

The Full Scan job uses an allowlisted job type such as
`media.composition_analysis` with execution class `cpu` or `long` and a
versioned contract. Its envelope contains:

```json
{
  "sourceAssetId": "managed-or-local-reference",
  "sourceFingerprint": "sha256:...",
  "trimRange": { "startMs": 0, "endMs": 12000 },
  "aspectProfile": "9:16",
  "markRevision": "marks-v7",
  "analysisMode": "full_scan",
  "policyFingerprint": "composition-policy-sha256:..."
}
```

The server derives tenant, actor, source ownership, routing, and capability
policy. A worker may report progress only with the Feature 186 lease context.
The job records bounded stage progress and emits one idempotent event per stage
transition; detector telemetry is stored in the managed analysis artifact, not
as unbounded lifecycle events.

Quick-to-Full promotion is a guarded compare-and-swap operation over source
fingerprint, Mark revision, trim mapping, aspect profile, capability profile,
and plan generation. A late Full Scan
result may be retained for diagnostics, but it cannot replace a newer manual
Mark revision, a newer approved plan, or a different source revision. Repeated
promotion requests return the original durable outcome.

## 14. Failure and fallback contract

| Condition | Behavior |
|---|---|
| Face missing briefly | Hold last valid composition, then widen smoothly. |
| Object missing briefly | Keep face/person and mark activity confidence lower. |
| Hand/object occluded | Preserve last valid target for a bounded interval; do not invent a new target. |
| Multiple moving objects | Use explicit Mark/selected track; otherwise weighted compromise and warning. |
| Scene cut | Reset tracker and camera velocity; start a new local composition segment. |
| Impossible union ROI | Zoom out, pan to priority target, then `needs_review` if still unsafe. |
| Quick detector unavailable | Use supported lower-quality evidence and label `activity_partial`. |
| Full Scan unavailable | Keep Quick plan only as provisional; do not claim full object coverage. |
| Source changed during scan | Quarantine result as stale and require a new source-bound scan. |
| Malformed plan | Reject before render and retain the previous valid plan. |

No fallback may silently turn a requested Face + Activity render into an
unexplained center crop.

## 15. Security, privacy, and resource controls

- Source video remains on the authorized Worker/device unless a separately
  approved provider policy says otherwise.
- Analysis artifacts and track IDs are scoped to the tenant and source asset.
- Raw frames, prompts, credentials, and unrestricted detector payloads are not
  stored in lifecycle events.
- Object labels and confidence are bounded and redacted where required by the
  existing media privacy policy.
- Model files and runtime versions are pinned and verified before use.
- Frame sampling, maximum video duration, maximum track count, plan size, and
  analysis CPU/memory budgets are explicit per execution class.
- The analysis worker must not block the UI playback event loop or the Node
  transport lock-renewal loop.

### 15.1 Review and UI state contract

The player and review surface must distinguish these states:

```text
manual
quick provisional
full scan running
full scan ready
stale result
needs review
rendering from approved plan
```

Each fallback span displays its time range, protected target, confidence tier,
and reason in concise user-facing language. The user can accept the current
plan, edit a Mark, choose a detected track, request Full Scan, or keep the
previous approved plan. The UI must not imply that an object was tracked when
the result only contains face/person evidence.

The review controls must expose keyboard-accessible Mark editing, visible
focus indicators, non-color-only confidence/fallback indicators, localized
labels, and a text alternative for warnings. Loading, cancelled, failed,
stale, and unavailable-detector states must each have an actionable message.

## 16. Rollout plan

### Wave 0 — Contract and planner foundation

- Add versioned composition evidence and plan types.
- Build pure ROI/zoom/pan/smoothing/fallback functions.
- Make the planner consume current face points and product Marks first.
- Preserve legacy plan reads and manual behavior.

### Wave 1 — Auto behavior switch

- Change `auto` to Face + Activity policy selection.
- Keep `face_focus` and `product_focus` unchanged.
- Add explicit Quick/Full policy state and provisional-plan labeling.

### Wave 2 — Quick tracking

- Add person/hand evidence and bounded tracking.
- Add Mark-seeded object tracking.
- Measure preview latency and verify that playback remains responsive.

### Wave 3 — Full Scan

- Add the Feature 186-backed analysis job.
- Run object detection, temporal tracking, activity scoring, and whole-clip
  composition planning.
- Persist immutable evidence and plan fingerprints.

### Wave 4 — Render parity and review

- Consume the same plan in preview and Worker/FFmpeg render.
- Show target regions, confidence, fallback spans, and impossible framing
  warnings.
- Enable bounded canary rollout by job type and execution class.

### Wave 5 — Quality gate and legacy retirement

- Compare Face-only, Quick, and Full Scan outputs on representative fixtures.
- Retain the compatibility reader until all old plans are outside the rollback
  and retention window.
- Retire fixed periodic auto motion only after parity and recovery evidence pass.

## 17. Acceptance criteria

### Composition behavior

- `auto` keeps a detected face and a high-confidence active object/hand region
  in the same frame whenever the source geometry allows it.
- Zoom is derived from the required ROI and safe margins, not a fixed scale.
- Pan direction uses bounded movement prediction and does not oscillate on
  small detector noise.
- Scene cuts, occlusions, entry/exit, and confidence loss have explicit,
  smooth fallback behavior.
- Impossible framing is reported as a warning or `needs_review` state.

### Mark compatibility

- Existing single and multi-point Marks still control their timestamped
  anchors, interpolation, scale, and preview behavior.
- Auto planning cannot overwrite a Mark without an explicit user action.
- Mark and source revisions invalidate stale Full Scan plans deterministically.

### Execution modes

- Quick mode provides a bounded provisional plan without blocking playback.
- Full Scan produces a source-bound plan covering the entire requested range.
- Full Scan replaces Quick only when all input revisions still match.
- Missing detector capability is shown as a quality limitation, not hidden.

### Preview/render

- Preview and final render consume equivalent keyframes and crop semantics.
- Legacy camera plans remain renderable during migration.
- The Worker rejects unsupported or malformed plans before encoding.

### Reliability and safety

- Duplicate analysis-job delivery produces one plan artifact.
- Worker loss, cancellation, stale source, and retry preserve idempotency and
  do not duplicate external side effects.
- Tenant authorization and artifact ownership are enforced for evidence, plans,
  Marks, and rendered outputs.
- No raw source frame, credential, or unrestricted provider payload appears in
  lifecycle events or admin diagnostics.

## 18. Verification plan

### Unit and property tests

- ROI union and safe-margin geometry for 16:9, 9:16, 1:1, and source aspect
  ratios.
- Required zoom calculation and maximum crop bounds.
- Pan prediction, deadband, hysteresis, easing, and maximum velocity.
- Manual Mark priority, multi-Mark interpolation, and conflict warnings.
- Confidence decay, occlusion hold, scene-cut reset, and fallback transitions.
- Plan versioning, fingerprinting, malformed-input rejection, and legacy read
  compatibility.
- Coordinate conversion and trim/segment remapping at non-integer frame rates.
- Empty-track, detector-unavailable, duplicate-track, and NaN/overflow inputs.
- Concurrent Quick/Full promotion and Mark revision races with exactly one
  active approved plan.

### Fixture videos

- Talking head with no object activity.
- Person picking up and presenting a product.
- Object moving from one side of the frame to the other.
- Two people with one active object.
- Hand/object occlusion.
- Fast movement near a crop boundary.
- Camera movement with a static subject.
- No face but a marked object.
- Impossible multi-subject framing.

### Integration and browser verification

- Quick preview remains responsive on the supported low-resource profile.
- Full Scan progress, cancel, retry, and stale-source behavior follow Feature
  186.
- Mark creation/edit/delete and preview behavior remain unchanged.
- Full Scan plan produces the same target path in preview and rendered output
  within the documented pixel/timing tolerance.
- Review UI clearly distinguishes canonical plan state, detector evidence,
  and fallback warnings.
- A late or duplicate Full Scan completion cannot overwrite a newer Mark,
  source revision, or approved plan.

### Operational evidence

- Per-mode latency, CPU/memory, sample rate, detector confidence, plan size,
  fallback rate, subject clipping rate, and render parity are measured.
- Rollout manifest records model/runtime identity, budgets, canary scope,
  rollback flag, and evidence links.
- Production claims require real Worker/device and representative media
  evidence; mock detector tests alone are insufficient.

The verification report must identify the source revision, model/runtime
identity, planner version, aspect profile, device class, and exact fixture
results. A test that only asserts the presence of a keyframe or a detector
response is insufficient to prove that the protected face and active object
remain visible.

Before enabling a job class, the rollout manifest must record numeric budgets
for that class. Initial defaults are implementation-plan inputs, not permanent
truth: Quick preview target latency is `<= 250 ms` per sample on the supported
low-resource profile; Full Scan sampling is bounded to `2–10 fps`; a plan is
limited to `<= 512` keyframes and `<= 256` active tracks; detector confidence,
analysis duration, CPU/memory, and artifact size have explicit ceilings. The
implementation plan may tighten these values after device measurements, but it
must not enable the class without recording the measured budget and owner.

The production gate also requires a representative fixture set with measured
face retention, active-object retention, subject-clipping rate, fallback rate,
and preview/render parity. A pass/fail threshold and rollback owner are
recorded per aspect profile; qualitative screenshots alone do not pass the
gate.

## 19. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Object detector model is too slow or large | Capability-gated model, adaptive sampling, Quick fallback, bounded Full Scan concurrency. |
| False object selection | Hand proximity, persistence, Mark override, confidence threshold, review warning. |
| Crop jitter | Temporal smoothing, deadband, hysteresis, max velocity/acceleration. |
| Preview differs from render | One normalized plan and parity fixtures. |
| Source changes after scan | Source fingerprint and plan invalidation. |
| Multiple important subjects cannot fit | Weighted compromise plus explicit `needs_review`. |
| Existing users depend on periodic auto motion | Legacy plan reader and staged `auto` rollout flag. |
| Model/runtime drift | Pinned model identity and evidence in the plan fingerprint. |

## 20. Open implementation decisions

These decisions belong in the implementation plan after the contract is
approved:

- final hand/object detector and object detector model compatible with the
  Worker App distribution and licensing policy;
- Quick-mode sample cadence by device capability;
- Full Scan default sample rate and maximum analysis duration;
- exact safe-margin, zoom, pan-velocity, and confidence budgets per aspect
  profile;
- whether the UI exposes a separate `analysisQuality` selector or chooses Full
  Scan automatically before final render;
- managed artifact format for composition evidence and retention policy.

## 21. Completion definition

Feature 191 is complete only when `auto` is Face + Activity, Marks remain fully
functional, Quick and Full Scan are truthful and observable, Full Scan plans are
idempotent and source-bound, preview/render parity is proven, and representative
fixtures show reduced face/object clipping without unacceptable pan/zoom jitter.
Local unit tests and mocked detectors are necessary but do not prove quality on
real Worker devices or representative production media.
