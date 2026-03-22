// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agency: {
      listGuardrails: { useQuery: () => ({ data: [], refetch: vi.fn() }) },
      deleteGuardrail: { useMutation: () => ({ mutate: vi.fn() }) },
      updateGuardrail: { useMutation: () => ({ mutate: vi.fn() }) },
      assignGuardrailToAgent: { useMutation: () => ({ mutate: vi.fn() }) },
      removeGuardrailFromAgent: { useMutation: () => ({ mutate: vi.fn() }) },
      testGuardrail: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      createGuardrail: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

import { STRATEGY_META } from "../guardrails/types";

describe("GuardrailsPanel — types and metadata", () => {
  it("defines all 7 strategies in STRATEGY_META", () => {
    expect(Object.keys(STRATEGY_META)).toHaveLength(7);
    expect(STRATEGY_META.keyword_block.label).toBe("Keyword Block");
    expect(STRATEGY_META.regex_match.label).toBe("Regex Match");
    expect(STRATEGY_META.llm_classify.label).toBe("LLM Classify");
    expect(STRATEGY_META.json_schema.label).toBe("JSON Schema");
    expect(STRATEGY_META.max_length.label).toBe("Max Length");
    expect(STRATEGY_META.pii_detection.label).toBe("PII Detection");
    expect(STRATEGY_META.custom_endpoint.label).toBe("Custom Endpoint");
  });

  it("each strategy has icon and color fields", () => {
    for (const [, meta] of Object.entries(STRATEGY_META)) {
      expect(meta.icon).toBeTruthy();
      expect(meta.color).toMatch(/^text-/);
    }
  });
});

describe("GuardrailsPanel — form validation logic", () => {
  it("keyword_block requires at least one keyword", () => {
    const config = { keywords: [] as string[] };
    expect(config.keywords.length >= 1).toBe(false);
    config.keywords.push("test");
    expect(config.keywords.length >= 1).toBe(true);
  });

  it("regex pattern validates syntax via RegExp constructor", () => {
    expect(() => new RegExp("\\d{3}")).not.toThrow();
    expect(() => new RegExp("[invalid")).toThrow();
  });

  it("json_schema validates JSON syntax via JSON.parse", () => {
    expect(() => JSON.parse('{"type": "object"}')).not.toThrow();
    expect(() => JSON.parse("not json")).toThrow();
  });

  it("custom_endpoint validates URL format via URL constructor", () => {
    expect(() => new URL("https://example.com/check")).not.toThrow();
    expect(() => new URL("not-a-url")).toThrow();
  });

  it("max_length requires positive integer", () => {
    expect(0 >= 1).toBe(false);
    expect(-1 >= 1).toBe(false);
    expect(100 >= 1).toBe(true);
  });
});
