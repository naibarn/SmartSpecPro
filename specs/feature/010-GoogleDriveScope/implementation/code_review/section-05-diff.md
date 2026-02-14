diff --git a/apps/web/client/src/components/settings/BudgetPanel.tsx b/apps/web/client/src/components/settings/BudgetPanel.tsx
new file mode 100644
index 0000000..0e91db4
--- /dev/null
+++ b/apps/web/client/src/components/settings/BudgetPanel.tsx
@@ -0,0 +1,218 @@
+/**
+ * BudgetPanel - per-user monthly credit budget management.
+ */
+
+import { useState } from "react";
+import { trpc } from "@/lib/trpc";
+import { Button } from "@/components/ui/button";
+import { Input } from "@/components/ui/input";
+import { toast } from "sonner";
+
+function formatMonth(key: string): string {
+  const [y, m] = key.split("-");
+  const date = new Date(parseInt(y), parseInt(m) - 1);
+  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
+}
+
+export function BudgetPanel() {
+  const [editing, setEditing] = useState(false);
+  const [limitInput, setLimitInput] = useState("");
+  const [thresholdInput, setThresholdInput] = useState("80");
+
+  const budgetQuery = trpc.credits.getBudget.useQuery(undefined, {
+    refetchOnWindowFocus: true,
+  });
+  const setBudgetMut = trpc.credits.setBudget.useMutation({
+    onSuccess: () => {
+      budgetQuery.refetch();
+      setEditing(false);
+      toast.success("Budget updated");
+    },
+    onError: (err) => toast.error(err.message),
+  });
+  const resetBudgetMut = trpc.credits.resetBudget.useMutation({
+    onSuccess: () => {
+      budgetQuery.refetch();
+      toast.success("Budget limit removed");
+    },
+    onError: (err) => toast.error(err.message),
+  });
+
+  const budget = budgetQuery.data;
+
+  const handleSave = () => {
+    const limit = parseInt(limitInput);
+    const threshold = parseInt(thresholdInput);
+    if (isNaN(limit) || limit < 0) {
+      toast.error("Monthly limit must be a non-negative number");
+      return;
+    }
+    if (isNaN(threshold) || threshold < 1 || threshold > 100) {
+      toast.error("Alert threshold must be between 1 and 100");
+      return;
+    }
+    setBudgetMut.mutate({ monthlyLimit: limit, alertThresholdPct: threshold });
+  };
+
+  const startEditing = () => {
+    setLimitInput(String(budget?.monthlyLimit ?? 500));
+    setThresholdInput(String(budget?.alertThresholdPct ?? 80));
+    setEditing(true);
+  };
+
+  // No budget configured
+  if (!budget || budget.monthlyLimit <= 0) {
+    return (
+      <div className="rounded-lg border p-4">
+        <h3 className="text-base font-semibold mb-2">Monthly Credit Budget</h3>
+        {!editing ? (
+          <div>
+            <p className="text-sm text-gray-500 mb-3">
+              No monthly budget configured. Set a limit to track and control spending.
+            </p>
+            <Button size="sm" variant="outline" onClick={startEditing}>
+              Set Budget
+            </Button>
+          </div>
+        ) : (
+          <div className="space-y-3">
+            <div>
+              <label className="text-sm font-medium">Monthly Limit (credits)</label>
+              <Input
+                type="number"
+                min={0}
+                value={limitInput}
+                onChange={(e) => setLimitInput(e.target.value)}
+                className="mt-1"
+              />
+            </div>
+            <div>
+              <label className="text-sm font-medium">Alert Threshold (%)</label>
+              <Input
+                type="number"
+                min={1}
+                max={100}
+                value={thresholdInput}
+                onChange={(e) => setThresholdInput(e.target.value)}
+                className="mt-1"
+              />
+            </div>
+            <div className="flex gap-2">
+              <Button size="sm" onClick={handleSave} disabled={setBudgetMut.isPending}>
+                Save
+              </Button>
+              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
+                Cancel
+              </Button>
+            </div>
+          </div>
+        )}
+      </div>
+    );
+  }
+
+  // Budget is configured
+  const usagePct = budget.monthlyLimit > 0
+    ? Math.min(100, Math.round((budget.creditsUsedThisMonth / budget.monthlyLimit) * 100))
+    : 0;
+
+  const barColor = budget.hardCapReached
+    ? "bg-red-500"
+    : usagePct >= budget.alertThresholdPct
+      ? "bg-amber-500"
+      : "bg-green-500";
+
+  return (
+    <div className="rounded-lg border p-4">
+      <div className="flex items-center justify-between mb-2">
+        <h3 className="text-base font-semibold">Monthly Credit Budget</h3>
+        <span className="text-xs text-gray-500">{formatMonth(budget.budgetMonthKey)}</span>
+      </div>
+
+      {budget.hardCapReached && (
+        <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-3">
+          <p className="text-sm text-red-700 font-medium">
+            Monthly budget of {budget.monthlyLimit.toLocaleString()} credits reached.
+          </p>
+          <div className="flex gap-2 mt-2">
+            <Button size="sm" variant="outline" onClick={startEditing}>
+              Increase Limit
+            </Button>
+            <Button
+              size="sm"
+              variant="ghost"
+              onClick={() => resetBudgetMut.mutate()}
+              disabled={resetBudgetMut.isPending}
+            >
+              Remove Limit
+            </Button>
+          </div>
+        </div>
+      )}
+
+      {/* Progress bar */}
+      <div className="mb-2">
+        <div className="flex justify-between text-sm mb-1">
+          <span>
+            {budget.creditsUsedThisMonth.toLocaleString()} / {budget.monthlyLimit.toLocaleString()} credits
+          </span>
+          <span className="font-medium">{usagePct}%</span>
+        </div>
+        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
+          <div
+            className={`h-full rounded-full transition-all ${barColor}`}
+            style={{ width: `${usagePct}%` }}
+          />
+        </div>
+      </div>
+
+      {!editing ? (
+        <div className="flex gap-2 mt-3">
+          <Button size="sm" variant="outline" onClick={startEditing}>
+            Edit
+          </Button>
+          <Button
+            size="sm"
+            variant="ghost"
+            onClick={() => resetBudgetMut.mutate()}
+            disabled={resetBudgetMut.isPending}
+          >
+            Remove Limit
+          </Button>
+        </div>
+      ) : (
+        <div className="space-y-3 mt-3">
+          <div>
+            <label className="text-sm font-medium">Monthly Limit (credits)</label>
+            <Input
+              type="number"
+              min={0}
+              value={limitInput}
+              onChange={(e) => setLimitInput(e.target.value)}
+              className="mt-1"
+            />
+          </div>
+          <div>
+            <label className="text-sm font-medium">Alert Threshold (%)</label>
+            <Input
+              type="number"
+              min={1}
+              max={100}
+              value={thresholdInput}
+              onChange={(e) => setThresholdInput(e.target.value)}
+              className="mt-1"
+            />
+          </div>
+          <div className="flex gap-2">
+            <Button size="sm" onClick={handleSave} disabled={setBudgetMut.isPending}>
+              Save
+            </Button>
+            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
+              Cancel
+            </Button>
+          </div>
+        </div>
+      )}
+    </div>
+  );
+}
diff --git a/apps/web/client/src/pages/Settings.tsx b/apps/web/client/src/pages/Settings.tsx
index ac35871..0973e67 100644
--- a/apps/web/client/src/pages/Settings.tsx
+++ b/apps/web/client/src/pages/Settings.tsx
@@ -55,6 +55,7 @@ import {
 } from 'lucide-react';
 import { QRCodeSVG } from 'qrcode.react';
 import { GoogleDrivePanel } from '@/components/settings/GoogleDrivePanel';
