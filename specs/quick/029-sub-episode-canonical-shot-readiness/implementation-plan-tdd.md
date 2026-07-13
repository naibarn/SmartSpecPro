# TDD Plan

## Red

1. Add shared resolver tests that fail because no canonical resolver exists.
2. Extend the storyboard panel regression fixture to expect `3/3` (or a full
   nine-shot equivalent) and an enabled full-assembly action when an extra
   legacy record maps to an already-ready parent shot.
3. Add a server assembly regression where duplicate legacy records resolve to
   one selected ready clip and do not trigger `PRECONDITION_FAILED`.

Import failures may be avoided by creating only the exported resolver skeleton
before the first run; assertions must still fail on behavior.

## Green

- Implement canonical identity, expected-shot fallback, grouping, deterministic
  completed selection, ready/missing counts, and ordered selections.
- Wire the page/panel to resolver output.
- Wire server assembly to the resolver output while retaining existing partial
  and no-completed-clips error semantics.

## Refactor and regression

- Remove duplicate client-side missing-shot derivation.
- Keep public prop names precise (`readyShotNumbers`, `missingShotNumbers`,
  `totalShotCount`) unless compatibility requires a documented transitional
  adapter.
- Confirm unsplit packs remain byte-equivalent in selected ordering.
- Run focused resolver, component, assembly service/router tests and package
  type checking.

## Fixtures

- Nine expected shots with nine normal completed clips.
- Nine expected shots with ten records: one canonical parent represented by two
  legacy children, at least one completed.
- Nine expected shots with no completed candidate for shot 3.
- A completed unsplit canonical clip competing with a completed legacy child.
- Storyboard absent, start-frame fallback present.
- Both storyboard and frames absent, clip-derived fallback present.
