# Feature 147 — Zero-config MCP OAuth onboarding for Hermes, Claude, and Codex

**Status:** Implemented, migrated, signing key provisioned, and enabled for the pilot tenant; Hermes/Claude/Codex live compatibility gates remain separate evidence work  
**Owner:** SmartAIHub Platform / MCP / Identity  
**Depends on:** Feature 146 (`146-smartaihub-mcp-server-v2-compatibility`), Feature 145 (`145-hermes-remotion-render-executor`), existing browser login/session, connected-device control plane, Library/Media ACL services  
**Primary goal:** Let a supported MCP client connect with only the SmartAIHub MCP URL, discover OAuth automatically, open SmartAIHub in a browser when authorization is needed, and return to the client with a least-privilege credential after explicit user consent.

## 1. Problem and desired user experience

Feature 146 already has a configuration-gated Protected Resource Metadata route and an inbound JWKS verifier, but it is not a complete OAuth authorization flow. Metadata only tells a client where an authorization server is located; SmartAIHub still needs discovery, registration, authorization, token, refresh, revocation, and browser-consent surfaces.

The target experience is:

1. The user adds only `https://smartaihub.app/v1/mcp` to Hermes, Claude, or Codex. No SmartAIHub API key, issuer URL, client ID, or JWKS URL is copied manually.
2. The client calls MCP and receives a standards-compliant `401` challenge.
3. The client discovers Protected Resource Metadata and Authorization Server Metadata, then registers or identifies itself using a supported standard method.
4. The client opens a SmartAIHub browser page. The user logs in using the existing web login if needed, reviews the client name, redirect origin, requested scopes, tenant, and expiry, then explicitly approves or denies.
5. The client receives an authorization code through its registered callback, exchanges it with PKCE, stores tokens in its own secure credential store, and retries MCP automatically.
6. SmartAIHub verifies issuer, signature, audience/resource, expiry, tenant, user, scopes, client, and revocation on every request. The user can later see and revoke the connection from Settings.

### UI-first onboarding contract

The user-facing Settings → MCP & Devices surface must provide one client-aware
entry point while preserving the same server contract:

- Hermes One uses a public-only `hermes://mcp/install` deep link containing the
  canonical MCP URL and `auth: "oauth"`. Hermes must show its own confirmation
  before saving; SmartAIHub never places an API key or token in the URI.
- Hermes CLI/Agent has a separate terminal path using `hermes mcp add ...
--auth oauth`, `hermes mcp login`, and `hermes mcp test`; the UI must not
  imply that Hermes CLI requires the Hermes One deep link or vice versa.
- Claude and Claude Desktop use their supported remote Connector UI with the
  same MCP URL, then browser OAuth. SmartAIHub may open Claude's public UI and
  copy only the endpoint, but must not invent a Claude-private deep link or
  write Claude credentials.
- Codex uses its supported MCP settings/remote Streamable HTTP surface with the
  same MCP URL and browser OAuth. SmartAIHub must not assume that every Codex
  release exposes the same settings or OAuth status controls.
- The three clients share the SmartAIHub endpoint, OAuth issuer, tenant ACL, and
  scope policy, but each client owns its credential store and callback.
- Other MCP clients receive a generic Streamable HTTP + OAuth discovery path;
  clients without MCP OAuth must be directed to an explicitly supported
  compatibility fallback or the Public REST/OpenAPI contract, never to a
  guessed static bearer header.
- Client actions are fail-closed until the public OAuth Protected Resource and
  Authorization Server metadata endpoints are reachable. A not-ready state
  explains that an administrator must enable/save MCP/OAuth runtime settings;
  it must not silently fall back to an API key.

The first successful connection must expose the same permission-filtered `server/discover`, `tools/list`, `tools/call`, `resources/list`, `resources/read`, media-history, library, and Remotion job capabilities already covered by Feature 146. OAuth must not broaden access beyond approved scopes or existing tenant/object ACLs.

## 2. Scope

### In scope

