# Feature 147 deep implementation plan

## Planning outcome

Implement one first-party OAuth authorization-server boundary for SmartAIHub MCP and connect it to the existing browser login, tenant selection, connected-device control plane, and Feature 146 resource-server verifier. The server exposes standards discovery so clients can self-configure; Hermes/Claude/Codex client behavior is validated separately and never inferred from server tests.

The smallest safe architecture is:

```text
Hermes / Claude / Codex
        |
        | 401 + WWW-Authenticate(resource_metadata)
        v
SmartAIHub MCP resource server
        |  PRM -> AS metadata -> DCR/CIMD
        v
SmartAIHub OAuth AS -> existing web login -> consent -> code + PKCE
        |
        v
RS256/ES256 access token + rotated refresh token
        |
        v
Feature 146 principal resolver -> scope-filtered MCP tools -> object ACLs
```

## Wave 0 — Freeze contracts and deployment decisions

### Files/areas

- `specs/feature/147-mcp-zero-config-oauth-onboarding/spec.md`
- Feature 146 OAuth sections, `mcpOAuthMetadata.ts`, `mcpOAuthJwks.ts`, `authz.ts`
- deployment environment/secrets and public-origin configuration
- client compatibility evidence manifest

### Work

1. Confirm canonical issuer/resource URLs and whether `smartaihub.app` is the only production MCP host.
2. Confirm asymmetric key ownership, rotation, backup, rollout, and emergency retirement procedure.
3. Confirm target Claude plan/account and documented DCR callback behavior.
4. Obtain a real Codex MCP OAuth test environment and exact supported client version; do not mark Codex PASS from a generic OpenAI login.
5. Record whether Hermes CLI/Agent will implement standard OAuth directly or initially use the existing pairing flow as a fallback.
6. Decide exact default scopes for initial connection: `mcp:read` plus read-only catalog/resources; request generation/download/render/write scopes only through explicit incremental consent.

### Gate

No database or public route implementation begins until issuer, resource, key management, client test accounts, and scope defaults are recorded. If key management is unavailable, choose a vetted external authorization server and keep SmartAIHub in resource-server mode rather than inventing insecure key storage.

## Wave 1 — Durable OAuth data model and crypto service

### Files/areas

- `apps/web/drizzle/schema.ts`
- new Drizzle migration and snapshot
- new service modules under `apps/web/server/services/` or `_core/`
- `apps/web/server/_core/revocation.ts`
- existing audit/event service

### Work

Add durable records for:

- `mcp_oauth_clients`: stable client ID, client type, safe client metadata, redirect URI set, policy, status, created/last-used timestamps;
- `mcp_oauth_transactions`: hashed one-time authorization code, client, redirect, PKCE challenge, resource, requested/approved scopes, user/tenant, expiry, consumed timestamp;
- `mcp_oauth_grants`: user/tenant/client/device binding, approved scopes, status, created/last-used/access/refresh expiry, refresh family;
- `mcp_oauth_refresh_tokens`: hashed token, family, parent/rotation lineage, expiry, used/revoked/reuse state;
- `mcp_oauth_signing_keys`: key ID, public JWK, active/retiring state and lifecycle timestamps if keys are stored in DB; private material remains in secret/key management;
- auditable OAuth events using existing audit conventions.

Use unique constraints for client identity, transaction/code hash, refresh token hash, and grant family. Add indexes for user/tenant ownership, client lookup, active grants, expiry cleanup, and JTI/revocation lookup.

Implement a crypto service with:

- `generateAuthorizationCode`/hash-and-store;
- PKCE S256 validation using constant-time comparison;
- asymmetric JWT signing with explicit `kid`, issuer, audience/resource, tenant/user, scope, client, JTI, and expiry claims;
- public JWKS projection and key rotation overlap;
- opaque refresh-token generation, hashing, atomic rotation, reuse detection, and family revocation.

Do not reuse `deviceAuthRoutes.ts` HS256 desktop token minting for public MCP OAuth. Reuse revocation/audit primitives only after claim semantics are kept separate.

### Gate

Migration preflight, schema snapshot, transaction tests, secret-scan, key-rotation tests, and refresh-reuse tests pass before route wiring.

## Wave 2 — Standards discovery and registration routes

### Files/areas

- `apps/web/server/_core/mcpOAuthMetadata.ts`
- new `mcpOAuthServerMetadata.ts`
- new `mcpOAuthRegistration.ts`
- `apps/web/server/_core/index.ts`
- route and CORS/rate-limit middleware

