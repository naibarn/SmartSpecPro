# Urgent Feedback Alert — Design Specification

## Status

Approved for specification review by the user on 2026-08-21. Implementation has
not started.

## Objective

Allow a user to submit feedback with the existing normal priority by default,
or explicitly mark it as urgent. An urgent submission must be stored as a
critical feedback ticket and notify eligible admins through the existing
center-screen alert, with a direct action to the ticket in Admin Feedback Hub.

## Existing contracts

- `feedback_tickets.priority` already uses the existing reminder priority enum
  and defaults to `normal`.
- `feedbackRouter.submit` creates the ticket, then starts
  `processTicket()` asynchronously.
- `processTicket()` classifies the ticket, resolves same-tenant admins, and
  creates one `alert` notification per eligible admin.
- `user_notifications` already stores priority, structured resource identity,
  action URL, and metadata. High/critical unread notifications are returned by
  `scheduledMessages.getUrgentReminders`.
- `GlobalUrgentReminders` already renders the center-screen dialog and can open
  a structured `actionUrl`.
- Admin Feedback Hub already supports
  `/admin/feedback-hub?ticketId=<id>` deep links.

No new table or migration is expected. The implementation must still verify
that the deployed database has the existing `priority` column and enum before
calling the feature live.

## Recommended approach

Reuse the current feedback and notification pipeline, with a fast path for
urgent submissions:

1. Add an optional submit input `priority` constrained to `normal | critical`.
   Omitted input remains `normal`, preserving old clients and existing callers.
2. Add an opt-in switch to `FeedbackButton`. The UI maps off to `normal` and
   on to `critical`.
3. When the switch is on, require an explicit confirmation dialog before the
   mutation is called. Cancel leaves the form and its attachments unchanged.
4. Insert the ticket with the selected priority. For a normal ticket, retain
   the current non-blocking `processTicket()` behavior. For a critical ticket,
   await processing before returning the mutation result so the notification
   is attempted immediately after persistence. Processing/notification errors
   are caught and logged without turning a successfully inserted ticket into a
   failed submission.
5. Preserve `processTicket()` as the single admin-notification owner. Its
   existing priority resolver must continue to keep an explicitly critical
   ticket critical, even if keyword classification produces another priority.
6. Keep recipient and tenant rules unchanged: notify `admin` and
   `domain_admin` users in the ticket's tenant, and preserve the current rule
   that the submitting admin is not notified about their own ticket. If a
   legacy unscoped ticket has no tenant, retain the existing all-admin fallback.
7. Keep the structured action URL generated server-side as
   `/admin/feedback-hub?ticketId=<id>`, with `relatedResourceType: feedback` and
   `relatedResourceId` set to the ticket ID.
8. Make the existing SSE notification handler invalidate urgent reminders as
   well as the notification count/history. Keep the existing 10-second urgent
   query polling as a fallback when SSE is unavailable.
9. Add a visible urgent/critical badge in the Admin Feedback Hub ticket list
   and selected-ticket detail so urgency remains clear after navigation.

This keeps the current notification semantics and tenant boundary while making
the urgent path fast enough for the requested workflow. A separate outbox or
fan-out worker is deferred until admin fan-out volume requires it.

## User flow

### Normal feedback

1. User opens Send Feedback; urgent switch is off.
2. User submits the form.
3. Ticket is stored with `priority = normal`.
4. Existing background classification and admin notification continue.

### Urgent feedback

1. User turns on the urgent switch.
2. The form explains that every eligible admin will receive an immediate
   critical alert.
3. User clicks submit and confirms.
4. Ticket is stored with `priority = critical`.
5. The server processes and notifies eligible admins before resolving the
   mutation, while swallowing notification delivery failures after persistence.
6. An admin with the app open receives the notification over the authenticated
   notification stream. The urgent query is invalidated and the center-screen
   dialog opens.
7. Clicking the dialog action marks the notification read and opens the exact
   ticket in Admin Feedback Hub.
8. Dismissing the dialog marks the notification read but leaves the ticket in
   the notification history and feedback hub.

## UI behavior

- Default switch state is off on every newly opened form.
- The switch is keyboard accessible, has a visible label, and exposes its
  current state to assistive technology.
- Confirmation is shown only for urgent submissions, not for normal feedback.
- While submit or urgent processing is pending, the submit action is disabled
  to prevent duplicate tickets.
