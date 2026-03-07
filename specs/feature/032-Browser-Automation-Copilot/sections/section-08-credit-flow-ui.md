# Section 08: Credit Flow + Frontend UI

## Overview

This section implements the **parent reservation pattern** for credit coordination between the automation copilot and the browser tool, adds a **cost estimate** to the analyze response from Python, and enhances the **AutomationChatModal** UI with mode toggles, cost breakdowns, budget inputs, live progress, citations, and allowed-domains input.

**Depends on**: section-03 (Responses API), section-06 (search cache), section-07 (MCP tools)

---

## Background and Problem Statement

The automation copilot pre-reserves 100 credits (constant `CREDIT_RESERVE_AMOUNT` in `apps/web/server/routers/automationCopilot.ts`). When it internally calls the browser tool route (`POST /api/internal/tools/browser`), the browser tool independently pre-reserves 20 more credits (`BROWSER_RESERVE_CREDITS` in `apps/web/server/routes/browserTool.ts`). This can double-deduct 120 credits when the actual cost might only be 30.

The solution is a **parent reservation pattern**: the copilot creates a reservation and passes its ID to child tool calls, which draw from the parent pool instead of creating their own.

---

## Tests

### 8.1: Credit Reservation Tests

**File**: `apps/web/server/__tests__/creditReservation.test.ts`

```typescript
import { describe, it, expect, vi } from "vitest";

// === Parent reservation pattern ===
// Test: create reservation -> returns reservation_id with reserved amount
// Test: draw from reservation -> deducts from parent pool
// Test: draw exceeding remaining reservation -> rejected
// Test: refund unused reservation -> credits returned to user
// Test: parent_reservation_id only accepted with X-Internal-Token
// Test: external request without internal token -> creates own reservation

// === Cost estimate ===
// Test: analyze response includes cost_estimate
// Test: estimated_credits formula: (tasks*15) + (llm_calls*5) + (searches*10)
// Test: max_possible_credits includes retry overhead
```

Each test should mock the database and Redis layer. The reservation functions are new exports from `creditService.ts`, so tests should verify the public API surface:

- `createCreditReservation(userId, amount, sourceType, metadata)` returns `{ reservationId, reservedAmount, transactionId }`
- `drawFromReservation(reservationId, amount, description)` returns `{ drawn, remaining }` or throws if amount exceeds remaining
- `refundReservation(reservationId)` returns the unused amount refunded

### 8.2: AutomationChatModal UI Tests

**File**: `apps/web/client/src/components/automation/__tests__/AutomationChatModal.test.tsx`

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

// Test: research+browse mode toggle renders
// Test: cost estimate card displays breakdown
// Test: budget input field accepts numeric value
// Test: progress status updates shown during execution
// Test: citations panel shows source URLs
// Test: allowed domains input renders multi-tag input
```

These are render-level tests verifying the new UI elements appear in the DOM. Use a wrapper providing the tRPC context with mocked queries.

---

## Implementation Details

### 8.1: Credit Reservation Service

**File to modify**: `apps/web/server/services/creditService.ts`

Add three new exported functions and a supporting type:

```typescript
export interface CreditReservation {
  reservationId: string;       // UUID
  userId: number;
  reservedAmount: number;
  drawnAmount: number;
  transactionId: number;       // The deductCredits transaction ID
  sourceType: CreditSourceType;
  createdAt: Date;
  expiresAt: Date;             // Auto-refund after TTL (e.g. 10 minutes)
}

export async function createCreditReservation(
  userId: number,
  amount: number,
  sourceType: CreditSourceType,
  metadata?: Record<string, any>,
): Promise<CreditReservation>;
  // 1. Call deductCredits() to reserve the full amount
  // 2. Store reservation state in Redis: key `credit:reservation:{reservationId}`
  //    value: JSON of { userId, reservedAmount, drawnAmount: 0, transactionId, expiresAt }
  // 3. Set Redis TTL to 600 seconds (10 minutes safety net)
  // 4. Return the reservation object

export async function drawFromReservation(
  reservationId: string,
  amount: number,
  description: string,
): Promise<{ drawn: number; remaining: number }>;
  // 1. Read reservation from Redis
  // 2. If drawnAmount + amount > reservedAmount, throw "Reservation budget exceeded"
  // 3. Atomically increment drawnAmount in Redis
  // 4. Return { drawn: amount, remaining: reservedAmount - drawnAmount - amount }
  // Note: no additional deductCredits call -- credits were already deducted at reservation time

