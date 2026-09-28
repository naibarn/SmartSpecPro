import { getSkillByIdAsync } from "./skillRegistry";
import { executeSkill, type SkillExecutionParams } from "./skillExecutor";
import { createInternalTokenFromAuth } from "../_core/tokens";
import type { JobExecutor } from "./jobExecutor";
import { resolveSkillExecutionPolicy } from "./skillExecutionPolicy";
import { executeSkillLlmWithFallback } from "./skillModelFallback";
import { executeChatRuntimeTurn } from "./agentRuntime/chatRuntimeOrchestrator";
import { settleSkillRun } from "./skillRevenueBilling";
import { createMessage } from "./chatService";

/**
 * Canonical worker handler for skill execution.
 *
 * The request path only persists the job and its outbox intent. Provider and
 * Python execution happens after a worker claims that durable job.
 */
export const executeSkillJob: JobExecutor = async ({
  context,
  lease,
  reporter,
}) => {
  const input = context.input as Record<string, unknown>;
  const skillId = typeof input.skillId === "string" ? input.skillId.trim() : "";
  const userId = Number(context.requestedByUserId ?? input.userId);
  const tenantId = String(context.tenantId ?? input.tenantId ?? "").trim();
  if (!skillId || !Number.isSafeInteger(userId) || userId <= 0 || !tenantId) {
    throw new Error("SKILL_EXECUTION_INPUT_INVALID");
  }

  const skill = await getSkillByIdAsync(skillId);
  if (!skill) throw new Error(`SKILL_NOT_FOUND:${skillId}`);
  await reporter.assertActive(lease);

  const params =
    input.params &&
    typeof input.params === "object" &&
    !Array.isArray(input.params)
      ? (input.params as SkillExecutionParams)
      : { prompt: "" };

  const executionMode = String(
    (skill as { executionMode?: string | null }).executionMode ?? ""
  );
  if (
    executionMode === "llm-only" ||
    executionMode === "enhance-prompt" ||
    executionMode === "core-text"
  ) {
    const prompt = params.prompt || `Use skill: ${skill.name}`;
    const extraParams =
      params.extraParams && typeof params.extraParams === "object"
        ? (params.extraParams as Record<string, unknown>)
        : {};
    const executionPolicy = await resolveSkillExecutionPolicy({
      skill,
      conversationModel:
        typeof params.context?.conversationModel === "string"
          ? params.context.conversationModel
          : undefined,
    });
    const systemPrompt =
      typeof (skill as { systemPrompt?: unknown }).systemPrompt === "string"
        ? String((skill as { systemPrompt: string }).systemPrompt).slice(
            0,
            12000
          )
        : "";
    const knowledgebase =
      typeof (skill as { knowledgebase?: unknown }).knowledgebase === "string"
        ? String((skill as { knowledgebase: string }).knowledgebase).slice(
            0,
            8000
          )
        : "";
    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt || knowledgebase) {
      messages.push({
        role: "system",
        content: `${systemPrompt}${knowledgebase ? `\n\n[DOMAIN KNOWLEDGE]\n${knowledgebase}` : ""}`,
      });
    }
    const formContext = Object.entries(extraParams)
      .filter(
        ([key, value]) =>
          value !== undefined &&
          value !== null &&
          value !== "" &&
          key !== "contextState"
      )
      .map(
        ([key, value]) =>
          `- ${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`
      )
      .join("\n");
    messages.push({
      role: "user",
      content: formContext
        ? `${prompt}\n\nForm inputs:\n${formContext}`
        : prompt,
    });

    const legacyExecute = () =>
      executeSkillLlmWithFallback({
        messages,
        skillSlug: skill.id,
        userId,
        executionPolicy,
        maxTokens: 4096,
      });
    const runtimeResult = await executeChatRuntimeTurn({
      tenantId,
      userId,
      objective: prompt,
      skillSlug: skill.id,
      executionPolicy,
      contextPackRequest: {
        surface: "chat",
        request: {
          channel: "chat",
          userId,
          tenantId,
          userMessage: prompt,
          dynamicParams: extraParams,
          conversationContext: {
            conversationId: params.conversationId
              ? Number(params.conversationId)
              : undefined,
            conversationModel:
              typeof params.context?.conversationModel === "string"
                ? params.context.conversationModel
                : undefined,
            activePersonaId:
              typeof params.context?.activePersonaId === "string"
                ? params.context.activePersonaId
                : undefined,
            publicUrl: params.publicUrl,
          },
        },
        tenantId,
        skillSystemPrompt: systemPrompt || null,
        knowledgebase: knowledgebase || null,
        dynamicParams: extraParams,
        label: "worker.skill.execute",
      },
      requestLabel: `worker:${skill.id}`,
      runId: typeof input.runId === "string" ? input.runId : lease.jobId,
      legacyExecute,
    });
    const result = runtimeResult.value;
    if (!result?.success)
      throw new Error(result?.error || "SKILL_LLM_EXECUTION_FAILED");
    const settlement = await settleSkillRun({
      runId: typeof input.runId === "string" ? input.runId : lease.jobId,
      userId,
      tenantId,
      skillSlug: skill.id,
      description: `Skill run: ${skill.name}`,
      metadata: {
        runtimeKind: "llm",
        originSurface: "worker",
        model: result.modelId ?? undefined,
        inputTokens: result.inputTokens ?? 0,
        outputTokens: result.outputTokens ?? 0,
      },
    });
    const conversationId = params.conversationId
      ? Number(params.conversationId)
      : null;
    if (
      conversationId &&
      Number.isSafeInteger(conversationId) &&
      result.content
    ) {
      await createMessage({
        conversationId,
        role: "assistant",
        content: result.content,
        inputTokens: result.inputTokens ?? 0,
        outputTokens: result.outputTokens ?? 0,
        creditsUsed: String(settlement.totalCredits),
        modelUsed: result.modelId,
        skillUsed: skill.id,
      });
    }
    await reporter.assertActive(lease);
    return {
      output: {
        skillExecutionResult: {
          success: true,
          skillId: skill.id,
          type: "text",
          message: result.content,
          creditsUsed: settlement.totalCredits,
          metadata: { modelId: result.modelId, runtime: "worker" },
        },
      },
    };
  }

  const result = await executeSkill(
    skill,
    {
      ...params,
      runId: typeof input.runId === "string" ? input.runId : lease.jobId,
    },
    userId,
    createInternalTokenFromAuth({ userId, tenantId }),
    tenantId
  );
  await reporter.assertActive(lease);
  if (!result.success) {
    throw new Error(result.error || "SKILL_EXECUTION_FAILED");
  }
  return { output: { skillExecutionResult: result } };
};
