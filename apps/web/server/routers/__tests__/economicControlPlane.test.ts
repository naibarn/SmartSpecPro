import { describe, expect, it } from "vitest";
import {
  previewEconomicAdmission,
  redactEconomicRecord,
} from "../economicControlPlane";

describe("economicControlPlane router boundary", () => {
  it("redacts provider secrets and raw payloads from projections", () => {
    expect(
      redactEconomicRecord({
        id: "1",
        status: "held",
        secret: "x",
        token: "y",
        rawProviderPayload: "z",
      })
    ).toEqual({ id: "1", status: "held" });
  });

  it("builds the canonical economic admission input at the router boundary", () => {
    const result = previewEconomicAdmission(
      { tenantId: "tenant-a", user: { id: 7 } },
      {
        jobId: "job-1",
        attemptId: "attempt-1",
        idempotencyKey: "preview-key-1",
        effectType: "workflow_run",
        resourceRef: "workflow-version:1",
        amount: { minorUnits: 20, currency: "usd" },
      }
    );
    expect(result.intent).toMatchObject({
      tenantId: "tenant-a",
      actorId: "7",
      amount: { minorUnits: 20, currency: "USD" },
    });
  });
});
