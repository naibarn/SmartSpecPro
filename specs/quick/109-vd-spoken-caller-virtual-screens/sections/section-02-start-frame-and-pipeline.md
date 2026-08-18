# Section 02: Start-frame and pipeline wiring

## Ownership

Own `verticalDramaStartFrameGeneration.ts`, the relevant pipeline call site,
and their focused tests.

## Requirements

- Pass canonical deep-draft speaker order into the start-frame shot contract.
- Derive spoken callers using the shared helper.
- Add the vertical screen/visible face/whole-shot/separate-screen wording.
- Keep screen callers out of physical image attachment references.
- Preserve legacy output when no spoken caller exists.

## TDD

Add prompt assertions for one and multiple spoken callers, plus the existing
no-caller and screen-caller-only regressions.

## Acceptance

The start-frame prompt and image reference manifest agree on caller roles, and
the pipeline passes the same speaker order used by its canonical draft source.
