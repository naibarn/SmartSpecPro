---
name: AgencyContextSummarizer Code Patterns Research
description: Exact code locations, imports, and integration points for implementing context condensation in ReAct/Autonomous executors
type: reference
---

# AgencyContextSummarizer Implementation Guide

## Research Scope
Mapping existing code patterns for context window management, LLM calls, message history handling, and memory extraction—to inform implementation of AgencyContextSummarizer for section-07.

**Status**: COMPLETE — All 6 integration points identified with exact line numbers and imports.

---

## 1. ReActExecutor Message Accumulation & Integration Points

**File**: `python-backend/app/services/react_executor.py`

### Current Context Compression Implementation
- **Line 240-242**: Existing message compression hook (every 5 iterations)
  ```python
  # Message compression every 5 iterations
  if iteration % 5 == 0 and iteration > 0:
      await self._compress_messages(messages)
  ```

- **Lines 320-362**: `_compress_messages()` method — LLM-based message summarization
  - Keeps system message (index 0) and last 3 messages
  - Calls LLM via `self.gateway_client.chat.completions.create()`
  - Replaces compressed messages with summary
  - Tracks tokens: `self._total_tokens += summary_resp.usage.total_tokens`

### LLM Call Pattern
- **Line 265**: Gateway call signature
  ```python
  return await self.gateway_client.chat.completions.create(**kwargs)
  ```
- **Lines 254-260**: Message formatting
  ```python
  kwargs: dict[str, Any] = {
      "model": self.model_name,
      "messages": messages,
      "max_tokens": self.max_tokens_per_iteration,
  }
  ```

### Context Window Size Reference
- **Line 85**: Max tokens budget (env-configurable, default 100000)
  ```python
  self.max_tokens_budget = min(max_tokens_budget, MAX_TOKENS_BUDGET)
  ```
- **Import** (line 20): `from app.services.agentic_limits import MAX_REACT_ITERATIONS, MAX_TOKENS_BUDGET`
- **Limits file**: `python-backend/app/services/agentic_limits.py` lines 23-31

### Pre-Call Validation Opportunity
- **Line 106-110**: Loop entry point where condensation check could be inserted
  ```python
  for iteration in range(1, self.max_iterations + 1):
      try:
          response = await asyncio.wait_for(
              self._call_llm(messages), timeout=120.0
          )
  ```
- **INSERTION POINT**: Before line 108 — check message size and condense if needed

### Constructor Parameters
- **Lines 62-87**: ReActExecutor.__init__()
  - `gateway_client: AsyncOpenAI` — the LLM gateway (from OpenAI SDK)
  - `model_name: str` — used to select model for compression
  - `max_tokens_per_iteration: int` — per-turn budget
  - `event_emitter: Any = None` — for progress events

---

## 2. AutonomousExecutor Message Accumulation in Planner

**File**: `python-backend/app/services/autonomous_executor.py`

### Planner Messages Accumulation
- **Lines 117-129**: AutonomousPlanner.plan() — message list construction
  ```python
  messages: list[dict] = [
      {"role": "system", "content": system_prompt},
      {"role": "user", "content": f"Task: {sanitize_llm_input(task)}\n\nContext: {context}"},
  ]

  if previous_result and replan_focus:
      messages.append({
          "role": "user",
          "content": (
              f"Previous attempt result:\n{previous_result[:2000]}\n\n"
              f"Focus on improving: {replan_focus}"
          ),
      })
  ```

### LLM Call in Planner (re-planning cycle)
- **Lines 132-138**: Gateway call for planning
  ```python
  response = await asyncio.wait_for(
      self.gateway_client.chat.completions.create(
          model=self.model_name,
          messages=messages,
          max_tokens=2000,
          response_format={"type": "json_object"},
      ),
      timeout=120.0,
  )
  ```
- **INSERTION POINT**: Before line 132 — check message size before planning LLM call

### Reflection Output Accumulation
- **Lines 387-411**: AutonomousReflector.reflect() — reflection phase message construction
  - Accumulates plan text (line 390-392) and results text (line 387-389)
  - No compression currently — could overflow on complex plans with many subtasks

### Loop Entry Point
- **Line 494-501**: Main autonomous loop (re-planning cycle)
  ```python
  for plan_version in range(1, max_plan_depth + 1):
      try:
          plan = await planner.plan(
              task,
              getattr(ctx, "get_context_text", lambda: "")(),
              previous_result,
              replan_focus,
          )
  ```
