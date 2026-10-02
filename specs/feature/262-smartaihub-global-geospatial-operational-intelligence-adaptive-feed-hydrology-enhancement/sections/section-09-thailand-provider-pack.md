# Section 09 — Thailand Deep Intelligence Provider Pack

**Status:** planned; candidate API pages/datasets are not production proof. **Dependencies:** Section 06 approved source onboarding, capture and `worker_jobs` + outbox; Section 07 canonical observations; Section 08 topology/impact contracts. Section 10 consumes hazard/exposure facts; Sections 11–17 own capability coverage, localization, privacy, provider administration and governance. **Ownership:** Thailand adapter/normalizer/fixture modules under `geoSources/thailand/`. Shared source registry, DB/schema/migration/journal, common API contracts and job executor registry are conductor-serial owned.

## Outcome and boundaries

Create a replaceable, versioned `TH_INTELLIGENCE_PACK` that can report available, partial, degraded, stale, not configured or unsupported capabilities by actual geography and source. Candidate families include RID/SWOC, DWR, ONWR, EGAT, HII ThaiWater, GISTDA, DDPM/NDWC, TMD, tide sources, road/highway agencies and local authorities. The plan must not hard-code the claim that any endpoint, credential, schema, quota, license or redistribution permission is currently valid. Onboarding must verify each endpoint and capability independently. A public dataset page or successful API key test is not production readiness.

Adapters consume Section 06's approved source registry/capture contract; they do not become ad-hoc URL fetchers. Use Section 07's station/observation/trend types and Section 08's canonical entity bindings/topology. Keep raw responses private and bounded; retain data as measured/forecast/official-warning/derived fact classes with explicit provenance and source clock. No provider yields no automatic public warning or evacuation instruction.

## Tests first

Use fixture-only transports, sanitized sample payloads, deterministic clocks and contract versions. No live API/credential dependency in CI.

1. `apps/web/server/services/geoSources/thailand/__tests__/thailandPackManifest.test.ts` (new): unique stable pack ID/version; adapters are capability- and geography-scoped; every source declares contract version, expected cadence, rights/license/attribution state, permitted purpose, retention, failure policy and supported quality; incomplete/unverified source cannot be advertised as available; no frontend fork per source.
2. Add `apps/web/server/services/geoSources/thailand/__tests__/ridAdapter.test.ts`, `dwrAdapter.test.ts`, `tmdAdapter.test.ts`, `gistdaAdapter.test.ts` and `providerContractFixtures.test.ts` (new): use approved/sanitized fixtures only; assert source identity and schema fingerprints, timestamps/time zones, pagination/cursor, missing/sentinel semantics, CRS/coordinate order, units/vertical datum, stable IDs/revisions, geometry, attribution and canonical output. Add ONWR, EGAT, HII, DDPM/NDWC/tide/road adapters only after endpoint and terms evidence exists; until then tests assert their capabilities remain unconfigured, not fake success.
3. Adapter drift/safety tests: missing/unknown fields, null/sentinel vs zero, unexpected enum, invalid geometry, unsupported unit/datum, malformed/future timestamps, auth expiry, rate limit, outage, empty-but-healthy response versus expected silence, partial pagination, corrections/retractions and oversized payload. Breaking drift quarantines only affected records, marks the provider degraded and retains last-known safe output with stale label if policy allows.
4. Entity and observation mapping tests: provider aliases bind to canonical entities only by explicit authority crosswalk or reviewed matching; similar nearby stations do not auto-merge; source revisions remain separately attributable; planned releases never map to measured discharge; DWR village warning data preserves its source class and geography.
5. `apps/web/server/services/geoSources/thailand/__tests__/thailandAcquisitionLifecycle.test.ts` (new): transactional idempotent job/outbox admission, retry/replay without duplicate capture, lease/fencing, cancellation, stale heartbeat, rights/credential revision recheck before fetch and publish, secret redaction and capability-level outage isolation.
6. UI projection tests in `apps/web/client/src/components/emergency/__tests__/ThailandCoverage.test.tsx` (new if the existing coverage component is owned by this section): a TMD warning is visually/factually distinct from radar nowcast; a provider unavailable in one province does not hide another's official warning; provider status/coverage and source age are visible; empty data does not mean no incident.

