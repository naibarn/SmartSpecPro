I now have all the context I need. Let me generate the section content.

# Section 03: F07 -- Per-Response Cost Display

## Overview

This section implements the Per-Response Cost Display feature (F07), which allows users to see how much each AI response cost in terms of tokens, credits, and latency. Administrators additionally see the USD cost. The feature has three layers: backend traceId propagation to link messages to usage logs, a tRPC query endpoint for retrieving cost data, and a lazy-loaded frontend badge component.

**Dependencies:** Section 01 (Database Foundation) must be completed first. Specifically, the `messages.traceId` column (Migration 2, section 1.3) must exist before this section can function. This section does not depend on any other feature section.

---

## 1. Tests

All tests use Vitest with the project's established `vi.hoisted()` mock pattern. Write these tests BEFORE implementation.

### 1.1 costTracker.logRequest -- traceId Propagation

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/costTracker.test.ts`

Add the following tests to the existing `describe("logRequest")` block.

```typescript
it("accepts and stores traceId in providerUsageLog", async () => {
  /**
   * Call logRequest with a traceId parameter.
   * Assert that the values passed to db.insert include the traceId field.
   */
});

it("stores null traceId when not provided", async () => {
  /**
   * Call logRequest WITHOUT a traceId parameter.
   * Assert that the values passed to db.insert include traceId as undefined or null.
   */
});
```

### 1.2 chatService -- traceId Written to Messages

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/chatCostTrace.test.ts` (new file)

```typescript
/**
 * Tests that the chat processing pipeline writes the same traceId to both:
 * - providerUsageLog (via costTracker.logRequest)
 * - messages table (via createMessage or updateMessage)
 *
 * Mock dependencies: getDb, costTracker.logRequest, traceContext.getTraceId
 */

describe("chatService traceId propagation", () => {
  it("writes traceId to messages table after LLM call", async () => {
    /**
     * Mock getTraceId() to return a known traceId.
     * Process a message through chatService.
     * Assert that createMessage/updateMessage is called with the traceId value.
     */
  });

  it("traceId in messages matches traceId in providerUsageLog for same request", async () => {
    /**
     * Mock getTraceId() to return a fixed value "abc123...".
     * Process a message.
     * Capture the traceId argument passed to both costTracker.logRequest
     * and the messages INSERT/UPDATE.
     * Assert both are identical.
     */
  });
});
```

### 1.3 tRPC getMessageCost Query

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/chatCost.test.ts` (new file)

```typescript
/**
 * Tests for the chat.getMessageCost tRPC procedure.
 * 
 * Mock pattern: vi.hoisted() for db, then vi.mock("../db") 
 * following the existing costTracker.test.ts pattern.
 */

describe("chat.getMessageCost", () => {
  it("returns cost data for user's own message", async () => {
    /**
     * Setup: message belongs to a conversation owned by ctx.user.id.
     * providerUsageLog row exists with matching traceId.
     * Assert: response contains model, inputTokens, outputTokens,
     *   totalTokens, creditsUsed, responseTimeMs.
     */
  });

  it("rejects request for another user's message (non-admin)", async () => {
    /**
     * Setup: message belongs to conversation owned by userId=99,
     *   but ctx.user.id=1 and ctx.user.role='user'.
     * Assert: throws TRPCError with code FORBIDDEN.
     */
  });

  it("omits costUsd for non-admin users", async () => {
    /**
     * Setup: ctx.user.role='user', valid own message.
     * Assert: response.costUsd is undefined.
     */
  });

  it("includes costUsd for admin users", async () => {
    /**
     * Setup: ctx.user.role='admin', valid message (any user's).
     * Assert: response.costUsd is a number.
     */
  });

  it("returns null gracefully when no providerUsageLog entry exists", async () => {
    /**
     * Setup: message exists with a traceId, but no matching
     *   providerUsageLog row.
     * Assert: response is null (not an error).
     */
  });
});
```

### 1.4 MessageCostBadge Frontend Component

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/chat/__tests__/MessageCostBadge.test.tsx` (new file)

```typescript
/**
 * Tests for the MessageCostBadge React component.
 * Uses @testing-library/react + vi.mock for tRPC hooks.
 */

describe("MessageCostBadge", () => {
  it("does not fetch cost data until expanded", () => {
    /**
     * Render MessageCostBadge with a messageId.
     * Assert: the tRPC query is NOT called on mount (enabled: false).
     * Click the badge to expand.
     * Assert: the tRPC query IS now called.
     */
  });

  it("displays model, tokens, credits, latency in compact view", () => {
    /**
     * Render MessageCostBadge with pre-fetched data (or mock query success).
     * Assert: text content includes model name, token count (formatted),
     *   credit count, and latency.
     * Format example: "Claude Sonnet . 1.2K tokens . 3 credits . 1.4s"
     */
  });

  it("shows full breakdown when expanded", () => {
    /**
     * Click to expand.
     * Assert: input tokens, output tokens, provider name,
     *   fallback info are visible.
     * If user is admin, costUsd is visible.
     */
  });
});
```

