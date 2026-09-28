# Feature 179 — Speaker-Aware VAD, Diarization & Adaptive Reframe Editing

**Status:** SPECIFICATION — planning only; implementation requires a separately approved plan
**Created:** 2026-09-06
**Owner:** Worker App / Media Workspace / Vertical Drama Production
**Companions:**

- [Feature 162 — Vertical Drama B-roll Media Intelligence Worker](../162-vertical-drama-broll-media-intelligence-worker/spec.md)
- [Feature 169 — Vertical Drama Footage Intelligence Worker](../169-vertical-drama-footage-intelligence-worker/spec.md)
- [Feature 176 — Drama Series Emotion Timeline & Music Direction](../176-drama-series-emotion-timeline-web/spec.md)
- [Feature 178 — Group-Native MiniMax Music 3 Plan and Mix](../178-vertical-drama-group-native-music3-plan-mix/spec.md)

## 1. Objective

Replace the current one-dimensional Dead Air threshold experience with a
truthful, evidence-backed media scan that can answer:

- When is there speech, silence, music, noise, or SFX?
- How many distinct speakers are likely present?
- Which speaker is active in each interval?
- Which face or whole-body track is most likely associated with that speaker?
- Does each person remain seated/standing in a stable screen position, or do
  they move between positions?
- Should the edit hold a slow camera move, cut immediately to another speaker,
  or preserve the current shot?
- Which non-essential dialogue or silence can be removed to create a concise
  short-form edit without changing user-approved content silently?

The feature must support two related but separate workflows:

1. **Silence Cut / Dead Air:** retain the existing workflow for removing
   unwanted silence, speech mistakes, pauses and jump-cut candidates. Existing
   manual ranges, profile settings and render behavior remain supported.
2. **Speaker-Aware Edit Planning:** scan the complete video, persist observed
   audio/visual evidence, and produce an editable plan for speaker focus,
   camera movement, camera switching and optional content condensation.

No model may claim a speaker identity or active face when the evidence is
insufficient. Unknown, ambiguous and unavailable results are first-class
outcomes.

## 2. Core design decision

Use a staged hybrid pipeline rather than one all-in-one model, but expose it as
a user-directed workflow graph rather than a fixed mandatory sequence:

```text
source snapshot
  -> media probe + audio extraction
  -> VAD adapter(s)
  -> optional speaker diarization
  -> face and person/body tracking
  -> active-speaker association
  -> position/stability analysis
  -> transcript/topic analysis (optional)
  -> editable camera and condensation plan
  -> user review/locks
  -> FFmpeg/Remotion render
```

This diagram is the maximal assisted-edit path, not a required order. In the
subtitle-first example, the first render stops after the composed 16:9 edit
map; the later speaker/reframe scan starts from that published artifact and
its composition map.

Audio evidence determines speech intervals and speaker clusters. Visual
evidence determines which visible subject could be speaking. The association
stage combines both, but must not infer a precise speaker from audio alone when
the recording is mono or the visual evidence is missing.

This separation keeps the existing Silence Cut deterministic and makes the
speaker-aware layer replaceable. It also allows low-cost preview analysis and
more accurate offline analysis without changing the render contract.

### 2.1 User-directed workflow modes

The stages are composable and may be run in different orders against a source
or a derived artifact. The user selects the goal and the minimum stages needed;
the system must not force diarization, face tracking or camera switching when
the requested result does not need them.

Supported first-class workflow examples:

1. **Subtitle-first 16:9 editorial cut:** use subtitle/transcript, VAD and
   optional manual ranges to propose and review a concise cut while preserving
   the original 16:9 composition. No speaker diarization or camera switching is
   required.
2. **Speaker-aware reframe after editorial cut:** use the approved 16:9 cut as
   a new immutable source snapshot, then run speaker/face/body analysis and
   produce a 9:16 crop/camera plan only for the retained content.
3. **Speaker-first coverage:** analyze speakers and positions on the original
   source, then let the user apply Silence Cut or condensation afterward.
4. **Full assisted edit:** combine subtitle condensation, Silence Cut,
   speaker association and reframe, with each stage independently reviewable.

Each stage declares inputs, outputs, optional dependencies and invalidation
scope. A later stage may consume a prior approved artifact, but it may not
silently modify that artifact. The UI presents these as selectable workflow
recipes plus a custom step-by-step mode.

