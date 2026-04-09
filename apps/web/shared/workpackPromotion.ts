import { z } from "zod";

export const improvementProposalActionTypeValues = [
  "skill_improvement",
  "fixture_update",
  "workflow_refinement",
  "connector_map_adjustment",
  "policy_review",
  "benchmark_publication",
] as const;

export const improvementRiskValues = ["low", "medium", "high"] as const;
export const trustTaintTagValues = [
  "verified",
  "tenant_local_only",
  "local_only",
  "manual_override",
  "restricted_lineage",
] as const;
export const benchmarkPublicationScopeValues = ["tenant_local", "tenant_template", "cross_tenant"] as const;
export const benchmarkPublicationStatusValues = ["draft", "published", "blocked", "rolled_back"] as const;

export const improvementProposalActionTypeSchema = z.enum(improvementProposalActionTypeValues);
export const improvementRiskSchema = z.enum(improvementRiskValues);
export const trustTaintTagSchema = z.enum(trustTaintTagValues);
export const benchmarkPublicationScopeSchema = z.enum(benchmarkPublicationScopeValues);
export const benchmarkPublicationStatusSchema = z.enum(benchmarkPublicationStatusValues);

export const improvementProposalSchema = z.object({
  id: z.string().min(1),
  workpackId: z.string().min(1),
  versionId: z.string().min(1),
  actionType: improvementProposalActionTypeSchema,
  risk: improvementRiskSchema,
  sourceRunId: z.string().nullable().optional(),
  sourceExceptionIds: z.array(z.string()).default([]),
  summary: z.string().min(1),
  evidenceSummary: z.string().min(1),
  trustTags: z.array(trustTaintTagSchema).default(["verified"]),
  autoApplicable: z.boolean().default(false),
  createdAt: z.string().datetime(),
});

export const benchmarkPackSchema = z.object({
  id: z.string().min(1),
  sourceWorkpackId: z.string().min(1),
  sourceVersionId: z.string().min(1),
  title: z.string().min(1),
  clonedFromBenchmarkId: z.string().nullable().optional(),
  lineage: z.array(z.string()).default([]),
  fixtureIds: z.array(z.string()).default([]),
  evaluationRules: z.array(z.string()).default([]),
  trustTags: z.array(trustTaintTagSchema).default(["verified"]),
  publicationScope: benchmarkPublicationScopeSchema,
  publicationStatus: benchmarkPublicationStatusSchema,
  fixturesDeidentified: z.boolean().default(false),
  outputsDeidentified: z.boolean().default(false),
  publishedAt: z.string().datetime(),
});

export const workpackPromotionRecordSchema = z.object({
  id: z.string().min(1),
  workpackId: z.string().min(1),
  versionId: z.string().min(1),
  benchmarkPackId: z.string().nullable().optional(),
  previousActiveBenchmarkPackId: z.string().nullable().optional(),
  state: z.enum(["candidate", "approved", "active", "rolled_back", "blocked"]),
  reasonCode: z.string().nullable().optional(),
  evidenceCapturedAt: z.string().datetime(),
  rollbackAvailable: z.boolean().default(true),
});

export type ImprovementProposal = z.infer<typeof improvementProposalSchema>;
export type BenchmarkPack = z.infer<typeof benchmarkPackSchema>;
export type WorkpackPromotionRecord = z.infer<typeof workpackPromotionRecordSchema>;
export type BenchmarkPublicationScope = z.infer<typeof benchmarkPublicationScopeSchema>;
export type TrustTaintTag = z.infer<typeof trustTaintTagSchema>;

export function getMostRestrictiveTrustTag(
  trustTags: TrustTaintTag[],
): TrustTaintTag {
  if (trustTags.includes("restricted_lineage")) return "restricted_lineage";
  if (trustTags.includes("manual_override")) return "manual_override";
  if (trustTags.includes("local_only")) return "local_only";
  if (trustTags.includes("tenant_local_only")) return "tenant_local_only";
  return "verified";
}

export function isBenchmarkShareableOutsideTenant(
  benchmarkPack: Pick<BenchmarkPack, "publicationScope" | "fixturesDeidentified" | "outputsDeidentified" | "trustTags">,
): boolean {
  if (benchmarkPack.publicationScope === "tenant_local") return false;
  if (!benchmarkPack.fixturesDeidentified || !benchmarkPack.outputsDeidentified) return false;
  return getMostRestrictiveTrustTag(benchmarkPack.trustTags) === "verified";
}
