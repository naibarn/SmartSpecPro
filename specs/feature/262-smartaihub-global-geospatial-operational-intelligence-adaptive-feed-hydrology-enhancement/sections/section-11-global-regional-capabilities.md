# Section 11 — Global/Regional Capability Registry and Coverage-Adaptive Product

**Status:** planned. **Dependencies:** Section 02 trusted ingress, geo references and route/audience contracts; Section 06 source/provider lifecycle; Sections 07–10 domain capabilities and typed provenance. Sections 12–16 consume regional coverage, localization, watches, disclosure and administration contracts. **Ownership:** shared capability schemas/resolvers and pack manifests under `packages/shared/src/geo/` plus server registry/projection modules. DB/schema/migrations/journal, cross-cutting API/route contracts and executor registration remain conductor-serial owned.

## Outcome and boundaries

Provide one `GLOBAL_CORE_PACK` and versioned regional intelligence packs, including the first Thailand pack, with capability coverage resolved by geography finer than country (country, admin1/province, admin2/district, basin/sub-basin and provider-specific coverage). Map/weather availability must remain useful if hydrology/local news is absent. The feed adapts to the capabilities actually enabled for that area and shows gaps; empty or missing provider data never implies no events. A coverage bias metric may describe product/data sparsity but must not become a person/community trust score.

Do not fork frontend architecture per region. Regional pack activation is explicit and versioned and requires rights, schema contract, localization, freshness and operational evidence. Do not advertise a capability from a provider candidate URL, country-level average, stale metric or a configured secret alone. Keep tenant/jurisdiction/residency and issuing-authority rules intact, especially for cross-border routes, partner exchange and recovery.

Spec260 owns public/operations disclosure, route authority, identity, source provenance and audit. Existing `packages/shared/src/geo/capabilityResolver.ts` and `providerResolver.ts` are the reusable baseline; inspect and extend compatible contracts instead of creating a second resolver. Section 16 owns provider admin UI/credential rotation. A durable capability registry is only added through the conductor's serial migration decision if versioned state cannot be safely derived from existing approved source/pack manifests.

## Tests first

Add tests before resolver, manifest or projection changes:

1. `packages/shared/src/geo/capabilityResolver.test.ts` (extend existing): country-only Map+Weather pack remains usable; region/province can be degraded independently of country average; resolve capability through lat/lng → country → admin1 → admin2 → basin/sub-basin → provider geometry; more-specific valid coverage wins with deterministic conflict policy; mismatched/expired pack versions, unknown geography and invalid CRS fail to explicit unknown; boundary revision and jurisdiction changes invalidate stale resolution.
2. `packages/shared/src/geo/regionalPackManifest.test.ts` (new): strict schema/version compatibility; required adapter, capability, geography, data policy, legal/redistribution, localization, cadence, fallback, quality and disclosure metadata; explicit activation version; rollback/deactivation; unknown capability or unsupported dependency rejected; no frontend-specific implementation requirement for onboarding a new region.
3. `packages/shared/src/geo/coverageProjection.test.ts` (new): `AVAILABLE`, `PARTIAL`, `DEGRADED`, `NOT_CONFIGURED`, `NOT_SUPPORTED`, `TEMPORARILY_UNAVAILABLE`; global baseline plus local supplementation does not claim street/local-hydro coverage; clear `coverage=unknown/partial/unavailable` distinct from zero matches; no source/coverage leakage across tenant/jurisdiction; provider health aggregates by relevant area and capability, not only country.
4. `apps/web/server/services/__tests__/geoCapabilityRegistry.test.ts` (new): source-rights and cadence transitions, per-province degradation despite healthy national average, pack activation revision and audit, authorization/residency/jurisdiction constraints, bounded geography resolution, cache/cursor invalidation after pack or boundary revision, and safe fallback to core capabilities.
5. `apps/web/server/services/__tests__/adaptiveCapabilityFeed.test.ts` (new): deep and limited-country feed composition, capability-adaptive ranking, broad zoom suppresses street-level noise, authoritative warning in sparse area remains visible, unsupported hydro explicitly says “not connected”; empty set with partial/unknown coverage is not “no incident”; no raw-report-count trust ranking; query/time/candidate budgets preserve unrelated viewports.
6. UI contract tests in `apps/web/client/src/components/emergency/__tests__/DataCoveragePanel.test.tsx` (new) and existing map/feed page tests: independent status per capability/geography, bilingual source/freshness/limitations, loading/empty/partial/degraded/stale/unavailable, country-only product usability, keyboard/semantic rows, no horizontal overflow, and map/list/chat continue using existing surfaces.
7. Global geometry tests: antimeridian split/wrap-aware query, geodesic distance/area policy, polar geometry, CRS and boundary version mismatch. Reuse the shared geo test suite and do not duplicate Section 02/04 implementation.

