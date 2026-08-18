# SmartAIHub Companion Renaming Design

Date: 2026-08-18
Status: Implemented and focused verification passed; deployment and browser smoke pending

## Goal

Rename the multi-purpose Chrome extension from the Marketplace-specific
`SmartAIHub Marketplace Capture` identity to `SmartAIHub Companion` without
breaking release discovery, downloads, token delivery, or installed extension
versions that still use legacy Marketplace identifiers.

The rename covers product identity. Marketplace-specific capability names remain
Marketplace-specific when they still accurately describe their function.

## Naming Contract

The canonical product identity becomes:

- display name: `SmartAIHub Companion`;
- descriptive name: `SmartAIHub Companion Extension`;
- private workspace package: `@smartspec/smartaihub-companion-extension`;
- release file: `smartaihub-companion-extension-<version>.zip`;
- public release API: `/api/desktop-releases/companion-extension/latest` and
  `/api/desktop-releases/companion-extension/download`;
- external token-delivery message: `SMARTAIHUB_COMPANION_TOKEN`.

The first release under the new identity is `0.1.138`.

## Scope Boundary

Rename product-level surfaces:

- Chrome manifest name, description, action title, panel document title, and
  panel header;
- extension README and release-package verification copy;
- Dashboard release card copy, consumer variables, fallback URLs, and tests;
- package metadata, ZIP name, public release routes, and generic release helper
  names;
- the external browser-to-extension token-delivery message.

Keep capability-level Marketplace names where they remain accurate:

- `/marketplace-capture` and `/marketplace-capture/connect` routes;
- Marketplace Capture service, router, database table, token-use claim, capture
  configuration, and capture-specific request headers;
- `MARKETPLACE_PAGE_SNAPSHOT`, observer messages, and other content-adapter
  protocols that operate only on Shopee/TikTok Marketplace pages;
- Dashboard action `Open Marketplace Capture`, because it opens that specific
  feature rather than the extension product itself.

This avoids a misleading global rename of domain objects that still implement
Marketplace Capture.

## Backward Compatibility

### Release files and APIs

The server release resolver accepts both patterns:

- `smartaihub-companion-extension-<version>.zip`;
- `smartaihub-marketplace-capture-extension-<version>.zip`.

It compares versions across both patterns and selects the highest valid release.
When versions are equal, the current updated-at tie-break remains in effect.

The new Companion routes become canonical. The legacy routes remain aliases to
the same resolver:

- `/api/desktop-releases/marketplace-extension/latest`;
- `/api/desktop-releases/marketplace-extension/download`.

The legacy latest endpoint must be able to report and download a new-name ZIP.
This ensures extension `0.1.137` and older installations can discover `0.1.138`.
The canonical endpoint returns the canonical Companion download URL, while the
legacy endpoint may return its legacy alias URL so existing same-origin clients
continue unchanged.

No old ZIP is deleted. Version `0.1.137` remains available for rollback.
Because unpacked installations do not provide reliable upgrade telemetry, legacy
routes and filename recognition have no automatic removal date. Removing them
requires a separate compatibility decision with evidence that supported clients
no longer depend on them.

### Token delivery

Version `0.1.138` accepts both:

- `SMARTAIHUB_COMPANION_TOKEN`;
- `SMARTAIHUB_MARKETPLACE_EXTENSION_TOKEN`.

The web connect page attempts the canonical message first and falls back to the
legacy message only when Chrome reports that no compatible receiver handled the
new message. An `{ ok: false }` response is an explicit receiver decision and
must not trigger fallback. This lets new web code connect both new and old
installed extensions without changing the
short-lived token, device binding, origin validation, or sender allowlist.

Marketplace authentication schemas, database tables, `tokenUse`, and API
authorization remain unchanged because they describe the Marketplace Capture
capability and changing them would add migration/security risk without improving
the product name.

### Environment configuration

Introduce `COMPANION_EXTENSION_ALLOWED_ORIGINS` as the preferred deployment name
for the extension-origin allowlist. If it is unset, fall back to
`MARKETPLACE_EXTENSION_ALLOWED_ORIGINS`.

The existing Marketplace token TTL and capture limits keep their current names
because they govern the Marketplace Capture capability rather than the whole
Companion product. Document both allowlist names in `.env.example` and do not
remove the legacy variable in this release.

