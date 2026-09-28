# PromptPay Direct slip reminder suppression

## Goal

Once a user submits a PromptPay Direct transfer slip, the invoice remains
pending until an admin approves it, but the user must no longer receive
"invoice due" reminders for that invoice.

## Design

- Keep the authoritative payment state as `manual_review_required`; approval is
  still the only path that applies credits and marks the payment paid.
- Suppress `invoice_due_reminder` at the billing notification service when the
  invoice's PromptPay Direct payment is `manual_review_required`. This protects
  scheduled jobs and other server-side callers.
- During the slip-upload transaction, mark existing unread due-reminder
  notifications for the same invoice as read, dismissed, and expired. The
  update is scoped by user, invoice resource, and the due-reminder group key.
- Invalidate the user's urgent-reminder and notification-count queries after a
  successful upload so an already-open billing page reflects the change without
  waiting for the global polling interval.

## Failure and safety boundaries

- No credit is granted and no invoice is marked paid by slip upload.
- Other notification types, invoices, and payment channels are unaffected.
- The server-side suppression remains effective even if a due-reminder job runs
  immediately after upload.

## Verification

- Billing notification tests cover suppression after a submitted PromptPay
  Direct slip.
- Existing billing job and BillingCenter tests pass when the UI test is run with
  its required jsdom environment.
