import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDbSelect, mockResolvePolicy, mockLoadRows } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockResolvePolicy: vi.fn(),
  mockLoadRows: vi.fn(),
}));

vi.mock("../db", () => ({
  db: {
    select: mockDbSelect,
  },
  getDb: vi.fn(),
}));

vi.mock("../services/skillExecutionPolicy", () => ({
  resolveSkillExecutionPolicy: mockResolvePolicy,
}));

vi.mock("../services/enabledLlmModels", () => ({
  loadEnabledLlmModelRows: mockLoadRows,
}));

// Mock tRPC procedures
vi.mock("../_core/trpc", () => {
  const createProcedure = () => {
    const proc: any = {
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
      input: () => proc,
    };
    return proc;
  };
  return {
    router: (routes: any) => routes,
    protectedProcedure: createProcedure(),
    adminProcedure: createProcedure(),
  };
});

// Mock all other heavy dependencies that skills.ts imports
vi.mock("../services/skillRegistry", () => ({
  autoSyncSkillsFromFolder: vi.fn(),
  getAvailableSkills: vi.fn().mockReturnValue([]),
  getAvailableSkillsAsync: vi.fn().mockResolvedValue([]),
  getSkillById: vi.fn(),
  getSkillByIdOrType: vi.fn(),
  SkillDefinition: {},
  refreshSkillCache: vi.fn(),
  syncSingleSkillIfChanged: vi.fn(),
}));

vi.mock("../services/promptEnhancementService", () => ({
  getStyleCategories: vi.fn(),
  getVFXCategories: vi.fn(),
  getPromptOptions: vi.fn(),
  buildSystemPrompt: vi.fn(),
  buildUserPrompt: vi.fn(),
  parsePromptResponse: vi.fn(),
  loadSkillFile: vi.fn(),
  resolvePromptEnhancementSkill: vi.fn(),
}));

vi.mock("../services/creditService", () => ({
  deductCredits: vi.fn(),
  calculateCreditsForLLM: vi.fn(),
  hasEnoughCredits: vi.fn(),
}));

vi.mock("../services/llmRouter", () => ({
  getProviderForModel: vi.fn(),
}));

vi.mock("../services/modelLookup", () => ({
  buildModelLookupCandidates: vi.fn(),
}));

vi.mock("../storage", () => ({
  getUploadsDir: vi.fn().mockReturnValue("/tmp/uploads"),
}));

vi.mock("../services/skillStudioService", () => ({
  applyIscProposalDiff: vi.fn(),
  launchSkillStudioTask: vi.fn(),
  listIscProposalsWithOwners: vi.fn(),
  readIscProposalContent: vi.fn(),
}));

vi.mock("../services/skillMaintenanceAnalyzer", () => ({
  analyzeSkillForMaintenance: vi.fn(),
}));

vi.mock("../services/skillCompatibilityGate", () => ({
  buildSkillContractSnapshot: vi.fn(),
  compareSkillContractSnapshots: vi.fn(),
}));

vi.mock("../services/skillUpgradePlanner", () => ({
  persistSkillMaintenanceAnalysis: vi.fn(),
}));

vi.mock("../services/skillUpgradeApplier", () => ({
  applySkillUpgradeRecommendation: vi.fn(),
}));

vi.mock("../services/skillMaintenanceScheduler", () => ({
  executeSkillMaintenanceSweep: vi.fn(),
  resolveMaintenanceScheduleInput: vi.fn(),
}));

vi.mock("../services/skillFiles", () => ({
  hasRelativeSkillManifest: vi.fn(),
  mirrorExistingSkillManifest: vi.fn(),
  resolveSkillManifestPath: vi.fn(),
  resolveSkillDirCandidates: vi.fn(),
  updateSkillManifestFiles: vi.fn(),
  writeSkillManifestFiles: vi.fn(),
}));

