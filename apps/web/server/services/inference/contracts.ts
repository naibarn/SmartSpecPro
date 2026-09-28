import { z } from "zod";

export const INFERENCE_SPEC_UID =
  "urn:smartaihub:spec:llm-routing-inference" as const;
export const INFERENCE_CONTRACT_V2 = "SAH-INFERENCE-2" as const;

const boundedIdentifier = z.string().trim().min(1).max(256);
const boundedLabel = z.string().trim().min(1).max(128);
const nonNegativeSafeInteger = z.number().int().safe().min(0);
const sha256Reference = z.string().regex(/^sha256:[a-f0-9]{64}$/i);

export const inferenceSelectionSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("AUTO") }).strict(),
  z
    .object({
      mode: z.literal("MODEL_LOCK"),
      modelProfileId: boundedIdentifier,
      providerId: boundedIdentifier.optional(),
      fallback: z.enum(["none", "ask", "preapproved_equivalent"]),
    })
    .strict(),
  z
    .object({
      mode: z.literal("PROVIDER_LOCK"),
      providerId: boundedIdentifier,
      fallback: z.enum(["none", "ask"]),
    })
    .strict(),
  z.object({ mode: z.literal("LOCAL_ONLY") }).strict(),
  z.object({ mode: z.literal("PLATFORM_ONLY") }).strict(),
]);

const retrievalSignalSchema = z
  .object({
    traceId: boundedIdentifier,
    quality: z.enum(["sufficient", "weak", "conflicting", "no_evidence"]),
    revisionSetHash: boundedIdentifier,
    contextTokens: z.number().int().min(0).max(10_000_000),
    partial: z.boolean(),
  })
  .strict();

export const inferenceIntentV2Schema = z
  .object({
    contract: z.literal(INFERENCE_CONTRACT_V2),
    requestId: boundedIdentifier,
    traceId: boundedIdentifier,
    tenantId: boundedIdentifier,
    principalId: boundedIdentifier,
    projectId: boundedIdentifier.optional(),
    consumer: boundedLabel,
    runId: boundedIdentifier.optional(),
    taskClass: boundedLabel,
    purpose: boundedLabel,
    inputModalities: z
      .array(z.enum(["text", "image", "audio", "video", "file"]))
      .min(1)
      .max(5),
    outputModalities: z
      .array(z.enum(["text", "image", "audio", "video"]))
      .min(1)
      .max(4),
    inputTokenEstimate: z.number().int().min(0).max(10_000_000),
    outputTokenReserve: z.number().int().min(0).max(1_000_000),
    schemaRef: boundedIdentifier.optional(),
    requiredFeatures: z.array(boundedLabel).max(64),
    toolContractRefs: z.array(boundedIdentifier).max(64).optional(),
    languageHints: z.array(boundedLabel).max(16),
    privacyClass: boundedLabel,
    residencyAllowlist: z.array(boundedLabel).max(64).optional(),
    zdrRequired: z.boolean(),
    qualityClass: z.enum(["economy", "standard", "high", "critical"]),
    risk: z.enum(["low", "medium", "high", "critical"]),
    latencyDeadlineMs: z.number().int().min(1).max(3_600_000),
    maxEstimatedCostMicros: nonNegativeSafeInteger,
    selection: inferenceSelectionSchema,
    retrieval: retrievalSignalSchema.optional(),
    policyRevision: boundedIdentifier,
    budgetScopeRef: boundedIdentifier,
    idempotencyKey: boundedIdentifier,
  })
  .strict();

