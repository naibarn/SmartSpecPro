# Consolidated Fix Plan — 22 Items

## Critical Fixes (8)

1. **Prompt Injection Hardening** → Update sections 03, 04, 09
   - User message MUST be in HumanMessage role, never interpolated
   - Add instruction hardening in system prompts
   - Strip known injection patterns

2. **confirmOrchestration Auth Guards** → Update sections 05, 11
   - Validate skillId vs userSkillVisibility
   - Verify conversationId ownership
   - Client traceId = audit only

3. **inputMapping Allowlist** → Update section 06
   - Replace free-form dot-notation with explicit field allowlist
   - Cap depth at 2 levels
   - No lodash.get or eval

4. **Agent Loop Per-Iteration Auth** → Update sections 02, 07
   - Pre-filter catalog by user visibility
   - Check userSkillVisibility before each executeSkill()

5. **Feature Flag String Value** → Update sections 01, 05
   - Add getTenantFeatureFlagValue() for string flags
   - Section 05 calls new function for maxLevel

6. **SkillDefinition Lookup** → Update sections 05, 06, 07
   - Every executeSkill() call site must getSkillByIdAsync() first

7. **Server-Side Credit Estimate** → Update sections 01, 05
   - Remove estimatedCreditCost from ClassificationResult
   - Calculate server-side using pricingCalculator

8. **Prompt Field Mapping** → Update sections 04, 05, 06
   - Define mapping: schema's primary text field → SkillExecutionParams.prompt

## Recommended Fixes (14)

9. Credit reservation → Update section 05
10. UI-safe schema projection → Update sections 04, 05, 11
11. Params size limit → Update section 11
12. conversationId toString → Update section 06
13. Object.keys fix → Update sections 04, 05
14. buildExecParams type safety → Update section 06
15. Conversation context sanitization → Update section 03
16. userSkillVisibility filter on catalog → Update section 02
17. Agency routing clarification → Update section 05
18. Category groups from DB → Update section 02
19. Integration test mock fix → Update section 12
20. Error envelope → Update section 01
21. orchestration_classify sourceType → Update section 05
22. messages table storage format → Update section 11
