# Section 02 Interview Transcript

## Auto-fixes (no user input needed)

### Fix 1: Add test for partial NaN pricing
Category: Auto-fix (obvious gap)
Action: Add test case for one null pricing field.

### Fix 2: Narrow CAPABILITY_FLAGS type
Category: Auto-fix (low risk improvement)
Action: Use a dedicated type alias for capability flag keys.

### Fix 3: Fix JSDoc range comment
Category: Auto-fix (documentation accuracy)
Action: Change "1-99" to "1-85" in JSDoc.

### Fix 4: Add edge-case tests
Category: Auto-fix
Action: Add tests for epoch createdAt and isFree=null.

## Let go

- The partial-NaN averaging behavior (using the one valid pricing field) is actually reasonable and better than treating it as unknown. Keep the behavior, just add a test for it.