const inferenceIntentV1Schema = z
  .object({
    contract: z.literal("SAH-INFERENCE-1"),
    requestId: boundedIdentifier,
    traceId: boundedIdentifier.optional(),
    tenantId: boundedIdentifier.optional(),
    principalId: boundedIdentifier.optional(),
    projectId: boundedIdentifier.optional(),
    consumer: boundedLabel,
    runId: boundedIdentifier.optional(),
    taskClass: boundedLabel,
    purpose: boundedLabel,
    inputModalities: z
      .array(z.enum(["text", "image", "audio", "video", "file"]))
      .min(1)
      .max(5),
    outputModalities: z
      .array(z.enum(["text", "image", "audio", "video"]))
      .min(1)
      .max(4),
    inputTokenEstimate: z.number().int().min(0).max(10_000_000),
    outputTokenReserve: z.number().int().min(0).max(1_000_000),
    schemaRef: boundedIdentifier.optional(),
    requiredFeatures: z.array(boundedLabel).max(64),
    toolContractRefs: z.array(boundedIdentifier).max(64).optional(),
    languageHints: z.array(boundedLabel).max(16),
    privacyClass: boundedLabel,
    residencyAllowlist: z.array(boundedLabel).max(64).optional(),
    zdrRequired: z.boolean(),
    qualityClass: z.enum(["economy", "standard", "high", "critical"]),
    risk: z.enum(["low", "medium", "high", "critical"]),
    latencyDeadlineMs: z.number().int().min(1).max(3_600_000),
    maxEstimatedCostMicros: nonNegativeSafeInteger,
    selection: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("AUTO") }).strict(),
      z.object({ mode: z.literal("SMARTAIHUB_ONLY") }).strict(),
      z
        .object({
          mode: z.literal("USER_SELECTED_MODEL"),
          modelProfileId: boundedIdentifier,
        })
        .strict(),
      z
        .object({
          mode: z.literal("USER_SELECTED_PROVIDER"),
          providerId: boundedIdentifier,
        })
        .strict(),
      z.object({ mode: z.literal("EXTERNAL_AGENT_HARNESS") }).strict(),
      z.object({ mode: z.literal("LOCAL_ONLY") }).strict(),
    ]),
    retrieval: retrievalSignalSchema.optional(),
  })
  .strict();

export const inferencePlanR4Schema = z
  .object({
    planId: boundedIdentifier,
    intentHash: sha256Reference,
    policyRevision: boundedIdentifier,
    registryRevision: boundedIdentifier,
    selectedModelProfile: boundedIdentifier,
    selectedDeploymentProfile: boundedIdentifier,
    endpointSurface: z.enum([
      "native_responses",
      "responses_compatible",
      "chat_compatible",
      "native_provider",
      "local",
    ]),
    reasoningProfileId: boundedIdentifier.optional(),
    attemptBudget: z.number().int().min(1).max(16),
    deadlineAt: z.string().datetime(),
    fallbackCandidates: z.array(boundedIdentifier).max(8),
    fallbackPermission: z.enum(["none", "preapproved", "ask"]),
    evaluatorPolicyId: boundedIdentifier.optional(),
    cachePolicyId: boundedIdentifier,
    creditReservationId: boundedIdentifier,
    estimatedCostMicros: nonNegativeSafeInteger,
    routePolicyRevision: boundedIdentifier,
    evidence: z
      .object({
        classifierVersion: boundedIdentifier.optional(),
        routerVersion: boundedIdentifier.optional(),
        expectedQualityBand: boundedLabel.optional(),
      })
      .strict()
      .optional(),
    specUid: z.literal(INFERENCE_SPEC_UID),
    specRevision: boundedIdentifier,
    rolloutBundleHash: sha256Reference,
    logicalCallId: boundedIdentifier,
    attemptOwnershipEpoch: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    routeInvocationPinProof: boundedIdentifier.optional(),
    conversationStateManifestRef: boundedIdentifier.optional(),
    parentCostCeilingMicros: nonNegativeSafeInteger,
    overallDeadlineAt: z.string().datetime(),
    residencyPolicySnapshotRef: boundedIdentifier,
    routerFeatureProvenanceRef: boundedIdentifier,
    evalConsentRef: boundedIdentifier.optional(),
    selectedSourceRevisionSetHash: sha256Reference.optional(),
  })
  .strict()
  .superRefine((plan, context) => {
    if (plan.estimatedCostMicros > plan.parentCostCeilingMicros) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["estimatedCostMicros"],
        message: "estimatedCostMicros must not exceed parentCostCeilingMicros",
      });
    }
    if (Date.parse(plan.overallDeadlineAt) < Date.parse(plan.deadlineAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["overallDeadlineAt"],
        message: "overallDeadlineAt must be at or after deadlineAt",
      });
    }
  });

