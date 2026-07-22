# Implementation Plan

## Objective

Complete the existing Hermes media architecture and expose an accurate,
usable three-mode connection workflow.

## Implementation

1. Harden pairing/install automation so worker credentials can be written
   directly to a protected operator-specified environment file without
   appearing in terminal output.
2. Install the pinned CLI, pair the worker, install/start its unit, and verify
   doctor capability plus heartbeat.
3. Enable `server_shared` and `server_personal` through the supported settings
   path after readiness passes.
4. Correct `HermesConnectPanel` so every mode explains ownership, quota,
   processing location, and prerequisites in Thai/English. Disable unavailable
   actions and add a Worker App setup/download link.
5. Build/publish the Windows Hermes runtime pack and a new Worker App installer.
6. Verify router/service/UI/Rust tests, type checks, build artifacts, public
   downloads, production health, worker heartbeat, and device-code initiation.

## Security

- Pairing output must not expose tokens.
- Environment file permissions must be `0600 root:root`.
- Server-shared connect remains admin-only.
- Personal connections remain owner-only.
- Private workers must be registered by the requesting user.
- No xAI device code, session, prompt, reference URL, or token enters audit
  metadata or terminal logs.

## Acceptance Criteria

- Shared worker service is active and online in DB.
- `hermes_shared_worker_id` matches the online worker.
- Server-shared and server-personal scopes report available.
- Central and personal server flows create pending connections/control jobs.
- Windows runtime manifest is allowed and downloadable.
- Latest served Worker App includes the Hermes runtime implementation.
- UI accurately renders all readiness and action states in Thai and English.
- Production health remains green.
