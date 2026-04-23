# Feature 099: Context Engineering Ready Chat And Team

## Plan

### Phase 1 - Shared context contract

- Define the normalized context-state model.
- Add the context-pack schema and slot model.
- Make Chat and Team call one shared pack builder entry point.

### Phase 2 - Hybrid retrieval

- Add query-intent classification.
- Route each query to the right retrieval recipe.
- Combine lexical, structured, graph, and semantic candidates.
- Add deterministic hybrid ranking and dedupe.

### Phase 3 - Context assembly and compaction

- Implement budget profiles by surface and intent.
- Inject active notes, recent notes, and project state explicitly.
- Add rolling summary, pruning, promotion, and tool-result clearing.

### Phase 4 - Tools and MCP

- Treat tools, resources, and prompts as context sources.
- Add read/search/write flows to the context lifecycle.
- Ensure raw tool output cannot silently become trusted memory.

### Phase 5 - Evals and rollout

- Add retrieval evals, grounding evals, and tool-use evals.
- Track latency, stale-context, and dedupe metrics.
- Compare Chat and Team parity before rollout.

## Implementation shape

- Extend Chat memory assembly to consume the shared contract.
- Extend Team prompt composition to consume the same contract.
- Reuse existing memory and scoped-memory stores where possible.
- Add only the missing state / pack / eval surfaces instead of a second parallel system.

## Key risks

- Overfitting the engine to Chat and under-supporting Team, or vice versa.
- Letting tool output bloat the prompt instead of clearing or summarizing it.
- Ranking duplicates or stale items too highly.
- Cross-scope leakage when promotion and retrieval rules are too broad.

## Sectioned implementation backlog

Use the section files in order for deep-implement work:

1. [sections/section-01-context-contract-and-state-model.md](sections/section-01-context-contract-and-state-model.md)
2. [sections/section-02-retrieval-routing-and-hybrid-ranking.md](sections/section-02-retrieval-routing-and-hybrid-ranking.md)
3. [sections/section-03-context-assembly-and-compaction.md](sections/section-03-context-assembly-and-compaction.md)
4. [sections/section-04-tools-mcp-provenance-and-lifecycle.md](sections/section-04-tools-mcp-provenance-and-lifecycle.md)
5. [sections/section-05-chat-team-integration-and-access-control.md](sections/section-05-chat-team-integration-and-access-control.md)
6. [sections/section-06-evals-monitoring-and-rollout.md](sections/section-06-evals-monitoring-and-rollout.md)
