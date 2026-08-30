# Admin Feedback Hub image zoom and alert navigation

## Goal

Make feedback screenshots readable in the existing authenticated lightbox and
make feedback notifications actionable: clicking an in-app alert should open
the referenced ticket in the current tab with that ticket selected.

## Evidence and current contract

- `AdminFeedbackHub.tsx` already reads `?ticketId=...`, fetches the ticket
  detail, and prepends a selected ticket that is outside the active source
  filter. This contract should remain the source of truth for selection.
- `GlobalAlerts.tsx` currently routes both urgent reminder actions and
  notification-bell actions through `window.open(..., "_blank", ...)`. The
  existing tests assert this behavior. This adds a second browsing context and
  makes the user responsible for finding/confirming the selected ticket.
- The existing lightbox uses `AuthenticatedAttachmentImage` and
  `object-contain`, so protected-media authorization must not change. It has
  no zoom state or controls.
- No database, notification schema, or authorization change is required.

## Approved approach

### 1. Internal notification navigation

Add one safe action-navigation boundary in `GlobalAlerts`:

- In-app paths beginning with exactly one `/` (not `//`) navigate with wouter
  `setLocation`.
- Other URLs that pass the existing safety check keep the authenticated-safe
  new-tab behavior.
- Unsafe protocols remain blocked.
- The alert/dropdown closes before navigation.
- Both urgent reminder actions and notification detail actions use the same
  helper, so feedback links cannot diverge between the two surfaces.

The existing `resolveNotificationActionUrl` compatibility logic remains in
place. A feedback action continues to use `/admin/feedback-hub?ticketId=N`,
including legacy notifications whose structured action URL is stale.

When the Hub receives that URL, its current deep-link effect selects the ticket;
the detail query loads it and the existing `ticketsForDisplay` behavior keeps
it visible even when a source filter would otherwise hide it. Tests will cover
the action navigation contract and the Hub deep-link contract.

### 2. Zoomable authenticated image lightbox

Extend the existing ticket image lightbox only:

- Initial scale is `100%` and the image remains `object-contain`.
- Controls: `+`, `−`, and `รีเซ็ต`/`Reset`, with an accessible label and visible
  percentage.
- Scale is bounded to a practical range (for example 100–400%) and changes in
  fixed increments.
- The image viewport becomes scrollable when the image exceeds the viewport;
  zoomed content can be inspected without changing the protected-media URL or
  bypassing authentication.
- Changing the image or closing the lightbox resets the scale to 100%.
- Existing previous/next, Escape, and “open in new tab” behavior remains.
- Reply-preview images before upload are out of scope for zoom in this change;
  they remain a simple preview.

## UI/UX contract

### Target user / JTBD

- Role: Feedback Hub administrator.
- Goal: inspect screenshot details and act on a newly reported ticket quickly.
- Entry points: an in-app urgent alert or notification bell; attachment image
  in `/admin/feedback-hub`.
- Success: the alert opens the reported ticket already selected, and image text
  can be enlarged and panned without downloading or exposing the file.

### Existing pattern reference

- Searched: `AuthenticatedAttachmentImage`, `AuthenticatedMediaImage`, the
  current `AdminFeedbackHub` lightbox, `GlobalAlerts`, and existing notification
  tests.
- Found: the protected image wrapper, ticket lightbox, feedback deep-link
  selection, and notification action resolver already exist.
- Decision: reuse and extend. No second image viewer or notification route is
  introduced.

### Surface inventory

| Surface | File | Change |
|---|---|---|
| Feedback detail lightbox | `apps/web/client/src/pages/AdminFeedbackHub.tsx` | Add zoom state, controls, scrollable viewport, reset behavior |
| Urgent reminder action | `apps/web/client/src/components/GlobalAlerts.tsx` | Navigate internal paths in current tab |
| Notification detail action | `apps/web/client/src/components/GlobalAlerts.tsx` | Reuse the same current-tab internal navigation |
| Focused UI tests | `apps/web/client/src/components/__tests__/GlobalAlerts.notificationBell.test.tsx` and `apps/web/client/src/pages/__tests__/AdminFeedbackHub.deepLink.test.tsx` | Prove navigation and selection behavior |

