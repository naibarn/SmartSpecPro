# Section 08: Orchestration Config in Admin Edit

## Goal

Expose downstream handoff and swarm orchestration settings in the Admin Skills editor.

## Files to Create

- `apps/web/client/src/components/admin/SkillOrchestrationConfigPanel.tsx`
- `apps/web/client/src/components/admin/__tests__/SkillOrchestrationConfigPanel.test.tsx`

## Files to Modify

- `apps/web/client/src/pages/AdminSkills.tsx`
- `apps/web/server/routers/skills.ts`
- `apps/web/drizzle/schema.ts` or runtime config persistence path as needed

## TDD - Tests to Write First

- edit form shows orchestration mode selector
- skill handoff targets persist correctly
- agency swarm targets persist correctly
- hybrid mode round-trips through save/load
- invalid endpoint or mode combinations are rejected

## Implementation Guidance

1. Add a new section to the edit dialog for:
   - mode
   - default endpoints
   - target arrays
   - parallelism
   - fallback behavior
2. Store runtime config in a clear structured location, preferably `configJson` or `executionPolicyJson` rather than historical tables.
3. Keep orchestration opt-in and explicit.

## Compatibility Constraints

- current edit dialog flows for sandbox and model settings must remain functional
