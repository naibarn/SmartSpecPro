/**
 * Marketplace Auto Review — creation-time drama casting (planning/
 * marketplace-flexible-shots-and-creation-casting/plan.md, W2). Router input
 * contract for the top-level `characterCast` field on `startAutoReview`
 * (mirrors `marketplaceCapture.motionDirection.test.ts`'s technique).
 */
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
      data?: {
        characterCast?: Array<{
          characterName: string;
          characterRole?: "host" | "guest";
          portraitAssetId?: string;
          url?: string;
        }>;
      };
      error?: unknown;
    };
  };
  return schema;
}

describe("startAutoReview characterCast input contract", () => {
  const schema = startAutoReviewInputSchema();

  it("accepts an absent characterCast (optional, byte-compatible)", () => {
    const result = schema.safeParse({ productId: "prod_1" });
    expect(result.success).toBe(true);
    expect(result.data?.characterCast).toBeUndefined();
  });

  it("accepts a single-cast entry resolved via portraitAssetId", () => {
    const result = schema.safeParse({
      productId: "prod_1",
      characterCast: [
        { characterName: "ไอริณ", portraitAssetId: "42" },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.data?.characterCast).toHaveLength(1);
    expect(result.data?.characterCast?.[0].characterName).toBe("ไอริณ");
  });

  it("accepts two cast entries (host + guest) resolved via url", () => {
    const result = schema.safeParse({
      productId: "prod_1",
      characterCast: [
        {
          characterName: "ไอริณ",
          characterRole: "host",
          url: "https://cdn.example.com/irin.png",
        },
        {
          characterName: "ธนกร",
          characterRole: "guest",
          url: "https://cdn.example.com/thanakorn.png",
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.data?.characterCast).toHaveLength(2);
  });

  /* Roster widened 2 -> 4 by `planning/marketplace-four-character-cast/plan.md`
     P1: two speaking leads plus up to two supporting characters, VD-picked and
     self-uploaded counted together. */
  it("accepts a full 4-entry roster", () => {
    const result = schema.safeParse({
      productId: "prod_1",
      characterCast: [
        { characterName: "A", url: "https://cdn.example.com/a.png" },
        { characterName: "B", url: "https://cdn.example.com/b.png" },
        {
          characterName: "C",
          characterRole: "support",
          url: "https://cdn.example.com/c.png",
        },
        {
          characterName: "น้องปุย",
          characterRole: "support",
          depictsMinor: true,
          url: "https://cdn.example.com/d.png",
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.data?.characterCast).toHaveLength(4);
  });

  it("rejects a fifth cast entry (max 4)", () => {
    const result = schema.safeParse({
      productId: "prod_1",
      characterCast: [
        { characterName: "A", url: "https://cdn.example.com/a.png" },
        { characterName: "B", url: "https://cdn.example.com/b.png" },
        { characterName: "C", url: "https://cdn.example.com/c.png" },
        { characterName: "D", url: "https://cdn.example.com/d.png" },
        { characterName: "E", url: "https://cdn.example.com/e.png" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a cast entry with neither url nor portraitAssetId", () => {
    const result = schema.safeParse({
      productId: "prod_1",
      characterCast: [{ characterName: "ไม่มีรูป" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a cast entry with an empty characterName", () => {
    const result = schema.safeParse({
      productId: "prod_1",
      characterCast: [
        { characterName: "", url: "https://cdn.example.com/a.png" },
      ],
    });
    expect(result.success).toBe(false);
  });
});
