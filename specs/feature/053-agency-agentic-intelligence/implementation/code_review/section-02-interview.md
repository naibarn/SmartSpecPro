# Code Review Interview: Section 02 - Orchestrator Agentic

**Date:** 2026-03-23

## Triage Summary

3 HIGH issues auto-fixed (all obvious correctness). Remaining items auto-fixed.

## Auto-Fixes

### FIX 1: Guardrails around agentic dispatch (HIGH)
**Issue:** Agentic dispatch bypasses input/output guardrails.
**Fix:** Run input guardrails before dispatch, output guardrails on returned answer.

### FIX 2: Catch ValueError from get_planning_prompt (HIGH)
**Issue:** Unknown strategy raises ValueError outside try/except.
**Fix:** Fall back to "basic" with warning log.

### FIX 3: Move imports before loop (HIGH)
**Issue:** Inline imports inside hot loop.
**Fix:** Move to top of method.

### FIX 4: showReasoning comment (MEDIUM)
**Issue:** Config field read in spec but not implemented.
**Fix:** Add comment noting reserved for Level 2.

### FIX 5: Truncate prior response (MEDIUM)
**Issue:** Growing message across cycles.
**Fix:** Truncate last_response to 32000 chars before injecting.

### FIX 6: Move max_cycles_zero test (MEDIUM)
**Issue:** Test is misplaced and duplicates agentic_limits test.
**Fix:** Add proper test in test_agentic_orchestrator.py, remove duplicate.

### FIX 7: Fix fragile call_args test (LOW→auto)
**Issue:** Brittle config introspection.
**Fix:** Simplify assertion.

## Let Go (No Action)
- Regex comments (LOW) — clear enough from context
- Mid-text JSON test (LOW) — `$` anchor handles this
