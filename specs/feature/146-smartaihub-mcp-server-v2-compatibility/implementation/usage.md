# Feature 146 implementation usage

## Modern MCP (staged rollout)

Set `MCP_MODERN_PROTOCOL_ENABLED=true` only in an internal/staging deployment
after the OAuth, storage, and native Hermes gates in `evidence.md` are closed.
For a production OAuth resource server, set all of these values together:
Modern clients call the authenticated canonical endpoint:

```text
POST https://smartaihub.app/v1/mcp
Content-Type: application/json
MCP-Protocol-Version: 2026-07-28
Mcp-Method: server/discover
```

Then use `tools/list`, `tools/call`, `resources/list`, and
`resources/read`. Modern requests do not need `Mcp-Session-Id`.

## Legacy MCP

Legacy clients continue with `initialize` and `Mcp-Session-Id`. Supported
legacy revisions are `2025-11-25` and `2025-03-26`. Redis session state is
ephemeral compatibility state; it is not the job, credit, artifact, device, or
idempotency authority.

## OAuth metadata configuration

Do not set only one of these values. The endpoint intentionally returns 404
until both a real MCP resource and at least one authorization server are
configured:

```text
MCP_OAUTH_RESOURCE=https://smartaihub.app/v1/mcp
MCP_OAUTH_ISSUER=https://<approved-issuer>
MCP_OAUTH_JWKS_URI=https://<approved-issuer>/.well-known/jwks.json
MCP_OAUTH_AUDIENCE=smartaihub-mcp
MCP_OAUTH_INBOUND_ENABLED=true
MCP_OAUTH_AUTHORIZATION_SERVER_ENABLED=true
MCP_OAUTH_PROTECTED_RESOURCE_ENABLED=true
MCP_PUBLIC_BASE_URL=https://smartaihub.app

# Keep this list aligned with the MCP registry. Legacy render/models names are
# accepted as request aliases and are normalized before token issuance.
MCP_OAUTH_SCOPES_SUPPORTED=mcp:read,mcp:write,llm:chat,media:read,media:generate,media:download,remotion:submit,remotion:read,remotion:cancel,library:read,library:download,library:search,library:upload,hermes:connect,hermes:read,hermes:generate,hermes:disconnect
```

Run the local gates before deployment:

```bash
npm run check:mcp146
npm run security:mcp146
NODE_ENV=production npm run mcp:readiness
```

For a deployed staging endpoint, provision a short-lived token and run
`MCP_SMOKE_URL=<origin> MCP_SMOKE_TOKEN=<token> npm run mcp:smoke` plus
`npm run mcp:failure-harness`. The CI workflow additionally runs the pinned
official Inspector CLI and must have `MCP_SMOKE_URL`/`MCP_SMOKE_TOKEN` secrets;
without them the live-evidence job fails intentionally.

The authorization server must separately provide the real token validation
metadata/JWKS or introspection configuration and must issue tokens with the
correct audience/resource, expiry, tenant/user/device binding, and scopes.

## Safe file/media access

Do not use generic `resources/read` for user files. Use the existing scoped
Library, Media History, and Remotion tools. Download references are redeemed
through `/api/mcp/downloads/...`; the server re-checks ACL, expiry, revocation,
MIME, filename, and range access at redemption time.

## Rollback

Remove `MCP_MODERN_PROTOCOL_ENABLED` or set it to `false`. This stops modern
dispatch/advertising without deleting legacy sessions, jobs, artifacts, or
user media. Disable the separate Feature 145 Remotion tenant gate if the
executor itself must be stopped.
