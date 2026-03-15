# Section 03 — Code Review Interview

## Auto-fixes Applied

### FIX-1: runPlanner defensive .catch() in generateAIDraft (HIGH)
- **Issue:** runPlanner call in aiPresentationService.ts not wrapped in .catch()
- **Fix:** Added `.catch(() => null)` — belt-and-suspenders pattern
- **Risk:** None — runPlanner already has internal try/catch

### FIX-2: runPlanner defensive .catch() in responsesRoutes (HIGH)
- **Issue:** runPlanner call in responsesRoutes.ts not wrapped in .catch()
- **Fix:** Added `.catch(() => null)` — same pattern
- **Risk:** None

### FIX-3: Model name in step recording (MEDIUM)
- **Issue:** Step recording in Responses API used `requestedModelId` instead of effective model
- **Fix:** Changed to `plannerResult.resolvedModel ?? requestedModelId`
- **Risk:** None — uses planner's resolved model when available

## Items Let Go

- **Only 2 invokeSkillTextLLM sites:** Only 2 call sites exist in generateAIDraft, both wired
- **costUsd type coercion:** Works correctly, consistent with existing patterns
- **No durationMs in invokeSkillTextLLM:** Not required by plan, low impact
- **Shallow test coverage:** Tests cover the new functions; artifact classification covered separately
