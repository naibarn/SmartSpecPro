# TDD guidance

## Failing cases first

- Two shot contexts request `casual_home`; only one stable reuse identity must
  be produced.
- A legacy row labeled `ชุดใส่นอน` must match a `sleepwear` request without
  `lookSemanticKey`.
- A manually authored `age_stage` row must not match an `outfit` request with
  the same visible words.
- When two matching rows exist, the portrait-ready row must be selected.

## Regression checks

- Preserve existing selector behavior for explicit matching, manual overrides,
  conflicts, and no-cue continuity.
- Run the focused shared look-selection tests and any new persistence contract
  tests.
- Run formatting and diff checks after implementation.
