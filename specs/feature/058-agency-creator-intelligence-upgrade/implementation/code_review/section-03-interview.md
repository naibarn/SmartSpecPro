# Section 03 Code Review Interview

## Decisions

### HIGH: Memory type mismatch
**Decision:** AUTO-FIX. The spec listed types (`strategy_success`, `strategy_failure`, `process`, `insight`) that don't exist in the schema. The actual DB enum has `constraint`, `preference`, `fact`, `skill`. Use the real types and add a comment explaining the divergence.

### HIGH: Missing `agency_improvement_history` query
**Decision:** AUTO-FIX. Add the secondary query with try/except as spec dictates.

### MEDIUM: Weak F02 test
**Decision:** AUTO-FIX. Add test for empty tenant_id early return and strengthen scoping test.

### MEDIUM: Deferred imports
**Decision:** AUTO-FIX. Move `sanitize_llm_input`, `AsyncSessionLocal`, `AgencyAgentMemory`, and SQLAlchemy imports to function-level but outside the try/except for the DB call itself. The issue is that this function is optional — if these modules aren't available it should degrade gracefully. Compromise: import at module level but keep the outer try/except for runtime errors.

### MEDIUM: Brittle assertion
**Decision:** AUTO-FIX. Use explicit kwargs checking.

### LOW: Log exc_info
**Decision:** AUTO-FIX.

### LOW: Empty tenant_id test
**Decision:** AUTO-FIX.
