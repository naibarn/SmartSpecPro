import { describe, expect, it } from "vitest";
import {
  evaluateComputerUseEffect,
  releaseFailedComputerUse,
  ComputerUseEconomicsError,
} from "../computerUseEconomics";

const input = {
  tenantId: "tenant-1",
  actorId: "user-1",
  jobId: "job-1",
  attemptId: "attempt-1",
  idempotencyKey: "computer-use-1",
  policy: "allowed" as const,
  approval: true,
  routeReady: false,
  amountMinorUnits: 10,
  currency: "USD",
};

describe("computerUseEconomics", () => {
  it("keeps policy denial distinct from technical fallback", () => {
    expect(
      evaluateComputerUseEffect({ ...input, policy: "denied" })
    ).toMatchObject({ decision: "denied", fallbackEligible: false });
    expect(evaluateComputerUseEffect(input)).toMatchObject({
      decision: "approved",
      fallbackEligible: true,
      reservation: { status: "held" },
    });
    expect(
      releaseFailedComputerUse(evaluateComputerUseEffect(input).reservation!)
    ).toMatchObject({ status: "released" });
  });

  it("requires approval for consequential effects", () => {
    expect(
      evaluateComputerUseEffect({ ...input, approval: false })
    ).toMatchObject({ decision: "approval_required", fallbackEligible: false });
    expect(() =>
      evaluateComputerUseEffect({ ...input, amountMinorUnits: -1 })
    ).toThrowError(new ComputerUseEconomicsError("AMOUNT_INVALID"));
  });
});
