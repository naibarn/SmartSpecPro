# Section 04 — Viewport-Adaptive Feed and Spatial Focus

**Dependencies:** Section 02 (trusted ingress/audience and shared route/API contracts), Section 03 (map state, controls and accessible map/list surface), and Section 06 (canonical source acquisition and references). **Owner:** conductor for shared API/contracts; frontend/backend work may be split only after these contracts are frozen. **Status:** planned.

## Outcome

The existing `/disaster/map` page has a bounded feed whose default spatial focus follows the user's settled map viewport. It does not issue a request for every drag frame, does not treat the visible rectangle as the only relevant geography, and never interprets an empty result or missing coverage as “no incidents.” The existing EmergencyRoutePage, EmergencyPublicMap and Spec260 route manifest remain the entry point and route authority. This section adds feed behavior to those existing surfaces; it does not create a second map route, feed identity system or audience selector.

## Existing integration points and ownership

- `packages/shared/src/emergency/mapBounds.ts`: current bounded public viewport parsing and client serialization. Extend with pure focus-envelope, viewport-overlap and zoom-class helpers only where the existing functions cannot represent the new contract; preserve current API callers.
- `packages/shared/src/emergencyRouteManifest.ts`: existing `public.map.list` route is `/api/public/emergency/map`. Add a separate manifest entry only if the final feed query cannot safely share that endpoint's public map contract. Keep method/path/access/cache metadata in this single manifest.
- `apps/web/server/routes/spec260EmergencyEdge.ts`: current `public.map.list` validates bounds, rate-limits by tenant/IP and returns a capped public projection of situations, facilities and alerts. Keep the current projection stable while adding a distinct typed feed endpoint or a versioned, additive response member. Enforce audience, tenant/jurisdiction scope, authorization and public geometry generalization on the server; ignore client-provided audience/map mode as an authority.
- `apps/web/client/src/components/emergency/EmergencyPublicMap.tsx`: owns MapLibre map lifecycle, current request abort and the map item callback. Emit a normalized viewport intent only after map load/moveend; keep render/tiles/attribution failure independent from feed retrieval failure.
- `apps/web/client/src/pages/EmergencyRoutePage.tsx`: existing public map page. Compose the feed/digest beside or below the map and preserve map state while feed controls are used. Reuse existing search and route/action patterns; do not duplicate the map, chat, or task UI.
- `apps/web/client/src/locales/th/emergency.json` and `apps/web/client/src/locales/en/emergency.json`: all new labels, focus choices, loading/partial/stale/error/empty-with-coverage states and accessibility descriptions must have Thai/English parity.
- Tests to create: `packages/shared/src/emergency/feedFocus.test.ts` (or colocate additions in `mapBounds.test.ts` if no distinct helper is needed); focused route tests under `apps/web/server/routes/__tests__/spec260EmergencyEdge.test.ts` or the existing route test file discovered during implementation; `apps/web/client/src/components/emergency/__tests__/EmergencyAdaptiveFeed.test.tsx` and page integration coverage under `apps/web/client/src/pages/__tests__/EmergencyRoutePage.test.tsx` (match repository test conventions before creating duplicates).

## Contract

### Focus input and normalization

Define a shared, versioned `FeedFocusRequest` with:

```ts
interface FeedFocusRequest {
  viewport: { west: number; south: number; east: number; north: number };
  zoom: number;
  mode: "FOLLOW_MAP" | "CURRENT_LOCATION" | "SAVED_AREA" | "SELECTED_AREA" | "ROUTE_CORRIDOR";
  focusRef?: CanonicalDomainRef;
  cursor?: string;
  limit?: number;
}
```

The API schema MUST bound coordinate ranges, Mercator latitude, finite zoom, viewport dimensions/area, cursor length and page size. Normalize/validate CRS explicitly as WGS84/EPSG:4326 for this endpoint. Reject malformed, inverted, nonfinite, excessively large or unsupported geometry with a stable client-safe error; never coerce invalid coordinates to zero. Handle antimeridian-crossing viewports by canonical splitting/union or return a documented validation error until the query layer supports it; never silently return a different area. Polar inputs beyond the map projection limit must be rejected or safely clamped by the shared contract, consistently on both client and server.

