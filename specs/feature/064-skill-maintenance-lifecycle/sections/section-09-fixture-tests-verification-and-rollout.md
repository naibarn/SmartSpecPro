# Section 09: Fixture Tests, Verification, and Rollout

## Goal

Finish the maintenance lifecycle with strong verification loops, fixture coverage, and rollout guidance.

## Files to Create

- `apps/web/server/services/__tests__/skillMaintenanceRegression.test.ts`
- fixture assets under maintenance test directories as needed

## Files to Modify

- tests across `apps/web/server/services`, `apps/web/server/routers`, `apps/web/client/src/pages`, and `apps/web/skills/intelligence-skill-creator/tests`

## TDD - Tests to Write First

- apply flow runs baseline and post-change verification
- recommendation queue remains accurate after apply/dismiss cycles
- migrated GenJS skills pass bundle-aware fixture tests
- orchestration config survives edit/save/reload
- scheduled sweeps do not auto-apply blocked recommendations

## Implementation Guidance

1. Add fixture tests for:
   - classic skills
   - GenJS bundle skills
   - contract snapshot comparisons
2. Add regression tests for Admin Skills queue behavior.
3. Document rollout rules and safe auto-apply boundaries in follow-up review docs if needed.

## Compatibility Constraints

- final rollout should default to analyze-only until confidence is established
- public skills require the strongest verification posture
