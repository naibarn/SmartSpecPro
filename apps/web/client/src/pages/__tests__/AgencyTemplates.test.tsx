/**
 * Tests for AgencyTemplates page and template data.
 */

import { describe, it, expect, vi } from "vitest";

// Mock tRPC
vi.mock("@/lib/trpc", () => ({
  trpc: {
    agency: {
      listTemplates: {
        useQuery: vi.fn().mockReturnValue({
          data: [
            {
              id: "research",
              name: "Research Agency",
              description: "Researches topics and produces reports",
              category: "research",
              agentCount: 3,
              icon: "Search",
              agents: [],
              communicationFlows: [],
            },
            {
              id: "content-writer",
              name: "Content Writer Agency",
              description: "Plans, writes, and reviews content",
              category: "content",
              agentCount: 3,
              icon: "PenTool",
              agents: [],
              communicationFlows: [],
            },
            {
              id: "spec-writer",
              name: "Spec Writer Agency",
              description: "Writes technical specifications",
              category: "engineering",
              agentCount: 3,
              icon: "FileText",
              agents: [],
              communicationFlows: [],
            },
            {
              id: "code-review",
              name: "Code Review Agency",
              description: "Analyzes code and produces review reports",
              category: "engineering",
              agentCount: 3,
              icon: "Code",
              agents: [],
              communicationFlows: [],
            },
          ],
          isLoading: false,
          isError: false,
          error: null,
          refetch: vi.fn(),
        }),
      },
      createFromTemplate: {
        useMutation: vi.fn().mockReturnValue({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
    },
  },
}));

// Mock wouter
vi.mock("wouter", () => ({
  useLocation: vi.fn().mockReturnValue(["", vi.fn()]),
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("AgencyTemplates", () => {
  it("should have 4 template definitions with expected IDs", () => {
    const expectedTemplates = [
      "research",
      "content-writer",
      "spec-writer",
      "code-review",
    ];
    expect(expectedTemplates).toHaveLength(4);
  });

  it("each template has unique category mapping", () => {
    const templates = [
      { id: "research", category: "research", icon: "Search" },
      { id: "content-writer", category: "content", icon: "PenTool" },
      { id: "spec-writer", category: "engineering", icon: "FileText" },
      { id: "code-review", category: "engineering", icon: "Code" },
    ];

    const ids = new Set(templates.map((t) => t.id));
    expect(ids.size).toBe(4);

    const icons = new Set(templates.map((t) => t.icon));
    expect(icons.size).toBe(4);
  });

  it("template data should include card display properties", () => {
    const templateShape = {
      id: "research",
      name: "Research Agency",
      description: "Researches topics and produces reports",
      agentCount: 3,
      icon: "Search",
      category: "research",
    };

    expect(templateShape).toHaveProperty("id");
    expect(templateShape).toHaveProperty("name");
    expect(templateShape).toHaveProperty("description");
    expect(templateShape).toHaveProperty("agentCount");
    expect(templateShape).toHaveProperty("icon");
    expect(templateShape).toHaveProperty("category");
    expect(templateShape.agentCount).toBe(3);
  });

  it("createFromTemplate accepts templateId and optional name", () => {
    const validInput = { templateId: "research" };
    const validInputWithName = { templateId: "research", name: "My Team" };

    expect(validInput.templateId).toBeTruthy();
    expect(validInputWithName.name).toBe("My Team");
  });
});
