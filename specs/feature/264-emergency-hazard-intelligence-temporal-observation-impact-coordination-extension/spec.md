# Spec 264 — Emergency Hazard Intelligence, Temporal Observation & Impact Coordination Extension

**Status:** Draft for Implementation  
**Type:** Additive Extension Specification  
**Primary Dependencies:** Spec 260, Spec 262  
**Related Runtime Dependencies:** Spec 224 and shared SmartAIHub platform services  
**Compatibility Rule:** This specification MUST extend existing capabilities without breaking or redefining already-implemented contracts in Spec 260 or Spec 262.

---

## 1. Purpose

Spec 264 defines the Hazard Intelligence and Operational Semantics layer for SmartAIHub's emergency/disaster platform.

It exists to close gaps identified after reviewing modern multi-source disaster information systems and real operational use cases, especially around:

- distinguishing observation, derived, forecast, and crowdsourced data;
- temporal observation and historical replay;
- multi-source hazard event aggregation;
- source health and freshness;
- hydrological relationship graphs;
- administrative and infrastructure impact assessment;
- citizen report trust and evidence handling;
- camera and external media access governance;
- data rights, attribution, and reuse policy;
- emergency timeline synchronization;
- mobile/PWA degraded-mode operation;
- AI interpretation safety and provenance propagation.

Spec 264 MUST NOT replace Spec 260 or Spec 262.

It MUST treat them as upstream platform capabilities:

- Spec 260 provides Emergency Data Commons, ingestion, canonical data access, MCP/API, and related data infrastructure.
- Spec 262 provides emergency map visualization, map interaction, operational UI, and geographic presentation capabilities.
- Spec 264 adds cross-source intelligence, semantics, temporal coordination, trust models, impact computation, and operational interpretation.

---

## 2. Design Position

The emergency stack SHALL be organized as:

```text
External Data Providers
        |
        v
Spec 260 — Emergency Data Commons / MCP / API
        |
        v
Spec 264 — Hazard Intelligence & Operational Semantics
        |
        +-------------------+
        |                   |
        v                   v
Spec 262 — Map/UI      Chat / Task Control
        |                   |
        +---------+---------+
                  |
                  v
         SmartAIHub Agents / Skills
                  |
                  v
         Route / Tracking / Dispatch
                  |
                  v
          Operational Coordination
```

Spec 264 SHALL NOT create a second data platform, second map engine, second orchestration engine, second queue, or second execution authority.

---

## 3. Core Invariants

The following rules are mandatory system invariants:

```text
OBSERVED ≠ DERIVED ≠ FORECAST ≠ CROWDSOURCED

NO DATA ≠ NO HAZARD

COMMUNITY CONSENSUS ≠ AUTHORITY VERIFICATION

STALE DATA ≠ CURRENT STATE

MODEL ESTIMATE ≠ FIELD MEASUREMENT

SOURCE AVAILABILITY ≠ SOURCE FRESHNESS

DISPLAYED DATA ≠ VERIFIED DATA

SIMULATION ≠ OBSERVATION

MODEL OUTPUT ≠ OFFICIAL WARNING
```

These distinctions MUST survive across:

- ingestion;
- normalization;
- database persistence;
- cache;
- API;
- MCP;
- event stream;
- workflow;
- agent context;
- AI-generated summaries;
- map layer metadata;
- alert messages;
- exported reports;
- audit logs.

No layer may silently collapse these semantic distinctions.

---

## 4. Goals

### 4.1 Primary Goals

Spec 264 SHALL provide:

1. canonical hazard-data classification;
2. temporal observation and acquisition semantics;
3. unified hazard event aggregation;
4. source health, freshness, and degraded-state awareness;
5. hydrological corridor and upstream/downstream relationship modeling;
6. administrative-area and infrastructure impact assessment;
7. community incident trust and verification workflows;
8. evidence/media provenance and privacy transformation tracking;
9. camera/media access governance;
10. data rights and attribution registry;
11. unified emergency timeline;
12. shareable incident/map temporal state;
13. PWA/mobile degraded field mode;
14. AI disaster-data safety semantics;
15. integration with SmartAIHub Chat, Task Control, Skills, MCP, Agents, Route/Tracking, and alerting.

### 4.2 Non-Goals

Spec 264 SHALL NOT:

- replace authoritative government warning systems;
- claim a derived model is an official forecast;
- create an autonomous emergency command authority;
- create a new queue/job authority;
- duplicate Spec 260 ingestion pipelines;
- duplicate Spec 262 map rendering;
- create an independent user/tenant/ACL system;
- bypass existing approval, audit, budget, or execution controls;
- infer official verification from popularity or user voting;
- convert unavailable data into a safe/normal state.

