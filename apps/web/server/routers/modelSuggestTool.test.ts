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

import { modelSuggestHandler, creditCostToTier } from "./modelSuggestTool";
import { getModelsByTypeAsync } from "../services/modelRegistry";
import { contentAutomationGate } from "../middleware/contentAutomationGate";

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
