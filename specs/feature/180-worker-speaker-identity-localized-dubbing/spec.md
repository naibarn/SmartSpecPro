# Feature 180 — Unified Voice, Audio & Localized Dubbing v2

**Status:** IMPLEMENTATION-READY SPECIFICATION v2 — runtime implementation and release proof pending
**Revised:** 2026-09-07
**Authority:** This specification and `contracts-v2.md` define v2; sections implement them. Historical research/interview/reviews describe v1 and are not current acceptance evidence.
**Created:** 2026-09-07
**Owners:** SmartAIHub Web, Worker App, media/runtime platform
**Related:** Feature 175 (native cinematic audio), Feature 176/177 (emotion/audio planning), Feature 178 (group-native Music3), Feature 179 (speaker-aware VAD/diarization/reframe)

## 1. Problem and outcome

Worker App can scan speech, faces, people and active-speaker evidence, but the result is not yet a user-controlled production workflow for identifying speakers, localizing dialogue, assigning an approved voice, and exporting a new-language video. Users need to decide the order of editing stages: they may first tighten a 16:9 interview from subtitles, then scan speakers, then crop/reframe to 9:16; or they may start with speaker coverage. The system must preserve the existing Silence Cut and manual edit workflow instead of imposing one fixed pipeline.

This feature adds an artifact-first, user-directed workflow that can:

1. Scan an entire video and report who appears to speak, when they speak, and which face/person track is the best visual match.
2. Let a user name anonymous speakers in a standalone project, or map them to existing Series characters when a Series is selected.
3. Use existing subtitles/transcripts as editable timing and semantic input.
4. Translate subtitle cues through the SmartAIHub server gateway and a versioned skill, preserving cue timing and user glossary/style choices.
5. Bind each speaker to an approved provider voice or an explicitly consented voice clone.
6. Generate cue-level dialogue, fit it to the original intervals, separate or remove the original dialogue where needed, mix with retained music/SFX, and export MP4.
7. Expose every proposed identity, translation, voice binding, timing adjustment and mix decision for review/customization before paid generation or final export.

Success means a user can complete a standalone or Series-linked localized export without Worker App making any direct external provider call, without silently charging twice, without silently leaving the original dialogue underneath a dub, and without claiming biometric identity certainty.

## 2. Scope

### 2.1 In scope

- Full-video scan or scan of a user-approved derived edit artifact.
- Voice activity detection, optional diarization, face detection/tracking, person/body tracking and active-speaker fusion.
- Anonymous speaker clusters with representative frame/audio evidence.
- Standalone speaker naming and Series character mapping with explicit user approval.
- Subtitle-first editing and subtitle-aware cue mapping; existing Silence Cut remains independently usable.
- Skill-first cue translation/localization with target locale, region/accent, terminology and tone controls.
- Provider voice catalog binding, consented voice-clone lifecycle, voice capability preflight.
- Server-orchestrated local/cloud TTS generation, cue timing fit, stem separation, mix, FFmpeg/Remotion export and post-encode QC.
- Durable jobs, managed artifacts, idempotency, retry policy, progress and credit reserve/reconcile.
- Worker and Web UI for Speakers, Translation, Voices, Review and Export.
- User-owned review checkpoints and immutable source/derived artifacts.

### 2.2 Explicit non-goals for MVP

- Inferring or asserting the real-world identity of a person from their face or voice.
- Storing raw face embeddings or voiceprints as user-visible identity data.
- Lip-sync or mouth re-animation. The output is dubbed audio with timing fit; lip-sync is a later feature.
- Calling UVoice private website actions from SmartAIHub or Worker App.
- Direct Worker-to-UVoice, Worker-to-ElevenLabs, Worker-to-LLM or arbitrary URL calls.
- Automatically publishing a final export without a user review/approval checkpoint.
- Removing original dialogue silently when separation quality is uncertain.

## 3. User-controlled workflow

The workflow is a DAG of optional stages, not a locked sequence. The UI must allow the user to run only the stages needed for the current edit.

