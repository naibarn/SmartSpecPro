# Section 02 - Capture and OCR Intent Routing

## Ownership
- `apps/web/server/services/financeDocumentExtractionService.ts`
- `apps/web/server/services/financeService.ts`
- `apps/web/server/routers/finance.ts`
- `apps/web/client/src/components/finance/FinanceHub.tsx`
- new capture helper UI components if needed

## Goal
Let the user capture:
- receipts
- transfer slips
- statements

through a shared finance upload flow while preserving a clear intent for OCR and extraction.

## Scope
Implement:
- a unified proof-upload entrypoint
- explicit intent hints for receipt vs slip vs statement
- OCR extraction of bank/account/card hints from slips
- deterministic matching against existing payment instruments by canonical name, alias, or nickname
- confirmation flow when OCR is uncertain
- a single capture flow with receipt/slip quick actions instead of separate backend paths

## TDD expectations
Add tests that fail before the feature exists for:
- receipt capture unchanged
- slip capture routed as a different intent
- OCR extraction returning bank/account hints
- ambiguous account matches requiring confirmation
- slip uploads staying within the existing abuse/rate-limit guardrails
- the UI opening on the intended proof type without splitting the rest of the workflow

## Acceptance checks
- Users can choose receipt or slip without learning a new backend path.
- OCR can identify the likely bank/account/card from a slip.
- The system does not silently pick a wrong account when multiple matches exist.
- Existing receipt uploads still look and behave the same unless the user explicitly switches intent.
- When a known account/card exists, its nickname should be the first suggestion label shown to the user.

## Known risks
- Bank/slip OCR is inherently noisy.
- Different banks may format slips differently.
- Auto-matching by OCR alone can produce false positives if not gated.
