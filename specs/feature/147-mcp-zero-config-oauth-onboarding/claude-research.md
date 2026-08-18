# Feature 147 research

Date: 2026-08-17  
Research mode: self-review; codebase research plus official web research  
Discovery note: SocratiCode MCP was not callable in this runtime, so codebase research used targeted `rg` and bounded file reads. This is recorded explicitly and is not treated as proof that an unsearched symbol does not exist.

## Codebase findings

### Existing MCP OAuth boundary

- `apps/web/server/_core/mcpOAuthMetadata.ts` already provides configuration-gated Protected Resource Metadata and `WWW-Authenticate` construction. It intentionally returns no metadata unless inbound OAuth, issuer/authorization-server, resource, JWKS, and audience configuration is complete.
- `apps/web/server/_core/mcpOAuthJwks.ts` verifies inbound RS256/ES256 JWTs through a remote JWKS endpoint and maps `sub`, `tenantId`, `userId`, and scopes into the normal MCP bearer principal. It is currently a resource-server verifier, not an authorization server or signer.
- `apps/web/server/_core/authz.ts` supports session, API key, static bearer, internal JWT, delegated worker, and Hermes pairing principals. Static server tokens intentionally have no tenant/user context and therefore cannot satisfy modern tenant-scoped MCP rollout.
- `apps/web/server/_core/mcpPublicServer.ts` already implements modern stateless MCP routing, resources, scope-filtered tools, and session/tenant checks. The OAuth work must enter at the HTTP auth boundary and reuse the existing principal/session/tool ACL path.

### Existing browser/device authentication that can be reused

- `apps/web/server/_core/deviceAuthRoutes.ts` implements a browser-assisted RFC 8628 device flow, Redis-backed short-lived device codes, HS256 desktop tokens, refresh rotation, and JTI revocation. It is useful as a reference for login continuation and revocation, but it is not sufficient as MCP OAuth because it lacks a public OAuth authorization-code endpoint, RFC 8707 resource binding, asymmetric JWKS publishing, and complete tenant-aware MCP claims.
- `apps/web/server/services/hermesAgentPairingService.ts` already implements PKCE, owner/device-bound consent, scoped pairing, access/refresh rotation, and device revocation. Feature 145 pairing remains a safe compatibility fallback. It must not be mislabeled as the standards OAuth authorization server, although its consent/device lineage can be linked to OAuth grants.
- `apps/web/server/services/connectedDeviceService.ts`, the connected-device router, and `apps/web/client/src/components/settings/ConnectedDevicesPanel.tsx` already provide user-owned device listing and revocation. The panel should be extended with `authKind=mcp_oauth` grants and OAuth client metadata while preserving owner isolation.
- `apps/web/server/_core/index.ts` is the route registration boundary for MCP, device auth, OAuth, and well-known endpoints. New OAuth routes should be mounted there with explicit public/CSRF/rate-limit policy rather than hidden behind generic MCP tool logic.

### Data/config/testing constraints

- Feature flags are typed in `apps/web/shared/featureFlags.ts` and persisted through the tenant feature-flag service with Redis synchronization. New OAuth authorization-server, DCR, and CIMD gates need defaults off and must not be user-controlled.
- Drizzle schema/migrations under `apps/web/drizzle` are the durable source for new grant/client/audit records. Redis may store short-lived authorization transactions, nonce/state, rate limits, and revocation acceleration only.
- Existing Feature 146 focused tests cover metadata, JWKS validation, auth mapping, MCP protocol, and security. New suites should extend this focused pattern and keep the known repository-wide typecheck baseline separate.

## Official protocol findings

The MCP authorization specification requires HTTP MCP servers to implement Protected Resource Metadata so clients can discover the authorization server. Clients use the metadata, then Authorization Server Metadata or OpenID Connect discovery. Authorization-code flow for public clients requires PKCE; tokens must be sent in the Authorization header, include the MCP resource indicator, and be validated for intended audience/resource. The server must distinguish 401 authentication failures from 403 insufficient scope.

The specification also requires clients to use the `resource` parameter in authorization and token requests. The plan therefore treats `resource=https://smartaihub.app/v1/mcp` as a mandatory binding, not optional metadata.

The current MCP guidance allows CIMD and/or DCR for clients. DCR is required for the Claude remote connector path according to Anthropic's current support documentation; Claude's documented callback is `https://claude.ai/api/mcp/auth_callback`, client name is Claude, and Claude supports expiry/refresh. Claude supports tools and resources but does not yet support resource subscriptions, which reinforces keeping subscriptions out of this feature.

OpenAI's current security guidance documents secure OS-keyring storage for Codex CLI and MCP OAuth credentials. The server must therefore return standard OAuth artifacts and must not require Codex users to paste secrets into a file. OpenAI's MCP app guidance also calls out refresh-token/offline-access requirements for persistent connections; the server must advertise and implement refresh consistently rather than issuing access-only credentials.

## Sources

- MCP Authorization, 2025-11-25: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- MCP Protected Resource Metadata alignment (SEP-985): https://modelcontextprotocol.io/seps/985-align-oauth-20-protected-resource-metadata-with-rf
- MCP 2025-11-25 changelog: https://modelcontextprotocol.io/specification/2025-11-25/changelog
- RFC 9728: https://www.rfc-editor.org/rfc/rfc9728
- RFC 8414: https://www.rfc-editor.org/rfc/rfc8414
- RFC 8707: https://www.rfc-editor.org/rfc/rfc8707
- RFC 7591: https://www.rfc-editor.org/rfc/rfc7591
- Anthropic remote MCP auth/DCR/callback guidance: https://support.anthropic.com/en/articles/11503834-building-custom-integrations-via-remote-mcp-servers
- Anthropic custom connector OAuth guidance: https://support.anthropic.com/en/articles/11175166-about-custom-integrations-using-remote-mcp
- OpenAI Codex secure authentication/keyring guidance: https://openai.com/index/running-codex-safely/
- OpenAI MCP app OAuth guidance: https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt

## Decisions informed by research

1. Build a first-party authorization server boundary, not metadata-only advertising.
2. Support DCR because Claude requires it for OAuth remote connectors; support CIMD as an additional standards-compatible path, not as a replacement.
3. Use Authorization Code + PKCE S256, resource indicators, asymmetric signing, rotating refresh tokens, and browser consent.
4. Keep Hermes pairing during migration and do not claim that pairing alone satisfies OAuth issuer/metadata requirements.
5. Treat Claude, Codex, and Hermes as separate live compatibility gates because server-side standard compliance cannot guarantee a client release's feature support.
