# Feature 196 Research

## Research decision

- Codebase: required; inspect current LangGraph/OpenAI Agents runtime, capability catalog, routers and worker gateway.
- Web topics: OpenAI Agents SDK orchestration/guardrails/tracing and Cloudflare execution handoff patterns.
- Testing: focused Web Vitest and Python pytest contracts; no whole-repository typecheck.
- SocratiCode: unavailable; targeted shell discovery is recorded as the fallback.

## Codebase findings

- Current Python runtime is under `python-backend/app/orchestrator`, OpenAI Agents contracts and internal runtime routers; Web orchestration services live under `apps/web/server/services/agentRuntime` and related routers.
- `orchestratorCapabilityCatalogService.ts` already filters retired Agency/workflow surfaces and is the reuse point for capability inventory.
- `worker_jobs`/outbox from Feature 195 is the only valid durable execution handoff. Existing `external_agent_task` is an adapter/job type, not a new Goal/Plan database.
- Current Chat and skill routes provide integration patterns but no complete dedicated Goal/Plan/Offer graph; plan the smallest additive tables/services with tenant indexes and revision fencing.

## External research

- OpenAI Agents SDK centers on Agents, tools, handoffs, guardrails, sessions and tracing; use it as a cognitive executor while retaining platform-owned orchestration and policy. See https://openai.github.io/openai-agents-python/ and https://openai.github.io/openai-agents-python/tools/.
- The SDK distinguishes managed agent loops from direct Responses API control; Feature 196 should keep deterministic routing and durable state outside the SDK. See https://openai.github.io/openai-agents-python/quickstart/.

## Planning implications

Define stable Command/Goal/Plan/Capability types and policy gates before planner implementation. Plan revisions must be immutable, approvals must be actor/tenant scoped, and Job submission must call Feature 195 rather than dispatching provider/runtime code directly.