### Component map

| Component | Owns | Consumes |
|---|---|---|
| `AdminFeedbackHub` | lightbox scale, selected image, reset/navigation | existing attachment list and authenticated image wrapper |
| `GlobalUrgentReminders` | urgent action dispatch | safe action-navigation helper and wouter location setter |
| `GlobalNotificationBell` | bell/detail action dispatch | same safe action-navigation helper |
| `resolveNotificationActionUrl` | feedback URL compatibility | notification structured fields/content |

### State matrix

| State | Expected behavior |
|---|---|
| Image opened | 100% fit-to-viewport, controls visible |
| Zoomed | bounded scale, percentage visible, viewport scrolls |
| Reset | returns to 100% and a centered fit |
| Previous/next | selects another image and resets scale |
| Closed | lightbox closes and scale resets |
| Image loading/error | existing authenticated loading/error UI remains |
| Internal alert action | current tab navigates to target URL and closes alert |
| External alert action | existing new-tab behavior remains |
| Ticket outside source filter | detail remains visible and selected through existing prepend logic |

### Responsive matrix

| Viewport | Expected behavior |
|---|---|
| mobile 390x844 | controls remain reachable; zoomed image scrolls without page overflow |
| tablet 768x1024 | lightbox uses available viewport and preserves readable controls |
| desktop 1440x900 | image remains centered at 100%; large screenshots can be inspected at 200–400% |
| laptop 1024x768 | dense Hub layout remains usable; lightbox controls do not overlap image navigation |

### Accessibility acceptance

- Every zoom control has an accessible name; icon-only buttons have `aria-label`.
- Focus is visible and the control order is logical.
- Escape closes the dialog; existing arrow-key image navigation remains.
- Zoom controls do not rely on color alone and remain readable on the dark viewer.
- No new required animation; scale changes should respect reduced-motion users.

### Copy contract

- Use concise Thai labels consistent with the current Hub: `ขยายภาพ`,
  `ย่อภาพ`, `รีเซ็ตขนาด`, and `เปิดในแท็บใหม่`.
- Keep existing English fallback behavior where the page currently uses English.
- Do not expose storage or authentication errors in notification navigation.

### Browser evidence required

Manual or automated browser evidence should cover mobile `390x844`, tablet
`768x1024`, desktop `1440x900`, and laptop `1024x768`: opening a feedback alert,
seeing the referenced ticket selected, opening an attachment, zooming in/out,
resetting, panning, and closing the lightbox. If browser tooling is unavailable,
record the checks as skipped rather than passing them by inference.

## Failure handling and safety

- Keep `AuthenticatedAttachmentImage` and its protected-media request path
  unchanged.
- Keep unsafe action URL blocking and apply it before either navigation mode.
- If the target ticket cannot be loaded, retain the existing Hub error state and
  show the requested ticket id; do not silently fall back to a manually chosen
  ticket.
- Do not change notification persistence, read receipts, tenant scoping, or
  server authorization.

## Acceptance criteria

1. An admin can open any ticket image in the existing lightbox, zoom from 100%
   through the bounded range, pan the enlarged image, and reset it.
2. Zoom controls are keyboard reachable and have accessible names.
3. Clicking an internal feedback action from either the urgent alert or the
   notification bell navigates in the current tab to the ticket URL.
4. The referenced ticket is selected and visible even when the current source
   filter would exclude it.
5. External action URLs and unsafe URL blocking retain their current behavior.
6. Focused tests, formatting/diff checks, and available browser evidence are
   recorded; unrelated dirty work remains untouched.

## Verification plan

- Red/green focused tests for internal-vs-external action navigation and
  feedback URL resolution.
- Focused Hub deep-link/lightbox test for selection plus zoom controls, bounds,
  reset, and image-change reset.
- `git diff --check`.
- Path-scoped Prettier/check and the relevant Vitest files from `apps/web`.
- Web build if the touched component path can be built safely in this mixed
  worktree.
- Browser evidence as described above; report unavailable browser tooling
  explicitly.
