import { describe, it, expect } from "vitest";
import {
  AutoDraftRequestSchema,
  ModelSuggestRequestSchema,
  FileParseRequestSchema,
  ScheduleDraftRequestSchema,
  InputItemSchema,
  canvasPresetToSize,
} from "./types";

describe("AutoDraftRequestSchema", () => {
  const validRequest = {
    topic: "How to build a React app",
    canvas_preset: "16:9" as const,
  };

  it("validates a valid request with all required fields", () => {
    const result = AutoDraftRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
  });

  it("rejects missing topic (required field)", () => {
    const result = AutoDraftRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects topic shorter than 3 characters", () => {
    const result = AutoDraftRequestSchema.safeParse({ topic: "ab" });
    expect(result.success).toBe(false);
  });

  it("rejects topic longer than 1000 characters", () => {
    const result = AutoDraftRequestSchema.safeParse({ topic: "a".repeat(1001) });
    expect(result.success).toBe(false);
  });

  it("rejects invalid canvas_preset values", () => {
    const result = AutoDraftRequestSchema.safeParse({ topic: "valid topic", canvas_preset: "2:1" });
    expect(result.success).toBe(false);
  });

  it("accepts all valid canvas_preset values", () => {
    const validPresets = ["16:9", "4:3", "1:1", "9:16", "3:4", "4:5", "5:4"] as const;
    for (const preset of validPresets) {
      const result = AutoDraftRequestSchema.safeParse({ topic: "valid topic", canvas_preset: preset });
      expect(result.success).toBe(true);
    }
  });

  it("rejects num_slides < 1", () => {
    const result = AutoDraftRequestSchema.safeParse({ topic: "valid topic", num_slides: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects num_slides > 30", () => {
    const result = AutoDraftRequestSchema.safeParse({ topic: "valid topic", num_slides: 31 });
    expect(result.success).toBe(false);
  });
});

describe("ModelSuggestRequestSchema", () => {
  it("validates purpose enum accepts 'image', 'video', 'audio', 'text'", () => {
    for (const purpose of ["image", "video", "audio", "text"] as const) {
      const result = ModelSuggestRequestSchema.safeParse({ purpose });
      expect(result.success).toBe(true);
    }
  });

  it("rejects unknown purpose value", () => {
    const result = ModelSuggestRequestSchema.safeParse({ purpose: "unknown" });
    expect(result.success).toBe(false);
  });
});

describe("FileParseRequestSchema", () => {
  it("validates file_type enum accepts 'csv', 'xlsx', 'txt'", () => {
    for (const file_type of ["csv", "xlsx", "txt"] as const) {
      const result = FileParseRequestSchema.safeParse({
        file_url: "https://example.com/file",
        file_type,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects unknown file_type", () => {
    const result = FileParseRequestSchema.safeParse({
      file_url: "https://example.com/file",
      file_type: "pdf",
    });
    expect(result.success).toBe(false);
  });
});

describe("ScheduleDraftRequestSchema", () => {
  it("validates cron_expression is a string for recurring schedule", () => {
    const result = ScheduleDraftRequestSchema.safeParse({
      topic_template: "Weekly report on {{topic}}",
      schedule_type: "recurring",
      cron_expression: "0 9 * * 1",
    });
    expect(result.success).toBe(true);
  });

  it("validates schedule_type is 'one_time' or 'recurring'", () => {
    const invalid = ScheduleDraftRequestSchema.safeParse({
      topic_template: "Test topic template",
      schedule_type: "daily",
    });
    expect(invalid.success).toBe(false);
  });

  it("rejects recurring schedule without cron_expression", () => {
    const result = ScheduleDraftRequestSchema.safeParse({
      topic_template: "Weekly report",
      schedule_type: "recurring",
      // cron_expression missing
    });
    expect(result.success).toBe(false);
  });

  it("rejects one_time schedule without run_at", () => {
    const result = ScheduleDraftRequestSchema.safeParse({
      topic_template: "One time report",
      schedule_type: "one_time",
      // run_at missing
    });
    expect(result.success).toBe(false);
  });

  it("accepts one_time schedule with run_at", () => {
    const result = ScheduleDraftRequestSchema.safeParse({
      topic_template: "One time report",
      schedule_type: "one_time",
      run_at: "2026-04-01T09:00:00Z",
    });
    expect(result.success).toBe(true);
  });
});

describe("InputItemSchema", () => {
  it("validates topic is a non-empty string", () => {
    const result = InputItemSchema.safeParse({ topic: "My topic" });
    expect(result.success).toBe(true);
  });

  it("rejects empty topic", () => {
    const result = InputItemSchema.safeParse({ topic: "" });
    expect(result.success).toBe(false);
  });

  it("accepts optional custom_article_text, params, attachments", () => {
    const result = InputItemSchema.safeParse({
      topic: "My topic",
      custom_article_text: "Some article text",
      params: { key: "value" },
      attachments: ["https://example.com/file.pdf"],
    });
    expect(result.success).toBe(true);
  });
});

describe("canvasPresetToSize", () => {
  it("maps '16:9' to { width: 1280, height: 720 }", () => {
    expect(canvasPresetToSize("16:9")).toEqual({ width: 1280, height: 720 });
  });

  it("maps '9:16' to { width: 720, height: 1280 }", () => {
    expect(canvasPresetToSize("9:16")).toEqual({ width: 720, height: 1280 });
  });

  it("maps '4:3' to { width: 1024, height: 768 }", () => {
    expect(canvasPresetToSize("4:3")).toEqual({ width: 1024, height: 768 });
  });

  it("maps '1:1' to { width: 1080, height: 1080 }", () => {
    expect(canvasPresetToSize("1:1")).toEqual({ width: 1080, height: 1080 });
  });

  it("returns null for unknown preset string", () => {
    expect(canvasPresetToSize("2:1")).toBeNull();
  });
});
