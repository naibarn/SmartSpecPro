/**
 * LLM Routes Handler
 *
 * Thin HTTP handler functions that delegate to llmRouter, costTracker, and creditService.
 * These replace the monolithic proxyChatWithCredits() when multi-provider routing is enabled.
 */

import type { Response } from "express";
import { executeWithFallback, type ExecuteResult, type ProviderCandidate } from "./llmRouter";
import { deductCreditsForModel } from "./creditService";
import { resolveEnabledLlmModelId } from "./enabledLlmModels";
import type { Message } from "../_core/llm";

interface HandlerParams {
  model?: string;
  messages: Message[];
  userId: number;
  conversationId?: number;
  preferredProvider?: number;
  res: Response;
}

/**
 * Handle a non-streaming (JSON) chat request through the router
 */
export async function handleChatWithRouter(params: HandlerParams): Promise<void> {
  const { model, messages, userId, conversationId, preferredProvider, res } = params;
  const effectiveModel = await resolveEnabledLlmModelId([model]);
  if (!effectiveModel) {
    res.status(503).json({ error: { message: "No enabled LLM model configured" } });
    return;
  }

  const result = await executeWithFallback({
    model: effectiveModel,
    messages,
    stream: false,
    userId,
    conversationId,
    preferredProvider,
  });

  switch (result.type) {
    case "success": {
      const data = result.response;
      const inputTokens = data?.usage?.prompt_tokens ?? 0;
      const outputTokens = data?.usage?.completion_tokens ?? 0;
      const costUsd = data?.usage?.cost;

      // Deduct credits (0 for free models)
      const { creditsUsed } = await deductCreditsForModel({
        userId,
        model: effectiveModel,
        provider: result.providerName,
        inputTokens,
        outputTokens,
        costUsd,
        sourceType: "chat",
        conversationId,
      });

      // Append credit info to response
      if (data && typeof data === "object") {
        data._credits = { used: creditsUsed };
      }

      res.status(200).json(data);
      return;
    }

    case "fallback_required": {
      res.status(200).json({
        fallbackRequired: true,
        from: {
          provider: result.from.providerName,
          model: result.from.providerModelId,
          providerId: result.from.providerId,
        },
        to: {
          provider: result.to.providerName,
          model: result.to.providerModelId,
          providerId: result.to.providerId,
        },
        estimatedCredits: result.estimatedCredits,
      });
      return;
    }

    case "error": {
      res.status(result.statusCode).json({ error: { message: result.error } });
      return;
    }
  }
}

/**
 * Handle a streaming (SSE) chat request through the router
 *
 * Note: For streaming mode, the router currently handles the upstream request internally
 * and returns the response data. Full streaming passthrough with buffer-until-first-chunk
 * will be implemented when the router gains native streaming support.
 */
export async function handleStreamWithRouter(params: HandlerParams): Promise<void> {
  const { model, messages, userId, conversationId, preferredProvider, res } = params;
  const effectiveModel = await resolveEnabledLlmModelId([model]);
  if (!effectiveModel) {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.write(`event: error\ndata: ${JSON.stringify({ error: "No enabled LLM model configured", statusCode: 503 })}\n\n`);
    res.end();
    return;
  }

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  const result = await executeWithFallback({
    model: effectiveModel,
    messages,
    stream: true,
    userId,
    conversationId,
    preferredProvider,
  });

  switch (result.type) {
    case "success": {
      const data = result.response;
      const inputTokens = data?.usage?.prompt_tokens ?? 0;
      const outputTokens = data?.usage?.completion_tokens ?? 0;
      const costUsd = data?.usage?.cost;

      // Deduct credits
      const { creditsUsed } = await deductCreditsForModel({
        userId,
        model: effectiveModel,
        provider: result.providerName,
        inputTokens,
        outputTokens,
        costUsd,
        sourceType: "chat",
        conversationId,
      });

      // Send the response as SSE data
      const content = data?.choices?.[0]?.message?.content ?? "";
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      res.write(`event: message_complete\ndata: ${JSON.stringify({ creditsUsed, inputTokens, outputTokens })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    case "fallback_required": {
      res.write(`event: fallback_required\ndata: ${JSON.stringify({
        from: result.from.providerName,
        to: result.to.providerName,
        estimatedCredits: result.estimatedCredits,
        toProviderId: result.to.providerId,
      })}\n\n`);
      res.end();
      return;
    }

    case "error": {
      res.write(`event: error\ndata: ${JSON.stringify({ error: result.error, statusCode: result.statusCode })}\n\n`);
      res.end();
      return;
    }
  }
}
