# Section 09 — Evidence Intelligence and Forecasting

**Dependencies:** Sections 03, 07 and 08. **Owner:** conductor; all async work enters `worker_jobs` plus outbox. **Status:** In progress; closed-by-default source registry, immutable hash-addressed manual excerpt captures, source independence groups, claims with source lineage, human review/dispute/retraction, and public verified-claim projection are implemented. External feed retrieval, claim corrections/supersession UI, grounded briefs, forecasts, and cost-bounded research jobs remain open.

## Scope

Implement feed/source registry, retrieval and ingestion, deduplication and claim graph, authenticity/independence checks, human verification, publication/correction/retraction, forecasts and route/resource briefs, scheduled research, and strict cost budgets. Preserve retrieved bytes and source provenance through approved storage/media authorities.

## Exit criteria

- Mirrored sources do not count as independent corroboration.
- Claims have source, timestamp, confidence and correction history; uncertain claims are labeled and never promoted by model output.
- Jobs are idempotent, durable, fenced and cost bounded; emergency intake capacity is isolated from research load.
- Prompt injection, malicious feeds, retrieval failure and budget exhaustion are tested locally with fixtures.

## Current implementation boundary

`/dashboard/emergency/command/intelligence` supports manual source registration, verifier activation, immutable bounded excerpt capture, claim linkage, and verification/dispute/retraction. `/disaster/intelligence` exposes only verified claims whose currently active source lineage still contains at least two distinct independence groups. Source registration never performs network retrieval; no SSRF-capable fetcher or unconfigured external feed adapter is enabled. Operator-entered excerpts are archived to a private hash-addressed R2 object before the capture row records its object reference, content hash, size and source provenance. External feed retrieval, raw publisher-byte archival, grounded briefs, forecasts and canonical research jobs remain incomplete.
