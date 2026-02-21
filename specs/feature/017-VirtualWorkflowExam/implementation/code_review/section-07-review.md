# Section 07 Code Review

## HIGH SEVERITY

### 1. Mid-file import with noqa: E402
The import `from app.orchestrator.workflow_validator import WorkflowGenerateStatusResponse` is placed mid-file in `workflows.py`. Should be moved to top-of-file imports.

### 2. Backward compatibility preserved (deviation from plan, correct)
The implementation kept original fields (`message`, `nodes`, `edges`, `description`) alongside new fields (`result`, `validationError`, `hint`). This deviates from the plan but is the correct choice for backward compat.

## MEDIUM SEVERITY

### 3. No min_length=1 on nodes list
Zero nodes case works only because trigger check catches it. Explicit `min_length=1` would be clearer.

### 4. Duplicate node IDs silently accepted
If LLM generates duplicate node IDs, set deduplication hides the issue.

### 5. Single-error validation (trigger before node types)
Multi-error workflows get one error at a time, potentially increasing retry count in section-08.

### 6. KNOWN_NODE_TYPES drift risk
No automated test cross-validating against node_registry.py.

## LOW SEVERITY

### 7. NodeData.config mutable default
`config: dict[str, Any] = {}` — safe in Pydantic v2 but triggers B006.

### 8. position typed too loosely
`dict[str, float]` accepts any keys, not just x/y.

### 9. Test count mismatch (plan says 12, implementation has 13)
Extra test is beneficial.

### 10. No test for extra fields in LLM output
Pydantic v2 ignores by default (correct), but no explicit test.

### 11. No DoS bounds on node/edge count
No upper limit validation.
