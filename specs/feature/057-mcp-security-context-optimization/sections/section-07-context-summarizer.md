# Section 07 — Agency Context Summarization

## Section ID
`section-07-context-summarizer`

## Dependencies
- **section-01-python-ssrf-auth**: mcp_client.py changes must be complete (shared execution path)

## Overview

Implements `AgencyContextSummarizer`, a service that monitors token usage during agency ReAct execution and auto-condenses old conversation turns when approaching the context budget threshold. Currently, agency runs have NO context summarization — the message history grows unbounded until hitting the model's context limit around iteration 8 on a 100K model. This service reduces context by ~50%, extending useful iterations from 8 to 15+.

The approach mirrors DeerFlow's `SummarizationMiddleware`: trigger at a configurable threshold (70% of budget), keep the most recent N turns uncompressed, summarize older turns into a single compact block, and preserve tool-call/response pairs as atomic units.

## File to Create

`python-backend/app/services/agency_context_summarizer.py`

## Files to Modify

| File | Path |
|------|------|
| react_executor.py | `python-backend/app/services/react_executor.py` |
| autonomous_executor.py | `python-backend/app/services/autonomous_executor.py` |

## Test File to Create

`python-backend/tests/unit/services/test_agency_context_summarizer.py`

---

## TDD Specification

```
# Test: estimate_tokens returns correct count for ASCII text
  - Input: "Hello world" (11 chars)
  - Assert ~3 tokens (11 / 4.0 + 4 overhead ≈ 7)

# Test: estimate_tokens returns correct count for Thai/CJK text
  - Input: "สวัสดีครับ" (9 chars, all CJK-range)
  - Assert ~10 tokens (9 / 1.5 + 4 overhead ≈ 10)

# Test: estimate_tokens handles mixed ASCII + Thai
  - Input: "Hello สวัสดี World"
  - Assert token count uses both ratios for respective char ranges

# Test: should_condense returns False when under threshold
  - Budget: 100000, messages total ~50000 tokens (50%)
  - Assert should_condense returns False

# Test: should_condense returns True when over threshold
  - Budget: 100000, messages total ~75000 tokens (75%)
  - Assert should_condense returns True (threshold is 70%)

# Test: condense keeps last KEEP_RECENT_TURNS turns intact
  - 20 turns, KEEP_RECENT_TURNS=4
  - After condense: first message is summary, last 4 turns are original messages

# Test: condense preserves AI+ToolMessage pairs as atomic units
  - Messages: [user, ai_with_tool_call, tool_response, ai_final, user, ai]
  - Assert ai_with_tool_call and tool_response are never split across boundary

# Test: condense produces valid summary message
  - After condense: first message has role="system" or "user"
  - Content starts with "Summary of prior conversation:"

# Test: condense with messages under threshold returns original list unchanged
  - 5 short messages, budget=200000
  - Assert condense returns same messages without modification

# Test: condense uses LLM gateway for summarization (not hardcoded model)
  - Mock llm_gateway.chat_completion
  - Assert called with summary prompt when condensing

# Test: condense handles LLM failure gracefully — returns truncated instead
  - Mock LLM to raise exception
  - Assert fallback: keep last KEEP_RECENT_TURNS, drop older messages silently
```

---

## Implementation Guidance

### Exported API

```python
class AgencyContextSummarizer:
    TRIGGER_THRESHOLD: float = 0.70
    KEEP_RECENT_TURNS: int = 4
    CHARS_PER_TOKEN_ASCII: float = 4.0
    CHARS_PER_TOKEN_CJK: float = 1.5

    def estimate_tokens(self, text: str) -> int:
        """Estimate token count using character-based heuristic."""

    def estimate_messages_tokens(self, messages: list[dict]) -> int:
        """Sum token estimates across all messages."""

    def should_condense(self, messages: list[dict], budget: int) -> bool:
        """Check if messages exceed TRIGGER_THRESHOLD of budget."""

    async def condense(self, messages: list[dict], budget: int, model: str | None = None) -> list[dict]:
        """Summarize old messages, keep recent turns. Returns new message list."""
```

### Token Estimation

Reuse the same heuristic as `context_manager.py` and `promptComposer.ts`:
- CJK/Thai characters (Unicode ranges 0x0E00-0x0E7F, 0x3000-0x9FFF, 0xAC00-0xD7FF): 1.5 chars/token
- ASCII characters: 4.0 chars/token
- Add 4 tokens per message overhead (role prefix, formatting)

### Message Splitting

1. Count total tokens across all messages
2. If under threshold, return messages unchanged
3. Identify the split point: keep the last `KEEP_RECENT_TURNS * 2` messages (user+assistant pairs)
4. **Atomic pair rule**: If the split point lands between an AI message with `tool_calls` and its corresponding `ToolMessage` responses, move the split point backward to keep the pair together
5. Old messages (before split) → summarize via LLM
6. Return: `[summary_message] + recent_messages`

### Summarization Prompt

```
System: Summarize the following conversation history concisely.
Preserve: key decisions, tool results, important facts, and user preferences.
Omit: greetings, repetitive clarifications, and verbose tool output details.
Format: A single paragraph, max 500 tokens.

{formatted_old_messages}
```

Use the existing `llm_gateway` service with priority-based model routing — do NOT hardcode a model name. Use temperature=0.1, max_tokens=600.

### Wiring into ReAct Executor

In `react_executor.py`, before each LLM call in the ReAct loop:

```python
summarizer = AgencyContextSummarizer()
if summarizer.should_condense(messages, model_budget):
    messages = await summarizer.condense(messages, model_budget)
```

### Wiring into Autonomous Executor

In `autonomous_executor.py`, before `replan()` calls where context accumulates:

```python
if summarizer.should_condense(planner_messages, model_budget):
    planner_messages = await summarizer.condense(planner_messages, model_budget)
```

### Error Handling

- LLM failure: Fall back to truncation — keep last `KEEP_RECENT_TURNS`, drop older messages with a note: `"[Prior conversation history truncated due to context limits]"`
- Empty messages list: Return unchanged
- Budget of 0 or negative: Return unchanged (defensive)

### Security Considerations

1. **Summarization prompt injection**: The old messages are placed in a user-role message, not system prompt. This prevents any injected content from being interpreted as system instructions during summarization.
2. **Token estimation accuracy**: The character-based heuristic is approximate (±20%). The 70% threshold provides a safety margin to avoid hitting the hard limit.
3. **Tool output secret scrubbing (NEW-02)**: Before sending old messages to the summarizer LLM, apply `_SECRET_PATTERNS` scrubbing from `agency_trace_collector.py` to the content of ALL ToolMessage entries. The summarizer LLM should never see raw tool output containing credentials, API keys, or OAuth tokens — only agent-level decision content. This prevents secret leakage to a potentially less-trusted summarization model.