- SmartAIHub as a standards-compliant OAuth 2.1 authorization server for the SmartAIHub MCP resource.
- RFC 9728 Protected Resource Metadata and RFC 8414 Authorization Server Metadata, with OpenID Connect discovery compatibility where required by a client.
- Authorization Code + PKCE S256 for public desktop, CLI, hosted, and browser MCP clients.
- Secure dynamic client registration (DCR) and Client ID Metadata Document (CIMD) compatibility, with strict redirect/client policy.
- Browser login and a real consent page using the existing SmartAIHub session.
- Short-lived access tokens, rotating refresh tokens, revocation, reuse detection, and connected-client/device visibility.
- Client compatibility adapters/fixtures for Hermes CLI/Agent, Hermes One for Windows/macOS, Claude remote MCP, and Codex remote MCP.
- Tenant/global kill switches, audit events, rate limits, security telemetry, rollout evidence, and a manual fallback to existing API-key/pairing flows.
- Browserless CLI fallback for Hermes CLI/Agent, Claude Code CLI, Codex CLI, and generic HTTP MCP clients through a dedicated user-created MCP CLI key; this fallback must not reuse OAuth tokens or worker credentials.
- Dedicated MCP CLI credit budgets with independent 5-hour, 1-day, and 7-day windows, safe defaults, explicit unlimited state, response headers, and user self-service adjustment/revocation.
- Production deployment configuration for issuer, resource URI, signing keys, JWKS, cookie/session integration, and trusted public origin.

### Out of scope for this feature

- MCP Tasks or MCP Subscriptions.
- Replacing Feature 145's existing Hermes device pairing in one release.
- A general-purpose identity provider for non-MCP applications.
- Passing SmartAIHub OAuth tokens to upstream providers.
- Open redirect registration, arbitrary callback proxying, or client-supplied tenant/user identity.
- Storing OAuth tokens in browser localStorage, plaintext Redis values, logs, URLs, MCP tool results, or repository files.

## 3. Compatibility principles

The server implements the standards; it does not assume all client versions behave identically. Compatibility is an evidence gate, not a prose claim.

| Client            | Expected onboarding                                                                                       | Credential storage responsibility                  | Required proof                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Hermes CLI/Agent  | PRM/AS discovery, browser Authorization Code + PKCE, local callback or approved callback, automatic retry | OS keychain/Keychain/DPAPI; never plaintext config | Windows 11 and macOS x64/arm64 connect, reconnect, refresh, revoke                                |
| Hermes One        | Same OAuth flow where its MCP host supports remote HTTP; retain pairing fallback for older builds         | Native secure store                                | Existing Windows/macOS Hermes One build connects without Xcode rebuild for the server-side change |
| Claude remote MCP | PRM/AS discovery and hosted browser consent; exact callback policy selected from live client behavior     | Claude-managed credential store                    | Live Claude connection, tool scan, consent denial, expiry/reauth                                  |
| Codex remote MCP  | PRM/AS discovery and browser consent supported by the tested Codex surface                                | Codex-managed secure store/keyring                 | Live Codex CLI/desktop/host connection, tool scan, refresh/revoke                                 |

If a client version does not implement MCP OAuth discovery, the server returns a clear non-secret diagnostic and preserves API-key or Hermes pairing fallback. It must not weaken the server by accepting an unbound static token. The release matrix records exact tested client versions and callback behavior.

### 3.1 Browserless CLI contract

OAuth remains the preferred path whenever the client can open a browser. When a
machine cannot open a browser, the user creates **Settings → API Keys → Create
MCP CLI Key** after logging in on another trusted device. The server shows the
raw key exactly once, stores only its HMAC hash, and labels it `mcp_cli` so it is
visibly distinct from general REST keys. The key is tenant/user bound, scope
bound, revocable, expirable, and never accepted as a worker or OAuth credential.

Supported headless patterns are:

- Hermes CLI/Agent: prefer `--auth oauth`; on a headless interactive host the
  client may complete OAuth with its authorize-URL/paste-back redirect flow from
  another trusted device. If that flow is unavailable, use `--auth header` with
  the dedicated key entered through its secure prompt/secret configuration.
- Codex CLI: `--bearer-token-env-var SMARTAIHUB_MCP_KEY` with the key loaded from
  an OS secret store/environment, never a command-line literal.
- Claude Code CLI and other HTTP MCP clients: `Authorization: Bearer` sourced
  from an OS secret/environment facility, with syntax documented per client
  release and no token in shell history or committed config.

The UI and `/v1/docs/` must show separate instructions for Hermes One, Hermes
CLI/Agent, Claude/Claude Desktop, Claude Code, Codex, and other MCP clients.
Unsupported clients receive the REST/OpenAPI compatibility route rather than a
guessed static header.

