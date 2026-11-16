# Section 03 — Canonical Runner Control

**Requirements:** R37-02, R37-04, R37-06
**Objective:** Publish fresh capabilities/heartbeats and deliver canonical work with lease/fence and receipt integrity.

**Owned scope:** Hono control transport/repository and tests; narrow canonical DB functions only if necessary; runner command/receipt contract fixtures. No second scheduler, queue, event store or direct table grants.

**Prerequisites:** Section 02 valid Modular identity and proof verification.

**Deliverable:** Capability publication, heartbeat/reconcile, WSS control plus supported durable fallback, canonical job/attempt/session binding, ordered idempotent events, completion/failure receipt, reconnect cursor replay and revocation enforcement.

**Completion predicate:** Exactly one attempt receives a valid fenced command; stale fences and duplicates cannot execute or mutate canonical work; event replay does not duplicate evidence; projection reports actual readiness.

**Verification/evidence:** Rust-contract parity tests, route/repository tests, disposable PostgreSQL concurrency/idempotency/fence fixtures and catalog projection response.

**Fallback/blocker strategy:** If DEV schema lacks required columns, pause only migration-dependent path and provide additive migration backed by inspected DDL; do not repurpose legacy queue functions or runner identities.

**Dependencies:** Section 02. **Acceptance:** Local tests do not imply real Codex execution.
