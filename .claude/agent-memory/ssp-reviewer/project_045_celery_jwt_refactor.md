---
name: Feature 045 — Celery JWT Refactor Review
description: Review findings for the Feature 045 plan to remove user JWT from Celery task arguments. Records confirmed codebase facts and plan gaps.
type: project
---

# Feature 045 Celery JWT Refactor — Review (2026-03-16)

**Verdict: NEEDS REVISION** (7 specific items before implementation starts)

**Why:** The plan accurately diagnoses the problem and proposes the right approach, but contains several critical implementation gaps that will cause runtime failures or incomplete security remediation.

**How to apply:** When reviewing future passes of this spec, confirm these gaps are addressed before approving.

## Implementation Review (2026-03-16) — after coding pass

**Verdict: APPROVE_WITH_FIXES** — All plan gaps from the pre-coding review are fixed. Remaining issues are lower severity but require attention before merge.

### Resolved plan gaps (confirmed fixed in code)
- `SMARTSPEC_WEB_GATEWAY_TOKEN` env var name — correct in `_implement_agency()` (line 529)
- `LLMGatewayClient.chat_completion()` now accepts `max_tokens: int | None = None` (line 178)
- `/api/internal/agency/create` now has X-Internal-Token path (index.ts:738-753)
- Sync fallback paths in `agency_creator.py` pass `current_user.id`, no `user_jwt`
- `/answer` endpoint dispatches `create_agency_design_task.delay` without `user_jwt`
- `inspect.signature` uses `.run` attribute in tests — correct for `bind=True` Celery tasks

### Remaining issues after coding pass
- **HIGH (deployment)**: In-flight Celery messages in Redis from old signature (with `user_jwt`) will cause `TypeError` when consumed by new worker. No drain/migration guide in code or docs.
- **HIGH (token retrieval fragility)**: `_implement_agency()` uses `getattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "")` — if the attribute is empty string and `SMARTSPEC_PROXY_TOKEN` is set, the call will use an empty token and get 401. The Python API's `_verify_internal_token` accepts PROXY_TOKEN OR GATEWAY_TOKEN, but `_implement_agency` only checks `GATEWAY_TOKEN` then `PROXY_TOKEN` as separate getattr calls — correct but fragile.
- **MEDIUM**: `_implement_agency()` token resolution at line 529: `getattr(settings, "SMARTSPEC_PROXY_TOKEN", "")` fallback is present but if both are empty string, the token sent is `""` — the Node.js endpoint will reject but the task will silently set `agency_id = None` and mark completed.
- **MEDIUM**: `test_no_bearer_header_in_llm_calls` uses fragile string slicing (`source.index("\n\nasync def _llm_discover(")`) — will raise `ValueError` if function order in `agency_creator_task.py` changes.
- **MEDIUM**: `test_implement_agency_uses_internal_token` does the same string-slice between `_implement_agency` and `_llm_document` — if the order changes the test raises `ValueError` instead of `AssertionError`.
- **LOW**: `test_returns_empty_list_placeholder` in integration tests — named "placeholder" but the implementation is actually complete (hits DB). Name is misleading.
- **LOW**: No test for the `automationCopilot.ts` tRPC layer verifying `user_jwt` is NOT in the POST body sent to Python. The Node.js side cleanup is verified only by code review, not by test.
- **LOW**: `automation_credit_reconciliation` beat task (lines 329-359) does not reconcile tasks stuck in terminal states after TTL expiry — Redis `RESULT_TTL` is 3600s, the beat task only writes `refunded=True` but does not actually trigger any credit system call.

## Confirmed Codebase Facts

### Env var name is SMARTSPEC_WEB_GATEWAY_TOKEN, NOT INTERNAL_API_TOKEN
- `LLMGatewayClient` reads `settings.SMARTSPEC_WEB_GATEWAY_TOKEN` (llm_gateway_client.py:54)
- `automation_copilot.py` verifies against `settings.SMARTSPEC_PROXY_TOKEN or settings.SMARTSPEC_WEB_GATEWAY_TOKEN`
- `INTERNAL_API_TOKEN` does NOT exist anywhere in the Python backend code
- The plan's Section 03 pseudocode uses `os.environ.get("INTERNAL_API_TOKEN", "")` — this is the wrong env var name. The correct name is `SMARTSPEC_WEB_GATEWAY_TOKEN`

### LLMGatewayClient.chat_completion() does NOT accept max_tokens
- The method signature (llm_gateway_client.py:168-193) takes: `messages`, `model`, `user_id`, `tenant_id`, `response_format`, `temperature`, `trace_id`, `timeout`
- The current `_llm_call()` in agency_creator_task.py passes `max_tokens=1000`, `4000`, `500` to different callers
- Switching to LLMGatewayClient as a drop-in replacement without adding `max_tokens` support will silently drop all token limits, causing unbounded LLM spend per call

### /api/internal/agency/create auth is JWT-only with no X-Internal-Token support
- index.ts:734-749 calls `sdk.authenticateRequest(req)` then has a Bearer-cookie fallback
- There is NO `x-internal-token` verification path — only JWT Bearer auth
- Node.js changes ARE required for Section 03 to work (plan notes this as a "may need" but it is definite)

### agency_creator.py has a synchronous fallback path that ALSO passes user_jwt
- Lines 82-94 in agency_creator.py: when Celery is unavailable, calls `_discover_async(task_id, user_jwt, ...)` in a daemon thread
- Line 169: same pattern for `_design_async`
- The plan only mentions removing `user_jwt` from `.delay()` calls, not from these fallback thread paths

### /answer endpoint dispatches create_agency_design_task with user_jwt too
- agency_creator.py:157-159: `submit_agency_creator_answers()` also calls `create_agency_design_task.delay(user_jwt=user_jwt, ...)`
- The plan mentions this in Section 02/Step 6 (chain dispatch) but only covers the discover→design chain inside `_discover_async()`, not the `/answer` FastAPI endpoint which has its own `.delay()` call

### Celery task message serialization (in-flight tasks during deploy)
- Plan says "No rolling deployment concerns — Celery workers are restarted atomically"
- This is incorrect: if old tasks are queued in Redis when the worker deploys, those messages still contain `user_jwt` as a positional argument. The new task signatures will reject them (unexpected keyword or positional arg mismatch), causing task failure
- Plan needs a migration note: drain/flush the queue before deploying, or use Celery task versioning

### Test gap: inspect.signature() doesn't work on Celery-bound tasks
- Section 01 tests use `inspect.signature(automation_analyze_task)` but Celery `bind=True` tasks wrap the function — the actual signature may not be inspectable via `inspect.signature()`. Should use `automation_analyze_task.run.__wrapped__` or just test via actual call pattern
