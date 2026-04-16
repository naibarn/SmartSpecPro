import { z } from "zod";
import type { BenchmarkPack } from "../../shared/workpackPromotion";
import type { WorkpackDetailRecord } from "./workpackPersistence";

export const governedContextScopeValues = ["tenant", "team", "room", "case", "request", "workpack"] as const;
export const governedContextTrustTierValues = ["trusted", "derived", "untrusted"] as const;
export const governedContextFreshnessTierValues = ["fresh", "warm", "stale"] as const;
export const readinessStatusValues = ["ready", "staged", "blocked"] as const;
export const enterpriseGateStatusValues = ["ready", "review_required", "blocked"] as const;
export const enterpriseSdkContractKindValues = ["internal_agent_sdk"] as const;
export const enterpriseReleaseGateKindValues = ["trace_replay", "promotion", "readiness"] as const;

export const governedContextScopeSchema = z.enum(governedContextScopeValues);
export const governedContextTrustTierSchema = z.enum(governedContextTrustTierValues);
export const governedContextFreshnessTierSchema = z.enum(governedContextFreshnessTierValues);
export const readinessStatusSchema = z.enum(readinessStatusValues);
export const enterpriseGateStatusSchema = z.enum(enterpriseGateStatusValues);
export const enterpriseSdkContractKindSchema = z.enum(enterpriseSdkContractKindValues);
export const enterpriseReleaseGateKindSchema = z.enum(enterpriseReleaseGateKindValues);

export const governedContextItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  sourceType: z.string().min(1),
  scope: governedContextScopeSchema,
  trustTier: governedContextTrustTierSchema,
  freshnessTier: governedContextFreshnessTierSchema,
  score: z.number().min(0).max(1),
  included: z.boolean(),
  reason: z.string().min(1),
  evidenceRefs: z.array(z.string()).default([]),
  redacted: z.boolean().default(false),
});

export const governedContextSnapshotSchema = z.object({
  version: z.literal(1),
  tenantId: z.string().min(1),
  principalScope: z.string().min(1),
  objective: z.string().min(1),
  generatedAt: z.string().datetime(),
  selectedCount: z.number().int().min(0),
  excludedCount: z.number().int().min(0),
  summary: z.string().min(1),
  items: z.array(governedContextItemSchema),
});

export const traceEnvelopeSchema = z.object({
  version: z.literal(1),
  traceId: z.string().min(1),
  tenantId: z.string().min(1),
  source: z.string().min(1),
  entityId: z.string().min(1),
  eventType: z.string().min(1),
  generatedAt: z.string().datetime(),
  requestId: z.string().nullable().optional(),
  parentTraceId: z.string().nullable().optional(),
  summary: z.string().min(1),
  evidenceRefs: z.array(z.string()).default([]),
});

export const packManifestSchema = z.object({
  version: z.literal(1),
  packId: z.string().min(1),
  sourceWorkpackId: z.string().min(1),
  sourceVersionId: z.string().min(1),
  title: z.string().min(1),
  publicationScope: z.enum(["tenant_local", "tenant_template", "cross_tenant"]),
  trustTags: z.array(z.string().min(1)).default([]),
  requiredScopes: z.array(z.string().min(1)).default([]),
  connectorFamilies: z.array(z.string().min(1)).default([]),
  rollbackBaselineVersionId: z.string().nullable().optional(),
  reversible: z.boolean(),
  generatedAt: z.string().datetime(),
});

export const readinessMetricRecordSchema = z.object({
  version: z.literal(1),
  kind: z.enum(["team_run", "workpack"]),
  entityId: z.string().min(1),
  generatedAt: z.string().datetime(),
  score: z.number().min(0).max(1),
  status: readinessStatusSchema,
  reason: z.string().min(1),
  evidenceRefs: z.array(z.string()).default([]),
});

