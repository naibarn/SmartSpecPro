# Feature 200 Research

## Research decision

- Codebase: required; inspect current OpenAI Agents/LangGraph runtime, `external_agent_task`, worker control plane, Tauri Runner, Chat and asset/context services.
- Web topics: OpenAI Agents SDK tools/sessions/tracing/sandbox boundaries, Tauri commands/events and Cloudflare isolated runtime.
- Testing: Web Vitest/jsdom, Python pytest, Rust/Cargo focused tests and browser evidence; never whole-repository typecheck.
- SocratiCode: unavailable; targeted shell discovery is used.

## Codebase findings

- Python runtime foundations include `internal_openai_agents_runtime.py`, `openai_agents_contracts.py`, LangGraph runtime and Job Control Plane routers.
- Web has `agentRuntime` services and `external_agent_task` scheduling/run-engine paths. Reuse these as adapters, not as proof of a complete provider-independent Agent Task/session model.
- Existing agent traces/checkpoints/activity/registry and `worker_jobs` are canonical candidates; proposed coding-agent tables need explicit mapping/migration review.
- Tauri/Rust control foundations and `/workers/connect` exist. Feature 200 must use Feature 197’s shared Runner identity/control channel; no second WebSocket/device registry.

## External research

- OpenAI Agents SDK provides tools, handoffs, guardrails, sessions, tracing and provider-managed result/runtime primitives. Use it behind Feature 196 orchestration and Feature 200 provider adapters. See https://openai.github.io/openai-agents-python/ and https://openai.github.io/openai-agents-python/tools/.
- Sandbox agents are documented as beta and provider/runtime details can change; isolate that volatility behind adapters and retain platform-owned Job/session contracts. See https://openai.github.io/openai-agents-python/sandbox_agents/.
- Tauri commands are async-capable and typed while events are async JSON delivery; use the existing Runner protocol contract rather than treating UI events as durable state. See https://v2.tauri.app/develop/calling-rust/.

## Planning implications

Implement normalized manifest/session/event/result contracts and Job handoff first, then provider adapters, workspace/context/asset/skill mediation, verification and Chat UI. Direct Agent→arbitrary MCP is forbidden; MCP goes through Feature 199.