Only these invariants are mandatory across every mode: immutable source/output
references, explicit coordinate/edit-map mapping, user-visible adapter policy,
stale-input detection, and approval before destructive render. All analysis and
planning stages remain optional unless selected by the user or required by a
specific selected action.

### 2.1.1 Standalone media workspace

Speaker-aware analysis is also a general media-workspace capability and must
not require a Vertical Drama Series. When the user works without a Series, the
Worker selects and persists a local-only root, submits `seriesId: null`, and
the server queues the job without a `workerSeriesBinding` row. The Worker must
still enforce the local root boundary, source fingerprint, adapter preflight,
approval and artifact publication contracts. Series-bound jobs retain their
existing tenant ownership and binding-revision checks; standalone jobs must
never use a Series root accidentally.

### 2.2 Scope boundaries and non-goals

This feature does not perform biometric identification, voiceprint matching to
real people, face recognition against a person catalog, lip-reading, model
training, or silent upload of audio/video to a third-party service. `speaker_01`
means an anonymous cluster within one scan; it does not mean a named actor.

The first release does not apply a destructive automatic edit directly to the
source. It produces evidence and a reviewable plan. A final render requires an
approved composed edit map, and existing Silence Cut remains usable without
running speaker-aware analysis.

## 3. VAD and diarization adapter architecture

### 3.1 VAD contract

Introduce a typed adapter boundary in the Worker. The contract must expose
capability, runtime identity, measured output and failure state:

```rust
trait VadBackend {
    fn id(&self) -> &'static str;
    fn probe(&self, request: &VadProbeRequest) -> VadCapability;
    fn analyze(&self, request: &VadRequest) -> Result<VadResult, VadError>;
}
```

Every adapter returns half-open millisecond intervals and calibrated confidence,
not only a boolean:

```yaml
backend_id: silero_onnx
backend_version: "pinned-runtime-version"
runtime_identity: "measured-runtime-fingerprint"
status: ready
segments:
  - start_ms: 4200
    end_ms: 7350
    speech_confidence: 0.93
    speech_type: dialogue
    boundary_confidence: 0.88
```

The first implementation must register these adapters:

| Adapter | Role | Policy |
|---|---|---|
| `SileroOnnx` | baseline offline VAD | default for full scan; stable CPU path; model/runtime must be pinned and probed |
| `FireRedOnnx` | evaluation/optional offline VAD | benchmark on Thai drama, music, SFX and overlapping speech before production enablement |
| `TenVad` | realtime preview | use only when its runtime is installed and measured latency is acceptable |
| `WebRtcVad` | low-resource fallback | fallback for preview or low-spec hosts; label quality limitations |

The adapter router chooses a backend by requested mode, installed capability,
hardware/resource budget and explicit user policy. It must never silently
substitute a different backend while retaining the requested backend identity.
If the requested backend is unavailable, the result records the fallback,
reason and quality tier.

### 3.1.1 User-controlled adapter policy

Adapter selection is a persisted user/project setting, not an implicit runtime
heuristic. The UI must let the user choose each active backend independently:

```yaml
adapter_policy_version: 1
mode: standard
vad:
  enabled: true
  backend: silero_onnx
  fallback_policy: deny
  allowed_fallbacks: []
diarization:
  enabled: true
  backend: pyannote
  fallback_policy: report_unknown
visual_speech:
  enabled: true
  backend: mediapipe_face_landmarker
  fallback_policy: deny
person_tracking:
  enabled: true
  backend: mediapipe_person_pose
  fallback_policy: report_unknown
posture:
  enabled: true
  backend: mediapipe_pose
  fallback_policy: report_unknown
```

Required policy rules:

- `fallback_policy: deny` fails the dependent stage with a visible capability
  error when the selected adapter is unavailable, incompatible or unhealthy.
- `fallback_policy: allow_listed` may use only the exact adapters in
  `allowed_fallbacks`; it may not discover or select an unlisted backend.
- `fallback_policy: report_unknown` completes the stage with unknown/partial
  evidence and never substitutes another model.
- The default for `Standard` and `High accuracy` speaker-aware scans is
  `deny` for VAD, diarization and visual-speech association. `Fast preview` may
  use explicitly allow-listed fallbacks.
- The effective policy, selected backend, fallback decision, capability probe,
  model/runtime revision and policy hash are persisted in the analysis artifact.
- Changing any adapter selection, fallback rule, model revision or policy
  parameter invalidates the dependent scan and downstream plans.

The Worker validates this policy before claiming a job. A job payload cannot
override it with an arbitrary executable, model path, remote endpoint or
unregistered adapter ID. A missing selected adapter is a blocked result, not a
silent downgrade.

