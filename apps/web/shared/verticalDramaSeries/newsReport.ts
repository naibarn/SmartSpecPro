import { z } from "zod";

export const NEWS_REPORT_MODES = [
  "breaking",
  "developing",
  "explainer",
  "retrospective",
] as const;
export type NewsReportMode = (typeof NEWS_REPORT_MODES)[number];

export const NEWS_CLAIM_TYPES = [
  "current_event",
  "number",
  "historical",
  "quote",
  "location",
  "impact",
  "forecast",
] as const;
export type NewsClaimType = (typeof NEWS_CLAIM_TYPES)[number];

export const NEWS_CLAIM_STATUSES = [
  "needs_verification",
  "partially_verified",
  "verified",
  "stale",
  "contradictory",
  "blocked",
] as const;
export type NewsClaimStatus = (typeof NEWS_CLAIM_STATUSES)[number];

export const newsReportProfileSchema = z.object({
  profileId: z.literal("news_report"),
  mode: z.enum(NEWS_REPORT_MODES),
  requiresSources: z.boolean().default(true),
  requiresAsOf: z.boolean().default(true),
  allowsAiIllustration: z.boolean().default(true),
});
export type NewsReportProfile = z.infer<typeof newsReportProfileSchema>;

export const newsEvidenceRefSchema = z.object({
  evidenceId: z.string().trim().min(1).max(128),
  url: z.string().url().max(2048),
  title: z.string().trim().min(1).max(240),
  publisher: z.string().trim().max(180).nullable().default(null),
  publishedAt: z.string().datetime().nullable().default(null),
  accessedAt: z.string().datetime(),
  supportedScope: z.array(z.string().trim().min(1).max(128)).max(32),
  status: z
    .enum(["supporting", "partial", "contradictory", "stale", "rejected"])
    .default("supporting"),
  archiveLabel: z.boolean().default(false),
  correctionOf: z.string().trim().max(128).nullable().default(null),
});
export type NewsEvidenceRef = z.infer<typeof newsEvidenceRefSchema>;

export const newsClaimSchema = z.object({
  claimId: z.string().trim().min(1).max(128),
  text: z.string().trim().min(1).max(2000),
  claimType: z.enum(NEWS_CLAIM_TYPES),
  geography: z.string().trim().max(240).nullable().default(null),
  validFrom: z.string().datetime().nullable().default(null),
  validUntil: z.string().datetime().nullable().default(null),
  asOf: z.string().datetime().nullable().default(null),
  evidenceRefs: z.array(newsEvidenceRefSchema).max(32).default([]),
  visualSlotIds: z.array(z.string().trim().min(1).max(128)).max(32).default([]),
  attribution: z.string().trim().max(500).nullable().default(null),
  status: z.enum(NEWS_CLAIM_STATUSES).default("needs_verification"),
  freshness: z.enum(["current", "aging", "stale", "unknown"]).default("unknown"),
  correctionRevision: z.number().int().nonnegative().default(0),
  correctionNote: z.string().trim().max(1000).nullable().default(null),
});
export type NewsClaim = z.infer<typeof newsClaimSchema>;

export const newsEvidenceRevisionSchema = z.object({
  evidenceId: z.string().trim().min(1).max(128),
  claimId: z.string().trim().min(1).max(128),
  revision: z.number().int().positive(),
  refs: z.array(newsEvidenceRefSchema).min(1).max(32),
  correctionNote: z.string().trim().max(1000).nullable().default(null),
  createdAt: z.string().datetime(),
});
export type NewsEvidenceRevision = z.infer<typeof newsEvidenceRevisionSchema>;

export function isNewsClaimVerified(claim: NewsClaim): boolean {
  return (
    claim.status === "verified" &&
    claim.evidenceRefs.some(ref => ref.status === "supporting") &&
    claim.asOf != null &&
    claim.freshness === "current"
  );
}

export function canUseAiVisualAsNewsIllustration(
  claim: NewsClaim,
  labelMode: "none" | "source" | "archive" | "ai_illustration"
): boolean {
  return claim.status !== "verified" || labelMode === "ai_illustration";
}
