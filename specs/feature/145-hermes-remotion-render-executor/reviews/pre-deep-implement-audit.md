# Pre-Deep-Implement Audit — Feature 145 (v0.7.0)

Date: 2026-08-16

## Decision

The plan is ready to enter deep-implement. Production code has not been
changed by this audit. The implementation must still prove the platform and
security gates listed below before enabling the feature flag.

## Compatibility proof

- The plan is anchored to the current `worker_jobs`/`worker_runtime_type`
  contract, the existing Worker Connect/device-proof/token planes, the existing
  Remotion schema package, and the current MCP catalog/session pipeline.
- The durable runtime addition is additive: `remotion_executor`. The API input
  alias `desktop_worker` maps to the existing `desktop_zeroclaw_managed` value;
  `auto` is resolved before billing and insertion and is never persisted as a
  runtime type.
- The migration is explicitly the next sequence (`0224`, journal index `210`)
  only if the implementation-time migration-head check confirms no newer
  migration has landed.
- The standalone executor is an npm workspace package under `apps/*`; it has
  no Tauri, Rust, Xcode, database, MCP, or Redis dependency. It uses the
  existing authenticated Worker REST control plane and artifact protocol.
- The SmartAIHub Hermes Connector can adopt a compatible existing Hermes CLI/
  Hermes One install, or automatically provision the exact signed managed pack
  beside it when doctor detects a missing/incompatible component. Existing Hermes
  files are never overwritten and `runtimeSource` is admitted only after the
  same platform/contract checks.
- Library, managed/R2 media, media history, and published Remotion artifacts
  converge on one ACL-checked opaque download-reference broker. Legacy Python
  rows with null/unresolved tenant identity are denied rather than inferred.
- New Feature 145 Redis state uses the existing split cache/realtime clients.
  PostgreSQL/R2 remain authoritative; no media bytes, durable payloads,
  refresh tokens, or storage URLs are stored in Redis.

## Security decisions made explicit

- Browser cookie MCP sessions remain read/download-only in the first release.
  Hermes connection mutations, generation, Remotion submit/cancel, and media
  cancellation require an API key, verified bearer, or owner/device-bound
  Connector `agent_pairing` session with the exact operation scope and `mcp:write`.
  Pairing is explicit, one-time, refresh-rotated, revocable, and separate from
  worker/provider credentials.
- New sensitive Hermes/Remotion/download tools reject static/internal bearer
  subjects and header-derived tenant/user fallback. Existing static/internal
  compatibility fixtures remain isolated and are not widened.
- Runtime packs are non-secret public release artifacts to avoid a fresh-install
  bootstrap deadlock. They are protected by exact allowlists, pinned Ed25519
  signatures, SHA-256, platform/architecture/contract checks, and safe archive
  extraction. Worker enrollment and all job/control/artifact operations remain
  authenticated.
- Windows native requires Windows 11 build `>= 22000`; WSL2, macOS arm64, and
  macOS x64 require independent native/service/doctor/render evidence. macOS
  uses a per-user LaunchAgent and Keychain context; no Xcode build is required
  for executor runtime setup.
- Connector-generated images/videos use the same checksum/MIME, image decode,
  `ffprobe`, publication, billing, history/Library and ACL/download path as the
  web/manual path.

## Checks completed

- Deep-plan section checker: 8/8 sections complete.
- UI/UX contract checker: every section contains the required contract block;
  backend/platform sections explicitly declare N/A.
- `git diff --check`: clean for the feature planning directory.
- Targeted source existence checks passed for scheduler, registry, runtime
  routes, MCP registry/server, Hermes services, ACL/storage services, media
  history sources, Python tenant model/migration, and Remotion package entry
  points.

## Implementation-time gates that remain intentionally open

1. Re-read the migration head immediately before editing and choose the next
   collision-free sequence.
2. Add focused TDD coverage before production symbols for contracts, target
   resolution, scope filtering, static/header rejection, Redis outage,
   ACL/download matrix, worker lease/artifact parity, and executor doctor.
3. Run focused web/package tests and separate any existing repository-wide
   baseline failures from Feature 145 proof.
4. Keep every runtime pack `allowed: false` until its real platform evidence,
   credential-store proof, signed verification, update, and rollback drill pass.
5. Keep `remotionDedicatedExecutorEnabled` and the operator dispatch switch off
   until the final Section 08 end-to-end and security gates pass.

These are implementation and release gates, not unresolved design choices.