### 3.2 VAD policy is not the old percentage slider

The current percentage presets remain available for legacy Silence Cut, but the
speaker-aware scan uses:

- calibrated VAD probability;
- adaptive noise-floor and audio-level statistics;
- minimum speech and minimum pause duration;
- boundary smoothing with a bounded speech-preservation buffer;
- separate classification for dialogue, music, SFX and unknown activity.

The UI should show confidence bands and detected intervals. The old horizontal
Dead Air threshold line remains for the legacy analyzer so existing projects
remain understandable; it is not presented as the active-speaker decision
boundary.

### 3.3 Diarization boundary

Use a separate `DiarizationBackend` contract. It consumes VAD speech intervals
and produces anonymous speaker clusters such as `speaker_01`, not names:

```yaml
speaker_id: speaker_01
start_ms: 4200
end_ms: 7350
speech_confidence: 0.93
speaker_confidence: 0.84
embedding_revision: pinned-model-revision
```

`pyannote` is an optional high-accuracy backend for multi-speaker analysis. It
must not be required for every preview or low-spec device. It is enabled only
when its model, license/terms, runtime and resource budget are explicitly
validated. Without diarization, the system may report speech intervals but
must report `speaker_id: unknown` rather than inventing speaker separation.

The same user-controlled policy applies to diarization. `enabled: false` is a
valid deliberate choice and produces audio-only speaker evidence, while
`enabled: true` plus an unavailable selected backend is blocked unless the user
explicitly configured an allow-listed fallback.

## 4. Visual tracking and active-speaker association

### 4.1 Face and full-person evidence

The existing MediaPipe Face Detector remains the first face backend. The scan
must also support a `PersonTrackBackend` for cases where a person is turned
away, partially occluded, too far away, or has no usable face landmarks.

Each visual track uses an opaque scan-local string ID and stores:

- stable scan-local `track_id`;
- source-time interval and sampled bounding boxes;
- normalized center, width, height and visibility/occlusion confidence;
- face evidence when available, including keypoint quality;
- body/pose evidence when face evidence is unavailable;
- seated/standing/unknown posture classification with confidence;
- position clusters and movement/stability statistics.

The implementation may use MediaPipe person/pose capabilities or another
allowlisted detector, but the backend identity and model revision must be
persisted. A body track is positional evidence only; it is not proof of a
speaker identity.

Face detection alone is not active-speaker detection. Add an explicit
`ActiveSpeakerVisualBackend` boundary for mouth/lip motion or another
time-varying visual speech signal. A face box with no temporal mouth evidence
may identify a visible candidate, but it must not produce an `observed`
active-speaker result. If only a body/pose signal is available, the result is
`body_only` and carries a lower quality tier.

Posture classification is a capability of the person/pose backend. If the
installed detector cannot distinguish seated from standing with measured
confidence, persist `posture: unknown` rather than inferring it from bounding
box height alone.

### 4.2 Active-speaker association score

For each speech interval and visible track, calculate a bounded evidence score
from independent signals:

```text
association =
  audio_speaker_match
  * visible_overlap
  * mouth_motion_when_face_is_valid
  * face_or_body_continuity
  * composition_quality
```

The score must retain component values and missing-signal reasons. Suggested
outcomes:

- `active_face_track_id`: high-confidence face association;
- `active_person_track_id`: body-only association when face is unavailable;
- `candidate_track_ids`: multiple plausible tracks;
- `unknown`: no defensible association.

When two people are visible and the audio is mono, the system must not choose a
face solely because it is larger or closer to the center. Mouth motion,
temporal continuity and speaker-cluster consistency are required. If the
evidence remains tied, mark the interval ambiguous and expose it for review.

### 4.3 Sitting/standing and position stability

The scan computes stable screen regions such as `left_seated`,
`center_standing`, or `right_background` from track observations. These are
descriptive labels, not character identities. Position stability includes:

- median center and bounding box over time;
- movement velocity and direction;
- shot-boundary resets;
- occlusion gaps and re-identification confidence;
- seated/standing transitions;
- whether a track exits the render-safe crop.

A camera plan may use a stable position as a preferred target, but a low
stability score must produce a review warning instead of aggressive automatic
panning.

## 5. Full-video scan and persisted evidence

### 5.1 Scan flow

