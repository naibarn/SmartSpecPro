# Section 04 Code Review

## Summary

The implementation is faithful to the plan. All four planned deliverables are present and correctly implemented: 3 AI error codes in constants, the feature flag function with default-OFF behavior, the availability schema extension, and the router changes. Tests match the plan's specification with 16 test cases. No high-severity issues found.

## Issues Found

### MEDIUM: `ensureAIGenerationEnabled()` uses wrong error code for a 'feature disabled' scenario

**File:** `apps/web/server/routers/presentation.ts`

The guard function throws `AI_GENERATION_FAILED` when AI generation is disabled. This is semantically incorrect — `AI_GENERATION_FAILED` is for pipeline failures (LLM timeout, etc.), not for a disabled feature. The existing `ensureExportWriteEnabled()` uses `FEATURE_DISABLED` for the analogous case. The downstream consequence is that `mapPresentationServiceError` maps `AI_GENERATION_FAILED` to `INTERNAL_SERVER_ERROR` (HTTP 500). A disabled feature returning 500 is misleading — it should return 403 (FORBIDDEN).

### LOW: Dead code — `ensureAIGenerationEnabled()` not called yet
Acceptable forward-looking scaffolding for section-07.

### LOW: Diff includes unrelated schema changes from other sections
The contracts.ts diff includes textShadow/textStroke/svgContent/svgColor from sections 01/03. Harmless.

### LOW: Minor deviation — `vi` import removed from test file
Correct — `vi` is not used in the tests.

### INFORMATIONAL: Test isolation for `process.env` mutation
Tests mutate and clean up via afterEach. Vitest isolates test files by default.

## Verdict

Implementation is correct and complete. The MEDIUM issue (wrong error code in guard) should be auto-fixed.
