# Feedback notification deep-link repair

## Problem

Auto-filed feedback notifications are deduplicated by `groupKey`. On a deduplication hit, the notification currently refreshes its content and metadata but keeps the original action target. The notification can therefore display the latest ticket number while opening an older ticket or a ticket that is no longer available to the current admin.

The Admin Feedback Hub also renders the same empty placeholder for loading, not-found, and query-error states, which makes a failed deep link look like an empty page.

Live local database evidence for the reported case showed Ticket `#262` exists as a `system` ticket with `tenantId = NULL`, while the browser request is tenant-scoped. The auto-report path from media jobs can omit tenant context, so the ticket is real but filtered out by the tenant-safe detail query.

## Approved design

1. When a grouped notification is updated, refresh the latest notification-facing fields from the incoming event: title, priority, resource type/id, action URL, and action label. This preserves deduplication while keeping the action target aligned with the content.
2. Keep the existing `/admin/feedback-hub?ticketId=<id>` deep-link contract and admin authorization boundary.
3. For already-persisted stale deduplicated feedback notifications, apply a narrow client compatibility fallback: when the structured feedback action URL points to a different ticket than the latest `Ticket #<id>` in the notification content, open the latest ticket. This fallback is limited to the feedback resource type and remains behind the structured action flow.
4. In Admin Feedback Hub, distinguish loading and query failure from the no-selection state and provide a retry action for failed ticket detail queries.
5. Add focused regression coverage for the dedup update payload, stale-notification fallback, and existing notification behavior. Do not change notification volume, database schema, or unrelated filters.

## Follow-up correction from runtime evidence

Auto-report resolves a missing tenant from the affected user's `currentTenantId` and scopes fingerprint deduplication to that tenant. Legacy unscoped system diagnostics remain readable by admins as a narrowly defined compatibility case, while tenant-scoped tickets and human feedback continue to require an exact tenant match. New feedback notifications are restricted to admins in the ticket tenant when a tenant is known.

## Alternatives

- Remove deduplication: simpler target semantics, but creates noisy repeated admin alerts.
- Derive the ticket ID in the client for every notification: brittle and couples UI parsing to generated prose. The approved fallback is deliberately limited to pre-existing feedback notifications whose structured target conflicts with the displayed ticket number.
- The approved approach keeps the existing notification model and makes the structured action fields authoritative for all newly updated notifications.

## Failure handling and security

The server continues to sanitize action URLs and the admin route continues to enforce `RequireAdmin`. A missing or unauthorized ticket will now show the query error in the detail pane with a retry option rather than implying that no ticket was selected.

## Verification

- Run notification dedup and feedback processor focused Vitest suites.
- Run the Admin Feedback Hub/notification component tests if available.
- Run `git diff --check` and changed-file TypeScript diagnostics or the workspace check, reporting unrelated baseline failures separately.
