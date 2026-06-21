import { describe, expect, it } from "vitest";
import {
  buildPythonBackendExtraParamsForTest,
  normalizeMediaPrompt,
} from "../mediaGenerationService";

describe("normalizeMediaPrompt", () => {
  it("keeps plain text prompts (trimmed)", () => {
    expect(normalizeMediaPrompt("  cinematic shot of sunrise  ")).toBe("cinematic shot of sunrise");
  });

  it("unwraps fenced json blocks into plain json text", () => {
    const fenced = "```json\n{\n  \"prompt\": \"hello\",\n  \"duration\": 5\n}\n```";
    expect(normalizeMediaPrompt(fenced)).toBe("{\n  \"prompt\": \"hello\",\n  \"duration\": 5\n}");
  });

  it("unwraps generic fenced blocks", () => {
    const fenced = "```\nA vivid watercolor landscape with soft light\n```";
    expect(normalizeMediaPrompt(fenced)).toBe("A vivid watercolor landscape with soft light");
  });

  it("normalizes json label prefix to plain json text", () => {
    const malformed = "json\n{\n  \"prompt\": \"hello image\"\n}";
    expect(normalizeMediaPrompt(malformed)).toBe("{\n  \"prompt\": \"hello image\"\n}");
  });

  it("removes orphaned markdown fence lines from malformed output", () => {
    const malformed = "```json\n{\n  \"prompt\": \"hello image\"\n}\n";
    expect(normalizeMediaPrompt(malformed)).toBe("{\n  \"prompt\": \"hello image\"\n}");
  });

  it("returns empty string for null/undefined", () => {
    expect(normalizeMediaPrompt(null)).toBe("");
    expect(normalizeMediaPrompt(undefined)).toBe("");
  });
});

describe("buildPythonBackendExtraParams", () => {
  it("keeps persisted provenance but removes provider-internal manifest/debug metadata before backend submit", () => {
    expect(
      buildPythonBackendExtraParamsForTest(
        {
          quality: "high",
          reference_image_manifest: [
            {
              placeholder: "@Image1",
              role: "product",
              url: "/api/storage/files/very-long-product-url.jpg",
            },
          ],
          reference_image_role_order: ["@Image1=product"],
          reference_image_role_counts: { product: 1, total: 1 },
          __reference_image_manifest: [
            { url: "/api/storage/files/duplicate.jpg" },
          ],
          __origin_surface: "marketplace_auto_review",
          __marketplace_product_id: "mp_123",
          __auto_review_run_id: "auto_run_82",
          __debug_prompt_dump: "do not persist",
          marketplaceContext: { productName: "internal only" },
        },
        "https://tenant.example.com"
      )
    ).toEqual({
      quality: "high",
      __origin_surface: "marketplace_auto_review",
      __marketplace_product_id: "mp_123",
      __auto_review_run_id: "auto_run_82",
    });
  });
});
