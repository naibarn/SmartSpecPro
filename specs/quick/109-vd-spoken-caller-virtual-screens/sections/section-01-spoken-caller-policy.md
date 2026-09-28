# Section 01: Spoken caller policy

## Ownership

Own the new pure helper under `apps/web/shared/verticalDramaSeries/` and its
focused unit tests. Do not edit server prompt files in this section.

## Requirements

- Accept physical refs, explicit screen-caller refs, and ordered dialogue refs.
- Return stable distinct spoken caller order and one vertical-screen directive
  per spoken caller.
- Remove spoken callers from physical refs without mutating inputs.
- Never infer caller status from free-form synopsis text.

## TDD

Write the five policy tests in `implementation-plan-tdd.md` first, then make
the pure implementation pass.

## Acceptance

The helper has no DB/provider dependency, has additive types, and exports a
prompt-rendering function usable by both start-frame and video prompt modules.
