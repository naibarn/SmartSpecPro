# Section 03: Runtime Verification And Warning UX

## Goal

Raise confidence in the runtime paths that users actually see and expose static-export limitations before the user starts export.

## Scope

- PlayMode regression strategy
- slide-render record-mode regression strategy
- export selecting-phase advisory copy

## Implementation Notes

- move at least one PlayMode test from mocked pass-through wiring toward real rendered media transform assertions
- add a slide-render runtime-oriented test harness that exercises the generated DOM/script behavior, not only string inclusion
- show preflight advisory copy for static formats when any slide has active motion

## Acceptance

- PlayMode test fails if the rendered media node stops transforming
- slide-render runtime test fails if registered record-mode nodes stop animating
- selecting `mp4` suppresses the static-flattening advisory
- selecting `png/jpg/pdf` with motion-bearing slides shows the advisory before export starts

## Tests

- `PresentationPlayMode.test.tsx`
- `slideRender.test.ts`
- `ExportDialog.test.tsx`
