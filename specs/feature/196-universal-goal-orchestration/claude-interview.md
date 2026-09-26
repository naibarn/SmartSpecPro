# Feature 196 Interview

## Decisions

- Feature 196 follows 195 and owns Goal/Plan/Capability/Command semantics.
- LangGraph remains system orchestration; OpenAI Agents SDK is a cognitive executor behind platform policy.
- Capability resolution is the only governed route to MCP and External Agent execution.
- Plans are immutable revisions with actor/tenant-scoped approvals and explainability.
- No retired Agency/work request/workpack/`/workflows`/OpenSandbox/Docker path may be introduced.

## Cross-spec contract

Feature 196 consumes Feature 195 Job handles and provides normalized plans, capability requirements, approval and command contracts to Runner, Chat, MCP and External Agent surfaces.

