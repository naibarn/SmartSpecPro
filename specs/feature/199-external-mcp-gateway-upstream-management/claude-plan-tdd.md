# Feature 199 TDD Plan

Use focused Web Vitest, Python pytest and browser tests. Tests precede implementation; no whole-repository typecheck.

## section-01-contracts-and-persistence

Test mapping to current MCP tables, tenant uniqueness/idempotency, secret redaction, revocation and migration safety.

## section-02-discovery-auth-and-quarantine

Test protocol negotiation, OAuth metadata/PKCE, token expiry, malformed schema, lazy pagination, schema drift, quarantine and reconnect.

## section-03-policy-and-execution

Test tenant/role/agent grants, approval, stale revisions/leases, idempotent effects, provider outage, Runner disconnect and direct bypass.

## section-04-api-and-observability

Test route auth/shapes, pagination, idempotent mutations, errors, audit/trace lineage, retention/deletion and rate limits.

## section-05-ui

Test role/state matrices, quarantine/revoked/health flows, no credential disclosure, keyboard/responsive behavior and browser evidence.

## section-06-migration-tests-and-acceptance

Test staged compatibility, protocol/contract versions, rollback, credential rotation, load/backpressure and Appendices A–Q gates.

