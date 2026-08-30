import { z } from "zod";

export const ORCHESTRA_CONTRACT_VERSION = 1;
export const ORCHESTRA_MINIMUM_COMPATIBLE_VERSION = 1;

export const ORCHESTRA_TASK_KINDS = [
  "video_prompt",
  "image_prompt",
  "text_prompt",
  "skill_execution",
  "structured_generation",
  "phone_call_scene",
  "cross_location_dialogue",
  "shout_across_scenes",
  "voiceover_narration",
  "prop_interaction",
] as const;
export const ORCHESTRA_LIFECYCLE_STATES = [
  "admitted",
  "planned",
  "running",
  "verifying",
  "repairing",
  "awaiting_user",
  "provider_ready",
  "committed",
  "blocked",
  "failed",
  "cancelled",
  "expired",
  "provider_result_unknown",
  "reconciliation_required",
] as const;
export const ORCHESTRA_FINDING_CODES = [
  "contract_invalid",
  "contract_hash_mismatch",
  "evidence_quality_insufficient",
  "evidence_reference_unreadable",
  "evidence_identity_ambiguous",
  "evidence_extra_people_unresolved",
  "custom_identity_conflict",
  "speaker_face_visibility_required",
  "provider_budget_exceeded",
  "provider_capability_mismatch",
  "output_contract_mismatch",
  "budget_exceeded",
  "plan_cycle_detected",
  "manifest_untrusted",
  "side_effect_unauthorized",
  "side_effect_token_replayed",
  "agency_origin_forbidden",
] as const;

export const OrchestraTaskKindSchema = z.enum(ORCHESTRA_TASK_KINDS);
export const OrchestraLifecycleStateSchema = z.enum(ORCHESTRA_LIFECYCLE_STATES);
export const OrchestraFindingCodeSchema = z.enum(ORCHESTRA_FINDING_CODES);

export const OrchestraRuntimeBudgetSchema = z
  .object({
    maxTurns: z.number().int().nonnegative().default(8),
    maxToolCalls: z.number().int().nonnegative().default(16),
    maxParallelAgents: z.number().int().positive().default(3),
    maxPlanDepth: z.number().int().positive().default(4),
    maxWallClockSeconds: z.number().positive().default(180),
    maxInputTokens: z.number().int().positive().default(32_000),
    maxOutputTokens: z.number().int().positive().default(8_000),
    maxRepairAttempts: z.number().int().nonnegative().default(2),
    estimatedCost: z.number().nonnegative().default(0),
  })
  .strict();

export const OrchestraEvidenceItemSchema = z
  .object({
    ref: z.string().min(1),
    purpose: z.string().min(1),
    qualityScore: z.number().min(0).max(1).nullable().optional(),
    readable: z.boolean().default(true),
    resolution: z.enum(["unknown", "low", "usable", "high"]).default("unknown"),
    visibleFaces: z.number().int().nonnegative().nullable().optional(),
    unresolvedPeople: z.number().int().nonnegative().default(0),
    trusted: z.boolean().default(false),
  })
  .strict();

export const OrchestraEvidencePolicySchema = z
  .object({
    requiredPurposes: z.array(z.string().min(1)).default([]),
    requireVisionFor: z.array(OrchestraTaskKindSchema).default([]),
    allowTextOnlyFallback: z.boolean().default(false),
    maxEvidenceItems: z.number().int().positive().default(16),
    minQualityScore: z.number().min(0).max(1).default(0.7),
  })
  .strict();

export const OrchestraProviderCapabilityProfileSchema = z
  .object({
    providerId: z.string().min(1),
    modelId: z.string().min(1),
    maxPromptChars: z.number().int().positive().nullable().optional(),
    supportsVision: z.boolean().default(false),
    supportsStructuredOutput: z.boolean().default(false),
    supportsLipSync: z.boolean().default(false),
    supportsMultiLocation: z.boolean().default(false),
  })
  .strict();

export const OrchestraOutputContractSchema = z
  .object({
    schemaRef: z.string().min(1),
    requiredFields: z.array(z.string().min(1)).default([]),
    maxChars: z.number().int().positive().nullable().optional(),
  })
  .strict();

