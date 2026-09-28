# Section 01 — Shared contract

## Ownership

Own only `apps/web/shared/verticalDramaSeries/logoGeneration.ts` and its test.

## Work

- Implement exact prompt builder for primary title and secondary Facebook page/channel name.
- Implement safe slot patch helper that preserves placement fields and writes `type=image`, `enabled=true`, `imageUrl`.
- Reuse `resolveTransparentBackgroundCapability` rather than duplicating capability parsing.

## TDD/acceptance

- Tests must prove exact initial strings, missing channel name rejection, and no mutation of unrelated/placement fields.
- No provider calls, DB imports, or UI dependencies.
