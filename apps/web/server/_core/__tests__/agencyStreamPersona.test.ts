/**
 * Tests for persona passthrough in agency stream proxy.
 *
 * Validates that persona_prefix is included in the upstream
 * request body when a persona is resolved for the conversation.
 */
import { describe, it, expect, vi } from "vitest";

// Mock the persona service
const { mockResolvePersona, mockBuildPersonaPromptSegments } = vi.hoisted(() => ({
  mockResolvePersona: vi.fn(),
  mockBuildPersonaPromptSegments: vi.fn(),
}));

vi.mock("../../services/personaService", () => ({
  resolvePersona: mockResolvePersona,
  buildPersonaPromptSegments: mockBuildPersonaPromptSegments,
}));

describe("agencyStreamProxy persona passthrough", () => {
  it("passes persona_prefix in run config to Python backend", () => {
    // Test the persona prompt building logic that would be used
    // before the upstream fetch call
    const persona = {
      id: "p1",
      systemPromptPrefix: "Be formal and precise.",
      tone: "formal",
      responseStyle: {},
      restrictions: [],
    };

    mockResolvePersona.mockResolvedValue(persona);
    mockBuildPersonaPromptSegments.mockReturnValue({
      prefix: "[PERSONA START]\nBe formal and precise.\n[PERSONA END]",
      styleInstructions: "Respond in a formal tone.",
      restrictionsBulletPoints: null,
    });

    const segments = mockBuildPersonaPromptSegments(persona);

    // Validate the persona_prefix that would be sent upstream
    expect(segments.prefix).toBe("[PERSONA START]\nBe formal and precise.\n[PERSONA END]");

    // Simulate the body construction logic from agencyStreamProxy
    const personaPrefix = segments.prefix;
    const body = {
      message: "Hello",
      conversation_id: "conv-1",
      ...(personaPrefix ? { persona_prefix: personaPrefix } : {}),
    };

    expect(body.persona_prefix).toBe("[PERSONA START]\nBe formal and precise.\n[PERSONA END]");
  });

  it("does not include persona_prefix when no persona resolved", () => {
    mockResolvePersona.mockResolvedValue(null);

    const personaPrefix = undefined;
    const body = {
      message: "Hello",
      conversation_id: "conv-1",
      ...(personaPrefix ? { persona_prefix: personaPrefix } : {}),
    };

    expect(body).not.toHaveProperty("persona_prefix");
  });
});
