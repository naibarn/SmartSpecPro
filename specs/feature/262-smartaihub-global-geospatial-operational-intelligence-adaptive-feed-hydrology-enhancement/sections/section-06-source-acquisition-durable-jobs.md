# Section 06 — Source acquisition and durable jobs

## Goal and boundaries

Implement the provider/source acquisition boundary for Spec262. Providers are explicit, versioned adapters; a URL entered by an operator is never itself fetch authority. This work depends on Section 02's trusted runtime and shared route/context contracts. Sections 05, 07, 09, 11, 14, 16 and 17 consume these source contracts or job lifecycle; do not duplicate their UI, hydro schema, regional capability, privacy, admin, or replay implementations here.

Spec260 remains authoritative for emergency identities, source registration/review, immutable evidence captures, claims, disclosure and audit. Reuse `emergencyIntelSources`, `emergencyIntelCaptures`, `emergencyIntelClaims` and `emergencyIntelClaimSources` in `apps/web/drizzle/schema.ts` and their Spec260 endpoints in `apps/web/server/routes/spec260EmergencyEdge.ts`. These records provide provenance and human review, but do not implement automated ingestion or time-series storage. Keep raw provider payloads in approved private object storage with content hashes and bounded metadata; never copy secrets or unbounded raw payloads into JSON columns or public projections.

The Linux platform service remains the canonical database/auth/tenant/audit/job authority. Cloudflare provides authenticated ingress/transport to the same contract. All long-running fetch, normalize, and enrichment operations enter the existing `worker_jobs` and transactional `worker_job_outbox` control plane. Do not create a scheduler, queue, workflow engine, Agency/workpack, or provider-specific durable-job table.

## Tests first

Add or extend focused tests before implementation. Use fixture-only transports; CI must not depend on provider accounts, live endpoints, or secret keys.

1. `apps/web/server/services/__tests__/geoSourceAdapter.test.ts` (new): reject non-HTTPS schemes, credentials in URLs, loopback/private/link-local/multicast/reserved IPs, DNS rebinding, redirect to a disallowed host/address, and redirects beyond the configured limit. Validate allowlisted host + path, TLS, timeout, response byte cap, decompression cap, content-type, and request rate limits. Verify errors/logs redact query secrets, authorization headers, and payload excerpts.
2. `apps/web/server/services/__tests__/geoSourceContract.test.ts` (new): accept a versioned fixture matching the adapter schema; quarantine unknown schema versions, malformed coordinates/time/units, oversized features, invalid geometry/CRS, and contradictory provider identity. Test additive unknown fields only when the declared adapter version explicitly permits them.
3. `apps/web/server/services/__tests__/geoSourcePolicy.test.ts` (new): source disabled/pending/paused/revoked, missing owner/rights/license/attribution/retention/allowed-purpose, quota exhaustion, expired credentials and unexpected silence must block acquisition or yield explicit `unavailable`/`stale` state. Verify policy edits increment configuration revision and require revalidation before reactivation.
4. `apps/web/server/services/__tests__/geoAcquisitionJob.test.ts` (new): transactionally create the canonical job and outbox intent once; same tenant/idempotency key returns the same job; concurrent requests cannot create duplicate active work; assert scoped job type, bounded input, execution class, retry/deadline policy and no provider credential in the job envelope.
5. `apps/web/server/services/__tests__/geoAcquisitionLifecycle.test.ts` (new): stale attempt/fencing token cannot persist capture or settle output; heartbeat/lease expiry permits safe recovery; transient/rate-limit/provider outage uses bounded retry and jitter; permanent rights/schema/security errors quarantine and require operator action; cancellation prevents publishing; replay is idempotent; outbox publication failure recovers without creating a second job.
6. Add route-level tests next to `apps/web/server/routes/spec260EmergencyEdge.ts` only if Section 16 routes acquisition through existing operator APIs. Assert authenticated tenant + capability scope, CSRF/idempotency requirements, and audit emission; public routes never start arbitrary fetches.

## Source adapter and registry contract

Create the domain-specific source modules under `apps/web/server/services/geoSources/` (new):

- `contracts.ts`: versioned adapter and normalized acquisition contracts (`providerId`, `contractVersion`, `sourceRef`, `sourceRevision`, `acquiredAt`, `observedAt`, `schemaVersion`, `contentHash`, `licenseRef`, `attribution`, `allowedPurposes`, `retentionClass`, `freshness/cadence`, and bounded records). Schemas reject invalid values at the boundary and never accept a caller-supplied audience as authority.
- `registry.ts`: resolves only server-configured/approved provider adapters and a tenant/jurisdiction-bound source record. Require active approval, explicit rights, jurisdiction, enabled capabilities, expected heartbeat/cadence, retention and attribution. A source registry row is not an unrestricted URL proxy.
- `fetch.ts`: a single bounded transport that validates canonical host/path and DNS results at connection time; revalidates every redirect; denies local/private/reserved addresses and unsafe ports; enforces TLS, connection/read/total timeouts, compressed and decompressed byte limits, response type, pagination/page and per-source rate budgets. Do not forward browser cookies or platform credentials. Provider credentials are resolved server-side and scoped to the adapter; never return them to a browser, store them in job input, or log them.
- `normalize.ts`: performs fixture-testable parsing and maps provider records to versioned normalized envelopes while preserving original values, units, CRS, source event time, source revision and capture reference. Reject invalid data; do not silently coerce coordinates/units or turn parse failures into empty success.
- `lifecycle.ts`: handles due/acquire state, heartbeat freshness, source pause/revoke, schema quarantine, bounded retry, cancellation, and operator-visible safe error codes. A missing feed is represented as missing/stale/unavailable with coverage metadata, never as “no incidents.”

