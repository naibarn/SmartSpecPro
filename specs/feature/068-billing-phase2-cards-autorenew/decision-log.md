# Decision Log — Feature 068

## D-001: Phase 2 focuses on cards and auto-renew

Chosen because it is the most direct continuation of Phase 1 and reuses the billing foundation already implemented.

## D-002: Invoice-first model remains unchanged

Auto-renew still issues invoices and uses the existing payment/invoice/reconciliation pipeline.

## D-003: No raw card storage

The application stores only masked metadata and provider references. Provider-hosted or provider-tokenized setup is mandatory.

## D-004: Renewal mode is explicit

Subscriptions support `manual_invoice` and `auto_charge`, allowing controlled rollout and reversibility.

## D-005: Dunning is bounded

Retries and reminders must be explicit and bounded to prevent uncontrolled duplicate attempts and customer spam.
