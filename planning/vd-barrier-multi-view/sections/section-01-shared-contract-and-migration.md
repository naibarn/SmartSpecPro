# Section 01 — Shared Contract and Migration

## Ownership boundary

Own shared barrier view types, normalization/validation/status helpers, frame contract extensions, legacy projection, and shot-reference role typing. Do not change UI or provider calls here.

## Target areas

- `apps/web/shared/verticalDramaSeries/barrierMultiView.ts`
- `apps/web/shared/verticalDramaSeries/contracts.ts`
- `apps/web/shared/verticalDramaSeries/index.ts`
- `apps/web/server/services/verticalDramaShotReferences.ts`
- focused shared/server tests

## TDD expectations

Write validator and migration tests first. Preserve the existing `barrierDialogue` tests and add explicit Caller-conflict tests.

## Acceptance

- Type-safe two-view contract and deterministic status.
- Explicit speaker-side validation with no prose inference.
- Legacy data projects without destructive writes.
- `barrier_reference` role is supported by typed service inputs and existing varchar storage.

## Risks

Do not redefine `requiredCharacterRefs` as the union of both views; it remains the main Start frame's visible physical cast.
