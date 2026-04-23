<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --prefix apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-context-contract-and-state-model
section-02-retrieval-routing-and-hybrid-ranking
section-03-context-assembly-and-compaction
section-04-tools-mcp-provenance-and-lifecycle
section-05-chat-team-integration-and-access-control
section-06-evals-monitoring-and-rollout
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-context-contract-and-state-model | - | 02, 03, 04, 05, 06 | No |
| section-02-retrieval-routing-and-hybrid-ranking | 01 | 03, 04, 05, 06 | No |
| section-03-context-assembly-and-compaction | 01, 02 | 04, 05, 06 | No |
| section-04-tools-mcp-provenance-and-lifecycle | 01, 03 | 05, 06 | Yes |
| section-05-chat-team-integration-and-access-control | 01, 03, 04 | 06 | No |
| section-06-evals-monitoring-and-rollout | 01, 02, 03, 04, 05 | - | No |

## Execution Order

1. `section-01-context-contract-and-state-model`
2. `section-02-retrieval-routing-and-hybrid-ranking`
3. `section-03-context-assembly-and-compaction`
4. `section-04-tools-mcp-provenance-and-lifecycle`
5. `section-05-chat-team-integration-and-access-control`
6. `section-06-evals-monitoring-and-rollout`

## Section Summaries

### section-01-context-contract-and-state-model

Define shared context state tiers, provenance fields, pack slots, and deterministic helpers for Chat and Team.

### section-02-retrieval-routing-and-hybrid-ranking

Implement intent-aware retrieval routing and deterministic hybrid ranking across lexical, structured, graph, and semantic sources.

### section-03-context-assembly-and-compaction

Build structured context packs, explicit budget splits, rolling summaries, promotion, pruning, and tool-result clearing.

### section-04-tools-mcp-provenance-and-lifecycle

Treat tools, MCP resources, prompts, and write flows as first-class context sources with bounded provenance and trust.

### section-05-chat-team-integration-and-access-control

Wire the shared context engine into Chat and Team with strict access control and parity between surfaces.

### section-06-evals-monitoring-and-rollout

Record retrieval, grounding, latency, stale-context, and parity metrics; expose safe rollout and evaluation surfaces.
