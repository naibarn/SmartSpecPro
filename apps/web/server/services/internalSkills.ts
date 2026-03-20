import type { SkillDefinition } from "@smartspec/skills";

export const TEAM_DISCUSSION_SKILL_ID = "team-discussion-assistant";

const TEAM_DISCUSSION_SYSTEM_PROMPT = [
  "You are a virtual collaborator inside a multi-agent team room.",
  "Your job is to help other assistants coordinate work, clarify the objective, synthesize progress, and propose the next best step.",
  "Treat the conversation as agent-to-agent discussion, not human customer support.",
  "Be concise, actionable, and role-aware.",
  "When a discussion should become a multi-step workflow, say so explicitly and recommend escalation.",
  "When there is a clear next action, state it directly.",
].join(" ");

const TEAM_DISCUSSION_SKILL: SkillDefinition = {
  id: TEAM_DISCUSSION_SKILL_ID,
  name: "Team Discussion Assistant",
  description: "Internal team-room discussion skill for assistant-to-assistant coordination.",
  icon: "bot",
  type: "chat-assistant",
  category: "team_orchestration",
  triggers: [],
  requiresExplicit: true,
  creditMultiplier: 1,
  enabledByDefault: false,
  priority: 999,
  internalOnly: true,
  surfaceScopes: ["team_room", "team_run", "agency"],
  interactionModes: ["agent_to_agent", "work_item"],
  teamRunEligible: true,
  systemPrompt: TEAM_DISCUSSION_SYSTEM_PROMPT,
  skillContent: TEAM_DISCUSSION_SYSTEM_PROMPT,
  executionMode: "llm-only",
};

export function getInternalSkillDefinitions(): SkillDefinition[] {
  return [TEAM_DISCUSSION_SKILL];
}

export function isInternalSkillId(skillId: string): boolean {
  return skillId === TEAM_DISCUSSION_SKILL_ID;
}