The recommended full-analysis operation scans the complete selected source
artifact before planning edits. This is not mandatory: a user may first create
an approved subtitle/Silence Cut edit in 16:9, publish that derived artifact,
and then run only the speaker/reframe stages against the shorter 16:9 result.
The scan operation therefore accepts either the original source or a derived
artifact with a valid composition edit map:

1. Capture an immutable source snapshot, media checksum and probe.
2. Extract or reference a normalized mono analysis audio stream.
3. Run VAD and classify speech/music/SFX/unknown intervals.
4. Run diarization only when requested or when multi-speaker evidence requires
   it.
5. Sample frames at a bounded rate and track faces/persons across shot
   boundaries.
6. Associate speech intervals with visual tracks.
7. Compute stable positions, movement opportunities and ambiguity warnings.
8. Discover embedded and sidecar subtitle tracks (SRT, VTT, ASS and supported
   platform caption formats), validate their checksum/timing/language, and
   normalize them into subtitle evidence.
9. Reuse the existing transcript/ASR artifact when its source and edit-map
   hashes match; otherwise queue a new analysis.
10. Persist a versioned analysis artifact and a compact timeline projection.

The scan is resumable and checkpointed. It must not re-run paid semantic
planning or music generation when only a preview is requested.

Scan lifecycle is durable and idempotent:

- identical source checksum, edit-map hash, policy, backend revisions and
  contract version may reuse a completed immutable analysis;
- a running scan supports cooperative cancellation and records the last safe
  stage/checkpoint;
- resume validates the original source and runtime fingerprint before reuse;
- a changed source, policy, backend revision or model revision creates a new
  analysis revision and marks dependent plans stale;
- retry uses the same request identity until the outcome is known and never
  creates duplicate artifacts for one scan request.

### 5.2 Canonical analysis artifact

Add `SpeakerAwareMediaAnalysisV1` with these required fields:

- source checksum, probe, timeline/edit-map hash and coordinate space;
- VAD backend identity, fallback identity, thresholds/policy and confidence
  calibration revision;
- requested/effective adapter policy, policy hash, capability probe and fallback
  decision for every adapter stage;
- speech/activity intervals;
- optional diarization intervals and anonymous speaker clusters;
- `speakerCountEstimate`, `speakerCountConfidence` and `speakerCountBasis`
  (`diarization`, `audio_only`, `visual_only`, `partial` or `unknown`);
- face tracks, person/body tracks and position clusters;
- active-speaker associations with evidence components and ambiguity reasons;
- transcript/ASR artifact reference and mapping status;
- subtitle evidence references, language/track selection, timing origin and
  subtitle-versus-ASR conflict intervals;
- analysis status `ready`, `partial`, `empty`, `unavailable` or `failed`;
- measured runtime, model revisions, duration, resource usage and warnings.

Large waveforms, frame samples, embeddings and token lists remain authenticated
checksum-addressed artifacts. The compact projection must not contain raw
embeddings or unbounded transcript text.

## 6. Camera and edit-plan generation

### 6.1 Camera actions

The planner produces non-destructive actions against source/cut coordinates:

- `hold`: keep the current composition while the target remains safely framed;
- `slow_move`: interpolate toward a target over a bounded duration with easing;
- `cut_to_track`: switch to another approved track at a speech/scene boundary;
- `cut_to_wide`: use a group/wide shot when active-speaker evidence is
  ambiguous or multiple speakers are active;
- `manual_lock`: preserve the user's chosen target and timing;
- `no_change`: no evidence-supported camera action.

Each action stores target track, start/end, confidence, reason, source
coordinates, crop-safe validation and whether it requires user approval.

Default behavior is conservative:

- hold the frame while the active speaker remains inside the inner safe zone;
- move slowly only when the speaker approaches the crop boundary;
- cut immediately only at a valid shot boundary or approved jump-cut point;
- never chase a low-confidence detection into an empty region;
- if a person leaves the frame, use the next high-confidence speaker or a wide
  shot rather than oscillating between background candidates.
- enforce a configurable switch debounce and minimum hold duration; the first
  release defaults to at least two consecutive analysis windows plus a 500 ms
  minimum hold before another automatic target switch;
- use a bounded ease-in/ease-out duration for `slow_move` and reject a move
  whose crop-safe validation fails at any sampled frame.

### 6.2 Multi-speaker switching

When more than one speaker is detected, the planner considers:

- current active speaker and confidence;
- whether the current camera already contains the next speaker;
- conversational turn boundary and overlap;
- stable seating/standing position;
- shot availability and crop safety;
- user preference for slow conversational coverage or rapid jump cuts.

