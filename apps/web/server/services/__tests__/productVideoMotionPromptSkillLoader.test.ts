import fs from "fs";
import path from "path";

import { describe, it, expect, vi } from "vitest";

const SKILL_DIR = path.resolve(
  process.cwd(),
  "skills",
  "product-video-motion-prompt"
);

describe("product-video-motion-prompt skill files on disk", () => {
  it("has byte-identical lowercase skill.md and uppercase SKILL.md twins", () => {
    const lower = fs.readFileSync(path.join(SKILL_DIR, "skill.md"));
    const upper = fs.readFileSync(path.join(SKILL_DIR, "SKILL.md"));
    // The loader reads lowercase skill.md before SKILL.md; the twins must be
    // byte-identical so edits never silently diverge.
    expect(lower.equals(upper)).toBe(true);
  });

  it("declares llm-only, enabled-by-default, vision-only execution policy in frontmatter", () => {
    const text = fs.readFileSync(path.join(SKILL_DIR, "skill.md"), "utf-8");
    expect(text).toContain("execution_mode: llm-only");
    expect(text).toContain("enabled_by_default: true");
    expect(text).toContain("supportsVision: true");
    // Must NOT require a 1M context window (vision requirement only).
    expect(text).not.toContain("contextLength: 1000000");
  });

  it("loads a valid input schema with the motion_direction field and required keys", () => {
    const schemaPath = path.join(SKILL_DIR, "schemas", "input.schema.json");
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
    expect(schema && typeof schema === "object").toBe(true);
    expect(schema.properties).toHaveProperty("motion_direction");
    expect(schema.properties).toHaveProperty("shot_movement");
    expect(schema.properties).toHaveProperty("start_frame_url");
    expect(schema.required).toContain("shot_movement");
    expect(schema.required).toContain("start_frame_url");
  });

  it("loads a valid ui schema that orders motion_direction", () => {
    const uiPath = path.join(SKILL_DIR, "schemas", "ui.schema.json");
    const ui = JSON.parse(fs.readFileSync(uiPath, "utf-8"));
    expect(Array.isArray(ui["ui:order"])).toBe(true);
    expect(ui["ui:order"]).toContain("motion_direction");
  });
});

// ── Execution policy resolves a vision-capable model for the skill. ──
const visionRow = {
  providerId: 1,
  providerName: "vision-provider",
  modelId: "vision-model-a",
  providerModelId: "vision-model-a",
  defaultModel: null,
  apiStyle: "chat-completions",
  supportsVision: true,
  supportsThinking: null,
  supportsFunctionTools: null,
  supportsStructuredOutputs: null,
  supportsJsonMode: null,
  supportsStrictToolSchema: null,
  supportsWebSearch: null,
  supportsCodeExecution: null,
  supportsComputerUse: null,
  supportsBackground: null,
  supportsResponses: null,
  contextLength: 128000,
  priority: 10,
  priorityLocked: null,
  isFree: false,
  catalogEligibility: "public-chat",
};
const textOnlyRow = {
  ...visionRow,
  providerName: "text-provider",
  modelId: "text-model-b",
  providerModelId: "text-model-b",
  supportsVision: false,
  priority: 5,
};

vi.mock("../enabledLlmModels", async importActual => {
  const actual = (await importActual()) as Record<string, unknown>;
  return {
    ...actual,
    loadEnabledLlmModelRows: vi.fn(async () => [textOnlyRow, visionRow]),
  };
});

describe("resolveSkillExecutionPolicy for product-video-motion-prompt", () => {
  it("resolves the vision-capable model from the supportsVision requirement", async () => {
    const { resolveSkillExecutionPolicy } = await import(
      "../skillExecutionPolicy"
    );
    const result = await resolveSkillExecutionPolicy({
      skill: {
        slug: "product-video-motion-prompt",
        executionPolicy: {
          mode: "requirements",
          requirements: { supportsVision: true },
          fallbackPolicy: "error",
        },
      } as any,
      conversationModel: null,
    });
    expect(result.modelId).toBe("vision-model-a");
    expect(result.modelSource).toBe("requirements_match");
  });
});
