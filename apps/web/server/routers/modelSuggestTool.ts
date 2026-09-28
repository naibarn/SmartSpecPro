import type { Express, Request, Response } from "express";

import { ENV } from "../_core/env";
import { debugError } from "../_core/logger";
import {
  filterModelsByMcpProviderAccess,
  getModelsByTypeAsync,
} from "../services/modelRegistry";
import type { MediaType } from "../services/modelRegistry";
import { listConnectedMcpProviderKeys } from "../services/mcpConnectionService";
import { contentAutomationGate } from "../middleware/contentAutomationGate";
import { ModelSuggestRequestSchema } from "@shared/contentAutomation/types";
import { auditLogger } from "../services/auditLogger";
import { getTraceId } from "../services/traceContext";
import { compareCachedInternalToken } from "../services/appRuntimeConfig";

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
  connectedMcpProviderKeys?: ReadonlySet<string>,
): Promise<SuggestResult> {
  if (purpose === "text") {
    return {
      recommended: null,
      alternatives: [],
      message: "Text model selection is handled by the LLM router. Use the default model.",
    };
  }

  try {
    const models = filterModelsByMcpProviderAccess(
      await getModelsByTypeAsync(purpose as MediaType),
      connectedMcpProviderKeys ?? new Set(),
    );

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
    debugError(
      "[suggestModel] model registry lookup failed",
      err instanceof Error ? err.message : String(err),
    );
    return { recommended: null, alternatives: [] };
  }
}

function verifyInternalToken(req: Request): boolean {
  const token = req.headers["x-internal-token"] as string | undefined;
  return compareCachedInternalToken(token) || (!!token && token === ENV.webGatewayToken);
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
  const requestBody = req.body as { userId?: number; tenantId?: string };
  const userId = requestBody.userId;
  const tenantId = requestBody.tenantId;

  // Safety net: suggestModel() resolves all errors internally
  let result: SuggestResult;
  try {
    const connectedMcpProviderKeys = userId !== undefined && tenantId
      ? await listConnectedMcpProviderKeys({ tenantId, userId })
      : new Set<string>();
    result = await suggestModel(purpose, quality_preference, connectedMcpProviderKeys);
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const sanitized = raw
      .replace(/[a-z][a-z0-9+\-.]*:\/\/[^\s]+/gi, "[redacted]")
      .slice(0, 200);
    res.status(500).json({ success: false, error: sanitized });
    return;
  }

  auditLogger.log({
    eventType: "model_suggest_response",
    traceId: getTraceId() ?? undefined,
    userId,
    metadata: {
      tenantId,
      purpose,
      recommendedModelId: result.recommended?.model_id ?? null,
      alternativeCount: result.alternatives.length,
    },
  });

  res.json({
    success: true,
    recommended: result.recommended,
    alternatives: result.alternatives,
    ...(result.message ? { message: result.message } : {}),
  });
}

export function registerModelSuggestToolRoute(app: Express): void {
  app.post("/api/internal/tools/model-suggest", contentAutomationGate, modelSuggestHandler);
}
