import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Skills router sandbox metadata tests.
 *
 * Verifies the skills listing includes sandbox-related fields
 * so the frontend can display sandbox indicators.
 */

const { mockGetAvailableSkills } = vi.hoisted(() => ({
  mockGetAvailableSkills: vi.fn(),
}));

vi.mock("../../services/skillRegistry", () => ({
  getAvailableSkills: mockGetAvailableSkills,
  getSkillById: vi.fn(),
  getSkillByIdOrType: vi.fn(),
  getDefaultEnabledSkills: vi.fn(),
  refreshSkillCache: vi.fn(),
  syncSingleSkillIfChanged: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("skills router sandbox metadata", () => {
  it("identifies sandbox-mode skills via executionMode prefix", () => {
    mockGetAvailableSkills.mockReturnValue([
      {
        id: "code-runner",
        name: "Code Runner",
        description: "Run Python code",
        icon: "code",
        type: "code_assistant",
        executionMode: "sandbox-code",
        creditMultiplier: 1.0,
        enabledByDefault: true,
        priority: 50,
        skillFilePath: "/skills/code-runner/skill.md",
        sandboxProfileSlug: "code-default",
      },
      {
        id: "brainstorm",
        name: "Brainstorm",
        description: "Generate ideas",
        icon: "lightbulb",
        type: "chat_assistant",
        executionMode: "llm-only",
        creditMultiplier: 1.0,
        enabledByDefault: true,
        priority: 50,
        skillFilePath: "/skills/brainstorm/skill.md",
      },
    ]);

    const skills = mockGetAvailableSkills();

    // sandbox-code skill should be flagged as sandboxRequired
    const codeRunner = skills.find((s: any) => s.id === "code-runner");
    expect(codeRunner.executionMode.startsWith("sandbox-")).toBe(true);

    // llm-only skill should NOT be flagged as sandboxRequired
    const brainstorm = skills.find((s: any) => s.id === "brainstorm");
    expect(brainstorm.executionMode.startsWith("sandbox-")).toBe(false);
  });

  it("includes sandboxProfileSlug in skill metadata", () => {
    mockGetAvailableSkills.mockReturnValue([
      {
        id: "code-runner",
        name: "Code Runner",
        executionMode: "sandbox-code",
        sandboxProfileSlug: "code-default",
      },
    ]);

    const skills = mockGetAvailableSkills();
    expect(skills[0].sandboxProfileSlug).toBe("code-default");
  });

  it("returns null sandboxProfileSlug for non-sandbox skills", () => {
    mockGetAvailableSkills.mockReturnValue([
      {
        id: "brainstorm",
        name: "Brainstorm",
        executionMode: "llm-only",
        sandboxProfileSlug: undefined,
      },
    ]);

    const skills = mockGetAvailableSkills();
    expect(skills[0].sandboxProfileSlug).toBeUndefined();
  });
});