Overlapping speech produces a split/ambiguous state when no single active
speaker can be justified. The planner may recommend a wide shot or retain the
current frame, but must not claim a definitive speaker.

### 6.3 Short-form condensation

The optional `content_condensation` mode reuses the existing transcript/ASR
pipeline, accepts normalized embedded/sidecar subtitle evidence, and adds
topic segmentation and importance scoring. It produces an editable proposal,
not an automatic destructive cut:

- topic/segment IDs and source/cut intervals;
- concise summary and retained key points;
- kept, optional and proposed-removed ranges;
- reason codes such as repetition, filler, off-topic, dead air, mistake or
  unresolved ambiguity;
- transcript/subtitle evidence, source language and timing origin;
- confidence, subtitle-ASR conflict markers and semantic execution provenance;
- user locks, exclusions and manual overrides.

Feature 176's skill-first semantic rules apply. A text model may summarize
transcript or subtitle text but cannot claim visual or delivery understanding
without the corresponding observed evidence. Subtitle timing is treated as
`authored_subtitle`, not `observed_asr`, unless it has been explicitly aligned
and verified against audio. When subtitle, ASR and VAD disagree, the proposal
shows the conflict and does not silently treat subtitle text as spoken audio.
“Not important” is a proposal that requires review, not a hidden deletion.

## 7. Silence Cut compatibility and edit precedence

The existing Silence Cut remains a separate policy and data source:

```text
source video
  + legacy profile silence ranges
  + manual silence/mistake ranges
  + speaker-aware camera plan
  + optional reviewed condensation plan
  -> conflict-aware composed edit map
```

Precedence rules:

1. User manual locks and explicit keep ranges win.
2. A user-approved condensation decision wins over an automatic suggestion.
3. Legacy Silence Cut ranges remain exact and auditable, including manual
   ranges without automatic padding.
4. Speaker-aware planning may recommend a jump cut but cannot delete a range
   without an approved edit operation.
5. Conflicting ranges are shown as a review conflict; they are never silently
   merged into a destructive render.

User corrections are immutable overlays on top of the raw scan: split/merge a
speaker cluster, assign an active face/body candidate, mark a range unknown,
lock a camera target, keep a range, or remove a proposed action. Re-scanning
never overwrites these overlays. A correction changes the plan input hash and
requires downstream camera/condensation plans to be recompiled before render.

The composed edit-map compiler must classify conflicts explicitly, including
manual keep versus manual remove, overlapping jump cuts, and a camera action
whose target is outside the selected crop. It returns `needs_review` with the
conflicting operation IDs; it does not resolve a conflict by array order.

FFmpeg and Remotion consume the same composed edit map. Rendering must preserve
the selected coordinate mapping, remove approved dead air/mistake ranges, and
apply camera actions only after the user-approved plan is frozen. Analysis
artifacts are never treated as render authorization by themselves.

## 8. Worker jobs, adapters and runtime packaging

Add an explicit job/contract family rather than overloading the Music 3 jobs:

- `speaker_aware_media_scan`: full-video VAD, optional diarization, visual
  tracks and active-speaker evidence against the user-selected source artifact;
- `speaker_aware_edit_plan`: optional transcript/topic condensation and camera
  plan compilation after the selected upstream evidence is reviewed;
- existing `episode_audio_analyze` remains valid for audio/music analysis and
  may reference the speaker-aware scan artifact.

Each job includes `workflowMode`, `requestedStages`, `inputArtifactRef`,
`parentEditMapHash` when the input is derived, and the explicit output stage.
The Worker must not infer that later stages are required merely because an
earlier stage completed.

Every speaker-aware job carries an immutable `AdapterPolicyV1` snapshot and
`adapterPolicyHash`. The server and Worker compare the requested policy with
the capability probe before claim. The UI displays both `requested backend`
and `effective backend`; when they differ, the run is marked `fallback_used`
and includes the explicit allow-list decision. A policy with
`fallback_policy: deny` can never produce `fallback_used` successfully.

Worker capability admission must expose:

- installed VAD adapters and revisions;
- diarization availability and license/runtime readiness;
- face/person detector availability;
- active-speaker visual and posture adapter availability;
- GPU/CPU memory estimate and concurrency limit;
- scan contract version.

The first production path should be CPU-safe:

