/**
 * Tests for persona integration with buildChatContext.
 *
 * Tests that buildPersonaPromptSegments produces the correct
 * segments to be prepended/appended to chat context.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../../db", () => ({ getDb: vi.fn() }));
vi.mock("../featureFlags", () => ({ getFeatureFlag: vi.fn() }));
vi.mock("../../../drizzle/schema", () => ({
  personaTemplates: {},
  users: {},
  tenants: {},
  conversations: {},
  chatWidgets: {},
}));

import { buildPersonaPromptSegments } from "../personaService";

describe("buildChatContext persona integration", () => {
  it("prepends persona systemPromptPrefix to system prompt", () => {
    const segments = buildPersonaPromptSegments({
      systemPromptPrefix: "You are a formal advisor.",
      tone: "formal",
      responseStyle: {},
      restrictions: [],
    });

    expect(segments.prefix).toBe("[PERSONA START]\nYou are a formal advisor.\n[PERSONA END]");
  });

  it("appends response style instructions when persona has responseStyle", () => {
    const segments = buildPersonaPromptSegments({
      systemPromptPrefix: "Hello",
      tone: "technical",
      responseStyle: { format: "markdown", detail: "high" },
      restrictions: [],
    });

    expect(segments.styleInstructions).toContain("technical");
    expect(segments.styleInstructions).toContain("format: markdown");
    expect(segments.styleInstructions).toContain("detail: high");
  });

  it("appends restrictions as bullet points", () => {
    const segments = buildPersonaPromptSegments({
      systemPromptPrefix: "Hello",
      tone: null,
      responseStyle: {},
      restrictions: ["No profanity", "Keep responses under 200 words"],
    });

    expect(segments.restrictionsBulletPoints).toContain("- No profanity");
    expect(segments.restrictionsBulletPoints).toContain("- Keep responses under 200 words");
    expect(segments.restrictionsBulletPoints).toContain("Restrictions:");
  });

  it("works when persona has no style or restrictions", () => {
    const segments = buildPersonaPromptSegments({
      systemPromptPrefix: "Simple",
      tone: null,
      responseStyle: {},
      restrictions: [],
    });

    expect(segments.prefix).toBe("[PERSONA START]\nSimple\n[PERSONA END]");
    expect(segments.styleInstructions).toBeNull();
    expect(segments.restrictionsBulletPoints).toBeNull();
  });

  it("includes tone in style instructions even without responseStyle keys", () => {
    const segments = buildPersonaPromptSegments({
      systemPromptPrefix: "Hello",
      tone: "casual",
      responseStyle: {},
      restrictions: [],
    });

    expect(segments.styleInstructions).toBe("Respond in a casual tone.");
  });
});
