# Section 06: Worker Connect Auth

## Goal

Implement worker-specific pairing and token management using the same user-facing
pattern as the Chrome extension, while keeping token type/scopes separate.

## Dependencies

- section-01-contracts-and-flags

## In Scope

- Device-code/browser approval flow.
- Worker connection registry.
- Worker token audience/type/scopes.
- Scope mapping between existing `workers:*` route scopes and product capability
  scopes such as `worker:render:*`.
- Refresh/revoke behavior.
- Management APIs for revocation.

## Files To Review

- `apps/web/server/services/marketplaceExtensionAuthService.ts`
- `apps/web/server/routes/marketplaceCapture.ts`
- `apps/web/client/src/pages/MarketplaceCaptureConnect.tsx`
- `apps/web/server/services/workerAuthService.ts`
- `apps/web/server/routes/workerRuntime.ts`
- `apps/web/drizzle/schema.ts`
- `apps/worker-app/src-tauri/src/worker_credentials.rs`
- existing `apps/tauri-shell/src-tauri/src/desktop_worker_credentials.rs` only
  as a reference if credential helper behavior should be extracted

## Files To Change

- new worker connect service/routes/pages as needed
- `apps/web/server/services/workerAuthService.ts`
- `apps/web/server/routes/workerRuntime.ts`
- `apps/web/drizzle/schema.ts` if a connection table is needed
- Tauri credential/control-plane files
- tests for worker auth/connect

## Test First

- Test: worker connect start returns expiring device/user code.
- Test: Worker App connect screen never accepts SmartAIHub username/password,
  API key, manually copied bearer token, or web session cookie.
- Test: when the browser approval page requires login, login happens in the
  normal SmartAIHub web session and the Worker App receives only pairing state.
- Test: browser approval can return to the worker app with
  `smartaihub-worker://connect?code=...` when custom protocol registration is
  available.
- Test: device-code polling still succeeds when custom protocol handoff is
  unavailable.
- Test: token exchange before approval fails.
- Test: token exchange after approval succeeds.
- Test: token exchange returns worker-specific access token plus rotating refresh
  token metadata comparable to the Chrome extension pairing model.
- Test: Worker App auto-refreshes worker tokens before expiry and clears tokens
  on revoke, disconnect, refresh reuse, or wrong-audience errors.
- Test: token exchange binds the worker token set to exactly one Worker App
  device key/proof-of-possession identity.
- Test: heartbeat, claim, diagnostics, upload, complete, and refresh reject a
  copied token from another device key or a request without device proof.
- Test: copied refresh token use from another device revokes/blocks the
  connection and requires fresh browser approval.
- Test: device proof replay is rejected for stale timestamp, reused
  nonce/request id, wrong method/path, or wrong token `jti`.
- Test: token has worker-specific token use/audience/scopes.
- Test: extension token is rejected by worker routes.
- Test: revoked worker connection cannot heartbeat/claim/report.
- Test: refresh token rotation revokes reused token.
- Test: user/admin can revoke one worker connection without logging out
  everywhere.
- Test: route checks use existing worker bearer conventions while capability
  claims cannot access unrelated marketplace/media/admin routes.
- Test: authenticated worker routes reject cookie-only state-changing requests.
- Test: authenticated worker routes do not allow wildcard CORS origins in
  production configuration.
- Test: connect polling, heartbeat, claim, diagnostics, upload init/complete,
  and future MCP worker calls are rate-limited.

## Implementation Steps

1. Add worker connection record or extend existing worker auth metadata safely.
2. Add `POST /api/worker-connect/start`.
3. Add approval page route using normal web session.
4. Add optional custom protocol handoff to
   `smartaihub-worker://connect?code=...`; keep device-code polling as the
   reliable fallback.
5. Ensure the Worker App never handles SmartAIHub user credentials, web session
   cookies, API keys, or manually pasted bearer tokens. If login is required, it
   must occur only in the browser approval page.
6. Add Worker App device-bound token support:
   - generate a per-install device key pair or equivalent proof secret in Worker
     App secure storage before pairing;
   - send the public key or safe key identifier during connect start/token
     exchange;
   - bind the connection id, token `jti`, refresh token metadata, and worker id
     to that device key;
   - require signed request proof on worker authenticated calls.
7. Add token exchange/refresh/revoke endpoints.
8. Issue worker-specific short-lived access tokens plus rotating refresh tokens.
9. Store only refresh token hashes/server-side metadata needed for revocation
   and rotation; never log raw refresh tokens.
10. Bind tokens to tenant, user, worker connection, optional team/group policy,
   device id, device key id, and `jti`.
