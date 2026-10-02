import { describe, expect, it } from "vitest";
import { resolveEmergencyNeedFulfillment } from "./needFulfillment";

describe("resolveEmergencyNeedFulfillment", () => {
  it("derives a fully fulfilled state from the requested quantity", () => {
    expect(resolveEmergencyNeedFulfillment({ currentStatus: "verified", requestedQuantity: "4.000", currentFulfilledQuantity: "0.000", fulfilledQuantity: 4 }))
      .toEqual({ ok: true, status: "fulfilled", fulfilledQuantity: "4.000" });
  });

  it("rejects status claims that contradict the recorded quantity", () => {
    expect(resolveEmergencyNeedFulfillment({ currentStatus: "verified", requestedQuantity: "4", currentFulfilledQuantity: "1", requestedStatus: "fulfilled" }))
      .toEqual({ ok: false, reason: "quantity_status" });
    expect(resolveEmergencyNeedFulfillment({ currentStatus: "verified", requestedQuantity: "4", currentFulfilledQuantity: "4", requestedStatus: "partially_fulfilled" }))
      .toEqual({ ok: false, reason: "quantity_status" });
  });

  it("counts active expected contributions before accepting a quantity update", () => {
    expect(resolveEmergencyNeedFulfillment({ currentStatus: "partially_fulfilled", requestedQuantity: "10", currentFulfilledQuantity: "6", fulfilledQuantity: 7, activeReservationsMilli: 3_000 }))
      .toEqual({ ok: false, reason: "quantity" });
    expect(resolveEmergencyNeedFulfillment({ currentStatus: "partially_fulfilled", requestedQuantity: "10", currentFulfilledQuantity: "6", requestedStatus: "cancelled", activeReservationsMilli: 1_000 }))
      .toEqual({ ok: false, reason: "active_assignments" });
  });

  it("preserves cancellation when there are no active reservations", () => {
    expect(resolveEmergencyNeedFulfillment({ currentStatus: "partially_fulfilled", requestedQuantity: "10", currentFulfilledQuantity: "10", requestedStatus: "cancelled" }))
      .toEqual({ ok: true, status: "cancelled", fulfilledQuantity: "10.000" });
  });
});
