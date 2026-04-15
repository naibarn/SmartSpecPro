# Research Notes

## Codebase patterns observed

- `apps/web/client/src/pages/Settings.tsx` already has a tabbed Settings layout and is the right place to add a user-facing worker tab.
- `apps/web/client/src/components/settings/UserAPIKeysPanel.tsx` is the strongest UI pattern for one-time secret creation, list/revoke flows, and user-owned key management.
- `apps/web/client/src/components/settings/UserLlmKeysPanel.tsx` shows how the product handles self-service secret entry with admin policy gating.
- `apps/web/server/routes/workerRuntime.ts` already exposes `POST /api/workers/register`, which is the runtime registration endpoint worker bridges call.
- `apps/web/server/services/workerAuthService.ts` already creates and verifies worker registration credentials, but there is no dedicated user-facing key manager.
- `apps/web/server/services/workerRegistryService.ts` already stores `registeredByUserId`, `externalReference`, runtime metadata, and post-register worker state.
- `apps/web/server/services/workerBudgetService.ts` already computes owner-bound hourly, five-hour, daily, weekly, and monthly caps from worker metadata.
- `apps/web/server/services/teamService.ts`, `workerFleetService.ts`, and `AdminMonitoring.tsx` already surface Hermes and other worker families in operator views.
- `apps/web/docs/help/en/hermes-workers.md` and `apps/web/docs/help/th/hermes-workers.md` show the repository already supports bilingual worker onboarding docs.
- The current top-level runtime families exposed in code are Hermes, OpenClaw, Desktop + ZeroClaw, NemoClaw, and HiClaw. NanoClaw appears in roadmap/release-note material, but not as a first-class runtime type today.

## Gaps to fill

- No dedicated worker access-key UI exists in user Settings today.
- There is no self-service UX for creating, expiring, or revoking a worker bootstrap key.
- There is no explicit model for permission presets and advanced per-worker capability limits in the user-facing flow.
- There is no one-stop view for worker identity metadata that is detailed enough for owner audit but still safe and redacted.
- The credit quota story is partially present in backend services, but there is no Settings surface that lets users configure it alongside the worker registration lifecycle.

## Security observations

- A worker registration secret must be treated as a one-time secret. The raw secret should not be persisted in plaintext and should not be re-shown after the create flow.
- Worker ownership must continue to be derived from the user who created the key and/or registered the worker, not from container names or display labels.
- The registration flow must stay tenant-bound and runtime-bound, with explicit allowlists for supported runtime families.
- Budget and permission changes should be audited, and quota enforcement should remain server-side even if the UI hides controls.

## Relevant existing modules

- `apps/web/client/src/pages/Settings.tsx`
- `apps/web/client/src/components/settings/UserAPIKeysPanel.tsx`
- `apps/web/client/src/components/settings/UserLlmKeysPanel.tsx`
- `apps/web/server/routes/workerRuntime.ts`
- `apps/web/server/services/workerAuthService.ts`
- `apps/web/server/services/workerRegistryService.ts`
- `apps/web/server/services/workerBudgetService.ts`
- `apps/web/server/services/teamService.ts`
- `apps/web/server/services/workerFleetService.ts`
- `apps/web/docs/help/en/hermes-workers.md`
- `apps/web/docs/help/th/hermes-workers.md`
