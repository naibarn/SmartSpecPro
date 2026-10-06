---
spec_id: 290
previous_draft_ids:
  - 274
renumber_reason: SPEC_ID_COLLISION
numbering_status: RENUMBERED_FROM_274_AFTER_CANONICAL_AUTHORITY_REVIEW
canonical_title: SmartAIHub Longdo Map Migration, Google Maps Decommission & Map Cost-Safety Control
revision: R1.1
recovery_note: Spec 274 remains Canonical Executable Artifact Manifest; this Longdo document was renumbered without changing functional scope.
---

# Spec 290 — SmartAIHub Longdo Map Migration, Google Maps Decommission & Map Cost-Safety Control

**Status:** Implementation-ready — R1.1 after 15-pass gap review  
**Revision:** R1.1 / 2026-10-03  
**Spec type:** Additive platform migration / map-provider replacement / FinOps safety / production decommission  
**Primary systems:** SmartAIHub Web, Public Experience, Emergency Data Commons, Spatial Intelligence, Mini Apps, Cloudflare runtime, SmartAIHub Desktop/Runner  
**Related specs:** Spec 224, Spec 260, Spec 263, Spec 264, Spec 266, Spec 267, Spec 269, Spec 271, Spec 272, Spec 273 and all existing map/location-dependent features  
**Canonical provider after cutover:** Longdo Map  
**Provider state after cutover:** Google Maps Platform = REMOVED from production execution paths  
**Normative language:** MUST, MUST NOT, SHOULD, SHOULD NOT, MAY are normative requirements.

---

# 1. Executive Decision

SmartAIHub SHALL replace Google Maps Platform with Longdo Map as the canonical production map/location provider.

This is not a "change the default provider" project.

It is a **complete Google Maps Platform decommission** from SmartAIHub's production map stack.

After completion:

```text
SmartAIHub Map / Spatial Features
            |
            v
     Map Capability Port
            |
            v
        LONGDO ONLY
            |
     +------+-------+---------+---------+
     |              |         |         |
   Map UI          Search   Geocode    Route
  / Basemap         /POI    /Reverse   Services
```

The following production architecture is explicitly forbidden:

```text
Longdo -> error -> Google fallback
```

and:

```text
provider=auto
provider=google
provider=[longdo,google]
```

SmartAIHub MUST prefer a temporary degraded experience over silently falling back to a provider that can create unbounded or delayed-recognition usage charges.

The economic/safety principle is:

> **A temporary map degradation is safer than an uncontrolled paid-provider fallback.**

Google Maps Platform MAY remain referenced in historical migration evidence, archived documentation, test fixtures, or source-control history, but MUST NOT remain callable from production runtime after decommission.

---

# 2. Why This Spec Exists

SmartAIHub is a multi-tenant platform with public pages, AI agents, background tasks, Mini Apps, emergency/disaster features, spatial intelligence and potentially large or bursty traffic.

A map provider charged by usage introduces several risks:

- a public page can generate unexpected map loads;
- bot traffic can create billable usage;
- a frontend regression can reload maps repeatedly;
- an agent or workflow can execute expensive map/location calls in a loop;
- a tenant can create disproportionate usage;
- emergency events can create sudden traffic bursts;
- leaked or insufficiently restricted credentials can create abuse;
- delayed billing visibility can make cost detection late;
- retry storms can amplify service transactions;
- an automatic fallback can hide an outage while producing a large bill.

Google Maps Platform documents a pay-as-you-go model and states that a Cloud Billing budget is an alerting target rather than an automatic spending cap. Quotas can be used to cap API usage, but billing and quota reporting can differ and finalized billing data may have latency.

SmartAIHub therefore chooses to eliminate Google Maps Platform from the production map path and adopt a platform-owned cost-control layer around Longdo.

---

# 3. Current Longdo Assumptions

The implementation SHALL be based on current Longdo capabilities, but MUST isolate provider-specific behavior behind SmartAIHub contracts.

As of this spec revision:

- Longdo Map API 3 provides vector-tile based map functionality;
- Longdo provides JavaScript and multiple application-framework/mobile integrations;
- Longdo provides location/search and route-related services;
- Longdo pricing distinguishes Map Transactions and Service Transactions;
- the currently published Free plan lists:
  - less than 800,000 Map Transactions/month;
  - less than 100,000 Service Transactions/month;
  - 60 requests/minute;
  - 5,000 requests/day;
- Longdo's current API terms describe a free-threshold behavior under which excess use can lead either to a commercial subscription or no further data until the next month, with service suspension selected automatically if the provider cannot contact the customer.

These are provider facts, not permanent SmartAIHub invariants.

SmartAIHub MUST NOT hard-code commercial thresholds into application business logic.

Thresholds MUST be configuration data.

---

# 4. Core Architectural Principle

The canonical SmartAIHub contract is NOT:

```text
Google Maps SDK
Longdo Map SDK
MapLibre SDK
```

The canonical contract is:

```text
SmartAIHub Spatial UI / Domain Features
                  |
                  v
          Map Capability Port
                  |
                  v
          Provider Adapter
                  |
                  v
              Longdo
```

Domain code MUST NOT depend directly on the Longdo SDK except inside the provider adapter/presentation integration boundary.

This prevents the new migration from replacing Google lock-in with Longdo lock-in at the application/domain layer.

---

# 5. Scope

Spec 290 covers:

1. discovery of all Google Maps Platform dependencies;
2. Longdo Map integration;
3. migration of map presentation;
4. migration of place/search functions;
5. migration of geocoding;
6. migration of reverse geocoding;
7. migration of routing;
8. migration of map overlays and application-controlled layers;
9. migration of public and authenticated map surfaces;
10. migration of map-dependent Mini Apps;
11. migration of emergency/disaster map surfaces;
12. migration of background jobs and agent tools;
13. Longdo credential handling;
14. transaction telemetry;
15. map cost guards and quotas;
16. tenant-level usage policy;
17. degraded map behavior;
18. production cutover;
19. Google API shutdown;
20. Google credential deletion/revocation;
21. removal of Google map packages/configuration;
22. egress protection against accidental reintroduction;
23. CI/static scanning for forbidden Google map dependencies;
24. UAT and production verification;
25. evidence required before declaring decommission complete.

---

# 6. Non-Goals

Spec 290 does NOT:

- replace SmartAIHub's canonical spatial/domain data with Longdo-owned data;
- migrate SmartAIHub incident, route history, ambulance, shelter, hazard, user, asset or tenant data into Longdo;
- make Longdo the System of Record for emergency/disaster information;
- require every spatial calculation to be executed by Longdo;
- prohibit PostGIS/PostgreSQL or SmartAIHub-owned geospatial calculations;
- prohibit MapLibre from being used internally where it is not connected to Google content and where licensing/architecture permits it;
- require unsupported direct access to Longdo tile endpoints;
- proxy or cache Longdo content unless the Longdo contract explicitly permits it;
- preserve Google Maps as an automatic fallback;
- preserve Google Places/Routes/Geocoding "just in case";
- alter unrelated Google services used elsewhere in SmartAIHub;
- close a Google Cloud billing account that is used by non-map workloads;
- rewrite Specs 260/264/266 wholesale.

---

# 7. Canonical Provider Policy

Production configuration MUST resolve to:

```yaml
map:
  canonical_provider: longdo
  allowed_providers:
    - longdo
  automatic_paid_fallback: false
  google_maps:
    enabled: false
    supported_in_production: false
```

A production build MUST fail admission when:

```text
canonical_provider != longdo
```

or:

```text
allowed_providers contains google
```

or:

```text
automatic_paid_fallback == true
```

---

# 8. Provider-Neutral Capability Contracts

SmartAIHub SHALL define explicit capability contracts.

Minimum required contracts:

```ts
interface MapRendererPort {
  mount(container: HTMLElement, options: MapInitOptions): Promise<MapHandle>;
  unmount(handle: MapHandle): Promise<void>;
  setCenter(handle: MapHandle, point: GeoPoint): Promise<void>;
  setZoom(handle: MapHandle, zoom: number): Promise<void>;
  fitBounds(handle: MapHandle, bounds: GeoBounds): Promise<void>;
  addMarker(handle: MapHandle, marker: MapMarker): Promise<MapObjectId>;
  addPolyline(handle: MapHandle, line: MapPolyline): Promise<MapObjectId>;
  addPolygon(handle: MapHandle, polygon: MapPolygon): Promise<MapObjectId>;
  removeObject(handle: MapHandle, id: MapObjectId): Promise<void>;
}
```

```ts
interface PlaceSearchPort {
  search(request: PlaceSearchRequest): Promise<PlaceSearchResult>;
  suggest(request: PlaceSuggestRequest): Promise<PlaceSuggestion[]>;
}
```

```ts
interface GeocodingPort {
  geocode(request: GeocodeRequest): Promise<GeocodeResult[]>;
  reverseGeocode(request: ReverseGeocodeRequest): Promise<ReverseGeocodeResult>;
}
```

```ts
interface RoutingPort {
  computeRoute(request: RouteRequest): Promise<RouteResult>;
}
```

Domain features MUST consume these ports rather than provider SDK methods.

---

# 9. Longdo Adapter Set

Minimum implementation SHALL include:

