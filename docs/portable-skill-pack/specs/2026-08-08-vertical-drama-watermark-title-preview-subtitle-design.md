# Vertical Drama watermark, title bumper, and preview subtitle design

## Problem

Vertical Drama final renders can place two configured image watermarks in the
same corner. The primary watermark is auto-moved when it shares a corner with
the episode indicator, so a configured `top_right` + `bottom_right` pair can
become `bottom_right` + `bottom_right`. The title bumper is fixed at 1.2
seconds, which is too short to read. Episode previews are submitted without
the subtitle feed and explicitly disable caption burn-in.

## Decision

1. Configured watermark positions are authoritative. Do not move a watermark
   to resolve an episode-indicator collision.
2. When the episode indicator shares a corner with a configured watermark, move
   the indicator to the opposite top corner. This keeps the user-selected
   watermark positions unchanged.
3. Increase the title bumper duration from 1.2 seconds to 3 seconds. The
   opener recap remains queued after the title bumper.
4. Make episode previews accept the same subtitle preset/font-size inputs as
   final assembly. The preview route builds subtitles from the same dialogue
   plan plus authored clip dialogue fallback, limited to the selected clips.
   Remotion preview jobs burn those captions in with the same worker contract.

## Scope

- Shared text-overlay position resolution and its tests.
- Remotion preview input/template submission and subtitle worker payload.
- Episode preview router/client wiring for subtitle options.
- Focused regression tests for watermark positions, title timing, and preview
  caption payloads.

## Non-goals

- Changing subtitle visual presets or authored dialogue text.
- Changing the existing cover/end-card treatment of previews.
- Reworking the already-fixed video asset URL persistence path.

## Acceptance criteria

- Primary `top_right` and secondary `bottom_right` image watermarks remain in
  those positions even when the episode indicator is enabled.
- A conflicting episode indicator is placed in the other top corner.
- The title bumper window is `[0, 3)` seconds and recap timing follows it.
- Preview render jobs include caption lines and a real caption preset when
  subtitles are enabled; `burnInAssCaptions` and `ass_burn` match that state.
- Existing no-subtitle behavior remains available when the selected preset is
  `none`/`no_subtitle_style`.
