import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSelect, mockInsert, mockUpdate, mockTransaction } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock("../db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    transaction: mockTransaction,
  },
}));

import {
  isModelFree,
  calculateCreditsForLLM,
  calculateCreditsForLLMDynamic,
  calculateCreditsFromCost,
  deductCreditsForModel,
  hasEnoughCredits,
  deductCredits,
  addCredits,
} from "./creditService";

beforeEach(() => {
  vi.clearAllMocks();
});

// --- Helper to set up model_provider_map mock for isModelFree/pricing ---
function mockModelProviderMapQuery(rows: any[]) {
  const limitMock = vi.fn().mockResolvedValue(rows);
  const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
  const innerJoinMock = vi.fn().mockReturnValue({ where: whereMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock, innerJoin: innerJoinMock });
  mockSelect.mockReturnValue({ from: fromMock });
}

function mockCreditBalance(credits: number) {
  const limitMock = vi.fn().mockResolvedValue([{ credits, plan: "free" }]);
  const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  mockSelect.mockReturnValue({ from: fromMock });
}

// --- Free Model Handling ---

describe("isModelFree", () => {
  it("returns true for free models in model_provider_map", async () => {
    mockModelProviderMapQuery([{ isFree: true }]);
    expect(await isModelFree("kimi-k2.5")).toBe(true);
  });

  it("returns false for paid models", async () => {
    mockModelProviderMapQuery([{ isFree: false }]);
    expect(await isModelFree("gpt-4o")).toBe(false);
  });

  it("returns false when model not in map", async () => {
    mockModelProviderMapQuery([]);
    expect(await isModelFree("unknown-model")).toBe(false);
  });

  it("accepts provider-qualified model IDs", async () => {
    mockModelProviderMapQuery([{ isFree: false }]);
    expect(await isModelFree("openai/gpt-4o")).toBe(false);
  });

  it("treats catalog-priced Kie mappings as paid even when legacy DB rows are marked free", async () => {
    mockModelProviderMapQuery([
      {
        providerName: "kie_ai",
        providerModelId: "gpt-5-4",
        availableModels: [{ id: "gpt-5-4", pricing: { input: 0.7, output: 5.6 } }],
        pricingInput: "0",
        pricingOutput: "0",
        isFree: true,
      },
    ]);
    expect(await isModelFree("gpt-5.4")).toBe(false);
  });
});

describe("deductCreditsForModel", () => {
  it("charges at least 1 credit even for zero-priced model mappings", async () => {
    mockSelect.mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ pricingInput: "0", pricingOutput: "0", isFree: true }]),
          }),
        }),
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ pricingInput: "0", pricingOutput: "0", isFree: true }]),
        }),
      }),
    }));

    mockTransaction.mockImplementation(async (fn: Function) => {
      const tx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ newBalance: 99 }]),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 1 }]),
          }),
        }),
      };
      await fn(tx);
    });

    const result = await deductCreditsForModel({
      userId: 1,
      model: "kimi-k2.5",
      inputTokens: 1000,
      outputTokens: 500,
    });

    expect(result.creditsUsed).toBe(1);
    expect(result.wasFree).toBe(false);
  });

  it("static server-to-server calls do not deduct user credits", async () => {
    mockSelect.mockImplementation(() => {
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ credits: 100, plan: "free" }]),
          }),
        }),
      };
    });

    const result = await deductCreditsForModel({
      userId: 0,
      model: "kimi-k2.5",
      inputTokens: 1000,
      outputTokens: 500,
    });

    expect(result.creditsUsed).toBe(0);
    expect(result.wasFree).toBe(true);
  });

  it("charges credits when provider reports real cost even if model is marked free", async () => {
    mockTransaction.mockImplementation(async (fn: Function) => {
      const tx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ newBalance: 88 }]),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 2 }]),
          }),
        }),
      };
      await fn(tx);
    });

    const result = await deductCreditsForModel({
      userId: 1,
      model: "kimi-k2.5",
      provider: "test-provider",
      inputTokens: 1000,
      outputTokens: 500,
      costUsd: 0.012,
    });

    expect(result.wasFree).toBe(false);
    expect(result.creditsUsed).toBe(12);
  });

  it("paid model deducts credits normally", async () => {
    let callCount = 0;
    mockSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // isModelFree → false
        return {
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ isFree: false }]),
              }),
            }),
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ isFree: false }]),
            }),
          }),
        };
      }
      if (callCount === 2) {
        // calculateCreditsForLLMDynamic → DB pricing
        return {
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ pricingInput: "2.50", pricingOutput: "10.00", isFree: false }]),
              }),
            }),
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ pricingInput: "2.50", pricingOutput: "10.00", isFree: false }]),
            }),
          }),
        };
      }
      // getCreditBalance for deductCredits
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ credits: 100, plan: "free" }]),
          }),
        }),
      };
    });

    // deductCredits uses db.transaction
    mockTransaction.mockImplementation(async (fn: Function) => {
      const tx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ newBalance: 92 }]),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 1 }]),
          }),
        }),
      };
      await fn(tx);
    });

    const result = await deductCreditsForModel({
      userId: 1,
      model: "gpt-4o",
      inputTokens: 1000,
      outputTokens: 500,
    });

    expect(result.creditsUsed).toBeGreaterThan(0);
    expect(result.wasFree).toBe(false);
  });
});

