---
name: Feature 053 Agentic Intelligence — Round 2 Security Audit
description: Re-audit of long_term_memory, agentic_cost_controls, agency_orchestrator, react_executor, autonomous_executor — verifies all Round-1 fixes landed and surfaces new issues
type: project
---

All 4 Round-1 findings in long_term_memory confirmed fixed (30+ safety filter patterns, delete_memory IDOR check, _check_memory_flag gate, run_result sanitized).

Lua-atomic acquire in ConcurrentRunLimiter confirmed.

_execute_autonomous_node wired into match block, agencyAutonomousAgentEnabled flag checked, ConcurrentRunLimiter released in finally block.

**Why:** Round-1 auditor requested explicit round-2 verification pass before merge.

**How to apply:** Two HIGH findings remain unresolved and should block merge:
- F01: No pre-validation of custom tool endpoint URLs inside `_resolve_tool_configs_for_react` — SSRF defense-in-depth gap (agency_orchestrator.py ~line 784)
- F02: `cross_agency` execution mode in `SubTask` has no branch, no feature flag gate, silent fallthrough to local react executor (autonomous_executor.py ~line 269)
- F03 MEDIUM: `user_id` passed as `int` to `ConcurrentRunLimiter.acquire()` which declares `str`

Full report: `specs/feature/053-agency-agentic-intelligence/implementation/code_review/python-security-audit-r2.md`
