# TDD Plan — Feature 066: Beam Billing & Invoice Phase 1

## 1. What We Are Building

- Test that the new billing subsystem can coexist with existing credits/packages behavior.

## 2. Architecture Overview

- Test that authenticated billing APIs use protected control-plane routes.
- Test that Beam webhook ingress depends on raw-body verification.

## 3. Schema and Authorization Foundation

- Test recurring-invoice uniqueness constraints.
- Test unique active payment-attempt constraints.
- Test user ownership and denied privileged billing actions.
- Test billing action authorization mapping for Phase 1 `admin` vs ordinary users.
- Test migrated/backfilled subscriptions are excluded from automation until cutover flag is enabled.

## 4. Invoice Domain

- Test stream classification, tax policy selection, and numbering reservation.
- Test replace/reissue relation handling and rejection of invalid state transitions.
- Test paid invoices cannot be reopened.
- Test number reservation and invoice issue flow recover cleanly from crash between issue and charge creation.

## 5. Beam Adapter and Payment Attempts

- Test active attempt reuse.
- Test invalid webhook signature rejection.
- Test stale timestamp rejection.
- Test replay dedupe.
- Test amount/currency mismatch routes to review instead of paid.
- Test partial, overpaid, and underpaid settlement cases do not auto-apply business effects.
- Test stale paid event for replaced/canceled attempt is stored but does not reactivate invoice.
- Test secret rotation accepts current and previous webhook secrets during rotation window only.

## 6. Documents and Secure Access

- Test multilingual document variants stay under one invoice number.
- Test sync-header increments versions and stores diffs.
- Test PDF/evidence access ownership, expiry, and audit logging.
- Test raw payload and evidence list views redact sensitive fields.
- Test retention cleanup respects configured retention windows.

## 7. Top-up, Renewal, and Business Effects

- Test top-up credits apply once.
- Test renewal applies once.
- Test stale paid events for replaced invoices do not reapply effects.

## 8. Reconciliation and Recovery

- Test renewal scheduler rerun safety.
- Test final reconciliation before overdue downgrade.
- Test downgrade reversal exactly once.
- Test manual recovery actions require authorization and reason capture.
- Test `manual_mark_paid` cannot submit when amount-match status is unresolved unless elevated override policy is explicitly satisfied.
- Test `replace_invoice` invalidates active attempts on superseded invoice before replacement becomes active.

## 9. User and Admin Surfaces

- Test user cannot access another user's invoices/documents.
- Test admin settings mutations are permission-gated.

## 10. Rollout

- Test feature flags disable Beam billing entrypoints cleanly.
- Test duplicate webhook/reconciliation events do not duplicate notifications.
- Test migration/cutover gate prevents renewal job from running on un-backfilled legacy subscriptions.
