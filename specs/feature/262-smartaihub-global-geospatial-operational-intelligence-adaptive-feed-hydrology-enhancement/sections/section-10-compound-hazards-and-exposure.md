# Section 10 — Compound Hazards, Defenses, Transport, Water Quality and Exposure

**Status:** planned. **Dependencies:** Sections 06–09 approved source/capture/jobs, canonical observations, topology and region-specific provider facts; Section 02 geo/auth contracts. Section 11 supplies capability coverage; Section 14 controls privacy/disclosure; Section 17 controls models, simulations and replay. Shared schemas, DB/migrations/journal, route contracts and executor registration are conductor-serial ownership.

## Outcome and boundaries

Combine source-backed rainfall/runoff, river, coastal/tide/surge/waves, flood extent, defenses, hydraulic operations, water quality, roads/routes and exposed assets into bounded, time-aware impact context. Preserve driver and evidence lineage. Compound means relevant factors coexist; it does not grant a model license to assert causal certainty. Potential exposure is not observed impact, and observed impact is not confirmed damage. Individual route availability does not mean sufficient evacuation capacity or clearance. Simulated breach/failure scenarios are isolated from live products and cannot trigger public or operational evacuation alerts.

Spec260 owns incident/case identity, verified claims, route IDs, action permissions, audit, public geometry and canonical job authority. Reuse Sections 06–09 references and source/capture provenance. Do not create duplicate event, road-closure, route, facility or job authority. Do not issue evacuation advice or outbound agency/control-system writes here.

## Tests first

Fixture-only tests with fixed event times, model/policy revisions, geography and audience. Add tests before implementation:

1. `packages/shared/src/geospatial/compoundHazards.test.ts` (new): compose typed drivers `FLUVIAL_RAINFALL_RUNOFF`, `PLUVIAL_RAINFALL`, `RESERVOIR_RELEASE`, `DAM_OR_LEVEE_FAILURE`, `TIDAL_BACKWATER`, `STORM_SURGE`, `WAVE_OVERTOPPING`, snow/ice/glacial, burn-scar, groundwater, drainage failure, tsunami, other/unknown; unsupported drivers produce explicit limitation. Confirm rainfall-only logic never infers snowmelt, dam failure, surge or tsunami.
2. `packages/shared/src/geospatial/exposureIntersection.test.ts` (new): potential corridor vs observed affected vs confirmed damaged; geometry intersection preserves CRS, holes/islands, antimeridian and source revision; no inference from nearby/radius alone; aggregated public exposure cannot reconstruct household/facility endpoints through repeated queries.
3. `apps/web/server/services/__tests__/compoundImpactService.test.ts` (new): freshness/effective-window alignment, source independence/correlation, deterministic and estimated fact separation, official authority preserved, uncertainty contributors, model validation envelope and stale-data `BLOCK`; graph/forecast/outage gaps cannot be coerced into a zero/normal reading.
4. `apps/web/server/services/__tests__/waterQualityContext.test.ts` and `routeExposure.test.ts` (new): parameter/unit/method/threshold basis and source time preserved; incomplete measure never becomes potable/safe; official closure cannot be overridden by basemap road renaming, stale route-open state or report volume; original user-report geometry remains distinct from snap-to-road enrichment.
5. Evacuation and scenario tests: individual route openness does not imply mass-capacity; bridge closure changes any modeled clearance estimate; include pass-through demand only with sourced assumption; missing underground-drain coverage is surfaced; exercise/simulation outputs are tenant/audience isolated and cannot publish/notify or mutate real state.
6. DB/service tests only after serial schema design: source/capture/model/policy and revision FKs are tenant-safe, correction and replay are idempotent, and projection writes are fenced by current canonical `worker_jobs` lease.
7. Component/projection tests: coastal tide is not mislabeled inland flood; high-sea alert is not confirmed road inundation; potential exposure does not become confirmed household flooding; hazard severity, confidence, source, freshness and coverage remain distinct and accessible.

