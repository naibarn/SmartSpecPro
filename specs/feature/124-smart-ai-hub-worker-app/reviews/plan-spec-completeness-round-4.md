# Plan/Spec Completeness Review Round 4

## Scope

This review checks the clarified acceptance rule:

- `worker-app` is a separate lightweight helper worker app;
- users do not log in inside the app;
- the app connects through a browser approval/device-code flow and receives
  worker tokens automatically, matching the Chrome extension pairing pattern.

## Findings And Fixes Applied

### 1. No In-App Login Boundary

Finding: the plan mentioned browser approval, but did not explicitly prohibit
username/password login, API-key entry, manual bearer-token paste, or cookie
import inside Worker App.

Fix:

- `claude-spec.md` now states the Worker App must not collect SmartAIHub
  credentials and must use the normal browser session for login/approval.
- `claude-plan.md` now specifies no in-app login form and no manual token/API
  key configuration.
- `section-06-worker-connect-auth.md` and
  `section-07-worker-app-runtime-pack.md` include explicit tests and UX copy
  requirements for browser approval only.

### 2. Auto Token Lifecycle

Finding: token refresh and storage were present, but not tied tightly enough to
the Chrome extension connect model.

Fix:

- Added plan requirements for `device_code`, `user_code`, `verification_uri`,
  token polling, short-lived worker access token, rotating refresh token,
  server-side refresh-token hashing, and automatic refresh in Worker App.
- Added TDD tests that token exchange returns a worker-specific token set and
  that Worker App clears tokens on revoke/disconnect/reuse/wrong-audience
  errors.

### 3. Worker-Specific Token Shape

Finding: the plan said worker-specific token type/audience, but implementation
  could still interpret this loosely.

Fix:

- `claude-plan.md` now requires access token fields:
  `type: "smartaihub_connected_device"`, `deviceKind: "desktop_worker"`,
  `aud: "smart-ai-hub-worker-app"`, `connectionId`, `tenantId`, `userId`,
  `scopes`, `iss`, `jti`, `iat`, and `exp`.

### 4. Research Consistency

Finding: one research note still implied building from the full Tauri shell and
renaming metadata.

Fix:

- `claude-research.md` now states `apps/worker-app` is a separate lightweight
  workspace and `apps/tauri-shell` is only a reference/extraction source.

## Result

The plan now consistently describes a separate Worker App that connects like the
Chrome extension: browser approval first, automatic worker-token issuance,
secure local storage, automatic refresh, and no credential collection inside the
desktop app.
