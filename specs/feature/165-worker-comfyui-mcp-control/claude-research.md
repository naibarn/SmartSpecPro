# Feature 165 Research

Research date: 2026-08-27

## Research decision

- Codebase research: required because this is an existing git repository with a
  Rust/Tauri Worker App, TypeScript Web app, Drizzle schema, and established
  Worker job/control-plane contracts.
- Web research: required because the feature depends on the evolving MCP
  transport/authorization contract and Comfy-Org's `comfy-mcp`/Comfy Cloud
  behavior.
- Testing research: required; the repository has Rust unit tests, Web Vitest
  tests, and existing MCP smoke/readiness scripts. Real provider/GPU proof must
  remain a separate release gate.

SocratiCode was not available in this runtime (no `codebase_status`,
`codebase_search`, or related tools were exposed). The codebase findings below
therefore use targeted shell discovery and exact source reads rather than
SocratiCode. This fallback is recorded so the plan does not claim graph or
symbol-index evidence that was not obtained.

## Codebase findings

### Worker App

- `apps/worker-app/src-tauri/src/lib.rs` registers the Tauri commands and owns
  `WorkerAppState`, settings, the worker loop, executor state, and the Series
  workspace. New Comfy profile/connection commands must be registered here and
  must not bypass the native command boundary.
- `apps/worker-app/src-tauri/src/comfy_mcp_client.rs` is a small stdio JSON-RPC
  client. It validates a command, spawns one child, negotiates a limited MCP
  manifest, and calls advertised tools. It has no Streamable HTTP, OAuth/API
  key profile store, remote session lifecycle, or profile revision model.
- `apps/worker-app/src-tauri/src/comfy_executor.rs` is a separate local
  loopback REST executor. It calls `system_stats`, `prompt`, `history`, and
  `view`, validates local output, and returns artifacts. The Feature 165 plan
  must replace new execution paths with the MCP adapter while preserving a
  controlled legacy adapter for old jobs/settings during migration.
- `apps/worker-app/src-tauri/src/settings.rs` currently persists legacy
  `comfyui_enabled`, `comfyui_base_url`, `comfyui_mcp_enabled`, and
  `comfyui_mcp_command`; validation assumes an unauthenticated HTTP loopback
  service. Feature 165 must preserve these fields and import them once into a
  verifiable legacy profile without overwriting them.
- `apps/worker-app/src-tauri/src/worker_executor.rs` classifies Worker jobs
  and already isolates Remotion/Hermes/HyperFrames paths. It currently has
  Comfy progress/completion helpers but no four-type canonical Comfy executor,
  profile resolution, revision gate, or full output/publication ledger.
- `apps/worker-app/src-tauri/src/worker_loop.rs` builds capability hints and
  claims work through the existing control plane. New Comfy capability hints
  must be derived from a fresh/valid negotiated snapshot and must not make a
  stale cached profile claimable.
- Existing Rust tests are inline `#[cfg(test)]` modules in settings,
  `comfy_mcp_client`, `comfy_executor`, commands, media pipeline, worker
  executor, and worker loop. The package test command is
  `npm --workspace apps/worker-app test`, which runs Cargo tests.

### Web shared contracts and server

- `apps/web/shared/workerRuntime.ts` is the shared Zod/type contract for
  Worker runtime types, claims, progress, artifacts, and existing Comfy
  contracts. It currently contains `comfy_image_generation` and
  `comfy_workflow_run`; the plan must add video/shot types without breaking
  existing payload adapters.
- `apps/web/shared/workerAccessKeys.ts` owns Worker scope values and presets.
  It is the correct least-privilege boundary for the additive
  `workers:jobs:read` scope and permission-revision behavior.
- `apps/web/server/routes/workerRuntime.ts` owns the authenticated Worker
  registration/connect/control-plane HTTP route family. It is the correct
  place for the Worker summary operation and existing claim/heartbeat/report
  integration; it must not become an unauthenticated Comfy proxy.
- `apps/web/server/routers/workerJobs.ts` exposes user-facing tRPC list/detail/
  cancel operations through `workerJobMonitorService.ts`. The Web and Worker
  should consume one projection service, with separate authorization adapters.
- `apps/web/drizzle/schema.ts` currently has `worker_jobs`,
  `worker_job_events`, `worker_artifacts`, Worker access/heartbeat data, and
  Hermes connection records. There are no Feature 165 Comfy profile,
  capability snapshot, workflow registry/binding, revision, or dedicated
  Comfy execution ledger tables yet.
- `apps/web/client/src/pages/RenderJobsPage.tsx` renders a mostly Thai,
  Web-oriented job table/detail view with a local job-type map and existing
  tRPC list/detail calls. The plan must use a shared projection and
  localization registry rather than duplicate status interpretation.
- `apps/web/server/routes/workerSeriesControlPlane.ts` and existing Series
  workspace contracts are the server-safe boundary for Series binding and
  local Worker folder projection; local absolute paths must remain native-only.

### Existing UI/runtime conventions

