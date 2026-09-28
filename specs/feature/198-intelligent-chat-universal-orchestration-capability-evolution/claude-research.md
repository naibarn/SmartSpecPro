# Feature 198 Research

## Research decision

- Codebase: required; inspect `/chat`, Assistant components, LangGraph runtime, MCP registry, retrieval/help and worker-job adapters.
- Web topics: OpenAI Agents tools/tracing and UI async/accessibility conventions are secondary to existing product patterns.
- Testing: React/jsdom/Vitest for components, Web service/router tests, Python runtime tests and browser evidence for route workflows; no whole-repository typecheck.
- SocratiCode: unavailable; use targeted `rg` and narrow file reads.

## Codebase findings

- `/chat` is registered in `apps/web/client/src/App.tsx`; current Chat components and `McpConnectPanel`/settings panels are reusable interaction patterns.
- LangGraph and OpenAI Agents runtime foundations exist in Python; Web agent-runtime services and `worker_jobs` projections already provide partial lifecycle pieces.
- Help corpus and retrieval code are existing authority surfaces. Derived context must preserve tenant ACL and provenance; Vectorize state must be verified from provider/runtime code, not stale summaries.
- Current capability catalog intentionally excludes retired Agency/workflow surfaces. Do not recreate those routes.

## External research

- OpenAI Agents SDK supports tools, handoffs, guardrails, sessions and tracing; Chat should present platform-owned plan/approval/task state rather than expose SDK internals. See https://openai.github.io/openai-agents-python/.

## Planning implications

Implement backend request/state contracts before UI. UI plans must include existing-pattern reuse, state/responsive/accessibility/copy matrices and browser evidence. Long results become bounded previews plus authorized artifacts; disconnect rehydrates from canonical Job events.