```text
Source video or approved derived edit
        |
        +--> subtitle/transcript import or existing artifact
        |
        +--> speaker scan (VAD + diarization + face/person + active speaker)
        |         |
        |         +--> review/name/map speakers
        |         +--> create coverage/edit plan
        |
        +--> subtitle-first 16:9 cut / Silence Cut / manual edit
                  |
                  +--> optional later speaker scan on derived artifact

approved subtitle cues + speaker registry + target locale
        |
        +--> skill localization review
        +--> voice binding and rights/consent preflight
        +--> cue-level TTS jobs through SmartAIHub gateway
        +--> timing fit + dialogue stem/separation decision
        +--> mix retained music/SFX or replace all original audio
        +--> FFmpeg or Remotion export
        +--> post-encode QC + user download/publication
```

Each stage consumes immutable input artifacts and produces a versioned output. A downstream stage may be re-run against a new approved input without mutating the prior artifact. A stage that has no required input must show the exact missing prerequisite and a route to fix it.

### 3.2 Source and derived-artifact lineage

Every stage input is identified by `workspace_id`, `project_id`, `artifact_id`, checksum, media duration, timebase and an optional timeline transform from the original source. A scan performed after a subtitle/manual cut must retain the transform that maps derived milliseconds back to source milliseconds; a later crop/reframe must not invalidate cue or speaker references. If a local Worker path is used, the worker must first prove ownership/readability and publish a managed source artifact or an approved scoped path handle. The server must never assume that a server process can read a worker-local path.

The lineage contract must distinguish `source_video`, `approved_derived_video`, `subtitle_revision`, `scan_registry`, `localized_plan`, `cue_audio`, `stem_report`, `edit_map` and `export`. A derived artifact can be selected as the next input only after its producing job is terminal-success and its checksum is recorded. Deleting or revoking an input must make dependent outputs visibly unavailable rather than silently re-pointing them to another revision.

### 3.1 Recommended user flow

1. Open any video project, with or without a Series.
2. Choose the source video or an already approved derived edit. If the project already contains a playable video asset, auto-resolve its known local path/managed artifact; ask for a folder only when the path is genuinely unavailable.
3. Choose one or more stages: subtitle-first cut, transcript preparation, speaker scan, translation, voice binding, dubbing/mix, export.
4. Run preflight. Preflight checks file access, subtitle coverage, selected adapter capability, provider capability, consent/rights, disk space, GPU/runtime and estimated credits.
5. Review scan results. Name standalone speakers or map Series speakers to characters; merge/split only with confirmation.
6. Review and edit subtitle localization. The user can approve all, approve selected cues, regenerate one cue, or return to the source language.
7. Bind a voice preset or approved clone per speaker. No voice is generated until rights and provider capability pass.
8. Generate a low-cost preview or selected cues first. Inspect waveform, timing, source-dialogue leakage and pronunciation.
9. Choose the original-audio decision: retain separated music/SFX, remove all original audio, or abort for manual DAW work when separation fails.
10. Approve mix and select FFmpeg fast path or Remotion composition path. Both consume the same edit map and run post-encode QC.
11. Review QC, download/export MP4 and keep all source, consent, translation, audio and QC artifacts linked.

If no subtitle or transcript exists, speaker scan remains available. For localization the user may select an existing transcript, import a subtitle file, run the existing SmartAIHub transcription capability as a separate approved job, or create cues manually. The system must not force a transcription job when the user only wants scan/reframe/Silence Cut.

## 4. Speaker evidence and identity model

### 4.1 Scan result

The scanner records evidence, not a biometric identity claim. A speech interval may be associated with a face/person track, an anonymous speaker cluster, both, or neither.

```yaml
start_ms: 4200
end_ms: 7350
speech_confidence: 0.93
speaker_id: speaker_01
active_face_track_id: face_track_7
active_person_track_id: person_track_3
evidence:
  vad_backend: silero_onnx
  diarization_backend: pyannote_diarization
  visual_backend: mediapipe_face
  active_speaker_method: fusion
  visual_confidence: 0.81
  audio_confidence: 0.93
  subtitle_overlap: 0.98
```

Required invariants:

- All times are integer milliseconds in the canonical source timeline.
- `speaker_id` is workspace-local and opaque until a user maps it to a name/character.
- Evidence is explainable and reviewable; low confidence never auto-binds a voice.
- A person detected from the back or at a distance may have a body track without a face track.
- Overlapping speakers may produce multiple active candidates; the edit planner must support split-screen, jump cut, hold, or user-selected focus.

### 4.2 Standalone workspace