```text
LongdoMapRendererAdapter
LongdoPlaceSearchAdapter
LongdoGeocodeAdapter
LongdoReverseGeocodeAdapter
LongdoRoutingAdapter
LongdoUsageTelemetryAdapter
LongdoCredentialBinding
LongdoHealthProbe
```

Provider-specific response types MUST NOT leak beyond the adapter boundary.

All external data returned into SmartAIHub domain code MUST be normalized into canonical SmartAIHub types.

---

# 10. Longdo Map API Version

New web implementation SHOULD target **Longdo Map API 3** where capability and licensing fit because it is the current vector-tile generation offered by Longdo.

Older Longdo API generations MUST NOT be selected merely because examples are easier to find.

Any exception MUST include:

- capability reason;
- compatibility reason;
- lifecycle risk;
- migration path to the supported generation;
- owner approval.

---

# 11. Map Renderer Decision

The implementation team MUST NOT assume that a Longdo tile URL can simply be dropped into the current renderer.

The approved decision sequence is:

```text
1. Use Longdo's supported Map API / SDK integration.
2. Adapt SmartAIHub UI/domain calls through MapRendererPort.
3. Preserve existing application overlays through adapter translation.
4. Only use a direct Longdo tile/style integration if Longdo documentation/contract
   explicitly supports that mode for SmartAIHub.
5. Never scrape, reverse engineer, republish or cache provider content through an
   undocumented endpoint.
```

If the current SmartAIHub map UI uses MapLibre:

- MapLibre-specific domain assumptions MUST be extracted behind `MapRendererPort`;
- existing overlay/source/style objects MUST be classified;
- each object MUST either:
  - translate to Longdo Map API 3;
  - remain a SmartAIHub-owned overlay supported by the Longdo renderer;
  - move to a provider-neutral overlay representation;
  - be marked unsupported with a defined replacement.

The migration MUST NOT retain Google merely to preserve a MapLibre-specific implementation shortcut.

---

# 12. Canonical Spatial Data Remains SmartAIHub-Owned

The following remain SmartAIHub canonical data:

```text
incident coordinates
hazard polygons
evacuation zones
shelter locations
hospital locations stored by SmartAIHub
ambulance positions
organ transport journeys
route requests
route alternatives
route history
reroute history
road closure data
helper locations
team locations
tracking events
user-submitted points
tenant-owned spatial layers
research/evidence spatial records
Spec 266 spatial intelligence records
```

Longdo provides map/location capabilities.

Longdo MUST NOT become the authoritative persistence layer for SmartAIHub operational state.

---

# 13. Spec 260 / Spec 264 Integration

Emergency and disaster features MUST continue to operate when the provider changes.

The map shall be treated as a presentation/navigation capability, not the emergency data authority.

Required flow:

```text
Spec 260 / 264 canonical data
          |
          v
SmartAIHub Spatial View Model
          |
          v
Map Capability Port
          |
          v
Longdo Renderer
```

Emergency features MUST NOT become dependent on a Longdo-specific object model.

---

# 14. Emergency Degraded Mode

Failure of Longdo MUST NOT make core emergency records inaccessible.

At minimum, emergency/disaster surfaces MUST retain:

- incident list;
- location names;
- coordinates where authorized;
- status;
- assigned team;
- timestamps;
- route request state;
- critical textual instructions;
- contact/action controls allowed by policy.

The system SHOULD provide a "map temporarily unavailable" state instead of hiding the entire workflow.

---

# 15. Spec 266 Integration

Canonical Data / Evidence / Knowledge / Spatial Intelligence MUST remain provider-neutral.

Spec 266 spatial entities SHOULD use canonical geometries and coordinates independent from a map vendor.

Examples:

```text
GeoJSON-compatible geometry
WGS84 latitude/longitude
provider-neutral place identifiers where possible
provider provenance as metadata rather than identity
```

Provider identifiers MAY be stored as external references but MUST NOT replace SmartAIHub canonical IDs.

---

# 16. Place/Search Migration

Every Google Places dependency MUST be inventoried.

For each use case, classify:

```text
autocomplete
text search
nearby search
POI lookup
place detail
address suggestion
category search
business/location lookup
```

Then map it to:

```text
Longdo capability
SmartAIHub canonical data
Spec 266 data source
or explicitly unsupported use case
```

No feature may silently continue calling Google Places after cutover.

---

# 17. Geocoding Migration

The implementation MUST inventory:

```text
forward geocoding
reverse geocoding
address normalization
coordinate lookup
background batch geocoding
agent-triggered geocoding
import-time geocoding
```

All runtime Google geocoding calls MUST be removed.

Longdo-specific restrictions and service transaction accounting MUST be represented in the capability manifest.

---

# 18. Routing Migration

All routing call sites MUST migrate to `RoutingPort`.

Minimum canonical request:

```ts
type RouteRequest = {
  origin: GeoPoint;
  destination: GeoPoint;
  waypoints?: GeoPoint[];
  travelMode?: string;
  avoid?: string[];
  departureTime?: string;
  tenantId: string;
  purpose: string;
  priority: "critical" | "normal" | "low";
};
```

Minimum canonical result:

```ts
type RouteResult = {
  routeId: string;
  geometry: unknown;
  distanceMeters?: number;
  durationSeconds?: number;
  instructions?: RouteInstruction[];
  provider: "longdo";
  providerRequestId?: string;
  generatedAt: string;
  limitations?: string[];
};
```

Route results MUST preserve provider/provenance metadata.

---

# 19. Route History Is Not Provider History

For Spec 260 emergency mobility:

```text
request
planned route
accepted route
progress
reroute
reroute reason
arrival
completion
```

MUST remain stored in SmartAIHub.

If a route is recomputed through Longdo, the new provider result becomes one version in SmartAIHub's route history.

The history itself MUST NOT be delegated to Longdo.

---

# 20. Google Dependency Discovery

Before migration, implementation MUST run a complete discovery scan.

Minimum source patterns:

```text
google.maps
@googlemaps/
maps.googleapis.com
maps.google.com
tile.googleapis.com
routes.googleapis.com
places.googleapis.com
roads.googleapis.com
maps.gstatic.com
GOOGLE_MAPS
GOOGLE_MAP
GOOGLE_PLACES
GOOGLE_ROUTES
GOOGLE_GEOCOD
GOOGLE_DIRECTIONS
GOOGLE_DISTANCE
GOOGLE_STREET_VIEW
```

The scan MUST cover:

```text
frontend source
backend source
Workers
containers
Desktop/Runner
mobile code
Mini App templates
Skills
MCP tools
agent tools
workflow definitions
database configuration
tenant configuration
admin settings
feature flags
.env examples
CI/CD
GitHub Actions
Cloudflare configuration
test fixtures
documentation
deployment scripts
Terraform/IaC
package manifests
lock files
generated code templates
```

A machine-readable inventory MUST be produced.

---

# 21. Google Capability Inventory

Every discovered dependency SHALL be recorded as:

```yaml
google_map_dependency:
  id: string
  repository: string
  path: string
  symbol_or_setting: string
  capability:
    - map_render
    - tile
    - places
    - geocode
    - reverse_geocode
    - route
    - distance
    - street_view
    - static_map
    - roads
    - other
  execution_plane:
    - browser
    - worker
    - container
    - runner
    - mobile
    - background_job
  production_reachable: boolean
  replacement: string
  status:
    - discovered
    - mapped
    - migrated
    - deleted
    - verified
```

Cutover is blocked while any `production_reachable=true` item is not `verified`.

---

# 22. No Google Shadow Traffic

Migration verification MUST NOT use uncontrolled production shadow calls to Google.

Forbidden:

```text
request -> Longdo
        -> Google for comparison
```

because this preserves billable traffic.

Preferred validation:

- saved historical fixtures;
- existing screenshots;
- golden route/address cases;
- deterministic test coordinates;
- staging tests with Longdo;
- provider-independent domain tests.

Any temporary live Google comparison MUST be explicitly approved, isolated, quota-capped and removed before production cutover.

---

# 23. Credential, Host-Binding & Exposure Architecture

Longdo's published API terms describe the issued API key as associated with the Longdo account and the URL/host of the service. Current Longdo documentation for key generation also asks for the website host name (or package name for mobile). The published terms additionally state that more than one key may not be obtained "for use in the Service."

Therefore SmartAIHub MUST NOT assume that it is contractually or technically valid to create arbitrary separate keys for every environment, tenant, preview domain or white-label domain.

Before production, implementation MUST classify the exact credential model with Longdo for each execution surface:

```text
browser JavaScript map
server-side REST/service calls
Android package
Apple/iOS bundle
React/Next.js web deployment
React Native/mobile deployment
SmartAIHub canonical domain
runtime.smartaihub.app or dedicated map host
tenant subdomain
custom tenant domain
preview/staging domain
public Mini App domain
```

Each credential SHALL be classified as one of:

```text
A. browser-visible host-bound key
B. mobile package/bundle-bound key
C. server-side protected credential
D. provider-issued commercial/enterprise credential with explicit scope
```

A browser-visible key MUST NOT be falsely treated as a secret. Protection MUST rely on the provider-supported host/package binding plus SmartAIHub controls such as CSP, deployment policy and abuse monitoring.

