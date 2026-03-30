# Section 03: Single-Skill Advice API

## Goal

Expose a first-class API for running and reviewing maintenance analysis on one skill at a time.

## Files to Create

- `apps/web/server/services/skillUpgradePlanner.ts`
- `apps/web/server/routers/__tests__/skills.maintenance.test.ts`

## Files to Modify

- `apps/web/server/routers/skills.ts`

## TDD - Tests to Write First

- `analyzeUpgrade` creates a recommendation record
- `listUpgradeRecommendations` returns recommendations filtered by skill/status
- `getUpgradeRecommendationDetail` returns detailed recommendation payload
- `dismissUpgradeRecommendation` marks recommendation dismissed

## Implementation Guidance

Add new procedures to `skills.ts`:

- `analyzeUpgrade`
- `listUpgradeRecommendations`
- `getUpgradeRecommendationDetail`
- `dismissUpgradeRecommendation`

The API should:

1. resolve the skill
2. run the analyzer
3. persist recommendations and run records
4. return structured detail to the admin UI

## Compatibility Constraints

- existing `skills` router behavior must remain unchanged
- analysis must be admin-only unless explicitly broadened later
