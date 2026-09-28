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
import {
  createInferenceAssistantMessageOnce,
  deliverSettledInferenceChatResponseForKey,
  findInferenceAssistantMessage,
  getConversationById,
  updateConversation,
  type InferenceAssistantMessageReceipt,
} from "./chatService";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
import { executeChatThroughInferenceGateway } from "./inference/chatInferenceGateway";
import { getTraceId } from "./traceContext";
import { inferenceCostMicrosToCreditUnits } from "./inference/creditReservationAuthority";

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
  idempotencyKey?: string;
  contextPrepared?: boolean;
  requirePolicyGateway?: boolean;
  res: Response;
}

function getSelectionErrorStatus(error: unknown): number {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("not enabled for this tenant") ? 403 : 400;
}

function isActiveInferenceAttempt(status: string): boolean {
  return status === "prepared" || status === "submitting";
}

export function replaySavedAssistantJson(
  res: Response,
  message: InferenceAssistantMessageReceipt
): void {
  res.status(200).json({
    id: `chat-message-${message.id}`,
    model: message.modelUsed ?? undefined,
    choices: [{ message: { role: "assistant", content: message.content }, finish_reason: "stop" }],
    usage: {
      prompt_tokens: message.inputTokens ?? 0,
      completion_tokens: message.outputTokens ?? 0,
    },
    _credits: { used: Number(message.creditsUsed ?? 0) },
    _replayed: true,
  });
}

