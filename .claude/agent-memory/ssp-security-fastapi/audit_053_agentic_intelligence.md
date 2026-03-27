---
name: Feature 053 Agentic Intelligence Security Audit
description: Security audit of 9 new Python agentic files (ReAct executor, autonomous executor, working memory, cost controls, execution memory store, long-term memory, feature flags, memory decay task, agency_agent_memories model) plus orchestrator agentic paths.
type: project
---

Audit date: 2026-03-23
Report: `specs/feature/053-agency-agentic-intelligence/implementation/code_review/python-security-audit.md`

## Critical / High Findings (require fix before merge)

- **F01 HIGH** — `long_term_memory.py:192` — `delete_memory()` does not check `user_id` — any tenant user can delete another tenant-user's memories by iterating integer `memory_id`. Fix: add `AgencyAgentMemory.user_id == actor_user_id` to where clause.
- **F02 HIGH** — `autonomous_executor.py:44,269` — `cross_agency` execution_mode defined in SubTask but silently falls through to self-execution without tracking `delegation_depth`. Depth limit bypass for cross-agency calls.
- **F03 HIGH** — `agency_orchestrator.py:691` — Custom (non-builtin) tool endpoint URLs are placed into `tool_endpoint_map` without `_validate_tool_url()` SSRF check. Built-in tools are safe; custom tools are not.
- **F04 HIGH** — `autonomous_executor.py:379–385` — `AutonomousReflector.reflect()` passes raw `task` string and raw subtask results (which may contain attacker tool output) into LLM prompt without `sanitize_llm_input()`.
- **F06 HIGH** — `agency_orchestrator.py:567` — `ctx.user_token` (JWT bearer) used as `api_key` for `AsyncOpenAI`. Risk: httpx debug logging may expose it. Recommend suppressing httpx/openai logger to WARNING.
- **F08 CRITICAL** — `long_term_memory.py:352–369` — Safety filter is keyword blocklist only; trivially bypassed by paraphrasing, Unicode lookalikes, or embedding injection in structured data. Poisoned memories injected via `format_memories_for_injection()` as user-role message can override agent behavior in future runs.
- **F09 HIGH** — `long_term_memory.py:290` — `run_result[:3000]` interpolated directly into memory extraction LLM prompt without `sanitize_llm_input()`. Second-order injection: malicious tool output in a run can steer the extractor to generate malicious memory entries.

## Medium Findings

- **F05 MEDIUM** — `react_executor.py:96` — `context` dict JSON-serialized into user message without sanitization.
- **F07 MEDIUM** — `agentic_cost_controls.py:113–127` — INCR/check/DECR pattern has TOCTOU race; actual concurrency can exceed limit by N-1 under concurrent acquirers. Replace with Redis Lua script.

## Low / Info Findings

- **F10 LOW** — `agentic_cost_controls.py:105` — Fail-open when Redis down (removes all concurrency limits).
- **F11 LOW** — `autonomous_executor.py:235` — Exception messages in subtask results not scrubbed with `scrub_error_payload()`.
- **F12 LOW** — `agentic_feature_flags.py:27` — `agencyAgenticModeEnabled` defaults to `True`; least privilege says default `False`.

## Items That Passed

- SQL injection: all raw `text()` queries in `execution_memory_store.py` use named bind params. PASS.
- Tenant isolation in Redis and DB: all keys/queries include `tenant_id`. PASS.
- Loop bounds: all agentic loops capped by `agentic_limits.py` hard limits. PASS.
- Token budget: `min(budget, MAX)` enforced; `budget=0` = unlimited (documented). PASS.
- Feature flag bypass: flags checked server-side in orchestrator; no internal endpoint skips them. PASS.
- Deserialization: `json.loads()` wrapped in try/except; Pydantic `model_validate_json` used. PASS.
- Error leakage: `scrub_error_payload()` applied on returned exception strings. PASS (gap in subtask results, F11).
**Why:** Comprehensive audit of a new multi-layer (Level 1/2/3) agentic execution system spanning 9 new files and orchestrator integration.
**How to apply:** When reviewing future agentic PR iterations, check same 14 items; pay special attention to memory injection vectors and any new code paths that read from Redis before sending to LLM.
