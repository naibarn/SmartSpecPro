# Section 01 - Payment Instrument Schema

## Ownership
- `apps/web/drizzle/schema.ts`
- new Drizzle migrations under `apps/web/drizzle/`
- `apps/web/shared/finance.ts`
- low-level finance model helpers in `apps/web/server/services/financeService.ts`

## Goal
Add the database and shared-schema primitives needed to represent:
- bank institutions
- multiple accounts under one bank
- multiple credit cards under one issuer
- credit cards as payment instruments
- transfer-slip attachment roles

## Scope
Implement the minimal domain model that makes the rest of the feature possible:
- institution canonicalization
- payment-account canonicalization
- account last4 / masked identifier storage
- account and card nicknames as the primary user-facing label
- account aliases and canonical display labels
- transaction fields for source/destination payment instruments
- document role extension for transfer slips
- conservative migration/backfill behavior for existing finance rows

## TDD expectations
Write tests that fail first for:
- institution/account uniqueness per owner scope
- multiple accounts under the same bank
- multiple credit cards under the same issuer
- credit card account support
- alias resolution for the same underlying account
- nickname-first display fields for bank accounts and cards
- role/schema parsing for transfer slips
- masked identifier storage and no raw PAN/full account number writes

## Acceptance checks
- The schema can represent at least:
  - one bank with multiple accounts
  - one credit card under an issuer
  - one transaction linked to a payment source or destination
- Raw full account numbers and card PAN are not required by the schema.
- Existing finance tables remain compatible with current counterparty and OCR flows.
- Existing receipts and transactions remain readable when payment-instrument fields are null.
- The same physical account can be found by canonical name, alias, or OCR hint without creating duplicates.
- Multiple credit cards can exist under the same issuer without clashing by nickname or canonical id.

## Known risks
- Over-modeling too many payment-instrument types up front.
- Adding too many nullable columns instead of a clear account model.
- Breaking existing migrations if the new tables are not ordered carefully.
