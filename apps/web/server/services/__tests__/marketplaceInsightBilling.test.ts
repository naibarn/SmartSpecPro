import { beforeEach, describe, expect, it, vi } from "vitest";

const mockExecuteSkillLlmWithFallback = vi.fn();
const mockSettleSkillRun = vi.fn();

vi.mock("../skillModelFallback", () => ({
  executeSkillLlmWithFallback: (...args: unknown[]) => mockExecuteSkillLlmWithFallback(...args),
}));
vi.mock("../skillRevenueBilling", () => ({
  settleSkillRun: (...args: unknown[]) => mockSettleSkillRun(...args),
}));
vi.mock("../enabledLlmModels", () => ({
  loadEnabledLlmModelRows: vi.fn(async () => [{}]),
}));
vi.mock("../intelligentModelSelector", () => ({
  selectBestLlmModel: vi.fn(() => "openai/gpt-4o-mini"),
}));
vi.mock("../webSearchToolInjector", () => ({
  buildWebSearchParams: vi.fn(() => ({ bodyParams: {}, systemPromptSuffix: "" })),
  detectProviderFamily: vi.fn(() => "openrouter"),
}));
vi.mock("../llmRouter", () => ({
  getProviderForModel: vi.fn(async () => ({ providerName: "openrouter" })),
}));

import { generateMarketplaceServerInsight } from "../marketplaceInsightService";

function makeSource() {
  return {
    schemaVersion: "1.0" as const,
    platform: "shopee" as const,
    sourceUrl: "https://example.com/product/1",
    capturedAt: new Date().toISOString(),
    pageTitle: "Test product",
    product: { title: "Test product", selectedImageUrls: [] },
    reviews: [],
    comments: [],
    evidence: [],
    payloadHash: "test-hash",
  };
}

describe("marketplace skill billing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteSkillLlmWithFallback.mockResolvedValue({
      success: true,
      content: "{}",
      modelId: "openai/gpt-4o-mini",
      provider: { providerName: "openrouter" },
      inputTokens: 100,
      outputTokens: 50,
      rawData: { usage: { cost: 0.001 } },
    });
    mockSettleSkillRun.mockResolvedValue({
      totalCredits: 2,
      userTransactionId: 1,
      tenantRevenueTransactionId: 2,
      skillRevenueTransactionId: null,
    });
  });

  it("settles one fixed skill run after a successful server insight LLM call", async () => {
    const result = await generateMarketplaceServerInsight(
      {
        extensionVersion: "test",
        insightType: "product_brief",
        source: makeSource(),
      },
      { userId: 7, tenantId: "tenant-1" },
    );

    expect(result.fallbackMode).toBe("llm_gateway");
    expect(mockSettleSkillRun).toHaveBeenCalledTimes(1);
    expect(mockSettleSkillRun).toHaveBeenCalledWith(expect.objectContaining({
      userId: 7,
      tenantId: "tenant-1",
      skillSlug: "marketplace-capture-product-brief",
      metadata: expect.objectContaining({
        model: "openai/gpt-4o-mini",
        provider: "openrouter",
        inputTokens: 100,
        outputTokens: 50,
      }),
    }));
  });

  it("fails closed when tenant billing context is missing instead of returning free LLM output", async () => {
    await expect(
      generateMarketplaceServerInsight(
        {
          extensionVersion: "test",
          insightType: "product_brief",
          source: makeSource(),
        },
        { userId: 7 },
      ),
    ).rejects.toThrow("SKILL_BILLING_FAILED");
    expect(mockSettleSkillRun).not.toHaveBeenCalled();
  });

  it("fails closed when settlement itself fails instead of falling back to an unbilled result", async () => {
    mockSettleSkillRun.mockRejectedValueOnce(new Error("credit ledger unavailable"));

    await expect(
      generateMarketplaceServerInsight(
        {
          extensionVersion: "test",
          insightType: "product_brief",
          source: makeSource(),
        },
        { userId: 7, tenantId: "tenant-1" },
      ),
    ).rejects.toThrow("SKILL_BILLING_FAILED: credit ledger unavailable");
  });
});
