# Synthesized Specification: Capacity Advisor V2

## Outcome

Deliver a reliable Admin Capacity Advisor for deciding whether the current Home
Server is healthy, needs observation, needs optimization/scale-up, or warrants a
Cloud migration review. Preserve the approved Hybrid UI: concise summary first,
evidence-rich detail tabs second.

## Functional contract

The service must collect and normalize CPU, RAM, root and relevant mount disk
capacity/free space, Docker storage, allowlisted temp-file usage, service health,
queue backlog, worker count/concurrency, active/stalled jobs, oldest queued age,
long-running background jobs, duration/retry/error/throughput signals, recent
persisted samples, and source/namespace/freshness metadata.

The server must apply one centralized threshold policy and deterministic
healthy/watch/action/critical/insufficient-data rules. It must compute bounded
growth and time-to-threshold forecasts from history. It must pass a sanitized,
bounded, versioned snapshot to the `infrastructure-capacity-advisor` skill, then
validate and reconcile the structured LLM response against server evidence.

Both daily and Admin-confirmed manual runs must share an idempotent, observable,
guarded execution path. Results, failures, coverage, and trigger metadata must
be persisted and available through Admin-only APIs.

## UI contract

Summary tab: overall verdict, freshness/coverage banner, four/five key metric
cards, detected risks with exact evidence, recommendation, confidence/limits, and
next action. Detail tabs: system/storage/temp, workload/background jobs, and
history/run status. Loading, empty, error, stale, partial, unknown, and disabled
states are explicit and accessible on mobile through desktop.

## Safety and rollout contract

No secrets/private payloads/raw logs go to the LLM. No automatic infrastructure
mutation is allowed. Snapshot traversal remains bounded and allowlisted. A target
database migration, focused tests, authenticated browser evidence, scheduler
proof, and deployment rollback plan are required before production status.

## Implementation priorities

P0: trusted data model, workload/namespace coverage, central policy,
deterministic forecast/status, LLM reconciliation.

P1: asynchronous guarded execution, scheduler observability, retention/prompt
completeness, monitoring queue isolation, Admin UX error/freshness coverage.

P2: maintainability split, richer trend visuals, alert integration and optional
policy configuration after the correctness path is proven.
