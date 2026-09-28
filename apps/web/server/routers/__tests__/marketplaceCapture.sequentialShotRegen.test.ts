/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 08 §5.1. Router-layer contract for the two additive per-shot
 * regeneration mutations. Conventions cloned from
 * `marketplaceCapture.motionDirection.test.ts` (hoisted JWT_SECRET + zod
 * introspection via `_def.procedures.<name>._def.inputs[0]`) and
 * `marketplaceCapture.hyperframesRuntimeApi.test.ts` (procedure-registration
 * list + real `protectedProcedure` UNAUTHORIZED check via `createCaller`).
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

describe("T1 — sequential shot regen procedures are registered additively", () => {
  it("adds the two new procedures without removing existing Standard Order procedures", () => {
    const procedures = Object.keys(
      (marketplaceCaptureRouter as unknown as { _def: { procedures: object } })
        ._def.procedures
    );

    expect(procedures).toContain("regenerateAutoReviewSequentialShot");
    expect(procedures).toContain("saveAutoReviewSequentialShotOverride");
    expect(procedures).toContain("generateAutoReviewSequentialShotPrompt");

    // Nothing removed (section 08 §7: additive-only router change).
    expect(procedures).toContain("startAutoReview");
    expect(procedures).toContain("getAutoReviewRun");
    expect(procedures).toContain("listAutoReviewRuns");
    expect(procedures).toContain("advanceAutoReviewRun");
    expect(procedures).toContain(
      "selectAutoReviewImageAttemptForStoryboardReview"
    );
    expect(procedures).toContain("cancelAutoReviewRun");
  });
});

describe("T2 — regenerateAutoReviewSequentialShot input contract", () => {
  const schema = procedureInputSchema("regenerateAutoReviewSequentialShot");

  it("accepts shotId 1..9 with runId, refreshPrompt defaulting to false", () => {
    for (const shotId of [1, 5, 9]) {
      const result = schema.safeParse({ runId: "mar_1", shotId });
      expect(result.success, `shotId ${shotId} should be accepted`).toBe(true);
      expect(result.data?.refreshPrompt).toBe(false);
    }
  });

  it("accepts an explicit refreshPrompt: true", () => {
    const result = schema.safeParse({
      runId: "mar_1",
      shotId: 4,
      refreshPrompt: true,
    });
    expect(result.success).toBe(true);
    expect(result.data?.refreshPrompt).toBe(true);
  });

  it("rejects shotId 0, 10, -1, 2.5, and a string", () => {
    for (const shotId of [0, 10, -1, 2.5, "3"]) {
      const result = schema.safeParse({ runId: "mar_1", shotId });
      expect(result.success, `shotId ${JSON.stringify(shotId)} should be rejected`).toBe(
        false
      );
    }
  });

  it("rejects a missing shotId", () => {
    const result = schema.safeParse({ runId: "mar_1" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty runId and a 65-char runId", () => {
    expect(schema.safeParse({ runId: "", shotId: 1 }).success).toBe(false);
    expect(
      schema.safeParse({ runId: "a".repeat(65), shotId: 1 }).success
    ).toBe(false);
  });
});

describe("T3 — saveAutoReviewSequentialShotOverride input contract", () => {
  const schema = procedureInputSchema("saveAutoReviewSequentialShotOverride");

  it("accepts a pure clear: true with no text fields", () => {
    const result = schema.safeParse({ runId: "mar_1", shotId: 3, clear: true });
    expect(result.success).toBe(true);
    expect(result.data?.clear).toBe(true);
  });

  it("clear defaults to false when absent", () => {
    const result = schema.safeParse({ runId: "mar_1", shotId: 3 });
    expect(result.success).toBe(true);
    expect(result.data?.clear).toBe(false);
  });

  it("accepts a per-shot story summary alongside editable prompts", () => {
    const result = schema.safeParse({
      runId: "mar_1",
      shotId: 3,
      visualSummary: "ผู้ใช้สาธิตการใช้งานสินค้าบนโต๊ะ",
      dialogue: "นี่คือบทพูดของช็อตนี้",
    });
    expect(result.success).toBe(true);
  });

  it("accepts any subset of the three text fields", () => {
    expect(
      schema.safeParse({ runId: "mar_1", shotId: 3, dialogue: "line" }).success
    ).toBe(true);
    expect(
      schema.safeParse({
        runId: "mar_1",
        shotId: 3,
        startFrameImagePrompt: "a prompt",
      }).success
    ).toBe(true);
    expect(
      schema.safeParse({ runId: "mar_1", shotId: 3, videoPrompt: "a prompt" })
        .success
    ).toBe(true);
    expect(
      schema.safeParse({
        runId: "mar_1",
        shotId: 3,
        dialogue: "line",
        startFrameImagePrompt: "a prompt",
        videoPrompt: "a video prompt",
      }).success
    ).toBe(true);
  });

  it("trims whitespace from the text fields", () => {
    const result = schema.safeParse({
      runId: "mar_1",
      shotId: 3,
      dialogue: "   spaced text   ",
    });
    expect(result.success).toBe(true);
    expect(result.data?.dialogue).toBe("spaced text");
  });

  it("rejects startFrameImagePrompt over 4000 chars", () => {
    const result = schema.safeParse({
      runId: "mar_1",
      shotId: 3,
      startFrameImagePrompt: "a".repeat(4001),
    });
    expect(result.success).toBe(false);
  });

  it("accepts startFrameImagePrompt at exactly 4000 chars", () => {
    const result = schema.safeParse({
      runId: "mar_1",
      shotId: 3,
      startFrameImagePrompt: "a".repeat(4000),
    });
    expect(result.success).toBe(true);
  });

  it("rejects videoPrompt over 2000 chars", () => {
    const result = schema.safeParse({
      runId: "mar_1",
      shotId: 3,
      videoPrompt: "a".repeat(2001),
    });
    expect(result.success).toBe(false);
  });
});

describe("T3b — generateAutoReviewSequentialShotPrompt input contract", () => {
  const schema = procedureInputSchema("generateAutoReviewSequentialShotPrompt");

  it("accepts exactly one prompt stage for each shot", () => {
    expect(
      schema.safeParse({ runId: "mar_1", shotId: 1, stage: "image" }).success
    ).toBe(true);
    expect(
      schema.safeParse({ runId: "mar_1", shotId: 9, stage: "video" }).success
    ).toBe(true);
  });

  it("rejects a missing or unsupported stage", () => {
    expect(schema.safeParse({ runId: "mar_1", shotId: 1 }).success).toBe(false);
    expect(
      schema.safeParse({ runId: "mar_1", shotId: 1, stage: "media" }).success
    ).toBe(false);
  });
});

describe("T4 — auth is enforced by the real protectedProcedure middleware", () => {
  it("rejects regenerateAutoReviewSequentialShot with no user", async () => {
    const caller = marketplaceCaptureRouter.createCaller(createContext(null));
    await expect(
      caller.regenerateAutoReviewSequentialShot({ runId: "mar_1", shotId: 1 })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects saveAutoReviewSequentialShotOverride with no user", async () => {
    const caller = marketplaceCaptureRouter.createCaller(createContext(null));
    await expect(
      caller.saveAutoReviewSequentialShotOverride({
        runId: "mar_1",
        shotId: 1,
        dialogue: "line",
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects generateAutoReviewSequentialShotPrompt with no user", async () => {
    const caller = marketplaceCaptureRouter.createCaller(createContext(null));
    await expect(
      caller.generateAutoReviewSequentialShotPrompt({
        runId: "mar_1",
        shotId: 1,
        stage: "image",
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
