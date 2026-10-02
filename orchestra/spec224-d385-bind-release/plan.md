# Orchestra Plan — Spec 224 Bind/Release Recovery

## Task
Make the authorization binding immutable and make repeated hold release verify it is the same binding, so retry after a crash between persistence transactions is safe.

## Classification
- scope: medium
- risk: high (authorization, tenant-bound job dispatch)
- affected_domains: Node control plane, authorization binding, focused tests
- estimated_file_count: 4
- chosen_route: direct-inline implementation in the existing isolated worktree
- task_summary: prevent binding replacement across the bind/release boundary and reject conflicting idempotent releases
- bug_route: correctness/security boundary discovered during readiness inspection
- parallel_default: false
- planned_agents: []
- dispatch_preference: direct-standard-light

## Impact preflight
- Direct changes: `apps/web/server/services/spec224AuthorizationBinding.ts`, `apps/web/server/services/spec224AuthorizationService.ts`, `apps/web/server/services/jobControlPlane.ts`, and focused tests.
- Risk-sensitive surfaces: tenant authorization, authorization evidence, dispatch/outbox idempotency.
- No schema, migration, Cloudflare, shared checkout, or production changes.
- Sequential because the digest contract spans authorization persistence and canonical job release; one writer owns all changes.
- Confidence: high for adding immutable-binding and event-digest checks; PostgreSQL crash recovery remains unproven.

## Scope boundary
Implement retry-safe behavior using existing transactions, `worker_jobs`, events, and outbox. Do not claim that this proves database crash recovery, runtime admission, remote trust, or production readiness.