+import { BudgetPanel } from '@/components/settings/BudgetPanel';
 
 type SettingsTab = 'profile' | 'account' | 'security' | 'preferences' | 'api' | 'billing' | 'integrations';
 
@@ -1443,6 +1444,8 @@ export default function Settings() {
                     </div>
                   </div>
 
+                  <BudgetPanel />
+
                   <div>
                     <h3 className="font-semibold text-gray-900 mb-4">Recent Invoices</h3>
                     <div className="space-y-2">
diff --git a/apps/web/server/routers/credits.ts b/apps/web/server/routers/credits.ts
index 829693d..ace21e4 100644
--- a/apps/web/server/routers/credits.ts
+++ b/apps/web/server/routers/credits.ts
@@ -15,6 +15,11 @@ import {
   getUsageStats,
   type TransactionType,
 } from "../services/creditService";
+import {
+  getUserBudget,
+  setBudgetConfig,
+  removeBudget,
+} from "../services/budgetService";
 
 // Zod schemas
 const transactionTypeSchema = z.enum([
@@ -166,4 +171,49 @@ export const creditsRouter = router({
         type: filters.type as TransactionType | undefined,
       });
     }),
+
+  /**
+   * Get current user's budget status
+   */
+  getBudget: protectedProcedure.query(async ({ ctx }) => {
+    if (!ctx.tenantId) return null;
+    const budget = await getUserBudget(ctx.tenantId, ctx.user.id);
+    if (!budget) return null;
+    return {
+      monthlyLimit: budget.monthlyLimit,
+      creditsUsedThisMonth: budget.creditsUsedThisMonth,
+      budgetMonthKey: budget.budgetMonthKey,
+      alertThresholdPct: budget.alertThresholdPct,
+      alertSent: budget.alertSent,
+      hardCapReached: budget.hardCapReached,
+    };
+  }),
+
+  /**
+   * Set or update the user's monthly budget configuration
+   */
+  setBudget: protectedProcedure
+    .input(
+      z.object({
+        monthlyLimit: z.number().int().min(0),
+        alertThresholdPct: z.number().int().min(1).max(100).optional(),
+      }),
+    )
+    .mutation(async ({ ctx, input }) => {
+      if (!ctx.tenantId) throw new Error("Tenant context required");
+      await setBudgetConfig(ctx.tenantId, ctx.user.id, {
+        monthlyLimit: input.monthlyLimit,
+        alertThresholdPct: input.alertThresholdPct,
+      });
+      return { success: true };
+    }),
+
+  /**
+   * Remove the budget limit (set to unlimited)
+   */
+  resetBudget: protectedProcedure.mutation(async ({ ctx }) => {
+    if (!ctx.tenantId) throw new Error("Tenant context required");
+    await removeBudget(ctx.tenantId, ctx.user.id);
+    return { success: true };
+  }),
 });
