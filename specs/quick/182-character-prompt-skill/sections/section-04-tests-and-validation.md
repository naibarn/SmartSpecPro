# Section 04 — tests and validation

## Ownership

Own regression coverage and bounded verification. Do not expand into unrelated
full-repository typecheck/build work.

## Target files

- Existing Vertical Drama character service/router test suites
- New adapter test suite if needed
- New skill audit/content assertions

## TDD expectations

Cover valid profile, malformed profile, role/age/region conflicts, prompt
length, target negative handling, credit metadata, approved reuse, turnaround,
named sheets, and persistence warnings. Add a regression asserting no legacy
five-field requirement exists on the new path.

## Acceptance checks

- Focused Vitest suites pass.
- Skill audit passes.
- `git diff --check` passes.
- Touched modules parse/typecheck with bounded commands.
- No image provider call or database write is used by tests unless an existing
  unit mock requires it.

## Risks

Existing tests heavily mock the legacy service result. Update only mocks that
belong to changed router paths and retain legacy service tests unchanged where
the legacy export remains supported.

## Implementation evidence

- `characterPromptSkill.test.ts`: 2 tests passed, including one-call portrait
  behavior and `sheet:<type>` routing.
- `characterPromptProfile.test.ts`: 3 tests passed, including profile-only
  snapshot validation and legacy/new snapshot guard behavior.
- Legacy `verticalDramaCharacterImageGeneration.test.ts`: 194 tests passed.
- `verticalDramaCharacterDesignContext.test.ts`: 8 tests passed.
- `npm exec tsc -- --noEmit --pretty false` completed without diagnostics.
- `git diff --check` passed. The Python skill audit could not run because the
  environment lacks the `jsonschema` module; no dependency was installed.