export async function refundReservation(
  reservationId: string,
): Promise<{ refundedAmount: number }>;
  // 1. Read reservation from Redis
  // 2. Calculate unused = reservedAmount - drawnAmount
  // 3. If unused > 0, call refundCredits({ userId, amount: unused, ... })
  // 4. Delete reservation from Redis
  // 5. Return { refundedAmount: unused }
```

The reservation state lives in Redis (not a new DB table) because it is short-lived (max 10 minutes) and high-frequency. A Redis TTL acts as a safety net; if the process crashes, the TTL-expiry triggers cleanup (though auto-refund on TTL expiry requires a separate periodic check or can be accepted as a known edge case for now).

### 8.2: Browser Tool Route -- Accept parent_reservation_id

**File to modify**: `apps/web/server/routes/browserTool.ts`

In the main handler (`POST /api/internal/tools/browser`), add logic to accept an optional `parent_reservation_id` field in the request body:

- Only honored when the request also has a valid `X-Internal-Token` (verified via `verifyInternalToken(req)`)
- If `parent_reservation_id` is present and valid:
  - Call `drawFromReservation(parent_reservation_id, BROWSER_RESERVE_CREDITS, "browser tool draw")` instead of calling `deductCredits()` and `hasEnoughCredits()` separately
  - On Python service success, do NOT call `refundCredits()` for the difference -- the parent reservation handles final reconciliation
  - On Python service failure, do NOT refund either -- the parent reservation will refund any unused portion at the end
- If no `parent_reservation_id`: proceed with existing independent reservation logic (unchanged)

This means the existing credit flow for direct browser tool calls (not via copilot) remains untouched.

### 8.3: Automation Copilot Router -- Use Reservations

**File to modify**: `apps/web/server/routers/automationCopilot.ts`

In the `execute` mutation (around line 168-184):

1. Replace the direct `deductCredits()` call with `createCreditReservation(ctx.user.id, CREDIT_RESERVE_AMOUNT, "browser_automation", { taskId, executionId })`
2. Pass the `reservationId` to the Python backend in the request body so it can be forwarded to internal browser tool calls
3. When the Python backend responds, pass the `reservationId` in the `callPythonBackend` body
4. After execution completes (success or failure), call `refundReservation(reservationId)` to return any unused credits
5. On Python backend error, also call `refundReservation(reservationId)` (the full amount minus any draws will be returned)

The Python backend needs to forward the `reservation_id` when it makes internal calls to the Node browser tool route. This requires:

**File to modify**: `python-backend/app/api/automation_copilot.py` (or whichever file calls the browser tool)

- Accept `reservation_id` in the execute request body
- Forward it as `parent_reservation_id` in the browser tool HTTP call headers/body

### 8.4: Cost Estimate in Analyze Response

**File to modify**: `python-backend/app/api/automation_copilot.py`

Add Pydantic models and populate the cost estimate after intent analysis:

```python
class CostEstimate(BaseModel):
    estimated_credits: int
    breakdown: dict[str, int]
    max_possible_credits: int

class AnalyzeResponse(BaseModel):
    status: str
    intent: AutomationIntent | None = None
    cost_estimate: CostEstimate | None = None