export const enterpriseReleaseGateSchema = z.object({
  version: z.literal(1),
  kind: enterpriseReleaseGateKindSchema,
  tenantId: z.string().min(1),
  workpackId: z.string().min(1),
  generatedAt: z.string().datetime(),
  gateResult: enterpriseGateStatusSchema,
  failedChecks: z.array(z.string().min(1)).default([]),
  evidenceRefs: z.array(z.string().min(1)).default([]),
  explanation: z.string().min(1),
  traceId: z.string().nullable().optional(),
  readinessStatus: readinessStatusSchema.nullable().optional(),
  replayGateStatus: enterpriseGateStatusSchema.nullable().optional(),
  packId: z.string().nullable().optional(),
});

export const enterpriseSdkContractSchema = z.object({
  version: z.literal(1),
  kind: enterpriseSdkContractKindSchema,
  tenantId: z.string().min(1),
  workpackId: z.string().min(1),
  generatedAt: z.string().datetime(),
  supportedPatterns: z.array(z.string().min(1)).default([]),
  blockedPatterns: z.array(z.string().min(1)).default([]),
  requiredSignals: z.array(z.string().min(1)).default([]),
  safeDefaults: z.array(z.string().min(1)).default([]),
  trustBoundaryRules: z.array(z.string().min(1)).default([]),
});

export type GovernedContextScope = z.infer<typeof governedContextScopeSchema>;
export type GovernedContextTrustTier = z.infer<typeof governedContextTrustTierSchema>;
export type GovernedContextFreshnessTier = z.infer<typeof governedContextFreshnessTierSchema>;
export type GovernedContextItem = z.infer<typeof governedContextItemSchema>;
export type GovernedContextSnapshot = z.infer<typeof governedContextSnapshotSchema>;
export type TraceEnvelope = z.infer<typeof traceEnvelopeSchema>;
export type PackManifest = z.infer<typeof packManifestSchema>;
export type ReadinessMetricRecord = z.infer<typeof readinessMetricRecordSchema>;
export type EnterpriseReleaseGate = z.infer<typeof enterpriseReleaseGateSchema>;
export type EnterpriseSdkContract = z.infer<typeof enterpriseSdkContractSchema>;

export interface GovernedContextInputItem {
  id: string;
  label: string;
  sourceType: string;
  scope: GovernedContextScope;
  trustTier: GovernedContextTrustTier;
  freshnessTier: GovernedContextFreshnessTier;
  reason: string;
  score?: number;
  included?: boolean;
  evidenceRefs?: string[];
  redacted?: boolean;
}

export interface BuildGovernedContextSnapshotInput {
  tenantId: string;
  principalScope: string;
  objective: string;
  items: GovernedContextInputItem[];
}

export interface BuildEnterpriseReleaseGateInput {
  tenantId: string;
  workpackId: string;
  kind: z.infer<typeof enterpriseReleaseGateKindSchema>;
  traceEnvelope?: TraceEnvelope | null;
  governedContext?: GovernedContextSnapshot | null;
  readinessRecord?: ReadinessMetricRecord | null;
  packManifest?: PackManifest | null;
  replayGateStatus?: EnterpriseReleaseGate["replayGateStatus"];
  evidenceRefs?: string[];
}

export interface BuildEnterpriseSdkContractInput {
  tenantId: string;
  workpackId: string;
  governedContext?: GovernedContextSnapshot | null;
  traceEnvelope?: TraceEnvelope | null;
  readinessRecord?: ReadinessMetricRecord | null;
  packManifest?: PackManifest | null;
}

const TRUST_RANK: Record<GovernedContextTrustTier, number> = {
  trusted: 3,
  derived: 2,
  untrusted: 1,
};

const FRESHNESS_RANK: Record<GovernedContextFreshnessTier, number> = {
  fresh: 3,
  warm: 2,
  stale: 1,
};

function clampScore(score: number | undefined, fallback: number): number {
  if (typeof score !== "number" || Number.isNaN(score)) return fallback;
  return Math.min(1, Math.max(0, score));
}

