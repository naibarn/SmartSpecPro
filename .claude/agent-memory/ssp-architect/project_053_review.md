---
name: 053-agency-agentic-intelligence spec review
description: Architecture review findings for spec 053 — ReAct executor, working memory, autonomous agent, long-term memory. Key feasibility issues and schema problems noted for future reference.
type: project
---

Spec 053 reviewed 2026-03-22 at version 1.0 (Proposed).

**Why:** Feasibility review before implementation. Depends on spec 052.

**Key findings:**

- CRITICAL: `agency_agent_memories.tenant_id` declared as INTEGER in spec SQL but `tenants.id` is VARCHAR(36). FK type mismatch — will fail migration.
- CRITICAL: ReActExecutor calls `_call_llm()` directly without going through AgencySwarmAdapter → bypasses credit deduction, rate limiting, audit logging, and the Node.js gateway. Must route through adapter or the gateway's OpenAI-compatible endpoint.
- HIGH: Double-loop risk between Level 2 ReAct loop and agency-swarm's internal tool-calling loop. agency-swarm already runs its own Thought→Action→Observation loop internally. Running ReActExecutor on top creates two nested loops each consuming credits independently.
- HIGH: Level 1 reflection cycle detection (`[FINAL ANSWER]`, `[COMPLETE]`, `{"status":"complete"}`) is fragile — no prompt injection defense. An adversarial user input containing `[COMPLETE]` will short-circuit the loop.
- HIGH: Crash recovery via Redis only works if Redis survives the crash. Redis is not durably persistent by default. If the Celery worker crashes and Redis is also lost, recovery fails silently.
- MEDIUM: Token budget tracking mid-stream is approximate only — streaming responses consume tokens before the budget check runs. The spec claims real-time tracking but this is not achievable with streaming.
- MEDIUM: Level 3 autonomous agent delegation calls other agency nodes via communication flows, which goes back through the orchestrator's graph walker. This creates recursion: orchestrator → autonomous_agent → orchestrator. No recursion depth guard specified.
- MEDIUM: Long-term memory `load_relevant_memories()` uses ORDER BY confidence DESC without keyword filtering — this loads top-N memories regardless of relevance. Could inject irrelevant constraints into unrelated tasks.
- LOW: `loop_retry` is listed as an 052 feature but is NOT yet implemented in agency_orchestrator.py (no `loop_retry` case in the node type match). Spec 053 references it as a dependency. Needs verification before Level 2 build.

**How to apply:** When implementing 053, flag these issues before starting each phase.
