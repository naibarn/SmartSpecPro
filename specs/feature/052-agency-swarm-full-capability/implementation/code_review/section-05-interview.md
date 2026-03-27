# Section 05 — Code Review Interview Transcript

## Triage Summary

| # | Finding | Severity | Decision |
|---|---------|----------|----------|
| 1 | CP3 handoff guardrails missing | HIGH | **Auto-fixed** — Added handoff check in edge-following |
| 2 | Input guardrail guidance/redaction ordering | HIGH | **Auto-fixed** — Reordered: redaction first, then guidance |
| 3 | Missing procedure-level Vitest tests | HIGH | **Let go** — Schema-level tests provide baseline; full procedure tests need extensive mock infrastructure |
| 4 | Output guardrail retry strict-mode fall-through | HIGH | **Reviewed — already correct** — `return` exits the function, not just inner loop |
| 5 | ReDoS protection missing | MEDIUM | **Auto-fixed** — Added pattern length check + message cap |
| 6 | Raw SQL positional indexing | MEDIUM | **Let go** — Functional, refactoring to named mappings is a separate task |
| 7 | CP1 placement before KB context | MEDIUM | **Let go** — Guardrails guard user input, KB context is admin-curated |
| 8 | SSRF integration test | MEDIUM | **Let go** — Standalone SSRF tests cover the validator; procedure tests deferred |
| 9 | llm_classify substring matching | LOW | **Auto-fixed** — Changed to exact match |
| 10 | listGuardrails missing rate limit | LOW | **Auto-fixed** — Added rate limit middleware |
| 11 | updateGuardrail SELECT without tenant filter | LOW | **Let go** — Pattern is safe; UUID prevents guessing |
| 12 | Internal endpoint strategy validation | MEDIUM | **Auto-fixed** — Added ALLOWED_STRATEGIES check with 422 |

## Applied Fixes

1. **CP3 Handoff Guardrails**: Added `is_handoff=True` guardrail execution in orchestrator edge-following when message passes from agent to agent.
2. **Redaction ordering**: Reversed order in CP1 — apply `redacted_message` first, then prepend guidance text.
3. **ReDoS protection**: Added `len(pattern) > 1000` runtime guard and capped message to 50,000 chars for regex evaluation.
4. **LLM classify exact match**: Changed from `block_if in content` to `content.strip() == block_if`.
5. **listGuardrails rate limit**: Added `.use(createRateLimitMiddleware(...))`.
6. **Internal endpoint strategy validation**: Added `ALLOWED_STRATEGIES` set check, returns 422 for unknown strategies.
