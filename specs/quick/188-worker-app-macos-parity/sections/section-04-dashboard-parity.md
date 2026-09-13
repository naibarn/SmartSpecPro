# Section 4 — Dashboard parity

## Ownership boundary

Own release target resolution, native Mac card, source fallback presentation, locale copy, and browser tests. Do not change backend release storage behavior except through Section 1 contracts.

## Target files

- `apps/web/client/src/features/desktop-releases/DesktopReleasePanel.tsx`
- `apps/web/client/src/features/desktop-releases/WorkerRuntimeReleasePanel.tsx`
- `apps/web/client/src/locales/th/dashboard.json`
- `apps/web/client/src/locales/en/dashboard.json`
- focused UI tests

## UI/UX Contract

### Target User / JTBD

Mac user wants to inspect and download any available OS release, with the Mac native installer easy to identify.

### Surface Inventory

Windows, macOS, and Linux release cards, runtime card, and developer source fallback in the Dashboard.

### Component Map

Existing card, button, badge, and locale components plus a target resolver; no parallel Mac-only page.

### State Matrix

Loading, ready, no release, source-only, architecture unsupported, runtime unavailable, stale, and failure.

### Responsive Matrix

Preserve the Windows card layout for every OS and mobile stacking; long names and errors wrap without horizontal scrolling.

### Accessibility Acceptance

Semantic link/button labels, visible focus, status not conveyed by color alone, and keyboard-complete download flow.

### Copy Contract

Thai/English labels for macOS Apple Silicon, Native DMG, Developer source only, runtime unavailable, and actionable next steps; use existing dashboard locale fallback.

### Browser Evidence Required

Authenticated fixture screenshots/smoke for all-OS visibility, Mac-ready, source-only, unavailable, and wrong-architecture states.

## TDD expectations

Use release catalog fixtures; assert the Mac primary action points to the native artifact and never to source ZIP when native is ready.

## Acceptance checks

All OS releases remain visible and independently downloadable; Mac and Windows have equivalent primary install flow shape, with OS-specific constraints visible and truthful.

## Implementation status

Implemented a separate native macOS Worker App card beside the existing Windows
card, with DMG/Apple Silicon metadata, target-specific download, loading/error
states, and Thai/English copy. The all-platform catalog remains visible, and the
source ZIP remains a clearly labelled developer fallback. Focused Dashboard UI
tests pass for Windows and native Mac release states.
