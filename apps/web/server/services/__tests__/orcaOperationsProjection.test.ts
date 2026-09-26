import { describe, expect, it } from "vitest";
import { buildOrcaOperationsProjection } from "../orcaOperationsProjection";

describe("orcaOperationsProjection", () => {
  it("projects readiness, receipt evidence, and safe recovery state", () => {
    expect(
      buildOrcaOperationsProjection({
        readiness: { status: "ready", reasonCode: "ORCA_READY" },
        session: { state: "running", generation: 2 },
        receipt: { kind: "ack", status: "accepted", effectVerified: false },
        reconciliation: null,
      })
    ).toMatchObject({
      status: "running",
      receiptLabel: "ack_pending_effect_receipt",
      recoverable: true,
    });
    expect(
      buildOrcaOperationsProjection({
        readiness: {
          status: "auth_required",
          reasonCode: "ORCA_AUTH_REQUIRED",
        },
        session: null,
        receipt: null,
        reconciliation: {
          status: "reconciliation_required",
          reasonCode: "EXTERNAL_STATUS_UNKNOWN",
        },
      })
    ).toMatchObject({
      status: "blocked",
      recoverable: false,
      reasonCode: "ORCA_AUTH_REQUIRED",
    });
  });
});
