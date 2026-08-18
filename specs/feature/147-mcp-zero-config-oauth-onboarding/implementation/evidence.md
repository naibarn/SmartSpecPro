# Feature 147 implementation evidence

Date: 2026-08-17 (Asia/Bangkok)

## PASS — code and focused verification

- `server/services/mcpOAuthAuthorizationService.ts` implements RFC 7636 S256, exact redirect validation, hashed authorization codes/refresh tokens, RS256/ES256 signing, resource/audience claims, short-lived access tokens, rotating refresh tokens, and refresh-family reuse revocation.
- `server/_core/mcpOAuthServer.ts` implements RFC 8414/OIDC discovery, JWKS, DCR, browser login continuation/consent, authorization decision, token, refresh, and revoke endpoints.
- `server/_core/mcpOAuthJwks.ts` verifies first-party keys in-process, requires exact resource and grant context, and `authz.ts` rechecks the durable grant before MCP access.
- Connected Devices ownership/revoke path is wired to `mcp_oauth` grants and the Settings panel shows safe client/redirect/expiry metadata without raw credentials.
- Focused test command: `npm --workspace apps/web test -- --run server/_core/__tests__/mcpPublicServer.test.ts server/_core/__tests__/mcpPublicServerSecurity.test.ts server/services/__tests__/mcpOAuthAuthorizationService.test.ts`
- Result: the combined focused regression command covered 7 files and 78 tests; all passed.
- Import smoke: OAuth service and route modules import successfully with the required JWT test secret.

## PASS — production database and process

- Preflight found production at migration `0225_connected_device_management` and no MCP OAuth tables.
- `drizzle-kit migrate` applied `0226_mcp_oauth_authorization` and `0227_mcp_oauth_grant_redirect_uri`.
- Verified tables: `mcp_oauth_clients`, `mcp_oauth_transactions`, `mcp_oauth_grants`, `mcp_oauth_refresh_tokens`.
- Verified `mcp_oauth_grants.redirectUri` is `NOT NULL`.
- `smartspec-web` restarted successfully and `GET /healthz` returned `{"status":"ok"}`.
- Live unauthenticated MCP request returned HTTP 401 with `WWW-Authenticate`; existing MCP public regression suite remained green.

## PASS — pilot activation

- The production control plane now provisions/rotates the RS256 private JWK from the authenticated Admin UI; the value is encrypted in `system_settings` and never returned to the browser. No MCP/OAuth runtime value is required in `.env`.
- Production runtime config is saved under `system_settings.category=mcp`: issuer `https://smartaihub.app`, resource `https://smartaihub.app/v1/mcp`, audience `smartaihub-mcp`, public JWKS URI, inbound verification, authorization-server and DCR gates. `MCP_OAUTH_CIMD_ENABLED=false` remains intentional.
- Pilot tenant `tenant-ZCSKEM9s` has `mcpOAuthProtectedResourceEnabled=true`, `mcpOAuthAuthorizationServerEnabled=true`, `mcpOAuthDynamicRegistrationEnabled=true`, and `mcpOAuthCimdEnabled=false`.
- Live production checks: PRM 200, AS metadata 200, OIDC metadata 200, JWKS 200 with public-only RS256 key, invalid loopback DCR 400, service health 200.
- First-party RS256 fixture signed with the provisioned private JWK verified in-process with issuer/audience/resource/tenant/user/grant claims; private token/key material was not emitted.
- Key rotation contract supports up to eight additional public JWKs via `MCP_OAUTH_ADDITIONAL_PUBLIC_JWKS`; verification selects by `kid` while the current private key remains separate.

## Compatibility closure — 2026-08-17

- `/.well-known/mcp.json` and `WWW-Authenticate` now advertise the canonical
  protected-resource metadata URL from the UI/database-backed runtime config.
- OAuth deployment scope configuration is canonicalized to the actual MCP
  registry: `llm:chat`, `remotion:submit`, `remotion:read`,
  `remotion:cancel`, `library:search`, and `library:upload` are supported;
  legacy `models:read`/`render:*` request names map to those canonical scopes.
- Production readiness now reads the UI/database-backed runtime config and
  fails if its source is not `system_settings.category=mcp`, the authorization-
  server gate lacks a signing key, or the required public URLs/scopes are missing.
- Hosted MCP preflight handling delegates to the MCP CORS policy, and public
  onboarding docs are available before the API authentication middleware.

## NOT RUN / remaining live client evidence

- Hermes Windows/macOS, Claude remote connector, Codex, MCP Inspector, browser consent, refresh, revoke, and upload/render live gates require client accounts/hosts and are not claimed as passed.
- Full repository typecheck remains baseline-failing; no Feature 147-specific type errors were reported. The final baseline error observed was `shared/verticalDramaSeries/storyContinuity.ts:452`.

