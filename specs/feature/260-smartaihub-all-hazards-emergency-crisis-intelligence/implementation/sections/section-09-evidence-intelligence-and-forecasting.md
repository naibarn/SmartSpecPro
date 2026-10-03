# Section 09 — Evidence Intelligence and Forecasting

**Dependencies:** Sections 03, 07 and 08. **Owner:** conductor; all async work enters `worker_jobs` plus outbox. **Status:** In progress; closed-by-default source registry, immutable hash-addressed manual excerpt captures, source independence groups, claims with source lineage, human review/dispute/retraction, public verified-claim projection, and a bounded local public-map situation digest are implemented. External provider retrieval, claim corrections/supersession UI, grounded briefs, forecasts, and cost-bounded research jobs remain open.

## Scope

Implement feed/source registry, retrieval and ingestion, deduplication and claim graph, authenticity/independence checks, human verification, publication/correction/retraction, forecasts and route/resource briefs, scheduled research, and strict cost budgets. Preserve retrieved bytes and source provenance through approved storage/media authorities.

## Exit criteria

- Mirrored sources do not count as independent corroboration.
- Claims have source, timestamp, confidence and correction history; uncertain claims are labeled and never promoted by model output.
- Jobs are idempotent, durable, fenced and cost bounded; emergency intake capacity is isolated from research load.
- Prompt injection, malicious feeds, retrieval failure and budget exhaustion are tested locally with fixtures.

## Current implementation boundary

`/dashboard/emergency/command/intelligence` supports manual source registration, verifier activation, immutable bounded excerpt capture, claim linkage, and verification/dispute/retraction. `/disaster/intelligence` exposes only verified claims whose currently active source lineage still contains at least two distinct independence groups. Source registration never performs network retrieval; no SSRF-capable fetcher or unconfigured external feed adapter is enabled. Operator-entered excerpts are archived to a private hash-addressed R2 object before the capture row records its object reference, content hash, size and source provenance. External feed retrieval, raw publisher-byte archival, grounded briefs, forecasts and canonical research jobs remain incomplete.

### Wave 5A — local situation feed and source qualification

The existing public map route now adds a deterministic `spec262-feed-v1` digest assembled only from the same public-projected, viewport-filtered record families it already serves: situations, published alerts and verified facilities. It includes lane, ranked priority, freshness and source provenance; the dashboard/public map page renders the digest as a keyboard-readable list and retains the last digest as stale when a refresh fails. Critical published alerts are retained when the ordinary digest budget is exhausted. Facility `observedAt` currently means the local record's `updatedAt`, not an independently verified upstream observation time. No sponsorship is injected by this projection.

Thailand research-pack entries remain catalog leads, not live providers. All current candidates explicitly carry blockers for verified endpoint, authentication, schema, cadence, rights/license, attribution, coverage, retention and implemented adapter. A documentation URL alone does not satisfy endpoint or access verification. The qualification gate now requires explicit authentication evidence. No external request, credential collection, provider adapter, fetched-byte archive, utility/news/transport/recovery lane, or forecast is active; do not describe this slice as external-source ingestion. Provider selection and owner-granted credentials/rights are prerequisites for a later adapter wave.

Focused proof executed: Node tests cover critical-item retention/provenance/placement and fail-closed Thailand candidate qualification. UI browser rendering, full route integration/build, provider network/SSRF behavior, migration replay and Cloudflare staging remain unverified; no migration is required by this wave.
