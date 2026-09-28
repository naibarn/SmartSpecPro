# Feedback Auto-Report Affected User Email

## Goal

Make system-generated feedback tickets actionable by showing the email address
for each affected user in the admin feedback detail view and in the admin
notification created for the ticket.

## Design

- Keep `contextJson.affectedUserIds` as the canonical correlation data.
- Resolve those IDs against `users` at the server boundary when returning an
  admin ticket and when composing the admin notification.
- Return `affectedUsers` only from the admin `feedback.getTicket` procedure;
  no public/user feedback endpoint is expanded.
- Include a human-readable affected-user line in newly-created auto-report
  descriptions and notification content. Keep email out of the title so the
  existing fingerprint/dedup title remains stable.
- Preserve a fallback of `user #<id>` when an account is missing or has no
  email. Keep the existing maximum of five affected IDs.

## Data flow and failure handling

`reportSystemFailure` creates or updates the ticket as before. The new ticket
description may include the current email snapshot, while the admin detail and
notification resolve current email values from `users`. If the lookup fails,
auto-reporting remains best-effort and the ticket still exposes the IDs.

## Security and tenant boundary

Only the existing admin `getTicket` response receives resolved email values.
For tenant-scoped tickets, user lookup is constrained to the ticket tenant.
No schema or migration is required.

## Verification

- Unit-test affected-user extraction/formatting and notification composition.
- Test the admin ticket response includes resolved users while preserving the
  existing tenant visibility behavior.
- Run the focused server feedback tests and the touched-file TypeScript check.
- Browser/provider/deployment checks remain outside local proof unless tooling
  and authenticated runtime access are available.
