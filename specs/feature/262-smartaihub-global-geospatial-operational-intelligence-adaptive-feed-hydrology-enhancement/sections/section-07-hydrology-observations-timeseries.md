# Section 07 — Canonical hydrology observations and time series

## Goal and dependencies

Persist and query canonical, provenance-rich gauge, rainfall and reservoir observations, then derive deterministic time-series trends and material-change signals. Depends on Section 06's approved acquisition, immutable capture/provenance and canonical `worker_jobs` lifecycle. Section 08 consumes canonical stations/observations for network and impact analysis; Section 09 supplies Thailand adapters/fixtures; Sections 14, 16 and 17 own privacy, operator controls, retention/replay. Do not implement provider fetching, map UI, public routes, a hydrology graph, probabilistic forecasting or a second event/job authority here.

Spec260 source/capture/claim records remain the provenance and human-review authority. Hydro observations are measured domain facts, not automatically verified public claims. Every reading retains source/capture revision and quality; freshness/absence is distinct from a zero value. Forecast estimates and official warnings are different fact classes and cannot be emitted by this trend engine.

## Tests first

Write these focused tests before schema/service behavior. Keep fixtures deterministic and timezone-explicit.

1. `packages/shared/src/geospatial/hydrologyContracts.test.ts` (new): parse valid/invalid station, waterbody, basin, gauge, rainfall and reservoir observations; reject non-finite values, invalid identifiers, impossible timestamps, unsupported units/CRS/datum, contradictory coordinates, malformed quality and invalid source/provenance refs. Preserve zero distinctly from missing/null.
2. `packages/shared/src/geospatial/hydrologyUnits.test.ts` (new): exact conversions for supported canonical units (e.g. water level m, discharge m³/s, rainfall mm, storage m³); reject unknown dimensions and missing conversion metadata. Verify raw value/unit are preserved alongside normalized value/unit and vertical datum is not silently converted without a declared datum transform.
3. `apps/web/server/services/__tests__/hydroObservationIngest.test.ts` (new): idempotent source/item/revision ingest; exact retransmission dedupes; changed revision creates immutable corrected observation/revision linkage; out-of-order and late-arriving samples are retained; future/implausible samples are quarantined or flagged; no stale lease may write. Tenant/source capture references must match.
4. `apps/web/server/services/__tests__/hydroTimeSeries.test.ts` (new): event-time query windows, watermark/late-data policy, gap detection, duplicate handling, missing/censored values, source outage/recovery, downsampling that preserves extrema and threshold crossings, retention cutoff, and deterministic results independent of ingestion order.
5. `packages/shared/src/geospatial/hydrologyTrend.test.ts` (new): deterministic 15m/1h/3h/6h/24h delta/rate/acceleration and categorical trend from valid observations; insufficient/stale/conflicting/censored data yields `UNKNOWN` or an explicitly low quality state; never extrapolate future values; threshold distance uses source-configured gauge datum and threshold revision.
6. `apps/web/server/services/__tests__/hydroMaterialChange.test.ts` (new): create/coalesce a feed change only on configured threshold crossing, rapid rate/acceleration, trend reversal, reservoir release change, source stale/recovery or equivalent material rule; ordinary sampling updates the current projection without an item per sample. Enqueue recompute transactionally through canonical worker_jobs/outbox and dedupe repeated triggers.
7. `apps/web/server/__tests__/hydroObservationMigration.test.ts` (new or existing migration test convention): schema/migration parity, tenant/source foreign keys, unique revision key, query indexes and additive upgrade/backfill behavior. Do not run against production.

## Canonical data model

Add shared, validated contracts in `packages/shared/src/geospatial/` (new):