Cover acceptance scenarios for coastal driver provenance, exposure distinctions, defenses, water quality, road status, evacuation capacity, exercise isolation and missing infrastructure coverage. Section 18 owns the full end-to-end scenario set.

## Implementation details and files

Create pure contracts/functions in `packages/shared/src/geospatial/`:

- `compoundHazards.ts`: typed `HydroDriverContext`, `CompoundHazardSnapshot`, effective windows, canonical source/observation/forecast/official-alert/model refs, capability requirements and uncertainty contributors. Keep observed, forecast, official instruction, scenario and derived estimates separate.
- `exposure.ts`: typed `ExposureAsset`, `PotentialExposure`, `ObservedImpact`, `ConfirmedDamage`, `ExposureSummary` and aggregation/generalization labels. Supported assets include community, school, hospital, shelter, eldercare, rescue/police, road/rail/airport/port, power/telecom, water/wastewater, fuel, business cluster, agriculture and other critical facility. Preserve asset source/validity and disclosure policy refs.
- `waterQuality.ts`: parameter, method, unit, observed time, sample/source and threshold-basis contract. Do not produce a drinking-water safety conclusion from incomplete measurements.
- `routeExposure.ts`: projection over the existing authoritative road/closure/routing facts. Separate observed closure/restriction from calculated route/corridor capacity and estimated clearance.
- Use existing geo normalization/intersection utilities for geodesic/global geometry; do not implement a parallel CRS or route identity system.

Implement bounded server composition in `apps/web/server/services/compoundImpactService.ts`, `exposureIntersectionService.ts`, `waterQualityContextService.ts` and `routeExposureService.ts` (new). Read only approved Section 06 captures and typed Section 07–09 facts. Keep unsupported contributors visible in completeness/coverage metadata. De-duplicate correlated evidence using the source independence group; more feeds do not automatically mean stronger confidence. Apply per-area/time candidate budgets and safe partial results so one giant basin or malformed feature cannot starve unrelated viewports.

Version a deterministic rule/policy before any combined score. Quantitative depth/arrival/clearance or probability requires a Section 17 validated model with basin/horizon/driver validity envelope, calibration/backtest evidence, input freshness and uncertainty. Without it, emit qualitative structural context only. A `DAM_OR_LEVEE_FAILURE` scenario is explicitly simulation-scoped and cannot share publish/notification side effects with a live event. An AI model can summarize authorized references but cannot overrule source authority, deterministic stale-data `BLOCK` or operator permissions.

Use canonical jobs only for work beyond a bounded request budget, via `createCanonicalJobInTransaction` and current executor registration in `apps/web/server/services/jobControlPlane.ts` / worker modules; bind idempotency to tenant, event, source revisions and policy/model revision. Every result write verifies lease/fencing and reauthorizes before publish. Shared data/schema/API/migration/job registry edits are serial conductor-owned. Do not modify Cloudflare Workers into a duplicate executor; Cloudflare and Linux/tunnel ingress reach the same canonical platform services.

Projection belongs in the existing map/feed contracts and route manifest (`packages/shared/src/emergencyRouteManifest.ts`), not a new map route. Server selects audience and applies Spec260 geometry disclosure, privacy generalization, role, tenant and jurisdiction rules. Public output should show aggregated potential exposure without exact sensitive assets; admin/operations detail is separately authorized. Cursor or repeated geometry requests cannot be used to reconstruct protected endpoints.

## Safety, privacy and operations

- Driver, event, warning, observation, forecast, simulation and model-inference fact classes carry distinct source refs, revision, clocks, quality/freshness and uncertainty. No unsupported driver is silently omitted when it materially limits interpretation.
- Static defense geometry does not imply crest height, integrity or breach. A verified breach report uses its own geometry/revision and human/source authority; hypothetical breach geometry is scenario-only.
- Road closure and service status follow canonical source authority/revision. Base-map attributes or newer unverified citizen volume cannot reopen an official closure. Route accessibility, checkpoint/border passage and capacity require their own verified capability.
- Water-quality and utility data must preserve test method/threshold basis. Never infer potability, public health status or safe use from a partial sample.
- Public population/household exposure is aggregated at a privacy-approved scale; sensitive facility or household geometry is not included in feeds, Chat context, analytics or errors. Apply anti-differencing limits.
- Freshness gates fail closed for actions. Stale data may remain historical with age; missing data is not zero, safe, or no exposure.

