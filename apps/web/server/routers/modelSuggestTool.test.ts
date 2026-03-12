import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

vi.mock("../_core/env", () => ({
  ENV: { webGatewayToken: "test-gateway-token" },
}));

vi.mock("../services/modelRegistry", () => ({
  getModelsByTypeAsync: vi.fn(),
}));

vi.mock("../middleware/contentAutomationGate", () => ({
  contentAutomationGate: vi.fn((_req, _res, next) => next()),
}));

import { modelSuggestHandler, creditCostToTier, suggestModel } from "./modelSuggestTool";
import { getModelsByTypeAsync } from "../services/modelRegistry";
import { contentAutomationGate } from "../middleware/contentAutomationGate";
import { ENV } from "../_core/env";

const MOCK_MODELS = [
  { id: "img-model-1", name: "Fast Image", type: "image", provider: "openai", creditCost: 3, priority: 1, isEnabled: true, description: "Fast image model" },
  { id: "img-model-2", name: "Quality Image", type: "image", provider: "anthropic", creditCost: 15, priority: 2, isEnabled: true, description: "Quality image model" },
  { id: "img-model-3", name: "Premium Image", type: "image", provider: "stability", creditCost: 30, priority: 3, isEnabled: true, description: "Premium image model" },
  { id: "img-model-4", name: "Budget Image", type: "image", provider: "openai", creditCost: 1, priority: 4, isEnabled: true, description: "Budget image model" },
];

function buildRequest(overrides?: Record<string, unknown>): Request {
  return {
    headers: {
      "x-internal-token": "test-gateway-token",
    },
    body: {
      purpose: "image",
      userId: 42,
      tenantId: "tenant-1",
      ...overrides,
    },
  } as unknown as Request;
}

function buildResponse(): { res: Response; statusMock: ReturnType<typeof vi.fn>; jsonMock: ReturnType<typeof vi.fn> } {
  const jsonMock = vi.fn();
  const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
  const res = { status: statusMock, json: jsonMock } as unknown as Response;
  return { res, statusMock, jsonMock };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getModelsByTypeAsync).mockResolvedValue(MOCK_MODELS as never);
  vi.mocked(contentAutomationGate).mockImplementation((_req, _res, next) => next());
});

