# Section 18 — OAuth 2.1 Support

## Section ID
`section-18-oauth-support`

## Dependencies
- **section-17**: McpClientManager with HTTP transport

## Overview

Implements OAuth 2.1 token management for MCP servers: `McpOAuthManager` (token caching, refresh, encrypted storage) and Express callback route for `authorization_code` + PKCE flow. Supports `client_credentials` and `authorization_code` grant types.

## Files Created

| File | Path |
|------|------|
| McpOAuthManager | `python-backend/app/services/mcp_oauth_manager.py` |
| Tests | `python-backend/tests/unit/services/test_mcp_oauth_manager.py` |

## Files to Modify (Deferred)

| File | Path | Status |
|------|------|--------|
| Express routes | `apps/web/server/routes.ts` (add `/auth/mcp/callback`) | Deferred — wired when admin UI integrates OAuth connect button |

---

## TDD Specification

```
# Test: get_token returns cached token when not expired
# Test: get_token refreshes token when expired (with skew)
# Test: client_credentials flow fetches new token from token_url
# Test: authorization_code flow generates state + code_verifier, stores in Redis
# Test: callback validates state, exchanges code for token, encrypts + stores
# Test: callback rejects invalid state parameter
# Test: callback URL is exactly https://smartaihub.app/auth/mcp/callback
# Test: code_verifier is 32 bytes base64url, stored server-side only
# Test: token revocation called on server delete (RFC 7009)
# Test: audit event logged on token refresh
```

---

## Implementation Guidance

See claude-plan.md Section 17 for full specs. Key design:

### McpOAuthManager
```python
class McpOAuthManager:
    async def get_token(self, server_id: int) -> str:
        """Return valid access token, refreshing if needed."""
    async def initiate_auth_code_flow(self, server_id: int) -> str:
        """Generate auth URL with PKCE. Returns redirect URL."""
    async def handle_callback(self, state: str, code: str) -> None:
        """Exchange code for token, encrypt + store."""
    async def revoke_token(self, server_id: int) -> None:
        """Revoke at provider (RFC 7009), clear from DB."""
```

### Callback Route
```typescript
app.get("/auth/mcp/callback", async (req, res) => {
  const { state, code } = req.query;
  // Validate state from Redis
  // Exchange code + code_verifier for token
  // Encrypt token, store in mcp_servers.oauthAccessTokenEncrypted
  // Redirect to MCP server manager page with success message
});
```

### Security Considerations

1. **PKCE mandatory**: `code_verifier` generated with `crypto.randomBytes(32)`, stored server-side in Redis with 10-min TTL
2. **State parameter (NEW-07)**: 32-byte random nonce, stored in Redis with **tenant-namespaced key**: `mcp:oauth:state:{tenantId}:{serverId}:{stateNonce}`. The callback handler MUST verify `tenantId` and `serverId` from the Redis value, NOT from query parameters. This prevents cross-tenant state collision.
3. **Hardcoded callback URL**: `https://smartaihub.app/auth/mcp/callback` — never dynamic
4. **Token encryption**: `encrypt()` from `crypto.ts` using `LLM_ENCRYPTION_KEY`
