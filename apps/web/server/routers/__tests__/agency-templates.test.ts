/**
 * Tests for agency template loader and template data integrity.
 */

import { describe, it, expect } from "vitest";
import {
  getTemplates,
  getTemplateById,
} from "../../../skills/agency-templates/index";

describe("Agency Template Loader", () => {
  it("should export 4 templates", () => {
    const templates = getTemplates();
    expect(templates).toHaveLength(4);
  });

  it("should have expected template IDs", () => {
    const templates = getTemplates();
    const ids = templates.map((t) => t.id);
    expect(ids).toContain("research");
    expect(ids).toContain("content-writer");
    expect(ids).toContain("spec-writer");
    expect(ids).toContain("code-review");
  });

  it("should look up templates by ID", () => {
    expect(getTemplateById("research")?.name).toBe("Research Agency");
    expect(getTemplateById("content-writer")?.name).toBe(
      "Content Writer Agency",
    );
    expect(getTemplateById("spec-writer")?.name).toBe("Spec Writer Agency");
    expect(getTemplateById("code-review")?.name).toBe("Code Review Agency");
    expect(getTemplateById("nonexistent")).toBeUndefined();
  });

  it("each template has exactly one entry point agent", () => {
    for (const template of getTemplates()) {
      const entryPoints = template.agents.filter((a) => a.isEntryPoint);
      expect(entryPoints).toHaveLength(1);
    }
  });

  it("each template has 3 agents", () => {
    for (const template of getTemplates()) {
      expect(template.agents).toHaveLength(3);
      expect(template.agentCount).toBe(3);
    }
  });

  it("communication flows reference valid agent names", () => {
    for (const template of getTemplates()) {
      const agentNames = new Set(template.agents.map((a) => a.name));
      for (const flow of template.communicationFlows) {
        expect(agentNames.has(flow.fromAgentName)).toBe(true);
        expect(agentNames.has(flow.toAgentName)).toBe(true);
      }
    }
  });

  it("all templates have valid default settings", () => {
    for (const template of getTemplates()) {
      expect(template.defaultSettings.creditMultiplier).toBeGreaterThan(0);
      expect(template.defaultSettings.maxRunTimeSeconds).toBeGreaterThan(0);
      expect(typeof template.defaultSettings.isFallbackSafe).toBe("boolean");
    }
  });

  it("all agents have required fields", () => {
    for (const template of getTemplates()) {
      for (const agent of template.agents) {
        expect(agent.name).toBeTruthy();
        expect(agent.description).toBeTruthy();
        expect(agent.instructions).toBeTruthy();
        expect(agent.model).toBeTruthy();
        expect(typeof agent.isEntryPoint).toBe("boolean");
        expect(typeof agent.isOptional).toBe("boolean");
        expect(agent.position).toHaveProperty("x");
        expect(agent.position).toHaveProperty("y");
        expect(Array.isArray(agent.toolIds)).toBe(true);
      }
    }
  });
});
