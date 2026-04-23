# Feature 099: Context Engineering Ready Chat And Team

## TDD order

1. Add tests for the context-pack contract.
2. Add tests for intent classification and retrieval routing.
3. Add tests for hybrid ranking and deduplication.
4. Add tests for Chat and Team budget profiles.
5. Add tests for compaction, promotion, pruning, and tool-result clearing.
6. Add tests for tool / MCP provenance and safety rules.
7. Add tests for access control and prompt-injection boundaries.
8. Add tests for retrieval, grounding, and stale-context metrics.
9. Add parity tests that compare Chat and Team on the same task class.

## Required test coverage

### Context pack

- pack includes the expected slots for each surface
- pack respects token budget limits
- pack includes explainability metadata for every selected item

### Retrieval

- lexical, structured, graph, and semantic sources can all contribute
- hybrid ranking is deterministic and stable for the same inputs
- duplicate results are removed before assembly
- stale or low-trust items are downgraded or excluded

### Compaction

- rolling summaries are produced when thresholds are crossed
- tool results are cleared or summarized after promotion
- durable memory promotion is explicit and policy-aware
- pruning does not remove required audit evidence

### Tools / MCP

- search / read results are traceable and bounded
- write results produce durable refs instead of raw prompt bloat
- unsafe tool output is treated as untrusted content
- tool outputs cannot overwrite policy or system slots

### Access control

- tenant / project / room / run access is enforced before retrieval or promotion
- same-tenant unrelated users cannot inspect or mutate another room's context state
- prompt-injection content cannot be promoted into durable memory or policy slots
- tool-provided notes remain untrusted until explicitly validated

### Chat / Team parity

- Chat and Team can use the same context sources for the same work class
- surface-specific defaults differ, but the core context contract stays the same
- Team guided rooms and automation-led execution both use the shared engine

### Metrics

- context pack build latency is recorded
- retrieval latency is recorded
- stale-context rate is recorded
- grounding / tool-use evals can be exported for comparison
- metric exports include surface, intent, pack id, retrieval recipe, and budget profile
