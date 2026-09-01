/**
 * LLM Routes Handler
 *
 * Thin HTTP handler functions that delegate to llmRouter, costTracker, and creditService.
 * These replace the monolithic proxyChatWithCredits() when multi-provider routing is enabled.
 */

import type { Response } from "express";
import { executeWithFallback } from "./llmRouter";
import { deductCreditsForModel } from "./creditService";
import { injectHelpContextMessage } from "./helpContextInjector";
import type { Message } from "../_core/llm";
import { runPlanner, recordStepAttempt } from "./taskPlannerMiddleware";
import {
  deriveChatSelectionContext,
  readStoredChatModelSelectionState,
  resolveChatModelSelection,
  storedSelectionStateFromResolved,
} from "./chatModelSelection";
import { getConversationById, updateConversation } from "./chatService";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";

interface HandlerParams {
  model?: string;
  messages: Message[];
  userId: number;
  tenantId: string;
  conversationId?: number;
  preferredProvider?: number;
  modelSelection?: unknown;
  modelSelectionContext?: unknown;
  skillUsed?: string;
  res: Response;
}

function getSelectionErrorStatus(error: unknown): number {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("not enabled for this tenant") ? 403 : 400;
}

/**
 * Handle a non-streaming (JSON) chat request through the router
 */
