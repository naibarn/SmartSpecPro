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
      data?: { motionDirection?: string };
      error?: unknown;
    };
  };
  return schema;
}

describe("startAutoReview motionDirection input contract", () => {
  const schema = startAutoReviewInputSchema();

  it("accepts an optional motionDirection free-text value", () => {
    const result = schema.safeParse({
      productId: "prod_1",
      motionDirection:
        "นางแบบหยิบขวดแชมพูขึ้นมา กดหัวปั๊มให้แชมพูไหลลงบนฝ่ามือ แล้วปิดท้ายด้วยการโชว์สินค้า",
    });
    expect(result.success).toBe(true);
    expect(result.data?.motionDirection).toContain("นางแบบหยิบขวดแชมพู");
  });

  it("trims surrounding whitespace from motionDirection", () => {
    const result = schema.safeParse({
      productId: "prod_1",
      motionDirection: "   pump and pour then showcase   ",
    });
    expect(result.success).toBe(true);
    expect(result.data?.motionDirection).toBe("pump and pour then showcase");
  });

  it("accepts input with motionDirection absent (optional)", () => {
    const result = schema.safeParse({ productId: "prod_1" });
    expect(result.success).toBe(true);
    expect(result.data?.motionDirection).toBeUndefined();
  });

  it("rejects a whitespace-only motionDirection (min 1 after trim)", () => {
    const result = schema.safeParse({
      productId: "prod_1",
      motionDirection: "     ",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a motionDirection longer than 2000 characters", () => {
    const result = schema.safeParse({
      productId: "prod_1",
      motionDirection: "a".repeat(2001),
    });
    expect(result.success).toBe(false);
  });
});
