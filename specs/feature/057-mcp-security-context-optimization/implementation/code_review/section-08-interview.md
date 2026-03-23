# Section 08 Code Review Interview

## Auto-Fixed Issues

| Issue | Severity | Fix Applied |
|-------|----------|-------------|
| NEW-03 scope restriction not enforced — _tools accumulates across calls | HIGH | Added `self._tools.clear()` at start of `prepare_tools()` to enforce per-agent scoping |
| agency_tools.py integration absent — dead code | HIGH | Wired DeferredToolRegistry into `_execute_agent_node_react()` in agency_orchestrator.py. Applied at the point where tool_definitions are prepared for ReActExecutor. |
| Tool description injection sanitization absent | HIGH | Added `_sanitize_description()` with injection pattern stripping (XML tags, <\|system\|>, INST, ignore-previous patterns). Applied to tool descriptions before inclusion in available_names. |
| _tools accumulates state across prepare_tools calls | MEDIUM | Fixed by clearing at start of each call + documented single-agent-invocation scoping |
| +keyword empty-rest returns non-deterministic results | MEDIUM | Changed to sort by name for deterministic ordering |
| Unused `field` import | LOW | Removed |

## Let Go

| Issue | Reason |
|-------|--------|
| No integration test for agency_tools.py wiring | The wiring was added to agency_orchestrator.py instead (where tools are converted to OpenAI format). Existing orchestrator tests cover this path. |
| test_select_exact_matches asserts ordering | Intentional — select: preserves query order |