export function buildGovernedContextSnapshot(input: BuildGovernedContextSnapshotInput): GovernedContextSnapshot {
  const normalizedItems = input.items.map((item) => {
    const included = item.included ?? true;
    const trustTier = item.trustTier;
    const score = clampScore(
      item.score,
      (TRUST_RANK[trustTier] + FRESHNESS_RANK[item.freshnessTier]) / 6,
    );
    const reason = included
      ? item.reason
      : `${item.reason} (excluded from trusted context)`;
    return governedContextItemSchema.parse({
      id: item.id,
      label: item.label,
      sourceType: item.sourceType,
      scope: item.scope,
      trustTier,
      freshnessTier: item.freshnessTier,
      score,
      included,
      reason,
      evidenceRefs: item.evidenceRefs ?? [],
      redacted: item.redacted ?? false,
    });
  });

  normalizedItems.sort((left, right) => {
    if (left.included !== right.included) return left.included ? -1 : 1;
    if (TRUST_RANK[left.trustTier] !== TRUST_RANK[right.trustTier]) {
      return TRUST_RANK[right.trustTier] - TRUST_RANK[left.trustTier];
    }
    if (left.score !== right.score) return right.score - left.score;
    if (FRESHNESS_RANK[left.freshnessTier] !== FRESHNESS_RANK[right.freshnessTier]) {
      return FRESHNESS_RANK[right.freshnessTier] - FRESHNESS_RANK[left.freshnessTier];
    }
    return left.id.localeCompare(right.id);
  });

  const selectedItems = normalizedItems
    .filter((item) => item.included && item.trustTier !== "untrusted")
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score;
      if (TRUST_RANK[left.trustTier] !== TRUST_RANK[right.trustTier]) {
        return TRUST_RANK[right.trustTier] - TRUST_RANK[left.trustTier];
      }
      if (FRESHNESS_RANK[left.freshnessTier] !== FRESHNESS_RANK[right.freshnessTier]) {
        return FRESHNESS_RANK[right.freshnessTier] - FRESHNESS_RANK[left.freshnessTier];
      }
      return left.id.localeCompare(right.id);
    });

  const excludedCount = normalizedItems.length - selectedItems.length;
  const summary = `${selectedItems.length} context item(s) selected, ${excludedCount} excluded for ${input.objective}`;

  return governedContextSnapshotSchema.parse({
    version: 1,
    tenantId: input.tenantId,
    principalScope: input.principalScope,
    objective: input.objective,
    generatedAt: new Date().toISOString(),
    selectedCount: selectedItems.length,
    excludedCount,
    summary,
    items: normalizedItems,
  });
}

export function buildTraceEnvelope(input: {
  traceId: string;
  tenantId: string;
  source: string;
  entityId: string;
  eventType: string;
  summary: string;
  requestId?: string | null;
  parentTraceId?: string | null;
  evidenceRefs?: string[];
}): TraceEnvelope {
  return traceEnvelopeSchema.parse({
    version: 1,
    traceId: input.traceId,
    tenantId: input.tenantId,
    source: input.source,
    entityId: input.entityId,
    eventType: input.eventType,
    generatedAt: new Date().toISOString(),
    requestId: input.requestId ?? null,
    parentTraceId: input.parentTraceId ?? null,
    summary: input.summary,
    evidenceRefs: input.evidenceRefs ?? [],
  });
}

export function buildPackManifest(input: {
  benchmarkPack: BenchmarkPack;
  detail: WorkpackDetailRecord;
}): PackManifest {
  return packManifestSchema.parse({
    version: 1,
    packId: input.benchmarkPack.id,
    sourceWorkpackId: input.benchmarkPack.sourceWorkpackId,
    sourceVersionId: input.benchmarkPack.sourceVersionId,
    title: input.benchmarkPack.title,
    publicationScope: input.benchmarkPack.publicationScope,
    trustTags: input.benchmarkPack.trustTags,
    requiredScopes: Array.from(new Set(input.detail.version.connectorMaps.flatMap((map) => map.requiredScopes ?? []))),
    connectorFamilies: Array.from(new Set(input.detail.version.connectorMaps.map((map) => map.connectorFamily))),
    rollbackBaselineVersionId: input.benchmarkPack.clonedFromBenchmarkId ?? null,
    reversible: true,
    generatedAt: input.benchmarkPack.publishedAt,
  });
}