`ViewportZoomClass` is `SITE | NEIGHBORHOOD | DISTRICT | PROVINCE | REGION | COUNTRY | CONTINENT`. Thresholds are server-owned/versioned configuration, not UI constants or provider guesses. The resolved class controls candidate detail and aggregation: street/local records at high zoom; district summaries at district zoom; province/regional hazards at broad zoom. Broad zoom MUST aggregate low-level observations rather than enumerate them.

`FeedFocusEnvelope` MUST retain a primary geometry plus typed focus source/zoom class and authorized impact extensions. Spatial candidates are classified as `IN_VIEWPORT`, `AFFECTS_VIEWPORT` or `CRITICAL_OVERRIDE`. The viewport is the default primary focus, not a hard exclusion boundary: eligible official alert scope, connected upstream/downstream hydro impact, approaching weather, route dependency and critical regional event may enter with explicit relevance reason codes. This section consumes canonical relation/source facts from Sections 06–10; it must not invent impact relations or duplicate their authorities.

### Stabilization and refresh behavior

Implement a pure `ViewportIntentStabilizer` (or equivalent hook/service pair) that:

1. waits until map load or `moveend`, then debounces rapid settled changes with a bounded delay;
2. compares normalized bounds/zoom with the last accepted focus by overlap and zoom class, suppressing requests for insignificant movement;
3. cancels/aborts superseded requests and ignores late responses using a monotonically increasing request generation;
4. requests cursor-based bounded pages/deltas, returning `nextCursor`, `hasMore`, `coverage`, `truncated`, `projectionRevision` and server freshness metadata;
5. preserves the user's feed scroll position when data refreshes; if the refresh adds relevant items, show a “new items for this area” affordance that the user activates to update/reposition;
6. supports focus lock. When locked, map panning does not change the feed focus; show the locked focus and provide explicit Follow map area / Unlock action. Focus options remain available for current location, saved area, selected area and route corridor only when their canonical reference is present and authorized.

Use existing route/API authorization and public projection. Public callers receive only the public-safe projection. An authenticated/operations projection, if required, is a separate server-authorized scope and response contract; do not use a query parameter to elevate public access. Every page/cursor is bound to the resolved tenant, audience, filter/focus hash and projection revision. Re-resolve and authorize stable refs on every request; cursors/ref IDs are not capabilities.

### Empty, partial and failure semantics

Feed response MUST distinguish `coverage=complete|partial|unknown|unavailable`, current/stale source coverage, and result truncation. Empty results with unknown/partial coverage render “No matching items in the available coverage” plus the gap; they MUST NOT render “No incidents.” Network/API failure retains the last safe projection with its original freshness timestamp and visibly marks it stale/unavailable. Map basemap/worker errors do not erase a successfully fetched list; feed errors do not destroy the map. No personal location or exact protected geometry enters public requests, analytics, or logs.

## Tests first

Implement these focused tests before changing behavior:

1. **Geometry/focus pure tests:** ordinary bounds; finite/range validation; inverted and overlarge extent rejection; antimeridian behavior; Mercator latitude boundary; invalid CRS; zoom-class boundary determinism; focus mode/ref validation; viewport overlap threshold and tiny pans; exact suppression/acceptance at boundary values.
2. **Stabilizer tests:** burst of pan/zoom produces one request; insignificant movement produces none; meaningful area/zoom change refreshes; locked focus ignores map movement; unlock resumes following; abort of prior request; out-of-order response is ignored; scroll anchor is retained; new items are surfaced without forced scroll.
3. **Server contract tests:** malformed bounds, huge geometry, invalid cursor/page limits and unsupported mode fail closed; bounded result count and stable cursor; public response contains only public-projection refs/generalized geometry; user-supplied audience/tenant/purpose cannot elevate access; stale ref/cursor and changed authorization are denied or recomputed; rate limiting and partial/truncated metadata are deterministic; canonical Spec260 map response remains backward compatible.
4. **UI tests:** mobile/tablet/desktop render map plus digest/feed without horizontal overflow; focus selector and lock state are keyboard accessible; focus controls do not reset map or route state; loading, empty-with-gap, partial, stale, unavailable and truncated states have distinct copy; screen-reader status describes focus and result changes; map failure keeps the textual feed available and feed failure keeps the map mounted.
5. **Ingress contract tests:** Linux Express and Cloudflare proxy resolve the same manifest path/schema and preserve authorization/error/status semantics. Cloudflare remains transport to the canonical platform service; no Workers-only duplicate feed authority is introduced.