- The user can rename `speaker_01` to any display name.
- The user can upload or capture a representative frame from the video, clearly labeled as reference evidence rather than identity verification.
- The user can attach a speaker audio sample only for the selected voice workflow and only with consent evidence.
- Names, frames and voice bindings are scoped to the project/workspace by default; no cross-project identity propagation.
- The user can merge or split clusters and mark a cluster as unknown/non-speech.

### 4.3 Series workspace

- Resolve the Series character roster, character name, stable character ID and approved portrait/reference asset.
- Show the proposed match with confidence and evidence; require user approval for every uncertain match.
- Read existing character voice configuration when present, but allow a project-level override.
- Never create or change canonical Series character data as a side effect of a scan.
- If the same person is mapped to multiple characters, show a warning and require an explicit confirmation.

## 5. Adapter policy and scan configuration

The user selects allowed adapters before preflight. The worker must use only the selected adapters and the selected fallback policy; no silent fallback can change the meaning of the result.

```text
VADBackend:
  - SileroOnnx (baseline)
  - FireRedOnnx (optional evaluation/production)
  - TenVad (preview/low-latency)
  - WebRtcVad (low-spec fallback)

Diarization:
  - disabled
  - pyannoteDiarization (multi-speaker, explicit install/license/capability check)

Visual:
  - MediaPipe Face
  - Person/Body
  - disabled

Fusion:
  - Active speaker fusion
  - disabled
```

The preflight response must include selected adapters, detected capabilities, missing model/runtime assets, fallback policy, and a deterministic action: proceed, ask user to change configuration, or stop. “Installed” cannot be inferred from a local UI toggle or stale localStorage.

## 6. Subtitle and localization contract

Subtitle cues are both semantic input and timing constraints. The system must support a user choosing whether subtitle editing happens before speaker/camera planning or after the scan.

### 6.1 Cue mapping

- Preserve source cue ID, source start/end, speaker candidate(s), source text and provenance.
- Map cues to one or more scan speech intervals; allow a cue with no visual speaker.
- Keep manual subtitle edits distinct from generated localization revisions.
- Do not overwrite the source subtitle artifact; create a new revision.
- Overlapping or unassigned cues remain visible in Review and block final automatic dubbing only when the user-selected policy requires a complete speaker map.
- If no cues exist, the UI explains the available transcript/import/transcribe/manual options and preserves the scan result; it does not report a generic source error.

### 6.2 Translation/localization

The localization skill receives a batch of cues plus context and returns cue-level text with provenance. User controls include:

- source language and target BCP-47 locale;
- regional style/accent preference, such as `en-US`, `en-GB`, `en-AU`;
- formal/casual, genre, character voice/style notes;
- glossary, names, protected terms and pronunciation hints;
- maximum cue duration and whether condensation is allowed;
- preserve meaning only, or preserve meaning plus emotion/intent;
- approve all, selected ranges, or manual text.

The skill may condense repetitive or low-value content only when the user selects a short-form mode. It must return rationale and source cue references for every removed/merged cue. It must never silently delete material in the default localization mode.

Short-form mode must expose target duration or duration range, importance policy, protected topics/lines and whether filler, repetition, greetings, pauses or off-topic turns may be removed. The plan must retain a source-to-target mapping for every kept/merged cue and a reviewable removal list. If the target duration cannot be met without violating the selected policy, the system must return `CONDENSATION_TARGET_UNACHIEVABLE` instead of deleting more content silently.

### 6.3 Skill-first boundary

Use a versioned `speaker-aware-dialogue-localizer` skill for semantic translation, condensation and style adaptation. Use a versioned `localized-dubbing-quality-reviewer` skill for linguistic review and flagged cue suggestions. Skills run through the server’s existing skill execution and provider/credit gateway. Deterministic media adapters must not be disguised as Skills: VAD, diarization, face/person tracking, stem separation, TTS provider calls, time-stretch, mixing and encoding remain explicit runtime services.

## 7. Voice binding and consented cloning

### 7.1 Voice binding

A speaker can bind to an existing provider voice, a project-local voice preset, or a consented clone. Binding includes provider, model, voice ID, locale, style settings, speed range, provenance and rights status.

### 7.2 Consent record

Voice cloning is allowed only with a rights record that identifies the consenting party, scope, evidence artifact, allowed projects/locales, provider, expiry and revocation state. Consent is a prerequisite to clone creation and to generation using that clone.

