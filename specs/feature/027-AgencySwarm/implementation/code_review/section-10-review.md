# Section 10 Code Review: Workflow Integration

## Critical Issues

### 1. CRITICAL: Database Session Leak in `_get_agency_service()`
The `_get_agency_service()` creates a raw `AsyncSession` that is never closed. Over time this will exhaust the connection pool.

### 2. CRITICAL: Wrong Feature Flag Name -- Plan vs. Implementation Mismatch
Plan specifies `AGENCY_WORKFLOW_NODE_ENABLED` (granular per-subsystem flag). Implementation uses `AGENCY_SWARM_ENABLED` (global kill-switch).

### 3. CRITICAL: `cost` Field Uses Token Count Instead of Credits
`cost: run_result.total_tokens` is raw tokens, not credits. The workflow's credit tracking will be incorrect.

## Medium Issues

### 4. `detectSkillWithAgency()` is Dead Code -- Never Wired Into Any Consumer
Defined but never imported or called by the chat router.

### 5. Missing Feature Flag Check for Agency Skill Trigger Detection
No `AGENCY_SKILL_TRIGGER_ENABLED` check. Triggers fire regardless of flag state.

### 6. Missing Tests from Plan
Two planned tests absent: feature flag check for skill trigger, and agency+skill co-detection test.

### 7. No Validation of `agency_id` Format in AgencyExecutor
`SkillExecutor` validates skill_id with regex. AgencyExecutor passes agency_id unchecked.

### 8. `import` Statement in the Middle of File
The `import type` for agency types placed after `formatSkillDetection` instead of at top.

### 9. Multi-Tenancy Isolation Violation in Agency List Endpoint
If `tenant_id` is None, ALL published agencies across all tenants are returned.

## Low Issues

### 10. Unused `os` Import
### 11. Timeout Value `0` Silently Becomes 600
### 12. No Pagination on Agency List Endpoint
### 13. Test Helper Uses Mock `RunResult` Instead of Real Class
### 14. Plan References Non-Existent Fields on `RunResult`
