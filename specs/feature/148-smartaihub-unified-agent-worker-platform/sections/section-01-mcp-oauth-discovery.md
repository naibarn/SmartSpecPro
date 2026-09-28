# Section 01 — MCP OAuth and Discovery

## Goal

Make `/v1/mcp` and OAuth discovery truthful and interoperable without changing
legacy pairing/REST behavior.

## Ownership

Modify only the MCP core/config/test files listed in the plan. Do not change UI,
worker runtime, database migrations, or provider media code in this section.

## Required behavior

1. PRM is emitted only when DB-backed inbound OAuth verification, resource,
   issuer/authorization server, JWKS, and audience configuration are complete.
2. PRM uses the canonical resource URI and safe human-readable name, with valid
   scopes and bearer header support.
3. Protected `/v1/mcp` responses include `WWW-Authenticate` with
   `resource_metadata` and the minimum required scope; no secret is included.
4. OAuth tokens are rejected for wrong issuer/audience/resource, expiry,
   revocation, malformed signature, or insufficient scope before tool dispatch.
5. `server/discover`, `initialize`, tools/resources, ping, DELETE session,
   legacy fallback, and flags-off behavior retain current contracts.
6. MCP tasks/subscriptions/list-change remain disabled unless their existing
   feature gates and durable authority are verified.

## Implementation notes

- Reuse `mcpOAuthMetadata.ts`, `mcpOAuthJwks.ts`, `authz.ts`,
  `mcpRolloutPolicy.ts`, `mcpRuntimeConfig.ts`, and existing OAuth services.
- Preserve production DB-only configuration semantics.
- Do not introduce a second issuer, token table, key store, or route family.
- Keep all errors safe for generic clients and add correlation telemetry only.

## Tests-first requirements

- Extend focused metadata tests for missing config, canonical fields, scope
  normalization, and challenge generation.
- Extend MCP public/security tests for 401 challenge and no secret leakage.
- Extend authz tests for audience/resource/scope/revocation failures.
- Run the focused Vitest files and the MCP readiness/failure harness where safe.

## Acceptance evidence

Record exact focused test commands and results. If production config or live
OAuth issuer is unavailable, record the blocked external gate rather than
changing defaults to make the test appear green.

## UI/UX Contract

### Target User / JTBD

N/A for a new UI; this section supplies status/error semantics consumed by
existing Settings/docs surfaces.

### Surface Inventory

Existing `/v1/docs`, MCP resources, and OAuth readiness indicators only.

### Component Map

N/A; no component ownership changes.

### State Matrix

Metadata disabled, metadata ready, invalid configuration, unauthorized,
insufficient scope, expired/revoked token, and protocol compatibility failure.

### Responsive Matrix

N/A; HTTP/resource contracts are viewport-independent.

### Accessibility Acceptance

Existing consuming UI must expose machine-readable and human-readable error
states; no color-only or secret-bearing status is introduced.

### Copy Contract

Use existing localized human-readable MCP/OAuth error copy; never expose JWK,
token, or internal secret details.

### Browser Evidence Required

Verify the Settings OAuth-readiness indicator and `/v1/docs` status agree with
the HTTP PRM/challenge response when a browser environment is available.

## Implementation status

Implemented and verified in the existing canonical `/v1/mcp` path. OAuth/PRM
and challenge behavior remains configuration-gated by the existing runtime
settings; live production issuer/JWKS and browser evidence are external gates.