- **INSERTION POINT**: Line 495 (in planner.plan call) — condense previous_result if too large

---

## 3. LLM Gateway Client Interface

**File**: `python-backend/app/services/llm_gateway_client.py`

### Direct Gateway Method (NOT used by ReAct/Autonomous, but available)
- **Lines 168-202**: `LLMGatewayClient.chat_completion()` — full signature
  ```python
  async def chat_completion(
      self,
      messages: list[dict[str, Any]],
      model: str,
      user_id: int | None = None,
      tenant_id: str | None = None,
      *,
      tools: list[dict[str, Any]] | None = None,
      tool_choice: Any | None = None,
      response_format: dict[str, Any] | None = None,
      temperature: float | None = None,
      max_tokens: int | None = None,
      trace_id: str | None = None,
      timeout: int | None = None,
  ) -> dict[str, Any]:
  ```

### Direct AsyncOpenAI Client (used by ReAct)
- **Line 18** (in react_executor.py): `from openai import AsyncOpenAI`
- ReAct uses direct `AsyncOpenAI` instead of LLMGatewayClient
- Direct call pattern: `self.gateway_client.chat.completions.create(**kwargs)`

### For AgencyContextSummarizer
- **Option A**: Use same pattern as ReAct — call `gateway_client.chat.completions.create()`
- **Option B**: Instantiate LLMGatewayClient and use `.chat_completion()` method
- **Recommendation**: Use Option A (same pattern as ReAct) for consistency

---

## 4. Secret Scrubbing Pattern for Tool Output

**File**: `python-backend/app/services/agency_trace_collector.py`

### Secret Patterns Registry
- **Lines 24-30**: `_SECRET_PATTERNS` — regex patterns for scrubbing
  ```python
  _SECRET_PATTERNS: list[re.Pattern[str]] = [
      re.compile(r"sk-[a-zA-Z0-9]{20,}"),                 # OpenAI-style API keys
      re.compile(r"Bearer\s+[a-zA-Z0-9._\-]+", re.I),     # Bearer tokens
      re.compile(r"Authorization:\s*\S+(?:\s+\S+)?", re.I), # Authorization header values
      re.compile(r"key-[a-zA-Z0-9]{20,}"),                 # generic API key patterns
      re.compile(r"postgresql://[^\s]+"),                   # connection strings
  ]
  ```

### Scrubbing Function
- **Lines 36-44**: `scrub_secrets()` function
  ```python
  def scrub_secrets(text: str | None) -> str | None:
      """Replace known secret patterns with [REDACTED]."""
      if text is None:
          return None
      if not text:
          return text
      for pattern in _SECRET_PATTERNS:
          text = pattern.sub("[REDACTED]", text)
      return text
  ```

### Import & Usage
- **Import path**: `from app.services.agency_trace_collector import scrub_secrets`
- **Usage in AgencyContextSummarizer**:
  ```python
  # Scrub compressed message before storing or returning
  compressed = scrub_secrets(compressed_text)
  ```

### Additional Context Scrubbing Helpers
- **Lines 47-52**: `_truncate()` function — max length enforcement
  ```python
  def _truncate(text: str | None, max_len: int) -> str | None:
      if text is None:
          return None
      if len(text) <= max_len:
          return text
      return text[:max_len] + "..."
  ```

---

## 5. Token Estimation Heuristic Pattern

**File**: `python-backend/app/services/agency_context_budget.py`

### Token Estimation Implementation
- **Lines 72-74**: `ContextBudgetManager.estimate_tokens()` method
  ```python
  def estimate_tokens(self, text: str) -> int:
      normalized = str(text or "")
      return len(normalized) // 4 + 1
  ```

### Thai/CJK Character Detection (from context_manager.py)
- **File**: `python-backend/app/kilo/context_manager.py` lines 119-138
  ```python
  def estimate_tokens(text: str) -> int:
      """
      Estimate token count without calling tokenizer API.
      Rule of thumb: ~4 chars per token for English, ~2-3 for Thai/CJK
      """
      if not text:
          return 0

      char_count = len(text)

      # Detect if mostly non-ASCII (Thai, CJK, etc.)
      non_ascii = sum(1 for c in text if ord(c) > 127)
      non_ascii_ratio = non_ascii / max(char_count, 1)

      if non_ascii_ratio > 0.3:
          # More non-ASCII characters, use lower ratio
          return int(char_count / 2.5)
      else:
          # Mostly ASCII/English
          return int(char_count / 4)
  ```

