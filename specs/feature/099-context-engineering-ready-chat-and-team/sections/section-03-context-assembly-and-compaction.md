# Section 03: Context Assembly and Compaction

## Goal

Build the structured context pack and the compaction lifecycle that keeps prompts small without losing continuity.

## Dependencies

- Section 01 shared context contract
- Section 02 retrieval and ranking

## Files to Create or Modify

- Create `apps/web/server/services/contextPackBuilder.ts`
- Create `apps/web/server/services/contextCompactionService.ts`
- Create `apps/web/server/services/contextBudgetProfiles.ts`
- Modify `apps/web/server/services/promptComposer.ts`
- Modify `apps/web/server/services/executors/contextBuilder.ts`
- Modify `apps/web/server/services/memoryService.ts`
- Modify `apps/web/server/services/teamRoomMemoryService.ts`
- Create `apps/web/server/services/__tests__/contextPackBuilder.test.ts`
- Create `apps/web/server/services/__tests__/contextCompactionService.test.ts`

## TDD First

Write failing tests for:

- pack includes the correct slots for Chat and Team
- budget profiles differ by surface and intent
- active notes and recent notes are injected explicitly
- project state and working summaries are injected explicitly
- pack assembly records inclusion and exclusion reasons
- rolling summaries are produced when thresholds are crossed
- tool results are cleared or summarized after promotion
- pruning never removes the only audit trail
- repeated or duplicate retrieval items are collapsed before packing

## Pack Design

`build_context_pack()` must:

- return structured slots, not a raw concatenated prompt
- reserve explicit budget for policy, active note, recent notes, project state, durable memory, evidence, and tool results
- carry provenance for every slot
- expose a debug explanation for included and excluded items

## Compaction Design

Compaction must be a first-class lifecycle step:

- rolling summary generation
- promotion from transient state to working summary or durable memory
- tool-result clearing after promotion or expiry
- pruning of stale, duplicate, or low-utility items
- retrieval deduplication before packing

## Security Requirements

- tool results cannot overwrite policy or system slots during packing
- compaction must not drop required audit evidence
- pruning must fail closed when trust or scope is unclear

## Acceptance Criteria

- the pack builder is deterministic and explainable
- compaction reduces prompt size without losing required continuity
- working summaries and durable memory are promoted intentionally, not by accident

## Recommended Verification

Run:

```bash
npm --prefix apps/web test -- server/services/__tests__/contextPackBuilder.test.ts server/services/__tests__/contextCompactionService.test.ts
npm --prefix apps/web run check
```
