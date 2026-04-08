# Research — Feature 066: Beam Billing & Invoice Phase 1

## Research auto-decision

- Codebase: yes
- Web topics: none for this pass
- Testing: existing Vitest setup in `apps/web/package.json`

## Existing codebase findings

### Web app shape

- Node + TypeScript ESM backend
- tRPC for authenticated control-plane APIs
- Express routes for lower-level HTTP/webhook work
- Drizzle schema and SQL migration workflow
- React + Wouter frontend

### Billing-adjacent modules already present

- `apps/web/server/services/creditService.ts`
- `apps/web/drizzle/schema.ts`
- `apps/web/server/routers/systemSettings.ts`
- `apps/web/client/src/pages/DomainAdminInvoice.tsx`
- `apps/web/server/storage.ts`
- `apps/web/server/services/auditLogger.ts`

### What exists today

- `creditService` already uses idempotency and transaction-history concepts suitable for exactly-once credit application.
- `invoice_config` already stores tenant/company invoice header data, but only as a flat settings object.
- `credit_packages` still reflect Stripe-era assumptions and are not a fit for invoice/payment orchestration.
- The web server already initializes recurring jobs centrally in `apps/web/server/_core/index.ts`.
- Storage access already supports presigned/proxy-gated access with expiry limits.
- Secret encryption and timing-safe compare patterns already exist in multiple integrations.

### Constraints discovered

- Role model is still coarse: mostly `user`, `admin`, `domain_admin`, `system_agent`.
- There is no existing invoice/payment/reconciliation domain.
- Billing must reuse existing user plan/credits state, not invent parallel entitlement primitives.

## Testing findings

- Primary command: `npm --prefix apps/web test`
- Best fit for Feature 066:
  - service tests for tax, numbering, idempotency, and state transitions
  - router tests for invoice ownership and admin authorization
  - route/webhook tests for raw-body signature verification
  - job tests for renewal, downgrade, reconciliation, and recovery

## Planning implications

- Build a first-class billing subsystem in the web app.
- Keep Beam-specific logic at the adapter and webhook boundary.
- Use action-based billing authorization because current roles are too coarse.
- Reuse storage, encryption, audit, and scheduler startup patterns from the repo.
