import { z } from "zod";

export const governedContextScopeValues = [
  "tenant",
  "team",
  "room",
  "case",
  "request",
] as const;
export const governedContextTrustTierValues = [
  "trusted",
  "derived",
  "untrusted",
] as const;
export const governedContextFreshnessTierValues = [
  "fresh",
  "warm",
  "stale",
] as const;
export const readinessStatusValues = ["ready", "staged", "blocked"] as const;

export const governedContextScopeSchema = z.enum(governedContextScopeValues);
export const governedContextTrustTierSchema = z.enum(
  governedContextTrustTierValues
);
export const governedContextFreshnessTierSchema = z.enum(
  governedContextFreshnessTierValues
);
export const readinessStatusSchema = z.enum(readinessStatusValues);

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

export const readinessMetricRecordSchema = z.object({
  version: z.literal(1),
  kind: z.literal("team_run"),
  entityId: z.string().min(1),
  generatedAt: z.string().datetime(),
  score: z.number().min(0).max(1),
  status: readinessStatusSchema,
  reason: z.string().min(1),
  evidenceRefs: z.array(z.string()).default([]),
});

export type GovernedContextScope = z.infer<typeof governedContextScopeSchema>;
export type GovernedContextTrustTier = z.infer<
  typeof governedContextTrustTierSchema
>;
export type GovernedContextFreshnessTier = z.infer<
  typeof governedContextFreshnessTierSchema
>;
export type GovernedContextItem = z.infer<typeof governedContextItemSchema>;
export type GovernedContextSnapshot = z.infer<
  typeof governedContextSnapshotSchema
>;
export type TraceEnvelope = z.infer<typeof traceEnvelopeSchema>;
export type ReadinessMetricRecord = z.infer<typeof readinessMetricRecordSchema>;

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

const trustRank: Record<GovernedContextTrustTier, number> = {
  trusted: 3,
  derived: 2,
  untrusted: 1,
};
const freshnessRank: Record<GovernedContextFreshnessTier, number> = {
  fresh: 3,
  warm: 2,
  stale: 1,
};

function clampScore(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

export function buildGovernedContextSnapshot(input: {
  tenantId: string;
  principalScope: string;
  objective: string;
  items: GovernedContextInputItem[];
}): GovernedContextSnapshot {
  const items = input.items
    .map(item => {
      const included = item.included ?? true;
      const score = clampScore(
        item.score,
        (trustRank[item.trustTier] + freshnessRank[item.freshnessTier]) / 6
      );
      return governedContextItemSchema.parse({
        ...item,
        score,
        included,
        reason: included
          ? item.reason
          : `${item.reason} (excluded from trusted context)`,
        evidenceRefs: item.evidenceRefs ?? [],
        redacted: item.redacted ?? false,
      });
    })
    .sort((left, right) => {
      if (left.included !== right.included) return left.included ? -1 : 1;
      if (trustRank[left.trustTier] !== trustRank[right.trustTier])
        return trustRank[right.trustTier] - trustRank[left.trustTier];
      return right.score - left.score;
    });

  return governedContextSnapshotSchema.parse({
    version: 1,
    tenantId: input.tenantId,
    principalScope: input.principalScope,
    objective: input.objective,
    generatedAt: new Date().toISOString(),
    selectedCount: items.filter(item => item.included).length,
    excludedCount: items.filter(item => !item.included).length,
    summary: `${items.filter(item => item.included).length} trusted context item(s) selected`,
    items,
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
    ...input,
    generatedAt: new Date().toISOString(),
    requestId: input.requestId ?? null,
    parentTraceId: input.parentTraceId ?? null,
    evidenceRefs: input.evidenceRefs ?? [],
  });
}

export function buildReadinessMetricRecord(input: {
  kind: "team_run";
  entityId: string;
  score: number;
  reason: string;
  evidenceRefs?: string[];
}): ReadinessMetricRecord {
  const score = clampScore(input.score, 0);
  return readinessMetricRecordSchema.parse({
    version: 1,
    kind: input.kind,
    entityId: input.entityId,
    generatedAt: new Date().toISOString(),
    score,
    status: score >= 0.8 ? "ready" : score >= 0.55 ? "staged" : "blocked",
    reason: input.reason,
    evidenceRefs: input.evidenceRefs ?? [],
  });
}

export function extractEnterpriseArtifacts(input: {
  payload: Record<string, unknown> | null | undefined;
}): {
  traceEnvelope: TraceEnvelope | null;
  governedContext: GovernedContextSnapshot | null;
  readinessRecord: ReadinessMetricRecord | null;
} {
  const payload = input.payload;
  if (!payload)
    return {
      traceEnvelope: null,
      governedContext: null,
      readinessRecord: null,
    };
  return {
    traceEnvelope: traceEnvelopeSchema.safeParse(payload.traceEnvelope).success
      ? (payload.traceEnvelope as TraceEnvelope)
      : null,
    governedContext: governedContextSnapshotSchema.safeParse(
      payload.governedContext
    ).success
      ? (payload.governedContext as GovernedContextSnapshot)
      : null,
    readinessRecord: readinessMetricRecordSchema.safeParse(
      payload.readinessRecord
    ).success
      ? (payload.readinessRecord as ReadinessMetricRecord)
      : null,
  };
}
