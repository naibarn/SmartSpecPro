import crypto from "node:crypto";
import type { Express, Request, Response } from "express";

import { ENV } from "../_core/env";
import { getModelsByTypeAsync } from "../services/modelRegistry";
import type { MediaType } from "../services/modelRegistry";
import { contentAutomationGate } from "../middleware/contentAutomationGate";
import { ModelSuggestRequestSchema } from "@shared/contentAutomation/types";

export function creditCostToTier(creditCost: number): "low" | "medium" | "high" {
  if (creditCost <= 5) return "low";
  if (creditCost <= 20) return "medium";
  return "high";
}

function verifyInternalToken(req: Request): boolean {
  const expected = ENV.webGatewayToken;
  if (!expected) return false;
  const token = req.headers["x-internal-token"] as string | undefined;
  if (!token) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
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

  // 3. Handle "text" purpose — not in media model registry
  if (purpose === "text") {
    res.json({
      success: true,
      recommended: null,
      alternatives: [],
      message: "Text model selection is handled by the LLM router. Use the default model.",
    });
    return;
  }

  // 4. Fetch models by type
  const models = await getModelsByTypeAsync(purpose as MediaType);

  if (models.length === 0) {
    res.json({
      success: true,
      recommended: null,
      alternatives: [],
      message: `No models available for purpose: ${purpose}`,
    });
    return;
  }

  // 5. Rank models by quality_preference
  const sorted = [...models].sort((a, b) => {
    if (quality_preference === "speed") {
      // Lower creditCost = faster/cheaper
      return (a.creditCost ?? 0) - (b.creditCost ?? 0);
    }
    // "quality" and "balanced": sort by priority (lower = higher priority)
    return (a.priority ?? 0) - (b.priority ?? 0);
  });

  // 6. Build response (no raw creditCost exposed)
  const toEntry = (m: typeof sorted[number]) => ({
    model_id: m.id,
    name: m.name,
    provider: m.provider,
    cost_tier: creditCostToTier(m.creditCost),
    description: m.description ?? "",
  });

  const [top, ...rest] = sorted;
  const alternatives = rest.slice(0, 3).map(toEntry);

  res.json({
    success: true,
    recommended: toEntry(top),
    alternatives,
  });
}

export function registerModelSuggestToolRoute(app: Express): void {
  app.post("/api/internal/tools/model-suggest", contentAutomationGate, modelSuggestHandler);
}
