# Section 01 Code Review Interview

## Auto-fixes Applied
1. **#1 (HIGH)**: Fixed dead code — validated execution_policy fields now written back, invalid enums stripped
2. **#2 (HIGH)**: Refactored `parseExecutionPolicyContentFields` to return `{ fields, warnings }` tuple

## Let Go
- #3: Tests in apps/web is pragmatic (vitest configured there)
- #4: snake_case matches YAML convention, consistent with SkillMetadata pattern
- #5: Correct behavior — undefined when no valid fields
- #6, #7: Over-engineering for hint fields
- #8, #9, #10: Low severity, not worth addressing