11. Validate device proof on heartbeat, claim, report, diagnostics, upload init,
    upload complete, job complete/fail/release, and refresh. Proof should cover
    timestamp, nonce/request id, method, path, token `jti`, and body hash where
    practical.
12. On missing/invalid/wrong-device proof, reject the request. On copied refresh
    token use, device-key mismatch, repeated proof mismatch, or replayed proof,
    revoke/block the connection and require fresh browser approval.
13. Map raw spec product scopes (`worker:render:*`, `worker:artifact:upload`,
   `worker:status:write`, future `worker:local-ai:*`) to existing worker route
   scope checks or policy claims without widening access.
14. Add CORS/rate-limit guards for worker routes and ensure bearer-only
   state-changing worker calls.
15. Update Worker App credential functions to store and clear worker tokens and
    the device private key in OS secure storage, and refresh access tokens
    automatically before expiry.
16. Add worker management projection for user/admin UI.

## Security Requirements

- Extension token type must not authenticate worker routes.
- Worker token type must not authenticate marketplace extension routes.
- Worker App must not implement in-app SmartAIHub password login, API-key entry,
  manual bearer-token paste, or cookie import.
- Refresh tokens stored server-side as hashes.
- Token reuse revokes connection.
- One token set can be used by one device only. Bearer token possession alone is
  not enough for worker-authenticated calls; requests must prove possession of
  the bound device key.
- The device private key/proof secret must never leave Worker App secure storage
  and must not appear in logs, diagnostics, support bundles, settings export, or
  uploaded artifacts.
- Copied access tokens, copied refresh tokens, wrong-device proofs, or proof
  replay must be rejected. Copied refresh token use or repeated wrong-device
  proof should block/revoke the connection so another machine cannot continue
  using the token.
- Access tokens are short-lived and refresh tokens rotate on every use, matching
  the Chrome extension security model unless tenant policy sets stricter
  lifetimes.
- Device codes expire quickly and are rate-limited.
- Browser approval custom protocol is convenience only; device-code polling is
  the fallback and source of truth.
- Worker routes must use bearer auth for state changes and reject cookie-only
  mutation attempts.
- Authenticated worker routes must not use wildcard CORS origins in production.
- Claim/heartbeat/upload/diagnostics/MCP worker calls must have rate limits
  appropriate for long-running workers and many connected apps.
- Audit connection approval, refresh, revoke, and failed auth.
- Worker tokens must not authenticate marketplace capture, billing mutation,
  unrelated media, public API, or admin routes.

## Acceptance Criteria

- Desktop app can connect without asking user to copy `.env` values, paste a
  token, enter an API key, or log in inside the app.
- Browser approval and device-code polling create and store the worker token set
  automatically, the same user-facing pattern as the Chrome extension.
- Worker tokens can register/heartbeat/claim.
- Revoked/expired/wrong-scope tokens fail predictably.

## UI/UX Contract

### Target User / JTBD

Users and admins must connect the Smart AI Hub Worker App through a browser
approval flow that feels like the existing Chrome extension flow, without manual
`.env` setup, token copying, API key entry, or in-app login.

### Surface Inventory

- Web worker connect approval page.
- Worker App connect screen.
- User worker connection management surface.
- Admin worker management revoke/status surface.

### Component Map

- Approval page shows requested worker name/device, owner/team scope, shared
  access policy, expiration, approve, and deny.
- Worker App connect screen shows waiting for approval, approved, expired,
  denied, and retry states.
- Management surfaces show connected workers and revoke actions.

### State Matrix

- Start pairing: show user code/link and browser open action.
- Waiting approval: desktop app polls safely and shows remaining time.
- Approved: store token and transition to worker dashboard.
- Browser login required: browser page handles login, desktop app stays in
  waiting state and never asks for credentials.
- Expired/denied: show retry.
- Revoked: app shows disconnected and cannot claim jobs.
- Wrong token type/scope: show reconnect required, not a generic server error.

### Responsive Matrix

Web approval must work on mobile and desktop. Worker App connect screen targets
Windows desktop but should support narrow app windows without clipped code or
buttons.

### Accessibility Acceptance

Approval actions must be keyboard reachable. Codes and worker names must be
selectable/copyable. Deny/approve actions need clear accessible names.

### Copy Contract

Use the product name `Smart AI Hub Worker App`. Copy should say "Connect with
Smart AI Hub" or "Approve in browser", not "Log in inside the app". Avoid
exposing JWT, jti, or scope strings to normal users; admin diagnostics may
include token audience and scope mismatch.

### Browser Evidence Required

Capture approval page states: waiting, approved, expired, denied, and revoked
management state. Capture Worker App connect states in desktop screenshots.
