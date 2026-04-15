# TDD Guidance

## First failing tests to write

### Schema and model tests
- assert the new institution/account tables exist
- assert one institution can own multiple accounts
- assert one issuer can own multiple credit cards
- assert credit card accounts can be created under an issuer
- assert account aliases resolve to the same underlying canonical account
- assert nicknames are stored and surfaced as the primary label for accounts and cards
- assert sensitive identifiers are masked or hashed rather than stored raw

### OCR and capture tests
- assert receipt capture still works unchanged
- assert transfer-slip capture uses the same pipeline but records a different intent/role
- assert OCR extraction can capture bank/account hints and card last4
- assert ambiguous matches require review instead of auto-linking the wrong account

### Finance service tests
- assert a transaction can be linked to a payment source account
- assert an income can be linked to a destination account
- assert a credit-card charge shows up in the correct account breakdown
- assert multi-account matching stays owner/project scoped

### UI tests
- assert the finance workspace shows separate receipt/slip entry points or a unified proof picker
- assert account/card selectors appear where needed
- assert canonical account labels and aliases collapse into one obvious choice
- assert multiple credit cards under the same issuer can be distinguished by nickname
- assert report filters can scope by account or bank
- assert PDF export includes the new payment-instrument summaries

### Security tests
- assert private-vault gating applies to the new management/report surfaces
- assert logs and exported artifacts do not include full account numbers or full PAN
- assert OCR rate limiting still protects the slip path
- assert direct navigation to `/finance` and `/finance/reports` is blocked while locked

## Expected initial failures
- missing schema types / migration columns
- missing payment-instrument selectors in the UI
- missing extraction fields from slip OCR
- report breakdowns not yet accounting for account/card dimensions

## Mocking / fixture notes
- reuse the existing finance service harness style for Drizzle and OCR tests
- add fixtures for:
  - bank account with last4
  - credit card with issuer bank
  - transfer slip metadata
  - receipt metadata
- keep OCR provider mocks deterministic and focused on the new extracted fields

## Regression checkpoints
- existing receipt upload still works
- counterparty suggestions still work
- private-vault unlock flow still works
- report export still downloads a valid PDF artifact
- existing finance transaction totals remain unchanged when no account/card is set