export const inferenceAttemptReceiptSchema = z
  .object({
    planId: boundedIdentifier,
    attemptId: boundedIdentifier,
    attemptOrdinal: z.number().int().min(1).max(16),
    actualModel: boundedIdentifier,
    providerId: boundedIdentifier,
    credentialOwnerRef: boundedIdentifier,
    deploymentId: boundedIdentifier,
    outcome: z.enum(["completed", "failed", "cancelled", "unknown"]),
    submissionState: z.enum(["not_submitted", "submitted", "unknown"]),
    streamCommitted: z.boolean(),
    normalizedFailure: z
      .enum([
        "rate_limited",
        "provider_unavailable",
        "connection_failed",
        "authentication_failed",
        "invalid_request",
        "content_policy",
        "budget_exceeded",
        "reservation_unavailable",
        "unknown_outcome",
      ])
      .optional(),
    usage: z
      .object({
        input: nonNegativeSafeInteger,
        cachedInput: nonNegativeSafeInteger.optional(),
        output: nonNegativeSafeInteger,
        reasoning: nonNegativeSafeInteger.optional(),
      })
      .strict()
      .optional(),
    chargedCostMicros: nonNegativeSafeInteger.optional(),
    gatewayRequestId: boundedIdentifier.optional(),
    providerRequestId: boundedIdentifier.optional(),
    observedExecution: z
      .object({
        model: boundedIdentifier,
        providerId: boundedIdentifier,
        credentialOwnerRef: boundedIdentifier,
        deploymentId: boundedIdentifier,
        endpointSurface: z.enum([
          "native_responses",
          "responses_compatible",
          "chat_compatible",
          "native_provider",
          "local",
        ]),
      })
      .strict()
      .optional(),
    effectReceiptRefs: z.array(boundedIdentifier).max(64).optional(),
  })
  .strict()
  .superRefine((receipt, context) => {
    if (receipt.outcome === "completed" && !receipt.observedExecution) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["observedExecution"],
        message: "completed attempts require observed execution identity",
      });
    }
    if (
      receipt.outcome === "completed" &&
      receipt.submissionState !== "submitted"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["submissionState"],
        message: "completed attempts must have a confirmed provider submission",
      });
    }
    if (
      receipt.outcome === "unknown" &&
      receipt.normalizedFailure !== "unknown_outcome"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["normalizedFailure"],
        message: "unknown outcome requires its normalized failure code",
      });
    }
    if (receipt.streamCommitted && receipt.submissionState !== "submitted") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["submissionState"],
        message: "committed stream must have been submitted",
      });
    }
  });

export type InferenceIntentV2 = z.infer<typeof inferenceIntentV2Schema>;
export type InferenceSelection = z.infer<typeof inferenceSelectionSchema>;
export type InferencePlanR4 = z.infer<typeof inferencePlanR4Schema>;
export type InferenceAttemptReceipt = z.infer<
  typeof inferenceAttemptReceiptSchema
>;

export type TrustedInferenceContext = {
  tenantId: string;
  principalId: string;
  traceId: string;
  policyRevision: string;
  budgetScopeRef: string;
  idempotencyKey: string;
  maxAuthorizedCostMicros: number;
  effectivePrivacyClass: string;
  effectiveRisk: "low" | "medium" | "high" | "critical";
  allowedRegions: string[];
  requireZeroDataRetention: boolean;
};

export type TrustedInferenceIntentResult =
  | { ok: true; intent: InferenceIntentV2 }
  | { ok: false; code: "INVALID_INFERENCE_INTENT"; fields: string[] }
  | {
      ok: false;
      code: "INFERENCE_SCOPE_MISMATCH";
      field: "tenantId" | "principalId";
    };

export type InferenceV1AdaptResult =
  | { ok: true; intent: InferenceIntentV2 }
  | { ok: false; code: "INVALID_INFERENCE_V1"; fields: string[] }
  | {
      ok: false;
      code: "INFERENCE_SCOPE_MISMATCH";
      field: "tenantId" | "principalId";
    }
  | { ok: false; code: "UNSUPPORTED_V1_REQUIREMENT"; requirements: string[] };

/**
 * Explicitly maps the supported descriptive v1 surface. Trusted request metadata
 * is supplied by the authenticated server; v1-only harness mode is rejected.
 */