```yaml
consent_id: vc_01
speaker_id: speaker_01
subject_display_name: "ผู้พูด A"
consent_type: explicit_voice_clone
evidence_artifact_id: artifact_consent_01
granted_by_user_id: user_01
scope: project
allowed_locales: [th-TH, en-US]
provider: elevenlabs
status: approved
expires_at: null
revoked_at: null
```

No raw voiceprint or sample is written to logs. Consent and clone artifacts are access-controlled, checksum-addressed and deletable according to retention policy. Revocation blocks new jobs and marks existing derived artifacts for user-directed review/deletion.

Before clone creation, the server validates sample format, duration, single-speaker likelihood, intelligibility, clipping/noise thresholds and allowed locale/scope. These checks are capability/quality checks, not identity verification. Failed samples remain private diagnostic artifacts and cannot be sent to a provider until the user replaces or explicitly re-approves them.

### 7.3 Provider capability matrix

| Capability | SmartAIHub behavior | Worker behavior |
|---|---|---|
| UVoice standard TTS | Call the existing server provider gateway with supported public API fields | Submit server job; never call UVoice directly |
| UVoice clone create/list/delete | Treat as `unverified_api` until official public API and server-side capability probe are proven; never call private website actions | Show unavailable/manual status and stop automated clone creation |
| UVoice clone use by voice ID | Allow only when server preflight confirms the public gateway accepts that voice ID and rights record is valid | Use returned managed artifact only |
| ElevenLabs voice clone | Server-side gateway may use official IVC API after consent and provider configuration | Upload sample through managed artifact flow; poll durable job |
| ElevenLabs TTS/timestamps | Server-side gateway; retain provider usage and timestamps | Consume signed artifact; no provider credential |
| Other providers | Add an explicit adapter and capability contract | No silent substitution |

UVoice’s public API documentation currently documents generation and voice IDs but does not establish a public clone-management contract. The implementation must keep this as a capability flag rather than promising clone automation. A user may manually create a permitted UVoice clone outside SmartAIHub and provide a voice ID only if the server’s normal provider preflight accepts it and the consent record is complete.

## 8. Server control plane, local/cloud execution and credits

External cloud calls follow this boundary; local execution follows `contracts-v2.md`:

```text
Worker App
  -> authenticated SmartAIHub job/artifact API
  -> tenant/owner and capability validation
  -> skill execution or provider gateway
  -> credit estimate + reservation
  -> provider request with server-held credentials
  -> usage/reconciliation
  -> managed artifact + signed download
  -> Worker consumes artifact
```

Requirements:

- Worker receives a scoped job token, never provider API keys.
- The server rejects arbitrary provider URLs, provider names not in the allowlist, and mismatched tenant/project IDs.
- The public boundary is explicit: preflight, job creation, claim/heartbeat, progress, cancellation, artifact publication and signed artifact download. Each operation validates the same workspace/project scope and idempotency key.
- A worker-local source path is accepted only through a scoped source-resolution contract; the worker reports file metadata/checksum and uploads or publishes the source artifact before server-side stages consume it.
- A stable idempotency key covers each clone, localization batch, TTS cue, mix and export.
- Paid work reserves estimated credits before dispatch. Actual provider usage, duration, characters, model and response metadata are stored for reconciliation.
- Pre-provider validation failure creates no charge. Provider failure refunds or reconciles unused reservation according to existing credit policy. Duplicate delivery cannot create a second generation or second charge.
- Cancellation is stateful: before provider dispatch it releases the reservation; after dispatch it stops downstream work, records actual provider usage and reconciles the reservation. A canceled job cannot later publish an unapproved result.
- UI shows estimated and final credit use and identifies which stage consumed credits.
- Skill/provider errors are truthful; no mock audio, fabricated usage or silent fallback.

## 9. Durable jobs and artifacts

Jobs are resumable and idempotent. Suggested job types:

- `speaker_aware_media_scan`
- `speaker_identity_review` (server mutation/artifact version, not paid media generation)
- `subtitle_localization_plan`
- `voice_clone_create`
- `tts_utterance_generate`
- `dialogue_stem_separation`
- `localized_dialogue_mix`
- `localized_episode_export`
- `localized_dubbing_qc`

Versioned artifacts:

- `SpeakerIdentityRegistryV1`
- `VoiceConsentRecordV1`
- `LocalizedSubtitlePlanV1`
- `VoiceBindingV1`
- `StemSeparationReportV1`
- `DubbingCueAudioV1`
- `LocalizedDubbingEditMapV1`
- `LocalizedDubbingQcReportV1`

