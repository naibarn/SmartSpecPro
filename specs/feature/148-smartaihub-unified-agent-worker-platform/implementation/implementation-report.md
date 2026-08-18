# Deep-implement report

Date: 2026-08-18
Plan: `../claude-plan.md`

## Implemented working-tree slice

- Shared MCP onboarding descriptor for Hermes One, Hermes CLI, Claude, Codex,
  and generic Streamable HTTP clients.
- Descriptor-driven Hermes CLI setup in Settings and MCP documentation
  resources; browserless fallback remains a UI-created, scoped MCP CLI key.
- Bounded Hermes parent/child correlation metadata with tenant/user checks,
  idempotency, expiry, and secret/path/URL rejection.
- Worker App ComfyUI adapter with loopback-only service policy, readiness gate,
  workflow submit/poll/cancel, image/video output collection, safe path
  confinement, bounded files, registered-service matching, image magic-byte and
  video ffprobe validation, server-declared endpoint/poll/timeout binding,
  prompt-id-scoped cancellation, and live ComfyUI readiness in worker
  heartbeat/capabilities,
  progress/failure events, and existing artifact upload/publication integration.
- Worker App Settings exposes ComfyUI enablement and local service URL.
- Canonical API scope list now includes `library:upload`, matching OAuth's
  advertised scope set.
- Remotion registration regression fixture updated to the current signed
  metadata contract rather than the obsolete pre-contract shape.

## Verification

- Web focused MCP/worker suites: 9 files, 260 tests passed.
- The focused set includes the worker registry heartbeat promotion regression;
  the earlier additional MCP/OAuth/worker contract run also passed (99 tests).
- Worker App Rust: 180 tests passed (149 unit, 10 runtime-manifest, 21 worker
  executor integration, no failures).
- Worker App TypeScript: `npm --workspace @smartspec/worker-app run typecheck`
  passed.
- `git diff --check` for the touched implementation paths passed.
- Web repository-wide check was run and remains blocked by unrelated existing
  type errors in dashboard/chat/marketplace/Vertical Drama/server modules. The
  previous MCP OAuth scope type error was fixed; no error remained for the
  touched MCP/worker contract paths.
- `npm --workspace apps/web run mcp:readiness` was run against the current
  production-mode configuration and correctly returned blocked: no Admin UI
  MCP settings source and no HTTPS public base URL in the local check context.
  `mcp:smoke` was not run because its required `MCP_SMOKE_URL` and
  `MCP_SMOKE_TOKEN` were not available; this is recorded as not-run, not pass.
- A read-only production probe on 2026-08-18 returned `401` from
  `https://smartaihub.app/v1/mcp`, but both OAuth well-known endpoints returned
  `404`. This confirms the deployed production runtime has not yet been
  configured/enabled through the UI-backed MCP runtime settings and tenant
  rollout flags; local implementation/tests must not be reported as live OAuth
  readiness.
- The repository-wide web test command was attempted but ended with Node/V8
  out-of-memory after broad unrelated failures (DB/Redis/env-dependent and
  existing UI/domain suites). It is not used as acceptance evidence for this
  slice; the focused suites above remain the relevant regression proof.

## Explicit remaining gates

1. Enable and configure OAuth PRM/authorization-server/JWKS through the
   production admin UI (not environment variables), then prove browser consent
   and token verification on production.
2. Real Hermes One/CLI, Claude CLI/Desktop, and Codex CLI discovery/login and
   `initialize`, `tools/list`, `resources/list/read`, and `tools/call` proof.
3. Real Windows 11 and macOS Worker App release/install/upgrade proof,
   including signed artifacts and device revoke/reconnect.
4. Real ComfyUI image and video workflows with the required checkpoint,
   custom nodes, GPU/driver, output validation, upload, and Media History
   download proof.
5. Production telemetry observation and the planned 30–90 day legacy endpoint
   deprecation decision.

These are environment/provider/release gates, not silently marked complete by
local fixture tests.

## Focused security review

- MCP descriptors contain only public endpoint/instruction data; no token or
  credential is generated or copied into descriptor output.
- Correlation metadata is bounded and rejects bearer/API/refresh-token terms,
  local paths, and URLs before persistence; tenant and requesting-user binding
  is checked server-side.
- ComfyUI is restricted to exact HTTP loopback hosts, rejects credentials,
  query/fragment data, validates endpoint templates, bounds polling/output
  sizes, and confines filenames/subfolders to the worker workspace.
- Worker settings now parse the URL structurally, preventing userinfo/host
  prefix tricks such as `127.0.0.1:8188@evil.test`.
- ComfyUI jobs are now constrained to the exact loopback service registered in
  Worker App settings, and downloaded outputs are rejected unless image magic
  bytes or the runtime-pack ffprobe video check agrees with the declared MIME.
- ComfyUI cancellation is scoped to the Comfy `prompt_id`; a canceled job no
  longer sends an unscoped interrupt that could stop another local job.
- Worker heartbeats now report `runtimeMetadataJson.comfyUi` and the server
  promotes the sanitized live state to `capabilitiesJson.comfyUi` for UI and
  scheduler/status consumers.
- No live penetration test, browser OAuth attack simulation, or production
  credential exercise was performed in this working-tree verification.
