/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) — section
 * 02 §4.3 / §5.2. Router-level zod shape contract for the new optional
 * `referenceAnchors.productAngleImages` field on `startAutoReview`. This is a
 * schema-parse test (no DB, no mutation handler invocation) — the real
 * behavior contract for what the resolver does with these entries lives in
 * `server/services/__tests__/marketplaceAutoReview.sequentialReferences.test.ts`.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { z } from "zod";

vi.hoisted(() => {
  process.env.JWT_SECRET = "test-jwt-secret-for-marketplace-capture-router-tests";
});

vi.mock("../../db", () => ({
  getDb: vi.fn(async () => null),
}));

import { marketplaceCaptureRouter } from "../marketplaceCapture";

function startAutoReviewInputSchema(): z.ZodTypeAny {
  const procedure = (
    marketplaceCaptureRouter as unknown as {
      _def: { procedures: Record<string, { _def: { inputs: z.ZodTypeAny[] } }> };
    }
  )._def.procedures.startAutoReview;
  return procedure._def.inputs[0];
}

function basePayload(productAngleImages?: unknown) {
  return {
    productId: "product_1",
    referenceAnchors: {
      productImageUrl: "https://cdn.example.test/product.png",
      ...(productAngleImages !== undefined ? { productAngleImages } : {}),
    },
  };
}

function validAngleEntry(overrides: Record<string, unknown> = {}) {
  return {
    url: "https://cdn.example.test/product-angle.png",
    ref: "product-image:2:angle",
    hash: "anglehash",
    storageKey: "products/img_2.png",
    source: "marketplace_product_image",
    angleLabel: "back",
    ...overrides,
  };
}

describe("marketplaceCapture startAutoReview — referenceAnchors.productAngleImages", () => {
  let schema: z.ZodTypeAny;

  beforeAll(() => {
    schema = startAutoReviewInputSchema();
  });

  it("accepts up to 8 valid entries, including the package/parts_diagram evidence-only labels", () => {
    const angleLabels = [
      "front",
      "back",
      "side",
      "top",
      "base",
      "detail",
      "package",
      "parts_diagram",
    ];
    const productAngleImages = angleLabels.map((angleLabel, i) =>
      validAngleEntry({
        url: `https://cdn.example.test/product-angle-${i}.png`,
        ref: `product-image:${i + 2}:angle`,
        angleLabel,
      })
    );

    const result = schema.safeParse(basePayload(productAngleImages));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(
        (result.data as any).referenceAnchors.productAngleImages
      ).toHaveLength(8);
    }
  });

  it("rejects more than 8 entries", () => {
    const productAngleImages = Array.from({ length: 9 }).map((_, i) =>
      validAngleEntry({
        url: `https://cdn.example.test/product-angle-${i}.png`,
        ref: `product-image:${i + 2}:angle`,
      })
    );

    const result = schema.safeParse(basePayload(productAngleImages));

    expect(result.success).toBe(false);
  });

  it("rejects an entry with an invalid angleLabel", () => {
    const result = schema.safeParse(
      basePayload([validAngleEntry({ angleLabel: "diagonal" })])
    );

    expect(result.success).toBe(false);
  });

  it("accepts an entry with angleLabel omitted (checkbox-selection UX — unlabeled ⇒ normal supporting angle)", () => {
    const entry = validAngleEntry();
    delete (entry as any).angleLabel;

    const result = schema.safeParse(basePayload([entry]));

    expect(result.success).toBe(true);
    if (result.success) {
      const parsedEntries = (result.data as any).referenceAnchors
        .productAngleImages;
      expect(parsedEntries).toHaveLength(1);
      expect(parsedEntries[0].angleLabel).toBeUndefined();
      expect(parsedEntries[0].url).toBe(entry.url);
    }
  });

  it("accepts an entry with angleLabel explicitly set to undefined", () => {
    const result = schema.safeParse(
      basePayload([validAngleEntry({ angleLabel: undefined })])
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(
        (result.data as any).referenceAnchors.productAngleImages[0].angleLabel
      ).toBeUndefined();
    }
  });

  it("rejects an entry missing url", () => {
    const entry = validAngleEntry();
    delete (entry as any).url;

    const result = schema.safeParse(basePayload([entry]));

    expect(result.success).toBe(false);
  });

  it("still parses when productAngleImages is omitted entirely (back-compat)", () => {
    const result = schema.safeParse(basePayload(undefined));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(
        (result.data as any).referenceAnchors.productAngleImages
      ).toBeUndefined();
    }
  });
});