Every artifact includes schema version, source artifact IDs/checksums, project/workspace scope, creator, timestamps, input settings, job ID, provenance and retention metadata. Source video and prior edits remain immutable.

### 9.1 Failure states

Use stable failure codes and actionable UI: `SOURCE_UNAVAILABLE`, `SUBTITLE_COVERAGE_LOW`, `SUBTITLE_REQUIRED`, `TRANSCRIPT_UNAVAILABLE`, `ADAPTER_NOT_READY`, `DIARIZATION_NOT_LICENSED`, `VOICE_CONSENT_REQUIRED`, `VOICE_SAMPLE_INVALID`, `VOICE_PROVIDER_UNAVAILABLE`, `GATEWAY_AUTH_FAILED`, `PROVIDER_RATE_LIMITED`, `CREDIT_RESERVATION_FAILED`, `TTS_TIMING_OVERFLOW`, `CONDENSATION_TARGET_UNACHIEVABLE`, `STEM_SEPARATION_UNACCEPTABLE`, `ORIGINAL_DIALOGUE_LEAK`, `STALE_INPUT`, `WORKER_INCOMPATIBLE`, `GPU_RESOURCE_UNAVAILABLE`, `CANCELED_AFTER_PROVIDER`, `QC_FAILED`, `ARTIFACT_NOT_FOUND`.

The worker must report progress by stage and cue count, persist checkpoints, resume after restart, and send terminal failure plus logs safe for the user. A terminal job is not silently retried when it could duplicate paid work.

Use the canonical run state machine in `contracts-v2.md`; `partial` is an aggregate child-outcome projection, not terminal export success. Retry is allowed only for classified transient failures and must preserve the same idempotency key. The server rejects a worker whose runtime manifest cannot consume the job schema, and the UI shows an upgrade/reconnect action instead of dispatching to an incompatible worker.

Persistence changes must use additive migrations and a compatibility window for older Web/Worker versions. Rollback disables new job types and leaves immutable artifacts readable; it does not delete or reinterpret existing source/derived records.

## 10. TTS timing and audio decisions

Generation is cue-level so one failed or edited cue does not invalidate all cues. The timing policy is:

1. Localize/condense text within the user-selected semantic policy.
2. Use provider speed/style controls within configured safe limits.
3. Apply bounded audio time-stretch while preserving pitch.
4. If the cue still overflows or pronunciation is poor, flag it for review instead of applying extreme stretch or silently changing text.

The exact speed/time-stretch bounds are configuration, not hard-coded product assumptions; defaults must be validated in the QC fixtures. Original cue boundaries remain the authoritative edit-map intervals.

Before final mix, the user chooses:

- `retain_separated_bed`: keep music/SFX stems and replace dialogue;
- `remove_all_original_audio`: remove all original audio and use generated dialogue plus selected/new music/SFX;
- `manual_daw_required`: stop because separation quality is unacceptable.

If source dialogue cannot be separated cleanly, the system must not leave original dialogue under the generated track. It must present the explicit choice and preserve the failed separation report.

The mix contract must normalize sample rate/channel layout before mixing, define input audio-track selection and dialogue/music/SFX bus routing, apply configured ducking only when selected, and record loudness target, true-peak ceiling, headroom and limiter policy. Output audio settings must be deterministic and included in the edit-map/QC artifact. Unassigned or unresolved localized cues must block final dialogue replacement unless the user explicitly chooses a non-dub preview or assigns a voice/retention policy for those cues.

## 11. Edit map, render and QC

`LocalizedDubbingEditMapV1` composes with Feature 179’s edit map and includes source ranges, subtitle/manual/silence decisions, crop/reframe decisions, speaker coverage decisions, localized cue IDs, audio track routing and selected mix policy. It must support:

- subtitle-first 16:9 source edit before speaker scan;
- later crop/reframe to 9:16;
- jump cuts between speakers;
- slow/smooth camera moves where the user chooses a continuous shot;
- manual Silence Cut ranges and automatic dead-air ranges;
- retained or replaced audio tracks.

The map must also contain a deterministic `timelineTransform` for every derived input, cue invalidation/review rules when a prior edit changes, output audio layout/mix policy and a stable render-plan hash. A render request with stale input checksums or a stale plan hash must stop and ask the user to refresh instead of rendering a mismatched composition.

