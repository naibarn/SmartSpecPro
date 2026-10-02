# Section 10 — Sponsorship, Marketplace, and Thai Finance

**Dependencies:** Sections 04–05. **Owner:** conductor for financial authority and schema; never create a second ledger. **Status:** In progress (canonical contribution posting, verified-provider settlement, sponsor-purpose allocation reclassification, and public/dashboard financial transparency projections from settled contribution references and posted restricted-liability journal lines are implemented; spend reservations/metering, reimbursement, marketplace, reconciliation UI, Thai tax/WHT, period close and audit package remain open).

## Scope

Implement sponsor purpose restrictions, eligibility, reservation/allocation/metering/settlement, receipts and transparency projections, marketplace provider trust/quotes/bookings/disputes, canonical FinancialEvent/balanced journal projection, PromptPay and cash reconciliation, VAT/e-tax/WHT lifecycle, advances/expenses/assets, period close, retention and AuditPackage.

## Exit criteria

- Credits and money are conserved; no victim personal wallet receives restricted funds.
- Every financial effect references the established canonical billing/ledger authority and is reversible only through compensating events.
- Ambiguous provider settlement is quarantined for review; duplicate events do not double settle.
- Tax policy is effective-dated; segregation of duties and close exceptions are enforced.
- Thai financial controls are covered with deterministic fixtures and no live provider calls.

## Current implementation boundary

Sponsor allocation is an earmark only. It locks the support pool against concurrent settlement/allocation, calculates available restricted liability from posted canonical journal lines, and reclassifies that liability to an allocation account through a balanced journal entry. The allocation row references that entry; it does not create a balance, authorize a payout, or claim funds were spent. Refund reversal remains fail-closed without verified receipt authority.

Public support pages and the sponsor allocation dashboard show gross settled THB minor units, active earmarks, and the remaining restricted pool liability derived from posted canonical journal lines. No personal donor data is projected. The display labels earmarks as accounting projections and explicitly distinguishes them from cash disbursement or spending.
