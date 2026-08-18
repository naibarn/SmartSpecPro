# Research Notes

- Extension version currently appears in `apps/extension/package.json`, `apps/extension/public/manifest.json`, `apps/extension/src/panel/App.tsx`, and the workspace entry in `package-lock.json`.
- `apps/extension/package.json` already provides `package:web-dashboard`, which builds, writes a versioned ZIP under `apps/web/client/public/releases/`, and runs package verification.
- `apps/web/server/routes/desktopReleases.ts` already exposes the public latest-release metadata and same-origin Marketplace extension download routes. No backend change is required.
- Manifest V3 already grants `storage` and `tabs`, so the feature needs no new permissions.
- The service worker already uses `chrome.storage.local` and has an `onInstalled` listener; it does not yet persist `runtime.onUpdateAvailable`.
- The panel already has a compact header/version label and an existing storage-change lifecycle. A banner immediately after the header is the smallest discoverable UI change.
- Chrome manages update checks for Web Store/managed installs. `runtime.onUpdateAvailable` can expose an update Chrome has already downloaded, but an unpacked Dashboard ZIP cannot securely replace itself. The fallback must remain an explicit download notification.
- SocratiCode was not available in the active tool surface, so discovery used focused shell reads and searches.
