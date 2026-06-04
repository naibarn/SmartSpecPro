import { describe, expect, it } from "vitest";

import {
  buildHyperframesCompositionInput,
  getHyperframesCompositionInputHash,
} from "../hyperframesCompositionService";

describe("hyperframesCompositionService", () => {
  it("builds deterministic sanitized composition input", () => {
    const base = {
      tenantId: "tenant_1",
      userId: 1,
      productId: "product_1",
      runId: "mar_1",
      productState: {
        title: "<b>สินค้า</b>",
        selectedImageUrls: ["https://cdn.example.com/product.png?sig=abc"],
      },
      now: new Date("2026-06-04T00:00:00.000Z"),
    };
    const first = buildHyperframesCompositionInput(base);
    const second = buildHyperframesCompositionInput(base);

    expect(first.productTruth.title).toBe("สินค้า");
    expect(first.assets[0]?.ref).toBe("https://cdn.example.com/product.png");
    expect(getHyperframesCompositionInputHash(first)).toBe(
      getHyperframesCompositionInputHash(second)
    );
    expect(first.provenance.templateId).toBe(
      "marketplace_storyboard_motion_9x9_v1"
    );
  });

  it("changes hash when product truth changes", () => {
    const one = buildHyperframesCompositionInput({
      tenantId: "tenant_1",
      userId: 1,
      productId: "product_1",
      runId: "mar_1",
      productState: { title: "A" },
      now: new Date("2026-06-04T00:00:00.000Z"),
    });
    const two = buildHyperframesCompositionInput({
      tenantId: "tenant_1",
      userId: 1,
      productId: "product_1",
      runId: "mar_1",
      productState: { title: "B" },
      now: new Date("2026-06-04T00:00:00.000Z"),
    });

    expect(getHyperframesCompositionInputHash(one)).not.toBe(
      getHyperframesCompositionInputHash(two)
    );
  });
});
