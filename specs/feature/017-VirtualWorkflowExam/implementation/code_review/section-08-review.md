# Section 08 Code Review

## HIGH
1. `description` field dropped by `GeneratedWorkflow.model_dump()` — model lacks description field
2. Edge `type` field stripped by Pydantic validation — `WorkflowEdge` model lacks `type`

## MEDIUM
3. Code duplication: `generate()` and `_call_llm_once()` are ~100 lines of duplicated logic
4. `_load_from_db()` creates/disposes engine per call — wasteful
5. `_truncate_to_token_budget()` doesn't re-check budget after reducing to 3

## LOW
6-12. Button text, casing in hints, test robustness, module state cleanup