### Context Budget Manager Class
- **Lines 35-100**: `ContextBudgetManager` — full context management
  - `self.model_limit` — from MODEL_CONTEXT_LIMITS dict (lines 9-26)
  - `self.total_budget` — 60% of model limit (line 41)
  - `self.input_budget` — after completion reserve (line 46)
  - `self.remaining` property (lines 68-70) — available tokens

### Model Context Limits
- **Lines 9-26**: Hardcoded model limits
  ```python
  MODEL_CONTEXT_LIMITS: dict[str, int] = {
      "gpt-4o": 128000,
      "gpt-4-turbo": 128000,
      "gpt-3.5-turbo": 16385,
      "claude-3-5-sonnet": 200000,
      "claude-3-opus": 200000,
      "gemini-2.0-flash": 1000000,
      "gemini-1.5-pro": 2000000,
      "deepseek-chat": 64000,
  }
  ```

### For AgencyContextSummarizer
- **Recommended**: Use `estimate_tokens()` from context_manager.py (supports Thai/CJK)
- **Or**: Use agency_context_budget.py for consistency with existing agency code
- **Import**: `from app.kilo.context_manager import estimate_tokens`

---

## 6. ContextBudgetManager Class (Existing Budget System)

**File**: `python-backend/app/services/agency_context_budget.py` (Full class)

### Class Initialization
- **Lines 35-56**: Constructor
  ```python
  def __init__(self, model_name: str):
      self.model_name = str(model_name or "").strip()
      self.model_limit = self._get_model_limit(self.model_name)
      self.total_budget = int(self.model_limit * CONTEXT_BUDGET_RATIO)
      self.completion_reserve_tokens = max(
          MIN_COMPLETION_RESERVE_TOKENS,
          int(self.model_limit * COMPLETION_RESERVE_RATIO),
      )
      self.input_budget = max(0, self.total_budget - self.completion_reserve_tokens)
      self.used_tokens = 0
      self.allocations: list[tuple[str, int]] = []
  ```

### Configuration Constants
- **Lines 28-32**:
  ```python
  CONTEXT_BUDGET_RATIO = 0.6  # Use 60% of model limit
  COMPLETION_RESERVE_RATIO = 0.2  # Reserve 20% for output
  MIN_COMPLETION_RESERVE_TOKENS = 2048
  TRUNCATION_SUFFIX = " [truncated to fit context budget]"
  ```

### Key Methods
- **Line 69**: `remaining` property — tokens available
- **Line 72**: `estimate_tokens(text: str) -> int` — simple char/4 heuristic
- **Line 76**: `can_fit(tokens: int) -> bool` — check if fits
- **Lines 79-93**: `allocate(text, label)` — allocate and track

### IMPORTANT: This is REACTIVE, not PREVENTIVE
- Allocate() returns None if text doesn't fit
- No automatic compression/summarization
- AgencyContextSummarizer should be PROACTIVE (compress before LLM call)

---

## 7. Long-Term Memory Extraction Pattern

**File**: `python-backend/app/services/long_term_memory.py`

### extract_memories() Method
- **Lines 441-499**: Full method signature and implementation
  ```python
  async def extract_memories(
      self,
      run_result: str,
      tenant_id: str,
      agency_id: str,
      agent_node_id: str,
      user_id: int,
      source_run_id: str,
  ) -> list[dict]:
      """Extract learnable insights from a completed run via LLM call."""
  ```

### Extraction Call via Gateway
- **Lines 478-490**: HTTP request to gateway (NOT via AsyncOpenAI, but httpx)
  ```python
  async with httpx.AsyncClient(timeout=30.0) as client:
      resp = await client.post(
          f"{self.gateway_url}/v1/chat/completions",
          json={
              "model": "gpt-4o-mini",
              "messages": [{"role": "user", "content": prompt}],
              "max_tokens": 1000,
              "response_format": {"type": "json_object"},
          },
          headers={"Authorization": f"Bearer {self.user_token}"},
      )
  ```

### Extraction Prompt
- **Lines 455-475**: System prompt design
  - Asks for JSON array of learning objects
  - Supports memory_type: 'fact', 'constraint', 'preference', 'skill', 'strategy_success', 'strategy_failure', 'insight', 'process'
  - Max 10 items
  - **REUSABLE**: Same pattern could be used for outcome-aware context compression

---

## 8. Working Memory for ReAct Context