// --- Idempotency safety net (duplicate idempotencyKey inserts) ---
// Regression coverage: drizzle-orm wraps every DB error in a DrizzleQueryError
// whose own `.code`/`.constraint` are undefined — the real postgres fields
// live under `.cause`. The safety net used to check only the top level, so it
// never matched and a legitimate idempotent retry threw instead of returning
// the already-recorded transaction.
function drizzleWrappedUniqueViolation(constraint: string) {
  const err: any = new Error(
    'Failed query: insert into "credit_transactions" (...) returning "id"'
  );
  err.cause = { code: "23505", constraint };
  return err;
}

describe("deductCredits idempotency safety net", () => {
  it("returns the existing transaction instead of throwing on a Drizzle-wrapped duplicate idempotencyKey", async () => {
    mockTransaction.mockImplementation(async () => {
      throw drizzleWrappedUniqueViolation("credit_transactions_idempotency_key_unique");
    });
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockResolvedValue([{ id: 91834, amount: -35, balanceAfter: 375856 }]),
        }),
      }),
    });

    const result = await deductCredits({
      userId: 1,
      amount: 35,
      description: "Marketplace staged storyboard image shot 1",
      idempotencyKey: "staged:mar_test:image:shot-1-r2",
    });

    expect(result).toEqual({
      success: true,
      creditsUsed: 35,
      newBalance: 375856,
      transactionId: 91834,
    });
  });

  it("still throws for a DB error unrelated to the idempotency constraint", async () => {
    mockTransaction.mockImplementation(async () => {
      throw drizzleWrappedUniqueViolation("users_email_unique");
    });

    await expect(
      deductCredits({
        userId: 1,
        amount: 10,
        description: "test",
        idempotencyKey: "some-key",
      })
    ).rejects.toThrow();
  });
});

describe("addCredits idempotency safety net", () => {
  it("returns the existing transaction instead of throwing on a Drizzle-wrapped duplicate idempotencyKey", async () => {
    mockTransaction.mockImplementation(async () => {
      throw drizzleWrappedUniqueViolation("credit_transactions_idempotency_key_unique");
    });
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockResolvedValue([{ id: 91915, amount: 35, balanceAfter: 375891 }]),
        }),
      }),
    });

    const result = await addCredits({
      userId: 1,
      amount: 35,
      type: "refund",
      description: "Marketplace staged image provider submission failed",
      idempotencyKey: "staged:mar_test:image:shot-1-r2:refund",
    });

    expect(result).toEqual({
      success: true,
      creditsAdded: 35,
      newBalance: 375891,
      transactionId: 91915,
    });
  });
});

// --- Dynamic Model Pricing ---