FFmpeg and Remotion consume the same canonical map. FFmpeg is the fast source/audio path. Remotion is used when the composition includes overlays, subtitles, timeline effects or other full composition features. Both paths must run the same post-encode checks: duration, stream presence, selected input/output audio tracks, audio channel layout, loudness/peak policy, black/frozen frames, subtitle timing, source-dialogue leakage threshold, and output readability. QC failures block publication and identify the offending cue/range.

QC thresholds are versioned configuration, not hidden constants. The report records the threshold set, measured values, detector versions and any user-approved exception. An exception must be explicit, scoped to one export, visible in the UI and included in the final artifact provenance.

## 12. Worker UI/UX contract

### 12.1 Target user and job-to-be-done

Editors working on interviews, drama episodes and general videos need to see who speaks, assign meaningful names/characters and voices, make a localized version, and retain control over every automated decision without losing the existing timeline, Silence Cut or render tools.

### 12.2 Surface inventory

- Existing Media Studio workspace and video editor.
- Right/dockable `Speakers & Dubbing` panel, opened from the existing analysis action.
- Existing timeline/waveform and subtitle surfaces.
- Existing render/export panel, with a localized-dubbing summary and QC result.
- Series character picker when a Series is present; standalone naming controls when absent.

### 12.3 Component ownership map

| Component | Owns | Must not own |
|---|---|---|
| `SpeakerIdentityPanel` | scan status, clusters, evidence, names, character mapping | provider credentials or hidden generation |
| `LocalizationReviewPanel` | source/target cues, glossary, locale, approve/regenerate | direct LLM calls |
| `VoiceBindingPanel` | voice catalog, consent status, clone preflight, preview request | raw provider secrets |
| `DubbingReviewPanel` | cue timing, waveform, separation decision, leakage/QC flags | mutating source artifacts |
| `LocalizedExportPanel` | edit-map summary, render choice, credit estimate, export/QC | bypassing server job state |

### 12.4 Required state matrix

Every panel and stage must render explicit states:

| State | Required behavior |
|---|---|
| Loading | Show stage, progress and cancel/retry policy; preserve previous artifact |
| Empty | Explain what is missing and show the next valid action |
| Ready | Show selected inputs, capability/preflight status and primary action |
| Running | Disable duplicate paid actions, show job ID/progress and allow safe navigation |
| Partial | Show completed cues/clusters and resumable remainder |
| Error | Stable code, human explanation, repair action and no fabricated result |
| Needs review | Highlight ambiguous match, consent, timing, translation or leakage |
| Success | Artifact links, credit reconciliation, QC summary and next optional stage |
| Disabled | Explain exact prerequisite, not just a grey button |
| Hover/focus/selected | Preserve keyboard-visible focus and clear selected stage/cluster |

### 12.5 Responsive, accessibility and visual contract

- Desktop 1440×900: dockable right panel with timeline visibility and persistent primary action.
- Laptop 1280×800: panel becomes a resizable drawer; no action is below an unreachable overflow container.
- Tablet 768×1024: panel becomes a full-height sheet with sticky header/footer actions.
- Mobile 390×844: read-only review or stacked stage cards; paid generation remains explicitly confirmable and scrollable.
- Keyboard navigation must reach every cluster, cue, adapter, consent, action and error repair; focus must remain visible after panel changes.
- Inputs need labels, descriptions and programmatic error associations. Checkboxes/radios must expose selected/disabled state. Color is never the only confidence/status cue.
- Respect reduced motion; tracking/preview animation must have a static alternative.
- Reuse existing Worker Media tokens, panel/drawer patterns and button hierarchy; do not introduce a second visual language. Use semantic status colors from the existing theme tokens, not raw hard-coded color values.
- Thai is the primary UI language in this workspace, with concise English technical terms where they are already established. Provider/model names remain unchanged. Error copy must include an actionable Thai explanation and stable technical code.

### 12.6 Browser evidence

Verification must capture the panel at desktop, laptop and narrow viewport sizes, and prove: source auto-resolution, scan running/completed/error, standalone naming, Series mapping, subtitle review, consent block, provider-unavailable block, separation fallback decision, export progress, QC failure, and successful artifact link. Evidence must show the primary action without hidden scroll and must test switching between Speakers, Translation, Voices and Review without losing state.

## 13. Security, privacy and abuse controls

