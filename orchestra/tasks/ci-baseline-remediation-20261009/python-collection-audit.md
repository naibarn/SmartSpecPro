# Python collection failure audit

## Evidence

- Full CI base `37947291370` and candidate `37948782122` report the same 26 collection errors before this migration.
- CI `37952084634` on candidate `b5c648e...` still reported 19 collection errors after the current API migrations and retired-MCP cleanup. The 11 obsolete modules listed below were removed in a later local checkpoint and are not yet included in that CI evidence; eight collection errors are expected to remain if that mapping is correct.
- Repository instructions prohibit restoring Agency, the legacy workflow engine, or OpenSandbox. The requesting user explicitly authorized remediation of these collection failures. This read-only source/test audit preceded test-only removal; no retired runtime implementation, route, feature flag, or compatibility shim was added.

## Removed obsolete test modules

These tests exercised retired Agency orchestration or the legacy workflow engine, and their imported modules/contracts are absent from the current source:

- `tests/test_workflow_state.py`
- `tests/test_workflows_api.py`
- `tests/unit/test_workflow_tasks.py`
- `tests/unit/api/test_workflows_social_pages.py` (through the retired workflow API)
- `tests/unit/test_agent_runtime_settings.py` (retired Agency Swarm adapter)
- `tests/unit/test_agentic_orchestrator.py`
- `tests/unit/test_orchestrator_memory_wiring.py`
- `tests/unit/services/test_conditional_branch.py`
- `tests/unit/services/test_few_shot_relevance.py`
- `tests/unit/services/test_parallel_fan_out.py`
- `tests/unit/services/test_tool_progress.py`

No current implementation was added to replace these retired contracts. The existing MCP HTTP/Streamable HTTP, supported tenant, JWT, checkpointer, marketplace, and browser security tests remain or were migrated to current APIs. Security policy and security workflow gates are unchanged.

## Remaining collection blockers

The following eight stale test modules still lack a verified supported replacement and remain enabled; they are not suppressed:

- `tests/integration/test_supervisor_e2e.py`
- `tests/unit/test_autonomous_executor.py`
- `tests/unit/test_execution_memory_store.py`
- `tests/unit/test_long_term_memory.py`
- `tests/unit/test_memory_backfill_task.py`
- `tests/unit/test_react_executor.py`
- `tests/unit/test_runtime_identity.py`
- `tests/unit/test_tool_definition_conversion.py`

The owning runtime/product contract must identify supported replacements or confirm retirement before further test migration. The final Python job must pass on the exact candidate SHA before this baseline WorkUnit can close.
