import type { Express, Request, Response } from "express";
import { decrypt } from "../services/crypto";
import { ENV } from "./env";
import { authorizeRequest, AuthResult } from "./authz";
import { enforceJsonBodyMaxBytes, rateLimit } from "./limits";
import { getUserByOpenId, getDb, db } from "../db";
import { llmProviders } from "../../drizzle/schema";
import { eq, asc } from "drizzle-orm";
import {
  getCreditBalance,
  getCreditBalanceByOpenId,
  hasEnoughCredits,
  deductCredits,
  calculateCreditsFromCost,
} from "../services/creditService";
import { debugLog, debugError } from "./logger";



// Cached provider config (refreshed periodically)
interface LlmProviderConfig {
  providerName: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string | null;
}

let cachedProvider: LlmProviderConfig | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60000; // Refresh every 60 seconds

/**
 * Get the active LLM provider configuration from database
 */
async function getActiveLlmProvider(): Promise<LlmProviderConfig | null> {
  const now = Date.now();

  // Return cached config if still valid
  if (cachedProvider && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedProvider;
  }

  try {
    // Get the first enabled provider with an API key
    const [provider] = await db
      .select({
        providerName: llmProviders.providerName,
        baseUrl: llmProviders.baseUrl,
        apiKeyEncrypted: llmProviders.apiKeyEncrypted,
        defaultModel: llmProviders.defaultModel,
      })
      .from(llmProviders)
      .where(eq(llmProviders.isEnabled, true))
      .orderBy(asc(llmProviders.sortOrder))
      .limit(1);

    if (!provider || !provider.apiKeyEncrypted || !provider.baseUrl) {
      cachedProvider = null;
      cacheTimestamp = now;
      return null;
    }

    const apiKey = decrypt(provider.apiKeyEncrypted);
    if (!apiKey) {
      console.warn("[LLM] Failed to decrypt API key for provider:", provider.providerName);
      cachedProvider = null;
      cacheTimestamp = now;
      return null;
    }

    cachedProvider = {
      providerName: provider.providerName,
      baseUrl: provider.baseUrl,
      apiKey,
      defaultModel: provider.defaultModel,
    };
    cacheTimestamp = now;

    return cachedProvider;
  } catch (error) {
    console.error("[LLM] Failed to get provider config from database:", error);
    return null;
  }
}

const MAX_LLM_BODY_BYTES = parseInt(process.env.WEB_LLM_MAX_BODY_BYTES || "2097152"); // 2MB
const LLM_RPM = parseInt(process.env.WEB_LLM_RPM || "120");

// Minimum credits required to make an LLM request
const MIN_CREDITS_REQUIRED = parseInt(process.env.WEB_LLM_MIN_CREDITS || "1");

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

function resolveChatUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  // Handle different provider URL patterns
  if (base.includes("/v1")) {
    return `${base}/chat/completions`;
  }
  return `${base}/v1/chat/completions`;
}

function upstreamHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
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
 * Uses actual LLM cost to calculate credits (1 credit = $0.001 USD)
 */
