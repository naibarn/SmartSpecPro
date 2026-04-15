# Section 04 - Permissions and Credit Quotas

## Ownership

Add user-editable permission presets and credit quotas for registered workers.

## Target files

- `apps/web/server/services/workerBudgetService.ts`
- `apps/web/server/services/workerPolicyService.ts`
- `apps/web/server/services/workerAuthService.ts`
- `apps/web/server/services/workerSchedulerService.ts`
- `apps/web/client/src/components/settings/WorkerAccessPanel.tsx`
- `apps/web/client/src/components/settings/__tests__/...`
- `apps/web/server/services/__tests__/workerBudgetService.test.ts`

## TDD expectations

- Add tests for hourly, daily, weekly, and monthly caps.
- Add tests that over-budget usage fails closed.
- Add tests for the preset-to-allowlist mapping.

## Acceptance checks

- Users can choose a preset and see what it allows.
- Advanced controls can narrow the allowlist safely.
- Worker spend caps are enforced by the backend, not just the UI.

## Risks

- Keep the UI simpler than the underlying policy model.
- Use the existing budget service shape so spend accounting stays consistent.
