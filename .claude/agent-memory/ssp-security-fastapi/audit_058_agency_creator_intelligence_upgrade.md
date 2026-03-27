---
name: audit_058_agency_creator_intelligence_upgrade
description: Security audit of spec 058 — AI Agency Creator Intelligence Upgrade. Two rounds: plan-stage (2026-03-23) and code audit (2026-03-24).
type: project
---

## Round 1 — Plan-stage audit (2026-03-23)

Branch: codex/feature-044-multimodal-chat-memory
Files audited: spec sections + existing agency_creator_task.py

| ID  | Severity | Location                          | Category             |
|-----|----------|-----------------------------------|----------------------|
| F01 | CRITICAL | Section 03 / _fetch_relevant_memories | Prompt injection via memories |
| F02 | HIGH     | Section 03 / _fetch_relevant_memories | Cross-tenant memory leak (missing user_id scope) |
| F03 | HIGH     | Section 05 / _llm_suggest_improvements | Suggestion `change` payload applied without server-side validation |
| F04 | HIGH     | Section 06 / saveAsTemplate       | Template missing tenantId/createdBy in existing schema; IDOR risk if ownership check is skipped |
| F05 | HIGH     | Section 07 / _core/index.ts:1112  | print() logging errors in production code |
| F06 | HIGH     | Section 01 / _llm_discover        | computer_use capability recommended without guardrail |
| F07 | MEDIUM   | Section 02 / _filter_goal_questions | Keyword blocklist trivially bypassed |
| F08 | MEDIUM   | Section 07 / internal API schema  | objective/sharedInstructions without XSS-safe length cap |
| F09 | MEDIUM   | Section 05 / Redis suggestions    | Suggestions stored without TTL separation |
| F10 | MEDIUM   | Section 09 / MAX_LLM_CALLS        | Budget counter per-invocation; replay could run 18 calls N times |

## Round 2 — Implemented code audit (2026-03-24)

Files audited: agency_creator_task.py (1579 lines), agency_creator.py, agency_feedback.py, agency_improvement_advisor.py, agency_tools.py

**Many Round-1 findings were fixed in implementation:**
- F01: `sanitize_llm_input` applied to memories, feedback fields, agent instructions before LLM injection — FIXED
- F02: `_fetch_relevant_memories` now dual-scoped on tenant_id + user_id — FIXED
- F03: `change` field stripped in status endpoint (line 114); `_validate_suggestion_change` server-side — FIXED
- F06: `supportsComputerUse` stripped by `_validate_spec` unconditionally — FIXED
- F09: Suggestions stored under separate `:suggestions` Redis key with same TTL — FIXED

**Remaining / new findings in Round 2:**

| ID  | Severity | File:Line | Category |
|-----|----------|-----------|----------|
| F01 | HIGH | agency_creator_task.py:748-749, 958-959 | Interview answer values unsanitized before LLM injection |
| F02 | HIGH | agency_improvement_advisor.py:206, 228 | _auto_enrich_instructions missing tenantId in WHERE clause |
| F03 | MEDIUM | agency_improvement_advisor.py:357 | check_agency_health returns raw json.loads without schema normalisation |
| F04 | LOW | agency_creator.py:31 | answers dict has no item count or per-value length cap |
| F05 | LOW | agency_creator_task.py:337-348 | specFileBase64 stored in Redis _payload (up to 10 MB) during awaiting_answers phase |

**Clean items confirmed in Round 2:**
- SQL injection: all queries use bind params
- Auth: get_current_user on all user endpoints; compare_digest on internal endpoint
- Redis key injection: task_id regex validated at both model and endpoint layers
- Cross-tenant task ownership: get_status() enforces user_id match
- print() logging: none in any of the 5 files
- os.environ serialization: none
- Celery secrets: internal token read from settings inside task body
- SSRF: agency_tools.py validates at load and execution time
