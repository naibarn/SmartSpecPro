# Decision log

## 2026-08-13

- Chosen depth: `standard` quick plan. The change spans shared policy, start
  frame, video prompt, pipeline wiring, and tests, but does not change schema,
  auth, or deployment.
- Chosen architecture: derive policy at prompt-generation boundaries from
  explicit caller refs plus dialogue speaker order. This avoids stale persisted
  derived state and preserves legacy/manual data.
- Caller matching: exact canonical key first, then the existing prompt input's
  character key/name matching only where that path already normalizes it. Do not
  classify based on synopsis text.
- Multiple screens: one directive per distinct spoken caller, ordered by first
  dialogue appearance. The model may arrange screens spatially but may not
  merge them.
- Silent explicit callers: retain existing screen-caller behavior and do not
  apply the spoken-caller audio directive.

## Self-review revisions

- Added explicit no-inference behavior for unmatched speakers.
- Added portrait/fail-closed handling to the failure section.
- Added parity acceptance criteria for both image and video prompt paths.