A genuinely server-side secret MUST resolve through Spec 272.

No protected secret value may be stored in:

```text
source code
Mini App package
tenant metadata
database plaintext config
logs
analytics payloads
error reports
LLM prompts
agent memory
```

## 23.1 Longdo Domain-Binding Qualification Gate

Because SmartAIHub supports multi-tenant subdomains, custom domains and white-label products, production rollout MUST NOT assume that a key created for `smartaihub.app` is valid or licensed for unrelated tenant domains.

Before enabling browser maps on a domain class, obtain documented provider behavior or written commercial confirmation for that class.

Required domain classes:

```text
smartaihub.app
*.smartaihub.app
oneaihub.app / future platform domains
customer custom domains
Mini App custom domains
preview/staging hosts
localhost/development
```

The qualification result MUST be stored as configuration/evidence:

```yaml
longdo_domain_policy:
  canonical_platform_domain: approved | rejected | pending
  tenant_subdomains: approved | rejected | pending
  tenant_custom_domains: approved | rejected | pending
  mini_app_custom_domains: approved | rejected | pending
  staging_preview_domains: approved | rejected | pending
  mobile_packages: approved | rejected | pending
  evidence_ref: string
```

`pending` MUST fail closed for production activation on that domain class.

## 23.2 Custom-Domain Strategy

SmartAIHub MUST NOT work around host binding through DNS tricks, undocumented proxies, key sharing, scraping or browser-header manipulation.

For a custom domain, the allowed strategies are only:

1. provider explicitly authorizes the same credential/domain pattern;
2. provider issues/licences a credential for that deployment model;
3. the map feature is not enabled on that domain and a degraded/non-map UI is shown;
4. a separately approved Longdo commercial architecture is implemented.

Any canonical-host embedding strategy (for example an iframe-hosted map) MUST receive a separate security, UX and provider-terms review before use; it is NOT implicitly approved by this spec.

## 23.3 Server-Side Service Broker

Search/geocode/route operations SHOULD be brokered server-side where Longdo's product/credential model permits it, so that SmartAIHub can enforce authentication, tenant quota, rate limits, request shaping and audit.

The broker MUST NOT expose a general-purpose Longdo proxy to users or Mini Apps.

---

# 24. Environment Separation Without Unsupported Key Proliferation

SmartAIHub requires logical separation between:

```text
development
staging
production
```

but MUST NOT assume separate Longdo keys are permitted unless provider rules/contract confirm this.

Environment isolation SHALL therefore use the strongest provider-supported combination of:

- approved host/package binding;
- separate Longdo credentials where explicitly permitted;
- separate SmartAIHub server-side credential aliases;
- separate internal usage budgets;
- separate feature flags;
- staging-only allowlists;
- separate telemetry dimensions;
- canonical preview host instead of arbitrary ephemeral domains where necessary.

Production credentials or host bindings MUST NOT be casually reused in local developer builds.

Ephemeral preview deployments MUST default to `map_disabled` unless their host-binding model has been explicitly approved.

---

# 25. Map Usage Guard

SmartAIHub SHALL implement a `MapUsageGuard`.

Its purpose is to prevent map/location features from creating uncontrolled consumption even when the provider is cheaper.

Required inputs:

```text
tenant
app
environment
capability
priority
estimated transaction cost
current usage
configured quota
plan allowance
time window
```

Required result:

```ts
type MapUsageDecision =
  | { action: "allow" }
  | { action: "throttle"; retryAfterSeconds: number }
  | { action: "degrade"; reason: string }
  | { action: "deny"; reason: string };
```

---

# 26. Cost-Safety Principle

SmartAIHub MUST use this order:

```text
prevent
-> meter
-> alert
-> throttle
-> degrade
-> deny
```

NOT:

```text
use first
-> discover invoice later
```

---

# 27. Map vs Service Transaction Accounting

The telemetry model MUST distinguish at least:

```text
map_transactions
service_transactions
search_requests
suggest_requests
geocode_requests
reverse_geocode_requests
route_requests
other_location_requests
```

The system MUST NOT assume every provider operation consumes one transaction.

Provider accounting rules SHALL be metadata/configuration.

---

# 28. Usage Counter Authority

Service requests routed through SmartAIHub SHOULD be metered at admission time.

For browser-rendered map tiles that are loaded directly by the supported Longdo client integration:

- SmartAIHub MUST NOT proxy tiles merely to count them unless explicitly licensed to do so;
- map-session telemetry MAY estimate expected use;
- provider-console/report data SHOULD be reconciled where accessible;
- the application MUST be capable of stopping new noncritical map sessions when configured safety thresholds are reached.

---

# 29. Internal Quota Thresholds

Default platform policy SHOULD support:

```yaml
usage_guard:
  warn_percent: 70
  elevated_warn_percent: 80
  throttle_percent: 90
  degrade_percent: 95
  hard_stop_percent: 100
```

Values MUST be configurable.

Production MAY choose more conservative thresholds.

No threshold may automatically purchase or activate a higher commercial package.

---

# 30. No Automatic Plan Upgrade

The system MUST NOT:

- auto-upgrade Longdo plans;
- accept overage pricing automatically;
- add a credit card-based fallback provider automatically;
- switch back to Google automatically.

Commercial plan changes require explicit administrator action.

---

# 31. Tenant Quotas

Because SmartAIHub is multi-tenant, usage limits MUST support:

```text
platform-wide quota
tenant quota
Mini App quota
feature quota
user quota where useful
```

A single tenant MUST NOT be able to consume the entire platform map-service allowance without policy authorization.

---

# 32. Priority Classes

Map operations SHOULD support:

```text
critical
normal
low
```

Examples:

```text
critical:
- active emergency coordination
- ambulance/organ transport route update

normal:
- interactive map opened by a signed-in user

low:
- decorative map
- background enrichment
- repeated preview
- nonessential batch task
```

When near quota limits, low-priority operations MUST degrade before critical operations.

This policy affects SmartAIHub's own admissions only and MUST NOT override provider contractual limits.

---

# 33. Retry Safety

All map/location service retries MUST be bounded.

Required:

- maximum retry count;
- exponential backoff where appropriate;
- jitter where appropriate;
- request deadline;
- retry classification;
- no retry on permanent validation/auth errors;
- loop detection;
- idempotency where applicable.

Agents MUST NOT be allowed to repeatedly retry provider calls without the same usage guard.

---

# 34. Agent / Skill / MCP Policy

Every Longdo capability exposed to AI agents, Skills or MCP MUST declare:

```yaml
capability:
  cost_class: map_service
  provider: longdo
  quota_guard_required: true
  retry_policy: bounded
  audit_required: true
```

Agents MUST NOT receive a raw unrestricted provider key merely to perform map tasks.

Server-side operations SHOULD go through a controlled broker/tool.

---

# 35. Mini App Policy

New Mini Apps created through Spec 224/256 MUST NOT generate direct Google Maps dependencies.

Generation templates MUST prefer SmartAIHub Map Capability contracts.

A generated Mini App containing a production-reachable Google Maps dependency MUST fail Final Verify.

Example forbidden imports:

```text
@googlemaps/js-api-loader
@googlemaps/google-maps-services-js
google.maps.*
```

---

# 36. Spec 224 Integration

Spec 224 MUST consume an additive Spec 290 compliance gate.

Required gate:

```text
Map Provider Compliance
```

It MUST fail when a generated/modified product:

- adds Google Maps Platform runtime dependencies;
- embeds a Google map key;
- adds a Google map URL;
- adds Google Places/Routes/Geocoding calls;
- adds a paid-provider fallback path;
- bypasses MapUsageGuard for governed service calls;
- stores Longdo server credentials unsafely.

Spec 224 itself does not need a wholesale redesign.

---

# 37. Static Forbidden-Dependency Scanner

Create a machine-enforced scanner, e.g.:

```text
map-provider-policy-check
```

It MUST inspect:

```text
source
generated source
package manifests
lockfiles
config
deployment manifests
environment templates
workflow definitions
Skill/MCP definitions
```

Output MUST be machine-readable.

Example:

```json
{
  "policy": "SPEC-290",
  "google_maps_reachable": false,
  "violations": [],
  "longdo_provider": true,
  "automatic_paid_fallback": false
}
```

---

# 38. Runtime Egress Defense

Static scanning is not sufficient.

After migration, production map workloads MUST have an egress defense against known Google Maps Platform endpoints.

The block MUST be scoped narrowly enough not to break unrelated Google services.

Known map-related domains/endpoints discovered by inventory MUST be denied for map subsystems.

Example categories:

```text
Maps APIs
Routes APIs
Places APIs
Map Tiles
Roads
Static Maps
Street View
```

Do NOT apply a broad `*.googleapis.com` block across SmartAIHub.

---

# 39. Google Maps Runtime Kill Switch

Before final key deletion, SmartAIHub SHALL support:

```text
GOOGLE_MAPS_RUNTIME_ALLOWED=false
```

This must be enforced server-side/build-time, not merely hidden in UI.

A production test MUST prove that an attempted Google Maps call fails closed.

After full decommission, the code path SHOULD be deleted rather than preserved indefinitely behind a flag.

---

# 40. Google Secret / Key Removal

The migration MUST locate and remove Google Maps credentials from all relevant stores, including:

