# Section 02 — Discovery and registration

## Objective

Make a client able to discover SmartAIHub OAuth without manual issuer/JWKS/client configuration and register safely.

## Ownership

- `apps/web/server/_core/mcpOAuthMetadata.ts`
- new authorization-server metadata, registration, CIMD, and JWKS modules
- `apps/web/server/_core/index.ts` route wiring
- rate-limit/CORS policy and focused tests

## Endpoints

```text
GET  /.well-known/oauth-protected-resource
GET  /.well-known/oauth-authorization-server
GET  /.well-known/openid-configuration
GET  /.well-known/jwks.json
POST /oauth/register
```

## Security acceptance

- PRM/AS metadata is absent or 404 when any required readiness gate is missing;
- metadata contains only canonical resource, issuer, implemented capabilities, and supported scopes;
- DCR requires public authorization-code client, PKCE S256, bounded metadata, exact redirects, and rate limiting;
- CIMD fetches only approved HTTPS metadata with timeout/size/content-type/SSRF protection;
- HTTPS hosted callbacks and restricted localhost callbacks are exact-match only;
- Claude's documented DCR/callback profile is accepted in live evidence;
- OpenAI/Codex and Hermes client profiles are not assumed to work without live proof.

## Blocks

Section 03 and client onboarding. This section does not issue tokens.