---

## 5. Hazard Data Classification Contract

Every hazard-related dataset, observation, event, feature, layer, alert input, and AI-consumable object MUST declare a `dataClass`.

### 5.1 Required Classes

```ts
type HazardDataClass =
  | "base"
  | "observation"
  | "derived"
  | "forecast"
  | "crowdsourced";
```

### 5.2 Definitions

#### base
Static or slowly changing contextual geospatial data.

Examples:
- administrative boundaries;
- river centerlines;
- road network;
- building footprints;
- shelters;
- hospitals;
- terrain/DEM;
- land use.

#### observation
Measurement or detection from a sensor, instrument, satellite, camera, field team, or authoritative observational dataset.

Examples:
- river gauge reading;
- satellite flood extent;
- radar reflectivity;
- rainfall station reading;
- earthquake magnitude observation.

#### derived
Computed result based on one or more source datasets.

Examples:
- DEM-derived estimated water depth;
- calculated exposure area;
- interpolated rainfall;
- road accessibility score;
- estimated population exposure.

#### forecast
A future-oriented result generated by an explicitly identified forecast model or authoritative forecasting source.

Examples:
- predicted river level;
- cyclone forecast track;
- weather forecast;
- forecast rainfall.

#### crowdsourced
User- or community-submitted information that has not automatically become authoritative evidence.

Examples:
- citizen flood report;
- blocked-road report;
- shelter status report from public users;
- community photo.

---

## 6. Canonical Hazard Data Envelope

All hazard information exposed through Spec 260 to Spec 264 SHOULD normalize to a common envelope.

```ts
interface HazardDataEnvelope<T = unknown> {
  id: string;
  tenantId: string;

  hazardType: string;
  dataClass: HazardDataClass;

  source: SourceReference;

  observedAt?: string;
  acquiredAt?: string;
  publishedAt?: string;
  fetchedAt: string;

  validFrom?: string;
  validUntil?: string;

  freshness: FreshnessState;
  verificationState: VerificationState;

  confidence?: ConfidenceDescriptor;
  methodology?: MethodologyReference;

  sourceLicense?: DataRightsReference;
  attribution?: AttributionReference;

  lineage: DataLineageReference[];

  geometry?: GeoJSON.Geometry;
  bbox?: [number, number, number, number];

  payload: T;

  createdAt: string;
  updatedAt: string;
}
```

### 6.1 Required Semantics

The system MUST NOT use a single timestamp for all purposes.

At minimum, implementations SHOULD distinguish:

- `observedAt` — when the phenomenon was observed;
- `acquiredAt` — when the sensor/platform acquired the data;
- `publishedAt` — when the provider published it;
- `fetchedAt` — when SmartAIHub retrieved it;
- `validFrom` / `validUntil` — validity window.

---

## 7. Temporal Observation Model

### 7.1 Requirement

Hazard data SHALL be time-addressable and replayable where the upstream data supports it.

A "latest layer only" model is insufficient.

### 7.2 Observation Object

```ts
interface TemporalObservation {
  observationId: string;
  sourceId: string;
  hazardType: string;
  dataClass: HazardDataClass;

  acquisitionWindow?: {
    start: string;
    end: string;
  };

  observedAt?: string;
  acquiredAt?: string;

  geometry?: GeoJSON.Geometry;
  state: "observed" | "not_observed" | "unknown" | "not_covered";

  quality?: string;
  confidence?: number;

  lineage: DataLineageReference[];
}
```

### 7.3 Mandatory Distinction

The system MUST preserve:

```text
not_observed
unknown
not_covered
```

as distinct states.

Example:

- satellite covered the area and detected no flood → `not_observed`
- satellite did not cover the area → `not_covered`
- source failed / data missing → `unknown`

These MUST NOT be rendered or summarized identically.

---

## 8. Satellite Pass & Scene Contract

For satellite-driven hazards, Spec 264 SHALL support explicit pass and scene objects.

```ts
interface SatellitePass {
  passId: string;
  provider: string;
  platform: string;
  sensor: string;

  acquisitionStart: string;
  acquisitionEnd: string;

  footprint: GeoJSON.Geometry;

  scenes: SatelliteSceneRef[];

  resultState:
    | "hazard_detected"
    | "no_hazard_detected"
    | "partial"
    | "processing"
    | "unavailable";
}
```

### 8.1 Dry Pass Preservation

A satellite pass with no detected hazard SHALL still be retained if provided by the upstream system.

This is required because:

```text
NO DETECTION ≠ NO DATA
```

---

