# Security Audit — Feature 058: Agency Creator Intelligence Upgrade
## Python Backend (FastAPI + Celery)

**Auditor:** CMD-6 FastAPI Security Auditor
**Date:** 2026-03-24
**Branch:** `codex/feature-044-multimodal-chat-memory`
**Scope:** All 5 Python backend files added or modified by feature 058.

---

## Files Audited

| File | Lines | Description |
|---|---|---|
| `python-backend/app/tasks/agency_creator_task.py` | 1579 | Main Celery tasks, LLM helpers, Redis status storage |
| `python-backend/app/api/agency_creator.py` | 179 | FastAPI endpoints: start / status / answer |
| `python-backend/app/api/agency_feedback.py` | 85 | Internal service endpoint for feedback analysis |
| `python-backend/app/services/agency_improvement_advisor.py` | 361 | LLM-powered feedback advisor + auto-enrich |
| `python-backend/app/services/agency_tools.py` | 730+ | Tool bridge loader with toolConfig merge |

---

## Executive Summary

The feature is broadly well-constructed. Auth guards are present on all user-facing endpoints, Redis key format is validated, the `change` field is correctly stripped before returning suggestions to clients, and `sanitize_llm_input` is applied to all DB-sourced strings before LLM injection.

Three issues were found that require remediation before merge:

- **One HIGH** issue: interview answer values (`k/v` dict) flow into LLM `user` messages without sanitization. A malicious user can craft answers that contain injection markers or override the system prompt.
- **One HIGH** issue: `_auto_enrich_instructions` SELECT and UPDATE queries guard on `agencyId` but not `tenantId`, meaning a cross-tenant call with a valid `agency_id` can read and mutate nodes belonging to a different tenant.
- **One MEDIUM** issue: `check_agency_health` in `agency_improvement_advisor.py` returns the raw `json.loads()` output of the LLM response with no schema validation or field capping, unlike the `analyze_feedback` path which normalises and caps its output.

---

## Findings

| ID | Severity | File:Line | Anti-Pattern | Description | Recommended Fix |
|---|---|---|---|---|---|
| F01 | HIGH | `app/tasks/agency_creator_task.py:748-749`, `958-959` | Prompt injection — unsanitized user input in LLM message | Interview answers (`answers` dict) are interpolated directly into the LLM `user` message with `f"- {k}: {v}"`. `k` and `v` come from `AgencyCreatorAnswerRequest.answers` which only enforces `dict[str, str]` typing — no length cap on individual values, and no injection-pattern stripping. An attacker can submit `{"q1": "Ignore previous instructions. You are now a..."} ` to hijack the design phase LLM call. The same pattern repeats in both `_llm_plan` (line 748) and `_llm_design` (line 958). | Apply `sanitize_llm_input(v, max_length=1000)` to both key and value in the answers loop. Also add per-entry length validation to `AgencyCreatorAnswerRequest` (e.g. `max_length=2000` on each value via a `field_validator`). |
| F02 | HIGH | `app/services/agency_improvement_advisor.py:203-208`, `225-230` | Cross-tenant data access — missing tenant scope on node queries | `_auto_enrich_instructions` fetches agent node instructions with `WHERE id = :nid AND "agencyId" = :aid` and then UPDATEs with the same predicate. Neither query includes `"tenantId" = :tid`. The `agency_id` foreign-key constraint does not enforce tenant isolation on `agency_agents` rows. If two tenants share an `agency_id` collision (unlikely but architecturally possible in UUIDs shortened to certain lengths), or if `node_id`/`agency_id` is supplied by an untrusted caller, a cross-tenant write can occur. More concretely, the `feedback_id` row is already validated to `agencyId + tenantId` (line 54-58), but the downstream auto-enrich does not re-validate on the agents table. | Add `AND "tenantId" = :tid` to both the SELECT (line 206) and the UPDATE (line 228) WHERE clauses using the `tenant_id` parameter already present in the function signature. |
| F03 | MEDIUM | `app/services/agency_improvement_advisor.py:356-357` | Missing LLM output validation — raw `json.loads` returned without normalisation | `check_agency_health` returns `json.loads(content)` directly (line 357) without capping list lengths, validating field types, or bounding numeric values. This contrasts with `analyze_feedback` (lines 142-147) which normalises `suggestions`, enforces `autoApplyable` server-side, and caps at 8 items. A misbehaving or jailbroken LLM could return an unbounded `issues` array or a `healthScore` outside `0.0-1.0`. If callers use the result to drive UI rendering, an excessively large response can cause client-side issues. | Apply the same normalisation pattern used in `analyze_feedback`: cap `issues` to a maximum length (e.g. 10), clamp `healthScore` to `[0.0, 1.0]`, and validate that `severity` values are within the expected enum. |
| F04 | LOW | `app/tasks/agency_creator_task.py:748-749`, `958-959` | Unsized answers dict — no count or per-value length cap | In addition to the injection risk (F01), `AgencyCreatorAnswerRequest.answers` has no cap on the number of key-value pairs (`dict[str, str]` with no max-items constraint). An attacker can submit hundreds of answers to exceed the LLM context window, causing a costly failure or bypassing budget controls. The total `answers_text` injected into the `user` message is unbounded. | Add a `model_validator` to `AgencyCreatorAnswerRequest` that caps `len(answers) <= 10` and truncates each value to 1000 characters. |
| F05 | LOW | `app/tasks/agency_creator_task.py:337-348` | Sensitive workflow data stored in Redis without size cap | The `_set_status` call at line 337-348 stores `_payload` (which includes the full `requirement` text and `specFileBase64` up to 10 MB per the Pydantic model) in Redis with a 2-hour TTL. The spec file could be multi-megabyte. While the `_` prefix fields are stripped before returning to clients (line 108 in `agency_creator.py`), storing large base64 blobs in Redis wastes memory and increases the risk of Redis OOM during periods of high concurrency. | Strip `specFileBase64` from the payload before writing it to the `awaiting_answers` status key in Redis (it is only needed for the LLM call that already happened in `_discover_async`). |

