# Deep-plan Research — Feature 148

## Research decision

- Codebase research: required. The repository is a git checkout with an existing
  TypeScript/React/Express/Drizzle application, Rust/Tauri Worker App, and
  multiple already-shipped MCP/Worker features.
- Web research: required for current MCP authorization and ComfyUI transport
  contracts. Official sources were preferred.
- Testing research: required. Existing tests use Vitest for the web app,
  Playwright for browser acceptance, and Cargo tests for the Tauri Worker App.
- SocratiCode: unavailable in this session. The fallback was targeted shell
  discovery and exact line-range inspection; this limitation is recorded so
  broad repository claims are not confused with indexed codebase proof.

## Codebase findings

### MCP and OAuth

- Canonical HTTP MCP is registered at `/v1/mcp` in
  `apps/web/server/_core/mcpPublicServer.ts`; the app also preserves pairing,
  download broker, discovery, and compatibility routes.
- `mcpOAuthMetadata.ts` builds Protected Resource Metadata only when inbound
  OAuth verification configuration is complete (`oauthInboundEnabled`, JWKS
  URI, audience, resource, and authorization server). This is deliberately
  fail-closed, but the route still needs production smoke evidence and settings
  configuration verification.
- `mcpOAuthServer.ts` already contains authorization-server metadata, consent,
  token, refresh, client registration, and human-readable scope copy.
- `deviceAuthRoutes.ts` already implements device authorization and refresh
  token rotation. The implementation plan should reuse it instead of adding a
  second device-code protocol.
- `mcpRuntimeConfig.ts` reads production MCP runtime configuration from the DB
  and intentionally ignores environment configuration in production when the
  DB is unavailable. This matches the user's requirement that production setup
  happen through UI/DB rather than `.env`.
- `mcpRolloutPolicy.ts` keeps modern MCP, PRM, authorization server, resources,
  tasks, and subscriptions as separate rollout decisions. `tasks` and
  `subscriptions` are currently hard-disabled in the policy.

### Client onboarding and UI

- `apps/web/client/src/lib/mcpClientOnboarding.ts` currently supports a Hermes
  deep link and only a generic settings mode for Claude/Codex. It does not yet
  provide a versioned client-neutral onboarding descriptor or browserless key
  creation flow.
- `ConnectedDevicesPanel.tsx` already shows the canonical endpoint, OAuth
  readiness, Hermes CLI snippets, device status, scopes, tenant/device details,
  and Revoke All MCP. Existing component tests cover the revoke-all path.
- `McpConnectPanel`, `HermesConnectPanel`, and
  `McpServersSettingsPanel` are separate integration surfaces and must not be
  collapsed or deleted. New onboarding should be shared through helpers and
  descriptors, not by removing these panels.
- Existing settings localization already contains many MCP/device strings, so
  additions must be made in both Thai and English and preserve fallback keys.

### Worker and runtime

- `apps/web/shared/workerRuntime.ts`, `workerRegistryService.ts`,
  `workerSchedulerService.ts`, `routes/workerRuntime.ts`, and
  `hermesWorker/controlPlaneClient.ts` already define registration, heartbeat,
  claim, progress, lease, artifact init/complete, and reconciliation seams.
- Runtime packs are signed/hash-checked and platform-specific. Current IDs
  include `hyperframes-wsl2`, `hyperframes-windows-x64`,
  `hermes-windows-x64`, `hermes-macos-arm64`, and conditional Remotion executor
  IDs. The macOS Hermes pack is Apple-Silicon-only in the current catalog.
- `apps/worker-app` has doctor/setup/update/readiness code and a Remotion
  sidecar pack, but the spec's real-machine gates remain separate from package
  availability. A source/Xcode build cannot be treated as end-user runtime
  evidence.

### Existing Hermes gateway and media namespace

- `queueHermesWorkerJob` admits `external_agent_task`, is gated by
  `hermesAgentRuntime`, requires an explicit preferred worker, and uses the
  existing worker scheduler and billing path.
- `runEngine.ts` already builds external-connector dispatch jobs and selects
  `hermes_agent_gateway` or the existing OpenClaw lane.