### 3.2 MCP CLI credit budget contract

MCP CLI keys use three independent credit budgets in addition to existing RPM
and request-count controls:

| Window | Default | Reset basis | Unlimited |
| --- | ---: | --- | --- |
| 5 hours | 500 credits | fixed UTC bucket | blank/null |
| 1 day | 1,500 credits | UTC day | blank/null |
| 7 days | 5,000 credits | fixed UTC bucket | blank/null |

The user may change each value independently. The server checks the current
budget before an authenticated `/v1` request, reports remaining/used/limit
headers, records actual credits reported by the completed REST or MCP request,
and returns HTTP 429 with `Retry-After` when a window is exhausted. Request
quota and credit quota are separate: a read/discovery loop is stopped by RPM or
request-count controls even when it spends zero credits. Redis counters are
ephemeral enforcement state only; the relational API audit/credit records remain
the durable audit source, and a Redis failure must fail closed for a configured
budget rather than silently bypass it.

## 4. Protocol and endpoint contract

Canonical values for the first deployment:

```text
issuer:   https://smartaihub.app
resource: https://smartaihub.app/v1/mcp
mcp:      https://smartaihub.app/v1/mcp
```

The canonical resource is normalized without fragments or credentials. All public OAuth endpoints require HTTPS in production.

### 4.1 Resource-server discovery

```text
GET /.well-known/oauth-protected-resource
```

Returns public JSON only when the global deployment gate, selected tenant rollout gate, and complete authorization-server/token-verification configuration are healthy. It includes `resource`, `authorization_servers`, `bearer_methods_supported: ["header"]`, minimal `scopes_supported`, and a public documentation/name field. It is never user-specific and never contains secrets.

### 4.2 Authorization-server discovery

```text
GET /.well-known/oauth-authorization-server
GET /.well-known/openid-configuration
```

Both documents describe the same SmartAIHub authorization server and advertise only implemented endpoints and capabilities: `issuer`, authorization/token/revocation endpoints, `jwks_uri`, optional `registration_endpoint`, `response_types_supported: ["code"]`, `grant_types_supported: ["authorization_code", "refresh_token"]`, `code_challenge_methods_supported: ["S256"]`, supported scopes, public-client authentication policy, and `client_id_metadata_document_supported` only when CIMD is actually enabled.

Metadata is cacheable with a bounded TTL and must not advertise dynamic registration, refresh, or scopes disabled at runtime.

### 4.3 Unauthorized challenge

When MCP requires authentication and no valid credential is supplied, the HTTP boundary returns `401`, not a successful JSON-RPC tool error, with a header similar to:

```text
WWW-Authenticate: Bearer realm="SmartAIHub MCP",
  resource_metadata="https://smartaihub.app/.well-known/oauth-protected-resource",
  scope="mcp:read"
```

Invalid/expired/revoked credentials also return `401` with `invalid_token`. Authenticated users lacking a requested scope return `403` with `insufficient_scope`. Error bodies remain generic; detailed reasons are audited server-side.

### 4.4 Client registration

Implement both paths behind independent gates:

1. **CIMD preferred:** accept an HTTPS client metadata document as the client identifier only when its URL, TLS, content type, metadata, redirect URIs, and supported grant/PKCE policy pass validation. Cache with bounded TTL and revalidate on client metadata change.
2. **DCR compatibility:** `POST /oauth/register` accepts a public-client registration only with authorization-code + PKCE S256, exact redirect URIs, bounded metadata, and an approved client policy. Registration is rate limited, idempotent for equivalent clients, and stores only a hash or safe projection of sensitive metadata.

Redirect policy:

- exact-match redirect URI comparison, never prefix or wildcard matching;
- HTTPS only for hosted redirects;
- loopback `http://127.0.0.1`, `http://localhost`, and `http://[::1]` allowed only for a native CLI client and only on an ephemeral/high port selected by the client;
- no file, custom unregistered, data, javascript, private-network, or userinfo-bearing redirect URI;
- known Hermes/Claude/Codex client profiles are allowlisted/configured once by deployment; unknown clients require a safe registration policy and show complete client identity on consent.

The server must not require the user to copy a client ID for supported clients. If a client cannot use either CIMD or DCR, the UI gives an explicit fallback path rather than silently accepting a weaker flow.

### 4.5 Authorization endpoint

```text
GET /oauth/authorize
```

