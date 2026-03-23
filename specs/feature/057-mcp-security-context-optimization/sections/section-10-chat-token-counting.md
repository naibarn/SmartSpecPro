# Section 10 — Chat Context Token Counting

## Section ID
`section-10-chat-token-counting`

## Dependencies
- None (Wave 2 — independent)

## Status: COMPLETE

## Overview

Adds token budget enforcement to `buildChatContext()` in `chatService.ts`. Currently, the function loads the last 20 messages without any token counting — for long conversations with large assistant responses, this can exceed the model's context window. This section extracts `estimateTokens()` from `promptComposer.ts` into a shared utility and wires budget enforcement into the chat context builder.

## Files Created

| File | Path |
|------|------|
| tokenEstimator.ts | `apps/web/server/utils/tokenEstimator.ts` |
| tokenEstimator.test.ts | `apps/web/server/utils/__tests__/tokenEstimator.test.ts` |

## Files Modified

| File | Path |
|------|------|
| chatService.ts | `apps/web/server/services/chatService.ts` |
| promptComposer.ts | `apps/web/server/services/promptComposer.ts` |

## Implementation Notes

- Extracted `estimateTokens`, `estimateMessages`, `truncateToTokenBudget` into shared utility
- promptComposer.ts re-exports from shared utility for backwards compatibility
- `buildChatContext()` now: looks up model contextLength from DB, calculates input budget (contextLength - 8192 output reserve), iterates messages newest-first, stops when budget exceeded (keeping min 6 recent turns), skips oversized messages (>50% of budget)
- Default context budget: 32000 - 8192 = 23808 tokens if model lookup fails
- 3 other local `estimateTokens` implementations (memoryMerger, messageChunker, memoryService) were NOT migrated — they use simpler formulas calibrated for different purposes
- 41 tests pass (9 tokenEstimator + 21 promptComposer + 11 enhanced promptComposer)

## Test File to Create

`apps/web/server/utils/__tests__/tokenEstimator.test.ts`

---

## TDD Specification

```
# Test: estimateTokens for ASCII text
  - Input: "Hello world" → ~7 tokens (11/4 + 4 overhead)

# Test: estimateTokens for Thai text
  - Input: "สวัสดีครับ" → ~10 tokens (9/1.5 + 4 overhead)

# Test: estimateTokens for mixed content
  - Input: "Hello สวัสดี World" → weighted estimate

# Test: estimateMessages sums tokens across messages
  - 5 messages, each ~50 tokens → total ~250

# Test: buildChatContext respects model context limit
  - Model with contextLength=16384, reserve 8192 for output
  - Load messages totaling 12000 tokens
  - Assert older messages summarized to fit within 8192 input budget

# Test: buildChatContext with short conversation loads all messages
  - 5 short messages, model contextLength=128000
  - Assert all 5 messages loaded without summarization

# Test: promptComposer still works after extracting estimateTokens
  - Existing promptComposer tests pass unchanged
```

---

## Implementation Guidance

### tokenEstimator.ts

Extract from `promptComposer.ts` lines 153-192:

```typescript
const CHARS_PER_TOKEN_ASCII = 4.0;
const CHARS_PER_TOKEN_CJK = 1.5;
const MESSAGE_OVERHEAD_TOKENS = 4;

export function estimateTokens(text: string): number {
  let cjkChars = 0, asciiChars = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) || 0;
    if ((code >= 0x0E00 && code <= 0x0E7F) || (code >= 0x3000 && code <= 0x9FFF) || (code >= 0xAC00 && code <= 0xD7FF)) {
      cjkChars++;
    } else {
      asciiChars++;
    }
  }
  return Math.ceil(cjkChars / CHARS_PER_TOKEN_CJK + asciiChars / CHARS_PER_TOKEN_ASCII + MESSAGE_OVERHEAD_TOKENS);
}

export function estimateMessages(messages: Array<{content?: string; role?: string}>): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content || ""), 0);
}
```

### chatService.ts Integration

In `buildChatContext()`:

```typescript
import { estimateMessages } from "../utils/tokenEstimator";
import { llmModels } from "../../drizzle/schema";

// Look up model context limit from DB (llmModels.contextLength column)
// The model slug comes from conversation.modelSlug or tenant default
const modelRow = await db.select({ contextLength: llmModels.contextLength })
  .from(llmModels)
  .where(eq(llmModels.slug, modelSlug))
  .limit(1);

// contextLength is nullable in schema — use safe default
const contextLength = modelRow[0]?.contextLength || 32000;
const outputReserve = 8192;
const inputBudget = contextLength - outputReserve;

// Estimate current context size
const totalTokens = estimateMessages(messages);

if (totalTokens > inputBudget * 0.85) {
  // Trigger summarization of oldest messages, keep last 6 turns
  messages = await this.compressMessages(messages, inputBudget);
}
```

**Model metadata source**: The `llmModels` table already has a `contextLength` integer column (confirmed in `drizzle/schema.ts`). Values are populated when models are synced from providers. Common values: Claude 3.5 Sonnet = 200000, GPT-4o = 128000, Gemini 2.0 Flash = 1000000, DeepSeek Chat = 64000. The 32000 fallback is conservative for unknown models.

### promptComposer.ts Update

Replace inline `estimateTokens` function with import from `tokenEstimator.ts`. No behavior change.

### Security Considerations

1. **No security impact**: Token counting is a read-only estimation function with no external calls or data mutation.