- `hermes_media_*`, `hermesConnectionService.ts`, and `hermesMediaAdapter.ts`
  are a separate provider-account media namespace. The implementation must not
  merge provider connection state with the agent gateway or create duplicate
  billing/result records.

### ComfyUI and media persistence

- `workerRuntime.ts` defines typed `comfy_image_generation` and
  `comfy_workflow_run` contracts, progress stages, failure codes, service
  binding, and artifact event payloads.
- `workerSchedulerService.ts` already queues Comfy job families and
  `workflowWorkerRuntimeService.ts` admits desktop dispatch, but targeted search
  did not find a complete Worker App/Hermes adapter that discovers a registered
  Comfy service, submits `/prompt`, observes history/WebSocket progress,
  interrupts execution, validates outputs, and completes server publication.
- `mcp_media_tasks` and `mcpMediaAdapter.ts` already persist MCP media task
  status/results with tenant/user/idempotency indexes. MCP provider-media flows
  must reuse this authority where applicable; local Comfy jobs remain owned by
  `worker_jobs` and link to artifacts/history without copying result URLs.
- The current artifact path uses the server worker control plane and the
  tenant-scoped MCP download broker. Outputs must not expose local paths or
  provider storage URLs.

### Quotas and Redis boundary

- API-key quota code supports hourly/daily/weekly/monthly Redis counters, while
  worker/API-key billing services also carry durable credit reservation/ledger
  semantics. Feature 148 must not add another quota table or treat Redis as the
  durable source of truth.
- A production implementation must make the five-hour/day/seven-day credit
  policy explicit at the common job/agent boundary and retain durable usage and
  reservation lineage.

## Official protocol/runtime research

1. MCP authorization specification (2025-11-25):
   https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
   requires Protected Resource Metadata, authorization-server discovery,
   `WWW-Authenticate` metadata challenges, PKCE for public clients, resource
   indicators/audience binding, and rejection of tokens not issued for the MCP
   resource.
2. MCP authorization specification (2025-06-18):
   https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization
   reinforces HTTPS redirects, secure token storage, refresh-token rotation,
   and resource-server validation before returning protected data.
3. ComfyUI server routes:
   https://docs.comfy.org/development/comfyui-server/comms_routes
   documents `/prompt`, `/history/{prompt_id}`, `/ws`, queue status, output
   retrieval, and system/resource probes. The adapter should isolate these
   routes behind a versioned service binding and never expose them directly to
   MCP callers.
4. MCP Tasks:
   https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks
   describes tasks as experimental and warns that unauthenticated task IDs can
   expose results. Feature 148 should therefore keep tasks disabled until they
   map to the existing authenticated durable task authority.

## Testing conventions

- Web focused tests: `npm --workspace apps/web test -- <path>` or the repository
  Vitest command with a focused file; browser component tests use jsdom.
- Web browser evidence: `apps/web/playwright.config.ts` and focused Playwright
  specs for production-like flows.
- Worker App: `npm --workspace apps/worker-app test` runs Cargo tests; TypeScript
  checks use the Worker App package script.
- MCP smoke/readiness: repository scripts `npm run mcp:smoke`,
  `npm run mcp:readiness`, and the MCP failure harness are existing proof
  surfaces. They must be run with production-safe credentials/configuration and
  reported separately from unit tests.

## Research-to-plan decisions

- Implement production MCP discovery/onboarding using existing routes/config
  authorities first; do not introduce a second OAuth or key database.
- Reuse existing device authorization for browserless CLI setup. Add a
  connection-descriptor/UI projection and validation rather than inventing a
  parallel OAuth device-code storage path.
- Reuse `external_agent_task` as the Hermes parent lane and typed `worker_jobs`
  as child execution. Add only the smallest durable correlation state needed
  after checking existing team/conversation/job records.
- Build the ComfyUI adapter behind the existing worker claim/artifact protocol;
  do not add direct browser-to-ComfyUI calls or a second queue.
- Keep rollout flags off by default and make production configuration DB/UI
  controlled. Enable only after focused tests and explicit smoke/gate evidence.
