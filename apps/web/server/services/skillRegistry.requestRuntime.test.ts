import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";

const mocks = vi.hoisted(() => ({ write: vi.fn(), select: vi.fn() }));
vi.mock("../db", () => ({
  getDb: () => ({ select: mocks.select, insert: mocks.write, update: mocks.write, delete: mocks.write }),
}));
vi.mock("./modelRegistry", () => ({
  refreshModelCache: vi.fn(), getDefaultModel: () => undefined, getModelIdsByType: () => [],
}));
import {
  autoSyncSkillsFromFolder, clearSkillRegistryCache, getAvailableSkillsAsync, resetAutoSyncFlag,
} from "./skillRegistry";

describe("request runtime skill catalog", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SMARTAIHUB_APPLICATION_RUNTIME", "cloudflare-http");
    vi.stubEnv("CLOUDFLARE_CONTAINER_POLICY", "on-demand");
    mocks.write.mockReset();
    mocks.select.mockImplementation(selection => ({
      from: () => selection ? Promise.resolve([]) : {
        where: () => ({
          orderBy: async () => [{
            id: 1, slug: "saved-api-skill", name: "Saved API Skill", description: "saved configuration",
            category: "article_generation", isEnabled: true, enabledByDefault: true,
            isAutoTrigger: false, priority: 10, creditMultiplier: "1",
          }],
        }),
      },
    }));
    clearSkillRegistryCache();
    resetAutoSyncFlag();
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readdirSync").mockReturnValue([]);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
  it("loads saved skills on the first request without scanning folders or writing the database", async () => {
    const skills = await getAvailableSkillsAsync();
    expect(skills.some(skill => skill.id === "saved-api-skill")).toBe(true);
    expect(fs.readdirSync).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("keeps explicit administrative resynchronization available", async () => {
    await autoSyncSkillsFromFolder({ force: true });
    expect(fs.readdirSync).toHaveBeenCalled();
  });
  it("preserves standard runtime synchronization", async () => {
    vi.stubEnv("SMARTAIHUB_APPLICATION_RUNTIME", "standard");
    await getAvailableSkillsAsync();
    expect(fs.readdirSync).toHaveBeenCalled();
  });
});
