# Research Notes

## Summary

Feature 074 is not a greenfield MCP project. The codebase already has a capable public MCP protocol shell, a legacy MCP implementation with real workspace/drive/orchestrator behavior, and a delegated-worker foundation from Feature 072. The main gap is execution truth: many public MCP tools are still placeholders, delegated workers are intentionally blocked, and billing/grant enforcement is not yet unified with the delegated HTTP path.

## Codebase findings

### Public MCP server is structurally strong

The canonical public MCP surface already exists at `apps/web/server/_core/mcpPublicServer.ts`.

Important existing behavior:

- protocol initialization, session handling, batch support, termination, and discovery are already implemented
- `tools/list` and `tools/call` exist and have protocol-level coverage in `apps/web/server/_core/__tests__/mcpPublicServer.test.ts`
- security-oriented tests already exist in `apps/web/server/_core/__tests__/mcpPublicServerSecurity.test.ts`
- the current default session TTL is already documented in tests as `900` seconds

This means Feature 074 should not redesign the MCP transport or protocol skeleton. It should complete execution truth, delegated-worker eligibility, and safe parity.

### Delegated worker MCP is intentionally blocked today

The public MCP tests confirm the current product truth: delegated workers are fail-closed for MCP in this phase.

Relevant evidence:

- `apps/web/server/_core/__tests__/mcpPublicServer.test.ts`
- current route behavior rejects auth mode `delegated_worker` with `mcp_unavailable`

This is a strong baseline for Feature 074 because the plan can safely describe MCP completion as an explicit new phase rather than pretending it already exists.

### Many public MCP tools are still stub or bridge responses

`apps/web/server/_core/mcpPublicServer.ts` registers a broad set of `smartspec.*` tools across:

- skills
- agencies
- agency tool bridge
- media
- presentations
- video projects
- jobs
- workspace-like file tools
- drive tools
- browser
- orchestrator

However, several families still return placeholder responses such as:

- “Delegated to /v1/media”
- “Delegated to /v1/presentations/generate”
- “Job status via /v1/jobs/:jobId”
- generic “Tool not implemented” errors for some advertised tools

This is the core truthfulness problem that Feature 074 must solve.

### Legacy MCP contains real implementations worth migrating

`apps/web/server/_core/mcpRoutes.ts` still has real behavior that should be reused rather than rewritten:

- workspace read/write tools
- storage artifact lookup helper
- Python-backed drive tool proxying
- orchestrator room actions

The legacy routes also already contain audit behavior and scope checks, so Feature 074 should treat them as migration candidates into the canonical public MCP truth model.

### Delegated HTTP foundation from Feature 072 is already useful

Feature 072 already introduced the delegated-worker foundation that MCP should build on:

- delegated session issuance in `apps/web/server/routes/workerRuntime.ts`
- delegated manifest route in `apps/web/server/routes/workerRuntime.ts`
- worker ownership, route-family scopes, grant records, model allowlists, and knowledge defaults in `apps/web/server/services/workerDelegationService.ts`
- owner-bound RAG and Library HTTP routes in `apps/web/server/routes/publicKnowledgeApi.ts`

This means Feature 074 should reuse the delegated session model instead of inventing a second worker auth design for MCP.

### Current HTTP routes already provide the strongest execution truth

The following public route families already exist and are better implementation anchors than placeholder MCP wrappers:

- `/v1/knowledge/*` via `publicKnowledgeApi.ts`
- `/v1/media/*` via `publicMediaApi.ts`
- `/v1/agencies/*` via `publicAgencyApi.ts`
- `/v1/presentations/*` via `publicPresentationsApi.ts`
- `/v1/video*` via `publicVideoApi.ts`
- `/v1/jobs*` via `publicJobsApi.ts`
- `/v1/mcp` and `/.well-known/mcp.json` via `mcpPublicServer.ts`
- public OpenAPI publication in `publicDocsApi.ts`

The best pattern for Feature 074 is therefore:

1. keep HTTP as the strongest product truth
2. make MCP execution reuse real services/routes
3. hide any MCP tool that still cannot execute safely and truthfully

### Testing setup already fits this work

The repo uses Vitest heavily for server, route, and service tests.

Relevant patterns:

- protocol and route tests use `supertest` + `express`
- service tests use `vi.mock` and targeted unit/service test files
- existing MCP suites already live under:
  - `apps/web/server/_core/__tests__/mcpPublicServer.test.ts`
  - `apps/web/server/_core/__tests__/mcpPublicServerSecurity.test.ts`
  - `apps/web/server/_core/mcpRoutes.test.ts`
  - `apps/web/server/_core/__tests__/mcpSecurityFixes.test.ts`
  - `apps/web/server/_core/__tests__/mcpRoutesOrchestrator.test.ts`
- delegated worker and knowledge tests already exist under:
  - `apps/web/server/routes/__tests__/workerRuntime.test.ts`
  - `apps/web/server/routes/__tests__/publicKnowledgeApi.test.ts`

This is a strong fit for TDD-first implementation.

## Web research

### Official MCP tools guidance

Source:

- https://modelcontextprotocol.io/specification/2025-06-18/server/tools

Useful findings:

- tools are model-controlled, but the spec still recommends a human in the loop for trust and safety
- servers that support tools declare the `tools` capability and may emit `notifications/tools/list_changed`
- `tools/list` is paginated
- tool definitions can include `inputSchema`, optional `outputSchema`, and metadata
- tool annotations must be treated as untrusted unless they come from trusted servers
- servers must validate inputs, enforce access control, rate limit invocations, and sanitize outputs

Implication for Feature 074:

- SmartSpecPro should not only make tools executable; it should make them truthful, policy-controlled, and operator-visible
- output schemas and structured content are worth adding where wrappers return durable objects such as jobs, tasks, artifacts, or status handles

### Official MCP resources guidance

Source:

- https://modelcontextprotocol.io/specification/2025-06-18/server/resources

Useful findings:

- resources are application-driven rather than necessarily model-driven
- `resources` is a separate capability from `tools`
- resources can support listing, reading, templates, subscriptions, and list-changed notifications
- resources are identified by URIs and are meant for contextual data access

Implication for Feature 074:

- resources should not be promised automatically just because SmartSpecPro has Library/RAG data
- if added later, resources should follow a deliberate owner-bound design rather than being implied by tool parity

### Official MCP prompts guidance

Source:

- https://modelcontextprotocol.io/specification/2025-06-18/server/prompts

Useful findings:

- prompts are explicitly user-controlled
- `prompts` is a separate capability from tools/resources
- prompt retrieval is different from tool execution and is intended for discoverable templates

Implication for Feature 074:

- prompts should remain optional and gated; the spec is correct not to promise prompt parity in the first pass
- OpenAPI + delegated manifest + truthful `tools/list` are more important for this feature than rushing prompt support

## Planning implications

The implementation plan should assume:

1. `/v1/mcp` stays canonical
2. delegated worker MCP must reuse Feature 072 delegated sessions and grants
3. placeholder MCP tools should be hidden before they are expanded
4. legacy MCP behavior should be migrated through adapters rather than duplicated
5. HTTP remains the stronger product truth even after MCP completion work begins
6. TDD should focus first on discovery truth, delegated-worker auth, billing/grant correctness, and family-by-family execution parity