1. Silero ONNX + existing MediaPipe face detector.
2. Body/person tracking only when the allowlisted model is installed.
3. FireRed evaluation profile behind a feature flag.
4. TEN VAD preview when installed.
5. WebRTC fallback with a visible lower-quality label.
6. pyannote optional and explicitly gated for multi-speaker precision.

Model weights are installed or updated through an explicit Worker runtime
operation. Page open and queue claim must not download large models silently.
Missing capability blocks only the dependent stage; it must not turn partial
evidence into a successful full analysis.

## 9. Web and Worker UX

### Scan panel

- `Scan full video` is explicit and shows estimated duration/resource use.
- Progress separates audio, diarization, visual tracking, association and
  transcript/subtitle reuse.
- Backend/runtime identity and quality tier are visible.
- The user can choose `Fast preview`, `Standard`, or `High accuracy` policy,
  subject to installed capability.
- The user can choose a workflow recipe: `Subtitle cut (16:9)`, `Speaker-aware
  reframe (9:16)`, `Speaker-first`, `Full assisted edit`, or `Custom`.
- `Custom` mode lets the user select stage order, source artifact, target aspect
  ratio and which adapters are active. The UI explains dependencies but does
  not auto-enable unrequested stages.
- An `Adapter configuration` section lets the user enable/disable VAD,
  diarization, visual-speech, person tracking and posture stages independently,
  select the exact installed backend, choose `deny`, `allow_listed` or
  `report_unknown`, and define the allowed fallback order.
- Before scan, show a preflight matrix of selected backend, installed version,
  readiness, expected resource use and fallback behavior. The Start button is
  blocked when a selected `deny` adapter is unavailable.

### Evidence timeline

Provide separate layers for waveform/activity, speech intervals, speaker
clusters, face/body tracks, active-speaker confidence, stable positions, camera
actions and legacy Silence Cut. Users can select a range, inspect evidence,
lock a target, mark unknown, split/merge a speaker cluster, or override a cut.

### Review and customize

- Every automatic camera move/switch has accept, reject, edit and lock actions.
- Ambiguous intervals are highlighted and never silently applied.
- The evidence header always shows `requested backend → effective backend`,
  including a fallback warning and reason when the user explicitly allowed it.
- Summary mode shows retained/removed transcript and subtitle evidence side by
  side, including source and conflict markers.
- Existing Silence Cut controls remain available without requiring speaker
  analysis.
- Render preview distinguishes source, composed edit map and final output.
- After a 16:9 editorial cut is approved, the user can start a new reframe
  workflow from that derived artifact without re-running subtitle condensation
  or reapplying the original cut.

## 10. Data model and contracts

Add versioned shared schemas for:

- `WorkflowRecipeV1` and `EditStageV1`;
- `SpeakerAwareMediaScanJobV1`;
- `AdapterPolicyV1`;
- `SpeakerAwareMediaAnalysisV1`;
- `VadBackendCapabilityV1` and `VadResultV1`;
- `DiarizationSegmentV1`;
- `FaceOrPersonTrackV1`;
- `ActiveSpeakerEvidenceV1`;
- `CameraEditPlanV1`;
- `SubtitleEvidenceV1`;
- `ContentCondensationPlanV1`;
- composed edit-map references consumed by FFmpeg/Remotion.

Use integer milliseconds, half-open intervals, finite bounded numbers and
explicit source/cut coordinate spaces. Require source checksum, analysis
revision, runtime/model identity and parent artifact hashes for every derived
artifact. Store anonymous speaker IDs only; human names require an explicit
user annotation layer and must never be inferred from voice or face alone.

Suggested active-speaker shape:

```json
{
  "startMs": 4200,
  "endMs": 7350,
  "speechConfidence": 0.93,
  "speakerId": "speaker_01",
  "activeFaceTrackId": "face_track_07",
  "activePersonTrackId": null,
  "associationConfidence": 0.84,
  "status": "observed",
  "evidence": {
    "vad": 0.93,
    "diarization": 0.84,
    "mouthMotion": 0.78,
    "visualContinuity": 0.91,
    "positionStability": 0.88
  }
}
```

Allowed `status` values include `observed`, `ambiguous`, `unknown`,
`body_only`, `no_visible_candidate` and `unavailable`.

## 11. Failure modes and safeguards

- VAD backend unavailable: use an explicit allowed fallback or return
  `VAD_BACKEND_UNAVAILABLE`; preserve existing Silence Cut if it can still run.
- Diarization unavailable: keep anonymous `speaker_unknown` intervals; do not
  pretend speakers are separated.
- Face detector finds no face: use body track if available, otherwise wide/
  hold/manual review.
