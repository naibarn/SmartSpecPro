# Research Notes

## Summary

This feature sits on top of real worker-control-plane code that already exists in `apps/web`. The main gap is not worker registration or basic job routing anymore. The gap is a safe, tenant-scoped, budgeted way for a claimed worker job to act as a delegated platform client across `/v1/*` and selected MCP surfaces.

## Codebase findings

### Bound Worker is currently OpenClaw-only

- `assistant_profiles.externalWorkerId` already binds external connectors to workers.
- Binding is currently hard-limited to `openclaw_gateway` in [apps/web/server/services/teamService.ts](../../../apps/web/server/services/teamService.ts), with the explicit check at lines 267-268.
- This means the current product model still treats Bound Worker as an OpenClaw-only bridge, not yet a runtime-aware contract for the broader Claw family.

### Worker dispatch is real, but narrow

- OpenClaw worker jobs are already queued from the run engine through `queueOpenClawWorkerJob()` in [apps/web/server/services/runEngine.ts](../../../apps/web/server/services/runEngine.ts).
- The scheduler only allows three OpenClaw job types today: `external_agent_task`, `browser_automation_task`, and `plugin_workflow_task` in [apps/web/server/services/workerSchedulerService.ts](../../../apps/web/server/services/workerSchedulerService.ts).
- This confirms the current system has a real worker control plane, but it does not yet model richer worker-native content pipelines such as article -> media -> presentation -> publish.

### Billing already has a worker envelope

- `workerBillingService` already reserves and reconciles `worker_runtime` credits in [apps/web/server/services/workerBillingService.ts](../../../apps/web/server/services/workerBillingService.ts).
- This is a strong foundation for delegated platform calls, but the current envelope is parent-job-oriented. It does not yet expose a downstream delegated budget ledger for API or MCP usage inside the worker job.

### HTTP platform surfaces already exist and are stronger than MCP today

- `/v1/*` routes are mounted centrally in [apps/web/server/_core/index.ts](../../../apps/web/server/_core/index.ts), including skills, agencies, presentations, video projects, media, and jobs.
- `publicMediaApi` is fully real and already deducts `api_media` credits for image and video generation in [apps/web/server/routes/publicMediaApi.ts](../../../apps/web/server/routes/publicMediaApi.ts).
- This makes HTTP the correct first implementation path for delegated worker execution where end-to-end platform behavior already exists.

### Scope enforcement needs a new auth class for worker delegation

- `requireScopes` currently allows `session` and generic `bearer` auth to bypass scope checks in [apps/web/server/middleware/requireScopes.ts](../../../apps/web/server/middleware/requireScopes.ts).
- That behavior is fine for current web-user flows but unsafe for delegated worker execution.
- The plan must therefore introduce a distinct delegated-worker auth mode or equivalent classification rather than reusing the generic bearer path.

### MCP is useful, but many high-value tools are still placeholder bridges

- `mcpPublicServer` exposes tools for media, skills, agencies, presentations, and video projects in [apps/web/server/_core/mcpPublicServer.ts](../../../apps/web/server/_core/mcpPublicServer.ts).
- However, many of the high-value tools still return placeholder `delegated` or `pending` responses rather than running the full platform flow.
- This confirms that MCP should remain secondary for this feature until real parity is implemented for selected surfaces.

### Static gateway scopes are intentionally narrow today

- `authz.ts` gives the current gateway token only `llm:chat`, `mcp:read`, and `mcp:write` in [apps/web/server/_core/authz.ts](../../../apps/web/server/_core/authz.ts).
- Delegated worker access therefore needs its own issuance path rather than piggybacking on the existing shared gateway token model.

## Web findings

### OpenClaw is a real gateway/plugin runtime

- OpenClaw’s official plugins documentation describes plugins that can register gateway RPC methods, gateway HTTP routes, agent tools, CLI commands, background services, context engines, and skills.
- The same documentation states that plugins run in-process with the gateway and should be treated as trusted code.
- Source: https://docs.openclaw.ai/plugins

Implication:

- SmartSpecPro should treat OpenClaw as a capable external runtime that can both execute its own tools and act as a delegated client to SmartSpecPro.
- Because OpenClaw plugins are trusted code in-process, SmartSpecPro must not over-trust the runtime and should continue to enforce delegation, grants, and budgets server-side.

### OpenClaw recommends WSL2 for fuller Windows support

- OpenClaw’s Windows documentation recommends running the CLI and Gateway inside WSL2 for a more consistent runtime and better tool compatibility.
- Source: https://docs.openclaw.ai/zh-CN/platforms/windows

Implication:

- The platform-access plan should remain runtime-aware and avoid assumptions that only fit native Windows or only fit remote Linux-hosted workers.

### MCP has an official machine-to-machine auth direction

- The official Model Context Protocol site documents an OAuth Client Credentials extension for machine-to-machine authentication.
- Source: https://modelcontextprotocol.io/extensions/auth/oauth-client-credentials

Implication:

- MCP is compatible with a machine-actor model, but for SmartSpecPro this should still be layered behind explicit job-scoped policy, grants, and auditing.
- It also supports the plan’s separation between user session auth and worker-to-platform auth.

### OAuth token exchange concepts reinforce audience- and resource-bound delegation

- RFC 8693 explicitly defines `audience` and `resource` targeting for token exchange.
- Source: https://www.rfc-editor.org/rfc/rfc8693

Implication:

- Delegated worker sessions should be audience-bound, resource-bound, short-lived, and revocable.
- The platform should reject broad tenant-wide or user-wide delegation that is not explicitly tied to a worker job and grant set.

## Testing setup

### Current framework

- The `apps/web` codebase uses Vitest-style `describe/it` tests for server and client code.
- Existing route and service tests already cover worker runtime routes, billing services, registry behavior, team binding, MCP public routes, LLM routes, and media APIs.

### Test placement patterns

- Server route and core tests live under `apps/web/server/**/__tests__` or alongside `_core` route files.
- Service tests live under `apps/web/server/services/__tests__`.
- Client page tests live under `apps/web/client/src/pages/__tests__`.

### Planning implication

- This feature should extend existing test suites rather than introduce a new framework.
- The first implementation slices should be test-first around auth classification, delegated-session issuance/revocation, budget enforcement, route authorization, and callback safety.

## Research conclusions for the plan

1. The feature should be built as an extension of the existing worker control plane, not a new worker system.
2. Delegated worker platform access needs a new auth classification, not reuse of the generic bearer bypass.
3. HTTP should be the first-class execution path for LLM, skills, agencies, media, presentations, video projects, and jobs.
4. MCP should be added selectively where there is already real execution value, not only discovery stubs.
5. Budgeting must be two-layered: parent `worker_runtime` reservation plus downstream service-accurate source types.
6. Runtime eligibility must expand beyond OpenClaw-only assumptions without pretending all Claw runtimes behave the same way.
7. The user’s stated product goal is valid and achievable only if Bound Worker is treated as a delegated digital operator, not merely a routing hint.
