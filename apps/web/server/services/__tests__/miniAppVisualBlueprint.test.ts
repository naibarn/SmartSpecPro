import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  calculateCreditsForLLM: vi.fn(() => 3),
  deductCredits: vi.fn(async () => ({ transactionId: 1 })),
  loadEnabledLlmModelRows: vi.fn(),
  selectBestLlmModel: vi.fn(() => "vision/test-model"),
  isAvailable: vi.fn(() => true),
  executeWithFallback: vi.fn(),
}));

vi.mock("../creditService", () => ({
  calculateCreditsForLLM: mocks.calculateCreditsForLLM,
  deductCredits: mocks.deductCredits,
}));
vi.mock("../enabledLlmModels", () => ({ loadEnabledLlmModelRows: mocks.loadEnabledLlmModelRows }));
vi.mock("../intelligentModelSelector", () => ({ selectBestLlmModel: mocks.selectBestLlmModel }));
vi.mock("../providerHealth", () => ({ isAvailable: mocks.isAvailable }));
vi.mock("../llmRouter", () => ({ executeWithFallback: mocks.executeWithFallback }));

import { analyzeMiniAppVisualReferences, MiniAppVisionCapabilityUnavailableError } from "../miniAppVisualBlueprint";

const imageBytes = Buffer.from("small fixture image");
const imageBase64 = imageBytes.toString("base64");
const blueprint = {
  schemaVersion: "mini-app-visual-blueprint.v1",
  summary: "A compact task dashboard",
  pages: [{ page: "Dashboard", referenceIds: ["shot-1"], state: "default", viewport: "desktop", layout: "Sidebar and content", hierarchy: ["Header", "Task list"], components: [{ name: "Task list", placement: "Main column" }] }],
  designTokens: [{ name: "surface", value: "warm gray", role: "page background" }],
  responsiveTargets: [{ viewport: "mobile", changes: ["Collapse sidebar"] }],
  confidence: 0.91,
};

describe("analyzeMiniAppVisualReferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectBestLlmModel.mockReturnValue("vision/test-model");
    mocks.loadEnabledLlmModelRows.mockResolvedValue([
      { modelId: "vision/test-model", providerId: 7, supportsVision: true, supportsStructuredOutputs: true },
    ]);
    mocks.isAvailable.mockReturnValue(true);
    mocks.executeWithFallback.mockResolvedValue({
      type: "success",
      response: { choices: [{ message: { content: JSON.stringify(blueprint) } }], usage: { prompt_tokens: 80, completion_tokens: 30 } },
    });
  });

  it("sends staged screenshot bytes to an enabled healthy vision model and charges idempotently", async () => {
    const result = await analyzeMiniAppVisualReferences({
      userId: 42,
      tenantId: "tenant-a",
      runId: "run-a",
      references: [{ id: "shot-1", fileName: "dashboard.png", mimeType: "image/png", contentBase64: imageBase64, pageHint: "Dashboard", viewportHint: "desktop" }],
    });

    expect(result.blueprint).toEqual(blueprint);
    expect(result.inputDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(mocks.selectBestLlmModel).toHaveBeenCalledWith({ supportsVision: true, supportsStructuredOutputs: true }, expect.any(Array));
    const call = mocks.executeWithFallback.mock.calls[0][0] as any;
    expect(call.model).toBe("vision/test-model");
    expect(call.disableProviderFallbacks).toBe(true);
    expect(call.messages[1].content[1].image_url.url).toBe(`data:image/png;base64,${imageBase64}`);
    expect(call.messages[1].content[0].text).toContain("untrusted visual evidence");
    expect(call.messages[1].content[0].text).toContain("Dashboard");
    expect(mocks.deductCredits).toHaveBeenCalledWith(expect.objectContaining({
      userId: 42,
      tenantId: "tenant-a",
      idempotencyKey: `mini-app-visual-blueprint:${result.inputDigest}`,
    }));
  });

  it("fails closed when no eligible enabled provider is healthy", async () => {
    mocks.loadEnabledLlmModelRows.mockResolvedValue([]);
    mocks.selectBestLlmModel.mockReturnValue(null);

    await expect(analyzeMiniAppVisualReferences({
      userId: 42,
      tenantId: "tenant-a",
      runId: "run-a",
      references: [{ id: "shot-1", fileName: "dashboard.png", mimeType: "image/png", contentBase64: imageBase64 }],
    })).rejects.toBeInstanceOf(MiniAppVisionCapabilityUnavailableError);
    expect(mocks.executeWithFallback).not.toHaveBeenCalled();
  });

  it("rejects malformed model output and never bills it", async () => {
    mocks.executeWithFallback.mockResolvedValue({ type: "success", response: { choices: [{ message: { content: "{}" } }] } });

    await expect(analyzeMiniAppVisualReferences({
      userId: 42,
      tenantId: "tenant-a",
      runId: "run-a",
      references: [{ id: "shot-1", fileName: "dashboard.png", mimeType: "image/png", contentBase64: imageBase64 }],
    })).rejects.toThrow("MINI_APP_VISION_BLUEPRINT_INVALID");
    expect(mocks.deductCredits).not.toHaveBeenCalled();
  });

  it("rejects a blueprint that invents references", async () => {
    mocks.executeWithFallback.mockResolvedValue({
      type: "success",
      response: { choices: [{ message: { content: JSON.stringify({ ...blueprint, pages: [{ ...blueprint.pages[0], referenceIds: ["other"] }] }) } }] },
    });

    await expect(analyzeMiniAppVisualReferences({
      userId: 42,
      tenantId: "tenant-a",
      runId: "run-a",
      references: [{ id: "shot-1", fileName: "dashboard.png", mimeType: "image/png", contentBase64: imageBase64 }],
    })).rejects.toThrow("MINI_APP_VISION_BLUEPRINT_REFERENCE_MISMATCH");
    expect(mocks.deductCredits).not.toHaveBeenCalled();
  });
});
