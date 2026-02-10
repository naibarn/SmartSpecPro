# Opus Review: Implementation Plan for SmartSpecPro Workflow Engine Rebuild

**Reviewer**: Claude Opus (subagent)
**Date**: 2026-02-08
**Status**: Reviewed and integrated

## Summary of Findings

### Critical Items (All Addressed in Plan)
1. **Code sandbox security** — `signal.SIGALRM` doesn't work in async, no memory limit, `RestrictedPython` bypass risks → **Fixed**: Subprocess isolation mandated
2. **`vm2` deprecated** (CVE-2023-29017, CVE-2023-37903) → **Fixed**: Replaced with `isolated-vm` / Deno subprocess
3. **HTTP Request SSRF** — No URL validation for internal IP ranges → **Fixed**: IP blocklist + DNS check + tenant allowlist

### High Priority Items (All Addressed)
4. **Missing `workflow_executions` table** → Added to Section 13
5. **Memory/LCEL/Kilo integration not addressed** → Added to Existing Subsystem Integration table
6. **Credits should NOT be in LangGraph state** → Moved to `config["configurable"]`, DB-tracked
7. **API endpoints too late in implementation order** → Moved to position #3

### Medium Priority Items (All Addressed)
8. **Two PostgreSQL connection pools** → Pool coordination strategy added to Section 1
9. **No expression language specification** → Expression engine defined in Section 6
10. **Existing 21 nodes not mapped** → Full migration table added to Section 2
11. **EventStore reconnection/replay** → Ring buffer solution added to Section 2
12. **Checkpoint GC strategy undefined** → Daily Celery task with retention policies
13. **Multi-tenant checkpoint collision** → Thread ID namespaced as `{tenant_id}:{execution_id}`
14. **State schema versioning** → `schema_version` field added
15. **Retry as subgraph vs middleware** → Clarified as middleware in `node_adapter.py`

### Low Priority Items (Addressed)
16. **`psycopg` monkey-patch fragility** → Documented as tech debt
17. **Missing `policy_rules` and `secrets_vault` tables** → Added to Section 13
18. **StateManager/CheckpointManager deprecation** → Deprecation schedule added to Section 16

### Additional Improvements Made
- Added executor test contract for consistent quality across 33+ executors
- Added secret propagation protection (`__secret__` tagging and scrubbing)
- Added SQL operation allowlist for Database Query node
- Added token streaming implementation detail (LangChain wrapper requirement)
- Added LangGraph event mapping table for SSE translation
- Added graph validation rules (orphan nodes, single trigger, unreachable nodes)
- Expanded error handling strategy for runtime

## Overall Assessment
The plan was architecturally sound. Main weaknesses were in security treatment of high-risk nodes (code sandbox, HTTP request), missing integration details for existing subsystems, and state schema design. All items have been addressed in the updated plan.