## Implementation sequence

1. Inspect existing diffs and tests in the owned paths, then freeze the typed endpoint shape with Section 02 and the source/ref/audience aliases. Preserve public map response compatibility.
2. Add the pure shared focus request validation, zoom-class policy interface and viewport stabilization/overlap helpers. Add unit tests first, including antimeridian/polar/error boundaries. Keep threshold values injectable/versioned for deterministic testing.
3. Extend the Spec260 route manifest only if needed, then implement a bounded feed query/projection on the canonical Express route layer. Reuse existing safe geometry helpers, tenant scope, rate limit and projection policies; do not add raw source geometry or query every domain table unboundedly. Query planning must use spatial indexes and an explicit maximum candidate budget. Return completeness/freshness and cursor metadata; hold authorization constant across pages or invalidate the cursor.
4. Implement the client stabilizer and feed panel/card-list projection integrated with `EmergencyPublicMap` and `EmergencyRoutePage`. Keep independent loading/error state. Preserve current map viewport, selection and scroll position during refresh; add focus controls and “new items” action.
5. Add Thai/English strings, semantic headings/live status, keyboard operation and list-first mobile layout. At 390x844 the digest and controls must be usable without covering essential map controls; at 768x1024 and 1440x900 map/feed must remain jointly readable. Also inspect 360x800 and 1024x768 for overflow/collapsed side panels.
6. Run focused shared/server/UI tests and build the frontend asset bundle. Verify emitted MapLibre worker and basemap separately from feed requests; a successful credential check alone is not feed/map evidence. Capture local browser evidence for settled viewport refresh, focus lock, map/list independence and all degraded/empty states.

## Data and privacy rules

- No migration is required for viewport stabilization, request cursors or UI focus lock when state is transient. If saved-area/watch persistence is needed, defer its storage to the owning later section; do not add an uncoordinated table here.
- Use canonical event/source/verification/freshness/geometry references, extending shared aliases only through a coordinated additive change. Do not create duplicate incident, source, event, watch or public-geometry authority.
- Use separate public and authorized projections. Generalize public geometry with Spec260 policy before spatial result projection; never rely on the client to hide sensitive records.
- Query limits, rate limits, cancellation and anti-enumeration behavior apply to every viewport/delta/page request. Do not log exact private focus geometry or personal location.
- Empty/unknown coverage and stale feeds are visible states. A new feed item is not automatically a verified event and cannot trigger operational actions without the relevant capability/freshness gate.

## Exit evidence and gates

Section completes when local tests prove bounded geometry, stable focus, refresh suppression, cursor/projection authorization, public disclosure safety, map/feed independence, bilingual/accessibility states and Linux/Cloudflare route-contract parity. Record test commands/results and browser viewport evidence in the implementation ledger. Real Cloudflare/account, production provider, live license/coverage and production database evidence remain final environment gates; do not claim them from local mocks or a credential test.

## UI/UX Contract

### Target User / JTBD
Public visitors need relevant emergency information for the area they are viewing, with clear controls to lock, change or follow the spatial focus.

### Surface Inventory
Extend only the existing `/disaster/map` map/list page with a digest, bounded feed, focus control, freshness/coverage status and item details.

### Component Map
`EmergencyRoutePage` composes feed and map; `EmergencyPublicMap` emits settled viewport intent; shared focus helpers normalize it; existing text list remains the accessible equivalent.

### State Matrix
Loading, complete, partial, unknown coverage, empty-with-coverage, stale, truncated, locked focus, unavailable and new-items-pending are distinct. Map and feed errors do not remove the other surface.

### Responsive Matrix
At 390x844 prioritize compact digest and scrollable list; at 768x1024 use a readable sheet/split view; at 1440x900 show map plus feed. Check 360x800, 1024x768, 1280x800 for overflow/control occlusion.

### Accessibility Acceptance
Keyboard-operable focus selection/lock, synchronized list, semantic announcements only for material updates, retained scroll anchor, reduced-motion camera changes, and textual spatial relevance.

### Copy Contract
Name selected area and available coverage. Empty means no matching items in known coverage; partial/unknown must explain the gap, never say safe/no incidents.

### Browser Evidence Required
Capture focus follow/lock/unlock, one debounced settled pan, pending new-items affordance, error/stale/partial states, map/list independence and responsive keyboard behavior.
