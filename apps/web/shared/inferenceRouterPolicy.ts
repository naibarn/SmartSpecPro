import { z } from "zod";

const weightPpm = z.number().int().safe().min(0).max(1_000_000);

/** Versioned score calibration stored in the immutable platform policy snapshot. */
export const inferenceRouterPolicySchema = z
  .object({
    scoreCalibrationRevision: z.string().trim().min(1).max(256),
    weights: z
      .object({
        qualityPpm: weightPpm,
        costPpm: weightPpm,
        latencyPpm: weightPpm,
        reliabilityPpm: weightPpm,
        compatibilityPpm: weightPpm,
      })
      .strict()
      .refine(
        weights =>
          Object.values(weights).reduce((total, value) => total + value, 0) ===
          1_000_000,
        "Routing weights must sum to 1,000,000 ppm"
      ),
  })
  .strict();

export type InferenceRouterPolicy = z.infer<typeof inferenceRouterPolicySchema>;

export const DEFAULT_INFERENCE_ROUTER_POLICY: InferenceRouterPolicy = {
  scoreCalibrationRevision: "scores:spec231-default-1",
  weights: {
    qualityPpm: 800_000,
    costPpm: 50_000,
    latencyPpm: 50_000,
    reliabilityPpm: 50_000,
    compatibilityPpm: 50_000,
  },
};
