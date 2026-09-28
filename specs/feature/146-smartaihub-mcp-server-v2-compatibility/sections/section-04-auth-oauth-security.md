# Section 04 — Auth, OAuth, connected devices, and request hardening

## Scope

Own authenticated principal construction, inbound MCP OAuth metadata/challenge,
scope mapping, device revocation checks, origin/host/SSRF/cursor/rate-limit
hardening. Feature 145 remains the authority for pairing UX and token storage.

## Required design

Reuse `authorizeRequest` and existing pairing/device revocation checks. Add
`GET /.well-known/oauth-protected-resource` from deployment-safe configuration,
and a standards-compliant 401 Bearer challenge. Pair it with a real configured
external authorization-server metadata/JWKS verifier or a SmartAIHub-owned
authorization server; PRM alone is not a complete OAuth implementation. Validate issuer, signature,
expiry, audience/resource, token use, tenant/user/device, and scopes. Never trust
clientInfo or caller tenant/user headers.

Keep current scopes as aliases while adding least-privilege media/render/
library/credit/Hermes scopes. Do not let new OAuth/device flows inherit broad
static-token write access. Hidden tools must also reject guessed calls.

The user control plane must show only the user's own connected devices/API keys,
allow idempotent revoke, show safe expiry metadata, and keep tenant-admin flag
changes audited and separate from user permissions. A user cannot self-enable a
tenant feature flag or widen scopes.

Preserve browser Origin/CSRF policy, validate Host/DNS/rebinding, enforce SSRF
blocking for URL inputs, and use bounded rate limits by principal/tool/tenant.
Audit reasons without secrets or signed URLs.

## TDD contract

Test missing/invalid/expired/revoked/audience/resource-mismatch credentials,
401 headers, insufficient scope, pairing device revoke, cross-tenant IDs,
untrusted Origin/Host, private-IP redirects, cursor tampering, rate limits, and
redaction. Reproduce and fix the two current MCP security-suite failures before
adding modern cases.

## Exit criteria

Every MCP call has a server-derived principal and object-level authorization;
revoking a connected device blocks future modern and legacy calls without
waiting for a Redis session TTL.

## Implementation status — 2026-08-17

Implemented:

- `mcpOAuthJwks.ts` adds an opt-in inbound resource-server verifier using
  `jose` Remote JWKS. It requires HTTPS JWKS/issuer, configured audience,
  allowed RS256/ES256 algorithms, valid expiry/signature, and numeric user plus
  tenant claims before constructing a principal.
- `authz.ts` invokes the JWKS verifier before the local HS256 path only for MCP
  endpoint paths when inbound OAuth is enabled. A failed external verification
  cannot fall back to local JWT interpretation, while normal worker/API routes
  keep their existing bearer-token path.
- `mcpOAuthMetadata.ts` emits Protected Resource Metadata only when an
  absolute MCP resource, authorization server, inbound JWKS URI, and audience
  are present. Missing verifier configuration returns 404 instead of claiming
  OAuth readiness.
- MCP authentication failures and insufficient scopes set a bounded
  `WWW-Authenticate: Bearer` challenge; the metadata URL is included only
  when a deployment public base URL is explicitly configured.
- Existing JWT/API-key/pairing authorization and connected-device revocation
  remain the source of truth. No query-string credential path was added.
- Legacy broad-scope compatibility is now explicit, tenant-gated, and applied
  only to legacy sessions; modern stateless requests never inherit it. Existing
  sessions re-evaluate the legacy kill switch on every request.
- Modern cursors are HMAC-signed and principal/scope/era-bound; tampered,
  expired, or cross-principal cursors fail as invalid params.

Unit and integration tests cover partial configuration, real mock JWKS
signature/issuer/audience checks, scope/tenant/user mapping, and authz
fail-closed integration. The current environment still has no configured
production issuer/JWKS, so live OAuth deployment verification remains a gate.