diff --git a/apps/web/server/services/budgetService.test.ts b/apps/web/server/services/budgetService.test.ts
new file mode 100644
index 0000000..383ba3e
--- /dev/null
+++ b/apps/web/server/services/budgetService.test.ts
@@ -0,0 +1,194 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+const { mockSelect, mockInsert, mockUpdate } = vi.hoisted(() => ({
+  mockSelect: vi.fn(),
+  mockInsert: vi.fn(),
+  mockUpdate: vi.fn(),
+}));
+
+vi.mock("../db", () => ({
+  db: {
+    select: mockSelect,
+    insert: mockInsert,
+    update: mockUpdate,
+  },
+}));
+
+import {
+  getCurrentMonthKey,
+  getUserBudget,
+  checkBudget,
+  incrementBudgetUsage,
+  resetBudgetIfNewMonth,
+  setBudgetConfig,
+  removeBudget,
+} from "./budgetService";
+
+// Helper chain builder for Drizzle fluent API
+function chain(returnValue: any) {
+  const obj: any = {};
+  const handler: ProxyHandler<any> = {
+    get(target, prop) {
+      if (prop === "then") return undefined; // not a thenable
+      return (..._args: any[]) => new Proxy(obj, handler);
+    },
+    apply() {
+      return new Proxy(obj, handler);
+    },
+  };
+  // Override limit to resolve
+  const proxy = new Proxy(
+    (..._args: any[]) => proxy,
+    {
+      get(_, prop) {
+        if (prop === "then") return undefined;
+        if (prop === "limit") return () => Promise.resolve(returnValue);
+        return (..._args: any[]) => proxy;
+      },
+      apply() {
+        return proxy;
+      },
+    },
+  );
+  return proxy;
+}
+
+beforeEach(() => {
+  vi.clearAllMocks();
+});
+
+describe("getCurrentMonthKey", () => {
+  it("returns YYYY-MM format", () => {
+    const key = getCurrentMonthKey();
+    expect(key).toMatch(/^\d{4}-\d{2}$/);
+  });
+});
+
+describe("getUserBudget", () => {
+  it("returns null when no budget exists", async () => {
+    mockSelect.mockReturnValue(chain([]));
+    const result = await getUserBudget("tenant1", 1);
+    expect(result).toBeNull();
+  });
+
+  it("returns budget record when exists", async () => {
+    const budget = {
+      id: 1,
+      tenantId: "t1",
+      userId: 1,
+      monthlyLimit: 1000,
+      creditsUsedThisMonth: 500,
+      budgetMonthKey: "2026-02",
+      alertThresholdPct: 80,
+      alertSent: false,
+      hardCapReached: false,
+    };
+    mockSelect.mockReturnValue(chain([budget]));
+    const result = await getUserBudget("t1", 1);
+    expect(result).toEqual(budget);
+  });
+});
+
+describe("checkBudget", () => {
+  it("returns allowed when no budget exists", async () => {
+    mockSelect.mockReturnValue(chain([]));
+    const result = await checkBudget("t1", 1, 10);
+    expect(result.allowed).toBe(true);
+    expect(result.monthlyLimit).toBe(0);
+  });
+
+  it("returns allowed when usage is below limit", async () => {
+    const key = getCurrentMonthKey();
+    mockSelect.mockReturnValue(
+      chain([
+        {
+          monthlyLimit: 1000,
+          creditsUsedThisMonth: 200,
+          budgetMonthKey: key,
+          alertThresholdPct: 80,
+          alertSent: false,
+          hardCapReached: false,
+        },
+      ]),
+    );
+    const result = await checkBudget("t1", 1, 10);
+    expect(result.allowed).toBe(true);
+    expect(result.usagePct).toBeLessThan(80);
+  });
+
+  it("returns hard_cap when usage exceeds limit", async () => {
+    const key = getCurrentMonthKey();
+    mockSelect.mockReturnValue(
+      chain([
+        {
+          monthlyLimit: 100,
+          creditsUsedThisMonth: 95,
+          budgetMonthKey: key,
+          alertThresholdPct: 80,
+          alertSent: true,
+          hardCapReached: false,
+        },
+      ]),
+    );
+    const result = await checkBudget("t1", 1, 10);
+    expect(result.allowed).toBe(false);
+    expect(result.reason).toBe("hard_cap");
+  });
+
+  it("returns alert flag when threshold crossed", async () => {
+    const key = getCurrentMonthKey();
+    mockSelect.mockReturnValue(
+      chain([
+        {
+          monthlyLimit: 100,
+          creditsUsedThisMonth: 75,
+          budgetMonthKey: key,
+          alertThresholdPct: 80,
+          alertSent: false,
+          hardCapReached: false,
+        },
+      ]),
+    );
+    const result = await checkBudget("t1", 1, 10);
+    expect(result.allowed).toBe(true);
+    expect(result.alert).toBe(true);
+  });
+
+  it("returns allowed when monthlyLimit is 0 (unlimited)", async () => {
+    const key = getCurrentMonthKey();
+    mockSelect.mockReturnValue(
+      chain([
+        {
+          monthlyLimit: 0,
+          creditsUsedThisMonth: 9999,
+          budgetMonthKey: key,
+          alertThresholdPct: 80,
+          alertSent: false,
+          hardCapReached: false,
+        },
+      ]),
+    );
+    const result = await checkBudget("t1", 1, 100);
+    expect(result.allowed).toBe(true);
+  });
+});
+
+describe("setBudgetConfig", () => {
+  it("rejects negative monthlyLimit", async () => {
+    await expect(
+      setBudgetConfig("t1", 1, { monthlyLimit: -5 }),
+    ).rejects.toThrow("monthlyLimit must be non-negative");
+  });
+
+  it("rejects alertThresholdPct outside 1-100", async () => {
+    await expect(
+      setBudgetConfig("t1", 1, { monthlyLimit: 100, alertThresholdPct: 0 }),
+    ).rejects.toThrow("alertThresholdPct must be between 1 and 100");
+  });
+
+  it("rejects alertThresholdPct above 100", async () => {
+    await expect(
+      setBudgetConfig("t1", 1, { monthlyLimit: 100, alertThresholdPct: 101 }),
+    ).rejects.toThrow("alertThresholdPct must be between 1 and 100");
+  });
+});
diff --git a/apps/web/server/services/budgetService.ts b/apps/web/server/services/budgetService.ts
new file mode 100644
index 0000000..776d61e
--- /dev/null
+++ b/apps/web/server/services/budgetService.ts
@@ -0,0 +1,273 @@
+/**
+ * Budget Service
+ * Per-user monthly credit budget protection.
+ * Checks budgets before deductions and tracks usage after.
+ */
+
+import { db } from "../db";
+import { userCreditBudgets } from "../../drizzle/schema";
+import { eq, and, sql } from "drizzle-orm";
+
+export interface BudgetCheckResult {
+  allowed: boolean;
+  reason?: "hard_cap";
+  alert?: boolean;
+  usagePct: number;
+  monthlyLimit: number;
+  creditsUsed: number;
+}
+
+/**
+ * Get current month key in "YYYY-MM" format.
+ */
+export function getCurrentMonthKey(): string {
+  const now = new Date();
+  const y = now.getFullYear();
+  const m = String(now.getMonth() + 1).padStart(2, "0");
+  return `${y}-${m}`;
+}
+
+/**
+ * Fetch user's budget record. Returns null if no budget is configured.
+ */
+export async function getUserBudget(tenantId: string, userId: number) {
+  const rows = await db
+    .select()
+    .from(userCreditBudgets)
+    .where(
+      and(
+        eq(userCreditBudgets.tenantId, tenantId),
+        eq(userCreditBudgets.userId, userId),
+      ),
+    )
+    .limit(1);
+  return rows[0] ?? null;
+}
+
+/**
+ * Check if a pending credit operation is allowed under the user's budget.
+ * If no budget record exists, the operation is always allowed (unlimited).
+ */
+export async function checkBudget(
+  tenantId: string,
+  userId: number,
+  pendingAmount: number,
+): Promise<BudgetCheckResult> {
+  const budget = await getUserBudget(tenantId, userId);
+
+  if (!budget) {
+    return { allowed: true, usagePct: 0, monthlyLimit: 0, creditsUsed: 0 };
+  }
+
+  // Auto-reset if month has rolled over
+  const currentMonth = getCurrentMonthKey();
+  if (budget.budgetMonthKey !== currentMonth) {
+    await resetBudgetIfNewMonth(tenantId, userId, currentMonth);
+    // After reset, usage is 0
+    if (budget.monthlyLimit <= 0) {
+      return { allowed: true, usagePct: 0, monthlyLimit: 0, creditsUsed: 0 };
+    }
+    const pct = Math.round((pendingAmount / budget.monthlyLimit) * 100);
+    const alert = pct >= budget.alertThresholdPct;
+    if (pendingAmount > budget.monthlyLimit) {
+      return { allowed: false, reason: "hard_cap", usagePct: pct, monthlyLimit: budget.monthlyLimit, creditsUsed: 0 };
+    }
+    return { allowed: true, alert, usagePct: pct, monthlyLimit: budget.monthlyLimit, creditsUsed: 0 };
+  }
+
+  // No enforcement if monthlyLimit is 0 (unlimited tracking)
+  if (budget.monthlyLimit <= 0) {
+    const pct = 0;
+    return { allowed: true, usagePct: pct, monthlyLimit: 0, creditsUsed: budget.creditsUsedThisMonth };
+  }
+
+  const projectedUsage = budget.creditsUsedThisMonth + pendingAmount;
+  const usagePct = Math.round((projectedUsage / budget.monthlyLimit) * 100);
+
+  // Hard cap check
+  if (projectedUsage > budget.monthlyLimit) {
+    return {
+      allowed: false,
+      reason: "hard_cap",
+      usagePct,
+      monthlyLimit: budget.monthlyLimit,
+      creditsUsed: budget.creditsUsedThisMonth,
+    };
+  }
+
+  // Alert threshold check
+  const alert = usagePct >= budget.alertThresholdPct && !budget.alertSent;
+
+  return {
+    allowed: true,
+    alert,
+    usagePct,
+    monthlyLimit: budget.monthlyLimit,
+    creditsUsed: budget.creditsUsedThisMonth,
+  };
+}
+
+/**
+ * Increment budget usage after a successful credit deduction.
+ * Upserts: creates record if none exists.
+ */
+export async function incrementBudgetUsage(
+  tenantId: string,
+  userId: number,
+  amount: number,
+  monthlyLimit?: number,
+): Promise<{ alertTriggered: boolean; hardCapReached: boolean }> {
+  const currentMonth = getCurrentMonthKey();
+  const budget = await getUserBudget(tenantId, userId);
+
+  if (!budget) {
+    // Create tracking record (monthlyLimit=0 means unlimited)
+    await db.insert(userCreditBudgets).values({
+      tenantId,
+      userId,
+      monthlyLimit: monthlyLimit ?? 0,
+      creditsUsedThisMonth: amount,
+      budgetMonthKey: currentMonth,
+      alertThresholdPct: 80,
+      alertSent: false,
+      hardCapReached: false,
+    });
+    return { alertTriggered: false, hardCapReached: false };
+  }
+
+  // Reset if stale month
+  if (budget.budgetMonthKey !== currentMonth) {
+    await resetBudgetIfNewMonth(tenantId, userId, currentMonth);
+    budget.creditsUsedThisMonth = 0;
+    budget.alertSent = false;
+    budget.hardCapReached = false;
+  }
+
+  const newUsage = budget.creditsUsedThisMonth + amount;
+  const limit = budget.monthlyLimit;
+
+  let alertTriggered = false;
+  let hardCapReached = false;
+
+  if (limit > 0) {
+    const usagePct = Math.round((newUsage / limit) * 100);
+    if (usagePct >= budget.alertThresholdPct && !budget.alertSent) {
+      alertTriggered = true;
+    }
+    if (newUsage >= limit) {
+      hardCapReached = true;
+    }
+  }
+
+  await db
+    .update(userCreditBudgets)
+    .set({
+      creditsUsedThisMonth: newUsage,
+      alertSent: alertTriggered ? true : budget.alertSent,
+      hardCapReached,
+      updatedAt: new Date(),
+    })
+    .where(
+      and(
+        eq(userCreditBudgets.tenantId, tenantId),
+        eq(userCreditBudgets.userId, userId),
+      ),
+    );
+
+  return { alertTriggered, hardCapReached };
+}
+
+/**
+ * Reset budget counters when the month has rolled over.
+ */
+export async function resetBudgetIfNewMonth(
+  tenantId: string,
+  userId: number,
+  currentMonthKey: string,
+): Promise<void> {
+  await db
+    .update(userCreditBudgets)
+    .set({
+      creditsUsedThisMonth: 0,
+      alertSent: false,
+      hardCapReached: false,
+      budgetMonthKey: currentMonthKey,
+      updatedAt: new Date(),
+    })
+    .where(
+      and(
+        eq(userCreditBudgets.tenantId, tenantId),
+        eq(userCreditBudgets.userId, userId),
+      ),
+    );
+}
+
+/**
+ * Set or update budget configuration for a user.
+ */
+export async function setBudgetConfig(
+  tenantId: string,
+  userId: number,
+  config: { monthlyLimit: number; alertThresholdPct?: number },
+): Promise<void> {
+  if (config.monthlyLimit < 0) {
+    throw new Error("monthlyLimit must be non-negative");
+  }
+  const threshold = config.alertThresholdPct ?? 80;
+  if (threshold < 1 || threshold > 100) {
+    throw new Error("alertThresholdPct must be between 1 and 100");
+  }
+
+  const existing = await getUserBudget(tenantId, userId);
+  const currentMonth = getCurrentMonthKey();
+
+  if (existing) {
+    await db
+      .update(userCreditBudgets)
+      .set({
+        monthlyLimit: config.monthlyLimit,
+        alertThresholdPct: threshold,
+        updatedAt: new Date(),
+      })
+      .where(
+        and(
+          eq(userCreditBudgets.tenantId, tenantId),
+          eq(userCreditBudgets.userId, userId),
+        ),
+      );
+  } else {
+    await db.insert(userCreditBudgets).values({
+      tenantId,
+      userId,
+      monthlyLimit: config.monthlyLimit,
+      creditsUsedThisMonth: 0,
+      budgetMonthKey: currentMonth,
+      alertThresholdPct: threshold,
+      alertSent: false,
+      hardCapReached: false,
+    });
+  }
+}
+
+/**
+ * Remove budget limit (set to unlimited).
+ */
+export async function removeBudget(
+  tenantId: string,
+  userId: number,
+): Promise<void> {
+  await db
+    .update(userCreditBudgets)
+    .set({
+      monthlyLimit: 0,
+      hardCapReached: false,
+      alertSent: false,
+      updatedAt: new Date(),
+    })
+    .where(
+      and(
+        eq(userCreditBudgets.tenantId, tenantId),
+        eq(userCreditBudgets.userId, userId),
+      ),
+    );
+}
diff --git a/apps/web/server/services/creditService.ts b/apps/web/server/services/creditService.ts
index 246fa08..d3d5616 100644
--- a/apps/web/server/services/creditService.ts
+++ b/apps/web/server/services/creditService.ts
@@ -10,11 +10,27 @@ import { getRedisClient, isRedisAvailable } from "./redis";
 
 export type TransactionType = "purchase" | "usage" | "bonus" | "refund" | "adjustment" | "subscription";
 
