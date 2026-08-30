# Section 01: alert navigation

## Ownership boundary

Own only `GlobalAlerts.tsx` action dispatch and its focused test file. Do not
change notification persistence, server notification creation, or Feedback Hub
selection logic.

## Requirements

- Internal single-slash paths use wouter `setLocation` in the current tab.
- Protocol-relative URLs (`//...`) and external safe URLs use the existing
  new-tab path; unsafe protocols remain blocked.
- Both urgent reminder and notification-detail action buttons use the same
  dispatch rule.
- Existing action fallback behavior, read marking, and feedback URL resolver
  remain intact.

## TDD expectations

- Add failing tests for urgent internal feedback navigation and notification
  detail internal feedback navigation.
- Preserve/add tests for external new-tab and unsafe URL behavior.
- Run the focused GlobalAlerts test before and after implementation.

## UI/UX Contract

### Target User / JTBD

- Role: Feedback Hub administrator.
- Goal: open the ticket named by a right-corner alert immediately.
- Entry point: urgent reminder modal or notification bell detail action.
- Success: current tab reaches `/admin/feedback-hub?ticketId=N`; the Hub can
  select that ticket without manual searching.

### Existing Pattern Reference

- Searched: `GlobalAlerts.tsx`, `resolveNotificationActionUrl`, existing
  notification tests, and `AdminFeedbackHub.tsx` deep-link effect.
- Found: shared URL resolver and existing `ticketId` deep-link contract.
- Decision: reuse; centralize only the navigation dispatch boundary.

### Surface Inventory

| Surface | File | Change |
|---|---|---|
| Urgent reminder modal | `GlobalAlerts.tsx` | Current-tab internal action |
| Notification detail | `GlobalAlerts.tsx` | Same helper and current-tab action |

### Component Map

| Component | Owns | Consumes |
|---|---|---|
| `GlobalUrgentReminders` | modal close/read/action sequence | safe navigation helper |
| `GlobalNotificationBell` | dropdown close/action sequence | safe navigation helper |
| `resolveNotificationActionUrl` | feedback target compatibility | notification fields/content |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| internal feedback action | current tab navigates and surface closes | focused test |
| external action | new tab opens | focused regression test |
| unsafe action | no navigation | focused regression test |
| stale legacy feedback action | ticket id repaired from content | resolver test |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | action remains reachable in alert/detail | browser/manual |
| tablet 768x1024 | no action overflow | browser/manual |
| desktop 1440x900 | same-tab route opens selected ticket | browser/manual |
| laptop 1024x768 | dropdown/modal action remains visible | browser/manual |

### Accessibility Acceptance

- Existing action buttons retain accessible visible labels and keyboard focus.
- Closing the alert/dropdown before navigation must not leave focus on a stale
  hidden surface.
- No color-only indication is introduced.

### Copy Contract

- Preserve current notification labels such as `View Feedback` and localized
  action labels.
- Do not add storage or technical error text to the action surface.

### Browser Evidence Required

Follow `skills/orchestra/references/ui-browser-verification.md`; record the four
viewports above and mark unavailable browser checks as skipped.

## Acceptance checks

- Current-tab `setLocation` is asserted for both action surfaces.
- Existing external and unsafe URL assertions pass.
- `resolveNotificationActionUrl` behavior remains covered.

## Actual implementation

- `GlobalAlerts.tsx` now centralizes safe action dispatch in
  `navigateNotificationAction`: internal single-slash paths use wouter's
  `setLocation`, while external/protocol-relative safe URLs retain
  `safeOpenInNewTab`.
- Urgent reminder actions, urgent modal actions, and notification-detail
  actions all use the same dispatch boundary; modal/dropdown close and read
  marking remain intact.
- `GlobalAlerts.notificationBell.test.tsx` covers current-tab feedback and
  incident targets plus the external new-tab regression. The focused suite
  passed as part of 35/35 combined tests.
