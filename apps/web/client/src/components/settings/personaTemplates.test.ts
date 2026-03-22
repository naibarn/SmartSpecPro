import { describe, expect, it } from "vitest";

import {
  PERSONA_TEMPLATES,
  PERSONA_TEMPLATE_IDEAS,
  buildPersonaApplication,
  validatePersonaTemplate,
} from "./personaTemplates";

describe("personaTemplates", () => {
  it("covers a broad set of reviewed templates", () => {
    expect(PERSONA_TEMPLATES.length).toBe(21);

    const categories = new Set(PERSONA_TEMPLATES.map((template) => template.category));
    expect(categories.size).toBeGreaterThanOrEqual(12);

    const labels = PERSONA_TEMPLATES.map((template) => template.label);
    expect(labels).toEqual(expect.arrayContaining([
      "Legal Advisor",
      "Code Reviewer",
      "Marketing Strategist",
      "Graphic Designer",
      "Video Producer",
      "Social Media Manager",
      "HR Recruiter",
      "Financial Analyst",
      "Healthcare Documentation",
      "Instructional Designer",
      "Real Estate Advisor",
    ]));
  });

  it("keeps every template complete, safe, and within prompt limits", () => {
    for (const template of PERSONA_TEMPLATES) {
      expect(validatePersonaTemplate(template)).toEqual([]);
      expect(template.prompt.length).toBeLessThanOrEqual(2000);
      expect(template.language).toBe("auto");
      expect(template.restrictions.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("uses unique ids and labels to avoid picker collisions", () => {
    const ids = PERSONA_TEMPLATES.map((template) => template.id);
    const labels = PERSONA_TEMPLATES.map((template) => template.label);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("keeps the empty-state inspiration cards aligned with real templates", () => {
    expect(PERSONA_TEMPLATE_IDEAS).toHaveLength(6);

    for (const template of PERSONA_TEMPLATE_IDEAS) {
      expect(PERSONA_TEMPLATES).toContain(template);
    }
  });

  it("builds mixed persona applications with preserved source metadata", () => {
    const templates = PERSONA_TEMPLATES.filter((template) =>
      ["marketing-strategist", "financial-analyst"].includes(template.id),
    );
    const application = buildPersonaApplication(templates);

    expect(application.sourceTemplateIds).toEqual([
      "marketing-strategist",
      "financial-analyst",
    ]);
    expect(application.sourceTemplateCategories).toEqual([
      "Marketing",
      "Finance",
    ]);
    expect(application.description).toMatch(/Hybrid persona/i);
    expect(application.prompt).toMatch(/cross-functional AI copilot/i);
    expect(application.prompt.length).toBeLessThanOrEqual(2000);
  });
});
