import { describe, it, expect } from "vitest";

/**
 * Tests for agency auto-trigger in skill detection pipeline.
 *
 * Run: cd /home/dev/projects/SmartSpecPro/apps/web && pnpm vitest run server/services/__tests__/agencySkillTrigger.test.ts
 */

import {
  detectAgencyFromList,
  type AgencyTriggerDefinition,
  type AgencyDetectionResult,
} from "@smartspec/skills";

function makeTrigger(pattern: string): { regex: RegExp; pattern: string } {
  return { regex: new RegExp(pattern, "i"), pattern };
}

function makeAgency(overrides: Partial<AgencyTriggerDefinition> = {}): AgencyTriggerDefinition {
  return {
    agencyId: "agency-1",
    name: "Research Agency",
    description: "Multi-agent research team",
    triggers: [makeTrigger("\\bresearch\\s+agency\\b")],
    priority: 50,
    ...overrides,
  };
}

describe("Agency Skill Auto-Trigger", () => {
  it("should detect agency trigger from message matching agency pattern", () => {
    const agency = makeAgency();
    const result = detectAgencyFromList("Use the research agency to find data", [agency]);

    expect(result.detected).toBe(true);
    expect(result.agency).not.toBeNull();
    expect(result.agency?.agencyId).toBe("agency-1");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("should include agency_id in detection result", () => {
    const agency = makeAgency({ agencyId: "custom-agency-42" });
    const result = detectAgencyFromList("research agency please", [agency]);

    expect(result.detected).toBe(true);
    expect(result.agency?.agencyId).toBe("custom-agency-42");
  });

  it("should not detect agency when message does not match any trigger", () => {
    const agency = makeAgency();
    const result = detectAgencyFromList("hello world, how are you?", [agency]);

    expect(result.detected).toBe(false);
    expect(result.agency).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it("should calculate confidence based on match position", () => {
    const agency = makeAgency();

    // Match at start should have higher confidence
    const startResult = detectAgencyFromList("research agency find me data", [agency]);
    const midResult = detectAgencyFromList("please use research agency now", [agency]);

    expect(startResult.confidence).toBeGreaterThan(midResult.confidence);
  });

  it("should return best match when multiple agencies match", () => {
    const agencies: AgencyTriggerDefinition[] = [
      makeAgency({
        agencyId: "low-priority",
        name: "Generic",
        triggers: [makeTrigger("\\bagency\\b")],
        priority: 10,
      }),
      makeAgency({
        agencyId: "high-priority",
        name: "Research",
        triggers: [makeTrigger("\\bresearch\\s+agency\\b")],
        priority: 90,
      }),
    ];

    // Higher priority agency is checked first (sorted)
    const result = detectAgencyFromList("ask the research agency", agencies);
    expect(result.detected).toBe(true);
    expect(result.agency?.agencyId).toBe("high-priority");
  });

  it("should extract suggested prompt from message after trigger", () => {
    const agency = makeAgency({
      triggers: [makeTrigger("\\bresearch\\s+agency\\b")],
    });
    const result = detectAgencyFromList("research agency find papers on AI safety", [agency]);

    expect(result.detected).toBe(true);
    expect(result.suggestedPrompt).toBeTruthy();
    expect(result.suggestedPrompt).toContain("papers on AI safety");
  });
});
