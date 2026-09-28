# Section 08 — Dashboard, menu, settings, and quick links

Add the shared `content-protection` menu item to
`packages/shared/src/constants/menu.ts`, feature-gated by
`contentProtectionEnabled`, and add icon resolution if needed. Add Dashboard
quick actions for `/content-protection`, `/content-protection/assets`, and
`/content-protection/verify`, plus a status card showing modality, artifact,
choice, current watermark stage, and protected/unprotected status. Add the
Settings tab/deep link `/settings?section=contentProtection` with optional
compatibility redirect only if it follows current routing conventions.

Tests first: menu flag filtering, Dashboard quick-link contract, Settings deep
link, mobile/desktop rendering, and no link to an unregistered route.

## UI/UX Contract

### Target User / JTBD

Creators need one-click access from Dashboard to protect assets, verify copies,
and configure their default watermark choice.

### Surface Inventory

Shared sidebar menu, Dashboard quick actions/status card, and Settings content
protection deep link.

### Component Map

Shared menu registry, Dashboard quick-action resolver, status card, and Settings
section navigation; these remain in their current owning files.

### State Matrix

Loading, empty, error, disabled, protected, unprotected, processing, focus, and
selected route states have distinct copy and action; status is not color-only.

### Responsive Matrix

Links remain visible and keyboard reachable at 390x844, 768x1024, and 1440x900;
quick actions wrap/stack without truncating the destination label.

### Accessibility Acceptance

Use labelled links/buttons, visible focus, semantic status text, keyboard order,
and accessible icon-only fallbacks.

### Copy Contract

Thai/English navigation labels and explicit watermark stage/status copy with
technical-evidence disclaimer.

### Browser Evidence Required

Authenticated Dashboard desktop/mobile, quick-link navigation, menu flag state,
and Settings content-protection deep link.

## Implementation record

- Added the feature-gated shared menu item and App routes for the workspace.
- Added Dashboard quick links for the top-level workspace, protected assets,
  verification, and settings plus a protected/processing/unprotected status
  card.
- Added the Settings `?section=contentProtection` deep link and workspace link.
- Nested Dashboard fallbacks explicitly re-check the tenant feature flag so a
  disabled tenant cannot reach the workspace through a quick-link fallback.
