import { describe, expect, it } from "vitest";
import {
  EconomicControlPlaneError,
  captureHold,
  releaseHold,
  reserveHold,
  type EconomicHoldState,
} from "../economicControlPlane";

const base: EconomicHoldState = {
  id: "hold-1",
  tenantId: "tenant-1",
  intentId: "intent-1",
  currency: "USD",
  amountMinorUnits: 100,
  capturedMinorUnits: 0,
  releasedMinorUnits: 0,
  status: "held",
};

describe("economicControlPlane transitions", () => {
  it("reserves an amount once and replays the same idempotency key", () => {
    expect(
      reserveHold({
        tenantId: "tenant-1",
        intentId: "intent-1",
        currency: "USD",
        amountMinorUnits: 100,
        idempotencyKey: "reserve-1",
      })
    ).toMatchObject({ status: "held", replayed: false });

    expect(
      reserveHold({
        tenantId: "tenant-1",
        intentId: "intent-1",
        currency: "USD",
        amountMinorUnits: 100,
        idempotencyKey: "reserve-1",
      })
    ).toMatchObject({ status: "held", replayed: true });
  });

  it("requires a verified receipt and caps partial capture", () => {
    expect(() =>
      captureHold(base, { amountMinorUnits: 50, receiptVerified: false })
    ).toThrowError(new EconomicControlPlaneError("RECEIPT_REQUIRED"));

    const partial = captureHold(base, {
      amountMinorUnits: 40,
      receiptVerified: true,
    });
    expect(partial).toMatchObject({
      status: "partially_captured",
      capturedMinorUnits: 40,
    });

    expect(() =>
      captureHold(partial, { amountMinorUnits: 70, receiptVerified: true })
    ).toThrowError(new EconomicControlPlaneError("CAPTURE_EXCEEDS_HOLD"));
  });

  it("releases the unused amount and makes duplicate release a replay", () => {
    const released = releaseHold(base);
    expect(released).toMatchObject({
      status: "released",
      releasedMinorUnits: 100,
    });
    expect(releaseHold(released)).toMatchObject({
      status: "released",
      releasedMinorUnits: 100,
      replayed: true,
    });
  });

  it("does not infer external finality from a pending receipt", () => {
    const pending = captureHold(base, {
      amountMinorUnits: 0,
      receiptVerified: true,
      receiptStatus: "pending",
    });
    expect(pending).toMatchObject({ status: "reconciliation_required" });
  });
});
