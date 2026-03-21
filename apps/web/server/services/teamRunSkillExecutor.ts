import { getSkillByIdAsync } from "./skillRegistry";
import { resolveSkillExecutionPolicy } from "./skillExecutionPolicy";
import { executeSkillLlmWithFallback } from "./skillModelFallback";
import { runPlanner, recordStepAttempt } from "./taskPlannerMiddleware";
import { composePrompt } from "./promptComposer";
import { calculateCreditsForLLMDynamic } from "./creditService";
import { detectProviderFamily, buildWebSearchParams } from "./webSearchToolInjector";
import { getProviderForModel } from "./llmRouter";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
import { executeUnified } from "./unifiedOrchestrator";
import type { UnifiedExecutionRequest } from "./executors/types";
import type { TeamRun } from "../../drizzle/schema";
import type { SkillDefinition } from "@smartspec/skills";

export interface TeamRunSkillExecutionInput {
  run: TeamRun;
  tenantId: string;
  userId: number;
  assistantId: string;
  assistantContext: {
    profile: {
      preferredModelId?: string | null;
      displayName?: string | null;
      roleTitle?: string | null;
    };
    agentModel?: string | null;
    personaContext?: string | null;
  };
  roomId: string;
  teamId: string;
  objective: string;
  route: {
    route: "chat" | "skill" | "agency";
    reason: string;
    selectedSkillId?: string;
  };
}

export interface TeamRunSkillExecutionResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  costCredits: number;
  metadata: Record<string, unknown>;
  skillId: string;
  nextSpeakerHint?: string;
}

const GENERAL_FALLBACK_SKILL_ID = "general-article-writer";

function parseNextSpeakerHint(content: string): { cleaned: string; hint?: string } {
  const match = content.match(/\[NEXT:\s*([^\]]+)\]/i);
  if (match) {
    return { cleaned: content.replace(match[0], "").trimEnd(), hint: match[1].trim() };
  }
  return { cleaned: content };
}

async function resolveTeamRunSkill(selectedSkillId?: string): Promise<SkillDefinition> {
  if (selectedSkillId) {
    const selected = await getSkillByIdAsync(selectedSkillId);
    if (selected) {
      return selected;
    }
  }

  const fallback = await getSkillByIdAsync(GENERAL_FALLBACK_SKILL_ID);
  if (fallback) {
    return fallback;
  }

  throw new Error(`No skill resolved for team run: tried ${selectedSkillId ?? "(none)"} and fallback ${GENERAL_FALLBACK_SKILL_ID}`);
}

