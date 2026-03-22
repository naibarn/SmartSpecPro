---
name: Feature 034 agency preview/commit security audit
description: Security and completeness findings for agency_result_envelope, agency_service, agencies API, agency_swarm_adapter
type: project
---

Audit date: 2026-03-14
Branch: codex/feature-036-live-browser-experience

**Key findings:**

- F01 HIGH: `get_run()` in agency_service.py (line 1271) — `agency_run_artifacts` query only scopes by `run_id`, not `tenant_id`. Because the parent `agency_runs` row IS tenant-scoped, exploitability requires a valid cross-tenant `run_id` guess, but the artifact sub-query is still weaker than it should be.
- F02 HIGH: `get_run()` in agency_service.py (line 1258) — `agency_messages` query only scopes by `conversation_id`, not `tenant_id`. Conversation IDs are UUIDs so low practical exploitability, but no defense-in-depth.
- F03 CRITICAL: `persona_prefix` in agency_swarm_adapter.py (line 204) — user-supplied `persona_prefix` string is prepended directly to agent `instructions` via f-string concatenation. No role-separator is used; the injected content runs in the same instruction context as the system prompt. Sanitization exists at the API layer (blocked patterns list) but it only checks 5 fixed strings and can be bypassed.
- F04 MEDIUM: `print()` in production service code — notification_service.py:79,93; tenant_current.py:122; kilo_skill_manager_v2.py:973; artifacts.py:45; kie_ai_provider.py:1102-1144 (main() block). None of these log to structlog.
- F05 MEDIUM: No rate limiting on `/stream` or `/run` endpoints. The credit pre-check guards against abuse at the economy level but there is no HTTP-layer rate limit per user on preview generation.

**Why:** effectiveMode in _apply_retrieval_scope_instruction is correctly whitelist-filtered (only "tenant_accessible", "library_only", "web_fallback" map to instruction text), so no injection there.
