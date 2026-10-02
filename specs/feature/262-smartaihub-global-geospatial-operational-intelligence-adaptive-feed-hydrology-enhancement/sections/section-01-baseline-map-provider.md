# Section 01 — Baseline map and provider reliability

## Goal and boundaries

Repair the existing emergency map path before adding new map/feed behavior. The map route already exists at `/disaster/map`; this section must make its worker bundle, renderer/provider resolver, tiles, emergency overlays, attribution and safe fallback work together. A successful Google credential test is only provider credential evidence. It does not prove MapLibre initialized, the worker loaded, tiles rendered, features appeared, or browser assets resolved.

Keep MapLibre as the normal web/PWA renderer. Reuse the shared provider resolver and current public map API. Do not put durable Google credentials in browser code, use Google tiles as analytical input, cache/persist Google tiles, or make emergency information disappear when a basemap fails. Respect current map provider rights and attribution. The permitted fallback chain is configured primary basemap → permitted fallback basemap → minimal geography/list/text representation. No new data authority or route registry is introduced.

### Verified code ownership

- `apps/web/client/src/components/emergency/EmergencyPublicMap.tsx`: `EmergencyPublicMap`, `getMapConfiguration`, `loadProviderFallback`, `loadFallback`; currently imports `setWorkerUrl` and Vite `?worker&url`, creates MapLibre, requests public config/attribution/tiles and renders item overlays. Prior browser reports include `Worker failed to load` and `setWorkerUrl is not a function`; investigate module/worker compatibility and emitted production asset URL independently.
- `apps/web/client/src/components/emergency/emergencyMapFeatures.ts`: `getEmergencyMapCoordinates`, `toEmergencyAlertAreaFeatureCollection`, `toPublicMapFeatureCollection` for bounded public marker/polygon projections.
- `apps/web/client/src/pages/EmergencyRoutePage.tsx`: `/disaster/map` page and existing `EmergencyPublicMap` use.
- `packages/shared/src/geo/providerResolver.ts`: `resolveMapProvider`, renderer contracts and Google restrictions; its unit tests are in `packages/shared/src/geo/providerResolver.test.ts`.
- `packages/shared/src/emergencyRouteManifest.ts`: canonical Spec260 route and API path authority; do not hardcode a second route manifest.
- `apps/web/server/services/geoMapProviderRuntime.ts`, `geoMapSettings.ts`, and the existing public emergency map routes: server-side provider config/session/tile boundary. Inspect current dirty diffs before modifying.
- `apps/cloudflare/src/spec260PlatformProxy.ts` and `apps/cloudflare/src/spec260RouteRegistration.ts`: Cloudflare ingress transport to the canonical platform. They must preserve route contract and private credential boundary.

## Tests first

Add/extend focused tests before changing behavior. Test files should follow colocated repository convention; use these target suites/names (rename only if a colocated established suite already covers the same contract):

1. `apps/web/client/src/components/emergency/EmergencyPublicMap.test.tsx` — `rendersProviderMapAfterWorkerModuleLoads`; `doesNotCallUnsupportedWorkerApi`; `showsMapUnavailableAndTextFallbackWhenWorkerRejects`; `rendersPublicFeaturesAfterStyleLoad`; `preservesVisibleEmergencyItemsWhenBasemapUnavailable`; `showsStaleAndCoverageStatusWithoutCallingItEmpty`; `keepsRequiredAttributionVisibleForGoogleTiles`; `refreshesExpiredGoogleSessionAndUsesPermittedFallback`.
2. `packages/shared/src/geo/providerResolver.test.ts` — retain current valid-primary/fallback/disabled-policy coverage; add malformed renderer URL/session, unsupported map type, missing attribution, and provider capability mismatch cases. Invalid registrations fail closed; fallback can only be used if healthy/enabled/permitted.
3. `packages/shared/src/emergencyRouteManifest.test.ts` — assert map config, tile and attribution route IDs resolve to their existing canonical paths/access/cache classes; prevent duplicate or divergent route definitions.
4. Cloudflare route tests in `apps/cloudflare/src/spec260RouteRegistration.test.ts` and/or `spec260PlatformProxy.test.ts` (inspect existing naming before adding) — same canonical public route dispatch; reject recursive/wrong private origin; never expose private platform token or durable map key in response/body/log; bound proxy request/response and preserve public cache/security policy.
5. Production asset/browser evidence is an acceptance gate, not a substitute for unit tests: load the built `/disaster/map`, verify emitted worker request succeeds with the expected MIME/content type, no chunk/worker errors, config and tile requests are successful or explicitly fail into the fallback, map canvas is painted, feature overlays and attribution are visible, and the user can reach a list/text equivalent.

