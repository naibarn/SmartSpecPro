Now I have all the context I need. Let me generate the section content.

# Section 05: Monthly Budget Protection

## Overview

This section implements per-user monthly credit budget caps with tiered alerts that apply to ALL credit-consuming operations across the platform -- not just Google Drive operations. When a user's monthly spending reaches a configurable alert threshold (default 80%), they receive a notification. When spending reaches 100%, credit-consuming operations are blocked until the next month or the limit is increased.

The budget system wraps around the existing `deductCredits()` function in `creditService.ts`, checking and updating the `user_credit_budgets` table (created in section-02-database-schema) after each successful deduction.

## Dependencies

- **section-02-database-schema**: The `user_credit_budgets` table must exist with columns: `tenant_id varchar(36)`, `user_id integer`, `monthly_limit integer`, `credits_used_this_month integer default 0`, `budget_month_key varchar(7)` (format "YYYY-MM"), `alert_threshold_pct integer default 80`, `alert_sent boolean default false`, `hard_cap_reached boolean default false`. Unique constraint on `(tenant_id, user_id)`.
- **section-04-credit-billing**: The `deductCredits()` function must accept the `idempotencyKey` parameter and `metadata.service` tags (e.g., `library.upload_index`, `rag.semantic_search`, `gdrive.index`).

## Files to Create or Modify

### Files to Create

- `/home/dev/projects/SmartSpecPro/apps/web/server/services/budgetService.ts` -- Budget checking, updating, and reset logic
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/budgetService.test.ts` -- Tests for budget service
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/settings/BudgetPanel.tsx` -- UI for budget configuration and status display
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/settings/BudgetPanel.test.tsx` -- Tests for BudgetPanel component

### Files to Modify

- `/home/dev/projects/SmartSpecPro/apps/web/server/services/creditService.ts` -- Integrate budget check/update into `deductCredits()`
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/creditService.test.ts` -- Add budget-related tests to existing credit service tests
- `/home/dev/projects/SmartSpecPro/apps/web/server/routers/credits.ts` -- Add tRPC procedures for budget CRUD (get, set, reset)
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Settings.tsx` -- Add budget display to the Settings page (visible in billing tab and future Integrations tab)

---

## Tests (Write First)

### Budget Service Tests

File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/budgetService.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock db before imports
const { mockSelect, mockInsert, mockUpdate } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock("../db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  },
}));

import {
  getUserBudget,
  checkBudget,
  incrementBudgetUsage,
  resetBudgetIfNewMonth,
  setBudgetConfig,
} from "./budgetService";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getUserBudget", () => {
  // Test: returns null when no budget record exists for user
  // Test: returns budget record with current usage and limit when exists
  // Test: filters by both tenantId and userId
});

describe("checkBudget", () => {
  // Test: returns { allowed: true, ... } when usage is below limit
  // Test: returns { allowed: true, alert: true } when usage is at or above 80% threshold
  // Test: returns { allowed: false, reason: "hard_cap" } when usage >= 100% of limit
  // Test: returns { allowed: true } when no budget record exists (no limit set = unlimited)
  // Test: resets budget and returns allowed when budget_month_key is stale (new month)
  // Test: custom alert_threshold_pct is respected (e.g., 90% instead of default 80%)
  // Test: considers the cost of the pending operation (usage + pendingAmount > limit)
});

describe("incrementBudgetUsage", () => {
  // Test: increments credits_used_this_month by the deducted amount
  // Test: creates budget record with current month key if none exists (upsert)
  // Test: sets alert_sent=true and returns alert flag when threshold crossed
  // Test: sets hard_cap_reached=true when 100% reached
  // Test: does NOT re-send alert if alert_sent is already true
});

describe("resetBudgetIfNewMonth", () => {
  // Test: resets credits_used_this_month to 0 when month key changes
  // Test: clears alert_sent and hard_cap_reached flags on reset
  // Test: updates budget_month_key to current month
  // Test: no-op when month key matches current month
});

describe("setBudgetConfig", () => {
  // Test: creates new budget record with monthly_limit and alert_threshold_pct
  // Test: updates existing budget record (upsert on tenant_id + user_id)
  // Test: rejects negative monthly_limit
  // Test: rejects alert_threshold_pct outside 1-100 range
});
```

### Credit Service Budget Integration Tests

These tests should be added to the existing file at `/home/dev/projects/SmartSpecPro/apps/web/server/services/creditService.test.ts`.