```text
Cloudflare secrets
Cloudflare Secrets Store
Worker environment
container environment
GitHub Actions secrets
repository secrets
organization secrets if dedicated to Maps
.env files
production environment config
tenant config
admin config
database config
CI/CD variables
mobile build config
Desktop/Runner config
```

Removal evidence MUST record identifier/name, NOT secret value.

---

# 41. Google Cloud Decommission

After Longdo cutover passes production verification:

1. identify Google Cloud project(s) that contain Maps Platform APIs;
2. verify whether the project also hosts unrelated Google workloads;
3. disable Google Maps Platform APIs used by SmartAIHub;
4. delete/revoke Maps-specific API keys when no longer required;
5. remove Maps-specific quota/budget configuration if obsolete;
6. capture evidence that map APIs are disabled;
7. do NOT disable the whole billing account/project when unrelated services still use it.

---

# 42. Google Package Removal

Unused packages MUST be removed.

Examples to detect:

```text
@googlemaps/js-api-loader
@googlemaps/google-maps-services-js
@googlemaps/markerclusterer
google-map-react
provider-specific wrappers
```

A dependency is not deleted merely by name.

If a package is used for a non-Google generic purpose, classify it before removal.

Lockfiles MUST be regenerated and checked.

---

# 43. Admin UI Changes

Admin settings MUST no longer present Google Maps as an active provider.

Required states:

```text
Map Provider: Longdo
Provider health
Credential status
Plan/quota configuration
Current usage
Map transaction estimate/reconciliation
Service transaction usage
Quota warnings
Last provider error
```

Google Maps configuration fields MUST be removed from normal production UI.

Historical audit records MAY retain provider name/value metadata without credentials.

---

# 44. Tenant UI Changes

Tenant admins MUST NOT be offered a Google Maps provider toggle after decommission.

If tenant-specific Longdo credentials are supported later, the capability MUST still pass Spec 272 and Spec 290 policy.

---

# 45. Public Experience Integration

Public map surfaces under Spec 263 MUST:

- lazy-mount maps only when needed;
- avoid invisible/background map initialization;
- avoid repeated remount loops;
- avoid loading multiple map instances where one synchronized instance is sufficient;
- unload inactive views where safe;
- preserve accessibility and textual location alternatives.

This reduces both resource use and transaction volume.

---

# 46. Frontend Lifecycle Guard

Every map component MUST have lifecycle tests covering:

```text
mount once
unmount cleanly
route change
tab change
modal open/close
responsive rerender
React strict/development behavior
error boundary
reconnect
```

The goal is to prevent accidental repeated map initialization.

---

# 47. Search Input Guard

Autocomplete/suggest/search boxes MUST use:

- debounce;
- minimum query length;
- cancellation of stale requests;
- deduplication;
- bounded retry;
- request coalescing where appropriate.

Agents and automation paths require equivalent guards.

---

# 48. Cache Policy

SmartAIHub MUST obey Longdo terms for provider content.

No provider content may be cached merely for cost reduction unless permitted.

SmartAIHub-owned canonical data and derived internal state MAY use normal SmartAIHub caching rules.

The implementation MUST clearly distinguish:

```text
provider content
vs
SmartAIHub-owned data
```

---

# 49. Observability

Minimum metrics:

```text
map_session_started_total
map_session_failed_total
longdo_service_request_total
longdo_service_error_total
longdo_route_request_total
longdo_search_request_total
longdo_geocode_request_total
longdo_reverse_geocode_request_total
map_usage_guard_throttle_total
map_usage_guard_degrade_total
map_usage_guard_deny_total
map_provider_latency
map_provider_error_rate
map_quota_percent_estimate
```

Required dimensions SHOULD include:

```text
environment
tenant
capability
app/feature
status
priority
```

Never put credentials or unrestricted sensitive location data in metric labels.

---

# 50. Usage Reconciliation

If provider usage reports/console values are accessible:

```text
SmartAIHub observed usage
        |
        v
Reconciliation job
        |
        +--> provider reported usage
        |
        v
difference / anomaly
```

Large divergence MUST create an operational alert.

The platform MUST NOT assume client-side estimates are authoritative billing data.

---

# 51. Security

Required:

- no plaintext server credential in source;
- host/origin restriction where applicable;
- least privilege;
- environment separation;
- credential rotation;
- no credential logging;
- no credential in analytics;
- no raw server credential passed to an LLM;
- no provider credential exposed to arbitrary Mini Apps;
- no untrusted tenant ability to modify platform provider configuration.

---

# 52. Privacy

Location data may be sensitive.

Spec 290 does not redefine SmartAIHub privacy policy but requires:

- send only fields required by the provider call;
- do not include unrelated user identity in provider requests;
- retain provider request/response data only according to purpose and policy;
- separate provider telemetry from user tracking;
- respect Spec 260/266 privacy/consent requirements.

---

# 53. Production Failure Modes

The following failure modes MUST be handled explicitly:

| Failure | Required behavior |
|---|---|
| Longdo JS/SDK unavailable | map degraded state |
| Longdo auth/key rejected | fail closed + alert |
| quota warning | alert + low-priority reduction |
| quota near limit | throttle/degrade according to policy |
| hard internal limit | deny new governed calls |
| route service unavailable | preserve request + retry bounded/manual action |
| search unavailable | allow direct coordinate/text workflow where practical |
| map unavailable during emergency | keep non-map emergency UI functional |
| malformed provider response | reject/normalize safely |
| provider latency spike | timeout/circuit breaker |
| accidental Google code introduced | CI/deploy rejection |
| accidental Google runtime call | egress denial + security/ops event |

---

# 54. Circuit Breaker

Service adapters SHOULD implement a circuit breaker.

A provider outage MUST NOT trigger an unbounded retry storm.

Example states:

```text
CLOSED
OPEN
HALF_OPEN
```

Circuit state is operational state, not a signal to invoke Google.

---

# 55. No Paid Fallback Invariant

This invariant is platform-wide:

> If a map/location provider is unavailable or over quota, SmartAIHub MUST NOT automatically invoke another provider that may generate unapproved variable charges.

Any future provider addition requires:

```text
explicit admin enablement
explicit cost policy
explicit quota
explicit tenant policy
explicit rollout
```

---

# 56. Migration Phases

## Phase 290-A — Inventory / Freeze

Deliver:

- Google dependency inventory;
- all current map screens;
- all service call sites;
- all secrets/config;
- all Google Cloud Maps APIs;
- all map-related packages;
- all agent/Skill/MCP calls;
- freeze on new Google Maps dependencies.

Gate:

```text
INVENTORY_COMPLETE
```

---

## Phase 290-B — Canonical Map Contract

Deliver:

- `MapRendererPort`;
- `PlaceSearchPort`;
- `GeocodingPort`;
- `RoutingPort`;
- canonical geometry/types;
- provider capability manifest.

Gate:

```text
MAP_CONTRACT_READY
```

---

## Phase 290-B2 — Vendor / License / Domain-Binding Qualification

Deliver:

- current Longdo API terms snapshot/reference;
- confirmation of commercial use model for SmartAIHub SaaS;
- multi-tenant and white-label/custom-domain qualification;
- browser-key host-binding model;
- server REST/service credential model;
- mobile package/bundle model where applicable;
- overage/suspension behavior for the selected paid/free plan;
- support/escalation contacts for production incidents;
- explicit list of unsupported assumptions.

Gate:

```text
LONGDO_VENDOR_MODEL_QUALIFIED
```

`pending` on a production-relevant domain/license question blocks the affected production surface.

---

## Phase 290-C — Longdo Credentials & Environment

Deliver:

- Longdo account/key configuration;
- dev/staging/prod binding;
- Spec 272 integration where secret;
- hostname/origin restrictions where applicable;
- credential health probe.

Gate:

```text
LONGDO_CREDENTIAL_READY
```

---

## Phase 290-D — Longdo Renderer

Deliver:

- Longdo Map API 3 adapter;
- markers;
- polylines;
- polygons;
- fit bounds;
- map events;
- required custom overlays;
- responsive behavior;
- public/authenticated map components.

Gate:

```text
LONGDO_RENDERER_READY
```

---

## Phase 290-E — Search / Geocode / Route

Deliver:

- search adapter;
- suggest/autocomplete adapter where required;
- geocode adapter;
- reverse-geocode adapter;
- route adapter;
- normalization;
- timeout/retry/circuit breaker;
- transaction classification.

Gate:

```text
LONGDO_SERVICES_READY
```

---

## Phase 290-F — Domain Migration

Migrate:

- public website;
- map-enabled SmartAIHub pages;
- Spec 260;
- Spec 264;
- Spec 266 views;
- Mini App templates;
- agent tools;
- Skills;
- MCP map/location tools;
- background jobs;
- Desktop/Runner paths where applicable.

Gate:

```text
DOMAIN_MIGRATION_COMPLETE
```

---

## Phase 290-G — Cost Guard

Deliver:

- MapUsageGuard;
- tenant limits;
- capability limits;
- alerts;
- telemetry;
- throttling;
- degraded mode;
- hard-stop policy;
- no-auto-upgrade enforcement.

Gate:

```text
MAP_COST_GUARD_READY
```

---

## Phase 290-H — Staging UAT