Trace acceptance through source contract/adapter fixtures and the integrated multi-province scenario in Section 18. Province aggregation, hydrology graph budgets and low-zoom ranking must remain within bounded server/feed limits; do not let one basin flood the result set.

## Implementation details and files

Create `apps/web/server/services/geoSources/thailand/` with:

- `manifest.ts`: immutable/versioned logical pack manifest and adapter capability declarations. A capability is enabled only if source approval, contract fixture, current terms/redistribution, cadence, attribution and coverage have passed their gates.
- `contracts.ts`: strict per-source normalized envelope metadata. Reuse `apps/web/server/services/geoSources/contracts.ts` from Section 06 and Section 07 hydro contracts; do not fork a second common schema. Provider-specific identifiers, event clocks, timezone/CRS/unit, raw-source revision, quality/sentinel mapping, rights and error semantics are explicit.
- `ridAdapter.ts`, `dwrAdapter.ts`, `tmdAdapter.ts`, `gistdaAdapter.ts`: only implement a source after fixture and contract evidence are present. Use separate adapter versions when semantics differ (for example reservoir operations vs hydro observations vs official warning vs observed flood extent).
- `normalize.ts`: map source-specific station/asset/event records into canonical refs; retain original unit/coordinate/vertical datum and source revision, distinguish missing from zero, and quarantine invalid records with stable reason code. No silent inferred fields.
- `__fixtures__/` plus test-local fixture loaders: representative sanitized versioned responses and expected canonical outputs, including error/outage payloads. Fixtures must not contain real secrets or personal data.
- `health.ts`: provider health and expected-silence calculation based on declared cadence, last successful capture and source policy, returning explicit `AVAILABLE`, `PARTIAL`, `DEGRADED`, `STALE`, `NOT_CONFIGURED` or `TEMPORARILY_UNAVAILABLE` by capability/geography.

Register only approved adapters through Section 06's registry (`apps/web/server/services/geoSources/registry.ts`) and bounded fetch/normalization path. Use the canonical job admission and executor APIs in `apps/web/server/services/jobControlPlane.ts`; do not make network requests during React render, a public GET or an untracked timer. The Linux platform remains DB/auth/tenant/audit/job authority; Cloudflare is ingress/transport to the same platform contract, never a second provider executor. Both Linux/tunnel and Cloudflare routes must use the same manifest and capability policy.

If the existing public map/feed route cannot carry the compatible additive source metadata, propose changes to `packages/shared/src/emergencyRouteManifest.ts` and `apps/web/server/routes/spec260EmergencyEdge.ts` to the conductor. Do not add another route manifest or edit those serial/shared files independently. User-visible provider health joins the existing map/feed coverage model; detailed source rights, key rotation and controls are Section 16. Add no DB tables until conductor establishes the canonical source/contract schema gap.

## Provider qualification and safety gates

For each real adapter, store/review evidence for: endpoint ownership/access, authentication and secret scope, license/terms and redistribution, purpose and retention, attribution, quotas/cost, geography/resolution, schema/version, timestamps/timezone, CRS/units/datum, heartbeat/cadence, correction/retraction semantics, outage/auth/rate-limit behavior and operational owner. `VERIFIED_PUBLIC_DOCUMENTATION` or public HTML is a candidate state only. No capture or projection may exceed terms or authorized purpose. Rights expiry/revocation blocks future acquisition and publication; existing data follows its retention/legal-hold policy.