export function replaySavedAssistantSse(
  res: Response,
  message: InferenceAssistantMessageReceipt
): void {
  const creditsUsed = Number(message.creditsUsed ?? 0);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.write(`data: ${JSON.stringify({
    id: `chat-message-${message.id}`,
    model: message.modelUsed ?? undefined,
    choices: [{ index: 0, delta: { content: message.content }, finish_reason: "stop" }],
  })}\n\n`);
  res.write(`event: message_complete\ndata: ${JSON.stringify({
    content: message.content,
    creditsUsed,
    inputTokens: message.inputTokens ?? 0,
    outputTokens: message.outputTokens ?? 0,
    resolvedModelId: message.modelUsed,
    replayed: true,
  })}\n\n`);
  res.write(`event: message_saved\ndata: ${JSON.stringify({
    id: message.id,
    creditsUsed,
    inputTokens: message.inputTokens ?? 0,
    outputTokens: message.outputTokens ?? 0,
    resolvedModelId: message.modelUsed,
    runtimeMetadata: message.runtimeMetadata,
  })}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
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
  if (!params.contextPrepared && (!skillUsed || skillUsed === "help-assistant")) {
    try {
      await injectHelpContextMessage(messages, { force: skillUsed === "help-assistant" });
    } catch {
      // Non-fatal: continue without help context
    }
  }

  const conversation = conversationId
    ? await getConversationById(conversationId, userId)
    : undefined;
  if (conversationId && !conversation) {
    res.status(404).json({ error: { message: "Conversation not found" } });
    return;
  }
  if (conversationId && params.idempotencyKey) {
    await deliverSettledInferenceChatResponseForKey({
      tenantId,
      userId,
      idempotencyKey: params.idempotencyKey,
    }).catch(() => "not_found" as const);
    const savedMessage = await findInferenceAssistantMessage({
      tenantId,
      userId,
      idempotencyKey: params.idempotencyKey,
    });
    if (savedMessage) {
      replaySavedAssistantJson(res, savedMessage);
      return;
    }
  }
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

  const hasDatabaseModelMapping =
    Number.isSafeInteger(resolvedSelection.resolvedModelMappingId) &&
    Number.isSafeInteger(resolvedSelection.resolvedProviderId);
  if (
    resolvedSelection.selection.mode !== "explicit" ||
    hasDatabaseModelMapping ||
    params.requirePolicyGateway
  ) {
    const routed = await executeChatThroughInferenceGateway({
      userId,
      tenantId,
      conversationId,
      skillUsed,
      messages,
      selection: resolvedSelection.selection,
      selectionContext: deriveChatSelectionContext(modelSelectionContext),
      resolvedModelMappingId: resolvedSelection.resolvedModelMappingId,
      resolvedProviderId: resolvedSelection.resolvedProviderId,
      idempotencyKey: params.idempotencyKey,
      traceId: getTraceId(),
      stream: false,
    });
    if (routed.status === "blocked") {
      res.status(503).json({ error: { message: "Policy-routed inference is unavailable", code: routed.reason } });
      return;
    }
    if (routed.status === "executed") {
      const execution = routed.result.execution;
      if (execution.status === "completed") {
        const data = execution.response as Record<string, any> | null;
        if (data && typeof data === "object") {
          data._credits = { used: inferenceCostMicrosToCreditUnits(execution.receipt.chargedCostMicros ?? 0) ?? 0 };
          data._resolvedModel = {
            inferencePlanId: routed.result.planning.planId,
            deploymentId: routed.result.planning.selectedDeploymentId,
            selectionMode: resolvedSelection.selection.mode,
          };
        }
        res.status(200).json(data);
      } else if (execution.status === "duplicate_attempt" && isActiveInferenceAttempt(execution.existingStatus)) {
        res.status(202).json({
          inference: {
            status: "in_progress",
            attemptId: execution.attemptId,
            attemptStatus: execution.existingStatus,
          },
        });
      } else if (execution.status === "duplicate_attempt") {
        res.status(409).json({
          error: {
            message: "This idempotency key already has a terminal inference attempt",
            code: "INFERENCE_ATTEMPT_ALREADY_TERMINAL",
            attemptId: execution.attemptId,
            attemptStatus: execution.existingStatus,
          },
        });
      } else {
        res.status(execution.status === "settlement_pending" ? 503 : 502).json({ error: { message: "Policy-routed inference did not complete", code: execution.status } });
      }
      return;
    }
  }

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
  if (!params.contextPrepared && (!skillUsed || skillUsed === "help-assistant")) {
    try {
      await injectHelpContextMessage(messages, { force: skillUsed === "help-assistant" });
    } catch {
      // Non-fatal: continue without help context
    }
  }

  const conversation = conversationId
    ? await getConversationById(conversationId, userId)
    : undefined;
  if (conversationId && !conversation) {
    res.status(404);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.write(`event: error\ndata: ${JSON.stringify({ error: "Conversation not found", statusCode: 404 })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
    return;
  }
  if (conversationId && params.idempotencyKey) {
    await deliverSettledInferenceChatResponseForKey({
      tenantId,
      userId,
      idempotencyKey: params.idempotencyKey,
    }).catch(() => "not_found" as const);
    const savedMessage = await findInferenceAssistantMessage({
      tenantId,
      userId,
      idempotencyKey: params.idempotencyKey,
    });
    if (savedMessage) {
      replaySavedAssistantSse(res, savedMessage);
      return;
    }
  }
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

  const hasDatabaseModelMapping =
    Number.isSafeInteger(resolvedSelection.resolvedModelMappingId) &&
    Number.isSafeInteger(resolvedSelection.resolvedProviderId);
  if (
    resolvedSelection.selection.mode !== "explicit" ||
    hasDatabaseModelMapping ||
    params.requirePolicyGateway
  ) {
    const routed = await executeChatThroughInferenceGateway({
      userId,
      tenantId,
      conversationId,
      skillUsed,
      messages,
      selection: resolvedSelection.selection,
      selectionContext: deriveChatSelectionContext(modelSelectionContext),
      resolvedModelMappingId: resolvedSelection.resolvedModelMappingId,
      resolvedProviderId: resolvedSelection.resolvedProviderId,
      idempotencyKey: params.idempotencyKey,
      traceId: getTraceId(),
      stream: true,
    });
    if (routed.status === "blocked" || routed.status === "executed") {
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      if (routed.status === "blocked") {
        res.write(`event: error\ndata: ${JSON.stringify({ error: "Policy-routed inference is unavailable", code: routed.reason, statusCode: 503 })}\n\n`);
      } else if (routed.result.execution.status === "completed") {
        const execution = routed.result.execution;
        const response = execution.response as Record<string, any> | null;
        const content = response?.choices?.[0]?.message?.content;
        const assistantText = typeof content === "string" ? content : "";
        const creditsUsed = inferenceCostMicrosToCreditUnits(
          execution.receipt.chargedCostMicros ?? 0
        ) ?? 0;
        let savedMessage: { id: number } | null = null;
        let saveFailed = false;
        if (conversationId && assistantText) {
          try {
            const { sanitizeMessageRuntimeMetadata } = await import("./localAiRuntimeMetadata");
            const persisted = await createInferenceAssistantMessageOnce({
              message: {
                conversationId,
                role: "assistant",
                content: assistantText,
                inputTokens: execution.receipt.usage?.input ?? 0,
                outputTokens: execution.receipt.usage?.output ?? 0,
                creditsUsed: String(creditsUsed),
                modelUsed: resolvedSelection.resolvedModelId,
                skillUsed,
                traceId: getTraceId(),
                runtimeMetadata: sanitizeMessageRuntimeMetadata({
                  source: "cloud",
                  model: resolvedSelection.resolvedModelId,
                }),
              },
              tenantId,
              userId,
              idempotencyKey: params.idempotencyKey ?? `server:${getTraceId()}`,
            });
            savedMessage = persisted.message;
          } catch {
            saveFailed = true;
            // The provider result is already settled. Keep it visible and report
            // the persistence failure so the UI does not silently lose the answer.
          }
        }
        res.write(`data: ${JSON.stringify({
          id: response?.id,
          model: response?.model ?? resolvedSelection.resolvedModelId,
          choices: [{ index: 0, delta: { content: assistantText }, finish_reason: "stop" }],
        })}\n\n`);
        res.write(`event: message_complete\ndata: ${JSON.stringify({
          content: assistantText,
          creditsUsed,
          inputTokens: execution.receipt.usage?.input ?? 0,
          outputTokens: execution.receipt.usage?.output ?? 0,
          inferencePlanId: routed.result.planning.planId,
          deploymentId: routed.result.planning.selectedDeploymentId,
          selectionMode: resolvedSelection.selection.mode,
        })}\n\n`);
        if (savedMessage) {
          res.write(`event: message_saved\ndata: ${JSON.stringify({
            id: savedMessage.id,
            creditsUsed,
            inputTokens: execution.receipt.usage?.input ?? 0,
            outputTokens: execution.receipt.usage?.output ?? 0,
            resolvedModelId: resolvedSelection.resolvedModelId,
            runtimeMetadata: {
              source: "cloud",
              model: resolvedSelection.resolvedModelId,
            },
          })}\n\n`);
        }
        if (conversationId && assistantText && (!savedMessage || saveFailed)) {
          res.write(`event: save_error\ndata: ${JSON.stringify({ error: "Assistant response could not be saved" })}\n\n`);
        }
      } else if (routed.result.execution.status === "duplicate_attempt" && isActiveInferenceAttempt(routed.result.execution.existingStatus)) {
        res.status(202);
        res.write(`event: inference_pending\ndata: ${JSON.stringify({
          status: "in_progress",
          attemptId: routed.result.execution.attemptId,
          attemptStatus: routed.result.execution.existingStatus,
        })}\n\n`);
      } else if (routed.result.execution.status === "duplicate_attempt") {
        res.status(409);
        res.write(`event: inference_duplicate\ndata: ${JSON.stringify({
          error: "This idempotency key already has a terminal inference attempt",
          code: "INFERENCE_ATTEMPT_ALREADY_TERMINAL",
          attemptId: routed.result.execution.attemptId,
          attemptStatus: routed.result.execution.existingStatus,
        })}\n\n`);
      } else {
        res.write(`event: error\ndata: ${JSON.stringify({ error: "Policy-routed inference did not complete", code: routed.result.execution.status, statusCode: routed.result.execution.status === "settlement_pending" ? 503 : 502 })}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }
  }

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
