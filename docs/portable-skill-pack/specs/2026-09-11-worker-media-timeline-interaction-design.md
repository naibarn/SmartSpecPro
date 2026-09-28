# Worker Media Timeline Interaction and Dead-Air Repair

## Goal

Make the Worker Media Workspace behave like a usable multi-track editor for the
reported workflow: move an existing V2 clip to V1, choose the intended track
when placing media from Bin, delete the selected clip with Delete/Backspace, and
reliably show a real waveform for the selected timeline video/audio source.

## User behavior

- Clicking a clip selects it. The selected clip has a visible selection state.
- Dragging a clip to another compatible, unlocked track moves the same clip and
  preserves its source, trims, transforms, speed, and other metadata. The drop
  X position becomes its new timeline start, clamped to zero.
- Clicking a track header or lane selects the target track for “วางที่
  Playhead”. The Bin placement action uses that target instead of always using
  V2. If no target was explicitly selected, video placement prefers an empty V1
  and then V2; audio placement follows A1/A2/A3 by media kind.
- Delete and Backspace remove the selected clip only when its track is unlocked.
  Inputs, selects, text areas, and content-editable controls keep their native
  keyboard behavior. The existing clip delete button calls the same deletion
  path.
- Dead-air analysis continues to use the selected video source on the timeline.
  A single source is selected automatically. Native probing returns the audio
  catalog and waveform; native failure falls back to real WebAudio decoding when
  stream selection is not required. No synthetic waveform is presented as real
  audio data, and error text distinguishes missing audio from analyzer/tool
  failure.

## Implementation shape

1. Add pure helpers in `mediaWorkspaceTimeline.ts` for media/track
   compatibility, preferred Bin target selection, and moving a clip between
   tracks.
2. Add focused tests for the helpers and edge cases (V2→V1, locked target,
   negative drop time, audio/video mismatch, and empty-track preference).
3. Wire `MultiTrackTimeline` to clip selection, internal clip drag/drop, target
   track selection, dynamic Bin placement, and keyboard deletion.
4. Make parent clip insertion functional and reject locked/missing targets
   visibly rather than silently dropping the clip.
5. Harden the native silence command/error boundary and the React fallback path;
   preserve audio-stream selection and clear stale waveform state on source
   changes.

## Follow-up hardening after user verification

- Internal clip movement uses pointer/mouse events rather than relying on the
  HTML5 drag/drop lifecycle inside the Tauri WebView. Bin-to-lane HTML5 drop is
  retained because it is an external asset import path.
- Native waveform extraction emits real mono PCM `s16le` samples at 8 kHz.
  The backend emits per-bin `min`, `max`, `RMS`, and `peak` values; the UI
  normalizes only for display, renders the waveform symmetrically around a
  zero line, and colors silence from raw RMS against the selected dB threshold.
  A visible baseline is rendered when an audio track exists but a decoder
  returns no usable bins.
- A flat or near-zero native result cannot silently produce the old one-pixel
  red strip. The UI reports decoder errors separately from the visible baseline.
- Dead-Air VAD uses RMS windows rather than the signed sample average, avoiding
  cancellation between positive and negative waveform samples.

## Follow-up Auto Pan/Zoom render parity

- The preview and FFmpeg direct-render paths share the selected `smartDirector`
  mode through the interactive render contract. When Auto AI, face focus, or
  product focus is enabled, FFmpeg uses a time-varying crop scale instead of
  silently reducing the request to a static `focusX/focusY` crop.
- The render expression uses the same bounded 18-second wide-to-close-to-wide
  motion profile as the preview family, with a safe scale cap. Static/manual
  mode keeps the existing fixed crop behavior.
- Remotion remains the full-composition path; this repair covers the FFmpeg
  direct render buttons shown in the Media Workspace.

## Non-goals and safety

- No database/schema changes, server queue changes, or new dependencies.
- No automatic deletion of authored project files or Media Bin assets when a
  timeline clip is deleted; Delete removes only the timeline instance.
- No fake waveform generation for a failed real-media analysis.
- Preserve all unrelated dirty worktree files.

## Verification

- Focused Vitest for timeline helpers and existing Media Workspace tests.
- Worker App TypeScript typecheck and production frontend build.
- Rust media-pipeline tests for stream resolution/result behavior.
- Browser smoke where local watcher limits allow; report any environment block.