## 9. Hazard Event Aggregation

Spec 264 SHALL introduce a logical `HazardEvent`.

A HazardEvent is NOT the same as one observation.

```ts
interface HazardEvent {
  eventId: string;
  hazardType: string;

  startTime?: string;
  endTime?: string;

  status:
    | "suspected"
    | "active"
    | "monitoring"
    | "decreasing"
    | "resolved"
    | "archived";

  observations: string[];

  relatedOfficialAlerts?: string[];
  relatedCommunityReports?: string[];

  spatialEnvelope?: GeoJSON.Geometry;

  confidence?: ConfidenceDescriptor;

  createdBy:
    | "system"
    | "authority_source"
    | "analyst"
    | "workflow";

  lineage: DataLineageReference[];
}
```

### 9.1 Multi-source Aggregation

The aggregation engine MAY associate:

- satellite detections;
- gauges;
- radar;
- rainfall;
- official alerts;
- community reports;
- CCTV metadata;
- road disruptions;
- route restrictions;

with one logical hazard event.

### 9.2 Conflict Preservation

Conflicting observations MUST NOT be overwritten.

The event SHOULD expose:

```ts
interface ObservationConflict {
  conflictId: string;
  eventId: string;
  observationIds: string[];
  conflictType: string;
  resolutionState:
    | "unresolved"
    | "system_explained"
    | "human_reviewed"
    | "superseded";
}
```

---

## 10. Source Health & Freshness

Every operational source MUST expose a health/freshness state.

```ts
type SourceHealthState =
  | "healthy"
  | "delayed"
  | "stale"
  | "degraded"
  | "unavailable"
  | "unknown";
```

### 10.1 Source Health Descriptor

```ts
interface SourceHealth {
  sourceId: string;

  state: SourceHealthState;

  lastSuccessfulFetch?: string;
  lastObservedDataTime?: string;

  expectedRefreshSeconds?: number;
  staleAfterSeconds?: number;

  consecutiveFailures?: number;

  latencyMs?: number;

  message?: string;
}
```

### 10.2 UI Rules

Map/UI SHALL visibly distinguish:

- current data;
- delayed data;
- stale data;
- unavailable source;
- unknown source state.

### 10.3 AI Rules

AI MUST NOT describe stale data as current.

If stale data materially affects an answer, the AI response MUST communicate the freshness limitation.

---

## 11. Hydrological Corridor Graph

Spec 264 SHALL add a hydrological relationship model above isolated monitoring stations.

### 11.1 Core Objects

```ts
interface HydroNode {
  nodeId: string;
  type:
    | "gauge"
    | "confluence"
    | "dam"
    | "reservoir"
    | "city"
    | "control_point";
  geometry: GeoJSON.Point;
}

interface HydroSegment {
  segmentId: string;
  upstreamNodeId: string;
  downstreamNodeId: string;

  riverName?: string;
  lengthKm?: number;

  flowDirection: "upstream_to_downstream";
}
```

### 11.2 Required Capabilities

The graph SHALL support:

- upstream station discovery;
- downstream station discovery;
- corridor grouping;
- basin/sub-basin membership;
- nearest upstream observation;
- nearest downstream observation;
- historical trend comparison;
- anomaly propagation queries.

### 11.3 Prediction Safety

Travel-time or arrival-time estimates MUST NOT be generated unless a supported model exists.

If no validated model exists, the system MUST report only observed relationships and trends.

---

## 12. Impact Assessment Engine

Spec 264 SHALL define a reusable spatial impact assessment capability.

### 12.1 Inputs

Possible inputs include:

- hazard geometry;
- administrative boundaries;
- population rasters;
- building footprints;
- road networks;
- hospitals;
- shelters;
- schools;
- utilities;
- critical infrastructure;
- transport hubs;
- user-defined assets.

### 12.2 Impact Result

```ts
interface ImpactAssessment {
  assessmentId: string;
  hazardEventId?: string;
  observationId?: string;

  assessedAt: string;

  areaKm2?: number;
  affectedAreaKm2?: number;
  affectedAreaPercent?: number;

  populationExposure?: {
    estimatedCount?: number;
    methodology?: string;
  };

  buildings?: {
    exposedCount?: number;
  };

  criticalFacilities?: ImpactedFacility[];

  roads?: ImpactedRoadSegment[];

  administrativeAreas?: AdministrativeImpact[];

  methodology: MethodologyReference;

  dataClass: "derived";

  lineage: DataLineageReference[];
}
```

### 12.3 Administrative Impact

The engine SHOULD support:

```text
Hazard Geometry
   ×
Administrative Boundary
   ×
Exposure Dataset
   ×
Critical Infrastructure
   =
Administrative Impact
```

