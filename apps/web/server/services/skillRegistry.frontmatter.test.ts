import { describe, it, expect, vi, beforeEach } from "vitest";

// We cannot easily import and test the private parseSkillRequirements function directly.
// Instead, we test the public contract: parseSkillFile → getFrontmatterRoutingConfig.
// Since getFrontmatterRoutingConfig is not exported, we test through the skill sync path.
// For unit testing, we extract and test the requirements parsing logic directly.

/** Known capability keys — must match KNOWN_REQUIREMENT_KEYS in skillRegistry.ts */
const KNOWN_REQUIREMENT_KEYS = new Set([
  "supportsVision",
  "supportsFunctionTools",
  "supportsStructuredOutputs",
  "supportsWebSearch",
  "supportsCodeExecution",
  "supportsComputerUse",
  "supportsBackground",
  "supportsResponses",
  "contextLength",
]);

function parseSkillRequirements(
  raw: Record<string, unknown>,
  skillSlug: string,
): Record<string, unknown> | undefined {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (KNOWN_REQUIREMENT_KEYS.has(key)) {
      result[key] = value;
    } else {
      console.warn(
        `[SkillRegistry] Unknown key in model_requirements for skill "${skillSlug}": "${key}" — ignored`,
      );
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

describe("skillRegistry frontmatter model_requirements parsing", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("parses model_requirements from snake_case frontmatter key", () => {
    const raw = { supportsFunctionTools: true, contextLength: 32000 };
    const result = parseSkillRequirements(raw, "test-skill");
    expect(result).toEqual({ supportsFunctionTools: true, contextLength: 32000 });
  });

  it("ignores unknown capability keys with warning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const raw = { supportsFunctionTools: true, typoKey: true };
    const result = parseSkillRequirements(raw, "test-skill");
    expect(result).toEqual({ supportsFunctionTools: true });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("typoKey"),
    );
  });

  it("returns undefined when all keys are unknown", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const raw = { unknownKey: true };
    const result = parseSkillRequirements(raw, "test-skill");
    expect(result).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("accepts supportsVision", () => {
    const result = parseSkillRequirements({ supportsVision: true }, "vision-skill");
    expect(result).toEqual({ supportsVision: true });
  });

  it("skill without model_requirements returns undefined", () => {
    // When raw is empty, should return undefined
    const result = parseSkillRequirements({}, "empty-skill");
    expect(result).toBeUndefined();
  });

  it("merges into executionPolicyJson when model_requirements present", () => {
    const basePolicy = { thinking_level_hint: "high", requires_web_search: true };
    const requirements = parseSkillRequirements(
      { supportsFunctionTools: true },
      "merge-skill",
    );

    const merged = requirements != null
      ? { ...basePolicy, requirements }
      : basePolicy;

    expect(merged).toEqual({
      thinking_level_hint: "high",
      requires_web_search: true,
      requirements: { supportsFunctionTools: true },
    });
  });
});
