import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDetectSkill,
  mockGetAvailableSkillsAsync,
  mockGetSkillByIdAsync,
  mockGetModelsByTypeAsync,
  mockGetDefaultModel,
  mockSuggestModel,
  mockLoadEnabledModelsWithPricing,
  mockResolveProviders,
  mockAuditLog,
} = vi.hoisted(() => ({
  mockDetectSkill: vi.fn(),
  mockGetAvailableSkillsAsync: vi.fn(),
  mockGetSkillByIdAsync: vi.fn(),
  mockGetModelsByTypeAsync: vi.fn(),
  mockGetDefaultModel: vi.fn(),
  mockSuggestModel: vi.fn(),
  mockLoadEnabledModelsWithPricing: vi.fn(),
  mockResolveProviders: vi.fn(),
  mockAuditLog: vi.fn(),
}));

vi.mock("../skillDetector", () => ({
  detectSkill: mockDetectSkill,
}));

vi.mock("../skillRegistry", () => ({
  getAvailableSkillsAsync: mockGetAvailableSkillsAsync,
  getSkillByIdAsync: mockGetSkillByIdAsync,
}));

vi.mock("../modelRegistry", () => ({
  getModelsByTypeAsync: mockGetModelsByTypeAsync,
  getDefaultModel: mockGetDefaultModel,
}));

vi.mock("../../routers/modelSuggestTool", () => ({
  suggestModel: mockSuggestModel,
}));

vi.mock("../capabilityRegistry", () => ({
  loadEnabledModelsWithPricing: mockLoadEnabledModelsWithPricing,
}));

vi.mock("../llmRouter", () => ({
  resolveProviders: mockResolveProviders,
}));

vi.mock("../auditLogger", () => ({
  auditLogger: { log: mockAuditLog },
}));

import { resolveAutoDraftParams } from "../autoDraftResolver";

describe("autoDraftResolver", () => {
  beforeEach(() => {
    mockDetectSkill.mockResolvedValue({ detected: false, confidence: 0 });
    mockGetAvailableSkillsAsync.mockResolvedValue([]);
    mockGetSkillByIdAsync.mockResolvedValue(null);
    mockGetModelsByTypeAsync.mockResolvedValue([]);
    mockSuggestModel.mockRejectedValue(new Error("no image suggestion"));
    mockGetDefaultModel.mockImplementation((type: string) => {
      if (type === "text") {
        return { id: "fallback-text" };
      }
      return undefined;
    });
    mockLoadEnabledModelsWithPricing.mockResolvedValue([
      {
        modelId: "unroutable-model",
        capabilities: {
          supportsStructuredOutputs: true,
          supportsFunctionTools: true,
          contextLength: 200000,
        },
        pricingInput: 1,
        pricingOutput: 1,
        isFree: true,
      },
      {
        modelId: "routable-model",
        capabilities: {
          supportsStructuredOutputs: true,
          supportsFunctionTools: false,
          contextLength: 32000,
        },
        pricingInput: 2,
        pricingOutput: 2,
        isFree: false,
      },
    ]);
    mockResolveProviders.mockImplementation(async (modelId: string) => (
      modelId === "routable-model"
        ? [{
            providerId: 1,
            providerName: "test-provider",
            baseUrl: "https://example.com",
            apiKey: "key",
            providerModelId: modelId,
            pricingInput: 0,
            pricingOutput: 0,
            isFree: true,
            priority: 1,
          }]
        : []
    ));
    mockAuditLog.mockReset();
  });

  it("skips unroutable scored models and returns the first text model with providers", async () => {
    const resolution = await resolveAutoDraftParams("หัวข้อสุขภาพสำหรับผู้ปกครอง");

    expect(resolution.textModel).toBe("routable-model");
    expect(resolution.resolutionLog).toEqual(expect.arrayContaining([
      expect.objectContaining({
        step: "textModel",
        result: "routable-model",
      }),
    ]));
  });
});
