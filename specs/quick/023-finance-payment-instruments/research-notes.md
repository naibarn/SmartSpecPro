# Research Notes

## Codebase scan

### Current finance model
- The finance feature already has canonical counterparties, aliases, drafts, confirmed transactions, recurring rules, document extractions, and transaction-document links.
- `finance_transactions` currently stores `counterpartyId`, `counterpartyName`, and `merchantName`, but there is no payment-instrument model for bank accounts or credit cards.
- `finance_transaction_documents` currently supports `receipt`, `invoice`, `statement`, and `supporting`, which is close but does not explicitly represent transfer slips.

### Current capture flow
- `FinanceHub` already supports:
  - quick draft text capture
  - OCR upload for receipts
  - voice capture
  - draft editing and confirmation
- The upload accept list currently includes PDF and common image formats, and the OCR path goes through `ingestFinanceDocument`.
- `financeDocumentExtractionService` already enforces MIME allowlists, file-size and page-count caps, abuse limits, and audit logging.

### Current reporting flow
- `FinanceReports` already supports:
  - date-range filtering
  - counterparty filtering
  - category breakdown
  - evidence trail
  - PDF export
- This means report work can extend the existing range-based model rather than starting a new reporting stack.

### Current privacy/security pattern
- Private finance pages already go through `FinanceAccessGate`.
- Server-side finance routes re-check private-vault unlock tokens.
- Existing finance data is already tenant/project/owner scoped.

## Gaps identified

1. No database model exists for:
   - bank institutions
   - bank accounts
   - credit cards
   - account aliases or canonical account naming
2. No transaction fields exist for:
   - payment source account
   - payment destination account
   - payment instrument kind
3. No UI exists for:
   - managing multiple accounts per bank
   - managing credit cards as payment sources
   - selecting a payment account at capture time
4. OCR currently focuses on receipt-style finance drafts and does not model transfer-slip semantics explicitly.
5. Reports do not break down totals by bank account or credit card yet.

## Dependency / config scan
- The project already uses Drizzle schema migrations and service-layer finance helpers, so this extension should follow the same pattern.
- Existing finance tests cover service logic, OCR ingestion, router wiring, report export, and UI capture flows.
- No existing bank-account subsystem was found in finance; this needs a new model rather than a small tweak to counterparty data.

## Security scan
- Sensitive account and card identifiers need masked storage and log redaction.
- The new capture flow should stay behind the existing private-vault gate.
- OCR slip parsing should keep the current rate-limit and abuse-guard behavior.
- Any account lookup or auto-match must stay owner/project scoped and fail closed when ambiguous.

## Research conclusion
This is a medium-sized finance extension, not a full platform rewrite. The current codebase has good extension points, but the payment-instrument layer needs new schema, OCR extraction fields, UI management, and report aggregation.