export function buildReadinessMetricRecord(input: {
  kind: "team_run" | "workpack";
  entityId: string;
  score: number;
  reason: string;
  evidenceRefs?: string[];
}): ReadinessMetricRecord {
  const normalizedScore = clampScore(input.score, 0);
  const status: ReadinessMetricRecord["status"] = normalizedScore >= 0.8
    ? "ready"
    : normalizedScore >= 0.55
      ? "staged"
      : "blocked";

  return readinessMetricRecordSchema.parse({
    version: 1,
    kind: input.kind,
    entityId: input.entityId,
    generatedAt: new Date().toISOString(),
    score: normalizedScore,
    status,
    reason: input.reason,
    evidenceRefs: input.evidenceRefs ?? [],
  });
}

export function buildEnterpriseReleaseGate(input: BuildEnterpriseReleaseGateInput): EnterpriseReleaseGate {
  const failedChecks: string[] = [];
  const evidenceRefs = Array.from(new Set(input.evidenceRefs ?? []));
  const readinessStatus = input.readinessRecord?.status ?? null;
  const packId = input.packManifest?.packId ?? null;
  const traceId = input.traceEnvelope?.traceId ?? null;

  if (!input.traceEnvelope) {
    failedChecks.push("trace_missing");
  } else if (input.traceEnvelope.tenantId !== input.tenantId) {
    failedChecks.push("trace_tenant_mismatch");
  }
  if (!input.governedContext) {
    failedChecks.push("context_missing");
  } else {
    if (input.governedContext.tenantId !== input.tenantId) failedChecks.push("context_tenant_mismatch");
    if (input.governedContext.selectedCount === 0) failedChecks.push("context_empty");
    if (input.governedContext.items.some((item) => item.included && item.trustTier === "untrusted")) {
      failedChecks.push("untrusted_context_selected");
    }
  }
  if (!input.readinessRecord) {
    failedChecks.push("readiness_missing");
  } else if (input.readinessRecord.status === "blocked") {
    failedChecks.push("readiness_blocked");
  }
  if (input.replayGateStatus === "blocked") {
    failedChecks.push("replay_blocked");
  }
  if (input.packManifest) {
    if (input.packManifest.publicationScope === "cross_tenant" && input.packManifest.trustTags.length === 0) {
      failedChecks.push("pack_trust_tags_missing");
    }
    if (!input.packManifest.reversible) {
      failedChecks.push("pack_not_reversible");
    }
  }

  const gateResult: EnterpriseReleaseGate["gateResult"] = failedChecks.includes("trace_missing")
    || failedChecks.includes("context_missing")
    || failedChecks.includes("readiness_blocked")
    || failedChecks.includes("replay_blocked")
    || failedChecks.includes("context_tenant_mismatch")
    || failedChecks.includes("trace_tenant_mismatch")
    || failedChecks.includes("pack_not_reversible")
    ? "blocked"
    : failedChecks.length > 0
      ? "review_required"
      : "ready";

  const explanation = gateResult === "ready"
    ? "Release gate is ready based on durable trace, context, and readiness evidence."
    : gateResult === "review_required"
      ? "Release gate requires review because durable evidence is incomplete or still needs validation."
      : "Release gate is blocked by missing, mismatched, or unsafe enterprise evidence.";

  return enterpriseReleaseGateSchema.parse({
    version: 1,
    kind: input.kind,
    tenantId: input.tenantId,
    workpackId: input.workpackId,
    generatedAt: new Date().toISOString(),
    gateResult,
    failedChecks,
    evidenceRefs,
    explanation,
    traceId,
    readinessStatus,
    replayGateStatus: input.replayGateStatus ?? null,
    packId,
  });
}

