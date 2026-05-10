# Section 02: Proposal and Finalization Contract

## Goal

Make apply runs finalize correctly for no-change, JSON proposal, legacy diff, and real failure outcomes.

## Files

- `apps/web/server/services/skillStudioService.ts`
- `apps/web/server/services/skillUpgradeApplier.ts`
- `apps/web/server/services/__tests__/skillUpgradeApplier.test.ts`
- new or existing `apps/web/server/services/__tests__/skillStudioService.test.ts`

## Steps

1. Add tests for JSON proposal detection and `.meta.json` exclusion.
2. Add/apply a proposal helper that supports JSON payloads and legacy diffs.
3. Preserve strict proposal-root containment checks.
4. Update finalizers to keep task/root/proposal metadata.
5. Classify success with zero proposals as completed no-change.
6. Classify workspace-root pollution as a real retryable failure.

## Acceptance

- JSON proposals are first-class.
- No-change outcomes do not become failed apply runs.
- Workspace-root failures remain visible and retryable.