Required validation before showing consent: registered/valid client; exact registered redirect URI; `response_type=code`; client binding; `code_challenge_method=S256` and valid challenge; `resource` exactly equal to the SmartAIHub MCP resource; normalized supported scopes; cryptographically random client `state`; and short-lived one-time transaction state.

If the browser is not logged in, redirect to the existing SmartAIHub login with a server-side continuation record. Original OAuth parameters must not be copied into an arbitrary unsigned `returnUrl`.

The consent page shows client display name and verified/registered origin, SmartAIHub account and active tenant, every requested scope in plain language, whether media download/generation/render/write access is requested, access/refresh lifetime, and revoke instructions. It provides explicit Approve and Deny actions.

Approval may only reduce requested scopes, never add scopes. The authorization code is one-time, short-lived, and bound to client, redirect, resource, user, tenant, and PKCE verifier.

### 4.6 Token, refresh, and revocation endpoints

```text
POST /oauth/token
POST /oauth/revoke
GET  /.well-known/jwks.json
```

Authorization-code exchange requires `grant_type=authorization_code`, code, redirect URI, client ID, and matching PKCE verifier. Refresh requires `grant_type=refresh_token`, rotates the token atomically, revokes the old token, detects reuse, and revokes the token family/device grant when reuse is detected.

Access tokens use asymmetric RS256 or ES256 signing separate from internal HS256 tokens. Claims include `iss`, `sub`, `aud`/resource, `tenantId`, `userId`, `scope(s)`, `client_id`, `jti`, `iat`, and `exp`. Default access lifetime is 10–15 minutes. JWKS rotation has overlap, cache-control, active key ID, and rollback evidence.

Refresh tokens are opaque, hashed at rest, bound to user/tenant/client/device where available, rotated, revocable, and never returned by list/audit APIs. Resource-server validation rejects wrong issuer, signature, audience/resource, tenant/user mapping, algorithm, expiry, revoked JTI, or missing claims.

## 5. User control plane

Extend the existing real Settings connected-device surface; do not create a mockup or expose another user's records.

Each user sees only their own MCP OAuth grants and Hermes devices: client/application name and verified origin, platform/runtime and fingerprint suffix where available, tenant, granted scopes, created/last-used/access-expiry/refresh-expiry timestamps, status, revoke-one, and revoke-all-own-MCP-connections.

The same Settings area exposes the user's own MCP CLI keys with purpose, prefix,
scopes, tenant, expiry, last use, revoke/rotate actions, RPM/request quotas, and
the 5-hour/1-day/7-day credit budgets. Creating a key requires `mcp:read`, shows
the secret once, and provides copy-safe headless setup examples without placing
the secret into a URL, deep link, documentation page, or chat message.

Revoke is idempotent and immediately invalidates access-token JTI/grant checks. Tenant admins may have a separate audited emergency-revoke surface; ordinary users cannot change tenant flags or widen scopes. Consent/connection pages support loading, expired, denied, already-used, revoked, inaccessible, and backend-error states. No token value is displayed after issuance.

## 6. Data and storage design

Use durable relational storage for OAuth grants and audit lineage. Redis is limited to short-lived authorization transactions, rate limits, nonce/state lookups, and revocation-cache acceleration; Redis is not the durable source of truth for grants.

Required durable records (names are implementation choices to finalize in the plan):

- OAuth client registration: client ID, safe metadata, redirect URIs, policy, registration time, last used, status;
- authorization transaction/code: hashed code, client, redirect, PKCE, resource, scopes, user/tenant after consent, expiry, consumed timestamp;
- refresh-token family/grant: hashed token, family ID, client/user/tenant, device link, scopes, expiry, rotation/reuse/revocation state;
- signing-key metadata: key ID, public JWK, active/retiring state, timestamps;
- audit events: registration, consent, denial, exchange, refresh, reuse, revoke, invalid token, scope denial, and admin action.

Dedicated MCP CLI key purpose and its three credit-budget settings may extend
the existing `api_keys.metadata` projection without duplicating the API-key
table. The raw key is never persisted; the metadata contains only purpose and
numeric policy values, while actual spend remains in the existing audit/credit
lineage.

Never persist raw authorization codes or refresh tokens. Sensitive values use existing encryption/hash/key-management conventions and are excluded from logs, traces, telemetry, support exports, and MCP resource output.

## 7. Flags and deployment gates

