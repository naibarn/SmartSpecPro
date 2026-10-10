# Phase 2 WorkUnit: Durable ProjectResolutionReceipt

**WorkUnit:** `SPEC302_DURABLE_PROJECT_RESOLUTION_RECEIPT_PERSISTENCE`
**Owner Spec:** SPEC-302
**State:** `READY_AFTER_PHASE1_CANONICAL_INTEGRATION`
**Dependency:** Phase 1 `spec302-invocation-receipt.phase1.v1` remains read-only and checks live tenant, Project, App, and membership state before every protected read. It must not be treated as durable write authority.

## Scope

Add durable/idempotent receipt persistence to the existing canonical authorization boundary after a migration is explicitly approved. Reuse the canonical App, Project, tenant, principal, and ACL tables. Do not add an identity authority or a memory store. Until this WorkUnit passes, durable Project-shared memory create, update, delete, promotion, and automatic capture remain denied; Session, Pending, and existing permitted Global behavior remain available.

## Receipt fields

- Unique receipt ID and idempotency key.
- Tenant ID, principal ID, canonical Project ID, canonical App ID.
- Session/conversation binding, or an explicit no-session selection binding where the owning Spec permits it.
- Resolution state, selected canonical Project ID, and provenance/source.
- Resolver and authorization policy versions.
- Fresh authorization result/reference, issue time, expiry, and revocation/invalidation state.
- Correlation ID and a digest of the normalized resolution input; never persist raw prompts or credentials.

The persistence contract must define retention, replay behavior, revocation propagation, and a rollback/retention plan before migration execution. Raw ACL data is not copied into the receipt as a replacement for current authorization checks.

## Acceptance contract

1. Only the server-side issuer may persist receipts after current tenant membership, active canonical Project, active App identity, current Project-App binding, and current Project membership all pass.
2. The same idempotency key and normalized payload return the same receipt; the same key with different tenant, principal, App, Project, conversation, resolution state, or provenance is rejected as a conflict.
3. A receipt cannot authorize a different tenant, principal, App, Project, conversation/session, policy version, or operation ceiling.
4. Protected Project-shared writes require a persisted, non-revoked, unexpired write-capable receipt and a fresh ACL/App-binding recheck immediately before the mutation.
5. Membership revocation, Project/App suspension, App-binding revocation, tenant change, conversation retargeting, expiry, or policy-version change denies the next protected operation even when a receipt row remains present.
6. `AMBIGUOUS`, `UNRESOLVED`, and `NO_PROJECT` receipts cannot carry a Project destination. `SESSION_PENDING_SCOPE` cannot authorize a durable Project write.
7. Duplicate retries do not duplicate memory writes; conflicting retries fail closed. Persisted source provenance remains attributable through retrieval and promotion.
8. Tests cover transaction/concurrency races, idempotent replay, changed-payload conflict, ACL revocation, tenant change, App switch, Project switch, expiry, invalidation, and failure rollback.
9. Migration and rollback are reviewed by the SPEC-302 schema owner and explicitly approved before any database execution. No production migration is included in Phase 1.

## Reactivation predicate

After Phase 1 is integrated, obtain SPEC-302 schema-owner assignment and explicit migration approval, reconcile the migration against current `origin/main`, implement the table/index contract in an isolated WorkUnit, run schema/code tests, and promote through the normal PR path. Production execution remains a separate authorization.