Use Spec 271.

Test:

- normal usage;
- high-frequency UI interaction;
- route/search/geocode;
- provider outage;
- bad key;
- quota near-limit;
- hard stop;
- network failure;
- repeated React mounts;
- mobile/tablet;
- public unauthenticated traffic;
- tenant isolation;
- emergency degraded mode.

Gate:

```text
LONGDO_UAT_PASS
```

---

## Phase 290-I — Production Cutover

Actions:

1. deploy Longdo path;
2. ensure Google runtime flag disabled;
3. smoke test critical screens;
4. verify no Google Maps network traffic;
5. verify Longdo telemetry;
6. verify usage guard;
7. monitor initial production window according to normal deployment policy.

Gate:

```text
LONGDO_PRODUCTION_ACTIVE
```

---

## Phase 290-J — Google Maps Decommission

After production verification:

- disable Google Maps Platform APIs;
- revoke/delete map-specific Google keys;
- delete secrets;
- remove Google map configuration;
- remove packages;
- remove provider UI;
- remove fallback code;
- remove runtime adapter;
- install egress deny rules;
- run repository scan again.

Gate:

```text
GOOGLE_MAPS_DECOMMISSIONED
```

---

## Phase 290-K — Final Verify

Required evidence:

```text
Google map dependency scan = PASS
Google map network canary = BLOCKED
Google map secrets = ABSENT
Google map production APIs = DISABLED
Longdo renderer = PASS
Longdo search/geocode/route = PASS where required
MapUsageGuard = PASS
tenant quota isolation = PASS
emergency degraded mode = PASS
Spec 271 UAT = PASS
Spec 224 compliance gate = PASS
```

Gate:

```text
SPEC_290_FINAL_VERIFY
```

---

# 57. Cutover Rule

Production traffic MUST NOT be cut over based solely on "the map visually appears."

Cutover requires:

- required domain interactions;
- provider failure handling;
- transaction telemetry;
- quota guard;
- credentials;
- tenant isolation;
- critical emergency paths;
- mobile/tablet behavior;
- no Google network calls.

---

# 58. Rollback Policy

Rollback MUST NOT mean:

```text
turn Google back on
```

After the decommission boundary is crossed, rollback options are:

```text
Longdo previous known-good release
degraded map mode
temporary map disablement
feature-specific non-map fallback
```

Re-enabling Google Maps requires a new explicit architectural/security/FinOps decision and MUST NOT be an automated deployment rollback.

---

# 59. Google Reintroduction Protection

The repository SHOULD contain a policy file such as:

```yaml
map_provider_policy:
  canonical: longdo
  forbidden_production_providers:
    - google_maps_platform
  paid_fallback: forbidden
  spec: 290
```

CI and Spec 224 MUST read/enforce this policy.

---

# 60. Provider Capability Manifest

Example:

```yaml
provider: longdo
status: production
map:
  renderer: longdo_map_api_3
  supported: true
services:
  place_search: true
  suggest: capability_probe
  geocode: capability_probe
  reverse_geocode: true
  route: true
quota:
  enforcement:
    - smartaihub_usage_guard
    - provider_limit
cost:
  automatic_upgrade: false
fallback:
  automatic_paid_provider: false
```

Actual capability values MUST be generated from verified implementation/documentation rather than copied blindly from this example.

---

# 61. Map Feature Registry

Every map-enabled feature SHALL register:

```yaml
feature_id: emergency_live_map
owner: spec_260
capabilities:
  - map_render
  - route
criticality: critical
degraded_mode: emergency_list_and_coordinates
quota_priority: critical
```

This allows platform-wide migration and cost audits.

---

# 62. CI Gates

Minimum gates:

```text
G290-01 forbidden Google source scan
G290-02 package dependency scan
G290-03 environment/config scan
G290-04 provider policy validation
G290-05 Longdo adapter tests
G290-06 canonical contract tests
G290-07 quota guard tests
G290-08 tenant isolation tests
G290-09 degraded-mode tests
G290-10 no-Google network integration test
```

A required gate failure blocks production deployment.

---

# 63. Runtime Network Canary

Production verification MUST include an intentional test that attempts a known Google Maps Platform request from the relevant map execution plane.

Expected result:

```text
DENIED
```

This is evidence that accidental future code cannot silently recreate Google Maps charges.

The canary MUST NOT contain a valid Google credential.

---

# 64. Test Matrix

| Area | Required tests |
|---|---|
| Renderer | mount, pan, zoom, resize, overlays, cleanup |
| Markers | add/update/remove/many markers |
| Lines | route lines, custom lines |
| Polygons | hazard/zone polygons |
| Search | query, debounce, stale cancellation |
| Geocode | valid, invalid, no result |
| Reverse | valid coordinate, no result |
| Route | normal, waypoint, no route, timeout |
| Auth | valid/invalid Longdo key |
| Quota | warn/throttle/degrade/deny |
| Tenant | separate limits/counters |
| Failure | outage, latency, malformed response |
| Mobile | phone/tablet interaction |
| Public | unauthenticated pages |
| Emergency | map outage with operational UI retained |
| Agents | bounded tool calls, policy guard |
| CI | Google dependency injection must fail |
| Egress | Google Maps endpoint attempt blocked |

---

# 65. Acceptance Criteria

## AC-290-01 — Longdo canonical

Production map configuration resolves only to Longdo.

## AC-290-02 — Google renderer removed

No production UI initializes Google Maps JavaScript SDK.

## AC-290-03 — Google tiles removed

No production workload requests Google Map Tiles.

## AC-290-04 — Google Places removed

No production code calls Google Places.

## AC-290-05 — Google route removed

No production code calls Google Routes/Directions/Distance Matrix for SmartAIHub map features.

## AC-290-06 — Google geocode removed

No production code calls Google Geocoding for SmartAIHub map features.

## AC-290-07 — No automatic Google fallback

Longdo failure produces degraded/denied behavior and never invokes Google.

## AC-290-08 — Longdo renderer works

Required SmartAIHub map surfaces work using the supported Longdo integration.

## AC-290-09 — Overlay compatibility

Required SmartAIHub markers/lines/polygons render correctly.

## AC-290-10 — Emergency independence

Core emergency operations remain usable when map rendering fails.

## AC-290-11 — Canonical data preserved

Spec 260/264/266 canonical spatial data remains in SmartAIHub.

## AC-290-12 — Credential policy

Longdo credentials satisfy Spec 272 classification and storage policy.

## AC-290-13 — Google secrets absent

No active Google Maps credential remains in SmartAIHub deployment secret/config stores.

## AC-290-14 — Google APIs disabled

Mapped Google Maps Platform APIs for SmartAIHub are disabled after cutover.

## AC-290-15 — Egress denied

Known Google Maps Platform runtime requests from governed map execution planes are denied.

## AC-290-16 — CI enforcement

Introducing a Google Maps runtime dependency causes CI failure.

## AC-290-17 — Generator enforcement

Spec 224 cannot Final Verify a newly generated Mini App with Google Maps dependency.

## AC-290-18 — Usage telemetry

Map/service usage metrics are available without leaking credentials.

## AC-290-19 — Service hard guard

Governed search/geocode/route calls can be denied before provider execution after internal hard limit.

## AC-290-20 — No automatic commercial upgrade

Quota exhaustion cannot auto-purchase or auto-activate a higher plan.

## AC-290-21 — Tenant isolation

One tenant's governed service usage cannot consume another tenant's configured quota allocation invisibly.

## AC-290-22 — Retry bounded

Provider failures cannot create an unbounded retry loop.

## AC-290-23 — Agent bounded

AI agents cannot bypass MapUsageGuard or obtain unrestricted provider credentials.

## AC-290-24 — Public lifecycle safe

Public pages do not repeatedly initialize maps due to normal component rerenders/navigation.

## AC-290-25 — Mobile/tablet

Required map workflows pass UAT on target phone/tablet viewports.

## AC-290-26 — No unsupported tile use

Longdo content is not consumed through undocumented/scraped tile endpoints.

## AC-290-27 — No unauthorized cache

Provider content caching complies with provider terms.

## AC-290-28 — Provider types contained

Longdo-specific response types do not leak into canonical domain contracts.

## AC-290-29 — Route history preserved

Emergency route/reroute/progress history remains SmartAIHub-owned.

## AC-290-30 — Decommission evidence

A complete machine-readable evidence bundle exists before Final Verify.

---

# 66. Machine-Readable Decommission Evidence

Example:

```json
{
  "spec": 290,
  "revision": "R1.1",
  "canonical_provider": "longdo",
  "google_maps": {
    "runtime_reachable": false,
    "apis_disabled": true,
    "active_keys_found": 0,
    "active_secrets_found": 0,
    "package_dependencies_found": 0,
    "network_canary": "blocked",
    "derived_data_audit": "pass",
    "billing_tail": "closed"
  },
  "longdo": {
    "vendor_domain_model": "qualified",
    "renderer": "pass",
    "services": "pass",
    "usage_guard": "pass",
    "quota_authority": "pass",
    "critical_reserve": "pass",
    "credential_policy": "pass",
    "region_qualification": "pass"
  },
  "uat": "pass",
  "final_verify": "pass"
}
```

---

# 67. Definition of Done

