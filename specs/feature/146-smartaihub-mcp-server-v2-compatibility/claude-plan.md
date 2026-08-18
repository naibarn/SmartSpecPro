# Feature 146 implementation plan

## 1. Architecture and invariants

Add a narrow protocol layer around `mcpPublicServer.ts`. It parses request
media/version/header metadata, classifies modern versus legacy, validates
JSON-RPC/header consistency, and selects the existing principal-aware registry
context. It must not move business logic out of `mcpRegistry.ts` or create a
second scheduler, render table, credit ledger, artifact store, or device
authority.

Modern requests use a stateless request context derived from the authenticated
request. Legacy requests retain Redis session lifecycle. A modern request must
never read a legacy session, and a legacy request must never inherit modern
metadata. Batch behavior is bounded and each response preserves the JSON-RPC id.

## 2. Section 01 — transport and discovery

Files to add/change:

- `apps/web/server/_core/mcpV2Protocol.ts`: protocol constants, era detection,
  header/body validation, cursor helpers, JSON-RPC error classification, and
  result-envelope helpers.
- `apps/web/server/_core/mcpPublicServer.ts`: modern dispatch, discovery,
  resources dispatch hook, method matrix, disconnect/cancel behavior, and
  protected-resource challenge integration.
- `apps/web/server/_core/index.ts`: exact MCP CORS allow/expose headers and
  OPTIONS behavior.
- `apps/web/server/_core/__tests__/mcpPublicServerV2.test.ts`: modern fixtures,
  legacy regression, headers, batch, method matrix, and root isolation.

Modern support is feature-gated with a safe default. It advertises only
capabilities whose handlers and tests are available. Modern list/read responses
include cache metadata. Legacy output remains the existing projection. GET does
not create an unauthenticated stream in phase 1; HEAD returns a deterministic
method response; DELETE never revokes credentials and only terminates a valid
legacy session.

## 3. Section 02 — registry and results

Files to add/change:

- `apps/web/server/_core/mcpRegistry.ts`: extend metadata and alias resolution
  without changing existing handler bodies.
- `apps/web/server/_core/mcpResultAdapter.ts`: normalize structured results,
  cache policy, legacy text projection, public error codes, and redaction.
- Registry-focused tests and static catalog assertions.

Every public entry has canonical name, aliases, bounded input/output schemas,
scopes, annotations, idempotency mode, cache policy, result kind, schema
revision, and audit action. Aliases resolve before availability, scope,
idempotency, and feature checks; audit retains requested and canonical names.
Ambiguous `render.*` aliases require explicit job kind or remain unavailable.

## 4. Section 03 — resources and files

Files to add/change:

- `apps/web/server/_core/mcpResources.ts`: static allowlisted documentation
  resource registry with revision, MIME type, byte limits, and read projection.
- `mcpPublicServer.ts`: `resources/list` and `resources/read` dispatch.
- Existing download broker/service adapters only when an ACL-preserving result
  shape or extension-preserving filename is missing.
- Resource and media ACL tests.

Resources are documentation-only initially. Library, R2, and Media History
artifacts are not arbitrary URI resources; existing scoped tools return short-lived
broker grants or bounded metadata after owner/tenant checks. The server never
accepts a client path, R2 key, or URL as authority.

## 5. Section 04 — auth, OAuth, and security

Files to add/change:

- `authz.ts` only for narrowly required audience/resource or scope helpers.
- A small metadata/challenge helper used by `mcpPublicServer.ts`.
- Existing connected-device/pairing services only if tests show a missing
  owner/revoke/expiry invariant.
- Auth, CORS, origin, OAuth, device, and redaction tests.

Protected Resource Metadata is returned only when explicit issuer, resource,
token validation, and JWKS/introspection configuration is complete. Otherwise
the endpoint fails closed without claiming OAuth readiness. Token checks enforce
tenant/user/device, audience/resource, expiry, scopes, JTI revocation, and no
query-string credentials. Invalid auth is HTTP 401; insufficient scope is HTTP
403 with a safe challenge; malformed protocol is a JSON-RPC/HTTP protocol error.

## 6. Section 05 — jobs, credits, workers, and uploads

Inspect and change only as needed:

- `mcpRegistry.ts`
- `mcpMediaAdapter.ts`
- `mcpDownloadBrokerService.ts`
- Feature 145 worker/remotion services and migrations
- Focused worker/media/remotion tests

Map modern calls to current durable idempotency keys and job/task projections.
Redis replay is an optimization only. Durable conflict, credit settlement,
lease, artifact checksum, R2 publication, and Media History/Library registration
remain authoritative. Retries after commit return the durable result; retries
before commit reuse the same idempotency key.

## 7. Section 06 — observability and rollout

Use `mcpObservability.ts`, shared audit/rate/quota middleware, feature flags, and
release docs. Emit bounded metrics by protocol era, method, canonical tool,
tenant, outcome, latency bucket, cache hit, retry, and deny reason. Accept trace
context only as validated correlation metadata. Never log bearer/refresh tokens,
signed URLs, prompts, or media bytes. Flag order is global kill switch, tenant
allowlist, capability flag, principal/scope, then limits. Rollback disables
modern dispatch/capabilities without deleting jobs or artifacts.

## 8. Section 07 — testing and evidence

Use Vitest with existing fixtures. Add pure protocol tests, handler tests,
registry/resource/auth integration tests, pinned MCP Inspector fixtures, load and
failure tests, and real Hermes smoke tests. Platform tests are evidence, not
simulated Linux passes.

## 9. Section 08 — gates, migration, and rollback

Deep-implement proceeds in section order. Each section documents actual paths,
tests, deviations, and remaining external gates. No durable schema is expected
for protocol compatibility; migration preflight must stop on schema/ledger drift.
Feature flags remain off until automated tests and security review pass. Native
Feature 145 gates require signed Windows/macOS packs, real short renders,
upload/checksum, device revoke, and Worker App parity before production use.
