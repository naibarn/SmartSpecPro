# Decision log

## Planning depth

Decision: `standard` quick-plan.

Reason: the task is medium-sized UI workflow work across two components and
focused tests, but has no schema/API migration and no unresolved product choice
after the user approved the current-tab navigation direction.

Not promoted to full deep-plan: the affected contracts and files are already
identified, the server contract remains unchanged, and the work can be split
into two bounded implementation sections.

## Key decisions

1. Use one `navigateNotificationAction` boundary for both urgent reminder and
   notification-bell actions.
2. Internal URLs are exactly single-slash relative paths (`/x`, not `//x`);
   they use wouter `setLocation`. Other safe URLs retain new-tab behavior.
3. Keep `resolveNotificationActionUrl` as the compatibility source for legacy
   feedback notifications.
4. Keep zoom state local to the existing ticket lightbox. Use a wrapper that
   makes the zoomed content participate in scrolling; do not transform the
   protected image request or add a dependency.
5. Do not broaden the scope to server notification rows, attachment storage,
   or the pre-upload reply preview.

## Self-review record

- Round 1: checked request coverage and current-code fit; added explicit
  single-slash URL safety and external fallback.
- Round 2: checked UI contract; added mobile/tablet/desktop/laptop behavior,
  keyboard labels, reset semantics, and browser skip policy.
- Round 3: checked cross-section ownership; confirmed GlobalAlerts owns action
  dispatch and AdminFeedbackHub owns lightbox state.
- Round 4: checked security/abuse cases; preserved unsafe protocol blocking,
  protocol-relative URL exclusion, and protected media.
- Round 5: checked testability; required red tests for both action surfaces and
  lightbox bounds/reset/image-change behavior.
- Round 6: no meaningful [AUTO-FIX] findings; package remains standard
  quick-plan and implementation-ready.