```typescript
describe("deductCredits — budget integration", () => {
  // Test: deductCredits increments user_credit_budgets.credits_used_this_month
  //   After a successful deduction of N credits, the budget record's
  //   credits_used_this_month should increase by N.

  // Test: deductCredits triggers alert notification at 80% threshold
  //   When the deduction pushes usage past the alert_threshold_pct,
  //   the function should return an alertTriggered flag (caller can send notification).

  // Test: deductCredits blocks operation at 100% budget (hard cap)
  //   When credits_used_this_month >= monthly_limit, deductCredits should
  //   throw a BudgetExceededError (not InsufficientCreditsError) BEFORE
  //   attempting the actual deduction.

  // Test: budget resets when budget_month_key changes (new month)
  //   If the stored budget_month_key is "2026-01" but the current month
  //   is "2026-02", the budget should auto-reset before checking.

  // Test: budget check works for non-Drive operations (library.upload_index)
  //   The budget system is not Drive-specific. A deduction with
  //   metadata.service = "library.upload_index" should still check
  //   and update the budget.

  // Test: deductCredits works normally when user has no budget record (unlimited)
  //   If no row exists in user_credit_budgets for this user, deductCredits
  //   should behave exactly as before (no budget enforcement).
});
```

### Budget Panel UI Tests

File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/settings/BudgetPanel.test.tsx`

```typescript
import { describe, it, expect } from "vitest";

describe("BudgetPanel", () => {
  // Test: BudgetPanel shows progress bar with current/limit
  //   Renders a visual progress bar showing credits_used_this_month / monthly_limit.
  //   The bar should fill proportionally (e.g., 400/500 = 80%).

  // Test: BudgetPanel shows alert state when threshold reached
  //   When usage >= alert_threshold_pct, the progress bar changes to a
  //   warning color (amber/yellow) and a warning message is displayed.

  // Test: BudgetPanel shows hard cap state when 100% reached
  //   When usage >= monthly_limit, progress bar is red and a blocking
  //   message says "Monthly budget reached. [Increase] [Override]".

  // Test: budget configuration saves monthly_limit and alert_threshold_pct
  //   The panel includes input fields for monthly limit and alert threshold.
  //   Submitting the form calls the tRPC setBudget mutation.

  // Test: BudgetPanel shows "No budget set" when user has no budget record
  //   When there is no budget record, display a prompt to set up a budget
  //   with a "Set Budget" button.

  // Test: BudgetPanel shows current month label (e.g., "February 2026")
  //   The panel displays which month the budget applies to.
});
```

---

## Implementation Details

### 1. Budget Service (`budgetService.ts`)

Create `/home/dev/projects/SmartSpecPro/apps/web/server/services/budgetService.ts`.

This service provides pure budget logic, independent of the credit deduction flow. It is called by `creditService.ts` during deductions.

**Key functions to implement:**

```typescript
/**
 * Get the current month key in "YYYY-MM" format.
 */
export function getCurrentMonthKey(): string;

/**
 * Fetch the user's budget record. Returns null if no budget is configured.
 */
export async function getUserBudget(
  tenantId: string,
  userId: number
): Promise<UserCreditBudget | null>;

/**
 * Check if a pending credit operation is allowed under the user's budget.
 * If no budget record exists, the operation is always allowed (unlimited).
 * Handles month-key rollover automatically (resets if stale).
 *
 * Returns:
 *   { allowed: true, alert?: boolean, usagePct: number }
 *   { allowed: false, reason: "hard_cap", usagePct: number }
 */
export async function checkBudget(
  tenantId: string,
  userId: number,
  pendingAmount: number
): Promise<BudgetCheckResult>;

/**
 * Increment the budget usage counter after a successful credit deduction.
 * Handles upsert (creates record if none exists with the current month key).
 * Returns flags indicating whether alert or hard cap thresholds were crossed.
 */
export async function incrementBudgetUsage(
  tenantId: string,
  userId: number,
  amount: number,
  monthlyLimit?: number
): Promise<{ alertTriggered: boolean; hardCapReached: boolean }>;

/**
 * Reset budget counters when the month has rolled over.
 * Called automatically by checkBudget when budget_month_key is stale.
 */
export async function resetBudgetIfNewMonth(
  tenantId: string,
  userId: number,
  currentMonthKey: string
): Promise<void>;

/**
 * Set or update budget configuration for a user.
 * Used by the Settings UI. Validates inputs.
 */
