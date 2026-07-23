/**
 * Marketplace text-plan review gate (planning/marketplace-storyboard-text-
 * gate) — router-layer contract for the two new mutations
 * `approveAutoReviewPlanReview` and `requestAutoReviewPlanRedraft`, plus the
 * inline per-shot dialogue correction mutation `updateAutoReviewPlanShot
 * Dialogue`.
 * Conventions cloned from `marketplaceCapture.sequentialShotAlternate.test.ts`
 * (hoisted JWT_SECRET + zod introspection via
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

describe("T1 — approveAutoReviewPlanReview / requestAutoReviewPlanRedraft are registered additively", () => {
  it("adds both new procedures without removing any existing auto-review procedure", () => {
    const procedures = Object.keys(
      (marketplaceCaptureRouter as unknown as { _def: { procedures: object } })
        ._def.procedures
    );

    expect(procedures).toContain("approveAutoReviewPlanReview");
    expect(procedures).toContain("requestAutoReviewPlanRedraft");
    expect(procedures).toContain("updateAutoReviewPlanShotDialogue");

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
    expect(procedures).toContain("selectAutoReviewSequentialShotAlternate");
    expect(procedures).toContain("cancelAutoReviewRun");
  });
});

describe("T2 — approveAutoReviewPlanReview input contract", () => {
  const schema = procedureInputSchema("approveAutoReviewPlanReview");

  it("accepts a plain runId", () => {
    expect(schema.safeParse({ runId: "mar_1" }).success).toBe(true);
  });

  it("rejects an empty runId, a missing runId, and a 65-char runId", () => {
    expect(schema.safeParse({ runId: "" }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ runId: "a".repeat(65) }).success).toBe(false);
  });

  it("accepts the boundary 64-char runId", () => {
    expect(schema.safeParse({ runId: "a".repeat(64) }).success).toBe(true);
  });
});

describe("T3 — requestAutoReviewPlanRedraft input contract", () => {
  const schema = procedureInputSchema("requestAutoReviewPlanRedraft");

  it("accepts runId alone (notes optional)", () => {
    expect(schema.safeParse({ runId: "mar_1" }).success).toBe(true);
  });

  it("accepts runId with notes", () => {
    expect(
      schema.safeParse({ runId: "mar_1", notes: "วัสดุเป็นพลาสติก ไม่ใช่ผ้า" })
        .success
    ).toBe(true);
  });

  it("rejects an empty runId and a missing runId", () => {
    expect(schema.safeParse({ runId: "" }).success).toBe(false);
    expect(schema.safeParse({ notes: "x" }).success).toBe(false);
  });

  it("accepts notes at the 2000-char boundary and rejects 2001 chars", () => {
    expect(
      schema.safeParse({ runId: "mar_1", notes: "a".repeat(2000) }).success
    ).toBe(true);
    expect(
      schema.safeParse({ runId: "mar_1", notes: "a".repeat(2001) }).success
    ).toBe(false);
  });

  it("rejects a non-string notes value", () => {
    expect(
      schema.safeParse({ runId: "mar_1", notes: 12345 }).success
    ).toBe(false);
  });
});

describe("T5 — updateAutoReviewPlanShotDialogue input contract", () => {
  const schema = procedureInputSchema("updateAutoReviewPlanShotDialogue");

  it("accepts a plain runId/shotId/dialogue triple", () => {
    expect(
      schema.safeParse({ runId: "mar_1", shotId: 4, dialogue: "บทพูดใหม่" })
        .success
    ).toBe(true);
  });

  it("accepts an empty dialogue (silences a shot)", () => {
    expect(
      schema.safeParse({ runId: "mar_1", shotId: 4, dialogue: "" }).success
    ).toBe(true);
  });

  it("rejects an empty runId, a missing runId, and a 65-char runId", () => {
    expect(
      schema.safeParse({ runId: "", shotId: 1, dialogue: "x" }).success
    ).toBe(false);
    expect(schema.safeParse({ shotId: 1, dialogue: "x" }).success).toBe(
      false
    );
    expect(
      schema.safeParse({ runId: "a".repeat(65), shotId: 1, dialogue: "x" })
        .success
    ).toBe(false);
  });

  it("accepts the boundary 64-char runId", () => {
    expect(
      schema.safeParse({ runId: "a".repeat(64), shotId: 1, dialogue: "x" })
        .success
    ).toBe(true);
  });

  it("rejects shotId 0, shotId 10, a non-integer shotId, and a missing shotId", () => {
    expect(
      schema.safeParse({ runId: "mar_1", shotId: 0, dialogue: "x" }).success
    ).toBe(false);
    expect(
      schema.safeParse({ runId: "mar_1", shotId: 10, dialogue: "x" }).success
    ).toBe(false);
    expect(
      schema.safeParse({ runId: "mar_1", shotId: 4.5, dialogue: "x" }).success
    ).toBe(false);
    expect(schema.safeParse({ runId: "mar_1", dialogue: "x" }).success).toBe(
      false
    );
  });

  it("accepts the shotId boundaries 1 and 9", () => {
    expect(
      schema.safeParse({ runId: "mar_1", shotId: 1, dialogue: "x" }).success
    ).toBe(true);
    expect(
      schema.safeParse({ runId: "mar_1", shotId: 9, dialogue: "x" }).success
    ).toBe(true);
  });

  it("rejects a missing dialogue and a non-string dialogue", () => {
    expect(
      schema.safeParse({ runId: "mar_1", shotId: 1 }).success
    ).toBe(false);
    expect(
      schema.safeParse({ runId: "mar_1", shotId: 1, dialogue: 12345 }).success
    ).toBe(false);
  });

  it("accepts dialogue at the 2000-char boundary and rejects 2001 chars", () => {
    expect(
      schema.safeParse({ runId: "mar_1", shotId: 1, dialogue: "a".repeat(2000) })
        .success
    ).toBe(true);
    expect(
      schema.safeParse({ runId: "mar_1", shotId: 1, dialogue: "a".repeat(2001) })
        .success
    ).toBe(false);
  });
});

describe("T6 — auth is enforced by the real protectedProcedure middleware", () => {
  it("rejects approveAutoReviewPlanReview with no user", async () => {
    const caller = marketplaceCaptureRouter.createCaller(createContext(null));
    await expect(
      caller.approveAutoReviewPlanReview({ runId: "mar_1" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects requestAutoReviewPlanRedraft with no user", async () => {
    const caller = marketplaceCaptureRouter.createCaller(createContext(null));
    await expect(
      caller.requestAutoReviewPlanRedraft({ runId: "mar_1", notes: "x" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects updateAutoReviewPlanShotDialogue with no user", async () => {
    const caller = marketplaceCaptureRouter.createCaller(createContext(null));
    await expect(
      caller.updateAutoReviewPlanShotDialogue({
        runId: "mar_1",
        shotId: 1,
        dialogue: "x",
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
