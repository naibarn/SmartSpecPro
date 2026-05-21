# Section 03 - Extension Auth CORS

## Objective

Add one-time extension pairing, scoped revocable extension tokens, exact origin allowlisting, and feature-local auth middleware.

## Scope

- `marketplaceExtensionAuthService`
- `marketplaceCaptureCors`
- pairing connect page
- auth tests

## Implementation Notes

- Reuse `signBearerToken`, `verifyBearerToken`, `hasScope`, and existing revocation checks.
- Do not put a permanent API key in the extension.
- Pairing flow:
  1. Extension requests pairing code or opens connect URL.
  2. Web user logs in and approves the pairing.
  3. Extension exchanges one-time code for scoped token set.
  4. Server stores token metadata and can revoke by `jti`.
- Required scopes:
  - `marketplace:capture`
  - `marketplace:read`
  - `marketplace:write`
- CORS:
  - exact-match `MARKETPLACE_EXTENSION_ALLOWED_ORIGINS`
  - never `*` for authenticated routes
  - no credentials for extension bearer-token routes
  - reject cookie-authenticated extension writes
  - reject production extension writes without `Origin`
- Add per-user and per-token limits for draft/create/analyze/upload.
- Token and local draft hygiene:
  - keep access token in service worker memory when possible
  - store refresh token only if needed and rotate it
  - local queues must not retain screenshots/raw DOM unless user explicitly keeps a retry draft
  - logout/revoke clears tokens, pending queues, and local evidence
- Extension CSP must prohibit remote JavaScript and eval-like execution.
- Store refresh tokens hashed/protected at rest. Never store raw refresh tokens in DB logs or audit rows.
- Bind issued tokens to extension id, environment, pairing record, user, and tenant.
- Add SmartSpecPro paired-extension management UI/API so users can revoke one device/extension without logging out everywhere.

## Tests First

- Pairing code is one-time and expires.
- Token has correct scopes, `userId`, `tenantId`, and `jti`.
- Revoked, expired, wrong scope, wrong token use, and wrong origin fail.
- Cookie-authenticated POST to extension REST route fails.
- Production missing-origin write fails.
- Logout/revoke clears token store and pending local capture state.
- Manifest/CSP tests reject remote script origins and unnecessary host permissions.
- Revoking one paired extension invalidates only that extension's tokens.
- Raw refresh token material is not persisted.

## Acceptance Criteria

- Extension auth is feature-local.
- Existing `authorizeRequest` callers are not changed.
- All extension write routes require valid scoped bearer token and allowed origin.
