# Section 02: Runtime, Panel, and Release

## Ownership

- `apps/extension/src/background/serviceWorker.ts`
- `apps/extension/src/panel/App.tsx`
- `apps/extension/src/panel/style.css`
- extension version files, workspace lock metadata, generated Dashboard ZIP

## Work

Persist native update availability in the service worker. Add an origin-scoped cached latest-release check and accessible banner to the panel, including exact-version dismissal, same-origin download action, and explicit native reload. Synchronize version `0.1.137`, build, package into the existing Dashboard releases directory, and preserve `0.1.136`.

## Proof

Run focused tests, extension typecheck/build, existing dashboard-package verifier, ZIP manifest/bundle inspection, prior-artifact existence check, and focused `git diff --check`.

## Implemented

- Service worker now persists valid `runtime.onUpdateAvailable` metadata and clears stale pending metadata after install/update.
- Panel checks the existing latest-release endpoint on open, reuses an origin-scoped six-hour cache, reacts to storage changes, and keeps failures silent.
- Added an accessible responsive banner with Dashboard download, explicit native reload, and exact-version dismissal.
- Synchronized `0.1.137` across package, manifest, panel, and workspace lock metadata.
- Generated and verified `apps/web/client/public/releases/smartaihub-marketplace-capture-extension-0.1.137.zip`; `0.1.136` remains present.
- Focused tests, TypeScript, Vite production build, package verifier, Python ZIP inspection, and focused diff whitespace check passed.
- Browser side-panel smoke was not run because no Chrome/Chromium executable or attached extension browser session was available.