Define explicit job types in the canonical worker executor registry and handler ownership (inspect and extend the existing registry; expected files include `apps/web/server/services/jobControlPlane.ts`, `apps/web/server/services/jobControlPlaneTypes.ts` and the server worker executor registration module found by searching `register.*executor`/`jobType`). At minimum distinguish `geo.source.acquire` and `geo.source.normalize` only if they need independent retries/capabilities; otherwise use one typed `geo.source.refresh` job with versioned stages. Do not create multiple jobs per page/sample. Payload identifies only approved source ID/revision, adapter version, bounded cursor/window and idempotency key; it contains no arbitrary fetch URL or credential.

Admission creates job and outbox row in the same database transaction using the repository's canonical job creation API (`createCanonicalJobInTransaction` in `apps/web/server/services/jobControlPlane.ts`) and registered executor contract. Use a stable tenant/source/cadence-window idempotency key and an active-dedupe key for a currently running refresh. Publisher queue is a delivery mechanism only. Worker claims use canonical lease, heartbeat, attempt ID and fencing version; every capture/observation write and settlement verifies the active lease. A retry must not create a duplicate immutable capture: use the source/item/content-hash uniqueness rule and report deduplication. If source configuration revision changed after admission, revalidate current approval/rights before fetch and before publish; revoke/cancel must stop further public effects.

Do not change `apps/cloudflare/src/` to execute the provider fetch in a Worker. It may transport a canonical outbox envelope through approved bindings, then proxy claim/settlement to the platform control plane. Both Cloudflare and Linux/tunnel paths must resolve the same job type, policy and adapter on the platform. Do not infer trusted runtime or provider policy from hostname or request headers.

## Persistence and provenance

Prefer existing source/capture records for evidence. Extend them only where needed and only through conductor-owned migration work. A capture is immutable, content-hash addressed and tenant-scoped; it records source ID/revision, upstream item revision, fetch/observation timestamps, media type, byte size, schema/adapter version and safe provenance. Preserve the configured license, attribution, permitted purpose and retention decision as a revisioned policy snapshot or immutable capture metadata so future display can prove the basis. Keep provider raw data private; projections expose only allowed fields and source attribution.

Provider registry/configuration storage and migration are **conductor-serial ownership** with all DB/schema/journal changes. First inspect current Spec260 source migration and all dirty diffs. Reuse `emergency_intel_sources` where its source semantics fit; do not create a parallel source authority. Add an additive table only for missing provider contract/version/rights/cadence state, with tenant/source foreign keys, uniqueness, lifecycle checks and audit. Section 16 owns admin settings/rotation screens; Section 14 owns public disclosure/privacy rules. No production migration application is part of this section.

## Completion evidence

- Fixture tests cover SSRF/redirect/size/schema/rights failures and the successful versioned provider path.
- Job tests demonstrate one transactional canonical job+outbox, idempotent retry, current lease fencing, bounded retry/quarantine/cancel, and safe recovery.
- A source capture can be traced from approved source revision through content hash and adapter version to the resulting normalized record, while credentials/raw restricted content remain private.
- Linux and Cloudflare ingress contract tests call the same platform acquisition contract. Real provider credentials, source terms, Cloudflare bindings, deployment and production data access remain external release gates; their absence cannot be marked PASS.

## UI/UX Contract

### Target User / JTBD
Not a user-facing UI section; source acquisition and durable execution are backend responsibilities. Operators consume controls/status from Section 16.

### Surface Inventory
No new page or component. Existing operator health/configuration surfaces are owned by Section 16.

### Component Map
Backend adapters, source/capture services and canonical `worker_jobs` + outbox only. Any UI change must be implemented and reviewed under its owning section.

### State Matrix
Backend states are represented through Section 16’s source health, lag, rights and degraded status contract; no new UI state authority is introduced here.

### Responsive Matrix
Not applicable to this backend-only section; Section 16 validates operator surfaces.

### Accessibility Acceptance
No UI authored here; all operator-facing source status must meet Section 16 accessibility acceptance.

### Copy Contract
No user copy authored here; Section 16 owns localized operator status and safe failure wording.

### Browser Evidence Required
No standalone browser surface. Section 18 verifies adapter/provider status through the owning Section 16 UI.
