# Section 01 — Shared Cover State

## Ownership

Own `apps/web/shared/verticalDramaSeries/episodeCover.ts` and its focused tests.
Do not change router/UI behavior here except through exported helpers.

## Tasks

- Define cover slot IDs and a backward-compatible variant envelope.
- Add parsers/readers for legacy single state and variant states.
- Add slot projection/update helpers that preserve unrelated slots.
- Add deterministic seeded selection of approved candidates with requested scene-reference counts and capacity capping.
- Persist enough metadata to explain the selected strategy/count.

## TDD

Start with failing tests for legacy parsing, four-slot parsing, independent slot updates, stable seeds, changed seeds, and logo capacity.

## Acceptance

- Existing callers can still obtain a default/active cover state.
- A malformed variant cannot expose server-only idempotency data through the display projection.
- Same seed produces same candidate IDs; a different seed can produce a different subset when enough candidates exist.
- Selection never exceeds the model's available reference capacity.

## Risks

Keep the parser pure and avoid random global state. Use a small deterministic PRNG/hash helper rather than `Math.random()` in persisted decisions.
