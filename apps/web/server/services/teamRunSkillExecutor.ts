import { getSkillByIdAsync } from "./skillRegistry";
import { resolveSkillExecutionPolicy } from "./skillExecutionPolicy";
import { executeSkillLlmWithFallback } from "./skillModelFallback";
import { runPlanner, recordStepAttempt } from "./taskPlannerMiddleware";
import { composePrompt } from "./promptComposer";
import { calculateCreditsForLLMDynamic } from "./creditService";
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
    route: "chat" | "skill";
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
  const match = content.match(/\s*\[NEXT:\s*([^\]]+)\]\s*$/i);
  if (match) {
    return { cleaned: content.slice(0, match.index).trimEnd(), hint: match[1].trim() };
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

  const fallback = await executeSkillLlmWithFallback({
    messages,
    skillSlug: skill.id,
    userId: input.userId,
    executionPolicy,
    enableThinking: skill.executionPolicy?.thinking_level_hint === "high" || skill.executionPolicy?.thinking_level_hint === "medium" || undefined,
  });

  if (!fallback.success) {
    throw new Error(fallback.error || `Skill execution failed for ${skill.id}`);
  }

  if (plannerResult) {
    recordStepAttempt({
      taskRunId: plannerResult.taskRunId,
      plan: plannerResult.plan,
      model: fallback.modelId ?? executionPolicy.modelId ?? "unknown",
      provider: fallback.provider?.providerName,
      inputTokens: fallback.inputTokens ?? 0,
      outputTokens: fallback.outputTokens ?? 0,
      snapshot: plannerResult.snapshot,
      creditsUsed: 0,
    }).catch(() => {});
  }

  const rawContent = fallback.content ?? "";
  const { cleaned, hint: nextSpeakerHint } = parseNextSpeakerHint(rawContent);

  const costCredits = await calculateCreditsForLLMDynamic(
    fallback.inputTokens ?? 0,
    fallback.outputTokens ?? 0,
    fallback.modelId ?? executionPolicy.modelId ?? "unknown",
  );

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