- Enforce tenant/user/project ownership on every job, artifact, subtitle and consent read/write.
- Treat voice clone samples and consent documents as restricted media; use signed short-lived URLs and no public bucket listing.
- Treat representative face/person frames as restricted project media with the same retention/deletion controls; they are evidence thumbnails, not identity records.
- Do not log provider tokens, raw samples, raw embeddings, full subtitle text where avoidable, or sensitive consent contents.
- Keep provider data-retention, region and deletion behavior in the capability record.
- Require explicit confirmation before creating a clone, generating a preview that uses a clone, and exporting a clone-based video.
- Detect revoked/expired consent before every paid generation, not only at binding time.
- Prevent prompt injection from subtitles from changing gateway policy, credit policy or file access.
- Never infer a real person’s identity from face/voice evidence; user-entered name/character mapping is the source of display identity.

## 14. Acceptance criteria

1. A project without a Series can scan, name anonymous speakers, attach representative frames and complete the workflow.
2. A Series project can propose character mappings and requires explicit approval for uncertain mappings.
3. An already opened project with a playable video resolves its known source without forcing a second folder selection.
4. User can run subtitle-first 16:9 editing before speaker scan and then scan the approved derived artifact.
5. Existing Silence Cut and manual ranges remain available and are represented in the composed edit map.
6. Scan output supports face, body-only and audio-only evidence and reports confidence/provenance.
7. User-selected adapters and fallback policy are honored exactly; invalid selections fail preflight with a repair action.
8. Localization supports target locale/region, glossary, tone and optional condensation with cue-level provenance.
9. Default localization never deletes or merges source content without a user-selected condensation policy.
10. Every voice binding displays provider, model, voice ID, rights status and scope.
11. Clone creation/generation is blocked without valid consent and is blocked after revocation/expiry.
12. Worker never receives or stores an external provider API key.
13. UVoice clone automation remains unavailable unless an official server-side capability is proven; private website actions are never called.
14. ElevenLabs clone/TTS can run only through the SmartAIHub gateway and produces managed artifacts.
15. Duplicate job delivery does not duplicate provider generation or credits.
16. Failed pre-provider validation does not charge credits; provider usage is reconciled from actual usage where available.
17. Cue-level TTS produces timing metadata and flags overflow instead of extreme stretch.
18. If separation is unacceptable, the user sees remove-all-original-audio or manual-DAW choices; original dialogue is never silently left under the dub.
19. FFmpeg and Remotion consume the same edit map and both run post-encode QC.
20. QC blocks publication on duration, stream, loudness, subtitle, timing or source-dialogue leakage failures.
21. Worker restart resumes durable jobs from checkpoints and does not duplicate paid work.
22. UI exposes loading, empty, partial, error, needs-review and success states without hidden actions.
23. UI remains usable at desktop, laptop, tablet and narrow viewport sizes with keyboard access.
24. All artifacts retain source checksums, schema versions, provenance and retention metadata.
25. The system never presents automated face/voice evidence as proof of a real-world identity.
26. Standalone contracts permit `seriesId: null`, and no stage requires a Series solely to resolve a source video.
27. Derived scans preserve source-to-derived timeline transforms and reject stale input checksums or render-plan hashes.
28. Source-local files are resolved by the Worker and published/handed off as a managed artifact before server media stages consume them.
29. Clone samples are checked for format, duration, noise/clipping and single-speaker quality before provider upload.
30. Unresolved localized cues block final replacement unless the user explicitly selects a retention/non-dub policy.
31. Cancellation before and after provider dispatch has distinct credit reconciliation and publication behavior.
32. New jobs are not offered to incompatible Worker runtime manifests, and additive migrations/rollback preserve old artifacts.
33. Mix output records sample rate, channel layout, bus routing, ducking, headroom, loudness and true-peak settings.
34. QC thresholds are versioned and any exception is visible, scoped to one export and included in provenance.
35. A video with no subtitle can still complete speaker scan, and localization offers import/transcribe/manual cue preparation instead of a generic source failure.
36. Provider rate-limit responses preserve retry metadata and do not consume a second reservation on retry.
37. GPU/VRAM admission checks prevent concurrent jobs from exceeding the Worker resource budget; resource rejection is visible and resumable.

## 15. Verification plan

Use focused, low-memory verification rather than the full `npm run check`:

