import { describe, expect, it } from "vitest";

import {
  EconomicDurableError,
  releaseEconomicHoldState,
} from "../economicDurableService";

describe("durable economic hold release semantics", () => {
  it("releases only the unconsumed amount and is idempotent", () => {
    const partial = releaseEconomicHoldState({
      id: "hold-1",
      tenantId: "tenant-a",
      intentId: "intent-1",
      budgetId: "budget-1",
      workerJobId: "job-1",
      attemptId: "attempt-1",
      currency: "USD",
      amountMinorUnits: 500,
      capturedMinorUnits: 100,
      releasedMinorUnits: 0,
      status: "held",
    });

    expect(partial).toMatchObject({
      status: "released",
      releasedMinorUnits: 400,
      replayed: false,
    });
    expect(releaseEconomicHoldState(partial)).toMatchObject({
      status: "released",
      releasedMinorUnits: 400,
      replayed: true,
    });
  });

  it("does not release a captured or reconciliation-required hold", () => {
    expect(() =>
      releaseEconomicHoldState({
        id: "hold-1",
        tenantId: "tenant-a",
        intentId: "intent-1",
        budgetId: "budget-1",
        workerJobId: "job-1",
        attemptId: "attempt-1",
        currency: "USD",
        amountMinorUnits: 500,
        capturedMinorUnits: 500,
        releasedMinorUnits: 0,
        status: "captured",
      })
    ).toThrowError(EconomicDurableError);
  });
});