- Existing upload-retry behavior remains intact. If the ticket is created but
  attachment upload fails, retry/skip continues to operate against that same
  ticket ID and does not create a second ticket.
- The alert action uses the existing safe navigation path and never places
  credentials or private attachment URLs in notification text.

## Data and notification contract

### Feedback submit input

```ts
{
  ticketType: "bug" | "feature_request" | "observation" | "question",
  title: string,
  description?: string,
  stepsToReproduce?: string,
  expectedBehavior?: string,
  actualBehavior?: string,
  contextJson?: Record<string, unknown>,
  priority?: "normal" | "critical"
}
```

The server is authoritative. It must not accept arbitrary reminder priorities
from the client for this user-facing control.

### Urgent admin notification

- `type`: `alert`
- `priority`: `critical`
- `relatedResourceType`: `feedback`
- `relatedResourceId`: ticket ID as a string
- `actionUrl`: `/admin/feedback-hub?ticketId=<id>`
- `actionLabel`: `View Feedback`
- `metadata.source`: existing `guardian.feedbackProcessor`
- `metadata.eventId`: ticket ID

The existing notification service publishes the authenticated user-scoped SSE
event. No new notification endpoint or client-side admin broadcast is needed.

## Failure modes and safety

- Database insert failure: return the existing mutation error; no notification
  is attempted.
- Urgent classification or notification failure after insert: log with ticket
  ID and return success for the persisted ticket. The ticket remains reachable
  through My Feedback/Admin Feedback Hub and can be manually reviewed.
- SSE unavailable: retain polling fallback and notification-bell history.
- Duplicate system-ticket behavior: unchanged. Human feedback continues to
  notify as a fresh event even if a duplicate is classified.
- Tenant mismatch: existing server tenant predicates remain authoritative for
  admin selection and ticket access. Client-provided tenant IDs are ignored;
  unscoped legacy tickets retain their existing compatibility behavior.
- Unsafe navigation: retain existing action URL sanitization and structured
  deep-link handling.

## Alternatives considered

### Reuse the current background path for all priorities

Smallest patch, but urgent delivery would be delayed by background processing
and the existing polling cadence. Rejected for the requested immediate alert.

### Add a dedicated urgent-feedback outbox and worker

Best long-term delivery guarantees and scalable fan-out, but adds schema,
worker, retry, monitoring, and deployment surface. Deferred until current
per-admin fan-out is demonstrably insufficient.

## Testing and verification

Focused tests should cover:

1. Router submission defaults to `normal` when priority is omitted.
2. Router submission persists `critical` for urgent input.
3. Invalid priorities are rejected by the server schema.
4. Critical ticket priority is not downgraded by keyword classification.
5. Urgent processing notifies eligible same-tenant admins with critical
   priority and the exact ticket action URL.
6. Notification failure does not remove or fail an already-created ticket.
7. FeedbackButton keeps normal submission direct, requires confirmation for
   urgent submission, and preserves form state when confirmation is cancelled.
8. GlobalAlerts opens the critical feedback dialog, invalidates from SSE, marks
   the notification read, and navigates to the ticket deep link.
9. Admin Feedback Hub renders the urgent badge and honors the ticket deep link.

Expected focused commands after implementation:

```bash
cd apps/web
pnpm test \
  server/routers/__tests__/feedback.tenantScope.test.ts \
  server/services/virtualAdmin/__tests__/feedbackProcessor.test.ts \
  client/src/components/guardian/__tests__/FeedbackButton.test.tsx \
  client/src/components/__tests__/GlobalAlerts.notificationBell.test.tsx \
  --environment jsdom --run
pnpm exec tsc --noEmit --pretty false
git diff --check
```

The focused TypeScript check may need to be limited to the repository's
existing changed-file/typecheck workflow if the full baseline remains noisy.
Browser-authenticated verification, live SSE delivery, real admin fan-out,
database migration/deployment checks, and production smoke tests are not
covered by unit tests and must be reported separately if not run.

## Acceptance criteria

- Normal feedback remains the default and does not show a confirmation dialog.
- Urgent feedback cannot be sent without confirmation.
- An urgent ticket is persisted as critical and is visibly marked in the admin
  hub.
- Eligible admins receive a center-screen critical alert through the existing
  notification system.
- The alert opens the exact feedback ticket in one click.
- A notification delivery failure does not lose a persisted feedback ticket.
- Existing tenant isolation, attachment retry, normal feedback, and system
  feedback behavior remain intact.
