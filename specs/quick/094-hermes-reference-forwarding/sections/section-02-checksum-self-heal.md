# Section 02 - Checksum self-heal

## Ownership

- `apps/web/server/services/hermesMediaReferences.ts`
- `apps/web/server/services/hermesMediaAdapter.ts`
- `apps/web/server/services/__tests__/hermesMediaReferences.test.ts`
- focused Hermes adapter regression tests

## TDD expectations

1. Add a failing case with a stale non-null cached checksum.
2. Require the contract to use the fresh object hash and repair the cache.
3. Preserve no-write behavior for a matching cache value.
4. Preserve best-effort handling when cache persistence fails.

## Acceptance checks

- Storage proxy paths and bare object keys hash the same underlying bytes.
- No schema or ownership-boundary change.
- Existing Worker-side checksum verification remains enabled.
