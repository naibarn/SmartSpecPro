---
name: Feature 045 Celery JWT Refactor Security Audit
description: Security audit of Feature 045 migration from Bearer JWT to X-Internal-Token for Celery tasks and internal service-to-service calls.
type: project
---

Audit date: 2026-03-16
Branch: codex/feature-044-multimodal-chat-memory
Files audited:
- python-backend/app/tasks/automation_copilot_task.py
- python-backend/app/tasks/agency_creator_task.py
- python-backend/app/api/automation_copilot.py
- python-backend/app/api/agency_creator.py
- python-backend/app/services/llm_gateway_client.py
- Tests: test_automation_copilot_security.py, test_agency_creator_security.py, test_internal_token_auth.py, integration/test_automation_copilot_api.py

**Verdict: CONDITIONAL PASS**

Key findings:
- F01 HIGH: `_verify_internal_token` in automation_copilot.py:44 accepts EITHER `x_internal_token` OR `x_proxy_token`. If both settings are configured with different values, an attacker knowing either value can authenticate. Should require both to match a single canonical token.
- F02 HIGH: `_implement_agency` at agency_creator_task.py:529 does not guard against `internal_token` being an empty string — if both `SMARTSPEC_WEB_GATEWAY_TOKEN` and `SMARTSPEC_PROXY_TOKEN` are unset, the call fires with `X-Internal-Token: ""`.
- F03 HIGH: SQL injection in automation_copilot.py:261-273 — `cursor_clause` string is interpolated into an f-string SQL query via `text(f"... {cursor_clause} ...")`. Although `cursor_clause` itself is either hardcoded `""` or `"AND created_at < :cursor"`, the value of `cursor` param comes from user input and is not validated.
- F04 MEDIUM: `allowed_domains` field in `ExecuteRequest` (line 79) has no per-item length or format validation — a user can pass arbitrarily long strings or non-domain values.
- F05 MEDIUM: `print()` usage in app/api/telegram_webhook.py:272 and app/llm_proxy/providers/kie_ai_provider.py:1102-1144 — not in audited files but present in production code paths; these should use structlog.
- F06 INFO: LLM prompt injection surface — user `requirement` field flows directly into `_llm_design` user_message via f-string, but this is user-controlled content in the `HumanMessage`-equivalent role (`user`), not the system prompt. Acceptable per architectural guidance.
- F07 INFO: No JWT stored in Redis — confirmed. The comment at agency_creator_task.py:182 explicitly calls this out.

**Why:** Token fallback chain (PROXY_TOKEN || GATEWAY_TOKEN) creates an ambiguous auth surface. Empty-string token guard missing from _implement_agency.
**How to apply:** Require production validation that at least one internal token is non-empty on startup; reject calls in _implement_agency when token is empty string.
