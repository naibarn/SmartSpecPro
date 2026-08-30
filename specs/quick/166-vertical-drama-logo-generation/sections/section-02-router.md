# Section 02 — Router and durability

## Ownership

Own `apps/web/server/routers/verticalDramaSeries.ts` and focused router tests.

## Work

- Add compatible model list procedure.
- Add generate procedure using lazy `mediaRouter.createCaller(ctx)` and existing media async contract.
- Add apply procedure using `getUnifiedMediaTask`, series ownership, `__vd_series_id`, `__vd_purpose`, completed status, and managed URL validation.
- Preserve feature flag, tenant, user, credit, audit, and idempotency semantics.

## Risks

- Avoid direct provider calls and client URL trust.
- Ensure the task metadata is in `extraParams` where the durability reader expects it.

## TDD/acceptance

- Cover enabled/capability filtering, unsupported model rejection, metadata forwarding, cross-user/series rejection, non-completed/non-durable rejection, patch preservation, and repeat apply.
