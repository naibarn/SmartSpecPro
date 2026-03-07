/**
 * Responses API Proxy — /v1/responses
 *
 * Proxies requests to OpenAI's Responses API (GPT-5.x with web_search & function tools).
 * Handles SSE streaming, tool-call loop for custom function tools, web_search cost tracking,
 * and per-request budget cap enforcement.
 *
 * Feature: 032-Browser-Automation-Copilot, Section 03
 */

import type { Express, Request, Response } from "express";
import { enforceJsonBodyMaxBytes, rateLimit } from "./limits";
import { debugLog, debugError } from "./logger";
import { auditLogger } from "../services/auditLogger";
import { getTraceId } from "../services/traceContext";
import { logRequest as logCostRequest } from "../services/costTracker";
import { getFeatureFlag, getTenantFeatureFlag } from "../services/featureFlags";
import {
  deductCreditsForModel,
  calculateCreditsForLLM,
  calculateCreditsFromCost,
  getCreditBalance,
  hasEnoughCredits,
} from "../services/creditService";
import { resolveApiUrl, type ApiStyle } from "./llmRoutes";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_TOOL_ROUNDS = 10;
const WEB_SEARCH_COST_USD = 0.01; // $0.01 per web_search call
const DEFAULT_MAX_BUDGET_CREDITS = 500;
const SOCKET_TIMEOUT_MS = 600_000; // 10 min

const MAX_LLM_BODY_BYTES = parseInt(
  process.env.WEB_LLM_MAX_BODY_BYTES || "2097152",
);
const LLM_RPM = parseInt(process.env.WEB_LLM_RPM || "120");

// Fields allowed to be forwarded to the OpenAI Responses API
const ALLOWED_FIELDS = new Set([
  "model",
  "input",
  "instructions",
  "tools",
  "tool_choice",
  "temperature",
  "top_p",
  "max_output_tokens",
  "store",
  "metadata",
  "stream",
  "previous_response_id",
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BudgetState {
  maxBudgetCredits: number;
  accumulatedCredits: number;
  currentRound: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  webSearchCalls: number;
}

interface ToolDispatchResult {
  callId: string;
  output: string;
}

interface SanitizeSuccess {
  ok: true;
  body: Record<string, unknown>;
  maxBudgetCredits: number;
  stream: boolean;
}

interface SanitizeError {
  ok: false;
  error: string;
  status: number;
}

type SanitizeResult = SanitizeSuccess | SanitizeError;

// ---------------------------------------------------------------------------
// Internal tool dispatch registry
// ---------------------------------------------------------------------------

const TOOL_DISPATCH_MAP: Record<string, string> = {
  "browser.execute_actions": "/api/internal/tools/browser",
  "sandbox.exec_command": "/api/internal/tools/sandbox",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sanitize and validate a Responses API request body.
 * Enforces store=false default, validates required fields, strips unknown fields.
 */
export function sanitizeResponsesBody(
  body: any,
  tenantStoreAllowed: boolean = false,
): SanitizeResult {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Request body must be a JSON object", status: 400 };
  }

  if (!body.model || typeof body.model !== "string") {
    return { ok: false, error: 'Missing required field: "model"', status: 400 };
  }

  if (!body.input || !Array.isArray(body.input)) {
    return { ok: false, error: 'Missing required field: "input" (must be an array)', status: 400 };
  }

  // Extract custom budget field before filtering
  const maxBudgetCredits =
    typeof body.max_budget_credits === "number" && body.max_budget_credits > 0
      ? body.max_budget_credits
      : DEFAULT_MAX_BUDGET_CREDITS;

  // Filter to allowed fields only
  const sanitized: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in body) {
      sanitized[key] = body[key];
    }
  }

  // Enforce store=false (ZDR compliance)
  if (sanitized.store === true && !tenantStoreAllowed) {
    sanitized.store = false;
  }
  if (sanitized.store === undefined) {
    sanitized.store = false;
  }

  const stream = Boolean(sanitized.stream);

  return { ok: true, body: sanitized, maxBudgetCredits, stream };
}

/**
 * Count web_search_call items in a Responses API output array.
 */
function countWebSearchCalls(output: unknown[]): number {
  if (!Array.isArray(output)) return 0;
  return output.filter(
    (item: any) => item?.type === "web_search_call",
  ).length;
}

