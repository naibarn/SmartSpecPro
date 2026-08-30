# TDD plan

## Section 1: notification navigation

Red tests first:

1. An urgent internal feedback action calls `setLocation` with the exact ticket
   URL, closes the modal, and does not call `window.open`.
2. A notification-detail internal feedback action calls `setLocation` with the
   exact ticket URL and closes the dropdown.
3. Existing safe external action behavior still calls `window.open`.
4. Unsafe schemes and protocol-relative URLs do not navigate internally.
5. Existing legacy/stale feedback URL resolution still returns the ticket id
   parsed from content.

Expected red condition: the current implementation calls `window.open` for
internal paths and has no current-tab setter in the action handlers.

Fixtures/mocks: reuse the existing `GlobalAlerts.notificationBell.test.tsx`
mocked wouter location, notification fixtures, and `openWindowMock`.

## Section 2: lightbox zoom

Red tests first:

1. The ticket lightbox renders labelled zoom-in, zoom-out, reset, and percentage
   controls.
2. Zoom-in stops at the upper bound; zoom-out stops at the lower bound.
3. Reset returns to 100%.
4. Navigating to another image returns to 100%.
5. The image remains an `AuthenticatedAttachmentImage` and the viewport has
   overflow scrolling when zoomed.

Expected red condition: current lightbox renders no zoom controls/state.

Fixtures/mocks: mock only the page's existing tRPC queries, auth/confirm
   providers, wouter hooks, and authenticated image wrapper as needed. Prefer a
   pure exported zoom-state helper if rendering the large page is unstable.

## Regression checks

- Existing previous/next and Escape lightbox behavior.
- Existing feedback URL compatibility tests.
- Existing notification read mutation behavior.
- Existing protected media URL path and “open in new tab” attachment action.
- `git diff --check`; focused formatting/build as available.
