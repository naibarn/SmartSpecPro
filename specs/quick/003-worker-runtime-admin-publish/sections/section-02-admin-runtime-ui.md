# Section 02 — Admin Worker Runtime UI

## Ownership

Own the Admin Desktop Host Worker Runtime section, upload lifecycle, validation checklist, platform cards, publish/withdraw actions, copy, responsive behavior, and UI tests.

## Targets

`apps/web/client/src/pages/AdminDesktopHost.tsx`, `apps/web/client/src/features/desktop-releases/WorkerRuntimeReleasePanel.tsx`, shared client hook/contracts, translations, focused tests.

## UI/UX contract

- Target/job: system admin publishes a signed runtime ZIP without editing env.
- Surface: one panel in the existing Admin Desktop Host release console.
- Components: status cards, form, file picker, checklist, history table, confirmation dialog.
- State matrix: loading, no current artifact, Windows current, macOS pending, uploading, validating, invalid, publishable, published, withdrawn, unauthorized, API failure.
- Responsive matrix: stacked cards/form on mobile; two-column release console on desktop.
- Accessibility: semantic labels, keyboard controls, focus-visible, status/error announcements, no color-only meaning.
- Copy: Thai/English concise status and action messages; never expose secrets or infrastructure paths.
- Browser evidence: admin route with pending/invalid/valid/published states.

## Acceptance

Publish is unavailable until server validation succeeds; non-admin cannot access mutation controls; refresh reflects partial platform state.
