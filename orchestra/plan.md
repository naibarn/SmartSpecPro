# Orchestra Plan

## Task

Review Feature 186 implementation against its canonical `worker_jobs` / `worker_job_events` specification for at least 10 focused rounds, fixing safe in-scope gaps immediately.

## Classification

- scope: medium
- risk: high
- affected_domains: [PostgreSQL schema/data, Node control plane, adapters/outbox, scheduler, reconciler, tRPC/admin, FastAPI/Celery, verification]
- estimated_file_count: 20+
- chosen_route: direct-standard-light with inline sequential review and repair
- task_summary: Perform ten or more contract-focused implementation review rounds, patch material gaps, and rerun stale focused gates.
- bug_route: contract/reliability review
- parallel_default: false
- planned_agents: []
- dispatch_preference: inline-fallback (no sub-agent tool exposed)

## Impact preflight

- SocratiCode MCP was not available; scoped `rg`, symbol reads, tests, migration verification, and local PostgreSQL checks are the fallback.
- Directly affected surfaces: Feature 186 control-plane, adapter, schema, route, Python, migration, test, and review paths.
- Risk-sensitive surfaces: tenant scoping, admin actions, internal FastAPI token boundary, lifecycle fencing, additive migration, idempotent paid/provider side effects.
- Sequential constraints: schema/migration edits, lifecycle transition changes, and data backfill verification remain conductor-owned and are not parallelized.

## Review rounds

Review completed inline in 12 rounds: persistence, identity, lifecycle, lease, retry, outbox, adapters, scheduler, security/admin, migration/data, and two clean convergence rounds. See `specs/feature/186-unified-job-control-plane-adapters/reviews/implementation-review-rounds-current.md`.
