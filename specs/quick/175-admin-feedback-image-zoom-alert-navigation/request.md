# Request

## Task summary

1. Add usable zoom in/out controls to the Admin Feedback Hub attachment image
   lightbox so screenshot details are readable.
2. Fix the right-corner in-app feedback alert so opening it navigates to and
   selects the newly reported ticket instead of requiring a manual search.

## Approved product direction

- Internal notification actions use current-tab wouter navigation.
- External actions retain the existing safe new-tab behavior.
- Feedback ticket deep-links continue to use `?ticketId=N`.
- The existing authenticated attachment image and lightbox are extended; no
  second viewer is introduced.
- Zoom opens at 100%, supports plus/minus/reset, is bounded, and allows the
  enlarged image to be inspected in a scrollable viewport.

## Likely affected areas

- `apps/web/client/src/components/GlobalAlerts.tsx`
- `apps/web/client/src/components/__tests__/GlobalAlerts.notificationBell.test.tsx`
- `apps/web/client/src/pages/AdminFeedbackHub.tsx`
- `apps/web/client/src/pages/__tests__/AdminFeedbackHub.deepLink.test.tsx`

## Constraints and non-goals

- Preserve protected-media authentication, notification persistence, read
  receipts, tenant scope, and server authorization.
- Do not change reply-preview zoom in this task.
- Do not add dependencies or database migrations.
- Preserve unrelated dirty work in the repository.