### 12.4 Interpretation

All outputs from the Impact Assessment Engine MUST be marked as `derived`.

---

## 13. Community Incident Trust Model

Citizen/community reports SHALL use an explicit trust model.

```ts
type VerificationState =
  | "unverified"
  | "community_supported"
  | "disputed"
  | "organization_verified"
  | "authority_verified"
  | "superseded"
  | "expired";
```

### 13.1 Critical Rule

```text
COMMUNITY VOTES ≠ VERIFICATION
```

Votes MAY affect ranking or visibility, but SHALL NOT automatically set:

```text
organization_verified
authority_verified
```

### 13.2 Community Report

```ts
interface CommunityIncidentReport {
  reportId: string;
  reporterRef?: string;

  hazardType: string;
  reportedAt: string;

  geometry: GeoJSON.Geometry;

  text?: string;
  media?: EvidenceMediaRef[];

  verificationState: VerificationState;

  communitySignals?: {
    supports: number;
    disputes: number;
  };

  expiresAt?: string;

  lineage: DataLineageReference[];
}
```

---

## 14. Evidence & Media Provenance

Every uploaded evidence file SHALL retain processing provenance.

### 14.1 Media Evidence Contract

```ts
interface EvidenceMedia {
  mediaId: string;

  originalHash: string;
  transformedHash?: string;

  uploadedAt: string;

  transformations?: MediaTransformReceipt[];

  retentionPolicyId?: string;

  accessPolicy: string;
}
```

### 14.2 Privacy Transform Receipt

```ts
interface MediaTransformReceipt {
  transformId: string;

  performedAt: string;

  exifRemoved?: boolean;
  gpsRemoved?: boolean;
  resized?: boolean;
  transcoded?: boolean;
  faceBlurred?: boolean;

  inputHash: string;
  outputHash: string;

  transformerVersion: string;
}
```

### 14.3 Required Behavior

Sensitive metadata SHOULD be removed according to policy before public redistribution.

The transformation record MUST remain auditable.

---

## 15. Camera & External Media Access Policy

Spec 264 SHALL standardize how external CCTV/media sources are accessed.

```ts
type MediaAccessMode =
  | "embedded"
  | "direct_client"
  | "external_link"
  | "proxy_allowed"
  | "metadata_only";
```

### 15.1 Camera Source Object

```ts
interface CameraSource {
  cameraId: string;
  providerId: string;

  geometry: GeoJSON.Point;

  accessMode: MediaAccessMode;

  redistribution:
    | "allowed"
    | "restricted"
    | "unknown";

  attributionRequired?: boolean;

  termsUrl?: string;

  streamOrImageUrl?: string;

  lastBuildCheck?: string;
  runtimeHealth?: SourceHealthState;
}
```

### 15.2 Rule

A successful build-time validation MUST NOT be represented as current runtime availability.

---

## 16. Data Rights & Attribution Registry

All external emergency datasets SHALL reference a data-rights record.

```ts
interface DataRightsRecord {
  rightsId: string;

  provider: string;
  dataset: string;

  licenseName?: string;
  licenseUrl?: string;

  commercialUse:
    | "allowed"
    | "restricted"
    | "unknown";

  redistribution:
    | "allowed"
    | "restricted"
    | "unknown";

  derivativeWorks:
    | "allowed"
    | "restricted"
    | "unknown";

  caching:
    | "allowed"
    | "restricted"
    | "unknown";

  retention?: string;

  attributionRequired?: boolean;
  attributionText?: string;

  termsCheckedAt?: string;

  notes?: string;
}
```

### 16.1 Mandatory Principle

The software license of SmartAIHub or an upstream open-source project SHALL NOT be assumed to transfer to third-party data.

---

## 17. Unified Emergency Timeline

Spec 264 SHALL define one logical timeline spanning heterogeneous sources.

Possible timeline entries:

- satellite passes;
- radar frames;
- river gauge observations;
- rainfall observations;
- official warnings;
- cyclone track updates;
- earthquake observations;
- citizen reports;
- CCTV snapshots/availability events;
- road closures;
- route disruptions;
- emergency vehicle movement;
- shelter changes;
- incident status changes.

### 17.1 Timeline Event Contract

```ts
interface EmergencyTimelineEvent {
  timelineEventId: string;

  timestamp: string;
  eventType: string;

  sourceId?: string;
  hazardEventId?: string;

  dataClass?: HazardDataClass;

  geometry?: GeoJSON.Geometry;

  payloadRef: string;

  provenance: DataLineageReference[];
}
```

### 17.2 Playback

