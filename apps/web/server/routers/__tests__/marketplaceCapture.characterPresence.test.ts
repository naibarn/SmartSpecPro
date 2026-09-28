import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    process.env.JWT_SECRET = "test-jwt-secret-for-marketplace-capture-router";
  }
});

vi.mock("../../db", () => ({ getDb: vi.fn(async () => null) }));

import { marketplaceCaptureRouter } from "../marketplaceCapture";

function startAutoReviewInputSchema() {
  const proc = (
    marketplaceCaptureRouter as unknown as {
      _def: {
        procedures: Record<
          string,
          { _def: { inputs: Array<{ safeParse: (v: unknown) => unknown }> } }
        >;
      };
    }
  )._def.procedures.startAutoReview;
  const schema = proc._def.inputs[0] as {
    safeParse: (v: unknown) => {
      success: boolean;
      data?: { characterPresenceMode?: string };
      error?: unknown;
    };
  };
  return schema;
}

describe("startAutoReview characterPresenceMode input contract", () => {
  const schema = startAutoReviewInputSchema();

  it("accepts the every_frame and most_frames intensity levels", () => {
    for (const mode of ["auto", "every_frame", "most_frames"] as const) {
      const result = schema.safeParse({
        productId: "prod_1",
        characterPresenceMode: mode,
      });
      expect(result.success).toBe(true);
      expect(result.data?.characterPresenceMode).toBe(mode);
    }
  });

  it("accepts input with characterPresenceMode absent (optional)", () => {
    const result = schema.safeParse({ productId: "prod_1" });
    expect(result.success).toBe(true);
    expect(result.data?.characterPresenceMode).toBeUndefined();
  });

  it("rejects an unknown characterPresenceMode value", () => {
    const result = schema.safeParse({
      productId: "prod_1",
      characterPresenceMode: "sometimes",
    });
    expect(result.success).toBe(false);
  });
});
