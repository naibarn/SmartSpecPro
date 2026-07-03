import type { AgeSafetyDecision, SafetyActorContext } from "../../shared/ageSafetyPolicy";
import { buildProviderAgePolicyInstruction, enforceAgePolicy } from "./agePolicyEnforcer";
import type { AgeSafetyPolicyModeInput } from "./ageSafetyPolicyService";

export type ChatSafetyModerationCategory =
  | "sexual_content"
  | "graphic_violence"
  | "self_harm_instruction"
  | "illegal_instruction"
  | "none";

export type ChatSafetyResult = {
  allowed: boolean;
  decision: AgeSafetyDecision;
  category: ChatSafetyModerationCategory;
  providerInstruction: string;
  response?: {
    code: string;
    message: string;
    missingFields?: string[];
    nextAllowedRoute?: string;
    actualAgeBand?: string;
    enforcementAgeBand?: string;
    jurisdictionPresetId?: string;
  };
};

const RESTRICTED_PROMPT_PATTERNS: Array<[ChatSafetyModerationCategory, RegExp]> = [
  ["sexual_content", /\b(?:explicit sex|porn|nude child|minor sexual|rape fantasy)\b/i],
  ["graphic_violence", /\b(?:gore|dismember|torture|graphic murder)\b/i],
  ["self_harm_instruction", /\b(?:how to (?:kill myself|self harm)|suicide method|cut myself)\b/i],
  ["illegal_instruction", /\b(?:make a bomb|bypass age gate|fake id|steal credit card)\b/i],
];

export function extractChatText(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  return messages
    .map((message) => {
      if (!message || typeof message !== "object") return "";
      const content = (message as { content?: unknown }).content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        return content
          .map((part) => {
            if (typeof part === "string") return part;
            if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
              return (part as { text: string }).text;
            }
            return "";
          })
          .join("\n");
      }
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .slice(-12000);
}

export function detectChatSafetyCategory(text: string): ChatSafetyModerationCategory {
  for (const [category, pattern] of RESTRICTED_PROMPT_PATTERNS) {
    if (pattern.test(text)) return category;
  }
  return "none";
}

export function shouldHardBlockCategory(category: ChatSafetyModerationCategory): boolean {
  return category === "illegal_instruction" || category === "self_harm_instruction";
}

export function shouldMinorBlockCategory(category: ChatSafetyModerationCategory): boolean {
  return category === "sexual_content" || category === "graphic_violence";
}

export function evaluateChatRequest(input: {
  actor: SafetyActorContext;
  messages: unknown;
  now?: Date;
  flags?: AgeSafetyPolicyModeInput["flags"];
  policy?: AgeSafetyPolicyModeInput["policy"];
  audit?: boolean;
}): ChatSafetyResult {
  const enforcement = enforceAgePolicy({
    actor: input.actor,
    surface: "chat",
    action: "submit_prompt",
    protectedSurfaceScope: "age-policy:temporary-adult",
    now: input.now,
    flags: input.flags,
    policy: input.policy,
    audit: input.audit,
  });
  const category = detectChatSafetyCategory(extractChatText(input.messages));
  const adultUnlocked = input.actor.protectedSurfaceScopes?.includes("age-policy:temporary-adult") === true;
  const contentBlocked =
    shouldHardBlockCategory(category) ||
    (shouldMinorBlockCategory(category) && enforcement.decision.enforcementAgeBand !== "adult" && !adultUnlocked);
  const decision = contentBlocked
    ? {
        ...enforcement.decision,
        allowed: false,
        effect: "block" as const,
        reasonCode: `age_policy_chat_${category}`,
      }
    : enforcement.decision;
  return {
    allowed: decision.allowed,
    decision,
    category,
    providerInstruction: buildProviderAgePolicyInstruction(decision),
    response: decision.allowed
      ? undefined
      : contentBlocked
        ? {
            code: decision.reasonCode,
            message: "This chat request is restricted by content-safety policy.",
            actualAgeBand: decision.actualAgeBand,
            enforcementAgeBand: decision.enforcementAgeBand,
            jurisdictionPresetId: decision.jurisdictionPresetId,
          }
        : enforcement.response ?? {
          code: decision.reasonCode,
          message: "This chat request is restricted by age-safety policy.",
        },
  };
}

export function evaluateChatOutput(input: {
  actor: SafetyActorContext;
  outputText: string;
  now?: Date;
  flags?: AgeSafetyPolicyModeInput["flags"];
  policy?: AgeSafetyPolicyModeInput["policy"];
}): ChatSafetyResult {
  const enforcement = enforceAgePolicy({
    actor: input.actor,
    surface: "chat",
    action: "receive_output",
    protectedSurfaceScope: "age-policy:temporary-adult",
    now: input.now,
    flags: input.flags,
    policy: input.policy,
  });
  const category = detectChatSafetyCategory(input.outputText);
  const adultUnlocked = input.actor.protectedSurfaceScopes?.includes("age-policy:temporary-adult") === true;
  const contentBlocked =
    shouldHardBlockCategory(category) ||
    (shouldMinorBlockCategory(category) && enforcement.decision.enforcementAgeBand !== "adult" && !adultUnlocked);
  const decision = contentBlocked
    ? {
        ...enforcement.decision,
        allowed: false,
        effect: "block" as const,
        reasonCode: `age_policy_chat_output_${category}`,
      }
    : enforcement.decision;
  return {
    allowed: decision.allowed,
    decision,
    category,
    providerInstruction: buildProviderAgePolicyInstruction(decision),
    response: decision.allowed
      ? undefined
      : {
          code: decision.reasonCode,
          message: "This chat response was replaced by an age-appropriate safety response.",
        },
  };
}
