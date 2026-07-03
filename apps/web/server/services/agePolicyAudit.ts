import type { AuditEventType } from "./auditLogger";
import { auditLogger } from "./auditLogger";
import type { AgeSafetyDecision } from "../../shared/ageSafetyPolicy";

const SENSITIVE_KEYS = new Set([
  "dateOfBirth",
  "dob",
  "pin",
  "pinHash",
  "token",
  "authorization",
  "prompt",
  "messages",
  "providerPayload",
  "referenceAudioBase64",
]);

export function redactAgeSafetyMetadata(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redactAgeSafetyMetadata);
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key) || SENSITIVE_KEYS.has(key.toLowerCase())) {
      output[key] = "[REDACTED]";
    } else {
      output[key] = redactAgeSafetyMetadata(item);
    }
  }
  return output;
}

export function logAgeSafetyDecision(params: {
  userId?: number | null;
  tenantId?: string | null;
  decision: AgeSafetyDecision;
  metadata?: Record<string, unknown>;
}): void {
  const eventType: AuditEventType = params.decision.wouldBlock
    ? "age_safety_observe_would_block"
    : params.decision.effect === "require_review"
      ? "age_safety_review_required"
      : "age_safety_policy_decision";
  auditLogger.log({
    eventType,
    userId: params.userId ?? null,
    tenantId: params.tenantId ?? null,
    metadata: redactAgeSafetyMetadata({
      decision: {
        allowed: params.decision.allowed,
        effect: params.decision.effect,
        reasonCode: params.decision.reasonCode,
        actualAgeBand: params.decision.actualAgeBand,
        enforcementAgeBand: params.decision.enforcementAgeBand,
        policyVersion: params.decision.policyVersion,
        jurisdictionPresetId: params.decision.jurisdictionPresetId,
        policySnapshotHash: params.decision.metadata.policySnapshotHash,
      },
      ...params.metadata,
    }) as Record<string, unknown>,
  });
}