Spec 290 is DONE only when:

- Longdo is the only active production map provider;
- all required map screens have migrated;
- required search/geocode/route capabilities have migrated;
- no production Google Maps fallback remains;
- Google Maps packages and configuration are removed where unused;
- Maps-specific Google credentials are removed/revoked;
- mapped Google Maps Platform APIs are disabled;
- runtime egress prevents accidental map API reintroduction;
- Longdo usage telemetry is operational;
- MapUsageGuard is operational;
- no automatic commercial provider upgrade exists;
- tenant quotas are enforceable for governed service calls;
- Spec 224 rejects new Google Maps dependencies;
- Spec 271 UAT passes;
- emergency/disaster features retain degraded non-map operation;
- provider content is not proxied/cached outside allowed terms;
- the final evidence bundle proves Google Maps decommission.

---

# 68. Implementation Order

Recommended execution order:

```text
1. Freeze new Google Map work
2. Inventory all Google dependencies and Google-derived persisted data
3. Qualify Longdo commercial/key/domain model for SmartAIHub + tenant/custom domains
4. Complete feature-parity/product-decision register
5. Create provider-neutral capability ports
6. Configure approved Longdo credential/domain bindings
7. Implement Longdo Map API 3 adapter
8. Migrate overlays
9. Migrate search/geocode/route
10. Add distributed quota authority + usage guard + critical reserve
11. Migrate every domain surface
12. Remediate Google-derived data provenance/retention
13. Add CI/static/CSP/mobile/PWA prohibition controls
14. Run Spec 271 UAT including region and emergency safety tests
15. Cut production to Longdo
16. Verify zero Google map network traffic from fresh and cached clients
17. Disable Google Maps Platform APIs
18. Revoke/delete Google Maps keys
19. Delete Google provider code/config/packages and stale built assets
20. Activate egress deny
21. Close Google billing tail after reporting latency
22. Run Final Verify
```

---

# 69. Repository Work Products

Implementation SHOULD produce artifacts similar to:

```text
packages/map-contract/
packages/map-provider-longdo/
packages/map-usage-guard/
packages/map-provider-policy/
tests/map-provider/
tests/map-uat/
config/map-provider-policy.yaml
scripts/check-google-map-dependencies.*
artifacts/spec290/google-map-inventory.json
artifacts/spec290/longdo-capability-report.json
artifacts/spec290/usage-guard-report.json
artifacts/spec290/google-decommission-evidence.json
```

Exact paths MAY follow repository conventions.

---

# 70. Required Code Search Evidence

Final Verify MUST save the output of provider-specific scans.

A clean scan is not proof by itself, but an unexplained match blocks completion.

Matches in:

```text
.git history
archived migration docs
historical evidence
```

MAY be allowed.

Matches in:

```text
runtime source
build config
active dependencies
active secrets
deployment config
generated templates
```

MUST be removed or explicitly proven non-reachable and non-secret.

---

# 71. Documentation Update

Update active documentation to state:

```text
Canonical production map provider: Longdo
Google Maps Platform: decommissioned
Automatic paid provider fallback: prohibited
```

Old Google setup instructions MUST be removed from active runbooks.

Historical migration records MAY remain clearly marked as historical.

---

# 72. Operator Runbook

Operators MUST have procedures for:

```text
Longdo outage
Longdo credential rejection
quota 70/80/90/95/100%
route failure
search failure
unexpected usage spike
credential rotation
provider-plan change
suspected key abuse
reconciliation mismatch
```

No runbook action may say "enable Google fallback".

---

# 73. Plan Change Governance

Moving from Free to a paid Longdo plan is an operational/commercial decision.

Required before plan change:

- current usage;
- expected growth;
- tenant attribution;
- feature attribution;
- abuse/anomaly check;
- expected monthly cost;
- administrator approval.

Plan changes MUST NOT be initiated by an LLM agent autonomously.

---

# 74. Future Provider Addition

Spec 290 does not permanently prohibit all future map providers.

A future provider MAY be added only if it implements the canonical ports and passes:

```text
security review
privacy review
cost model
hard/soft quota policy
provider terms review
UAT
tenant policy
failure behavior
explicit production enablement
```

Google Maps Platform specifically remains forbidden until a future explicit spec/revision reverses this policy.

---

# 75. Key Architectural Invariants

### INV-290-01
Longdo is the only active production map/location provider after cutover.

### INV-290-02
Google Maps Platform is not an automatic fallback.

### INV-290-03
Application/domain code depends on SmartAIHub map contracts, not provider SDK contracts.

### INV-290-04
SmartAIHub canonical spatial data remains SmartAIHub-owned.

### INV-290-05
Provider outage does not erase or make critical operational records inaccessible.

### INV-290-06
Provider quota exhaustion cannot silently create unapproved variable spending.

### INV-290-07
No automatic plan upgrade is allowed.

### INV-290-08
Every governed service request is subject to cost/usage policy.

### INV-290-09
Agents cannot bypass map cost policy.

### INV-290-10
New Mini Apps cannot reintroduce Google Maps unnoticed.

### INV-290-11
Longdo credentials are classified and protected according to actual exposure requirements.

### INV-290-12
Provider-specific content is not cached/proxied beyond allowed contractual terms.

### INV-290-13
Rollback does not automatically re-enable Google.

### INV-290-14
Provider accounting rules are configuration/capability metadata, not hard-coded assumptions.

### INV-290-15
Critical emergency workflows have a non-map degraded path.

### INV-290-16
Production decommission is proven by code, config, secret, cloud-service and network evidence.

---

# 76. Final Implementation Decision

**Proceed with Spec 290 as an additive replacement/decommission layer.**

Do not redesign implemented Specs 224, 260, 264, 266 or 267 wholesale.

Instead:

1. introduce canonical map capability ports;
2. implement Longdo Map API 3 and service adapters;
3. migrate existing map/location consumers;
4. insert MapUsageGuard;
5. add Spec 224 and CI enforcement;
6. pass Spec 271 UAT;
7. cut production to Longdo;
8. disable Google Maps Platform APIs;
9. revoke/delete Google map credentials;
10. delete Google map code/config/fallbacks;
11. block accidental runtime reintroduction;
12. Final Verify with machine-readable evidence.

The resulting SmartAIHub architecture SHALL be:

```text
                    SMARTAIHUB
                        |
           +------------+-------------+
           |                          |
     Spatial Domain               Map UI
     / Canonical Data                 |
           |                          |
           +------------+-------------+
                        |
                Map Capability Port
                        |
               +--------+--------+
               |                 |
            Cost Guard       Provider Adapter
               |                 |
               +--------+--------+
                        |
                     LONGDO
```

and explicitly NOT:

```text
SmartAIHub -> Longdo -> Google fallback
```

---

# 77. Fifteen-Pass Gap Review and Resolutions

R1.1 was reviewed in fifteen explicit passes. Every material gap found below is resolved normatively in this revision.

| Pass | Review focus | Gap found in R1.0 | Resolution in R1.1 |
|---:|---|---|---|
| 1 | Longdo key/host model | R1.0 implied dev/staging/prod keys could simply be separated | Replaced with provider-qualified credential/host-binding architecture and fail-closed domain classes |
| 2 | Multi-tenant / white-label | No hard gate for custom domains and tenant subdomains | Added `LONGDO_VENDOR_MODEL_QUALIFIED` and Longdo Domain-Binding Qualification Gate |
| 3 | Commercial/legal fit | Free/pricing facts were present but SaaS/white-label licensing assumptions were not gated | Added commercial-use, overage, domain and support qualification before production |
| 4 | Direct browser tile cost control | R1.0 implied internal quota could hard-stop all tile transactions precisely | Added explicit limitation: client tile counts are estimated; map-session admission + safety reserve + provider reconciliation are required |
| 5 | Distributed quota races | MapUsageGuard lacked atomic reservation/settlement semantics | Added Quota Authority with atomic reservation, idempotency, concurrency and fencing requirements |
| 6 | Emergency quota exhaustion | Normal traffic could consume capacity before critical incident traffic | Added critical reserve pool and priority-aware admission |
| 7 | Google-derived stored data | Decommission covered code/keys but not retained Google content | Added provenance/retention audit and migration/deletion gate before displaying data on Longdo |
| 8 | Mobile-native removal | Generic mobile scan did not explicitly cover Android/iOS build artifacts | Added Android/iOS/React Native decommission checklist and CI scans |
| 9 | Geographic/data-quality parity | Longdo-only policy could silently imply global parity with Google | Added region capability validation and explicit unsupported-region degraded behavior |
| 10 | Safety-critical routing | Route output could be misread as authoritative dispatch guidance | Added advisory-routing invariant, human/agency override and stale-route detection for emergency use |
| 11 | Provider SDK supply-chain/change drift | Remote provider JavaScript/API changes could break production without source changes | Added provider canary, compatibility smoke tests and release/change monitoring |
| 12 | Browser security | Browser key exposure/CSP/service-worker cache behavior was underspecified | Added CSP/allowlist, SW/CDN purge, forbidden-host scan and no-secret assumption for client keys |
| 13 | Provider capability loss | No formal parity register for features such as Traffic/Street View/Satellite/etc. | Added Feature Parity & Product Decision Register; unsupported features must be intentionally removed/degraded |
| 14 | Observability / privacy | Metrics existed but distributed traces could still capture coordinates/query text | Added telemetry redaction policy and sensitive-location trace restrictions |
| 15 | Decommission closure | Final Verify did not explicitly close delayed billing, stale built assets and caches | Added billing tail check, CDN/service-worker purge, built-artifact scan and post-cutover evidence requirements |

