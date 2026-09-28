# Research Notes

## Current implementation

- `AdminFeedbackHub.tsx` uses 40px image thumbnails and already has an image Dialog lightbox with arrows/Escape support.
- `AuthenticatedAttachmentImage.tsx` wraps `AuthenticatedMediaImage`, preserving protected storage access.
- `feedbackTicketAttachments` currently belongs only to `ticketId`; `feedbackTicketComments` has no attachment relation.
- `feedback.addComment` accepts `ticketId`, `content`, and `isInternal`; it updates `respondedAt` and `updatedAt`.
- `/api/feedback/upload` accepts up to 5 files and 5MB/file and stores rows in the ticket attachment table.
- `myTicketDetail` currently returns all ticket attachments, so internal reply attachments require an explicit server-side filter.
- `feedbackTickets` already has `status`, `closedAt`, and `updatedAt`; `updateStatus` is currently admin-only.
- Existing recurring job patterns are in `apps/web/server/jobs` and initialized from `apps/web/server/_core/index.ts`.

## Existing pattern decision

Reuse `AuthenticatedAttachmentImage` and the existing Feedback Hub lightbox.
Reuse current upload route/storage authorization and existing shadcn primitives.
Do not introduce a second public media path or a separate preview framework.

## Risks

- Two-phase upload/link can leave staged rows if linking fails; server validates ownership and client performs best-effort cleanup.
- `commentId` migration must preserve all existing rows as ticket-level attachments.
- User response must exclude internal-note attachments.
- Multi-admin read receipts require unique upsert and tenant-scoped list joins.
- Auto-close must be idempotent across multiple web instances.
- Full browser proof may be unavailable if no running authenticated dev server is present.
