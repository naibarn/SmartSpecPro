# Section 03: Video prompt and verification

## Ownership

Own `verticalDramaVideoMotionPromptGeneration.ts`, video prompt tests, and final
focused verification. Do not alter unrelated dirty files.

## Requirements

- Extend bulk and single-shot prompt inputs with explicit caller refs and
  dialogue speaker keys as needed.
- Render the shared directive in video prompt user text.
- Preserve caller speaking order and separate virtual screens.
- Ensure no-caller behavior remains compatible.

## TDD

Test one caller, multiple callers, and absent caller data in the semantic prompt
builder path. Run all relevant existing Vertical Drama prompt tests afterward.

## Acceptance

Focused tests pass, changed files are type-safe enough for local diagnostics,
`git diff --check` passes, and final report distinguishes focused proof from
repository-wide baseline noise.
