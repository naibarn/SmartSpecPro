# Spec 052 — Python Backend Security Audit

## Verdict: FAIL (3 CRITICAL, 5 HIGH)

### CRITICAL

| ID | File:Line | Issue | Fix |
|----|-----------|-------|-----|
| F01 | `agency_orchestrator.py:746` | **Prompt injection** — Router LLM classifier puts raw `input_text` directly into single prompt string. No role separation. User can override routing. | Separate into system/user roles; never embed user content in system prompt |
| F02 | `agency_conditional_branch.py:135`, `agency_loop_handler.py:202` | **Prompt injection** — `previous_output` (which can carry adversarial content from prior agent) mixed into system-role strings in conditional branch LLM classify and loop evaluator | Same fix: use message role separation |
| F03 | `agency_guardrails.py:85-93` | **Guardrail bypass** — Any unexpected exception in guardrail strategy silently returns `passed=True`. A runtime error in `strict` mode lets everything through. | Change catch-all to return `passed=False` for strict mode guardrails |

### HIGH

| ID | File:Line | Issue | Fix |
|----|-----------|-------|-----|
| F04 | `agency_guardrails.py` | `llm_classify` guardrail uses `str.replace` to inject user message into prompt — no role separation | Use message array with user role |
| F05 | `agency_orchestrator.py:630` | `_execute_agent_node` leaks raw `str(exc)[:100]` back to client. `scrub_error_payload` exists but not called here | Apply `scrub_error_payload()` to error messages |
| F06 | `agency_error_handler.py` | `scrub_error_payload` misses JWT fragments (`eyJ…`), AWS keys (`AKIA…`), fal.ai keys, `password=` query params | Add patterns for these |
| F07 | `agency_error_handler.py` | `backoffMs` and `backoffMultiplier` user-controlled without upper bounds. `maxRetries=5` + `backoffMs=30000` + `multiplier=2.0` = 930s sleep per error | Cap backoffMs at 10000, multiplier at 3.0 |
| F08 | `agency_data_transform.py` | pystache triple-brace `{{{field}}}` bypasses custom HTML-escape function — escape only called for double-brace tokens | Pre-process template to replace `{{{` with `{{` before rendering |

### MEDIUM

| ID | File:Line | Issue | Fix |
|----|-----------|-------|-----|
| F09 | `agency_event_emitter.py` | SSE `error_handled` events may contain unscrubbed error summaries if emitter called before scrubbing | Always scrub before emitting |
| F10 | `agency_creator_task.py` | AI Creator answer keys from user directly interpolated into LLM prompts — potential prompt injection via crafted question answers | Sanitize answer values |
| F11 | `agency_loop_handler.py` | `timeoutMs` has no upper bound — user can set arbitrarily high timeout | Cap at 600000ms (10 min) |
| F12 | `agency_guardrails.py` | `regex_match` strategy exposes compiled pattern in block message — reveals internal regex | Return generic "blocked by guardrail" message |

### LOW

| ID | File:Line | Issue | Fix |
|----|-----------|-------|-----|
| F13 | `agency_run_context.py` | Async lock can be bypassed if `set()` called from different event loop | Document single-loop requirement |
| F14 | `agency_creator_task.py` | Redis status includes full `previewJson` spec — potentially large payload in Redis | Truncate or omit large fields |
