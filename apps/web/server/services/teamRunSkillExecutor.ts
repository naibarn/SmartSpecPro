import { getSkillByIdAsync } from "./skillRegistry";
import { resolveSkillExecutionPolicy } from "./skillExecutionPolicy";
import { executeSkillLlmWithFallback } from "./skillModelFallback";
import { runPlanner, recordStepAttempt } from "./taskPlannerMiddleware";
import { composePrompt } from "./promptComposer";
import { executeAgentTurn } from "./teamOrchestrationBridge";
import { TEAM_DISCUSSION_SKILL_ID } from "./internalSkills";
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
}

function isLlmStyleSkill(skill: SkillDefinition): boolean {
  return (
    skill.executionMode === "llm-only" ||
    skill.executionMode === "core-text" ||
    skill.executionMode === "enhance-prompt" ||
    skill.type === "chat-assistant" ||
    skill.type === "translation" ||
    skill.type === "document-analysis" ||
    skill.type === "code-assistant" ||
    skill.type === "web-search"
  );
}

function isTeamRunEligibleSkill(skill: SkillDefinition): boolean {
  return Boolean(skill.internalOnly || skill.teamRunEligible || skill.type === "chat-assistant");
}

function formatPromptMessagesForAgent(messages: Array<{ role: string; content: string }>): string {
  return messages
    .map((message) => `[${message.role.toUpperCase()}]\n${message.content}`.trim())
    .join("\n\n");
}

async function resolveTeamRunSkill(selectedSkillId?: string): Promise<SkillDefinition> {
  if (selectedSkillId) {
    const selected = await getSkillByIdAsync(selectedSkillId);
    if (selected && isTeamRunEligibleSkill(selected)) {
      return selected;
    }
  }

  const internal = await getSkillByIdAsync(TEAM_DISCUSSION_SKILL_ID);
  if (internal) {
    return internal;
  }

  throw new Error(`Skill not found: ${selectedSkillId ?? TEAM_DISCUSSION_SKILL_ID}`);
}

export async function executeTeamRunSkillTurn(input: TeamRunSkillExecutionInput): Promise<TeamRunSkillExecutionResult> {
  const skill = await resolveTeamRunSkill(input.route.selectedSkillId);

  // Agency route keeps the existing multi-agent orchestration path as a fallback.
  if (input.route.route === "agency") {
    const composed = await composePrompt({
      assistantId: input.assistantId,
      runId: input.run.id,
      roomId: input.roomId,
      teamId: input.teamId,
      objective: input.objective,
    });

    const direct = await executeAgentTurn({
      runId: input.run.id,
      assistantId: input.assistantId,
      roomId: input.roomId,
      teamId: input.teamId,
      tenantId: input.tenantId,
      userId: input.userId,
      modelId: input.assistantContext.profile.preferredModelId ?? input.assistantContext.agentModel ?? undefined,
      personaContext: input.assistantContext.personaContext ?? undefined,
      prompt: formatPromptMessagesForAgent(composed.messages),
    });

    return {
      content: direct.content,
      inputTokens: direct.tokenUsage.inputTokens,
      outputTokens: direct.tokenUsage.outputTokens,
      costCredits: direct.costCredits,
      metadata: {
        route: "agency",
        routeReason: input.route.reason,
        selectedSkillId: skill.id,
        nextSpeakerHint: direct.nextSpeakerHint ?? null,
        runtimeMetadata: direct.metadata ?? {},
        directFallback: true,
      },
      skillId: skill.id,
    };
  }

  if (!isLlmStyleSkill(skill)) {
    const composed = await composePrompt({
      assistantId: input.assistantId,
      runId: input.run.id,
      roomId: input.roomId,
      teamId: input.teamId,
      objective: input.objective,
    });

    const direct = await executeAgentTurn({
      runId: input.run.id,
      assistantId: input.assistantId,
      roomId: input.roomId,
      teamId: input.teamId,
      tenantId: input.tenantId,
      userId: input.userId,
      modelId: input.assistantContext.profile.preferredModelId ?? input.assistantContext.agentModel ?? undefined,
      personaContext: input.assistantContext.personaContext ?? undefined,
      prompt: formatPromptMessagesForAgent(composed.messages),
    });

    return {
      content: direct.content,
      inputTokens: direct.tokenUsage.inputTokens,
      outputTokens: direct.tokenUsage.outputTokens,
      costCredits: direct.costCredits,
      metadata: {
        route: "skill",
        routeReason: input.route.reason,
        selectedSkillId: skill.id,
        nextSpeakerHint: direct.nextSpeakerHint ?? null,
        runtimeMetadata: direct.metadata ?? {},
        directFallback: true,
      },
      skillId: skill.id,
    };
  }

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

  const messages = [
    ...(skill.systemPrompt
      ? [{ role: "system" as const, content: skill.systemPrompt }]
      : []),
    { role: "user" as const, content: formatPromptMessagesForAgent(composed.messages) },
  ];

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
      creditsUsed: fallback.totalDurationMs ? 0 : 0,
    }).catch(() => {});
  }

  return {
    content: fallback.content ?? "",
    inputTokens: fallback.inputTokens ?? 0,
    outputTokens: fallback.outputTokens ?? 0,
    costCredits: 0,
    metadata: {
      route: "skill",
      routeReason: input.route.reason,
      selectedSkillId: skill.id,
      planner: plannerResult ? {
        taskRunId: plannerResult.taskRunId,
        resolvedModel: plannerResult.resolvedModel,
      } : null,
      llmModelId: fallback.modelId ?? executionPolicy.modelId ?? null,
      attempts: fallback.attempts,
    },
    skillId: skill.id,
  };
}
