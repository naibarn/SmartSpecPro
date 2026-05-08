import { addCredits, deductCredits } from "../creditService";
import { stableIdempotencyKey } from "./voiceAgentSecurity";

const DEFAULT_MINIMUM_SESSION_CREDITS = 1;

export async function reserveVoiceAgentCredits(input: {
  tenantId: string;
  userId: number;
  conversationId: number;
  sessionId: number;
  amount?: number;
}) {
  const amount = input.amount ?? DEFAULT_MINIMUM_SESSION_CREDITS;
  return deductCredits({
    userId: input.userId,
    amount,
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    description: "Voice agent session reserve",
    sourceType: "voice_agent",
    idempotencyKey: stableIdempotencyKey(["voice-agent", "reserve", input.sessionId]),
    metadata: { voiceAgentSessionId: input.sessionId },
  });
}

export async function releaseVoiceAgentCredits(input: {
  userId: number;
  conversationId: number;
  sessionId: number;
  amount: number;
}) {
  if (input.amount <= 0) return null;
  return addCredits({
    userId: input.userId,
    amount: input.amount,
    type: "refund",
    conversationId: input.conversationId,
    description: "Voice agent unused reserve release",
    sourceType: "voice_agent",
    idempotencyKey: stableIdempotencyKey(["voice-agent", "release", input.sessionId]),
    metadata: { voiceAgentSessionId: input.sessionId },
  });
}
