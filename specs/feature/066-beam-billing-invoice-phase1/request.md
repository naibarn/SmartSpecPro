## Request

Extend the feature specs under `specs/feature` with a new SmartSpecPro billing spec for Beam-first payments and production-grade invoice/document handling.

The new spec must cover:

- Beam as the only Phase 1 payment provider
- PromptPay QR as the primary payment method
- one-time credit top-up and monthly subscription renewal
- app-owned billing state for invoice, payment, subscription, credits, billing profile, and audit trail
- seller and buyer billing headers with snapshot, sync, replace/reissue, and PDF versioning
- domestic vs international invoice streams with separate numbering
- base-price-before-VAT pricing and tax-policy snapshots
- multi-language invoice document variants
- duplicate invoice / duplicate charge / duplicate notification prevention
- reconciliation, manual recovery, admin recovery console, and overdue downgrade safety rules

## Repo-grounded assumptions

- Existing web billing in this repository is still lightweight and credit-centric. The main concrete billing artifacts found during repo scan are:
  - `apps/web/server/routers/credits.ts`
  - `apps/web/server/services/creditService.ts`
  - `apps/web/client/src/pages/Credits.tsx`
- There is already some invoice-header administration for tenant/domain white-labeling in:
  - `apps/web/client/src/pages/DomainAdminInvoice.tsx`
- Current package seeding and scripts still assume Stripe-era naming in places:
  - `apps/web/scripts/seed-subscription-packages.ts`
  - `apps/web/scripts/apply-billing-migration.ts`
- The spec therefore needs to establish a Beam-first target architecture without pretending that the full billing stack already exists.

## Constraints

- Keep Beam integration behind a provider abstraction so future providers can be added without rewriting business logic.
- Treat SmartSpecPro as the source of truth for billing state.
- Keep the spec implementation-oriented and aligned with the repository's feature-spec package format.

## Non-goals

- No auto-renewing saved-card production flow in Phase 1
- No multi-country tax engine
- No full accounting export suite
- No complete credit-note / debit-note workflow