export const OrchestraSideEffectAuthorizationSchema = z
  .object({
    tokenId: z.string().min(1),
    tenantId: z.string().min(1),
    contractHash: z.string().regex(/^[a-f0-9]{64}$/),
    outputHash: z.string().regex(/^[a-f0-9]{64}$/),
    policyHash: z.string().regex(/^[a-f0-9]{64}$/),
    allowedEffects: z.array(z.string().min(1)).min(1),
    expiresAt: z.string().datetime({ offset: true }),
    nonce: z.string().min(1),
  })
  .strict();

export const OrchestraAssuranceRequestSchema = z
  .object({
    contractVersion: z
      .number()
      .int()
      .min(ORCHESTRA_MINIMUM_COMPATIBLE_VERSION)
      .max(ORCHESTRA_CONTRACT_VERSION),
    contractId: z.string().min(1),
    attemptId: z.string().min(1),
    taskKind: OrchestraTaskKindSchema,
    contractHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable()
      .optional(),
    evidencePolicy: OrchestraEvidencePolicySchema,
    evidence: z.array(OrchestraEvidenceItemSchema).default([]),
    outputContract: OrchestraOutputContractSchema,
    providerProfile:
      OrchestraProviderCapabilityProfileSchema.nullable().optional(),
    budget: OrchestraRuntimeBudgetSchema,
    rulePackIds: z.array(z.string().min(1)).default([]),
    sideEffectPolicy: z
      .enum(["read_only", "approval_required", "mutating_allowed"])
      .default("read_only"),
    sideEffectAuthorization:
      OrchestraSideEffectAuthorizationSchema.nullable().optional(),
    repairAttempts: z.number().int().nonnegative().default(0),
  })
  .strict();

export const OrchestraAssuranceResultSchema = z
  .object({
    executionId: z.string().min(1),
    attemptId: z.string().min(1),
    state: OrchestraLifecycleStateSchema,
    contractHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable()
      .optional(),
    findings: z
      .array(
        z
          .object({
            code: OrchestraFindingCodeSchema,
            severity: z.enum(["info", "warning", "error", "blocking"]),
            message: z.string().min(1),
            evidenceRefs: z.array(z.string().min(1)).default([]),
            userAction: z.string().min(1).nullable().optional(),
          })
          .strict()
      )
      .default([]),
    sideEffectAuthorizationId: z.string().min(1).nullable().optional(),
  })
  .strict();

export type OrchestraTaskKind = z.infer<typeof OrchestraTaskKindSchema>;
export type OrchestraLifecycleState = z.infer<
  typeof OrchestraLifecycleStateSchema
>;
export type OrchestraFindingCode = z.infer<typeof OrchestraFindingCodeSchema>;
export type OrchestraRuntimeBudget = z.infer<
  typeof OrchestraRuntimeBudgetSchema
>;
export type OrchestraEvidenceItem = z.infer<typeof OrchestraEvidenceItemSchema>;
export type OrchestraEvidencePolicy = z.infer<
  typeof OrchestraEvidencePolicySchema
>;
export type OrchestraProviderCapabilityProfile = z.infer<
  typeof OrchestraProviderCapabilityProfileSchema
>;
export type OrchestraOutputContract = z.infer<
  typeof OrchestraOutputContractSchema
>;
export type OrchestraSideEffectAuthorization = z.infer<
  typeof OrchestraSideEffectAuthorizationSchema
>;
export type OrchestraAssuranceRequest = z.infer<
  typeof OrchestraAssuranceRequestSchema
>;
export type OrchestraAssuranceResult = z.infer<
  typeof OrchestraAssuranceResultSchema
>;

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

