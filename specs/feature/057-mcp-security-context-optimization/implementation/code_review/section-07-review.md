## Section 07 Code Review

**Section:** `section-07-context-summarizer` — Agency Context Summarization
**Date:** 2026-03-23
**Reviewer:** CMD-8 (SmartSpecPro Reviewer Agent)

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `agency_context_summarizer.py:173` | Hardcoded model fallback `"gpt-4o-mini"` when no model is passed. Spec §Implementation Guidance explicitly says "do NOT hardcode a model name — use the existing `llm_gateway` service with priority-based model routing." If the gateway_client does not have `gpt-4o-mini` available (or the deployment uses a non-OpenAI provider) this call will fail or charge an unexpected model. | Pass the caller's `model` arg through unchanged; raise `ValueError` or return `None` when `model` is absent, forcing callers to always supply a model. Alternatively wire a proper `llm_gateway` lookup at call time using the existing priority router. |
| HIGH | `agency_context_summarizer.py:124-133` | `_adjust_split_for_atomic_pairs` only moves `split_idx` backward by **one** when it detects that `messages[split_idx - 1]` is an assistant message with `tool_calls`. An assistant turn can have **multiple parallel tool calls** each answered by a separate `tool` role message. The while-loop on line 124 correctly backs past all trailing `tool` messages to reach the owning assistant message, but the subsequent block on lines 128-133 then backs past one additional `tool` message by decrementing `split_idx -= 1` after the while-loop has already landed on the assistant message itself. Net effect: the assistant message with `tool_calls` is moved into the "old" segment while its tool responses are kept in the "recent" segment — the exact split it is supposed to prevent. | After the while-loop, `split_idx` already points at the first `tool` message. The check on line 128 should therefore inspect `messages[split_idx - 1]` (the message before all tool responses) and decrement `split_idx -= 1` only if that is an assistant message **and** does not have `tool_calls` (to avoid over-backing). The standard fix is: after the while-loop exits, check whether `messages[split_idx - 1].get("tool_calls")` — if so decrement once more to include that assistant message in `old_messages`. |
| MEDIUM | `react_executor.py:373-418` | `_evaluate_quality` is unrelated to the context summarizer and was not in the section-07 spec. It introduces an extra LLM call per completed ReAct run, consuming additional credits and adding ~30 s timeout overhead to every successful execution. The spec for this section covers only `AgencyContextSummarizer` wiring; quality evaluation is separate agency-intelligence work (see spec-053). Bundling it here makes it invisible to the section-level quality gate. | Move `_evaluate_quality` and its associated `quality_score` field to the relevant spec-053 section where it was originally designed. Revert the `react_executor.py` quality-eval changes from this diff. |
| MEDIUM | `autonomous_executor.py:214-217` | The planner condense call uses a hardcoded `model_budget = 100000`. The planner is not bound to a fixed 100 K context — the actual budget depends on the model selected for the run. If the model has a larger window (e.g. 200 K), condensation fires too early and wastes tokens; if the model has a smaller window (e.g. 32 K) the budget is too large and the guard is ineffective. | Read `max_tokens_budget` from the planner config (consistent with how `ReActExecutor` uses `self.max_tokens_budget`), or pass the budget through from the calling context. |
| MEDIUM | `agency_context_summarizer.py:151` | `assistant` role messages that contain `tool_calls` have `content = None` in the OpenAI API format (the tool-call payload is in `message.tool_calls`, not `message.content`). `msg.get("content") or ""` correctly yields `""` for these messages, but the tool-call function names and arguments — which are important signal for a useful summary — are silently dropped. The LLM receives `[assistant]: ` with no content, losing all tool-invocation context. | For assistant messages with `tool_calls`, serialize the tool-call names into the formatted line, e.g. `f"[assistant calls tools: {', '.join(tc['function']['name'] for tc in tool_calls)}]"`. This keeps the summary meaningful without exposing arguments that may contain sensitive values. |
| MEDIUM | `test_agency_context_summarizer.py:380-383` | `test_none_returns_overhead` tests `estimate_tokens("")` (empty string), not `None`. The function signature is `def estimate_tokens(self, text: str) -> int` — passing `None` would be a type error caught by mypy but the test does not verify that path. The spec TDD says nothing about `None` input, but the docstring says the guard is `if not text` which would also match `None` at runtime if called with one. | Either rename the test to `test_empty_returns_overhead` (matching what it actually tests) or add a `None` guard in the implementation with a corresponding test. The current name is misleading. |
| LOW | `test_agency_context_summarizer.py:505-509` | The `test_preserves_tool_call_pairs` assertion only checks that **no tool message in the result** is preceded by a non-assistant message. It does not check the inverse: that no assistant-with-tool-calls message in the result is the **last** message (missing its responses). A split that moves the assistant-tool-calls message into `old_messages` but keeps the tool responses in `recent_messages` would pass this test because the tool response at `result[i]` would have `result[i-1]` as the summary message (role=user), triggering `assert result[i - 1].get("role") == "assistant"` to fail — so the current test would catch the symptom. However, because of the logic bug in HIGH-2 above, this test may not exercise the actual failure mode. Add an explicit check that the assistant message with `tool_calls` is present immediately before its tool responses in the output. | Add `assert any(m.get("tool_calls") for m in result)` and a paired assertion that every `tool` message at position `i` has `result[i-1]["role"] == "assistant" and result[i-1].get("tool_calls")`. |
| LOW | `agency_context_summarizer.py:17` | Module uses `logging.getLogger(__name__)` (stdlib) while the rest of the Python backend uses `structlog` (see `agency_trace_collector.py:20`, `react_executor.py`). The warning on line 187 is emitted as an unstructured string. In production the structured log aggregator will not parse the `extra={"error": ...}` kwarg correctly with stdlib logger (it appears in the `extra` dict, not as a top-level JSON field). | Replace `import logging` + `logging.getLogger(__name__)` with `import structlog; logger = structlog.get_logger(__name__)`. Replace `logger.warning("context_summarization_failed", extra={"error": str(e)[:200]})` with `logger.warning("context_summarization_failed", error=str(e)[:200])` (structlog keyword syntax). |

