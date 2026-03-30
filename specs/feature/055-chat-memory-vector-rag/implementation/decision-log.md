# Decision Log — Feature 055 Chat Memory Retrieval Upgrade

## Decision 1

- Depth: `standard`
- Reason: this is cross-cutting across chat, memory, and tests, but the major infrastructure already exists in the codebase.
- Result: keep the plan focused on orchestration and policy rather than new subsystem invention.

## Decision 2

- Approach: server-owned retrieval-first chat context assembly.
- Reason: `ChatView` already asks the server for context; adding client-side vector search would duplicate logic and increase drift.
- Result: improve the server pipeline so every chat turn receives the right memories before the model is called.

## Decision 3

- Retrieval behavior: adaptive depth, not unconditional heavy search.
- Reason: always searching everything would add latency and prompt noise.
- Result: use persona and rule memories first, then session/summary context, then long-term and vector results based on relevance and budget.

## Decision 4

- Scope boundary: keep the main chat flow and agency/skill context flows separate.
- Reason: agency flows already have their own context builder and should not be forced into the same retrieval contract without a clear regression plan.
- Result: update the primary chat path first and preserve other paths unless tests show shared code needs a follow-up.
