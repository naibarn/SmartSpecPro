import { classifyIntent } from "./skillIntentClassifier";
import { detectSkill } from "./skillDetector";
import { TEAM_DISCUSSION_SKILL_ID } from "./internalSkills";

export type RoomIntentOrigin = "human_user" | "assistant" | "system";
export type RoomIntentContext = "room_message" | "run_turn" | "work_item";
export type RoomExecutionRoute = "chat" | "skill" | "agency";

export interface RoomIntentRouterInput {
  message: string;
  origin: RoomIntentOrigin;
  context: RoomIntentContext;
  userId: number;
  tenantId: string;
  conversationId?: number;
  teamId?: string;
  roomId?: string;
  hasImages?: boolean;
  assistantId?: string;
}

export interface RoomIntentDecision {
  route: RoomExecutionRoute;
  reason: string;
  selectedSkillId?: string;
  confidence: number;
  source: "rules" | "skill-detect" | "classifier" | "fallback";
  agencyEscalation?: boolean;
}

const TASK_SIGNAL_RE = /\b(ทำ|ช่วย|สร้าง|เขียน|สรุป|วิเคราะห์|รีวิว|review|draft|plan|research|generate|compose|design|build|fix|analyze|compare|evaluate|outline)\b/i;
const CHAT_SIGNAL_RE = /\b(hi|hello|สวัสดี|ขอบคุณ|thanks|how are you|เป็นไง|คุย|chat)\b/i;
const AGENCY_SIGNAL_RE = /\b(agency|multi[- ]step|หลายขั้น|workflow|orchestrate|delegate|coordinate|escalate|escalation)\b/i;

export async function routeRoomIntent(input: RoomIntentRouterInput): Promise<RoomIntentDecision> {
  const normalized = input.message.trim();
  if (!normalized) {
    return {
      route: "chat",
      reason: "empty_message",
      confidence: 0,
      source: "rules",
    };
  }

  const lower = normalized.toLowerCase();
  const explicitAgency = AGENCY_SIGNAL_RE.test(normalized);
  if (explicitAgency) {
    return {
      route: "agency",
      reason: "explicit_agency_signal",
      confidence: 0.92,
      source: "rules",
      agencyEscalation: true,
    };
  }

  if (input.origin !== "human_user") {
    return {
      route: "skill",
      reason: "assistant_discussion_default",
      selectedSkillId: TEAM_DISCUSSION_SKILL_ID,
      confidence: 0.8,
      source: "fallback",
    };
  }

  const detection = await detectSkill(normalized, input.conversationId, undefined, input.userId);
  if (detection.detected && detection.skill && detection.confidence >= 0.7) {
    return {
      route: "skill",
      reason: detection.matchedTrigger
        ? `skill_trigger:${detection.matchedTrigger}`
        : "skill_detected",
      selectedSkillId: detection.skill.id,
      confidence: detection.confidence,
      source: "skill-detect",
    };
  }

  const shouldClassify =
    TASK_SIGNAL_RE.test(normalized) ||
    normalized.startsWith("/") ||
    normalized.includes("?") ||
    normalized.length > 30;

  if (shouldClassify) {
    const classification = await classifyIntent(
      normalized,
      input.userId,
      input.tenantId,
      input.conversationId,
      undefined,
      { hasImages: input.hasImages },
    );

    if (classification) {
      const topSkill = classification.skills[0];
      if (classification.level === "complex") {
        return {
          route: "agency",
          reason: `classifier_complex:${classification.strategy}`,
          confidence: topSkill?.confidence ?? 0.7,
          source: "classifier",
          agencyEscalation: true,
        };
      }

      if (topSkill && topSkill.confidence >= 0.65) {
        return {
          route: "skill",
          reason: `classifier_skill:${topSkill.skillId}`,
          selectedSkillId: topSkill.skillId,
          confidence: topSkill.confidence,
          source: "classifier",
        };
      }
    }
  }

  if (CHAT_SIGNAL_RE.test(lower)) {
    return {
      route: "chat",
      reason: "conversation_signal",
      confidence: 0.6,
      source: "rules",
    };
  }

  return {
    route: "chat",
    reason: "default_chat",
    confidence: 0.5,
    source: "fallback",
  };
}
