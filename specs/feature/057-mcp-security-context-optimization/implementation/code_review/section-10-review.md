## Review Report

### Verdict: APPROVE_WITH_FIXES

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `chatService.ts:864` | "At least 6 turns" guard bypasses budget for oversized messages | See HIGH-1 below |
| HIGH | `chatService.ts:836` | Dynamic `import("../../drizzle/schema")` for `llmModels` inside a hot path — `llmModels` is already re-exported from the same schema file that is statically imported at the top of the file | Add `llmModels` to the existing static import block at line 6–22; remove the dynamic import |
| MEDIUM | `chatService.ts:826` | `OUTPUT_RESERVE = 8192` is hardcoded with no relationship to the actual model's `maxOutputTokens` or any configurable setting | Derive from model row if available (`modelRow.maxOutputTokens ?? OUTPUT_RESERVE`), or at minimum document why 8192 is safe for all supported models |
| MEDIUM | `chatService.ts:842` | `if (modelRow?.contextLength)` is falsy for `contextLength = 0`, which is a legal integer value in the schema (column is nullable integer with no `> 0` constraint) | Use `if (modelRow?.contextLength != null && modelRow.contextLength > 0)` |
| MEDIUM | `chatService.ts:855` | `remainingBudget` is never clamped; if system context exceeds `inputBudget`, `remainingBudget` is negative. The guard at line 864 checks `usedTokens + tokens > remainingBudget`, which is immediately true, but the `chatMessages.length >= 6` clause forces 6 messages in anyway — potentially breaching the model's context window | Clamp: `const remainingBudget = Math.max(0, inputBudget - systemTokens)`. If clamped to 0, still allow the minimum 6 turns but log a warning |
| MEDIUM | `tokenEstimator.ts` / `messageChunkerService.ts:29` / `memoryMerger.ts:51` / `memoryService.ts:1728` | Three additional local `estimateTokens` implementations remain in the codebase, all using a simpler `ceil(length / 4)` formula (no CJK weighting, no framing overhead). The new shared utility is inconsistent with these, and `messageChunkerService` and `memoryMerger` were not migrated | Migrate all four local implementations to use `estimateTokens` from `../utils/tokenEstimator`, or explicitly document which callers need the simpler formula and why |
| LOW | `chatService.ts:821` | `getRecentMessages(conversationId, 20)` fetches a fixed 20-message cap before the budget loop runs. If a single message exceeds the budget, the "at least 6 turns" guard still includes it; but more importantly, the fetch limit of 20 may not be enough context when the model has a large context window and most messages are short | Pass a higher fetch limit (e.g. `50`) and rely on the budget loop to trim, rather than pre-capping at a number that has nothing to do with token budget |
| LOW | `tokenEstimator.test.ts:192` | `estimateMessages` test for `{ role: "assistant" }` (no `content` field) asserts it contributes 0 tokens — correct. However, `estimateTokens("")` returns `0` because the early-return `if (!text)` fires, but the real call path in `estimateMessages` passes `m.content || ""` which also returns `0` — so the test actually covers the `estimateTokens("")` path rather than the `content` missing path. The test comment says "empty content" but the assertion is vacuously true via different routes | Add `expect(estimateMessages([{ role: "assistant", content: "" }])).toBe(0)` as a separate explicit case |
| LOW | `chatService.ts:863` | `estimateTokens(msg.content)` — `messages.content` is `text("content").notNull()` in the schema, so this is safe. However `msg` is typed as `Message` which has `content: string`, so the `estimateTokens` null guard (`if (!text) return 0`) is never exercised here. No bug, but note that the null guard in `estimateTokens` is defensive against callers passing `null | undefined`, which is not possible through this path | No action required; defensive guard is fine as-is |

---

### Detailed Notes

#### HIGH-1 — "At least 6 turns" guard can include arbitrarily large messages (`chatService.ts:864`)

```typescript
if (usedTokens + tokens > remainingBudget && chatMessages.length >= 6) {
  break;
}
chatMessages.unshift({ ... });
usedTokens += tokens;
```

The logic reads: _stop only when both the budget is exceeded AND we already have 6 messages_. This means: when `chatMessages.length < 6`, the condition is always false — messages are unconditionally added regardless of size. A single user message that is, say, 200,000 characters (e.g., a pasted document) will be forced into the context even when the model's context window is 32,000 tokens. This directly contradicts the stated goal of "enforcing token budget."

