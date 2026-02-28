# Section 10 Code Review Interview

## Auto-decisions (user preference: auto-decide unless real security concern)

### #1 CRITICAL: Session Leak → AUTO-FIX
**Decision:** Fixed. Moved session creation inline with `try/finally` block that calls `await session.close()`. Added tests for session cleanup on both success and failure.

### #2 CRITICAL: Feature Flag Name → LET GO
**Decision:** Keep using `AGENCY_SWARM_ENABLED`. The granular `AGENCY_WORKFLOW_NODE_ENABLED` flag doesn't exist yet in the config. Adding new config fields is out of scope for this section. The global flag is sufficient for the current phased rollout.

### #3 CRITICAL: Cost Field → AUTO-FIX
**Decision:** Set `cost: 0`. Credits are tracked inside `AgencyService` via `AgencyCreditManager` during execution. The workflow node shouldn't double-count. The `total_tokens` field was misleading.

### #4 MEDIUM: Dead Code → LET GO
**Decision:** `detectSkillWithAgency()` is exported and ready for consumers to wire up in future sections. Not dead code — it's intentionally a standalone function.

### #5 MEDIUM: Feature Flag for Trigger → LET GO
**Decision:** Feature flag enforcement is the caller's responsibility. The pure detection function shouldn't import runtime config.

### #6 MEDIUM: Missing Tests → LET GO
**Decision:** Core detection logic is well-tested (6 tests). Server-side integration wiring is trivial.

### #7 MEDIUM: agency_id Validation → AUTO-FIX
**Decision:** Added UUID format regex validation, matching the pattern used by SkillExecutor's skill_id validation.

### #8 MEDIUM: Import Location → AUTO-FIX
**Decision:** Moved `AgencyTriggerDefinition` and `AgencyDetectionResult` imports to the top of detector.ts with the other imports.

### #9 MEDIUM: Tenant Isolation → AUTO-FIX (SECURITY)
**Decision:** Fixed. Return empty list when `tenant_id` is None. Removed `IS NULL` fallthrough in SQL query.

### #10 LOW: Unused Import → AUTO-FIX
**Decision:** Removed `import os` (replaced with `import re` for UUID validation).

### #11-14 LOW → LET GO

## Tests After Fixes
- Python: 12/12 passed (added 2 new session cleanup tests)
- TypeScript: 6/6 passed
