---
section: 10-chat-token-counting
date: 2026-03-23
---

## Review Triage

### Applied Fixes (auto-fix)

1. **HIGH-2: Static import for llmModels** — Moved `llmModels` to the existing static import block at the top of chatService.ts. Removed the unnecessary dynamic `import()`.

2. **HIGH-1: Oversized message guard** — Added a guard that skips single messages exceeding 50% of the remaining budget if we already have at least 1 message in context. This prevents a pasted document from blowing the context window.

3. **MEDIUM: Clamp remainingBudget** — Changed to `Math.max(0, inputBudget - systemTokens)` to prevent negative budget values.

4. **MEDIUM: contextLength falsy check** — Changed `if (modelRow?.contextLength)` to `if (modelRow?.contextLength != null && modelRow.contextLength > 0)` to correctly handle 0 values.

### Let Go

1. **MEDIUM: Four divergent estimateTokens implementations** — The other 3 local implementations (`messageChunkerService`, `memoryMerger`, `memoryService`) use simpler `ceil(len/4)` formulas calibrated for their specific use cases. Migrating them is out of scope for this section and would alter existing behavior.

2. **LOW: Increase fetch limit from 20** — The 20-message cap is pre-existing behavior. Changing it could affect many code paths. Token budget enforcement already handles truncation within the 20 messages.

3. **LOW: Test coverage for missing content field** — Minor test improvement, not blocking.