## UI/UX Contract

### Target User / JTBD
Authorized public users and emergency operators need this section’s bounded capability through the existing map/feed and approved operator surfaces.

### Surface Inventory

| Surface | Existing integration | Section 10 behavior |
|---|---|---|
| Public emergency map/feed | Existing `/disaster/map` and feed | Show source-backed compound context and generalized potential exposure only. |
| Existing AI Chat & Feedback | Canonical `FeedbackButton` / `ChatView` | Explain authorized selected-item evidence through removable, scoped context; no new chat surface or auto-send. |
| Operations/admin | Existing authorized Spec260 operations and Section 16 provider/admin surface | Expose model/source quality and reconciliation to permitted operators; no new public control panel. |

### Component Map

| Component/service | Ownership |
|---|---|
| Shared `compoundHazards.ts`, `exposure.ts`, `waterQuality.ts`, `routeExposure.ts` | Typed fact composition and safe deterministic projection. |
| Server compound/exposure/route/water-quality services | Bounded, authorized query and evidence provenance. |
| Existing map/feed components | Display projected classes; Section 03/04 owns common controls/layout. |

### State Matrix

| State | Required presentation |
|---|---|
| Loading | Keep current safe map/feed visible; indicate which source families are loading. |
| Success | Describe observed drivers and their time/source separately from inferred context. |
| Partial/unknown | Name missing capability (e.g. drainage/road coverage) and its consequence; never imply absence. |
| Stale/unavailable | Mark age and disable freshness-sensitive action; retain safe historical context where allowed. |
| Potential exposure | Explicitly say potential exposure, not confirmed damage or household flooding. |
| Scenario | Clearly mark simulation/exercise; cannot appear as live public warning or trigger real actions. |
| Sensitive/unauthorized | Aggregate or omit protected details with safe reason. |

### Responsive Matrix

| Viewport | Required behavior |
|---|---|
| 390x844 mobile | Compound drivers/exposure use compact readable list and do not obscure map status. |
| 768x1024 tablet | Detail/source panel remains reachable and distinct from map controls. |
| 1440x900 desktop | Driver/fact-class/provenance hierarchy is scannable; no dense raw-data wall. |
| 360x800, 1024x768, 1280x800 | Verify no clipped labels, accidental horizontal overflow or hidden safety state. |

### Accessibility Acceptance

- Convey driver, fact class, potential/observed/confirmed, freshness and severity in text/semantics, not color alone.
- Keyboard and screen-reader paths can inspect each contributing source and uncertainty; keep focus stable when panels update.
- Announce material changes and scenario/real-state distinction without repeatedly announcing every sample.

### Copy Contract

- Thai and English. Use calm factual phrases: “potentially within impact area,” “observed,” “confirmed by source,” “scenario only,” “coverage unavailable.”
- Never say “safe”, “will flood”, “evacuate”, “potable” or “confirmed damage” unless the applicable canonical source/approval/model authority actually supports it.
- Explain uncertainty, time window and missing data in user-understandable text.

### Browser Evidence Required

Section 18 checks compound rainfall/river/coastal fixtures, route closure precedence, potential exposure, scenario isolation, missing coverage, keyboard/list equivalence and existing Chat context at mobile/tablet/desktop. No browser mock proves model validation or operational readiness.

## Completion evidence and external gates

Focused tests must show correct driver composition, temporal/freshness gates, provenance/uncertainty retention, exposure state distinctions, water-quality restraint, closure/capacity semantics, privacy/differencing limits and hard separation of simulation from live state. Local structural outputs cannot be described as validated flood or evacuation forecasts. External gates include verified provider rights/data, source authority approvals, calibrated model evidence, privacy/retention decisions, operational owner approval and production DB/deployment proof.
