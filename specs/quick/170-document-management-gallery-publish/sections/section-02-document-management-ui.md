# Section 02: Document Management UI

## Ownership

Own `DocumentManagement.tsx`, `DocumentPreviewPanel.tsx`, and common locale
files.

## UI/UX Contract

- Target user: tenant admin curating public image/video Gallery media.
- Surface: selected media preview header; no action for generic documents,
  audio, folders, or non-admin users.
- States: idle, pending/disabled, success toast/link, and error toast.
- Accessibility: visible text label, button disabled while pending, tooltip/aria
  label, keyboard activation, and localized English/Thai copy.
- Responsive: action remains in the existing wrapping toolbar on mobile and
  desktop; do not add a new layout system.
- Browser evidence: local browser smoke remains optional/unperformed unless a
  browser runner is available.

## Tests

Verify media/admin visibility, unsupported/non-admin hiding, pending state, and
callback invocation without changing existing preview controls.