export function adaptInferenceV1(
  input: unknown,
  context: TrustedInferenceContext
): InferenceV1AdaptResult {
  const parsed = inferenceIntentV1Schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "INVALID_INFERENCE_V1",
      fields: [
        ...new Set(
          parsed.error.issues.map(issue => issue.path.join(".") || "request")
        ),
      ].sort(),
    };
  }
  if (
    parsed.data.tenantId !== undefined &&
    parsed.data.tenantId !== context.tenantId
  ) {
    return { ok: false, code: "INFERENCE_SCOPE_MISMATCH", field: "tenantId" };
  }
  if (
    parsed.data.principalId !== undefined &&
    parsed.data.principalId !== context.principalId
  ) {
    return {
      ok: false,
      code: "INFERENCE_SCOPE_MISMATCH",
      field: "principalId",
    };
  }
  if (parsed.data.selection.mode === "EXTERNAL_AGENT_HARNESS") {
    return {
      ok: false,
      code: "UNSUPPORTED_V1_REQUIREMENT",
      requirements: ["selection.mode"],
    };
  }

  const selection: InferenceSelection = (() => {
    switch (parsed.data.selection.mode) {
      case "AUTO":
        return { mode: "AUTO" };
      case "SMARTAIHUB_ONLY":
        return { mode: "PLATFORM_ONLY" };
      case "USER_SELECTED_MODEL":
        return {
          mode: "MODEL_LOCK",
          modelProfileId: parsed.data.selection.modelProfileId,
          fallback: "none",
        };
      case "USER_SELECTED_PROVIDER":
        return {
          mode: "PROVIDER_LOCK",
          providerId: parsed.data.selection.providerId,
          fallback: "none",
        };
      case "LOCAL_ONLY":
        return { mode: "LOCAL_ONLY" };
      case "EXTERNAL_AGENT_HARNESS":
        return { mode: "AUTO" };
    }
  })();

  const requestedRegions = parsed.data.residencyAllowlist;
  const effectiveRegions =
    requestedRegions === undefined
      ? context.allowedRegions
      : context.allowedRegions.filter(region =>
          requestedRegions.includes(region)
        );
  const candidate: unknown = {
    ...parsed.data,
    contract: INFERENCE_CONTRACT_V2,
    traceId: context.traceId,
    tenantId: context.tenantId,
    principalId: context.principalId,
    selection,
    risk: stricterRisk(parsed.data.risk, context.effectiveRisk),
    privacyClass: context.effectivePrivacyClass,
    residencyAllowlist: effectiveRegions,
    zdrRequired: parsed.data.zdrRequired || context.requireZeroDataRetention,
    maxEstimatedCostMicros: Math.min(
      parsed.data.maxEstimatedCostMicros,
      context.maxAuthorizedCostMicros
    ),
    policyRevision: context.policyRevision,
    budgetScopeRef: context.budgetScopeRef,
    idempotencyKey: context.idempotencyKey,
  };
  const result = resolveTrustedInferenceIntent(candidate, context);
  if (!result.ok && result.code === "INVALID_INFERENCE_INTENT") {
    return { ok: false, code: "INVALID_INFERENCE_V1", fields: result.fields };
  }
  return result;
}

/**
 * Validates untrusted request data and binds it to authenticated server context.
 * Error values intentionally omit client payloads and Zod messages.
 */
export function resolveTrustedInferenceIntent(
  input: unknown,
  context: TrustedInferenceContext
): TrustedInferenceIntentResult {
  const parsed = inferenceIntentV2Schema.safeParse(input);
  if (!parsed.success) {
    const fields = [
      ...new Set(
        parsed.error.issues.map(issue => issue.path.join(".") || "request")
      ),
    ].sort();
    return { ok: false, code: "INVALID_INFERENCE_INTENT", fields };
  }
  if (parsed.data.tenantId !== context.tenantId) {
    return { ok: false, code: "INFERENCE_SCOPE_MISMATCH", field: "tenantId" };
  }
  if (parsed.data.principalId !== context.principalId) {
    return {
      ok: false,
      code: "INFERENCE_SCOPE_MISMATCH",
      field: "principalId",
    };
  }
  const requestedRegions = parsed.data.residencyAllowlist;
  const effectiveRegions =
    requestedRegions === undefined
      ? context.allowedRegions
      : context.allowedRegions.filter(region =>
          requestedRegions.includes(region)
        );
  const authoritativeIntent: unknown = {
    ...parsed.data,
    traceId: context.traceId,
    risk: stricterRisk(parsed.data.risk, context.effectiveRisk),
    privacyClass: context.effectivePrivacyClass,
    residencyAllowlist: effectiveRegions,
    zdrRequired: parsed.data.zdrRequired || context.requireZeroDataRetention,
    maxEstimatedCostMicros: Math.min(
      parsed.data.maxEstimatedCostMicros,
      context.maxAuthorizedCostMicros
    ),
    policyRevision: context.policyRevision,
    budgetScopeRef: context.budgetScopeRef,
    idempotencyKey: context.idempotencyKey,
  };
  const authoritative = inferenceIntentV2Schema.safeParse(authoritativeIntent);
  if (!authoritative.success) {
    const fields = [
      ...new Set(
        authoritative.error.issues.map(
          issue => issue.path.join(".") || "request"
        )
      ),
    ].sort();
    return { ok: false, code: "INVALID_INFERENCE_INTENT", fields };
  }
  return { ok: true, intent: authoritative.data };
}

const RISK_RANK: Record<TrustedInferenceContext["effectiveRisk"], number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function stricterRisk(
  requested: TrustedInferenceContext["effectiveRisk"],
  authoritative: TrustedInferenceContext["effectiveRisk"]
): TrustedInferenceContext["effectiveRisk"] {
  return RISK_RANK[requested] >= RISK_RANK[authoritative]
    ? requested
    : authoritative;
}
