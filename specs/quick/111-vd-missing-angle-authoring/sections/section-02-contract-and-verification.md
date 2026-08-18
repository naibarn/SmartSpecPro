# Section 02 — Contract and verification

## Ownership

Verify existing server and shared contracts; change them only if the focused UI
flow exposes a real mismatch. Preserve tenant/user/series scoping and approved
variant validation.

## Target files

- `apps/web/server/routers/verticalDramaLocations.ts`
- `apps/web/server/routers/verticalDramaEpisodes.ts`
- `apps/web/shared/verticalDramaSeries/contracts.ts`
- focused router/shared tests

## TDD expectations

- Confirm `approvedPrompt` skips prompt regeneration.
- Confirm coverage role/gap metadata are carried through generation metadata.
- Confirm approved non-primary variants are returned to episode detail.
- Confirm per-shot variant mutation rejects foreign/unapproved variants and
  preserves stale invalidation.

## Acceptance checks

- No migration is needed for the requested workflow.
- Focused server tests pass.
- Changed files have no new diagnostics in targeted typecheck output.
