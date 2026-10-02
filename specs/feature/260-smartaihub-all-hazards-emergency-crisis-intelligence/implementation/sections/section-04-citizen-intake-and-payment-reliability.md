# Section 04 — Citizen Intake and Payment Reliability

**Dependencies:** Sections 01–03. **Owner:** conductor, serial schema/migration ownership. **Status:** In progress.

## Scope

Implement anonymous and authenticated public reporting, durable report acceptance, exact-location minimization, abuse controls, anonymous continuation and claim, public alerts/situations/facilities projections, and support contribution linkage to the canonical billing and payment authorities. Fix payment webhook races with a durable verified inbox, leases, retry, and post-provider-ID replay. A contribution is settled only after a verified provider event matches the canonical payment row.

## Owning surfaces

- Shared route contract: `packages/shared/src/emergencyRouteManifest.ts`.
- Edge adapter and Postgres transactions: `apps/web/server/routes/spec260EmergencyEdge.ts`.
- Public/dashboard client: `apps/web/client/src/pages/EmergencyRoutePage.tsx`.
- Durable execution and billing: existing `worker_jobs`/outbox and billing/payment services.
- Forward-only schema: `apps/web/drizzle/schema.ts`, numbered migration, journal entry.

## Exit criteria

- Public report success follows one committed report/case/case-event/job/outbox transaction.
- Duplicate report keys return the same durable continuation capability; token remains hash-only at rest and is never in a URL.
- Public projections use explicit allowlists and never expose exact protected location.
- Verified payment inbox events can be retried after missing payment records become available, with lease fencing and idempotent settlement.
- Public and operations routes have authored tests; execution is deferred to Section 12.
