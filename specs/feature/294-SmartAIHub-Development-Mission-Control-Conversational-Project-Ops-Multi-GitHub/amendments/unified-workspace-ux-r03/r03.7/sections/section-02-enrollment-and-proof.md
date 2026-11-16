# Section 02 — Enrollment and Device Proof

**Requirements:** R37-02, R37-03
**Objective:** Implement the client's Modular DEV pairing and signed device-proof contract with least-privilege DB operations.

**Owned scope:** Modular Hono route/service/types/tests; additive SmartSpecPro SQL only if current schemas lack required durable state/functions; update typed migration/schema/test artifacts owned by that migration.

**Prerequisites:** Section 01 exact contract; confirmed actual DEV schema, principals and migration authority.

**Deliverable:** Pair-start, owner approval, poll/token, refresh/revoke, nonce/replay verification, tenant/workspace scoping and separately stored Modular connection identity.

**Completion predicate:** Valid Rust-client proof can complete normal pairing once; malformed, replayed, revoked, wrong-tenant or expired credentials fail closed; no direct Hono table mutations.

**Verification/evidence:** Focused Hono tests and disposable PostgreSQL fixtures; migration preflight/hash/role grants if migration is required; pairing audit identifiers with secrets redacted.

**Fallback/blocker strategy:** If browser owner approval is unavailable, complete route and test implementation; record enrollment pending. If migration/secret authority is not available, do not weaken DB grants; hand off exact action and continue API-only work.

**Dependencies:** Section 01. **Acceptance:** Does not imply a heartbeat or real execution.