+export class BudgetExceededError extends Error {
+  public readonly monthlyLimit: number;
+  public readonly creditsUsed: number;
+  public readonly budgetMonthKey: string;
+
+  constructor(monthlyLimit: number, creditsUsed: number, budgetMonthKey: string) {
+    super(`Monthly credit budget exceeded: ${creditsUsed}/${monthlyLimit} used in ${budgetMonthKey}`);
+    this.name = "BudgetExceededError";
+    this.monthlyLimit = monthlyLimit;
+    this.creditsUsed = creditsUsed;
+    this.budgetMonthKey = budgetMonthKey;
+  }
+}
+
 export interface DeductCreditsParams {
   userId: number;
   amount: number;
   description: string;
+  tenantId?: string;
   idempotencyKey?: string;
+  skipBudgetCheck?: boolean;
   metadata?: {
     model?: string;
     provider?: string;
@@ -98,12 +114,29 @@ export async function hasEnoughCredits(userId: number, amount: number): Promise<
  * This prevents TOCTOU race conditions and negative balances.
  */
 export async function deductCredits(params: DeductCreditsParams) {
-  const { userId, amount, description, metadata, idempotencyKey } = params;
+  const { userId, amount, description, metadata, idempotencyKey, tenantId, skipBudgetCheck } = params;
 
   if (amount <= 0) {
     throw new Error("Deduction amount must be positive");
   }
 
+  // Budget pre-check (only when tenantId is provided and not skipped)
+  let budgetAlert = false;
+  if (tenantId && !skipBudgetCheck) {
+    const { checkBudget, getCurrentMonthKey } = await import("./budgetService");
+    const budgetResult = await checkBudget(tenantId, userId, amount);
+    if (!budgetResult.allowed) {
+      throw new BudgetExceededError(
+        budgetResult.monthlyLimit,
+        budgetResult.creditsUsed,
+        getCurrentMonthKey(),
+      );
+    }
+    if (budgetResult.alert) {
+      budgetAlert = true;
+    }
+  }
+
   // Redis fast-path check for idempotency
   if (idempotencyKey && isRedisAvailable()) {
     try {
@@ -174,13 +207,33 @@ export async function deductCredits(params: DeductCreditsParams) {
     throw err;
   }
 
-  const result = {
+  const result: {
+    success: boolean;
+    creditsUsed: number;
+    newBalance: number;
+    transactionId: number;
+    budgetAlert?: boolean;
+    budgetUsagePct?: number;
+  } = {
     success: true,
     creditsUsed: amount,
     newBalance,
     transactionId,
   };
 
+  // Budget post-update
+  if (tenantId) {
+    try {
+      const { incrementBudgetUsage } = await import("./budgetService");
+      const budgetResult = await incrementBudgetUsage(tenantId, userId, amount);
+      if (budgetAlert || budgetResult.alertTriggered) {
+        result.budgetAlert = true;
+      }
+    } catch {
+      // Budget tracking failure is non-critical
+    }
+  }
+
   // Cache result in Redis for fast dedup (24h TTL)
   if (idempotencyKey && isRedisAvailable()) {
     try {
