import {
  canUseAiVisualAsNewsIllustration,
  isNewsClaimVerified,
  newsClaimSchema,
  newsEvidenceRevisionSchema,
  type NewsClaim,
  type NewsEvidenceRevision,
  type NewsEvidenceRef,
} from "@shared/verticalDramaSeries/newsReport";

export function assessNewsClaimFreshness(input: { claim: NewsClaim; now?: Date; maxAgeHours?: number }): NewsClaim {
  const now = input.now ?? new Date();
  const maxAgeHours = input.maxAgeHours ?? (input.claim.claimType === "current_event" || input.claim.claimType === "number" ? 24 : 24 * 30);
  if (!input.claim.asOf) return newsClaimSchema.parse({ ...input.claim, freshness: "unknown", status: "needs_verification" });
  const ageMs = now.getTime() - new Date(input.claim.asOf).getTime();
  const freshness = ageMs > maxAgeHours * 60 * 60 * 1000 ? "stale" : ageMs > maxAgeHours * 60 * 60 * 1000 * 0.75 ? "aging" : "current";
  const status = freshness === "stale" && input.claim.status === "verified" ? "stale" : input.claim.status;
  return newsClaimSchema.parse({ ...input.claim, freshness, status });
}

export function evaluateNewsReadiness(claims: NewsClaim[]): { ready: boolean; blocking: string[]; warnings: string[] } {
  const blocking: string[] = [];
  const warnings: string[] = [];
  for (const claim of claims) {
    if (!isNewsClaimVerified(claim)) blocking.push(`${claim.claimId}: claim requires current supporting evidence and as-of time`);
    if (claim.status === "contradictory") warnings.push(`${claim.claimId}: contradictory evidence remains visible`);
    if (claim.visualSlotIds.length === 0) blocking.push(`${claim.claimId}: no visual coverage is mapped`);
  }
  return { ready: blocking.length === 0, blocking, warnings };
}

export function applyNewsCorrection(input: { claim: NewsClaim; nextEvidence: NewsEvidenceRef[]; note: string; now?: Date }): { claim: NewsClaim; revision: NewsEvidenceRevision } {
  const now = (input.now ?? new Date()).toISOString();
  const revision = input.claim.correctionRevision + 1;
  const claim = newsClaimSchema.parse({
    ...input.claim,
    evidenceRefs: input.nextEvidence,
    status: "needs_verification",
    freshness: "unknown",
    correctionRevision: revision,
    correctionNote: input.note,
  });
  const evidenceRevision = newsEvidenceRevisionSchema.parse({
    evidenceId: input.nextEvidence[0]?.evidenceId ?? `${input.claim.claimId}-revision-${revision}`,
    claimId: input.claim.claimId,
    revision,
    refs: input.nextEvidence,
    correctionNote: input.note,
    createdAt: now,
  });
  return { claim, revision: evidenceRevision };
}

export function validateNewsVisualPolicy(claim: NewsClaim, labelMode: "none" | "source" | "archive" | "ai_illustration"): { allowed: boolean; warning?: string } {
  if (labelMode === "archive" && claim.evidenceRefs.some(ref => !ref.archiveLabel)) return { allowed: false, warning: "Archive/file footage requires an archive label" };
  if (!canUseAiVisualAsNewsIllustration(claim, labelMode)) return { allowed: false, warning: "AI illustration cannot be used as verified news evidence" };
  return { allowed: true };
}
