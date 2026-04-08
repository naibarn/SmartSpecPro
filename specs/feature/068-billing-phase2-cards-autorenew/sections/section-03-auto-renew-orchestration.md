# Section 03 — Auto-Renew Orchestration

## Goal

Build automatic subscription renewal charging on top of the Phase 1 invoice/payment domain.

## Deliverables

- `renewal_attempts` state machine
- invoice issuance for auto-renew cycles
- off-session payment attempt creation
- exact mapping between renewal attempts, invoices, and payments
- exactly-once application of subscription/credit effects
- linkage rules to `payment_attempts`, `reconciliation_runs`, and `notification_dispatches`
- crash-recovery rules for ambiguous provider outcomes

## Notes

- reuse Phase 1 payment processing and reconciliation where possible
- never create duplicate active attempts for the same cycle
- do not derive renewal UI state ad hoc from payments alone; use renewal-attempt state
