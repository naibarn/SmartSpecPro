# Implementation Plan

## Objective

Close the remaining media-motion gaps found in review without broadening the feature beyond the current zoom/pan system.

This round must deliver:

- `inline SVG` motion parity for image elements
- robust normalization so invalid motion presets degrade to inactive/no-op behavior consistently
- stronger runtime verification for `PlayMode` and `mp4` record-mode rendering
- earlier, clearer UX for static-export motion omission

## Current-Codebase Fit

- Motion math already has a shared helper and runtime config path, so follow-up work can stay incremental
- `CanvasStage` / `CanvasObjects` already carry `mediaMotionProgress`; this is the natural place to fix PlayMode parity for inline SVG image elements
- Export warnings already have a shared description helper, making earlier UX surfacing a small extension rather than a new warning system
- Existing tests cover many component and route seams, but they stop short of asserting actual motion on inline SVG paths and actual DOM/runtime motion in record mode

## Affected Areas

- shared motion helper normalization
- shared canvas image renderer
- editor slideshow readonly renderer
- server slide-render record runtime
- export classification helpers
- export dialog selecting-phase UX
- regression coverage for playback and export runtime

## Proposed Approach

### 1. Add inline SVG motion parity across all surfaces

Treat `svgContent`-backed image elements as motion-capable media, not as a separate static-only rendering path.

Implementation direction:

- in shared canvas rendering, wrap valid inline SVG nodes with the same transform style used for raster images
- in editor slideshow readonly rendering, apply the same readonly transform helper to the inline SVG branch
- in `slideRender.ts`, register the inline SVG node with media-motion runtime so `record` mode animates it like other media

Acceptance:

- valid inline SVG image elements move during `Play Slideshow`
- valid inline SVG image elements move during `PlayMode`
- valid inline SVG image elements move in `mp4` record runtime
- invalid inline SVG markup still degrades to the bounded placeholder path without throwing

### 2. Harden motion contract normalization

Make unknown presets and invalid easing values resolve to a safe inactive/default state instead of "active but visually no-op".

Implementation direction:

- whitelist presets/easing values in `normalizeMediaMotion`
- make `hasActiveMediaMotion` depend on normalized known presets only
- keep export classification helpers aligned with the new normalization so warnings and dynamic-capture detection only trigger for genuinely active motion

Acceptance:

- unknown preset behaves the same as `none`
- invalid easing falls back to the default easing
- static export warnings and MP4 dynamic capture do not trigger on garbage presets

### 3. Upgrade runtime verification instead of relying only on pass-through assertions

Strengthen tests where current coverage is too indirect.

Implementation direction:

- replace or supplement the mocked-`CanvasStage` PlayMode coverage with a test path that exercises the real media node transform for at least one motion-enabled image/video case
- add a `slideRender` runtime test that evaluates record-mode motion behavior at the DOM/runtime level instead of only checking generated HTML strings
- add explicit parity regression for inline SVG motion on at least one playback surface and one export/runtime surface

Acceptance:

- a real rendered media node in PlayMode shows transform changes over time
- `slideRender` record runtime demonstrates motion on a registered media node, not just runtime string presence
- the new tests fail if inline SVG motion wiring is removed later

### 4. Surface static-export motion omission earlier in export UX

Keep the current human-readable warning summary, but warn earlier when the user chooses a static format while motion is present.

Implementation direction:

- detect motion-bearing slides before export begins when the selected format is `png`, `jpg`, or `pdf`
- show concise copy in the selecting phase that static export will flatten motion and that `mp4` preserves it
- avoid noisy duplication once the export reaches exporting/done phases

Acceptance:

- selecting a static format with motion-bearing slides shows an actionable warning before export starts
- selecting `mp4` does not show the static-flattening warning
- exporting/done phases remain consistent with backend warning summaries

## Risks And Mitigations

### Risk: inline SVG transform wiring diverges from raster image paths

Mitigation:

- reuse existing transform helper semantics rather than inventing SVG-specific motion math
- add parity tests that compare SVG and raster image motion behavior under the same preset

### Risk: stronger runtime tests become brittle

Mitigation:

- keep tests deterministic with fake timers / controlled progress injection
- prefer DOM/runtime assertions over screenshot-style assertions unless the repo already has a stable browser path

### Risk: selecting-phase warning duplicates backend warnings awkwardly

Mitigation:

- treat preflight warning as advisory copy
- keep exporting/done warning rendering sourced from backend warning summaries

## Acceptance Criteria

- `inline SVG` image elements honor motion effects in `Play Slideshow`, `PlayMode`, and `mp4` export runtime
- invalid/unknown motion presets normalize to inactive behavior and do not trigger false-positive export classification
- PlayMode coverage asserts actual transform changes on rendered media nodes, not only prop plumbing
- `slideRender` coverage asserts runtime motion behavior beyond HTML string inspection
- static export warning is visible in the export selecting phase when motion would be flattened
- current raster image/video motion behavior remains unchanged

## Rollout / Verification Notes

- no schema or infra changes
- route/runtime tests may still require the local-port-capable environment used in prior slide-render verification
- verify both raster image and inline SVG image paths
- verify both active-motion data and invalid-preset data
