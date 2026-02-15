# Section 01 Review

- section: `section-01-contract-validation-foundation`
- date: 2026-02-15
- reviewer: codex

## Scope Reviewed

- `apps/web/client/src/services/projectManager.ts`
- `apps/web/shared/types/mediaJob.ts`
- `apps/web/client/src/services/__tests__/projectManagerValidation.test.ts`
- `apps/web/shared/types/__tests__/mediaJob.test.ts`

## Findings

- `none` at critical/high severity after targeted tests.

## Risk Notes

- Strict parity now rejects unsupported text effects (`glow`, `typewriter`, `fade-in-word`) at validation time. This is intentional for deterministic parity, but older experimental payloads using these effects will fail fast instead of rendering approximately.
- Mixed-version policy defaults to `reject_with_clear_error`; `gated_downgrade` only allows unsupported future contract versions when no text semantics exist.

## Test Evidence

- `cd apps/web && npm test -- client/src/services/__tests__/projectManagerValidation.test.ts shared/types/__tests__/mediaJob.test.ts`
- Result: `2 passed`, `102 passed` tests.
