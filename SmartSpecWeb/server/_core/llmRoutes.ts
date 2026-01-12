import type { Express, Request, Response } from "express";
import { ENV } from "./env";
import { authorizeRequest, AuthResult } from "./authz";
import { enforceJsonBodyMaxBytes, rateLimit } from "./limits";
import { getUserByOpenId, getDb } from "../db";
import {
  getCreditBalance,
  getCreditBalanceByOpenId,
  hasEnoughCredits,
  deductCredits,
  calculateCreditsFromCost,
} from "../services/creditService";

const MAX_LLM_BODY_BYTES = parseInt(process.env.WEB_LLM_MAX_BODY_BYTES || "2097152"); // 2MB
const LLM_RPM = parseInt(process.env.WEB_LLM_RPM || "120");

// Minimum credits required to make an LLM request
const MIN_CREDITS_REQUIRED = parseInt(process.env.WEB_LLM_MIN_CREDITS || "1");

// Credit cost per 1K tokens (can be configured per model)
const CREDIT_COST_PER_1K_TOKENS = parseFloat(process.env.WEB_LLM_CREDIT_PER_1K_TOKENS || "0.1");

// Whether to skip credit check for static tokens (server-to-server)
const SKIP_CREDIT_CHECK_FOR_STATIC = process.env.WEB_LLM_SKIP_CREDIT_FOR_STATIC === "true";

interface LLMUsageInfo {
  userId: number | null;
  openId: string | null;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

function assertLlmConfig() {
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
    throw new Error(
      "LLM upstream missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }
}

function resolveChatUrl(): string {
  const base = ENV.forgeApiUrl.replace(/\/+$/, "");
  return `${base}/v1/chat/completions`;
}

function upstreamHeaders() {
  return {
    Authorization: `Bearer ${ENV.forgeApiKey}`,
    "Content-Type": "application/json",
  };
}

/**
 * Extract user ID from auth result
 */
async function getUserIdFromAuth(auth: AuthResult & { ok: true }): Promise<number | null> {
  // For session auth, user object contains id
  if (auth.mode === "session" && auth.user?.id) {
    return auth.user.id;
  }

  // For bearer auth with openId (sub), look up user
  if (auth.sub && auth.sub !== "static") {
    const user = await getUserByOpenId(auth.sub);
    return user?.id ?? null;
  }

  return null;
}

/**
 * Check if user has enough credits for LLM request
 */
async function checkCredits(
  auth: AuthResult & { ok: true },
  res: Response
): Promise<{ ok: true; userId: number } | { ok: false }> {
  // Skip credit check for static tokens if configured
  if (auth.mode === "bearer" && auth.sub === "static" && SKIP_CREDIT_CHECK_FOR_STATIC) {
    return { ok: true, userId: 0 }; // userId 0 means no credit tracking
  }

  const userId = await getUserIdFromAuth(auth);
  if (!userId) {
    res.status(403).json({
      error: {
        message: "User not found. Please ensure you are logged in.",
        code: "user_not_found",
      },
    });
    return { ok: false };
  }

  const hasCredits = await hasEnoughCredits(userId, MIN_CREDITS_REQUIRED);
  if (!hasCredits) {
    res.status(402).json({
      error: {
        message: "Insufficient credits. Please purchase more credits to continue.",
        code: "insufficient_credits",
      },
    });
    return { ok: false };
  }

  return { ok: true, userId };
}

/**
 * Deduct credits after successful LLM call
 */
async function deductCreditsForUsage(
  userId: number,
  usage: LLMUsageInfo
): Promise<void> {
  if (userId === 0) return; // Skip for static tokens

  // Calculate credits based on token usage
  // Using a simple formula: 1 credit per 1000 tokens (configurable)
  const totalTokens = usage.totalTokens || (usage.promptTokens + usage.completionTokens);
  const creditsToDeduct = Math.max(1, Math.ceil(totalTokens * CREDIT_COST_PER_1K_TOKENS / 1000));

  try {
    await deductCredits({
      userId,
      amount: creditsToDeduct,
      description: `LLM usage: ${usage.model}`,
      metadata: {
        model: usage.model,
        provider: "forge",
        tokensUsed: totalTokens,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        endpoint: "/v1/chat/completions",
      },
    });
  } catch (error) {
    // Log error but don't fail the request - credits were already checked
    console.error("[LLM] Failed to deduct credits:", error);
  }
}

/**
 * Parse usage info from OpenAI-compatible response
 */
function parseUsageFromResponse(data: any, model: string): LLMUsageInfo {
  const usage = data?.usage || {};
  return {
    userId: null,
    openId: null,
    model: data?.model || model || "unknown",
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: usage.completion_tokens || 0,
    totalTokens: usage.total_tokens || 0,
  };
}

/**
 * Proxy chat request with credit tracking
 */
async function proxyChatWithCredits(
  req: Request,
  res: Response,
  mode: "stream" | "json",
  userId: number
) {
  assertLlmConfig();
  const url = resolveChatUrl();
  const model = req.body?.model || "gpt-4.1-mini";

  const controller = new AbortController();
  req.on("close", () => controller.abort());

  const stream = mode === "stream";
  const upstream = await fetch(url, {
    method: "POST",
    headers: upstreamHeaders(),
    body: JSON.stringify({ ...req.body, stream }),
    signal: controller.signal,
  });

  if (!upstream.ok) {
    const message = await upstream.text().catch(() => upstream.statusText);
    res.status(upstream.status || 500).json({ error: { message } });
    return;
  }

  if (!stream) {
    // Non-streaming: parse response, deduct credits, return
    const text = await upstream.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = {};
    }

    // Deduct credits based on usage
    const usage = parseUsageFromResponse(data, model);
    await deductCreditsForUsage(userId, usage);

    // Add credit info to response (optional, for client awareness)
    if (userId > 0) {
      const balance = await getCreditBalance(userId);
      if (data && typeof data === "object") {
        data._credits = {
          used: Math.max(1, Math.ceil((usage.totalTokens * CREDIT_COST_PER_1K_TOKENS) / 1000)),
          remaining: balance?.credits ?? 0,
        };
      }
    }

    res.status(upstream.status);
    res.type("application/json");
    res.send(JSON.stringify(data));
    return;
  }

  // Streaming mode
  if (!upstream.body) {
    res.status(500).json({ error: { message: "Upstream stream body missing" } });
    return;
  }

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  const reader = upstream.body.getReader();
  let totalChunks = 0;
  let accumulatedData = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        const chunk = Buffer.from(value);
        res.write(chunk);
        totalChunks++;

        // Accumulate data to parse usage at the end
        accumulatedData += chunk.toString();
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {}

    // Try to extract usage from the last SSE message
    // OpenAI sends usage in the final message with [DONE]
    let estimatedTokens = 0;
    try {
      // Look for usage in accumulated data
      const usageMatch = accumulatedData.match(/"usage"\s*:\s*(\{[^}]+\})/);
      if (usageMatch) {
        const usage = JSON.parse(usageMatch[1]);
        estimatedTokens = usage.total_tokens || 0;
      } else {
        // Estimate based on chunks (rough approximation)
        estimatedTokens = Math.max(100, totalChunks * 10);
      }
    } catch {
      estimatedTokens = Math.max(100, totalChunks * 10);
    }

