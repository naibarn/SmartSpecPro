import { z } from "zod";
import type { InferenceAuthoritySnapshot } from "./policyResolver";

const idList = z.array(z.string().trim().min(1).max(256)).max(512);
const ppm = z.number().int().safe().min(0).max(1_000_000);

/** Runtime validation for authority data crossing persistence/service boundaries. */
export const inferenceAuthoritySnapshotSchema = z
  .object({
    tenantId: z.string().trim().min(1).max(256),
    principalId: z.string().trim().min(1).max(256),
    policyRevision: z.string().trim().min(1).max(256),
    platformPolicyReady: z.boolean(),
    tenantPolicyReady: z.boolean(),
    emergencyRevocationFresh: z.boolean(),
    budgetAuthorityReady: z.boolean(),
    platformAllowedProviderIds: idList,
    tenantAllowedProviderIds: idList,
    principalAllowedProviderIds: idList,
    allowedCredentialOwnerRefs: idList,
    allowedRegions: idList,
    requireZeroDataRetention: z.boolean(),
    availableBudgetMicros: z.number().int().safe().min(0),
    revokedModelProfileIds: idList,
    revokedDeploymentIds: idList,
    observedAtMs: z.number().int().safe().min(0),
    registryRevision: z.string().trim().min(1).max(256),
    routerPolicyRevision: z.string().trim().min(1).max(256),
    scoreCalibrationRevision: z.string().trim().min(1).max(256),
    routingWeights: z
      .object({
        qualityPpm: ppm,
        costPpm: ppm,
        latencyPpm: ppm,
        reliabilityPpm: ppm,
        compatibilityPpm: ppm,
      })
      .strict(),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const weights = Object.values(snapshot.routingWeights);
    if (weights.reduce((sum, weight) => sum + weight, 0) !== 1_000_000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["routingWeights"],
        message: "routing weights must sum to 1,000,000 ppm",
      });
    }
  });

export type AuthoritySnapshotValidation =
  | { ok: true; snapshot: InferenceAuthoritySnapshot }
  | { ok: false; fields: string[] };

export function validateInferenceAuthoritySnapshot(
  input: unknown,
  nowMs: number
): AuthoritySnapshotValidation {
  const parsed = inferenceAuthoritySnapshotSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      fields: [
        ...new Set(
          parsed.error.issues.map(issue => issue.path.join(".") || "snapshot")
        ),
      ].sort(),
    };
  }
  if (
    !Number.isSafeInteger(nowMs) ||
    nowMs < 0 ||
    parsed.data.observedAtMs > nowMs
  ) {
    return { ok: false, fields: ["observedAtMs"] };
  }
  return { ok: true, snapshot: parsed.data };
}