---

### Contract Compliance

| Check | Status | Notes |
|---|---|---|
| `AgencyContextSummarizer` class exported with correct API signature | PASS | All four public methods present with correct signatures matching spec. |
| `TRIGGER_THRESHOLD = 0.70`, `KEEP_RECENT_TURNS = 4`, `CHARS_PER_TOKEN_ASCII = 4.0`, `CHARS_PER_TOKEN_CJK = 1.5` | PASS | All class constants match spec exactly. |
| Token estimation heuristic: CJK 0x0E00-0x0E7F, 0x3000-0x9FFF, 0xAC00-0xD7FF | PASS | Unicode ranges correct and match `context_manager.py` / `promptComposer.ts`. |
| `+4` overhead per message | PASS | Present on line 60. |
| `should_condense` returns False for budget <= 0 | PASS | Lines 72-73. |
| Atomic pair rule: tool/tool_calls pairs kept together | PARTIAL FAIL | Logic present but contains off-by-one bug (HIGH-2). |
| LLM failure → fallback to truncation with marker text | PASS | Lines 117-122. |
| Empty messages → return unchanged | PASS | Lines 84-85. |
| Secret scrubbing on tool-role messages before LLM | PASS | Lines 149-150 call `scrub_secrets(content)` for `role == "tool"`. |
| Old messages placed in user-role (not system) to prevent injection | PASS | `prompt_messages[1]["role"] == "user"` on line 165. |
| Model NOT hardcoded — use gateway routing | FAIL | `"gpt-4o-mini"` hardcoded as fallback on line 173. |
| Wired into `react_executor.py` before each LLM call in the loop | PASS | Lines 259-263 in diff. |
| Wired into `autonomous_executor.py` before replan | PARTIAL PASS | Wired but uses hardcoded 100 K budget (MEDIUM-2). |
| Test file at correct path | PASS | `tests/unit/services/test_agency_context_summarizer.py`. |
| All 11 TDD cases covered | PASS (10/11) | All spec TDD cases present. `test_none_returns_overhead` tests empty-string not None (LOW finding). |
| `structlog` used for logging | FAIL | stdlib `logging` used instead of `structlog`. |

---

### Summary

The core summarizer logic is structurally sound: the threshold check, message splitting, scrubbing-before-LLM, and graceful fallback are all present and the test coverage is broad. Two correctness issues require fixes before merge. The `_adjust_split_for_atomic_pairs` method contains an off-by-one that causes the opposite of its intended behavior in the one-tool-call case — the assistant message with `tool_calls` is moved into the old segment while its responses stay in recent, producing an orphaned tool response at the start of the recent window. The hardcoded `"gpt-4o-mini"` fallback directly violates a named spec constraint and will misbehave on non-OpenAI deployments. The out-of-scope `_evaluate_quality` addition in `react_executor.py` should be tracked under its owning spec section rather than bundled here.

---

### Verdict

**NEEDS_FIX**

Two HIGH-severity issues must be resolved before merge:
1. Fix the off-by-one in `_adjust_split_for_atomic_pairs` (the method currently moves the owning assistant message into the old segment rather than keeping it with its tool responses).
2. Remove the `"gpt-4o-mini"` hardcoded fallback and route through the gateway priority system as specified.

Two MEDIUM issues are strongly recommended for the same commit: correct the planner hardcoded budget and serialize tool-call names for assistant messages in the summary formatter.
