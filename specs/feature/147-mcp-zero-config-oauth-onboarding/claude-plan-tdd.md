# Feature 147 TDD and verification plan

## Test-first sequence

1. Write metadata/flag contract tests.
2. Write redirect/client-registration rejection tests.
3. Write PKCE authorization transaction tests.
4. Write token/refresh/reuse/revocation tests.
5. Write verifier/resource/scope/ACL tests.
6. Write connected-device ownership/revoke tests.
7. Write browser UI state tests.
8. Run local end-to-end OAuth fixture.
9. Run Inspector and live client matrix.

## Required focused suites

```text
server/_core/__tests__/mcpOAuthMetadata.test.ts
server/_core/__tests__/mcpOAuthServerMetadata.test.ts
server/_core/__tests__/mcpOAuthRegistration.test.ts
server/_core/__tests__/mcpOAuthAuthorization.test.ts
server/_core/__tests__/mcpOAuthToken.test.ts
server/_core/__tests__/mcpOAuthJwks.test.ts
server/_core/__tests__/authz.mcpOAuth.test.ts
server/_core/__tests__/mcpPublicServerSecurity.test.ts
server/services/__tests__/mcpOAuthGrantService.test.ts
server/services/__tests__/connectedDeviceService.test.ts
server/routers/__tests__/connectedDevices.test.ts
client/src/components/settings/ConnectedDevicesPanel.test.tsx
client/src/pages/McpOAuthConsent.test.tsx
```

## Security cases that must be red

- metadata advertises OAuth while any required issuer/key/token configuration is missing;
- non-HTTPS issuer/JWKS/resource or credential-bearing URL;
- DCR wildcard/prefix/private-network/data/javascript/file/custom redirect;
- client registration without PKCE S256;
- authorization request with wrong resource, unsupported scope, wrong redirect, missing state, expired transaction, or another user's login session;
- code reuse, wrong verifier, wrong client, wrong redirect, wrong resource, or wrong tenant;
- refresh replay/reuse, revoked grant, revoked device, expired token, wrong issuer/audience, wrong algorithm, wrong JWKS key;
- OAuth token accepted as a way to bypass current library/media/R2/remotion ACL;
- user A can list/revoke user B's client/grant;
- raw code, refresh token, access token, client secret, or private key appears in logs/errors/UI/MCP responses;
- client-provided tenant/user headers or metadata override verified claims.

## End-to-end fixture

Use an in-process test authorization server/key pair and a disposable database/Redis namespace:

1. Register a public client with a localhost callback and PKCE.
2. Request MCP without a token and assert HTTP 401 plus metadata challenge.
3. Fetch PRM and AS metadata.
4. Open authorize with a signed test browser session, approve `mcp:read` and `library:read` only.
5. Redeem code with verifier; verify RS256/ES256 access token claims and refresh token storage hash.
6. Call modern `server/discover`, `tools/list`, `resources/list`, and a read-only tool.
7. Attempt download/generation without scopes and assert denial.
8. Refresh and assert old refresh token fails.
9. Revoke the grant and assert access/refresh calls fail.
10. Rotate signing key and assert old overlapping key works only within policy while new tokens use the new `kid`.

## Live client evidence

For each client capture only sanitized metadata:

- client/product/version;
- URL entered;
- discovery endpoints requested;
- callback policy class, not authorization code/token;
- user consent result;
- tools/resources counts;
- refresh/revoke outcome;
- timestamps and server correlation ID.

Never store browser URLs containing `code`, `state`, `error`, or tokens in evidence. Redact them before persistence.

## Completion scorecard

| Area | Required proof | Status before implementation |
|---|---|---|
| PRM/AS/OIDC discovery | Focused tests + live HTTP | BLOCKED: AS endpoints not implemented |
| DCR/CIMD | Positive/negative tests + Claude live | BLOCKED: registration service not implemented |
| Browser consent | Browser/UI tests + live approval | BLOCKED: MCP OAuth consent route/UI not implemented |
| Asymmetric token/JWKS | Key fixture + deployed key proof | PARTIAL: inbound remote JWKS verifier exists |
| Refresh/revoke | Rotation/reuse/ownership tests | PARTIAL: pairing/device rotation exists, MCP OAuth grant model absent |
| Hermes | Windows/macOS smoke | BLOCKED: client OAuth onboarding proof absent |
| Claude | DCR/callback live smoke | BLOCKED: server DCR/AS incomplete |
| Codex | live product-specific smoke | BLOCKED: no evidence yet |
| Existing auth compatibility | Feature 146 focused suite | PASS baseline; rerun after changes |
