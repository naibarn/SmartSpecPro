# Section 07 Code Review Interview

## Auto-Fixed Issues

| Issue | Severity | Fix Applied |
|-------|----------|-------------|
| `_adjust_split_for_atomic_pairs` off-by-one — assistant+tool_calls moved to old segment | HIGH | Rewrote logic: when split lands on assistant with tool_calls, keep it in recent; when it lands on tool response, back up past all tool messages AND the owning assistant |
| Hardcoded `"gpt-4o-mini"` fallback model | HIGH | Removed fallback — returns None (triggers truncation fallback) when model not provided |
| Hardcoded `model_budget = 100000` in autonomous_executor | MEDIUM | Use `ContextBudgetManager(model_name).model_limit` for actual model context window |
| Tool-call names not serialized in summary | MEDIUM | Added `[assistant calls tools: name1, name2]` formatting for assistant messages with tool_calls |
| stdlib `logging` instead of `structlog` | LOW | Replaced with `structlog.get_logger(__name__)` and keyword args |
| Misleading test name `test_none_returns_overhead` | LOW | Renamed to `test_empty_returns_overhead` |

## Let Go

| Issue | Reason |
|-------|--------|
| `_evaluate_quality` out of scope | Pre-existing code from spec-053, not added in this section. Appears in diff because react_executor.py was modified. |
