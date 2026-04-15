# Section 03 - Worker Metadata and Audit Snapshot

## Ownership

Expand the worker registry and fleet views so registered workers carry a richer, safer audit snapshot.

## Target files

- `apps/web/server/services/workerRegistryService.ts`
- `apps/web/server/services/workerFleetService.ts`
- `apps/web/server/services/teamService.ts`
- `apps/web/client/src/pages/AdminMonitoring.tsx`
- `apps/web/client/src/pages/Teams.tsx`
- `apps/web/server/services/__tests__/workerRegistryService.test.ts`
- `apps/web/server/services/__tests__/workerFleetService.test.ts`

## TDD expectations

- Add tests that verify metadata fields are stored and summarized safely.
- Add tests that verify redaction of secrets and remote endpoint policy details.
- Add tests that ensure the owner and tenant are always visible in summaries.

## Acceptance checks

- Operators can inspect enough worker identity to know what machine/runtime registered.
- Sensitive data is not displayed in plaintext.
- User-owned and tenant-owned state remain aligned in all summaries.

## Risks

- Keep the admin summaries truthful even when some fields are missing.
- Preserve compatibility with existing Hermes/OpenClaw fleet logic.
