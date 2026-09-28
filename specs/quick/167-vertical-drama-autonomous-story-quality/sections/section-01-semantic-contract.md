# Section 01 — semantic consistency contract

## Ownership

Shared pure types/validators for knowledge, disclosure visibility, premise
consistency, and repeated events.

## Target files

- `apps/web/shared/verticalDramaSeries/storyConsistency.ts`
- `apps/web/shared/verticalDramaSeries/index.ts`
- shared contract tests

## TDD expectations

Use deterministic plain-object fixtures. No database, network, or LLM calls.

## Acceptance

The contract reports exact episode/shot findings and never leaks facts from a
viewpoint-bounded pack. Existing thread/completion contracts remain compatible.

## Risks

Free-form Thai prose is ambiguous. Prefer explicit metadata when present and
emit a warning/review finding rather than making an unsafe knowledge inference.
