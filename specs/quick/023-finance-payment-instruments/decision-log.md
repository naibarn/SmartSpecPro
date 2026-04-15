# Decision Log

## Planning depth
Chosen depth: `standard`

### Why this fits standard
- The request spans schema, OCR, UI, and reporting, but it stays within one existing domain and one existing codebase slice.
- Existing finance architecture already has the needed primitives: OCR ingestion, drafts, transactions, reporting, private-vault gating, and audit logs.
- The new work is cross-cutting, but it is still bounded enough to split into four section files without hiding major uncertainty.

### Why it did not promote to full deep-plan
- No new external provider integration is required.
- No live bank sync or reconciliation project is being added.
- The product intent is clear enough to proceed with assumptions on the upload UX and report scope.

## Key product decisions
1. Use a shared upload pipeline with explicit document intent.
   - Shortcuts: receipt and transfer slip.
   - One proof-upload surface with an intent toggle/selector, not two separate backend flows.
2. Model payment instruments separately from counterparties.
   - Counterparties remain people or organizations.
   - Banks, accounts, and cards become payment instruments.
3. Treat a bank institution and a bank account as separate records.
   - One bank can own many accounts.
   - One issuer can own many credit cards.
   - A credit card is its own instrument, not a bank account.
4. Keep reports range-based.
   - Extend the existing month/year/custom filter model.
   - Add account/card/bank drill-downs on top.
5. Keep sensitive identifiers masked by default.
   - Only last4/masked values are shown in UI.
   - Raw PAN/full account numbers stay out of logs and exports.
6. Make nickname the primary display label.
   - Bank accounts and credit cards each have a user-editable nickname.
   - Canonical names and aliases remain available for matching, but nickname is what users see first.

## Key risks
- OCR parsing of transfer slips may produce ambiguous bank/account matches.
- Sensitive identifiers could leak into logs or exports if masking rules are incomplete.
- The account model can become overcomplicated if we try to support every future banking edge case at once.
- Report UI can become crowded if account, card, and counterparty breakdowns are not grouped well.

## Mitigation strategy
- Require explicit confirmation whenever OCR finds multiple candidate accounts.
- Store only masked identifiers and hashes.
- Keep the first version focused on manual account creation plus OCR suggestions.
- Group reports into clear sections: counterparty, account, card, and bank.

## Promotion trigger
If implementation planning starts to require live bank sync, reconciliation rules, or institution-specific API integrations, promote the next pass to full deep-plan.