Unknown source revisions or breaking schema drift are quarantined and visible to operators. Preserve valid unaffected sources; do not turn partial provider failure into empty success. Distinguish official TMD warning from computed/radar nowcast, GISTDA flood observation from inferred flood extent, source warning from local authority order, and operational plan from actual measurement. Stale values may be historical context but cannot pass a current action gate. Rank sparse areas with authority/verification/freshness and explicit coverage, never raw citizen-report volume or a trust score.

## UI/UX Contract

### Target User / JTBD
Authorized public users and emergency operators need this section’s bounded capability through the existing map/feed and approved operator surfaces.

### Surface Inventory

| Surface | Existing integration | Section 09 behavior |
|---|---|---|
| Public map/feed | Existing `/disaster/map` | Display source-backed Thailand data only with its fact class, coverage and freshness; no provider-specific route. |
| Existing AI Chat & Feedback | Canonical `FeedbackButton` / `ChatView` | May explain the selected feed item's source/coverage through the existing removable one-turn context, never auto-send. |
| Dashboard/admin | Existing Spec260 admin/source controls | Provider credentials, rights, health and operator actions remain in Section 16's authorized surface; do not create a competing settings screen. |

### Component Map

| Component/service | Ownership |
|---|---|
| Thailand `manifest.ts`, adapters and normalizer | Provider pack mapping, source-specific contract versions and safe health projection. |
| Section 06 source registry/acquisition | Approved credentials/transport/capture/job lifecycle; not duplicated here. |
| Existing emergency feed/map components | Render canonical projected items and per-area capability coverage; no provider widget per endpoint. |

### State Matrix

| State | Required presentation |
|---|---|
| Available | Show supported capability, source and latest successful observation/warning time. |
| Partial/degraded | Show affected geography/source and what still works. |
| Stale | Retain last safe item with age and stale label; current actions requiring freshness are blocked. |
| Not configured/not supported | Say “not connected/not available for this area”; never imply no hazard. |
| Contract drift/outage | Show safe data-quality/provider-unavailable reason without secrets or raw payload. |
| Empty response | Differentiate healthy empty query from expected silence, incomplete paging and provider failure. |

### Responsive Matrix

| Viewport | Required behavior |
|---|---|
| 390x844 mobile | Source/freshness labels stay readable in feed rows; map remains usable. |
| 768x1024 tablet | Coverage detail is reachable without obscuring the selected item/map. |
| 1440x900 desktop | Multi-source provenance and partial coverage can be scanned without expanding raw payloads. |
| 360x800, 1024x768, 1280x800 | Check overflow, clipped source labels and panel scroll ownership. |

### Accessibility Acceptance

- Use text and semantic status for source health/fact class; color alone cannot distinguish official warning, observed data, forecast or degraded coverage.
- Keyboard and screen-reader users can inspect source, updated time, stale/coverage reasons and return focus to the selected map/feed item.
- Announce provider state changes only when material; do not spam live regions on each observation poll.

### Copy Contract

- Thai/English copy identifies agency/source and says when data is unavailable, stale or not connected in that geography.
- Label official warning, observation, forecast/nowcast, estimate and citizen report distinctly. Avoid “confirmed” unless the canonical source/review authority provides it.
- Do not expose provider technical secrets, unredacted error bodies or internal adapter identifiers to residents.

### Browser Evidence Required

Section 18 captures a healthy official warning, partial provider coverage, stale/outage, empty-with-coverage and working fallback on `/disaster/map`, verifies the existing Chat context is removable/no-auto-send, and checks mobile/tablet/desktop. Live endpoint/credential/license/Cloudflare proof is a separate gated environment run.

## Completion evidence and gates

Local completion means sanitized contract fixtures, adapter tests, idempotent capture/job tests, drift/outage/rights failure tests and projection/UI-state tests pass. Each provider's production readiness is separately `unverified` until an authorized owner confirms credentials, legal terms, quotas, current schema and geographic service in the target environment. Never report aggregate “Thailand covered” if only some capabilities/provinces have proven coverage. Real agency credentials, redistribution approval, Cloudflare binding, migration application and operational warning authority remain external gates.
