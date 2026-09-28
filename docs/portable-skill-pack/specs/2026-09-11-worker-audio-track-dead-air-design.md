# Worker App audio-track-aware waveform and global dead-air cuts

## Goal

Repair the Worker App Quick Silence Cut workflow so a selected video reliably
produces an audio waveform, expose the embedded audio streams as selectable
tracks, and apply dead-air cuts consistently to the rest of the NLE timeline.

## Evidence and current failure boundary

- `MediaVideoEditorPlayer` auto-runs `worker_app_detect_silence_custom` when a
  video is selected, but the command accepts no audio stream selection.
- `detect_audio_silence_custom` invokes FFmpeg without an explicit audio map,
  so the analyzed stream is implicit rather than a user-visible track.
- The UI rejects a non-empty waveform if every peak is zero, then invokes a
  Web Audio fallback that cannot reliably select an embedded stream.
- NLE dead-air initialization currently splits only the V1/A1 source clips;
  overlay tracks are not remapped by the same cut map.
- Interactive source rendering already processes the source video and its
  embedded audio together, but its silence fallback also needs the selected
  stream contract.

## Design

### Audio stream contract

FFprobe-derived `AudioTrackInfo` is returned with analysis results:

- absolute FFmpeg `streamIndex`
- audio-only ordinal
- optional title, language, codec, channels, and channel layout
- default disposition

`worker_app_detect_silence_custom` accepts an optional `audioStreamIndex`.
When absent, Rust selects the default audio disposition, otherwise the first
audio stream. When present, it validates that the index is an audio stream and
uses `-map 0:<streamIndex>` for both silence detection and waveform extraction.
The result echoes the complete track list and selected index.

The interactive render request carries the same selected stream index so a
render that must re-run analysis cannot silently analyze a different stream.
The render itself retains all source video/audio streams needed to keep
embedded multicamera content synchronized.

### UI behavior

- Selecting a video resets stale analysis state and auto-analyzes the resolved
  default track.
- A single audio track is selected without extra user action.
- Multiple tracks show a labelled dropdown above the waveform; changing it
  immediately re-analyzes that track.
- `Analyze` repeats analysis using the current track and threshold settings.
- A valid flat waveform remains visible; only an empty/invalid native result
  can use the single-track Web Audio fallback.
- No-audio and analysis-error states are explicit and do not fabricate a
  waveform for the user.

### Global timeline cut map

The analyzed silence intervals remain in source-time coordinates. A shared
timeline utility normalizes them, computes kept intervals, and remaps every
NLE track, including video, audio, subtitle, code, blur, and other overlays.
Clips crossing a removed interval are split; each retained piece receives a
new timeline start, duration, and source trim boundaries. Subtitle word timing
is clipped/remapped with its parent clip. The canvas duration and dead-air
metadata are updated together.

Global remapping is an intentional alignment operation and therefore applies
to locked tracks as well; normal clip editing continues to respect locks.
The operation is fingerprinted in project metadata so the same cut map is
idempotent and is not applied twice. The selected stream index and cut-map
fingerprint are persisted in the local project JSON only; no database migration
is required. During a live editing session, the editor retains the pre-cut
project baseline so switching the selected audio track can apply a new
source-time map without attempting to reconstruct content already removed by a
previous map.

### Error handling and safety

- Invalid or non-audio stream indices return a typed command error and leave
  the current waveform/project state unchanged.
- A source with no audio exposes an empty-track state and disables dead-air
  analysis rather than falling back to synthetic audio.
- Stale async results from a prior video or track selection are ignored.
- No provider calls, uploads, database writes, or paid operations are added.
- Existing unrelated dirty worktree changes are preserved.

## Verification plan

### TypeScript tests

- audio-track label/default selection and stale-result handling
- waveform acceptance for non-empty all-zero peaks
- global cut remapping for V1/A1, overlay clips, crossing clips, and subtitle
  words
- idempotent application of an identical cut fingerprint
- workspace/browser fixture coverage for the new Tauri command payload

### Rust tests

- FFprobe stream parsing and default-track selection
- explicit FFmpeg map construction for the selected stream
- invalid stream rejection
- serialization of the extended analysis/render contracts

### Gates

- Worker App focused Vitest suite
- Worker App TypeScript typecheck/build
- targeted Rust test suite for the Tauri crate
- `git diff --check`
- browser smoke if the local Worker App browser harness is available

Deployment and signed installer packaging are outside this fix; a new signed
Worker App release remains a separate release gate.