---

# 78. Commercial, License & Vendor-Readiness Gate

Longdo's published API terms permit API usage under stated conditions and describe a key tied to the service URL. They also retain provider control over content/data format and allow free-threshold values to change.

For SmartAIHub's production model, the following MUST be verified before affected surfaces are enabled:

```text
SaaS use
multi-tenant use
paid end-user use
white-label use
custom-domain use
Mini App marketplace use
mobile app/package use
server-to-server service API use
high-volume emergency/public use
selected-plan overage behavior
selected-plan rate limits
support/escalation path
```

Verification MAY be satisfied by current published provider documentation where unambiguous. Ambiguous production-critical items require written confirmation or a commercial agreement.

Implementation MUST NOT infer rights from technical ability.

---

# 79. Feature Parity & Product Decision Register

Removing Google is a product migration, not merely an SDK replacement.

Every previously reachable Google Maps Platform capability MUST appear in a parity register:

```yaml
feature:
  id: street_view
  google_capability: Street View
  current_usage: none | optional | required
  longdo_equivalent: string | none | pending
  product_decision:
    - migrate
    - replace_with_smartaihub_data
    - remove
    - degrade
  owner: string
  acceptance_test: string
```

The register MUST explicitly check at least:

```text
base map
vector/raster styles
satellite/aerial imagery
traffic layer
Street View/street imagery
POI search
place details
autocomplete/suggest
geocoding
reverse geocoding
routing
travel modes
route alternatives
toll/avoid options
ETA/traffic-aware routing
static map/screenshots
map clustering
heatmaps
3D/buildings
custom layers
mobile SDK behavior
accessibility/localization
```

If Longdo has no equivalent, the decision MUST be `remove`, `degrade` or `replace_with_smartaihub_data`—never hidden Google fallback.

---

# 80. Canonical Geospatial Semantics

Provider adapters MUST normalize coordinates and geometry before domain use.

Canonical rules:

```text
CRS: WGS84 / EPSG:4326 unless a domain explicitly declares another CRS
GeoPoint fields: latitude, longitude (named fields, not ambiguous tuple)
GeoJSON serialization: [longitude, latitude]
altitude: optional and unit-labelled
accuracy: optional meters
bearing: degrees when present
time: ISO-8601 UTC instant
```

Adapters MUST test:

- latitude/longitude inversion;
- coordinate range validation;
- invalid geometry;
- empty geometry;
- polygon ring closure/orientation where relevant;
- precision loss;
- very large overlays;
- provider result outside requested region.

No provider-specific geometry object is canonical SmartAIHub persistence.

---

# 81. Region & Data-Quality Qualification

Longdo is selected as the sole map provider, but SmartAIHub MUST NOT claim geographic or feature parity that has not been tested.

For every production target market/region, qualification MUST cover representative cases for:

```text
base-map readability
Thai/English/local labels where required
address search
POI search
reverse geocoding
route availability
road classification
route distance/duration plausibility
rural areas
urban areas
border areas if relevant
```

A region without validated capability MUST be explicitly marked:

```text
supported
limited
degraded
unsupported
```

Unsupported/limited status must flow to UI and Mini App capability discovery rather than silently returning misleading confidence.

---

# 82. Safety-Critical Routing Policy

For ambulance, organ transport, disaster evacuation and similar time-critical workflows, Longdo route output is **advisory routing data**, not an authoritative emergency dispatch instruction.

SmartAIHub MUST support:

- operator/agency override;
- manual route selection;
- explicit route timestamp;
- stale-route warning;
- route provenance;
- reroute reason;
- road-closure/field-report overlays from SmartAIHub data where available;
- clear distinction between provider-derived ETA and confirmed operational status.

No agent may autonomously represent a provider route as guaranteed safe/open.

---

# 83. Distributed Quota Authority

`MapUsageGuard` MUST have a concurrency-safe authority layer.

For governed service calls, the admission sequence SHALL be:

```text
request
  -> classify operation / transaction weight
  -> atomic quota reservation
  -> provider request
  -> settlement with observed outcome
  -> telemetry/reconciliation
```

Requirements:

- atomic counters/reservations across Workers/containers/runners;
- idempotency key for retryable requests;
- no double charging of one logical request because of duplicate delivery;
- bounded reservation TTL;
- settlement/release on failed pre-provider execution;
- fencing or equivalent protection against stale workers;
- explicit timezone/reset-boundary handling;
- monthly/day/minute windows where the selected Longdo plan requires them;
- weighted transaction metadata when one logical operation consumes more/less than one transaction.

The implementation MAY use a Cloudflare Durable Object, another atomic Cloudflare-native primitive, or an approved existing control-plane authority. It MUST NOT use eventually consistent counters as the sole hard admission authority.

---

# 84. Critical Quota Reserve

To prevent decorative/general traffic from exhausting capacity needed during emergencies, SmartAIHub SHOULD maintain a configurable reserve for `critical` map-service operations.

Example policy:

```yaml
quota:
  safety_buffer_percent: 10
  critical_reserve_percent: 10
  normal_soft_stop_percent: 80
  normal_hard_stop_percent: 90
  critical_hard_stop_percent: 100
```

Actual values are configuration, not normative constants.

Low/normal traffic MUST NOT borrow the critical reserve automatically.

The reserve cannot override a provider hard limit; it only protects SmartAIHub's internal allocation.

---

# 85. Browser Map Transaction Safety Model

Longdo map tiles/vector resources are typically loaded from the browser through the supported map API, which means SmartAIHub may not have exact per-tile admission control before every provider transaction.

Therefore the platform MUST NOT claim exact internal hard enforcement of browser tile counts unless the provider exposes a supported control mechanism.

Instead use:

1. server-side admission before loading/mounting a map session;
2. conservative safety margin below provider limits;
3. lazy map initialization;
4. lifecycle protection against duplicate map instances;
5. tenant/app session attribution estimates;
6. provider-console/report reconciliation where available;
7. platform kill switch preventing new map mounts;
8. provider-side suspension/limit behavior as the final boundary, where contractually applicable.

Existing already-mounted browser sessions may continue to produce map transactions until unloaded/provider-limited. This residual exposure MUST be reflected in the safety buffer.

---

# 86. Public Abuse & Bot Protection

Public map features are a cost surface.

SmartAIHub MUST protect server-brokered map services with appropriate controls such as:

```text
Cloudflare rate limiting
WAF/bot policy where appropriate
authenticated tenant identity when available
anonymous session limits
request debounce/deduplication
per-IP heuristics where privacy/policy allow
per-feature quotas
abuse anomaly detection
```

Public users MUST NOT receive an unrestricted server-side Longdo service proxy.

Browser map initialization SHOULD require a valid feature/session admission decision from SmartAIHub before loading the Longdo client SDK on high-risk public surfaces.

---

# 87. Browser Security, CSP & Built-Asset Hygiene

After cutover, web applications MUST update CSP/network policy for the exact Longdo endpoints required by the supported integration.

Required review includes:

```text
script-src
connect-src
img-src
worker-src
style-src
font-src
frame-src (if actually used)
```

Do not wildcard provider domains more broadly than required.

Decommission MUST also remove Google Maps references from:

```text
service worker caches
PWA precache manifests
CDN cached HTML/JS
hashed production bundles
source maps where they leak active key/config
offline bundles
browser app-shell caches
```

A fresh browser and a previously installed PWA/service worker MUST both pass the no-Google-network test.

---

# 88. Mobile-Native Google Maps Decommission

If any Android/iOS/React Native build exists or is generated, the scan MUST include:

```text
AndroidManifest.xml
Gradle dependencies
resource XML
manifestPlaceholders
Google Play Services Maps dependencies
iOS Info.plist
.xcconfig
CocoaPods / Podfile.lock
Swift Package dependencies
native entitlements/config
React Native native modules
Flutter plugins
mobile CI secrets
```

Any Google Maps SDK API key or native map package that is production-reachable MUST be removed.

Mobile package/bundle registration for Longdo MUST follow the provider-supported key model.

---

# 89. Google-Derived Data Provenance & Retention Audit

Google decommission is incomplete if SmartAIHub continues using Google-derived content in ways inconsistent with its storage/display restrictions.

Before final cutover, inventory stored fields/tables/caches/artifacts that may contain:

```text
Google geocoding results
Google place details
place names copied from Google responses
formatted addresses
Google route geometry/instructions
Google traffic-derived data
Google map/static images
Street View imagery
Google POI metadata
Google Place IDs
```

For every field/artifact classify:

```text
SmartAIHub-owned/user-supplied
Google identifier allowed to persist
Google content subject to retention/display restrictions
unknown provenance
```

Unknown provenance on a production-critical spatial dataset blocks automatic migration into Longdo-backed views until resolved.

Google Place IDs may be retained where permitted, but MUST NOT remain SmartAIHub's canonical place identity or create a runtime dependency on Google.

