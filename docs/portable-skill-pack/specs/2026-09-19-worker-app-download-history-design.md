# Worker App Download History — Design

## Goal

Allow authenticated Dashboard users to download older published Worker App installer versions without changing the existing latest-release updater contract.

## Scope

- Add a target-aware public history response for Windows x64 and macOS arm64 Worker App installers.
- Return the latest release separately and up to ten older versions, using the existing static release directories and published desktop-release catalog.
- Add an exact-version download selector with server-side allowlisting from discovered release assets.
- Add a Dashboard history panel inside each Worker App installer card. The panel is collapsed by default and each row has its own download link.
- Keep source bundles, runtime packs, admin build history, and unrelated desktop release cards out of this panel.

## Contracts

`GET /api/desktop-releases/worker-app/history?platform=<windows|macos>&architecture=<x64|arm64>` returns:

```json
{
  "generatedAt": "ISO-8601",
  "latest": { "version": "...", "downloadUrl": "..." },
  "history": [{ "version": "...", "fileName": "...", "downloadUrl": "..." }]
}
```

The history array contains at most ten entries after the latest release, sorted newest first and deduplicated by version. If fewer than ten published artifacts exist, all available older versions are returned.

`GET /api/desktop-releases/worker-app/download?version=<exact-version>&platform=...&architecture=...` streams only the matching allowlisted release. Omitting `version` retains the current latest-download behavior for existing Worker App clients.

## Safety and compatibility

- Do not change the existing `/worker-app/latest` response shape or latest download URL.
- Never construct a filesystem path from the requested version. Resolve the requested version against the server-discovered static/catalog candidates first.
- Unpublished database rows remain excluded from public history, matching the existing latest route.
- Existing release version filtering and target validation remain authoritative.

## UI behavior

- The latest Windows/macOS installer cards remain unchanged.
- A `details`-equivalent accessible accordion is placed below each installer card and starts collapsed.
- The panel label communicates that older versions are available; rows show version, filename, size, update date, and a download action.
- Loading/error/empty states do not disable or replace the current latest download action.

## Acceptance criteria

1. A release directory containing current plus older installers returns the latest separately and at least ten older versions when available.
2. A version-specific download streams the selected file; an unknown version returns 404.
3. Unsupported platform/architecture combinations remain rejected.
4. Dashboard history is collapsed on first render and expands to show downloadable rows.
5. Existing latest Worker App and macOS installer tests continue to pass.
