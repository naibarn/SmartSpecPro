import {
  canUseAiVisualAsNewsIllustration,
  isNewsClaimVerified,
  newsClaimSchema,
  newsEvidenceRevisionSchema,
  type NewsClaim,
  type NewsEvidenceRevision,
  type NewsEvidenceRef,
} from "@shared/verticalDramaSeries/newsReport";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  verticalDramaNewsClaims,
  verticalDramaNewsEvidenceRevisions,
  verticalDramaSeries,
  verticalDramaSourcePacks,
} from "../../drizzle/schema";

export type NewsReportOwner = { tenantId: string; userId: number };

/** Deterministic fixture/parser for current-event prompts. It deliberately
 * produces needs_verification claims: extracting a number is not the same as
 * verifying it, and the news evidence gate still requires source refs/as-of. */
export function extractNanFloodClaims(prompt: string): NewsClaim[] {
  const source = prompt.trim();
  if (!source || !/(น่าน|N\.1|น้ำท่วม|ดินสไลด์)/i.test(source)) return [];
  const make = (claimId: string, text: string, claimType: NewsClaim["claimType"]): NewsClaim =>
    newsClaimSchema.parse({
      claimId,
      text,
      claimType,
      geography: "จังหวัดน่าน",
      validFrom: null,
      validUntil: null,
      asOf: null,
      evidenceRefs: [],
      visualSlotIds: [],
      attribution: null,
      status: "needs_verification",
      freshness: "unknown",
      correctionRevision: 0,
      correctionNote: null,
    });
  const claims: NewsClaim[] = [];
  const impact = source.match(/7\s*อำเภอ\s*34\s*ตำบล\s*223\s*หมู่บ้าน[\s\S]{0,120}?20,?000\s*ครอบครัว/);
  if (impact) claims.push(make("nan-impact-scope", impact[0], "impact"));
  const watchWindow = source.match(/(?:19\s*-\s*21\s*ส\.ค\.|19-21\s*ส\.ค\.)[\s\S]{0,180}?เฝ้าระวัง/);
  if (watchWindow) claims.push(make("nan-watch-window", watchWindow[0], "current_event"));
  const record = source.match(/ปี\s*2567[\s\S]{0,180}?8\.72\s*เมตร/);
  if (record) claims.push(make("nan-n1-record", record[0], "number"));
  const wall = source.match(/8\.40\s*-\s*8\.50\s*เมตร[\s\S]{0,100}?22\s*-\s*32\s*เซนติเมตร/);
  if (wall) claims.push(make("nan-wall-overflow", wall[0], "number"));
  return claims;
}

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

function rowToClaim(
  row: typeof verticalDramaNewsClaims.$inferSelect,
  evidenceRefs: NewsEvidenceRef[] = [],
): NewsClaim {
  return newsClaimSchema.parse({
    claimId: row.claimId,
    text: row.claimText,
    claimType: row.claimType,
    geography: row.geography,
    validFrom: row.validFrom?.toISOString() ?? null,
    validUntil: row.validUntil?.toISOString() ?? null,
    asOf: row.asOf?.toISOString() ?? null,
    evidenceRefs,
    visualSlotIds: row.visualSlotIdsJson ?? [],
    attribution: row.attribution,
    status: row.status,
    freshness: row.freshness,
    correctionRevision: row.correctionRevision,
    correctionNote: row.correctionNote,
  });
}

async function latestEvidenceByClaim(owner: NewsReportOwner, seriesId: number) {
  const rows = await db
    .select()
    .from(verticalDramaNewsEvidenceRevisions)
    .where(and(
      eq(verticalDramaNewsEvidenceRevisions.tenantId, owner.tenantId),
      eq(verticalDramaNewsEvidenceRevisions.userId, owner.userId),
      eq(verticalDramaNewsEvidenceRevisions.seriesId, seriesId),
    ))
    .orderBy(desc(verticalDramaNewsEvidenceRevisions.createdAt));
  const latest = new Map<string, NewsEvidenceRef[]>();
  for (const row of rows) {
    if (latest.has(row.claimId)) continue;
    const refs = Array.isArray(row.refsJson) ? row.refsJson : [];
    latest.set(row.claimId, refs as NewsEvidenceRef[]);
  }
  return latest;
}

export async function listPersistedNewsClaims(owner: NewsReportOwner, seriesId: number) {
  const rows = await db
    .select()
    .from(verticalDramaNewsClaims)
    .where(and(
      eq(verticalDramaNewsClaims.tenantId, owner.tenantId),
      eq(verticalDramaNewsClaims.userId, owner.userId),
      eq(verticalDramaNewsClaims.seriesId, seriesId),
    ))
    .orderBy(desc(verticalDramaNewsClaims.updatedAt), desc(verticalDramaNewsClaims.id));
  const evidence = await latestEvidenceByClaim(owner, seriesId);
  return rows.map((row: typeof verticalDramaNewsClaims.$inferSelect) =>
    rowToClaim(row, evidence.get(row.claimId) ?? [])
  );
}

