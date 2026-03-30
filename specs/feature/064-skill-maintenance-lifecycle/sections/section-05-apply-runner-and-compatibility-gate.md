# Section 05: Apply Runner and Compatibility Gate

## Goal

Add a governed apply path that can either produce proposals or apply low-risk upgrades directly, but always verifies compatibility.

## Files to Create

- `apps/web/server/services/skillUpgradeApplier.ts`
- `apps/web/server/services/__tests__/skillUpgradeApplier.test.ts`

## Files to Modify

- `apps/web/server/routers/skills.ts`
- `apps/web/server/services/skillStudioService.ts`

## TDD - Tests to Write First

- low-risk recommendation can be applied and logs a maintenance run
- breaking recommendation is blocked before apply
- proposal-first apply path stores diff/proposal metadata
- verification failure marks run failed and does not mark recommendation applied

## Implementation Guidance

1. Add `applyUpgradeRecommendation` procedure.
2. Support:
   - direct apply for low-risk changes
   - proposal mode for higher-risk changes
3. Reuse `skillStudioService.ts` proposal/apply helpers where practical.
4. Always run:
   - compatibility diff
   - tests
   - fixture checks
   - sandbox smoke checks where required

## Compatibility Constraints

- no apply path may bypass the compatibility gate
- recommendation status must reflect actual outcome