describe("modelSuggestTool handler", () => {
  describe("authentication", () => {
    it("returns 401 when X-Internal-Token is missing", async () => {
      const req = buildRequest();
      (req.headers as Record<string, string>)["x-internal-token"] = "";
      const { res, statusMock, jsonMock } = buildResponse();

      await modelSuggestHandler(req, res);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it("returns 401 when X-Internal-Token does not match", async () => {
      const req = buildRequest();
      (req.headers as Record<string, string>)["x-internal-token"] = "wrong-token";
      const { res, statusMock } = buildResponse();

      await modelSuggestHandler(req, res);

      expect(statusMock).toHaveBeenCalledWith(401);
    });
  });

  describe("request validation", () => {
    it("returns 400 when purpose is invalid", async () => {
      const req = buildRequest({ purpose: "unknown" });
      const { res, statusMock } = buildResponse();

      await modelSuggestHandler(req, res);

      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it("accepts valid purpose values: image, video, audio, text", async () => {
      for (const purpose of ["image", "video", "audio", "text"]) {
        vi.mocked(getModelsByTypeAsync).mockResolvedValue(MOCK_MODELS as never);
        const req = buildRequest({ purpose });
        const { res, jsonMock } = buildResponse();
        await modelSuggestHandler(req, res);
        const call = jsonMock.mock.calls[0][0];
        expect(call.success).toBe(true);
      }
    });
  });

  describe("model filtering and ranking", () => {
    it("filters models by purpose and returns them ranked by priority", async () => {
      const req = buildRequest({ purpose: "image" });
      const { res, jsonMock } = buildResponse();

      await modelSuggestHandler(req, res);

      expect(getModelsByTypeAsync).toHaveBeenCalledWith("image");
      const call = jsonMock.mock.calls[0][0];
      expect(call.recommended).toBeDefined();
      expect(call.recommended.model_id).toBe("img-model-1"); // priority=1 is top
    });

    it("returns up to 3 alternatives", async () => {
      const req = buildRequest({ purpose: "image" });
      const { res, jsonMock } = buildResponse();

      await modelSuggestHandler(req, res);

      const call = jsonMock.mock.calls[0][0];
      expect(call.alternatives.length).toBeLessThanOrEqual(3);
    });

    it("returns empty alternatives array when only 1 model available", async () => {
      vi.mocked(getModelsByTypeAsync).mockResolvedValue([MOCK_MODELS[0]] as never);
      const req = buildRequest({ purpose: "image" });
      const { res, jsonMock } = buildResponse();

      await modelSuggestHandler(req, res);

      const call = jsonMock.mock.calls[0][0];
      expect(call.recommended.model_id).toBe("img-model-1");
      expect(call.alternatives).toEqual([]);
    });

    it("handles empty model list gracefully with recommended: null", async () => {
      vi.mocked(getModelsByTypeAsync).mockResolvedValue([]);
      const req = buildRequest({ purpose: "image" });
      const { res, jsonMock } = buildResponse();

      await modelSuggestHandler(req, res);

      const call = jsonMock.mock.calls[0][0];
      expect(call.success).toBe(true);
      expect(call.recommended).toBeNull();
      expect(call.alternatives).toEqual([]);
    });

    it("returns helpful message for text purpose (not in media registry)", async () => {
      const req = buildRequest({ purpose: "text" });
      const { res, jsonMock } = buildResponse();

      await modelSuggestHandler(req, res);

      const call = jsonMock.mock.calls[0][0];
      expect(call.success).toBe(true);
      expect(call.recommended).toBeNull();
      expect(call.message).toBeDefined();
      expect(typeof call.message).toBe("string");
    });
  });

  describe("cost tier mapping", () => {
    it("returns cost_tier as categorical string, never raw creditCost", async () => {
      const req = buildRequest({ purpose: "image" });
      const { res, jsonMock } = buildResponse();

      await modelSuggestHandler(req, res);

      const call = jsonMock.mock.calls[0][0];
      const allModels = [call.recommended, ...call.alternatives];
      for (const model of allModels) {
        expect(["low", "medium", "high"]).toContain(model.cost_tier);
        expect(model).not.toHaveProperty("creditCost");
        expect(model).not.toHaveProperty("cost_per_unit");
      }
    });
  });
});

describe("suggestModel() standalone function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getModelsByTypeAsync).mockResolvedValue(MOCK_MODELS as never);
  });

  it("quality_preference='speed' returns cheapest model as recommended", async () => {
    const result = await suggestModel("image", "speed");
    // img-model-4 has creditCost=1, the cheapest
    expect(result.recommended).not.toBeNull();
    expect(result.recommended!.model_id).toBe("img-model-4");
  });

  it("quality_preference='quality' returns lowest-priority-number model as recommended", async () => {
    const result = await suggestModel("image", "quality");
    // img-model-1 has priority=1 (lowest number = highest priority)
    expect(result.recommended!.model_id).toBe("img-model-1");
  });

  it("quality_preference='balanced' produces same order as 'quality'", async () => {
    const quality = await suggestModel("image", "quality");
    const balanced = await suggestModel("image", "balanced");
    expect(balanced.recommended!.model_id).toBe(quality.recommended!.model_id);
  });

  it("omitting quality_preference defaults to 'balanced' behaviour", async () => {
    const balanced = await suggestModel("image", "balanced");
    const omitted = await suggestModel("image");
    expect(omitted.recommended!.model_id).toBe(balanced.recommended!.model_id);
  });

  it("returns at most 3 alternatives even with 5+ models available", async () => {
    const sixModels = [
      ...MOCK_MODELS,
      { id: "img-model-5", name: "Extra 5", type: "image", provider: "openai", creditCost: 2, priority: 5, isEnabled: true, description: "Extra 5" },
      { id: "img-model-6", name: "Extra 6", type: "image", provider: "openai", creditCost: 3, priority: 6, isEnabled: true, description: "Extra 6" },
    ];
    vi.mocked(getModelsByTypeAsync).mockResolvedValue(sixModels as never);
    const result = await suggestModel("image");
    expect(result.alternatives.length).toBeLessThanOrEqual(3);
  });

  it("returns recommended: null when model list is empty", async () => {
    vi.mocked(getModelsByTypeAsync).mockResolvedValue([]);
    const result = await suggestModel("image");
    expect(result.recommended).toBeNull();
  });

  it("returns alternatives: [] when model list is empty", async () => {
    vi.mocked(getModelsByTypeAsync).mockResolvedValue([]);
    const result = await suggestModel("image");
    expect(result.alternatives).toEqual([]);
  });

  it("purpose='text' returns recommended: null with message, never calls getModelsByTypeAsync", async () => {
    const result = await suggestModel("text");
    expect(result.recommended).toBeNull();
    expect(getModelsByTypeAsync).not.toHaveBeenCalled();
  });

  it("purpose='text' returns a non-empty message string", async () => {
    const result = await suggestModel("text");
    expect(result.message).toBeTruthy();
    expect(typeof result.message).toBe("string");
  });

  it("model without priority field sorts after models with explicit priority (priority ?? 99)", async () => {
    // Use only 2 models so no-priority-model is guaranteed to appear in alternatives
    const twoModelsWithNoPriority = [
      { id: "explicit-priority", name: "Has Priority", type: "image", provider: "openai", creditCost: 5, priority: 1, isEnabled: true, description: "Has priority" },
      { id: "no-priority-model", name: "No Priority", type: "image", provider: "openai", creditCost: 5, priority: undefined, isEnabled: true, description: "No priority" },
    ];
    vi.mocked(getModelsByTypeAsync).mockResolvedValue(twoModelsWithNoPriority as never);
    const result = await suggestModel("image", "quality");
    // explicit-priority (priority=1) should be recommended over no-priority (priority=99)
    expect(result.recommended!.model_id).toBe("explicit-priority");
    // no-priority-model should be in alternatives (it sorted after)
    const altIds = result.alternatives.map((m) => m.model_id);
    expect(altIds).toContain("no-priority-model");
  });

  it("getModelsByTypeAsync throwing returns { recommended: null, alternatives: [] } without re-throwing", async () => {
    vi.mocked(getModelsByTypeAsync).mockRejectedValue(new Error("Registry down"));
    await expect(suggestModel("image")).resolves.toEqual({ recommended: null, alternatives: [] });
  });

  it("response entries never contain raw creditCost field", async () => {
    const result = await suggestModel("image");
    const all = [result.recommended, ...result.alternatives].filter(Boolean);
    for (const entry of all) {
      expect(entry).not.toHaveProperty("creditCost");
    }
  });
});

describe("verifyInternalToken security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getModelsByTypeAsync).mockResolvedValue(MOCK_MODELS as never);
  });

  it("returns true (200) when token matches expected value", async () => {
    const req = buildRequest(); // sends "test-gateway-token" which matches ENV mock
    const { res, statusMock, jsonMock } = buildResponse();
    await modelSuggestHandler(req, res);
    expect(statusMock).not.toHaveBeenCalledWith(401);
    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("returns false (401) when token is wrong", async () => {
    const req = buildRequest();
    (req.headers as Record<string, string>)["x-internal-token"] = "wrong-token";
    const { res, statusMock } = buildResponse();
    await modelSuggestHandler(req, res);
    expect(statusMock).toHaveBeenCalledWith(401);
  });

  it("returns false (401) when token header is empty string", async () => {
    const req = buildRequest();
    (req.headers as Record<string, string>)["x-internal-token"] = "";
    const { res, statusMock } = buildResponse();
    await modelSuggestHandler(req, res);
    expect(statusMock).toHaveBeenCalledWith(401);
  });

  it("returns false (401) when token header is absent (undefined)", async () => {
    const req = buildRequest();
    delete (req.headers as Record<string, unknown>)["x-internal-token"];
    const { res, statusMock } = buildResponse();
    await modelSuggestHandler(req, res);
    expect(statusMock).toHaveBeenCalledWith(401);
  });

  it("tokens of different lengths are rejected without throwing RangeError", async () => {
    for (const badToken of ["x", "a".repeat(200)]) {
      const req = buildRequest();
      (req.headers as Record<string, string>)["x-internal-token"] = badToken;
      const { res, statusMock } = buildResponse();
      await expect(modelSuggestHandler(req, res)).resolves.toBeUndefined();
      expect(statusMock).toHaveBeenCalledWith(401);
      vi.clearAllMocks();
      vi.mocked(getModelsByTypeAsync).mockResolvedValue(MOCK_MODELS as never);
    }
  });

  it("returns false (401) when ENV.webGatewayToken is empty string", async () => {
    const envMock = ENV as unknown as Record<string, string>;
    const saved = envMock.webGatewayToken;
    envMock.webGatewayToken = "";
    try {
      const req = buildRequest();
      const { res, statusMock } = buildResponse();
      await modelSuggestHandler(req, res);
      expect(statusMock).toHaveBeenCalledWith(401);
    } finally {
      envMock.webGatewayToken = saved;
    }
  });
});

describe("creditCostToTier", () => {
  it("maps creditCost <= 5 to 'low'", () => {
    expect(creditCostToTier(1)).toBe("low");
    expect(creditCostToTier(5)).toBe("low");
  });

  it("maps creditCost <= 20 to 'medium'", () => {
    expect(creditCostToTier(6)).toBe("medium");
    expect(creditCostToTier(20)).toBe("medium");
  });

  it("maps creditCost > 20 to 'high'", () => {
    expect(creditCostToTier(21)).toBe("high");
    expect(creditCostToTier(100)).toBe("high");
  });
});
