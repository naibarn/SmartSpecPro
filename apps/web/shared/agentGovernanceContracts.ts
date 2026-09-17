import { z } from "zod";

export const sideEffectClassValues = [
  "read_only",
  "bounded_write",
  "external_write",
  "irreversible",
  "financial",
  "privileged",
] as const;
export const sideEffectClassSchema = z.enum(sideEffectClassValues);

export const evidenceRetentionTierValues = [
  "ephemeral",
  "standard",
  "extended",
  "regulated",
] as const;
export const evidenceRetentionTierSchema = z.enum(evidenceRetentionTierValues);

export const evidenceRedactionStateValues = [
  "summary_only",
  "redacted",
  "de_identified",
  "unscrubbed",
] as const;
export const evidenceRedactionStateSchema = z.enum(
  evidenceRedactionStateValues
);

export const bindingResolutionPolicyValues = [
  "pinned_version",
  "follow_benchmark_track",
  "follow_latest_ready_in_family",
] as const;
export const bindingResolutionPolicySchema = z.enum(
  bindingResolutionPolicyValues
);

export function sanitizeSensitiveRecord(
  value: unknown
): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value ?? {}), (_key, entry) => {
    if (typeof entry !== "string") return entry;
    return entry
      .replace(/api[_-]?key/gi, "[redacted]")
      .replace(/token/gi, "[redacted]")
      .replace(/secret/gi, "[redacted]")
      .replace(/password/gi, "[redacted]");
  }) as Record<string, unknown>;
}
