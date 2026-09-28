# Section 01 — Shared Visual Cast

## Ownership

Own the pure resolver and its unit tests. Do not change provider calls, database
records, UI, or prompt persistence in this section.

## Target files

- `apps/web/shared/verticalDramaSeries/` existing cast/presence contract module
  or a narrowly scoped new resolver module
- corresponding shared tests
- `apps/web/shared/verticalDramaSeries/index.ts` only if export wiring is needed

## Work

- Define a small result with `physicalCharacterRefs`, `callerCharacterRefs`,
  and ignored narrative refs/metadata if the prompt builders need it.
- Prefer non-empty frame-selected refs as authority; preserve their order.
- Add only explicit caller refs to the caller collection.
- Ignore storyboard-only refs for visual cast construction without throwing.
- Keep the helper pure, bounded, and independent of database/provider state.

## TDD and acceptance

- Shot 9 fixture excludes the mention-only fourth character.
- Caller fixture keeps the caller separate from physical cast.
- Empty frame refs preserve the existing compatibility fallback without
  inventing a new character-selection policy.
- Duplicate refs are deterministic and safe.

## Risks

Do not create a second speaker identity resolver that can disagree with
`castPositionLock`; reuse existing identity/position helpers at integration
boundaries.
