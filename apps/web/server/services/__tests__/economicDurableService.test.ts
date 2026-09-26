import { describe, expect, it, vi } from "vitest";
import { economicBudgets, economicHolds, economicJournalEntries } from "../../../drizzle/schema";
import { reserveEconomicHoldInTransaction } from "../economicDurableService";

function makeQuery(options: { existingHold?: Record<string, unknown> } = {}) {
  const budget = {
    id: "budget-1",
    tenantId: "tenant-1",
    currency: "USD",
    limitMinorUnits: 100,
    heldMinorUnits: 10,
    capturedMinorUnits: 0,
    status: "active",
    version: 1,
  };
  const select = vi.fn(() => ({
    from: vi.fn((table: unknown) => ({
      where: vi.fn(() => ({
        for: vi.fn(() => ({
          limit: vi.fn(async () =>
            table === economicHolds
              ? (options.existingHold ? [options.existingHold] : [])
              : table === economicBudgets
                ? [budget]
                : []
          ),
        })),
        limit: vi.fn(async () =>
          table === economicJournalEntries
            ? []
            : table === economicHolds
              ? (options.existingHold ? [options.existingHold] : [])
              : []
        ),
      })),
    })),
  }));
  let insertCount = 0;
  const insert = vi.fn(() => {
    insertCount += 1;
    return {
      values: vi.fn(() => ({
        returning: vi.fn(async () =>
          insertCount === 2
            ? [{
                id: "hold-1",
                tenantId: "tenant-1",
                intentId: "intent-1",
                currency: "USD",
                amountMinorUnits: 40,
                capturedMinorUnits: 0,
                releasedMinorUnits: 0,
                status: "held",
              }]
            : [{ id: "journal-1" }]
        ),
      })),
    };
  });
  return {
    select,
    insert,
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(async () => []) })),
    })),
    budget,
  };
}

describe("economicDurableService", () => {
  it("persists intent, hold, budget movement, and balanced journal in one transaction port", async () => {
    const query = makeQuery();
    const result = await reserveEconomicHoldInTransaction(query as never, {
      intent: {
        intentId: "intent-1",
        tenantId: "tenant-1",
        actorId: "user-1",
        actorType: "user",
        policyVersion: "policy-v1",
        jobId: "job-1",
        attemptId: "attempt-1",
        idempotencyKey: "intent-key-1",
        amount: { minorUnits: 40, currency: "USD" },
        effectType: "workflow_run",
        resourceRef: "workflow:1",
        createdAt: new Date().toISOString(),
      },
      budgetId: "budget-1",
      idempotencyKey: "hold-key-1",
      journalLines: [
        { accountId: "account-1", tenantId: "tenant-1", currency: "USD", debitMinorUnits: 40, creditMinorUnits: 0 },
        { accountId: "account-2", tenantId: "tenant-1", currency: "USD", debitMinorUnits: 0, creditMinorUnits: 40 },
      ],
      journalDescription: "reserve workflow effect",
    });

    expect(result).toMatchObject({
      id: "hold-1",
      tenantId: "tenant-1",
      amountMinorUnits: 40,
      status: "held",
      replayed: false,
    });
    expect(query.insert).toHaveBeenCalledTimes(4);
    expect(query.update).toHaveBeenCalledTimes(1);
  });

  it("replays an existing hold without moving budget or writing a second journal", async () => {
    const query = makeQuery({
      existingHold: {
        id: "hold-existing",
        tenantId: "tenant-1",
        intentId: "intent-1",
        budgetId: "budget-1",
        currency: "USD",
        amountMinorUnits: 40,
        capturedMinorUnits: 0,
        releasedMinorUnits: 0,
        status: "held",
      },
    });
    const result = await reserveEconomicHoldInTransaction(query as never, {
      intent: {
        intentId: "intent-1",
        tenantId: "tenant-1",
        actorId: "user-1",
        actorType: "user",
        policyVersion: "policy-v1",
        jobId: "job-1",
        attemptId: "attempt-1",
        idempotencyKey: "intent-key-1",
        amount: { minorUnits: 40, currency: "USD" },
        effectType: "workflow_run",
        resourceRef: "workflow:1",
        createdAt: new Date().toISOString(),
      },
      budgetId: "budget-1",
      idempotencyKey: "hold-key-1",
      journalLines: [],
      journalDescription: "reserve workflow effect",
    });

    expect(result).toMatchObject({ id: "hold-existing", replayed: true });
    expect(query.insert).not.toHaveBeenCalled();
    expect(query.update).not.toHaveBeenCalled();
  });

  it("rejects replay across a different budget instead of silently reusing the hold", async () => {
    const query = makeQuery({
      existingHold: {
        id: "hold-existing",
        tenantId: "tenant-1",
        intentId: "intent-1",
        budgetId: "budget-other",
        currency: "USD",
        amountMinorUnits: 40,
        capturedMinorUnits: 0,
        releasedMinorUnits: 0,
        status: "held",
      },
    });

    await expect(
      reserveEconomicHoldInTransaction(query as never, {
        intent: {
          intentId: "intent-1",
          tenantId: "tenant-1",
          actorId: "user-1",
          actorType: "user",
          policyVersion: "policy-v1",
          jobId: "job-1",
          attemptId: "attempt-1",
          idempotencyKey: "intent-key-1",
          amount: { minorUnits: 40, currency: "USD" },
          effectType: "workflow_run",
          resourceRef: "workflow:1",
          createdAt: new Date().toISOString(),
        },
        budgetId: "budget-1",
        idempotencyKey: "hold-key-1",
        journalLines: [],
        journalDescription: "reserve workflow effect",
      })
    ).rejects.toMatchObject({ code: "HOLD_IDEMPOTENCY_CONFLICT" });
  });
});
