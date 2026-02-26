# Section 04 Interview Transcript

## Auto-fixes (applied without asking)
- #1: `ensureAIGenerationEnabled()` — changed error code from `AI_GENERATION_FAILED` to `FEATURE_DISABLED` for semantic correctness (disabled feature ≠ generation failure, and FEATURE_DISABLED maps to 403 FORBIDDEN instead of 500)

## Let go (not worth the change)
- #2: Dead code — `ensureAIGenerationEnabled()` not called yet (section-07 will consume it)
- #3: Unrelated schema changes in diff (from sections 01/03, harmless)
- #4: `vi` import removed from test (correct, not used)
- #5: Test isolation concern (theoretical, vitest isolates by default)
