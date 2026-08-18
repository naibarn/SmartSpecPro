# Feature 148 TDD Implementation Plan

This document mirrors `claude-plan.md`. Tests are written before implementation
for each section using the repository's existing Vitest/jsdom/Cargo/Playwright
conventions. These are test stubs and acceptance descriptions, not production
test implementations.

## 1. Implementation boundary and strategy

- Verify all new behavior is additive when Feature 148 flags are false.
- Verify legacy MCP/pairing/Worker App paths continue to resolve to their
  existing handlers.
- Verify changed-file test commands do not depend on unrelated dirty-worktree
  changes.

## 2. Current authority map

- Contract tests assert new helpers reference existing MCP, worker, artifact,
  media-task, and feature-flag authorities rather than duplicate registries.
- Static guard tests reject new raw token stores, direct browser-to-Comfy URLs,
  and alternate job queues in Feature 148 modules.

## 3. Section 01 — Protocol, OAuth, and production discovery hardening

- PRM disabled when DB-backed inbound OAuth/JWKS/audience/resource config is
  incomplete.
- PRM contains canonical resource, authorization server, bearer header, scopes,
  and resource name when complete.
- `/v1/mcp` 401 includes `WWW-Authenticate` metadata challenge and required
  scope without secret leakage.
- Wrong issuer/audience/resource, expired, revoked, and insufficient-scope
  tokens are rejected before JSON-RPC tool execution.
- `server/discover`, `initialize`, `tools/list`, `tools/call`, resources, ping,
  and DELETE session preserve expected shapes and flags.
- Tasks/subscriptions/list-change remain false unless explicitly enabled.

## 4. Section 02 — Client-neutral onboarding and browserless credentials

- Descriptor renders correct endpoint/auth/verification instructions for Hermes,
  Claude, Codex, and generic MCP.
- Hermes deep link contains public config only; no token/key appears in URL.
- Existing `/auth/device/authorize` and `/auth/device/token` flow handles
  pending, authorized, expired, replayed, rate-limited, and revoked cases.
- UI-created MCP CLI key has requested scopes/quota/expiry, is revealed once,
  and is not logged or returned on subsequent reads.
- Connected device projection shows tenant, origin, named scopes, expiry, quota,
  auth type, and runtime status; Revoke All only affects the current tenant's
  MCP connections.
- Component tests cover loading, unavailable OAuth fallback, one-time reveal,
  expired code, verification failure, revoke confirmation, keyboard labels, and
  Thai/English fallback copy.
- Browser evidence covers the settings setup flow and browserless instructions.

## 5. Section 03 — Hermes parent task and typed child-job correlation

- Shared correlation schema rejects oversized/unbounded values, secrets, local
  paths, arbitrary URLs, and binary payloads.
- `queueHermesWorkerJob` preserves feature flag, preferred worker, capability,
  readiness, idempotency, and billing checks.
- One parent request creates one external-agent parent and bounded child job
  references; duplicate idempotency returns the existing lineage.
- Child Comfy/Remotion/FFmpeg/Local AI requests use existing typed scheduler
  contracts and cannot become arbitrary shell jobs.
- Parent event projection handles progress, partial results, publication
  pending, failure, cancellation, lease expiry, and reconnect without duplicate
  credits or terminal transitions.
- Browser close and outbound relay loss leave durable job state recoverable.

## 6. Section 04 — Concrete ComfyUI adapter and artifact path

- Service binding accepts loopback registered service and rejects arbitrary LAN,
  callback, path, or URL input.
- Readiness detects missing service/version/model/custom node/GPU/VRAM/disk and
  returns the correct capability-specific blocker.
- `/prompt` validation failure maps to existing failure taxonomy; valid prompt
  id is persisted.
- History/WebSocket progress, bounded polling, interrupt, timeout, orphaned
  execution, and restart recovery are covered.
- Image outputs validate MIME/size/dimensions/checksum; video outputs validate
  MIME/size/checksum/duration/dimensions/framerate/codec/container/ffprobe.
- Artifact init/upload/complete/publication is idempotent and ACL-safe; failed
  checksum/upload never publishes a broken result.
- Three jobs on one runtime execute sequentially; cancel and disconnect do not
  duplicate or reorder artifacts.
- Web and MCP submitters receive the same job/status contract.

## 7. Section 05 — Runtime readiness and process safety

- Signed profile rejects wrong signature/hash/version/platform/architecture and
  does not activate partial archives.
- Missing managed dependency supports install/repair/update/verify/rollback and
  blocks claim until post-install health checks pass.
- Manual prerequisite state includes OS-specific instruction, privilege/reboot
  note, safe command id, and Check again result without secrets.
- Process manager starts only registered Comfy/Remotion/FFmpeg/Local AI profiles,
  enforces ownership, bounded logs, graceful stop, and no arbitrary PID kill.
- Windows native/WSL2 and macOS arm64/x64 capability claims match manifests;
  unsupported Remotion/macOS states are explicit.

## 8. Section 06 — UI, docs, telemetry, and rollout controls

- Telemetry records endpoint/transport/client/version/runtime/capability/status/
  failure/quota/publication fields and redacts credentials/local paths.
- Settings and `/v1/docs` are generated from the same descriptor and show the
  same support matrix for all clients.
- Tenant/admin UI shows feature/config source, scope, dependency, audit actor,
  current state, and rollback action; production does not require `.env` edits.
- Legacy endpoint usage is measured separately and deprecation is not enabled
  before the 30–90 day no-use gate.
- UI states for task/device/runtime/artifact are covered in component and
  browser tests with accessible Thai/English copy.

## 9. Section 07 — Verification, gates, and handoff

- Focused tests, web/worker type checks, MCP smoke/readiness/failure harness,
  migration checks, and diff checks are runnable and documented.
- Production-gate report distinguishes code proof, focused tests, baseline
  failures, and missing real-machine/provider evidence.
- A final regression test asserts flags-off compatibility and no accidental
  removal of legacy panels/routes.

## 10. Git/worktree policy

- Test/staging scripts operate only on explicit Feature 148 paths.
- No destructive command or broad `git add -u` is used in the dirty checkout.
