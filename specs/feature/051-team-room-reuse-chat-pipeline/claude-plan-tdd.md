# TDD Plan: Team Room Reuse Chat Pipeline

Testing framework: **Vitest** (TypeScript), **pytest** (Python cleanup verification)

## Section 1: Skill Detection for Agent Turns

### File: `apps/web/server/services/__tests__/roomIntentRouter.enhanced.test.ts`

```typescript
describe("routeRoomIntent — assistant origin skill detection", () => {
  it("should call detectSkill for assistant origin (not skip)")
  it("should return detected skill when confidence >= 0.6")
  it("should fall back when confidence < 0.6")
  it("should not return team-discussion-assistant as selectedSkillId")
  it("should detect Thai-capable skill for Thai objective")
  it("should detect English skill for English objective")
  it("should still handle explicit agency signal for all origins")
})
```

**Mocking strategy:** Mock `detectSkill` to return controlled results. Test the routing logic, not detection itself (detection has its own tests).

---

## Section 2: Enhanced Prompt Composer

### File: `apps/web/server/services/__tests__/promptComposer.enhanced.test.ts`

```typescript
describe("composePrompt — persona segments", () => {
  it("should call buildPersonaPromptSegments when persona exists")
  it("should include styleInstructions in system messages")
  it("should include restrictionsBulletPoints in system messages")
  it("should include Thai gender particles from persona")
  it("should stay within PERSONA_BUDGET token limit")
})

describe("composePrompt — entity memory injection", () => {
  it("should call getEntityMemories with run initiator's userId")
  it("should merge entity memories with scoped memories")
  it("should prioritize scoped memories over entity memories")
  it("should stay within MEMORY_BUDGET token limit")
  it("should handle empty entity memories gracefully")
})

describe("composePrompt — multi-turn history", () => {
  it("should use display names (not UUIDs) for assistant messages")
  it("should preserve role structure (system/user/assistant)")
  it("should not flatten messages into a single string")
  it("should handle empty history gracefully")
})
```

**Mocking strategy:** Mock DB queries (Drizzle), `buildPersonaPromptSegments`, `getEntityMemories`, `retrieveForPrompt`. Test message array structure and token budget compliance.

---

## Section 3: Refactored Skill Executor

### File: `apps/web/server/services/__tests__/teamRunSkillExecutor.test.ts`

```typescript
describe("executeTeamRunSkillTurn", () => {
  it("should call executeSkillLlmWithFallback (not Python bridge)")
  it("should use detected skill's systemPrompt in messages")
  it("should pass multi-turn messages array (not flattened string)")
  it("should return inputTokens and outputTokens as flat fields")
  it("should include skillId in result metadata")
})

describe("executeTeamRunSkillTurn — skill resolution", () => {
  it("should use route.selectedSkillId when available")
  it("should fall back to general skill when selectedSkillId not found")
  it("should throw when no skill can be resolved")
})

describe("executeTeamRunSkillTurn — no Python dependency", () => {
  it("should not import teamOrchestrationBridge")
  it("should not call executeAgentTurn")
})
```

**Mocking strategy:** Mock `composePrompt`, `executeSkillLlmWithFallback`, `getSkillByIdAsync`. Verify correct function calls and message structure.

---

## Section 4: Python Removal Verification

### File: `python-backend/tests/test_team_orchestrator_removal.py` (temporary)

```python
class TestOrchestratorRemoved:
    def test_execute_turn_endpoint_removed():
        """Verify /api/team-orchestrator/execute-turn returns 404"""

    def test_generate_summary_still_works():
        """If kept, verify /api/team-orchestrator/generate-summary still responds"""

    def test_no_orchestrator_service_import():
        """Verify team_orchestrator.py is not imported anywhere"""
```

After confirming removal, these tests can be deleted.

---

## Section 5: Migration

### File: `apps/web/server/services/__tests__/runEngine.migration.test.ts`

```typescript
describe("migration — stop old runs", () => {
  it("should set running runs to stopped with migration reason")
  it("should set paused runs to stopped with migration reason")
  it("should not affect already stopped/completed runs")
  it("should log count of affected runs")
})
```

---

## Section 6: Integration Tests

### File: `apps/web/server/services/__tests__/teamRunIntegration.test.ts`

```typescript
describe("Team Room end-to-end flow", () => {
  it("should detect skill from Thai objective")
  it("should produce Thai response for Thai objective")
  it("should produce English response for English objective")
  it("should include persona style instructions in LLM messages")
  it("should include entity memories in LLM messages")
  it("should not repeat content across consecutive agent turns")
  it("should preserve multi-turn message structure to LLM")
})
```

**Mocking strategy:** Mock LLM call (`executeWithFallback`) to return controlled responses. Verify the messages array sent to it has correct structure, language, and persona context.

---

## Test Execution Order

1. Section 1 tests (skill detection routing) — no dependencies
2. Section 2 tests (prompt composer) — no dependencies
3. Section 3 tests (skill executor) — after sections 1+2 implemented
4. Section 4 tests (Python removal) — after section 3
5. Section 5 tests (migration) — after section 4
6. Section 6 tests (integration) — after all sections

Run with: `cd apps/web && pnpm vitest run server/services/__tests__/teamRun*.test.ts server/services/__tests__/promptComposer*.test.ts server/services/__tests__/roomIntentRouter*.test.ts`
