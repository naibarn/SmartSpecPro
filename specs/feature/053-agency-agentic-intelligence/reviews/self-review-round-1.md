# Adversarial Self-Review — Round 1

## Findings

### 1. ReAct tool execution — how exactly are tool results returned?
**Issue:** Plan says tools are called via HTTP POST to internal endpoints, but doesn't specify how tool results are formatted into OpenAI tool_call response format.
**Fix:** Added detail about formatting tool results as `tool` role messages with matching `tool_call_id`.

### 2. Message compression — who does the summarization?
**Issue:** Plan says "compress older messages into summary every 5 iterations" but doesn't specify if the same LLM does it (expensive) or a cheaper model (how to configure?).
**Fix:** Specified that compression uses the same gateway client but with a cheaper model override if available, falling back to current model.

### 3. Concurrent run limiter — what happens to the second request?
**Issue:** Rate limiting is defined but the user-facing behavior isn't: does the request queue, fail immediately, or return a specific error?
**Fix:** Specified: return HTTP 429 with retry-after header + user-friendly error message.

### 4. What if autonomous planner returns a plan with 0 parallelizable tasks?
**Issue:** Not an error, but the topological sort + gather logic needs to handle this gracefully.
**Fix:** Already handled — sequential execution is the default path. No change needed.

### 5. Feature flag check location — Python or Node.js?
**Issue:** Plan says Python checks the flag, but the flag is in Redis via Node.js `featureFlags.ts`. Python needs its own flag check mechanism.
**Fix:** Added note that Python reads flags via system_settings loader (existing pattern from `agency_service.py`).