Spec 262 SHOULD be able to request:

```ts
getEmergencyStateAt(timestamp)
```

Spec 264 SHALL resolve the relevant temporal state across sources.

---

## 18. Incident-State Sharing

The platform SHALL support shareable operational state.

A shared state MAY include:

```ts
interface SharedEmergencyViewState {
  timestamp?: string;

  viewport?: {
    center: [number, number];
    zoom: number;
    bearing?: number;
    pitch?: number;
  };

  activeLayers?: string[];

  selectedHazardEventId?: string;
  selectedObservationId?: string;

  selectedRouteId?: string;

  filters?: Record<string, unknown>;

  language?: string;
}
```

The state MUST NOT embed secrets or private source credentials.

---

## 19. PWA & Degraded Field Mode

Spec 264 SHALL define emergency-specific mobile resilience behavior.

### 19.1 Required Capabilities

Where supported:

- installable PWA;
- low-bandwidth mode;
- source freshness indicators;
- offline/degraded state banner;
- cached metadata;
- safe cached basemap/config where licensing permits;
- delayed synchronization;
- reconnect reconciliation;
- upload retry;
- queued community report submission;
- minimal-field UI;
- battery-aware background behavior.

### 19.2 Offline Safety

Offline cached data MUST show:

- cached-at time;
- source observation time;
- stale/degraded status.

Offline mode MUST NOT imply that old data is live.

---

## 20. AI Safety Semantics

AI-generated emergency summaries SHALL preserve data semantics.

### 20.1 Required Language Rules

The AI MUST distinguish:

- "ตรวจพบ/วัดได้" for observation;
- "ประมาณ/คำนวณ" for derived;
- "คาดการณ์" for forecast;
- "มีผู้ใช้รายงาน" for crowdsourced;
- "ยังไม่ยืนยัน" for unverified reports.

### 20.2 Prohibited Semantic Upgrades

AI SHALL NOT:

- convert a derived estimate into a measured fact;
- convert community votes into verification;
- convert stale data into current data;
- convert missing data into no hazard;
- convert a model output into an official warning;
- hide material source conflicts;
- omit relevant freshness limitations.

### 20.3 Provenance in Agent Context

Agent/tool context SHOULD include:

```ts
interface AgentHazardContext {
  value: unknown;

  dataClass: HazardDataClass;

  sourceId: string;

  observedAt?: string;
  freshness: FreshnessState;

  verificationState: VerificationState;

  confidence?: ConfidenceDescriptor;

  lineage: DataLineageReference[];
}
```

---

## 21. Chat & Task Control Integration

SmartAIHub Chat and Task Control SHALL be able to query and act on Spec 264 capabilities.

Example intents:

```text
แสดงเฉพาะพื้นที่ที่ตรวจพบน้ำท่วมจริง
```

```text
แยกพื้นที่ที่เป็น satellite observation ออกจากพื้นที่ที่เป็น DEM estimate
```

```text
สถานี upstream จุดไหนเปลี่ยนเร็วที่สุดใน 3 ชั่วโมงที่ผ่านมา
```

```text
โรงพยาบาลใดอยู่ในพื้นที่ได้รับผลกระทบ
```

```text
แสดงรายงานประชาชนที่ยังไม่ยืนยัน
```

```text
ย้อนแผนที่ไปดูสถานการณ์เมื่อ 06:00
```

```text
หาเส้นทางสำรองสำหรับรถพยาบาล โดยหลีกเลี่ยงถนนที่มีรายงานน้ำท่วม
```

The Chat/UI SHALL surface provenance and uncertainty where material.

---

## 22. MCP Capability Surface

Spec 264 SHOULD expose emergency intelligence capabilities through Spec 260 MCP.

Suggested logical capabilities:

```text
hazard.get_event
hazard.list_events
hazard.get_state_at_time

hazard.list_observations
hazard.get_observation

hazard.get_source_health
hazard.get_source_freshness

hazard.get_upstream_nodes
hazard.get_downstream_nodes

hazard.assess_impact
hazard.get_affected_admin_areas
hazard.get_exposed_facilities
hazard.get_affected_roads

hazard.list_community_reports
hazard.get_report_trust_state

hazard.get_timeline

hazard.get_data_rights
```

Actual MCP naming MUST follow the existing SmartAIHub MCP naming conventions.

Spec 264 MUST NOT create a parallel MCP server.

---

## 23. REST/API Extensions

Any new REST endpoints SHALL be implemented through the existing Spec 260 API namespace or the platform's established versioned API conventions.

Possible logical routes:

