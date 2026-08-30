# Review Findings

## Round 1

- reviewed_files: `AuthenticatedMediaImage.tsx`, `AuthenticatedMediaImage.test.tsx`, `DocumentGridList.tsx`, `DocumentGridList.test.tsx`, `DocumentPreviewPanel.tsx`
- findings: no MUST_FIX findings in the focused repair; tenant-safe storage proxy was not weakened
- focused_gate: 20/20 relevant Vitest tests passed
- formatting_gate: `git diff --check` passed; Prettier reports pre-existing formatting differences in the touched Library files, with no required functional issue identified
- deferred: full `apps/web` typecheck timed out at 90 seconds without output; authenticated production browser waterfall, DB row 921, and R2 byte-range replay were not available
- stop_reason: focused repair complete with evidence boundaries recorded

## Current task: Feedback Hub image zoom and alert navigation

### Targeted review round 1

- reviewed_files: `GlobalAlerts.tsx`, `GlobalAlerts.notificationBell.test.tsx`,
  `AdminFeedbackHub.tsx`, `FeedbackLightboxZoomControls.tsx`,
  `feedbackHubZoom.ts`, `feedbackHubNavigation.ts`, and their focused tests
- findings: no MUST_FIX findings after correcting the navigation callback
  dependency and the stale test description; internal URLs retain the
  authenticated current-tab context, external safe URLs retain new-tab behavior,
  and protected image rendering remains on `AuthenticatedAttachmentImage`
- focused_gate: 35/35 Vitest tests passed
- build_gate: `npm --workspace apps/web run build` passed
- diff_gate: `git diff --check` passed
- deferred: full typecheck is baseline-red in unrelated modules and the existing
  reply upload callback line; authenticated browser replay was unavailable
- stop_reason: requested local implementation complete with focused proof and
  residual evidence boundaries recorded

### Targeted repair round 2

- reported_regression: clicking `+` caused the lightbox content to move
  downward instead of visibly zooming in
- root_cause: zoom controls were positioned inside the `overflow-auto` image
  viewport, so focus/reflow interacted with the scrollable content
- repair: moved `FeedbackLightboxZoomControls` to the fixed Dialog overlay
  layer while keeping only the image/navigation content scrollable
- verification: focused suite 35/35 passed; production build passed; targeted
  Prettier and `git diff --check` passed
- remaining_boundary: authenticated browser replay is still unavailable, so
  real visual pan/zoom must be smoke-tested in the admin route

### Targeted repair round 3

- reported_regression: after the first repair, the 150% indicator changed but
  the screenshot stayed near its original size and appeared at the bottom of
  the scroll area
- root_cause: `object-contain` plus `h-full w-full` allowed the image to keep
  fitting its flex layout even when only the surrounding wrapper was enlarged;
  the overflow viewport also retained browser scroll anchoring
- repair: apply the zoomed pixel dimensions directly to the authenticated
  `<img>`, disable its max-size constraint, align enlarged content from the
  viewport origin, and set `overflow-anchor: none`
- verification: focused suite 35/35 passed; production build passed; new image
  sizing helper coverage passed; targeted Prettier and `git diff --check` passed
- remaining_boundary: authenticated browser replay is still unavailable

### Targeted repair round 5

- reported_regression: clicking the visible `New Feedback` notification row
  did not navigate to the ticket; it only opened an in-bell detail state
- root_cause: row click handled read marking and detail expansion, while the
  resolved feedback action URL was used only by a secondary action button
- repair: feedback notification rows now resolve the ticket target and route
  directly in the current tab; non-feedback notification rows retain detail
  expansion behavior
- verification: GlobalAlerts suite 32/32 passed; combined focused suite 36/36
  passed; production build and diff/format checks passed
- remaining_boundary: authenticated production browser replay is still unavailable

### Targeted repair round 4

- reported_requirement: viewer must use the desktop width, zoom in smaller
  increments, and support moving across the complete enlarged screenshot
- repair: enabled the UI library's `fullscreen` Dialog mode, changed zoom to
  25% increments, and added pointer drag pan with native scrollbar fallback;
  image/index changes reset the viewport to the origin
- verification: focused suite 35/35 passed; production build passed; full
  typecheck still reports the pre-existing mixed-worktree errors and the
  existing reply-upload implicit-any in `AdminFeedbackHub.tsx`
- remaining_boundary: authenticated production browser replay is still unavailable