Content that cannot legally/contractually continue to be stored/displayed MUST be deleted, expired, or re-derived from permitted SmartAIHub/Longdo/user sources according to the applicable agreement.

---

# 90. Place Identity Migration

Canonical place identity SHALL use a SmartAIHub ID.

Example:

```text
smartaihub_place_id
  + external_refs.longdo
  + external_refs.google_place_id (historical/optional where permitted)
```

A Google Place ID MUST NOT be a primary key required to render/search/route after Spec 290.

Provider crosswalks MUST record provenance and last verification time.

---

# 91. Provider SDK / API Drift Control

Because the browser map SDK can be remotely served by the provider, provider changes may affect production without a SmartAIHub source commit.

Required controls:

- scheduled compatibility smoke test in normal operations;
- startup/health probe where feasible;
- synthetic map mount on staging/production-safe canary;
- alert on provider script/API load failure;
- capability-contract tests against supported API behavior;
- record current provider documentation/API generation;
- review provider announcements before adopting new capabilities.

The smoke test MUST NOT generate excessive map/service usage.

---

# 92. Telemetry Privacy & Trace Redaction

Observability MUST NOT turn location data into a new privacy leak.

By default, telemetry MUST NOT store raw:

```text
home addresses
full search strings containing personal data
precise user coordinates
ambulance patient-related coordinates tied to identity
protected emergency participant locations
API keys/tokens
```

Use coarse region, hashed/opaque IDs, capability, latency and status where sufficient.

Debug tracing of precise location data requires explicit purpose, bounded retention and authorized access.

---

# 93. Longdo Resilience / Longdo Box Evaluation Boundary

Longdo's product catalog currently describes Longdo Box as an on-premise map server option. For emergency/offline/business-continuity needs, SmartAIHub MAY evaluate Longdo Box in a separate future decision.

Spec 290 does NOT automatically enable Longdo Box and does not treat it as a hidden fallback.

Any adoption requires:

```text
license/commercial confirmation
capability parity test
data update process
security review
operational ownership
failover design
cost review
```

This preserves the no-Google decision while leaving a Longdo-family resilience option available for later evaluation.

---

# 94. Google Decommission Billing-Tail Closure

Disabling APIs and deleting keys does not prove that all delayed usage/billing records have already appeared.

The decommission evidence MUST therefore include a post-cutover billing-tail check according to Google Cloud billing data availability and SmartAIHub's deployment policy.

At minimum verify:

```text
no new Google Maps runtime calls in SmartAIHub telemetry
Google Maps APIs disabled
Maps keys revoked/deleted
no active production Google Maps secrets
no Google Maps network traffic from fresh and cached clients
Google Cloud Maps SKU usage trends to zero after reporting latency
no unexpected residual Maps charges beyond explained reporting lag
```

This check does not require keeping Google callable.

---

# 95. Additional Acceptance Criteria — R1.1

## AC-290-31 — Domain binding qualified

Every production domain class that can render Longdo has an approved provider key/host-binding model; `pending` classes fail closed.

## AC-290-32 — No unsupported key proliferation

Implementation does not create arbitrary per-environment/per-tenant Longdo keys contrary to provider terms/contract.

## AC-290-33 — White-label commercial gate

Custom-domain/white-label map enablement requires documented provider support or commercial approval.

## AC-290-34 — Atomic quota admission

Concurrent service requests cannot oversubscribe a hard SmartAIHub quota due solely to race conditions in distributed counters.

## AC-290-35 — Duplicate request settlement

A duplicated/retried logical request cannot consume internal budget twice when provider execution occurred only once and idempotency evidence proves duplication.

## AC-290-36 — Critical reserve

Normal/low-priority traffic cannot consume configured emergency reserve automatically.

## AC-290-37 — Browser tile accounting honesty

UI/admin labels distinguish estimated browser map usage from authoritative provider-reported transaction counts.

## AC-290-38 — Public abuse resistance

A public service endpoint cannot be used as an unauthenticated unrestricted Longdo proxy.

## AC-290-39 — Region qualification

Production-supported geographic regions have representative map/search/route validation and unsupported regions are disclosed/degraded.

## AC-290-40 — Safety-critical route advisory

Emergency routing UI exposes route provenance/time and supports operator override; it does not present provider routing as guaranteed passability.

## AC-290-41 — Mobile native clean

Production mobile builds contain no reachable Google Maps SDK/key/config after migration.

## AC-290-42 — Service worker/cache clean

A previously installed app/service worker cannot continue loading Google Maps from stale cached bundles after upgrade.

## AC-290-43 — Google data provenance resolved

Production datasets shown on Longdo have resolved provenance and no prohibited retained Google content is silently reused.

## AC-290-44 — Canonical place ID provider-neutral

No core place record requires a Google Place ID or Longdo ID as its canonical primary identity.

## AC-290-45 — Feature parity decision complete

Every previously used Google map capability has an explicit migrate/remove/degrade/replace decision.

## AC-290-46 — CSP least scope

Production CSP permits only Longdo endpoints required by the approved integration and does not retain obsolete Google Maps endpoints.

## AC-290-47 — Provider drift canary

A provider compatibility smoke test detects loss of the required Longdo SDK/capability contract.

## AC-290-48 — Trace redaction

Normal telemetry/tracing does not capture raw protected location data or provider credentials.

## AC-290-49 — Billing tail closed

Post-cutover evidence shows Google Maps usage trends to zero after normal reporting latency, with any residual charge explained.

## AC-290-50 — No accidental fallback through old build

Both fresh clients and upgraded/cached clients are proven unable to invoke the retired Google Maps runtime path.

---

# 96. R1.1 Definition-of-Done Addendum

In addition to Section 67, completion requires:

- `LONGDO_VENDOR_MODEL_QUALIFIED` for every enabled production domain/deployment class;
- custom-domain/white-label behavior is explicitly approved or disabled;
- quota authority passes distributed concurrency tests;
- critical reserve behavior passes exhaustion tests;
- browser map usage is labelled estimated where not provider-authoritative;
- Feature Parity & Product Decision Register is complete;
- target-region quality tests pass;
- safety-critical routing policy is enforced;
- mobile-native Google Maps dependencies are absent where mobile applies;
- Google-derived persisted data provenance has been audited and remediated;
- canonical place identity is provider-neutral;
- CSP/service worker/CDN built assets contain no active Google Maps path;
- provider drift canary is operational;
- telemetry redaction tests pass;
- delayed Google billing/usage tail is closed with evidence.

---

# 97. Revised Final Implementation Decision

**Proceed with Spec 290 R1.1.**

R1.1 preserves the original decision—Longdo replaces Google Maps Platform and Google is fully decommissioned—but removes several unsafe assumptions:

1. Longdo key/domain rules are provider-qualified rather than guessed;
2. custom-domain/white-label enablement is gated;
3. quota enforcement is distributed and atomic for brokered services;
4. browser map tile usage is treated as estimated unless provider-authoritative data exists;
5. emergency capacity can be reserved;
6. safety-critical routing is advisory with operator override;
7. Google-derived persisted data is audited before reuse;
8. mobile/PWA/CDN stale Google paths are removed;
9. geographic capability is validated, not assumed;
10. delayed billing and remote-provider drift receive explicit closure controls.

This revision is implementation-ready subject to the provider-commercial/domain-binding qualification gates defined above.

---

# 98. External References Used for R1.1

Implementation MUST re-check provider documentation and contractual terms at execution time because pricing, quotas, APIs and key rules can change.

Longdo:

- Pricing: https://map.longdo.com/products/pricing
- API Terms: https://map.longdo.com/api/terms/
- API products: https://map.longdo.com/products/api
- Longdo Map API 3: https://map.longdo.com/products/api/map-api3
- Longdo Map API 3 documentation: https://map.longdo.com/docs3/
- API key documentation (host/package binding): https://map.longdo.com/api-mobile/android/document/api_key.html
- Longdo products / Longdo Box: https://map.longdo.com/products/

Google decommission/data-policy references:

- Google Maps Platform pricing overview: https://developers.google.com/maps/billing-and-pricing/overview
- Google Maps Platform cost management: https://developers.google.com/maps/billing-and-pricing/manage-costs
- Geocoding policies: https://developers.google.com/maps/documentation/geocoding/policies
- Maps JavaScript policies: https://developers.google.com/maps/documentation/javascript/policies
- Place IDs: https://developers.google.com/maps/documentation/places/web-service/place-id

---

# 99. Historical External References from R1.0

Implementation MUST re-check provider documentation at execution time.

Longdo:

- Pricing: https://map.longdo.com/products/pricing
- API Terms: https://map.longdo.com/api/terms/
- Longdo Map API 3 product: https://map.longdo.com/products/api/map-api3
- Longdo Map API 3 documentation: https://map.longdo.com/docs3/
- Route API product: https://map.longdo.com/products/api/route

Google decommission rationale / cost-control behavior:

- Google Maps Platform pricing overview:
  https://developers.google.com/maps/billing-and-pricing/overview
- Google Maps Platform cost management:
  https://developers.google.com/maps/billing-and-pricing/manage-costs
- Google Maps Platform FAQ / billing:
  https://developers.google.com/maps/faq

---

**End of Spec 290 — R1.1**