export async function sha256Hex(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export function validateEvidenceBundle(
  request: Pick<
    OrchestraAssuranceRequest,
    "taskKind" | "evidencePolicy" | "evidence"
  >
): {
  code: OrchestraFindingCode;
  message: string;
  evidenceRefs: string[];
} | null {
  const { evidencePolicy, evidence } = request;
  if (evidence.length > evidencePolicy.maxEvidenceItems) {
    return {
      code: "evidence_quality_insufficient",
      message: "evidence_item_limit_exceeded",
      evidenceRefs: [],
    };
  }
  const required = new Set(evidencePolicy.requiredPurposes);
  const missing = [...required].filter(
    purpose => !evidence.some(item => item.purpose === purpose)
  );
  if (missing.length > 0) {
    return {
      code: "evidence_quality_insufficient",
      message: `missing_evidence_purposes:${missing.join(",")}`,
      evidenceRefs: [],
    };
  }
  const bad = evidence.filter(
    item =>
      !item.readable ||
      item.unresolvedPeople > 0 ||
      (item.qualityScore != null &&
        item.qualityScore < evidencePolicy.minQualityScore)
  );
  if (
    bad.length > 0 ||
    (evidencePolicy.requireVisionFor.includes(request.taskKind) &&
      evidence.length === 0 &&
      !evidencePolicy.allowTextOnlyFallback)
  ) {
    return {
      code: bad.some(item => item.unresolvedPeople > 0)
        ? "evidence_extra_people_unresolved"
        : "evidence_quality_insufficient",
      message: "reference_evidence_requires_user_correction",
      evidenceRefs: bad.map(item => item.ref),
    };
  }
  return null;
}

export function validateProviderPromptLength(
  profile: OrchestraProviderCapabilityProfile,
  prompt: string
): { code: OrchestraFindingCode; message: string } | null {
  if (
    profile.maxPromptChars !== null &&
    profile.maxPromptChars !== undefined &&
    prompt.length > profile.maxPromptChars
  ) {
    return {
      code: "provider_budget_exceeded",
      message: `prompt_chars:${prompt.length}>${profile.maxPromptChars}`,
    };
  }
  return null;
}

export function composeCharacterIdentity(
  name: string,
  customDescription?: string | null,
  position?: string | null
): string {
  const custom = customDescription?.trim();
  if (custom) return `${name} (${custom})`;
  return position?.trim() ? `${name} (${position.trim()})` : name;
}

export function validateBudget(
  budget: OrchestraRuntimeBudget,
  usage: Partial<OrchestraRuntimeBudget>
): { code: OrchestraFindingCode; message: string } | null {
  const checks: Array<[keyof OrchestraRuntimeBudget, string]> = [
    ["maxTurns", "turns"],
    ["maxToolCalls", "toolCalls"],
    ["maxParallelAgents", "parallelAgents"],
    ["maxPlanDepth", "planDepth"],
    ["maxInputTokens", "inputTokens"],
    ["maxOutputTokens", "outputTokens"],
    ["maxRepairAttempts", "repairAttempts"],
  ];
  for (const [limitKey, label] of checks) {
    const used = usage[limitKey];
    if (typeof used === "number" && used > budget[limitKey])
      return {
        code: "budget_exceeded",
        message: `${label}:${used}>${budget[limitKey]}`,
      };
  }
  return null;
}

export function detectPlanCycle(
  plan: Array<{ id: string; dependsOn?: string[] }>
): boolean {
  const graph = new Map(plan.map(step => [step.id, step.dependsOn ?? []]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dependency of graph.get(id) ?? [])
      if (graph.has(dependency) && visit(dependency)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return [...graph.keys()].some(visit);
}

export function validateSideEffectAuthorization(
  authorization: OrchestraSideEffectAuthorization | null | undefined,
  expected: Pick<
    OrchestraSideEffectAuthorization,
    "tenantId" | "contractHash" | "outputHash" | "policyHash"
  >,
  now = Date.now()
): { code: OrchestraFindingCode; message: string } | null {
  if (!authorization)
    return {
      code: "side_effect_unauthorized",
      message: "side_effect_authorization_required",
    };
  if (
    authorization.tenantId !== expected.tenantId ||
    authorization.contractHash !== expected.contractHash ||
    authorization.outputHash !== expected.outputHash ||
    authorization.policyHash !== expected.policyHash
  ) {
    return {
      code: "side_effect_unauthorized",
      message: "side_effect_authorization_binding_mismatch",
    };
  }
  if (Date.parse(authorization.expiresAt) <= now)
    return {
      code: "side_effect_unauthorized",
      message: "side_effect_authorization_expired",
    };
  return null;
}
