/**
 * Tests for Skill Catalog and Schema Loader (Feature 045, Section 02)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "path";

// ─── Controlled mock state ──────────────────────────────────────────────────

const SKILLS_DIR = path.resolve(process.cwd(), "skills");
let mockSkills: any[] = [];
let mockSkillById: any = null;

// ─── Top-level mocks ────────────────────────────────────────────────────────

vi.mock("../../db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../../drizzle/schema", () => ({
  userSkillVisibility: {
    userId: "userId",
    skillId: "skillId",
    visible: "visible",
  },
  skills: {},
}));

vi.mock("../modelRegistry", () => ({
  getDefaultModel: vi.fn().mockReturnValue(null),
  getModelIdsByType: vi.fn().mockReturnValue([]),
  refreshModelCache: vi.fn(),
}));

vi.mock("../mediaModelSelection", () => ({
  sanitizeMediaModelSelection: vi.fn().mockReturnValue(undefined),
}));

vi.mock("../skillFiles", () => ({
  resolveRelativeSkillManifestPath: vi.fn(),
  resolveSkillManifestPath: vi.fn(),
}));

vi.mock("@smartspec/skills", () => ({
  parseSkillFile: vi.fn(),
  mapCategoryToEnum: vi.fn(),
  categoryToSkillType: vi.fn().mockReturnValue("prompt-enhancement"),
  parseTriggerPatterns: vi.fn().mockReturnValue([]),
  normalizeMetadata: vi.fn().mockReturnValue({}),
}));

vi.mock("../skillRegistry", () => ({
  getSkillRegistryAsync: vi.fn(async () => mockSkills),
  getSkillByIdAsync: vi.fn(async (id: string) => mockSkillById ?? mockSkills.find((s: any) => s.id === id)),
  clearSkillRegistryCache: vi.fn(),
  getSkillRegistry: vi.fn(() => mockSkills),
  getAvailableSkillsAsync: vi.fn(async () => mockSkills),
  getSkillCatalogSummary: vi.fn(),
  buildSkillCategoryGroups: vi.fn(),
  clearSchemaCache: vi.fn(),
}));

const mockExistsSync = vi.fn().mockReturnValue(false);
const mockReadFileSync = vi.fn().mockReturnValue("{}");
vi.mock("fs", async (importOriginal) => {
  const orig = await importOriginal<typeof import("fs")>();
  return {
    ...orig,
    default: {
      ...orig,
      existsSync: (...args: any[]) => mockExistsSync(...args),
      readFileSync: (...args: any[]) => mockReadFileSync(...args),
      readdirSync: orig.readdirSync,
      statSync: orig.statSync,
    },
    existsSync: (...args: any[]) => mockExistsSync(...args),
    readFileSync: (...args: any[]) => mockReadFileSync(...args),
  };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSkillDef(overrides: Partial<any> = {}) {
  return {
    id: overrides.id ?? "test-skill",
    name: overrides.name ?? "Test Skill",
    description: overrides.description ?? "A test skill",
    icon: "sparkles",
    type: overrides.type ?? "prompt-enhancement",
    category: overrides.category ?? "chat_assistant",
    triggers: [],
    requiresExplicit: false,
    creditMultiplier: 1,
    enabledByDefault: true,
    priority: 50,
    skillFilePath: overrides.skillFilePath ?? path.join(SKILLS_DIR, "test-skill", "skill.md"),
    ...overrides,
  };
}

// ─── Import modules under test (after mocks are set up) ─────────────────────

import { getSkillCatalogSummary, clearSkillCatalogCache, buildSkillCategoryGroups } from "../skillCatalog";
import { loadInputSchema, clearSchemaCache } from "../skillSchemaLoader";

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("getSkillCatalogSummary", () => {
  beforeEach(() => {
    mockSkills = [];
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValue("{}");
    clearSkillCatalogCache();
  });

  it("returns array of SkillCatalogEntry objects with required fields", async () => {
    mockSkills = [
      makeSkillDef({ id: "s1", name: "Skill 1" }),
      makeSkillDef({ id: "s2", name: "Skill 2" }),
      makeSkillDef({ id: "s3", name: "Skill 3" }),
    ];

    const result = await getSkillCatalogSummary(1, "tenant1");

    expect(result).toHaveLength(3);
    for (const entry of result) {
      expect(entry).toHaveProperty("id");
      expect(entry).toHaveProperty("name");
      expect(entry).toHaveProperty("category");
      expect(entry).toHaveProperty("description");
      expect(entry).toHaveProperty("inputTypes");
      expect(entry).toHaveProperty("outputTypes");
      expect(entry).toHaveProperty("hasInputSchema");
      expect(entry).toHaveProperty("requiredFields");
    }
  });

  it("groups skills by category correctly", async () => {
    mockSkills = [
      makeSkillDef({ id: "pr1", category: "product_review" }),
      makeSkillDef({ id: "pr2", category: "product_review" }),
      makeSkillDef({ id: "ig1", category: "image_generation" }),
    ];

    const result = await getSkillCatalogSummary(1, "tenant1");

    expect(result.filter((e) => e.category === "product_review")).toHaveLength(2);
    expect(result.filter((e) => e.category === "image_generation")).toHaveLength(1);
  });

  it("truncates description to 100 chars", async () => {
    mockSkills = [makeSkillDef({ id: "long", description: "A".repeat(200) })];

    const result = await getSkillCatalogSummary(1, "tenant1");

    expect(result[0].description.length).toBeLessThanOrEqual(100);
    expect(result[0].description).toMatch(/\.\.\.$/);
  });

  it("populates outputTypes based on skill category", async () => {
    mockSkills = [
      makeSkillDef({ id: "img", category: "image_generation" }),
      makeSkillDef({ id: "art", category: "article_generation" }),
    ];

    const result = await getSkillCatalogSummary(1, "tenant1");

    expect(result.find((e) => e.id === "img")!.outputTypes).toContain("image_url");
    expect(result.find((e) => e.id === "art")!.outputTypes).toContain("text");
  });

  it("populates inputTypes from schema properties with format uri", async () => {
    const schema = {
      type: "object",
      properties: {
        imageUrl: { type: "string", format: "uri" },
        topic: { type: "string" },
      },
    };
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(schema));
    mockSkills = [makeSkillDef({ id: "s1", skillFilePath: path.join(SKILLS_DIR, "s1", "skill.md") })];

    const result = await getSkillCatalogSummary(1, "tenant1");

    expect(result[0].inputTypes).toContain("image_url");
  });

  it("returns cached result on second call", async () => {
    mockSkills = [makeSkillDef({ id: "s1" })];

    const result1 = await getSkillCatalogSummary(1, "tenant1");
    const result2 = await getSkillCatalogSummary(1, "tenant1");

    expect(result1).toBe(result2);
  });

  it("returns fresh data after clearSkillCatalogCache()", async () => {
    mockSkills = [makeSkillDef({ id: "s1" })];

    const result1 = await getSkillCatalogSummary(1, "tenant1");
    clearSkillCatalogCache();
    const result2 = await getSkillCatalogSummary(1, "tenant1");

    expect(result1).not.toBe(result2);
  });

  it("handles empty skill registry gracefully", async () => {
    mockSkills = [];

    const result = await getSkillCatalogSummary(1, "tenant1");

    expect(result).toEqual([]);
  });
});

describe("buildSkillCategoryGroups", () => {
  it("groups skills into canonical categories", () => {
    const entries = [
      { id: "s1", name: "S1", category: "image_generation", description: "", inputTypes: [], outputTypes: [], hasInputSchema: false, requiredFields: [] },
      { id: "s2", name: "S2", category: "product_review", description: "", inputTypes: [], outputTypes: [], hasInputSchema: false, requiredFields: [] },
      { id: "s3", name: "S3", category: "chat_assistant", description: "", inputTypes: [], outputTypes: [], hasInputSchema: false, requiredFields: [] },
    ];

    const groups = buildSkillCategoryGroups(entries);

    expect(groups["media_image"]).toContain("s1");
    expect(groups["product_review"]).toContain("s2");
    expect(groups["content_tools"]).toContain("s3");
  });
});

describe("loadInputSchema", () => {
  beforeEach(() => {
    mockSkillById = null;
    mockSkills = [];
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReturnValue("{}");
    clearSchemaCache();
  });

  it("loads and parses valid input.schema.json", async () => {
    const schema = {
      type: "object",
      required: ["topic"],
      properties: {
        topic: { type: "string" },
        language: { type: "string", default: "th" },
        category: { type: "string", enum: ["tech", "food"] },
      },
    };
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(schema));
    mockSkills = [makeSkillDef({ id: "load-test", skillFilePath: path.join(SKILLS_DIR, "load-test", "skill.md") })];

    const result = await loadInputSchema("load-test");

    expect(result).not.toBeNull();
    expect(result!.schema).toEqual(schema);
    expect(result!.requiredFields).toEqual(["topic"]);
    expect(result!.fieldsWithDefaults).toContain("language");
    expect(result!.enumFields).toContain("category");
  });

  it("returns null when schema file doesn't exist", async () => {
    mockExistsSync.mockReturnValue(false);
    mockSkills = [makeSkillDef({ id: "nofile-test", skillFilePath: path.join(SKILLS_DIR, "nofile-test", "skill.md") })];

    const result = await loadInputSchema("nofile-test");

    expect(result).toBeNull();
  });

  it("extracts requiredFields from schema required array", async () => {
    const schema = { type: "object", required: ["topic", "language"], properties: { topic: { type: "string" }, language: { type: "string" } } };
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(schema));
    mockSkills = [makeSkillDef({ id: "req-test", skillFilePath: path.join(SKILLS_DIR, "req-test", "skill.md") })];

    const result = await loadInputSchema("req-test");

    expect(result!.requiredFields).toEqual(["topic", "language"]);
  });

  it("identifies fieldsWithDefaults", async () => {
    const schema = {
      type: "object",
      properties: { language: { type: "string", default: "th" }, topic: { type: "string" } },
    };
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(schema));
    mockSkills = [makeSkillDef({ id: "def-test", skillFilePath: path.join(SKILLS_DIR, "def-test", "skill.md") })];

    const result = await loadInputSchema("def-test");

    expect(result!.fieldsWithDefaults).toContain("language");
    expect(result!.fieldsWithDefaults).not.toContain("topic");
  });

  it("identifies enumFields", async () => {
    const schema = {
      type: "object",
      properties: { category: { type: "string", enum: ["a", "b"] }, name: { type: "string" } },
    };
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(schema));
    mockSkills = [makeSkillDef({ id: "enum-test", skillFilePath: path.join(SKILLS_DIR, "enum-test", "skill.md") })];

    const result = await loadInputSchema("enum-test");

    expect(result!.enumFields).toContain("category");
    expect(result!.enumFields).not.toContain("name");
  });

  it("caches loaded schema", async () => {
    const schema = { type: "object", properties: { x: { type: "string" } } };
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(schema));
    mockSkills = [makeSkillDef({ id: "cache-test", skillFilePath: path.join(SKILLS_DIR, "cache-test", "skill.md") })];

    const r1 = await loadInputSchema("cache-test");
    const r2 = await loadInputSchema("cache-test");

    expect(r1).toBe(r2);
  });

  it("handles malformed JSON gracefully", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("{ broken json");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockSkills = [makeSkillDef({ id: "bad-json", skillFilePath: path.join(SKILLS_DIR, "bad-json", "skill.md") })];

    const result = await loadInputSchema("bad-json");

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
