# Section 08 Code Review Interview

## Auto-fixed (no user input needed)
1. **[HIGH] description field loss**: Added `description: str = "AI-generated workflow"` to `GeneratedWorkflow` model in `workflow_validator.py`. Now `model_dump()` preserves the description.
2. **[HIGH] Edge type field loss**: Added `type: str = "smoothstep"` to `WorkflowEdge` model. ReactFlow edge rendering preserved.
3. **[MEDIUM] Token budget re-check**: `_truncate_to_token_budget()` now re-checks after reducing to 3 examples, and falls back to 1 or empty.

## User decision: Refactor generate() to use _call_llm_once()
User approved refactoring. `generate()` is now a thin wrapper calling `_call_llm_once()` — ~70 lines of duplication removed.

## Let go
- Engine creation per call in `_load_from_db()` — acceptable with 24h cache TTL
- `_derive_hint()` casing — works correctly for all known error patterns
- Button text "Try again" vs "Try rephrasing" — existing UX is fine
- Test robustness (module state cleanup, fragile payload extraction) — acceptable for unit tests

## Files Modified (review fixes)
- `python-backend/app/orchestrator/workflow_validator.py` — added `description` to GeneratedWorkflow, `type` to WorkflowEdge
- `python-backend/app/orchestrator/workflow_generator.py` — refactored generate() to use _call_llm_once(), improved _truncate_to_token_budget()