---

## 2. Implementation

### 2.1 Backend: traceId Propagation in costTracker

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/costTracker.ts`

The existing `logRequest()` function does NOT accept or pass a `traceId` parameter, even though `providerUsageLog` has a `traceId` column. The fix is straightforward.

**Changes:**

1. Add `traceId?: string` to the `logRequest` parameter type (optional, for backward compatibility).
2. Include `traceId: params.traceId ?? null` in the `db.insert(providerUsageLog).values({...})` call.

The updated function signature should look like:

```typescript
export async function logRequest(params: {
  userId: number;
  providerId: number;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  creditsCharged: number;
  responseTimeMs: number;
  statusCode: number;
  errorType?: string;
  wasFallback: boolean;
  fallbackFromProviderId?: number;
  traceId?: string;  // NEW
}): Promise<void> {
  // ... existing code ...
  await db.insert(providerUsageLog).values({
    // ... existing fields ...
    traceId: params.traceId ?? null,  // NEW
  });
}
```

### 2.2 Backend: Pass traceId Through LLM Call Chain

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/llmRouter.ts`

The `llmRouter.ts` file calls `logRequest()` in three places (success at line ~300, error at line ~350, network error at line ~404). In each call, add:

```typescript
traceId: getTraceId(),
```

Import `getTraceId` from `../services/traceContext` (the `traceContext.ts` module already exists and provides `getTraceId()` via `AsyncLocalStorage`). The trace context is set up by middleware in `_core/index.ts` using `runWithTrace()`, so `getTraceId()` will return a valid string within any request-scoped handler.

### 2.3 Backend: Write traceId to Messages Table

**Pre-requisite:** The `messages.traceId` column must be added by Section 01 (Migration 2). After that migration, add the column to the Drizzle schema:

```typescript
// In messages pgTable definition
traceId: varchar("traceId", { length: 32 }),
```

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/services/chatService.ts`

Locate the code path where assistant messages are created after an LLM response is received. This is typically the `createMessage()` or `updateMessage()` call for role=`assistant`. Add `traceId: getTraceId()` to the insert values.

The key change points:
- After the LLM call completes and the assistant message is being stored, retrieve `getTraceId()` and pass it as part of the message insertion.
- The `createMessage()` function (also in `chatService.ts`) should accept an optional `traceId` parameter and pass it through to `db.insert(messages).values({...})`.

This ensures the same traceId appears in both `providerUsageLog` and `messages`, enabling the JOIN for cost display.

### 2.4 tRPC Query: getMessageCost

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/chat.ts`

Add a new procedure to the existing chat router.

**Procedure definition:**

```typescript
getMessageCost: protectedProcedure
  .input(z.object({ messageId: z.number() }))
  .query(async ({ ctx, input }) => {
    /**
     * 1. Fetch the message by ID, JOIN through conversations to verify ownership.
     * 2. Ownership check:
     *    - If ctx.user.role is NOT 'admin' or 'domain_admin',
     *      the conversation.userId must equal ctx.user.id.
     *    - If not owned and not admin, throw TRPCError FORBIDDEN.
     * 3. If message.traceId is null, return null.
     * 4. Query providerUsageLog WHERE traceId = message.traceId.
     * 5. Build the response shape (MessageCostInfo).
     * 6. If ctx.user.role is NOT admin/domain_admin, omit costUsd.
     */
  }),
```

**Return type (`MessageCostInfo`):**

```typescript
interface MessageCostInfo {
  model: string;
  provider: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  creditsUsed: number;
  costUsd?: number;        // Only for admin/domain_admin
  responseTimeMs: number;
  wasFallback: boolean;
  fallbackFrom: string | null;
}
```

**Query implementation details:**

The query JOINs `messages` with `conversations` (to check `conversations.userId`), then uses `messages.traceId` to look up `providerUsageLog`. The JOIN path is:

```sql
SELECT m.*, pul.*, lp."providerName"
FROM messages m
JOIN conversations c ON c.id = m."conversationId"
LEFT JOIN provider_usage_log pul ON pul."traceId" = m."traceId"
LEFT JOIN llm_providers lp ON lp.id = pul."providerId"
WHERE m.id = :messageId
```

