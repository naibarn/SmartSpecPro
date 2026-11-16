# R03.2 Runtime Adapter Gap Matrix

The R03.2 browser surface is fixture-only. No live Harness inventory or execution evidence was substituted for fixtures. Required adapter sources must be resolved through SPEC-309/310 and the existing Job/Run/Attempt authorities before runtime integration.

| Capability | R03.2 prototype evidence | Runtime adapter needed | Required contract / remaining proof |
| --- | --- | --- | --- |
| Harness type and instance inventory | Synthetic Codex, Claude, Hermes and unavailable instances | Fresh authenticated Harness/Runner catalog adapter | SPEC-309/310; tenant/workspace-scoped catalog, stable instance identity, source and freshness; do not hardcode fixture inventory in production |
| Discovery and connectivity | Separate demo catalog and synthetic heartbeat labels | Catalog discovery plus Runner heartbeat/status read adapter | Prove source timestamps, expiry/staleness and unavailable/offline semantics independently |
| Trust/enrollment and entitlement | Explicitly “Not connected” / “Not verified” fixture states | Existing trust/enrollment and account entitlement authorities | Current user, tenant, workspace and target must be reauthorized; presence in catalog does not grant execution permission |
| Workspace authorization and dispatch readiness | Six distinct readiness fields, synthetic dispatch status | Existing workspace authorization and canonical Goal/Job admission path | Verify capability, budget, lease/fencing, approval and policy before accepting work; Mission UI must not dispatch directly |
| Execution tabs / split data | Synthetic Job/Run/Attempt/Thread-shaped DTOs | Existing authorized Mission/Task read models and event source | Preserve exact tenant/workspace/project/Mission/Job/Run/Attempt/thread/session; missing identities stay null; no second ledger or scheduler |
| Events, cursors and freshness | Fixture events, timestamps and local cursor state | Existing durable ordered event source/subscription with replay cursor | Verify replay after reconnect, deduplication, freshness and no state mutation on polling/transport failure |
| Task Control deep link | Fixture-only `execution` and `attempt` parameters | Established application router plus authenticated Task Control read API | Validate canonical IDs server-side, authorize each read/evidence dereference, reject cross-scope/mismatch, and restore original Mission selection on return |
| Tool/evidence inspector | Existing R03.1 synthetic Task Control evidence views | Authorized transcript/tool/log/diff/test/artifact/verification/usage/receipt projections | Preserve per-Attempt provenance, redaction and evidence availability; prototype values are not runtime facts |
| Reload and local view state | Versioned localStorage and fixture allowlist validation | Canonical URL/session identity where supported; browser state is presentation-only | Never restore authorization from localStorage; validate any canonical selection again on the server |
| Tenant isolation / no duplicate dispatch | Test proves zero `fetch` calls for prototype interactions | Authenticated cross-tenant API tests and idempotent canonical admission | Live proof must show cross-tenant denial and no Job creation from tab open/switch/close/navigation |

The implementation path is additive: adapt existing authorized read models and event subscriptions; keep all dispatch inside the current canonical admission and worker control plane. Do not add a scheduler, queue, job database, event ledger, provider install, or alternate authorization path.