- schema/contract tests for every artifact and failure code;
- server route tests for tenant scope, idempotency, gateway-only provider dispatch and credit reconciliation;
- worker contract tests for adapter policy, checkpoint/resume and artifact consumption;
- deterministic fixtures for one speaker, two speakers, overlapping speakers, no face, body-only, music/SFX, Thai speech, subtitle gaps and manual edit ranges;
- provider contract tests using mocked gateway responses, including UVoice clone unavailable and ElevenLabs clone accepted/rejected, rate limits and retry-after;
- skill contract tests for locale/glossary/provenance/condensation policy, with no paid generation in unit tests;
- audio tests for cue duration, time-stretch bounds, separation leakage and mix routing;
- audio tests for sample-rate/channel normalization, bus routing, ducking, loudness/true-peak configuration and unresolved-cue blocking;
- FFmpeg/Remotion fixture exports plus post-encode QC;
- migration/rollback and old-worker/new-server compatibility tests;
- source-lineage/time-transform and stale-plan rejection tests;
- no-subtitle transcript/import/manual-cue path tests;
- GPU/VRAM admission and concurrent-job rejection tests;
- targeted browser smoke with `jsdom`/Chromium where available, including panel scroll and primary-action visibility;
- `git diff --check` and the planning checker scripts.

Live UVoice clone API verification remains an explicit release gate requiring provider access and documented public capability. It must not be marked complete from the website UI alone.

## 16. Delivery waves

Follow `sections/index.md`: contracts → voice/consent → local runtime and cloud adapters → optional scan/localization → timing/separation → export → 178 integration → release proof. Both targets are required for Release A. Core dubbing acceptance requires Releases A+B; training completion additionally requires Release D; optional provider promotions are separately reported as Release C. No mock result can satisfy runtime promotion.

## 17. Open release gates

- Confirm installed/licensed pyannote and selected VAD/visual adapters on the target Worker image.
- Confirm Demucs model/runtime and acceptable dialogue leakage thresholds on representative Thai drama/interview/music/SFX fixtures.
- Confirm SmartAIHub gateway support and current pricing/usage reconciliation for each enabled provider/model.
- Confirm official UVoice clone API availability; until then keep UVoice clone creation disabled and support only validated voice-ID use.
- Confirm consent retention, provider deletion and regional processing policies with product/legal owner.
- Confirm target RTX 5060 Ti 16 GB Worker resource limits and concurrent job policy.
- Confirm additive migration order, rollback feature flags and minimum Worker runtime manifest for every new job/artifact schema.
- Confirm provider sample-quality limits, clone deletion behavior and cancellation billing behavior before enabling clone generation.

## 18. References

- Feature 179 speaker-aware scan/reframe contract and existing Silence Cut/edit-map behavior.
- Feature 175 audio stem, TTS replacement, mix and Remotion/FFmpeg QC patterns.
- Google MediaPipe Face Detector documentation for visual detection capability boundaries.
- UVoice public API documentation and current product/Persona terms; server capability must be verified at runtime.
- ElevenLabs official voice cloning, TTS/timestamps and dubbing API documentation.


## 19. v2 unified audio implementation contract

The normative [v2 contracts](contracts-v2.md) expand this feature to local and cloud audio execution, authored DramaSeries dialogue and narration. All original user review, source preservation, localization, consent and QC capabilities remain. External provider credentials/calls stay on the server; local registered models execute on admitted Workers. Local-only references use scoped owner-worker artifacts and are not required to upload. Cloud stages may consume them only after an explicit permitted transfer.

Implement all twelve sections in [the dependency manifest](sections/index.md). The new runtime, cloud normalization and production integration sections complete the original seven sections. Release gates are staged; optional model installations do not delay the required first local+cloud vertical slice. Core dubbing completion requires both Release A and B; expanded training completion additionally requires Release D; Release C readiness is reported per provider.


## Reference cloning and training lifecycle extension

[voice-lifecycle-v2.md](voice-lifecycle-v2.md) is normative for exact reference import/profile/transcript APIs, TTS profile/binding revision snapshots, provider mode mapping and provenance. Sections 11/12 implement it. Reference-based cloning requires no training; optional training has explicit dataset rights, recipe/resource/budget preflight, held-out evaluation, model approval, rollback and ancestor revocation. Release A includes the full reference flow; Release D separately proves a real training recipe. Local and cloud capability is explicit, not assumed available for every provider. No runtime readiness claim may be made solely from this planning package.
