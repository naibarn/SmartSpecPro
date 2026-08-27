# Feedback Hub Read Receipts — Approved Design

## Goal

When an admin opens a feedback ticket, its read receipt is persisted immediately. A `Read all` action marks every currently unread, visible ticket for that admin as read, including tenant-visible system tickets, without being limited by the current page or the 50-ticket client fetch.

## Architecture

- Keep `feedback_ticket_reads` as the per-user read-receipt source of truth.
- Add an admin-only `markAllRead` mutation that performs one tenant-scoped `INSERT ... SELECT` with conflict updates.
- Reuse the exact visibility predicate from the feedback list: the current tenant plus unscoped system tickets.
- Keep closed tickets out of the unread set; they do not need a new read receipt.
- The existing `markRead` mutation remains the single-ticket operation and is triggered as soon as selection changes, including deep-link selection.

## UI behavior

- Selecting a ticket invokes `markRead` before/alongside opening its detail and optimistically updates the selected row and unread count through query invalidation/refetch.
- The left unread panel gets a `Read all` button. It is disabled while the mutation is pending or when the unread count is zero.
- On success, refresh list and stats without changing the selected ticket. On failure, keep the existing unread state and show an error toast.

## Failure and security behavior

- The server derives tenant visibility from the authenticated admin context; the client cannot supply a broader scope.
- Bulk marking is idempotent and updates `readAt` for existing receipts.
- Any database error other than the known additive-schema compatibility error is rethrown.

## Verification

- Router tests cover tenant visibility, system-ticket visibility, idempotent bulk behavior, and closed-ticket exclusion.
- UI tests cover immediate selection behavior, disabled/loading state, and successful Read all refresh behavior.
- Run focused Feedback tests, Prettier, `git diff --check`, and a targeted typecheck; report the existing workspace-wide baseline separately.
