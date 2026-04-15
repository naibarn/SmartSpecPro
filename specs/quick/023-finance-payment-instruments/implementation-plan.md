# Implementation Plan

## Objective
Expand the private finance workspace so it can capture and report on payment instruments in a practical way:
- receipts and transfer slips through one shared capture pipeline
- bank institutions with many accounts
- credit cards as first-class payment sources
- month/year reports grouped by account, bank, card, and counterparty

The result should feel like a natural extension of the current finance workspace, not a separate subproduct.

## Current-codebase fit
The current finance system already provides:
- private-vault access control
- finance drafts and confirmed transactions
- counterparty canonicalization
- OCR ingestion for uploaded finance documents
- report exports and range filtering

This means the new work can reuse the existing finance architecture and add a payment-instrument layer underneath it.

## Implementation approach

### 1. Add a payment-instrument domain
Introduce new finance records for:
- bank / issuer institutions
- payment accounts under those institutions
- credit card accounts under those institutions

Use these records to represent:
- bank accounts
- debit cards if needed later
- credit cards
- other future payment instruments without collapsing them into counterparties

Expose the new domain through finance service helpers and router procedures such as:
- `listPaymentInstitutions`
- `upsertPaymentInstitution`
- `listPaymentAccounts`
- `upsertPaymentAccount`
- `upsertPaymentAccountAlias`
- `archivePaymentAccount`
- `suggestPaymentAccountMatches`
- `resolvePaymentInstrumentCandidates`

Add transaction-level fields for:
- `paymentSourceAccountId`
- `paymentDestinationAccountId`
- `paymentMethodKind`
- `paymentDirection`
- `paymentInstrumentConfidence`

Use a small, explicit `paymentMethodKind` enum such as:
- `bank_account`
- `credit_card`
- `cash`
- `unknown`

Keep the existing counterparty layer separate so people/orgs are still tracked independently from payment accounts.

The model should support:
- one bank with many accounts
- one issuer with many credit cards
- account nickname + last4 / masked identifier
- card nickname + last4 / masked identifier
- account aliases and canonical display labels
- owner-scoped canonical naming
- safe matching from OCR or user selection
- conservative backfill for existing rows with null payment-instrument fields

### 2. Extend transaction and draft payloads
Add fields that identify where money flowed from or to:
- payment source account
- payment destination account
- payment instrument kind

This gives the app enough information to answer:
- “What did I pay from this account?”
- “What income landed in this account?”
- “How much did I spend on this credit card this month?”

When a transaction is confirmed from OCR or manual entry:
- copy the selected account/card into the confirmed transaction
- keep the original OCR hint in the draft/extraction record
- preserve the counterparty separately from the payment instrument
- never persist raw full account numbers or full PAN in transaction payloads

### 3. Separate receipt and transfer-slip capture intent
Keep the same upload pipeline, but add explicit user intent:
- receipt
- transfer slip
- statement

The UI should use one shared proof-upload surface with quick shortcuts, not two different backends.
Instead, the upload intent should steer:
- OCR prompt
- extraction schema
- document role
- account matching rules
- whether the capture card opens with receipt or slip selected by default

### 4. Improve OCR extraction for payment instruments
Update the document extraction prompt and post-processing to extract:
- institution / bank name
- sender and receiver account hints
- account last4 or masked account fragments
- card last4 where visible
- reference number / slip number
- amount, date, and time
- incoming vs outgoing direction

When OCR is ambiguous:
- keep the draft in review state
- require user selection from candidate accounts
- do not auto-guess a payment instrument
- store confidence and match provenance so the UI can explain why a suggestion was chosen

Persist OCR hints separately from the final transaction so later review can see:
- what the OCR thought the bank/account/card was
- what the user ultimately chose
- whether the match was exact, fuzzy, or manually selected

### 5. Add account management UI
In the finance workspace, add a section for managing payment instruments:
- add bank
- add bank account
- add credit card
- rename / archive instrument
- mark primary account

Use the same canonical-selection patterns that already exist for counterparties so users can pick a known instrument quickly.
Support a single bank with multiple accounts by grouping accounts under the bank card and exposing recent-used quick pick options.
Treat nickname as the primary visible label for both bank accounts and credit cards, with canonical labels and aliases retained for matching behind the scenes.

### 6. Extend reports and exports
In `/finance/reports`, add drill-downs for:
- bank totals
- account totals
- credit card totals
- transfer-slip linked evidence

Keep the current range filter and export flow, but include the new dimensions in:
- on-screen summaries
- linked-evidence drill-down
- exported PDF report

Add report groupings for:
- spending by payment source
- income by receiving account
- credit-card totals and due-balance cues where available
- monthly and yearly views by instrument with counterparty cross-filtering

## Affected files and modules
Likely changes will touch:
- `apps/web/drizzle/schema.ts`
- `apps/web/drizzle/*.sql`
- `apps/web/shared/finance.ts`
- `apps/web/server/services/financeService.ts`
- `apps/web/server/services/financeDocumentExtractionService.ts`
- `apps/web/server/routers/finance.ts`
- `apps/web/client/src/components/finance/FinanceHub.tsx`
- `apps/web/client/src/pages/FinanceReports.tsx`
- new finance UI components for payment instruments and proof capture, such as:
  - `FinancePaymentInstrumentPanel.tsx`
  - `FinancePaymentInstrumentPicker.tsx`
  - `FinanceProofUploadCard.tsx`
- tests for schema, OCR, service logic, router wiring, and UI capture/reporting

## Risks and mitigations
- Ambiguous bank/account matching:
  - require user confirmation when multiple candidates exist
  - match by institution + last4 + owner scope before creating anything new
- Sensitive data exposure:
  - store only masked identifiers and hashes
  - redact logs and exported text
- Backfill complexity:
  - leave existing transactions null until a user edits or re-captures them
  - do not auto-create instruments from weak matches
- UI overload:
  - keep the capture UX unified
  - present bank/account/card as grouped selectors rather than separate workflows

## Acceptance criteria
- A user can upload either a receipt or a transfer slip from the finance UI.
- A user can add multiple accounts under the same bank.
- A user can add multiple credit cards under the same issuer.
- A user can add and use credit cards as payment instruments.
- A user can assign nicknames to every bank account and credit card, and the UI shows those nicknames first.
- OCR can extract enough slip metadata to suggest the correct account or card.
- Reports can summarize totals by bank, account, and card for monthly and yearly ranges.
- Private finance, accounts, and slips stay behind the existing vault protection.

## Rollout notes
Ship in phases:
1. schema + service plumbing
2. capture/OCR support
3. account management UI
4. report drill-downs and export updates

Backfill should be conservative:
- do not auto-create payment accounts unless OCR or user input makes the match high-confidence
- preserve existing transactions with null payment-instrument fields until they are edited or re-captured
- keep existing receipt transactions working exactly as before
- emit masked identifiers only in logs, audit events, and export previews

This reduces risk and makes it easier to validate each layer independently.
