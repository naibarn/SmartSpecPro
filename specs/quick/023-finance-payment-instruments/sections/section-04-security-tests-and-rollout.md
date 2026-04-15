# Section 04 - Security, Tests, and Rollout

## Ownership
- `apps/web/client/src/components/finance/FinanceAccessGate.tsx`
- finance-related audit logging and redaction helpers
- finance service/router tests
- new security regression tests around private finance instruments

## Goal
Keep the payment-instrument extension safe:
- private-vault protected
- owner/project scoped
- masked/redacted
- rate limited
- test-covered

## Scope
Verify and enforce:
- all new finance pages and dialogs are behind the existing private vault gate
- OCR logs do not include full account numbers or PAN
- OCR requests still respect burst and daily budgets
- ambiguous matches are rejected or surfaced for user confirmation
- report exports omit sensitive raw identifiers
- account/instrument pages remain PIN-gated even when opened directly by URL

## TDD expectations
Add regression tests for:
- PIN-gated access to account management and report pages
- no full account number / PAN in logs or exported text
- slip upload throttling and abuse guard behavior
- unchanged receipt and counterparty flows
- masked identifiers on audit/log/export boundaries
- direct-navigation access to `/finance` and `/finance/reports` when vault is locked

## Acceptance checks
- A locked private vault blocks access to the new instrument screens.
- Sensitive identifiers are masked everywhere except where the user explicitly needs to see the masked form.
- Existing finance behavior still passes unchanged.

## Rollout notes
Prefer a phased rollout:
1. schema and service plumbing
2. capture/OCR routing
3. UI surfaces
4. report enhancements
5. cleanup/backfill and documentation

Masking policy:
- store and surface only masked identifiers, hashes, or the last 4 digits where required for user recognition
- never emit raw account numbers, card PAN, CVV, or full slip reference data into general logs
- allow the user to see masked values in trusted UI only after the vault is unlocked

## Known risks
- Security regressions from exposing account data in the wrong UI surface.
- Log redaction gaps.
- Migration ordering issues across finance tables.
