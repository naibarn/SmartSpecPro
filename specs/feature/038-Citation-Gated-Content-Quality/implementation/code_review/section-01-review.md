# Section 01 Code Review — Skill Schema Enhancement

## HIGH SEVERITY

### 1. Execution policy validation is dead code
`parseExecutionPolicyContentFields()` result is computed but never written back to `metadata.execution_policy`. Invalid enum values persist on the raw YAML object.

### 2. `__warnings` smuggling via `any` cast
Warnings smuggled via `__warnings` property with `any` cast. Should return `{ policy, warnings }` tuple like `parseContentQuality`.

## MEDIUM SEVERITY

### 3. Tests in wrong location
Plan says `packages/skills/src/__tests__/` but tests are in `apps/web/server/services/`.

### 4. snake_case on camelCase interface
New fields use snake_case but existing `SkillExecutionPolicyConfig` uses camelCase.

### 5. Invalid field drops entire content_quality
When only invalid fields present, entire object becomes undefined silently.

### 6. No integer validation for refresh_cadence_days
Accepts floats and unreasonable values.

### 7. No upper bound for max_tokens_hint
Accepts absurd values without warning.

## LOW SEVERITY

### 8. Return type mismatch on parseExecutionPolicyContentFields
### 9. Function name misleading — only handles 6 fields
### 10. No explicit re-export verification test