## Required production activation order

1. Open `Settings → Infrastructure → MCP/OAuth` as a platform admin and save the canonical HTTPS URLs, scopes, CORS/session origins, and desired gates. Never commit or log the private JWK.
2. Use the UI's `Generate/rotate signing key` action, verify the key status is configured, and run `npm --workspace apps/web run mcp:readiness` on the production host.
3. Verify metadata/JWKS and a browser consent flow, then enable only `mcpOAuthAuthorizationServerEnabled` and `mcpOAuthDynamicRegistrationEnabled` for the pilot tenant.
4. Keep CIMD disabled until its SSRF-safe fetch implementation and client-specific live evidence are added. Use an explicit tenant/deployment scope allow-list and require user consent plus `mcp:write` for write/media/Remotion operations.
5. Run live Hermes/Claude/Codex/Inspector gates, then expand tenant rollout. Revoke the grant from Settings and verify the old access token receives an authorization failure.

## Incremental closure — 2026-08-17

The implementation now also closes the production rollout/control-plane gaps
identified during the UI and compatibility audit:

- MCP transport telemetry is attached to modern `/v1/mcp`, legacy REST
  `/api/mcp/tools` and `/api/mcp/call`, Hermes pairing, download broker, and
  OAuth endpoints. It records transport, exact endpoint, HTTP method, MCP
  protocol version, client name/version (from MCP headers or initialize
  `clientInfo`), auth mode, tool name, status, and duration. Prompt content,
  tool arguments, bearer tokens, refresh tokens, and authorization headers are
  excluded. Modern requests use the existing public API audit middleware once;
  the transport hook does not create a duplicate row.
- Settings now has a real owner-scoped Connected Devices surface with client
  name/origin/id, tenant, platform, fingerprint, scopes, access/refresh
  expiry, status, revoke-one, and revoke-all-MCP actions. The endpoint is
  generated from the current server origin, so staging and production do not
  share a copied URL.
- `McpConnectPanel`, `HermesConnectPanel`, and `McpServersSettingsPanel` remain
  under Integrations because they configure outbound/provider integrations;
  Remote MCP onboarding is presented separately under MCP & Devices.
- Focused verification after these changes: the final MCP public/OAuth/
  connected-device/telemetry regression command passed 7 files and 77 tests.
  MCP type-contract and secret scans passed with no MCP-targeted diagnostics or
  findings. Full repository
  TypeScript remains baseline-failing in unrelated files; no diagnostic points
  to the changed MCP/OAuth/UI files.

### Legacy sunset rule

Legacy REST and pairing remain supported compatibility fallbacks. They must not
be removed or hard-deprecated while active traffic exists. The telemetry
dataset is reviewed by endpoint, client name, and client version; a sunset
review may begin only after **at least 30 consecutive days with zero successful
and failed legacy requests**, with a 90-day observation window preferred for
external clients. Before removal, publish a deprecation date, notify affected
users, retain a kill-switch rollback, and verify that modern OAuth traffic and
the documented migration path cover every remaining client class.

## UI-auth closure — 2026-08-17

- The OAuth signing key is provisioned automatically on the server when an
  admin enables the authorization-server toggle; no key input or key-copy step
  is presented to users. OAuth clients receive access through browser login,
  PKCE, consent, and secure client-side token storage.
- Legacy workspace writes accept the approved OAuth `mcp:write` scope without a
  pasted write key; the old header token remains only as a bounded compatibility
  fallback for legacy REST clients.
- The Hermes guide explicitly distinguishes MCP browser OAuth from Hermes'
  separate provider-chat credential. `API Server Key not set` is therefore not
  treated as an MCP authentication failure.

## UI-first client onboarding closure — 2026-08-17

- Settings → MCP & Devices now exposes separate Hermes One deep-link, Hermes
  CLI command-copy, Claude, Codex, and Other MCP client onboarding actions.
- The deep link is generated in `client/src/lib/mcpClientOnboarding.ts` and
  contains only the public MCP URL and `auth: "oauth"`; no access, refresh,
  worker, or API key material is present.
- The UI checks both public OAuth metadata endpoints and fails closed when the
  server has not enabled/saved the OAuth runtime configuration.
- `/v1/docs`, the MCP documentation resource, and the Settings UI now use the
  same client matrix: Hermes One, Hermes CLI/Agent, Claude/Claude Desktop,
  Claude Code, Codex, and generic Other MCP clients. The OpenAPI description
  explicitly separates REST API-key authentication from `/v1/mcp` OAuth.
- Focused verification: 4 files / 28 tests passed; UI source esbuild transform
  and `git diff --check` passed.
- Live Claude/Codex/Hermes client-account compatibility remains a deployment
  evidence gate and is not claimed as passed by these UI changes.
