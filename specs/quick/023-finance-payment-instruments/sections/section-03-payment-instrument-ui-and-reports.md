# Section 03 - Payment Instrument UI and Reports

## Ownership
- `apps/web/client/src/components/finance/FinanceHub.tsx`
- `apps/web/client/src/pages/FinanceReports.tsx`
- new payment-instrument management components under `apps/web/client/src/components/finance/`
- report export text assembly in the finance report page

## Goal
Give the user a practical UI to:
- add and pick banks, accounts, and cards
- attach a payment instrument during capture
- inspect totals by account, bank, and card
- export those summaries to PDF

## Scope
Add:
- a payment-instrument management panel or card inside `/finance`
- account/card selectors in capture and draft-edit flows
- report filters for bank/account/card
- report sections that summarize spending and income by instrument
- PDF export updates so the new dimensions are included
- recent-used quick pick UI so the user can reuse the same account/card without retyping
- canonical labels plus aliases so the same instrument does not appear as multiple "different" names
- nickname-first labels for both bank accounts and credit cards
- support for multiple credit cards under the same issuer

## TDD expectations
Add UI tests that fail first for:
- visible account/card management entry points
- receipt/slip chooser visibility
- account selector interaction in capture
- report filter interaction by bank/account/card
- export button still producing a report artifact with the new sections

## Acceptance checks
- The finance workspace makes it obvious how to choose a bank account or credit card.
- Reports can answer “how much did I pay from this account?” and “how much did I receive into this account?”
- The new UI remains usable on narrow and wide layouts.
- The same bank can show multiple selectable accounts without confusing the user.
- The same issuer can show multiple selectable credit cards without confusing the user.
- The report page still reads like one report, not three separate mini-apps.
- The same account can be selected by canonical label, alias, or recent-used shortcut.
- Every account/card is shown by nickname first, with masked identifier as secondary context.

## Known risks
- Too many selectors can make the capture form feel cluttered.
- Reusing counterparty patterns too literally can make instrument selection confusing.
- The report page may need layout grouping to avoid visual overload.
