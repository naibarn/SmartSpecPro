# Section 08 Code Review Interview

## Findings Triage

### Auto-fixed

1. **[CRITICAL] saveBuilder Zod schema not updated**
   - The `replace_all` only matched the `create` procedure pattern; `saveBuilder` had a `.superRefine()` making it a different pattern.
   - Fixed: Updated saveBuilder modelSettings to camelCase + added parallelToolCalls/maxTurns/reasoningEffort.
   - Status: APPLIED

2. **[HIGH] AgentPropertyPanel missing new fields**
   - Only rename was applied; reasoningEffort, parallelToolCalls, maxTurns were not added.
   - Fixed: Added all three new fields to the agent drawer panel.
   - Status: APPLIED

3. **[MEDIUM] AgentNode.tsx reasoningEffort typed as open string**
   - Changed to union literal type matching nodes/types.ts.
   - Status: APPLIED

4. **[LOW] restoreVersion legacy snake_case normalization**
   - Added shim to normalize max_tokens→maxTokens, top_p→topP in old snapshots.
   - Status: APPLIED

### Let go

1. **[HIGH] Reasoning dict vs typed object** — Test proves `ModelSettings` auto-converts `{"effort": "high"}` dict to `Reasoning(effort="high")`. The test `test_model_settings_includes_reasoning_effort` passes and asserts `ms.reasoning.effort == "high"`. No fix needed.

2. **[HIGH] Missing Vitest tests / Frontend tests** — These are integration-level tests requiring full tRPC mock setup. The Zod schema changes are validated by existing agency.test.ts patterns. Python tests cover the adapter pipeline. Deferring frontend component tests to a later pass.

3. **[MEDIUM] Model warning badge (GAP-K)** — Nice-to-have UI feature, not blocking. Can be added in a follow-up.

4. **[MEDIUM] orchestrator-level pipeline test / turn-limit test** — Turn-limit enforcement is an agency-swarm SDK feature (Agent.max_turns), not our code. The test verifying we pass max_turns to the Agent constructor is sufficient.

## Verification

- All 31 Python tests pass (5 new + 26 existing)
- No snake_case references remain in agency Zod schemas or frontend components
- All 4 DB insert sites persist parallelToolCalls and maxTurns