export async function setBudgetConfig(
  tenantId: string,
  userId: number,
  config: { monthlyLimit: number; alertThresholdPct?: number }
): Promise<void>;
```

**Month rollover logic:** The `budget_month_key` column stores the current budget period as `"YYYY-MM"`. When `checkBudget()` or `incrementBudgetUsage()` detects that the stored key does not match `getCurrentMonthKey()`, it resets `credits_used_this_month` to 0, clears `alert_sent` and `hard_cap_reached`, and updates the key. This means no cron job or scheduled task is needed for resets -- they happen lazily on first access each month.

**Upsert behavior:** When `incrementBudgetUsage()` is called but no budget record exists for the user, it should create a record with `monthly_limit = 0` (meaning unlimited -- no enforcement) and track usage for informational purposes. Users must explicitly set a `monthly_limit > 0` via the Settings UI to activate enforcement.

### 2. Integrating Budget Check into `deductCredits()`

Modify `/home/dev/projects/SmartSpecPro/apps/web/server/services/creditService.ts`.

The `DeductCreditsParams` interface needs two new optional fields:

```typescript
export interface DeductCreditsParams {
  userId: number;
  amount: number;
  description: string;
  tenantId?: string;         // NEW: needed for budget lookup
  metadata?: {
    model?: string;
    provider?: string;
    tokensUsed?: number;
    costUsd?: number;
    endpoint?: string;
    traceId?: string;
    service?: string;        // NEW: service tag (e.g., "library.upload_index")
    [key: string]: any;
  };
}
```

The `deductCredits()` function should be modified with the following flow:

1. **Before the existing transaction:** If `tenantId` is provided, call `checkBudget(tenantId, userId, amount)`.
   - If `allowed === false`, throw a new `BudgetExceededError` (do NOT proceed with credit deduction).
   - If `allowed === true` with `alert === true`, flag for post-deduction notification.
2. **After the existing transaction succeeds:** If `tenantId` is provided, call `incrementBudgetUsage(tenantId, userId, amount)`.
3. **Return value extension:** Add optional `budgetAlert?: boolean` and `budgetUsagePct?: number` to the return object so callers know when to send alerts.

**Important:** The budget check happens BEFORE the credit deduction but OUTSIDE the database transaction. This means there is a small race window where two concurrent requests could both pass the budget check but collectively exceed the budget. This is acceptable because:
- The budget is a soft protection mechanism, not a hard financial constraint.
- The credit balance itself (in the `users` table) has its own atomic check via `WHERE credits >= amount`.
- Making the budget check part of the transaction would require cross-table locking, which hurts performance.

**Backward compatibility:** When `tenantId` is not provided (which is the case for all existing callers until they are updated), the budget logic is entirely skipped. This ensures zero regression.

### 3. Custom Error Class

Add to `creditService.ts` (or a shared errors file):

```typescript
export class BudgetExceededError extends Error {
  public readonly monthlyLimit: number;
  public readonly creditsUsed: number;
  public readonly budgetMonthKey: string;

  constructor(monthlyLimit: number, creditsUsed: number, budgetMonthKey: string) {
    super(`Monthly credit budget exceeded: ${creditsUsed}/${monthlyLimit} used in ${budgetMonthKey}`);
    this.name = "BudgetExceededError";
    this.monthlyLimit = monthlyLimit;
    this.creditsUsed = creditsUsed;
    this.budgetMonthKey = budgetMonthKey;
  }
}
```

Callers (tRPC routers, services) should catch `BudgetExceededError` separately from `"Insufficient credits"` to show the user the correct message: "Monthly budget reached" vs. "Not enough credits."

### 4. tRPC Procedures for Budget Management

Modify `/home/dev/projects/SmartSpecPro/apps/web/server/routers/credits.ts` to add these procedures:

```typescript
// getBudget: returns user's budget status (current usage, limit, thresholds, month label)
// Input: none (uses authenticated user context)
// Output: { monthlyLimit, creditsUsedThisMonth, budgetMonthKey, alertThresholdPct, alertSent, hardCapReached } | null

// setBudget: set or update the user's monthly budget configuration
// Input: z.object({ monthlyLimit: z.number().int().min(0), alertThresholdPct: z.number().int().min(1).max(100).optional() })
// Output: { success: true }

