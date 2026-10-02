# Spec 266 Compatibility Inventory: Specs 260 and 262

Checked against the current SmartSpecPro worktree on 2026-10-02. This inventory identifies owners and integration boundaries; it does not authorize cutover or a second registry.

| Capability | Current authority | Write / execution path | Spec 266 relationship | Cutover status |
| --- | --- | --- | --- | --- |
| Emergency source records | `emergency_intel_sources` (`emergencyIntelSources`) scoped by tenant and `sourceRef` | `spec260EmergencyEdge.ts` source routes validate policy/status; source URL alone never grants fetch authority | Map source/provider/dataset/rights references into Fabric after an explicit adapter; keep current policy authority | Not migrated; no dual write |
| Immutable raw captures | `emergency_intel_captures` (`emergencyIntelCaptures`) with content hash, object reference, observed/captured time and provenance | `geoSources/drizzlePersistence.ts` appends captures idempotently and never overwrites raw content | Map a capture to an EvidenceItem/source snapshot reference; raw bytes remain in approved private storage | Current capture tables remain authoritative |
| Hydrology stations and readings | `emergency_hydro_stations` and `emergency_hydro_observations` | `geoSources/refreshPipeline.ts` rechecks authorization, invokes a registered adapter, validates original bytes/hash, then appends normalized station/observation records | Use semantic, temporal, unit and geometry references while retaining source/capture/revision provenance | Current hydrology tables remain authoritative |
| Source refresh | Canonical `worker_jobs` and outbox with the server-owned `geo.source.refresh` job type | `acquisitionJob.ts` admits a deduplicated refresh; the Postgres node worker dispatches to the injected geo-source runtime and pipeline | Fabric may add request/evidence envelopes but cannot create a second queue, executor selection path or transport authority | Registered execution seam; runtime availability is composition-dependent |
| User geospatial watches | `emergency_geo_watches` plus `emergency_geo_watch_transitions` | Authenticated `spec260EmergencyEdge.ts` routes create/list/update/revoke watches with tenant+owner checks, expiry, idempotency and audit | Fabric may supply versioned spatial/temporal signals; it does not own watch lifecycle or notifications | Current watch tables/routes remain authoritative |
| Public emergency map | Spec 260 public emergency map API and established public projection | `EmergencyPublicMap.tsx` consumes public map items; `emergencyMapFeatures.ts` converts authorized public items to GeoJSON; chat handoff uses the shared map-context envelope | `GeoEvidenceFeature` is a typed projection boundary only; renderer integration must preserve Spec 260 authority and public redaction | No 266 feature store or renderer cutover |

## Authority checks

- Spec 266's current `registry.ts` resolver is pure and receives a snapshot; it does not read or write a competing registry.
- Spec 266 geometry/semantic/spatial helpers are pure calculations. They do not persist canonical emergency records or publish alerts.
- The only asynchronous refresh authority identified above is `worker_jobs` plus outbox. Research execution is registered on the same canonical control plane, not a new queue.
- No source catalog, capture, hydrology, watch, map API, or renderer cutover is claimed. Existing Spec 260/262 records and public emergency authority remain canonical.

## Files inspected

- `apps/web/drizzle/schema.ts` — `emergencyIntelSources`, `emergencyIntelCaptures`, `emergencyHydroStations`, `emergencyHydroObservations`, `emergencyGeoWatches`, `emergencyGeoWatchTransitions`.
- `apps/web/server/routes/spec260EmergencyEdge.ts` — source, capture/map, and authenticated watch routes.
- `apps/web/server/services/geoSources/refreshPipeline.ts`, `acquisitionJob.ts`, and `drizzlePersistence.ts` — authorized refresh, canonical job admission, and current append-only persistence ports.
- `apps/web/server/jobs/feature186JobTypes.ts` — server-owned Postgres node job allow-list.
- `apps/web/client/src/components/emergency/EmergencyPublicMap.tsx`, `emergencyMapFeatures.ts`, and shared emergency map-context contracts — public renderer/projection and chat handoff.