- Worker UI is a Vite/React application with a Sidebar and canonical route
  screen components (`WorkerAppShell`, `WorkerTopbar`, `workerRoutes`,
  `CanonicalWorkerRouteScreen`, `MediaWorkspaceHost`). The existing spec's
  screen ownership table should be implemented by extending this route model,
  not adding another global Quick Actions surface or another queue database.
- Worker runtime packaging is explicit in `apps/worker-app/scripts/` and
  `runtime-pack/`; the Feature 165 runtime work should add pinned MCP/client
  compatibility metadata and diagnostics without reintroducing HyperFrames as
  a required runtime dependency.
- Web scripts: `npm --workspace apps/web test` runs Vitest; `npm --workspace
  apps/web run typecheck` checks TypeScript; the repository also exposes
  `mcp:smoke`, `mcp:failure-harness`, and `mcp:readiness` scripts. These are
  useful for protocol regression but do not replace a real controlled Comfy
  smoke test.
- Worker scripts: `npm --workspace apps/worker-app run typecheck`, `npm
  --workspace apps/worker-app test`, and the Tauri/runtime packaging scripts.

## Web research findings

### MCP transport and authorization

1. The official MCP transport specification defines stdio and Streamable HTTP
   as standard transports. Stdio is a child process with JSON-RPC-only stdout;
   Streamable HTTP uses a single endpoint supporting POST/GET and optional SSE.
   The client must preserve negotiated protocol version headers and session
   handling. Source: [MCP Transports](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports).
2. Streamable HTTP servers must validate `Origin`, should bind local servers to
   localhost, and should authenticate every connection. A stateful session may
   return `Mcp-Session-Id`; clients must send it on subsequent calls and start
   a new session after a session-bound 404. The adapter plan therefore needs an
   explicit session object, reconnect/resume policy, origin/host allowlist,
   and no generic HTTP shortcut. Source: [MCP Transports session and security](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports).
3. MCP HTTP authorization is optional at protocol level, but conforming HTTP
   implementations use OAuth 2.1 patterns. Authorization headers are required
   on every HTTP request, tokens must not be put in query strings, and the
   resource server validates intended audience/scopes. Stdio should obtain
   credentials from the environment/secure local context instead. Source:
   [MCP Authorization](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization).

### Comfy-Org implementation boundary

4. The official Comfy-Org `comfy-mcp` project describes the local server as a
   stdio MCP server that drives local ComfyUI through `comfy-cli`, while
   Comfy Cloud MCP is a separate remote HTTP server at
   `https://cloud.comfy.org/mcp`. It supports workflow generation, async job
   monitoring, cancellation, output collection, discovery, and staged inputs,
   but the project is beta and the tool surface is provider/version dependent.
   Source: [Comfy-Org/comfy-mcp](https://github.com/Comfy-Org/comfy-mcp).
5. The same source states that `comfy-mcp` and `comfy-cli` are separate runtime
   pieces and that the executable actually resolved at runtime matters. The
   Worker should therefore report installed/required versions, probe the real
   executable, and avoid silently installing arbitrary packages or custom
   nodes.
6. Comfy Cloud supports OAuth for capable clients and API-key fallback for
   clients/headless operation, with Cloud execution and output retrieval
   occurring remotely. The profile model must keep these credentials in the
   OS keychain and treat remote input transfer and paid execution as explicit
   policy decisions.
7. Comfy MCP release notes show active beta evolution, including tool-surface
   changes and client-consent behavior. The plan should pin a compatibility
   range and capability snapshot rather than assume a permanent tool name or
   schema. Source: [Comfy-Org/comfy-mcp releases](https://github.com/Comfy-Org/comfy-mcp/releases).

## Decisions derived from research

- Use one internal Rust adapter with stdio and Streamable HTTP implementations;
  keep SmartAIHub's authenticated Worker control-plane HTTP separate from MCP.
- Resolve tool names from the negotiated capability snapshot and approved
  adapter mapping. Never expose arbitrary MCP tool names, endpoint URLs, raw
  graphs, or shell commands to the browser job payload.
- Treat profile, permission, connection-policy, workflow-binding, and
  input-policy revisions as typed immutable provenance. A capability probe can
  refresh health/snapshot state but cannot grant access.
- Keep the old loopback REST executor only as an explicitly bounded legacy
  compatibility path for pre-existing jobs/settings. New Feature 165 jobs
  must use MCP and must fail closed when the required capability is missing.
- Use server-owned job/lease/projection state and Worker-local secure/profile/
  execution state. Save and validate output locally before optional artifact
  publication.

## Testing approach

- Rust unit/contract tests first for profile validation, MCP JSON-RPC/session
  behavior, capability snapshots, typed mapping, path/output safety, ledger
  recovery, and four job types.
- Web Vitest tests for shared Zod contracts, scope/revision authorization,
  migration adapters, server projection parity, API routes, and UI state
  contracts. Use jsdom for browser-facing component tests.
- Fake stdio and fake Streamable HTTP MCP servers cover deterministic protocol
  and failure behavior in CI. Controlled local, self-hosted remote, and Cloud
  smoke tests remain release-gated and must not be claimed from static tests.
- Run focused workspace tests/typechecks before broader checks because the
  repository's full TypeScript check may be resource-intensive.
