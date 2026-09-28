# Section 02 — Admin Feedback Hub UI

## Ownership

Own `AdminFeedbackHub.tsx` and its focused tests. Consume the stable router
contracts from Section 01; do not change schema/job files.

## Requirements

- Show unread summary/filter/badges and sort unread first, overdue first.
- Mark read when detail opens and show generic overdue modal at two hours,
  repeating every 30 minutes while overdue unread exists.
- Render ticket previews at roughly 120px, reply multi-image previews and
  authenticated lightbox navigation.
- Close with confirmation; disable reply/upload on closed tickets.

## UI/UX Contract

### Target User / JTBD

- Role: admin support operator.
- Goal: clear the unread queue and answer with visual evidence.
- Entry point: `/admin/feedback-hub`.
- Success: unread work is first, images are legible, and close is explicit.

### Existing Pattern Reference

- Found: `AuthenticatedAttachmentImage` and existing Admin Feedback Hub Dialog.
- Decision: reuse protected media/lightbox patterns.

### State / responsive / accessibility

- Cover loading, empty, unread, overdue alert, selected files, upload error,
  closed, focus, hover, keyboard, and lightbox states.
- Verify mobile 390x844, tablet 768x1024, desktop 1440x900, plus laptop 1024x768.
- Label icon-only image/remove/navigation controls; Escape closes dialogs;
  status is not color-only.

### Browser Evidence Required

Follow `orchestra` UI browser evidence format and record skipped automation
explicitly if an authenticated browser session is unavailable.