- `hydrologyContracts.ts`: `HydroStationRef`, `HydroObservation`, `ReservoirObservation`, `HydroQuality`, `HydroFreshness`, `HydroMeasurement`, and `HydrologyTrendSnapshot`. Carry `sourceRef`, immutable `captureRef`, `sourceRevision`, `schemaVersion`, `observedAt` (provider event time), `receivedAt` (platform receive time), and `normalizedAt` (processing time). Do not collapse these clocks into one timestamp. Where no provider clock exists, state that explicitly and use receive time only as a tagged fallback; do not fabricate observation time.
- `hydrologyUnits.ts`: dimensional conversion registry with canonical storage/display units; retain raw magnitude, raw unit, normalized magnitude and normalized unit. Require explicit vertical datum and conversion provenance for water-level comparisons across gauges.
- `hydrologyTrend.ts`: pure deterministic trend calculation over sorted event-time samples. Emit observed deltas/rates only; use validated thresholds and a named policy revision; include sample count/window, quality, freshness, uncertainty/confidence reason and contributing source revisions. No future projection.

Minimum observation envelope:

```ts
interface HydroObservation {
  observationId: string;
  stationId: string;
  waterBodyId?: string;
  basinId?: string;
  metric: "water_level" | "discharge" | "rainfall";
  observedAt: string;
  receivedAt: string;
  normalizedAt: string;
  rawValue: number | null;
  rawUnit: string | null;
  normalizedValue: number | null;
  normalizedUnit: string | null;
  verticalDatumRef?: string;
  sourceRef: string;
  captureRef: string;
  sourceRevision: string;
  quality: "valid" | "suspect" | "estimated" | "missing" | "censored" | "rejected";
  freshness: "current" | "stale" | "delayed" | "unknown";
}
```

Reservoir observations use the same provenance/clocks and represent capacity, storage, percent storage, inflow, outflow and planned releases as typed metric observations; preserve `planned` versus measured values and source units. A missing metric is null with reason/status, never a numeric zero. Corrections append a new revision and identify the superseded observation; never mutate history in place.

## Additive database change — serial ownership

No matching canonical hydro time-series tables were found in the inspected emergency/shared code. Durable observation history is required by Spec262, so add the minimal additive schema in `apps/web/drizzle/schema.ts` and a new ordered migration under `apps/web/drizzle/` with the migration journal update. These are **conductor-serial-owned files**: section implementers must not edit them in parallel. Before implementation, recheck dirty diffs, latest migration/journal ordering, tenant/RLS conventions, retention policy and `emergency_intel_*` source/capture composite keys.

Schema intent (final Drizzle/SQL names chosen by the conductor and kept consistent):

- Station/measurement metadata references the approved tenant/source registry and canonical geographic refs; has stable station identity, provider revision, coordinates/CRS, optional vertical datum, jurisdiction, active state and timestamps. Never put private station locations into a public projection without the disclosure rules from Section 14.
- Append-only `hydro_observations` stores one measured metric per observation with `tenantId`, station/source/capture refs, source revision, observed/received/normalized timestamps, raw and normalized numeric value/unit, datum ref, quality/freshness, and supersession/correction link. Add tenant-scoped uniqueness on `(tenantId, sourceId, stationId, metric, sourceObservationRef, sourceRevision)` (or an equivalent stable provider revision key), tenant-safe composite FKs, range/enum checks, and indexes for `(tenantId, stationId, metric, observedAt DESC)` and `(tenantId, sourceId, receivedAt DESC)`.
- A separate current trend snapshot is optional and derived/rebuildable. Do not make it the source of truth. If query profiling proves it necessary, store policy/source revision, `asOf`, window/sample count, quality/freshness and computed fields; update via a canonical deduped job and permit full rebuild from append-only observations.
- Apply bounded row-retention/partitioning only after expected volume and legal retention are known. Preserve threshold crossings/extrema and audit/replay references. Rollback is additive: disable reads/writes, retain rows for approved retention, then use a separately reviewed migration if deletion is legally required. Never drop or rewrite existing Spec260 source/capture/claim data.

Schema, SQL migration, journal and migration tests are changed together and reviewed serially. Run schema drift/generation and focused local migration tests only after this ownership is accepted. Do not apply to production in this implementation phase.

## Ingestion, event time and quality