export async function handleChatWithRouter(params: HandlerParams): Promise<void> {
  const {
    model,
    messages,
    userId,
    tenantId,
    conversationId,
    preferredProvider,
    modelSelection,
    modelSelectionContext,
    skillUsed,
    res,
  } = params;
  if (!skillUsed || skillUsed === "help-assistant") {
    try {
      await injectHelpContextMessage(messages, { force: skillUsed === "help-assistant" });
    } catch {
      // Non-fatal: continue without help context
    }
  }

  const conversation = conversationId
    ? await getConversationById(conversationId, userId)
    : undefined;
  const storedSelectionState = readStoredChatModelSelectionState(conversation?.skillSettings);
  const autoSelectionEnabled = (await getTenantFeatureFlags(tenantId)).chatAutoModelSelection;

  let resolvedSelection;
  try {
    resolvedSelection = await resolveChatModelSelection({
      tenantId,
      userId,
      bodyModel: model,
      bodyPreferredProvider: preferredProvider,
      bodyModelSelection: modelSelection,
      storedSelectionState,
      messages,
      selectionContext: deriveChatSelectionContext(modelSelectionContext),
      autoSelectionEnabled,
    });
  } catch (error: any) {
    res.status(getSelectionErrorStatus(error)).json({ error: { message: error?.message || "Invalid chat model selection" } });
    return;
  }

  const effectiveModel = resolvedSelection.resolvedModelId;

  // Keep planner telemetry for skill-driven chat flows, but do not allow it to override
  // the user's explicit/provider-auto/global-auto selection contract.
  const plannerResult = skillUsed
    ? await runPlanner({
        sourceType: "chat",
        userId,
        tenantId,
        conversationModel: effectiveModel,
        skillSlug: skillUsed,
      })
    : null;

  const result = await executeWithFallback({
    model: effectiveModel,
    messages,
    stream: false,
    userId,
    tenantId,
    conversationId,
    preferredProvider: resolvedSelection.preferredProviderId,
    strictProviderPin: resolvedSelection.strictProviderPin,
  });

  switch (result.type) {
    case "worker_job": {
      res.status(202).json({ queued: true, jobId: result.jobId, sourceType: "worker_app", resolvedModelId: effectiveModel });
      return;
    }

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

      // Record step attempt for planner telemetry
      if (plannerResult) {
        recordStepAttempt({
          taskRunId: plannerResult.taskRunId,
          plan: plannerResult.plan,
          model: effectiveModel,
          provider: result.providerName,
          inputTokens,
          outputTokens,
          costUsd: costUsd != null ? String(costUsd) : "0",
          snapshot: plannerResult.snapshot,
          creditsUsed,
        }).catch(() => {}); // fire-and-forget
      }

      // Append credit info to response
      if (data && typeof data === "object") {
        data._credits = { used: creditsUsed };
        data._resolvedModel = {
          modelId: resolvedSelection.resolvedModelId,
          providerId: resolvedSelection.resolvedProviderId ?? null,
          providerName: resolvedSelection.resolvedProviderName ?? null,
          routeFamily: resolvedSelection.routeFamily,
          selectionMode: resolvedSelection.selectionMode,
        };
      }

      if (conversationId && resolvedSelection.shouldPersistSelectionState) {
        const nextSkillSettings = {
          ...((conversation?.skillSettings as Record<string, unknown> | null | undefined) ?? {}),
          llmSelection: storedSelectionStateFromResolved({
            selection: resolvedSelection.selection,
            resolvedModelId: resolvedSelection.resolvedModelId,
            resolvedProviderId: resolvedSelection.resolvedProviderId ?? null,
            resolvedProviderName: resolvedSelection.resolvedProviderName ?? null,
            routeFamily: resolvedSelection.routeFamily,
          }),
        };
        await updateConversation(conversationId, userId, {
          model: resolvedSelection.selection.mode === "explicit"
            ? resolvedSelection.resolvedModelId
            : null,
          skillSettings: nextSkillSettings as any,
        });
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
  const {
    model,
    messages,
    userId,
    tenantId,
    conversationId,
    preferredProvider,
    modelSelection,
    modelSelectionContext,
    skillUsed,
    res,
  } = params;
  if (!skillUsed || skillUsed === "help-assistant") {
    try {
      await injectHelpContextMessage(messages, { force: skillUsed === "help-assistant" });
    } catch {
      // Non-fatal: continue without help context
    }
  }

  const conversation = conversationId
    ? await getConversationById(conversationId, userId)
    : undefined;
  const storedSelectionState = readStoredChatModelSelectionState(conversation?.skillSettings);
  const autoSelectionEnabled = (await getTenantFeatureFlags(tenantId)).chatAutoModelSelection;

  let resolvedSelection;
  try {
    resolvedSelection = await resolveChatModelSelection({
      tenantId,
      userId,
      bodyModel: model,
      bodyPreferredProvider: preferredProvider,
      bodyModelSelection: modelSelection,
      storedSelectionState,
      messages,
      selectionContext: deriveChatSelectionContext(modelSelectionContext),
      autoSelectionEnabled,
    });
  } catch (error: any) {
    const statusCode = getSelectionErrorStatus(error);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.write(`event: error\ndata: ${JSON.stringify({ error: error?.message || "Invalid chat model selection", statusCode })}\n\n`);
    res.end();
    return;
  }

  const effectiveModel = resolvedSelection.resolvedModelId;

  const plannerResult = skillUsed
    ? await runPlanner({
        sourceType: "stream",
        userId,
        tenantId,
        conversationModel: effectiveModel,
        skillSlug: skillUsed,
      })
    : null;

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  const result = await executeWithFallback({
    model: effectiveModel,
    messages,
    stream: true,
    userId,
    tenantId,
    conversationId,
    preferredProvider: resolvedSelection.preferredProviderId,
    strictProviderPin: resolvedSelection.strictProviderPin,
  });

  switch (result.type) {
    case "worker_job": {
      res.write(`event: worker_job\ndata: ${JSON.stringify({ queued: true, jobId: result.jobId, sourceType: "worker_app", resolvedModelId: effectiveModel })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

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

      // Record step attempt for planner telemetry
      if (plannerResult) {
        recordStepAttempt({
          taskRunId: plannerResult.taskRunId,
          plan: plannerResult.plan,
          model: effectiveModel,
          provider: result.providerName,
          inputTokens,
          outputTokens,
          costUsd: costUsd != null ? String(costUsd) : "0",
          snapshot: plannerResult.snapshot,
          creditsUsed,
        }).catch(() => {}); // fire-and-forget
      }

      // Send the response as SSE data
      const content = data?.choices?.[0]?.message?.content ?? "";
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      res.write(`event: message_complete\ndata: ${JSON.stringify({
        creditsUsed,
        inputTokens,
        outputTokens,
        resolvedModelId: resolvedSelection.resolvedModelId,
        resolvedProviderId: resolvedSelection.resolvedProviderId ?? null,
        resolvedProviderName: resolvedSelection.resolvedProviderName ?? null,
        routeFamily: resolvedSelection.routeFamily,
        selectionMode: resolvedSelection.selectionMode,
      })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();

      if (conversationId && resolvedSelection.shouldPersistSelectionState) {
        const nextSkillSettings = {
          ...((conversation?.skillSettings as Record<string, unknown> | null | undefined) ?? {}),
          llmSelection: storedSelectionStateFromResolved({
            selection: resolvedSelection.selection,
            resolvedModelId: resolvedSelection.resolvedModelId,
            resolvedProviderId: resolvedSelection.resolvedProviderId ?? null,
            resolvedProviderName: resolvedSelection.resolvedProviderName ?? null,
            routeFamily: resolvedSelection.routeFamily,
          }),
        };
        await updateConversation(conversationId, userId, {
          model: resolvedSelection.selection.mode === "explicit"
            ? resolvedSelection.resolvedModelId
            : null,
          skillSettings: nextSkillSettings as any,
        });
      }
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
