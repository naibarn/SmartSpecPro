# Plan/Spec Completeness Review Round 3

## Scope

This review checks the latest user clarification that **Smart AI Hub Worker App**
must be a separate lightweight worker tool, not a build profile or renamed copy
of the full `apps/tauri-shell` product.

## Findings And Fixes Applied

### 1. Worker App Workspace Boundary

Finding: the plan previously leaned toward reusing `apps/tauri-shell` as the
desktop product. That conflicts with the desired small installable worker tool.

Fix:

- `claude-spec.md` now requires a separate `apps/worker-app` workspace.
- `claude-plan.md` now makes `apps/worker-app` the product shell and treats
  `apps/tauri-shell` only as a reference/extraction source.
- Section 07 was renamed to `section-07-worker-app-runtime-pack.md`.
- Section 08 now targets `apps/worker-app` executor/control-plane files.

### 2. Lightweight Install And Runtime Pack Contract

Finding: the plan needed stronger acceptance criteria for an independently
installable worker with bundled or one-click runtime setup.

Fix:

- Added tests that `apps/worker-app` builds and runs independently from the full
  shell.
- Added runtime pack requirements for license notices, checksum file, signature
  file, immutable version metadata, and runtime allowlist/denylist/rollback.

### 3. Pairing And Route Security

Finding: the spec includes browser approval/custom protocol handoff and route
hardening, but the TDD plan and section task needed explicit tests.

Fix:

- Added `smartaihub-worker://connect?code=...` handoff with device-code polling
  fallback.
- Added tests for bearer-only state-changing worker routes, no wildcard CORS for
  authenticated worker routes, and rate limits for connect/heartbeat/claim/
  diagnostics/upload/MCP worker calls.

### 4. Sidecar And Upload Boundary

Finding: sidecar IPC and large artifact upload behavior were underspecified in
the implementation sections.

Fix:

- Added sidecar boundary requirements: structured manifests/allowlisted args,
  no generic command runner, and no local HTTP/LAN service in MVP.
- Added signed direct/multipart/chunk upload support for large videos while
  preserving assignment attempt and lease validation.

## Result

The plan now matches the clarified product direction:

- server queue/control plane stays canonical;
- `apps/worker-app` is the separate lightweight Windows worker;
- `apps/tauri-shell` is not required by end users and is not the product being
  shipped for render work;
- runtime, auth, upload, and sidecar safety requirements are testable.
