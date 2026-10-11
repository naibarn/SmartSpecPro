import { z } from "zod";

const id = z.string().trim().min(1).max(256);
const nonNegativeSafeInteger = z.number().int().safe().min(0);

export const deploymentProbeChecksSchema = z
  .object({
    basicRequestResponse: z.boolean(),
    chatResponsesParity: z.boolean(),
    streamingCancellation: z.boolean(),
    toolsContinuation: z.boolean(),
    strictSchema: z.boolean(),
    reasoningUsage: z.boolean(),
    multimodal: z.boolean(),
    contextOutputLimits: z.boolean(),
    regionRetention: z.boolean(),
    credentialOwnership: z.boolean(),
  })
  .strict();

export const logicalModelProfileSchema = z
  .object({
    logicalModelId: id,
    revision: id,
    providerNativeModelId: id,
    lifecycle: z.enum([
      "DISCOVERED",
      "METADATA_VALIDATED",
      "POLICY_REVIEWED",
      "CAPABILITY_TESTED",
      "EVALUATED",
      "SHADOW",
      "CANARY",
      "CERTIFIED",
      "ACTIVE",
      "DEGRADED",
      "QUARANTINED",
      "RETIRED",
    ]),
    capabilityRefs: z.array(id).max(128),
    capabilities: z
      .object({
        inputModalities: z
          .array(z.enum(["text", "image", "audio", "video", "file"]))
          .min(1)
          .max(5),
        outputModalities: z
          .array(z.enum(["text", "image", "audio", "video"]))
          .min(1)
          .max(4),
        features: z.array(id).max(128),
        toolContractRefs: z.array(id).max(128),
        maxContextTokens: z.number().int().min(1).max(10_000_000),
        maxOutputTokens: z.number().int().min(1).max(1_000_000),
      })
      .strict(),
  })
  .strict();

export const providerDeploymentProfileSchema = z
  .object({
    deploymentId: id,
    revision: id,
    logicalModelId: id,
    logicalModelRevision: id,
    providerId: id,
    credentialOwnerRef: id,
    endpointSurface: z.enum([
      "native_responses",
      "responses_compatible",
      "chat_compatible",
      "native_provider",
      "local",
    ]),
    executionSurface: z.enum(["cloud", "local"]),
    region: id,
    allowedRegions: z.array(id).min(1).max(64),
    allowedPrivacyClasses: z.array(id).min(1).max(64),
    retention: z.enum([
      "zero-data-retention",
      "limited-retention",
      "standard-retention",
      "unknown",
    ]),
    status: z.enum(["ACTIVE", "DEGRADED", "QUARANTINED", "RETIRED"]),
    health: z.enum(["healthy", "degraded", "unavailable"]),
    healthObservedAtMs: nonNegativeSafeInteger,
    latencyP95Ms: nonNegativeSafeInteger,
    qualityScorePpm: z.number().int().min(0).max(1_000_000).optional(),
    reliabilityScorePpm: z.number().int().min(0).max(1_000_000).optional(),
    compatibilityScorePpm: z.number().int().min(0).max(1_000_000).optional(),
    scoreCalibrationRevision: id.optional(),
    resolvedAliasRevision: id,
    probe: z
      .object({
        source: z.enum(["live_probe", "catalog_metadata"]),
        endpointSurface: z.enum([
          "native_responses",
          "responses_compatible",
          "chat_compatible",
          "native_provider",
          "local",
        ]),
        probeSuiteRevision: id,
        evidenceRef: id,
        observedAtMs: nonNegativeSafeInteger,
        validUntilMs: nonNegativeSafeInteger,
        probedCapabilityRefs: z.array(id).max(128),
        checks: deploymentProbeChecksSchema,
      })
      .strict(),
    price: z
      .object({
        currency: z.literal("USD_MICROS"),
        inputMicrosPerMillion: nonNegativeSafeInteger,
        outputMicrosPerMillion: nonNegativeSafeInteger,
        snapshotRef: id,
        validUntilMs: nonNegativeSafeInteger,
      })
      .strict(),
    runtimeBinding: z
      .object({
        kind: z.literal("llm_provider_map"),
        providerRecordId: z.number().int().positive().safe(),
        modelMappingId: z.number().int().positive().safe(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const inferenceProfilePairSchema = z
  .object({
    model: logicalModelProfileSchema,
    deployment: providerDeploymentProfileSchema,
  })
  .strict()
  .superRefine(({ model, deployment }, context) => {
    if (
      deployment.logicalModelId !== model.logicalModelId ||
      deployment.logicalModelRevision !== model.revision ||
      deployment.resolvedAliasRevision !== model.revision
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deployment", "logicalModelRevision"],
        message: "deployment must pin the exact logical model revision",
      });
    }
  });

export type LogicalModelProfile = z.infer<typeof logicalModelProfileSchema>;
export type ProviderDeploymentProfile = z.infer<
  typeof providerDeploymentProfileSchema
>;
export type InferenceProfilePair = z.infer<typeof inferenceProfilePairSchema>;
export type DeploymentProbeCheck = keyof z.infer<
  typeof deploymentProbeChecksSchema
>;
