# Section 01: Shared Context Contract and State Model

## Goal

Define the shared context-engine data model and state tiers that both Chat and Team must use. This section creates the contract that later sections will retrieve, pack, compact, and evaluate.

## Dependencies

- Feature 099 spec and plan
- Existing Chat memory, Team prompt composition, scoped memory, and room memory services

## Files to Create or Modify

- Create `apps/web/shared/contextEngine.ts`
- Create `apps/web/shared/__tests__/contextEngine.test.ts`
- Modify `apps/web/server/services/contextEngineAdapter.ts`
- Modify `apps/web/server/services/memoryService.ts`
- Modify `apps/web/server/services/scopedMemoryService.ts`
- Modify `apps/web/server/services/teamRoomMemoryService.ts`
- Modify `apps/web/server/services/promptComposer.ts`
- Modify `apps/web/server/services/executors/contextBuilder.ts`
- Create `apps/web/server/services/__tests__/contextEngineState.test.ts`

## TDD First

Write failing tests for:

- shared state tier literals and unions
- pack slot literals for session state, project state, durable memory, working summaries, notes, tool results, and evidence
- provenance / trust / freshness fields on every selected context item
- `build_context_pack()` returns a structured pack and not a flattened prompt string
- same inputs produce the same state classification and pack metadata
- state promotion helpers reject items with missing scope or trust metadata

## Contract Design

`apps/web/shared/contextEngine.ts` must export:

- state tier constants and union types
- retrieval source constants and union types
- pack slot constants and union types
- trust level and freshness annotations
- structured interfaces for context items, packs, and provenance
- helper functions for terminal / promotable / prunable state decisions

The contract must support:

- session state
- project state
- durable memory
- working summaries
- active notes
- recent notes
- tool results
- retrieved evidence

Every selected item must carry:

- owner scope
- source ref
- trust level
- freshness / age
- inclusion reason
- promotion or pruning reason when applicable

## Security Requirements

- tenant / project / room / run access must be enforced before reading or promoting context
- same-tenant unrelated users must not be able to see or mutate another room's context state
- tool output is untrusted until validated
- prompt-injection content must never become policy or system context

## Acceptance Criteria

- Chat and Team can serialize the same normalized context state.
- The contract explicitly distinguishes session, project, durable, and working-summary state.
- Provenance exists for every selected context item.
- Promotion and pruning decisions are deterministic and testable.

## Recommended Verification

Run:

```bash
npm --prefix apps/web test -- shared/__tests__/contextEngine.test.ts server/services/__tests__/contextEngineState.test.ts
npm --prefix apps/web run check
```
