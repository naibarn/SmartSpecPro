# Synthesized Specification

## 1. Planning goal

Feature 074 should complete SmartSpecPro’s MCP surface as far as the current backend can realistically support it, while staying truthful about what is production-ready and what still needs implementation work.

The feature builds on:

- Feature 071 for worker control-plane registration and job routing
- Feature 072 for delegated worker sessions, owner-bound grants, user-credit billing, worker budgets, knowledge access, and delegated manifests

## 2. Core product meaning

The worker is a personal delegated operator for the user who registered it. MCP should make that worker more useful, not weaker or more confusing than the existing delegated HTTP path.

The product outcome should be:

- workers can use `/v1/mcp` as a real delegated tool surface
- OpenClaw, ZeroClaw, and similar runtimes can rely on truthful MCP discovery
- workers can still prefer HTTP whenever HTTP remains the stronger contract

## 3. Locked product constraints

### Ownership and tenancy

- workers are personal workers
- the normal add-worker flow is self-service for end users
- delegated MCP access is only for the worker owner
- no cross-user delegation
- no cross-tenant delegation

### Billing

- SmartSpecPro-routed MCP calls charge the owner user’s SmartSpecPro balance
- downstream source types should remain accurate
- external APIs paid directly by the worker with its own credentials stay outside SmartSpecPro billing

### Guardrails

- worker budgets remain in force across hourly, five-hour, daily, weekly, and monthly windows
- delegated job budgets remain in force
- high-risk writes may still require approval or policy enablement
- untrusted content must not widen grants, targets, or budgets

## 4. Current backend truth

### Already real

- `/v1/mcp` protocol shell
- Redis-backed MCP sessions
- `tools/list`, `tools/call`, batch handling, and discovery manifest
- delegated worker sessions outside MCP
- real HTTP APIs for knowledge, media, agencies, presentations, video, jobs, and LLM flows
- legacy MCP implementations for workspace, drive, and orchestrator actions

### Still incomplete

- delegated worker MCP is fail-closed
- many public MCP tools are placeholders or “delegated to /v1” bridge responses
- billing/grant enforcement is weaker in MCP than in delegated HTTP
- knowledge/RAG MCP tools are still missing from the public MCP server
- public and legacy MCP behavior still create split truth

## 5. Required implementation outcomes

### Discovery truth

- `tools/list` only returns tools that can really execute for the current caller
- delegated manifest and MCP discovery do not contradict one another
- a machine-readable MCP catalog exists for developer understanding

### Execution truth

- high-value tool families execute through real service adapters or durable route adapters
- placeholder tools are either implemented or hidden
- long-running operations return durable ids, status references, and safe result handles

### Security truth

- delegated worker sessions stay owner-bound and same-tenant
- grants, budgets, model policy, approvals, concurrency, and replay protection are enforced
- untrusted browser/drive/workspace/Library/RAG content cannot expand permissions
- active-content results follow safe-serving policy

### Product truth

- `/v1/mcp` becomes canonical
- legacy MCP moves toward compatibility-only or migration status
- HTTP remains the primary public contract where it is stronger

## 6. Priority implementation families

The initial completion push should prioritize:

1. gateway wrappers for models, credits, chat, and responses
2. knowledge tools for owner Library and RAG
3. skills and agencies
4. media and jobs
5. presentations and video projects
6. migration of legacy workspace, drive, and orchestrator actions
7. browser MCP only if current browser policy, billing, and concurrency controls can be preserved safely

## 7. Key planning expectations

The implementation plan should be explicit about:

- which files and services will change
- how the canonical MCP tool registry should work
- how delegated auth and grants are enforced in `tools/call`
- how billing and idempotency are kept correct
- how safety and observability are exposed to operators
- how rollout avoids overclaiming parity before the backend is ready
