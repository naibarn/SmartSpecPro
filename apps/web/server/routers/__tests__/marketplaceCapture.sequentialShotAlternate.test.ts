/**
 * Marketplace spare-image repair — router-layer contract for the new
 * `selectAutoReviewSequentialShotAlternate` mutation. Conventions cloned
 * from `marketplaceCapture.sequentialShotRegen.test.ts` (hoisted
 * JWT_SECRET + zod introspection via
 * `_def.procedures.<name>._def.inputs[0]`, plus a real `protectedProcedure`
 * UNAUTHORIZED check via `createCaller`).
 */
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    process.env.JWT_SECRET = "test-jwt-secret-for-marketplace-capture-router";
  }
});

vi.mock("../../db", () => ({ getDb: vi.fn(async () => null) }));

import { marketplaceCaptureRouter } from "../marketplaceCapture";
import type { TrpcContext } from "../../_core/context";

type ZodLikeSchema = {
  safeParse: (v: unknown) => {
    success: boolean;
    data?: Record<string, unknown>;
    error?: unknown;
  };
};

function procedureInputSchema(name: string): ZodLikeSchema {
  const proc = (
    marketplaceCaptureRouter as unknown as {
      _def: {
        procedures: Record<string, { _def: { inputs: ZodLikeSchema[] } }>;
      };
    }
  )._def.procedures[name];
  return proc._def.inputs[0];
}

function createContext(user: Record<string, unknown> | null): TrpcContext {
  return {
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    user: user as TrpcContext["user"],
    userToken: null,
    privateVaultToken: null,
    tenantId: "tenant_router",
    publicUrl: "https://example.test",
  };
}

describe("T1 — selectAutoReviewSequentialShotAlternate is registered additively", () => {
  it("adds the new procedure without removing any existing sequential-storyboard procedure", () => {
    const procedures = Object.keys(
      (marketplaceCaptureRouter as unknown as { _def: { procedures: object } })
        ._def.procedures
    );

    expect(procedures).toContain("selectAutoReviewSequentialShotAlternate");

    // Nothing removed (additive-only router change).
    expect(procedures).toContain("startAutoReview");
    expect(procedures).toContain("getAutoReviewRun");
    expect(procedures).toContain("listAutoReviewRuns");
    expect(procedures).toContain("advanceAutoReviewRun");
    expect(procedures).toContain(
      "selectAutoReviewImageAttemptForStoryboardReview"
    );
    expect(procedures).toContain("regenerateAutoReviewSequentialShot");
    expect(procedures).toContain("saveAutoReviewSequentialShotOverride");
    expect(procedures).toContain("cancelAutoReviewRun");
  });
});

describe("T2 — selectAutoReviewSequentialShotAlternate input contract", () => {
  const schema = procedureInputSchema("selectAutoReviewSequentialShotAlternate");

  it("accepts shotId 1..9 with runId and a positive attempt", () => {
    for (const shotId of [1, 5, 9]) {
      const result = schema.safeParse({ runId: "mar_1", shotId, attempt: 1 });
      expect(result.success, `shotId ${shotId} should be accepted`).toBe(true);
    }
  });

  it("rejects shotId 0, 10, -1, 2.5, and a string", () => {
    for (const shotId of [0, 10, -1, 2.5, "3"]) {
      const result = schema.safeParse({ runId: "mar_1", shotId, attempt: 1 });
      expect(
        result.success,
        `shotId ${JSON.stringify(shotId)} should be rejected`
      ).toBe(false);
    }
  });

  it("rejects attempt 0, negative, non-integer, over 20, and a string", () => {
    for (const attempt of [0, -1, 1.5, 21, "2"]) {
      const result = schema.safeParse({ runId: "mar_1", shotId: 2, attempt });
      expect(
        result.success,
        `attempt ${JSON.stringify(attempt)} should be rejected`
      ).toBe(false);
    }
  });

  it("accepts attempt at the boundary values 1 and 20", () => {
    expect(
      schema.safeParse({ runId: "mar_1", shotId: 2, attempt: 1 }).success
    ).toBe(true);
    expect(
      schema.safeParse({ runId: "mar_1", shotId: 2, attempt: 20 }).success
    ).toBe(true);
  });

  it("rejects a missing shotId or a missing attempt", () => {
    expect(
      schema.safeParse({ runId: "mar_1", attempt: 1 }).success
    ).toBe(false);
    expect(
      schema.safeParse({ runId: "mar_1", shotId: 2 }).success
    ).toBe(false);
  });

  it("rejects an empty runId and a 65-char runId", () => {
    expect(
      schema.safeParse({ runId: "", shotId: 1, attempt: 1 }).success
    ).toBe(false);
    expect(
      schema.safeParse({ runId: "a".repeat(65), shotId: 1, attempt: 1 })
        .success
    ).toBe(false);
  });
});

describe("T3 — auth is enforced by the real protectedProcedure middleware", () => {
  it("rejects selectAutoReviewSequentialShotAlternate with no user", async () => {
    const caller = marketplaceCaptureRouter.createCaller(createContext(null));
    await expect(
      caller.selectAutoReviewSequentialShotAlternate({
        runId: "mar_1",
        shotId: 1,
        attempt: 1,
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
