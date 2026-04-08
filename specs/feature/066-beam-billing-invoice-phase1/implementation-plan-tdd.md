# TDD Plan

## Test-first slices

1. Invoice stream and tax policy resolution
- Failing tests:
  - classifies domestic vs international from billing-profile snapshot rules
  - resolves the correct effective tax policy by stream and issue date
  - calculates totals from base price without reverse-VAT math

2. Recurring invoice uniqueness and numbering
- Failing tests:
  - scheduler rerun returns the same invoice for the same subscription billing cycle
  - numbering sequences are independent for domestic and international streams
  - replace/reissue does not corrupt the original invoice relation chain

3. Payment attempt and Beam adapter behavior
- Failing tests:
  - active attempt is reused instead of duplicated
  - ambiguous provider timeout marks reconciliation-required instead of blind retry
  - webhook replay is idempotent
  - invalid webhook signature or stale timestamp is rejected
  - amount mismatch moves payment to manual review instead of paid

4. Business-effect idempotency
- Failing tests:
  - top-up credits grant once per invoice
  - renewal extends subscription once per invoice
  - overdue downgrade runs once
  - downgrade reversal runs once

5. Document and notification guardrails
- Failing tests:
  - language variant generation keeps one invoice number
  - sync-header increments header/document version and preserves history
  - duplicate webhook or reconciliation event does not resend email
  - replaced invoice cannot be reopened as payable if settlement already exists

6. Access control and sensitive-data protection
- Failing tests:
  - user cannot access another user's invoice or PDF
  - support admin cannot manual mark paid
  - finance admin can manual mark paid only with reason and evidence
  - raw payload and evidence access is audited
  - signed PDF/evidence access expires correctly

## Regression coverage

- paid invoice cannot be silently overwritten by sync-header
- overdue downgrade performs final reconciliation before plan downgrade
- paid-but-unapplied recovery applies missing effects without duplication
- manual mark-paid is audited and protected by explicit reason input
- stale paid event for replaced invoice does not reapply business effects
- raw webhook body verification uses the original payload bytes

## Test environment notes

- Beam provider calls should be mocked at the adapter boundary.
- Scheduler jobs should run against seeded invoice/payment fixtures with deterministic clock control.
- PDF rendering tests can validate metadata and persistence references without snapshotting binary content.