```text
GET /hazards/events
GET /hazards/events/:id
GET /hazards/events/:id/timeline

GET /hazards/observations
GET /hazards/observations/:id

GET /hazards/state-at

GET /hazards/sources/:id/health

GET /hydrology/nodes/:id/upstream
GET /hydrology/nodes/:id/downstream

POST /hazards/impact-assessments
GET  /hazards/impact-assessments/:id

GET /community/incidents
GET /community/incidents/:id

GET /data-rights/:sourceId
```

These are logical interface examples; implementation SHALL conform to existing routing standards.

---

## 24. Eventing

Spec 264 SHALL reuse existing eventing infrastructure.

Suggested event types:

```text
hazard.observation.created
hazard.observation.updated

hazard.event.created
hazard.event.updated
hazard.event.resolved

hazard.source.delayed
hazard.source.stale
hazard.source.unavailable
hazard.source.recovered

hazard.impact.generated
hazard.impact.updated

community.report.created
community.report.disputed
community.report.verified
community.report.expired

hydrology.threshold.crossed
```

No new execution authority SHALL be introduced.

---

## 25. Storage Model

Spec 264 MAY require additive tables or collections but MUST reuse platform identity, tenant, auditing, and job-control primitives.

Suggested logical entities:

```text
hazard_events
hazard_observations
hazard_observation_conflicts

hazard_source_health

satellite_passes
satellite_scenes

hydro_nodes
hydro_segments

impact_assessments
impact_assessment_features

community_incident_reports
community_incident_votes
community_incident_verifications

evidence_media
media_transform_receipts

camera_sources

data_rights_registry

emergency_timeline_events
shared_emergency_view_states
```

### 25.1 Tenant Isolation

All tenant-owned records MUST preserve tenant isolation consistent with the SmartAIHub multi-tenant architecture.

Public emergency datasets MAY be global/shared only through explicit platform-level policy.

---

## 26. Caching Rules

Caching SHALL respect:

- source license;
- provider terms;
- freshness policy;
- privacy policy;
- retention policy;
- tenant visibility;
- authoritative source requirements.

A cache record SHOULD include:

```text
sourceObservedAt
sourcePublishedAt
cachedAt
expiresAt
staleAt
rightsId
```

---

## 27. Security

Spec 264 SHALL inherit platform security controls.

Additional emergency-specific requirements:

- sanitize user-submitted text;
- media malware scanning where supported;
- privacy metadata stripping;
- signed upload flows;
- tenant-aware access control;
- rate limiting for public reports;
- abuse/spam detection;
- reporter privacy protection;
- source credential isolation;
- no provider secrets in browser-visible state unless provider contract explicitly requires client-side keys and platform policy allows it.

---

## 28. Auditability

The system MUST be able to answer:

- Which source produced this value?
- When was it observed?
- When was it fetched?
- Has it become stale?
- Was it transformed?
- Was it estimated?
- Was it forecast?
- Was it user reported?
- Who verified it?
- Which data contributed to this impact assessment?
- Which model/version produced a derived value?
- Which data rights applied at the time?

---

## 29. Operational Alert Rules

Spec 264 MAY support alert generation but MUST distinguish alert provenance.

```ts
type AlertOrigin =
  | "authority"
  | "provider"
  | "platform_rule"
  | "model"
  | "community";
```

UI and AI MUST NOT make a platform/model alert appear to be an authority-issued warning.

---

## 30. Integration with Emergency Mobility & Route Coordination

Spec 264 SHALL integrate hazard intelligence with the previously defined emergency mobility and route coordination capabilities.

Relevant outputs include:

- blocked or potentially blocked road segments;
- hazard-intersecting route segments;
- access constraints;
- road confidence/freshness;
- safe-route candidates;
- route-change events;
- transport priority context.

Route decisions SHOULD consider:

```text
hazard observation
+ derived impact
+ official closure
+ crowdsourced report
+ source freshness
+ verification state
```

The routing subsystem MUST preserve the source class and confidence of restrictions.

A crowdsourced road closure SHALL NOT automatically have the same authority weight as an official closure.

---

## 31. Integration with Spec 224

Spec 264 SHALL use Spec 224 / orchestration kernel for long-running or multi-step work when applicable.

Examples:

- ingest → normalize → assess impact → alert;
- receive satellite pass → compare → generate impact → publish;
- receive report → moderation → verification → map update;
- source stale → retry/recover → update health state.

Spec 264 MUST NOT introduce new durable execution authority.

---

## 32. Integration with Spec 262

Spec 262 SHOULD consume Spec 264 metadata to visualize:

