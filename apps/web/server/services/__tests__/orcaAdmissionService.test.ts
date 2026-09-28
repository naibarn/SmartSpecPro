import { describe, expect, it } from "vitest";
import {
  admitOrcaEffect,
  releaseFailedOrcaLaunch,
  OrcaAdmissionError,
} from "../orcaAdmissionService";

const input = {
  server: {
    tenantId: "tenant-1",
    actorId: "user-7",
    policyVersion: "policy-1",
  },
  claims: { tenantId: "tenant-1", actorId: "user-7" },
  jobId: "job-1",
  attemptId: "attempt-1",
  idempotencyKey: "orca-effect-1",
  resourceRef: "workflow:1",
  amountMinorUnits: 10,
  currency: "USD",
  auth: { status: "valid" as const, expiresAt: "2026-09-19T01:00:00Z" },
  approval: { required: false, approved: true, expiresAt: null },
  now: new Date("2026-09-19T00:00:00Z"),
};

describe("orcaAdmissionService", () => {
  it("requires server-derived authority and valid auth/approval", () => {
    expect(admitOrcaEffect(input)).toMatchObject({
      decision: "approved",
      intent: { jobId: "job-1" },
    });
    expect(() =>
      admitOrcaEffect({
        ...input,
        claims: { ...input.claims, tenantId: "tenant-2" },
      })
    ).toThrowError(new OrcaAdmissionError("TENANT_AUTHORITY_MISMATCH"));
    expect(() =>
      admitOrcaEffect({
        ...input,
        auth: { status: "expired", expiresAt: "2026-09-18T00:00:00Z" },
      })
    ).toThrowError(new OrcaAdmissionError("AUTH_EXPIRED"));
    expect(
      admitOrcaEffect({
        ...input,
        approval: {
          required: true,
          approved: false,
          expiresAt: "2026-09-19T01:00:00Z",
        },
      })
    ).toMatchObject({
      decision: "approval_required",
      reasonCode: "APPROVAL_REQUIRED",
    });
  });

  it("releases the economic hold when launch fails", () => {
    const admitted = admitOrcaEffect(input);
    expect(admitted.reservation).toMatchObject({ status: "held" });
    expect(releaseFailedOrcaLaunch(admitted.reservation!)).toMatchObject({
      status: "released",
    });
  });
});