Keep Feature 146 flags unchanged and add separate defaults-off flags:

```text
mcpOAuthAuthorizationServerEnabled=false
mcpOAuthDynamicRegistrationEnabled=false
mcpOAuthCimdEnabled=false
```

Deployment/runtime controls are managed by the authenticated platform Admin UI
under `Settings → Infrastructure → MCP/OAuth` and persisted in
`system_settings` with category `mcp`. Production must not require operators to
edit or add `MCP_*` values in a service environment. The UI controls the modern
protocol, OAuth inbound/PRM/authorization-server flags, canonical URLs, scopes,
CORS/session origins, session TTL, legacy workspace limits, and encrypted
workspace-write/OAuth signing secrets. A save refreshes the in-process MCP
runtime cache; it does not expose private keys or tokens back to the browser.

The production readiness command is:

```bash
npm --workspace apps/web run mcp:readiness
```

It reads the UI/database-backed config and fails closed when the source is not
the `mcp` system-settings category, URLs are invalid, `mcp:read` is absent, or
an enabled authorization server has no signing key. Environment values may be
used only as non-production test/development fallbacks.

Legacy REST and pairing remain compatibility fallbacks, but their workspace
root, write gate, token, file-size limits, extension allowlist, and rate limit
are also controlled by this same UI section. The canonical production path is
still `/v1/mcp` with OAuth.

Previous environment-only deployment examples are retained below solely as
historical migration reference and must not be copied into production.

```text
MCP_OAUTH_INBOUND_ENABLED=true
MCP_OAUTH_AUTHORIZATION_SERVER_ENABLED=true
MCP_OAUTH_PROTECTED_RESOURCE_ENABLED=true
MCP_OAUTH_AUTHORIZATION_SERVER_ENABLED=true
MCP_PUBLIC_BASE_URL=https://smartaihub.app
MCP_OAUTH_ISSUER=https://smartaihub.app
MCP_OAUTH_RESOURCE=https://smartaihub.app/v1/mcp
MCP_OAUTH_AUDIENCE=smartaihub-mcp
MCP_OAUTH_JWKS_URI=https://smartaihub.app/.well-known/jwks.json
```

The authorization server is not advertised unless issuer, resource, signing key/JWKS, token endpoints, migrations, session login, consent, revocation, and health checks are ready. Evaluation order:

```text
global kill switch → deployment config → tenant flag → client policy
→ authenticated user/tenant → approved scopes → tool/object ACL
```

Rollout: offline metadata/tests; internal issuer/client; Smart AI Hub tenant with read-only scopes; live Hermes/Claude/Codex tests; write/media/download/render scopes after security/ACL evidence; gradual tenant expansion while API-key and pairing fallback remain available.

## 8. Security requirements

- PKCE S256 and state are mandatory; no implicit grant and no client-secret requirement for public clients.
- Strict issuer/resource/audience binding; no token passthrough to upstreams.
- Exact redirect matching and allowlisted/validated client metadata.
- Login CSRF and OAuth transaction binding; consent cannot complete from a different browser/account/tenant than allowed.
- Rate-limit registration, authorize, token, refresh, revoke, and failed exchange paths; detect code guessing and refresh reuse.
- Secure/SameSite session cookies, trusted-origin checks, anti-CSRF on approval/revoke, and no secrets in URLs after callback processing.
- Opaque client errors; hashed client/code/token identifiers in audit logs.
- Key rotation and JWKS outage behavior fail closed for new verification unless an explicitly approved bounded cache grace exists.
- Scope-to-tool and scope-to-object ACL checks remain enforced after OAuth authentication. `library:download` rechecks current file ACL; media-history/R2 and Remotion artifact access never relies on an old grant.
- Public metadata cannot reveal tenant data, user data, client secrets, token material, internal topology, or provider credentials.
- MCP CLI keys use the existing high-entropy `sk-ssp_` format and HMAC storage;
  list, telemetry, audit, and error surfaces expose only a prefix or safe
  identifier. Revoke is immediate and ownership is checked by both user and
  tenant.
- Credit-budget counters are keyed by API-key identity, use bounded TTLs, do
  not store raw credentials, and emit no prompt, file, token, or media content.

## 9. Testing and acceptance criteria

### Unit and integration tests

