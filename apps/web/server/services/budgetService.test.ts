import { describe, it, expect, vi, beforeEach } from "vitest";

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
  getCurrentMonthKey,
  getUserBudget,
  checkBudget,
  incrementBudgetUsage,
  resetBudgetIfNewMonth,
  setBudgetConfig,
  removeBudget,
} from "./budgetService";

// Helper chain builder for Drizzle fluent API
function chain(returnValue: any) {
  const obj: any = {};
  const handler: ProxyHandler<any> = {
    get(target, prop) {
      if (prop === "then") return undefined; // not a thenable
      return (..._args: any[]) => new Proxy(obj, handler);
    },
    apply() {
      return new Proxy(obj, handler);
    },
  };
  // Override limit to resolve
  const proxy = new Proxy(
    (..._args: any[]) => proxy,
    {
      get(_, prop) {
        if (prop === "then") return undefined;
        if (prop === "limit") return () => Promise.resolve(returnValue);
        return (..._args: any[]) => proxy;
      },
      apply() {
        return proxy;
      },
    },
  );
  return proxy;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCurrentMonthKey", () => {
  it("returns YYYY-MM format", () => {
    const key = getCurrentMonthKey();
    expect(key).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe("getUserBudget", () => {
  it("returns null when no budget exists", async () => {
    mockSelect.mockReturnValue(chain([]));
    const result = await getUserBudget("tenant1", 1);
    expect(result).toBeNull();
  });

  it("returns budget record when exists", async () => {
    const budget = {
      id: 1,
      tenantId: "t1",
      userId: 1,
      monthlyLimit: 1000,
      creditsUsedThisMonth: 500,
      budgetMonthKey: "2026-02",
      alertThresholdPct: 80,
      alertSent: false,
      hardCapReached: false,
    };
    mockSelect.mockReturnValue(chain([budget]));
    const result = await getUserBudget("t1", 1);
    expect(result).toEqual(budget);
  });
});

describe("checkBudget", () => {
  it("returns allowed when no budget exists", async () => {
    mockSelect.mockReturnValue(chain([]));
    const result = await checkBudget("t1", 1, 10);
    expect(result.allowed).toBe(true);
    expect(result.monthlyLimit).toBe(0);
  });

  it("returns allowed when usage is below limit", async () => {
    const key = getCurrentMonthKey();
    mockSelect.mockReturnValue(
      chain([
        {
          monthlyLimit: 1000,
          creditsUsedThisMonth: 200,
          budgetMonthKey: key,
          alertThresholdPct: 80,
          alertSent: false,
          hardCapReached: false,
        },
      ]),
    );
    const result = await checkBudget("t1", 1, 10);
    expect(result.allowed).toBe(true);
    expect(result.usagePct).toBeLessThan(80);
  });

  it("returns hard_cap when usage exceeds limit", async () => {
    const key = getCurrentMonthKey();
    mockSelect.mockReturnValue(
      chain([
        {
          monthlyLimit: 100,
          creditsUsedThisMonth: 95,
          budgetMonthKey: key,
          alertThresholdPct: 80,
          alertSent: true,
          hardCapReached: false,
        },
      ]),
    );
    const result = await checkBudget("t1", 1, 10);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("hard_cap");
  });

  it("returns alert flag when threshold crossed", async () => {
    const key = getCurrentMonthKey();
    mockSelect.mockReturnValue(
      chain([
        {
          monthlyLimit: 100,
          creditsUsedThisMonth: 75,
          budgetMonthKey: key,
          alertThresholdPct: 80,
          alertSent: false,
          hardCapReached: false,
        },
      ]),
    );
    const result = await checkBudget("t1", 1, 10);
    expect(result.allowed).toBe(true);
    expect(result.alert).toBe(true);
  });

  it("returns allowed when monthlyLimit is 0 (unlimited)", async () => {
    const key = getCurrentMonthKey();
    mockSelect.mockReturnValue(
      chain([
        {
          monthlyLimit: 0,
          creditsUsedThisMonth: 9999,
          budgetMonthKey: key,
          alertThresholdPct: 80,
          alertSent: false,
          hardCapReached: false,
        },
      ]),
    );
    const result = await checkBudget("t1", 1, 100);
    expect(result.allowed).toBe(true);
  });
});

describe("setBudgetConfig", () => {
  it("rejects negative monthlyLimit", async () => {
    await expect(
      setBudgetConfig("t1", 1, { monthlyLimit: -5 }),
    ).rejects.toThrow("monthlyLimit must be non-negative");
  });

  it("rejects alertThresholdPct outside 1-100", async () => {
    await expect(
      setBudgetConfig("t1", 1, { monthlyLimit: 100, alertThresholdPct: 0 }),
    ).rejects.toThrow("alertThresholdPct must be between 1 and 100");
  });

  it("rejects alertThresholdPct above 100", async () => {
    await expect(
      setBudgetConfig("t1", 1, { monthlyLimit: 100, alertThresholdPct: 101 }),
    ).rejects.toThrow("alertThresholdPct must be between 1 and 100");
  });
});