vi.mock("../services/userSkillService", () => ({
  getUserVisibleSkills: vi.fn(),
  getAllSkillsForUser: vi.fn(),
  setSkillVisibility: vi.fn(),
  batchSetVisibility: vi.fn(),
  setAutoTrigger: vi.fn(),
}));

vi.mock("../services/marketplaceContentGenerator", () => ({
  generateMarketplaceContent: vi.fn(),
}));

vi.mock("../services/crypto", () => ({
  decrypt: vi.fn((v: string) => v),
}));

vi.mock("../services/brandingSanitizer", () => ({
  sanitizeBrandText: vi.fn((v: string) => v),
}));

vi.mock("../services/modelRegistry", () => ({
  refreshModelCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/mediaModelSelection", () => ({
  resolveMediaTypeFromSkillCategory: vi.fn(),
  sanitizeMediaModelSelection: vi.fn(),
}));

vi.mock("../../drizzle/schema", () => ({
  skills: {
    id: "id",
    slug: "slug",
    name: "name",
    llmModelId: "llmModelId",
    defaultModel: "defaultModel",
    preferredProviderId: "preferredProviderId",
    strictProviderPin: "strictProviderPin",
    executionPolicyJson: "executionPolicyJson",
    category: "category",
    skillContent: "skillContent",
    systemPrompt: "systemPrompt",
    folderPath: "folderPath",
    availableModels: "availableModels",
    isEnabled: "isEnabled",
    isAutoTrigger: "isAutoTrigger",
    description: "description",
    priority: "priority",
    tenantId: "tenantId",
    sandboxProfileSlug: "sandboxProfileSlug",
    requiresNetwork: "requiresNetwork",
    requiresBrowser: "requiresBrowser",
    maxRuntimeSeconds: "maxRuntimeSeconds",
    maxInputMb: "maxInputMb",
  },
  skillImprovementRecommendations: {
    id: "id",
    skillId: "skillId",
    recommendationType: "recommendationType",
    status: "status",
    riskLevel: "riskLevel",
    compatibilityStatus: "compatibilityStatus",
    analyzedAt: "analyzedAt",
    updatedAt: "updatedAt",
  },
  skillImprovementRuns: {
    id: "id",
    skillId: "skillId",
    recommendationId: "recommendationId",
    scheduleId: "scheduleId",
    status: "status",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
  skillContractSnapshots: {
    id: "id",
    recommendationId: "recommendationId",
    runId: "runId",
    capturedAt: "capturedAt",
    contractHash: "contractHash",
  },
  skillMaintenanceSchedules: {
    id: "id",
    updatedAt: "updatedAt",
    status: "status",
  },
  llmProviders: { id: "id" },
  modelProviderMap: {},
  skillPermissions: {},
  userGroups: {},
  users: {},
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function mockSelectChain(result: any[]) {
  const limitMock = vi.fn().mockResolvedValue(result);
  const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  mockDbSelect.mockReturnValue({ from: fromMock });
  return { fromMock, whereMock, limitMock };
}

describe("skills.previewModelResolution", () => {
  it("returns modelId and modelSource for a skill with requirements", async () => {
    mockSelectChain([{
      id: 1,
      slug: "test-skill",
      name: "Test Skill",
      llmModelId: null,
      defaultModel: null,
      preferredProviderId: null,
      strictProviderPin: false,
      executionPolicyJson: { mode: "requirements", requirements: { vision: true } },
    }]);
    mockResolvePolicy.mockResolvedValue({
      modelId: "claude-sonnet-4-6",
      allowFreeModels: false,
      modelSource: "requirements_match",
      matchedCapabilities: ["vision"],
      requirementsFallback: false,
    });
    mockLoadRows.mockResolvedValue([{ modelId: "m1" }, { modelId: "m2" }]);

    const { skillsRouter } = await import("./skills");
    const result = await (skillsRouter as any).previewModelResolution({ input: { skillId: 1 } });

    expect(result.modelId).toBe("claude-sonnet-4-6");
    expect(result.modelSource).toBe("requirements_match");
    expect(result.matchedCapabilities).toEqual(["vision"]);
    expect(result.requirementsFallback).toBe(false);
  });

  it("returns fallback info when requirements match nothing", async () => {
    mockSelectChain([{
      id: 2,
      slug: "fallback-skill",
      name: "Fallback Skill",
      llmModelId: null,
      defaultModel: null,
      preferredProviderId: null,
      strictProviderPin: false,
      executionPolicyJson: { mode: "requirements", requirements: { vision: true } },
    }]);
    mockResolvePolicy.mockResolvedValue({
      modelId: "gpt-4o",
      allowFreeModels: false,
      modelSource: "system_default",
      requirementsFallback: true,
    });
    mockLoadRows.mockResolvedValue([{ modelId: "m1" }]);

    const { skillsRouter } = await import("./skills");
    const result = await (skillsRouter as any).previewModelResolution({ input: { skillId: 2 } });

    expect(result.requirementsFallback).toBe(true);
    expect(result.modelSource).toBe("system_default");
  });

  it("returns system default when no requirements and no llmModelId", async () => {
    mockSelectChain([{
      id: 3,
      slug: "basic-skill",
      name: "Basic Skill",
      llmModelId: null,
      defaultModel: null,
      preferredProviderId: null,
      strictProviderPin: false,
      executionPolicyJson: null,
    }]);
    mockResolvePolicy.mockResolvedValue({
      modelId: "gpt-4o",
      allowFreeModels: false,
      modelSource: "system_default",
    });
    mockLoadRows.mockResolvedValue([]);

    const { skillsRouter } = await import("./skills");
    const result = await (skillsRouter as any).previewModelResolution({ input: { skillId: 3 } });

    expect(result.modelSource).toBe("system_default");
  });

  it("returns matchedCapabilities list", async () => {
    mockSelectChain([{
      id: 4,
      slug: "cap-skill",
      name: "Cap Skill",
      llmModelId: null,
      defaultModel: null,
      preferredProviderId: null,
      strictProviderPin: false,
      executionPolicyJson: { mode: "requirements", requirements: { functionTools: true, structuredOutput: true } },
    }]);
    mockResolvePolicy.mockResolvedValue({
      modelId: "claude-sonnet-4-6",
      allowFreeModels: false,
      modelSource: "requirements_match",
      matchedCapabilities: ["functionTools", "structuredOutput"],
      requirementsFallback: false,
    });
    mockLoadRows.mockResolvedValue([{ modelId: "m1" }, { modelId: "m2" }, { modelId: "m3" }]);

    const { skillsRouter } = await import("./skills");
    const result = await (skillsRouter as any).previewModelResolution({ input: { skillId: 4 } });

    expect(result.matchedCapabilities).toContain("functionTools");
    expect(result.matchedCapabilities).toContain("structuredOutput");
  });

  it("returns availableModelCount from loaded rows", async () => {
    mockSelectChain([{
      id: 5,
      slug: "count-skill",
      name: "Count Skill",
      llmModelId: null,
      defaultModel: null,
      preferredProviderId: null,
      strictProviderPin: false,
      executionPolicyJson: null,
    }]);
    mockResolvePolicy.mockResolvedValue({
      modelId: "gpt-4o",
      allowFreeModels: false,
      modelSource: "system_default",
    });
    mockLoadRows.mockResolvedValue([
      { modelId: "m1" }, { modelId: "m2" }, { modelId: "m3" },
      { modelId: "m4" }, { modelId: "m5" },
    ]);

    const { skillsRouter } = await import("./skills");
    const result = await (skillsRouter as any).previewModelResolution({ input: { skillId: 5 } });

    expect(result.availableModelCount).toBe(5);
  });

  it("throws NOT_FOUND when skillId does not exist", async () => {
    mockSelectChain([]);

    const { skillsRouter } = await import("./skills");

    await expect(
      (skillsRouter as any).previewModelResolution({ input: { skillId: 999 } }),
    ).rejects.toThrow(/not found/i);
  });
});
