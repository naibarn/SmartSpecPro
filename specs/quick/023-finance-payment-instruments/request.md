# Finance Payment Instruments Addendum

## Task summary
Extend the private finance workspace so it can handle:
- receipt uploads and transfer-slip uploads in a clearer, more user-friendly way
- bank institutions with multiple accounts under the same bank
- multiple credit cards under the same issuer
- credit card payments as a first-class payment source
- nickname-based naming for each bank account and each credit card
- report drill-downs by account, bank, and card
- secure private handling of sensitive account data

## Why this is needed
The current finance feature already supports:
- receipt OCR
- draft creation and confirmation
- counterparties and aliases
- private vault gating
- report exports

What it does not yet model well is the payment instrument layer:
- a slip is not just a receipt
- a bank can have many accounts
- a credit card is not the same as a bank account
- monthly and yearly reports should be able to show where money came from or went to

## Proposed product direction
Use one shared finance OCR/capture pipeline, but let the user choose the document intent:
- receipt
- transfer slip
- statement

The UI should still feel simple:
- quick shortcuts for receipt and slip
- a shared upload flow underneath
- canonical account and bank suggestions when OCR finds a known instrument
- one proof-upload surface with an intent selector, not two separate backends

## Assumptions
- The finance workspace stays private and owner-scoped behind the existing private vault gate.
- Existing counterparty support remains in place and is not replaced by payment-instrument support.
- We do not build live bank sync or API-based transaction import in this change.
- We do not store full card PAN or full bank account numbers in plain text.
- The initial rollout can be manual-first with OCR suggestions and confirmation.

## Non-goals
- Bank API integrations
- Reconciliation against live bank balances
- Real-time statement sync
- Full PCI card storage or card payment processing
- Replacing the existing receipt flow

## Success criteria
- Users can upload a receipt or transfer slip from the finance UI.
- Users can register multiple accounts for the same bank.
- Users can register multiple credit cards for the same issuer.
- Users can register credit cards and use them as payment sources.
- Users can assign nicknames to each bank account and card, and see those nicknames first in the UI.
- Reports can break down totals by account, bank, and card for month/year ranges.
- Sensitive data remains masked/redacted and private-vault protected.
