import crypto from "node:crypto";
import type { Express, Request, Response } from "express";

import { ENV } from "../_core/env";
import { debugError } from "../_core/logger";
import { getModelsByTypeAsync } from "../services/modelRegistry";
import type { MediaType } from "../services/modelRegistry";
import { contentAutomationGate } from "../middleware/contentAutomationGate";
import { ModelSuggestRequestSchema } from "@shared/contentAutomation/types";

export function creditCostToTier(creditCost: number): "low" | "medium" | "high" {
  if (creditCost <= 5) return "low";
  if (creditCost <= 20) return "medium";
  return "high";
}

interface ModelEntry {
  model_id: string;
  name: string;
  provider: string;
  cost_tier: "low" | "medium" | "high";
  description: string;
}

interface SuggestResult {
  recommended: ModelEntry | null;
  alternatives: ModelEntry[];
  message?: string;
}

export async function suggestModel(
  purpose: "image" | "video" | "audio" | "text",
  quality_preference?: "speed" | "balanced" | "quality",
): Promise<SuggestResult> {
  if (purpose === "text") {
    return {
      recommended: null,
      alternatives: [],
      message: "Text model selection is handled by the LLM router. Use the default model.",
    };
  }

  try {
    const models = await getModelsByTypeAsync(purpose as MediaType);

    if (models.length === 0) {
      return { recommended: null, alternatives: [] };
    }

    const sorted = [...models].sort((a, b) => {
      if (quality_preference === "speed") {
        return (a.creditCost ?? 0) - (b.creditCost ?? 0);
      }
      // "quality", "balanced", or omitted: sort by priority (lower = higher priority)
      return (a.priority ?? 99) - (b.priority ?? 99);
    });

    const toEntry = (m: (typeof sorted)[number]): ModelEntry => ({
      model_id: m.id,
      name: m.name,
      provider: m.provider,
      cost_tier: creditCostToTier(m.creditCost),
      description: m.description ?? "",
    });

    const [top, ...rest] = sorted;
    return {
      recommended: toEntry(top),
      alternatives: rest.slice(0, 3).map(toEntry),
    };
  } catch (err) {
    debugError("[suggestModel] model registry lookup failed", err);
    return { recommended: null, alternatives: [] };
  }
}

function verifyInternalToken(req: Request): boolean {
  const expected = ENV.webGatewayToken;
  if (!expected) return false;
  const token = req.headers["x-internal-token"] as string | undefined;
  if (!token) return false;
  // Hash both values with SHA-256 to ensure equal-length 32-byte buffers.
  // This prevents a length oracle attack where timingSafeEqual throws
  // RangeError on length mismatch, leaking the expected token's length.
  const tokenHash = crypto.createHash("sha256").update(token).digest();
  const expectedHash = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(tokenHash, expectedHash);
}

export async function modelSuggestHandler(req: Request, res: Response): Promise<void> {
  // 1. Authenticate via X-Internal-Token
  if (!verifyInternalToken(req)) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  // 2. Validate request body
  const parseResult = ModelSuggestRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: "Invalid request body",
      details: parseResult.error.flatten(),
    });
    return;
  }

  const { purpose, quality_preference } = parseResult.data;
  const result = await suggestModel(purpose, quality_preference);
  res.json({ success: true, ...result });
}

export function registerModelSuggestToolRoute(app: Express): void {
  app.post("/api/internal/tools/model-suggest", contentAutomationGate, modelSuggestHandler);
}