    // Deduct credits for streaming
    await deductCreditsForUsage(userId, {
      userId,
      openId: null,
      model,
      promptTokens: 0,
      completionTokens: estimatedTokens,
      totalTokens: estimatedTokens,
    });

    res.end();
  }
}

function unauthorized(res: Response) {
  res.status(401).json({ error: { message: "Unauthorized" } });
}

function insufficientCredits(res: Response) {
  res.status(402).json({
    error: {
      message: "Insufficient credits. Please purchase more credits to continue.",
      code: "insufficient_credits",
    },
  });
}

export function registerLLMRoutes(app: Express) {
  // Initialize database connection
  getDb().catch((err) => console.warn("[LLM] Database init warning:", err));

  const guardWithCredits = async (
    req: Request,
    res: Response
  ): Promise<{ ok: true; userId: number } | { ok: false }> => {
    const auth = await authorizeRequest(req, { allowBearer: true, allowSession: true });
    if (!auth.ok) {
      unauthorized(res);
      return { ok: false };
    }

    // Check credits
    return checkCredits(auth, res);
  };

  const llmLimiter = rateLimit("llm", { rpm: LLM_RPM });

  // OpenAI-compatible gateway endpoints for LLM proxy callers.
  app.post(
    "/v1/chat/completions",
    llmLimiter,
    enforceJsonBodyMaxBytes(MAX_LLM_BODY_BYTES),
    async (req: Request, res: Response) => {
      const check = await guardWithCredits(req, res);
      if (!check.ok) return;

      const stream = Boolean(req.body?.stream);
      try {
        await proxyChatWithCredits(req, res, stream ? "stream" : "json", check.userId);
      } catch (err: any) {
        res.status(500).json({ error: { message: err?.message || "LLM error" } });
      }
    }
  );

  // Minimal models endpoint (optional but helps OpenAI-compatible clients)
  app.get("/v1/models", llmLimiter, async (req: Request, res: Response) => {
    const auth = await authorizeRequest(req, { allowBearer: true, allowSession: true });
    if (!auth.ok) {
      unauthorized(res);
      return;
    }
    res.json({
      object: "list",
      data: [
        { id: "gpt-4.1-mini", object: "model" },
        { id: "gpt-4o-mini", object: "model" },
        { id: "gemini-2.5-flash", object: "model" },
      ],
    });
  });

  // Credit balance endpoint for LLM clients
  app.get("/v1/credits", llmLimiter, async (req: Request, res: Response) => {
    const auth = await authorizeRequest(req, { allowBearer: true, allowSession: true });
    if (!auth.ok) {
      unauthorized(res);
      return;
    }

    const userId = await getUserIdFromAuth(auth);
    if (!userId) {
      res.status(404).json({ error: { message: "User not found" } });
      return;
    }

    const balance = await getCreditBalance(userId);
    res.json({
      credits: balance?.credits ?? 0,
      plan: balance?.plan ?? "free",
    });
  });

  // UI-friendly REST wrappers (same auth rules)
  app.post(
    "/api/llm/chat",
    llmLimiter,
    enforceJsonBodyMaxBytes(MAX_LLM_BODY_BYTES),
    async (req: Request, res: Response) => {
      const check = await guardWithCredits(req, res);
      if (!check.ok) return;

      try {
        await proxyChatWithCredits(req, res, "json", check.userId);
      } catch (err: any) {
        res.status(500).json({ error: { message: err?.message || "LLM error" } });
      }
    }
  );

  app.post(
    "/api/llm/stream",
    llmLimiter,
    enforceJsonBodyMaxBytes(MAX_LLM_BODY_BYTES),
    async (req: Request, res: Response) => {
      const check = await guardWithCredits(req, res);
      if (!check.ok) return;

      try {
        await proxyChatWithCredits(req, res, "stream", check.userId);
      } catch (err: any) {
        // Best-effort SSE error
        res.status(200);
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.write(`event: error\n`);
        res.write(
          `data: ${JSON.stringify({ message: err?.message || "Stream error" })}\n\n`
        );
        res.write(`data: [DONE]\n\n`);
        res.end();
      }
    }
  );
}
