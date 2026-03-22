---
name: Feedback Attachment Feature Review
description: Review of FeedbackButton.tsx upload flow and AdminFeedbackHub.tsx attachment display (2026-03-18)
type: project
---

Reviewed the feedback attachment frontend implementation across 4 files: FeedbackButton.tsx, AdminFeedbackHub.tsx, MyFeedback.tsx, and feedback.ts router.

**Why:** User requested completeness, UX, a11y, and edge-case review of the 2-step ticket+upload flow.

**How to apply:** Future reviews of this feature should check the items below are addressed before marking APPROVE.

### Key confirmed facts
- 2-step flow: tRPC `submit` creates ticket first, then `fetch /api/feedback/upload` in `onSuccess` callback.
- `resetForm()` (which calls `setOpen(false)`) is called AFTER both steps complete — dialog does not close mid-upload.
- `getAttachments` is a separate tRPC query from `getTicket`. Both are gated on `!!selectedTicketId` but are INDEPENDENT queries. When `selectedTicketId` changes, both refetch automatically (TanStack Query key change).
- `getAttachments` has correct tenant-aware authorization: users see only their own ticket attachments; admins see all.
- Server-side: multer validates MIME AND extension (OR logic — either allowed passes). Client validates extension only.
- `storagePut` stores `relKey` (relative key) in DB; `storageResolveUrl` resolves to signed/public URL at query time.
- `myTicketDetail` does NOT return attachments — `getAttachments` must be called separately. MyFeedback.tsx never calls `getAttachments`.
- No delete-attachment endpoint exists anywhere in the router.
- 0-byte file: passes client validation (no `file.size > 0` guard), passes server `FEEDBACK_MAX_FILE_SIZE` check. Would be stored as a 0-byte file.
- Drag-drop zone: click/drop only. No keyboard handler (onKeyDown/onKeyPress). Not keyboard accessible.
- File remove button: plain `<button>` with no aria-label. Screen reader announces nothing descriptive.
- Image thumbnails in AdminFeedbackHub: `alt={att.fileName}` — correct.
- Long filenames: `truncate flex-1 min-w-0` applied — visually handled.
- Special characters in filenames: multer tempfile uses `file.originalname` directly in temp path. Storage key uses `${Date.now()}-${file.originalname}` — unencoded special chars in key. `storageResolveUrl` handles this if storage layer URL-encodes keys; risk is storage-layer-dependent.
- Upload failure after ticket created: toast shown, ticket exists without attachments, no retry UI. User must re-open dialog and resubmit entire form.
- `isSubmitting` guard on `onOpenChange` prevents accidental close during upload.
- `attachmentsQuery` stale data: switching tickets triggers new query (key changes), but old attachment data briefly shows while loading (no loading state shown).

### Open issues requiring fix
- HIGH: MyFeedback.tsx never fetches attachments — users cannot see their own uploaded files.
- HIGH: Upload failure after successful ticket creation: user has no retry path; the created ticket is orphaned without its attachments and the user must submit duplicate feedback.
- MEDIUM: 0-byte file not rejected client-side or server-side — stored as empty file.
- MEDIUM: Drag-drop zone not keyboard accessible (no role="button", no onKeyDown).
- MEDIUM: File remove button has no aria-label — inaccessible to screen readers.
- MEDIUM: `attachmentsQuery` shows no loading state when switching tickets — stale data visible briefly.
- LOW: Filenames with special characters/spaces in storage key may cause URL issues (storage-layer-dependent).
- LOW: No attachment count indicator in ticket list row (admin cannot see at a glance which tickets have files).
- LOW: fileFilter uses OR logic (ext OR mime) — a file with allowed ext but spoofed forbidden MIME passes. Should be AND.
- LOW: No delete-attachment capability for either user or admin.