export async function executeTeamRunSkillTurn(input: TeamRunSkillExecutionInput): Promise<TeamRunSkillExecutionResult> {
  // ── Unified Orchestrator Path (feature-flagged) ─────────────────
  let handledByUnified = false;
  try {
    const flags = await getTenantFeatureFlags(input.tenantId);
    if (flags.unifiedSkillExecution) {
      const request: UnifiedExecutionRequest = {
        channel: "team_room",
        userId: input.userId,
        tenantId: input.tenantId,
        userMessage: input.objective,
        teamContext: {
          assistantId: input.assistantId,
          roomId: input.roomId,
          teamId: input.teamId,
          runId: input.run.id,
          objective: input.objective,
        },
        routeHint: {
          selectedSkillId: input.route.selectedSkillId,
          route: input.route.route,
          reason: input.route.reason,
        },
        creditMode: "calculate_only",
      };

      const result = await executeUnified(request);
      handledByUnified = true;

      // Check for orchestrator-level error result
      if (result.route.reason === "orchestrator_error") {
        throw new Error(`Orchestrator error: ${result.metadata?.error || "unknown"}`);
      }

      return {
        content: result.result.type === "text" ? result.result.content : "",
        inputTokens: result.tokens.input,
        outputTokens: result.tokens.output,
        costCredits: result.costCredits,
        metadata: {
          unifiedPath: true,
          route: result.route.capability,
          routeReason: result.route.reason,
          selectedSkillId: result.skillId,
          nextSpeakerHint: result.nextSpeakerHint ?? null,
          attempts: result.telemetry.attempts,
          llmModelId: result.modelUsed,
        },
        skillId: result.skillId,
        nextSpeakerHint: result.nextSpeakerHint,
      };
    }
  } catch (err) {
    if (handledByUnified) {
      // Orchestrator committed but returned error result — fall through
      console.error("[teamRunSkillExecutor] Unified orchestrator error result, falling back:", err);
    } else {
      console.error("[teamRunSkillExecutor] Unified orchestrator failed, falling back:", err);
    }
    handledByUnified = false; // Reset so existing path runs
  }
  // ── END Unified Orchestrator Path ───────────────────────────────

  const skill = await resolveTeamRunSkill(input.route.selectedSkillId);

  const conversationModel = input.assistantContext.profile.preferredModelId ?? input.assistantContext.agentModel ?? undefined;
  const executionPolicy = await resolveSkillExecutionPolicy({
    skill,
    conversationModel,
  });

  const plannerResult = await runPlanner({
    sourceType: "skill",
    userId: input.userId,
    tenantId: input.tenantId,
    conversationModel,
    skillSlug: skill.id,
    executionPolicy: skill.executionPolicy,
  });

  const composed = await composePrompt({
    assistantId: input.assistantId,
    runId: input.run.id,
    roomId: input.roomId,
    teamId: input.teamId,
    objective: input.objective,
    tenantId: input.tenantId,
  });

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
  if (skill.systemPrompt) {
    messages.push({ role: "system", content: skill.systemPrompt });
  }
  for (const msg of composed.messages) {
    const role = msg.role === "system" ? "system" as const
      : msg.role === "assistant" ? "assistant" as const
      : "user" as const;
    messages.push({ role, content: msg.content });
  }

  // Determine if web search should be enabled for this turn
  const requiresWebSearch =
    skill.executionPolicy?.requires_web_search === true ||
    skill.executionPolicy?.requirements?.supportsWebSearch === true ||
    input.route.reason?.includes("web_search") ||
    false;

  let extraBodyParams: Record<string, unknown> | undefined;
  if (requiresWebSearch && executionPolicy.modelId) {
    try {
      // Resolve actual provider to inject correct web search tool format
      const provider = await getProviderForModel(executionPolicy.modelId, {
        preferredProviderId: executionPolicy.preferredProviderId ?? undefined,
        strictProviderPin: executionPolicy.strictProviderPin ?? undefined,
      });
      if (provider) {
        const family = detectProviderFamily(provider.providerName);
        const webParams = buildWebSearchParams(family);
        extraBodyParams = webParams.bodyParams;

        // Append web search instruction if provider doesn't support native tools
        if (webParams.systemPromptSuffix && messages.length > 0 && messages[0].role === "system") {
          messages[0] = {
            ...messages[0],
            content: messages[0].content + webParams.systemPromptSuffix,
          };
        }
      }
    } catch {
      // Provider resolution failed — proceed without web search (non-blocking)
    }
  }

  const fallback = await executeSkillLlmWithFallback({
    messages,
    skillSlug: skill.id,
    userId: input.userId,
    executionPolicy,
    enableThinking: skill.executionPolicy?.thinking_level_hint === "high" || skill.executionPolicy?.thinking_level_hint === "medium" || undefined,
    extraBodyParams,
  });

  if (!fallback.success) {
    throw new Error(fallback.error || `Skill execution failed for ${skill.id}`);
  }

  const rawContent = fallback.content ?? "";
  const { cleaned, hint: nextSpeakerHint } = parseNextSpeakerHint(rawContent);

  const costCredits = await calculateCreditsForLLMDynamic(
    fallback.inputTokens ?? 0,
    fallback.outputTokens ?? 0,
    fallback.modelId ?? executionPolicy.modelId ?? "unknown",
  );

  if (plannerResult) {
    recordStepAttempt({
      taskRunId: plannerResult.taskRunId,
      plan: plannerResult.plan,
      model: fallback.modelId ?? executionPolicy.modelId ?? "unknown",
      provider: fallback.provider?.providerName,
      inputTokens: fallback.inputTokens ?? 0,
      outputTokens: fallback.outputTokens ?? 0,
      snapshot: plannerResult.snapshot,
      creditsUsed: costCredits,
    }).catch(() => {});
  }

  return {
    content: cleaned,
    inputTokens: fallback.inputTokens ?? 0,
    outputTokens: fallback.outputTokens ?? 0,
    costCredits,
    metadata: {
      route: "skill",
      routeReason: input.route.reason,
      selectedSkillId: skill.id,
      nextSpeakerHint: nextSpeakerHint ?? null,
      planner: plannerResult ? {
        taskRunId: plannerResult.taskRunId,
        resolvedModel: plannerResult.resolvedModel,
      } : null,
      llmModelId: fallback.modelId ?? executionPolicy.modelId ?? null,
      attempts: fallback.attempts,
    },
    skillId: skill.id,
    nextSpeakerHint,
  };
}