- PRM/AS/OIDC metadata schema, cache headers, flag gating, and no-secret output;
- 401 `WWW-Authenticate` resource metadata and scope challenge;
- DCR/CIMD validation, duplicate registration, metadata timeout, redirect exactness, loopback policy, and rate limits;
- authorize login continuation, state/PKCE, consent allow/deny, scope reduction, wrong tenant/client, expired transaction, and code replay;
- token exchange, wrong verifier, wrong redirect/resource, expired code, refresh rotation, reuse detection, revocation, and family invalidation;
- RS256/ES256 JWKS signature, issuer, audience, resource, tenant/user, scope, expiry, algorithm, and key rotation;
- connected-client ownership isolation and immediate MCP denial after revoke;
- tool/resource/media/library/download/Remotion scope and current ACL checks;
- no bearer/refresh/code/client-secret leakage in logs, errors, traces, or UI;
- legacy static-token, API-key, and Feature 145 pairing compatibility.
- MCP CLI key creation, one-time display, scope requirement, default/changed/
  unlimited 5-hour/1-day/7-day budgets, quota headers, 429 reset behavior, and
  revoke/expiry behavior;
- MCP tool results that report actual credits update the same key budget without
  double-counting REST route accounting.

### Client compatibility gates

- Hermes CLI/Agent: clean URL-only setup, browser approval, secure storage, restart, refresh, revoke, and offline/expired recovery on Windows 11 and macOS x64/arm64;
- Hermes One: URL-only MCP onboarding on supported Windows/macOS builds;
- Claude: live remote MCP discovery, browser approval, tool scan, denial, reauthorization, and revoke;
- Codex: live remote MCP discovery, browser approval, tool scan, refresh, and revoke on the supported Codex CLI/desktop surface;
- if a client lacks a required discovery feature, record the exact limitation and provide a safe fallback rather than marking the server fully compatible.

### Acceptance criteria

1. A supported client needs only the SmartAIHub MCP URL to begin onboarding.
2. The user authenticates in SmartAIHub browser and explicitly approves displayed scopes; no token copy/paste is required.
3. The first authenticated `tools/list` is permission-filtered and returns the intended catalog for the user's account.
4. Refresh, expiration, user revoke, tenant emergency revoke, and refresh-token reuse prevent further access within the documented bound.
5. A token from another issuer/resource/tenant/user/client cannot access MCP.
6. Claude, Codex, Hermes CLI/Agent, and Hermes One compatibility evidence is recorded separately; one client's limitation cannot be hidden as a general pass.
7. Existing API-key and Hermes pairing users continue to work during rollout.
8. Production flags remain off until implementation and live security/compatibility evidence pass.

## 10. Implementation units for deep-plan

1. Freeze client compatibility matrix and deployment identity/issuer decision.
2. Add schema/service for clients, authorization transactions, grants, refresh families, signing keys, and audit events.
3. Add AS metadata, PRM, OIDC compatibility, JWKS, registration, authorize, token, and revoke routes.
4. Integrate existing browser login/session and build real consent UI.
5. Upgrade inbound verifier to first-party asymmetric keys and durable revoke checks while preserving external-issuer mode only if explicitly selected.
6. Extend connected-device/user Settings control plane and ownership tests.
7. Add Hermes client OAuth discovery/secure-store behavior and compatibility fixtures; validate Claude/Codex live paths without pretending to control their releases.
8. Add rollout flags, observability, runbooks, failure harness, Inspector/live smoke, and deployment evidence.
9. Add the dedicated MCP CLI key path, headless client instructions, credit-budget middleware, response headers, and ownership-scoped Settings UI.
10. Run self-review against this spec, Feature 146, Feature 145, and existing auth/device/media ACL contracts before implementation.

## 11. References

- Feature 146: `specs/feature/146-smartaihub-mcp-server-v2-compatibility/spec.md`
- Feature 145: `specs/feature/145-hermes-remotion-render-executor/spec.md`
- MCP Authorization: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- RFC 9728 Protected Resource Metadata: https://www.rfc-editor.org/rfc/rfc9728
- RFC 8414 Authorization Server Metadata: https://www.rfc-editor.org/rfc/rfc8414
- RFC 8707 Resource Indicators: https://www.rfc-editor.org/rfc/rfc8707
- RFC 7591 Dynamic Client Registration: https://www.rfc-editor.org/rfc/rfc7591
- OpenAI Codex security/authentication guidance: https://openai.com/index/running-codex-safely/
- OpenAI MCP app/OAuth guidance: https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt
