---
name: Feature 052 Agency Orchestrator — Deep Security Audit Round 2
description: Round-2 audit of agency_orchestrator, agency_error_handler, agency_data_transform, agency_creator_task, agency_guardrails, agency_communication_flows, agency_run_context, agency_event_emitter
type: project
---

Round-2 audit targeting integration gaps and edge cases. 11 findings raised.

**Why:** Previous round already fixed: role separation in llm_classify, strict fail-closed, 14 scrub patterns, backoff capped, pystache triple-brace stripped, loop timeout capped.

**Key findings:**
- F01 HIGH: `execute_retry` swallows `RunTerminatedError` — bare `except Exception` catches it; fix with `if isinstance(exc, RunTerminatedError): raise` at top of except block
- F02 HIGH: Error handler fallback strategy causes infinite recursion — no visited-set guard in `_handle_error`
- F03 HIGH: Router/conditional_branch recursive `_execute_node` with no graph-cycle detection or stack-depth limit
- F04 HIGH: User-controlled `model` field in creator task payload has no allowlist — can bypass tenant model restrictions
- F05 MEDIUM: No cap on LLM-returned `planSteps` count — a 100-node plan is accepted
- F06 MEDIUM: `_fetch_available_skills` SSRF risk via `INTERNAL_API_BASE` env var + unsanitised `tenantId` param
- F07 MEDIUM: `custom_endpoint` guardrail fails open on network error even in strict mode (inconsistency with fail-closed behaviour of other strategies)
- F08 MEDIUM: `custom_endpoint` timeout not capped — user could set 1-hour timeout
- F09 MEDIUM: `get_sync`/`set_sync` on `AgencyRunContext` not guarded against parallel_fan_out concurrent access
- F10 LOW: `scrub_error_payload` bypassable via Unicode homoglyphs — fix with NFKD normalise + ASCII encode before scrub
- F11 LOW: `RoundTripTracker` is in-memory only — reset on Celery worker restart, allowing limit bypass across restarts

**Confirmed safe:**
- `_validate_spec` idempotency confirmed
- `AgencyRunContext` tenant isolation confirmed (per-run instance, no singleton)
- SSE events do not leak API keys or user tokens at call-sites reviewed
- PII pattern compilation safe (module-level, not user-input driven)
- JSONPath not ReDoS-vulnerable (PEG parser, not re backtracking)

**How to apply:** When auditing future error-handler or orchestrator changes, check: (1) exception hierarchy and bare `except Exception` in retry loops, (2) cycle detection in recursive graph walkers, (3) user-supplied model/config field allowlisting in Celery task payloads.
