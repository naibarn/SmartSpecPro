import { describe, expect, it } from "vitest";
import { requestPostCaptureRefund } from "../economicRefundContract";

describe("post-capture refund contract", () => {
  it("fails closed until approved accounting and rail policy exists", () => {
    expect(() => requestPostCaptureRefund({
      tenantId: "tenant-a",
      capturedJournalEntryId: "entry-a",
      amountMinorUnits: 100,
      currency: "USD",
      idempotencyKey: "refund-key-0001",
      actorId: "7",
      reason: "customer request",
    })).toThrow("ECONOMIC_REFUND_POLICY_REQUIRED");
  });
});
