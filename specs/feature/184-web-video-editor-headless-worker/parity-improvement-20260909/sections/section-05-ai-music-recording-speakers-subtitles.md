# Section 05 — AI Music, microphone recording, speaker planning and subtitles

## Goal

Port the Worker App's media-creation and analysis workflows into reviewable Web
panels. Every generated or captured asset is managed, revision-pinned and
traceable; provider, microphone and ASR limitations are visible.

## AI Music

Create `AiMusicPanel.tsx` with prompt, duration, BPM/key, mood, instrumentation,
loop/fade, language and usage-consent fields. `ai_music` preflight returns the
provider/model, policy result, estimated credits and output constraints. Submit
reserves credit idempotently, queues one Worker job and releases on failure.
Completed audio carries provider/model/prompt/template version, checksum and
license/provenance metadata. The user can preview, retake, trim and place it on
an A-track. Quota, policy, provider timeout and duplicate submit have typed
actions. Unit tests use a fake provider and never spend credits.

The existing AI Media Studio entry remains available for generated transparent
images, image-referenced video (one to three references) and audio drafts. Each
request becomes a typed, credit/consent-checked job and returns managed assets;
the server creates the canonical `worker_jobs` control record even when an
existing provider task performs the generation. The Web panel must show the
selected media type, reference count and provenance instead of silently routing
it through AI Music.

## Microphone recording

Create `VoiceRecorderPanel.tsx` around secure-context `getUserMedia({audio})`,
`enumerateDevices()` after permission and `MediaRecorder`. Show input device,
channel/sample-rate, supported MIME, input meter, countdown, pause/resume,
retake/discard-take and optional monitor playback, chunk upload and lineage.
Select a MIME only after
`MediaRecorder.isTypeSupported`; close all tracks on stop/unmount. Upload the
recording through the Section 02 managed session with capture latency and an
explicit source/project time offset so the resulting A-track is synchronized,
then optionally submit a normalize/transcode job that preserves that offset.
Handle permission denied, no input, device unplugged, unsupported codec,
browser background and quota. Device IDs are session-only; persist a
user-facing device label, not a raw device ID or path. “รองรับไมค์ทุกตัว” is a
test matrix goal, not a promise that a browser/OS exposes every hardware feature.

## Speaker analysis and edit planning

Create `SpeakerPlanPanel.tsx` with source selection, language, diarization,
speaker count hint, silence/cut policy and subtitle option. `speaker_plan`
returns speakers, segments, confidence, proposed cuts, subtitle cues and an
optional shot/edit plan. The UI exposes stages (`ingest → ASR → diarization →
plan → review`) and allows rename/merge, range edit, accept/reject
individual operations and export transcript. Apply requires expected revision,
creates an audit record and keeps low-confidence segments unapplied.

## Subtitle creation

Create `SubtitleEditorPanel.tsx` for manual cues, SRT/VTT import and export,
ASR alignment, speaker/style mapping, safe-area preview and sidecar versus
burned-in choice. Export validates the selected encoding, timebase/frame-rate
conversion and metadata-safe filename before producing a managed SRT or VTT
artifact (or a deliberate local download). Validate monotonic start/end,
overlap policy, line count and style allowlist. Generated cues carry a
`generated` provenance badge and remain distinct from user-approved text until
accepted. Subtitle document and render inclusion are explicit; an imported file
does not overwrite newer cues without review.

## Files and sequence

1. Add shared audio/provenance, recording, speaker-plan and subtitle schemas.
2. Add server procedures/jobs and credit/notification adapters.
3. Implement panels and managed upload/device platform adapter.
4. Add Worker provider/ASR/transcode adapters and fixtures.

## UI/UX Contract

### Target User / JTBD

A creator needs to create or capture audio, understand who is speaking and
produce timed subtitles while retaining control over generated content.

### Surface Inventory

AI Music tab, AI Media Studio tab, Voice Recorder tab, device/permission sheet,
Speaker Plan review, Subtitle editor/import/export dialog, transcript timeline
and A-track drop target.

### Component Map

`AiMusicPanel` owns prompt/estimate/placement; `AiMediaStudioPanel` owns
transparent-image, reference-video and audio-draft generation controls;
`VoiceRecorderPanel` owns device, meter and chunks; `SpeakerPlanPanel` owns
analysis/review; `SubtitleEditorPanel` owns cues/styles; common `EditorJobStatus`
owns queue/reconnect; server/Worker own provider, credit and artifact lifecycle.

### State Matrix

| State | Required behavior |
|---|---|
| permission pending/denied | explain secure context and retry |
| device ready/unplugged | refresh list; preserve no audio silently |
| recording/paused/retake | meter, timer, stop and discard controls |
| AI preflight/credit | provider/cost/policy before submit |
| provider failed/quota | typed retry/choose-later action |
| analysis running | progress and cancel; no mutation |
| low confidence | highlight and require review |
| subtitle dirty/stale | preserve edits and ask before apply |
| artifact complete | preview, place, review provenance |

### Responsive Matrix

| Viewport | Behavior |
|---|---|
| 360x800 | record/status and simple cue edit |
| 390x844 | device picker and transcript review sheets |
| 768x1024 | stacked recorder, speaker map and subtitles |
| 1024x768 | side panel with compact transcript |
| 1280x800 | full panel and timeline alignment |
| 1440x900 | side-by-side preview, transcript and inspector |

### Accessibility Acceptance

Record/stop/pause have keyboard labels, permission/device changes are announced,
meter has text dB, transcript segments are focusable and editable without a
mouse, subtitle timing fields expose units, and colour confidence is paired with
text/icon. Focus returns to the initiating control after dialogs close.

### Copy Contract

Use `ดนตรี AI`, `AI Media Studio`, `ประเมินก่อนสร้าง`, `เครดิตโดยประมาณ`, `อัดเสียง`, `เลือกไมค์`,
`อนุญาตไมโครโฟน`, `วิเคราะห์ผู้พูดและวางแผนตัดต่อ`, `ความมั่นใจต่ำ`,
`สร้าง Subtitle`, `นำเข้า SRT/VTT` and `ตรวจสอบก่อนใช้`.

### Browser Evidence Required

Mock `MediaDevices`/`MediaRecorder` for permission, two devices, MIME fallback,
pause/resume, unplug and upload retry. Mock AI/ASR jobs for preflight, stale
review and placement. Real microphone/provider proof is a staging gate.

## Tests and acceptance

- AI Music and AI Media Studio job/credit/provider error, reference-count,
  placement and provenance tests.
- Recorder device, MIME, chunk, cleanup and managed-upload tests.
- Speaker confidence/rename/merge/edit/CAS tests.
- Subtitle parse, overlap/style/safe-area and sidecar/burned-in tests.
- Browser keyboard and responsive states.

## Risks and stop conditions

Do not call an AI provider or charge credits during unit diagnosis. Do not claim
all microphones until a secure-context matrix is recorded. Stop subtitle apply
on stale revision or invalid timing.
