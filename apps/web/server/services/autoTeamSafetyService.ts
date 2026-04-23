import crypto from "crypto";
import { assertCanonicalArtifactRef, validateArtifactRef, type AutoTeamArtifactRef } from "../../shared/autoTeamExecution";

export interface AutoTeamSafetyEvaluation {
  safe: boolean;
  status: "safe" | "needs_review" | "blocked" | "redacted" | "unknown";
  reason: string | null;
  redactedText: string | null;
}

export function redactSensitiveText(input: string): string {
  return input
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/https?:\/\/[^\s)]+/gi, "[redacted-url]")
    .replace(/\bsk-[A-Za-z0-9]{8,}\b/g, "[redacted-key]")
    .replace(/\btoken=[^&\s]+/gi, "token=[redacted]");
}

export function sanitizeProviderPayload<T extends Record<string, unknown>>(input: T): T {
  const payload = JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
  for (const key of [
    "auth",
    "authorization",
    "apiKey",
    "token",
    "userToken",
    "privateUrl",
    "signedUrl",
    "secret",
  ]) {
    if (key in payload) delete payload[key];
  }
  return payload as T;
}

export function validateAutoTeamMediaOutputSafety(input: {
  routeClass: string;
  artifact?: AutoTeamArtifactRef | null;
  providerResponse?: string | null;
  metadata?: Record<string, unknown> | null;
}): AutoTeamSafetyEvaluation {
  const rawText = [input.providerResponse ?? "", JSON.stringify(input.metadata ?? {})].join(" ");
  const redactedText = redactSensitiveText(rawText);
  if (/malware|exploit|credential|password|secret/i.test(rawText)) {
    return {
      safe: false,
      status: "blocked",
      reason: "unsafe_output_detected",
      redactedText,
    };
  }

  if (input.artifact) {
    if (!validateArtifactRef(input.artifact)) {
      return {
        safe: false,
        status: "blocked",
        reason: "invalid_artifact_ref",
        redactedText,
      };
    }
    try {
      assertCanonicalArtifactRef(input.artifact);
    } catch (error) {
      return {
        safe: false,
        status: "blocked",
        reason: error instanceof Error ? error.message : "artifact_validation_failed",
        redactedText,
      };
    }
  }

  return {
    safe: true,
    status: "safe",
    reason: null,
    redactedText,
  };
}

export function buildSafetyHash(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}
