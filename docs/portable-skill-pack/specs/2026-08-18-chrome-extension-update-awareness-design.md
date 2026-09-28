# Chrome Extension Update Awareness Design

Date: 2026-08-18
Status: Implemented and focused verification passed; production deployment and authenticated browser smoke pending

## Goal

Make the SmartAIHub Marketplace Capture extension detect when a newer packaged
release exists, notify the user without blocking normal work, and use Chrome's
native update lifecycle when the installation channel supports it.

## Current Context

- The installed version is synchronized across
  `apps/extension/package.json`, `apps/extension/public/manifest.json`, and
  `EXTENSION_VERSION` in `apps/extension/src/panel/App.tsx`.
- Dashboard ZIP releases are already discoverable from
  `GET /api/desktop-releases/marketplace-extension/latest`.
- The latest-release response already contains `version`, `fileName`,
  `fileSizeBytes`, `updatedAt`, and `downloadUrl`.
- Dashboard ZIP / unpacked installations cannot be silently replaced by the
  extension itself on ordinary Windows and macOS Chrome installations.
- Chrome Web Store or enterprise-managed installations can use Chrome's native
  update lifecycle. Chrome normally checks automatically and exposes
  `runtime.onUpdateAvailable` when an update has been downloaded.

## Chosen Approach: Hybrid Update Awareness

Use the existing SmartAIHub latest-release endpoint as the authoritative
cross-installation notification source. Add native Chrome update-event support
as an enhancement for managed installation channels.

This approach works for the current Dashboard ZIP workflow while remaining
compatible with a future Chrome Web Store release. It does not introduce a new
database table, migration, external service, permission, or polling daemon.

## Extension Components

### Version utility

Add a small, independently tested module responsible for:

- normalizing numeric Chrome extension versions;
- comparing versions segment by segment, without lexical string comparison;
- parsing and validating the latest-release API response;
- returning `update_available`, `up_to_date`, or `unavailable`.

Malformed or non-numeric remote versions fail closed as `unavailable` and never
produce a false update warning.

Chrome-compatible versions are limited to one through four numeric segments.
Each segment is validated before comparison so file names or unexpected server
values cannot be interpreted as executable input.

### Update check lifecycle

The side panel checks the existing latest-release endpoint when it opens.
Successful results are cached in `chrome.storage.local` for six hours so panel
reopens do not repeatedly hit the server. A failed request may be retried on a
later panel open and must not interrupt capture, authentication, or media work.

The request uses the configured HTTPS SmartAIHub base URL. The public endpoint
does not require an extension token, so update awareness also works before the
user connects their account.

No unconditional timer will call `chrome.runtime.requestUpdateCheck()`.
Chrome's own periodic update checks remain authoritative for Web Store or
enterprise-managed installs.

### Native update events

The Manifest V3 service worker listens for `chrome.runtime.onUpdateAvailable`
and persists the pending native version in `chrome.storage.local`. The panel
reads this state and can offer a `Restart to update` action that calls
`chrome.runtime.reload()` only after an explicit user click.

If the API says a newer ZIP exists but Chrome has not delivered a native update,
the panel offers the Dashboard download action instead.

## User Experience

When no update exists, the panel remains unchanged except for its existing
version label.

When a newer Dashboard release exists, show one compact, non-modal banner near
the panel header:

- current and latest version;
- primary action: `ดาวน์โหลดอัปเดต`;
- secondary action: `ไว้ภายหลัง`.

`ไว้ภายหลัง` dismisses only that exact latest version. A later version must
show again. The download action opens the absolute SmartAIHub download URL in a
new tab; the extension does not execute or install downloaded content.

When Chrome reports a native update ready, replace the primary action with
`รีสตาร์ตเพื่อติดตั้ง`. This explicitly reloads the extension and may close the
current side panel. The user is never force-reloaded while editing or uploading.

The banner uses existing panel tokens/classes, remains readable at side-panel
width, and exposes status text through an accessible live region.

## Data and Security Boundaries

- Trust only an HTTPS URL resolved against the configured SmartAIHub origin.
- Ignore a remote `downloadUrl` that resolves to another origin; fall back to
  the known same-origin Marketplace extension download route.
- Store only version strings, timestamps, dismissal state, and native-update
  readiness. Do not store tokens or release contents.
- Do not add `update_url` for the current ZIP workflow. Self-hosted automatic
  updates require signed CRX packages and managed distribution, which is a
  separate release-channel decision.

## Failure Handling

- Network, JSON, validation, or endpoint failures are silent and non-blocking.
- A missing release returns `up_to_date`/no banner rather than an error banner.
- A failed download-tab open leaves the banner visible.
- A stale cache is replaced only by a successful, valid response.
- Native update readiness takes precedence over the Dashboard ZIP warning.

## Testing

Focused automated coverage must include:

- numeric version comparison, including different segment lengths;
- equal, older, newer, and malformed remote versions;
- same-origin download URL enforcement;
- cache freshness and version-specific dismissal;
- banner hidden/up-to-date, Dashboard update, dismissed update, and native
  update-ready states;
- service-worker persistence of `onUpdateAvailable` metadata.

Keep state derivation in pure shared helpers so these cases can run with the
repository's existing `node --import tsx --test` tooling and lightweight Chrome
API mocks. Do not add a new test dependency solely for this feature.

Required verification:

- extension TypeScript check and production build;
- focused extension tests;
- dashboard package verification after synchronizing version `0.1.137` in all
  three version sources;
- ZIP inspection confirming manifest and panel bundle contain `0.1.137`;
- `git diff --check` on explicitly touched files.

## Release Plan

1. Implement and verify update awareness.
2. Synchronize version `0.1.137` in package, manifest, and panel constant.
3. Run `npm run package:web-dashboard` from `apps/extension`.
4. Keep the prior `0.1.136` ZIP intact for rollback.
5. Deploy the web/API changes and the `0.1.137` release artifact together.

Publishing to Chrome Web Store, deploying production, or forcing a browser
update are external side effects and are not performed without separate
explicit authorization.
