# Research notes

## Discovery fallback

SocratiCode MCP tools were not available in the current tool surface. Targeted
`rg` and line-range reads were used instead, as required by the repository
fallback rule.

## Current implementation

- `AdminFeedbackHub.tsx` reads `ticketId` from `useSearch`, sets
  `selectedTicketId`, fetches `feedback.getTicket`, and prepends the selected
  detail to `ticketsForDisplay` when the current source filter excludes it.
- The ticket lightbox uses `AuthenticatedAttachmentImage` with
  `w-full h-full object-contain`, but no zoom state or controls exist.
- `GlobalAlerts.tsx` has `resolveNotificationActionUrl`, including legacy
  feedback repair from `Ticket #N` content.
- Both `GlobalUrgentReminders.handleViewAlerts` and
  `GlobalNotificationBell.handleOpenInNewTab` route internal paths through
  `safeOpenInNewTab`, which always calls `window.open(..., "_blank", ...)`.
- Existing tests explicitly assert new-tab behavior for notification actions;
  those assertions must be changed only for internal paths and preserved for
  external paths.

## Existing patterns reused

- Protected images: `AuthenticatedAttachmentImage` /
  `AuthenticatedMediaImage`.
- Existing image navigation: `AdminFeedbackHub` previous/next lightbox and
  Escape/arrow-key handling.
- Existing feedback target compatibility: `resolveNotificationActionUrl`.
- Existing selected-ticket visibility: `ticketsForDisplay` prepend behavior.

## Boundary/security scan

- No server or schema change is needed.
- The navigation helper must reject unsafe schemes before either navigation
  mode and must treat `//host/path` as external, not as an internal route.
- Protected attachment URLs remain handled by the existing authenticated
  wrapper; no plain public `<img>` fallback is allowed.

## Verification constraints

- Worktree is heavily dirty with unrelated application, release, and planning
  changes. Only owned paths should be edited/staged.
- Browser replay is not yet available; local focused tests and build/diff checks
  are required, and browser checks must be recorded as skipped if unavailable.