### Work

1. Extend PRM to advertise the first-party issuer only when the new AS gate and complete verification readiness pass.
2. Add RFC 8414 and OIDC-compatible metadata with an exact capability projection. Never advertise DCR/CIMD/refresh/scopes that are disabled.
3. Add `/.well-known/jwks.json` with cache headers and active/retiring public keys only.
4. Add `POST /oauth/register` with strict JSON schema, bounded strings/arrays, DCR rate limits, exact redirect policy, PKCE S256 requirement, public-client policy, safe metadata projection, and idempotent equivalent registration.
5. Add CIMD validation only when enabled: HTTPS URL, safe fetch, response size/content-type/time limits, no private/loopback redirect, bounded cache, and revalidation.
6. Keep metadata endpoints public but non-user-specific. Do not allow an input URL to control outbound fetches without SSRF policy.
7. Ensure `/v1/mcp` unauthenticated responses produce `401` + `WWW-Authenticate` before JSON-RPC handling for OAuth-capable deployments, while preserving legacy/API-key behavior where explicitly configured.

### Gate

Metadata snapshots match MCP/RFC fields; DCR/CIMD negative tests reject unsafe redirects and oversized/malformed metadata; no secret or tenant data appears; Claude's DCR callback can register in a live test.

## Wave 3 — Browser authorization and consent

### Files/areas

- new `mcpOAuthAuthorization.ts`
- new `mcpOAuthRoutes.ts`
- existing login/session route and safe return-url helpers
- new real client page/component under `apps/web/client/src/pages` or settings auth flow
- localized strings and UI tests

### Work

Implement `GET /oauth/authorize`:

1. Validate client, redirect, response type, resource, scope, PKCE, and state format before login/consent.
2. Store a short-lived server-side transaction keyed by an opaque nonce; do not put authorization request secrets in an unsigned `returnUrl`.
3. If unauthenticated, redirect to the existing login page with a signed/bound continuation. After login, restore only the validated transaction.
4. Resolve the active tenant from the authenticated account. If the account can access multiple tenants, show an explicit tenant selector inside consent and bind the selected tenant to the transaction.
5. Render a real consent page with client name/origin, requested scopes in Thai/English, tenant, lifetime, risk-sensitive permissions, and Approve/Deny.
6. On approve, cap scopes to requested/allowed/tenant-enabled scopes; create a one-time code bound to client/redirect/resource/user/tenant/PKCE and redirect exactly to the registered URI with code/state.
7. On deny or error, redirect only to the validated registered URI with a standard error and original state; never leak internal error details.
8. Add CSRF/trusted-origin protections to approve/deny and audit every decision.

### Gate

Browser integration proves login continuation, consent, denial, tenant binding, scope reduction, code replay rejection, and exact redirect behavior. UI tests cover loading/error/expired/revoked states without rendering token material.

## Wave 4 — Token, refresh, revoke, and resource-server integration

### Files/areas

- `apps/web/server/_core/authz.ts`
- `apps/web/server/_core/mcpOAuthJwks.ts`
- `apps/web/server/_core/mcpPublicServer.ts`
- new token/revoke route/service tests
- connected-device/revocation services

### Work

1. Add `/oauth/token` authorization-code and refresh-token grants with strict content type, client/resource/redirect/PKCE validation, generic OAuth errors, and rate limiting.
2. Add `/oauth/revoke` for access/refresh token or grant revocation without token enumeration.
3. Extend the JWKS verifier to first-party SmartAIHub mode using the deployed asymmetric JWKS and preserve external-issuer mode only as an explicit alternative.
4. Validate `iss`, `aud`, resource indicator, `tenantId`, `userId`, scopes, `client_id`, JTI, algorithm, and expiry. Check durable grant/device revocation before tool execution.
5. Keep access tokens short-lived and rotate refresh tokens atomically. Reuse revokes the full refresh family and emits a high-severity audit event.
6. Map OAuth `scope` to the existing MCP scope parser and registry availability. Do not treat OAuth authentication as permission to bypass file/media/render ACLs.
7. Preserve static token, API key, browser session, delegated-worker, and Feature 145 pairing behavior with separate tests.

### Gate

End-to-end local OAuth flow produces an asymmetric access token accepted by `/v1/mcp`, returns 19 tools/4 resources for the seeded tenant-scoped principal, and fails for wrong issuer/audience/resource/tenant/scope/revocation. Existing Feature 146 suites remain green.