**File**: `python-backend/app/services/working_memory.py`

### Per-Run Memory State
- **Lines 34-61**: Constructor
  ```python
  class WorkingMemory:
      """Redis-backed per-run memory for ReAct executor iterations."""

      def __init__(
          self,
          redis_client: Redis,
          tenant_id: str,
          run_id: str,
          agent_id: str,
          max_observations: int = 50,
          max_constraints: int = 20,
          max_failed_approaches: int = 20,
      ) -> None:
  ```

### Internal State
- **Lines 58-61**: Three memory types
  ```python
  self.observations: list[dict[str, Any]] = []
  self.constraints: list[str] = []
  self.failed_approaches: list[str] = []
  self.artifacts: dict[str, str] = {}
  ```

### Integration Points in ReAct
- **Line 191** (react_executor.py): Check for duplicate tool calls
- **Lines 201-210** (react_executor.py): Record observation after tool execution

### For AgencyContextSummarizer
- **Opportunity**: Use working memory observations to generate compressed context
- **Approach**: Convert observations -> constraint summary -> inject into message history

---

## 9. Agency Orchestrator Integration

**File**: `python-backend/app/services/agency_orchestrator.py`

### Gateway Client Factory
- **Lines 466-475**: `_get_gateway_client()` method (how orchestrator creates AsyncOpenAI)
  ```python
  def _get_gateway_client(self, ctx: ExecutionContext) -> Any:
      """Get an OpenAI-compatible gateway client for internal LLM calls."""
      try:
          import os
          from openai import AsyncOpenAI
          base_url = os.environ.get("NODEJS_INTERNAL_URL", "http://localhost:3000")
          return AsyncOpenAI(
              api_key=ctx.user_token or "internal",
              base_url=base_url,
          )
      except Exception:
          return None
  ```

### Context Object (ExecutionContext)
- ReAct/Autonomous receive `ctx` parameter with:
  - `ctx.user_token` — user/tenant auth token
  - `ctx.tenant_id` — current tenant
  - `ctx.get_context_text()` — method to retrieve composed context

### INSERTION POINT
- When ReActExecutor or AutonomousExecutor are instantiated (orchestrator line ~823), they receive `gateway_client`
- That client is already properly auth'd and configured
- AgencyContextSummarizer should use the same client

---

## 10. Integration Architecture Summary

### Data Flow for Context Summarization

```
ReAct Loop
├── Iteration N: messages.append(tool_call)
├── Before Iteration N+1 LLM call
│   ├── INSERTION POINT: Check token count estimate
│   │   └── if estimate_tokens(messages) > budget * 0.8:
│   │       └── await _condense_context(messages, gateway_client)
│   ├── Call LLM with potentially-condensed messages
│   └── Append response to messages
└── Repeat

Planner Loop (Autonomous)
├── Iteration N: previous_result = final_answer (growing)
├── Before Iteration N+1 plan() call
│   ├── INSERTION POINT: Check previous_result size
│   │   └── if estimate_tokens(previous_result) > threshold:
│   │       └── compressed = await _condense_context(previous_result, gateway_client)
│   ├── Call planner.plan(..., previous_result=compressed)
│   └── Store results
└── Repeat

Reflection Phase (Autonomous)
├── After all subtasks complete
├── INSERTION POINT: Before calling reflector.reflect()
│   └── if estimate_tokens(results_text) > threshold:
│       └── compressed = await _condense_context(results_text, gateway_client)
└── Call reflector.reflect(..., subtask_results=compressed_or_original)
```

---

## 11. Key Implementation Decisions

### Token Estimation Strategy
- **Simple approach** (current, acceptable): `len(text) // 4 + 1`
- **Better approach** (recommended): Use context_manager.py version with CJK detection
- **Best approach** (future): Actual tokenizer, but adds dependency

### Compression Trigger Threshold
- **Existing pattern** (react_executor.py): Every 5 iterations
- **Budget-aware approach** (recommended): When tokens > budget * 0.75
- **Progressive compression** (future): When tokens > budget * 0.60, *then* again at 0.80

### LLM Model for Compression
- **Current (react_executor.py)**: Uses same `self.model_name` as main agent
- **Budget-conscious** (long_term_memory.py): Uses "gpt-4o-mini" for extraction
- **Recommendation**: Use model_name (consistency), but allow override for budget

