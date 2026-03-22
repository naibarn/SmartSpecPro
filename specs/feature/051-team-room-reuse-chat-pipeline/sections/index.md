<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: cd apps/web && pnpm vitest run
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-skill-detection
section-02-prompt-composer
section-03-skill-executor
section-04-remove-python
section-05-migration-cleanup
section-06-testing
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-skill-detection | - | section-03 | Yes |
| section-02-prompt-composer | - | section-03 | Yes |
| section-03-skill-executor | section-01, section-02 | section-04 | No |
| section-04-remove-python | section-03 | section-05 | No |
| section-05-migration-cleanup | section-04 | section-06 | No |
| section-06-testing | section-01, section-02, section-03 | - | Partial |

## Execution Order

1. **Batch 1** (parallel): section-01-skill-detection, section-02-prompt-composer
2. **Batch 2** (sequential): section-03-skill-executor (depends on 01+02)
3. **Batch 3** (sequential): section-04-remove-python (depends on 03)
4. **Batch 4** (sequential): section-05-migration-cleanup (depends on 04)
5. **Batch 5** (sequential): section-06-testing (depends on all above)

## Section Summaries

### section-01-skill-detection
Enable `detectSkill()` for assistant-origin messages in `roomIntentRouter.ts`. Remove early return that skips detection. Add fallback for when no skill detected.

**Files:** `apps/web/server/services/roomIntentRouter.ts`
**Tests:** `apps/web/server/services/__tests__/roomIntentRouter.enhanced.test.ts`

### section-02-prompt-composer
Enhance `composePrompt()` to use full persona segments (`buildPersonaPromptSegments`), inject entity memories (`getEntityMemories`), and preserve multi-turn history with display names.

**Files:** `apps/web/server/services/promptComposer.ts`
**Tests:** `apps/web/server/services/__tests__/promptComposer.enhanced.test.ts`

### section-03-skill-executor
Refactor `executeTeamRunSkillTurn()` to always use Node.js LLM path. Remove Python bridge routes (agency, non-LLM). Use detected skill's prompt. Pass multi-turn messages.

**Files:** `apps/web/server/services/teamRunSkillExecutor.ts`
**Tests:** `apps/web/server/services/__tests__/teamRunSkillExecutor.test.ts`

### section-04-remove-python
Remove Python team_orchestrator endpoint, bridge file, and related code. Clean up imports and CSRF exemptions.

**Files:**
- Remove: `apps/web/server/services/teamOrchestrationBridge.ts`
- Remove: `python-backend/app/services/team_orchestrator.py`
- Remove: `python-backend/app/api/team_orchestrator_api.py` (execute-turn)
- Remove: `python-backend/app/core/rate_limit.py`
- Modify: `python-backend/app/main.py`, `python-backend/app/core/csrf.py`
- Modify: `apps/web/server/services/runEngine.ts`

### section-05-migration-cleanup
Stop old running/paused runs. Remove `team-discussion-assistant` from internal skills. Clean up dead references.

**Files:**
- `apps/web/server/services/internalSkills.ts`
- `apps/web/drizzle/` (migration SQL to stop old runs)
- `apps/web/server/services/runEngine.ts` (startup cleanup)

### section-06-testing
Write comprehensive tests for all modified code. Verify existing tests pass. Manual verification checklist.

**Files:** Multiple test files (see TDD plan)
