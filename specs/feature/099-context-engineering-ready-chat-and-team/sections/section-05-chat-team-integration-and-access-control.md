# Section 05: Chat and Team Integration with Access Control

## Goal

Wire the shared context engine into Chat and Team while enforcing the same access model for retrieval, promotion, and mutation.

## Dependencies

- Sections 01 through 04

## Files to Create or Modify

- Modify `apps/web/server/services/memoryService.ts`
- Modify `apps/web/server/services/promptComposer.ts`
- Modify `apps/web/server/services/executors/contextBuilder.ts`
- Modify `apps/web/server/services/teamRoomMemoryService.ts`
- Modify `apps/web/server/services/runEngine.ts`
- Modify `apps/web/server/routers/chat.ts`
- Modify `apps/web/server/routers/teamRoom.ts`
- Modify `apps/web/server/routers/scopedMemory.ts`
- Modify `apps/web/server/services/scopedMemoryService.ts`
- Create `apps/web/server/services/contextAccessPolicy.ts` if a single shared helper is needed
- Create `apps/web/server/services/__tests__/contextAccessPolicy.test.ts`
- Modify or create Chat and Team parity tests

## TDD First

Write failing tests for:

- Chat assembles context through the shared engine before each model call
- Team guided rooms and automation-led execution both use the same core context contract
- surface-specific defaults differ while the contract stays the same
- room language and memory mode flow through the shared contract
- tenant / project / room / run access is enforced before retrieval or promotion
- same-tenant unrelated users cannot mutate or inspect another room's context state
- prompt-injection content cannot modify policy or system context
- guide/manual Team turns remain run-backed instead of write-only logs

## Integration Design

Chat and Team must:

- consume the same structured pack contract
- use surface-specific defaults without diverging on core state semantics
- record which context sources were used
- preserve room language and work continuity

Access control must:

- validate ownership or participation before retrieval
- validate ownership or participation before promotion or mutation
- reject unrelated same-tenant users even if they can guess an id

## Security Requirements

- tenant scope alone is not sufficient authorization
- prompt injection must not affect policy or system slots
- unauthorized callers must not see raw refs, private URLs, or hidden state

## Acceptance Criteria

- Chat and Team behave consistently for the same work class
- the same shared context contract is used by both surfaces
- access checks are enforced before any sensitive context operation

## Recommended Verification

Run:

```bash
npm --prefix apps/web test -- server/services/__tests__/contextAccessPolicy.test.ts
npm --prefix apps/web run check
```