- observation vs derived vs forecast vs crowdsourced;
- stale/degraded state;
- uncertainty/confidence;
- source attribution;
- timeline state;
- event grouping;
- impact areas;
- hydrological corridors;
- verification state;
- official vs non-official alerts.

Map legends and tooltips MUST preserve these semantics.

---

## 33. UI/UX Requirements

### 33.1 Map-first Decision Interface

The emergency UI SHOULD prioritize:

```text
What is happening?
Where?
How fresh is the information?
How certain is it?
What is affected?
What should be inspected next?
```

instead of exposing only raw GIS layers.

### 33.2 Suggested Decision Panels

Possible panels:

- current situation summary;
- alerts requiring attention;
- affected administrative areas;
- source health;
- upstream changes;
- critical facility exposure;
- road disruption;
- community reports;
- latest observation timeline.

### 33.3 Layer Labeling

Each layer SHOULD be clearly labeled with:

```text
Source
Data Class
Observed Time
Freshness
Verification
Method
```

where relevant.

---

## 34. Internationalization

All semantic states MUST use stable internal codes and localized display labels.

The system SHALL NOT encode logic based on Thai or English UI strings.

At minimum, implementation SHOULD support:

- Thai;
- English.

---

## 35. Accessibility

Emergency UI SHALL support:

- keyboard navigation where applicable;
- semantic labels;
- high-contrast state distinctions;
- non-color-only hazard state indicators;
- mobile touch targets;
- screen-reader text for alert severity and data freshness.

---

## 36. Performance

The system SHOULD:

- simplify large polygons for display without modifying canonical geometry;
- use vector tiling where appropriate;
- avoid transferring unnecessary source payloads;
- paginate large timelines;
- precompute high-demand impact intersections when safe;
- preserve exact source data separately from display-optimized artifacts.

---

## 37. Failure Modes

### 37.1 Provider Failure

When a provider fails:

- preserve last-known observation;
- mark source degraded/stale/unavailable;
- show data age;
- do not silently hide the source;
- do not substitute another source without attribution.

### 37.2 Model Failure

When a derived model fails:

- retain underlying observations;
- mark derivation unavailable;
- do not generate synthetic values.

### 37.3 Conflicting Data

When sources conflict:

- preserve both;
- identify source/time;
- explain disagreement when possible;
- allow analyst review.

### 37.4 Timeline Gaps

Missing intervals SHALL be represented as gaps, not interpolated unless an explicit interpolation method is applied and marked `derived`.

---

## 38. Data Retention

Retention MUST be policy-driven.

Examples:

- official observations: provider/platform policy;
- satellite metadata: source terms;
- community reports: configurable retention;
- community media: privacy/legal policy;
- derived impact outputs: audit and replay needs;
- source-health events: operational retention.

No hard-coded 30-day rule is required globally.

---

## 39. Testing Requirements

### 39.1 Unit Tests

Must cover:

- data-class invariants;
- timestamp semantics;
- source freshness;
- verification transitions;
- trust model;
- impact derivation labeling;
- rights policy;
- route restriction authority weighting.

### 39.2 Integration Tests

Must verify:

- Spec 260 → Spec 264 data flow;
- Spec 264 → Spec 262 visualization metadata;
- MCP semantic preservation;
- API semantic preservation;
- timeline replay;
- impact assessment;
- stale source behavior;
- community report lifecycle.

### 39.3 Safety Tests

Required cases:

1. derived depth never appears as measured depth;
2. stale river reading never appears as current;
3. unknown satellite coverage never appears as no flood;
4. community vote never creates authority verification;
5. forecast never appears as observation;
6. source conflict is preserved;
7. official and platform alerts remain distinguishable;
8. missing source rights never become automatically reusable;
9. cached offline data displays age;
10. route engine preserves restriction provenance.

---

## 40. Acceptance Criteria

Spec 264 is implementation-complete only when:

- [ ] data classification contract is implemented;
- [ ] canonical temporal fields are preserved;
- [ ] no-data/no-hazard semantics are distinct;
- [ ] satellite pass or equivalent temporal observation model is supported;
- [ ] hazard event aggregation is implemented;
- [ ] source health/freshness is exposed;
- [ ] hydrological graph queries work;
- [ ] impact assessment produces derived outputs with lineage;
- [ ] community trust model is implemented;
- [ ] media privacy/provenance receipts exist;
- [ ] camera/media access policy exists;
- [ ] data rights registry is enforceable;
- [ ] emergency timeline can replay historical state;
- [ ] shareable emergency state is supported;
- [ ] degraded/offline mode exposes stale state clearly;
- [ ] AI context receives provenance/classification;
- [ ] AI output safety semantics are tested;
- [ ] MCP/API preserve the same semantics;
- [ ] Spec 262 displays classification/freshness/verification;
- [ ] no new execution authority was introduced;
- [ ] tenant isolation and audit controls pass;
- [ ] route coordination can consume hazard restrictions with provenance.

