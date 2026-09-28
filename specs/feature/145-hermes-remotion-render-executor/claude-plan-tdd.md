# TDD Plan — Hermes-triggered Dedicated Remotion Render Executor

Tests are written before implementation in the existing project conventions.
TypeScript tests use Vitest, executor package tests use the repository's Node/
Vitest setup, Rust compatibility tests use Cargo, and Python tenant/history tests
use `python-backend/.venv` pytest. These are test stubs and acceptance targets,
not full test implementations.

## 1. Current seams and invariants

- Test that legacy Worker App runtime values and Remotion fixtures remain accepted.
- Test that the new runtime contracts do not alter existing job payload bytes.
- Test that focused diagnostics can identify baseline failures separately from
  Feature 145 failures.

## 2. Workstream 01 — Shared contracts, runtime identity, flags, and migration

- Test `remotion_executor` enum/schema acceptance and unknown runtime rejection.
- Test platform/architecture/readiness/capability/contract-version validation.
- Test exhaustive runtime definitions include all existing values.
- Test `remotionDedicatedExecutorEnabled` is typed, allowlisted, default-off and
  cannot be set by MCP/worker payload input.
- Test additive database migration preserves every existing enum value and is safe
  under the repository migration runner.
- Test new/old Hermes scopes and normalizer behavior: old grants do not gain
  render/generate/disconnect/download powers accidentally.
- Test `runtimeSource` provenance is emitted only after doctor/admission checks;
  existing Hermes installs may be adopted, while missing components select only
  the signed managed-pack path.

## 3. Workstream 02 — Scheduler, worker admission, lease, and artifact protocol

- Test queue input `auto`, `desktop_worker`, and `remotion_executor` resolution.
- Test explicit dedicated target fails with `executor_unavailable` before credit
  reservation or job insertion when gate/readiness is false.
- Test `auto` fallback to desktop and flag-off legacy behavior.
- Test resolved target is immutable and is retained through retry/page refresh.
- Test dedicated claim requires exact runtime, capability families and contract.
- Test wrong runtime, stale contract, unhealthy readiness and full concurrency are
  rejected.
- Test one idempotency key produces one job and one credit reservation.
- Test lease expiry, late events, duplicate events, cancellation and stale
  assignment cannot mutate a newer assignment.
- Test artifact init/complete binds job, worker, lease, attempt, size, checksum
  and storage reference.
- Test Redis failure does not create duplicate jobs or charges.

## 4. Workstream 03 — Authenticated Hermes MCP surface

- Test `tools/list` scope filtering, strict schemas, unknown-field rejection and
  idempotency declarations.
- Test anonymous, expired session, revoked key, wrong tenant/user,
  insufficient scope and delegated-worker denial before side effects.
- Test capability discovery returns exact available/unavailable reasons and never
  invokes an unknown CLI command.
- Test connection authorize/status/probe/disconnect/test-generation projections
  map to existing durable control-job states and redact device secrets.
- Test all `HERMES_MEDIA_OPERATIONS` route through the existing scheduler,
  capability bounds, credits, idempotency and artifact/library registration.
- Test compatibility `smartspec.media.generate_image/video` remains equivalent.
- Test Remotion submit accepts only server-owned valid references and rejects raw
  payloads, URLs, paths, commands, tokens and billing fields.
- Test status/cancel owner scope, role policy and terminal-state behavior.
- Test rate limits, audit fields, sanitized error codes and absence of credentials,
  signed URLs, raw provider URLs and local paths.
- Test Connector status exposes only safe readiness/next-action data and that
  one-time `agent_pairing` consent binds tenant, owner, device and exact scopes;
  replay, revocation, scope widening and worker/provider-token substitution fail.

## 5. Workstream 04 — Standalone Node executor core

- Test doctor failure for missing Node, sidecar, browser, FFmpeg, ffprobe, fonts,
  disk, architecture, contract, unsafe path and incompatible manifest.
- Test Windows and macOS credential adapters round-trip through a fake OS adapter;
  assert secrets never appear in logs or CLI output.
- Test headless macOS Keychain denial fails doctor and never creates plaintext
  fallback storage.
- Test connect/register/refresh/claim headers, scope separation and device proof.
- Test bounded concurrency, heartbeat, cancellation polling and graceful shutdown.
- Test payload schema validation and isolated job workspace/path rules.
- Test every Remotion stage maps to the shared worker event contract.
- Test transient/permanent/cancel/timeout/contract/invalid-output classifications.
- Test artifact streaming, SHA-256/size, presigned expiry re-init and assignment
  binding.
- Test child process fixed arguments, no shell interpolation and no arbitrary
  composition/module path.
