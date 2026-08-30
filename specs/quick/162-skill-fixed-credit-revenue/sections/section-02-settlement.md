# Section 02: run settlement and reversal

## Ownership

Central fixed-credit settlement, recipient resolution, run idempotency, and refund reversal.

## Targets

- `apps/web/server/services/skillRevenueBilling.ts`
- `apps/web/server/services/creditService.ts` if transaction primitives are required
- authoritative skill run routers/services and their focused tests

## TDD

- Success charges user once and grants each recipient exactly once.
- Retry returns the original settlement without new rows.
- Missing owner fails closed before charge.
- Refund/reversal is safe after auto-refund and safe on repeated calls.

## Risks

Provider/model and media auto-refunds must not be duplicated. Preserve existing non-skill billing.