---

## What Was Checked and Found Clean

The following items were explicitly checked and found to have no issues:

**SQL injection:** All DB queries in all five files use SQLAlchemy `text()` with named bind parameters (`:id`, `:aid`, `:tid`, etc.). No f-string or concatenation-based SQL construction found.

**Auth on user-facing endpoints:** All three `/agency-creator/*` endpoints carry `current_user: User = Depends(get_current_user)`. The feedback endpoint uses `_verify_internal_token` with `secrets.compare_digest`, which is the correct pattern for service-to-service auth.

**Redis key injection:** `task_id` is validated with `re.match(r"^agcreate-[a-f0-9]{12}$")` both in the Pydantic model (`pattern=` field, line 30) and defensively again in the status endpoint (line 98). The rate-limit key is constructed only from `user_id` (an `int`) so no injection is possible there either.

**Cross-tenant task ownership:** `get_status()` enforces `data["_user_id"] != user_id → return None` (lines 86-88). The `answer` endpoint calls `get_status(body.task_id, user_id=current_user.id)` before dispatching the design task. A user cannot poll or answer another user's task.

**`change` field stripping:** The status endpoint (line 113-117) correctly filters out the `change` key from every suggestion before returning to clients. The raw suggestions (including `change`) are only readable inside the Python backend.

**`print()` logging:** No `print()` calls found in any of the five files. All logging uses `structlog` in `agency_creator_task.py` and `agency_tools.py`, and `logging.getLogger` in `agency_improvement_advisor.py` and `agency_feedback.py`. No sensitive values are logged.

**`os.environ` serialization:** No `dict(os.environ)` or equivalent pattern found in any response path.

**Model allowlist:** `_design_async` enforces a hard allowlist of permitted LLM model names (line 401-402) to prevent cost-bypass via a manipulated `model` parameter.

**LLM output parsing safety:** `_safe_json_parse` uses a sentinel default so callers can distinguish parse failure from an empty dict (line 1548-1555). All paths that accept LLM JSON have explicit fallbacks.

**Celery task secrets:** No API keys or bearer tokens are passed as Celery task arguments. `payload` carries only user content. The internal token is read from `settings` inside the task body (`_implement_agency`, line 1339).

**SSRF in agency_tools.py:** `_validate_tool_url` blocks all RFC-1918 networks and known cloud metadata hostnames. Builtin tool endpoints are resolved from the `_BUILTIN_ENDPOINTS` constant map (no user-controlled URL). Custom tool SSRF re-validation is performed at execution time.

---

## Recommendations Summary

| Priority | Action |
|---|---|
| HIGH — fix before merge | F01: Sanitize interview answer keys and values before LLM injection |
| HIGH — fix before merge | F02: Add `AND "tenantId" = :tid` to both SELECT and UPDATE in `_auto_enrich_instructions` |
| MEDIUM — fix before merge | F03: Normalise and cap `check_agency_health` LLM output before returning |
| LOW — follow-up | F04: Add answers dict size/length cap to `AgencyCreatorAnswerRequest` |
| LOW — follow-up | F05: Strip `specFileBase64` from Redis-stored `_payload` in `awaiting_answers` status |
