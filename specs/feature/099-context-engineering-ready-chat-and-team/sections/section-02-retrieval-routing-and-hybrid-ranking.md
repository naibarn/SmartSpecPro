# Section 02: Retrieval Routing and Hybrid Ranking

## Goal

Implement intent-aware retrieval that combines lexical, structured, graph, semantic, and hybrid ranking signals before context packing.

## Dependencies

- Section 01 shared context contract
- Existing memory, scoped-memory, and search services

## Files to Create or Modify

- Create `apps/web/server/services/contextRetrievalService.ts`
- Create `apps/web/server/services/contextRetrievalRanker.ts`
- Modify `apps/web/server/services/contextEngineAdapter.ts`
- Modify `apps/web/server/services/memoryService.ts`
- Modify `apps/web/server/services/scopedMemoryService.ts`
- Modify `apps/web/server/services/librarySearchService.ts` if reusable ranking helpers exist
- Create `apps/web/server/services/__tests__/contextRetrievalService.test.ts`
- Create `apps/web/server/services/__tests__/contextRetrievalRanker.test.ts`

## TDD First

Write failing tests for:

- intent classifier selects the correct retrieval recipe for question, task, and work-state turns
- lexical retrieval can return exact ids, names, and terms
- structured retrieval can filter by owner scope, labels, room, team, run, and state fields
- graph retrieval can follow work-item / room / run / artifact / review relationships
- semantic retrieval can surface meaning-based matches
- hybrid ranking is deterministic for the same inputs
- duplicate evidence is removed before assembly
- stale or low-trust items are downgraded or excluded

## Retrieval Design

Retrieval must:

1. classify the query intent
2. choose the retrieval recipe
3. fetch candidates from each enabled source
4. normalize source payloads into shared context items
5. score candidates with trust, freshness, relevance, and utility
6. dedupe and trim to budget
7. record the reason for inclusion or exclusion

The retrieval layer must support:

- lexical search for exact terms and ids
- structured search for state and metadata
- graph traversal for linked work items and artifacts
- semantic similarity for meaning-based matches
- hybrid ranking that combines all of the above

## Security Requirements

- retrieval must enforce tenant, project, room, and run access before returning data
- same-tenant unrelated users must not retrieve context from another room or run
- tool outputs and external notes remain untrusted until validated
- retrieval must not leak raw private URLs, tokens, or policy text

## Acceptance Criteria

- all retrieval modes are available through one shared contract
- ranking is stable and explainable
- duplicates are removed before prompt assembly
- retrieval results carry provenance and trust annotations

## Recommended Verification

Run:

```bash
npm --prefix apps/web test -- server/services/__tests__/contextRetrievalService.test.ts server/services/__tests__/contextRetrievalRanker.test.ts
npm --prefix apps/web run check
```