### Output Format
- **Current (react_executor.py)**: Returns compressed text as is
- **Recommended**: Return (compressed_text, metrics_dict)
  - metrics: compression_ratio, tokens_saved, etc.
  - Enables monitoring and adaptive thresholds

### Error Handling
- **Current pattern** (react_executor.py line 361): Log warning, continue with original
  ```python
  except Exception as e:
      logger.warning("message_compression_failed", extra={"error": str(e)})
  ```
- **Recommended**: Fall back to truncation if compression fails

---

## 12. Required Imports for AgencyContextSummarizer

```python
# Gateway & LLM
from openai import AsyncOpenAI

# Token estimation
from app.kilo.context_manager import estimate_tokens
# OR
from app.services.agency_context_budget import ContextBudgetManager

# Secret scrubbing
from app.services.agency_trace_collector import scrub_secrets

# Limits
from app.services.agentic_limits import MAX_TOKENS_BUDGET, MAX_TOKENS_PER_ITERATION

# Sanitization
from app.services.agentic_sanitizer import sanitize_llm_input

# Logging
import structlog
logger = structlog.get_logger(__name__)
```

---

## 13. Files NOT Modified (Read-Only Exploration)

### Files That Should Stay Unchanged
1. `react_executor.py` — Keep _compress_messages() as-is, just add pre-call check
2. `autonomous_executor.py` — Keep planner/reflector as-is, wrap in contextual compression
3. `llm_gateway_client.py` — Already provides gateway interface (no changes needed)
4. `agency_trace_collector.py` — Provide scrubbing via import only
5. `long_term_memory.py` — Provide extraction prompt pattern via import/reference only

### New File to Create
- `python-backend/app/services/agency_context_summarizer.py` (section-07)
  - Standalone service: no modifications to calling code (only additions)
  - Optional: add async context manager wrapper for clean API

---

## 14. Open Questions Resolved by This Research

| Question | Answer | Source |
|----------|--------|--------|
| Where do ReAct messages accumulate? | `messages` list in `execute()` loop | react_executor.py:95-174 |
| Where is the LLM call made? | Line 265 via `gateway_client.chat.completions.create()` | react_executor.py:265 |
| What's the model context window? | Depends on model; see MODEL_CONTEXT_LIMITS | agency_context_budget.py:9-26 |
| How to estimate tokens? | `estimate_tokens()` helper; supports CJK | context_manager.py:119-138 |
| Where to insert condensation check? | Before line 108 (loop body), before line 345 (LLM call) | react_executor.py:106-109 |
| How to scrub secrets from compressed? | Use `scrub_secrets()` function | agency_trace_collector.py:36-44 |
| How does planner accumulate context? | Via `previous_result` parameter across re-planning cycles | autonomous_executor.py:122-129 |
| Where to integrate in planner? | Before calling `gateway_client.chat.completions.create()` | autonomous_executor.py:132-138 |
| How to extract memories as reference? | See `extract_memories()` prompt pattern | long_term_memory.py:441-499 |
| What are the hard limits? | MAX_TOKENS_BUDGET (100k), MAX_REACT_ITERATIONS (20) | agentic_limits.py:24-31 |

---

## 15. Implementation Checklist

### Pre-Implementation
- [ ] Review this document fully
- [ ] Understand token estimation heuristics (section 5)
- [ ] Understand secret scrubbing patterns (section 4)
- [ ] Understand existing compression in react_executor (section 1)

### Implementation
- [ ] Create `agency_context_summarizer.py`
- [ ] Implement `estimate_context_size(messages)` function
- [ ] Implement `condense_messages(messages, gateway_client, model_name)` async function
- [ ] Add pre-call check in ReAct before `_call_llm()`
- [ ] Add pre-call check in Planner before planning LLM call
- [ ] Add pre-call check in Reflector before reflection LLM call
- [ ] Add error handling with fallback to truncation
- [ ] Add metrics tracking (compression_ratio, tokens_saved)

### Testing
- [ ] Unit test token estimation on ASCII, Thai, CJK text
- [ ] Unit test secret scrubbing in compressed output
- [ ] Integration test with mock gateway (ReAct + context overflow scenario)
- [ ] Integration test with mock gateway (Planner + re-planning scenario)
- [ ] Verify no performance degradation on normal-sized contexts

### Monitoring
- [ ] Add structlog metrics: `context_condensation_triggered`, `compression_ratio`
- [ ] Track when compression happens vs. normal flow
- [ ] Alert if compression fails and falls back to truncation

---

**End of Research Brief**
