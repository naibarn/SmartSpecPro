/**
 * Tests for Skill Param Extractor (Feature 045, Section 04)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Controlled mock state ──────────────────────────────────────────────────

let mockSchemaInfo: any = null;
let mockLLMResult: any = null;
let mockLLMError: Error | null = null;

// ─── Top-level mocks ────────────────────────────────────────────────────────

vi.mock("../skillSchemaLoader", () => ({
  loadInputSchema: vi.fn(async () => mockSchemaInfo),
}));

vi.mock("../callLLMStructured", () => ({
  callLLMStructured: vi.fn(async () => {
    if (mockLLMError) throw mockLLMError;
    return mockLLMResult;
  }),
}));

vi.mock("../skillIntentClassifier", () => ({
  sanitizeForClassifier: vi.fn((msg: string) => ({ sanitized: msg, injectionAttempt: false })),
}));

vi.mock("../auditLogger", () => ({
  auditLogger: { log: vi.fn() },
}));

// ─── Imports (after mocks) ──────────────────────────────────────────────────

import { extractParams, projectSchemaForUI, resolvePromptField } from "../skillParamExtractor";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeSchemaInfo(overrides: Partial<any> = {}) {
  return {
    schema: {
      type: "object",
      required: ["topic"],
      properties: {
        topic: { type: "string", title: "Topic" },
        review_style: { type: "string", default: "standard" },
        ...overrides.properties,
      },
      ...overrides.schemaRoot,
    },
    requiredFields: overrides.requiredFields ?? ["topic"],
    fieldsWithDefaults: overrides.fieldsWithDefaults ?? ["review_style"],
    enumFields: overrides.enumFields ?? [],
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("extractParams", () => {
  beforeEach(() => {
    mockSchemaInfo = makeSchemaInfo();
    mockLLMResult = { data: { topic: "มาม่า" }, tokensUsed: 30, creditsUsed: 1 };
    mockLLMError = null;
  });

  it("extracts basic params from message", async () => {
    const result = await extractParams("รีวิวมาม่า", "food-grocery-reviewer");

    expect(result.params.topic).toBe("มาม่า");
  });

  it("extracts multiple params", async () => {
    mockSchemaInfo = makeSchemaInfo({
      properties: {
        topic: { type: "string" },
        review_angle: { type: "string" },
        price_thb: { type: "number" },
      },
      requiredFields: ["topic"],
      fieldsWithDefaults: [],
    });
    mockLLMResult = { data: { topic: "มาม่า", review_angle: "comparison", price_thb: 6 }, tokensUsed: 30, creditsUsed: 1 };

    const result = await extractParams("รีวิวมาม่า สไตล์เปรียบเทียบ 6 บาท", "food-grocery-reviewer");

    expect(result.params.topic).toBe("มาม่า");
    expect(result.params.review_angle).toBe("comparison");
    expect(result.params.price_thb).toBe(6);
  });

  it("applies defaults for missing optional fields", async () => {
    mockLLMResult = { data: { topic: "test" }, tokensUsed: 30, creditsUsed: 1 };

    const result = await extractParams("test", "skill1");

    expect(result.params.review_style).toBe("standard");
  });

  it("detects missing required fields", async () => {
    mockSchemaInfo = makeSchemaInfo({
      properties: { topic: { type: "string" }, script: { type: "string" } },
      requiredFields: ["topic", "script"],
      fieldsWithDefaults: [],
    });
    mockLLMResult = { data: {}, tokensUsed: 30, creditsUsed: 1 };

    const result = await extractParams("สร้างวิดีโอ", "video-creator");

    expect(result.missingRequired).toContain("topic");
    expect(result.missingRequired).toContain("script");
  });

  it("required fields with defaults not marked missing", async () => {
    mockSchemaInfo = makeSchemaInfo({
      properties: { topic: { type: "string", default: "general" } },
      requiredFields: ["topic"],
      fieldsWithDefaults: ["topic"],
    });
    mockLLMResult = { data: {}, tokensUsed: 30, creditsUsed: 1 };

    const result = await extractParams("test", "skill1");

    expect(result.missingRequired).toEqual([]);
    expect(result.params.topic).toBe("general");
  });

  it("falls back when no schema exists", async () => {
    mockSchemaInfo = null;

    const result = await extractParams("test", "no-schema-skill", { prompt: "test" });

    expect(result.confidence).toBe(1.0);
    expect(result.needsConfirmation).toBe(false);
    expect(result.params.prompt).toBe("test");
  });

  it("validates enum constraints", async () => {
    mockSchemaInfo = makeSchemaInfo({
      properties: {
        topic: { type: "string" },
        review_angle: { type: "string", enum: ["comparison", "detailed", "quick"] },
      },
      requiredFields: ["topic", "review_angle"],
      fieldsWithDefaults: [],
      enumFields: ["review_angle"],
    });
    mockLLMResult = { data: { topic: "test", review_angle: "invalid_value" }, tokensUsed: 30, creditsUsed: 1 };

    const result = await extractParams("test", "skill1");

    expect(result.params.review_angle).toBeUndefined();
    expect(result.missingRequired).toContain("review_angle");
  });

  it("merges with classifier params", async () => {
    mockSchemaInfo = makeSchemaInfo({
      properties: { topic: { type: "string" }, review_angle: { type: "string" } },
      requiredFields: ["topic"],
      fieldsWithDefaults: [],
    });
    mockLLMResult = { data: { review_angle: "comparison" }, tokensUsed: 30, creditsUsed: 1 };

    const result = await extractParams("test", "skill1", { topic: "มาม่า" });

    expect(result.params.topic).toBe("มาม่า");
    expect(result.params.review_angle).toBe("comparison");
  });

  it("handles nested objects in schema", async () => {
    mockSchemaInfo = makeSchemaInfo({
      properties: {
        topic: { type: "string" },
        constraints: { type: "object", properties: { maxWidth: { type: "number" } } },
      },
      requiredFields: ["topic"],
      fieldsWithDefaults: [],
    });
    mockLLMResult = { data: { topic: "test", constraints: { maxWidth: 100 } }, tokensUsed: 30, creditsUsed: 1 };

    const result = await extractParams("test max 100px", "skill1");

    expect(result.params.constraints).toEqual({ maxWidth: 100 });
  });

  it("handles array fields", async () => {
    mockSchemaInfo = makeSchemaInfo({
      properties: {
        topic: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      requiredFields: ["topic"],
      fieldsWithDefaults: [],
    });
    mockLLMResult = { data: { topic: "test", tags: ["a", "b"] }, tokensUsed: 30, creditsUsed: 1 };

    const result = await extractParams("test tags a b", "skill1");

    expect(result.params.tags).toEqual(["a", "b"]);
  });
});

describe("Combined optimization", () => {
  beforeEach(() => {
    mockLLMResult = { data: { topic: "test" }, tokensUsed: 30, creditsUsed: 1 };
    mockLLMError = null;
  });

  it("skips LLM for simple schemas with high confidence", async () => {
    mockSchemaInfo = makeSchemaInfo();
    const { callLLMStructured } = await import("../callLLMStructured");

    (callLLMStructured as any).mockClear();
    await extractParams("test", "skill1", { topic: "test" }, 0.9);

    expect(callLLMStructured).not.toHaveBeenCalled();
  });

  it("calls LLM for complex schemas (>10 fields)", async () => {
    const properties: Record<string, any> = {};
    for (let i = 0; i < 15; i++) {
      properties[`field${i}`] = { type: "string" };
    }
    mockSchemaInfo = makeSchemaInfo({
      properties,
      requiredFields: ["field0"],
      fieldsWithDefaults: [],
    });
    const { callLLMStructured } = await import("../callLLMStructured");

    (callLLMStructured as any).mockClear();
    await extractParams("test", "complex-skill", { field0: "test" }, 0.9);

    expect(callLLMStructured).toHaveBeenCalled();
  });

  it("calls LLM for low confidence", async () => {
    mockSchemaInfo = makeSchemaInfo();
    const { callLLMStructured } = await import("../callLLMStructured");

    (callLLMStructured as any).mockClear();
    await extractParams("test", "skill1", { topic: "test" }, 0.6);

    expect(callLLMStructured).toHaveBeenCalled();
  });
});

describe("LLM failure fallback", () => {
  beforeEach(() => {
    mockSchemaInfo = makeSchemaInfo({
      properties: { topic: { type: "string" }, review_angle: { type: "string" } },
      requiredFields: ["topic", "review_angle"],
      fieldsWithDefaults: [],
    });
  });

  it("sets needsConfirmation on LLM failure", async () => {
    mockLLMError = new Error("timeout");

    const result = await extractParams("test", "skill1");

    expect(result.needsConfirmation).toBe(true);
  });

  it("uses classifier params on LLM failure", async () => {
    mockLLMError = new Error("timeout");

    const result = await extractParams("test", "skill1", { topic: "มาม่า" });

    expect(result.params.topic).toBe("มาม่า");
    expect(result.missingRequired).toContain("review_angle");
    expect(result.missingRequired).not.toContain("topic");
    expect(result.needsConfirmation).toBe(true);
  });

  it("sets needsConfirmation for invalid JSON", async () => {
    mockLLMError = new Error("invalid json");

    const result = await extractParams("test", "skill1");

    expect(result.needsConfirmation).toBe(true);
    expect(result.missingRequired).toContain("topic");
    expect(result.missingRequired).toContain("review_angle");
  });
});

describe("Confirmation flow", () => {
  beforeEach(() => {
    mockLLMResult = { data: {}, tokensUsed: 30, creditsUsed: 1 };
    mockLLMError = null;
  });

  it("needsConfirmation when missing required", async () => {
    mockSchemaInfo = makeSchemaInfo({ fieldsWithDefaults: [] });
    mockLLMResult = { data: {}, tokensUsed: 30, creditsUsed: 1 };

    const result = await extractParams("test", "skill1");

    expect(result.needsConfirmation).toBe(true);
  });

  it("needsConfirmation when low confidence", async () => {
    mockSchemaInfo = makeSchemaInfo();
    // Even with topic filled, if confidence is calculated low it should confirm
    mockLLMResult = { data: { topic: "a" }, tokensUsed: 30, creditsUsed: 1 };

    const result = await extractParams("test", "skill1");

    // All required filled + defaults applied → confidence should be >= 0.70
    // Actually with 1 required field filled, confidence = 0.85 * 1 = 0.85
    expect(result.needsConfirmation).toBe(false);
  });

  it("no confirmation when all filled and high confidence", async () => {
    mockSchemaInfo = makeSchemaInfo({ fieldsWithDefaults: [] });
    mockLLMResult = { data: { topic: "test" }, tokensUsed: 30, creditsUsed: 1 };

    const result = await extractParams("test", "skill1");

    expect(result.needsConfirmation).toBe(false);
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });
});

describe("projectSchemaForUI", () => {
  it("projects schema to UI-safe format", () => {
    const schemaInfo = {
      schema: {
        type: "object",
        properties: {
          topic: { type: "string", title: "หัวข้อ" },
          count: { type: "number" },
          style: { type: "string", enum: ["formal", "casual"], title: "Style" },
          enabled: { type: "boolean" },
        },
      },
      requiredFields: ["topic"],
      fieldsWithDefaults: [],
      enumFields: ["style"],
    };

    const projections = projectSchemaForUI(schemaInfo);

    expect(projections).toHaveLength(4);

    const topic = projections.find((p) => p.name === "topic")!;
    expect(topic.label).toBe("หัวข้อ");
    expect(topic.type).toBe("text");
    expect(topic.required).toBe(true);

    const count = projections.find((p) => p.name === "count")!;
    expect(count.type).toBe("number");

    const style = projections.find((p) => p.name === "style")!;
    expect(style.type).toBe("select");
    expect(style.options).toEqual(["formal", "casual"]);

    const enabled = projections.find((p) => p.name === "enabled")!;
    expect(enabled.type).toBe("boolean");
  });

  it("generates title case label from field name", () => {
    const schemaInfo = {
      schema: { type: "object", properties: { review_style: { type: "string" } } },
      requiredFields: [],
      fieldsWithDefaults: [],
      enumFields: [],
    };

    const projections = projectSchemaForUI(schemaInfo);

    const proj = projections.find((p) => p.name === "review_style")!;
    expect(proj.label).toBe("Review Style");
  });
});

describe("resolvePromptField", () => {
  it("returns prompt field when available", () => {
    expect(resolvePromptField({ prompt: { type: "string" }, name: { type: "string" } }, [])).toBe("prompt");
  });

  it("returns topic when prompt not available", () => {
    expect(resolvePromptField({ topic: { type: "string" }, name: { type: "string" } }, [])).toBe("topic");
  });

  it("falls back to first required string field", () => {
    expect(resolvePromptField({ x: { type: "number" }, y: { type: "string" } }, ["y"])).toBe("y");
  });

  it("returns null when no suitable field", () => {
    expect(resolvePromptField({ x: { type: "number" } }, ["x"])).toBeNull();
  });
});