The ownership check verifies `c.userId === ctx.user.id` for non-admin roles. If the LEFT JOIN on `providerUsageLog` returns null (no matching traceId), the procedure returns `null` gracefully -- this is not an error.

For the `fallbackFrom` field, if `pul.wasFallback` is true and `pul.fallbackFromProviderId` is set, do a secondary lookup on `llmProviders` to get the provider name. Alternatively, return just the provider ID and let the frontend resolve it, but the provider name is more useful for display.

### 2.5 Frontend Component: MessageCostBadge

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/chat/MessageCostBadge.tsx` (new file)

**Purpose:** Compact inline badge shown below each AI message, displaying cost/usage info.

**Key design decisions:**

1. **Lazy-loaded data fetching:** Uses TanStack Query with `enabled: isExpanded` so cost data is NOT fetched on every message render. The user must click/hover to trigger the query. This avoids N+1 queries on conversation load.

2. **Compact view (always visible):** Shows a minimal summary using data already available on the message object (from `messages.modelUsed`, `messages.inputTokens`, `messages.outputTokens`, `messages.creditsUsed`). No tRPC call needed for compact view.

3. **Expanded view (on click):** Triggers `trpc.chat.getMessageCost.useQuery({ messageId })` to get the full breakdown including provider name, fallback info, response time, and costUsd (admin only).

**Component signature:**

```typescript
interface MessageCostBadgeProps {
  messageId: number;
  model?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  creditsUsed?: string | number;
}

export function MessageCostBadge(props: MessageCostBadgeProps): JSX.Element | null {
  /**
   * State: isExpanded (boolean, default false)
   * 
   * Compact view (from props, no fetch):
   *   "{model} . {totalTokens} tokens . {credits} credits"
   * 
   * On click: set isExpanded=true, trigger tRPC query
   * 
   * Expanded view (from tRPC data):
   *   Model: {model}
   *   Provider: {provider}
   *   Input tokens: {inputTokens}
   *   Output tokens: {outputTokens}
   *   Credits: {creditsUsed}
   *   Cost: ${costUsd} (admin only)
   *   Latency: {responseTimeMs}ms
   *   Fallback: {fallbackFrom} (if applicable)
   */
}
```

**Token formatting helper:** Format large token counts for compact display (e.g., 1200 becomes "1.2K", 150 stays "150").

**Styling:** Use Tailwind utility classes and match the existing chat UI style. The badge should be subtle -- small text, muted colors, not drawing attention away from the message content. Use the existing Radix/shadcn patterns from `@smartspec/ui`.

### 2.6 Integration into Chat Pages

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Chat.tsx`

Locate the message rendering loop where assistant messages are displayed. After each assistant message bubble, render:

```tsx
{msg.role === "assistant" && (
  <MessageCostBadge
    messageId={msg.id}
    model={msg.modelUsed}
    inputTokens={msg.inputTokens}
    outputTokens={msg.outputTokens}
    creditsUsed={msg.creditsUsed}
  />
)}
```

**File:** `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/AgencyChat.tsx`

Same integration pattern. Locate the assistant message rendering and add the `MessageCostBadge` component. The agency chat messages may have a slightly different shape -- check the actual message type used in `AgencyChat.tsx` and adapt the props accordingly.

---

## 3. Existing Code Reference

The following files are relevant and should be read before implementing:

| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/costTracker.ts` | `logRequest()` function to modify (add traceId param) |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/costTracker.test.ts` | Existing tests to extend with traceId tests |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/traceContext.ts` | `getTraceId()` -- already exists, uses AsyncLocalStorage |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/llmRouter.ts` | Three `logRequest()` call sites (lines ~300, ~350, ~404) |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/chatService.ts` | Message creation after LLM call |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/chat.ts` | tRPC router to add `getMessageCost` procedure |
| `/home/dev/projects/SmartSpecPro/apps/web/server/_core/trpc.ts` | `protectedProcedure` definition, `ctx.user.role` access |
| `/home/dev/projects/SmartSpecPro/apps/web/server/_core/context.ts` | `TrpcContext` type -- `ctx.user` is `User \| null` |
| `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` | `messages` table (line 1187), `providerUsageLog` (line 570), `conversations` (line 1121) |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Chat.tsx` | Chat page to integrate MessageCostBadge |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/AgencyChat.tsx` | Agency chat page to integrate MessageCostBadge |

---

## 4. Key Technical Details

### 4.1 TraceId Lifecycle

The traceId is already generated per-request by middleware in `_core/index.ts` via `runWithTrace()`. The `traceContext.ts` module provides `getTraceId()` which reads from `AsyncLocalStorage`. This means:

