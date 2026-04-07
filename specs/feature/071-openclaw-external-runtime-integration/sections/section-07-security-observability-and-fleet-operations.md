# Section 07: Security, Observability, and Fleet Operations

## Ownership

This section owns the cross-cutting guardrails and operational visibility that make OpenClaw support safe to ship and operable in production.

## Target files and modules

- worker auth and audit services
- observability dashboards or admin queries
- `apps/web/server/services/auditLogger.ts`
- gateway/worker metrics projections
- regression and integration test suites

## Scope

- short-lived token scope and revocation rules
- admin-only visibility for diagnostics and dashboard URLs
- worker health, heartbeat freshness, and failure summaries
- audit events and `traceId` propagation across worker and library flows
- fleet controls for disable, drain, revoke, and status inspection
- guardrails so SmartSpecPro stays the control-plane source of truth
- route-specific rate limits for worker endpoints
- server-side redaction and payload caps for diagnostics and worker logs
- SSRF-safe handling of worker-provided dashboard or health URLs
- retention and cleanup policies for heartbeats, diagnostics, worker events, and abandoned upload state
- explicit tenant-admin versus platform-admin role boundaries for fleet actions and diagnostics access

## TDD expectations

- add tests for token expiry/revocation
- add tests that worker routes reject non-worker-bound bearer identities
- add tests for admin-only visibility rules
- add tests for tenant-admin versus platform-admin action boundaries
- add tests for diagnostics/log redaction before persistence
- add tests for worker-specific audit events and trace correlation
- add tests for observable worker-state transitions
- add tests for worker endpoint rate limits and retention cleanup jobs

## Acceptance checks

- workers can be disabled, drained, or revoked with observable effects
- production dashboards can distinguish healthy, stale, and failed OpenClaw workers
- audit logs correlate worker lifecycle events with artifact publication outcomes
- diagnostics and logs persist only redacted, policy-compliant data

## Risks and coordination notes

- do not rely on the OpenClaw dashboard as the system of record
- make sure security rules are consistent across worker and gateway surfaces
- do not introduce hidden server-side fetches against arbitrary worker-provided URLs
