# Implementation Review Loop Protocol

After implementing each section (Step 5, before code review subagent), and again during finalization (after all sections complete), run iterative self-review to catch completeness gaps.

## Why This Exists

Single-pass implementation systematically misses:
- Edge cases specified in the section plan but not implemented
- Error handling paths mentioned but not coded
- Test cases specified in TDD plan but not written
- Integration points referenced in the section but not connected
- Missing imports, type definitions, or configuration

## Phase A: Per-Section Completeness Review (After Step 5, Before Step 6)

### Checklist

For each implemented section, verify:

#### 1. Plan Coverage
- [ ] Every feature/function described in the section plan has corresponding code
- [ ] Every test stub from the TDD plan has a corresponding test
- [ ] Every API endpoint/route has been created with correct paths and methods
- [ ] Every data model/schema has all specified fields
- [ ] Error handling described in the plan is implemented

#### 2. Code Quality
- [ ] No TODO/FIXME/HACK comments left (unless explicitly deferred in plan)
- [ ] No placeholder return values or stub implementations
- [ ] All imports resolve correctly
- [ ] Types are consistent with what other sections expect (check section interfaces)

#### 3. Test Coverage
- [ ] At least one test per public function/endpoint
- [ ] Edge cases from the section plan have corresponding tests
- [ ] Tests actually assert meaningful behavior (not just "doesn't crash")
- [ ] All tests pass (`{test_command}`)

### Procedure

```
1. Re-read the section plan file
2. Compare every requirement against the actual implementation
3. Classify gaps:
   - [AUTO-FIX] — 80%+ confident it should be done → fix immediately
   - [SUGGEST] — genuinely optional, would need user input → log for final summary
4. Fix all [AUTO-FIX] items
5. Run tests after each fix
6. Re-check if fixes introduced new gaps (max 3 rounds)
7. Collect [SUGGEST] items for the finalization summary
```

**Rule: If it's clearly needed based on the plan → it's [AUTO-FIX], not [SUGGEST].**
Missing tests, missing error handlers, missing validation — these are always [AUTO-FIX].
Only truly optional enhancements (performance tuning, extra features) are [SUGGEST].

**Output per round:**
```
═══════════════════════════════════════════════════════════════
IMPLEMENTATION REVIEW — Section {NN} — Round {N}
═══════════════════════════════════════════════════════════════
Plan Coverage:  {N}/{M} items implemented
Test Coverage:  {N}/{M} test stubs have tests
Code Quality:   {PASS | N issues}

AUTO-FIX:
  [1] Missing error handler for API timeout (plan line 45)
  [2] Test for empty input case not written (TDD plan item 3)

SUGGEST (optional):
  [1] Could add caching for frequently accessed data

Fixing AUTO-FIX items...
═══════════════════════════════════════════════════════════════
```

---

## Phase B: Cross-Section Integration Review (During Finalization)

After ALL sections are implemented, verify they work together correctly.

### Checklist

#### 1. Interface Alignment
- [ ] Exports from section N match imports in section N+1
- [ ] Shared types have identical definitions
- [ ] API endpoints match what consumers call
- [ ] Database queries reference tables/columns that exist

#### 2. Integration Completeness
- [ ] Configuration values are consistent across sections
- [ ] Environment variables used are documented
- [ ] Database migrations run in correct order
- [ ] No orphaned code (defined but never called from any section)

#### 3. Full Test Suite
- [ ] Run `{test_command}` — ALL tests pass
- [ ] No test isolation issues (tests don't depend on execution order)
- [ ] Integration tests cover cross-section boundaries

### Procedure

```
1. Run full test suite — if all pass, proceed to checklist
2. Read all section files and compare against implementation
3. Check cross-section interfaces
4. Classify gaps:
   - [AUTO-FIX] — 80%+ confident → fix immediately
   - [SUGGEST] — genuinely optional → collect for summary
5. Fix all [AUTO-FIX] items
6. Re-run full test suite
7. Repeat until no [AUTO-FIX] remains (max 3 rounds)
8. Pass [SUGGEST] items to finalization summary
```

**Output:**
```
═══════════════════════════════════════════════════════════════
CROSS-SECTION INTEGRATION REVIEW — Round {N}
═══════════════════════════════════════════════════════════════
Sections reviewed: {M}
Full test suite: {PASS | N failures}
Interface alignment: {PASS | N mismatches}

AUTO-FIX:
  [1] section-02 imports UserService from section-01 but it's exported as UserManager
  [2] Test for cross-section data flow missing

SUGGEST (optional):
  [1] Could add rate limiting to the new API endpoints

Fixing AUTO-FIX items...
═══════════════════════════════════════════════════════════════
```

---

## Summary: Where Each Phase Runs

```
deep-implement workflow (per section):
  Step 3: Implement Section
  Step 4: Track Created Files
  Step 5: Stage Changes
  ──► Phase A: Per-Section Completeness Review (1-3 rounds) ◄── NEW
  Step 6: Code Review (Subagent)
  Step 7: Code Review Triage and Interview
  ...

deep-implement finalization (after all sections):
  ──► Phase B: Cross-Section Integration Review (1-3 rounds) ◄── NEW
  Generate usage.md
  Output Summary (include NICE_TO_HAVE suggestions)
```