Ingestion accepts only Section 06's normalized, rights-approved capture envelope. Validate tenant/source/capture linkage, adapter contract version, station ownership, capture hash, idempotency and lease fence in the same transaction that inserts observations and emits lifecycle/audit evidence. Use event time for trend windows and received time for operational latency/watermark; order equal-time samples deterministically by source revision then stable ref. Late data is retained and causes bounded recomputation for affected station windows. Future timestamps, impossible physical bounds or jumps outside configured sensor tolerances become quarantined/suspect with reason; never silently drop or normalize them to valid.

Persist original CRS and raw coordinates with the station/source revision; normalize geometry through shared geographic CRS contracts from Section 02/04. Validate coordinate order, bounds and declared CRS before storage. No datum conversion without a versioned, tested transform; no geometry in an unspecified CRS. Vertical water-level datum is independent of horizontal CRS and must be explicit for cross-station comparisons. Units must be dimensionally valid; retain source unit so display/reprocessing can be audited.

Represent outages, expected silence, stale data and recovery explicitly from provider cadence/heartbeat metadata. Missing samples remain gaps, not zero rainfall/water level. Censored and estimated values retain their measurement flags. Correlated sensor feeds do not become independent evidence merely because they have separate source IDs; use Section 06's independence group and avoid inflated confidence. Public/signed-in/operations projection is not performed here; downstream projections reauthorize and generalize geometry.

## Trend and material-change computation

Compute fixed event-time windows (15m, 1h, 3h, 6h, 24h) from quality-eligible samples. Require a configured minimum sample count/window coverage; otherwise emit `UNKNOWN`, not a guessed stable trend. Deterministically derive current measured value, deltas, rate/hour and acceleration only when the time intervals and units are comparable. Preserve a confidence/quality explanation and data-age state. Categorical values are `RAPIDLY_RISING`, `RISING`, `SLIGHTLY_RISING`, `STABLE`, `SLIGHTLY_FALLING`, `FALLING`, `RAPIDLY_FALLING`, or `UNKNOWN`; thresholds are per metric/station policy revision and must not be guessed globally.

Material change detection coalesces frequent samples into an existing station/event feed thread. It may signal threshold crossing, rate/acceleration, reversal, configured upstream simultaneity (Section 08), reservoir measured/planned release change, source stale/recovered with material change, or observed extent change. Emit a new lifecycle revision/event only for material changes; retain sample history separately. Any recompute that exceeds the request budget uses canonical `worker_jobs` + transactional outbox, stable station/window/policy idempotency, lease/heartbeat/fencing and bounded retries. There is no new queue, and no auto-public claim or warning based solely on a computed trend.

## Completion evidence and gates

- Pure unit/CRS/trend tests establish deterministic conversions, timestamps, late-data behavior, quality gating and no extrapolation.
- Database tests prove append-only revision history, tenant/source/capture ownership, uniqueness/idempotency, query indexes and additive migration parity.
- Service tests prove retry/replay/correction preserve the canonical data and event lineage, stale jobs cannot write, and repeated samples are coalesced.
- Thailand provider fixtures and actual API terms/access belong to Section 09 and the final provider gate. Production migration application, calibrated thresholds/models, public disclosure approval and real provider coverage remain external gates; no local pass implies these are live or validated.

## UI/UX Contract

### Target User / JTBD
This section defines canonical observation/time-series processing; public and operator presentation is owned by Sections 05 and 16.

### Surface Inventory
No new screen or route. Observation-derived feed cards and operator health are consumed by the existing map/feed and admin surfaces.

### Component Map
Shared typed observations and backend services only; downstream projections reauthorize and generalize before display.

### State Matrix
Quality, freshness, delayed, missing and unknown remain typed server facts; owning UI sections map them to distinct display states without coercion to zero/current.

### Responsive Matrix
Not applicable to this backend-only section; consuming surfaces are tested by Sections 05, 16 and 18.

### Accessibility Acceptance
No UI authored here. Consumers must provide non-color quality/freshness labels and text equivalents per their owning contracts.

### Copy Contract
No user copy authored here. Preserve factual distinctions between measured, estimated, planned, missing and censored values.

### Browser Evidence Required
No standalone browser screen; Section 18 verifies an observation projection and its quality/freshness semantics in consuming UI.
