# Section 01 — Gateway and Executor Registry

## Objective

Make server-side control-plane creation and handler registration the only safe
producer boundary.

## Files

- `apps/web/server/services/jobControlPlaneGateway.ts`
- `apps/web/server/services/jobExecutorRegistry.ts`
- corresponding Vitest files under `apps/web/server/services/__tests__/`

## Requirements

- Accept authenticated/server context, never trust transport tenant/actor.
- Validate job type, contract version, execution class, and bounded definition.
- Call existing `createJobControlPlane().create()` and preserve idempotency.
- Register handler metadata without importing BullMQ/Celery into domain code.
- Resolve handlers deterministically and reject missing/unsupported mappings.

## Done when

Focused tests cover scope, idempotency, registry lookup, and unsupported
contracts. No transport call is made by the gateway.
