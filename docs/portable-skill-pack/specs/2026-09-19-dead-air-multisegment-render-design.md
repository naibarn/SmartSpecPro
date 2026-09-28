# Dead-Air Multi-Segment Render Design

## Problem

When a Worker App project is rendered once without Dead Air removal and then
rendered again with Dead Air removal, the second render can appear to hang on a
long source video. The Full Scan has already completed; the native render path
then encodes every retained segment as a separate MP4 and concatenates the
temporary files. A long video with many silence ranges therefore starts many
encoder processes with no progress signal.

## Root Cause

`MediaVideoEditorPlayer` sets the Full Scan status immediately before invoking
`worker_app_process_media_interactive`. In `run_interactive_media_render`, the
multi-segment branch loops over every retained segment, starts a separate
FFmpeg encode for each one, and only then runs concat. The no-Dead-Air render
usually takes the single-segment fast path, which explains why the second
render has materially different behavior.

## Decision

Keep the existing single-segment fast path. Replace the multi-segment temporary
part-file loop with one FFmpeg invocation:

- open the source once per retained segment as bounded `-ss`/`-t` inputs;
- trim and reset timestamps for each video and audio input;
- apply the existing crop, playback-speed, and remapped camera-plan filters;
- concatenate all retained streams in one filter graph;
- encode the final output once with the existing H.264/AAC settings.

The filter graph will select video-only or video-plus-audio concat based on the
source probe. Existing segment ordering, camera-plan output offsets, and audio
speed behavior remain unchanged.

## Invariants

- Dead-Air ranges still remove the same middle sections.
- Audio remains synchronized and is preserved when the source has audio.
- Camera motion is evaluated on the retained output timeline.
- A one-segment render retains its existing command path.
- Invalid or empty segment input still fails before FFmpeg starts.
- No new dependency, retired system, or broad UI rewrite is introduced.

## Acceptance

- A focused native regression test verifies the multi-segment graph contains one
  concat stage with all retained inputs and the correct audio mode.
- Existing native smoke coverage still produces audio and a non-zero output
  duration for a multi-segment camera render.
- Worker timeline/project tests remain green.
- The changed Rust file passes formatting and focused Cargo tests.