```

The cost formula:
- `estimated_credits = (num_browser_tasks * 15) + (num_llm_calls * 5) + (num_web_searches * 10)`
- `num_browser_tasks` comes from the analyzed intent's `browser_tasks` list length
- `num_llm_calls` is estimated at `num_browser_tasks + 1` (1 for analysis, 1 per task for vision/script gen)
- `num_web_searches` defaults to 0 unless the intent includes search tasks
- `max_possible_credits` adds retry overhead: `estimated_credits * 1.5` (for up to 3 heal retries per task) plus a fixed buffer of 20 credits

### 8.5: Frontend UI Enhancements

**File to modify**: `apps/web/client/src/components/automation/AutomationChatModal.tsx`

Add the following new state variables and UI elements:

**New state:**
```typescript
const [mode, setMode] = useState<"search" | "browse">("browse");
const [budgetCredits, setBudgetCredits] = useState<number | null>(null);
const [costEstimate, setCostEstimate] = useState<CostEstimate | null>(null);
const [citations, setCitations] = useState<Array<{ url: string; title?: string; retrievedAt?: string }>>([]);
const [additionalDomains, setAdditionalDomains] = useState<string[]>([]);
```

**UI elements to add (in the idle state section):**

1. **Research + Browse mode toggle** -- A pair of radio buttons or a segmented control above the prompt input:
   - "Search Only" (icon: `Search`) -- only uses web search, no browser automation
   - "Search + Browse" (icon: `Globe`) -- enables both web search and browser automation
   - The selected mode is passed to the analyze mutation

2. **Allowed domains input** -- A multi-tag input field below the prompt:
   - User types a domain and presses Enter to add it as a tag
   - Tags are displayed as removable chips
   - These are merged with tenant-level allowed domains server-side
   - Only shown when mode is "browse"

**UI elements to add (in the preview_ready state):**

3. **Cost estimate card** -- Displayed when `costEstimate` is not null:
   - Total estimated credits with a breakdown list (LLM calls, browser actions, web search)
   - Max possible credits shown in lighter text
   - Uses existing card styling patterns from the codebase

4. **Budget input field** -- An optional numeric input for setting max credits:
   - Label: "Max budget (credits)"
   - Placeholder: "No limit"
   - Value passed to the execute mutation

**UI elements to add (in the executing state):**

5. **Progress status updates** -- Enhanced version of the existing polling display:
   - Show the current step name from the status response (e.g., "Analyzing intent...", "Searching web...", "Browsing page...", "Extracting data...")
   - Show accumulated cost so far (from status response)
   - Show remaining budget if cap is set

**UI elements to add (in the success state):**

6. **Citations panel** -- A collapsible section:
   - Lists source URLs with optional titles
   - Shows `retrieved_at` timestamp for each citation
   - Uses `ChevronDown`/`ChevronUp` toggle pattern already in the component

**Polling integration:**

Update the `startPolling` callback to extract and set `costEstimate` and `citations` from the status response:

```typescript
if (status.cost_estimate) {
  setCostEstimate(status.cost_estimate as CostEstimate);
}
if (status.citations) {
  setCitations(status.citations as Array<{ url: string; title?: string; retrievedAt?: string }>);
}
```

### 8.6: Status Response Enrichment

**File to modify**: `apps/web/server/routers/automationCopilot.ts`

The `getStatus` query already returns the raw Python response. The Python backend needs to include richer status fields in its response:

**File to modify**: `python-backend/app/api/automation_copilot.py`

The status endpoint should return these additional fields when available:
- `current_step`: string describing the active operation
- `web_search_count`: number of web searches performed so far
- `browser_action_index`: current browser action index
- `accumulated_cost`: credits used so far
- `remaining_budget`: credits remaining if a budget cap was set
- `citations`: array of `{ url, title, retrieved_at }` from web search results

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `apps/web/server/services/creditService.ts` | Modify | Add `createCreditReservation`, `drawFromReservation`, `refundReservation` |
| `apps/web/server/routes/browserTool.ts` | Modify | Accept `parent_reservation_id`, draw from parent instead of independent reserve |
| `apps/web/server/routers/automationCopilot.ts` | Modify | Use reservation pattern in `execute`, pass `reservationId` to Python |
| `python-backend/app/api/automation_copilot.py` | Modify | Add `CostEstimate` to analyze response, enrich status response, forward `reservation_id` |
| `apps/web/client/src/components/automation/AutomationChatModal.tsx` | Modify | Mode toggle, cost estimate card, budget input, progress display, citations panel, domains input |
| `apps/web/server/__tests__/creditReservation.test.ts` | Create | Tests for reservation pattern |
| `apps/web/client/src/components/automation/__tests__/AutomationChatModal.test.tsx` | Create | Tests for new UI elements |

---

## Key Design Decisions

1. **Redis-based reservations, not a DB table**: Reservations are ephemeral (max 10 minutes). Redis provides atomic operations and automatic TTL cleanup. The actual credit deduction/refund still uses the DB-backed `deductCredits`/`refundCredits` functions for durability.

2. **Parent reservation ID over skip flag**: A `skip_credit_reserve: true` flag would be a trust boundary violation -- any caller could skip credit checks. The reservation ID is a capability token that proves credits were already reserved, and it is only accepted with a valid `X-Internal-Token`.

3. **Cost estimate is approximate**: The formula `(tasks*15) + (llm_calls*5) + (searches*10)` is an estimate shown to the user before execution. Actual costs depend on token usage, retries, and tool rounds. The `max_possible_credits` provides an upper bound.

4. **Mode toggle affects analyze, not execute**: The "Search Only" vs "Search + Browse" mode is passed during the analyze phase. The intent analysis then decides which tools to plan for. The execute phase follows whatever the intent specifies.
