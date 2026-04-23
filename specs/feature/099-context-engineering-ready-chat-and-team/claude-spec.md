# Feature 099: Context Engineering Ready Chat And Team

This feature adds a shared context-engineering layer for Chat and Team.

## What changes

- Replace ad hoc prompt assembly with one shared `build_context_pack()` contract.
- Treat context as a layered system:
  - session state
  - project state
  - durable memory
  - working summaries
- Add hybrid retrieval:
  - lexical
  - structured
  - graph
  - semantic
  - hybrid ranking
- Add intent-aware budget splitting and explicit context slots.
- Add compaction:
  - rolling summary
  - tool result clearing
  - promotion / pruning
  - retrieval deduplication
- Treat tools, MCP resources, and prompts as first-class context sources.
- Add evals and metrics for retrieval quality, grounding, tool use, latency, and stale context.

## Product decision

Do not build a separate memory system for Team.
Do not keep Chat and Team on different context rules.

Instead, build a shared context engine with surface-specific adapters:

- Chat stays conversational and session-heavy.
- Team stays work-oriented and project-heavy.
- Both surfaces use the same context contract, retrieval logic, compaction rules, and evals.

## Safety requirements

- tenant / project / room / run access must be enforced
- tool output must be treated as untrusted until validated
- prompt injection must never reach policy or system slots
- promotion to durable memory must be explainable and policy-aware
