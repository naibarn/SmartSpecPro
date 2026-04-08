import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillDefinition } from "@smartspec/skills";

vi.mock("../skillRegistry", () => ({
  getSkillRegistryAsync: vi.fn(),
}));

vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

import { getSkillCatalogSummary, clearSkillCatalogCache } from "../skillCatalog";
import { getSkillRegistryAsync } from "../skillRegistry";

const mockGetSkillRegistryAsync = vi.mocked(getSkillRegistryAsync);

function makeSkill(overrides: Partial<SkillDefinition>): SkillDefinition {
  return {
    id: "skill-id",
    name: "Skill",
    description: "Skill description",
    icon: "sparkles",
    type: "chat-assistant",
    triggers: [],
    requiresExplicit: true,
    creditMultiplier: 1,
    enabledByDefault: true,
    priority: 50,
    ...overrides,
  };
}

describe("skillCatalog", () => {
  beforeEach(() => {
    clearSkillCatalogCache();
    vi.clearAllMocks();
  });

  it("filters out internal-only skills from the classifier catalog", async () => {
    mockGetSkillRegistryAsync.mockResolvedValue([
      makeSkill({
        id: "internal-helper",
        name: "Internal Helper",
        internalOnly: true,
        teamRunEligible: true,
      }),
      makeSkill({
        id: "public-helper",
        name: "Public Helper",
        internalOnly: false,
        requiresExplicit: false,
      }),
    ]);

    const entries = await getSkillCatalogSummary(1, "tenant-1");

    expect(entries.map((entry) => entry.id)).toEqual(["public-helper"]);
  });

  it("filters out explicit-only skills from the classifier catalog", async () => {
    mockGetSkillRegistryAsync.mockResolvedValue([
      makeSkill({
        id: "agency-creator",
        name: "Agency Creator",
        requiresExplicit: true,
      }),
      makeSkill({
        id: "public-helper",
        name: "Public Helper",
        requiresExplicit: false,
      }),
    ]);

    const entries = await getSkillCatalogSummary(1, "tenant-1");

    expect(entries.map((entry) => entry.id)).toEqual(["public-helper"]);
  });
});
