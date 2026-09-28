import { describe, expect, it } from "vitest";

import {
  admitEconomicIntent,
  createMoney,
  EconomicContractError,
} from "../economicControlPlaneTypes";

const baseInput = () => ({
  context: {
    tenantId: "tenant-a",
    actorId: "user-42",
    actorType: "user" as const,
    policyVersion: "policy-v1",
  },
  request: {
    jobId: "job-1",
    attemptId: "attempt-1",
    idempotencyKey: "economic-intent-1",
    amount: { minorUnits: 1250, currency: "USD" },
    effectType: "workflow_run" as const,
    resourceRef: "workflow:published:v1",
  },
});

describe("economic control-plane contracts", () => {
  it("normalizes valid integer money and preserves explicit currency", () => {
    expect(createMoney({ minorUnits: 1250, currency: "usd" })).toEqual({
      minorUnits: 1250,
      currency: "USD",
    });
  });

  it("rejects fractional, negative, unsafe, or malformed currency values", () => {
    for (const input of [
      { minorUnits: 1.5, currency: "USD" },
      { minorUnits: -1, currency: "USD" },
      { minorUnits: Number.MAX_SAFE_INTEGER + 1, currency: "USD" },
      { minorUnits: 1, currency: "US" },
    ]) {
      expect(() => createMoney(input)).toThrowError(
        expect.objectContaining({ code: "ECONOMIC_MONEY_INVALID" })
      );
    }
  });

  it("requires canonical Job and attempt correlation and returns an accepted intent", () => {
    const result = admitEconomicIntent(baseInput());

    expect(result.decision).toEqual({
      status: "accepted",
      reasonCode: "ECONOMIC_INTENT_ACCEPTED",
      policyVersion: "policy-v1",
    });
    expect(result.intent).toMatchObject({
      tenantId: "tenant-a",
      actorId: "user-42",
      jobId: "job-1",
      attemptId: "attempt-1",
      idempotencyKey: "economic-intent-1",
      amount: { minorUnits: 1250, currency: "USD" },
    });
  });

  it("rejects tenant or actor claims that conflict with server-derived authority", () => {
    expect(() =>
      admitEconomicIntent({
        ...baseInput(),
        request: { ...baseInput().request, claimedTenantId: "tenant-b" },
      })
    ).toThrowError(
      expect.objectContaining({ code: "ECONOMIC_TENANT_MISMATCH" })
    );

    expect(() =>
      admitEconomicIntent({
        ...baseInput(),
        request: { ...baseInput().request, claimedActorId: "user-99" },
      })
    ).toThrowError(
      expect.objectContaining({ code: "ECONOMIC_ACTOR_MISMATCH" })
    );
  });

  it("rejects missing correlation or unbounded idempotency keys", () => {
    expect(() =>
      admitEconomicIntent({
        ...baseInput(),
        request: { ...baseInput().request, jobId: "", attemptId: "" },
      })
    ).toThrowError(
      expect.objectContaining({ code: "ECONOMIC_CORRELATION_REQUIRED" })
    );

    expect(() =>
      admitEconomicIntent({
        ...baseInput(),
        request: { ...baseInput().request, idempotencyKey: "x".repeat(129) },
      })
    ).toThrowError(
      expect.objectContaining({ code: "ECONOMIC_IDEMPOTENCY_INVALID" })
    );
  });

  it("exposes a stable typed error code for callers", () => {
    try {
      createMoney({ minorUnits: -1, currency: "USD" });
    } catch (error) {
      expect(error).toBeInstanceOf(EconomicContractError);
      expect((error as EconomicContractError).code).toBe(
        "ECONOMIC_MONEY_INVALID"
      );
    }
  });
});