---

## 41. Migration / Adoption Strategy

Because Spec 260 and Spec 262 are already under development, adoption SHALL be additive.

### Phase 1 — Semantic Foundation

Add:

- data class;
- freshness;
- verification state;
- temporal timestamps;
- provenance;
- rights references.

No existing behavior SHALL be removed.

### Phase 2 — Temporal & Event Layer

Add:

- temporal observation;
- satellite pass;
- hazard event;
- emergency timeline.

### Phase 3 — Intelligence Layer

Add:

- hydrological graph;
- impact assessment;
- source conflict model.

### Phase 4 — Trust & Evidence

Add:

- community trust states;
- evidence provenance;
- media transforms;
- external camera policy.

### Phase 5 — UX & Agent Integration

Add:

- Spec 262 visualization semantics;
- Chat/Task Control intents;
- MCP capabilities;
- degraded PWA mode;
- shareable temporal state.

### Phase 6 — Operational Integration

Connect:

- alerts;
- route coordination;
- emergency tracking;
- external operational systems.

---

## 42. Backward Compatibility

Existing Spec 260/262 consumers MUST continue to function.

Where older records lack Spec 264 fields:

```text
dataClass = unknown/migration-required
freshness = unknown
verificationState = legacy/unknown
```

The implementation MUST NOT invent semantic certainty during migration.

---

## 43. Observability

Operational metrics SHOULD include:

- source fetch success rate;
- source latency;
- freshness age;
- stale-source duration;
- event aggregation latency;
- impact computation latency;
- report moderation queue size;
- community-report dispute rate;
- timeline query latency;
- MCP error rate;
- degraded/offline reconnect rate.

---

## 44. Reference Use of External Systems

External projects such as SIAHRA MAY be studied as:

- UX reference;
- source-adapter reference;
- operational data-source reference;
- temporal-hazard reference;
- community-report reference.

They MUST NOT be treated as canonical SmartAIHub architecture.

Any code reuse MUST be reviewed independently for:

- source-code license;
- third-party data rights;
- attribution requirements;
- operational assumptions;
- security;
- production suitability.

---

## 45. Final Architectural Principle

Spec 264 exists to transform emergency data from disconnected layers into interpretable, temporally coherent, provenance-preserving operational intelligence.

The intended progression is:

```text
OBSERVE
   ↓
CLASSIFY
   ↓
NORMALIZE
   ↓
RELATE
   ↓
ASSESS IMPACT
   ↓
EXPLAIN UNCERTAINTY
   ↓
VISUALIZE
   ↓
DECIDE
   ↓
COORDINATE
   ↓
TRACK
   ↓
AUDIT
```

SmartAIHub SHALL preserve the distinction between what was observed, what was calculated, what was forecast, and what was reported by the public at every stage.

---

# Appendix A — Recommended Type Definitions

```ts
type HazardDataClass =
  | "base"
  | "observation"
  | "derived"
  | "forecast"
  | "crowdsourced";

type VerificationState =
  | "unverified"
  | "community_supported"
  | "disputed"
  | "organization_verified"
  | "authority_verified"
  | "superseded"
  | "expired";

type SourceHealthState =
  | "healthy"
  | "delayed"
  | "stale"
  | "degraded"
  | "unavailable"
  | "unknown";

type MediaAccessMode =
  | "embedded"
  | "direct_client"
  | "external_link"
  | "proxy_allowed"
  | "metadata_only";
```

---

# Appendix B — Required Provenance Fields

At minimum, operational hazard outputs SHOULD be traceable to:

```text
source
source dataset
source record
observed time
acquired time
published time
fetched time
data class
verification state
freshness
methodology
model/version if derived
license/rights record
transformation history
parent observation(s)
```

---

# Appendix C — Implementation Guardrails

1. Do not duplicate Spec 260.
2. Do not duplicate Spec 262.
3. Do not create a second orchestration authority.
4. Do not silently reinterpret hazard semantics.
5. Do not hide data age.
6. Do not equate missing data with safety.
7. Do not equate community popularity with verification.
8. Do not equate model output with official warning.
9. Do not discard conflicting source evidence.
10. Do not reuse external data without rights review.
11. Preserve tenant isolation.
12. Preserve provenance end-to-end.
13. Fail closed on uncertainty-sensitive transformations.
14. Keep public emergency UX understandable to non-GIS users.
15. Keep mobile/tablet operation first-class.
