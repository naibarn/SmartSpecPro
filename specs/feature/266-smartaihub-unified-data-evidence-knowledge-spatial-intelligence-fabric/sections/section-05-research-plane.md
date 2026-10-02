# Section 05 — Autonomous Research Plane

## Scope

Implement Phase D: provider-neutral research request admission, immutable runs/artifacts, candidate lifecycle, admission gate, source identity/dependency graph, corroboration, cost/security/placement policy and revalidation notices.

## Spec coverage

Spec 266 §§10–11, 46.10, 46.12 and 47 items 15–20, 21–22.

## Implementation

- Added schema-free bounded immutable candidate parsers, conservative source-match recommendations (canonical HTTP(S) endpoint, provider/dataset or provider/API/schema identity), and bounded dependency/corroboration evaluation. Repost/summary chains collapse to roots; derived claims cannot be submitted as observations. This is not persistence or merge authority.
- Added a bounded immutable `ResearchArtifact` reference validator and a metadata-only scan-state predicate. A `passed` value is not trusted scan authority; downstream admission must load a server-owned scan receipt. This does not perform malware scanning or grant payload access.
- Added a strict immutable `ResearchWatchChangeNotice` parser with idempotency/reference bounds and PUBLIC/TENANT scope checks. Notice emission, durable commit ordering and consumer reauthorization remain persistence/composition work.
- Atomically persist request admission and canonical worker_jobs/outbox intent; use reference-only dispatch envelopes.
- Make idempotent retries reuse one admitted identity; intentional revalidation creates an immutable new ResearchRun.
- Research outputs remain candidates until normal rights/schema/security admission succeeds.
- Runtime/secret/placement is selected server-side; no local scheduler or fallback.
- Emit research watch change notices only after durable evidence state, then reauthorize and dedupe consumers.

## Tests

- Contract, authorization, job idempotency, outbox correlation, promotion, echo resistance, budget bounds and notice reauthorization.

## Acceptance

Spec 266 §46.10 items 58–75 and §46.12 items 80–87.