Trace acceptance for map/weather-only country, explicit missing hydrology, low-zoom sparse authoritative warning, per-province SLO, snowmelt-specific capability, pack version activation, authority matrix and residency-aware recovery. Section 18 verifies integrated product behavior.

## Contracts and implementation paths

Extend existing `packages/shared/src/geo/capabilityResolver.ts` and `providerResolver.ts`; add:

- `regionalPackManifest.ts`: versioned `RegionalIntelligencePack` and `GLOBAL_CORE_PACK` contract. A manifest declares adapters/source refs; capability and `HydroDriverType` support; geographic scopes; legal/redistribution policy refs; language/name metadata; refresh/cadence; fallback; quality/coverage disclosures; jurisdiction/residency and required dependency versions. Runtime secrets and mutable health never live in the static manifest.
- `coverageResolver.ts`: typed `GeographicCapabilityCoverage` with states `AVAILABLE`, `PARTIAL`, `DEGRADED`, `NOT_CONFIGURED`, `NOT_SUPPORTED`, `TEMPORARILY_UNAVAILABLE`; providers, limitations, last-updated and evidence/policy revision. Resolve hierarchy from exact position through administrative and basin/provider geometry. Do not use country-only approximation for safety-relevant claims.
- `coverageProjection.ts`: bounded, audience-safe view for feed/map. Separate capability configured, source healthy, data fresh and result returned. Missing/partial/unavailable remains explicit; empty response does not mean there are no incidents. Aggregate without exposing private coverage geometry or tenant-source details.
- Reuse/extend `packages/shared/src/geo/capabilityResolver.test.ts` and exports following the current shared package convention. Preserve current Google/MapLibre provider selection semantics; map renderer health is not geospatial intelligence coverage.

Create server services `apps/web/server/services/geoCapabilityRegistry.ts` and `coverageProjectionService.ts` (new) to combine static, approved pack manifest data with current source health/rights and geographic registry revisions. Validate pack activation through an authorized operator workflow and record version/audit using Spec260 authority. If durable lifecycle state is required, submit a minimal additive schema proposal to the conductor; do not make up a second source/provider registry. Use existing approved tenant/source records and Section 06 health.

Extend the existing bounded adaptive feed service/route owned by Section 04 only through a coordinated contract: one response carries per-area coverage metadata and bounded page/projection revision, and server audience/jurisdiction is derived from identity/configuration, never a client-supplied “mode”. Route definitions stay in `packages/shared/src/emergencyRouteManifest.ts`; Cloudflare is authenticated ingress/transport and Linux Express remains the canonical platform API/data authority. Both paths must have matching contract tests, without Cloudflare-only provider fetching or duplicate DB/job logic.

Add `apps/web/client/src/components/emergency/DataCoveragePanel.tsx` (new, unless an existing component is discovered during implementation) beside the existing map/feed on `/disaster/map`. Show relevant coverage by capability (map, weather, alerts, routes, local emergency, hydrology, local news/community) with state, area, update time and limitations. Use common feed UI ownership; no second app shell or chat page. Ask AI uses the existing `FeedbackButton` / `ChatView` one-turn removable context via Section 02/13, without auto-send. Provider credentials and pack lifecycle admin controls belong to Section 16.

## Capability-adaptive behavior and data safety

- `GLOBAL_CORE_PACK` supplies only confirmed global baseline capabilities. A regional source may add coverage; it cannot cause a global provider's coarse data to masquerade as street-level/local emergency or hydrology data.
- Capability is multidimensional: actual geography/resolution, supported hazard drivers, data class, legal purpose/redistribution, current source health/freshness, language, jurisdiction and residency. “Hydrology” alone is insufficient; unsupported snow/ice/coastal/urban-drainage drivers must be named when material.
- Use source independence/correlation and authoritative issuing jurisdiction; overlapping warnings remain separate with distinct authority. Route/cross-border availability cannot assume checkpoint passage or partner jurisdiction authority.
- Pack activation/replacement is immutable/versioned, audited, and invalidates derived coverage/feed cursors/cache. Resolution is deterministic against a geographic boundary and manifest revision. Preserve old revisions for replay/attribution and safe rollback.
- Coverage does not become a user/community trust score, service quality claim or probability of safety. Sparse places retain high-authority warnings; rank with source authority, severity, recency, uncertainty and explicit coverage.
- Keep spatial queries bounded and indexed. Antimeridian/polar/CRS handling must use shared global normalization policies. Malformed geometry is isolated and cannot break valid areas.
- Respect data residency and tenant/jurisdiction policy on acquisition, projection, export, backup and recovery. Do not expose exact source/tenant coverage geometry publicly. No new scheduler, queue, worker runtime or migration is assumed here.