## Wave 5 — User-owned connection control plane

### Files/areas

- `apps/web/server/services/connectedDeviceService.ts`
- connected-device router and tests
- `apps/web/client/src/components/settings/ConnectedDevicesPanel.tsx`
- locale files and settings route

### Work

Extend current connected-device UI/API with `mcp_oauth` grants. Expose only the authenticated user's records, safe client/origin/fingerprint projection, scopes, tenant, timestamps, and status. Add revoke-one and revoke-all-own-MCP operations. Keep tenant-admin emergency revoke separate and audited.

Revoke path must update durable grant state, JTI/revocation cache, refresh family state, and connected-device status. Verify propagation across multiple web instances/Redis failure modes according to the documented fail-closed policy.

### Gate

Ownership isolation tests prove user A cannot enumerate/revoke user B's grants, stale access fails within the documented bound, refresh fails after revoke, and UI never displays raw credentials.

## Wave 6 — Client adapters and live compatibility evidence

### Files/areas

- Hermes client/agent source and secure-store adapters
- Hermes One integration contract/docs, no Xcode rebuild requirement for server-only changes
- `apps/web/scripts/mcp-v2-protocol-smoke.mjs` and new OAuth smoke harness
- CI evidence workflow and client matrix

### Work

1. Implement Hermes URL-only discovery, browser launch, localhost callback handling, state/PKCE, secure token storage, automatic refresh, revoke/error UX, and pairing fallback.
2. Validate Hermes Windows 11 and macOS x64/arm64 with no plaintext credentials and no server-side Xcode dependency.
3. Test Claude using documented DCR and callback behavior; record actual callback/IP/client metadata only for policy validation, never hardcode broad IP trust as auth.
4. Test Codex on the supported MCP surface. Confirm whether the product follows PRM/AS metadata, DCR/CIMD, localhost/hosted callback, and keyring behavior. If a current version lacks a capability, record the exact fallback and do not mark universal zero-config PASS.
5. Use MCP Inspector and live smoke to verify metadata, DCR, browser authorization, token exchange, tools/list, resources/list/read, and revoke.

### Gate

Each client has a separate PASS/FAIL/BLOCKED/NOT RUN record. The server may enable OAuth for a client only after that client's live proof; a server unit-test pass is not client compatibility proof.

## Wave 7 — Rollout and operations

### Files/areas

- feature flags/types/defaults and tenant admin policy
- deployment environment/service unit/secret manager
- readiness and rollback scripts
- Feature 147 evidence/runbook

### Work

Add defaults-off tenant flags `mcpOAuthAuthorizationServerEnabled`, `mcpOAuthDynamicRegistrationEnabled`, and `mcpOAuthCimdEnabled`, plus global environment gates. Add metrics for metadata, registration, authorize, token, refresh, revoke, invalid token, insufficient scope, reuse, and client compatibility. Add alerts for refresh reuse, registration abuse, 401/403 spikes, key/JWKS outage, and revoke propagation delay.

Roll out to the already-enabled Smart AI Hub tenant only after all gates. Keep existing Feature 146 modern/resource/alias flags unchanged. OAuth server enablement must not implicitly enable Remotion or write/download scopes.

## Dependency order and critical path

```text
issuer/key decision
  -> schema/crypto
  -> discovery/DCR/CIMD
  -> browser consent
  -> token/verifier integration
  -> user revoke UI
  -> Hermes/Claude/Codex live tests
  -> tenant rollout
```

The critical security path is schema/crypto → authorization transaction → token verifier → revoke propagation. Client adapters and UI can proceed in parallel only after endpoint contracts are frozen.

## Explicit implementation gates

- G0: canonical issuer/resource/key ownership decided.
- G1: migration and durable grant model applied and verified.
- G2: metadata is standards-correct and fail-closed.
- G3: DCR/CIMD redirect/SSRF policy passes negative tests.
- G4: browser login/consent/PKCE/code replay protections pass.
- G5: asymmetric token/JWKS/refresh/revocation pass.
- G6: user ownership/revoke UI/API pass.
- G7: Hermes Windows/macOS proof passes.
- G8: Claude live DCR/callback proof passes.
- G9: Codex live discovery/auth proof passes or is explicitly blocked with a safe fallback.
- G10: security, load, audit, rollback, and deployment readiness pass.

No production OAuth flag is enabled while G0–G6 or the required client gate is unresolved.
