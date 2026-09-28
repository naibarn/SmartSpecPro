# Implementation plan

## Objective

Deliver two focused fixes without changing backend contracts: make ticket
attachment screenshots zoomable/pannable in the existing authenticated
lightbox, and make internal feedback alert actions select the referenced ticket
in the current tab.

## Section order

1. Implement the shared internal notification navigation behavior and its
   regression tests.
2. Implement the Feedback Hub lightbox zoom behavior and deep-link/lightbox
   regression tests.

## Affected files

- Modify `apps/web/client/src/components/GlobalAlerts.tsx`.
- Modify `apps/web/client/src/components/__tests__/GlobalAlerts.notificationBell.test.tsx`.
- Modify `apps/web/client/src/pages/AdminFeedbackHub.tsx`.
- Add `apps/web/client/src/pages/FeedbackLightboxZoomControls.tsx`.
- Add `apps/web/client/src/pages/feedbackHubNavigation.ts`.
- Add `apps/web/client/src/pages/feedbackHubZoom.ts`.
- Add or modify `apps/web/client/src/pages/__tests__/AdminFeedbackHub.deepLink.test.tsx`.

## Implementation approach

### Notification navigation

- Obtain wouter's `setLocation` in both alert surfaces.
- Add a small helper that first calls the existing safety predicate, then uses
  `setLocation` only for URLs beginning with `/` but not `//`; otherwise it
  delegates to `safeOpenInNewTab`.
- Close the dropdown/modal before dispatching the action.
- Keep urgent reminder read mutation and existing conversation/schedule
  fallback paths intact.
- Keep `resolveNotificationActionUrl` unchanged unless a focused test exposes a
  missing legacy feedback case.
- Update tests so internal feedback and internal monitoring actions assert
  `setLocation`, while an external safe action still asserts `window.open` and
  unsafe URLs remain blocked.

### Lightbox zoom

- Add local scale state with constants such as 1, 0.25, and 4 bounds.
- Reset scale on lightbox close and when `lightboxIndex` changes.
- Put the authenticated image inside a scrollable viewport and a size-bearing
  wrapper so enlarged content can be panned with native scrollbars. At 1x,
  preserve fit-to-viewport `object-contain`; above 1x, increase the wrapper's
  dimensions while retaining the image's contained aspect ratio.
- Add labelled plus/minus/reset controls and visible scale percentage without
  obscuring previous/next controls. Disable plus/minus at bounds.
- Keep Escape, arrow navigation, authenticated image loading, and “open in new
  tab” unchanged.
- Add focused component coverage for control labels, scale bounds, reset, and
  reset-on-next-image. If the full page test setup is too expensive, extract a
  small pure zoom-state helper and test that helper plus a static control
  contract; do not weaken action/navigation assertions.

## Risks and mitigations

- Wouter navigation could lose query parameters: assert the exact
  `/admin/feedback-hub?ticketId=N` target.
- A notification may point outside the active source filter: retain and test
  the existing detail prepend path.
- CSS transform alone may not create a scrollable area: use a size-bearing
  wrapper or explicit overflow content dimensions.
- Existing tests may encode intentional external new-tab behavior: change only
  internal URL expectations.
- Dirty worktree may cause broad checks to report unrelated failures: use
  focused commands and report baseline noise separately.

## Acceptance criteria

- Ticket image lightbox has accessible plus/minus/reset controls, bounded zoom,
  visible percentage, native panning at enlarged scale, and reset semantics.
- Internal actions from both alert surfaces navigate in the current tab.
- Feedback deep-link selects and displays the referenced ticket even when its
  source differs from the active filter.
- External and unsafe URL behavior remains safe and covered.
- No protected media, tenant, notification persistence, or server contract is
  weakened.

## Verification and handoff

- Run the red tests before implementation and focused tests after each section.
- Run `npm --workspace apps/web test -- ... --environment jsdom --run` for owned
  test files, from repo root.
- Run `npm --workspace apps/web run build` if safe in the mixed worktree.
- Run `git diff --check` and path-scoped formatting/checks from `apps/web`.
- Capture browser evidence at 390x844, 768x1024, 1440x900, and 1024x768 when
  browser tooling is available; otherwise record skipped with reason.
- Do not commit or stage unrelated existing changes.

## Implementation status

- Section 1 complete: internal single-slash notification actions now use
  current-tab wouter navigation; external safe URLs retain the new-tab path.
- Section 2 complete: the protected attachment lightbox now supports 100% to
  400% zoom in 25% steps, visible percentage, reset, and drag/native scroll pan.
- Focused verification: 35/35 tests passed; production build passed; `git diff
  --check` passed.
- Full typecheck remains red on unrelated pre-existing worktree errors plus the
  existing `AdminFeedbackHub.tsx` implicit-any at the reply upload cleanup
  callback; no new errors were found in the added zoom/navigation modules.
- Browser evidence is recorded as skipped because this session has no
  authenticated browser state for the admin route.
- Follow-up repair: the lightbox now uses `fullscreen`, 25% zoom increments,
  direct image dimensions, and pointer-drag pan with native scroll fallback.
