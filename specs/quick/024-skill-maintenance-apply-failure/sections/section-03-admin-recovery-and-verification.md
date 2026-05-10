# Section 03: Admin Recovery and Verification

## Goal

Make the maintenance tab tell operators what happened and which action is safe: normalize, retry, or inspect.

## Files

- `apps/web/server/routers/skills.ts`
- `apps/web/server/routers/__tests__/skills.legacy-upgrade-queue.test.ts`
- `apps/web/client/src/pages/AdminSkills.tsx`
- `apps/web/client/src/pages/__tests__/AdminSkills.test.tsx`

## Steps

1. Add router tests for no-change vs workspace-root classification.
2. Keep `normalizeLegacyUpgradeApplyRuns` limited to true no-change evidence.
3. Expose diagnostic fields already in `logsJson` through queue item mapping.
4. Add UI labels/badges for workspace-root issue and no-change repair.
5. Verify retry buttons stay available for real failures.
6. Run narrow frontend and backend tests.

## Acceptance

- Operator can distinguish no-change normalization from retryable path failure.
- Long diagnostic paths wrap cleanly.
- Queue counts match actual run states.