## Implementation sequence

1. Inspect the actual dependency version, Vite worker build configuration, emitted asset layout and current dirty diffs. Reproduce the two reported worker errors against a focused test or local browser before choosing an API. Do not assume `setWorkerUrl` exists in the installed MapLibre build. Use the supported worker setup for that exact installed version and ensure the worker and imported module are bundled to a resolvable same-origin production asset; do not add a dependency merely to conceal an incorrect import.
2. Keep renderer configuration discriminated and validated at the network boundary. Validate protocol/host and renderer-specific fields before constructing MapLibre. Google short-lived tile-session material may reach only its intended public tile proxy contract; durable secrets never reach the client. Reject expired sessions and do not silently interpret invalid configuration as a healthy map.
3. Separate map-renderer health, provider credential/connectivity, API transport, and emergency-data availability in state and diagnostics. A failed provider config must continue to show authorized items in the existing list/text fallback. A successful credential probe must not set renderer health to successful.
4. Preserve required provider/logo attribution. Retry attribution within a bounded interval; cancel timers/fetches on map teardown. Avoid hiding the map indefinitely while waiting for an attribution fetch or first tile response.
5. Preserve user-visible loading, empty-with-coverage, partial/truncated, stale, provider-unavailable and data-unavailable states. Empty result means “no items returned for available coverage,” never “no emergency exists.” Map errors should explain recovery/fallback and keep essential item details reachable.
6. Keep Cloudflare as ingress/transport using the shared route manifest and private-origin checks. The Linux platform service remains canonical for database/auth/tenant/audit/provider secrets unless a separate approved execution contract is established. No public tunnel-origin bypass and no new runtime authority.

## Dependency gates

- This is the foundation for sections 02–18; do not begin layer/feed UX until the bundled worker boots, baseline map renderer loads, and map failure leaves essential item/list content reachable.
- Required local inputs: installed MapLibre/Vite versions, focused Vitest environment, built assets. No provider secret or real Cloudflare account is needed for fixture tests.
- Real Google billing/key restrictions, provider licensing, current deployed build, Cloudflare tunnel/binding and public-browser verification remain final external evidence gates. Do not mark them passed based on this section's local tests.

## Safety and review criteria

- Do not weaken public projection or authorization to make markers appear. Reuse approved public geometry and Spec260 endpoint access classes.
- Ensure map style/tile URLs cannot inject credentials into logs, DOM text, analytics or error toasts. No sensitive exact coordinates enter public output or telemetry.
- Do not persist or prefetch Google map tiles; preserve Google restrictions and attribution.
- Confirm fallback uses authorized public emergency data and labels freshness/coverage. Never present cached stale data as current.
- Review touched dirty files before edits; avoid resetting/stashing/overwriting unrelated changes. Do not create a second route, provider config store or job queue.

## Completion evidence

- Focused map renderer, provider resolver, shared route-manifest and Cloudflare proxy tests pass.
- A production build proves the worker asset is emitted and its URL resolves. Browser evidence records viewport, build identity, worker/config/tile requests, attribution, visible overlay/list outcome, and any fallback/error state.
- Existing map route renders without console worker/module errors; a provider failure remains usable through the list/text fallback.
- Report separately: local automated proof, local browser proof, and outstanding real-provider/Cloudflare/deployment gates. A missing external credential or environment is a named gate, not PASS.

## UI/UX Contract

### Target User / JTBD
Public emergency-map visitors need a dependable situational view and a usable text alternative when any provider or map asset fails.

### Surface Inventory
- Existing `/disaster/map` public route and `EmergencyRoutePage`.
- Existing `EmergencyPublicMap`, public item list, map status and provider attribution.

### Component Map
Reuse `EmergencyPublicMap` and current map/list projection. Keep renderer, provider, public-data and attribution states separate; no duplicate map route or provider authority.

### State Matrix
Loading, rendered, empty-with-coverage, partial, stale, renderer failure, provider failure and data failure each retain distinct copy. Provider failure must leave the public item list usable.

### Responsive Matrix
Verify 390x844, 768x1024 and 1440x900 plus 360x800, 1024x768 and 1280x800; map controls, status and text list remain reachable without horizontal overflow.

### Accessibility Acceptance
Provide keyboard-accessible map controls, visible focus, non-map item navigation, descriptive status announcements, text labels for attribution/freshness and no color-only meaning.

### Copy Contract
Thai and English distinguish map rendering health, provider connectivity and emergency-data coverage. Never claim no incidents or safety because the map/provider failed.

### Browser Evidence Required
Record build identity, worker URL/MIME/load, map canvas, tile/config outcomes, overlay/list, attribution and fallback states at mobile/tablet/desktop sizes.