export async function persistNewsClaim(
  owner: NewsReportOwner,
  input: { seriesId: number; claim: NewsClaim },
) {
  const claim = assessNewsClaimFreshness({ claim: newsClaimSchema.parse(input.claim) });
  const [previous] = await db
    .select({ revision: verticalDramaNewsClaims.revision })
    .from(verticalDramaNewsClaims)
    .where(and(
      eq(verticalDramaNewsClaims.tenantId, owner.tenantId),
      eq(verticalDramaNewsClaims.userId, owner.userId),
      eq(verticalDramaNewsClaims.seriesId, input.seriesId),
      eq(verticalDramaNewsClaims.claimId, claim.claimId),
    ))
    .orderBy(desc(verticalDramaNewsClaims.revision))
    .limit(1);
  const revision = (previous?.revision ?? 0) + 1;
  await db.transaction(async tx => {
    await tx.insert(verticalDramaNewsClaims).values({
      tenantId: owner.tenantId,
      userId: owner.userId,
      seriesId: input.seriesId,
      claimId: claim.claimId,
      revision,
      claimText: claim.text,
      claimType: claim.claimType,
      geography: claim.geography,
      validFrom: claim.validFrom ? new Date(claim.validFrom) : null,
      validUntil: claim.validUntil ? new Date(claim.validUntil) : null,
      asOf: claim.asOf ? new Date(claim.asOf) : null,
      status: claim.status,
      freshness: claim.freshness,
      attribution: claim.attribution,
      visualSlotIdsJson: claim.visualSlotIds,
      correctionRevision: claim.correctionRevision,
      correctionNote: claim.correctionNote,
      updatedAt: new Date(),
    });
    if (claim.evidenceRefs.length > 0) {
      await tx.insert(verticalDramaNewsEvidenceRevisions).values({
        tenantId: owner.tenantId,
        userId: owner.userId,
        seriesId: input.seriesId,
        claimId: claim.claimId,
        evidenceId: `${claim.claimId}-evidence-${revision}`,
        revision,
        refsJson: claim.evidenceRefs,
        correctionNote: claim.correctionNote,
      });
    }
  });
  return claim;
}

export async function persistNewsCorrection(
  owner: NewsReportOwner,
  input: { seriesId: number; claimId: string; nextEvidence: NewsEvidenceRef[]; note: string },
) {
  const [row] = await db
    .select()
    .from(verticalDramaNewsClaims)
    .where(and(
      eq(verticalDramaNewsClaims.tenantId, owner.tenantId),
      eq(verticalDramaNewsClaims.userId, owner.userId),
      eq(verticalDramaNewsClaims.seriesId, input.seriesId),
      eq(verticalDramaNewsClaims.claimId, input.claimId),
    ))
    .orderBy(desc(verticalDramaNewsClaims.revision))
    .limit(1);
  if (!row) throw new Error("News claim not found");
  const evidence = await latestEvidenceByClaim(owner, input.seriesId);
  const corrected = applyNewsCorrection({
    claim: rowToClaim(row, evidence.get(row.claimId) ?? []),
    nextEvidence: input.nextEvidence,
    note: input.note,
  });
  await persistNewsClaim(owner, {
    seriesId: input.seriesId,
    claim: corrected.claim,
  });
  const now = new Date();
  await db
    .update(verticalDramaSourcePacks)
    .set({ status: "stale", updatedAt: now })
    .where(and(
      eq(verticalDramaSourcePacks.tenantId, owner.tenantId),
      eq(verticalDramaSourcePacks.userId, owner.userId),
      eq(verticalDramaSourcePacks.seriesId, input.seriesId),
    ));
  const [series] = await db
    .select({ bible: verticalDramaSeries.bible })
    .from(verticalDramaSeries)
    .where(and(
      eq(verticalDramaSeries.id, input.seriesId),
      eq(verticalDramaSeries.tenantId, owner.tenantId),
      eq(verticalDramaSeries.userId, owner.userId),
    ))
    .limit(1);
  if (series) {
    await db.update(verticalDramaSeries).set({
      bible: {
        ...((series.bible as Record<string, unknown> | null) ?? {}),
        newsEvidenceRevision: corrected.claim.correctionRevision,
        newsEvidenceStatus: "stale",
      },
      updatedAt: now,
    }).where(and(
      eq(verticalDramaSeries.id, input.seriesId),
      eq(verticalDramaSeries.tenantId, owner.tenantId),
      eq(verticalDramaSeries.userId, owner.userId),
    ));
  }
  return corrected;
}
