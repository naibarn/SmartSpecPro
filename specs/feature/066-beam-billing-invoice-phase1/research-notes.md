# Research Notes

Date: 2026-03-31

## Codebase scan summary

The repository does not yet contain a complete invoice, payment, or Beam module under `apps/web/server`. Billing today is largely expressed as credit balances, package seed scripts, and a domain-admin invoice configuration page.

### Relevant existing files

- `apps/web/server/routers/credits.ts`
- `apps/web/server/services/creditService.ts`
- `apps/web/client/src/pages/Credits.tsx`
- `apps/web/client/src/pages/DomainAdminInvoice.tsx`
- `apps/web/scripts/seed-subscription-packages.ts`
- `apps/web/scripts/apply-billing-migration.ts`

### Observed implications

- We should spec a new billing subsystem rather than pretending Beam is a small adapter swap.
- Existing invoice UI is header-configuration-oriented, not transaction-oriented.
- Existing subscription/package scripts mention Stripe fields and multi-period subscriptions, while the requested feature is Beam-first with monthly manual invoice renewal.
- Credit grant logic already exists conceptually, so the new billing spec should reuse a business-effect approach where credits are applied only after paid state is finalized.

## Architecture fit

The best fit for this repository is:

- web-app-owned billing state
- Beam provider adapter behind service interfaces
- scheduler-driven renewal, overdue handling, reconciliation, and document recovery
- admin and user routes added to the web stack
- PDF rendering and document history treated as first-class billing artifacts

## Risk themes to address in the spec

- duplicate invoices from scheduler reruns
- duplicate charges when provider state is uncertain
- webhook eventual consistency
- accidental silent mutation of paid invoice headers
- tax and numbering policy drift after invoice issuance
- notification spam from webhook replay or reconciliation retries
- downgrade mistakes when provider has late-paid state
