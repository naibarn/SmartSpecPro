/**
 * BudgetPanel - per-user monthly credit budget management.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

function formatMonth(key: string): string {
  const [y, m] = key.split("-");
  const date = new Date(parseInt(y), parseInt(m) - 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function BudgetPanel() {
  const [editing, setEditing] = useState(false);
  const [limitInput, setLimitInput] = useState("");
  const [thresholdInput, setThresholdInput] = useState("80");

  const budgetQuery = trpc.credits.getBudget.useQuery(undefined, {
    refetchOnWindowFocus: true,
  });
  const setBudgetMut = trpc.credits.setBudget.useMutation({
    onSuccess: () => {
      budgetQuery.refetch();
      setEditing(false);
      toast.success("Budget updated");
    },
    onError: (err) => toast.error(err.message),
  });
  const resetBudgetMut = trpc.credits.resetBudget.useMutation({
    onSuccess: () => {
      budgetQuery.refetch();
      toast.success("Budget limit removed");
    },
    onError: (err) => toast.error(err.message),
  });

  const budget = budgetQuery.data;

  const handleSave = () => {
    const limit = parseInt(limitInput);
    const threshold = parseInt(thresholdInput);
    if (isNaN(limit) || limit < 0) {
      toast.error("Monthly limit must be a non-negative number");
      return;
    }
    if (isNaN(threshold) || threshold < 1 || threshold > 100) {
      toast.error("Alert threshold must be between 1 and 100");
      return;
    }
    setBudgetMut.mutate({ monthlyLimit: limit, alertThresholdPct: threshold });
  };

  const startEditing = () => {
    setLimitInput(String(budget?.monthlyLimit ?? 500));
    setThresholdInput(String(budget?.alertThresholdPct ?? 80));
    setEditing(true);
  };

  // No budget configured
  if (!budget || budget.monthlyLimit <= 0) {
    return (
      <div className="rounded-lg border p-4">
        <h3 className="text-base font-semibold mb-2">Monthly Credit Budget</h3>
        {!editing ? (
          <div>
            <p className="text-sm text-gray-500 mb-3">
              No monthly budget configured. Set a limit to track and control spending.
            </p>
            <Button size="sm" variant="outline" onClick={startEditing}>
              Set Budget
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Monthly Limit (credits)</label>
              <Input
                type="number"
                min={0}
                value={limitInput}
                onChange={(e) => setLimitInput(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Alert Threshold (%)</label>
              <Input
                type="number"
                min={1}
                max={100}
                value={thresholdInput}
                onChange={(e) => setThresholdInput(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={setBudgetMut.isPending}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Budget is configured
  const usagePct = budget.monthlyLimit > 0
    ? Math.min(100, Math.round((budget.creditsUsedThisMonth / budget.monthlyLimit) * 100))
    : 0;

  const barColor = budget.hardCapReached
    ? "bg-red-500"
    : usagePct >= budget.alertThresholdPct
      ? "bg-amber-500"
      : "bg-green-500";

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-semibold">Monthly Credit Budget</h3>
        <span className="text-xs text-gray-500">{formatMonth(budget.budgetMonthKey)}</span>
      </div>

      {budget.hardCapReached && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-3">
          <p className="text-sm text-red-700 font-medium">
            Monthly budget of {budget.monthlyLimit.toLocaleString()} credits reached.
          </p>
          <div className="flex gap-2 mt-2">
            <Button size="sm" variant="outline" onClick={startEditing}>
              Increase Limit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => resetBudgetMut.mutate()}
              disabled={resetBudgetMut.isPending}
            >
              Remove Limit
            </Button>
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div className="mb-2">
        <div className="flex justify-between text-sm mb-1">
          <span>
            {budget.creditsUsedThisMonth.toLocaleString()} / {budget.monthlyLimit.toLocaleString()} credits
          </span>
          <span className="font-medium">{usagePct}%</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${usagePct}%` }}
          />
        </div>
      </div>

      {!editing ? (
        <div className="flex gap-2 mt-3">
          <Button size="sm" variant="outline" onClick={startEditing}>
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => resetBudgetMut.mutate()}
            disabled={resetBudgetMut.isPending}
          >
            Remove Limit
          </Button>
        </div>
      ) : (
        <div className="space-y-3 mt-3">
          <div>
            <label className="text-sm font-medium">Monthly Limit (credits)</label>
            <Input
              type="number"
              min={0}
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Alert Threshold (%)</label>
            <Input
              type="number"
              min={1}
              max={100}
              value={thresholdInput}
              onChange={(e) => setThresholdInput(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={setBudgetMut.isPending}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
