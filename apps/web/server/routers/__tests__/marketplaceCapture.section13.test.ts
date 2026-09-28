/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 13 §4 deliverable 2. `startAutoReview` router zod gains the
 * optional `startFramePromptStyle` field (section-01 precedent: cloning how
 * `frameStrategy` gained its `sequential_shot_storyboard` enum member in that
 * same procedure, section-01-flags-and-schemas.md §5.5).
 *
 * Introspection convention cloned from
 * `marketplaceCapture.sequentialShotRegen.test.ts`
 * (`_def.procedures.<name>._def.inputs[0]`).
 */
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    process.env.JWT_SECRET = "test-jwt-secret-for-marketplace-capture-router";
  }
});

vi.mock("../../db", () => ({ getDb: vi.fn(async () => null) }));

import { marketplaceCaptureRouter } from "../marketplaceCapture";

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

describe("Feature 136 section 13 — startAutoReview zod gains startFramePromptStyle", () => {
  const schema = procedureInputSchema("startAutoReview");

  function baseInput(overrides: Record<string, unknown> = {}) {
    return {
      productId: "product-1",
      referenceAnchors: { productImageUrl: "https://example.com/p.png" },
      ...overrides,
    };
  }

  it("accepts both style values", () => {
    expect(
      schema.safeParse(
        baseInput({ startFramePromptStyle: "evidence_product" })
      ).success
    ).toBe(true);
    expect(
      schema.safeParse(baseInput({ startFramePromptStyle: "cinematic_auto" }))
        .success
    ).toBe(true);
  });

  it("is optional — absent is valid, existing callers unaffected", () => {
    const result = schema.safeParse(baseInput());
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("startFramePromptStyle");
  });

  it("rejects an unknown style string", () => {
    expect(
      schema.safeParse(baseInput({ startFramePromptStyle: "not_a_style" }))
        .success
    ).toBe(false);
  });

  it("still accepts sequential_shot_storyboard on frameStrategy (section 01, unaffected by this section's edit)", () => {
    expect(
      schema.safeParse(
        baseInput({ frameStrategy: "sequential_shot_storyboard" })
      ).success
    ).toBe(true);
  });
});