- Test the compatibility proxy prefers OS-protected local IPC and that its TCP
  fallback rejects non-loopback binds, missing local authentication, redirects,
  non-allowlisted origins, and arbitrary forwarding targets.
- Test existing Hermes discovery uses only the closed candidate registry and
  automatic signed provisioning installs atomically beside (never over) the
  existing Hermes directory.
- Test stale events and late completion are safe conflicts.

## 6. Workstream 05 — Artifact, Library, R2, and media-history access parity

- Test canonical ACL matrix for owner/private/team/public/direct/group/role,
  expired share, deleted item, cross-tenant and no permission.
- Test Library and history tools return opaque references rather than raw keys,
  URLs or signed URLs.
- Test image/video/audio/document/archive/future registered MIME descriptors.
- Test R2 and managed/local sources use the same authorization decision.
- Test redemption rechecks ACL, expiry, source binding, replay and range policy.
- Test video/audio Range behavior and content disposition/size/type metadata.
- Test merged provider/deferred/HyperFrames/MCP/Hermes history pagination,
  deduplication and owner scope.
- Test legacy Python rows with null/wrong tenant are denied and migration/API
  filters preserve tenant isolation.
- Test download/audit logs omit raw keys, complete URLs, secrets and prompts.
- Test Connector-generated image/video outputs use the same decode/`ffprobe`,
  publication, billing, history/Library registration and ACL/download path as
  web/manual generation.

## 7. Workstream 06 — Platform packs and release/install parity

- Test each manifest has platform, architecture, OS, browser, FFmpeg, fonts,
  contract, executable paths, checksums and signature metadata.
- Test archive SHA-256/signature/pinned-key/path-traversal/symlink validation.
- Test staging plus atomic activation preserves the previous pack on failure.
- Test Windows native doctor does not require WSL.
- Test WSL2 rejects Windows path mixing and uses its declared Linux pack.
- Test macOS arm64/x64 reject cross-architecture/Rosetta readiness.
- Test runtime-pack HTTP allowlist and filename traversal protection.
- Test standalone Mac install/doctor/render does not invoke Xcode or Tauri.
- Test Windows/macOS first-run flow requires one browser approval, stores only
  protected credential material, and repairs a missing runtime component without
  asking the user to copy a token, API key, or filesystem path.

## 8. Workstream 07 — Redis, resilience, observability, and security hardening

- Test every new key has namespace, bounded serialization, explicit TTL and
  forbidden-payload rejection.
- Test the Connector pairing nonce/challenge is one-time, bounded, device-bound,
  and contains no access/refresh token in Redis.
- Test MCP session/download/proof/refresh/idempotency expiry behavior.
- Test Redis unavailable, slow, evicted and reconnecting states fail closed where
  authentication/claim/download safety depends on Redis.
- Test no media bytes, full prompts, credentials, raw keys or signed URLs are
  written to Redis.
- Test metrics/audit events contain identifiers and outcome but no sensitive values.
- Test SSRF, traversal/symlink, token-plane confusion, scope escalation, replay,
  stale assignment, URL leakage, tool injection, R2 key guessing and tenant spoof.
- Test MCP submit/download rate limits and backpressure.

## 9. Workstream 08 — End-to-end proof, rollout, and rollback

- Test deterministic MCP → scheduler → claim → render stub → artifact →
  publication → status/download flow.
- Test duplicate idempotency, provider auth expiry, unsupported model, worker
  offline, upload failure, cancellation and cross-tenant denial.
- Test flag-off legacy Worker App behavior and operator dedicated kill switch.
- Test safe requeue/reconciliation without duplicate billing during rollback.
- Run real short render evidence on Windows 11 native, macOS arm64 and macOS
  Intel; run WSL2 separately before enabling its production manifest.
- Compare dedicated and Worker App output/audio/subtitle/overlay/checksum and
  media-history publication.
- Verify focused test report separates known repository-wide baseline diagnostics.

## 10. Cross-workstream API and data contracts

- Contract fixture test ensures each producer/consumer uses the same runtime,
  target, capability, artifact and opaque-download fields.
- Compile/type tests catch section interface drift.
- Golden fixtures prove `auto` is input-only and persisted target is resolved.

## 11. Dependency and execution order

- Gate each workstream on its predecessor's focused tests.
- Do not enable platform E2E or production routing until all security/ACL tests
  and migration checks are green.

## 12. Definition of ready for deep-implement

- Verify all section files exist and checker reports complete.
- Verify each section's test stubs map to an implementation owner and no test
  relies on an undeclared later interface.
- Verify focused commands are documented for TypeScript, Rust, Python and the
  platform matrix.