- Multiple plausible active faces: mark ambiguous and require review.
- Audio contains music/SFX: classify non-dialogue and suppress active-speaker
  decisions unless evidence passes a minimum dialogue confidence.
- Track leaves frame or loses identity: hold briefly, then use wide/approved
  fallback; never pan toward an unverified background location.
- Transcript is missing/partial: disable condensation or label it partial;
  never summarize absent text as if it were observed. Subtitle-only text may
  support a clearly labelled editorial summary, but cannot establish speech or
  active-speaker evidence.
- Source/edit-map changes: invalidate dependent scan, plan and render; retain
  history but block stale apply.
- Runtime OOM/GPU failure: return a truthful blocked result with resource data;
  do not downgrade to a fake high-accuracy result.

## 12. Security, privacy and rights

- Enforce tenant/series ownership for scans, artifacts and playback refs.
- Do not log raw voice embeddings, face images or full transcripts.
- Store embeddings only in bounded, access-controlled, checksum-addressed
  artifacts with retention rules; delete temporary frame/audio extracts after
  publication or configured retention expiry.
- Speaker IDs are pseudonymous and scan-local by default. Cross-video identity
  linking requires explicit user action and a separate policy.
- Model licenses, runtime provenance and third-party terms are captured in the
  capability/analysis record. A detected speaker is not a biometric identity
  claim.

## 13. Implementation sequence

1. **Contract and fixture slice:** shared schemas, adapter interfaces,
   `AdapterPolicyV1`, preflight capability matrix, coordinate rules,
   status/error enums and Thai multi-speaker fixtures.
2. **Silero baseline:** managed ONNX runtime, selectable source-artifact scan,
   VAD artifact and timeline projection; retain existing Silence Cut unchanged.
3. **Visual evidence:** face-track persistence plus person/body fallback and
   stable-position analysis.
4. **Association:** diarization adapter boundary, active-speaker evidence,
   ambiguity handling and review timeline.
5. **Camera planner:** hold/slow-move/cut-to-track/wide actions, safe crop
   validation and editable focus-track output.
6. **Additional VAD adapters:** FireRed benchmark, TEN realtime preview and
   WebRTC low-resource fallback, each with measured quality/latency evidence.
7. **Condensation:** transcript/subtitle reuse, subtitle-ASR conflict
   handling, topic segmentation, reviewed summary plan and conflict-aware
   composed edit map.
8. **Workflow/render integration:** subtitle-first 16:9 cut, derived-artifact
   handoff to optional 9:16 reframe, shared FFmpeg/Remotion edit-map
   consumption, post-render QC, stale rejection and artifact publication.
9. **Rollout:** feature flag, runtime capability UI, bounded no-credit smoke,
   then real Windows RTX validation before enabling high-accuracy/diarization
   defaults.

## 14. Acceptance criteria

1. A complete scan can report speech intervals, backend identity, confidence,
   anonymous speaker clusters when available, and face/body tracks with source
   hashes.
2. The system supports more than one speaker and exposes ambiguous intervals
   instead of selecting a face without evidence.
3. A user can complete a subtitle/transcript-first 16:9 editorial cut without
   enabling diarization, face tracking or camera switching.
4. A later workflow can consume that approved 16:9 artifact and run only the
   selected speaker/reframe stages to produce a 9:16 plan.
5. A complete scan reports a speaker-count estimate, confidence and basis, and
   clearly distinguishes diarized, audio-only, visual-only and partial counts.
6. A face-less speaker can use a body/person track when available; otherwise
   the result is explicitly body-unknown or unavailable.
7. Sitting/standing state, stable screen position and movement confidence are
   inspectable and never presented as confirmed identity.
8. Face boxes without temporal visual-speech evidence cannot receive an
   `observed` active-speaker status; body-only results show their lower quality
   tier.
9. Camera plans support hold, smooth move, immediate cut, wide fallback and
   manual lock, with safe-crop and confidence validation.
10. Automatic switching respects debounce/minimum-hold rules and does not
   oscillate between candidates in a stable scene.
11. Existing Silence Cut profile/manual ranges remain usable independently and
   are preserved in the composed edit map.
12. User corrections persist as overlays, survive re-scan, and invalidate only
    dependent downstream plans.
13. FFmpeg and Remotion use the same approved composed edit map, including
   legacy Silence Cut, manual ranges, speaker-aware camera actions and reviewed
   condensation decisions.