## UI/UX Contract

### Target User / JTBD
Authorized public users and emergency operators need this section’s bounded capability through the existing map/feed and approved operator surfaces.

### Surface Inventory

| Surface | Existing integration | Section 11 behavior |
|---|---|---|
| Public emergency map/feed | `/disaster/map`, existing map + adaptive feed | Place a compact, area-specific coverage panel near the feed; do not add a route. |
| Existing AI Chat & Feedback | `FeedbackButton` / canonical `ChatView` | Explain selected-area limitations via removable scoped context; never auto-send. |
| Dashboard/admin | Existing Spec260 dashboard/menu and Section 16 admin | Authorized pack/rights/health controls stay with Section 16; show only public-safe status here. |

### Component Map

| Component/service | Ownership |
|---|---|
| `coverageResolver.ts`, `coverageProjection.ts`, `regionalPackManifest.ts` | Shared static pack/capability contracts and safe resolution. |
| `geoCapabilityRegistry.ts`, `coverageProjectionService.ts` | Server-approved versions, geography and live health projection. |
| `DataCoveragePanel.tsx` | Public-readable capability rows and limitation details using existing page integration. |
| Existing `EmergencyRoutePage` / `EmergencyPublicMap` | Compose panel with map/feed and preserve selection/focus; route remains unchanged. |

### State Matrix

| State | Required presentation |
|---|---|
| Loading | Stable panel skeleton/label distinct from map renderer loading. |
| Available | Capability and supported area/source update time are explicit. |
| Partial/degraded | Show what is missing and affected subregion/driver; do not hide healthy capabilities. |
| Stale/unavailable | Mark age/status and retain safe last-known projection where policy permits. |
| Not configured/not supported | “Not connected/not supported for this area”; never “no incidents.” |
| Empty results | Say “no matching records in available coverage” with coverage state. |
| Unauthorized | Omit restricted provider/tenant details. |

### Responsive Matrix

| Viewport | Required behavior |
|---|---|
| 390x844 mobile | Compact expandable rows, no map-control obstruction; essential coverage limitation remains visible. |
| 768x1024 tablet | Panel readable beside/below map/feed and accessible without losing selection. |
| 1440x900 desktop | Compact scannable summary with details available on demand. |
| 360x800, 1024x768, 1280x800 | Verify wrapping, scroll ownership and no horizontal overflow. |

### Accessibility Acceptance

- Use semantic list/table-like rows with labels for capability, geography, state and updated time; keyboard can expand details and return focus.
- Use text/icons/semantics in addition to color; announce only material coverage state changes.
- Provide a nonvisual summary equivalent to map coverage overlays; respect reduced motion and focus order.

### Copy Contract

- Thai and English, concise and factual. Distinguish “not connected”, “not supported”, “temporarily unavailable”, “partial coverage” and “no matching records in available coverage.”
- Identify the area/time basis and material limitation. Never imply all-clear from unconfigured, stale, empty or unavailable data.
- Do not expose provider secrets, private tenant coverage or raw adapter errors.

### Browser Evidence Required

Section 18 verifies Map+Weather-only usability, missing hydrology disclosure, one degraded province with healthy country average, stale/unavailable/empty states, new pack version invalidation, bilingual keyboard use and no overflow at mobile/tablet/desktop. Linux and Cloudflare ingress must return equivalent canonical coverage contracts.

## Completion evidence and external gates

Local completion requires manifest/schema/version tests, geographic hierarchy/boundary revision tests, per-capability partial health, safe adaptive feed tests, bilingual/accessibility UI tests and Linux/Cloudflare ingress parity. Record local proof separately from live provider/coverage and production evidence. Production pack activation requires named owner approval, verified provider access/terms/redistribution, fresh contract fixtures, residency/jurisdiction review, calibrated capability SLOs and explicit version. Country rollout, production registry migration, actual Cloudflare deployment and partner exchange remain external gates.