describe("calculateCreditsForLLMDynamic", () => {
  it("uses DB pricing when model exists in model_provider_map", async () => {
    mockModelProviderMapQuery([{ pricingInput: "2.50", pricingOutput: "10.00", isFree: false }]);

    const credits = await calculateCreditsForLLMDynamic(1000, 500, "gpt-4o");
    // (1000/1M * 2.5) + (500/1M * 10.0) = 0.0025 + 0.005 = 0.0075
    // 0.0075 * 1000 = 7.5 → ceil = 8
    expect(credits).toBe(8);
  });

  it("falls back to catalog pricing when a legacy Kie mapping still has zeroed DB pricing", async () => {
    mockModelProviderMapQuery([
      {
        providerName: "kie_ai",
        providerModelId: "gpt-5-4",
        availableModels: [{ id: "gpt-5-4", pricing: { input: 0.7, output: 5.6 } }],
        pricingInput: "0",
        pricingOutput: "0",
        isFree: true,
      },
    ]);

    const credits = await calculateCreditsForLLMDynamic(1000, 500, "gpt-5.4");
    expect(credits).toBe(4);
  });

  it("falls back to hardcoded MODEL_PRICING when model not in map", async () => {
    mockModelProviderMapQuery([]);

    const credits = await calculateCreditsForLLMDynamic(1000, 500, "gpt-4o-mini");
    // Uses hardcoded: gpt-4o-mini = { input: 0.15, output: 0.60 }
    // (1000/1M * 0.15) + (500/1M * 0.60) = 0.00015 + 0.0003 = 0.00045
    // 0.00045 * 1000 = 0.45 → ceil = 1 (minimum)
    expect(credits).toBe(1);
  });

  it("charges the 1-credit minimum for free models (isFree=true)", async () => {
    mockModelProviderMapQuery([{ pricingInput: "0", pricingOutput: "0", isFree: true }]);

    const credits = await calculateCreditsForLLMDynamic(10000, 5000, "kimi-k2.5");
    expect(credits).toBe(1);
  });

  it("uses DB pricing for provider-qualified model IDs", async () => {
    mockModelProviderMapQuery([{ pricingInput: "2.00", pricingOutput: "8.00", isFree: false }]);

    const credits = await calculateCreditsForLLMDynamic(1000, 500, "openai/gpt-5.2");
    expect(credits).toBe(6);
  });

  it("DB pricing changes reflected without restart (no cache)", async () => {
    // First call: old pricing
    mockModelProviderMapQuery([{ pricingInput: "1.00", pricingOutput: "4.00", isFree: false }]);
    const credits1 = await calculateCreditsForLLMDynamic(1_000_000, 1_000_000, "test-model");
    expect(credits1).toBe(5000); // (1.0 + 4.0) * 1000

    // Second call: updated pricing
    mockModelProviderMapQuery([{ pricingInput: "2.00", pricingOutput: "8.00", isFree: false }]);
    const credits2 = await calculateCreditsForLLMDynamic(1_000_000, 1_000_000, "test-model");
    expect(credits2).toBe(10000); // (2.0 + 8.0) * 1000
  });
});

// --- Existing behavior preserved ---

describe("calculateCreditsForLLM (hardcoded, unchanged)", () => {
  it("calculates credits using hardcoded pricing", () => {
    const credits = calculateCreditsForLLM(1000, 500, "gpt-4o");
    // (1000/1M * 2.50) + (500/1M * 10.00) = 0.0025 + 0.005 = 0.0075
    // 0.0075 * 1000 = 7.5 → ceil = 8
    expect(credits).toBe(8);
  });

  it("minimum 1 credit", () => {
    const credits = calculateCreditsForLLM(1, 1, "gpt-4o-mini");
    expect(credits).toBe(1);
  });
});

describe("calculateCreditsFromCost", () => {
  it("converts USD cost to credits", () => {
    expect(calculateCreditsFromCost(0.001)).toBe(1);
    expect(calculateCreditsFromCost(1.0)).toBe(1000);
  });
});
