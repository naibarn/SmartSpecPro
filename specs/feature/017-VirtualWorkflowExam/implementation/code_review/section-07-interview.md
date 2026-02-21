# Section 07 Code Review Interview

## Decisions

### Auto-fixed (no user input needed)
1. **Import placement (HIGH)**: Moved `WorkflowGenerateStatusResponse` import from mid-file to top-of-file imports in `workflows.py`. Removed `# noqa: E402`.

### User decision: Add both duplicate ID detection and registry drift test
- **Duplicate node IDs**: Added validator 0 that checks for duplicate node IDs before other validations. Added `test_duplicate_node_ids_raises` test.
- **Registry drift test**: Added `test_known_node_types_matches_registry` that imports from NodeRegistry and compares against KNOWN_NODE_TYPES. This will catch any future additions to the registry that aren't mirrored.

### Let go (not worth changing)
- **min_length=1 on nodes**: Current trigger-based error is more useful for LLM correction than "list too short"
- **Single-error validation**: By design for LLM retry loop — one focused correction per attempt
- **Mutable default in NodeData.config**: Safe in Pydantic v2
- **Position type looseness**: Over-engineering for a structural validator
- **Extra fields test**: Pydantic v2 ignores by default, correct behavior
- **DoS bounds**: Out of scope for this section

## Files Modified
- `python-backend/app/api/workflows.py` — moved import to top
- `python-backend/app/orchestrator/workflow_validator.py` — added duplicate ID check
- `python-backend/tests/test_workflow_validator.py` — added 2 new tests (15 total)