/**
 * Extract function_call items from a Responses API output array.
 */
function extractFunctionCalls(
  output: unknown[],
): Array<{ id: string; callId: string; name: string; arguments: string }> {
  if (!Array.isArray(output)) return [];
  return output
    .filter((item: any) => item?.type === "function_call")
    .map((item: any) => ({
      id: item.id,
      callId: item.call_id || item.id,
      name: item.name,
      arguments: item.arguments || "{}",
    }));
}

/**
 * Parse usage from a Responses API response (JSON or SSE event).
 */
function parseResponsesUsage(data: any): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
} {
  const usage = data?.usage;
  if (!usage) return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  return {
    inputTokens: usage.input_tokens || 0,
    outputTokens: usage.output_tokens || 0,
    totalTokens: usage.total_tokens ?? (usage.input_tokens + usage.output_tokens) ?? 0,
  };
}

/**
 * Build upstream request headers for the provider.
 */
function buildHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

/**
 * Dispatch a function call to an internal tool handler.
 */
async function dispatchFunctionCall(
  toolName: string,
  args: string,
  internalToken: string,
  userId: number,
): Promise<string> {
  const route = TOOL_DISPATCH_MAP[toolName];
  if (!route) {
    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }

  const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
  try {
    const resp = await fetch(`${baseUrl}${route}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": internalToken,
        "X-User-Id": String(userId),
      },
      body: args,
      signal: AbortSignal.timeout(120_000), // 2 min per tool call
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => resp.statusText);
      return JSON.stringify({ error: `Tool call failed (${resp.status}): ${errText}` });
    }

    return await resp.text();
  } catch (err: any) {
    return JSON.stringify({ error: `Tool dispatch error: ${err?.message || "unknown"}` });
  }
}

/**
 * Estimate credits for a round based on average from previous rounds.
 */
function estimateNextRoundCredits(budget: BudgetState): number {
  if (budget.currentRound === 0) return 10; // Conservative default
  const avgPerRound = budget.accumulatedCredits / budget.currentRound;
  return Math.ceil(avgPerRound * 1.2); // 20% buffer
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Register the /v1/responses endpoint on the Express app.
 * Called from registerLLMRoutes() in llmRoutes.ts.
 */
export function registerResponsesRoutes(
  app: Express,
  deps: {
    guardWithCreditsOrInternalToken: (
      req: Request,
      res: Response,
    ) => Promise<
      { ok: true; userId: number; isInternal: boolean } | { ok: false }
    >;
    verifyInternalToken: (req: Request) => boolean;
    getActiveLlmProvider: () => Promise<any>;
    getLlmProviderById: (id: number) => Promise<any>;
    resolveProviderModelAny: (modelId: string) => Promise<any>;
    resolveProviderModel: (
      modelId: string,
      providerId: number,
    ) => Promise<any>;
    acquireProviderSlot: (
      providerName: string,
      isFreeModel?: boolean,
    ) => Promise<{ queuePosition: number }>;
    releaseProviderSlot: (providerName: string) => void;
    recordModelUsage: (
      providerName: string,
      modelId: string,
      success: boolean,
      inputTokens?: number,
      outputTokens?: number,
    ) => void;
  },
) {
  const llmLimiter = rateLimit("llm-responses", { rpm: LLM_RPM });

  app.post(
    "/v1/responses",
    // Skip IP rate limiter for internal token callers
    (req: Request, res: Response, next: Function) => {
      const isInternal = deps.verifyInternalToken(req);
      if (isInternal) {
        (res.locals as any).skipIpRateLimit = true;
        (res.locals as any).verifiedInternalToken = true;
      }
      next();
    },
    llmLimiter,
    enforceJsonBodyMaxBytes(MAX_LLM_BODY_BYTES),
    async (req: Request, res: Response) => {
      req.socket.setTimeout(SOCKET_TIMEOUT_MS);
      res.setTimeout(SOCKET_TIMEOUT_MS);

      const traceId = getTraceId();
      const startTime = Date.now();

      // --- Feature flag gating (fail-closed: deny on error) ---
      try {
        const globalEnabled = await getFeatureFlag("responsesApi");
        if (!globalEnabled) {
          return res
            .status(404)
            .json({ error: { message: "Not found" } });
        }
      } catch (err) {
        debugError("responses", "Feature flag check failed", err);
        return res
          .status(500)
          .json({ error: { message: "Feature flag service unavailable" } });
      }

      // --- Auth ---
      const check = await deps.guardWithCreditsOrInternalToken(req, res);
      if (!check.ok) return;

      const { userId, isInternal } = check;

      // Tenant ID: internal callers can specify via header; external callers use default
      const tenantId = isInternal
        ? (req.headers["x-tenant-id"] as string) || "default"
        : "default";
      try {
        const tenantEnabled = await getTenantFeatureFlag(
          "responsesApi",
          tenantId,
        );
        if (!tenantEnabled) {
          return res.status(403).json({
            error: {
              message: "Feature not enabled for this tenant",
            },
          });
        }
      } catch (err) {
        debugError("responses", "Tenant feature flag check failed", err);
        return res
          .status(500)
          .json({ error: { message: "Feature flag service unavailable" } });
      }

      // --- Sanitize body ---
      const sanitizeResult = sanitizeResponsesBody(req.body, false);
      if (!sanitizeResult.ok) {
        return res
          .status(sanitizeResult.status)
          .json({ error: { message: sanitizeResult.error } });
      }

      const { body: sanitizedBody, maxBudgetCredits, stream } =
        sanitizeResult;

      // --- Resolve provider & model ---
      const preferredProviderId = req.body?.preferredProvider;
      let provider: any = null;

      if (preferredProviderId != null) {
        provider = await deps.getLlmProviderById(preferredProviderId);
      }
      if (!provider) {
        provider = await deps.getActiveLlmProvider();
      }

      if (!provider) {
        return res.status(503).json({
          error: {
            message:
              "No LLM provider configured. Please add an LLM provider in admin settings.",
          },
        });
      }

      const requestedModelId =
        (sanitizedBody.model as string) ||
        provider.defaultModel ||
        "gpt-4o-mini";
      let model = requestedModelId;
      let apiStyle: ApiStyle | undefined;

      if (preferredProviderId != null) {
        const resolved = await deps.resolveProviderModel(
          requestedModelId,
          preferredProviderId,
        );
        if (resolved) {
          model = resolved.providerModelId;
          apiStyle = resolved.apiStyle;
        }
      } else {
        const resolved =
          await deps.resolveProviderModelAny(requestedModelId);
        if (resolved) {
          model = resolved.providerModelId;
          apiStyle = resolved.apiStyle;
        }
      }

      // Ensure we use the responses endpoint
      const effectiveApiStyle: ApiStyle = apiStyle || "responses";
      const url = resolveApiUrl(
        provider.baseUrl,
        model,
        provider.providerName,
        effectiveApiStyle,
      );

      debugLog("responses", "Request", {
        url,
        model,
        requestedModelId,
        stream,
        userId,
        traceId,
      });

      // Update sanitized body with resolved model
      sanitizedBody.model = model;

      // --- Audit: log request ---
      auditLogger.log({
        traceId,
        eventType: "responses_api_call",
        userId,
        providerId: provider.providerId,
        providerName: provider.providerName,
        model: requestedModelId,
        endpoint: "/v1/responses",
        requestType: "responses",
        requestPayload: {
          model: requestedModelId,
          stream,
          toolCount: Array.isArray(sanitizedBody.tools)
            ? (sanitizedBody.tools as unknown[]).length
            : 0,
          maxBudgetCredits,
        },
      });

      // --- Rate limiting ---
      const isFreeModel =
        model.toLowerCase().includes("free") ||
        model.toLowerCase().includes("-free");
      await deps.acquireProviderSlot(provider.providerName, isFreeModel);

      const internalToken = process.env.SMARTSPEC_WEB_GATEWAY_TOKEN || "";

      try {
        if (stream) {
          await proxyResponsesStream(
            req,
            res,
            url,
            sanitizedBody,
            provider,
            userId,
            requestedModelId,
            maxBudgetCredits,
            traceId,
            startTime,
            internalToken,
            deps,
          );
        } else {
          await proxyResponsesJson(
            req,
            res,
            url,
            sanitizedBody,
            provider,
            userId,
            requestedModelId,
            maxBudgetCredits,
            traceId,
            startTime,
            internalToken,
            deps,
          );
        }
      } catch (err: any) {
        debugError("responses", "Handler error", err);
        if (!res.headersSent) {
          res
            .status(500)
            .json({ error: { message: err?.message || "Internal error" } });
        }
      } finally {
        deps.releaseProviderSlot(provider.providerName);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Non-streaming handler
// ---------------------------------------------------------------------------

async function proxyResponsesJson(
  req: Request,
  res: Response,
  url: string,
  body: Record<string, unknown>,
  provider: any,
  userId: number,
  requestedModelId: string,
  maxBudgetCredits: number,
  traceId: string,
  startTime: number,
  internalToken: string,
  deps: any,
) {
  const controller = new AbortController();
  req.on("close", () => controller.abort());

  // Ensure stream is false
  body.stream = false;

  const budget: BudgetState = {
    maxBudgetCredits,
    accumulatedCredits: 0,
    currentRound: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    webSearchCalls: 0,
  };

  let currentInput = body.input;
  let lastResponse: any = null;
  let budgetExceeded = false;

  // Tool-call loop
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    budget.currentRound = round + 1;

    if (req.socket.destroyed) {
      debugLog("responses", "Client disconnected mid-loop", { round, traceId });
      break;
    }

    const requestBody = { ...body, input: currentInput };

    let upstream: globalThis.Response;
    try {
      upstream = await fetch(url, {
        method: "POST",
        headers: buildHeaders(provider.apiKey),
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (err: any) {
      debugError("responses", "Upstream fetch error", { round, error: err?.message });
      if (lastResponse) break; // Return partial
      throw err;
    }

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => upstream.statusText);
      debugError("responses", "Upstream error", { status: upstream.status, body: errText });
      if (lastResponse) break; // Return partial
      res.status(upstream.status).json({
        error: { message: `Upstream error: ${errText}` },
      });
      return;
    }

    const data = await upstream.json();
    lastResponse = data;

    // Parse usage
    const usage = parseResponsesUsage(data);
    budget.totalInputTokens += usage.inputTokens;
    budget.totalOutputTokens += usage.outputTokens;

    // Count web_search_call items
    const searchCalls = countWebSearchCalls(data.output || []);
    budget.webSearchCalls += searchCalls;

    // Calculate credits for this round
    const roundCredits = calculateCreditsForLLM(
      usage.inputTokens,
      usage.outputTokens,
      requestedModelId,
    );
    budget.accumulatedCredits += roundCredits;

    // Extract function calls
    const functionCalls = extractFunctionCalls(data.output || []);
    if (functionCalls.length === 0) break; // No tool calls, we're done

    // Check budget before dispatching tools
    const estimatedNext = estimateNextRoundCredits(budget);
    if (budget.accumulatedCredits + estimatedNext > budget.maxBudgetCredits) {
      budgetExceeded = true;
      debugLog("responses", "Budget exceeded", {
        accumulated: budget.accumulatedCredits,
        max: budget.maxBudgetCredits,
        round,
      });
      break;
    }

    // Check credits balance
    const hasCredits = await hasEnoughCredits(userId, estimatedNext);
    if (!hasCredits) {
      budgetExceeded = true;
      break;
    }

    // Dispatch function calls
    const toolOutputs: Array<{
      type: "function_call_output";
      call_id: string;
      output: string;
    }> = [];

    for (const fc of functionCalls) {
      auditLogger.log({
        traceId,
        eventType: "browser_tool_call",
        userId,
        model: requestedModelId,
        metadata: {
          toolName: fc.name,
          callId: fc.callId,
          round,
        },
      });

      const output = await dispatchFunctionCall(
        fc.name,
        fc.arguments,
        internalToken,
        userId,
      );

      toolOutputs.push({
        type: "function_call_output",
        call_id: fc.callId,
        output,
      });
    }

    // Build next input with tool outputs appended
    currentInput = [...(Array.isArray(currentInput) ? currentInput : []), ...toolOutputs];
  }

  // --- Deduct credits ---
  const searchCostUsd = budget.webSearchCalls * WEB_SEARCH_COST_USD;
  const totalMs = Date.now() - startTime;

  await deductCreditsForModel({
    userId,
    model: requestedModelId,
    provider: provider.providerName,
    inputTokens: budget.totalInputTokens,
    outputTokens: budget.totalOutputTokens,
    sourceType: "browser_automation",
  });

  // Log web_search cost separately if any
  if (budget.webSearchCalls > 0) {
    const searchCredits = calculateCreditsFromCost(searchCostUsd);
    await deductCreditsForModel({
      userId,
      model: "web_search",
      provider: provider.providerName,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: searchCostUsd,
      description: `${budget.webSearchCalls} web search calls`,
      sourceType: "browser_automation",
    });

    logCostRequest({
      userId,
      providerId: provider.providerId ?? 0,
      modelUsed: "web_search",
      inputTokens: 0,
      outputTokens: 0,
      costUsd: searchCostUsd,
      creditsCharged: searchCredits,
      responseTimeMs: totalMs,
      statusCode: 200,
      wasFallback: false,
      traceId,
    }).catch((err: any) =>
      debugError("responses", "Failed to log web_search cost", err?.message),
    );

    auditLogger.log({
      traceId,
      eventType: "web_search_call",
      userId,
      model: requestedModelId,
      metadata: {
        searchCallCount: budget.webSearchCalls,
        searchCostUsd,
      },
    });
  }

  // Record usage analytics
  deps.recordModelUsage(
    provider.providerName,
    requestedModelId,
    true,
    budget.totalInputTokens,
    budget.totalOutputTokens,
  );

  // Log to provider_usage_log
  const totalCredits = calculateCreditsForLLM(
    budget.totalInputTokens,
    budget.totalOutputTokens,
    requestedModelId,
  );
  logCostRequest({
    userId,
    providerId: provider.providerId ?? 0,
    modelUsed: requestedModelId,
    inputTokens: budget.totalInputTokens,
    outputTokens: budget.totalOutputTokens,
    costUsd: 0,
    creditsCharged: totalCredits,
    responseTimeMs: totalMs,
    statusCode: 200,
    wasFallback: false,
    traceId,
  }).catch((err: any) =>
    debugError("responses", "Failed to log cost", err?.message),
  );

  // Audit: log response
  auditLogger.log({
    traceId,
    eventType: "responses_api_call",
    userId,
    providerId: provider.providerId,
    providerName: provider.providerName,
    model: requestedModelId,
    statusCode: 200,
    inputTokens: budget.totalInputTokens,
    outputTokens: budget.totalOutputTokens,
    creditsCharged: totalCredits,
    timing: { totalMs },
    metadata: {
      toolRounds: budget.currentRound,
      webSearchCalls: budget.webSearchCalls,
      budgetExceeded,
    },
  });

  // Add metadata to response
  if (lastResponse && typeof lastResponse === "object") {
    lastResponse._meta = {
      traceId,
      toolRounds: budget.currentRound,
      webSearchCalls: budget.webSearchCalls,
      budgetExceeded,
      usage: {
        inputTokens: budget.totalInputTokens,
        outputTokens: budget.totalOutputTokens,
      },
    };

    if (userId > 0) {
      const balance = await getCreditBalance(userId);
      lastResponse._credits = {
        used: totalCredits,
        remaining: balance?.credits ?? 0,
      };
    }
  }

  res.status(200).json(lastResponse || { error: { message: "No response" } });
}

// ---------------------------------------------------------------------------
// Streaming handler
// ---------------------------------------------------------------------------

async function proxyResponsesStream(
  req: Request,
  res: Response,
  url: string,
  body: Record<string, unknown>,
  provider: any,
  userId: number,
  requestedModelId: string,
  maxBudgetCredits: number,
  traceId: string,
  startTime: number,
  internalToken: string,
  deps: any,
) {
  const controller = new AbortController();
  let clientDisconnected = false;
  req.on("close", () => {
    clientDisconnected = true;
    controller.abort();
  });

  body.stream = true;

  // Set SSE headers
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");

  const budget: BudgetState = {
    maxBudgetCredits,
    accumulatedCredits: 0,
    currentRound: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    webSearchCalls: 0,
  };

  let currentInput = body.input;
  let budgetExceeded = false;

  try {
    // Tool-call loop (for streaming, we re-request after tool calls)
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      budget.currentRound = round + 1;

      if (clientDisconnected) break;

      const requestBody = { ...body, input: currentInput };

      let upstream: globalThis.Response;
      try {
        upstream = await fetch(url, {
          method: "POST",
          headers: buildHeaders(provider.apiKey),
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
      } catch (err: any) {
        if (!clientDisconnected) {
          res.write(
            `event: error\ndata: ${JSON.stringify({ error: err?.message || "Upstream error" })}\n\n`,
          );
        }
        break;
      }

      if (!upstream.ok) {
        const errText = await upstream.text().catch(() => upstream.statusText);
        if (!clientDisconnected) {
          res.write(
            `event: error\ndata: ${JSON.stringify({ error: errText, status: upstream.status })}\n\n`,
          );
        }
        break;
      }

      if (!upstream.body) {
        res.write(
          `event: error\ndata: ${JSON.stringify({ error: "No stream body" })}\n\n`,
        );
        break;
      }

      // Stream SSE events and collect function calls
      const reader = upstream.body.getReader();
      let accumulatedData = "";
      const functionCalls: Array<{
        id: string;
        callId: string;
        name: string;
        arguments: string;
      }> = [];

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            const chunk = Buffer.from(value);

            // Only proxy SSE events from the first round directly
            // Subsequent rounds' events are internal (tool loop)
            if (round === 0 || functionCalls.length === 0) {
              res.write(chunk);
            }

            accumulatedData += chunk.toString();
          }
        }
      } finally {
        try {
          reader.releaseLock();
        } catch {}
      }

      // Parse accumulated SSE data for usage and function calls
      const dataLines = accumulatedData
        .split("\n")
        .filter((l) => l.startsWith("data:"));

      let roundUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
      let roundSearchCalls = 0;

      for (const line of dataLines) {
        const raw = line.slice("data:".length).trim();
        if (!raw || raw === "[DONE]") continue;
        try {
          const parsed = JSON.parse(raw);

          // Check for usage in response.completed event
          if (parsed?.usage) {
            roundUsage = parseResponsesUsage(parsed);
          }

          // Track web_search_call events
          if (parsed?.type === "web_search_call") {
            roundSearchCalls++;
          }

          // Collect function calls from individual stream events
          if (
            parsed?.type === "response.output_item.done" &&
            parsed?.item?.type === "function_call"
          ) {
            const callId = parsed.item.call_id || parsed.item.id;
            // Deduplicate by callId
            if (!functionCalls.some((fc) => fc.callId === callId)) {
              functionCalls.push({
                id: parsed.item.id,
                callId,
                name: parsed.item.name,
                arguments: parsed.item.arguments || "{}",
              });
            }
          }

          // response.completed has the full output — use for web_search counting
          // and as fallback for function calls if individual events were missed
          if (parsed?.type === "response.completed" && parsed?.response?.output) {
            const fcs = extractFunctionCalls(parsed.response.output);
            for (const fc of fcs) {
              if (!functionCalls.some((existing) => existing.callId === fc.callId)) {
                functionCalls.push(fc);
              }
            }
            roundSearchCalls += countWebSearchCalls(parsed.response.output);
          }
        } catch {}
      }

      // Update budget
      budget.totalInputTokens += roundUsage.inputTokens;
      budget.totalOutputTokens += roundUsage.outputTokens;
      budget.webSearchCalls += roundSearchCalls;

      const roundCredits = calculateCreditsForLLM(
        roundUsage.inputTokens,
        roundUsage.outputTokens,
        requestedModelId,
      );
      budget.accumulatedCredits += roundCredits;

      // No function calls — we're done
      if (functionCalls.length === 0) break;

      // Check budget
      const estimatedNext = estimateNextRoundCredits(budget);
      if (budget.accumulatedCredits + estimatedNext > budget.maxBudgetCredits) {
        budgetExceeded = true;
        res.write(
          `event: budget_exceeded\ndata: ${JSON.stringify({ accumulated: budget.accumulatedCredits, max: budget.maxBudgetCredits })}\n\n`,
        );
        break;
      }

      // Check credits balance
      const hasCreditsLeft = await hasEnoughCredits(userId, estimatedNext);
      if (!hasCreditsLeft) {
        budgetExceeded = true;
        res.write(
          `event: budget_exceeded\ndata: ${JSON.stringify({ reason: "insufficient_credits" })}\n\n`,
        );
        break;
      }

      if (clientDisconnected) break;

      // Dispatch function calls
      const toolOutputs: Array<{
        type: "function_call_output";
        call_id: string;
        output: string;
      }> = [];

      for (const fc of functionCalls) {
        auditLogger.log({
          traceId,
          eventType: "browser_tool_call",
          userId,
          model: requestedModelId,
          metadata: { toolName: fc.name, callId: fc.callId, round },
        });

        const output = await dispatchFunctionCall(
          fc.name,
          fc.arguments,
          internalToken,
          userId,
        );

        toolOutputs.push({
          type: "function_call_output",
          call_id: fc.callId,
          output,
        });

        // Notify client about tool execution progress
        if (!clientDisconnected) {
          res.write(
            `event: tool_executed\ndata: ${JSON.stringify({ toolName: fc.name, callId: fc.callId, round })}\n\n`,
          );
        }
      }

      // Build next input
      currentInput = [
        ...(Array.isArray(currentInput) ? currentInput : []),
        ...toolOutputs,
      ];
    }
  } finally {
    // --- Deduct credits ---
    const searchCostUsd = budget.webSearchCalls * WEB_SEARCH_COST_USD;
    const totalMs = Date.now() - startTime;

    await deductCreditsForModel({
      userId,
      model: requestedModelId,
      provider: provider.providerName,
      inputTokens: budget.totalInputTokens,
      outputTokens: budget.totalOutputTokens,
      sourceType: "browser_automation",
    });

    // Log web_search cost
    if (budget.webSearchCalls > 0) {
      const searchCredits = calculateCreditsFromCost(searchCostUsd);
      await deductCreditsForModel({
        userId,
        model: "web_search",
        provider: provider.providerName,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: searchCostUsd,
        description: `${budget.webSearchCalls} web search calls`,
        sourceType: "browser_automation",
      });

      logCostRequest({
        userId,
        providerId: provider.providerId ?? 0,
        modelUsed: "web_search",
        inputTokens: 0,
        outputTokens: 0,
        costUsd: searchCostUsd,
        creditsCharged: searchCredits,
        responseTimeMs: totalMs,
        statusCode: 200,
        wasFallback: false,
        traceId,
      }).catch((err: any) =>
        debugError("responses", "Failed to log web_search cost", err?.message),
      );

      auditLogger.log({
        traceId,
        eventType: "web_search_call",
        userId,
        model: requestedModelId,
        metadata: {
          searchCallCount: budget.webSearchCalls,
          searchCostUsd,
        },
      });
    }

    // Record analytics
    deps.recordModelUsage(
      provider.providerName,
      requestedModelId,
      true,
      budget.totalInputTokens,
      budget.totalOutputTokens,
    );

    const totalCredits = calculateCreditsForLLM(
      budget.totalInputTokens,
      budget.totalOutputTokens,
      requestedModelId,
    );

    logCostRequest({
      userId,
      providerId: provider.providerId ?? 0,
      modelUsed: requestedModelId,
      inputTokens: budget.totalInputTokens,
      outputTokens: budget.totalOutputTokens,
      costUsd: 0,
      creditsCharged: totalCredits,
      responseTimeMs: totalMs,
      statusCode: 200,
      wasFallback: false,
      traceId,
    }).catch((err: any) =>
      debugError("responses", "Failed to log cost", err?.message),
    );

    auditLogger.log({
      traceId,
      eventType: "responses_api_call",
      userId,
      providerId: provider.providerId,
      providerName: provider.providerName,
      model: requestedModelId,
      statusCode: 200,
      inputTokens: budget.totalInputTokens,
      outputTokens: budget.totalOutputTokens,
      creditsCharged: totalCredits,
      timing: { totalMs },
      metadata: {
        toolRounds: budget.currentRound,
        webSearchCalls: budget.webSearchCalls,
        budgetExceeded,
        streaming: true,
      },
    });

    // Send summary event
    if (!clientDisconnected) {
      res.write(
        `event: responses_summary\ndata: ${JSON.stringify({
          traceId,
          toolRounds: budget.currentRound,
          webSearchCalls: budget.webSearchCalls,
          budgetExceeded,
          usage: {
            inputTokens: budget.totalInputTokens,
            outputTokens: budget.totalOutputTokens,
          },
          creditsUsed: totalCredits,
        })}\n\n`,
      );
    }

    res.end();
  }
}