// resetBudget: remove the budget limit (set to unlimited)
// Input: none
// Output: { success: true }
```

These procedures use the authenticated user's `userId` and `tenantId` from the tRPC context. No admin role is required -- users manage their own budgets.

### 5. Pre-Sync Budget Check

For Google Drive sync operations (implemented in later sections), the budget service provides a pre-flight check. Before starting a sync that will index N files, the caller should:

1. Call `estimateIndexingCost(fileCount, totalSize)` (from section-04-credit-billing) to get the estimated credit cost.
2. Call `checkBudget(tenantId, userId, estimatedCost)` to verify the budget can accommodate it.
3. If the budget would be exceeded, queue the sync as "pending approval" instead of starting it. The user sees a notification: "Sync would cost ~X credits, exceeding your remaining budget of Y. [Approve anyway] [Cancel]".

This pre-sync check is documented here for context but is implemented in section-11-sync-webhooks. The `checkBudget()` function built in this section provides the necessary interface.

### 6. Budget Panel UI Component

Create `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/settings/BudgetPanel.tsx`.

This component renders inside the Settings page (billing tab) and later in the Google Drive dashboard (section-12-dashboard-ui).

**Component structure:**

```typescript
/**
 * BudgetPanel - displays and manages per-user monthly credit budget.
 *
 * Shows:
 * - Progress bar: credits_used_this_month / monthly_limit (color-coded)
 * - Month label (e.g., "February 2026")
 * - Usage percentage
 * - Alert/warning state when threshold is reached
 * - Hard cap state with "Increase" and "Override" actions
 * - Configuration form: monthly limit input, alert threshold slider/input
 *
 * Uses tRPC queries:
 * - credits.getBudget (query, refetch on focus)
 * - credits.setBudget (mutation)
 * - credits.resetBudget (mutation)
 *
 * Color states for progress bar:
 * - Green (bg-green-500): usage < alert threshold
 * - Amber (bg-amber-500): usage >= alert threshold but < 100%
 * - Red (bg-red-500): usage >= 100%
 */
export function BudgetPanel(): JSX.Element;
```

**UI layout:**
- Card with title "Monthly Credit Budget"
- If no budget set: simple message "No monthly budget configured" with a "Set Budget" button
- If budget set: progress bar, usage numbers, month label, edit button
- Edit mode: inline form with monthly limit number input, alert threshold percentage input (default 80), Save/Cancel buttons
- When hard cap reached: red banner with "Monthly budget of {limit} credits reached. [Increase Limit] [Remove Limit]"

**Integration with Settings page:**

The `BudgetPanel` should be added to the existing Settings page at `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Settings.tsx`. Add it to the `billing` tab content, below existing billing information. The component is self-contained and uses its own tRPC queries, so it only needs to be rendered in the right location.

### 7. Notification on Alert Threshold

When `incrementBudgetUsage()` detects that the alert threshold has been crossed (usage goes from below 80% to at or above 80%):

- Set `alert_sent = true` on the budget record to prevent duplicate alerts.
- The `deductCredits()` return value includes `budgetAlert: true`.
- The caller (typically a tRPC router or service) is responsible for sending the actual notification. Notification channels:
  - **In-app toast:** The tRPC mutation response includes the alert flag; the frontend shows a warning toast.
  - **Telegram (if connected):** If the user has a Telegram integration, send a budget warning message. This uses the existing Telegram notification infrastructure.

The budget service itself does NOT send notifications -- it only flags that an alert should be sent. This keeps the service focused and testable.

### 8. Handling the Hard Cap

When `checkBudget()` returns `{ allowed: false, reason: "hard_cap" }`:

- `deductCredits()` throws `BudgetExceededError` before attempting any credit deduction.
- The tRPC router catches this error and returns it as a TRPCError with code `PRECONDITION_FAILED` and a message explaining the budget limit.
- The frontend displays a banner: "Monthly budget reached. [Increase] [Override]"
  - **Increase:** Opens the budget configuration form with the current limit pre-filled.
  - **Override:** Temporarily allows the operation by calling the tRPC mutation with a `skipBudgetCheck: true` flag (which bypasses the budget check for that single deduction). This flag is NOT stored -- each override is per-operation.

The `skipBudgetCheck` flag is added to `DeductCreditsParams` as an optional boolean. When true, the budget check is skipped but the usage counter is still incremented (so the dashboard reflects actual spending).

---

## Summary of Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/web/server/services/budgetService.ts` | Create | Core budget logic: check, increment, reset, configure |
| `apps/web/server/services/budgetService.test.ts` | Create | Unit tests for budget service |
| `apps/web/server/services/creditService.ts` | Modify | Add budget pre-check and post-update to `deductCredits()`, add `BudgetExceededError`, extend `DeductCreditsParams` |
| `apps/web/server/services/creditService.test.ts` | Modify | Add budget integration tests |
| `apps/web/server/routers/credits.ts` | Modify | Add `getBudget`, `setBudget`, `resetBudget` tRPC procedures |
| `apps/web/client/src/components/settings/BudgetPanel.tsx` | Create | Budget configuration and status UI component |
| `apps/web/client/src/components/settings/BudgetPanel.test.tsx` | Create | UI component tests |
| `apps/web/client/src/pages/Settings.tsx` | Modify | Render `BudgetPanel` in the billing tab |