/**
 * Routing Telemetry — audit logging for skill routing decisions.
 *
 * Records every routing decision for debugging and feedback loop.
 *
 * Part of Feature 021: Hybrid Skill Orchestrator.
 */

import type { TaskProfile } from "./taskProfileParser";
import type { RoutingStrategy } from "./routingFallbackLadder";

export interface RoutingDecisionLog {
  timestamp: string;
  tenantId: string;
  userId: number;
  roomId?: string;
  message: string;
  taskProfile: TaskProfile;
  policyReasons: string[];
  candidateCount: number;
  topCandidateScore: number;
  strategy: RoutingStrategy;
  selectedSkillId: string | undefined;
  routingLatencyMs: number;
  llmClassifierUsed: boolean;
}

/**
 * Truncate and sanitize message for logging — strip potential PII.
 * Keeps only the first 80 chars, replaces email/phone patterns.
 */
function sanitizeMessageForLog(message: string): string {
  return message
    .substring(0, 80)
    .replace(/[\w.-]+@[\w.-]+\.\w+/g, "[email]")
    .replace(/\b0[689]\d{7,8}\b/g, "[phone]")
    .replace(/\+\d{8,15}/g, "[phone]")
    + (message.length > 80 ? "…" : "");
}

/**
 * Record a routing decision to the audit log.
 * PII is sanitized — only truncated message prefix is logged.
 */
export function recordRoutingDecision(log: RoutingDecisionLog): void {
  console.log(
    JSON.stringify({
      eventType: "routing_decision",
      ...log,
      message: sanitizeMessageForLog(log.message),
    }),
  );
}

/** Historical success rate cache — populated from audit logs */
const _successRateCache = new Map<string, { rate: number; updatedAt: number }>();
const SUCCESS_RATE_TTL_MS = 300_000; // 5 minutes

/**
 * Get historical success rate for a skill in routing.
 * Returns 0.5 (neutral) when no data is available.
 */
export function getHistoricalSuccessRate(skillId: string): number {
  const cached = _successRateCache.get(skillId);
  if (cached && Date.now() - cached.updatedAt < SUCCESS_RATE_TTL_MS) {
    return cached.rate;
  }
  // Default neutral — future: query audit logs for actual success rate
  return 0.5;
}

/**
 * Update historical success rate for a skill.
 * Called after a routing outcome is known (e.g., user accepted/rejected result).
 */
export function updateSuccessRate(skillId: string, rate: number): void {
  _successRateCache.set(skillId, { rate: Math.max(0, Math.min(1, rate)), updatedAt: Date.now() });
}