14. Long-conversation condensation uses the existing transcript artifact when
    hashes match, can also use normalized subtitle evidence, produces an
    editable proposal, and preserves user locks.
15. Missing models, partial ASR, low confidence, stale inputs and runtime
    failures remain visible and cannot become successful analysis claims.
16. Scan cancel/resume/retry is idempotent and does not duplicate analysis
    artifacts or lose the last safe checkpoint.
17. Users can configure each adapter stage, selected backend and fallback policy;
    a missing selected backend with `deny` blocks before claim and never runs a
    different backend silently.
18. The artifact and UI show requested/effective backend, policy hash and any
    explicitly allowed fallback reason.
19. Subtitle-only condensation is labelled as authored subtitle evidence, and
    subtitle/ASR/VAD timing conflicts remain visible instead of being treated as
    observed speech.
20. Focused Web/Rust/Python adapter contract tests, fixture tests, timeline
    mapping tests, render-plan tests and bounded no-credit runtime smoke pass.

## 15. Verification and measured evidence

The first release must include a privacy-safe evaluation set covering:

- one speaker, two speakers and three speakers;
- Thai dialogue, overlap, whisper, laughter, music and SFX;
- faces visible, turned away, occluded and out of frame;
- seated, standing, moving and position changes;
- 16:9 and 9:16 crops;
- silence, speech mistakes and manually locked ranges.

Report VAD speech-duration precision/recall, boundary error, diarization error
rate where labels exist, active-speaker association accuracy, unknown/ambiguous
rate, track continuity, crop-safe rate, scan latency, CPU/RAM/GPU use and render
duration. Do not optimize only for fewer cuts. Quality badges require coverage
and error metrics together.

Required proof commands will be focused and resource-aware. A full
`npm run check` is not required when RAM is constrained, but typecheck, schema
fixtures, Rust tests, adapter probes and render-plan tests must be recorded.
Real RTX/MiniMax/optional-pyannote results must be labelled as live runtime
evidence; mocks can test transport and failure handling only.

Adapter policy tests must include a truth table for: selected backend ready;
selected backend missing with `deny`; selected backend missing with an explicit
allow-list fallback; selected backend missing with `report_unknown`; an
unregistered fallback; changed policy hash; and a Worker capability mismatch.
Only the explicitly allow-listed case may use a different effective backend.

## 16. Product decisions resolved by this spec

- Full-video scan is the source of truth for a selected source artifact, but
  the user may choose the original video or an approved derived artifact and
  may run only the stages needed for the current goal.
- Silero ONNX is the first baseline. FireRed, TEN and WebRTC are adapters with
  measured capability, not unconditional dependencies.
- pyannote is optional for detailed multi-speaker diarization, not required for
  every edit.
- Face detection is preferred, body/person tracking is a fallback signal, and
  neither is treated as a biometric identity claim.
- Silence Cut remains independent and backward compatible.
- Subtitle-first 16:9 editing followed by a separate 9:16 speaker-aware reframe
  is a supported first-class workflow, not an exceptional workaround.
- Automatic camera/summary actions are proposals until user review or explicit
  policy approval; manual locks always win.
- FFmpeg and Remotion consume one approved composed edit map so preview and
  export do not diverge.

## 17. Reference implementations and runtime constraints

The adapter design is based on the following upstream capabilities and must be
re-verified during implementation rather than treated as a permanent guarantee:

- [Silero VAD](https://github.com/snakers4/silero-vad): ONNX-compatible VAD
  baseline suitable for a managed local runtime.
- [FireRedVAD](https://github.com/FireRedTeam/FireRedVAD): optional VAD
  benchmark/backend; Thai drama, music and SFX quality must be measured on the
  project's evaluation set.
- [TEN VAD](https://github.com/TEN-framework/ten-vad): optional low-latency
  preview backend with an ONNX Runtime dependency.
- [pyannote.audio](https://github.com/pyannote/pyannote-audio): optional
  diarization toolkit for speaker activity, speaker change, overlap and
  embeddings. Its native Windows support is not a safe assumption; prefer a
  managed Linux/WSL sidecar unless a Windows runtime is separately proven.
- [MediaPipe Face Detector](https://developers.google.com/edge/mediapipe/solutions/vision/face_detector):
  existing face evidence source; a face detector is not itself an active-speaker
  detector and must remain one input to the association stage.

These references do not authorize silent model download, remote upload or a
provider substitution. Runtime readiness, model revision, license/terms,
resource use and measured quality remain local Worker admission requirements.