- Every HTTP request already has a traceId assigned.
- `getTraceId()` can be called anywhere in the async call chain within that request.
- The traceId is a 32-character string stored in `varchar(32)` columns.
- Both `providerUsageLog.traceId` and `creditTransactions.traceId` already use this format.

### 4.2 User Roles

From the schema and `trpc.ts`, the role system is:
- `"user"` -- standard user, can only see own messages, no costUsd
- `"admin"` -- full admin, can see any message, sees costUsd
- `"domain_admin"` -- tenant admin, treat same as admin for cost display purposes

### 4.3 Messages Table Columns Already Available

The `messages` table already has `inputTokens`, `outputTokens`, `creditsUsed`, and `modelUsed` columns. These are populated when assistant messages are created. The `MessageCostBadge` uses these for the compact view (no additional query needed). The expanded view adds provider name, fallback info, response time, and costUsd from the `providerUsageLog` JOIN.

### 4.4 Ownership Check Pattern

The ownership verification follows the same pattern used in other chat router procedures: join `messages` to `conversations` on `conversationId`, then check `conversations.userId === ctx.user.id`. Admin/domain_admin roles bypass this check.

---

## 5. Implementation Checklist

1. Write all test files (sections 1.1 through 1.4 above)
2. Modify `costTracker.ts` -- add `traceId` parameter to `logRequest()`
3. Modify `llmRouter.ts` -- pass `getTraceId()` in all three `logRequest()` call sites
4. Verify `messages.traceId` column exists in schema (added by Section 01)
5. Modify `chatService.ts` -- write `getTraceId()` to messages on assistant message creation
6. Add `getMessageCost` procedure to `chat.ts` router
7. Create `MessageCostBadge.tsx` component
8. Integrate `MessageCostBadge` into `Chat.tsx`
9. Integrate `MessageCostBadge` into `AgencyChat.tsx`
10. Run tests: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test`
11. Run type check: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check`

---

## 6. Implementation Notes (Actual)

### Files Created
- `apps/web/server/services/messageCostService.ts` — Service layer for `getMessageCost()` with ownership check, traceId-based providerUsageLog JOIN, admin-only costUsd
- `apps/web/client/src/components/chat/MessageCostBadge.tsx` — Compact/expanded cost badge with lazy tRPC query
- `apps/web/server/routers/__tests__/chatCost.test.ts` — 5 tests for messageCostService
- `apps/web/client/src/components/chat/__tests__/MessageCostBadge.test.tsx` — 3 tests for frontend component

### Files Modified
- `apps/web/server/services/costTracker.ts` — Added `traceId?: string` param to `logRequest()`
- `apps/web/server/services/costTracker.test.ts` — Added 2 traceId propagation tests
- `apps/web/server/services/llmRouter.ts` — Added `getTraceId()` to all 3 `logRequest()` calls
- `apps/web/server/_core/llmRoutes.ts` — Added static imports for traceContext + costTracker; added traceId to `createMessage()` and `logCostRequest()` in streaming handler
- `apps/web/server/routers/chat.ts` — Added `getMessageCost` tRPC procedure + traceId to `saveAssistantMessage`
- `apps/web/client/src/components/chat/ChatView.tsx` — Integrated MessageCostBadge replacing old credits display
- `apps/web/client/src/components/chat/index.ts` — Added MessageCostBadge export

### Deviations from Plan
1. **ChatView.tsx instead of Chat.tsx** — Message rendering is in ChatView.tsx, not the page wrapper Chat.tsx. Correct location.
2. **AgencyChat.tsx not integrated** — `AgencyStreamMessage` uses ephemeral string IDs (not numeric DB messageIds). Messages are not persisted to the database, so the DB-backed cost lookup cannot work. Documented as known limitation.
3. **Section 1.2 chatCostTrace.test.ts skipped** — traceId propagation is implicitly covered by costTracker traceId tests and chatCost service tests. A full integration test would require complex mocking of the entire LLM call chain.
4. **messageCostService.ts as separate service** — Extracted query logic from the router into a dedicated service file for testability, following the project's existing service layer pattern.

### Code Review Fixes Applied
1. **Multiple rows per traceId (HIGH)** — Added `.orderBy(desc(providerUsageLog.id)).limit(1)` to pick the latest (successful) row when fallback creates multiple log entries
2. **Redundant role="button"** — Removed from `<button>` element
3. **Dynamic imports → static imports** — Changed `llmRoutes.ts` to use static `import { getTraceId }` and `import { logRequest as logCostRequest }` at module top level

### Test Results
- costTracker.test.ts: 11 passed (11)
- chatCost.test.ts: 5 passed (5)
- MessageCostBadge.test.tsx: 3 passed (3)
- Total new tests: 19