## Dashboard and Extension Update Flow

The Dashboard release card displays `SmartAIHub Companion` and describes the
extension as a bridge for Marketplace capture, production assets, storyboard,
Vertical Drama, local AI, and supported browser workflows. It fetches the new
Companion latest route and downloads the canonical ZIP.

Extension `0.1.138` changes its update-awareness constants to the Companion
routes. The six-hour cache, version-specific dismissal, HTTPS same-origin
validation, and Chrome native-update handling remain unchanged.

Extension `0.1.137` continues calling the old route, which resolves the same
`0.1.138` Companion ZIP. Thus the rename does not strand the version immediately
preceding it.

## Packaging and Version Synchronization

Synchronize `0.1.138` in:

- `apps/extension/package.json`;
- `apps/extension/public/manifest.json`;
- `EXTENSION_VERSION` and build label in `apps/extension/src/panel/App.tsx`;
- the `apps/extension` workspace entry in `package-lock.json`.

The lockfile's workspace-link entry under `node_modules/@smartspec/...` must also
move to the canonical package name without regenerating unrelated lockfile
content.

`npm run package:web-dashboard` writes only the canonical Companion ZIP. The
package verifier derives the canonical filename and verifies manifest version,
panel version marker, required bundle entries, update-awareness markers, and the
existing drag/media safeguards.

## Failure Handling

- Missing new-name releases fall back naturally to the highest legacy-name ZIP.
- The old and new latest endpoints return the same release version selection.
- A missing release returns the existing no-release response/404 behavior.
- Token fallback occurs only for transport incompatibility; an explicit security
  or validation rejection from a receiver is surfaced and is not bypassed by
  retrying another message name.
- Update checks remain advisory and non-blocking.
- No automatic forced reload, deployment, Chrome Web Store publication, or old
  release deletion is part of this change.

## Testing

Focused automated coverage includes:

- mixed legacy/canonical filenames choose the highest version;
- equal-version tie-break behavior remains deterministic;
- both canonical and legacy latest/download routes expose the same selected
  artifact while returning the appropriate download alias;
- the Dashboard calls the canonical route and renders Companion copy;
- the extension update helper uses canonical Companion endpoints and retains
  same-origin fallback behavior;
- the service worker accepts both token message names;
- the connect page uses canonical-first, legacy-on-incompatible fallback and
  does not retry after explicit security/validation rejection;
- package/manifest/panel/lock versions and package identity are synchronized;
- the canonical `0.1.138` ZIP passes the existing package verifier and contains
  the new product name/version markers;
- the `0.1.137` ZIP remains present.

Required verification:

- focused server release-route tests;
- focused Dashboard release-panel and connect-page tests;
- extension update/token tests, TypeScript check, and production build;
- `npm run package:web-dashboard` plus Python ZIP inspection;
- focused `git diff --check`;
- browser smoke when a Chrome extension session is available, otherwise record
  it explicitly as pending.

## Rollout

1. Add the dual-pattern resolver and legacy API aliases before or together with
   publishing the canonical ZIP.
2. Update Dashboard and connect-page consumers to canonical names with protocol
   fallback.
3. Build and place `smartaihub-companion-extension-0.1.138.zip` in the existing
   Dashboard releases directory.
4. Verify the canonical and legacy endpoints both select `0.1.138`.
5. Keep all previous Marketplace-named ZIPs and compatibility routes.

Production deployment, Chrome Web Store publication, commit, and push require
separate authorization and were not performed by this implementation.

## Implementation Result

Implemented on 2026-08-18 with the canonical `0.1.138` artifact written to the
existing Dashboard release directory. The generated ZIP passed the package
verifier and manual archive inspection. Canonical and legacy release APIs,
canonical-first token delivery, explicit-rejection protection, canonical config
precedence, Dashboard copy, extension update awareness, and product identity
have focused automated coverage.

The full web TypeScript check was also run. It remains red on pre-existing
errors in unrelated Admin, Chat, Marketplace review, Vertical Drama, Skills,
media, and Worker/production modules; no error named a file changed for this
Companion rename. Authenticated production endpoint smoke, Chrome side-panel
smoke, deployment, Chrome Web Store publication, commit, and push were not run.
