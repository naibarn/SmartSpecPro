# Section 01 — Shared Canonical Readiness

## Ownership

- `apps/web/shared/verticalDramaSeries/assemblyReadiness.ts` (new)
- `apps/web/shared/verticalDramaSeries/__tests__/assemblyReadiness.test.ts` (new)
- Shared barrel export only if existing import conventions require it

## Work

Create a client/server-safe pure resolver that derives canonical shot identity,
chooses the expected shot source, groups candidates, selects one completed clip
per shot deterministically, and returns ordered expected/ready/missing shot
numbers plus selected clips.

## TDD expectations

- Write behavioral tests first.
- Cover normal 9/9, legacy duplicate, true missing shot, orphan exclusion,
  fallback sources, deterministic priority, stable ordering, and variable shot
  counts.
- First red run must fail on behavior, not only a missing import.

## Acceptance checks

- Module has no server, browser, React, database, or external dependency.
- Inputs are structural and preserve the selected original clip object.
- No hardcoded nine appears in implementation.
- Invalid/non-positive/non-integer shot identities cannot enter the expected set.

## Risks

Legacy numeric decoding must not reinterpret ordinary unsplit clip numbers; use
explicit metadata first and constrain numeric fallback carefully.

## Implementation result

- Created `apps/web/shared/verticalDramaSeries/assemblyReadiness.ts` and its
  barrel export.
- Added 8 focused unit tests covering every planned normal, legacy, fallback,
  invalid, ordering, and variable-count path.
- Focused Vitest and the full `apps/web` TypeScript check pass.
- Independent code review approved the section with no findings.