**Recommended fix:** Add a hard cap per message to prevent a single oversized message from blowing the budget, and refactor the minimum-turn guarantee to be a secondary fallback:

```typescript
const MAX_SINGLE_MESSAGE_TOKENS = Math.floor(remainingBudget * 0.5); // no single msg > 50% of budget

for (let i = recentMessages.length - 1; i >= 0; i--) {
  const msg = recentMessages[i];
  if (msg.role === "system") continue;
  const tokens = estimateTokens(msg.content);
  // Hard stop: over budget and minimum turns satisfied
  if (usedTokens + tokens > remainingBudget && chatMessages.length >= 6) break;
  // Soft skip: single message would dominate the budget (but don't break — continue looking at older, smaller msgs)
  if (tokens > MAX_SINGLE_MESSAGE_TOKENS && chatMessages.length >= 1) continue;
  chatMessages.unshift({ role: msg.role as "user" | "assistant", content: msg.content });
  usedTokens += tokens;
}
```

#### HIGH-2 — Unnecessary dynamic `import()` for `llmModels` (`chatService.ts:836`)

```typescript
const { llmModels } = await import("../../drizzle/schema");
```

`chatService.ts` already statically imports from `../../drizzle/schema` at the top of the file (lines 6–22). `llmModels` is a plain exported constant from that same module — there is no circular dependency reason for a dynamic import here. Dynamic `import()` on a module that is already loaded returns the cached module synchronously, so there is no runtime performance penalty, but it:

1. Confuses the TypeScript compiler's static analysis and tree-shaker.
2. Makes the dependency invisible to refactoring tools.
3. Is inconsistent with the rest of the file.

**Fix:** Add `llmModels` to the existing import block at line 6.

#### MEDIUM — Four divergent `estimateTokens` implementations

The new shared utility is an improvement, but three unmigrated local implementations remain:

| File | Formula | CJK-aware | Framing |
|---|---|---|---|
| `tokenEstimator.ts` (new) | `ceil(cjk/1.5 + ascii/4 + 4)` | Yes | Yes (+4) |
| `messageChunkerService.ts:29` | `max(1, ceil(len/4))` | No | No |
| `memoryMerger.ts:51` | `max(1, ceil(len/4))` | No | No |
| `memoryService.ts:1728` | `ceil(len/4)` | No | No |

The chunk sizing in `messageChunkerService` (`MAX_CHUNK_TOKENS = 500`) and budget math in `memoryMerger` were calibrated against the simpler formula. Migrating them to the new utility would increase all estimates by at least 4 tokens per message (the framing overhead), potentially altering existing behavior. The migration should be a deliberate, separate step — but the divergence should be explicitly documented or resolved.

---

### Contract Compliance

| Check | Status |
|---|---|
| `estimateTokens` re-exported from `promptComposer` for backwards compatibility | PASS — `export { estimateTokens, truncateToTokenBudget }` present |
| `promptComposer.test.ts` (30 tests) still import from `promptComposer` | PASS — re-export satisfies the import path |
| `estimateMessages` new function exported from `tokenEstimator.ts` | PASS |
| `truncateToTokenBudget` not re-exported from `tokenEstimator.ts` | PASS — still works via `promptComposer` re-export |
| `buildChatContext` return type unchanged | PASS — `Array<{ role: "system" \| "user" \| "assistant"; content: string }>` |
| `llmModels.contextLength` is nullable integer in schema | PASS (flagged under MEDIUM) |
| `conversations.model` has a default (`"gpt-4o-mini"`) — budget lookup path still handles `null` via `if (conv?.model)` | PASS |
| No new tRPC procedure or API contract changes | PASS — internal service change only |
| Auth / tenant isolation: budget logic reads only from `conversations` by `conversationId`, no cross-tenant data | PASS |
| Silent catch `catch {}` on DB lookup — falls back to default budget | PASS (acceptable pattern matching surrounding code) |

---

### Summary

The extraction of `estimateTokens` / `truncateToTokenBudget` into a shared `tokenEstimator.ts` is clean and the re-export approach correctly preserves backward compatibility for existing test imports. The core budget enforcement logic in `buildChatContext` is sound in the typical case. Two HIGH-severity issues require fixes before merge: the "at least 6 turns" guard unconditionally allows oversized messages that can exceed the model's context window, and the dynamic `import()` for `llmModels` should be a static import. Three MEDIUM issues address edge-case correctness (negative remaining budget, falsy zero contextLength, and the four divergent `estimateTokens` implementations across the codebase that were not consolidated as part of this change).