async function deductCreditsForUsage(
  userId: number,
  usage: LLMUsageInfo
): Promise<void> {
  if (userId === 0) return; // Skip for static tokens

  // Import the cost-based calculation
  const { calculateCreditsForLLM, calculateLLMCostUsd } = await import("../services/creditService");

  // Calculate based on actual LLM cost
  const costUsd = calculateLLMCostUsd(usage.promptTokens, usage.completionTokens, usage.model);
  const creditsToDeduct = calculateCreditsForLLM(usage.promptTokens, usage.completionTokens, usage.model);

  try {
    await deductCredits({
      userId,
      amount: creditsToDeduct,
      description: `LLM usage: ${usage.model}`,
      metadata: {
        model: usage.model,
        provider: cachedProvider?.providerName || "unknown",
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
        costUsd: costUsd.toFixed(6),
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
 * If conversationId is provided for streaming, saves the assistant message at the end
 */
async function proxyChatWithCredits(
  req: Request,
  res: Response,
  mode: "stream" | "json",
  userId: number,
  conversationId?: number,
  skillUsed?: string
) {
  debugLog("LLM", "proxyChatWithCredits called", { mode, userId, conversationId, skillUsed });

  // Get LLM provider config from database
  const provider = await getActiveLlmProvider();
  debugLog("LLM", "Provider config", provider ? { name: provider.providerName, baseUrl: provider.baseUrl, hasKey: !!provider.apiKey } : null);

  if (!provider) {
    throw new Error(
      "No LLM provider configured. Please add and enable an LLM provider with API key in the admin settings."
    );
  }

  const url = resolveChatUrl(provider.baseUrl);
  const model = req.body?.model || provider.defaultModel || "gpt-4o-mini";
  debugLog("LLM", "Request details", { url, model });

  const controller = new AbortController();
  req.on("close", () => controller.abort());

  const stream = mode === "stream";
  const upstream = await fetch(url, {
    method: "POST",
    headers: upstreamHeaders(provider.apiKey),
    body: JSON.stringify({ ...req.body, stream }),
    signal: controller.signal,
  });

  debugLog("LLM", "Upstream response", { status: upstream.status, statusText: upstream.statusText });

  if (!upstream.ok) {
    const message = await upstream.text().catch(() => upstream.statusText);
    debugLog("LLM", "Upstream error", message);
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
      const { calculateCreditsForLLM } = await import("../services/creditService");
      const balance = await getCreditBalance(userId);
      if (data && typeof data === "object") {
        data._credits = {
          used: calculateCreditsForLLM(usage.promptTokens, usage.completionTokens, usage.model),
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
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");

  const reader = upstream.body.getReader();
  let totalChunks = 0;
  let accumulatedData = "";
  let fullContent = ""; // Accumulate the actual content for saving

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        const chunk = Buffer.from(value);
        res.write(chunk);
        totalChunks++;

        // Accumulate data to parse usage at the end
        const chunkStr = chunk.toString();
        accumulatedData += chunkStr;

        // Extract content from SSE data for saving
        const lines = chunkStr.split("\n");
        for (const line of lines) {
          if (line.startsWith("data:")) {
            const data = line.slice("data:".length).trim();
            if (data && data !== "[DONE]") {
              try {
                const j = JSON.parse(data);
                const delta = j?.choices?.[0]?.delta?.content;
                if (typeof delta === "string") {
                  fullContent += delta;
                }
              } catch {
                // Not JSON, ignore
              }
            }
          }
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {}

    // Try to extract usage from the last SSE message
    // OpenAI sends usage in the final message with [DONE]
    let inputTokens = 0;
    let outputTokens = 0;
    try {
      // Look for usage in accumulated data
      const usageMatch = accumulatedData.match(/"usage"\s*:\s*(\{[^}]+\})/);
      if (usageMatch) {
        const usage = JSON.parse(usageMatch[1]);
        inputTokens = usage.prompt_tokens || 0;
        outputTokens = usage.completion_tokens || usage.total_tokens || 0;
      } else {
        // Estimate based on chunks (rough approximation)
        outputTokens = Math.max(100, totalChunks * 10);
      }
    } catch {
      outputTokens = Math.max(100, totalChunks * 10);
    }

    // Deduct credits for streaming
    await deductCreditsForUsage(userId, {
      userId,
      openId: null,
      model,
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
    });

    // If conversationId provided, save the assistant message and send final event
    if (conversationId && fullContent) {
      try {
        const { createMessage, getConversationById, updateConversationCredits } = await import("../services/chatService");
        const { calculateCreditsForLLM } = await import("../services/creditService");

        // Verify conversation ownership
        const conversation = await getConversationById(conversationId, userId);
        if (conversation) {
          // Calculate credits based on actual LLM cost (pass model for accurate pricing)
          const creditsUsed = calculateCreditsForLLM(inputTokens, outputTokens, model);
          if (creditsUsed > 0) {
            await updateConversationCredits(conversationId, creditsUsed);
          }

          const message = await createMessage({
            conversationId,
            role: "assistant",
            content: fullContent,
            inputTokens,
            outputTokens,
            creditsUsed: creditsUsed.toString(),
            modelUsed: model || conversation.model || undefined,
            skillUsed,
          });

          debugLog("LLM", "Message saved after streaming", { messageId: message.id, creditsUsed });

          // Send final event with saved message info
          res.write(`event: message_saved\n`);
          res.write(`data: ${JSON.stringify({ id: message.id, creditsUsed, inputTokens, outputTokens })}\n\n`);
        } else {
          debugLog("LLM", "Conversation not found for saving", { conversationId, userId });
        }
      } catch (saveError: any) {
        debugError("LLM", "Failed to save message after streaming", saveError);
        // Send error event but don't fail the stream
        res.write(`event: save_error\n`);
        res.write(`data: ${JSON.stringify({ error: saveError?.message || "Failed to save message" })}\n\n`);
      }
    }

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

  // Models endpoint - returns models from enabled providers in database
  app.get("/v1/models", llmLimiter, async (req: Request, res: Response) => {
    const auth = await authorizeRequest(req, { allowBearer: true, allowSession: true });
    if (!auth.ok) {
      unauthorized(res);
      return;
    }

    try {
      // Fetch enabled providers with their models from database
      const providers = await db
        .select({
          providerName: llmProviders.providerName,
          availableModels: llmProviders.availableModels,
          defaultModel: llmProviders.defaultModel,
        })
        .from(llmProviders)
        .where(eq(llmProviders.isEnabled, true))
        .orderBy(asc(llmProviders.sortOrder));

      const models: Array<{ id: string; object: string; owned_by?: string }> = [];

      for (const provider of providers) {
        const providerModels = (provider.availableModels as Array<{ id: string; name: string }>) || [];
        for (const model of providerModels) {
          models.push({
            id: model.id,
            object: "model",
            owned_by: provider.providerName,
          });
        }
      }

      // If no models configured, return a sensible default
      if (models.length === 0) {
        models.push({ id: "gpt-4o-mini", object: "model" });
      }

      res.json({
        object: "list",
        data: models,
      });
    } catch (error) {
      console.error("[LLM] Failed to fetch models:", error);
      // Fallback to default models
      res.json({
        object: "list",
        data: [{ id: "gpt-4o-mini", object: "model" }],
      });
    }
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

      // Extract conversationId and skillUsed from request body for server-side message saving
      const conversationId = req.body?.conversationId ? Number(req.body.conversationId) : undefined;
      const skillUsed = req.body?.skillUsed;

      debugLog("LLM", "Stream request", { conversationId, skillUsed, userId: check.userId });

      // Context7 integration: inject library docs when code-docs-assistant skill is active
      if (skillUsed === "code-docs-assistant" && Array.isArray(req.body?.messages)) {
        try {
          const { fetchDocsForMessage } = await import("../services/context7");

          // Fetch user's personal Context7 API key from DB
          let userContext7Key: string | undefined;
          try {
            const { getDb } = await import("../db");
            const { systemSettings: sysSettings } = await import("../../drizzle/schema");
            const { eq: eqOp, and: andOp } = await import("drizzle-orm");
            const dbInst = await getDb();
            if (dbInst && check.userId) {
              const [row] = await dbInst
                .select()
                .from(sysSettings)
                .where(andOp(
                  eqOp(sysSettings.category, "context7"),
                  eqOp(sysSettings.key, `api_key_user_${check.userId}`)
                ))
                .limit(1);
              if (row?.value) {
                // Decrypt the stored key
                const { decrypt } = await import("../services/crypto");
                const decrypted = decrypt(row.value);
                userContext7Key = decrypted || undefined;
              }
            }
          } catch { /* use env fallback */ }

          const lastUserMsg = [...req.body.messages].reverse().find((m: any) => m.role === "user");
          if (lastUserMsg?.content) {
            const result = await fetchDocsForMessage(lastUserMsg.content, userContext7Key);
            if (result?.docs) {
              // Inject docs as a system message right before the last user message
              const docsMessage = {
                role: "system",
                content: `## Reference Documentation for ${result.libraryName} (from Context7)\n\nUse the following up-to-date documentation to answer the user's question accurately:\n\n${result.docs}`,
              };
              // Insert after the first system message but before user messages
              const firstNonSystem = req.body.messages.findIndex((m: any) => m.role !== "system");
              if (firstNonSystem > 0) {
                req.body.messages.splice(firstNonSystem, 0, docsMessage);
              } else {
                req.body.messages.unshift(docsMessage);
              }
              debugLog("LLM", `Context7: injected ${result.docs.length} chars of ${result.libraryName} docs`);
            }
          }
        } catch (err: any) {
          debugLog("LLM", "Context7 injection failed (non-fatal)", err?.message);
        }
      }

      try {
        await proxyChatWithCredits(req, res, "stream", check.userId, conversationId, skillUsed);
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

  // Test endpoint for debugging
  app.get("/api/chat/test", (_req: Request, res: Response) => {
    debugLog("Chat API", "test endpoint hit");
    res.json({ ok: true, timestamp: Date.now() });
  });

  // ALTERNATIVE: Save endpoint under /api/llm/ namespace (which we know works)
  app.post(
    "/api/llm/save-message",
    async (req: Request, res: Response) => {
      debugLog("LLM API", "=== SAVE-MESSAGE HANDLER START ===");
      debugLog("LLM API", "save-message endpoint hit", req.body);

      const auth = await authorizeRequest(req, { allowBearer: true, allowSession: true });
      if (!auth.ok) {
        return res.status(401).json({ error: { message: "Unauthorized" } });
      }

      const userId = await getUserIdFromAuth(auth);
      debugLog("LLM API", "Auth result", {
        mode: auth.mode,
        sub: auth.sub,
        hasUser: !!(auth as any).user,
        userId,
        userFromAuth: (auth as any).user?.id
      });

      if (!userId) {
        debugLog("LLM API", "No userId from auth");
        return res.status(403).json({ error: { message: "User not found" } });
      }

      try {
        const { conversationId: rawConversationId, content, inputTokens, outputTokens, modelUsed, skillUsed } = req.body;
        if (!rawConversationId || !content) {
          return res.status(400).json({ error: { message: "conversationId and content are required" } });
        }

        // Ensure conversationId is a number (in case it's passed as a string)
        const conversationId = typeof rawConversationId === 'string' ? parseInt(rawConversationId, 10) : rawConversationId;
        if (isNaN(conversationId)) {
          debugLog("LLM API", "Invalid conversationId", { rawConversationId });
          return res.status(400).json({ error: { message: "Invalid conversationId" } });
        }

        const { createMessage, getConversationById, updateConversationCredits } = await import("../services/chatService");
        const { calculateCreditsForLLM } = await import("../services/creditService");

        debugLog("LLM API", "Looking up conversation", {
          conversationId,
          conversationIdType: typeof conversationId,
          userId,
          userIdType: typeof userId
        });

        // First, try to get conversation with user ownership check
        let conversation = await getConversationById(conversationId, userId);
        debugLog("LLM API", "Conversation lookup result", { found: !!conversation, conversationId, userId });

        if (!conversation) {
          return res.status(404).json({ error: { message: "Conversation not found" } });
        }

        const effectiveModel = modelUsed || conversation.model || "gpt-4o-mini";
        const creditsUsed = calculateCreditsForLLM(inputTokens || 0, outputTokens || 0, effectiveModel);
        if (creditsUsed > 0) {
          await updateConversationCredits(conversationId, creditsUsed);
        }

        const message = await createMessage({
          conversationId,
          role: "assistant",
          content,
          inputTokens: inputTokens || 0,
          outputTokens: outputTokens || 0,
          creditsUsed: creditsUsed.toString(),
          modelUsed: effectiveModel,
          skillUsed,
        });

        debugLog("LLM API", "Message saved", { messageId: message.id });
        res.json({ id: message.id, creditsUsed });
      } catch (err: any) {
        debugError("LLM API", "Save failed", err);
        res.status(500).json({ error: { message: err?.message || "Failed to save message" } });
      }
    }
  );

  // REST endpoint for saving assistant messages (bypasses tRPC)
  // NOTE: No rate limiter here - this is called after streaming completes
  app.post(
    "/api/chat/save-assistant",
    async (req: Request, res: Response) => {
      debugLog("Chat API", "=== SAVE-ASSISTANT HANDLER START ===");
      debugLog("Chat API", "save-assistant endpoint hit", {
        hasBody: !!req.body,
        bodyKeys: req.body ? Object.keys(req.body) : [],
        contentType: req.headers["content-type"],
      });
      debugLog("Chat API", "save-assistant body", req.body);

      const auth = await authorizeRequest(req, { allowBearer: true, allowSession: true });
      if (!auth.ok) {
        debugLog("Chat API", "Unauthorized");
        return res.status(401).json({ error: { message: "Unauthorized" } });
      }

      const userId = await getUserIdFromAuth(auth);
      if (!userId) {
        debugLog("Chat API", "User not found");
        return res.status(403).json({ error: { message: "User not found" } });
      }

      try {
        const { conversationId, content, inputTokens, outputTokens, modelUsed, skillUsed } = req.body;

        // Validate required fields
        if (!conversationId) {
          debugLog("Chat API", "Missing conversationId");
          return res.status(400).json({ error: { message: "conversationId is required" } });
        }
        if (!content) {
          debugLog("Chat API", "Missing content");
          return res.status(400).json({ error: { message: "content is required" } });
        }

        debugLog("Chat API", "Saving message", { conversationId, contentLength: content?.length, userId });

        // Dynamic import to avoid circular dependencies
        const { createMessage, getConversationById, updateConversationCredits } = await import("../services/chatService");
        const { calculateCreditsForLLM } = await import("../services/creditService");

        // Verify conversation ownership
        const conversation = await getConversationById(conversationId, userId);
        if (!conversation) {
          debugLog("Chat API", "Conversation not found");
          return res.status(404).json({ error: { message: "Conversation not found" } });
        }

        // Calculate credits for tracking (use actual model for accurate cost)
        const effectiveModel = modelUsed || conversation.model || "gpt-4o-mini";
        const creditsUsed = calculateCreditsForLLM(inputTokens || 0, outputTokens || 0, effectiveModel);

        // Update conversation credits tracking
        if (creditsUsed > 0) {
          await updateConversationCredits(conversationId, creditsUsed);
        }

        // Create assistant message
        const message = await createMessage({
          conversationId,
          role: "assistant",
          content,
          inputTokens: inputTokens || 0,
          outputTokens: outputTokens || 0,
          creditsUsed: creditsUsed.toString(),
          modelUsed: effectiveModel,
          skillUsed,
        });

        debugLog("Chat API", "Message saved", { messageId: message.id, creditsUsed });

        res.json({
          id: message.id,
          creditsUsed,
        });
      } catch (err: any) {
        debugError("Chat API", "Save failed", err);
        res.status(500).json({ error: { message: err?.message || "Failed to save message" } });
      }
    }
  );
}