export function buildEnterpriseSdkContract(input: BuildEnterpriseSdkContractInput): EnterpriseSdkContract {
  const context = input.governedContext;
  const readiness = input.readinessRecord;
  const packManifest = input.packManifest;
  const traceEnvelope = input.traceEnvelope;
  const supportedPatterns = [
    "tenant-scoped context assembly",
    "trace-linked replay and evidence review",
    "inspection-only replay before promotion",
    "policy-gated workpack promotion",
    "durable readiness reporting",
  ];
  const blockedPatterns = [
    "cross-tenant context merge",
    "ui-only readiness decisions",
    "unverified pack installation",
    "non-durable promotion evidence",
  ];
  const requiredSignals = [
    context ? `context:${context.selectedCount}` : "context:missing",
    readiness ? `readiness:${readiness.status}` : "readiness:missing",
    traceEnvelope ? `trace:${traceEnvelope.traceId}` : "trace:missing",
    packManifest ? `pack:${packManifest.packId}` : "pack:missing",
  ];
  const safeDefaults = [
    "default to tenant scope",
    "default to inspection-only replay",
    "default to reversible promotion state",
    "default to durable evidence linkage",
  ];
  const trustBoundaryRules = [
    "do not promote untrusted context items into the trusted runtime without review",
    "do not install packs that widen scope without explicit review",
    "do not treat UI state as canonical readiness evidence",
    "do not reuse trace data outside the tenant boundary",
  ];

  if (context && context.items.some((item) => item.redacted)) {
    blockedPatterns.push("assume_redacted_content_is_verified");
  }
  if (readiness && readiness.status === "blocked") {
    blockedPatterns.push("treat_blocked_readiness_as_ready");
  }
  if (packManifest && !packManifest.reversible) {
    blockedPatterns.push("install_non_reversible_pack");
  }
  if (traceEnvelope && traceEnvelope.parentTraceId) {
    supportedPatterns.push("trace lineage propagation");
  }

  return enterpriseSdkContractSchema.parse({
    version: 1,
    kind: "internal_agent_sdk",
    tenantId: input.tenantId,
    workpackId: input.workpackId,
    generatedAt: new Date().toISOString(),
    supportedPatterns,
    blockedPatterns,
    requiredSignals,
    safeDefaults,
    trustBoundaryRules,
  });
}

export interface ExtractEnterpriseArtifactsInput {
  payload: Record<string, unknown> | null | undefined;
}

export function extractEnterpriseArtifacts(input: ExtractEnterpriseArtifactsInput): {
  traceEnvelope: TraceEnvelope | null;
  governedContext: GovernedContextSnapshot | null;
  packManifest: PackManifest | null;
  readinessRecord: ReadinessMetricRecord | null;
} {
  const payload = input.payload ?? {};
  const traceEnvelope = payload.traceEnvelope && typeof payload.traceEnvelope === "object"
    ? traceEnvelopeSchema.safeParse(payload.traceEnvelope).success
      ? traceEnvelopeSchema.parse(payload.traceEnvelope)
      : null
    : null;
  const governedContext = payload.governedContext && typeof payload.governedContext === "object"
    ? governedContextSnapshotSchema.safeParse(payload.governedContext).success
      ? governedContextSnapshotSchema.parse(payload.governedContext)
      : null
    : null;
  const packManifest = payload.packManifest && typeof payload.packManifest === "object"
    ? packManifestSchema.safeParse(payload.packManifest).success
      ? packManifestSchema.parse(payload.packManifest)
      : null
    : null;
  const readinessRecord = payload.readinessRecord && typeof payload.readinessRecord === "object"
    ? readinessMetricRecordSchema.safeParse(payload.readinessRecord).success
      ? readinessMetricRecordSchema.parse(payload.readinessRecord)
      : null
    : null;

  return {
    traceEnvelope,
    governedContext,
    packManifest,
    readinessRecord,
  };
}
