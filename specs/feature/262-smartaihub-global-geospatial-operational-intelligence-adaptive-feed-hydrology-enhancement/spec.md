# Spec 262 — SmartAIHub Global Geospatial Operational Intelligence, Adaptive Situation Feed & Hydrology Enhancement

**Revision:** R1.8 — Spec 260 Alignment and Existing AI Chat & Feedback Integration  
**Date:** 2026-10-01  
**Status:** Additive geospatial enhancement to Spec 260 R1.38. Spec 262 R1.8 supersedes R1.7 where this alignment amendment is more specific.  
**Implementation boundary:** Spec 260 is the canonical predecessor contract and remains under active implementation. Spec 262 may proceed with independently implementable additive work, but integrated work MUST honor the dependency gates and shared-authority rules below. Neither specification may introduce a competing authority or silently change the other's normative contracts.  
**Related specifications:** Spec 260 All-Hazards Emergency & Crisis Intelligence (R1.38 downstream geospatial integration amendment); Spec 261 Portable AI Application Standard; existing SmartAIHub Chat/Task Control, Skills/Capability Registry, Durable Orchestration Kernel, Notifications, Memory, Media, Marketplace, MCP/API and tenant infrastructure.

---

## 0. Executive Summary

Spec 262 adds global geospatial, adaptive-feed, and hydrology capabilities to the canonical emergency-domain contracts defined by Spec 260. Spec 260 implementation is still in progress; Spec 262 extends implemented portions incrementally and gates integrations on unfinished dependencies rather than assuming a completed baseline.

The implementation SHALL preserve these architectural choices:

- **MapLibre** is the standard map rendering engine.
- **Google Maps Platform** MAY be the primary basemap/place/geocoding/routing provider where enabled.
- Google Maps or another provider MUST NOT become the emergency-domain source of truth.
- Existing **SmartAIHub Global Mini Chat / AI Chat & Feedback** is the conversational command surface. Spec 262 MUST NOT create a second Map Chat.
- Existing **Task Control** is the task execution/monitoring authority. The map MAY project task state, but MUST NOT create a second task subsystem.
- Map, Feed, Chat, Task Control, Skills and Agents SHALL share a common spatial/context contract.
- The system SHALL be **global-ready**, while data capabilities MAY be rolled out country by country, basin by basin, provider by provider.
- **Thai and English are mandatory baseline product languages** for public emergency surfaces.
- The Feed SHALL be driven primarily by the user's current map focus, but material events outside the viewport MAY enter the Feed when they can causally or operationally affect the focused area.
- Hydrology SHALL be treated as time-series and network intelligence, not only as isolated water-level markers.
- The platform SHALL distinguish observation, official warning, forecast, inferred impact and AI explanation.

The core experience becomes:

```text
SEE → UNDERSTAND → ASK → ACT → MONITOR → VERIFY
```

rather than:

```text
OPEN MAP → VIEW MARKERS → READ MANUALLY
```

---

# 1. Scope and Non-Goals

## 1.1 In scope

Spec 262 adds:

1. Map ↔ Global Chat context bridge.
2. Typed Map Command API usable by Chat, Skills and Agents.
3. Map operational React/UI component layer above MapLibre.
4. Viewport-driven Feed context and zoom-aware information granularity.
5. Dynamic relevance beyond a fixed radius.
6. Causal/impact relevance graph.
7. Situation / warning / weather / hydrology / news / local utility feed projection.
8. Weather integration including Google Weather API and future WeatherNext-class forecast data.
9. Hydrology time-series ingestion, trend detection and material-change feed generation.
10. Basin, river, canal, irrigation and hydraulic-structure topology.
11. Upstream/downstream impact and water-propagation modeling.
12. Flash-flood and rapid-runoff intelligence hooks.
13. Thailand deep-data provider pack.
14. Global base provider pack and country/region capability packs.
15. Geographic capability registry and coverage disclosure.
16. Thai/English localization baseline and multilingual source handling.
17. Shared Map/Feed/Chat/Task context persistence.
18. Global rollout and additive integration with Spec 260 as its implementation progresses.

## 1.2 Out of scope

Spec 262 does NOT:

- replace canonical emergency-domain state from Spec 260;
- replace SmartAIHub Chat;
- replace Task Control;
- create a second notification scheduler;
- create a second orchestration authority;
- make Google Maps data authoritative emergency truth;
- treat AI prediction as an official warning;
- guarantee hydrological forecasts where calibrated data/models are unavailable;
- infer that missing data means an area is safe;
- require every geography to provide all capabilities before the map can operate.

---

# 2. Non-Negotiable Architectural Invariants

1. **MapLibre = Rendering Engine.**
2. **SmartAIHub = UX / Interaction / Intelligence / Operational Layer.**
3. **External providers = data/capability providers, not domain authorities.**
4. Map MUST NOT implement a separate Chat subsystem.
5. Map MUST reuse the existing SmartAIHub Global Mini Chat.
6. Map MUST NOT implement a separate Task authority.
7. Material task creation/assignment/state transitions MUST use canonical Task Control.
8. Map context MUST be publishable to Chat/Skills without sending thousands of visible features to an LLM.
9. Chat/Skills MUST be able to issue typed map commands.
10. Material side effects require existing capability, permission and approval checks.
11. Feed MUST be a projection, never a second source of truth.
12. Viewport is a primary relevance signal, not an absolute boundary.
13. Outside-viewport information MAY enter Feed if it materially affects the focused area.
14. Observation, forecast, official alert, news-derived claim, community report and AI inference MUST remain distinguishable.
15. Country-specific data providers MUST normalize into shared SmartAIHub schemas.
16. Missing provider coverage MUST be surfaced explicitly.
17. `NO_DATA` MUST NOT be presented as `NO_DANGER`.
18. Thai and English MUST be supported without login on public emergency surfaces.
19. Language switching MUST preserve map/feed/action state.
20. Provider licensing, attribution, caching, redistribution and offline restrictions MUST be enforced per provider.

---

# 3. Reference Architecture

```text
                         SmartAIHub
        ┌────────────────────────────────────────┐
        │ AI Chat & Feedback (existing panel)    │
        │ AI Chat | Task Control | Send Feedback  │
        │ Skills / Capability Registry           │
        │ Durable Orchestration / Notifications  │
        └───────────────────┬────────────────────┘
                            │
                   Shared Context Layer
                            │
              ┌─────────────┴─────────────┐
              │                           │
       Map Context Bridge           Feed Context Bridge
              │                           │
              ▼                           ▼
     Map Command Controller       Adaptive Feed Engine
              │                           │
              └─────────────┬─────────────┘
                            ▼
                    Canonical Geo/Situation
                            │
            ┌───────────────┼────────────────┐
            │               │                │
        MapLibre         Providers       SmartAIHub data
        renderer         adapters        incidents/tasks/
                                           journeys/etc.
```

---

# 4. Map Renderer and Provider Architecture

## 4.1 MapLibre remains standard renderer

MapLibre SHALL remain the web/PWA geospatial rendering surface.

It SHALL render:

- vector/raster basemaps;
- markers/symbols;
- points/lines/polygons;
- routes;
- clusters;
- heatmaps;
- hazard polygons;
- flood extents;
- hydro networks;
- forecast layers;
- responder/resource projections;
- task projections;
- journey tracks;
- user selections;
- derived operational overlays.

## 4.2 Basemap provider abstraction

Maintain/extend:

```text
BasemapProviderAdapter
├─ Google Map Tiles
├─ PMTiles / R2
├─ MapTiler
├─ Custom XYZ / Vector Tile
└─ future providers
```

Provider choice is configuration and capability policy.

## 4.3 Google Map Tiles rules

When Google Map Tiles is enabled:

- session lifecycle MUST be handled correctly;
- API credentials MUST be protected/restricted according to current Google requirements;
- required attribution/logo MUST remain visible;
- SmartAIHub MUST NOT use Google map tiles as machine-analysis source data;
- unauthorized prefetch/storage/offline mirroring MUST NOT be implemented;
- R2/KV MUST NOT become a permanent mirror of Google tile content unless explicitly permitted by applicable terms;
- provider response cache directives and legal terms MUST be respected.

## 4.4 Basemap failure behavior

MapLibre renderer failure or basemap provider failure MUST NOT make essential emergency information disappear.

Fallback hierarchy MAY include:

```text
primary basemap
→ alternate permitted basemap
→ minimal map/static geography
→ nearby/list/text representation
```

---

# 5. Existing Global Mini Chat Integration

## 5.1 No Map Chat

The implementation MUST NOT add:

```text
<MapChat />
<MapAIChat />
<EmergencyMapChat />
```

as independent chat systems.

All conversational interaction MUST use the existing global **AI Chat & Feedback** panel (the application-wide combined panel shown in the product UI), not a new Map-specific conversation surface. The panel's existing tabs remain the single entry points for **AI Chat**, **Task Control**, and **Send Feedback**. “Global Mini Chat” in this specification refers to this existing shared panel and its AI Chat tab; it does not require a separate mini-chat component, route, or conversation authority.

When a user chooses an Ask AI action from Map or Feed, the application MUST open the existing AI Chat & Feedback panel and select its AI Chat tab. It MUST preserve the current shared chat session and the user's existing model, assistant/skill, and other supported chat selections. If the existing panel's normal lifecycle creates its first canonical conversation when AI Chat is opened, that behavior is allowed; Map MUST NOT create a separate conversation authority or Map-specific hidden thread. Map context is attached to the resulting user turn through the context bridge and is clearly attributable to the map/feed action; it MUST NOT be sent as a hidden standalone prompt or cause a message to be submitted without the user's action.

Task Control and Send Feedback MUST continue to open in their existing tabs in that same combined panel. A map-originated task action MUST use the existing Task Control flow and its authorization/approval checks. Feedback MUST use the existing feedback flow. Map-specific controls may supply bounded context to these existing flows, but MUST NOT clone their UI, routes, state, or backend authority.

## 5.2 Map Context Bridge

Add:

```text
MapContextBridge
```

The bridge exposes structured, permission-safe context.

```ts
interface MapContextEnvelope {
  surface: "emergency_map";
  viewport: {
    bounds: BBox;
    center: LatLng;
    zoom: number;
    bearing?: number;
    pitch?: number;
  };
  zoomClass: ViewportZoomClass;
  selectedFeatures: MapFeatureRef[];
  activeLayers: string[];
  filters: MapFilterState;
  temporalContext: {
    mode: "NOW" | "HISTORY" | "FORECAST";
    timestamp?: string;
    window?: TimeWindow;
  };
  selectedArea?: GeoJSON.Geometry;
  activeRoute?: RouteRef;
  activeJourney?: JourneyRef;
  requestedMapMode: "PUBLIC" | "TRAVEL" | "RESPONDER" | "COMMAND";
  visibleSummary?: {
    incidents: number;
    hazards: number;
    resources: number;
    tasks: number;
    services?: number;
  };
}
```

The bridge MUST NOT serialize all rendered features into the LLM context.

It SHOULD send references/summaries and allow Skills/Geo API to fetch authoritative details.

Every reference MUST retain its canonical domain type, identifier, and applicable revision; verification and freshness values MUST use the canonical Spec 260/platform types where defined. Plain unvalidated strings MUST NOT be treated as authority, verification, or permission. `requestedMapMode` is a UI preference only, not an authorization claim: the server MUST derive the effective audience and allowed projection from the authenticated principal, tenant, purpose, and current policy, then revalidate authorization when resolving references or executing commands. Public context MUST use the approved public projection and MUST NOT reveal restricted exact locations or infer them through aggregate context. If the existing Chat entry point requires authentication or entitlement, it MUST follow that existing access flow without weakening it; public map safety content remains available and no protected context is queued for later delivery without reauthorization.

## 5.3 Contextual language examples

With map context active, these utterances MUST be resolvable without repeating location:

- "แถวนี้มีอะไรน่าห่วง"
- "What is happening in this area?"
- "เส้นนี้ผ่านได้ไหม"
- "Show only flood and hospitals."
- "หาโรงพยาบาลที่ไปได้โดยไม่ผ่านถนนปิด"
- "What changed since I last looked here?"
- "ติดตามพื้นที่นี้ให้หน่อย"

---

# 6. Typed Map Command API

Add a typed capability family:

```text
map.focus
map.fit_bounds
map.select
map.clear_selection

map.layer.show
map.layer.hide
map.layer.configure

map.filter.set
map.filter.clear

map.area.select
map.area.clear

map.route.show
map.route.compare
map.route.clear

map.journey.follow
map.journey.stop_follow

map.timeline.set
map.timeline.play

map.draw.start
map.draw.commit
map.draw.cancel

map.view.save
map.view.restore

map.compare.open
map.compare.close

map.feed.sync_focus
map.feed.lock_focus
map.feed.unlock_focus
```

Requirements:

- read-only map commands MAY execute immediately when authorized;
- commands with external/material side effects MUST follow existing approval/permission policy;
- commands MUST be idempotent where replay can occur;
- command result MUST identify applied map revision/state;
- invalid/stale feature references MUST fail safely;
- closing Global Chat MUST NOT reset map state;
- opening Global Chat MUST NOT reset viewport, filters, selection, route or journey.

---

# 7. SmartAIHub React/UI Layer Above MapLibre

Create reusable UI components:

```text
<MapContextBridge />
<MapCommandController />
<MapOperationalToolbar />
<MapSelectionController />
<MapContextActionDock />
<OperationalLayerWorkbench />
<JourneyHUD />
<MapTaskOverlay />
<MapEvidenceInspector />
<MapCompareMode />
<MapTimelineController />
<MapSavedViewController />
<FeedFocusIndicator />
<DataCoveragePanel />
```

## 7.1 MapOperationalToolbar

Pointer/touch operations SHOULD be directly manipulable:

```text
My Location
Select
Draw Area
Measure
Layers
Time
Route
Compare
Map/Satellite
3D (when supported)
```

Use natural language for complex intent; use direct manipulation when faster and clearer.

## 7.2 MapContextActionDock

Contextual actions depend on selected object and role.

Example incident:

```text
[Ask AI] [Route Around] [Track] [Report Update] [Create Task] [Share]
```

`Ask AI` MUST open/focus the existing Global Mini Chat with selected context.

`Create Task` MUST hand off to canonical Task Control.

## 7.3 Journey HUD

Active journeys SHOULD expose compact live status without requiring full detail view:

- journey identity/purpose;
- current state;
- ETA/range;
- last tracking time;
- route revision;
- material delay/reroute;
- reason for route change;
- compare old/new;
- task/journey handoff.

## 7.4 Operational Layer Workbench

Layer control SHOULD include:

- visibility;
- opacity;
- legend;
- source;
- freshness;
- coverage;
- confidence/verification where relevant;
- time mode;
- cost/provider state where material.

## 7.5 Compare Mode

Support synchronized comparison for:

- now vs earlier;
- observed vs forecast;
- route A vs route B;
- public vs operational projection;
- roadmap vs satellite;
- before/after flood extent.

---

# 8. Shared Spatial Focus Context

Add:

```ts
interface SpatialFocusContext {
  source:
    | "MAP_VIEWPORT"
    | "CURRENT_LOCATION"
    | "SAVED_AREA"
    | "SELECTED_AREA"
    | "ROUTE_CORRIDOR"
    | "JOURNEY";

  geometry: GeoJSON.Geometry;
  center?: LatLng;
  zoom?: number;
  zoomClass?: ViewportZoomClass;

  activeLayers: string[];
  filters: MapFilterState;

  selectedFeatures: MapFeatureRef[];

  activeRoute?: RouteRef;
  activeJourney?: JourneyRef;

  locale: string;
}
```

Map, Feed and Global Chat SHOULD use the same active `SpatialFocusContext` unless the user explicitly overrides or locks one surface.

---

# 9. Viewport-Driven Adaptive Feed

## 9.1 Core principle

When the user is actively using Map:

> **Current Map Viewport is the default primary spatial focus of Feed.**

Do NOT default to a fixed 5/10/20 km radius if the viewport clearly represents user intent.

## 9.2 Zoom classes

Add:

```text
ViewportZoomClass
SITE
NEIGHBORHOOD
DISTRICT
PROVINCE
REGION
COUNTRY
CONTINENT
```

Exact numeric zoom thresholds are implementation/configuration details and MAY vary by provider/device.

## 9.3 Zoom-aware information granularity

At high zoom:

- individual incidents;
- road-level access;
- nearby shops/services;
- hospitals/shelters;
- community observations;
- local water stations.

At district scale:

- significant incidents;
- closures;
- water trends;
- warnings;
- facilities;
- summarized service availability.

At province scale:

- aggregated affected districts;
- significant flood areas;
- major road/access disruptions;
- weather outlook;
- major reservoir/river changes;
- regional warnings.

At regional/country scale:

- major active hazards;
- critical warnings;
- affected provinces/regions;
- large hydrological changes;
- major transport/infrastructure impacts;
- global/regional disaster items.

The Feed MUST aggregate instead of enumerating excessive low-level items.

## 9.4 Viewport stabilization

Map pan/zoom MUST NOT refresh Feed on every pixel movement.

Implement `ViewportIntentStabilizer`:

- debounce/stabilize viewport;
- compare overlap with prior viewport;
- avoid full refresh on minor changes;
- use incremental/delta candidate updates;
- preserve current scroll position;
- optionally surface "New items for this area".

## 9.5 Feed focus lock

User MAY select:

```text
Follow map area
Current location
Saved area
Selected area
Route corridor
```

User MAY lock Feed focus while temporarily panning the map elsewhere.

---

# 10. Dynamic Relevance Envelope

Viewport MUST NOT be a hard boundary.

Add:

```ts
interface FeedFocusEnvelope {
  primaryGeometry: GeoJSON.Geometry;
  focusMode: SpatialFocusContext["source"];
  zoomClass: ViewportZoomClass;

  impactExtensions: ImpactExtensionType[];
}
```

`ImpactExtensionType` includes:

```text
UPSTREAM_HYDROLOGY
DOWNSTREAM_HYDROLOGY
APPROACHING_WEATHER
OFFICIAL_ALERT_SCOPE
ROUTE_DEPENDENCY
TRANSPORT_NETWORK_IMPACT
INFRASTRUCTURE_DEPENDENCY
UTILITY_DEPENDENCY
SUPPLY_CHAIN_IMPACT
SAVED_AREA
USER_WATCH
MAJOR_REGIONAL_EVENT
```

Feed candidate classes:

```text
IN_VIEWPORT
AFFECTS_VIEWPORT
CRITICAL_OVERRIDE
```

Therefore a dam 100 km away MAY enter the Feed if its controlled release can materially affect the selected downstream basin.

---

# 11. Feed Ranking and Information Load

Feed ranking SHOULD consider:

```text
SafetyPriority
+ SpatialFocus
+ ImpactRelevance
+ Materiality
+ Freshness
+ SourceQuality
+ OperationalRelevance
+ UserIntent
- Duplication
- Staleness
- InformationOverload
```

Payment/sponsorship MUST NOT override life-safety priority or false availability rules already established in Spec 260.

## 11.1 Two-layer feed UX

### Layer A — Situation Digest

A compact 5–10 item summary:

```text
3 critical changes
2 rising-water locations
1 road closure
Weather worsening 18:00–21:00
12 important services open
2 major external-impact items
```

### Layer B — Full Feed

Continuous ranked cards containing only candidates that pass relevance/materiality policy.

---

# 12. Feed Item Model

Add/extend canonical Feed projection:

```ts
interface SituationFeedItem {
  feedItemId: string;
  canonicalRefs: CanonicalDomainRef[];

  cardType: FeedCardType;
  lane: FeedLane;

  titleKey?: string;
  localizedContentRefs?: string[];

  sourceRefs: SourceRef[];
  verificationState: VerificationState;
  freshnessState: FreshnessState;

  spatialRelation: "IN_VIEWPORT" | "AFFECTS_VIEWPORT" | "CRITICAL_OVERRIDE";
  relevanceReasons: FeedRelevanceReason[];

  effectiveTime?: TimeWindow;
  observedAt?: string;
  publishedAt?: string;

  geometryRef?: CanonicalGeometryRef;
  mapAction?: MapCommand;

  availableActions: CapabilityActionRef[];
}
```

`CanonicalDomainRef`, `SourceRef`, `VerificationState`, `FreshnessState`, and `CanonicalGeometryRef` MUST reuse the canonical Spec 260/platform contracts where they exist. This specification does not create parallel identity, source, verification, freshness, or geometry authorities. Any necessary enum/type extension MUST be a coordinated additive contract change under R1.8.1. Resolution MUST remain authorization-scoped; a stable reference is not a capability token.

`FeedCardType` SHOULD include:

```text
CriticalAlertCard
IncidentUpdateCard
WeatherForecastCard
WeatherChangeCard
HydrologyUpdateCard
UpstreamImpactCard
FloodExtentCard
RoadAccessCard
RouteImpactCard
OpenBusinessCard
ServiceAvailabilityCard
ShelterCard
ResourceCard
CommunityReportCard
MajorNewsCard
PreparednessCard
CoverageNoticeCard
```

---

# 13. Feed ↔ Map ↔ Chat ↔ Task Contract

Feed, Map, Chat and Task Control are projections/interfaces over shared state.

Required interactions:

```text
Feed card → View on map
Feed card → Ask AI
Feed card → Watch
Feed card → Route
Feed card → Create/Open Task
Feed card → View source
Feed card → View timeline
```

Map interactions:

```text
Map object → Open related updates/feed
Map object → Ask AI
Map object → Create/Open Task
```

Chat results MAY return action cards:

```text
[Show these on map]
[Compare routes]
[Watch this area]
[Open Task Control]
```

No subsystem MAY silently fork canonical state.

---

# 14. Situation / News Intelligence

Spec 262 reuses Spec 260 News Intelligence.

Enhancements:

1. News relevance MUST use `FeedFocusEnvelope`, not only geographic distance.
2. News MAY create `AFFECTS_VIEWPORT` candidates through an impact relation.
3. Regional/national critical news MUST survive local-first ranking.
4. Local news MAY be absent in some countries; missing coverage MUST be disclosed.
5. News is evidence, not automatic truth.
6. Duplicate syndicated stories MUST not multiply event priority.
7. Correction/retraction MUST propagate to Feed, Map and derived briefs.
8. Source language MAY differ from UI language.
9. Image-only official notices MAY be ingested only through a controlled extraction/review path; original evidence remains preserved.
10. Feed MAY show an official notice image while also providing structured extracted facts and translated summary.

---

# 15. Weather Intelligence

## 15.1 Production baseline

Create/extend:

```text
WeatherProviderAdapter
├─ GoogleWeatherAPIAdapter
├─ NationalMeteorologicalAdapter
├─ WeatherNextAdapter
└─ OtherProviderAdapter
```

Google Weather API MAY be used as the global baseline where supported.

## 15.2 WeatherNext-class forecast data

WeatherNext 3 or successor data MAY be integrated as an advanced forecast source through official supported access mechanisms.

It MUST NOT be assumed to be identical to the consumer Weather API.

Raw/advanced forecast data MAY support:

- forecast raster/grid layers;
- ensemble/uncertainty;
- precipitation fields;
- wind fields;
- future-risk intersection with routes/areas;
- advanced forecast-derived Skills.

## 15.3 Weather feed behavior

Support:

- current conditions;
- hourly outlook;
- evening/night/tomorrow brief;
- material forecast changes;
- severe weather alerts where provider coverage exists.

Default behavior SHOULD be material-change driven rather than posting repetitive cards every few hours.

Users MAY opt into fixed scheduled brief windows:

```text
Morning
Afternoon
Evening
Night
Tomorrow
```

## 15.4 Strict fact classes

UI/data MUST distinguish:

```text
OBSERVATION
FORECAST
OFFICIAL_ALERT
DERIVED_RISK
AI_EXPLANATION
```

A forecast MUST NOT be presented as an official warning.

---

# 16. Hydrology Time-Series Intelligence

Hydrology is a first-class operational capability.

## 16.1 Canonical observations

Add:

```ts
interface HydroObservation {
  observationId: string;
  stationId: string;
  waterBodyId?: string;
  basinId?: string;

  observedAt: string;
  receivedAt: string;

  waterLevel?: number;
  waterLevelUnit?: string;
  datumRef?: string;

  discharge?: number;
  dischargeUnit?: string;

  rainfall?: number;
  rainfallUnit?: string;

  sourceRef: string;
  qualityFlag?: string;
  freshness: string;
}
```

Add reservoir/dam observations:

```ts
interface ReservoirObservation {
  structureId: string;
  observedAt: string;

  capacity?: number;
  storage?: number;
  percentStorage?: number;

  inflow?: number;
  outflow?: number;

  plannedOutflow?: TimeSeriesPoint[];

  sourceRef: string;
  freshness: string;
}
```

## 16.2 Do not store only the latest value

The system MUST retain sufficient time-series data to compute trends and reconstruct material changes according to retention policy.

---

# 17. Hydrology Trend Engine

Add:

```ts
interface HydrologyTrendSnapshot {
  stationId: string;
  asOf: string;

  currentLevel?: number;

  delta15m?: number;
  delta1h?: number;
  delta3h?: number;
  delta6h?: number;
  delta24h?: number;

  ratePerHour?: number;
  acceleration?: number;

  trend:
    | "RAPIDLY_RISING"
    | "RISING"
    | "SLIGHTLY_RISING"
    | "STABLE"
    | "SLIGHTLY_FALLING"
    | "FALLING"
    | "RAPIDLY_FALLING"
    | "UNKNOWN";

  warningThresholdDistance?: number;
  criticalThresholdDistance?: number;

  confidence: string;
  sourceFreshness: string;
}
```

Trend output MUST state what is observed.

Example:

```text
Observed: +12 cm over 3 hours
Trend: rising
```

It MUST NOT automatically extrapolate:

```text
Therefore +12 cm every next 3 hours
```

without a valid model.

---

# 18. Hydrology Material Change Detector

A new Feed item SHOULD NOT be created on every sensor sample.

Material triggers MAY include:

- rate of rise exceeds configured threshold;
- threshold crossing;
- `FALLING → RISING`;
- rapid acceleration;
- upstream stations simultaneously rising;
- major dam/reservoir release change;
- official planned release change;
- source becomes stale/unavailable;
- source recovers with materially changed values;
- observed flood extent expands materially.

Repeated small updates SHOULD update/coalesce the current card.

---

# 19. Hydro Network Graph

## 19.1 Basin-first architecture

The system SHALL model water topology independent of province borders.

Add:

```text
HydroNode
├─ RESERVOIR
├─ DAM
├─ WEIR
├─ GATE
├─ PUMP
├─ GAUGE
├─ CONFLUENCE
├─ OUTFALL
└─ OTHER_STRUCTURE

HydroEdge
├─ RIVER
├─ CANAL
├─ CREEK
├─ DRAINAGE_CHANNEL
├─ IRRIGATION_CHANNEL
├─ DIVERSION
├─ FLOODWAY
└─ OTHER_WATERWAY
```

Each directed edge SHOULD support, where known:

```text
upstream_node
downstream_node
geometry
flow_direction
basin
subbasin
capacity?
control_structure?
travel_time_estimate?
source/version
confidence
```

## 19.2 Province is a presentation/administrative boundary

Hydrological queries MUST NOT stop at a province boundary when upstream/downstream connectivity crosses it.

---

# 20. Impact Relevance Graph

Add generic:

```ts
interface ImpactRelation {
  sourceEntityRef: string;

  relation:
    | "UPSTREAM_WATER_IMPACT"
    | "DOWNSTREAM_WATER_IMPACT"
    | "WEATHER_APPROACHING"
    | "ROUTE_DEPENDENCY"
    | "INFRASTRUCTURE_DEPENDENCY"
    | "OFFICIAL_ALERT_INTERSECTION"
    | "SUPPLY_CHAIN_DEPENDENCY";

  targetGeometryRef?: string;
  targetEntityRefs?: string[];

  effectiveFrom?: string;
  estimatedArrivalWindow?: TimeWindow;

  severity?: string;
  confidence: string;
  sourceRefs: string[];
  reasoningCodes: string[];
}
```

This graph powers `AFFECTS_VIEWPORT`.

---

# 21. Water Propagation

## 21.1 P0 deterministic/structural propagation

P0 MAY establish:

```text
KNOWN_UPSTREAM_CHANGE
+
KNOWN_DOWNSTREAM_CONNECTIVITY
→ POTENTIAL_DOWNSTREAM_IMPACT
```

It MUST NOT claim exact flood depth or guaranteed arrival unless supported by validated data/model.

## 21.2 P1/P2 estimated propagation

Future capabilities MAY combine:

- upstream/downstream gauge movement;
- dam/reservoir release;
- river/canal topology;
- rainfall observations;
- forecast rainfall;
- tide;
- pump/gate state;
- DEM/terrain;
- historical propagation;
- satellite flood extent.

Output:

```ts
interface WaterPropagationEstimate {
  sourceEventRef: string;
  affectedSegments: string[];
  estimatedArrivalWindows?: Record<string, TimeWindow>;
  levelChangeRange?: Record<string, Range>;
  uncertainty: string;
  contributingFactors: string[];
  modelRef?: string;
  generatedAt: string;
}
```

Quantitative predictions MUST expose uncertainty and model/data provenance.

---

# 22. Hydrologic Impact Corridor and Exposure

A flood/water impact SHOULD follow river/canal topology and terrain, not only circular radius.

Add:

```ts
interface HydrologicImpactCorridor {
  corridorId: string;
  sourceSegmentRef: string;
  downstreamSegmentRefs: string[];
  affectedGeometry: GeoJSON.Geometry;

  scenarioRef?: string;
  estimatedArrivalWindow?: TimeWindow;

  uncertainty: string;
  sourceRevision: string;
}
```

Exposure MAY intersect with:

- buildings;
- villages/communities;
- roads;
- schools;
- hospitals;
- shelters;
- shops/services;
- power/water/communication assets;
- critical facilities.

Exposure ≠ confirmed damage.

UI MUST distinguish:

```text
IN_POTENTIAL_IMPACT_CORRIDOR
OBSERVED_AFFECTED
CONFIRMED_DAMAGED
```

---

# 23. Flash Flood Intelligence

Rapid runoff/flash flood SHALL be modeled separately from controlled reservoir-release effects.

Inputs MAY include:

```text
recent rainfall
forecast rainfall
catchment/topography
upstream observations
early-warning sensors
stream response
historical events
soil/catchment condition when available
```

Add:

```text
FlashFloodRiskState
FlashFloodIntelligenceSkill
CatchmentContext
```

The system MUST not create false numeric precision when local calibration is unavailable.

---

# 24. Flood Extent Intelligence

Support observational flood extent from remote sensing and authoritative geospatial providers.

Add:

```text
FloodExtentObservation
FloodExtentRevision
FloodFrequencyLayer
```

Use cases:

- current/recent observed flooded area;
- change from prior observation;
- intersection with communities/roads/facilities;
- validation/corroboration of other evidence;
- historical flood-frequency context.

Remote sensing observation time and acquisition latency MUST be visible where operationally material.

---

# 25. Thailand Deep Intelligence Pack

Thailand is the first deep local-intelligence implementation target.

Create logical pack:

```text
TH_INTELLIGENCE_PACK
```

Candidate/provider adapters include:

```text
RIDAdapter
RIDSWOCAdapter
DWRAdapter
ONWRAdapter
EGATWaterAdapter
HIIThaiWaterAdapter
GISTDAFloodAdapter
DDPMAdapter
TMDAdapter
ThaiLocalAuthorityAdapter
ThaiNewsAdapter
```

Each adapter MUST pass normal provider onboarding:

- source identity;
- endpoint/access;
- authentication;
- license/terms;
- redistribution rights;
- refresh cadence;
- data schema;
- geography;
- quality/freshness;
- failure semantics;
- attribution;
- cost/quota;
- change/retraction behavior.

No adapter is considered production-ready merely because a public web page exists.

## 25.1 Confirmed integration opportunities

At the time of this spec:

- RID SWOC exposes structured water/rain/infrastructure/reservoir/dam API families.
- DWR publishes Early Warning water-level/rainfall datasets for flash-flood/landslide-risk villages.
- ONWR publishes national basin/water-plan geospatial datasets and national water-situation datasets.
- GISTDA exposes flood-area APIs and map services.
- TMD exposes official meteorological API endpoints including warnings.
- Additional EGAT/HII/local feeds SHOULD be onboarded where access/licensing/production interface is verified.

Provider implementations MUST remain replaceable/versioned.

---

# 26. Global Base Pack

Create:

```text
GLOBAL_CORE_PACK
```

Minimum targets:

```text
Map
Places
Geocoding
Routes
Weather
Global disaster intelligence
```

Potential providers:

```text
Google Maps Platform
Google Weather API
GDACS
ReliefWeb
other global providers
```

Global providers supplement local data; they MUST NOT falsely imply local street-level or hydrological coverage.

---

# 27. Geographic Capability Registry

Add:

```ts
interface GeographicCapabilityCoverage {
  capability: string;

  geography: GeoScope;

  state:
    | "AVAILABLE"
    | "PARTIAL"
    | "DEGRADED"
    | "NOT_CONFIGURED"
    | "NOT_SUPPORTED"
    | "TEMPORARILY_UNAVAILABLE";

  providers: ProviderCoverageRef[];
  limitations: string[];

  updatedAt: string;
}
```

Resolution hierarchy:

```text
lat/lng
→ country
→ admin1/state/province
→ admin2/district/county
→ basin/subbasin
→ provider coverage
```

Coverage MUST NOT be modeled only by country.

---

# 28. Regional Intelligence Packs

Add:

```text
RegionalIntelligencePack
```

Example:

```text
Core Global Pack
Thailand Pack
Japan Pack
USA Pack
EU/Country Packs
Tenant/Enterprise Pack
```

A Regional Pack defines:

- adapters;
- capabilities;
- geographic coverage;
- source policy;
- legal/redistribution policy;
- localization metadata;
- refresh policy;
- fallback;
- quality/coverage disclosure.

Country-specific implementation MUST NOT require a separate frontend architecture.

---

# 29. Capability-Adaptive Feed

Feed composition SHALL adapt to available capabilities.

Example deep coverage:

```text
Critical warnings
Local incidents
Hydrology
Dam releases
Weather
News
Road access
Open businesses
Services
Community
```

Example limited country coverage:

```text
Weather
Weather alerts if supported
GDACS / global events
ReliefWeb / major reports
Places
Routes
Community
Coverage notice
```

If local news/hydrology are not connected:

```text
Local news: not connected
Hydrology: not connected
```

NOT:

```text
No local incident exists.
```

---

# 30. Data Coverage UI

Provide a compact user-visible `DataCoveragePanel`.

Example:

```text
Data coverage for this area

Map                 Available
Weather             Available
Weather alerts      Partial
Routes              Available
Local emergency     Limited
Local news          Not connected
Hydrology           Not connected
Community           Limited
```

Chat MUST be able to explain coverage limitations.

---

# 31. Thai + English Baseline

## 31.1 Mandatory languages

The product baseline MUST support:

```text
th — Thai
en — English
```

on:

- Map UI;
- Feed;
- Alerts;
- Incident details;
- Weather;
- Hydrology;
- Routes;
- Business/services;
- Report forms;
- Global Mini Chat;
- Task Control;
- Notifications;
- public share/deep-link surfaces.

## 31.2 Language independent from geography

```text
Geography != Interface language
```

Examples:

```text
Thailand + English UI
Japan + Thai UI
USA + Thai UI
```

MUST be valid.

## 31.3 Switching language

Language switching:

- MUST be reachable without login on public emergency surfaces;
- MUST preserve viewport;
- MUST preserve zoom;
- MUST preserve selected area/incident;
- MUST preserve Feed position/focus;
- MUST preserve route;
- MUST preserve journey;
- MUST preserve current action where feasible.

---

# 32. Source Language and Translation

Add:

```ts
interface LocalizedContent {
  originalLanguage: string;
  originalTextRef: string;

  translations: Record<string, {
    textRef: string;
    method: "OFFICIAL" | "REVIEWED" | "MACHINE";
    translatedAt: string;
    modelOrTranslatorRef?: string;
  }>;
}
```

Rules:

1. Original evidence/source content MUST remain preserved.
2. Machine translation MUST NOT overwrite the original.
3. Operationally material machine translation SHOULD be visibly identified.
4. Critical safety terminology SHOULD prefer official/reviewed translation templates.
5. Users SHOULD be able to view original source text where permitted.
6. Numbers, addresses, units, emergency numbers and named entities MUST not be semantically altered by translation.

---

# 33. Multilingual Geographic Names and Search

Add/extend:

```ts
interface GeoName {
  canonicalId: string;
  canonicalName: string;
  localName?: string;
  names: Record<string, string>;
  aliases: Record<string, string[]>;
}
```

Search SHALL resolve multilingual aliases to the same canonical entity.

Examples:

```text
Ayutthaya ↔ พระนครศรีอยุธยา
Pasak Jolasid Dam ↔ เขื่อนป่าสักชลสิทธิ์
Suvarnabhumi Airport ↔ ท่าอากาศยานสุวรรณภูมิ
```

LLMs MUST NOT invent new canonical place names on every request.

---

# 34. Local Businesses and Operational Services

Reuse Spec 260 local resilience entities.

Feed/Map SHOULD expose current operational status:

```text
OPEN
LIMITED
TEMPORARILY_CLOSED
CLOSED
UNKNOWN
STALE
```

Relevant fields include:

- updated/observed time;
- source;
- stock/capacity where applicable;
- opening window;
- contact methods;
- delivery/pickup;
- road/access constraints;
- payment methods if supplied;
- confidence.

Business verification MUST remain separate from current availability verification.

---

# 35. "Why am I seeing this?" Explainability

Feed cards SHOULD expose relevance reason where useful.

Examples:

```text
Why you're seeing this:
- Inside the area currently visible on your map
```

```text
Why you're seeing this:
- Upstream reservoir release may affect the basin you are viewing
```

```text
Why you're seeing this:
- Weather system is forecast to move into your selected area
```

This explanation MUST use stable reason codes, not only LLM-generated prose.

---

# 36. Watch Area / Watch Route / Watch Condition

Reuse existing scheduling/notification infrastructure.

Add user-facing capabilities:

```text
feed.create_watch
hydrology.watch
weather.watch
route.watch
area.watch
```

Condition examples:

```text
new critical incident
water level crosses threshold
water level rises rapidly
dam release materially increases
official alert issued
weather forecast materially worsens
road closes
important service opens/closes
route impact changes
```

Monitoring MUST prefer event/subscription/feed refresh infrastructure over continuous LLM polling.

---

# 37. Skill-First Capability Families

Add/extend Skills:

```text
MapContextSkill
MapCommandSkill
AreaSelectionSkill

ViewportSituationSkill
FeedRelevanceSkill
ImpactRelevanceSkill
FeedDigestSkill

WeatherContextSkill
WeatherForecastSkill
WeatherHazardIntersectionSkill
ForecastChangeSkill
AreaWeatherBriefSkill
RouteWeatherImpactSkill

HydrologyContextSkill
HydrologyTrendSkill
DamReleaseImpactSkill
UpstreamImpactSkill
DownstreamImpactSkill
WaterPropagationSkill
FloodExtentSkill
FlashFloodIntelligenceSkill
HydrologyBriefSkill

CoverageDiscoverySkill
RegionalProviderDiscoverySkill

MultilingualSituationSkill
```

Skills SHALL declare:

- input/output schema;
- capability requirements;
- permission scope;
- source requirements;
- cost class;
- latency class;
- freshness requirement;
- geographic coverage;
- fallback;
- cacheability;
- model/provider independence where possible.

---

# 38. API / MCP Capability Surface

Candidate capability family:

```text
map.get_context
map.apply_command

feed.get_focus
feed.set_focus
feed.lock_focus
feed.unlock_focus
feed.get_digest
feed.get_nearby
feed.get_critical
feed.get_changes_since
feed.get_major_news
feed.get_services
feed.get_open_businesses
feed.create_watch

coverage.get_capabilities
coverage.explain_gap

weather.get_current
weather.get_hourly
weather.get_daily
weather.get_alerts
weather.get_area_forecast
weather.get_material_changes

hydrology.get_station
hydrology.get_timeseries
hydrology.get_trend
hydrology.get_reservoir
hydrology.get_upstream
hydrology.get_downstream
hydrology.get_impact_corridor
hydrology.get_flood_extent
hydrology.get_material_changes
hydrology.create_watch
```

External agents using MCP/API MUST receive the same permission, quota, freshness, provenance and geographic-coverage semantics as first-party UI.

---

# 39. Data Freshness and Time Semantics

Every operational record MUST distinguish:

```text
observed_at
published_at
fetched_at
received_at
generated_at
valid_from
valid_until
forecast_for
```

where relevant.

A newly fetched old observation MUST NOT be displayed as a new real-world event.

Hydrology trend calculation MUST use observation time, not only ingestion time.

---

# 40. Confidence, Provenance and Uncertainty

Every derived impact SHOULD preserve:

- source refs;
- source class;
- data age;
- model/algorithm ref;
- relation/decision reason codes;
- uncertainty;
- version.

Do not collapse all uncertainty to an opaque score.

User-facing explanation SHOULD prefer:

```text
Confidence: medium

Why:
- 2 upstream gauges rising
- latest downstream gauge is 35 min old
- planned dam release is official
- rainfall forecast has moderate uncertainty
```

---

# 41. Security, Privacy and Sensitive Geography

Requirements:

- responder/live journey locations remain role/purpose scoped;
- sensitive household locations MUST not leak through Feed;
- hydrology exposure corridor MUST not expose protected case locations;
- Map/Feed deep links MUST use public-safe projections;
- repeated public generalized queries MUST not trivially reconstruct restricted exact coordinates;
- local-provider/commercial targeting MUST not use protected emergency vulnerability data;
- provider/API credentials remain server-side where architecture requires;
- external content cannot gain authority by prompt injection.

---

# 42. Provider Rights, Licensing and Attribution

Each provider adapter MUST declare:

```text
license
termsVersion
attribution
logoRequirement
cacheRights
retentionRights
offlineRights
redistributionRights
derivedDataRights
machineAnalysisRights
```

Provider policy failures MUST fail closed for prohibited operations while preserving unrelated emergency capabilities.

Google tile content MUST remain visualization content under applicable Map Tiles terms.

---

# 43. Performance and Cost

## 43.1 Viewport/feed efficiency

- viewport queries;
- delta/change feeds;
- coalescing;
- stable viewport debounce;
- cached situation products;
- aggregation at low zoom;
- no per-feature LLM calls;
- no Feed regeneration on every pan tick.

## 43.2 Weather/hydrology ingestion

Prefer shared ingestion and normalized cache over per-user duplicate provider calls.

## 43.3 Priority

Life-safety writes and critical alerts MUST remain protected over:

- historical playback;
- optional media;
- expensive forecast visualization;
- AI summaries;
- commercial Feed enrichment.

---

# 44. Observability

Track at minimum:

```text
map context bridge errors
map command failures
viewport/feed refresh rate
feed candidate counts
feed suppression/aggregation counts
impact-relevance candidate counts
coverage-gap frequency

weather provider latency/error/freshness
hydrology provider latency/error/freshness
station stale rate
trend computation lag
material-change detector rate
propagation computation lag

translation failures
machine-translation share
language-switch state-loss errors

provider costs/quotas
cache hit rates
```

---

# 45. Admin Configuration

Admin/tenant settings SHOULD support:

```text
Maps
  renderer
  basemap providers
  provider priority/fallback
  attribution/terms diagnostics

Weather
  provider priority
  alerts provider
  forecast provider
  budgets

Hydrology
  provider pack
  basin/network datasets
  station refresh
  material-change thresholds
  propagation features

Feed
  ranking policy
  lanes
  viewport-follow default
  materiality thresholds
  critical overrides
  commercial mixing policy

Localization
  default locale
  enabled locales
  TH/EN mandatory baseline status
  reviewed critical templates

Coverage
  country/region packs
  capability status
  provider health
```

---

# 46. Incremental Integration with Spec 260

Spec 262 MUST be implementable incrementally.

## Phase A — Bridge, no domain rewrite

1. Add `MapContextBridge`.
2. Add `MapCommandController`.
3. Reuse the existing AI Chat & Feedback panel and its AI Chat tab.
4. Reuse current Task Control.
5. Add `SpatialFocusContext`.
6. Connect current Map viewport to current Feed/query projection.

No migration of canonical incidents/tasks is required.

All emergency map entry points MUST reuse the public route and shared route manifest owned by Spec 260. New geospatial deep links or dashboard shortcuts MUST be registered through that manifest and project only the authorized public/operational context; this phase MUST NOT create a duplicate emergency-map route or navigation authority.

## Phase B — Adaptive Feed

1. Add viewport-driven focus.
2. Add zoom classes.
3. Add feed stabilization.
4. Add Feed focus lock.
5. Add Situation Digest.
6. Add `AFFECTS_VIEWPORT` candidate handling.
7. Add relevance explainability.

## Phase C — Weather

1. Production Google Weather API adapter where configured.
2. Material-change weather cards.
3. weather layers/timeline.
4. official national weather adapter.
5. advanced WeatherNext-class adapter when production access is validated.

## Phase D — Thailand Hydrology

1. Provider registry.
2. RID/SWOC.
3. DWR Early Warning.
4. ONWR basin/water-plan data.
5. GISTDA flood extent.
6. TMD warnings/weather.
7. additional EGAT/HII/local adapters after onboarding verification.
8. time-series normalization.
9. trend engine.
10. material-change feed.

## Phase E — Hydro Graph and Propagation

1. river/canal topology.
2. basin/subbasin linkage.
3. hydraulic structures.
4. upstream/downstream queries.
5. impact corridor.
6. exposure intersection.
7. deterministic P0 propagation.
8. later quantitative nowcast.

## Phase F — Global Rollout

1. Global Core Pack.
2. Geographic Capability Registry.
3. GDACS/ReliefWeb/global disaster adapters.
4. Regional Pack framework.
5. coverage disclosure UI.
6. country-specific packs over time.

## Phase G — Localization Completion

1. TH/EN all public surfaces.
2. source translation pipeline.
3. multilingual canonical names/search.
4. notification locale.
5. critical reviewed terminology.
6. no-state-loss language switching.

---

# 47. Priority Matrix

## P0

- MapLibre remains renderer.
- Google/other provider abstraction.
- no duplicate Map Chat.
- Map Context Bridge.
- typed Map Commands.
- SpatialFocusContext.
- viewport-driven Feed.
- zoom-aware aggregation.
- Dynamic Relevance Envelope.
- capability/coverage disclosure.
- TH/EN baseline.
- production Weather API integration where configured.
- hydrology provider registry.
- water-level/discharge time-series.
- trend engine.
- material-change Feed.
- Thailand initial providers.
- no-data ≠ safe semantics.

## P1

- HydroNetworkGraph.
- upstream/downstream impact.
- hydrologic impact corridor.
- flood extent integration.
- route/weather/hydrology intersection.
- flash-flood intelligence.
- Journey HUD/task overlay enhancements.
- Map Compare.
- saved operational views.
- GDACS/ReliefWeb global pack.
- Regional Intelligence Pack framework.

## P2

- quantitative hydrological nowcast;
- advanced WeatherNext ensemble/grid processing;
- sophisticated travel-time propagation;
- predictive exposure;
- advanced 3D/terrain visualization;
- additional country packs.

---

# 48. Initial Acceptance Tests 1–60

These are the initial baseline tests. Later revisions append to the cumulative suite; the latest active revised Definition of Done determines the authoritative cumulative test range.

Implementation MUST prove at minimum:

1. Opening Global Mini Chat from Map does not create a second chat thread authority.
2. Chat receives current viewport context without sending every rendered feature to the LLM.
3. "Show only flood and hospitals" changes Map through typed commands.
4. Closing Chat preserves map state.
5. Opening Task Control preserves selected map context.
6. Task creation from Map uses canonical Task Control.
7. Feed follows stabilized viewport by default.
8. Minor pan does not fully reset Feed.
9. Province zoom aggregates instead of emitting hundreds of individual cards.
10. High zoom can show individual nearby events/services.
11. Feed focus can be locked while Map pans elsewhere.
12. Critical official alert outside viewport enters Feed when its scope intersects focus.
13. Upstream dam-release event outside viewport can enter downstream Feed through impact relation.
14. Unrelated distant news does not enter local Feed merely because it is recent.
15. Feed card explains stable relevance reason.
16. Feed item can focus corresponding Map geometry.
17. Feed `Ask AI` opens existing Global Mini Chat.
18. `No local news provider` is shown as coverage gap, not "no event".
19. Country with only Map+Weather remains usable.
20. Provider capability is resolved by geography, not only country.
21. Weather observation remains distinct from forecast.
22. Weather forecast remains distinct from official alert.
23. Material weather change can generate/update one Feed card without repetitive spam.
24. Water station stores time-series rather than only latest value.
25. Rising/falling trend is computed from observation timestamps.
26. Small 5-minute changes do not create endless Feed cards.
27. Threshold crossing generates material-change event.
28. Stale water station is visibly stale.
29. Upstream station changes do not automatically claim downstream flood.
30. Hydro graph traverses across province boundaries.
31. Impact corridor follows water network rather than simple circular radius.
32. Potential exposure is not labeled confirmed damage.
33. GISTDA/remote flood extent retains observation/acquisition time.
34. Flash-flood risk is not treated as dam-release propagation.
35. Official planned release is distinguishable from observed discharge.
36. Quantitative nowcast exposes model/provenance/uncertainty.
37. Google Map Tiles policy prevents prohibited tile mirroring/offline behavior.
38. Basemap outage does not remove essential list/text emergency information.
39. TH public UI can switch to EN without login.
40. EN can switch back to TH without losing viewport.
41. Language switch preserves selected incident.
42. Language switch preserves Feed position/focus.
43. Source Thai text remains available after English translation.
44. Machine translation does not overwrite original evidence.
45. Critical reviewed translation can supersede machine translation for presentation while preserving provenance.
46. Search resolves Thai and English aliases to same canonical place.
47. Thailand pack can expose deep hydrology while another country exposes only global core.
48. Missing hydrology in another country is explicit.
49. Global disaster provider supplements but does not masquerade as street-level local intelligence.
50. Map/Feed/Chat use the same SpatialFocusContext unless user locks/overrides one.
51. Provider outage does not mark hazard resolved.
52. Feed ranking cannot suppress critical warning for sponsored content.
53. Local business stale availability loses operational prominence.
54. Map command replay does not duplicate side effects.
55. External MCP agent receives same geographic coverage/permission semantics.
56. Public anonymous user can access essential TH/EN safety information.
57. Sensitive responder location is not exposed through public Feed.
58. Coverage panel accurately reflects degraded provider state.
59. Provider licensing metadata prevents illegal cache/redistribution mode.
60. End-to-end disaster scenario below passes.

---

# 49. Mandatory End-to-End Scenario

A user opens SmartAIHub Emergency in Thailand. The map is rendered with MapLibre using the configured basemap. The current viewport covers several districts. Feed automatically follows that viewport after stabilization and shows a compact Situation Digest instead of hundreds of individual records.

A water station inside the viewport is rising. The time-series trend engine shows the observed 1h/3h/6h change and updates a single Hydrology Feed card when material thresholds are crossed.

A reservoir well outside the viewport announces a significant release change. The HydroNetworkGraph indicates that the reservoir feeds a downstream river/canal network connected to the focused area. The event enters the Feed as `AFFECTS_VIEWPORT`, clearly stating that it is upstream and potentially relevant; the system does not claim flooding is guaranteed.

An approaching rain system is forecast to affect the basin later in the evening. The Weather Feed card is labeled Forecast. A separate TMD/official warning, if present, is labeled Official Alert. The two are not conflated.

The user taps "ดูผลกระทบ". MapLibre highlights the downstream hydro corridor and relevant gauge stations. The user opens Global Mini Chat and asks "บริเวณนี้คืนนี้น่าห่วงแค่ไหน". The existing Chat receives the selected viewport, hydrology context, weather context and source references through the shared context bridge. The response can offer actions such as showing critical stations or watching the area.

The user switches the UI to English. The map viewport, selected corridor, Feed position, active watch setup and Chat context remain intact. Original Thai official source text remains accessible, while the user receives an English presentation with translation provenance.

Later the same user opens a map in another country where SmartAIHub has Map, Weather, Routes and global disaster feeds, but no local hydrology or local news integration. The UI remains functional and explicitly reports those coverage gaps rather than asserting there are no incidents.

This scenario MUST use the same canonical SmartAIHub Chat, Task Control, orchestration, notification, permission, billing and audit authorities established before Spec 262.

---

# 50. Definition of Done

Spec 262 is DONE only when:

- Spec 260 remains the canonical predecessor; its implementation status and gates follow its own progress ledger and latest addendum;
- no duplicate Chat or Task authority is introduced;
- Map/Feed/Chat context sharing works end to end;
- viewport-driven Feed and zoom aggregation are demonstrated;
- outside-viewport impact relevance is demonstrated;
- Weather is operational and correctly classified;
- hydrology time-series/trend/material-change flow is demonstrated;
- Thailand provider pack has at least one real production-grade hydrology path plus official weather/warning path;
- upstream/downstream graph behavior is demonstrated;
- capability gaps are visible and safe;
- a non-Thailand geography can operate in Global Core mode;
- Thai and English pass public emergency UX tests;
- provider policy/attribution/caching tests pass;
- all acceptance tests required by the latest active Spec 262 revision pass or have explicit owner-approved deferral with no life-safety regression.

---

# Appendix A — Initial Provider Research Snapshot

This appendix is implementation research, not a permanent guarantee of provider availability. Provider onboarding MUST re-verify access, terms, quotas and schemas at implementation time.

## Google Maps / Weather

- Map Tiles API overview: https://developers.google.com/maps/documentation/tile/overview
- Map Tiles API policies: https://developers.google.com/maps/documentation/tile/policies
- Map Tiles session tokens: https://developers.google.com/maps/documentation/tile/session_tokens
- Google Maps Platform coverage: https://developers.google.com/maps/coverage
- Weather API coverage: https://developers.google.com/maps/documentation/weather/coverage
- WeatherNext 3 announcement: https://blog.google/innovation-and-ai/models-and-research/google-deepmind/introducing-weathernext-3/

## Thailand

- RID SWOC REST API: https://swoc-api-service.rid.go.th/api/docs/
- ONWR 22-basin water-plan geospatial dataset: https://data.go.th/dataset/onwr_69_05_12
- ONWR national water-level situation dataset: https://data.go.th/dataset/dataset_12_024
- DWR Early Warning water level: https://data.go.th/dataset/gdpublish-dwr_11_03
- DWR Early Warning rainfall: https://data.go.th/dataset/gdpublish-dwr_11_04
- GISTDA Disaster Open API: https://disaster.gistda.or.th/services/open-api
- TMD API documentation: https://telecom.tmd.go.th/api-docs

## Global Disaster / Humanitarian

- GDACS API: https://www.gdacs.org/gdacsapi/swagger/index.html
- ReliefWeb API: https://apidoc.reliefweb.int/

---

# Appendix B — Required New Core Objects

```text
MapContextEnvelope
SpatialFocusContext
FeedFocusEnvelope
ViewportZoomClass
ImpactRelation
GeographicCapabilityCoverage
RegionalIntelligencePack
LocalizedContent
GeoName

SituationFeedItem
FeedRelevanceReason
FeedAggregationPolicy
FeedRefreshPolicy

HydroObservation
ReservoirObservation
HydrologyTrendSnapshot
HydrologyMaterialChange
HydroNode
HydroEdge
HydrologicImpactCorridor
WaterPropagationEstimate
FlashFloodRiskState
FloodExtentObservation
CatchmentContext
```

---

# Appendix C — Final Product Principle

> **The user's map view expresses what they are focusing on.  
> The Feed explains what matters to that focus.  
> The Global Chat lets the user ask and command.  
> Task Control executes and monitors real work.  
> Weather and hydrology extend awareness beyond what is visible.  
> Global capability coverage tells the truth about what the system does and does not know.**

# R1.1 — Research-Hardened Normative Additions

All R1.0 requirements remain normative. R1.1 adds and hardens provider acquisition, national hydrology, flood-defense, radar/rainfall, coastal/tide, road-passability, visual evidence, feed threading, model validation, and global-pack onboarding. If R1.1 is more specific than R1.0, R1.1 governs.

---

## R1.1-1 Research Findings and Design Consequences

Research performed against public Thai government data services confirms that a production Thailand pack can be substantially deeper than a simple weather/map integration. Public infrastructure currently exposes structured basin/stream GIS, reservoir/dam data, irrigation infrastructure, early-warning rainfall/water-level datasets, official warnings, flood-risk layers, flood-camera/water-level stations, road/embankment elevation data, tide stations and additional hazard layers.

Normative consequence:

> Thailand SHALL be implemented as a basin-first, network-aware intelligence pack rather than a Bangkok-centric flood viewer.

> Global architecture SHALL use the same canonical contracts even where only Map + Weather + Global Disaster capabilities are initially available.

FloodFight69 is treated as a UX/research reference only. Spec 262 MUST NOT depend on its implementation or assume its upstream endpoints until source-level verification succeeds.

---

## R1.1-2 Generic Source Acquisition Framework

Country expansion MUST NOT require a one-off ingestion stack for every provider. Add a reusable acquisition layer.

```text
SourceRegistry
  ↓
AcquisitionAdapter
  ├─ REST_JSON
  ├─ ARCGIS_FEATURESERVER
  ├─ ARCGIS_MAPSERVER
  ├─ OGC_WMS
  ├─ OGC_WMTS
  ├─ OGC_WFS
  ├─ CKAN_DATA_API
  ├─ RSS_ATOM
  ├─ XML
  ├─ CSV_FILE
  ├─ GEOJSON_FILE
  ├─ SHAPEFILE_PACKAGE
  ├─ OBJECT_STORAGE
  ├─ WEBHOOK_PUSH
  └─ HTML_OFFICIAL_SOURCE
```

Add:

```ts
interface ProviderSourceDescriptor {
  sourceId: string;
  providerId: string;
  jurisdiction?: GeoScope;
  acquisitionMethod: AcquisitionMethod;
  endpoint: string;
  authMode: string;
  dataClass: string[];
  queryCapability?: string[];
  declaredUpstreamWriteCapability?: string[];
  smartAIHubAccessMode: "READ_ONLY" | "AUTHORIZED_WRITE";
  refreshPolicy: RefreshPolicy;
  sourceTimezone?: string;
  licenseRef?: string;
  attributionRef?: string;
  termsRef?: string;
  schemaVersion?: string;
  parserVersion?: string;
  coverage?: GeoScope;
  healthState: SourceHealthState;
}
```

### Mandatory upstream-write safety

Many public ArcGIS services advertise create/update/delete operations at the service layer. SmartAIHub MUST still operate them as `READ_ONLY` by default.

Rules:

1. Public discovery of an upstream write operation does NOT authorize SmartAIHub to call it.
2. `Create`, `Update`, `Delete`, `ApplyEdits`, upload or equivalent MUST be blocked by adapter policy unless an explicit provider contract and credential grant authorize that operation.
3. Public/open-data ingestion credentials MUST be logically separated from any write-capable institutional integration.
4. A compromised prompt, Skill, agent or user cannot upgrade a read-only provider to write mode.
5. Upstream write requests require capability policy, explicit credentials, audit and provider-specific approval rules.

### Provider onboarding states

```text
CANDIDATE_UNVERIFIED
VERIFIED_PUBLIC_DOCUMENTATION
VERIFIED_MACHINE_READ
VERIFIED_PRODUCTION_READ
VERIFIED_AUTHORIZED_WRITE
DEGRADED
SUSPENDED
RETIRED
```

A website existing on the internet is not enough to classify it as `VERIFIED_PRODUCTION_READ`.

---

## R1.1-3 Thailand National Hydro/Disaster GIS Pack

Add a dedicated provider family:

```text
TH_NATIONAL_GEO_HAZARD_PACK
  ├─ DDPMHydroGISAdapter
  ├─ DDPMNDWCAdapter
  ├─ DDPMTelemeterAdapter
  ├─ DDPMFloodCameraAdapter
  ├─ RIDSWOCAdapter
  ├─ DWREarlyWarningAdapter
  ├─ ONWRAdapter
  ├─ GISTDAFloodAdapter
  ├─ TMDOfficialWeatherAdapter
  ├─ DOHOperationalRoadAdapter
  ├─ DRRFloodRoadAdapter
  └─ Additional verified provincial/local adapters
```

DDPM national GIS layers MAY provide, subject to verified schema/version:

- main basins;
- sub-basins;
- watersheds;
- major streams;
- minor streams;
- reservoirs;
- local water bodies;
- flood-risk locations/areas;
- embankment/reservoir-related assets;
- telemeter stations;
- flood/CCTV water-level stations;
- NDWC hazard layers such as flash flood, river overflow, Mekong, landslide, high sea level, wind/wave and other published hazard classes.

The pack MUST normalize these sources; UI MUST NOT bind directly to arbitrary ArcGIS field names.

---

## R1.1-4 Canonical Hydraulic Structure Model

Extend `HydraulicStructure`:

```text
DAM
RESERVOIR
WEIR
SPILLWAY
FLOOD_GATE
SLUICE_GATE
PUMP_STATION
RETENTION_BASIN
DETENTION_BASIN
DIVERSION_STRUCTURE
CULVERT
BRIDGE_OPENING
LEVEE
EMBANKMENT
FLOODWALL
TEMPORARY_BARRIER
OUTFALL
OTHER
```

Add separate state families:

```text
ObservedStructureState
PlannedStructureOperation
OfficialStructureInstruction
DerivedStructureImpact
```

Never merge a planned release with observed outflow.

Example:

```text
planned_outflow = 400 m³/s at 18:00
observed_outflow = 230 m³/s at 17:45
```

Both MUST remain separately queryable and visible in provenance.

---

## R1.1-5 River Bank, Freeboard, Road/Levee Elevation

Add:

```ts
interface HydraulicClearanceSnapshot {
  stationId: string;
  observedAt: string;
  waterLevel?: number;
  bankLevel?: number;
  warningLevel?: number;
  criticalLevel?: number;
  freeboardToBank?: number;
  freeboardToWarning?: number;
  verticalDatumRef?: string;
  quality: string;
  sourceRefs: string[];
}
```

The system SHOULD use river-bank level where available because absolute water level alone can be operationally misleading.

Road/embankment elevation data MAY be used for exposure and route-risk calculations.

Rules:

- vertical datum MUST be preserved;
- values from incompatible datums MUST NOT be compared without an explicit transformation;
- `freeboard` is observed/derived geometry, not a flood forecast;
- projected time-to-bank may be shown only as a trend projection with strong caveat and MUST NOT be labeled an official forecast.

---

## R1.1-6 Rainfall, Radar and Short-Horizon Rain Intelligence

Add canonical classes:

```text
RainGaugeObservation
RadarPrecipitationObservation
RadarFrame
RainCell
RainCellMotionEstimate
RainAccumulationWindow
RainForecastField
```

Potential Thailand sources include TMD, DWR Early Warning rainfall, RID/HII proxies, DDPM/TMD model layers and other verified services.

### Radar nowcast

A short-horizon rain-motion estimate MAY be derived from recent radar frames:

```text
radar t-30
radar t-15
radar t0
→ detect motion
→ intersect SpatialFocusContext
→ estimated arrival window
```

Any extrapolated rain-cell arrival MUST be labeled `DERIVED_NOWCAST`, not `OFFICIAL_FORECAST`.

### Multi-source precipitation fusion

The system MUST avoid double counting the same upstream dataset re-published through multiple portals. Provenance graph and independence-group logic from Spec 260 apply.

---

## R1.1-7 Coastal, Tide and Backwater Intelligence

Add:

```text
TideStation
TideObservation
TideForecast
SeaLevelAlert
CoastalBackwaterImpact
StormSurgeContext
DrainageOutfallConstraint
```

Coastal flood intelligence SHOULD combine, when available:

```text
rainfall
+ river/canal level
+ tide/sea level
+ pump/outfall state
+ storm surge / wind-wave warnings
+ local terrain/drainage constraints
```

A high tide or sea-level alert is not equivalent to confirmed inland flooding.

---

## R1.1-8 Flood Camera and Visual Observation

Add:

```ts
interface FloodCameraStation {
  stationId: string;
  geometry: GeoJSON.Point;
  relatedWaterbody?: string;
  relatedGauge?: string;
  agency: string;
  streamOrSnapshotAccess?: string;
  cameraHealth?: string;
  rightsRef: string;
}

interface CameraObservationSnapshot {
  stationId: string;
  capturedAt: string;
  mediaRef: string;
  sourceRef: string;
  visibilityClass: string;
  aiAnalysisRef?: string;
}
```

Computer vision MAY estimate visible waterline/road passability only as derived evidence. It MUST NOT silently become authoritative truth.

Original frame/time/source MUST remain available to authorized reviewers.

Privacy rules MUST address persons, vehicle plates, private property and sensitive incident evidence.

---

## R1.1-9 Flood Defense and Waterway Obstruction

Add:

```text
FloodDefenseAsset
FloodDefenseState
WaterwayObstruction
DrainageCapacityContext
```

`WaterwayObstruction` MAY include:

- water hyacinth;
- debris;
- sediment restriction;
- blocked culvert;
- bridge opening restriction;
- temporary structure;
- reported blockage.

Hydrologic propagation SHOULD account for known restrictions where validated.

Absence of an obstruction record MUST NOT imply unrestricted capacity.

---

## R1.1-10 Road Passability and Flooded Transport Network

Extend route safety with:

```ts
interface RoadOperationalState {
  roadSegmentRef: string;
  state:
    | "OPEN"
    | "LIMITED"
    | "CLOSED"
    | "EMERGENCY_ONLY"
    | "UNKNOWN"
    | "STALE";
  cause?: string;
  waterDepth?: number;
  vehicleClasses?: string[];
  observedAt?: string;
  effectiveFrom?: string;
  effectiveUntil?: string;
  sourceRefs: string[];
  confidence: string;
}
```

Candidate Thailand providers include official highway/rural-road flood/disaster reports and agency road-closure datasets when machine access is verified.

Precedence:

```text
official closure/restriction
> verified operator/responder restriction
> corroborated current observation
> routing provider inference
> isolated community report
> forecast risk
```

A route provider returning a route does not prove that the route is flood-safe.

---

## R1.1-11 Transboundary River Context

Add:

```text
TransboundaryRiverContext
CrossBorderHydroSource
CrossBorderImpactRelation
```

Use cases include the Mekong and future international basins.

Requirements:

- model source jurisdiction and country;
- distinguish foreign upstream observation from Thai official warning;
- preserve cross-border source attribution;
- allow upstream relevance outside national borders;
- do not truncate causal graph at national boundary;
- language/units/timezone must normalize safely;
- geopolitical or legal data-sharing restrictions remain provider policy.

---

## R1.1-12 Feed Threading and Update-in-Place

A material event SHALL have a stable feed thread rather than generating a new card for every observation.

Add:

```text
FeedThread
FeedThreadRevision
FeedMaterialChange
FeedDeliveryDecision
```

Example:

```text
Thread: Canal X rising water
  18:00 +4 cm/h
  18:20 +7 cm/h
  18:40 warning threshold crossed
  19:00 trend stabilized
```

The user SHOULD see one evolving card with a concise change log unless a new critical event requires preemption.

### Temporal feed lanes

Add optional slots:

```text
NOW
NEXT_1H
NEXT_3H
THIS_AFTERNOON
THIS_EVENING
TONIGHT
TOMORROW
LATER
```

This supports weather/preparedness reminders without flooding the feed.

---

## R1.1-13 Basin-Aware Spatial Focus

Viewport focus SHALL derive optional hydrological context:

```ts
interface FocusHydroContext {
  viewportGeometry: GeoJSON.Geometry;
  intersectedBasins: string[];
  intersectedSubBasins: string[];
  visibleWaterSegments: string[];
  nearbyGauges: string[];
  upstreamInfluencers: string[];
  downstreamDependents: string[];
}
```

Upstream relevance MUST be graph/basin based, not simply `radiusKm`.

To control overload, traversal MUST have bounded policies:

```text
max graph depth
max travel-time horizon
minimum materiality
max candidate count
source freshness requirement
```

---

## R1.1-14 Global Regional-Pack Manifest

Extend `RegionalIntelligencePack` with a portable manifest:

```ts
interface RegionalPackManifest {
  packId: string;
  version: string;
  geography: GeoScope;
  languages: string[];
  defaultUnits: string;
  defaultTimezonePolicy: string;
  capabilities: string[];
  providerBindings: ProviderBinding[];
  sourcePriorityRules: string[];
  officialAuthorityClasses: string[];
  licensePolicyRefs: string[];
  requiredAttributionRefs: string[];
  healthChecks: HealthCheckSpec[];
  acceptanceProfiles: string[];
}
```

A country pack MUST be installable/enableable without changing frontend architecture.

---

## R1.1-15 Data Quality, Units and Vertical Datum

Add explicit quality dimensions:

```text
SENSOR_VALID
SENSOR_SUSPECT
OUT_OF_RANGE
CLOCK_SKEW
STALE
DUPLICATE
MISSING_DATUM
DATUM_TRANSFORMED
MANUAL_ENTRY
SOURCE_CONFLICT
```

Requirements:

- retain original units;
- normalize to canonical units for computation;
- display locale-appropriate units at presentation;
- preserve vertical datum;
- never compare water level, bank level, road elevation or sea level across incompatible datums without transformation;
- retain sampling interval and data gaps;
- outliers MUST not silently become trend inputs.

---

## R1.1-16 Observation, Nowcast, Forecast and Official Warning Taxonomy

Every hazard fact SHALL declare exactly one primary class:

```text
OBSERVATION
OFFICIAL_ALERT
OFFICIAL_PLAN
DERIVED_NOWCAST
MODEL_FORECAST
SCENARIO_SIMULATION
AI_EXPLANATION
COMMUNITY_REPORT
NEWS_DERIVED_CLAIM
```

UI badges and APIs MUST preserve this distinction.

Example:

```text
Observed water level: 4.20 m
Official planned release: 400 m³/s at 18:00
Derived nowcast: rising water may reach downstream segment in 3–6 h
Official warning: evacuation order for named area
```

These four statements MUST never be collapsed into one generic `warning`.

---

## R1.1-17 Hydrological Model Governance and Backtesting

Any quantitative nowcast/forecast model used for public operational guidance MUST have:

```text
model_id
version
training/calibration scope
valid geography
valid horizon
input requirements
known limitations
uncertainty method
backtest period
validation metrics
last calibration date
owner
rollback version
```

Production gates SHOULD include basin-specific backtesting against observed gauges/flood extents.

A model outside validated geography/horizon MUST fail closed to qualitative/structural guidance.

Model drift or systematic bias MUST be observable.

LLM narrative does not count as hydrological model validation.

---

## R1.1-18 Time-Series Storage and Archive

PostgreSQL remains system of record for normalized operational observations. Spec 262 SHALL NOT introduce a second canonical database authority.

Recommended pattern:

```text
Hot operational window
→ partitioned/indexed PostgreSQL tables

Older eligible raw/derived time series
→ R2 columnar/archive artifacts where policy permits

Aggregates/features
→ reproducible projections with source/version refs
```

Requirements:

- retention differs by observation class;
- audit/source/provenance required for material events is preserved;
- archive compaction MUST not erase correction/retraction history;
- query path must avoid scanning entire history for ordinary viewport requests.

---

## R1.1-19 Source Health and Fallback Matrix

Add per-capability fallback policy.

Example:

```text
Water level:
  primary telemeter
  → alternate authority feed
  → last-known observation marked stale
  → community/news evidence only with lower authority

Weather:
  Google Weather
  + TMD official warning
  + national forecast model where configured

Road:
  official closure
  → alternate road agency
  → routing provider traffic
  → community observation
```

Source outage MUST NOT resolve an event.

---

## R1.1-20 Additional Map/Feed UI Components

Add reusable components:

```text
<HydrologyTrendCard />
<HydrologySparkline />
<HydraulicClearanceGauge />
<BasinContextChip />
<HydroNetworkInspector />
<RainRadarTimeline />
<RainCellMotionOverlay />
<FloodExtentTimeline />
<FloodDefenseLayer />
<TideAndBackwaterPanel />
<FloodCameraCard />
<RoutePassabilityLegend />
<SourceProvenanceDrawer />
<CoverageGapCard />
<FeedThreadCard />
```

The UI SHALL remain responsive/mobile-first and reuse the existing Global Mini Chat.

---

## R1.1-21 Source/Provenance Drawer

Every material Feed/Map card SHOULD permit users to inspect:

```text
Source agency
Source class
Observed time
Published time
Fetched time
Freshness
Verification state
Original language
Translation method
Related sources
Correction/retraction state
Forecast/model version when applicable
```

Public UI may simplify this into a concise drawer; responder/command UI may expose more.

---

## R1.1-22 Enhanced API / MCP Surface

Extend candidate capabilities:

```text
hydrology.get_bank_clearance
hydrology.get_network_path
hydrology.get_structure_state
hydrology.get_planned_release
hydrology.get_obstructions
hydrology.get_flood_defenses
hydrology.get_tide_context
hydrology.get_transboundary_context

rain.get_gauges
rain.get_radar_frames
rain.get_motion_estimate
rain.get_accumulation

flood.get_extent
flood.get_extent_forecast
flood.get_camera_stations
flood.get_camera_snapshot

road.get_operational_state
road.get_flood_constraints

source.get_health
source.get_provenance
coverage.get_provider_matrix
```

External agents MUST receive the same fact-class/provenance semantics as first-party UI.

---

## R1.1-23 Thailand Provider Research Matrix

This matrix is a research/onboarding guide, not a permanent availability guarantee. Implementers MUST revalidate endpoints, terms, authentication and redistribution at onboarding time.

| Provider/source family | Candidate capability | Initial status | Notes |
|---|---|---|---|
| DDPM ArcGIS national hydro | basin/sub-basin/watershed/major-minor stream | VERIFIED_PUBLIC_DOCUMENTATION | strong candidate for HydroNetworkGraph seed |
| DDPM CCTV station GIS | water level, river-bank level, basin, camera status | VERIFIED_PUBLIC_DOCUMENTATION | supports clearance/trend/context |
| DDPM flood-risk GIS | flood-risk level, basin/sub-basin | VERIFIED_PUBLIC_DOCUMENTATION | risk context, not current flood proof |
| DDPM embankment/reservoir GIS | structure/location/reservoir fields | VERIFIED_PUBLIC_DOCUMENTATION | normalize structure semantics carefully |
| DDPM/NDWC hazard GIS | flash flood, Mekong, high sea, landslide, overflow, wind/wave, etc. | VERIFIED_PUBLIC_DIRECTORY | validate each layer/schema before production |
| RID SWOC API | rainfall, water, irrigation infrastructure, reservoir, dam | VERIFIED_PUBLIC_DOCUMENTATION | JWT/auth and production terms must be tested |
| DWR Early Warning | water level, rainfall, village warning states | VERIFIED_PUBLIC_DATASET | important for flash-flood regions |
| TMD API | synoptic/METAR/warnings | VERIFIED_PUBLIC_DOCUMENTATION | official meteorological warning source |
| GISTDA disaster services | flood extent/other geospatial disaster layers | VERIFIED_PUBLIC_DOCUMENTATION | verify each service latency/rights |
| national tide-station datasets | tide observations | VERIFIED_PUBLIC_DATASET | coastal/backwater context |
| national road/embankment elevation | road/levee elevation | VERIFIED_PUBLIC_DATASET | vertical datum handling mandatory |
| official highway/rural road flood reports | passability/closure | CANDIDATE_VERIFICATION | onboard machine endpoints individually |
| local/provincial authorities | local flood/service/status | CANDIDATE_UNVERIFIED | Regional Pack extension |


---

## R1.1-23A Canonical External Entity Binding and Deduplication

The same physical station, dam, river segment, road, shelter or facility MAY appear in multiple provider datasets. SmartAIHub MUST NOT create independent physical entities solely because provider IDs differ.

Add:

```ts
interface ExternalEntityBinding {
  canonicalEntityRef: string;
  providerId: string;
  sourceEntityId: string;
  sourceEntityType: string;
  matchMethod: "EXPLICIT_ID" | "AUTHORITY_CROSSWALK" | "GEO_NAME" | "REVIEWED_MATCH";
  matchConfidence: string;
  validFrom?: string;
  validUntil?: string;
  reviewedBy?: string;
}
```

Rules:

- explicit authority crosswalk beats fuzzy name matching;
- nearby stations with similar names MUST NOT be auto-merged at high confidence without additional evidence;
- merged provider bindings preserve every upstream identifier;
- split/reconciliation MUST be supported when a previous match was wrong;
- data values from different providers remain separately sourced even when attached to the same canonical entity;
- one provider re-publishing another provider's observation MUST not create false independent corroboration.

---

## R1.1-23B Provider Contract Tests and Schema Drift

Each production adapter MUST have a provider contract fixture containing representative raw payloads and expected canonical output.

Required checks SHOULD include:

```text
schema fingerprint
required fields
coordinate reference system
unit mapping
vertical datum presence
source timezone
timestamp parser
null/sentinel values
coded-value mapping
geometry validity
pagination
rate-limit behavior
error payloads
auth expiry
correction/update semantics
```

On breaking drift:

```text
DETECT
→ QUARANTINE INVALID RECORDS
→ MARK PROVIDER DEGRADED
→ KEEP LAST-KNOWN SAFE PROJECTION WITH STALE LABEL WHERE POLICY ALLOWS
→ ALERT OPERATIONS
→ REQUIRE MAPPING/PARSER REVISION
```

Unknown fields MAY be retained as source metadata but MUST NOT silently map to a safety-critical canonical field.

---

## R1.1-23C Catchment Saturation, Terrain and Runoff Context

Add optional context objects:

```text
CatchmentSaturationContext
SoilMoistureObservation
AntecedentRainfallIndex
TerrainSlopeContext
RunoffResponseContext
```

These MAY use verified remote-sensing, national, academic or provider datasets.

Rules:

- absence of soil-moisture data does not block basic operation;
- generic/global soil moisture MUST not be presented as equivalent to calibrated local catchment instrumentation;
- antecedent rainfall and catchment saturation MAY raise flash-flood materiality;
- quantitative runoff prediction requires validated model scope.

---

## R1.1-23D Exposure Inventory and Critical Infrastructure

Extend exposure intersection beyond generic buildings.

```text
ExposureAsset
├─ HOUSEHOLD_BUILDING
├─ COMMUNITY
├─ SCHOOL
├─ HOSPITAL
├─ SHELTER
├─ ELDERCARE_FACILITY
├─ FIRE_RESCUE_STATION
├─ POLICE_STATION
├─ ROAD
├─ RAIL
├─ AIRPORT
├─ PORT
├─ POWER_SUBSTATION
├─ TELECOM_SITE
├─ WATER_SUPPLY_ASSET
├─ WASTEWATER_ASSET
├─ FUEL_STATION
├─ MARKET_BUSINESS_CLUSTER
├─ AGRICULTURAL_AREA
└─ OTHER_CRITICAL_FACILITY
```

`PotentialExposure` MUST remain distinct from `ObservedImpact` and `ConfirmedDamage`.

Population/household estimates SHOULD use privacy-safe aggregated geography on public surfaces.

---

## R1.1-23E Flood-Related Water Quality and Public Utility Context

Where providers expose water-quality or drinking-water system status, SmartAIHub MAY ingest:

```text
WaterQualityObservation
WaterSupplyOperationalState
WastewaterOperationalState
ContaminationAdvisory
```

This is especially relevant after flooding, industrial incidents or sewer overflow.

A water-quality measurement MUST retain parameter, unit, method/source, observed time and threshold basis. AI MUST NOT invent potability/safety from incomplete measurements.

---

## R1.1-23F Hydraulic Operation Event Stream

Gate, pump, weir, diversion and reservoir operations SHOULD be modeled as time-varying events where feeds exist.

```ts
interface HydraulicOperationEvent {
  structureRef: string;
  operationType: string;
  effectiveFrom: string;
  effectiveUntil?: string;
  plannedOrObserved: "PLANNED" | "OBSERVED" | "OFFICIAL_INSTRUCTION";
  openingOrSetting?: number;
  discharge?: number;
  unit?: string;
  reason?: string;
  sourceRefs: string[];
}
```

Unknown operating state MUST NOT be interpreted as closed, open or normal.


---

## R1.1-24 Revised Priority Matrix

### P0 — production-critical foundation

- Generic source acquisition framework.
- Source Registry + read-only upstream policy.
- DDPM/RID/DWR/TMD/GISTDA initial provider onboarding.
- National basin/stream graph seed.
- Gauge water-level time series.
- River-bank/freeboard semantics where available.
- Rain gauge + official weather warning ingestion.
- Viewport-driven Feed + Dynamic Relevance Envelope.
- Feed threading/update-in-place.
- Map ↔ Global Chat ↔ Task Control bridge.
- TH/EN baseline.
- Data coverage disclosure.
- Road official restriction ingestion where available.
- Fact-class taxonomy: observation/official/forecast/derived.

### P1 — operational depth

- flood cameras;
- radar timeline/short-horizon rain nowcast;
- flood extent;
- hydraulic structures;
- flood defenses/embankments;
- tide/backwater context;
- upstream/downstream graph impact;
- impact corridors;
- official road flood/passability feeds;
- flash-flood intelligence;
- transboundary river context;
- Map Compare and advanced timeline;
- source/provenance drawer.

### P2 — predictive sophistication

- quantitative water-propagation models;
- basin-calibrated hydrological nowcast;
- multi-model forecast ensemble;
- forecast flood extent;
- sophisticated terrain/road/levee hydraulics;
- computer-vision waterline/passability assistance;
- advanced country packs and cross-border basin intelligence.

---

## R1.1-25 Additional Acceptance Tests 61–140

61. Public ArcGIS service advertising update capability is still invoked read-only by default.
62. Agent prompt cannot convert a read-only provider into write mode.
63. Authorized institutional write integration requires separate explicit capability and credential.
64. ArcGIS schema drift triggers adapter degradation rather than corrupt normalization.
65. GeoJSON/PBF/JSON variants normalize to the same canonical geometry where equivalent.
66. Basin/stream source crosses province boundaries without truncation.
67. Major/minor stream graph can return an upstream path for a downstream viewport.
68. Graph traversal is bounded by configured depth/time/materiality budgets.
69. Cyclic/ambiguous network geometry does not cause infinite traversal.
70. Unknown flow direction is represented explicitly rather than guessed as fact.
71. Planned dam release remains distinct from observed discharge.
72. Cancelled/revised official release plan supersedes prior plan correctly.
73. Water level and bank level with different vertical datum are not compared silently.
74. Missing datum disables precise freeboard computation.
75. Freeboard crossing can trigger a material Feed update.
76. Linear time-to-bank extrapolation is never labeled official forecast.
77. Rain gauge outlier does not silently contaminate basin trend.
78. Duplicate rainfall source syndicated through two portals is not double counted.
79. Radar-motion estimate is labeled derived nowcast.
80. TMD official warning is visually distinct from derived radar nowcast.
81. Tide rise can affect coastal drainage context without being labeled inland flood.
82. High sea-level warning is not treated as confirmed road inundation.
83. Camera outage does not imply water condition is normal.
84. Computer-vision estimate from camera cannot override official gauge without policy.
85. Sensitive person/plate in camera evidence follows privacy/redaction policy.
86. Flood defense presence does not imply protection is functioning.
87. Flood-defense failure/reported breach changes impact assessment when verified.
88. Waterway obstruction can reduce confidence/capacity without inventing an exact hydraulic value.
89. Official road closure overrides route provider open-road inference.
90. One community passable report cannot reopen an official closure.
91. Vehicle-class-specific restriction affects only applicable routes.
92. Transboundary upstream event may enter Thai Feed as `AFFECTS_VIEWPORT`.
93. Foreign upstream observation is not mislabeled as Thai official warning.
94. Feed thread updates in place for repeated water-level samples.
95. Feed emits a new critical interruption when severity crosses configured critical threshold.
96. `TONIGHT` weather card does not duplicate an unchanged `THIS_EVENING` card.
97. Province-level viewport aggregates stations but retains drill-down.
98. Country-level viewport suppresses street-level utility noise.
99. Basin-aware focus can include upstream source outside viewport without including unrelated same-distance areas.
100. Hydrology candidate limit/budget prevents a very large basin graph from flooding Feed.
101. Regional Pack manifest can enable a country without frontend fork.
102. Regional Pack can declare partial language/provider coverage.
103. Source health state is visible to coverage resolver.
104. Provider 429/backoff does not trigger tight retry storm.
105. Old fetched observation retains original observed time.
106. Corrected sensor record revises trend reproducibly.
107. Model outside validated basin/horizon refuses precise quantitative forecast.
108. Model rollback preserves provenance of prior published forecast.
109. Archived time-series remains traceable to source/version.
110. Hot viewport query does not scan the entire historical archive.
111. Flood extent observation and flood extent forecast use different fact classes.
112. Potential exposure corridor is not labeled confirmed household flooding.
113. Road/levee elevation can be used only with compatible datum/context.
114. Local authority data can extend Thailand Pack without creating a new canonical schema.
115. Source translation preserves official numeric values and units.
116. English user can inspect original Thai warning text.
117. Thai user can consume foreign/global source via translated presentation while retaining original.
118. Public Source/Provenance Drawer does not leak restricted operational metadata.
119. External MCP consumer receives `source_health`, `fact_class` and freshness fields.
120. Integrated multi-province flood scenario below passes end to end.
121. Same physical gauge published by two providers can bind to one canonical station without losing source identity.
122. Two nearby similarly named gauges do not auto-merge without sufficient evidence.
123. Wrong station binding can be split/reconciled without rewriting historical observations.
124. Provider schema drift quarantines invalid records and marks source degraded.
125. Unknown coded value cannot silently map to `SAFE`, `OPEN` or another safety-critical state.
126. CRS mismatch is detected before geometry enters operational projection.
127. Sentinel numeric values such as -999 are not treated as real water/rain measurements.
128. Source timezone ambiguity cannot silently shift observed time.
129. Catchment saturation context can raise flash-flood relevance while remaining distinct from an official alert.
130. Global soil-moisture context is labeled with its resolution/limitations.
131. Potentially exposed building/community is not labeled damaged without observation/evidence.
132. Public exposure count uses privacy-safe aggregation where required.
133. Water-quality measurement cannot be converted into a drinking-water safety claim without applicable threshold/policy evidence.
134. Planned pump/gate operation remains distinct from observed operating state.
135. Unknown pump/gate state does not default to normal operation.
136. Hydraulic operation correction supersedes prior event while preserving history.
137. External source duplicate/republication does not count as independent corroboration after entity binding.
138. Provider contract fixture reproduces canonical output after parser/version upgrade.
139. Invalid upstream geometry cannot break viewport/feed query for unrelated valid data.
140. Integrated provider-drift + hydrology + feed + route degraded-mode scenario passes.

---

## R1.1-26 Mandatory Integrated Scenarios

### Scenario A — Multi-province controlled release

```text
Reservoir outside viewport announces planned release increase
→ official plan enters canonical state
→ observed outflow remains separately tracked
→ HydroNetworkGraph traverses downstream across province boundaries
→ focused viewport intersects affected basin
→ Feed receives AFFECTS_VIEWPORT card
→ card explains upstream relation
→ downstream gauges begin rising
→ same Feed thread updates with observations
→ one station approaches bank level
→ material warning update is emitted
→ road constraint appears
→ RouteSafetyEnvelope recomputes
→ Global Mini Chat answers with map/feed context
→ Task Control remains canonical for any operational assignment
```

### Scenario B — Mountain flash flood

```text
DWR/other gauge rainfall increases rapidly
+ upstream water-level station rises
+ flash-flood official warning becomes active
→ catchment-focused Feed prioritizes warning
→ map shows affected watershed/communities
→ system distinguishes official warning from AI explanation
→ stale/missing downstream gauge is disclosed
```

### Scenario C — Coastal rain + high tide

```text
heavy rainfall
+ tide rising
+ drainage outfall constraint
→ derived coastal-backwater context
→ no claim of confirmed flood until observation/evidence exists
→ route/feed show elevated uncertainty and relevant official warnings
```

### Scenario D — Transboundary Mekong

```text
foreign upstream river observation changes materially
→ cross-border source retained with jurisdiction
→ downstream Thai area is in FocusEnvelope
→ Feed explains upstream international relevance
→ Thai official alert, if later issued, supersedes/augments authority state without erasing foreign evidence
```

### Scenario E — Source conflict/outage

```text
primary gauge source fails
alternate source reports rising water
news says stable
community report says road flooded
→ system does not mark area safe
→ source-health panel shows outage
→ evidence remains differentiated
→ route may degrade to conservative state according to policy
```

### Scenario F — Global limited-coverage country

```text
Map + Weather + Routes available
local news not connected
hydrology not connected
→ map/feed/chat still function
→ coverage panel exposes gaps
→ global disaster source may supplement
→ absence of local records is not phrased as no incident
```

---

## R1.1-27 Definition of Done

Spec 262 R1.1 is DONE only when all R1.0 Definition-of-Done conditions remain satisfied and additionally:

1. generic source acquisition framework is implemented;
2. public external GIS is read-only by default;
3. at least one ArcGIS FeatureServer and one ordinary REST/CKAN-style source pass normalization tests;
4. national basin/stream topology is queryable;
5. water-level + bank/freeboard semantics work where data permits;
6. planned-vs-observed hydraulic operations are distinct;
7. Feed threading prevents sensor-update spam;
8. rainfall/weather fact classes are correctly labeled;
9. at least one official warning provider and one observation provider operate concurrently;
10. route safety consumes at least one non-routing-provider operational restriction source;
11. source health/fallback is visible;
12. source/provenance inspection works;
13. Thailand pack passes Scenario A and B;
14. global core passes Scenario F;
15. TH/EN behavior remains state-preserving;
16. acceptance tests 61–140 pass or have explicit owner-approved deferral with no life-safety regression.

---

# Appendix D — R1.1 Research Sources for Provider Onboarding

**Revalidate before production use. URLs and public availability may change.**

### DDPM / National Disaster GIS

- ArcGIS REST Services Directory: https://gis-portal.disaster.go.th/arcgis/rest/services
- National hydro group / 22 basins / reservoirs / major-minor streams: https://gis-portal.disaster.go.th/arcgis/rest/services/MapDX/DPM_TH_Hydrology/FeatureServer
- National flood-risk layer: https://gis-portal.disaster.go.th/arcgis/rest/services/DPM_CCTV_floodrisk/FeatureServer/0
- Flood/CCTV water-level station layer: https://gis-portal.disaster.go.th/arcgis/rest/services/Map_DDPM_CCTV/DDPM_CCTV_STATION_PROD/FeatureServer/0
- Embankment/reservoir-related layer: https://gis-portal.disaster.go.th/arcgis/rest/services/DATA502_Embankment/MapServer/0

### RID

- SWOC REST API documentation: https://swoc-api-service.rid.go.th/api/docs/

### DWR

- Early Warning water-level dataset: https://data.go.th/th/dataset/gdpublish-dwr_11_03
- Early Warning rainfall dataset: https://data.go.th/th/dataset/gdpublish-dwr_11_04
- Flash-flood/landslide warning dataset: https://data.go.th/th/dataset/gdpublish-dwr_12_02

### TMD

- Official meteorological REST API / warning endpoint docs: https://telecom.tmd.go.th/api-docs

### Tide / terrain-related public datasets

- Thailand tide-station catalog is discoverable through data.go.th; production integration MUST bind to the actual resource/API and preserve vertical datum.
- Road/embankment elevation dataset: https://data.go.th/dataset/road-level

### GISTDA

- Disaster open API/services: https://disaster.gistda.or.th/services/open-api

### Global

- GDACS API: https://www.gdacs.org/gdacsapi/swagger/index.html
- ReliefWeb API: https://apidoc.reliefweb.int/

---

# Appendix E — R1.1 Core Object Additions

```text
ProviderSourceDescriptor
AcquisitionMethod
ProviderOnboardingState
SourceHealthState

HydraulicStructure
ObservedStructureState
PlannedStructureOperation
HydraulicClearanceSnapshot
FloodDefenseAsset
FloodDefenseState
WaterwayObstruction
DrainageCapacityContext

RainGaugeObservation
RadarPrecipitationObservation
RadarFrame
RainCell
RainCellMotionEstimate
RainForecastField

TideStation
TideObservation
TideForecast
CoastalBackwaterImpact
DrainageOutfallConstraint

FloodCameraStation
CameraObservationSnapshot

RoadOperationalState
TransboundaryRiverContext
CrossBorderImpactRelation

FeedThread
FeedThreadRevision
FeedMaterialChange
FeedDeliveryDecision
FocusHydroContext
RegionalPackManifest
ExternalEntityBinding
CatchmentSaturationContext
SoilMoistureObservation
AntecedentRainfallIndex
TerrainSlopeContext
RunoffResponseContext
ExposureAsset
PotentialExposure
ObservedImpact
ConfirmedDamage
WaterQualityObservation
WaterSupplyOperationalState
WastewaterOperationalState
ContaminationAdvisory
HydraulicOperationEvent
```

---

# Appendix F — R1.1 Final Product Principle

> **Map viewport tells SmartAIHub where the user is focusing.**
>
> **Hydrological topology tells SmartAIHub what can affect that focus even when it is far away.**
>
> **Sensors, official feeds, weather, radar, infrastructure, roads, cameras, satellite and community evidence tell SmartAIHub what is happening and how reliable that picture is.**
>
> **The Feed turns those facts into a small number of material, evolving situation threads.**
>
> **Global Mini Chat explains and controls the workspace; Task Control remains the execution authority.**
>
> **Coverage disclosure tells the user what SmartAIHub does not know.**

**End of Spec 262 R1.1**

---

# R1.2 — Twelve-Pass Gap Review and Production Hardening

R1.2 is the result of twelve independent review passes over the complete R1.1 specification. Each pass used a different failure lens. All gaps listed below are incorporated as normative requirements; they are not optional commentary.

R1.2 does not alter the implementation boundary: Spec 260 remains implemented and unmodified. Where R1.2 is more specific than R1.0/R1.1, R1.2 controls for Spec 262 implementation.

## R1.2 Review Ledger

| Pass | Review lens | Gap found | R1.2 remediation |
|---|---|---|---|
| 1 | Hydrologic topology realism | R1.1 still modeled edge direction too statically for gates, pumps, tidal reversal and controlled canals | Added dynamic/reversible topology, topology revisions and operation-dependent connectivity |
| 2 | Urban drainage | River/canal graph did not explicitly model sewers, drainage tunnels, retention systems and combined drainage overflow | Added UrbanDrainageGraph and urban pluvial-flood contracts |
| 3 | Sensor lifecycle/data quality | Quality flags existed but station relocation, calibration, maintenance, late corrections and interpolation policy were incomplete | Added SensorAssetLifecycle, ObservationQualityAssessment and late/corrected-event semantics |
| 4 | Global interoperability | Generic adapters lacked first-class SensorThings, WaterML, STAC, OGC API Features/Tiles and forecast binary formats | Added standards-first interoperability profile and safe parsers |
| 5 | Feed/watch human factors | Material-change logic lacked explicit hysteresis, cooldown, acknowledgement and ranking reproducibility | Added AttentionBudgetPolicy, WatchEvaluationState and FeedRankingTrace |
| 6 | Offline/accessibility | New Map/Feed/Hydrology surfaces did not fully restate low-bandwidth, no-map and non-visual access requirements | Added OfflineSituationPackage and accessibility requirements |
| 7 | Security/privacy/abuse | Public-source ingestion and viewport context needed SSRF/parser-bomb defenses, focus privacy and manipulation resistance | Added ingestion sandbox, privacy rules and geospatial abuse controls |
| 8 | Forecast lifecycle | Model governance existed but forecast-run identity, supersession and verification against observations were underspecified | Added ForecastRun, ForecastVerificationRecord and model validity envelope |
| 9 | Global jurisdiction/localization | Regional packs needed stronger legal, data-residency, emergency-number and terminology policy hooks | Added JurisdictionPolicyProfile and locale fallback semantics |
| 10 | Provider production operations | Health/fallback existed but lacked canary/shadow rollout, feature flags, explicit SLOs and economic budgets | Added ProviderReleasePolicy, ProviderBudget and capability SLOs |
| 11 | Scale/indexing/reconciliation | Nationwide/global spatial and graph workloads lacked explicit partitioning, late-data recomputation and bounded recompute policy | Added spatial/temporal partition strategy and revision-aware recomputation |
| 12 | Compatibility/rollback/DoD | API/schema compatibility and disaster-time rollback needed stronger gates | Added version compatibility, migration/rollback contract and 60 additional acceptance tests |

---

## Pass 1 — Dynamic Hydrologic Topology and Reversible Flow

### Gap

A canonical `HydroEdge` with one stable `flow_direction` is insufficient for controlled and tidal systems. Canals can reverse, split, stop or redirect because of gates, pumps, diversions, tides, temporary barriers, operational orders or failure states.

### Patch

Add:

```ts
interface HydroTopologyRevision {
  topologyRevisionId: string;
  effectiveFrom: string;
  effectiveUntil?: string;
  sourceRefs: string[];
  reasonCodes: string[];
}

interface HydraulicConnectivityState {
  edgeRef: string;
  topologyRevisionId: string;

  direction:
    | "FORWARD"
    | "REVERSE"
    | "BIDIRECTIONAL"
    | "NO_FLOW"
    | "UNKNOWN";

  connectivity:
    | "CONNECTED"
    | "PARTIALLY_CONNECTED"
    | "ISOLATED"
    | "UNKNOWN";

  controlStructureRefs: string[];
  observedAt?: string;
  validFrom?: string;
  validUntil?: string;
  sourceRefs: string[];
  confidence: string;
}
```

Requirements:

1. `HydroNetworkGraph` MUST distinguish static physical connectivity from current operational connectivity.
2. Upstream/downstream traversal MUST consult the applicable `HydraulicConnectivityState` when known.
3. A tidal river/canal MAY be directionally reversible.
4. Pump/gate operation MAY change connectivity without changing physical geometry.
5. Unknown direction MUST remain `UNKNOWN`; the system MUST NOT force an arbitrary downstream path.
6. Topology corrections MUST create a new revision rather than rewriting prior operational reasoning.
7. Derived impact products MUST record the topology revision used.
8. A stale control-state feed MUST reduce confidence rather than silently assume normal operation.
9. Flow split across branches MAY be qualitative (`PRIMARY`, `SECONDARY`, `UNKNOWN`) until calibrated quantitative allocation exists.
10. Quantitative branch allocation MUST identify model/source and uncertainty.

---

## Pass 2 — Urban Drainage and Pluvial Flood Intelligence

### Gap

R1.1 covered rivers, canals, gates and pumps but did not make underground urban drainage a first-class graph. Urban flooding can occur even when nearby river levels are normal.

### Patch

Add:

```text
UrbanDrainageNode
├─ INLET
├─ MANHOLE
├─ PUMP_STATION
├─ RETENTION_POND
├─ DETENTION_POND
├─ DRAINAGE_TUNNEL
├─ OUTFALL
├─ FLOOD_GATE
└─ SEWER_OVERFLOW_POINT

UrbanDrainageEdge
├─ STORM_DRAIN
├─ COMBINED_SEWER
├─ DRAINAGE_TUNNEL
├─ OPEN_DRAIN
└─ PUMPED_LINK
```

Add:

```ts
interface UrbanDrainageState {
  assetRef: string;
  state: "NORMAL" | "LIMITED" | "SURCHARGED" | "BLOCKED" | "FAILED" | "UNKNOWN";
  capacityEstimate?: number;
  unit?: string;
  observedAt?: string;
  sourceRefs: string[];
  confidence: string;
}
```

Requirements:

- `UrbanDrainageGraph` SHALL be a sibling to `HydroNetworkGraph`, not a replacement.
- Surface-water, canal/river and urban-drainage interactions SHOULD be linkable through outfalls, pumps and flood gates.
- Pluvial flood intelligence MAY use rainfall intensity, local terrain/depression, drain capacity, pump state and observed street flooding.
- Combined sewer overflow or wastewater overflow MUST be distinguishable from ordinary surface-water flooding.
- Absence of underground drainage data MUST be exposed as a coverage limitation.
- SmartAIHub MUST NOT infer pipe capacity from map geometry alone.

---

## Pass 3 — Sensor Asset Lifecycle, Calibration and Late Data

### Gap

Quality flags alone do not capture that a station may move, change datum, change sensor, be under maintenance or publish corrected values after initial ingestion.

### Patch

Add:

```ts
interface SensorAssetLifecycle {
  sensorRef: string;
  stationRef: string;
  installedAt?: string;
  retiredAt?: string;
  locationValidFrom?: string;
  locationValidUntil?: string;
  calibrationAt?: string;
  calibrationMethodRef?: string;
  maintenanceState?: "NORMAL" | "MAINTENANCE" | "DEGRADED" | "OUT_OF_SERVICE" | "UNKNOWN";
  firmwareOrDeviceVersion?: string;
  datumRef?: string;
  sourceRefs: string[];
}

interface ObservationQualityAssessment {
  observationRef: string;
  state:
    | "VALID"
    | "SUSPECT"
    | "OUTLIER"
    | "CLOCK_SKEW"
    | "DATUM_CONFLICT"
    | "CALIBRATION_UNCERTAIN"
    | "MAINTENANCE_WINDOW"
    | "MISSING"
    | "CORRECTED"
    | "UNKNOWN";
  reasonCodes: string[];
  assessedAt: string;
  assessor: "SOURCE" | "DETERMINISTIC_RULE" | "MODEL" | "OPERATOR";
}
```

Rules:

1. Station identity and physical sensor identity MUST be separate.
2. Station relocation MUST preserve historical geometry validity windows.
3. Datum change MUST not silently join incompatible series.
4. Late-arriving observations MUST be inserted by event time and MAY trigger bounded trend/forecast recomputation.
5. Corrected observations MUST preserve the superseded value and correction provenance.
6. Interpolated/imputed values MUST be explicitly labeled and MUST NOT masquerade as sensor observations.
7. Safety-critical threshold crossing SHOULD prefer real validated observations over imputed values.
8. Maintenance/out-of-service periods MUST affect freshness/coverage.
9. Trend calculation MUST exclude invalid/outlier points according to deterministic policy, with traceability.
10. Sensor-health inference MUST NOT be treated as hazard-state truth.

---

## Pass 4 — Standards-First Global Interoperability

### Gap

R1.1 supported common transport protocols and GIS services but lacked several global geospatial/hydrology standards that materially reduce country-specific adapter work.

### Patch

Extend acquisition methods:

```text
OGC_API_FEATURES
OGC_API_TILES
OGC_SENSORTHINGS
WATERML_2
CAP_ALERT
STAC_API
GEOPARQUET
NETCDF
GRIB2
ZARR
```

Requirements:

- CAP ingestion SHALL reuse the canonical alert lifecycle/authority rules from Spec 260.
- OGC SensorThings observations SHALL normalize through the same canonical observation contracts as proprietary APIs.
- WaterML 2.0 MAY map water-level/discharge time series to canonical hydrology observations while preserving procedure/feature-of-interest metadata.
- STAC SHALL be supported for cataloging time-stamped satellite/raster assets where appropriate.
- OGC API Features/Tiles SHOULD be preferred over scraping when a provider offers them with acceptable terms.
- NetCDF/GRIB2/Zarr forecast ingestion MUST be processed outside the browser and behind resource limits.
- GeoParquet MAY be used for permitted bulk/analytic interchange, not as a new source of truth.
- Standards support MUST preserve provider-specific terms, quality flags and semantics rather than flattening all fields into lowest-common-denominator data.

---

## Pass 5 — Feed/Watch Attention Budget, Hysteresis and Reproducibility

### Gap

Material-change detection existed, but repeated threshold oscillation could still generate notification/feed churn. Ranking explanations also needed a reproducible decision trace.

### Patch

Add:

```ts
interface WatchEvaluationState {
  watchRef: string;
  lastEvaluatedAt: string;
  lastTriggeredAt?: string;
  currentBand?: string;
  acknowledgementState?: "UNACKNOWLEDGED" | "ACKNOWLEDGED" | "SNOOZED";
  suppressionUntil?: string;
  activeIncidentRefs: string[];
}

interface AttentionBudgetPolicy {
  ordinaryCooldown?: string;
  hysteresis?: Record<string, number>;
  digestWindow?: string;
  maxNonCriticalInterruptionsPerWindow?: number;
  criticalBypass: boolean;
}

interface FeedRankingTrace {
  feedItemRef: string;
  candidateRevision: string;
  focusRevision: string;
  rankingPolicyVersion: string;
  materialityFactors: Record<string, number | string>;
  suppressionReasons: string[];
  finalLane: string;
  generatedAt: string;
}
```

Rules:

1. Threshold-based watches SHOULD use hysteresis where appropriate.
2. Critical life-safety alerts MAY bypass cooldown/digest suppression.
3. Acknowledgement does not resolve the underlying event.
4. Feed ranking MUST NOT optimize solely for engagement time/clicks.
5. `Why am I seeing this?` SHOULD derive from stable reason codes/ranking trace.
6. Re-ranking due only to minor viewport jitter SHOULD not reorder the entire visible Feed.
7. Users MAY reduce ordinary interruptions but MUST NOT be able to accidentally hide policy-mandated critical safety information without a clear warning/explicit control.
8. Multiple sensors describing one material event SHOULD coalesce into one event/feed thread when correlation is sufficient.

---

## Pass 6 — Offline, Low-Bandwidth and Accessibility Completion

### Gap

Spec 260 contained low-connectivity principles, but Spec 262's new Map/Feed/Hydrology surfaces need explicit equivalent behavior.

### Patch

Add:

```ts
interface OfflineSituationPackage {
  packageId: string;
  areaRef: string;
  generatedAt: string;
  dataThrough: string;
  expiresAt?: string;
  permittedBasemapRefs: string[];
  situationDigestRef: string;
  criticalAlertRefs: string[];
  routeConstraintRefs: string[];
  hydrologySummaryRefs: string[];
  providerRightsRefs: string[];
}
```

Requirements:

- Essential Feed/alert/list content MUST remain usable when interactive map rendering fails.
- Offline package contents MUST respect each provider's offline/cache rights.
- Text-first critical information SHOULD load before rich imagery during constrained connectivity.
- The UI MUST provide a non-map list/table equivalent for material markers/events.
- Hydro trend direction MUST not rely on color alone; use text/icon/shape as well.
- Charts/sparklines MUST expose accessible text summaries.
- Keyboard navigation, focus order and screen-reader labels are required for map controls, feed cards and critical actions.
- Reduced-motion preferences MUST disable nonessential pulsing/animated flows.
- Low-bandwidth mode MAY reduce imagery/tile detail but MUST preserve critical facts, timestamps, source and verification state.
- Cached/offline state MUST display its data-through time and must not masquerade as live.

---

## Pass 7 — Ingestion Security, Viewport Privacy and Manipulation Resistance

### Gap

Global source onboarding increases attack surface. In addition, map focus itself can be privacy-sensitive and should not become indefinite behavioral surveillance.

### Patch

External acquisition MUST enforce:

```text
network egress allowlist / SSRF protection
DNS rebinding protection
redirect limits
TLS validation
response-size limits
timeouts
content-type validation
archive/file count limits
geometry complexity limits
XML entity expansion disabled
zip/shapefile decompression limits
image/media proxy safety
malware/content scanning where applicable
parser sandbox/resource limits
```

Privacy requirements:

1. Raw viewport history MUST NOT be retained indefinitely by default merely because a user pans the map.
2. Product analytics SHOULD use coarse/aggregated focus telemetry when detailed geometry is unnecessary.
3. Saved areas/watches are intentional user state and MAY be retained according to product policy; transient map exploration is distinct.
4. Sensitive incident/household geometry MUST not enter analytics or commercial segmentation.
5. Cross-device focus synchronization requires authenticated, policy-permitted state.
6. Anonymous session identifiers MUST not be silently transformed into permanent location profiles.

Abuse/manipulation controls:

- coordinated false community reports;
- bot-generated map/feed spam;
- repeated fake road-open/road-closed reports;
- geospatial brigading;
- provider impersonation;
- malicious source content/prompt injection;
- fraudulent open-business/service claims.

A manipulation signal MUST affect evidence/review policy, not become a permanent citizen reputation score.

---

## Pass 8 — Forecast Run Lifecycle, Supersession and Verification

### Gap

R1.1 modeled model governance but not the full lifecycle of forecast runs and later verification against observed reality.

### Patch

Add:

```ts
interface ForecastRun {
  forecastRunId: string;
  modelRef: string;
  modelVersion: string;
  issuedAt: string;
  validFrom: string;
  validUntil: string;
  initializationTime?: string;
  ensembleMemberCount?: number;
  inputDataRevisionRefs: string[];
  supersedesForecastRunId?: string;
  geographyValidityRef: string;
  horizonClass: string;
  state: "ACTIVE" | "SUPERSEDED" | "WITHDRAWN" | "INVALIDATED";
}

interface ForecastVerificationRecord {
  forecastRunRef: string;
  targetRef: string;
  verificationWindow: string;
  observedRefs: string[];
  metrics: Record<string, number>;
  sampleCount: number;
  verificationVersion: string;
}

interface ModelValidityEnvelope {
  modelRef: string;
  geography: GeoScope;
  validHazards: string[];
  horizonMin?: string;
  horizonMax?: string;
  requiredInputs: string[];
  excludedConditions: string[];
}
```

Requirements:

- New forecast runs MUST supersede older runs for overlapping valid time where policy says so; history remains accessible.
- A withdrawn/invalidated forecast MUST propagate to affected Feed/map projections.
- Verification metrics SHOULD be hazard/model appropriate and MUST include sample size/context.
- A model MAY be valid for one basin/horizon and invalid for another.
- SmartAIHub SHOULD prefer calibrated local models when demonstrably appropriate, but MUST preserve source/model provenance.
- LLM explanation cannot upgrade an unverified forecast into an official warning.

---

## Pass 9 — Jurisdiction, Data Residency and Localization Policy

### Gap

Regional packs needed explicit operational/legal policy beyond provider lists.

### Patch

Add:

```ts
interface JurisdictionPolicyProfile {
  jurisdictionRef: string;
  emergencyNumbers: string[];
  officialAuthorityClasses: string[];
  defaultTimeZone?: string;
  supportedUnitsPolicyRef?: string;
  dataResidencyRules?: string[];
  crossBorderTransferRules?: string[];
  redistributionRules?: string[];
  retentionRules?: string[];
  requiredDisclaimers?: string[];
  criticalTerminologyPackRef?: string;
  supportedLocales: string[];
}
```

Rules:

1. Regional packs MUST NOT assume Thailand's authority structure, emergency number, units or legal rules globally.
2. Cross-border hydrology MAY combine observations from multiple jurisdictions while preserving each source's authority scope.
3. Foreign upstream data MUST not be relabeled as the downstream country's official warning.
4. Time must be stored as unambiguous instants; presentation uses appropriate local timezone/context.
5. Language fallback SHOULD follow an explicit chain, for example `user locale → English → source original`, without hiding original authoritative text.
6. Thai and English remain mandatory baseline product languages for SmartAIHub public emergency UI.
7. RTL-ready layout support MUST remain possible for future regional packs.
8. Emergency-number display MUST be jurisdiction-aware and not inferred from UI language alone.

---

## Pass 10 — Provider Release Engineering, SLOs, Budgets and Canary

### Gap

A verified adapter can still regress after upstream/provider changes or a SmartAIHub parser release.

### Patch

Add:

```ts
interface ProviderReleasePolicy {
  adapterRef: string;
  adapterVersion: string;
  rolloutState: "DISABLED" | "SHADOW" | "CANARY" | "ACTIVE" | "ROLLED_BACK";
  canaryScope?: GeoScope;
  comparisonSourceRef?: string;
  rollbackVersion?: string;
  featureFlagRef?: string;
}

interface ProviderBudget {
  providerRef: string;
  capability: string;
  maxConcurrency?: number;
  requestRate?: number;
  costBudgetPerHour?: number;
  costBudgetPerDay?: number;
  priorityReservation?: string;
  retryPolicyRef: string;
}

interface CapabilitySLO {
  capability: string;
  geography?: GeoScope;
  availabilityTarget?: number;
  freshnessTarget?: string;
  propagationLatencyTarget?: string;
  viewportLatencyTarget?: string;
  degradedModePolicyRef: string;
}
```

Requirements:

- New/changed provider adapters SHOULD support `SHADOW` or bounded canary where feasible.
- Provider failover MUST NOT silently downgrade source authority or freshness without disclosure.
- Life-safety capacity MAY reserve provider budget ahead of optional enrichment.
- Cost exhaustion MUST degrade optional capabilities before critical minimum safety service.
- Upstream quota/rate limit state MUST be visible to operations.
- Rollback MUST preserve already-ingested provenance and canonical records.
- SLO monitoring MUST be capability/geography aware; a global average cannot hide a failed province/region.

---

## Pass 11 — Spatial/Temporal Partitioning and Revision-Aware Recompute

### Gap

Nationwide/global operation needs explicit bounded indexing and recomputation so one large basin/event cannot trigger unbounded graph or Feed work.

### Patch

Add logical policies:

```text
SpatialPartitionStrategy
TemporalPartitionStrategy
GraphTraversalBudget
DerivedProductRecomputePolicy
```

Requirements:

1. Spatial indexing MAY use H3/S2/geohash/PostGIS partitions or another fit-for-purpose strategy; Spec 262 does not mandate one vendor/index.
2. Basin/subbasin identity SHALL complement, not replace, generic spatial indexing.
3. Feed candidate queries MUST be bounded by focus, materiality, time and graph traversal budgets.
4. Graph traversal MUST protect against cycles and pathological branch explosion.
5. Late/corrected observations trigger only affected derived products where possible.
6. Recompute jobs MUST carry input revision refs and abort/supersede when newer canonical revisions make them obsolete.
7. National-scale low-zoom views SHOULD use pre-aggregated/materialized products rather than raw station fan-out.
8. Historical playback MAY use coarser aggregates when exact raw replay is not required, but provenance to source data must remain.
9. Cache keys MUST include material data/policy revisions so stale semantic products do not survive a source correction.
10. Backlog recovery MUST prioritize current critical products over obsolete historical enrichment.

---

## Pass 12 — Version Compatibility, Disaster-Time Rollback and Final Production Gate

### Gap

Spec 262 introduces many new schemas/capabilities. Old clients, active incidents and in-flight watches must remain safe across upgrades and rollback.

### Patch

Add:

```text
GeoCapabilitySchemaVersion
RegionalPackVersion
MapCommandVersion
FeedProjectionVersion
HydrologySchemaVersion
```

Rules:

1. Public/API/MCP clients MUST negotiate or tolerate compatible additive fields according to existing SmartAIHub API-version policy.
2. Breaking schema changes require a migration path and compatibility window.
3. Active watches MUST survive compatible deployment upgrades without silent reset.
4. Rollback MUST not delete observations/feed history accepted by a newer release.
5. A regional-pack rollback MUST preserve canonical data already ingested and mark incompatible derived products for rebuild.
6. Provider parser rollback MUST not reinterpret old raw payloads under a different parser version without explicit replay/revision semantics.
7. Disaster-time deployment MUST support staged rollout and rapid rollback for optional new capabilities.
8. Critical intake/alerts/map-list minimum service MUST remain available while optional Spec 262 components are rolled back or disabled.
9. The system MUST support kill switches scoped to provider, model, derived forecast, feed lane or map layer without disabling unrelated emergency intake.
10. Production certification requires the added acceptance suite below.

---

# R1.2 Additional Acceptance Tests 141–200

141. A canal edge can change from forward to reverse flow without changing physical geometry.
142. Gate closure can isolate a downstream branch in operational traversal while preserving static topology.
143. Unknown control-state feed does not default a gate/pump to normal.
144. Tidal reversal is represented as time-dependent connectivity rather than contradictory duplicate edges.
145. Derived downstream impact records the topology revision used.
146. Urban drainage flooding can be represented even when nearby river gauge remains normal.
147. Missing underground drainage coverage is shown as a limitation, not assumed adequate drainage.
148. Combined-sewer overflow is distinguishable from ordinary floodwater.
149. Station relocation preserves old observations at the historical station geometry.
150. Sensor replacement does not create a false discontinuity in canonical station identity when binding is verified.
151. Datum change prevents silent trend stitching until transformation/policy is valid.
152. Maintenance-window observations receive appropriate quality state.
153. Late-arriving observation is inserted by observed time and triggers bounded affected recompute.
154. Corrected observation preserves prior value and correction provenance.
155. Imputed water level is never exposed as direct sensor observation.
156. OGC SensorThings observation normalizes to the same canonical schema as equivalent proprietary API data.
157. WaterML time series preserves unit, procedure/source and feature identity.
158. CAP cancellation/update follows canonical alert lifecycle rather than creating unrelated duplicate alerts.
159. STAC flood asset preserves acquisition time, footprint and collection provenance.
160. Oversized NetCDF/GRIB/Zarr input is rejected or sandboxed by resource policy without affecting critical ingestion.
161. Watch hysteresis prevents alert flapping around a threshold.
162. Critical official alert bypasses ordinary feed cooldown when policy requires.
163. User acknowledgement suppresses duplicate acknowledgement requests but does not resolve the hazard.
164. Feed `Why am I seeing this?` can be reconstructed from stable ranking/relevance reason codes.
165. Minor viewport jitter does not reshuffle the entire visible feed.
166. Offline situation package clearly shows data-through time.
167. Provider with no offline rights is omitted from offline package rather than illegally cached.
168. Critical event list remains usable with MapLibre unavailable.
169. Rising/falling water status is understandable without color perception.
170. Hydro sparkline has an equivalent accessible text summary.
171. External source URL cannot force arbitrary internal-network fetch through SSRF.
172. XML entity expansion/billion-laughs input cannot exhaust ingestion workers.
173. Zip/shapefile decompression bomb is rejected by configured limits.
174. Pathologically complex GeoJSON cannot exhaust viewport service.
175. Transient anonymous viewport movement is not retained as a permanent location profile by default.
176. Sensitive household geometry cannot enter commercial or ordinary product analytics.
177. Coordinated fake road-open reports cannot override authoritative closure solely by volume.
178. Prompt injection inside an official/news page cannot alter source policy or provider write mode.
179. New forecast run supersedes overlapping older run while preserving history.
180. Withdrawn forecast invalidates affected derived feed/map projection.
181. Forecast verification record links predicted target to later observations and sample count.
182. Model valid in one basin cannot produce precise quantitative output outside its validity envelope.
183. Regional pack displays correct jurisdiction-specific emergency numbers independent of UI language.
184. Cross-border source retains original authority scope and is not relabeled domestic official warning.
185. Locale fallback preserves source original when translation is unavailable.
186. Adapter can run in shadow mode without publishing operational state.
187. Canary provider regression can be rolled back without deleting accepted canonical observations.
188. Provider daily cost budget can degrade optional enrichment while preserving critical minimum service.
189. Capability SLO can show one province degraded even when country-level average is healthy.
190. Large-basin traversal stops at configured graph budget without failing unrelated viewport queries.
191. Corrected upstream observation invalidates only affected downstream derived products where possible.
192. Low-zoom country view uses aggregated products rather than raw station fan-out.
193. Derived cache is invalidated when material source/policy revision changes.
194. Active Watch Area survives compatible application upgrade.
195. Regional-pack rollback preserves canonical ingested observations and marks incompatible projections for rebuild.
196. Old compatible client ignores additive new feed fields without unsafe failure.
197. Breaking schema release is blocked without declared migration/compatibility path.
198. Provider/model/feed-lane kill switch does not disable unrelated P0 emergency intake.
199. Disaster-time rollback preserves accepted reports, alerts and watches.
200. Integrated dynamic-flow + urban-drainage + provider-canary + offline/degraded + bilingual scenario passes end to end.

---

# R1.2 Mandatory Integrated Scenarios

## Scenario G — Controlled canal reversal in an urban flood

Heavy rain affects a city while river level is high. A gate closes and a pump reverses flow through a controlled canal. `HydraulicConnectivityState` changes without changing map geometry. The Feed explains the operational change, routes avoid newly affected underpasses, and the system does not reuse the prior downstream path as if topology were static. A drainage-tunnel sensor becomes unavailable; coverage is shown degraded rather than normal.

## Scenario H — Late sensor correction during an active watch

A gauge publishes a high water level that triggers a Watch Area notification. The provider later issues a corrected observation due calibration error. SmartAIHub preserves the original, records correction provenance, recomputes only affected trends/derived products, updates the Feed thread, and issues a correction if the earlier user-facing message was materially wrong. It does not silently erase history.

## Scenario I — New-country standards-based onboarding

A new country has OGC SensorThings gauges, CAP alerts, STAC flood imagery and Weather data, but no SmartAIHub-specific adapter. Regional Pack onboarding maps these standards into canonical contracts, declares partial local-news coverage, provides jurisdiction-specific emergency numbers and English UI fallback, and operates without a frontend fork.

## Scenario J — Attack against public-source ingestion

A discovered source redirects to an internal IP, serves malicious XML, exposes an oversized compressed shape package and contains prompt-injection instructions. Network/parser/resource policies reject unsafe payloads. The source becomes degraded/quarantined where appropriate; emergency intake and unrelated feeds remain healthy. No provider write capability is granted.

## Scenario K — Provider canary during a regional flood

A revised hydrology adapter is enabled in shadow/canary mode in one subregion. Output diverges materially from the active adapter because upstream schema semantics changed. Contract/semantic checks block promotion and roll back the canary. Canonical observations from the active provider remain unchanged and the live incident continues without disruption.

## Scenario L — Offline bilingual public safety

A foreign visitor in Thailand switches the public UI to English, saves an affected area and later loses connectivity. An allowed offline situation package provides the last critical alerts, hydrology summary and route constraints with explicit data-through time. Provider content without offline rights is absent. Screen-reader users can consume the same critical facts without interacting with the map. Reconnection reconciles newer revisions without duplicating watch alerts.

---

# R1.2 Revised Definition of Done

Spec 262 R1.2 is DONE only when all prior R1.1 completion requirements remain satisfied and the following are additionally demonstrated:

1. Dynamic/reversible hydraulic topology works with revisioned provenance.
2. Urban drainage is modeled separately from surface river/canal topology and can participate in impact reasoning.
3. Sensor relocation/calibration/correction/late-arrival behavior is deterministic and auditable.
4. At least one standards-based ingestion path is proven without custom frontend logic.
5. Feed/Watch hysteresis and attention controls prevent non-critical alert flapping.
6. Essential situation information remains usable in low-bandwidth/no-map mode.
7. Accessibility checks cover map controls, feed cards, trend summaries and critical actions.
8. Public-source ingestion passes SSRF/parser/resource-abuse negative tests.
9. Viewport/focus privacy policy is implemented and verified.
10. Forecast lifecycle supports supersession, withdrawal and later verification.
11. Regional packs carry jurisdiction policy, not only provider lists.
12. Provider adapter canary/shadow/rollback path is demonstrated for at least one adapter class.
13. Provider budgets/SLO/degraded-mode behavior is observable.
14. Spatial/graph recomputation remains bounded at national-scale test loads.
15. Upgrade/rollback preserves active watches and canonical emergency state.
16. Acceptance tests 1–200 pass, except explicit owner-approved deferrals that cannot reduce minimum life-safety correctness or misrepresent coverage.
17. Scenarios A–L pass in representative normal and degraded conditions.

---

# Appendix G — R1.2 Core Object Additions

```text
HydroTopologyRevision
HydraulicConnectivityState
UrbanDrainageNode
UrbanDrainageEdge
UrbanDrainageState
SensorAssetLifecycle
ObservationQualityAssessment
WatchEvaluationState
AttentionBudgetPolicy
FeedRankingTrace
OfflineSituationPackage
ForecastRun
ForecastVerificationRecord
ModelValidityEnvelope
JurisdictionPolicyProfile
ProviderReleasePolicy
ProviderBudget
CapabilitySLO
SpatialPartitionStrategy
TemporalPartitionStrategy
GraphTraversalBudget
DerivedProductRecomputePolicy
GeoCapabilitySchemaVersion
RegionalPackVersion
MapCommandVersion
FeedProjectionVersion
HydrologySchemaVersion
```

---

# Appendix H — R1.2 Standards Profile

Preferred interoperability targets where providers support them:

```text
CAP — Common Alerting Protocol
OGC API Features
OGC API Tiles
OGC SensorThings API
WaterML 2.0
STAC API
WMS / WMTS / WFS
GeoJSON
GeoParquet
NetCDF
GRIB2
Zarr
```

Standards support is an ingestion/interoperability advantage, not an authority upgrade. Source identity, jurisdiction, provenance, licensing, quality and freshness remain mandatory.

---

# R1.2 Final Principle

> A credible emergency geospatial system must model not only **where water is**, but **how the network can change, what evidence is trustworthy, what the user is focusing on, what the system does not know, and how safely that intelligence survives provider failure, bad data, poor connectivity and software upgrades.**
---

# R1.3 — Second Twelve-Pass Gap Review / 24-Pass Cumulative Hardening

R1.3 is a second independent twelve-pass review over the complete R1.2 specification. The review deliberately uses lenses not covered, or not covered deeply enough, by the first twelve passes.

All fixes below are normative. They extend the existing implementation boundary: Spec 260 remains implemented and unmodified. Where R1.3 is more specific than R1.0–R1.2, R1.3 controls for Spec 262 implementation.

## R1.3 Review Ledger

| New pass | Cumulative pass | Review lens | Gap found | R1.3 remediation |
|---|---:|---|---|---|
| 1 | 13 | Cross-surface consistency | Map, Feed, Chat, Notifications and external API could observe different revisions of the same fast-changing situation | Added projection revision/consistency token and stale-action revalidation |
| 2 | 14 | Simulation/live-state isolation | `SCENARIO_SIMULATION` was classified but scenario data could still contaminate operational projections if implementation boundaries were weak | Added isolated scenario workspace/run/artifact contracts and explicit promotion prohibition |
| 3 | 15 | Compound hazards / cascading dependencies | Single-hazard reasoning can miss flood → power → pump → deeper flood or storm surge + river interactions | Added HazardInteractionGraph and CascadingImpactAssessment |
| 4 | 16 | Coverage bias / sparse-data areas | Dense urban sensor/community coverage can make rural areas look artificially quiet or safe | Added CoverageBiasAssessment and observation-density-aware presentation/ranking |
| 5 | 17 | Hydraulic operations lifecycle | Planned operation existed, but multi-step operation plans, revisions, cancellation, rule references and plan-vs-observed variance were incomplete | Added HydraulicOperationPlan lifecycle |
| 6 | 18 | Uncertainty propagation / numeric semantics | Confidence existed at entity level but uncertainty could be lost when sensor → topology → model → Feed products were composed | Added UncertaintyEnvelope, ThresholdDefinition and derived evidence lineage |
| 7 | 19 | Global hydrological drivers | Global readiness did not explicitly cover snowmelt, ice jam, glacial outburst, burn-scar runoff, compound coastal surge and analogous drivers | Added HydroDriverContext and driver-aware capability coverage |
| 8 | 20 | Global geospatial edge cases | Antimeridian, polar, geodesic distance/area and CRS-transform behavior were underspecified | Added GlobalGeoNormalizationPolicy |
| 9 | 21 | Translation semantic integrity | TH/EN support existed but critical negation, units, identifiers, glossary versions and source-revision translation invalidation were incomplete | Added TerminologyRegistry and TranslationQualityAssessment |
| 10 | 22 | Human operational correction | General human override existed upstream, but geospatial/provider/topology-specific override and reconciliation were not explicit | Added GeoOperationalOverride family |
| 11 | 23 | Multi-tenant safety non-regression | Tenant branding/provider/configuration could accidentally weaken public-safety invariants | Added TenantSafetyInvariantProfile and configuration policy gate |
| 12 | 24 | Audit replay / post-incident reconstruction | Provenance was strong but reconstructing exactly what a user/operator saw and why at a material decision point was not explicit | Added SituationReplaySnapshot and ProjectionManifest |

---

## Pass 13 — Cross-Surface Projection Consistency and Stale-Action Revalidation

### Gap

SmartAIHub intentionally uses edge caching, asynchronous enrichment and separately rendered Map, Feed, Chat, Notifications and external API projections. During fast-moving incidents, these surfaces can temporarily observe different revisions.

That is acceptable as bounded eventual consistency, but material actions MUST NOT silently operate on incompatible or stale context.

### Patch

Add:

```ts
interface SituationProjectionRevision {
  revisionId: string;
  areaOrCaseRef: string;
  canonicalDataThrough: string;
  generatedAt: string;

  incidentRevisionSetRef?: string;
  alertRevisionSetRef?: string;
  hydroRevisionSetRef?: string;
  forecastRunRefs?: string[];
  topologyRevisionRef?: string;

  policyVersion: string;
  projectionSchemaVersion: string;
}

interface ProjectionConsistencyToken {
  projectionRevisionId: string;
  surface:
    | "MAP"
    | "FEED"
    | "CHAT"
    | "NOTIFICATION"
    | "TASK_HANDOFF"
    | "PUBLIC_API"
    | "MCP";
  issuedAt: string;
}
```

Requirements:

1. Map, Feed and generated Situation Digest SHOULD expose or internally retain the projection revision they were built from.
2. Chat context MUST carry the relevant projection/context revision when asking about a fast-changing situation.
3. A notification MUST retain the canonical revision/source facts that caused it to be sent.
4. A material action launched from a stale projection MUST revalidate current canonical state before side effect.
5. Stale revalidation MAY return:
   - `STILL_VALID`;
   - `UPDATED_CONTEXT`;
   - `REQUIRES_RECONFIRMATION`;
   - `ACTION_NO_LONGER_VALID`.
6. Read-only exploration MAY continue from an older snapshot when clearly time-scoped.
7. A correction to a canonical alert/hydrology fact MUST invalidate affected projections, not unrelated geographic areas.
8. API/MCP consumers SHOULD be able to request/receive revision/cursor metadata for deterministic incremental synchronization.
9. Projection revision does NOT replace entity-level revisioning.
10. The system MUST NOT claim strong transactional consistency across all surfaces when architecture only provides bounded eventual consistency.

---

## Pass 14 — Strict Simulation / What-If Isolation

### Gap

Spec 262 distinguishes `SCENARIO_SIMULATION`, but operational planning will eventually require dam-release, flood-routing, evacuation, gate, route and weather what-if scenarios. Without explicit isolation, simulated geometry or values could leak into the live Feed, Map or notifications.

### Patch

Add:

```ts
interface ScenarioWorkspace {
  scenarioWorkspaceId: string;
  tenantRef: string;
  baseProjectionRevisionId: string;
  createdBy: string;
  createdAt: string;
  visibility: "PRIVATE" | "TEAM" | "COMMAND";
}

interface SimulationRun {
  simulationRunId: string;
  scenarioWorkspaceId: string;
  inputSnapshotRef: string;
  modelRef?: string;
  parametersRef: string;
  startedAt: string;
  completedAt?: string;
  state: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
}

interface SimulationArtifact {
  artifactRef: string;
  simulationRunId: string;
  factClass: "SCENARIO_SIMULATION";
  validForScenarioOnly: true;
}
```

Mandatory invariants:

1. Simulation output MUST use a namespace/cache/index distinct from live operational projections.
2. Simulation geometry MUST display persistent `SIMULATION / WHAT-IF` visual treatment.
3. Simulation output MUST NOT:
   - trigger public warnings;
   - satisfy official verification;
   - update canonical observations;
   - alter road closure truth;
   - satisfy corroboration as independent evidence;
   - enter ordinary public Feed ranking.
4. Scenario inputs MUST identify the frozen/base revision used.
5. A later live-state change MAY mark a scenario stale; it MUST NOT silently mutate the frozen scenario.
6. A scenario MAY create a proposal/task/draft plan through existing approval workflows, but MAY NOT be "promoted" into factual live state.
7. Any operator export/share MUST preserve the simulation label.
8. Search/vector indexes MUST not allow simulation text to be retrieved as live incident evidence without explicit scenario scope.
9. AI MUST be told whether it is answering from live state or scenario state.
10. Scenario cleanup/retention MUST not delete referenced operational evidence.

---

## Pass 15 — Compound Hazards and Cascading Infrastructure Dependencies

### Gap

Emergency impact rarely remains single-domain. Examples:

```text
flood
→ substation outage
→ pump station unavailable
→ drainage capacity falls
→ deeper/longer urban flooding
```

or:

```text
storm surge + river discharge + heavy rainfall
→ compound coastal/river flood
```

Single-hazard ranking can miss these feedbacks.

### Patch

Add:

```ts
interface HazardInteraction {
  interactionId: string;
  causeRefs: string[];
  effectRef?: string;

  relation:
    | "AMPLIFIES"
    | "TRIGGERS"
    | "BLOCKS_RESPONSE"
    | "REDUCES_CAPACITY"
    | "CREATES_SECONDARY_HAZARD"
    | "CORRELATED_ONLY"
    | "UNKNOWN";

  effectiveWindow?: TimeWindow;
  confidence: string;
  evidenceRefs: string[];
}

interface CascadingImpactAssessment {
  assessmentId: string;
  focusRef: string;
  interactionRefs: string[];
  affectedInfrastructureRefs: string[];
  affectedCapabilityRefs: string[];
  generatedAt: string;
  uncertaintyRef?: string;
}
```

Requirements:

- `HazardInteractionGraph` MAY contain cycles; traversal MUST remain bounded.
- Causal relation MUST NOT be inferred solely from temporal coincidence.
- `CORRELATED_ONLY` MUST remain distinct from `TRIGGERS`.
- Infrastructure dependency edges MAY include power, communications, transport, water supply, wastewater, pumps, hospitals and shelters.
- Failure of one provider/source MUST NOT be mistaken for failure of the real-world infrastructure asset.
- Compound-risk products SHOULD explain the key interaction chain rather than emit a single opaque score.
- Feed ranking MAY increase materiality for a credible cascading impact.
- The same underlying incident MUST not be double-counted as multiple independent hazards merely because it appears in several domain projections.
- Operator/command views MAY expose deeper dependency graphs than public views.
- AI summaries MUST preserve uncertainty and avoid inventing causal mechanisms.

---

## Pass 16 — Coverage Bias, Observation Density and Rural/Low-Connectivity Fairness

### Gap

Areas with many sensors, media outlets, smartphone users and businesses naturally produce more events. A naive Feed/materiality engine may interpret data-rich urban areas as "more hazardous" and sparse rural areas as "quiet/safe".

### Patch

Add:

```ts
interface ObservationDensityContext {
  geographyRef: string;
  sourceClass: string;
  expectedCoverage?: string;
  observedCoverage: string;
  stationOrReporterDensity?: number;
  lastAssessedAt: string;
}

interface CoverageBiasAssessment {
  geographyRef: string;
  state:
    | "ADEQUATE"
    | "SPARSE"
    | "VERY_SPARSE"
    | "URBAN_DENSE"
    | "SOURCE_SKEWED"
    | "UNKNOWN";
  missingSourceClasses: string[];
  implications: string[];
}
```

Rules:

1. Sparse observations MUST NOT be converted into a "safe" signal.
2. Feed ranking MUST NOT reward event count alone without coverage context.
3. Rural/remote areas MAY rely more heavily on official warnings, catchment/weather intelligence, remote sensing and lower-frequency observations.
4. Coverage panel SHOULD explain material sensor/source gaps.
5. Public situation summaries SHOULD state when confidence is limited by sparse local observation.
6. Community-report volume MUST be normalized for population/connectivity/source availability before being used as a comparative signal.
7. Remote-sensing no-detection MUST consider revisit/cloud/processing limitations.
8. A province with fewer connected sources MUST not disappear from country-level situation summaries if authoritative warnings indicate material risk.
9. Coverage bias assessment MUST NOT become a socioeconomic or citizen trust score.
10. Regional Pack quality metrics SHOULD report coverage by administrative area/basin, not only national average.

---

## Pass 17 — Hydraulic Operation Plan Lifecycle, Rule References and Plan-vs-Observed Variance

### Gap

R1.1 correctly separated observed structure state, planned operation and official instruction, but a real dam/weir/gate operation can be a multi-step revised plan with effective windows, cancellation and deviation from observed execution.

### Patch

Add:

```ts
interface HydraulicOperationPlan {
  operationPlanId: string;
  structureRef: string;
  issuingAuthorityRef: string;
  issuedAt: string;

  state:
    | "DRAFT"
    | "PUBLISHED"
    | "SCHEDULED"
    | "ACTIVE"
    | "SUPERSEDED"
    | "CANCELLED"
    | "COMPLETED";

  effectiveFrom?: string;
  effectiveUntil?: string;
  stepRefs: string[];
  operatingRuleRef?: string;
  sourceRefs: string[];
  revision: string;
}

interface HydraulicOperationStep {
  operationStepId: string;
  operationPlanId: string;
  effectiveAt: string;
  targetOutflow?: number;
  unit?: string;
  gateOrPumpInstruction?: string;
  publicInstructionTextRef?: string;
}

interface OperationExecutionVariance {
  operationPlanRef: string;
  observedAt: string;
  plannedValue?: number;
  observedValue?: number;
  difference?: number;
  unit?: string;
  significance: "NONE" | "MINOR" | "MATERIAL" | "UNKNOWN";
}
```

Requirements:

1. Draft plans MUST NOT enter public Feed as official planned release.
2. Superseded/cancelled plans MUST invalidate affected future projections.
3. Observed outflow always remains distinct from target/planned outflow.
4. A material plan-vs-observed variance MAY generate a Feed update if operationally relevant.
5. Operating-rule/rule-curve references are policy/context, not automatic commands to SmartAIHub.
6. SmartAIHub MUST NOT infer legal authority to operate a structure.
7. A plan may contain several time steps; systems MUST not collapse it into one timeless value.
8. Feed card SHOULD show effective time and source authority for significant planned changes.
9. Quantitative downstream modeling MUST use observed versus planned values according to the declared scenario/fact class.
10. Corrections to a plan MUST preserve the prior published revision.

---

## Pass 18 — Uncertainty Propagation, Threshold Semantics and False Precision Control

### Gap

Individual records carry confidence/freshness, but derived products can combine uncertain sensor values, topology, forecast fields, model calibration and stale infrastructure state. Without explicit propagation, an apparently precise downstream number can be misleading.

### Patch

Add:

```ts
interface UncertaintyEnvelope {
  uncertaintyRef: string;

  measurement?: Range;
  temporal?: Range;
  spatial?: Range;
  model?: Range;

  qualitative:
    | "LOW"
    | "MODERATE"
    | "HIGH"
    | "VERY_HIGH"
    | "UNKNOWN";

  dominantSources: string[];
  methodRef?: string;
}

interface ThresholdDefinition {
  thresholdId: string;
  metric: string;
  value: number;
  unit: string;
  datumRef?: string;

  thresholdType:
    | "INFORMATION"
    | "WATCH"
    | "WARNING"
    | "CRITICAL"
    | "BANK_LEVEL"
    | "OPERATIONAL";

  authorityOrPolicyRef: string;
  effectiveFrom: string;
  effectiveUntil?: string;
}

interface DerivedEvidenceLineage {
  derivedRef: string;
  inputRefs: string[];
  algorithmOrModelRef: string;
  policyVersion: string;
  uncertaintyRef?: string;
}
```

Rules:

- Derived uncertainty MUST retain dominant uncertainty sources.
- Independent uncertainty terms MAY be mathematically combined only when the method is valid and documented.
- Qualitative uncertainty MUST be used when precise probability/range is unsupported.
- Public UI MUST avoid unjustified decimal precision.
- Threshold comparison MUST use compatible unit and vertical datum.
- "Distance to warning" MUST identify which warning/threshold authority is used.
- An unofficial platform threshold MUST not be visually labeled as an official warning threshold.
- A stale measurement MAY still be shown historically but MUST not produce false current precision.
- Unit conversion MUST not create additional significant digits.
- Feed/Chat SHOULD explain a material uncertainty driver when it changes action interpretation.

---

## Pass 19 — Global Hydrological Driver Taxonomy

### Gap

A global product cannot assume tropical-rainfall + river + dam operation are the only flood drivers.

### Patch

Add:

```text
HydroDriverType

FLUVIAL_RAINFALL_RUNOFF
PLUVIAL_RAINFALL
RESERVOIR_RELEASE
DAM_OR_LEVEE_FAILURE
TIDAL_BACKWATER
STORM_SURGE
WAVE_OVERTOPPING
SNOWMELT
RAIN_ON_SNOW
ICE_JAM
GLACIAL_LAKE_OUTBURST
BURN_SCAR_RUNOFF
GROUNDWATER_EMERGENCE
URBAN_DRAINAGE_FAILURE
TSUNAMI_INUNDATION
OTHER
UNKNOWN
```

Add:

```ts
interface HydroDriverContext {
  driverType: string;
  geographyRef: string;
  effectiveWindow?: TimeWindow;
  observationRefs: string[];
  forecastRefs: string[];
  officialAlertRefs: string[];
  modelRefs: string[];
  confidence: string;
}
```

Requirements:

1. Regional Packs declare which driver types they can observe/model.
2. Unsupported drivers MUST appear as coverage limitations where material.
3. `DAM_OR_LEVEE_FAILURE` requires high-risk verification/official evidence rules; simulation MUST remain scenario-scoped.
4. Snow/ice/glacial drivers MUST NOT be estimated from rainfall-only logic.
5. Storm surge/tide/waves SHOULD be modeled separately even when composed into a compound coastal flood.
6. Tsunami warning authority remains with configured official alert providers; SmartAIHub MUST NOT create an evacuation order from an AI inundation inference.
7. Burn-scar runoff MAY increase flash-flood/debris-flow context but MUST preserve source/model limitations.
8. Driver taxonomy SHOULD inform appropriate feed wording and Skills.
9. Global capability coverage SHOULD be driver-aware, not merely "hydrology available".
10. Driver type does not by itself determine severity.

---

## Pass 20 — Global Geo Normalization: Antimeridian, Polar Regions, Geodesic Metrics and CRS Safety

### Gap

Global Map/Feed/impact logic can fail around ±180° longitude, polar regions and non-Web-Mercator data. Planar distance/area assumptions can materially distort routing, viewport matching and exposure.

### Patch

Add:

```ts
interface GlobalGeoNormalizationPolicy {
  canonicalHorizontalCRS: string;
  allowedSourceCRS: string[];
  geodesicDistanceRequiredAboveKm?: number;
  antimeridianStrategy: "SPLIT" | "WRAP_AWARE";
  polarStrategy: string;
  invalidGeometryPolicy: string;
  transformLibraryVersionRef: string;
}
```

Requirements:

- Longitude normalization MUST be deterministic.
- Bounding boxes crossing the antimeridian MUST be represented/queryable without becoming near-global boxes.
- Spatial intersection MUST handle wrapped geometries correctly.
- Long-distance route/impact distance SHOULD use geodesic calculations.
- Area calculations MUST NOT blindly use Web Mercator at high latitudes.
- Source CRS MUST be recorded and transformed using explicit CRS metadata.
- Unknown/ambiguous CRS MUST fail to `UNRESOLVED_CRS`; never guess from coordinate magnitude when safety-relevant.
- Vertical datum transformation remains governed separately.
- Geometry validation MUST preserve legitimate multipolygon holes/islands.
- Time zone MUST not be inferred from longitude alone when authoritative timezone/geography data is available.
- Map rendering may remain Web Mercator while analytical geometry uses an appropriate representation.

---

## Pass 21 — Multilingual Terminology Integrity and Translation Quality

### Gap

Baseline TH/EN localization is present, but emergency translation requires stronger protection for negation, quantities, named entities, codes, units and terminology consistency.

### Patch

Add:

```ts
interface TerminologyRegistryEntry {
  termId: string;
  domain: string;
  sourceLanguage: string;
  sourceTerm: string;
  approvedTranslations: Record<string, string>;
  authorityOrReviewerRef?: string;
  effectiveFrom: string;
  effectiveUntil?: string;
  version: string;
}

interface TranslationQualityAssessment {
  translatedContentRef: string;
  sourceRevisionRef: string;
  targetLocale: string;
  glossaryVersion?: string;

  state:
    | "OFFICIAL"
    | "REVIEWED"
    | "MACHINE_CHECKED"
    | "MACHINE_UNCHECKED"
    | "FAILED"
    | "SOURCE_ONLY";

  warnings: string[];
}
```

Rules:

1. Translation cache key MUST include source revision + target locale + applicable terminology/glossary version.
2. Source correction MUST invalidate/re-evaluate affected translations.
3. Numbers, units, dates, geographic coordinates, station codes, road numbers and emergency phone numbers MUST be protected structured tokens where feasible.
4. Critical negation (`do not`, `ไม่ให้`, `ห้าม`) MUST pass deterministic/semantic checks for critical phrases.
5. Named entities SHOULD use canonical multilingual names rather than free translation.
6. Transliteration and translation aliases MUST resolve to one canonical entity where possible.
7. Failure to translate MUST fall back to original source plus clearly labeled partial/summary translation rather than inventing missing content.
8. Automatic translation of an official warning MUST NOT be relabeled as an official translated version unless the authority supplied/approved it.
9. Screen readers MUST receive language tags appropriate to mixed-language text where supported.
10. Critical phrase templates SHOULD be versioned and independently reviewable from LLM prompts.

---

## Pass 22 — Geospatial / Provider / Topology Operator Overrides and Reconciliation

### Gap

Spec 260 has human override principles, but Spec 262 needs domain-specific overrides for wrong station mapping, bad topology, provider geometry error, temporary road/hydro exclusion and emergency operator correction.

### Patch

Add:

```ts
interface GeoOperationalOverride {
  overrideId: string;

  targetRef: string;
  targetType:
    | "ENTITY_BINDING"
    | "GEOMETRY"
    | "TOPOLOGY"
    | "CONNECTIVITY"
    | "SOURCE_MAPPING"
    | "ROAD_STATE"
    | "HYDRO_STATE"
    | "PROJECTION_SUPPRESSION";

  affectedFields: string[];
  replacementRefOrValue?: string;

  reason: string;
  actorRef: string;
  createdAt: string;
  effectiveUntil?: string;

  state: "ACTIVE" | "EXPIRED" | "REVOKED" | "RECONCILIATION_REQUIRED";
}
```

Requirements:

- Override MUST NOT mutate raw upstream evidence.
- Automation MUST NOT silently overwrite an active protected override.
- New contradictory authoritative evidence MUST create reconciliation state.
- Override MUST have bounded scope and reason.
- High-impact override MAY require role/approval according to existing SmartAIHub policy.
- Emergency topology override MUST identify whether it affects live routing/impact reasoning.
- Expiry/revocation MUST deterministically return control to current canonical/provider policy.
- Override history MUST remain auditable.
- Public projection SHOULD expose correction status when material without exposing sensitive operator details.
- Overrides MUST NOT be used to fabricate official status.

---

## Pass 23 — Tenant Safety Non-Regression and Configuration Policy Gate

### Gap

SmartAIHub is multi-tenant/white-label. A tenant may configure providers, ranking, branding, localization and commercial content. That flexibility MUST NOT weaken core public-safety semantics.

### Patch

Add:

```ts
interface TenantSafetyInvariantProfile {
  invariantVersion: string;
  requiredCapabilitiesOrBehaviors: string[];
  prohibitedOverrides: string[];
}

interface ConfigurationPolicyGate {
  configRevision: string;
  tenantRef: string;
  evaluatedAgainstInvariantVersion: string;
  result: "PASS" | "BLOCK" | "REQUIRES_REVIEW";
  reasonCodes: string[];
}
```

Non-overridable safety invariants include at minimum:

- `NO_DATA != NO_DANGER`;
- critical warning/correction cannot be hidden solely by ordinary quota/credits;
- source/provenance/freshness disclosure for material facts;
- official vs forecast vs simulation distinction;
- simulation isolation;
- original evidence preservation;
- provider licensing/attribution restrictions;
- public emergency minimum service;
- sensitive-location privacy;
- no paid placement buying emergency priority;
- coverage-gap disclosure;
- high-risk provider write prohibition unless explicitly authorized;
- language switch accessibility for enabled mandatory baseline languages.

Tenant MAY customize:

- branding;
- default map style/provider within policy;
- non-critical Feed mix;
- local categories;
- approved Regional Packs;
- optional commercial surfaces;
- reviewed terminology.

Every custom provider MUST pass the same security/contract/coverage requirements as platform providers.

---

## Pass 24 — Situation Replay, Projection Manifest and Decision Reconstruction

### Gap

Strong provenance exists, but post-incident review may need to answer:

> "What exactly did this user/operator see at 18:42, from which source revisions, forecast run, topology and Feed-ranking policy, when they received or acted on this warning?"

Retaining every transient viewport forever would be excessive, but material decisions/notifications need reproducibility.

### Patch

Add:

```ts
interface ProjectionManifest {
  projectionRevisionId: string;
  canonicalEntityRevisionRefs: string[];
  sourceRevisionRefs: string[];
  forecastRunRefs: string[];
  topologyRevisionRefs: string[];
  translationRevisionRefs: string[];
  policyVersions: string[];
  rankingOrAlgorithmVersionRefs: string[];
  generatedAt: string;
}

interface SituationReplaySnapshot {
  replaySnapshotId: string;
  reason:
    | "CRITICAL_NOTIFICATION"
    | "MATERIAL_ACTION"
    | "OPERATOR_DECISION"
    | "INCIDENT_MILESTONE"
    | "AUDIT_REQUEST";

  projectionManifestRef: string;
  publicOrOperationalContextRef: string;
  capturedAt: string;
  retentionClass: string;
}

interface DecisionTraceBundle {
  decisionRef: string;
  inputManifestRef: string;
  deterministicRuleRefs: string[];
  modelOrSkillRefs: string[];
  approvalRefs: string[];
  outcomeRef: string;
}
```

Rules:

1. Material notification/action MUST be reproducible to the extent permitted by retention/privacy policy.
2. System MUST NOT retain every anonymous pan/zoom merely for replay.
3. Replay uses historical versions; it MUST NOT silently substitute today's corrected values for what was visible then.
4. Replay UI MUST clearly indicate historical/reconstructed mode.
5. Corrections remain linked so reviewers can compare `what was known then` vs `what is known now`.
6. Ranking trace MAY preserve feature/reason scores or deterministic reason inputs necessary for reconstruction, subject to privacy policy.
7. LLM hidden chain-of-thought is NOT required or stored; decision trace stores inputs, tools/skills/models, rule versions and externally usable rationale/provenance.
8. Retention follows legal hold, privacy and incident policy.
9. External audit export MUST redact protected victim/location data according to role.
10. Replay artifacts MUST NOT become independent evidence for the underlying event.

---

# R1.3 Revised Priority Matrix

## P0 — correctness and authority isolation

- SituationProjectionRevision / stale-action revalidation
- simulation/live-state isolation
- uncertainty/threshold semantics
- TenantSafetyInvariantProfile
- geospatial/operator override and reconciliation
- translation critical-token/negation protection
- global CRS/antimeridian correctness for any geography enabled in production
- coverage bias disclosure
- hydraulic plan lifecycle when controlled-release providers are enabled
- replay manifest for critical notifications/material actions

## P1 — operational intelligence depth

- compound-hazard dependency graph
- richer coverage-density analysis
- plan-vs-observed variance Feed
- driver-aware hydrology capability registry
- multilingual terminology registry/editor
- command/operator replay tooling
- cross-surface consistency diagnostics

## P2 — advanced modeling

- quantitative compound-hazard propagation
- advanced snow/ice/glacial/coastal driver models
- probabilistic uncertainty propagation where scientifically validated
- counterfactual simulation suites
- automated post-incident calibration recommendations

P2 SHALL NOT block P0 public-safety correctness.

---

# R1.3 Additional Acceptance Tests 201–260

201. Map and Feed can expose different cache timestamps while retaining projection revisions that make the mismatch explicit.
202. Material action initiated from stale Feed card revalidates canonical state before side effect.
203. Corrected official alert invalidates affected Map/Feed/Chat projections without flushing unrelated country data.
204. Notification audit record retains the canonical/source revision that triggered delivery.
205. MCP change consumer can continue from a revision/cursor without treating duplicate delivery as a new event.

206. Simulation flood polygon cannot enter public live Feed.
207. Simulation result cannot verify a real incident or official warning.
208. AI answering inside Scenario Workspace clearly knows it is scenario-scoped.
209. Live observation changes can mark scenario stale without mutating the frozen scenario inputs.
210. Scenario export retains visible simulation/what-if classification.

211. Flood-caused power outage can reduce pump capability through an explicit dependency relation.
212. Temporal coincidence alone does not create a causal `TRIGGERS` edge.
213. Compound coastal flood can represent rainfall + river + tide/surge components separately.
214. Circular dependency graph is bounded and cannot exhaust workers.
215. Same underlying event is not double-counted merely because it appears in multiple hazard domains.

216. Sparse-rural observation coverage is displayed as uncertainty, not safety.
217. Country/province summary does not rank areas solely by count of citizen reports.
218. Cloud-obscured remote sensing no-detection is not treated as proof of no flood.
219. Authoritative warning in a sparse-data province remains visible in low-zoom Feed.
220. Coverage bias metric cannot become a citizen or neighborhood trust score.

221. Draft hydraulic operation plan does not appear as official planned release.
222. Cancelled operation plan invalidates future downstream derived products that depended on it.
223. Observed outflow remains distinct from planned target throughout plan lifecycle.
224. Multi-step release schedule preserves effective time for every step.
225. Material plan-vs-observed variance can update one Feed thread without inventing operator intent.

226. Derived downstream estimate preserves dominant uncertainty contributors.
227. Incompatible vertical datum blocks threshold-distance calculation.
228. Platform-defined advisory threshold cannot render as government official warning level.
229. Unit conversion does not introduce false significant digits.
230. Stale gauge cannot yield a falsely precise current time-to-threshold estimate.

231. Regional Pack can declare snowmelt capability separately from generic hydrology.
232. Rainfall-only logic cannot create snowmelt or ice-jam quantitative forecast.
233. Dam/levee failure simulation cannot trigger a real evacuation alert.
234. Tsunami inundation inference remains distinct from official tsunami warning authority.
235. Coastal compound flood retains surge/tide/wave driver provenance.

236. Antimeridian-crossing viewport query does not become an almost-global bounding box.
237. Wrapped polygon intersection works across ±180° longitude.
238. Long-distance impact calculation uses geodesic policy rather than naive planar degrees.
239. Unknown source CRS becomes `UNRESOLVED_CRS` rather than guessed safety geometry.
240. Analytical area at high latitude is not blindly calculated in Web Mercator.

241. Translation cache invalidates after source correction.
242. Critical negation survives TH↔EN translation validation.
243. Station ID, road number, coordinate and numeric value are preserved through translation pipeline.
244. Machine-translated official warning is not mislabeled as authority-supplied official translation.
245. Missing translation falls back to original instead of fabricating text.

246. Operator can temporarily correct a wrong source-to-station binding without altering raw provider evidence.
247. New authoritative evidence conflicting with active topology override enters reconciliation state.
248. Expired override returns control deterministically to current canonical/provider state.
249. Public correction status can be shown without exposing private operator identity.
250. Override cannot grant an unofficial source official status.

251. Tenant cannot configure ordinary credits to hide a critical safety correction.
252. Tenant cannot disable `NO_DATA != NO_DANGER`.
253. Tenant custom provider cannot bypass provider contract/security tests.
254. Tenant branding cannot remove required provider attribution.
255. Tenant commercial ranking cannot override critical warning priority.

256. Critical notification can be reconstructed from ProjectionManifest.
257. Replay shows historical known-at-time value separately from later correction.
258. Anonymous routine viewport pans are not retained indefinitely merely for replay.
259. DecisionTraceBundle records rule/model/skill versions without requiring hidden chain-of-thought.
260. Integrated cross-surface revision + simulation isolation + compound hazard + sparse coverage + multilingual + operator override + replay scenario passes end to end.

---

# R1.3 Mandatory Integrated Scenarios

## Scenario M — Cross-surface correction during active evacuation planning

An official flood alert and rising-water observation populate Map, Feed and Chat. A user opens a Feed card and begins a route/task action. Before the action is confirmed, the alert is corrected and the route constraint changes. The material action revalidates canonical state, surfaces `UPDATED_CONTEXT`, preserves the user's intent, and requires reconfirmation when needed. The original notification remains reconstructable from its ProjectionManifest.

## Scenario N — Command-center what-if dam release

An operator opens a private Scenario Workspace from the current operational snapshot and evaluates a hypothetical release schedule. Simulation output renders on the map with persistent scenario labeling and may create draft preparedness tasks, but cannot alter live hydrology, verify an incident, trigger public Feed/notification or become corroborating evidence. A live observation later changes; the scenario is marked stale but remains reproducible against its frozen base revision.

## Scenario O — Rural flash-flood coverage gap

A mountainous rural district has sparse sensors and few community reports. Rainfall forecast, an official flash-flood warning and catchment context indicate material risk. Feed does not rank the district as quiet merely because nearby urban districts have more reports. Coverage disclosure explains limited local observations and uses the appropriate authoritative/forecast context without false precision.

## Scenario P — Compound urban/coastal flooding

Heavy rainfall, high river discharge and coastal surge coincide. A substation outage disables a major drainage pump. The system represents each driver and infrastructure dependency separately, shows the cascading impact chain, avoids double-counting one event, and provides an uncertainty-aware operational summary. Tenant branding cannot hide the critical warning or transform a forecast into an official alert.

## Scenario Q — Global cold-region Regional Pack

A new Regional Pack supports river gauges, snow-water equivalent, snowmelt forecast and official ice-jam alerts. SmartAIHub declares hydrology coverage by driver type. Rainfall-only models are not reused for snowmelt. Antimeridian/polar/geodesic policy passes map and area-query tests. English is available as baseline UI while original local-language warnings remain accessible.

## Scenario R — Human correction and post-incident replay

A provider incorrectly maps one gauge to a nearby river segment. An authorized operator applies a bounded Source Mapping override. New source evidence later conflicts, creating reconciliation rather than silent overwrite. After the incident, auditors reconstruct the Feed/Map/notification state associated with a material decision, compare what was known at the time with later corrected data, and verify that neither raw evidence nor protected user location was improperly altered or exposed.

---

# R1.3 Revised Definition of Done

Spec 262 R1.3 is DONE only when all R1.2 requirements continue to hold and:

1. Cross-surface projection revisions and stale-action revalidation are implemented for material actions.
2. Simulation/what-if state is technically isolated from live operational/public truth.
3. Compound/cascading hazard relations are representable without forcing unsupported causal conclusions.
4. Coverage-density bias is visible and sparse areas cannot be interpreted as safe solely from missing observations.
5. Controlled hydraulic operation plans support revision, cancellation, multi-step timing and observed-vs-planned separation.
6. Derived products preserve uncertainty/threshold semantics without false precision.
7. Enabled Global Regional Packs declare relevant hydrological driver coverage.
8. Global geometry handling passes antimeridian/CRS/geodesic correctness tests for supported geographies.
9. TH/EN critical translation preserves structured tokens, negation and source revision relationships.
10. Authorized geospatial/provider/topology overrides are bounded, auditable and reconcile against new evidence.
11. Tenant customization cannot weaken mandatory safety invariants.
12. Critical notification/material-action replay can reconstruct what was known/shown without retaining unnecessary anonymous browsing history.
13. Acceptance tests 1–260 pass, except explicit owner-approved deferrals that cannot reduce minimum life-safety correctness, privacy, provenance or coverage truthfulness.
14. Mandatory scenarios A–R pass in representative normal and degraded conditions.

---

# Appendix I — R1.3 Core Object Additions

```text
SituationProjectionRevision
ProjectionConsistencyToken

ScenarioWorkspace
SimulationRun
SimulationArtifact

HazardInteraction
CascadingImpactAssessment

ObservationDensityContext
CoverageBiasAssessment

HydraulicOperationPlan
HydraulicOperationStep
OperationExecutionVariance

UncertaintyEnvelope
ThresholdDefinition
DerivedEvidenceLineage

HydroDriverContext

GlobalGeoNormalizationPolicy

TerminologyRegistryEntry
TranslationQualityAssessment

GeoOperationalOverride

TenantSafetyInvariantProfile
ConfigurationPolicyGate

ProjectionManifest
SituationReplaySnapshot
DecisionTraceBundle
```

---

# Appendix J — R1.3 Safety Classification Additions

The following labels MUST remain semantically distinct:

```text
LIVE_OPERATIONAL_FACT
OFFICIAL_ALERT
OFFICIAL_PLAN
OBSERVATION
DERIVED_NOWCAST
MODEL_FORECAST
SCENARIO_SIMULATION
COMMUNITY_REPORT
NEWS_DERIVED_CLAIM
AI_EXPLANATION
HISTORICAL_REPLAY
```

`HISTORICAL_REPLAY` and `SCENARIO_SIMULATION` MUST never be confused with the current live operational state.

---

# R1.3 Final Principle

> A global emergency map is trustworthy only when it can explain **what is live, what is forecast, what is simulated, what is uncertain, what is missing, what changed, and what the user actually saw when a material decision was made**.

---

# R1.4 — Third Twelve-Pass Gap Review / 36-Pass Cumulative Hardening

R1.4 is a third independent twelve-pass review over the complete R1.3 specification. This review concentrates on hydrological measurement science, physical plausibility, probabilistic forecast quality, event-time correctness, population/facility exposure semantics, spatial privacy, source/package lifecycle, artifact integrity, canonical-data recovery, and longevity of watches/deep links.

All fixes below are normative. Spec 260 remains implemented and unmodified. Where R1.4 is more specific than R1.0–R1.3, R1.4 controls for Spec 262 implementation.

## R1.4 Review Ledger

| New pass | Cumulative pass | Review lens | Gap found | R1.4 remediation |
|---|---:|---|---|---|
| 1 | 25 | Stage-to-discharge hydrometry | Water level and discharge existed, but conversion by rating curve, shifts, valid ranges and non-unique tidal/backwater relations were absent | Added Rating/Gauging/Stage-Discharge contracts |
| 2 | 26 | Hydraulic geometry | Propagation models lacked first-class cross-section, bathymetry, roughness, levee crest and structure-opening geometry | Added versioned hydraulic geometry resources |
| 3 | 27 | Physical plausibility | Graph/model output could be numerically valid but violate mass/storage/connectivity constraints | Added hydraulic balance/plausibility checks |
| 4 | 28 | Event-time / backfill | Late data was handled, but watermarks, source clock quality, historical backfill and controlled reprocessing were incomplete | Added event-time policy and reprocessing lifecycle |
| 5 | 29 | Probabilistic forecast quality | Model backtesting existed but calibration, exceedance probability, reliability and metric semantics were underspecified | Added forecast verification/calibration contracts |
| 6 | 30 | Assimilation / analysis fields | Radar-gauge/model merged analyses could be confused with raw observations or independent corroborating evidence | Added `ASSIMILATED_ANALYSIS` fact class and assimilation lineage |
| 7 | 31 | Exposure/population/capacity | Buildings/facilities were intersectable, but current population presence and operational facility capacity were weak | Added temporal exposure and facility-capacity semantics |
| 8 | 32 | Spatial privacy | Generalized public geometry could still be reconstructed through repeated/differenced queries or temporal joins | Added role-aware spatial disclosure/generalization policy |
| 9 | 33 | Provider/Regional Pack lifecycle | Canary/rollback existed but provider retirement, terms/license changes, capability migration and pack version lifecycle were incomplete | Added provider/pack lifecycle state machines |
| 10 | 34 | Offline/export integrity | Offline packages existed without sufficiently explicit cryptographic/hash integrity and import trust boundaries | Added data-artifact manifests and integrity verification |
| 11 | 35 | Canonical contamination recovery | Schema drift quarantine covered future bad records, but normalization bugs could already have polluted canonical state | Added data-quality incident, impact analysis and bounded rebuild/replay |
| 12 | 36 | Long-lived geospatial references | Watches, deep links and saved areas could break after provider-ID changes, boundary revisions, merge/split or pack replacement | Added stable geospatial references and watch migration semantics |

---

## Pass 25 — Rating Curves, Gaugings and Stage–Discharge Semantics

### Gap

A water-level observation and a discharge observation are not interchangeable. Many gauge systems estimate discharge from stage using a site-specific stage–discharge relationship. The relationship can change after erosion, sediment deposition, vegetation, debris, ice, channel works, backwater, gate operation or flood damage.

R1.3 did not explicitly represent that conversion and its validity.

### Patch

Add:

```ts
interface HydraulicRatingCurve {
  ratingCurveId: string;
  stationRef: string;
  variableIn: "STAGE" | "INDEX_VELOCITY" | "OTHER";
  variableOut: "DISCHARGE";

  effectiveFrom: string;
  effectiveUntil?: string;

  validInputRange?: Range;
  relationType:
    | "TABLE"
    | "PIECEWISE"
    | "FUNCTION"
    | "INDEX_VELOCITY"
    | "MULTIVARIATE"
    | "OTHER";

  parameterRef?: string;
  shiftRuleRefs?: string[];

  uncertaintyRef?: string;
  sourceRefs: string[];
  version: string;
}

interface GaugingMeasurement {
  gaugingId: string;
  stationRef: string;
  observedAt: string;

  stage?: number;
  dischargeMeasured?: number;
  velocity?: number;
  crossSectionRef?: string;

  methodRef: string;
  qualityState: string;
  sourceRefs: string[];
}

interface StageDischargeConversion {
  conversionId: string;
  stageObservationRef: string;
  ratingCurveRef: string;

  derivedDischarge: number;
  unit: string;

  inputWithinValidatedRange: boolean;
  extrapolated: boolean;
  shiftApplied?: string;
  uncertaintyRef?: string;
  generatedAt: string;
}
```

Mandatory rules:

1. `OBSERVED_STAGE` MUST remain distinguishable from `OBSERVED_DISCHARGE`.
2. Discharge computed from a rating curve is `DERIVED_MEASUREMENT`, not a direct gauging observation.
3. Every derived discharge MUST retain the exact rating-curve version used.
4. Extrapolation beyond the validated stage range MUST be explicitly flagged.
5. Rating shifts MUST be versioned and time-bounded.
6. A new rating curve MUST NOT silently rewrite historical derived values; reprocessing creates versioned derived output.
7. Backwater, tidal, flat-gradient or hysteretic locations MUST NOT use a one-variable stage-discharge curve when the relation is known to be non-unique.
8. Index-velocity or multivariate relationships MAY be used where appropriate and MUST identify all required inputs.
9. Rating-curve uncertainty MUST propagate into downstream discharge/propagation products.
10. A high water level alone MUST NOT be converted to a discharge without an approved relationship.
11. Provider adapters SHOULD support OGC WaterML 2.0 Part 2 Ratings, Gaugings and Sections when available.
12. Rating-curve validity and source authority MUST be visible to operational diagnostics.

---

## Pass 26 — Hydraulic Sections, Bathymetry, Roughness and Flood-Defense Geometry

### Gap

Quantitative propagation or inundation modeling requires more than river centerlines. Cross-sections, bed elevation, floodplain geometry, levee crest, channel roughness and hydraulic-structure openings can materially affect flow.

### Patch

Add:

```ts
interface HydraulicSection {
  sectionId: string;
  waterBodyRef: string;
  stationingOrChainage?: number;
  geometryRef: string;

  surveyedAt?: string;
  verticalDatumRef?: string;
  horizontalCrsRef?: string;

  pointProfileRef?: string;
  sourceRefs: string[];
  uncertaintyRef?: string;
  version: string;
}

interface BathymetrySurvey {
  surveyId: string;
  waterBodyRef: string;
  surveyedAt: string;
  coverageGeometryRef: string;
  depthOrElevationArtifactRef: string;

  verticalDatumRef: string;
  horizontalCrsRef: string;
  sourceRefs: string[];
  uncertaintyRef?: string;
}

interface HydraulicRoughnessProfile {
  roughnessProfileId: string;
  segmentRef: string;
  parameterType: "MANNING_N" | "CHEZY_C" | "DARCY_WEISBACH" | "OTHER";
  valueOrArtifactRef: string;
  effectiveFrom?: string;
  effectiveUntil?: string;
  calibrationRef?: string;
  sourceRefs: string[];
}

interface FloodDefenseProfile {
  defenseRef: string;
  crestElevationArtifactRef?: string;
  openingOrBreachGeometryRef?: string;
  verticalDatumRef?: string;
  surveyedAt?: string;
  sourceRefs: string[];
  uncertaintyRef?: string;
}
```

Requirements:

- Hydraulic geometry is versioned in time.
- Old survey geometry MUST NOT be silently treated as current after material channel works or flood damage.
- Horizontal and vertical datums are mandatory where quantitative elevation comparison is used.
- Roughness/friction parameters are model inputs, not universally observed truth.
- Consumer basemap contours MUST NOT substitute for hydraulic cross-section/bathymetric surveys in safety-critical quantitative modeling.
- A levee/embankment centerline alone MUST NOT imply crest elevation or protection level.
- Breach/opening state MUST be modeled separately from static defense geometry.
- Hydraulic structure opening geometry MAY affect capacity and MUST retain operational-state references.
- Missing geometry MUST lower capability/forecast confidence rather than trigger invented defaults.
- Cross-section/bathymetry redistribution rights MUST be enforced like other provider artifacts.

---

## Pass 27 — Hydraulic Balance and Physical-Plausibility Checks

### Gap

A model or graph can produce a technically well-formed result that is physically implausible: negative storage, impossible instantaneous downstream response, unexplained flow creation, or discharge discontinuities caused by source/unit/mapping errors.

### Patch

Add:

```ts
interface HydraulicBalanceCheck {
  balanceCheckId: string;
  focusRef: string;
  window: TimeWindow;

  inflowRefs: string[];
  outflowRefs: string[];
  storageChangeRefs: string[];
  diversionRefs: string[];
  pumpRefs: string[];
  ungaugedContributionEstimateRefs?: string[];

  residual?: number;
  residualUnit?: string;

  result:
    | "PLAUSIBLE"
    | "PLAUSIBLE_WITH_UNOBSERVED_COMPONENTS"
    | "SUSPECT"
    | "FAILED"
    | "NOT_COMPUTABLE";

  reasonCodes: string[];
  uncertaintyRef?: string;
}

interface PropagationPlausibilityAssessment {
  propagationRef: string;
  result:
    | "PLAUSIBLE"
    | "TIMING_SUSPECT"
    | "MAGNITUDE_SUSPECT"
    | "TOPOLOGY_SUSPECT"
    | "NOT_ASSESSABLE";
  reasonCodes: string[];
}
```

Rules:

1. Physical checks are diagnostics and guardrails, not replacements for calibrated hydraulic models.
2. Strict mass balance MUST NOT be enforced where important ungauged tributaries/storage/diversions are unknown.
3. Large unexplained residuals SHOULD trigger source/topology/unit/datum diagnostics.
4. Negative storage or impossible sign changes MUST fail validation unless the underlying variable definition legitimately permits them.
5. Estimated travel time MUST be checked against topology distance and configured plausible hydraulic ranges.
6. Sudden downstream changes earlier than physically plausible MAY indicate clock skew, station misbinding or independent local inflow.
7. Plausibility failure MUST NOT automatically discard raw observations.
8. Quantitative public guidance SHOULD fail back to qualitative/structural guidance when core physical checks fail.
9. Operator diagnostics SHOULD identify which input/assumption dominates the failure.
10. LLM output cannot override a deterministic physical-plausibility failure.

---

## Pass 28 — Event-Time Watermarks, Source Clock Quality, Backfill and Reprocessing

### Gap

Late observations are supported, but operational time-series correctness also requires bounded out-of-order handling, explicit source clocks, event-time watermarks and safe historical backfill/reprocessing.

### Patch

Add:

```ts
interface SourceEventTimePolicy {
  sourceRef: string;

  authoritativeTimestampField: string;
  sourceTimezoneOrOffsetRule: string;

  expectedLatency?: Duration;
  allowedOutOfOrderWindow?: Duration;

  clockQuality:
    | "SYNCED"
    | "KNOWN_OFFSET"
    | "UNRELIABLE"
    | "UNKNOWN";

  lateDataPolicy: string;
}

interface IngestionWatermark {
  sourceRef: string;
  observedThrough?: string;
  receivedThrough: string;
  finalizedThrough?: string;
  updatedAt: string;
}

interface HistoricalBackfillRun {
  backfillRunId: string;
  sourceRef: string;
  eventTimeWindow: TimeWindow;
  reason: string;
  state: string;
  canonicalWritePolicy: string;
}

interface ReprocessingRun {
  reprocessingRunId: string;
  inputRevisionScopeRef: string;
  algorithmOrMappingVersion: string;
  affectedDerivedProductClasses: string[];
  state: string;
  startedAt: string;
  completedAt?: string;
}
```

Requirements:

1. Trend windows use event/observation time, not fetch time.
2. Receive time remains preserved for latency/forensics.
3. Historical backfill MUST NOT emit "new current emergency" alerts solely because old records were newly ingested.
4. Late data inside the configured operational window MAY recompute current trend/forecast if still relevant.
5. Very late data MAY update history/replay without disturbing current Feed unless it changes an unresolved material fact.
6. Source clock correction MUST preserve the original supplied timestamp and normalized interpretation.
7. Event-time watermark is source/capability specific.
8. Provider outage recovery MUST not create a false storm of current events from accumulated historical samples.
9. Reprocessing MUST be revisioned and scoped.
10. Reprocessing MUST not overwrite raw source evidence.
11. Current notifications generated before a late correction MAY require a correction/reassessment event when material.
12. Watermark state MUST survive worker restart/retry.

---

## Pass 29 — Probabilistic Forecast Verification, Calibration and Exceedance Semantics

### Gap

R1.1 requires model backtesting, but production probabilistic forecasts need explicit verification, calibration and threshold-exceedance semantics. Ensemble size alone does not prove probability quality.

### Patch

Add:

```ts
interface ForecastVerificationProfile {
  modelRef: string;
  geographyOrBasinRef: string;
  variable: string;
  horizonClass: string;
  validationWindow: TimeWindow;

  metrics: ForecastSkillMetric[];
  sampleCount: number;
  lastVerifiedAt: string;

  validityState:
    | "VALIDATED"
    | "LIMITED"
    | "DEGRADED"
    | "UNVALIDATED"
    | "RETIRED";
}

interface ForecastSkillMetric {
  metric:
    | "MAE"
    | "RMSE"
    | "BIAS"
    | "BRIER"
    | "CRPS"
    | "RELIABILITY"
    | "HIT_RATE"
    | "FALSE_ALARM_RATE"
    | "OTHER";
  value: number;
  unitOrDefinition?: string;
}

interface ForecastCalibrationProfile {
  calibrationProfileId: string;
  modelRef: string;
  variable: string;
  geographyRef: string;
  horizonClass: string;
  method: string;
  effectiveFrom: string;
  effectiveUntil?: string;
  version: string;
}

interface ThresholdExceedanceForecast {
  forecastRef: string;
  thresholdRef: string;
  validWindow: TimeWindow;
  probability?: number;
  probabilityCategory?: string;
  calibrated: boolean;
  calibrationProfileRef?: string;
}
```

Requirements:

- Probability MUST NOT be inferred merely as `ensembleMembersExceeding / ensembleMembers` unless the model product documents that interpretation.
- Public numeric probability SHOULD be suppressed or categorized when calibration is not adequate.
- Calibration/bias correction MUST be versioned.
- Verification MUST be geography/variable/horizon specific.
- Verification against observations MUST account for observation quality and representativeness.
- A forecast may perform well for water level but poorly for flood extent; skill MUST not be generalized across variables.
- Forecast verification results SHOULD drive model/provider selection policy.
- Skill degradation MAY lower model weight or disable quantitative guidance.
- Forecast products SHOULD retain both raw-model and calibrated-product references when calibration is applied.
- Exceedance probability MUST identify the exact threshold definition/version.
- Forecast probability is not equivalent to an official warning probability unless the authority defines it so.
- `90%` MUST never be displayed as "90% certain" without explaining the event/threshold/time window.

---

## Pass 30 — Assimilated Analysis Fields and Non-Independence of Evidence

### Gap

Many operational products merge radar, gauges, satellite, model background and quality-control observations into an "analysis" field. Such a field is neither a raw observation nor a forward forecast, and it is not independent evidence from the inputs that created it.

### Patch

Extend fact classes with:

```text
ASSIMILATED_ANALYSIS
MERGED_OBSERVATION_PRODUCT
```

Add:

```ts
interface AnalysisField {
  analysisFieldId: string;
  variable: string;
  validAt: string;
  geometryOrCoverageRef: string;

  analysisMethodRef: string;
  backgroundModelRef?: string;
  assimilatedObservationRefs: string[];

  outputArtifactRef: string;
  uncertaintyRef?: string;
  generatedAt: string;
}

interface AssimilationCycle {
  assimilationCycleId: string;
  validAt: string;
  inputObservationRevisionSetRef: string;
  backgroundRef?: string;
  methodVersion: string;
  outputAnalysisRefs: string[];
}
```

Rules:

1. An assimilated analysis MUST NOT be labeled a direct sensor observation.
2. It MUST NOT be counted as independent corroboration of an input observation used to create it.
3. Radar–gauge merged rainfall MUST preserve both raw radar and gauge lineage.
4. Satellite-derived analysis MUST expose acquisition/processing latency.
5. Assimilation cycle/version is part of reproducibility.
6. A corrected input MAY trigger bounded reanalysis according to event-time/reprocessing policy.
7. Analysis uncertainty MUST propagate to derived flood/runoff products.
8. Feed wording SHOULD distinguish "analysis indicates" from "station measured".
9. Current-state map layers MAY prefer analysis products for spatial completeness while detail/provenance exposes source composition.
10. Analysis products cannot gain official-warning authority merely because an official source contributed an input.

---

## Pass 31 — Temporal Exposure, Population Presence and Facility Capacity

### Gap

An inundation polygon intersecting a building, village or hospital does not tell SmartAIHub how many people are currently present, whether a facility is operational, or how much response/shelter capacity remains.

### Patch

Add:

```ts
interface PopulationExposureSnapshot {
  exposureSnapshotId: string;
  geographyRef: string;
  validAtOrWindow: TimeWindow;

  estimate?: number;
  estimateType:
    | "CENSUS_RESIDENT"
    | "DAYTIME_ESTIMATE"
    | "NIGHTTIME_ESTIMATE"
    | "MOBILITY_DERIVED_AGGREGATE"
    | "EVACUATION_ADJUSTED"
    | "UNKNOWN";

  sourceRefs: string[];
  uncertaintyRef?: string;
  privacyClass: string;
}

interface FacilityOperationalCapacity {
  facilityRef: string;
  observedOrValidAt: string;

  designCapacity?: number;
  operationalCapacity?: number;
  occupiedOrUsed?: number;
  remainingCapacity?: number;

  capacityUnit: string;
  state:
    | "NORMAL"
    | "LIMITED"
    | "FULL"
    | "CLOSED"
    | "EVACUATED"
    | "UNKNOWN";

  sourceRefs: string[];
  freshness: string;
}
```

Rules:

- Exposure estimate MUST NOT equal confirmed affected/injured/evacuated population.
- Census population MUST NOT be represented as current occupancy.
- Day/night/mobile-derived estimates require privacy-safe aggregate handling.
- Facility design capacity MUST remain distinct from current operational capacity.
- Unknown capacity MUST not default to zero or "available".
- Shelter/hospital/service Feed ranking MAY use fresh remaining capacity where authorized.
- Capacity staleness materially reduces operational confidence.
- Exposure estimates MUST NOT expose household-level inferred presence.
- Commercial targeting MUST not use emergency population-exposure estimates.
- Public low-zoom summaries MAY use ranges rather than false precise counts.

---

## Pass 32 — Spatial Disclosure, Generalization and Anti-Reconstruction

### Gap

R1.3 prevents direct disclosure of sensitive exact locations, but an attacker could potentially reconstruct them by repeatedly changing viewport/filter/time and differencing counts, generalized polygons or Feed membership.

### Patch

Add:

```ts
interface SpatialDisclosurePolicy {
  policyId: string;
  audienceClass: string;
  entityClass: string;

  minimumSpatialResolution?: string;
  minimumCountForAggregate?: number;
  timeResolution?: string;

  geometryMode:
    | "EXACT"
    | "GENERALIZED"
    | "CELL"
    | "ADMIN_AREA"
    | "SUPPRESSED";

  differencingProtection: string;
  ratePolicyRef?: string;
}

interface PublicSpatialProjection {
  canonicalRef: string;
  disclosurePolicyRef: string;
  publicGeometryRef?: string;
  publicCount?: number;
  suppressedReason?: string;
  generatedAt: string;
}
```

Requirements:

1. Sensitive public geometry MUST be generated through deterministic disclosure policy, not ad-hoc LLM redaction.
2. Repeated small viewport queries MUST not trivially reveal a suppressed point through count differencing.
3. Low-count aggregates MAY be coarsened/suppressed.
4. Temporal precision MAY need coarsening for sensitive movement/journey data.
5. Generalization SHOULD be stable for the same disclosure scope; random jitter that changes every request can enable averaging attacks.
6. Public route/corridor projection MUST not reveal protected origin/destination through repeated intersection queries.
7. Operator/responder exact access remains governed by role/purpose.
8. Privacy policy MUST not suppress critical public evacuation/warning geometry that is intended to be public.
9. Coverage statistics MUST not reveal confidential source/station placement where prohibited.
10. Public vector tiles/cache MUST carry the correct audience/projection namespace.

---

## Pass 33 — Provider and Regional-Pack Lifecycle, Retirement and Rights Change

### Gap

R1.2 added provider canary/rollback and R1.3 added tenant safety gates, but long-lived production operation also needs provider retirement, capability migration, pack-version pinning and legal/terms change handling.

### Patch

Add:

```ts
interface ProviderLifecycleState {
  providerRef: string;
  state:
    | "DISCOVERED"
    | "ONBOARDING"
    | "SHADOW"
    | "CANARY"
    | "ACTIVE"
    | "DEGRADED"
    | "SUSPENDED"
    | "DEPRECATED"
    | "RETIRED";

  effectiveAt: string;
  reasonCodes: string[];
  replacementProviderRefs?: string[];
}

interface RegionalPackVersion {
  regionalPackRef: string;
  version: string;
  capabilityBindings: Record<string, string[]>;
  policyVersionRefs: string[];
  sourceContractRefs: string[];
  releasedAt: string;
  deprecatedAt?: string;
  retiredAt?: string;
}

interface ProviderRightsChange {
  providerRef: string;
  detectedAt: string;
  affectedRights: string[];
  previousTermsRef?: string;
  newTermsRef?: string;
  enforcementState:
    | "NO_CHANGE"
    | "REVIEW_REQUIRED"
    | "FEATURE_RESTRICTED"
    | "INGESTION_SUSPENDED"
    | "RETENTION_ACTION_REQUIRED";
}
```

Requirements:

- Regional Pack activation MUST pin an explicit pack version.
- Existing watches/tasks MUST resolve capabilities through stable capability IDs, not raw provider IDs.
- Provider retirement SHOULD migrate to an approved replacement without changing canonical entity identity.
- Replacement MUST NOT silently weaken provenance/freshness/authority semantics.
- Terms/license change triggers policy re-evaluation before continued restricted use.
- Loss of redistribution right MAY require removing public derivatives while retaining legally permitted audit metadata.
- Source retirement MUST NOT imply event resolution.
- Provider `DEPRECATED` MAY remain read-only for history while no longer serving fresh operational data.
- Pack rollback MUST preserve compatibility for active watches and queued jobs.
- Country/tenant UI MUST not hardcode provider names as capability identity.

---

## Pass 34 — Data Artifact Integrity, Offline Package Trust and Import Boundaries

### Gap

Offline Situation Packages and exports are important during disasters, but corrupted/tampered/stale files can be dangerous. R1.3 did not define a complete artifact-integrity manifest.

### Patch

Add:

```ts
interface DataArtifactManifest {
  artifactRef: string;
  artifactType: string;

  contentHash: string;
  hashAlgorithm: string;

  byteLength?: number;
  createdAt: string;
  basedOnProjectionRevisionRef?: string;

  sourceRefs: string[];
  schemaVersion: string;

  signerRef?: string;
  signatureRef?: string;
  trustDomain?: string;

  expiresAt?: string;
}

interface OfflinePackageVerification {
  packageRef: string;
  manifestRef: string;

  integrity:
    | "VERIFIED"
    | "HASH_MISMATCH"
    | "SIGNATURE_INVALID"
    | "UNSIGNED"
    | "UNKNOWN";

  freshness:
    | "CURRENT_ENOUGH"
    | "STALE"
    | "EXPIRED"
    | "UNKNOWN";

  verifiedAt: string;
}
```

Rules:

1. Offline/imported package integrity MUST be checked before operational use.
2. A valid signature proves origin/integrity within a trust domain; it does NOT prove the real-world facts are true/current.
3. Unsigned packages MAY be permitted in constrained environments only with explicit reduced-trust labeling/policy.
4. Hash mismatch MUST block use of affected artifact.
5. Package freshness/data-through timestamp MUST be visible.
6. Import MUST occur in a quarantine/staging boundary before canonical write.
7. External exported bundles SHOULD include manifests for reproducibility.
8. Key rotation/revocation MUST preserve verification of historical artifacts where policy requires.
9. Sensitive offline packages MUST remain encrypted/access-controlled where required.
10. Cache/service-worker corruption MUST not silently bypass artifact verification.

---

## Pass 35 — Canonical Data-Quality Incident and Bounded Recovery/Rebuild

### Gap

Provider contract tests catch future schema drift, but a bad adapter mapping, unit conversion, datum interpretation or canonical-entity binding can already have written incorrect normalized data before detection.

### Patch

Add:

```ts
interface DataQualityIncident {
  dataQualityIncidentId: string;

  cause:
    | "ADAPTER_MAPPING"
    | "UNIT_CONVERSION"
    | "DATUM"
    | "ENTITY_BINDING"
    | "TIME_NORMALIZATION"
    | "MODEL"
    | "OPERATOR"
    | "OTHER";

  firstAffectedAt?: string;
  detectedAt: string;

  sourceRefs: string[];
  affectedCanonicalClasses: string[];
  suspectedRevisionScopeRef: string;

  severity:
    | "LOW"
    | "MODERATE"
    | "HIGH"
    | "CRITICAL";

  state:
    | "OPEN"
    | "CONTAINED"
    | "REPROCESSING"
    | "CORRECTED"
    | "CLOSED";
}

interface DataImpactAnalysis {
  dataQualityIncidentRef: string;
  affectedCanonicalRefs: string[];
  affectedProjectionRefs: string[];
  affectedNotificationRefs: string[];
  affectedDecisionRefs: string[];
  affectedWatchRefs: string[];
}

interface CanonicalRebuildRun {
  rebuildRunId: string;
  sourceEvidenceScopeRef: string;
  normalizationVersion: string;
  targetCanonicalScopeRef: string;
  state: string;
}
```

Requirements:

1. Detection MUST first stop/contain further bad normalization when appropriate.
2. Raw source evidence remains immutable.
3. Impact analysis SHOULD identify derived Map/Feed/Chat/notification/route products affected.
4. Correcting canonical data MUST use revisioned correction/rebuild, not destructive history rewrite.
5. Rebuild must be bounded by affected source/time/geography/entity scope.
6. Critical wrong notification MAY require correction notice according to existing notification policy.
7. A historical bad value corrected today MUST not masquerade as a new current observation.
8. Rebuild/replay MUST preserve billing/idempotency semantics and MUST NOT recharge users for platform correction work unless policy explicitly permits.
9. Operations MUST see recovery progress and unresolved affected scope.
10. Incident closure requires evidence that affected projections/caches/search/vector products were invalidated or rebuilt.

---

## Pass 36 — Stable Geospatial References, Boundary Evolution and Watch Migration

### Gap

Users may keep Saved Areas, Watches, Feed locks, deep links and route/journey references for months or years. Raw provider IDs, administrative boundaries and canonical entity mappings can change.

### Patch

Add:

```ts
interface StableGeoReference {
  stableGeoRef: string;

  entityClass:
    | "AREA"
    | "WATER_BODY"
    | "STATION"
    | "ROAD"
    | "FACILITY"
    | "BASIN"
    | "ADMIN_AREA"
    | "CUSTOM_GEOMETRY";

  canonicalRef?: string;
  immutableGeometrySnapshotRef?: string;

  createdAt: string;
  resolutionPolicy: string;
}

interface WatchScopeBinding {
  watchRef: string;
  stableGeoRef: string;

  scopeSemantics:
    | "FOLLOW_CANONICAL_ENTITY"
    | "FOLLOW_CURRENT_ADMIN_BOUNDARY"
    | "PIN_GEOMETRY_SNAPSHOT"
    | "ROUTE_CORRIDOR"
    | "CUSTOM";

  bindingRevision: string;
}

interface GeoReferenceMigration {
  stableGeoRef: string;
  fromRevision: string;
  toRevision: string;

  result:
    | "UNCHANGED"
    | "AUTO_MIGRATED"
    | "SPLIT_REQUIRES_REVIEW"
    | "MERGE_REDIRECT"
    | "UNRESOLVED";

  reasonCodes: string[];
}
```

Requirements:

- Watch/deep-link identity MUST not depend solely on provider IDs.
- Canonical merge MAY redirect a stable reference while preserving history.
- Canonical split MUST NOT arbitrarily choose one successor for a high-impact watch; policy/user/operator review may be required.
- Administrative-boundary watches MUST declare whether they follow future boundary revisions or pin the original geometry.
- Custom user-drawn geometry SHOULD remain immutable unless explicitly edited.
- Regional Pack/provider migration MUST preserve stable references when semantic identity remains the same.
- Retired station IDs MAY resolve to a historical entity without implying current observations exist.
- Deep links SHOULD fail gracefully with historical/retired explanation rather than 404-only behavior.
- Watch migration is audited.
- Multilingual display-name changes MUST not change stable identity.

---

# R1.4 Standards and Research Alignment

Implementation SHOULD recognize these standards where relevant:

```text
OGC WaterML 2.0 Part 1 — Timeseries
OGC WaterML 2.0 Part 2 — Ratings, Gaugings and Sections
OGC WaterML 2.0 Part 3 — Surface Hydrology Features
OGC TimeseriesML / Timeseries Profile of Observations & Measurements
OGC Observations, Measurements and Samples
OGC SensorThings API
OGC API Features / Tiles
STAC API
CAP
```

For stage–discharge conversion, production implementation MUST preserve the operational principle that rating relationships are site-specific and can change as channel conditions change; complex tidal/backwater sites may require velocity/cross-section or multivariate methods rather than a simple stage-only curve.

---

# R1.4 Revised Priority Matrix

## P0 — operational correctness

- rating/gauging/stage-discharge lineage for any source that derives discharge from stage;
- event-time watermark/backfill/reprocessing rules;
- canonical data-quality incident containment/rebuild;
- stable references for watches/deep links;
- spatial disclosure policy for sensitive public geometry;
- provider/pack lifecycle state and rights-change handling;
- offline/export artifact integrity;
- threshold/probability semantics;
- assimilation fact-class separation where merged products are used.

## P1 — hydrological/model depth

- hydraulic sections/cross-sections/bathymetry;
- roughness/flood-defense geometry;
- physical hydraulic balance/plausibility diagnostics;
- probabilistic forecast calibration/verification;
- temporal population/facility capacity;
- automated watch migration diagnostics.

## P2 — advanced modeling

- high-resolution calibrated 1D/2D hydraulic modeling;
- dynamic channel geometry assimilation;
- probabilistic population/exposure modeling where lawful and scientifically justified;
- advanced physical data assimilation;
- automated model calibration recommendation.

P2 SHALL NOT block P0 provenance, privacy, source truthfulness or public-safety correctness.

---

# R1.4 Additional Acceptance Tests 261–320

261. Observed stage and observed discharge remain distinct canonical facts.
262. Rating-derived discharge retains exact rating-curve version.
263. Rating extrapolation outside validated range is explicitly marked.
264. Reprocessed rating curve does not destructively overwrite historical derived discharge.
265. Tidal/backwater station cannot silently use an invalid one-variable stage-discharge relation.

266. Hydraulic cross-section records survey time and vertical datum.
267. Old bathymetry is not silently treated as current after known channel works.
268. Missing roughness parameter prevents unsupported precise hydraulic prediction rather than inventing a default.
269. Levee centerline alone cannot imply crest elevation.
270. Breach geometry is represented separately from static flood-defense geometry.

271. Large unexplained mass-balance residual triggers diagnostic state.
272. Unknown tributary/storage can produce `PLAUSIBLE_WITH_UNOBSERVED_COMPONENTS` instead of false failure.
273. Impossible negative storage fails physical-plausibility validation.
274. Propagation earlier than plausible travel time raises timing/topology/source diagnostic.
275. Raw gauge data is preserved even when plausibility assessment is suspect.

276. Event-time trend remains correct when samples arrive out of order within allowed window.
277. Historical backfill does not trigger a false current emergency Feed storm.
278. Provider outage recovery respects event time rather than fetch time.
279. Clock normalization preserves original source timestamp.
280. Reprocessing survives worker restart and remains revision-scoped.

281. Probability of threshold exceedance identifies exact threshold/version/time window.
282. Uncalibrated ensemble fraction is not automatically shown as calibrated probability.
283. Forecast skill is assessed separately by geography, horizon and variable.
284. Bias-corrected forecast retains raw model and calibration profile references.
285. Skill degradation can disable quantitative guidance without disabling raw observations.

286. Radar–gauge merged rainfall is classified as analysis/merged product, not direct gauge observation.
287. Analysis field is not counted as independent corroboration of its assimilated inputs.
288. Corrected gauge input can trigger bounded reanalysis.
289. Map analysis layer detail can expose its input composition.
290. Official-source contribution to analysis does not confer official-alert authority.

291. Census population is not presented as current occupancy.
292. Day/night population estimate exposes estimate type and uncertainty.
293. Hospital design capacity remains distinct from operational/current remaining capacity.
294. Unknown shelter capacity does not default to available capacity.
295. Exposure estimate is not reported as confirmed casualty/affected-person count.

296. Repeated public viewport differencing cannot trivially reconstruct a protected point.
297. Low-count sensitive aggregates can be coarsened/suppressed by policy.
298. Stable generalization prevents averaging random jitter into an exact sensitive location.
299. Public route corridor projection cannot expose protected endpoints through repeated intersection queries.
300. Public warning polygon intended for evacuation is not hidden by an unrelated sensitive-location rule.

301. Regional Pack is activated with an explicit version.
302. Provider retirement preserves canonical entity identity where semantic identity is unchanged.
303. Terms/license change can suspend only affected capability/use mode.
304. Provider retirement does not resolve the associated real-world event.
305. Active watch survives provider replacement when capability remains equivalent.

306. Offline package hash mismatch blocks operational import.
307. Valid artifact signature is not interpreted as factual truth/currentness.
308. Stale but intact offline package is clearly marked stale.
309. Imported package is quarantined/staged before canonical write.
310. Historical signature verification survives key rotation according to policy.

311. Bad unit-conversion incident can identify affected canonical/projection/notification scope.
312. Containment stops further bad normalized writes without deleting raw evidence.
313. Canonical rebuild uses corrected normalization version and bounded scope.
314. Historical corrected record does not appear as a brand-new current observation.
315. Recovery verifies cache/search/vector invalidation or rebuild before closure.

316. Saved watch survives raw provider station-ID change.
317. Administrative-area watch declares follow-boundary versus pin-geometry semantics.
318. Canonical split does not arbitrarily move a critical watch to one successor.
319. Retired station deep link resolves to historical/retired explanation.
320. Integrated rating-curve + event-time + forecast calibration + privacy + provider retirement + canonical-rebuild + stable-watch scenario passes end to end.

---

# R1.4 Mandatory Integrated Scenarios

## Scenario S — Rating-curve shift after major flood

A river station reports continuous stage. Discharge is derived through a current rating curve. A major flood changes channel geometry and subsequent gaugings demonstrate that the prior rating is biased. The authority publishes a new rating/shift. SmartAIHub preserves raw historical stage, preserves the old derived-discharge version, produces corrected/reprocessed derived values under the new rating policy where appropriate, updates model verification products, and does not present the correction as a new current flood event.

## Scenario T — Out-of-order telemetry after network outage

A remote basin loses communications for several hours. When the network recovers, telemetry arrives in bulk and out of order. Event-time watermarks insert observations at the proper historical times, recompute only still-relevant trends, avoid a burst of false "new" emergencies, retain receive latency, and reassess any still-active warning whose interpretation materially changed.

## Scenario U — Radar/gauge analysis and calibrated forecast

Radar, gauges and model background produce an assimilated rainfall analysis. A hydrological ensemble then forecasts threshold exceedance. SmartAIHub prevents the analysis from being counted as independent corroboration of its gauge inputs, applies a basin/horizon-specific calibration profile, labels probability against the exact threshold/time window, and falls back to qualitative guidance when the model skill profile is degraded.

## Scenario V — Sensitive evacuation origin and public map differencing

A protected household/responder origin participates in an evacuation workflow. Public Map/Feed expose a generalized route-impact corridor but not the exact origin. Repeated viewport, time-filter and count queries cannot reconstruct the protected point. Authorized responders retain exact role/purpose-bound access. The official public evacuation polygon remains visible.

## Scenario W — Provider license/retirement during an active watch

A regional hydrology provider changes terms and then retires an endpoint during an active flood watch. Policy disables prohibited redistribution, preserves legally permitted provenance, migrates capability to an approved replacement provider, keeps canonical station/basin identity stable, and does not falsely resolve the flood. A watch remains active with an audited provider-binding revision.

## Scenario X — Normalization bug and canonical rebuild

An adapter version incorrectly interprets centimeters as meters for a subset of observations. Detection opens a high-severity DataQualityIncident, blocks further affected normalization, identifies impacted trends/Feed cards/routes/notifications, rebuilds canonical/derived state from immutable source evidence with the corrected mapping, issues corrections where operationally required, invalidates affected caches/search/vector products, and does not recharge users for platform correction work.

---

# R1.4 Revised Definition of Done

Spec 262 R1.4 is DONE only when all R1.3 requirements continue to hold and:

1. Stage/discharge conversion is explicitly modeled and versioned wherever used.
2. Quantitative hydrological models can consume versioned hydraulic geometry or declare its absence/limitations.
3. Physical plausibility guardrails prevent obviously impossible quantitative guidance.
4. Event-time, watermarks, late data, backfill and reprocessing are deterministic and restart-safe.
5. Probabilistic forecast output has geography/horizon/variable-specific verification and calibrated-probability semantics where numeric probability is shown.
6. Assimilated/merged analysis remains distinct from raw observation and does not create false independent corroboration.
7. Population/facility exposure uses temporal/operational semantics rather than static intersection alone.
8. Public geospatial projections resist straightforward differencing/reconstruction of protected locations.
9. Provider/Regional Pack lifecycle handles deprecation, retirement, replacement and rights changes without corrupting canonical identity.
10. Offline/import/export artifacts have integrity/freshness verification and safe trust boundaries.
11. Canonical-data contamination can be contained, impact-assessed and rebuilt from immutable evidence.
12. Long-lived watches/deep links survive provider and boundary/entity evolution according to explicit semantics.
13. Acceptance tests 1–320 pass, except explicit owner-approved deferrals that cannot reduce minimum life-safety correctness, privacy, provenance, or coverage truthfulness.
14. Mandatory scenarios A–X pass in representative normal and degraded conditions.

---

# Appendix K — R1.4 Core Object Additions

```text
HydraulicRatingCurve
GaugingMeasurement
StageDischargeConversion

HydraulicSection
BathymetrySurvey
HydraulicRoughnessProfile
FloodDefenseProfile

HydraulicBalanceCheck
PropagationPlausibilityAssessment

SourceEventTimePolicy
IngestionWatermark
HistoricalBackfillRun
ReprocessingRun

ForecastVerificationProfile
ForecastSkillMetric
ForecastCalibrationProfile
ThresholdExceedanceForecast

AnalysisField
AssimilationCycle

PopulationExposureSnapshot
FacilityOperationalCapacity

SpatialDisclosurePolicy
PublicSpatialProjection

ProviderLifecycleState
RegionalPackVersion
ProviderRightsChange

DataArtifactManifest
OfflinePackageVerification

DataQualityIncident
DataImpactAnalysis
CanonicalRebuildRun

StableGeoReference
WatchScopeBinding
GeoReferenceMigration
```

---

# Appendix L — R1.4 Fact-Class Extensions

The following distinction is mandatory:

```text
RAW_SOURCE_EVIDENCE
OBSERVED_STAGE
OBSERVED_DISCHARGE
DERIVED_MEASUREMENT
GAUGING_MEASUREMENT
ASSIMILATED_ANALYSIS
MERGED_OBSERVATION_PRODUCT
OFFICIAL_PLAN
OFFICIAL_ALERT
DERIVED_NOWCAST
MODEL_FORECAST
SCENARIO_SIMULATION
HISTORICAL_REPLAY
AI_EXPLANATION
```

A derived/assimilated product MUST never be silently relabeled as its underlying raw observation.

---

# R1.4 Final Principle

> Emergency geospatial intelligence must remain correct not only when the data is fresh and clean, but also when measurements are derived, ratings change, observations arrive late, forecasts are probabilistic, providers retire, boundaries evolve, artifacts go offline, or a normalization bug must be repaired from historical evidence.

---

# R1.5 — Fourth Twelve-Pass Gap Review / 48-Pass Cumulative Hardening

R1.5 is a fourth independent twelve-pass review over the complete R1.4 specification. This review focuses on global exchange standards, public-warning lifecycle correctness, event-stream delivery semantics, evacuation network capacity, model deployment governance, operational-map/reference-data conflation, water-quality/public-health intelligence, cross-provider semantic ontology, multi-jurisdiction authority, live-vs-exercise isolation, delivery assurance, and long-term high-frequency data lifecycle.

All fixes below are normative. Spec 260 remains implemented and unmodified. Where R1.5 is more specific than R1.0–R1.4, R1.5 controls for Spec 262 implementation.

## R1.5 Review Ledger

| New pass | Cumulative pass | Review lens | Gap found | R1.5 remediation |
|---|---:|---|---|---|
| 1 | 37 | Global Earth-system exchange | Standards list existed but WMO WIS2/WHOS and OGC API EDR/PubSub were not first-class provider contracts | Added WIS2/WHOS/EDR integration profiles |
| 2 | 38 | Public-warning lifecycle | CAP was ingestible but sender identity, `Alert/Update/Cancel`, `references`, scope and multilingual block reconciliation were underspecified | Added canonical CAP lifecycle and authority binding |
| 3 | 39 | Streaming correctness | Webhooks/realtime existed but sequence, replay, gap detection, consumer cursor and at-least-once semantics were not explicit enough | Added OperationalEventStream contract |
| 4 | 40 | Mass evacuation | Route safety covered individual journeys but evacuation clearance time, network capacity, contraflow, staging, shelter receiving capacity and fuel were incomplete | Added MassMovementPlan / EvacuationNetworkState |
| 5 | 41 | Model governance | Forecast runs were versioned but executable model artifact, configuration, runtime, dependency and deployment approval were not a first-class registry | Added OperationalModelRegistry |
| 6 | 42 | Basemap/reference conflation | External road/water/place geometry could be mistaken for operational authoritative network state or silently drift | Added ReferenceFeatureConflation / OperationalNetworkBinding |
| 7 | 43 | Water quality and sanitation | Flood water quantity was deep, but contamination, potable-water outage and wastewater overflow intelligence were not first-class | Added WaterQuality/Sanitation intelligence |
| 8 | 44 | Semantic interoperability | Provider taxonomies/code lists could map inconsistently across countries and versions | Added CanonicalConceptRegistry / SourceCodeMapping |
| 9 | 45 | Multi-jurisdiction and cross-border authority | Geographic capability existed but overlapping authority, cross-border warning scope and disputed/ambiguous boundaries were weak | Added JurisdictionAuthorityMatrix |
| 10 | 46 | Training/drill isolation | Simulation was isolated, but exercises using real operators/channels could still contaminate live state or notify the public | Added ExerciseEnvironment and TEST/EXERCISE delivery gates |
| 11 | 47 | Warning delivery assurance | Notification authority was reused from Spec 260, but geospatial warning delivery coverage, channel receipts and fallback diagnostics were not explicit | Added WarningDeliveryAssessment |
| 12 | 48 | Long-term observation lifecycle | High-frequency telemetry retention/downsampling could lose peaks, corrections, provenance or replay ability | Added ObservationRetentionProfile / HydrologicalSummaryProduct |

---

## Pass 37 — WMO WIS2 / WHOS and OGC API EDR / PubSub Interoperability

### Gap

R1.2 introduced standards-first ingestion, including WaterML 2.0 and SensorThings, but global rollout needs a stronger real-time exchange/discovery profile.

As of 2026, WMO Information System 2.0 (WIS2) is operational and supports modern Internet/open-standard Earth-system data exchange. WMO Hydrological Observing System (WHOS) is designed to broker interoperable hydrological data and is being integrated with WIS2. OGC API — Environmental Data Retrieval (EDR) defines standardized spatiotemporal queries including position, area, trajectory and corridor, while EDR Part 2 defines a publish-subscribe workflow.

### Patch

Add acquisition profiles:

```text
WMO_WIS2
WMO_WHOS
OGC_API_EDR
OGC_API_EDR_PUBSUB
```

Add:

```ts
interface EarthSystemExchangeEndpoint {
  exchangeEndpointId: string;

  protocol:
    | "WIS2"
    | "WHOS"
    | "OGC_EDR"
    | "OGC_EDR_PUBSUB";

  endpointRef: string;
  catalogRef?: string;
  topicOrCollectionRefs?: string[];

  geographyCoverageRef?: string;
  variableCoverageRefs: string[];

  authenticationProfileRef?: string;
  termsRef?: string;

  discoveredAt: string;
  lastValidatedAt: string;
}

interface EDRQueryCapability {
  endpointRef: string;

  queryPatterns: Array<
    | "POSITION"
    | "RADIUS"
    | "AREA"
    | "CUBE"
    | "TRAJECTORY"
    | "CORRIDOR"
    | "LOCATION"
    | "ITEM"
  >;

  supportedParameters: string[];
  supportedFormats: string[];
  temporalExtent?: TimeWindow;
  verticalExtentRef?: string;
}
```

Requirements:

1. WIS2/WHOS/EDR are provider transports/discovery mechanisms, not new SmartAIHub sources of truth.
2. Every dataset received through those systems MUST still bind to a canonical source identity and provider terms.
3. WIS2 topic/notification delivery MUST enter canonical event-time and stream-deduplication logic.
4. WHOS observations MUST normalize through the same hydrology contracts as national/local providers.
5. OGC EDR `trajectory` and `corridor` queries MAY support route/weather/hydrology intersection without bespoke provider APIs.
6. EDR query capability MUST be discovered rather than assumed.
7. Publish-subscribe notifications MUST be treated as change signals; clients MAY still fetch authoritative payload/content according to the provider contract.
8. Global Cache/Broker/provider duplication MUST not create duplicate canonical observations.
9. Provider dataset identifiers MUST remain distinct from canonical SmartAIHub variable/entity identity.
10. Global exchange discovery MUST be capability- and policy-bounded to avoid indiscriminate high-volume subscription.
11. WIS2/WHOS integration SHOULD be optional Regional Pack capabilities, not mandatory dependencies for basic Map/Weather operation.
12. Provider/API evolution MUST pass source-contract compatibility tests before activation.

Reference standards/research:

- WMO WIS2 operational framework and implementation guidance.
- WMO Hydrological Observing System (WHOS).
- OGC API — Environmental Data Retrieval 1.2.
- OGC API — EDR Part 2 Publish-Subscribe Workflow.

---

## Pass 38 — CAP Alert Lifecycle, Authority Identity, Scope and Multilingual Reconciliation

### Gap

CAP support existed as an input format, but public-warning correctness requires exact lifecycle handling. CAP distinguishes initial alerts, updates, cancellations, acknowledgement/error message types, scoped audiences, sender/identifier identity, references, effective/expiry times and multilingual `info` blocks.

### Patch

Add:

```ts
interface CanonicalAlertEnvelope {
  canonicalAlertRef: string;

  senderId: string;
  senderCanonicalAuthorityRef?: string;
  sourceIdentifier: string;

  capIdentifier?: string;
  sentAt: string;

  messageType:
    | "ALERT"
    | "UPDATE"
    | "CANCEL"
    | "ACK"
    | "ERROR"
    | "NON_CAP";

  scope:
    | "PUBLIC"
    | "RESTRICTED"
    | "PRIVATE";

  references: AlertReference[];
  infoBlockRefs: string[];

  effectiveAt?: string;
  expiresAt?: string;

  authorityState:
    | "VERIFIED_AUTHORITY"
    | "KNOWN_SOURCE"
    | "UNVERIFIED_SOURCE"
    | "SOURCE_ANOMALY";

  revision: string;
}

interface AlertReference {
  senderId: string;
  identifier: string;
  sentAt: string;
}

interface AlertInfoProjection {
  alertRef: string;
  language?: string;
  category?: string[];
  eventCodeRefs?: string[];
  urgency?: string;
  severity?: string;
  certainty?: string;

  headline?: string;
  description?: string;
  instruction?: string;

  areaRefs: string[];
}
```

Mandatory behavior:

1. CAP `identifier` is unique only in sender context; canonical identity MUST include sender/source context.
2. `Update` MUST supersede referenced message(s) without deleting historical versions.
3. `Cancel` MUST cancel only referenced/safely-resolved alert lineage.
4. Feed silence MUST NOT be interpreted as cancellation.
5. Duplicate delivery of the same sender + identifier + sent tuple MUST be idempotent.
6. Restricted/private alerts MUST never enter public projections unless an authorized policy explicitly permits a public derivative.
7. Sender registration/authority scope MUST be checked independently of XML/schema validity.
8. A compromised/anomalous official source remains subject to source-anomaly rules from Spec 260/R1.2.
9. Multiple language `info` blocks MUST bind to one alert lifecycle, not become independent alerts.
10. Machine translation MUST remain separate from authority-supplied multilingual blocks.
11. Alert area geometry/geocodes MUST retain source geometry and normalization lineage.
12. Effective/expires/onset semantics MUST use source timestamps, not fetch time.
13. Unknown/malformed reference chains MUST enter explicit unresolved/review state.
14. CAP validation success does NOT prove the warning is genuine, current or authorized.
15. Alert update/cancel propagation MUST invalidate affected Feed/Map/notification products deterministically.

---

## Pass 39 — Operational Event Stream Semantics, Replay, Gap Detection and Consumer Cursors

### Gap

Spec 262 uses realtime deltas, subscriptions, webhooks and provider streams, but large-scale operation needs one explicit stream contract. "Exactly once" delivery cannot be assumed across external brokers, Cloudflare Queues, webhooks, WIS2, MCP consumers or reconnecting clients.

### Patch

Add:

```ts
interface OperationalStreamEvent {
  streamEventId: string;
  streamName: string;

  partitionKey: string;
  sequence?: string;

  eventType: string;
  entityRef?: string;
  entityRevision?: string;

  occurredAt: string;
  publishedAt: string;

  payloadRef?: string;
  projectionRevisionRef?: string;

  dedupeKey: string;
  schemaVersion: string;
}

interface ConsumerCursor {
  consumerRef: string;
  streamName: string;
  partitionKey?: string;

  cursorOrSequence?: string;
  lastEventId?: string;
  committedAt: string;
}

interface StreamGapAssessment {
  consumerRef: string;
  streamName: string;
  expectedAfter?: string;
  received?: string;

  state:
    | "NO_GAP"
    | "GAP_DETECTED"
    | "SEQUENCE_UNKNOWN"
    | "REPLAY_REQUIRED";

  detectedAt: string;
}
```

Rules:

1. SmartAIHub MUST design for at-least-once delivery unless a specific substrate contract proves stronger semantics.
2. Side effects MUST be protected by idempotency/deduplication.
3. Sequence ordering is guaranteed only within explicitly defined partition/order domains.
4. No global total ordering across all incidents/providers SHALL be assumed.
5. Consumer reconnect MUST detect missed revision/event range where the source protocol allows it.
6. Gap recovery MAY use replay, snapshot+cursor, refetch or canonical revision reconciliation.
7. Replay MUST not duplicate notifications/tasks/economic side effects.
8. Stream event schema version MUST be explicit.
9. Poison/malformed event handling MUST not block unrelated partitions.
10. Public realtime connections MAY consume compact invalidation events rather than full sensitive state.
11. Position streams and high-rate telemetry SHOULD be sampled/coalesced according to consumer need.
12. Retired consumers MUST not retain indefinite replay state unless policy requires it.
13. External webhook/MCP consumers MUST receive correction/retraction semantics where contract supports them.
14. Stream lag/backlog age is an operational SLO, not merely an infrastructure metric.

---

## Pass 40 — Mass Evacuation, Clearance Time, Route Capacity, Contraflow and Receiving Capacity

### Gap

Spec 260/262 deeply models individual routes/journeys, but a regional evacuation is not reducible to "find many safe routes". Large-scale movement depends on route throughput, departure demand, clearance time, bridge/bottleneck capacity, staging, accessible transport, fuel, contraflow and receiving/shelter capacity.

### Patch

Add:

```ts
interface MassMovementPlan {
  movementPlanId: string;

  sourceAreaRefs: string[];
  destinationOrReceivingAreaRefs: string[];

  authorityRef: string;
  issuedAt: string;

  movementMode:
    | "EVACUATION"
    | "PHASED_EVACUATION"
    | "RELOCATION"
    | "SHELTER_TRANSFER"
    | "PATIENT_MOVEMENT"
    | "OTHER";

  populationDemandRef?: string;
  networkStateRef?: string;
  receivingCapacityRef?: string;

  planRevision: string;
}

interface EvacuationNetworkState {
  networkStateId: string;
  validAt: string;

  edgeCapacityRefs: string[];
  bottleneckRefs: string[];
  contraflowRefs: string[];
  trafficControlRefs: string[];

  fuelAvailabilityRefs: string[];
  accessibleTransportRefs: string[];

  uncertaintyRef?: string;
}

interface EvacuationClearanceEstimate {
  estimateId: string;
  movementPlanRef: string;

  estimatedClearanceWindow?: TimeWindow;
  demandAssumptionRef: string;
  networkCapacityAssumptionRef: string;

  unmetTransportDemand?: number;
  receivingCapacityConstraintRefs: string[];

  uncertaintyRef: string;
  modelRef?: string;
}

interface ContraflowOperation {
  operationRef: string;
  roadSegmentRefs: string[];
  effectiveWindow: TimeWindow;
  authorityRef: string;
  state:
    | "PLANNED"
    | "ACTIVE"
    | "SUSPENDED"
    | "ENDED"
    | "UNKNOWN";
}
```

Requirements:

1. Individual route ETA MUST NOT be multiplied by population count to estimate evacuation clearance time.
2. Clearance estimates MUST identify population-demand and network-capacity assumptions.
3. Evacuees from neighboring jurisdictions/pass-through areas MAY consume the same network capacity.
4. Bridge closure, flood onset, weather degradation and fuel shortages MAY alter clearance time.
5. Shelter/receiving-zone capacity MUST be checked separately from road capacity.
6. Accessible transportation demand MUST be representable without exposing protected disability/medical details.
7. Contraflow MUST require authoritative operational state and MUST NOT be inferred from ordinary routing traffic.
8. Route guidance MUST distinguish "route available to an individual" from "corridor has adequate evacuation capacity".
9. A destination/shelter becoming full MAY require movement-plan re-evaluation.
10. Mass evacuation model output is advisory unless integrated into an authorized operational command workflow.
11. Public Feed SHOULD avoid inducing unsafe self-routing into constrained responder/evacuation corridors.
12. Fuel/charging/vehicle-type constraints MAY affect movement planning.
13. Patient movement/ambulance/organ journeys retain their higher-priority/sensitive policies from Spec 260.
14. Clearance-time forecast MUST retain uncertainty and cutoff/zero-hour assumptions.

---

## Pass 41 — Operational Model Registry, Executable Artifact Identity and Deployment Governance

### Gap

Forecast/model outputs contain `modelRef`, but a model reference is insufficient to reproduce or safely deploy an operational model. The exact executable artifact, runtime, dependencies, configuration, input contract, calibration and approved geographic/variable validity must be controlled.

### Patch

Add:

```ts
interface OperationalModelDefinition {
  modelRef: string;
  modelFamily: string;
  version: string;

  purpose:
    | "WEATHER"
    | "HYDROLOGY"
    | "INUNDATION"
    | "ROUTING"
    | "EXPOSURE"
    | "CLASSIFICATION"
    | "OTHER";

  executableArtifactRef: string;
  artifactDigest: string;

  runtimeProfileRef: string;
  dependencyLockRef?: string;

  inputSchemaVersion: string;
  outputSchemaVersion: string;

  validityEnvelopeRef: string;
  verificationProfileRefs: string[];

  state:
    | "EXPERIMENTAL"
    | "SHADOW"
    | "CANARY"
    | "APPROVED"
    | "DEGRADED"
    | "SUSPENDED"
    | "RETIRED";

  approvedByPolicyRef?: string;
}

interface ModelExecutionRecord {
  executionRef: string;
  modelRef: string;
  exactModelVersion: string;
  artifactDigest: string;

  configurationRef: string;
  inputManifestRef: string;
  outputManifestRef: string;

  runtimeRef: string;
  startedAt: string;
  completedAt?: string;
}
```

Rules:

1. `modelRef` without exact version/artifact digest is insufficient for a production-derived safety product.
2. Model upgrade MUST pass compatibility/verification/canary policy.
3. Runtime/dependency change that can materially change output MUST create a distinct deployable model version/config revision.
4. Model validity envelope includes geography, variable, horizon, input quality and known exclusions.
5. An approved model outside its validity envelope MUST degrade/fail closed to less precise output.
6. Shadow/canary outputs MUST not silently become public authoritative products.
7. Model artifact retirement MUST preserve historical replay references.
8. Proprietary model/provider identity MAY be abstracted publicly but MUST remain auditable internally.
9. Emergency rollback MUST be able to pin/revert a prior verified model version.
10. LLM-generated code/model configuration MUST pass the same registry/admission requirements before operational use.
11. Model verification metrics from R1.4 bind to exact model/calibration versions.
12. Operational model inventory SHOULD expose cost/resource profile for surge planning.

---

## Pass 42 — Reference Map Conflation, Operational Network Binding and Basemap Drift

### Gap

The UI may render Google/MapLibre/OSM/provider geometry while operational road/hydro/facility state comes from official sources. If implementations bind state to display geometry or provider IDs directly, map updates can silently break closures, river topology, watches or routes.

### Patch

Add:

```ts
interface ReferenceFeatureConflation {
  conflationRef: string;

  canonicalEntityRef: string;
  providerFeatureRef: string;

  providerRef: string;
  providerFeatureVersion?: string;

  relation:
    | "SAME_ENTITY"
    | "APPROXIMATE_MATCH"
    | "DISPLAY_ONLY"
    | "SUPERSEDED"
    | "AMBIGUOUS";

  geometryDifferenceMetric?: number;
  confidence: string;
  reviewedAt?: string;
}

interface OperationalNetworkBinding {
  canonicalOperationalEdgeRef: string;

  displayGeometryRef?: string;
  routingProviderEdgeRefs?: string[];
  officialNetworkRefs?: string[];

  bindingRevision: string;
  effectiveFrom: string;
  effectiveUntil?: string;
}
```

Requirements:

1. Basemap geometry is display/reference data unless explicitly admitted as operational network data.
2. A basemap provider removing/renaming a road MUST NOT reopen or resolve a canonical official closure.
3. Road/water/facility operational state binds to canonical entities/edges, not visual-layer feature IDs.
4. Routing-provider map matching MAY suggest edge candidates but MUST retain confidence/provenance.
5. Ambiguous road/canal conflation MUST not apply high-risk closure/impact automatically.
6. Provider geometry refresh triggers bounded conflation review/recompute, not canonical identity churn.
7. Official network geometry MAY supersede display reference geometry for analysis while MapLibre still renders provider basemap.
8. Snap-to-road/river for user reports MUST preserve original reported geometry.
9. Display geometry shift MUST not silently move historical evidence.
10. Cross-provider feature match MAY be many-to-one/one-to-many.
11. Regional Pack onboarding SHOULD define conflation strategy for major road/hydro networks.
12. Conflation errors are eligible `DataQualityIncident` causes.

---

## Pass 43 — Water Quality, Sanitation, Potable-Water and Wastewater Intelligence

### Gap

Flooding can create a second emergency after water arrives: contaminated drinking water, sewage overflow, damaged treatment systems, chemical contamination and service interruption. R1.4 models flood quantity deeply but water quality remained only an incidental context.

### Patch

Add:

```ts
interface WaterQualityObservation {
  observationRef: string;
  waterBodyOrSupplyRef: string;
  observedAt: string;

  parameterCode: string;
  value?: number;
  unit?: string;

  qualitativeState?: string;

  methodRef?: string;
  sourceRefs: string[];
  qualityFlag?: string;
}

interface PotableWaterServiceState {
  serviceAreaRef: string;
  validAt: string;

  state:
    | "NORMAL"
    | "LOW_PRESSURE"
    | "INTERRUPTED"
    | "BOIL_OR_TREAT_ADVISORY"
    | "DO_NOT_DRINK"
    | "DO_NOT_USE"
    | "UNKNOWN";

  authorityRef?: string;
  sourceRefs: string[];
  expiresAt?: string;
}

interface WastewaterOverflowEvent {
  eventRef: string;
  facilityOrAreaRef: string;
  observedOrReportedAt: string;

  state:
    | "SUSPECTED"
    | "CONFIRMED"
    | "RESOLVED"
    | "UNKNOWN";

  affectedWaterBodyRefs?: string[];
  sourceRefs: string[];
}
```

Rules:

1. Water-quality observation is distinct from a public-health advisory.
2. SmartAIHub MUST NOT invent `boil water` / `do not drink` instructions from an LLM or a single non-authoritative measurement.
3. Authority-issued drinking-water advisories enter official-alert/instruction provenance.
4. Floodwater presence MUST NOT automatically imply a specific chemical/biological contaminant.
5. Wastewater/sewer overflow may increase hazard context without inventing exposure or illness.
6. Units/parameter methods/detection limits MUST be retained where relevant.
7. Sample location/time and laboratory/field method matter to interpretation.
8. Potable-water service state SHOULD be available to Feed/local utility search.
9. Water distribution points MAY be ranked by current availability/reachability without implying water quality unless verified.
10. Sensitive facility-security details MUST not leak through public water infrastructure layers.
11. Water-quality time series MAY have different freshness/latency expectations from water level.
12. Post-flood recovery Feed MAY surface restoration/quality updates after inundation recedes.

---

## Pass 44 — Canonical Concept Registry, Provider Code Mapping and Taxonomy Versioning

### Gap

Global providers encode the same concepts differently. `flood`, `river flood`, `flash flood`, `overflow`, `high water`, local hazard codes, road-state codes, warning levels and sensor parameter names can collide or drift.

### Patch

Add:

```ts
interface CanonicalConcept {
  conceptRef: string;
  conceptType:
    | "HAZARD"
    | "OBSERVED_VARIABLE"
    | "WARNING_LEVEL"
    | "ROAD_STATE"
    | "FACILITY_STATE"
    | "SOURCE_CLASS"
    | "OTHER";

  canonicalCode: string;
  canonicalDefinition: string;

  parentConceptRef?: string;
  effectiveFrom: string;
  effectiveUntil?: string;
  version: string;
}

interface SourceCodeMapping {
  mappingRef: string;

  providerRef: string;
  sourceSchemaVersion: string;

  sourceField?: string;
  sourceCode: string;

  canonicalConceptRef: string;

  relation:
    | "EXACT"
    | "BROADER"
    | "NARROWER"
    | "APPROXIMATE"
    | "UNMAPPED";

  effectiveFrom: string;
  effectiveUntil?: string;

  reviewState:
    | "AUTOMATIC_VALIDATED"
    | "REVIEWED"
    | "REQUIRES_REVIEW";
}
```

Requirements:

1. Source code mapping is versioned by provider/schema version.
2. `APPROXIMATE` mapping MUST NOT silently gain exact semantic meaning.
3. Unknown code MUST remain unmapped rather than defaulting to a plausible hazard.
4. LLMs MAY propose mappings but high-impact mappings require deterministic validation/review policy.
5. Translation/localized labels derive from canonical concepts while original provider terminology remains accessible.
6. Taxonomy changes MUST trigger bounded reclassification only where semantically required.
7. Canonical concept identity is distinct from UI label.
8. Regional Packs SHOULD ship tested source-code mappings.
9. Public API/MCP SHOULD expose stable canonical codes plus original source codes when provenance is requested.
10. Warning-level colors alone MUST NOT be used as semantic mapping.
11. Provider schema drift can invalidate mappings and suspend affected classification.
12. Concept hierarchy MAY support broad Feed filters without erasing precise original classification.

---

## Pass 45 — Jurisdiction Authority Matrix, Cross-Border Hazards and Boundary Ambiguity

### Gap

A river, storm, plume, wildfire or evacuation route may cross national/provincial boundaries. Multiple agencies may issue warnings for overlapping areas. Administrative boundaries can also be disputed, revised or represented differently by providers.

### Patch

Add:

```ts
interface JurisdictionAuthorityBinding {
  bindingRef: string;

  authorityRef: string;
  authorityType: string;

  jurisdictionGeometryRef?: string;
  jurisdictionCodeRefs?: string[];

  capability:
    | "OFFICIAL_WARNING"
    | "HYDROLOGY"
    | "WEATHER"
    | "ROAD_CONTROL"
    | "EVACUATION"
    | "FACILITY"
    | "OTHER";

  hazardOrDomainRefs?: string[];

  effectiveFrom: string;
  effectiveUntil?: string;

  priorityOrPrecedencePolicyRef?: string;
}

interface JurisdictionAuthorityMatrix {
  focusGeometryRef: string;
  bindings: JurisdictionAuthorityBinding[];
  unresolvedConflicts: string[];
  generatedAt: string;
}
```

Requirements:

1. Geography alone MUST NOT determine authority; authority capability/domain/scope must be explicit.
2. Cross-border upstream data MAY be relevant without granting the foreign source authority over downstream local evacuation policy.
3. Conflicting official warnings from different competent jurisdictions remain separate claims until precedence/scope rules resolve them.
4. Public UI SHOULD identify issuing authority/jurisdiction for material official instructions.
5. Disputed/ambiguous boundaries MUST not be silently "resolved" by SmartAIHub as a political/legal determination.
6. Where provider boundary representations differ, SmartAIHub MAY retain multiple boundary versions with neutral provenance.
7. Global search/place naming MUST use tenant/product localization policy without changing canonical source claims.
8. Cross-border warning/impact geometry MAY intersect the user's focus regardless of administrative border.
9. Jurisdiction pack MUST define emergency numbers and authority bindings independently.
10. Data residency/legal restrictions MAY limit cross-border sharing without deleting source provenance.
11. Route/mobility operations crossing borders MUST expose customs/checkpoint/restriction data when available, not assume free passage.
12. Authority conflict itself MAY be a user-visible uncertainty/coverage condition.

---

## Pass 46 — Exercise, Drill, Test and Training Isolation

### Gap

R1.3 isolates simulations, but operational organizations also conduct drills using real interfaces, users, maps and sometimes real notification infrastructure. A drill is not the same as a hypothetical model simulation.

### Patch

Add:

```ts
interface ExerciseEnvironment {
  exerciseRef: string;

  mode:
    | "EXERCISE"
    | "DRILL"
    | "TRAINING"
    | "TEST";

  organizerRef: string;
  startsAt: string;
  endsAt?: string;

  participantScopeRefs: string[];
  permittedChannelRefs: string[];

  state:
    | "PLANNED"
    | "ACTIVE"
    | "ENDED"
    | "CANCELLED";
}

interface ExerciseEventBinding {
  exerciseRef: string;
  exerciseEntityRef: string;
  copiedFromLiveRef?: string;
  synthetic: boolean;
}
```

Mandatory rules:

1. Exercise entities use a namespace separate from live operational incidents/alerts/tasks.
2. TEST/EXERCISE messages MUST be visibly and machine-readably labeled.
3. Public production notification channels MUST be blocked by default for exercise messages.
4. Use of real delivery channels requires explicit authorized test policy and recipient scope.
5. Exercise data MUST NOT affect public Feed, real provider reputation, citizen trust or operational analytics.
6. Exercise participants MAY use the real UI while a persistent exercise banner/state is visible.
7. Copying a live incident into training produces a snapshot/derivative, never a writable alias to live truth.
8. Ending an exercise cannot resolve/close similarly named live incidents.
9. Exercise exports/replays retain exercise classification.
10. External agents/MCP clients must receive exercise context to prevent cross-environment side effects.
11. Billing/credit policy MAY distinguish exercises, but economic records MUST not contaminate real emergency subsidy/payout ledgers.
12. Exercise environment deletion/retention follows training/audit policy independently of live incident retention.

---

## Pass 47 — Warning Delivery Assurance, Channel Reachability and Dissemination Diagnostics

### Gap

Spec 260 owns notifications/communications and Spec 262 MUST continue to reuse that authority. However, geospatial emergency intelligence needs to know whether a critical warning was *attempted*, *accepted by a channel*, *delivered/acknowledged when measurable*, and whether important geographic audiences may be unreachable.

### Patch

Add projection-level diagnostics:

```ts
interface WarningDeliveryAssessment {
  warningRef: string;
  audienceOrAreaRef: string;

  channels: WarningChannelDeliveryState[];

  estimatedCoverageState:
    | "GOOD"
    | "PARTIAL"
    | "POOR"
    | "UNKNOWN";

  knownCoverageGaps: string[];
  assessedAt: string;
}

interface WarningChannelDeliveryState {
  channelRef: string;

  state:
    | "NOT_REQUESTED"
    | "QUEUED"
    | "SENT_TO_PROVIDER"
    | "PROVIDER_ACCEPTED"
    | "DELIVERED_WHEN_MEASURABLE"
    | "ACKNOWLEDGED_WHEN_APPLICABLE"
    | "FAILED"
    | "UNKNOWN";

  attemptedAt?: string;
  statusAt?: string;
  failureReason?: string;
}
```

Requirements:

1. These objects are projections over the canonical notification/communications authority; they do NOT create a second notification system.
2. `PROVIDER_ACCEPTED` MUST NOT be called "delivered" unless the channel provides that evidence.
3. Lack of acknowledgement MUST NOT equal non-receipt when acknowledgement is not expected/possible.
4. Channel fallbacks MUST respect user consent, jurisdiction policy and message urgency.
5. Public safety operations SHOULD surface known warning-delivery coverage gaps to authorized operators.
6. Cell broadcast/SMS/push/email/app/integrated agency channels may have different delivery semantics.
7. Duplicate delivery across channels SHOULD preserve one canonical warning identity.
8. Correction/cancellation dissemination SHOULD target materially affected prior recipients where feasible.
9. Delivery assurance cannot prove that a recipient read/understood the instruction.
10. Multi-language delivery MUST bind translations to the same canonical alert revision.
11. During provider outage, the system SHOULD distinguish data-source failure from notification-channel failure.
12. Delivery diagnostic data may be privacy-sensitive and MUST be access controlled/aggregated appropriately.

---

## Pass 48 — Hydrological Observation Retention, Downsampling and Extremes Preservation

### Gap

Nationwide/global hydrology can accumulate billions of samples. Indefinite retention of every raw high-frequency value is expensive, but naive downsampling can erase flood peaks, threshold crossings, short-duration rainfall bursts, corrections and provenance required for later model validation/audit.

### Patch

Add:

```ts
interface ObservationRetentionProfile {
  profileRef: string;
  variableRef: string;
  sourceClass?: string;

  rawRetention?: Duration;
  validatedRetention?: Duration;

  rollups: ObservationRollupPolicy[];

  preserveMaterialEvents: boolean;
  preserveCorrectionLineage: boolean;

  legalOrScientificRetentionRef?: string;
}

interface ObservationRollupPolicy {
  afterAge: Duration;
  interval: Duration;

  statistics: Array<
    | "MIN"
    | "MAX"
    | "MEAN"
    | "MEDIAN"
    | "SUM"
    | "COUNT"
    | "FIRST"
    | "LAST"
  >;

  preserveThresholdCrossings: boolean;
  preserveExtremaTimestamp: boolean;
}

interface HydrologicalSummaryProduct {
  summaryRef: string;
  variableRef: string;
  stationOrAreaRef: string;
  window: TimeWindow;

  statistics: Record<string, number>;
  extremaTimestamps?: Record<string, string>;

  sourceRevisionScopeRef: string;
  generatedAt: string;
}
```

Rules:

1. Raw/validated/derived data retention classes MUST be explicit.
2. Rollup MUST preserve maxima/minima needed for flood/drought/extreme analysis.
3. Rainfall accumulation MUST use variable-appropriate aggregation; averaging rainfall depth can be semantically wrong.
4. Threshold crossings and correction lineage SHOULD survive raw-detail compaction where policy requires.
5. A 15-minute peak MUST not disappear because only hourly means were retained.
6. Reprocessing capability MUST declare whether original raw granularity is still available.
7. Retention/downsampling MUST not violate provider license or statutory/scientific preservation rules.
8. Long-term analytics MUST identify which resolution/rollup product was used.
9. Data expiry MUST not break incident/notification audit manifests; referenced necessary metadata/artifacts follow protected retention rules.
10. Storage-cost policy MUST not silently delete evidence needed for active legal hold or unresolved data-quality incident.
11. Cold/archive tiers MAY be used if retrieval semantics and integrity remain defined.
12. Regional Packs MAY define variable/source-specific retention defaults but cannot weaken mandatory audit/legal policy.

---

# R1.5 Revised Priority Matrix

## P0 — interoperability and operational correctness

- CAP lifecycle/authority/reference correctness;
- OperationalEventStream idempotency/replay/gap semantics;
- Regional Pack source-code mapping and semantic registry;
- live-vs-exercise isolation;
- provider/model artifact identity for operational derived products;
- warning delivery status semantics without false "delivered" claims;
- stable reference-map vs operational-network separation;
- provider/pack WIS2/WHOS/EDR capability discovery when those integrations are enabled;
- high-frequency retention policy that preserves material extrema/corrections;
- jurisdiction/authority binding for official instructions.

## P1 — regional response capability

- evacuation network/clearance estimation;
- route-capacity / shelter-receiving / fuel constraints;
- water-quality/sanitation Feed and official-advisory integration;
- EDR trajectory/corridor use for route environmental queries;
- multi-jurisdiction authority matrix;
- model canary/rollback registry UI;
- warning geographic delivery-gap diagnostics.

## P2 — advanced coordination

- optimized mass-evacuation network simulation;
- cross-border multi-authority planning workspace;
- advanced public-health/environmental fate modeling;
- global WIS2/WHOS automated discovery at larger scale;
- adaptive multi-channel warning reach estimation.

P2 SHALL NOT block P0 source truthfulness, alert lifecycle correctness, provenance, privacy or life-safety minimum service.

---

# R1.5 Additional Acceptance Tests 321–380

321. WIS2-delivered duplicate data cannot create duplicate canonical observation solely due multiple broker/cache delivery paths.
322. WHOS observation normalizes through the same hydrology quality/provenance pipeline as a national API.
323. EDR endpoint capability is discovered before issuing an unsupported corridor query.
324. EDR corridor/trajectory query does not bypass SmartAIHub permission/provider terms.
325. EDR PubSub signal can trigger bounded fetch/reconciliation without being treated as authoritative fact payload by itself.

326. CAP `Alert` creates one canonical alert lineage scoped by sender + identifier context.
327. CAP `Update` supersedes referenced alert while preserving history.
328. CAP `Cancel` cancels only the correctly referenced lineage.
329. Restricted/private CAP message cannot enter public Feed through generic ingestion.
330. Two authority-supplied CAP language blocks remain one alert rather than two independent warnings.

331. Duplicate stream delivery does not duplicate a task/notification side effect.
332. Consumer reconnect can detect/recover missed revision range.
333. One partition's poison event does not block unrelated partitions.
334. Stream replay cannot recharge user credits or duplicate provider payout.
335. Public realtime invalidation does not expose restricted payload.

336. Individual route availability does not imply sufficient mass-evacuation corridor capacity.
337. Clearance estimate changes when a major bridge closes before evacuation completion.
338. Shelter becoming full can invalidate/revise receiving plan.
339. Contraflow cannot become active without authoritative operational state.
340. Pass-through jurisdiction demand can be included in network-capacity assumptions.

341. Operational model output retains exact artifact digest/config/runtime identity.
342. Model outside validity envelope cannot continue producing unsupported precise guidance.
343. Model canary output cannot silently become public production output.
344. Emergency rollback can pin a previous verified model artifact.
345. Historical replay still resolves retired model artifact metadata.

346. Basemap road renaming/removal does not reopen canonical official closure.
347. Operational road state survives provider feature-ID change.
348. Ambiguous provider-to-canonical conflation blocks high-risk automatic state application.
349. Original user-report geometry survives snap-to-road enrichment.
350. Provider geometry refresh can trigger bounded conflation recompute without canonical identity churn.

351. Water-quality sample is not represented as an official drinking-water advisory.
352. Official `do not drink` advisory retains issuing authority/source and lifecycle.
353. Floodwater presence does not automatically generate a specific contamination claim.
354. Wastewater overflow can influence hazard context without fabricating illness/exposure.
355. Potable-water service restoration can update Feed/local utility independently of flood-water-level trend.

356. Unknown provider hazard code remains unmapped rather than guessed.
357. Approximate code mapping cannot masquerade as exact semantics.
358. Provider schema version change can invalidate/suspend old source-code mapping.
359. Canonical hazard UI label can change language without changing canonical concept identity.
360. Original provider code remains retrievable for provenance.

361. Cross-border upstream data can affect downstream impact without granting foreign provider local evacuation authority.
362. Overlapping official warnings retain distinct issuing jurisdiction/authority.
363. Disputed boundary difference is not silently resolved as a political/legal conclusion.
364. Authority matrix can represent different agencies for weather warning, road closure and evacuation.
365. Cross-border route does not assume checkpoint/border passage is available.

366. Exercise alert cannot enter public live Feed.
367. Exercise notification is blocked from public production channel by default.
368. Exercise using copied live incident cannot mutate original live incident.
369. External MCP client receives exercise context and cannot accidentally write live state.
370. Ending exercise does not resolve similarly named live emergency.

371. Notification-provider acceptance is not mislabeled as end-user delivery.
372. Missing acknowledgement is not treated as failed delivery when acknowledgement is unsupported.
373. Correction/cancel delivery can be related to prior canonical warning recipients where policy permits.
374. Delivery-assessment data cannot expose sensitive individual recipient status publicly.
375. Multi-channel duplicate warning remains one canonical alert.

376. Hourly rollup preserves a short 15-minute flood peak through MAX/extrema timestamp policy.
377. Rainfall cumulative variable uses semantically correct rollup instead of naive averaging.
378. Correction lineage survives raw-detail compaction where retention policy requires.
379. Legal hold prevents deletion even when ordinary telemetry retention expires.
380. Integrated WIS2/CAP/stream + evacuation + model registry + water-quality + exercise + delivery + retention scenario passes end to end.

---

# R1.5 Mandatory Integrated Scenarios

## Scenario Y — Cross-border WIS2/WHOS river event

SmartAIHub subscribes to a permitted WIS2/WHOS hydrological feed for an upstream basin in another country. The same observation is surfaced through more than one broker/cache path. Stream deduplication produces one canonical observation. The observation affects downstream impact reasoning, but the foreign source does not acquire authority to issue evacuation instructions in the downstream country. A local authority later issues a CAP warning; SmartAIHub binds it to the correct jurisdiction/authority and Feed focus.

## Scenario Z — CAP update/cancel during multi-channel dissemination

An authority sends an initial bilingual CAP alert, later updates the affected polygon and instruction, then cancels one alert lineage. SmartAIHub keeps one multilingual canonical lineage, invalidates old Feed/Map projections, distributes corrections through canonical notification infrastructure, distinguishes provider acceptance from recipient delivery, and preserves replay of what users saw at each revision.

## Scenario AA — Regional mass evacuation under degrading flood conditions

A province begins phased evacuation. SmartAIHub models source-zone demand, bridge bottlenecks, pass-through traffic, accessible transport, fuel availability and shelter receiving capacity. Flood forecast closes a bridge earlier than expected. Clearance estimate and movement plan are revised; an individual route still technically exists but the system does not claim the evacuation corridor has adequate capacity. Contraflow appears only after authoritative activation.

## Scenario AB — Operational model canary and reference-map drift

A new hydrology model version enters canary while the basemap/routing provider also refreshes road feature IDs/geometry. SmartAIHub preserves canonical operational edges, runs bounded conflation, prevents canary output from reaching production Feed, and retains exact model artifact/config identity. One ambiguous road binding enters review instead of automatically applying a closure to the wrong segment.

## Scenario AC — Flood recession followed by water-quality emergency

Water levels fall and roads begin reopening. A utility reports low pressure and an authority issues a drinking-water advisory after contamination concern. SmartAIHub does not mark the situation resolved merely because flood depth is decreasing. Feed shifts materiality toward potable-water status, wastewater/quality information and open water-distribution services while preserving official instruction provenance and avoiding invented contaminant claims.

## Scenario AD — Exercise plus high-frequency retention

Emergency services conduct a bilingual flood drill using real SmartAIHub UI, mock CAP messages and simulated route closures. Exercise state is isolated from live Feed/notifications and external agents. The exercise generates dense telemetry; retention rolls up noncritical history while preserving extrema, threshold crossings and audit artifacts. A similarly named real incident beginning during the drill remains fully separate.

---

# R1.5 Revised Definition of Done

Spec 262 R1.5 is DONE only when all R1.4 requirements continue to hold and:

1. WIS2/WHOS/OGC EDR integrations, when enabled, use canonical source identity, event-time and dedupe semantics.
2. CAP Alert/Update/Cancel/reference/scope/multilingual lifecycle is deterministic and auditable.
3. Realtime/event-stream delivery has explicit at-least-once, cursor, replay and gap semantics.
4. Mass movement planning distinguishes individual route feasibility from evacuation-network capacity and receiving capacity.
5. Every production safety-relevant model execution resolves to an exact registered model artifact/configuration/runtime identity.
6. Basemap/reference feature updates cannot silently alter canonical operational road/hydro truth.
7. Water quality, potable-water state and wastewater hazards are first-class but remain distinct from official public-health advisories.
8. Cross-provider codes/taxonomies resolve through versioned semantic mappings.
9. Official authority is scoped by jurisdiction/domain/capability and cross-border data relevance does not imply cross-border authority.
10. Drill/exercise/test state is technically isolated from live public operational state.
11. Warning-delivery diagnostics distinguish attempt/provider acceptance/delivery/acknowledgement according to actual channel semantics.
12. Observation retention/downsampling preserves material extrema, threshold events, corrections and protected audit lineage.
13. Acceptance tests 1–380 pass, except explicit owner-approved deferrals that cannot reduce life-safety correctness, privacy, provenance, public-warning integrity or coverage truthfulness.
14. Mandatory scenarios A–AD pass in representative normal and degraded conditions.

---

# Appendix M — R1.5 Core Object Additions

```text
EarthSystemExchangeEndpoint
EDRQueryCapability

CanonicalAlertEnvelope
AlertReference
AlertInfoProjection

OperationalStreamEvent
ConsumerCursor
StreamGapAssessment

MassMovementPlan
EvacuationNetworkState
EvacuationClearanceEstimate
ContraflowOperation

OperationalModelDefinition
ModelExecutionRecord

ReferenceFeatureConflation
OperationalNetworkBinding

WaterQualityObservation
PotableWaterServiceState
WastewaterOverflowEvent

CanonicalConcept
SourceCodeMapping

JurisdictionAuthorityBinding
JurisdictionAuthorityMatrix

ExerciseEnvironment
ExerciseEventBinding

WarningDeliveryAssessment
WarningChannelDeliveryState

ObservationRetentionProfile
ObservationRollupPolicy
HydrologicalSummaryProduct
```

---

# Appendix N — R1.5 Global Interoperability Profile

Preferred/recognized standards and frameworks now include:

```text
WMO Information System 2.0 (WIS2)
WMO Hydrological Observing System (WHOS)
OGC API — Environmental Data Retrieval (EDR) 1.2
OGC API — EDR Part 2 Publish-Subscribe Workflow
OASIS Common Alerting Protocol (CAP) 1.2
OGC SensorThings API
WaterML 2.0 Parts 1–3
OGC API Features
OGC API Tiles
STAC API
NetCDF
GRIB2
Zarr
GeoParquet
```

Standards adoption MUST NOT flatten provider-specific legal, quality, authority or scientific semantics.

---

# Appendix O — R1.5 Research References for Implementation Revalidation

These references are research anchors and MUST be rechecked during implementation/provider onboarding:

- WMO Information System (WIS/WIS2): https://wmo.int/activities/wmo-information-system-wis
- WIS2 operational updates: https://wmo.int/media/news/wis2-operational-newsletter-no3
- WMO Hydrological Observing System (WHOS): https://wmo.int/activities/wmo-hydrological-observing-system-whos
- OGC API — Environmental Data Retrieval: https://www.ogc.org/standards/ogcapi-edr/
- OGC API — EDR 1.2: https://docs.ogc.org/is/19-086r9/19-086r9.html
- OASIS Common Alerting Protocol 1.2: https://docs.oasis-open.org/emergency/cap/v1.2/CAP-v1.2.html
- FEMA Federal Evacuation Support Annex: https://www.fema.gov/sites/default/files/documents/fema_rd_federal-evacuation-support-annex_042025.pdf
- FEMA Evacuation and Shelter-in-Place Planning Considerations: https://www.fema.gov/sites/default/files/2020-07/planning-considerations-evacuation-and-shelter-in-place.pdf

---

# R1.5 Final Principle

> A global emergency intelligence platform must not only know **what is happening**. It must know **which authority said it, which revision supersedes it, how it arrived, whether a stream missed anything, whether a route can carry the population that must move, whether a model is approved for this place and horizon, whether the warning actually reached its intended channels, and whether long-term data retention still preserves the short-lived extreme that mattered most**.

---

# R1.6 — Fifth Twelve-Pass Gap Review / 60-Pass Cumulative Hardening

R1.6 is a fifth independent twelve-pass review over the complete R1.5 specification. This review intentionally targets infrastructure and data-quality gaps that are easy to miss after the functional architecture already appears complete: metadata discovery, provenance exchange, Earth-observation quality, provider-transition comparability, numerical conflict, scale/resampling semantics, offline field synchronization, disaster recovery, credential lifecycle, emergency configuration governance, cognitive accessibility, and regression/conformance evidence.

All fixes below are normative. Spec 260 remains implemented and unmodified. Where R1.6 is more specific than R1.0–R1.5, R1.6 controls for Spec 262 implementation.

## R1.6 Review Ledger

| New pass | Cumulative pass | Review lens | Gap found | R1.6 remediation |
|---|---:|---|---|---|
| 1 | 49 | Metadata discovery/provenance interoperability | Source Registry existed but lacked a standard discovery/catalog representation and interoperable provenance exchange | Added GeospatialResourceCatalog, OGC API Records/STAC/W3C PROV alignment |
| 2 | 50 | Earth-observation quality | Flood imagery/remote sensing lacked first-class acquisition geometry, cloud/layover/shadow, processing level and quality-mask semantics | Added RemoteSensingAcquisition and ObservationQualityMask |
| 3 | 51 | Provider transition/harmonization | Fallback/replacement providers could be semantically equivalent but numerically biased or differently referenced | Added ProviderTransitionAssessment and MeasurementHarmonizationProfile |
| 4 | 52 | Numerical source conflict | Multiple sensors/sources could disagree with no explicit numerical conflict/redundancy reconciliation contract | Added ObservationConflictSet and RedundancyAssessment |
| 5 | 53 | Spatial scale/resampling | Raster/vector products with different resolution/support could be overlaid or aggregated into false precision | Added SpatialSupportDescriptor and ResamplingLineage |
| 6 | 54 | Offline field synchronization | Offline package existed, but offline citizen/responder writes, media upload, duplicate retry and conflict merge were incomplete | Added FieldOutbox/OfflineSyncSession contracts |
| 7 | 55 | Business continuity / disaster recovery | Provider fallback was strong, but SmartAIHub's own geo/hydrology control-plane and stores lacked explicit recovery objectives and failover drills | Added GeoContinuityPlan and RecoveryReadinessProfile |
| 8 | 56 | Credential/session lifecycle | API-key protection existed but rotation, expiry, scope downgrade, dual-key transition and auth-failure containment were not explicit | Added ProviderCredentialBinding lifecycle |
| 9 | 57 | Feature flag / kill-switch governance | Kill switches existed but lacked owner, expiry, dependency checks, fail-open/closed semantics and stale-emergency-override cleanup | Added EmergencyFeatureControl |
| 10 | 58 | Cognitive/plain-language accessibility | TH/EN and technical accessibility were strong, but high-stress/plain-language/pictogram comprehension requirements were incomplete | Added SafetyMessagePresentationProfile |
| 11 | 59 | Provenance scalability/replay bundles | Rich lineage could grow without bound and become difficult to query/replay efficiently | Added compact LineageBundle / ProvenanceIndex strategy |
| 12 | 60 | Conformance/regression evidence | Acceptance tests were broad but lacked canonical golden datasets and cross-adapter/model deterministic regression corpus | Added GeospatialConformanceCorpus and ReleaseEvidenceBundle |

---

## Pass 49 — Geospatial Resource Catalog and Interoperable Provenance

### Gap

Spec 262 has a `SourceRegistry`, provider contracts, STAC support and deep provenance, but a global platform also needs a discoverable catalog describing datasets, services, models, styles, tiles, assets and processing products. Without this layer, new Regional Packs can become dependent on manual provider-specific discovery and internal-only metadata.

### Patch

Add:

```ts
interface GeospatialResourceCatalogRecord {
  catalogRecordRef: string;

  resourceRef: string;
  resourceType:
    | "DATASET"
    | "SERVICE"
    | "API"
    | "FEATURE_COLLECTION"
    | "COVERAGE"
    | "TILESET"
    | "STAC_COLLECTION"
    | "MODEL"
    | "PROCESS"
    | "STYLE"
    | "CODE_LIST"
    | "DOCUMENT"
    | "OTHER";

  title: string;
  description?: string;

  providerRef: string;
  licenseOrTermsRef?: string;

  spatialExtentRef?: string;
  temporalExtent?: TimeWindow;

  variableOrConceptRefs?: string[];
  accessLinks: CatalogAccessLink[];

  updateFrequency?: string;
  freshnessExpectationRef?: string;

  schemaOrProfileRefs?: string[];
  createdAt?: string;
  modifiedAt?: string;

  version?: string;
}

interface CatalogAccessLink {
  rel: string;
  hrefRef: string;
  mediaType?: string;
  protocol?: string;
}
```

Add interoperable provenance mapping:

```ts
interface InteroperableProvenanceBinding {
  internalEntityRef: string;

  provEntityRef?: string;
  provActivityRefs?: string[];
  provAgentRefs?: string[];

  sourceCatalogRecordRefs: string[];

  exportProfile:
    | "INTERNAL"
    | "W3C_PROV"
    | "STAC"
    | "OGC_RECORD";
}
```

Requirements:

1. SmartAIHub SHOULD be able to expose/import selected metadata through **OGC API — Records** compatible concepts.
2. Earth-observation assets SHOULD be catalogable as STAC Items/Collections where appropriate.
3. Internal provenance MAY map to **W3C PROV-O/PROV-DM** concepts without requiring the internal database to use RDF.
4. Catalog metadata MUST NOT be confused with authoritative real-time observations.
5. Search/discovery freshness is separate from dataset operational freshness.
6. Catalog records MUST preserve provider/license/access constraints.
7. A resource being discoverable does NOT imply permission to ingest, redistribute, machine-analyze or cache it.
8. Catalog version/deprecation state MUST be auditable.
9. One logical resource MAY have several access links/protocols.
10. Provider discovery automation MAY propose catalog records but cannot auto-admit a source to production.
11. Catalog search SHOULD support spatial, temporal, variable/concept and provider filters.
12. Catalog metadata SHOULD identify whether resource access is public, authenticated, tenant-scoped or restricted.
13. Deleted/retired source resources MUST remain referenceable historically where audit policy requires.
14. Regional Packs SHOULD declare their catalog-resource dependencies rather than embed opaque URLs throughout application code.

Research alignment:

- OGC API — Records Part 1: Core provides modern catalog/metadata discovery.
- STAC provides a standard catalog structure for spatiotemporal assets and associated metadata/assets.
- W3C PROV provides interoperable concepts for entities, activities and agents.

---

## Pass 50 — Remote-Sensing Acquisition Geometry, Quality Masks and Processing Provenance

### Gap

Flood extent and remote-sensing observation were supported, but imagery-derived products can have cloud obstruction, terrain/radar shadow, layover, low coherence, poor look angle, mixed pixels, vegetation/urban limitations, sensor saturation or post-processing artifacts.

A remote-sensing "no flood detected" result without acquisition-quality context can be dangerously misleading.

### Patch

Add:

```ts
interface RemoteSensingAcquisition {
  acquisitionRef: string;

  platformRef: string;
  instrumentRef: string;
  sensorType:
    | "OPTICAL"
    | "SAR"
    | "RADAR"
    | "LIDAR"
    | "THERMAL"
    | "MICROWAVE"
    | "OTHER";

  acquiredAt: string;
  processingAvailableAt?: string;

  footprintRef: string;

  spatialResolution?: number;
  spatialResolutionUnit?: string;

  viewGeometryRef?: string;
  orbitOrPassRef?: string;

  sourceAssetRefs: string[];
  stacItemRef?: string;
}

interface ObservationQualityMask {
  qualityMaskRef: string;
  acquisitionRef: string;

  coverageGeometryRef: string;

  qualityClasses: Array<
    | "VALID"
    | "CLOUD"
    | "CLOUD_SHADOW"
    | "SAR_SHADOW"
    | "LAYOVER"
    | "LOW_COHERENCE"
    | "NO_DATA"
    | "SATURATED"
    | "MIXED_PIXEL"
    | "UNCERTAIN"
    | "OTHER"
  >;

  maskArtifactRef?: string;
  methodRef?: string;
}

interface RemoteSensingProcessingLineage {
  outputProductRef: string;

  acquisitionRefs: string[];
  processorRef: string;
  processorVersion: string;

  processingLevel?: string;
  algorithmConfigurationRef?: string;

  qualityMaskRefs: string[];

  generatedAt: string;
}
```

Requirements:

1. `NO_DETECTION` MUST remain distinct from `VALID_OBSERVATION_OF_NO_FLOOD`.
2. Areas obscured by cloud/shadow/layover/no-data MUST be represented explicitly.
3. Optical and SAR flood products MAY have different failure modes and MUST not be treated as interchangeable without validation.
4. Acquisition time and processing latency MUST remain visible in operational detail.
5. Flood-change comparison MUST compare compatible acquisition/processing products or disclose limitations.
6. Reprocessed imagery MUST create a new processing revision rather than overwrite provenance.
7. Spatial resolution MUST be retained.
8. Quality mask MUST propagate into derived exposure statistics.
9. A flood polygon intersecting an invalid-quality mask cannot be treated as complete coverage.
10. Provider-supplied cloud/quality masks SHOULD be retained where available.
11. STAC EO/SAR/View/Raster/Processing metadata SHOULD be mapped when relevant.
12. A derived image thumbnail/screenshot MUST NOT replace source scientific asset provenance.
13. Public map MAY simplify quality display, but AI/operational analysis MUST retain it.
14. Remote-sensing confidence MUST not be inflated because several products are derived from the same underlying acquisition.

---

## Pass 51 — Provider Transition, Measurement Harmonization and Cross-Calibration

### Gap

Spec 262 supports fallback/replacement providers, but a replacement provider may report the same conceptual variable with a different datum, calibration, sensor placement, processing method, aggregation interval or bias.

Failover that preserves schema but changes numeric meaning can silently corrupt trends.

### Patch

Add:

```ts
interface ProviderTransitionAssessment {
  transitionRef: string;

  capabilityRef: string;
  fromProviderRef: string;
  toProviderRef: string;

  overlapWindow?: TimeWindow;

  semanticCompatibility:
    | "EQUIVALENT"
    | "COMPATIBLE_WITH_TRANSFORM"
    | "PARTIAL"
    | "NOT_COMPARABLE"
    | "UNKNOWN";

  measurementHarmonizationRef?: string;

  approvedForAutomaticFailover: boolean;
  reasonCodes: string[];
}

interface MeasurementHarmonizationProfile {
  harmonizationRef: string;

  variableRef: string;

  sourceARef: string;
  sourceBRef: string;

  unitTransformRef?: string;
  datumTransformRef?: string;
  biasCorrectionRef?: string;
  timeAggregationTransformRef?: string;

  validGeographyRef?: string;
  validWindow?: TimeWindow;

  verificationMetricRefs: string[];
  version: string;
}
```

Requirements:

1. Provider failover MUST evaluate semantic compatibility, not only endpoint availability.
2. Water levels using different vertical datums MUST NOT be stitched into one trend without a validated transform.
3. Provider forecast products with different accumulation windows/resolution MUST not be naively compared.
4. Overlap/cross-calibration period SHOULD be used before automatic replacement where practical.
5. A bias correction is versioned derived processing, not raw evidence mutation.
6. `NOT_COMPARABLE` providers MAY still coexist as separate evidence.
7. Automatic failover SHOULD stop at `PARTIAL/UNKNOWN` for high-risk quantitative guidance unless policy allows a safe degraded representation.
8. Provider replacement MUST preserve historical source attribution.
9. Feed SHOULD avoid displaying an apparent sudden jump caused only by source transition.
10. Source-transition markers SHOULD be visible in operational diagnostics.
11. Model input pipelines MUST know when a source change alters statistical characteristics.
12. Regional Pack upgrades SHOULD include provider-transition compatibility evidence.

---

## Pass 52 — Numerical Conflict Sets, Redundant Sensors and Source Correlation

### Gap

Multiple sources may measure nominally the same variable at the same location/time and disagree. Simple averaging or "most recent wins" can hide instrument failure, local gradients, different datums or correlated upstream feeds.

### Patch

Add:

```ts
interface ObservationConflictSet {
  conflictSetRef: string;

  variableRef: string;
  targetFeatureRef: string;
  eventTimeWindow: TimeWindow;

  observationRefs: string[];

  conflictType:
    | "VALUE_DIVERGENCE"
    | "DATUM_MISMATCH"
    | "TIME_ALIGNMENT"
    | "LOCATION_MISMATCH"
    | "QUALITY_CONFLICT"
    | "SOURCE_DEPENDENCE"
    | "UNKNOWN";

  state:
    | "OPEN"
    | "EXPLAINED"
    | "RESOLVED"
    | "UNRESOLVED";

  selectedOperationalObservationRef?: string;
  reasonCodes: string[];
}

interface RedundancyAssessment {
  assessmentRef: string;
  observationRefs: string[];

  independence:
    | "INDEPENDENT"
    | "PARTIALLY_DEPENDENT"
    | "SAME_UPSTREAM_SOURCE"
    | "UNKNOWN";

  agreementState:
    | "AGREE"
    | "MINOR_DIFFERENCE"
    | "MATERIAL_CONFLICT"
    | "NOT_COMPARABLE";
}
```

Rules:

1. Two APIs backed by the same upstream station MUST NOT count as two independent confirmations.
2. The system MUST not average measurements until units, datum, support, time and semantics are comparable.
3. Material numerical conflict SHOULD be surfaced to operational reasoning.
4. Outlier rejection MUST retain the rejected observation and reason.
5. "Most recent" is not automatically "most accurate".
6. Official source precedence MAY influence operational selection but does not erase contradictory evidence.
7. Redundant physical sensors at one site MAY improve resilience but require independent sensor identity.
8. Conflict state MAY lower quantitative confidence while allowing qualitative warning continuity.
9. AI MAY explain conflicts but MUST NOT invent reconciliation parameters.
10. Conflict resolution/reselection MUST be revisioned.
11. Recovered sensor should re-enter selection through quality/consistency checks.
12. Public UX MAY simplify conflicts but MUST not present a falsely exact consensus.

---

## Pass 53 — Spatial Support, Resolution, Resampling and Aggregation Semantics

### Gap

A point gauge, 1-km weather grid, 10-m flood raster, administrative-area statistic and road-segment state describe different spatial supports. Overlaying them visually does not make them equivalent.

### Patch

Add:

```ts
interface SpatialSupportDescriptor {
  supportRef: string;

  supportType:
    | "POINT"
    | "LINE"
    | "POLYGON"
    | "GRID_CELL"
    | "PIXEL"
    | "VOLUME"
    | "ADMIN_AREA"
    | "NETWORK_SEGMENT"
    | "MOVING_FOOTPRINT"
    | "OTHER";

  nominalResolution?: number;
  resolutionUnit?: string;

  supportGeometryRef: string;

  representativenessNotes?: string[];
}

interface ResamplingLineage {
  outputRef: string;

  inputRef: string;

  sourceSupportRef: string;
  targetSupportRef: string;

  method:
    | "NEAREST"
    | "BILINEAR"
    | "CUBIC"
    | "AREA_WEIGHTED"
    | "MAX"
    | "MIN"
    | "MEAN"
    | "SUM"
    | "MAJORITY"
    | "NETWORK_INTERSECTION"
    | "OTHER";

  methodVersion?: string;
  generatedAt: string;
}
```

Requirements:

1. Spatial resolution/support MUST be preserved through normalization.
2. Upsampling a coarse forecast MUST NOT create additional physical information or false local precision.
3. A grid value sampled at a point MUST be labeled as grid-derived, not point observation.
4. Area-weighted aggregation MUST retain source support and method.
5. Maximum/peak-preserving resampling MAY be preferable for some hazard layers; semantics must be variable-specific.
6. Categorical hazard class MUST NOT use inappropriate continuous interpolation.
7. Administrative-area statistics MUST NOT be inferred to apply uniformly to each household/location.
8. Route-risk intersection SHOULD consider source resolution/support when assigning edge risk.
9. Exposure intersection with coarse rasters MUST propagate positional/resolution uncertainty.
10. Comparisons across resolutions SHOULD either normalize to a documented common support or disclose mismatch.
11. Map rendering simplification/tiling MUST not alter canonical analysis resolution.
12. Low-zoom aggregation must be visually useful without becoming new authoritative fine-grained facts.

---

## Pass 54 — Offline Field Outbox, Resumable Media and Sync Conflict Reconciliation

### Gap

Spec 262 supports Offline Situation Packages, but field users may also create reports, photos, route observations, acknowledgements or task updates while offline. These writes need durable local intent, resumable upload and idempotent reconciliation when connectivity returns.

### Patch

Add:

```ts
interface FieldOutboxRecord {
  localOperationId: string;

  actorOrDeviceRef: string;
  operationType: string;

  localCreatedAt: string;
  clientSequence: number;

  targetCanonicalRef?: string;
  baseRevisionRef?: string;

  payloadRef: string;
  mediaUploadRefs?: string[];

  state:
    | "PENDING"
    | "UPLOADING"
    | "ACCEPTED"
    | "CONFLICT"
    | "REJECTED"
    | "SUPERSEDED";

  retryCount: number;
}

interface OfflineSyncSession {
  syncSessionRef: string;

  deviceRef: string;
  startedAt: string;

  serverCursorBefore?: string;
  serverCursorAfter?: string;

  uploadedOperationIds: string[];
  downloadedRevisionRefs: string[];

  conflictRefs: string[];
}

interface OfflineWriteConflict {
  conflictRef: string;

  localOperationRef: string;
  serverRevisionRef?: string;

  conflictType:
    | "STALE_BASE"
    | "TARGET_RETIRED"
    | "DUPLICATE"
    | "INCOMPATIBLE_STATE"
    | "PERMISSION_CHANGED"
    | "OTHER";

  resolution:
    | "AUTO_REBASED"
    | "MERGED"
    | "LOCAL_REJECTED"
    | "SERVER_REJECTED"
    | "HUMAN_REVIEW"
    | "UNRESOLVED";
}
```

Rules:

1. Client retry MUST use stable `localOperationId` to avoid duplicate reports/tasks.
2. Offline local clock is not automatically authoritative event time.
3. Server receive time and client capture/create time MUST both be retained.
4. Permission/restriction changes while offline MUST be revalidated on sync.
5. Stale task-state update MUST not overwrite a newer server state without state-machine validation.
6. Media upload SHOULD be resumable/chunked where supported, with content hash.
7. Incomplete media upload MUST not block acceptance of minimum critical structured report when policy permits.
8. Device queue corruption MUST not silently replay malformed operations.
9. Sync must be restart-safe.
10. Conflict resolution MUST preserve both local intent and current canonical state for audit.
11. Offline community report still passes abuse/provenance/verification rules after sync.
12. Deleted/retired target must resolve through canonical alias/retirement policy.
13. A user MUST be able to see whether an offline report is still pending or accepted.
14. Exercise/scenario outboxes MUST remain isolated from live sync.

---

## Pass 55 — Geo/Hydrology Business Continuity and Disaster-Recovery Readiness

### Gap

Provider redundancy cannot compensate for failure of SmartAIHub's own storage/control plane. A regional disaster may also coincide with infrastructure/provider outages.

### Patch

Add:

```ts
interface GeoContinuityPlan {
  continuityPlanRef: string;

  capabilityRef: string;

  minimumServiceLevel:
    | "FULL"
    | "DEGRADED_READ_WRITE"
    | "DEGRADED_READ_ONLY"
    | "STATIC_CRITICAL"
    | "UNAVAILABLE";

  recoveryTimeObjective?: Duration;
  recoveryPointObjective?: Duration;

  dependencyRefs: string[];
  recoveryProcedureRef: string;

  lastExerciseAt?: string;
  lastExerciseResultRef?: string;
}

interface RecoveryReadinessProfile {
  componentRef: string;

  backupOrReplicaRefs: string[];
  restoreVerificationRef?: string;

  failoverMode:
    | "AUTOMATIC"
    | "OPERATOR"
    | "REBUILD_FROM_CANONICAL"
    | "CACHE_ONLY"
    | "NONE";

  state:
    | "READY"
    | "DEGRADED"
    | "UNVERIFIED"
    | "FAILED";
}
```

Requirements:

1. Recovery objectives MUST be capability-specific; critical alerts/intake may require tighter objectives than historical imagery.
2. PostgreSQL/PostGIS system-of-record recovery MUST be independently tested from application deploy rollback.
3. R2/archive durability does not substitute for application-level deletion/corruption recovery.
4. Derived caches/vector indexes MAY be rebuilt from canonical data when documented.
5. Control-plane failover MUST avoid two active writers violating canonical fencing/idempotency.
6. Read-only/static critical mode SHOULD remain available when safe write recovery is not yet possible.
7. Regional service failure MUST not require every unaffected geography to degrade if architecture supports isolation.
8. Backup success is insufficient; restore verification is required.
9. Encryption keys/secrets required for recovery MUST have authorized recovery/rotation procedures.
10. Recovery drills SHOULD include simultaneous external-provider degradation.
11. DR exercise MUST preserve notification/event dedupe state to avoid duplicate critical messages after restore.
12. Recovery must preserve audit/provenance/financial boundaries.
13. Jurisdiction/data-residency restrictions continue to apply during recovery.
14. Critical offline/public static safety content SHOULD be pre-positioned where lawful and useful.

---

## Pass 56 — Provider Credential, Session and Authentication Rotation Lifecycle

### Gap

Credentials are protected, but long-lived provider operations need safe rotation, expiry handling, temporary session refresh, permission-scope downgrade and compromised-key containment.

### Patch

Add:

```ts
interface ProviderCredentialBinding {
  credentialBindingRef: string;

  providerRef: string;
  credentialClass:
    | "API_KEY"
    | "OAUTH_CLIENT"
    | "OAUTH_TOKEN"
    | "SERVICE_ACCOUNT"
    | "SIGNED_REQUEST"
    | "SESSION_TOKEN"
    | "MTLS"
    | "OTHER";

  allowedOperations: string[];
  allowedGeographyRefs?: string[];

  createdAt: string;
  expiresAt?: string;

  rotationState:
    | "ACTIVE"
    | "ROTATING"
    | "GRACE"
    | "REVOKED"
    | "EXPIRED";

  secretMaterialRef: string;
}

interface ProviderAuthHealth {
  providerRef: string;

  state:
    | "HEALTHY"
    | "EXPIRING"
    | "AUTH_FAILURE"
    | "SCOPE_REDUCED"
    | "REVOKED"
    | "UNKNOWN";

  observedAt: string;
  affectedCapabilities: string[];
}
```

Rules:

1. Secret material MUST never be stored directly in ordinary provider configuration rows/logs.
2. Rotation SHOULD support overlapping old/new credentials when provider policy permits.
3. Expired/revoked credentials MUST fail only affected capabilities where possible.
4. Repeated `401/403` MUST trigger bounded auth diagnostics/circuit behavior rather than retry storms.
5. Scope downgrade MUST be treated as capability change, not generic outage.
6. Credential rotation MUST not create duplicate subscriptions/webhooks without reconciliation.
7. Short-lived tile/session tokens remain distinct from long-term secret credentials.
8. Client applications MUST not receive server-only provider credentials.
9. Credential access/audit follows minimum-necessary role boundaries.
10. Compromise/revocation event MAY require immediate provider kill switch.
11. Historic audit artifacts reference credential binding identity, never secret value.
12. Tenant-owned credentials MUST remain tenant-isolated and cannot silently fall back to another tenant's credentials.

---

## Pass 57 — Emergency Feature Controls, Kill-Switch Expiry and Configuration Change Governance

### Gap

R1.2 allows kill switches and feature flags, but emergency toggles can become dangerous if left indefinitely enabled/disabled, applied too broadly, or changed without dependency awareness.

### Patch

Add:

```ts
interface EmergencyFeatureControl {
  controlRef: string;

  targetType:
    | "PROVIDER"
    | "MODEL"
    | "FEED_LANE"
    | "MAP_LAYER"
    | "REGIONAL_PACK"
    | "DERIVED_PRODUCT"
    | "PUBLIC_ACTION"
    | "OTHER";

  targetRef: string;

  action:
    | "ENABLE"
    | "DISABLE"
    | "DEGRADE"
    | "PIN_VERSION"
    | "BLOCK_PUBLICATION";

  failBehavior:
    | "FAIL_OPEN"
    | "FAIL_CLOSED"
    | "DEGRADE";

  reason: string;
  actorRef: string;

  createdAt: string;
  expiresAt?: string;

  dependencyImpactRefs: string[];

  state:
    | "ACTIVE"
    | "EXPIRED"
    | "REVOKED"
    | "SUPERSEDED";
}
```

Requirements:

1. Emergency control changes MUST be audited.
2. Critical safety invariant controls MUST fail closed/degrade according to policy, not arbitrary operator preference.
3. Temporary emergency override SHOULD have expiry/review time unless explicitly permanent configuration.
4. Disabling a provider/model MUST invalidate/recompute affected derived products.
5. Dependency impact MUST be evaluated before broad control activation where feasible.
6. Control must not accidentally disable minimum emergency intake/public critical warnings when targeting an optional feature.
7. Config rollback and software rollback are distinct operations.
8. Stale expired emergency controls MUST not remain silently active.
9. High-impact public publication block SHOULD require appropriate authority/approval.
10. Tenant controls cannot override platform safety invariants.
11. Control state MUST be visible in operational diagnostics.
12. DR/restore MUST recover currently valid controls without reviving expired ones.

---

## Pass 58 — Plain-Language, Cognitive Accessibility and High-Stress Message Presentation

### Gap

Thai/English localization, screen-reader support and color-independent presentation are strong, but emergency users may have low literacy, cognitive overload, language limitations or only seconds to understand an instruction.

### Patch

Add:

```ts
interface SafetyMessagePresentationProfile {
  presentationProfileRef: string;

  locale: string;

  audience:
    | "GENERAL_PUBLIC"
    | "CHILD_OR_FAMILY"
    | "VISITOR"
    | "RESPONDER"
    | "COMMAND"
    | "OTHER";

  register:
    | "PLAIN"
    | "TECHNICAL"
    | "COMMAND";

  maxPrimaryInstructionLength?: number;

  pictogramRefs?: string[];
  reviewedPhraseTemplateRefs?: string[];

  accessibilityRulesRef: string;
}
```

Requirements:

1. Public life-safety instruction SHOULD lead with a concise action statement before long explanation.
2. Plain-language presentation MUST not alter legal/technical meaning.
3. Technical detail/provenance remains accessible below the primary instruction.
4. Pictograms/icons MAY supplement text but MUST NOT be the only carrier of critical meaning.
5. Color alone MUST NOT communicate severity/action.
6. Numbers/times/units MUST use locale-safe formatting while preserving value.
7. Critical phrase templates SHOULD be reviewed in Thai and English.
8. Machine translation MAY produce supporting text but MUST not replace reviewed life-safety phrases when an approved template applies.
9. Excessive Feed detail SHOULD collapse behind progressive disclosure on mobile.
10. Audio/TTS output SHOULD use the selected message-language tag and preserve numbers/place names intelligibly.
11. Users MUST not have to understand internal hazard jargon to know what action is recommended.
12. Public UX SHOULD distinguish:
    - `WHAT HAPPENED`
    - `WHO/WHERE IS AFFECTED`
    - `WHAT TO DO`
    - `WHEN`
    - `SOURCE / LAST UPDATED`
13. Unknown/uncertain action guidance SHOULD say what is known and where official instruction can be found rather than fabricate a command.
14. Language switching remains available on the critical message surface without navigating away.

---

## Pass 59 — Provenance Graph Scalability, Content-Addressed Lineage and Replay Bundles

### Gap

Spec 262 preserves very rich provenance. At nationwide/global scale, naively traversing every raw source → processing step → model → projection edge can create expensive query graphs and retention duplication.

### Patch

Add:

```ts
interface LineageBundle {
  lineageBundleRef: string;

  rootOutputRefs: string[];

  inputContentHashes: string[];
  sourceRevisionRefs: string[];

  processingStepRefs: string[];
  modelExecutionRefs?: string[];

  policyVersionRefs: string[];

  generatedAt: string;
  contentHash: string;
}

interface ProvenanceIndexEntry {
  entityOrArtifactRef: string;

  immediateParentRefs: string[];
  lineageBundleRef?: string;

  sourceClassRefs: string[];
  eventTimeRange?: TimeWindow;

  indexedAt: string;
}
```

Requirements:

1. Immediate lineage MUST remain queryable without reconstructing the entire global graph.
2. Repeated identical immutable inputs/processing manifests MAY use content-addressed deduplication.
3. Deduplication MUST respect tenant/authorization boundaries; equal hash does not grant access.
4. Audit replay SHOULD reference compact immutable LineageBundles.
5. Bundle compaction MUST NOT erase source identity, corrections, policy/model versions or uncertainty.
6. Raw evidence retention remains governed separately.
7. A bundle hash proves bundle integrity, not real-world truth.
8. Lineage indexes MUST be rebuildable from canonical audit/evidence where feasible.
9. Circular provenance dependencies are invalid and MUST be rejected.
10. Very large batch products MAY reference manifest shards rather than list millions of inputs inline.
11. Public provenance views MAY expose a safe summarized graph; authorized audit retains full references.
12. Deleting derived caches MUST not delete lineage needed by protected audit/replay.
13. Provenance query latency/size SHOULD be included in production load testing.
14. W3C PROV export MAY be generated from compact lineage without requiring the runtime store to be RDF-native.

---

## Pass 60 — Geospatial Conformance Corpus, Golden Scenarios and Release Evidence

### Gap

Spec 262 has hundreds of acceptance tests, but provider adapters, geometry algorithms and models can still regress if tests rely only on live external services or synthetic happy-path fixtures.

### Patch

Add:

```ts
interface GeospatialConformanceCorpus {
  corpusRef: string;
  version: string;

  fixtureRefs: string[];

  coverageDomains: string[];

  sourceRightsRef: string;

  releasedAt: string;
}

interface ConformanceFixture {
  fixtureRef: string;

  domain:
    | "HYDROLOGY"
    | "WEATHER"
    | "CAP"
    | "ROUTING"
    | "GEOMETRY"
    | "REMOTE_SENSING"
    | "TRANSLATION"
    | "OFFLINE_SYNC"
    | "PROVIDER_MAPPING"
    | "OTHER";

  inputManifestRef: string;
  expectedInvariantRefs: string[];

  toleranceProfileRef?: string;

  sensitive: boolean;
}

interface ReleaseEvidenceBundle {
  releaseRef: string;

  specRevision: string;

  conformanceCorpusVersion: string;

  testResultRefs: string[];
  providerContractResultRefs: string[];
  modelVerificationRefs: string[];

  securityResultRefs: string[];
  loadRecoveryResultRefs: string[];

  approvedAt?: string;
}
```

Mandatory corpus coverage SHOULD include:

- antimeridian geometry;
- mixed CRS/datum;
- reversed canal flow;
- stage/discharge rating change;
- out-of-order telemetry;
- duplicate CAP Alert/Update/Cancel;
- cloud-obscured optical flood image;
- SAR shadow/layover case;
- provider failover with biased measurement;
- sparse rural coverage;
- Thai/English negation translation;
- offline duplicate report sync;
- protected-location differencing attack;
- provider terms/credential failure;
- Map/Feed projection-revision mismatch;
- historical correction/rebuild.

Requirements:

1. Production release MUST run the applicable corpus, not only live-provider smoke tests.
2. Golden fixtures MUST be versioned and immutable within one corpus release.
3. Expected outputs SHOULD focus on safety/semantic invariants rather than brittle pixel-perfect rendering.
4. Numeric tests MUST define tolerances scientifically/operationally.
5. Provider adapters MUST pass the same canonical normalization fixtures where equivalent.
6. Model upgrade MUST re-run relevant model/derived-product fixtures.
7. Regression corpus MUST include failure/degraded cases.
8. Sensitive real incident fixtures MUST be deidentified/licensed or replaced with controlled derivatives.
9. Release evidence MUST record exact spec/corpus/provider/model versions.
10. A failing life-safety invariant blocks production promotion unless an explicit owner-approved deferral is allowed by existing non-regression policy.
11. Corpus coverage itself SHOULD be periodically reviewed as new incident lessons appear.
12. Post-incident findings SHOULD create new regression fixtures when legally/ethically possible.

---

# R1.6 Standards and Research Alignment

R1.6 adds explicit alignment with:

```text
OGC API — Records Part 1: Core
STAC Item / Catalog / Collection / API
STAC EO / SAR / View / Raster / Processing / Projection extensions as applicable
W3C PROV / PROV-O concepts
OGC Observations, Measurements and Samples
```

These standards support discovery, spatiotemporal asset metadata, remote-sensing metadata and interoperable provenance. SmartAIHub MAY map to these standards without replacing its canonical internal schemas.

---

# R1.6 Revised Priority Matrix

## P0 — hidden correctness and recovery

- Resource catalog/source metadata registry
- remote-sensing quality masks/acquisition provenance
- provider-transition semantic compatibility
- numerical observation-conflict handling
- spatial support/resampling lineage
- offline FieldOutbox idempotency/reconciliation
- capability-specific recovery readiness
- provider credential rotation/expiry behavior
- emergency feature-control expiry/governance
- plain-language critical message presentation
- compact provenance/replay bundle strategy
- release conformance corpus

## P1 — operational tooling

- catalog/OGC Records discovery UI
- provider cross-calibration dashboards
- remote-sensing quality-map overlays
- offline conflict-resolution UI
- DR exercise dashboard
- critical terminology/plain-language editor
- provenance visualizer
- conformance corpus management

## P2 — advanced automation

- automatic harmonization candidate generation
- adaptive sensor-conflict diagnostics
- automatic quality-aware remote-sensing mosaics
- automated Regional Pack metadata harvesting
- post-incident fixture generation recommendations

P2 SHALL NOT block P0 correctness, privacy, integrity, source truthfulness or recovery readiness.

---

# R1.6 Additional Acceptance Tests 381–440

381. OGC API Records-compatible resource metadata can describe a dataset without making it an admitted operational source.
382. STAC Item asset retains acquisition datetime, geometry and source asset links.
383. W3C PROV export can represent entity/activity/agent lineage without changing internal canonical IDs.
384. Retired catalog resource remains historically referenceable where retention requires it.
385. Regional Pack dependency resolves through catalog resource identity rather than opaque embedded URL only.

386. Cloud-obscured optical area is not interpreted as verified no-flood.
387. SAR shadow/layover area is represented as quality limitation.
388. Reprocessed imagery creates new processing lineage and does not overwrite previous product provenance.
389. Flood exposure statistics respect invalid/no-data quality masks.
390. Two products from the same acquisition do not count as independent corroboration.

391. Automatic failover blocks quantitative trend stitching across incompatible vertical datums.
392. Provider transition can use validated bias/datum/time aggregation transform.
393. Failover does not create a fake sudden water-level jump in Feed.
394. `NOT_COMPARABLE` fallback can remain separate evidence without forced harmonization.
395. Model input pipeline records a material provider-transition change.

396. Two APIs backed by one upstream station are recognized as dependent evidence.
397. Conflicting comparable gauges create an ObservationConflictSet rather than silent averaging.
398. Outlier rejection preserves rejected value and deterministic reason.
399. Recovered redundant sensor is quality-checked before operational reselection.
400. Public UX does not expose a falsely precise consensus when material conflict remains unresolved.

401. Upsampling 10-km forecast to 100-m map cells does not increase analytical precision.
402. Grid-derived point value remains labeled grid-derived.
403. Categorical hazard classes are not bilinearly interpolated.
404. Coarse-raster exposure intersection carries resolution uncertainty.
405. Map tile simplification does not alter canonical analytical geometry/resolution.

406. Offline repeated retry of one report produces one canonical accepted report.
407. Offline stale task update cannot overwrite newer server task state.
408. Permission revoked while device offline is revalidated at sync.
409. Partial media failure does not necessarily discard minimum critical structured report.
410. Exercise/scenario outbox cannot sync into live operational namespace.

411. Restore drill proves canonical Postgres/PostGIS data can be restored independently of code rollback.
412. Restored system does not duplicate critical notifications whose dedupe state survived recovery.
413. Read-only/static critical mode can operate while safe writes are unavailable.
414. Derived vector/search cache can be rebuilt from canonical state without becoming authority.
415. Recovery procedure continues to honor jurisdiction/data-residency restrictions.

416. Provider key rotation can overlap old/new credentials without duplicate subscription creation.
417. Expired credential degrades only the affected provider capability where architecture permits.
418. Repeated auth failure does not create retry storm.
419. Tenant-owned provider secret cannot be used by another tenant.
420. Short-lived tile session token is not stored as long-lived provider secret.

421. Emergency kill switch has actor, reason, state and expiry/review semantics.
422. Expired emergency control cannot remain silently active after restore/restart.
423. Disabling one optional forecast model does not disable emergency intake.
424. Provider disable invalidates derived products that depended on the provider.
425. Tenant feature control cannot disable platform life-safety invariants.

426. Public critical card presents primary action before technical explanation.
427. Pictogram-only warning fails accessibility validation.
428. Thai/English reviewed safety phrase preserves the same operational instruction.
429. TTS output uses correct language context and preserves critical numbers/place names.
430. User can switch language directly from critical message without losing context.

431. Immediate provenance query does not require traversing the full global lineage graph.
432. Content-addressed lineage dedupe cannot grant cross-tenant access.
433. LineageBundle preserves correction/model/policy/source references.
434. Batch product can use manifest shards without losing audit reconstructability.
435. Deleting derived cache does not delete protected replay lineage.

436. Release candidate runs versioned GeospatialConformanceCorpus.
437. Biased-provider failover fixture detects unsafe trend stitching.
438. Offline duplicate-sync fixture protects idempotency.
439. Antimeridian + CAP + hydrology + translation degraded fixtures remain part of release evidence.
440. Integrated catalog + remote sensing + harmonization + conflict + offline + DR + credential + feature-control + provenance + conformance scenario passes end to end.

---

# R1.6 Mandatory Integrated Scenarios

## Scenario AE — Remote-sensing blind spot during active flood

An optical flood product arrives with heavy cloud and cloud shadow. A SAR product arrives later with partial layover/shadow over steep terrain. SmartAIHub maps each acquisition and quality mask, avoids interpreting obscured areas as "not flooded", prevents two products derived from the same acquisition from being counted as independent evidence, and uses valid regions only for exposure statistics.

## Scenario AF — Provider transition during river rise

The primary gauge API fails while river level is rising. A fallback provider serves the same station with a different vertical datum and aggregation cadence. SmartAIHub blocks naive stitching, applies an approved harmonization profile only after validation, marks the transition, avoids a false Feed spike and preserves both original source histories.

## Scenario AG — Conflicting redundant gauges

Two independent sensors at one cross-section diverge materially while a third API mirrors one of them. SmartAIHub recognizes the mirrored API as dependent, opens an ObservationConflictSet, retains all evidence, does not average blindly, lowers quantitative confidence and allows operator/quality policy to select an operational value with full revision history.

## Scenario AH — Responder report created fully offline

A responder loses connectivity, records a road closure, photos and a task update, retries the submit several times, then reconnects after the server task has changed. The FieldOutbox syncs one road report idempotently, uploads media resumably, rejects/reconciles the stale task transition, retains local intent/audit, and clearly shows which operations were accepted or conflicted.

## Scenario AI — Regional platform recovery during external-provider degradation

A SmartAIHub regional dependency fails during a flood while one external weather provider is also degraded. Recovery enters minimum read-only/static critical mode, restores canonical state from verified backups, preserves dedupe/watch/control state, avoids duplicate warning dissemination, rebuilds derived indexes, and returns write capability only after fencing/restore verification.

## Scenario AJ — Production release blocked by hidden semantic regression

A new provider adapter and model version pass basic smoke tests but a golden fixture reveals that the new adapter interprets a vertical datum incorrectly and creates a false rising trend. The GeospatialConformanceCorpus fails the release, ReleaseEvidenceBundle records the exact failing adapter/model/spec/corpus versions, and production promotion is blocked before the defect reaches Feed or notifications.

---

# R1.6 Revised Definition of Done

Spec 262 R1.6 is DONE only when all R1.5 requirements continue to hold and:

1. Geospatial resources/services/models can be discovered and described through a versioned catalog with clear access/licensing metadata.
2. Remote-sensing products retain acquisition, processing and quality-mask metadata sufficient to avoid false no-detection interpretation.
3. Provider replacement/failover cannot silently change numerical semantics without harmonization evidence.
4. Material numerical conflicts between comparable sources remain explicit and auditable.
5. Spatial support/resolution/resampling lineage prevents false map precision.
6. Offline user/responder writes are idempotent, resumable and conflict-aware.
7. Geo/hydrology minimum service has tested recovery objectives/procedures independent of provider fallback.
8. Provider credentials support secure rotation, expiry, revocation and tenant isolation.
9. Emergency feature controls have auditable scope, dependency impact and expiry/review semantics.
10. Public critical messaging meets plain-language/high-stress cognitive accessibility rules in Thai and English.
11. Provenance remains scalable and replayable without erasing source/model/policy/correction lineage.
12. Production promotion uses a versioned geospatial conformance corpus and reproducible ReleaseEvidenceBundle.
13. Acceptance tests 1–440 pass, except explicit owner-approved deferrals that cannot reduce life-safety correctness, privacy, integrity, provenance or recovery readiness.
14. Mandatory scenarios A–AJ pass in representative normal, degraded, offline and recovery conditions.

---

# Appendix P — R1.6 Core Object Additions

```text
GeospatialResourceCatalogRecord
CatalogAccessLink
InteroperableProvenanceBinding

RemoteSensingAcquisition
ObservationQualityMask
RemoteSensingProcessingLineage

ProviderTransitionAssessment
MeasurementHarmonizationProfile

ObservationConflictSet
RedundancyAssessment

SpatialSupportDescriptor
ResamplingLineage

FieldOutboxRecord
OfflineSyncSession
OfflineWriteConflict

GeoContinuityPlan
RecoveryReadinessProfile

ProviderCredentialBinding
ProviderAuthHealth

EmergencyFeatureControl

SafetyMessagePresentationProfile

LineageBundle
ProvenanceIndexEntry

GeospatialConformanceCorpus
ConformanceFixture
ReleaseEvidenceBundle
```

---

# Appendix Q — R1.6 Research References for Implementation Revalidation

These are implementation research anchors and MUST be rechecked when building the relevant adapters/features:

- OGC API — Records Part 1: Core: https://www.ogc.org/standards/ogcapi-records/
- STAC Specification: https://stacspec.org/
- STAC Extensions registry (EO, SAR, View, Raster, Processing, Projection, etc.): https://stac-extensions.github.io/
- W3C PROV-O: https://www.w3.org/TR/prov-o/
- OGC Observations, Measurements and Samples: https://www.ogc.org/standards/om/
- Cloudflare Durable Objects control/data-plane architecture: https://developers.cloudflare.com/reference-architecture/diagrams/storage/durable-object-control-data-plane-pattern/
- Cloudflare Durable Objects data location: https://developers.cloudflare.com/durable-objects/reference/data-location/
- Cloudflare R2 durability: https://developers.cloudflare.com/r2/reference/durability/

---

# R1.6 Final Principle

> A mature emergency intelligence platform must survive not only missing data and bad weather, but also **bad metadata, obscured satellite observations, provider transitions, conflicting sensors, spatial-scale mismatch, offline field writes, platform recovery, expired credentials, stale emergency flags, cognitive overload, massive provenance graphs, and subtle semantic regressions that only a known-good corpus can expose**.

---

# R1.7 — Sixth Twelve-Pass Gap Review / 72-Pass Cumulative Hardening

R1.7 is a sixth independent twelve-pass review over the complete R1.6 specification. This review targets operational semantics that remain easy to under-specify even after extensive provider, model, hydrology and recovery hardening: freshness-based action gating, missing-data/censoring semantics, drought/low-flow/salinity intelligence, geofence/watch lifecycle, offline map/data packages, federated inter-agency exchange, platform-wide compute admission control, planned maintenance/liveness, behavioral telemetry privacy, multi-device state synchronization, non-visual spatial accessibility, and privacy-retention conflict handling.

All fixes below are normative. Spec 260 remains implemented and unmodified. Where R1.7 is more specific than R1.0–R1.6, R1.7 controls for Spec 262 implementation.

## R1.7 Review Ledger

| New pass | Cumulative pass | Review lens | Gap found | R1.7 remediation |
|---|---:|---|---|---|
| 1 | 61 | Freshness/action safety | Records carried freshness, but no explicit action gate tied allowable action classes to data age/quality | Added FreshnessPolicy and OperationalActionGate |
| 2 | 62 | Missingness/censoring/imputation | Imputed values were labeled, but gap semantics, below-detection values and trend computability were incomplete | Added MissingDataEpisode / MeasurementCensoring / ImputationRecord |
| 3 | 63 | Drought/low-flow/salinity | Hydrology enhancement remained flood-heavy and under-modeled drought, low flow, salt intrusion and supply stress | Added WaterAvailability/LowFlow/Salinity intelligence |
| 4 | 64 | Geofence/watch lifecycle | Watches existed but entry/exit/dwell/hazard-intersection transitions, versioned geometry and lifecycle were underspecified | Added GeofenceDefinition / GeofenceTransition / WatchLifecycle |
| 5 | 65 | Offline maps/data | Offline Situation Package existed but map/base-layer/package licensing, version, expiry and incremental region updates were incomplete | Added OfflineGeoPackage |
| 6 | 66 | Federated agency exchange | Cross-jurisdiction authority existed but signed minimum-necessary exchange between SmartAIHub tenants/agencies was not explicit | Added FederatedSituationExchange |
| 7 | 67 | Platform resource admission | Provider budgets existed but system-wide raster/model/graph/LLM/stream compute admission and shedding policy were incomplete | Added OperationalResourceBudget / WorkAdmissionPolicy |
| 8 | 68 | Planned maintenance/liveness | Provider outage semantics existed but planned silence, expected heartbeat and maintenance-aware health were weak | Added SourceHeartbeatProfile / MaintenanceWindow |
| 9 | 69 | Behavioral privacy | Location privacy was strong, but viewport/search/watch interaction telemetry could become sensitive behavioral tracking | Added SpatialInteractionPrivacyPolicy |
| 10 | 70 | Multi-device state | Saved views/watches existed but concurrent web/mobile/tablet state edits and conflict resolution were not explicit | Added CrossDeviceSpatialState |
| 11 | 71 | Non-visual spatial accessibility | Screen reader/keyboard/plain language existed but Map-equivalent non-visual spatial summaries and directional navigation were incomplete | Added AccessibleSpatialNarrative |
| 12 | 72 | Retention/privacy conflict | Legal hold and retention existed but deletion/privacy requests versus protected emergency evidence were not reconciled explicitly | Added PrivacyRetentionDecision |

---

## Pass 61 — Freshness-Based Operational Action Gating

### Gap

R1.6 records timestamps, freshness, source health and SLOs, but a stale road, hospital, flood-depth or water-level value can still be consumed by a downstream action unless every caller independently checks freshness.

Freshness must become an explicit policy input to operational actions.

### Patch

Add:

```ts
interface FreshnessPolicy {
  freshnessPolicyRef: string;

  dataClass:
    | "HYDRO_OBSERVATION"
    | "ROAD_STATE"
    | "FACILITY_CAPACITY"
    | "WEATHER_OBSERVATION"
    | "FORECAST"
    | "OFFICIAL_ALERT"
    | "BUSINESS_AVAILABILITY"
    | "JOURNEY_POSITION"
    | "OTHER";

  freshFor?: Duration;
  degradedAfter?: Duration;
  unusableAfter?: Duration;

  geographyOrProviderScopeRef?: string;

  allowedWhenDegraded: string[];
  prohibitedWhenStale: string[];

  policyVersion: string;
}

interface OperationalActionGate {
  actionRef: string;
  requiredDataRefs: string[];

  evaluatedAt: string;

  result:
    | "ALLOW"
    | "ALLOW_WITH_WARNING"
    | "REQUIRE_REVALIDATION"
    | "REQUIRE_HUMAN_CONFIRMATION"
    | "BLOCK";

  staleOrDegradedRefs: string[];
  reasonCodes: string[];
  policyVersion: string;
}
```

Requirements:

1. Freshness policy MUST be data-class and use-case specific.
2. A stale map marker MAY remain viewable while the same record is blocked from a safety-critical automatic action.
3. Facility capacity older than policy allows MUST NOT be used to claim space is available.
4. A stale road closure MUST NOT automatically become open.
5. A stale "road open" state MUST NOT automatically override a newer hazard restriction.
6. Action gates MUST evaluate current canonical revisions immediately before material side effects.
7. User-facing warnings SHOULD explain which input is stale and how old it is.
8. Different roles MAY have different permitted degraded actions, but tenant policy cannot violate platform safety invariants.
9. `ALLOW_WITH_WARNING` must not be used for actions explicitly classified as fail-closed.
10. Freshness policy changes MUST be versioned and auditable.
11. Offline packages MUST use package data-through timestamps in the same action-gating logic.
12. LLM/agent recommendations cannot override a deterministic `BLOCK`.

---

## Pass 62 — Missing Data, Censoring, Detection Limits and Imputation Semantics

### Gap

R1.2 states that interpolation/imputation cannot masquerade as observation, but time-series reasoning still needs explicit semantics for gaps, below-detection measurements, instrument saturation and partially missing fields.

### Patch

Add:

```ts
interface MissingDataEpisode {
  missingDataRef: string;
  targetSeriesRef: string;

  startAt: string;
  endAt?: string;

  reason:
    | "SENSOR_OFFLINE"
    | "COMMUNICATION_LOSS"
    | "MAINTENANCE"
    | "NOT_SAMPLED"
    | "PROVIDER_GAP"
    | "QUALITY_REJECTED"
    | "UNKNOWN";

  expectedSamples?: number;
  missingSamples?: number;

  impact:
    | "NONE"
    | "TREND_DEGRADED"
    | "THRESHOLD_UNKNOWN"
    | "FORECAST_INPUT_DEGRADED"
    | "UNUSABLE";
}

interface MeasurementCensoring {
  observationRef: string;

  censoringType:
    | "BELOW_DETECTION_LIMIT"
    | "ABOVE_MEASUREMENT_RANGE"
    | "SATURATED"
    | "LEFT_CENSORED"
    | "RIGHT_CENSORED"
    | "INTERVAL_CENSORED"
    | "NONE";

  limitValue?: number;
  upperLimitValue?: number;
  unit?: string;
}

interface ImputationRecord {
  imputedRef: string;

  targetSeriesRef: string;
  validAt: string;

  method:
    | "LINEAR"
    | "SPLINE"
    | "MODEL_BASED"
    | "CLIMATOLOGY"
    | "NEIGHBOR_STATION"
    | "OTHER";

  sourceObservationRefs: string[];
  uncertaintyRef?: string;

  eligibleForThresholdDecision: boolean;
}
```

Requirements:

1. `0` MUST NOT be used as a generic missing-value sentinel unless the provider contract explicitly defines it.
2. A below-detection result is not equivalent to zero.
3. Instrument saturation/upper-range exceedance MUST not be clipped silently.
4. Trend computation MUST report when gap length makes the trend unreliable.
5. Threshold crossing based solely on imputed values requires explicit policy and SHOULD be disabled for high-risk automatic actions by default.
6. Long gaps MUST terminate continuity assumptions rather than draw misleading connected trend lines.
7. Gap filling SHOULD preserve original missingness metadata.
8. Forecast/model input pipelines MUST know which values are observed versus imputed.
9. Different variables MAY require different maximum imputable gap lengths.
10. Provider sentinel codes must normalize to explicit missing/censoring semantics.
11. Feed SHOULD prefer "ข้อมูลขาดช่วง / data gap" over false trend direction when continuity is inadequate.
12. Reprocessing MAY replace an imputed value with a late observation while preserving lineage.

---

## Pass 63 — Drought, Low-Flow, Salinity Intrusion and Water-Availability Intelligence

### Gap

Spec 262's hydrology depth is strongest for floods. A global/national water-intelligence platform must also support water scarcity, low-flow stress, reservoir depletion, saline intrusion and operational water-allocation constraints.

### Patch

Add:

```ts
interface WaterAvailabilityState {
  areaOrSupplyRef: string;
  validAt: string;

  state:
    | "NORMAL"
    | "WATCH"
    | "STRESSED"
    | "SEVERE"
    | "CRITICAL"
    | "UNKNOWN";

  storageRefs: string[];
  inflowRefs: string[];
  demandOrAllocationRefs?: string[];

  sourceRefs: string[];
}

interface LowFlowObservation {
  stationOrReachRef: string;
  observedAt: string;

  discharge?: number;
  stage?: number;

  thresholdRefs: string[];
  sourceRefs: string[];
}

interface SalinityObservation {
  stationOrWaterBodyRef: string;
  observedAt: string;

  salinity?: number;
  conductivity?: number;
  chloride?: number;

  unitRefs: string[];
  sourceRefs: string[];
  qualityFlag?: string;
}

interface SalinityIntrusionAssessment {
  assessmentRef: string;
  affectedReachRefs: string[];

  tideRefs: string[];
  freshwaterFlowRefs: string[];
  salinityObservationRefs: string[];

  state:
    | "NORMAL"
    | "ADVANCING"
    | "RETREATING"
    | "MATERIAL_IMPACT"
    | "UNKNOWN";

  uncertaintyRef?: string;
}
```

Requirements:

1. Low-flow/drought intelligence MUST remain distinct from flood severity.
2. Reservoir percent-full alone MUST NOT determine drought severity.
3. Water availability SHOULD combine storage, inflow, demand/allocation and official policy where available.
4. Salinity intrusion MAY depend on tide/sea level and freshwater discharge; simple distance-to-sea is insufficient.
5. Salinity/water-quality thresholds MUST identify parameter/unit/authority.
6. Drinking-water or agricultural-use restrictions require authoritative policy/advisory provenance.
7. Drought/low-flow Feed items SHOULD use the same viewport/impact relevance framework.
8. River reaches MAY be operationally stressed before reservoirs reach critical storage.
9. Scarcity events MAY affect service availability, agriculture, industry and ecosystem context without inventing legal allocation decisions.
10. Cross-basin transfers/diversions SHOULD be represented where relevant.
11. Global Regional Packs SHOULD declare whether drought/low-flow/salinity capabilities are supported.
12. Flood recovery MUST not automatically close water-availability or salinity hazards.

---

## Pass 64 — Geofence Transitions and Watch Lifecycle Semantics

### Gap

Area/route watches exist, but a watch is more than a periodic query. It may need to express a hazard entering a watched area, a journey entering a danger zone, dwell duration, hazard expansion across a boundary, or a watch becoming obsolete after area/entity changes.

### Patch

Add:

```ts
interface GeofenceDefinition {
  geofenceRef: string;

  geometryRef: string;
  geometryRevision: string;

  subjectType:
    | "HAZARD"
    | "JOURNEY"
    | "INCIDENT"
    | "SERVICE"
    | "WEATHER_CELL"
    | "HYDRO_IMPACT"
    | "OTHER";

  transitionTypes: Array<
    | "ENTER"
    | "EXIT"
    | "DWELL"
    | "INTERSECT"
    | "COVERAGE_INCREASE"
    | "COVERAGE_DECREASE"
  >;

  hysteresisPolicyRef?: string;
}

interface GeofenceTransition {
  transitionRef: string;
  geofenceRef: string;
  subjectRef: string;

  transitionType: string;
  occurredAt: string;

  priorStateRef?: string;
  currentStateRef: string;

  geometryRevision: string;
  confidence?: string;
}

interface WatchLifecycle {
  watchRef: string;

  state:
    | "ACTIVE"
    | "PAUSED"
    | "MUTED"
    | "EXPIRED"
    | "SUSPENDED_COVERAGE_GAP"
    | "REQUIRES_REVIEW"
    | "ENDED";

  createdAt: string;
  expiresAt?: string;

  lastEvaluatedAt?: string;
  lastTriggeredAt?: string;

  geometryRevisionRef?: string;
  capabilityBindingRevision?: string;
}
```

Rules:

1. Geofence events MUST be evaluated against explicit geometry revisions.
2. Geometry update MUST NOT retroactively rewrite past enter/exit events.
3. Hysteresis prevents boundary jitter from producing repeated enter/exit notifications.
4. `DWELL` requires a duration policy.
5. A hazard polygon expanding into a watch area differs from the user/journey physically entering the hazard.
6. Watch expiry/coverage loss MUST be visible to the user.
7. A watch cannot silently remain "active" when its required provider capability disappears.
8. Watch migration after canonical split/boundary change follows stable-reference rules from R1.4.
9. Muting notifications MUST not necessarily stop watch evaluation/history.
10. High-frequency moving subjects SHOULD use efficient spatial indexing rather than LLM polling.
11. Public user watches MUST respect privacy and location-consent policy.
12. Watch transitions are idempotent/replay-safe.

---

## Pass 65 — Offline Basemap, Vector, Critical-Data and Incremental Region Packages

### Gap

`OfflineSituationPackage` covers emergency context, but field use may require usable offline geography itself: basemap/reference vectors, hydro/road networks, shelters, critical facilities and last-known alerts. Provider licenses differ substantially on offline storage.

### Patch

Add:

```ts
interface OfflineGeoPackage {
  offlineGeoPackageRef: string;

  areaRef: string;
  areaGeometryRef: string;

  createdAt: string;
  dataThrough: string;
  expiresAt?: string;

  layerRefs: string[];
  vectorAssetRefs: string[];
  rasterAssetRefs: string[];
  criticalRecordRefs: string[];

  providerRightsManifestRef: string;
  artifactManifestRef: string;

  packageVersion: string;
}

interface OfflineGeoPackageDelta {
  basePackageRef: string;
  deltaRef: string;

  fromRevision: string;
  toRevision: string;

  changedAssetRefs: string[];
  removedAssetRefs: string[];

  generatedAt: string;
}
```

Requirements:

1. Offline map/data content MUST be built only from providers that permit the intended offline storage/use.
2. Google or other restricted tile providers MUST NOT be mirrored into offline packages contrary to applicable terms.
3. Offline package UI MUST prominently show data-through/freshness.
4. Critical alerts/corrections received online SHOULD supersede stale offline package records in presentation.
5. Incremental delta update MUST verify base package revision/integrity.
6. Package may contain a minimal emergency reference map even when rich basemap rights are unavailable.
7. Offline routing capability MUST declare whether the package contains a routable network and what hazard revisions it reflects.
8. Package expiry MUST not erase legally/audit-protected incident evidence stored elsewhere.
9. Storage quota SHOULD prioritize critical data over optional imagery.
10. Package sharing/export MUST respect tenant/provider rights and sensitive-data policy.
11. Offline package language assets SHOULD include TH/EN baseline where relevant.
12. Reconnection MUST reconcile package state against current canonical revisions before a material action.

---

## Pass 66 — Federated Inter-Agency / Cross-Tenant Situation Exchange

### Gap

Spec 260/262 can integrate agencies and multi-jurisdiction authority, but there is no explicit peer-to-peer/federated exchange contract between two SmartAIHub tenants or trusted partner systems where neither side becomes the other's canonical database.

### Patch

Add:

```ts
interface FederatedSituationExchange {
  exchangeRef: string;

  senderTenantOrAgencyRef: string;
  receiverTenantOrAgencyRef: string;

  purpose:
    | "SITUATION_AWARENESS"
    | "MUTUAL_AID"
    | "EVACUATION"
    | "HYDROLOGY"
    | "ROAD_ACCESS"
    | "RESOURCE_COORDINATION"
    | "OTHER";

  dataPolicyRef: string;
  trustAgreementRef: string;

  projectionProfileRef: string;
  signingProfileRef?: string;

  createdAt: string;
  expiresAt?: string;
}

interface FederatedProjectionBundle {
  bundleRef: string;
  exchangeRef: string;

  projectionRevisionRef: string;
  entityRefs: string[];

  redactionPolicyRef: string;
  contentHash: string;

  createdAt: string;
}

interface FederatedReceipt {
  bundleRef: string;
  receiverRef: string;

  receivedAt: string;
  integrityState: string;

  importState:
    | "REFERENCE_ONLY"
    | "ACCEPTED_AS_EXTERNAL_EVIDENCE"
    | "REJECTED"
    | "REQUIRES_REVIEW";
}
```

Requirements:

1. Federation MUST NOT create a second SmartAIHub canonical authority.
2. Receiving a partner bundle does not automatically verify its claims.
3. Minimum-necessary/redacted projection MUST be purpose-bound.
4. Exact victim/responder location requires explicit sharing authority.
5. Source/correction/retraction lineage MUST travel with shared material facts.
6. Signed bundle proves sender/integrity, not real-world truth.
7. Receiver MUST preserve sender identity and cannot relabel partner evidence as its own observation.
8. Retraction/correction SHOULD propagate to prior federation recipients where possible.
9. Data residency/legal constraints apply before federation.
10. Cross-tenant federation MUST not expose tenant credentials, internal prompts or unrelated private records.
11. Exchange contracts SHOULD support expiry/revocation.
12. Federation transport MAY use API/MCP/A2A/standard protocols but must retain these semantics.

---

## Pass 67 — Platform-Wide Work Admission, Compute Budgets and Disaster Load Shedding

### Gap

Provider request budgets and capability SLOs exist, but expensive raster processing, route recomputation, model runs, graph traversals, translations, LLM summaries and imagery processing all compete for finite SmartAIHub resources during a large disaster.

### Patch

Add:

```ts
interface OperationalResourceBudget {
  resourceBudgetRef: string;

  resourceClass:
    | "CPU"
    | "MEMORY"
    | "GPU"
    | "DATABASE"
    | "VECTOR_SEARCH"
    | "RASTER_PROCESSING"
    | "MODEL_INFERENCE"
    | "LLM"
    | "EXTERNAL_PROVIDER"
    | "NETWORK"
    | "OTHER";

  capacityOrCostLimit?: number;
  unit?: string;

  reservedForPriorityClasses: Record<string, number>;
  evaluationWindow?: Duration;

  geographyOrTenantScopeRef?: string;
}

interface WorkAdmissionPolicy {
  workClass: string;

  priority:
    | "P0_LIFE_SAFETY"
    | "P1_OPERATIONAL"
    | "P2_USER_INTERACTIVE"
    | "P3_BACKGROUND"
    | "P4_OPTIONAL";

  maxQueueAge?: Duration;
  maxConcurrency?: number;

  shedBehavior:
    | "NEVER_SHED"
    | "DEGRADE"
    | "DEFER"
    | "DROP_IF_STALE";

  fallbackCapabilityRef?: string;
}

interface AdmissionDecision {
  workRef: string;
  policyRef: string;

  decision:
    | "ADMIT"
    | "DEGRADE"
    | "DEFER"
    | "REJECT_STALE"
    | "REJECT_CAPACITY";

  reasonCodes: string[];
}
```

Requirements:

1. Emergency intake, critical alert correction and authoritative state writes MUST receive protected capacity.
2. Raster animation, historical playback, optional AI narrative and commercial enrichment SHOULD shed/defer before life-safety work.
3. Queue age MUST be part of admission decisions; old optional work should not execute after it is no longer useful.
4. Expensive model/LLM fallback MUST be deterministic where feasible.
5. Resource admission MUST preserve tenant fairness without allowing a low-priority tenant workload to starve regional P0 operations.
6. Cost caps MAY degrade optional provider/model use but cannot hide required critical warning correction.
7. Surge mode SHOULD disable/reduce unnecessary per-user duplicate recomputation.
8. Work admission decisions MUST be observable/auditable.
9. Deferred work MUST retain idempotency.
10. Database connection/transaction budgets MUST coordinate with existing Hyperdrive/PostgreSQL protection strategy.
11. Capacity exhaustion MUST produce explicit degraded capability status.
12. Resource budgeting MUST not be implemented as a second billing/credit authority.

---

## Pass 68 — Source Heartbeats, Planned Maintenance and Expected Silence

### Gap

Source health currently distinguishes outage/stale states, but a provider may intentionally stop publishing during scheduled maintenance, publish only when an event occurs, or provide a heartbeat separate from observations.

### Patch

Add:

```ts
interface SourceHeartbeatProfile {
  sourceRef: string;

  heartbeatMode:
    | "DEDICATED"
    | "EXPECTED_DATA_CADENCE"
    | "ON_CHANGE_ONLY"
    | "NONE";

  expectedInterval?: Duration;
  graceInterval?: Duration;

  healthEndpointRef?: string;
}

interface SourceHeartbeatObservation {
  sourceRef: string;
  observedAt: string;

  state:
    | "HEALTHY"
    | "LATE"
    | "MISSED"
    | "MAINTENANCE"
    | "UNKNOWN";

  evidenceRef?: string;
}

interface ProviderMaintenanceWindow {
  maintenanceRef: string;
  providerOrSourceRef: string;

  startsAt: string;
  endsAt?: string;

  announcedAt?: string;

  affectedCapabilities: string[];

  planned: boolean;
  sourceRef?: string;
}
```

Requirements:

1. `ON_CHANGE_ONLY` sources MUST NOT be marked failed merely because no new event occurred.
2. Planned maintenance and unplanned outage remain distinct.
3. Planned maintenance still creates a coverage gap where data is unavailable.
4. Health endpoint success MUST NOT prove the data values themselves are current/correct.
5. A source that continues heartbeat but stops advancing event-time watermark MAY still be operationally stale.
6. Maintenance window MUST not auto-resolve live incidents/alerts.
7. Provider status UI SHOULD distinguish planned maintenance from outage.
8. Scheduled maintenance SHOULD be incorporated into provider fallback/admission decisions.
9. Stale last-known values remain visible with freshness labeling.
10. Recovery after maintenance performs bounded catch-up/reconciliation.
11. Heartbeat retry must not become a provider-rate-limit storm.
12. Maintenance metadata itself is versioned/auditable.

---

## Pass 69 — Spatial Interaction Telemetry Privacy

### Gap

Even when exact GPS is protected, repeated viewport centers, searches, selected incidents, watched areas and routes can reveal where a user lives, works, travels or is concerned about. Product analytics must not turn emergency-map use into hidden behavioral tracking.

### Patch

Add:

```ts
interface SpatialInteractionPrivacyPolicy {
  policyRef: string;

  interactionClass:
    | "VIEWPORT"
    | "SEARCH"
    | "WATCH"
    | "ROUTE_QUERY"
    | "INCIDENT_SELECTION"
    | "MAP_LAYER_USE"
    | "OTHER";

  collection:
    | "DISABLED"
    | "AGGREGATED_ONLY"
    | "SESSION_EPHEMERAL"
    | "CONSENTED";

  spatialPrecision?: string;
  retention?: Duration;

  analyticsPurposeRefs: string[];

  prohibitAdvertisingUse: boolean;
}

interface SpatialAnalyticsProjection {
  analyticsRef: string;

  aggregationAreaRef?: string;
  timeBucket: string;

  countOrMetric: number;

  minimumCohortRuleRef?: string;
  generatedAt: string;
}
```

Rules:

1. Emergency-map behavioral telemetry MUST be purpose-limited.
2. Raw viewport history SHOULD NOT be retained by default merely for analytics.
3. Watch geometry is user operational data, not an advertising-interest signal.
4. Emergency incident selections/searches MUST NOT feed commercial targeting.
5. Analytics SHOULD prefer aggregate/coarsened projections.
6. Low-count spatial analytics require suppression/coarsening as appropriate.
7. Product observability may collect technical performance metrics without retaining unnecessary sensitive geography.
8. User deletion/privacy policy applies to retained interaction data subject to legal/audit exceptions.
9. Tenant analytics cannot weaken platform privacy invariants.
10. Debug traces MUST avoid embedding full sensitive coordinates when unnecessary.
11. Cross-device analytics identity SHOULD be minimized.
12. Consent for location sharing during emergency response does not imply consent for long-term behavioral analytics.

---

## Pass 70 — Cross-Device / Cross-Session Spatial State Synchronization

### Gap

SmartAIHub is mobile/tablet/desktop-first, and the same user may open Emergency Map on several devices. Watches are durable, but transient/saved spatial state needs explicit conflict semantics.

### Patch

Add:

```ts
interface CrossDeviceSpatialState {
  stateRef: string;
  userOrWorkspaceRef: string;

  stateClass:
    | "SAVED_VIEW"
    | "WATCH"
    | "LAYER_PRESET"
    | "FEED_FOCUS_LOCK"
    | "ROUTE_PLAN"
    | "JOURNEY_VIEW"
    | "DRAFT_REPORT";

  revision: string;
  updatedAt: string;
  updatedByDeviceRef: string;

  payloadRef: string;
}

interface SpatialStateConflict {
  conflictRef: string;

  stateRef: string;

  localRevision: string;
  remoteRevision: string;

  conflictType:
    | "CONCURRENT_EDIT"
    | "DELETED_REMOTE"
    | "PERMISSION_CHANGED"
    | "ENTITY_MIGRATED"
    | "OTHER";

  resolution:
    | "MERGED"
    | "LATEST_VALID"
    | "USER_CHOICE"
    | "SERVER_POLICY"
    | "UNRESOLVED";
}
```

Requirements:

1. Transient live viewport MAY remain device-local unless user explicitly saves/sends it.
2. Durable watches MUST converge across devices.
3. Concurrent watch edits require revision-aware conflict handling.
4. Device B MUST not silently overwrite a newer safety-critical watch setting from Device A.
5. Layer/filter presets MAY use last-writer-wins only if semantics are noncritical and explicit.
6. Permission changes revalidate synchronized state.
7. Device removal/revocation MUST stop future protected sync access.
8. Cross-device synchronization must not duplicate notifications.
9. Offline device state joins the same conflict rules on reconnect.
10. Shared team/command state uses workspace authority, not personal last-writer rules.
11. Language/theme preference sync must not change source data semantics.
12. Sending current map context to another device SHOULD use a revisioned deep-link/state snapshot.

---

## Pass 71 — Non-Visual Spatial Narrative and Accessible Map Equivalence

### Gap

The UI supports keyboard/screen readers and plain-language alerts, but a visual map can still contain information that has no equivalent for blind/low-vision users or users who cannot manipulate a map precisely.

### Patch

Add:

```ts
interface AccessibleSpatialNarrative {
  narrativeRef: string;

  focusContextRef: string;
  projectionRevisionRef: string;

  locale: string;

  sections: Array<
    | "CURRENT_LOCATION_OR_FOCUS"
    | "CRITICAL_NEARBY"
    | "DIRECTION_AND_DISTANCE"
    | "ROUTE_CONSTRAINTS"
    | "WEATHER"
    | "HYDROLOGY"
    | "SERVICES"
    | "CHANGES"
    | "ACTIONS"
  >;

  generatedAt: string;
}

interface AccessibleSpatialTarget {
  targetRef: string;

  bearingOrDirection?: string;
  distance?: number;
  distanceUnit?: string;

  relation:
    | "INSIDE"
    | "NEAR"
    | "UPSTREAM"
    | "DOWNSTREAM"
    | "ALONG_ROUTE"
    | "APPROACHING"
    | "OTHER";

  actionRefs: string[];
}
```

Requirements:

1. Critical information available only visually on the map MUST have a non-visual equivalent.
2. Users SHOULD be able to navigate significant map targets by ordered list/keyboard rather than pointer-only interaction.
3. Direction/distance descriptions MUST use the same canonical geometry/revision as the map.
4. "North/east" and clock-face/direction wording SHOULD be locale/audience appropriate.
5. Non-visual narrative MUST distinguish observed, forecast and official warning classes.
6. Route hazards SHOULD be expressible in ordered sequence along the route.
7. Screen-reader output SHOULD prioritize critical items and avoid enumerating thousands of markers.
8. Changes since last view SHOULD be available textually.
9. Spatial narrative generated by AI MUST be grounded in structured map context; deterministic core values such as distance/direction SHOULD be calculated, not guessed.
10. Mobile voice/TTS MAY read narratives but cannot become a separate source of truth.
11. Accessible action controls MUST invoke the same typed Map/Task/Watch commands as visual UI.
12. Accessibility support applies to TH and EN baseline.

---

## Pass 72 — Privacy Deletion, Legal Hold and Emergency Evidence Retention Conflict

### Gap

Spec 262 defines retention and legal holds, but privacy deletion requests, account closure or tenant deletion can conflict with emergency evidence, financial/audit records, public-interest obligations or active incident investigations.

### Patch

Add:

```ts
interface PrivacyRetentionDecision {
  decisionRef: string;

  subjectOrAccountRef: string;

  requestType:
    | "DELETE"
    | "ACCOUNT_CLOSE"
    | "EXPORT"
    | "RESTRICT_PROCESSING"
    | "OTHER";

  dataScopeRefs: string[];

  result:
    | "DELETE"
    | "DEIDENTIFY"
    | "RETAIN_UNDER_LEGAL_HOLD"
    | "RETAIN_MINIMUM_NECESSARY"
    | "PARTIAL"
    | "REQUIRES_REVIEW";

  policyOrLegalBasisRefs: string[];
  reviewerRef?: string;

  createdAt: string;
}

interface RetentionProtectedReference {
  protectedRef: string;

  sourceEntityRef: string;

  protectionReason:
    | "LEGAL_HOLD"
    | "INCIDENT_AUDIT"
    | "FINANCIAL"
    | "PUBLIC_RECORD"
    | "SAFETY_INVESTIGATION"
    | "OTHER";

  minimumFieldsRef: string;
  expiresAt?: string;
}
```

Requirements:

1. Account deletion MUST NOT silently destroy evidence protected by applicable legal/audit/safety policy.
2. Protected retention MUST preserve only the minimum necessary fields when full identifiable content is not required.
3. Deidentification is distinct from deletion.
4. Public community content may have separate publication/retention policy from private user profile data.
5. Deleting a user account MUST not orphan canonical incident provenance; references may be pseudonymized/deidentified according to policy.
6. Active legal hold overrides ordinary retention expiry within authorized scope.
7. Legal hold MUST NOT be expanded to unrelated user data by convenience.
8. Export requests must apply current authorization and sensitive-location redaction.
9. Cross-tenant/federated copies require coordinated deletion/restriction semantics where agreements/law require it.
10. Derived analytics must not retain re-identifiable data after source deletion beyond policy.
11. Privacy-retention decisions are auditable and policy-versioned.
12. Product UI SHOULD communicate when deletion cannot fully remove legally protected emergency records, consistent with applicable policy.

---

# R1.7 Revised Priority Matrix

## P0 — operational integrity and user safety

- FreshnessActionGate for safety-relevant actions
- explicit missing/censoring/imputation semantics
- WatchLifecycle and geofence hysteresis
- offline GeoPackage rights/freshness/integrity
- platform resource admission for P0/P1 protection
- source heartbeat/maintenance-aware health
- spatial interaction privacy
- privacy-retention conflict policy
- accessible non-visual critical spatial narrative

## P1 — national/global capability depth

- drought/low-flow/salinity intelligence
- federated inter-agency situation exchange
- multi-device saved-state conflict handling
- richer offline routable regional packages
- operations dashboards for watches/freshness/resource admission

## P2 — advanced coordination

- automated cross-agency federation routing
- predictive salinity/low-flow models
- optimized watch/geofence indexes at very large scale
- adaptive offline package pre-positioning
- resource-budget optimization based on disaster phase

P2 SHALL NOT block P0 life-safety correctness, privacy, freshness truthfulness or accessible minimum service.

---

# R1.7 Additional Acceptance Tests 441–500

441. Stale facility capacity cannot be used to claim available beds/space past policy.
442. Stale road-open state cannot override a newer hazard restriction.
443. Read-only map can still display stale observation with explicit age while automatic action is blocked.
444. Offline action gate evaluates package data-through timestamp.
445. LLM cannot override deterministic stale-data `BLOCK`.

446. Provider sentinel `-9999` normalizes to missing rather than a real hydrology value.
447. Below-detection measurement remains distinct from zero.
448. Saturated high-water sensor does not silently clip to maximum valid value.
449. Long telemetry gap causes trend to become degraded/unknown rather than a connected false line.
450. Late real observation can supersede imputation without losing imputation lineage.

451. Low-flow event can remain active after flood incident closes.
452. Reservoir percent-full alone cannot create drought severity.
453. Salinity intrusion assessment uses tide/freshwater context when available.
454. Official drinking/agricultural restriction remains authority-sourced.
455. Regional Pack can declare flood coverage available while salinity/drought coverage is unsupported.

456. Geofence boundary jitter does not cause repeated enter/exit notifications.
457. Watch geometry revision does not rewrite historical transition events.
458. Muted watch continues evaluation when configured without sending notifications.
459. Watch enters coverage-gap/suspended state when required provider disappears.
460. Hazard polygon expansion into area is distinct from user/journey entering hazard.

461. Offline GeoPackage rejects a layer whose provider terms prohibit offline storage.
462. Offline package delta cannot apply to the wrong base revision.
463. Restricted online tile session token is not converted into permanent offline tiles.
464. Reconnected material action revalidates stale offline route/hazard state.
465. Critical vector/reference data can remain available offline without rich basemap imagery.

466. Federated bundle retains sender/provenance and cannot become receiver-owned observation.
467. Signed partner bundle proves integrity/origin but not truth.
468. Correction/retraction can propagate to federation recipient.
469. Federation redaction prevents unrelated sensitive-case leakage.
470. Foreign/partner exchange cannot bypass receiver jurisdiction/authority rules.

471. P0 critical alert correction is admitted while optional raster animation is shed under resource pressure.
472. Old optional queued model work can be dropped when no longer useful.
473. One tenant's low-priority workload cannot starve regional P0 processing.
474. Resource admission decision is auditable and does not duplicate billing authority.
475. Capacity exhaustion surfaces degraded capability rather than silent failure.

476. On-change-only source is not marked down merely for silence.
477. Source heartbeat healthy but event-time watermark stalled results in operational staleness.
478. Planned maintenance is distinguished from outage and still shown as coverage gap.
479. Maintenance recovery catches up without false current-event burst.
480. Maintenance state never resolves an active incident.

481. Raw viewport history is not retained by default solely for analytics.
482. Watch geometry cannot be reused as an advertising interest signal.
483. Emergency searches/incident selections are excluded from commercial targeting.
484. Low-count spatial analytics are suppressed/coarsened according to privacy policy.
485. Technical telemetry can measure latency without storing unnecessary exact coordinates.

486. Durable watch converges across mobile and desktop without duplicate notification.
487. Concurrent critical watch edits do not silently overwrite each other.
488. Transient unsaved viewport remains device-local by default.
489. Offline device reconnect resolves watch revision conflicts deterministically.
490. Revoked device no longer receives protected synchronized spatial state.

491. Blind user can access a text/ordered equivalent of critical markers in viewport.
492. Route hazards are available in sequence along route without visual map.
493. Deterministic distance/direction in accessible narrative matches canonical geometry.
494. Screen reader does not enumerate thousands of low-priority markers.
495. Accessible TH/EN action controls invoke the same typed commands as the visual map.

496. Account deletion does not destroy records under valid incident legal hold.
497. Legal hold retains only policy-authorized minimum necessary data.
498. Deidentified canonical provenance survives user-account deletion when required.
499. Federated recipient deletion/restriction workflow follows applicable exchange policy.
500. Integrated freshness + missingness + drought + geofence + offline + federation + resource-admission + privacy + accessibility + retention scenario passes end to end.

---

# R1.7 Mandatory Integrated Scenarios

## Scenario AK — Stale-data route decision

A road was reported open 50 minutes ago, but the freshness policy allows automatic routing through an "open" state for only 15 minutes during an active flood. The map still shows the last-known state with age, while route execution triggers `REQUIRE_REVALIDATION`. A newer hazard closure arrives and prevents the stale open state from being used.

## Scenario AL — Data gap during rapidly rising river

A gauge saturates and then loses communication near warning level. The system records censoring and a MissingDataEpisode, stops producing a falsely continuous trend, retains upstream/official warning context, and does not infer a precise peak from interpolation. Late observations later replace imputed history with revisioned recomputation.

## Scenario AM — Dry-season salinity and water-supply stress

River discharge falls, tide-driven salinity advances upstream and a utility issues a water-use advisory. SmartAIHub distinguishes low-flow, salinity observation, derived intrusion assessment and official public instruction. Feed remains useful even though no flood exists and does not infer drought severity from reservoir storage alone.

## Scenario AN — Watch area on several devices

A user creates an area watch on tablet, edits thresholds on desktop and later reconnects a phone that contains an older offline revision. The current durable watch is not overwritten by the stale phone; conflict is resolved/audited, geofence hysteresis prevents boundary spam, and only one canonical notification is produced when the hazard enters the area.

## Scenario AO — Cross-agency flood exchange under platform surge

Two agencies exchange minimum-necessary signed situation bundles while regional load spikes. P0 corrections and official alerts receive protected compute; optional animation/model work is shed. The receiving agency preserves sender provenance, does not automatically verify external claims, and a later correction propagates through the federation channel.

## Scenario AP — Public accessibility and privacy after an emergency

A blind English-speaking visitor uses the non-visual spatial narrative to understand nearby hazards and route constraints. After the event, a local user requests account deletion while some incident evidence remains under a valid safety/legal retention policy. SmartAIHub removes/deidentifies non-protected profile/interaction data, preserves only authorized minimum necessary evidence, and communicates the retention outcome without exposing protected details.

---

# R1.7 Revised Definition of Done

Spec 262 R1.7 is DONE only when all R1.6 requirements continue to hold and:

1. Safety-relevant material actions are freshness-gated by explicit policy.
2. Missing, censored, saturated and imputed data have first-class semantics and cannot silently become observations.
3. Hydrology capability can represent low-flow/drought/salinity where Regional Packs support it.
4. Watches/geofences have deterministic lifecycle, geometry revision and transition semantics.
5. Offline geography packages enforce provider rights, integrity, revision and freshness.
6. Federated agency/tenant exchange preserves authority, provenance, purpose limitation and redaction.
7. Platform-wide work admission protects life-safety workloads during disaster surge.
8. Provider health distinguishes planned maintenance, expected silence and stalled data progression.
9. Spatial interaction analytics cannot silently become behavioral/commercial location tracking.
10. Durable saved spatial/watch state synchronizes safely across devices and offline reconnects.
11. Non-visual users have an equivalent actionable spatial summary in TH/EN baseline.
12. Privacy deletion/closure and legal/audit evidence retention are reconciled through explicit policy decisions.
13. Acceptance tests 1–500 pass, except explicit owner-approved deferrals that cannot reduce life-safety correctness, privacy, accessibility, provenance, or coverage truthfulness.
14. Mandatory scenarios A–AP pass in representative normal, degraded, offline, federated, surge and privacy-retention conditions.

---

# Appendix R — R1.7 Core Object Additions

```text
FreshnessPolicy
OperationalActionGate

MissingDataEpisode
MeasurementCensoring
ImputationRecord

WaterAvailabilityState
LowFlowObservation
SalinityObservation
SalinityIntrusionAssessment

GeofenceDefinition
GeofenceTransition
WatchLifecycle

OfflineGeoPackage
OfflineGeoPackageDelta

FederatedSituationExchange
FederatedProjectionBundle
FederatedReceipt

OperationalResourceBudget
WorkAdmissionPolicy
AdmissionDecision

SourceHeartbeatProfile
SourceHeartbeatObservation
ProviderMaintenanceWindow

SpatialInteractionPrivacyPolicy
SpatialAnalyticsProjection

CrossDeviceSpatialState
SpatialStateConflict

AccessibleSpatialNarrative
AccessibleSpatialTarget

PrivacyRetentionDecision
RetentionProtectedReference
```

---

# R1.7 Final Principle

> An emergency geospatial platform is not complete merely because it can ingest more data. It must also know **when data is too old to act on, when missing values make a trend unknowable, when the problem is drought rather than flood, when a watched boundary is truly crossed, what can be carried offline, what may be shared with another agency, which workloads survive a surge, whether silence is maintenance or failure, what location behavior must never become analytics profiling, how state converges across devices, how a blind user receives the same critical spatial meaning, and what must be deleted versus lawfully retained after the emergency ends**.

**End of Spec 262 R1.7 — Sixth Twelve-Pass Gap Review / 72-Pass Cumulative Production-Hardened Revision**

---

# R1.8 — Spec 260 Alignment and Existing AI Chat & Feedback Integration

This amendment is normative and supersedes conflicting R1.0–R1.7 implementation-boundary statements and acceptance criteria. Requirements from earlier revisions remain in force where this amendment does not explicitly refine them.

## R1.8.1 Spec 260 dependency and change control

1. Spec 260 R1.38 is the canonical emergency-domain contract and predecessor for Spec 262. Its implementation is **in progress**; Spec 262 MUST NOT describe it as a completed or frozen implementation baseline until the Spec 260 progress ledger and its final integrated gates say so.
2. Spec 262 work that is independently additive MAY be designed and implemented alongside Spec 260. A feature that depends on an unfinished Spec 260 route, projection, persistence contract, authorization path, worker executor, or UI integration MUST remain behind an explicit dependency gate and MUST NOT claim end-to-end readiness before that dependency is implemented and verified.
3. Spec 262 MUST reuse the canonical Spec 260/platform authorities for emergency records, public and restricted projections, identity/tenant authorization, audit, Chat, Task Control, notifications, billing, and durable execution. A provider adapter or geospatial projection may add domain-specific data, but MUST NOT become the authority for these concerns.
4. Long-running provider ingestion, backfill, trend/reprojection, and similar asynchronous work MUST be admitted and settled through canonical `worker_jobs` plus the transactional outbox, using the established lease, fencing, idempotency, retry, and audit contracts. Cloudflare Queues or other runtime transports only deliver admitted work; they MUST NOT define job truth or create a parallel orchestration authority.
5. Producers and consumers MUST preserve the owning domain's transaction boundary, canonical references, provenance, correction/retraction lineage, and projection invalidation rules. External provider payloads remain untrusted evidence until the owning policy has classified them.
6. Spec 262 MUST NOT retroactively rewrite Spec 260 requirements. If implementation discovers a shared-contract change is necessary, record it as a coordinated, versioned additive amendment with explicit impact and acceptance criteria in both specs (or a linked canonical contract), then update the dependency mapping. Until that amendment is accepted, implement against the existing Spec 260 contract or keep the dependent slice gated.
7. Phase plans and completion reports MUST distinguish `independent additive work`, `waiting on Spec 260 dependency`, `integrated and locally verified`, and `final environment verified`. Passing one phase MUST NOT be reported as completion of a later phase.
8. Persistent Spec 262-only observations, time series, topology, or derived-state records MAY require additive database migrations through the repository's canonical schema/journal path. Create only tables needed for data that must be durable; do not duplicate Spec 260 emergency/task authorities or persist transient UI state as canonical data. Migration ownership, ordering, replay, rollback/forward-recovery, retention, and projection rebuild impact MUST be recorded before the dependent integration gate can pass. No migration is implied for a presentation-only projection.

## R1.8.2 Existing AI Chat & Feedback panel contract

1. The product UI named **AI Chat & Feedback** is the shared application panel. Its existing tabs are **AI Chat**, **Task Control**, and **Send Feedback**. The name “Global Mini Chat” used elsewhere in this specification is an alias for this existing panel/AI Chat entry point, not a request to build a separate chat page or modal.
2. Map and Feed Ask AI actions MUST open that shared panel with **AI Chat** selected. They MUST reuse the existing canonical conversation/session lifecycle, composer, model and assistant/skill selectors, and supported chat controls. They MUST preserve the user's current chat state when opening, closing, or switching tabs, subject to the existing panel's normal behavior. If no conversation exists yet, the panel MAY create one through its existing canonical flow.
3. A map/feed action MAY attach a bounded `MapContextEnvelope` to the next user-authored turn. Before submission, the panel MUST show a clear context indicator describing the attached map/feed selection and allow the user to remove it. The context is one-turn scoped and MUST NOT silently carry into later messages after use, panel close, or navigation; the user may explicitly attach it again. The panel MUST NOT submit a message, create a task, or trigger another side effect until the user explicitly acts through the existing UI.
4. Context attachment MUST use canonical references and permission-safe summaries. The existing Chat backend/authority resolves details through approved APIs and applies current authorization; the browser MUST NOT send the full rendered map dataset, restricted records, or exact protected location as prompt text.
5. **Task Control** remains the existing tab and authority for task creation, assignment, approval, and status. **Send Feedback** remains the existing feedback tab and authority. A Map or Feed shortcut may select the appropriate existing tab and pass allowed references; it MUST NOT implement a second task/feedback form or a parallel route/state machine.
6. If the shared panel or context bridge is unavailable, Map and Feed remain usable; show a recoverable message and retain the user's map/feed state. Do not silently fall back to a separate chat experience.

## R1.8.3 Acceptance tests 501–513

501. Map Ask AI opens the existing AI Chat & Feedback panel with the AI Chat tab selected.
502. Feed Ask AI opens the same panel and attaches only the selected feed item's authorized canonical references and bounded spatial context.
503. Opening the panel does not create a Map-specific chat authority/thread or submit a message; first-conversation creation, if needed, follows only the existing panel's canonical lifecycle.
504. Current conversation, composer draft, selected model, and assistant/skill selection are preserved according to the existing panel contract when opening and closing it from Map.
505. Task Control opened from a map action selects the existing Task Control tab and retains canonical authorization, approval, and idempotency checks.
506. Send Feedback remains the existing tab/flow; no map-specific duplicate feedback route or state store is created.
507. Public map context contains only public-safe projections; restricted responder/command context is denied unless the existing authorization policy permits it, and authorization is revalidated when an action is submitted.
508. If Chat or the context bridge is unavailable, the map remains operational, its viewport/selection is preserved, and the user receives a recoverable status message.
509. Durable provider ingestion, backfill, and material recomputation use canonical `worker_jobs` plus the transactional outbox and existing lease/fencing/idempotency rules; queue delivery alone cannot create or settle job truth.
510. The public emergency map and related geospatial deep links use the Spec 260 shared route manifest; no duplicate map route or independent dashboard navigation authority is introduced.
511. A caller cannot gain `RESPONDER` or `COMMAND` context by changing `requestedMapMode`; server-derived identity, tenant, purpose, and current authorization determine the effective projection.
512. Before sending, the user can inspect and remove attached spatial context; the context is consumed after one submitted turn and is not silently reused in subsequent messages.
513. Required durable Spec 262 data uses ordered additive migrations in the canonical schema/journal; migration replay and recovery preserve accepted Spec 260 facts, and no table duplicates canonical emergency/task state.

## R1.8.4 Integrated chat scenarios

### Scenario AQ — Map question in the existing shared panel

An authenticated user opens the emergency map, selects a flood area, and chooses Ask AI. The existing AI Chat & Feedback panel opens on its AI Chat tab, preserves the current canonical conversation and chat selections, and shows a removable “map context attached” indicator. No text is sent until the user submits a message. Chat resolves only authorized canonical references. The user can switch to Task Control or Send Feedback in the same panel without losing the map viewport or creating a Map-specific chat/task/feedback subsystem.

### Scenario AR — Public map with existing Chat access requirements

An anonymous user continues to access public emergency map/list information. If the existing AI Chat entry point requires sign-in or entitlement, Ask AI follows that same access flow; it does not weaken Chat authorization or stage restricted map context for later use. Returning to the map preserves the public viewport and selected public-safe feature.

## R1.8.5 Revised completion and sequencing criteria

Spec 262 is complete only when:

- all prior non-conflicting R1.0–R1.7 requirements remain satisfied;
- Spec 260 dependencies used by the integrated slice are implemented and pass their required local integrated gates; any unfinished dependency is explicitly gated and cannot be represented as production-ready;
- canonical worker job/outbox, lease/fencing, idempotency, authorization, audit, and projection contracts are used without parallel authorities;
- the shared AI Chat & Feedback panel and its existing AI Chat, Task Control, and Send Feedback tabs are used as specified above;
- Acceptance Tests 1–513 pass, or have explicit owner-approved deferrals that do not reduce life-safety correctness, privacy, accessibility, provenance, authorization, or coverage truthfulness;
- mandatory scenarios A–AP and AQ–AR pass at the evidence level required by the corresponding phase. Local implementation evidence MUST be distinguished from final Cloudflare/environment verification.

R1.8 does not require all of Spec 260 to be complete before independent Spec 262 work can proceed. It requires each cross-spec integration to wait for and prove the specific Spec 260 contract it depends on.

## R1.8.6 Ten-round gap review record

1. **Predecessor implementation state:** The summary and scope called Spec 260 implemented/completed. Corrected them to identify Spec 260 as canonical and still in progress; integration uses explicit dependency gates.
2. **Revision lineage:** Checked Spec 260's R1.37 delivery addendum and new R1.38 downstream amendment against Spec 262 R1.8 metadata. Both specs now identify the same predecessor and downstream revision relationship.
3. **Authority and asynchronous execution:** Checked emergency state, task, billing, notification, audit, and durable-job ownership. Spec 262 now binds long-running work to `worker_jobs` plus transactional outbox and treats Cloudflare Queues as transport only; acceptance test 509 covers it.
4. **Chat UI identity:** Compared the spec with the existing AI Chat & Feedback panel implementation. Updated the architecture and requirements to reuse its AI Chat, Task Control, and Send Feedback tabs, including the panel's normal first-conversation lifecycle; tests 501–506 cover this boundary.
5. **Authorization and location privacy:** Checked client-selected map mode and sensitive-context flow. `requestedMapMode` is now explicitly non-authoritative; server policy derives audience, and authorization is revalidated. Tests 507 and 511 cover the boundary.
6. **Canonical references and states:** Found generic string references/states in the Feed contract. Replaced them with canonical typed references/state aliases and prohibited treating a stable reference as permission.
7. **Provider degradation and minimum service:** Rechecked coverage truth and map outage fallback. Existing requirements retain explicit provider coverage gaps and list/text access when the basemap fails; test 508 additionally requires the map/context failure path to preserve state and recover.
8. **Route/navigation ownership:** Found Phase A described migration from an already implemented predecessor. Renamed it to incremental integration and bound public map entry points/deep links to Spec 260's shared `emergencyRouteManifest`; test 510 covers duplicate-route prevention.
9. **Persistence and completion criteria:** Checked schema additions, migration implications, and cumulative test totals. Added canonical ordered additive-migration/recovery requirements and test 513; the active completion range is now 1–513.
10. **Final cross-document consistency scan:** Rechecked completion claims, revision references, Chat wording, route/job ownership, and all active DoD/test-range references against the Spec 260 progress ledger. Remaining R1.7 acceptance/DoD text is historical and explicitly superseded by R1.8; no unresolved R1.8 alignment gap was found.

**End of Spec 262 R1.8 amendment.**
