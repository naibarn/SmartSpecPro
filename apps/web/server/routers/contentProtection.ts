import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, inArray, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  CONTENT_PROTECTION_MODALITIES,
  WATERMARK_CHOICES,
  validateCompoundArtifactEnvelope,
  type CompoundArtifactEnvelope,
} from "@smartspec/shared";
import {
  CONTENT_PROTECTION_CONTRACT_VERSION,
  CONTENT_PROTECTION_JOB_TYPE,
} from "../../shared/contentProtectionWorker";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";
import { createControlPlaneJob } from "../services/jobControlPlaneGateway";
import {
  contentProtectionAssets,
  contentProtectionCases,
  contentEvidencePackages,
  contentExternalReviewLinks,
  contentProtectionSettings,
  contentVerificationMatches,
  contentVerificationRuns,
  contentCreationCertificates,
  contentRightsHolderProfiles,
  contentRightsClaims,
  contentRightsEvidenceDocuments,
  contentComponentRights,
  contentEvidenceAnchors,
  contentProtectionEvents,
  mediaAssets,
} from "../../drizzle/schema";

export const contentProtectionModalitySchema = z.enum(CONTENT_PROTECTION_MODALITIES);
export const contentProtectionChoiceSchema = z.enum(WATERMARK_CHOICES);
const assetIdSchema = z.string().uuid();
const idempotencyKeySchema = z.string().trim().min(8).max(160).regex(/^[A-Za-z0-9._:-]+$/);
const storageKeySchema = z.string().trim().min(1).max(1024)
  .refine(value => !value.includes("..") && !value.startsWith("/"), "Invalid storage reference");

const caseStatusSchema = z.enum(["open", "reviewing", "ready", "submitted", "closed", "revoked"]);
const rightsClaimInputSchema = z.object({
  assetId: assetIdSchema,
  displayName: z.string().trim().min(1).max(255),
  contactEmail: z.string().trim().email().max(320).optional(),
  claimType: z.string().trim().min(1).max(48),
  legalDeclarationConfirmed: z.boolean().default(false),
}).strict();

export const protectAssetInputSchema = z.object({
  sourceAssetId: z.number().int().positive(),
  modality: contentProtectionModalitySchema,
  perExportChoice: contentProtectionChoiceSchema.optional(),
  userDefaultChoice: contentProtectionChoiceSchema.optional(),
  idempotencyKey: idempotencyKeySchema,
  compoundEnvelope: z.record(z.string(), z.unknown()).optional(),
}).strict();

export const verifyCopyInputSchema = z.union([
  z.object({ modality: contentProtectionModalitySchema, sourceAssetId: z.number().int().positive() }).strict(),
  z.object({ modality: contentProtectionModalitySchema, storageKey: storageKeySchema }).strict(),
]);

const listAssetsInputSchema = z.object({
  modality: contentProtectionModalitySchema.optional(),
  status: z.string().trim().min(1).max(32).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).max(100_000).default(0),
}).optional();

function requireProtectionAuth(ctx: { tenantId: string | null; user?: { id?: number | null } | null }) {
  if (!ctx.tenantId || !ctx.user?.id) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context required" });
  }
  return { tenantId: ctx.tenantId, userId: ctx.user.id };
}

async function assertContentProtectionEnabled(tenantId: string): Promise<void> {
  const flags = await getTenantFeatureFlags(tenantId) as unknown as Record<string, unknown>;
  if (flags.contentProtectionEnabled !== true) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Content protection is not enabled" });
  }
}

async function assertProtectionModalityEnabled(tenantId: string, modality: string): Promise<void> {
  if (modality !== "image") return;
  const flags = await getTenantFeatureFlags(tenantId) as unknown as Record<string, unknown>;
  if (flags.contentProtectionImageProviderEnabled !== true) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Image content protection is not enabled" });
  }
}

function isAdmin(user: { role?: string | null } | null | undefined): boolean {
  return user?.role === "admin" || user?.role === "system_agent";
}

export function safeAssetView(row: typeof contentProtectionAssets.$inferSelect) {
  return {
    id: row.id,
    modality: row.modality,
    status: row.status,
    watermarkChoice: row.watermarkChoice,
    choiceSource: row.choiceSource,
    mimeType: row.mimeType,
    width: row.width,
    height: row.height,
    durationMs: row.durationMs,
    fps: row.fps,
    sourceSha256: row.sourceSha256,
    protectedSha256: row.protectedSha256,
    sourceVersionId: row.sourceVersionId,
    compoundArtifactId: row.compoundArtifactId,
    compoundPlanDigest: row.compoundPlanDigest,
    causalJobId: row.causalJobId,
    firstObservedAt: row.firstObservedAt,
    claimedCreationAt: row.claimedCreationAt,
    trustedTimestampAt: row.trustedTimestampAt,
    publishedAt: row.publishedAt,
    protectedAt: row.protectedAt,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
  };
}

function outputExtension(mimeType: string): string {
  const subtype = mimeType.split("/", 2)[1]?.toLowerCase().replace(/[^a-z0-9]/g, "");
  return subtype && subtype.length <= 8 ? subtype : "bin";
}

async function loadSourceAsset(input: {
  tenantId: string;
  userId: number;
  sourceAssetId: number;
  admin: boolean;
}) {
  const database = await getDb();
  const predicates = [eq(mediaAssets.id, input.sourceAssetId), eq(mediaAssets.tenantId, input.tenantId)];
  if (!input.admin) predicates.push(eq(mediaAssets.userId, input.userId));
  const [row] = await database.select().from(mediaAssets).where(and(...predicates)).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Source asset not found" });
  if (!row.checksumSha256) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Source asset checksum is not ready" });
  }
  return row;
}

async function loadOwnedProtectionAsset(input: {
  tenantId: string;
  userId: number;
  assetId: string;
  admin?: boolean;
}) {
  const database = await getDb();
  const predicates = [
    eq(contentProtectionAssets.id, input.assetId),
    eq(contentProtectionAssets.tenantId, input.tenantId),
  ];
  if (!input.admin) predicates.push(eq(contentProtectionAssets.ownerUserId, input.userId));
  const [asset] = await database.select().from(contentProtectionAssets).where(and(...predicates)).limit(1);
  if (!asset) throw new TRPCError({ code: "NOT_FOUND", message: "Protected asset not found" });
  return asset;
}

export async function getContentProtectionOverview(input: {
  tenantId: string;
  userId: number;
  admin?: boolean;
}) {
  const database = await getDb();
  const predicates = [eq(contentProtectionAssets.tenantId, input.tenantId)];
  if (!input.admin) predicates.push(eq(contentProtectionAssets.ownerUserId, input.userId));
  const rows = await database.select({ status: contentProtectionAssets.status, total: count() })
    .from(contentProtectionAssets).where(and(...predicates)).groupBy(contentProtectionAssets.status);
  const counts = Object.fromEntries(rows.map(row => [row.status, Number(row.total)]));
  return {
    protected: counts.PROTECTED ?? 0,
    processing: (counts.QUEUED ?? 0) + (counts.PROCESSING ?? 0),
    warning: counts.PROTECTED_WITH_WARNINGS ?? 0,
    failed: counts.FAILED ?? 0,
    notProtected: counts.UNPROTECTED_BY_USER_CHOICE ?? 0,
    inconclusive: counts.INCONCLUSIVE ?? 0,
    stale: counts.STALE ?? 0,
  };
}

export const contentProtectionRouter = router({
  overview: protectedProcedure.query(async ({ ctx }) => {
    const auth = requireProtectionAuth(ctx);
    await assertContentProtectionEnabled(auth.tenantId);
    return getContentProtectionOverview({ ...auth, admin: isAdmin(ctx.user) });
  }),

  listAssets: protectedProcedure.input(listAssetsInputSchema).query(async ({ ctx, input }) => {
    const auth = requireProtectionAuth(ctx);
    await assertContentProtectionEnabled(auth.tenantId);
    const database = await getDb();
    const predicates = [eq(contentProtectionAssets.tenantId, auth.tenantId)];
    if (!isAdmin(ctx.user)) predicates.push(eq(contentProtectionAssets.ownerUserId, auth.userId));
    if (input?.modality) predicates.push(eq(contentProtectionAssets.modality, input.modality));
    if (input?.status) predicates.push(eq(contentProtectionAssets.status, input.status));
    const rows = await database.select().from(contentProtectionAssets)
      .where(and(...predicates))
      .orderBy(desc(contentProtectionAssets.createdAt))
      .limit(input?.limit ?? 50)
      .offset(input?.offset ?? 0);
    return rows.map(safeAssetView);
  }),

  getAsset: protectedProcedure.input(z.object({ assetId: assetIdSchema }).strict()).query(async ({ ctx, input }) => {
    const auth = requireProtectionAuth(ctx);
    await assertContentProtectionEnabled(auth.tenantId);
    const database = await getDb();
    const predicates = [eq(contentProtectionAssets.id, input.assetId), eq(contentProtectionAssets.tenantId, auth.tenantId)];
    if (!isAdmin(ctx.user)) predicates.push(eq(contentProtectionAssets.ownerUserId, auth.userId));
    const [row] = await database.select().from(contentProtectionAssets).where(and(...predicates)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Protected asset not found" });
    return safeAssetView(row);
  }),

  protectAsset: protectedProcedure.input(protectAssetInputSchema).mutation(async ({ ctx, input }) => {
    const auth = requireProtectionAuth(ctx);
    await assertContentProtectionEnabled(auth.tenantId);
    await assertProtectionModalityEnabled(auth.tenantId, input.modality);
    const source = await loadSourceAsset({ ...auth, sourceAssetId: input.sourceAssetId, admin: isAdmin(ctx.user) });
    const choice = input.perExportChoice ?? input.userDefaultChoice ?? "off";
    const choiceSource = input.perExportChoice ? "per_export" : input.userDefaultChoice ? "user_default" : "disabled_by_user";
    let compoundEnvelope: CompoundArtifactEnvelope | undefined;
    if (input.compoundEnvelope) {
      compoundEnvelope = input.compoundEnvelope as unknown as CompoundArtifactEnvelope;
      try {
        validateCompoundArtifactEnvelope(compoundEnvelope);
        if (compoundEnvelope.preProtectionSha256 !== source.checksumSha256) throw new Error("STALE_COMPOUND_ENVELOPE");
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid compound envelope" });
      }
    }
    const database = await getDb();
    const [existing] = await database.select().from(contentProtectionAssets)
      .where(and(eq(contentProtectionAssets.tenantId, auth.tenantId), eq(contentProtectionAssets.idempotencyKey, input.idempotencyKey))).limit(1);
    if (existing) {
      if (existing.sourceSha256 !== source.checksumSha256 || existing.modality !== input.modality || existing.watermarkChoice !== choice) {
        throw new TRPCError({ code: "CONFLICT", message: "Protection request idempotency conflict" });
      }
      return { asset: safeAssetView(existing), jobId: existing.causalJobId, idempotent: true };
    }
    const id = randomUUID();
    const [created] = await database.insert(contentProtectionAssets).values({
      id,
      tenantId: auth.tenantId,
      ownerUserId: auth.userId,
      sourceAssetId: source.id,
      sourceVersionId: source.updatedAt?.toISOString() ?? null,
      modality: input.modality,
      profileId: "content-protection-default",
      profileVersion: "1",
      status: choice === "on" ? "QUEUED" : "UNPROTECTED_BY_USER_CHOICE",
      watermarkChoice: choice,
      choiceSource,
      sourceObjectKey: source.storageKey,
      sourceSha256: source.checksumSha256,
      mimeType: source.mimeType,
      width: source.width,
      height: source.height,
      compoundArtifactId: compoundEnvelope?.compoundArtifactId,
      compoundPlanDigest: compoundEnvelope?.compoundPlanDigest,
      causalJobId: null,
      compoundEnvelope: compoundEnvelope as Record<string, unknown> | null | undefined,
      firstObservedAt: new Date(),
      idempotencyKey: input.idempotencyKey,
    }).returning();
    if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Protection request could not be created" });
    if (choice === "off") return { asset: safeAssetView(created), jobId: null, idempotent: false };

    const providerId = process.env.CONTENT_PROTECTION_PROVIDER?.trim().toLowerCase() || "videoseal";
    const outputObjectKey = `${auth.tenantId}/content-protection/${created.id}.${outputExtension(source.mimeType)}`;
    try {
      const job = await createControlPlaneJob({
        context: {
          tenantId: auth.tenantId,
          actorType: isAdmin(ctx.user) ? "admin" : "user",
          actorId: auth.userId,
          authorizationScope: "content_protection.protect",
          correlationId: ctx.req.requestId ?? created.id,
          idempotencyKey: `content-protection:${created.id}`,
        },
        definition: {
          contractVersion: CONTENT_PROTECTION_CONTRACT_VERSION,
          jobType: CONTENT_PROTECTION_JOB_TYPE,
          executionClass: "cpu",
          input: {
            contractVersion: CONTENT_PROTECTION_CONTRACT_VERSION,
            jobType: CONTENT_PROTECTION_JOB_TYPE,
            protectionAssetId: created.id,
            tenantId: auth.tenantId,
            sourceAssetId: source.id,
            sourceObjectKey: source.storageKey,
            sourceSha256: source.checksumSha256,
            mimeType: source.mimeType,
            modality: input.modality,
            effectiveChoice: "on",
            choiceSource: choiceSource === "per_export" || choiceSource === "user_default" ? choiceSource : "user_default",
            providerId,
            providerVersion: "1",
            outputObjectKey,
            ...(compoundEnvelope ? { compoundEnvelope } : {}),
            requireBeforePublish: true,
          },
          idempotencyKey: `content-protection:${created.id}`,
          requiredCapabilities: {
            capabilityFamilies: ["content_protection"],
            requiredClaimCapability: "content-protection-v1",
            providerId,
            modalities: [input.modality],
          },
          retryPolicy: { maxAttempts: 2, baseDelayMs: 1000, maxDelayMs: 60_000, jitter: "bounded", deadlineMs: 15 * 60_000, allowedErrorClasses: ["retryable"] },
          timeoutPolicy: { softTimeoutMs: 30_000, hardTimeoutMs: 15 * 60_000 },
        },
      });
      const [bound] = await database.update(contentProtectionAssets).set({
        causalJobId: job.jobId,
        protectedObjectKey: outputObjectKey,
      }).where(and(eq(contentProtectionAssets.id, created.id), eq(contentProtectionAssets.tenantId, auth.tenantId))).returning();
      return { asset: safeAssetView(bound ?? created), jobId: job.jobId, idempotent: false };
    } catch {
      const [failed] = await database.update(contentProtectionAssets).set({
        status: "FAILED",
        errorCode: "PROTECTION_JOB_CREATE_FAILED",
        errorMessage: "The protection job could not be queued",
      }).where(and(eq(contentProtectionAssets.id, created.id), eq(contentProtectionAssets.tenantId, auth.tenantId))).returning();
      return { asset: safeAssetView(failed ?? created), jobId: null, idempotent: false };
    }
  }),

  verifyCopy: protectedProcedure.input(verifyCopyInputSchema).mutation(async ({ ctx, input }) => {
    const auth = requireProtectionAuth(ctx);
    await assertContentProtectionEnabled(auth.tenantId);
    await assertProtectionModalityEnabled(auth.tenantId, input.modality);
    let sourceSha256 = "";
    let queryObjectKey: string | null = null;
    if ("sourceAssetId" in input) {
      const source = await loadSourceAsset({ ...auth, sourceAssetId: input.sourceAssetId, admin: isAdmin(ctx.user) });
      sourceSha256 = source.checksumSha256!;
      queryObjectKey = source.storageKey;
    } else {
      queryObjectKey = input.storageKey;
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A tenant-owned library asset is required" });
    }
    const database = await getDb();
    const verificationPredicates = [
      eq(contentVerificationRuns.tenantId, auth.tenantId),
      eq(contentVerificationRuns.querySha256, sourceSha256),
      eq(contentVerificationRuns.modality, input.modality),
    ];
    if (!isAdmin(ctx.user)) verificationPredicates.push(eq(contentVerificationRuns.requestedByUserId, auth.userId));
    const [existing] = await database.select({
      id: contentVerificationRuns.id,
      status: contentVerificationRuns.status,
      modality: contentVerificationRuns.modality,
    }).from(contentVerificationRuns)
      .where(and(...verificationPredicates)).orderBy(desc(contentVerificationRuns.createdAt)).limit(1);
    if (existing && existing.status !== "QUEUED") {
      return { runId: existing.id, status: existing.status, idempotent: true };
    }
    const run = existing ?? (await database.insert(contentVerificationRuns).values({
      id: randomUUID(), tenantId: auth.tenantId, requestedByUserId: auth.userId,
      queryObjectKey, querySha256: sourceSha256, modality: input.modality, status: "QUEUED",
    }).returning({ id: contentVerificationRuns.id, status: contentVerificationRuns.status }))[0];
    if (!run) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Verification request could not be created" });
    const candidatePredicates = [
      eq(contentProtectionAssets.tenantId, auth.tenantId),
      eq(contentProtectionAssets.modality, input.modality),
      or(
        eq(contentProtectionAssets.sourceSha256, sourceSha256),
        eq(contentProtectionAssets.protectedSha256, sourceSha256),
      ),
    ];
    if (!isAdmin(ctx.user)) candidatePredicates.push(eq(contentProtectionAssets.ownerUserId, auth.userId));
    const candidates = await database.select({
      id: contentProtectionAssets.id,
      sourceSha256: contentProtectionAssets.sourceSha256,
      protectedSha256: contentProtectionAssets.protectedSha256,
      status: contentProtectionAssets.status,
      modality: contentProtectionAssets.modality,
    }).from(contentProtectionAssets).where(and(...candidatePredicates));
    for (const candidate of candidates) {
      const matchType = candidate.protectedSha256 === sourceSha256
        ? "exact_protected_sha256"
        : "exact_source_sha256";
      await database.insert(contentVerificationMatches).values({
        id: randomUUID(), tenantId: auth.tenantId, runId: run.id,
        protectedAssetId: candidate.id, matchType, confidence: 1,
        evidenceJson: {
          modality: candidate.modality,
          querySha256: sourceSha256,
          matchedSha256: sourceSha256,
          status: candidate.status,
          method: "tenant_library_exact_hash",
        },
      });
    }
    const matchCount = candidates.length;
    await database.update(contentVerificationRuns).set({
      status: "COMPLETED",
      matchCount,
      resultSummary: {
        method: "tenant_library_exact_hash",
        exactHashMatches: matchCount,
        transformedCopyDetection: "not_run",
        technicalOnly: true,
      },
      completedAt: new Date(),
    }).where(and(eq(contentVerificationRuns.id, run.id), eq(contentVerificationRuns.tenantId, auth.tenantId)));
    return { runId: run.id, status: "COMPLETED", matchCount, idempotent: false };
  }),

  getVerification: protectedProcedure.input(z.object({ runId: assetIdSchema }).strict()).query(async ({ ctx, input }) => {
    const auth = requireProtectionAuth(ctx);
    await assertContentProtectionEnabled(auth.tenantId);
    const database = await getDb();
    const predicates = [eq(contentVerificationRuns.id, input.runId), eq(contentVerificationRuns.tenantId, auth.tenantId)];
    if (!isAdmin(ctx.user)) predicates.push(eq(contentVerificationRuns.requestedByUserId, auth.userId));
    const [run] = await database.select().from(contentVerificationRuns).where(and(...predicates)).limit(1);
    if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Verification run not found" });
    const matches = await database.select().from(contentVerificationMatches)
      .where(and(eq(contentVerificationMatches.runId, run.id), eq(contentVerificationMatches.tenantId, auth.tenantId)))
      .orderBy(asc(contentVerificationMatches.createdAt));
    return { ...run, queryObjectKey: undefined, matches };
  }),

  listCases: protectedProcedure.query(async ({ ctx }) => {
    const auth = requireProtectionAuth(ctx);
    await assertContentProtectionEnabled(auth.tenantId);
    const database = await getDb();
    const predicates = [eq(contentProtectionCases.tenantId, auth.tenantId)];
    if (!isAdmin(ctx.user)) predicates.push(eq(contentProtectionCases.openedByUserId, auth.userId));
    return database.select({
      id: contentProtectionCases.id,
      status: contentProtectionCases.status,
      title: contentProtectionCases.title,
      summary: contentProtectionCases.summary,
      legalDeclarationConfirmed: contentProtectionCases.legalDeclarationConfirmed,
      createdAt: contentProtectionCases.createdAt,
      updatedAt: contentProtectionCases.updatedAt,
    }).from(contentProtectionCases).where(and(...predicates)).orderBy(desc(contentProtectionCases.updatedAt));
  }),

  createCase: protectedProcedure.input(z.object({
    title: z.string().trim().min(1).max(255),
    summary: z.string().trim().max(4000).optional(),
  }).strict()).mutation(async ({ ctx, input }) => {
    const auth = requireProtectionAuth(ctx);
    await assertContentProtectionEnabled(auth.tenantId);
    const database = await getDb();
    const [created] = await database.insert(contentProtectionCases).values({
      id: randomUUID(), tenantId: auth.tenantId, openedByUserId: auth.userId,
      title: input.title, summary: input.summary ?? null,
    }).returning();
    if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Case could not be created" });
    await database.insert(contentProtectionEvents).values({
      tenantId: auth.tenantId, eventType: "case_created", actorUserId: auth.userId,
      eventJson: { caseId: created.id },
    });
    return created;
  }),

  updateCaseStatus: protectedProcedure.input(z.object({
    caseId: assetIdSchema,
    status: caseStatusSchema,
    legalDeclarationConfirmed: z.boolean().optional(),
  }).strict()).mutation(async ({ ctx, input }) => {
    const auth = requireProtectionAuth(ctx);
    await assertContentProtectionEnabled(auth.tenantId);
    if (input.status === "submitted" && input.legalDeclarationConfirmed !== true) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Explicit legal declaration confirmation is required" });
    }
    const database = await getDb();
    const predicates = [eq(contentProtectionCases.id, input.caseId), eq(contentProtectionCases.tenantId, auth.tenantId)];
    if (!isAdmin(ctx.user)) predicates.push(eq(contentProtectionCases.openedByUserId, auth.userId));
    const [updated] = await database.update(contentProtectionCases).set({
      status: input.status,
      ...(input.legalDeclarationConfirmed === undefined ? {} : { legalDeclarationConfirmed: input.legalDeclarationConfirmed }),
      updatedAt: new Date(),
    }).where(and(...predicates)).returning();
    if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Protection case not found" });
    await database.insert(contentProtectionEvents).values({
      tenantId: auth.tenantId, eventType: "case_status_changed", actorUserId: auth.userId,
      eventJson: { caseId: updated.id, status: updated.status },
    });
    return updated;
  }),

  getRights: protectedProcedure.input(z.object({ assetId: assetIdSchema }).strict()).query(async ({ ctx, input }) => {
    const auth = requireProtectionAuth(ctx);
    await assertContentProtectionEnabled(auth.tenantId);
    await loadOwnedProtectionAsset({ ...auth, assetId: input.assetId, admin: isAdmin(ctx.user) });
    const database = await getDb();
    const [holder] = await database.select().from(contentRightsHolderProfiles).where(and(eq(contentRightsHolderProfiles.tenantId, auth.tenantId), eq(contentRightsHolderProfiles.userId, auth.userId))).limit(1);
    const claims = await database.select().from(contentRightsClaims).where(and(eq(contentRightsClaims.tenantId, auth.tenantId), eq(contentRightsClaims.assetId, input.assetId))).orderBy(desc(contentRightsClaims.createdAt));
    const documents = claims.length ? await database.select().from(contentRightsEvidenceDocuments).where(and(eq(contentRightsEvidenceDocuments.tenantId, auth.tenantId), eq(contentRightsEvidenceDocuments.claimId, claims[0].id))).orderBy(desc(contentRightsEvidenceDocuments.createdAt)) : [];
    const components = await database.select().from(contentComponentRights).where(and(eq(contentComponentRights.tenantId, auth.tenantId), eq(contentComponentRights.assetId, input.assetId)));
    return { holder: holder ? { ...holder, metadataJson: undefined } : null, claims, documents, components, disclaimer: "Technical provenance evidence does not by itself establish legal ownership." };
  }),

  createRightsClaim: protectedProcedure.input(rightsClaimInputSchema).mutation(async ({ ctx, input }) => {
    const auth = requireProtectionAuth(ctx);
    await assertContentProtectionEnabled(auth.tenantId);
    const asset = await loadOwnedProtectionAsset({ ...auth, assetId: input.assetId, admin: isAdmin(ctx.user) });
    const database = await getDb();
    const [holder] = await database.insert(contentRightsHolderProfiles).values({
      id: randomUUID(), tenantId: auth.tenantId, userId: auth.userId,
      displayName: input.displayName, contactEmail: input.contactEmail ?? null,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: [contentRightsHolderProfiles.tenantId, contentRightsHolderProfiles.userId],
      set: { displayName: input.displayName, contactEmail: input.contactEmail ?? null, updatedAt: new Date() },
    }).returning();
    if (!holder) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Rights holder profile could not be saved" });
    const [claim] = await database.insert(contentRightsClaims).values({
      id: randomUUID(), tenantId: auth.tenantId, assetId: asset.id, holderProfileId: holder.id,
      claimType: input.claimType, legalDeclarationConfirmed: input.legalDeclarationConfirmed,
      claimedCreationAt: asset.claimedCreationAt,
    }).returning();
    if (!claim) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Rights claim could not be saved" });
    await database.insert(contentProtectionEvents).values({ tenantId: auth.tenantId, assetId: asset.id, actorUserId: auth.userId, eventType: "rights_claim_created", eventJson: { claimId: claim.id, confirmed: input.legalDeclarationConfirmed } });
    return { claim, disclaimer: "This declaration is user-provided and remains subject to applicable law and supporting evidence." };
  }),

  getCertificate: protectedProcedure.input(z.object({ assetId: assetIdSchema }).strict()).query(async ({ ctx, input }) => {
    const auth = requireProtectionAuth(ctx);
    await assertContentProtectionEnabled(auth.tenantId);
    const asset = await loadOwnedProtectionAsset({ ...auth, assetId: input.assetId, admin: isAdmin(ctx.user) });
    const database = await getDb();
    const [certificate] = await database.select().from(contentCreationCertificates).where(and(eq(contentCreationCertificates.tenantId, auth.tenantId), eq(contentCreationCertificates.assetId, asset.id))).orderBy(desc(contentCreationCertificates.createdAt)).limit(1);
    return certificate ? { ...certificate, disclaimer: "Technical provenance evidence does not by itself establish legal ownership." } : null;
  }),

  createCertificate: protectedProcedure.input(z.object({ assetId: assetIdSchema }).strict()).mutation(async ({ ctx, input }) => {
    const auth = requireProtectionAuth(ctx);
    await assertContentProtectionEnabled(auth.tenantId);
    const asset = await loadOwnedProtectionAsset({ ...auth, assetId: input.assetId, admin: isAdmin(ctx.user) });
    if (!asset.protectedSha256 || !["PROTECTED", "PROTECTED_WITH_WARNINGS"].includes(asset.status)) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A verified final protected artifact is required" });
    }
    const payload = JSON.stringify({ assetId: asset.id, sourceSha256: asset.sourceSha256, protectedSha256: asset.protectedSha256, compoundPlanDigest: asset.compoundPlanDigest, protectedAt: asset.protectedAt?.toISOString() ?? null });
    const certificateSha256 = createHash("sha256").update(payload).digest("hex");
    const database = await getDb();
    const [certificate] = await database.insert(contentCreationCertificates).values({
      id: randomUUID(), tenantId: auth.tenantId, assetId: asset.id, certificateVersion: "content-certificate.v1",
      certificateSha256, certificateObjectKey: `content-protection/certificates/${auth.tenantId}/${asset.id}.json`, signerKeyId: "server-evidence-key", signedAt: new Date(),
    }).onConflictDoNothing().returning();
    return certificate ?? (await database.select().from(contentCreationCertificates).where(and(eq(contentCreationCertificates.tenantId, auth.tenantId), eq(contentCreationCertificates.assetId, asset.id))).limit(1))[0] ?? null;
  }),

  createEvidencePackage: protectedProcedure.input(z.object({ caseId: assetIdSchema, assetIds: z.array(assetIdSchema).min(1).max(100) }).strict()).mutation(async ({ ctx, input }) => {
    const auth = requireProtectionAuth(ctx);
    await assertContentProtectionEnabled(auth.tenantId);
    const database = await getDb();
    const casePredicates = [
      eq(contentProtectionCases.id, input.caseId),
      eq(contentProtectionCases.tenantId, auth.tenantId),
    ];
    if (!isAdmin(ctx.user)) casePredicates.push(eq(contentProtectionCases.openedByUserId, auth.userId));
    const [caseRow] = await database.select().from(contentProtectionCases).where(and(...casePredicates)).limit(1);
    if (!caseRow) throw new TRPCError({ code: "NOT_FOUND", message: "Protection case not found" });
    const assetPredicates = [
      eq(contentProtectionAssets.tenantId, auth.tenantId),
      inArray(contentProtectionAssets.id, input.assetIds),
    ];
    if (!isAdmin(ctx.user)) assetPredicates.push(eq(contentProtectionAssets.ownerUserId, auth.userId));
    const assets = await database.select().from(contentProtectionAssets).where(and(...assetPredicates));
    if (assets.length !== input.assetIds.length) throw new TRPCError({ code: "NOT_FOUND", message: "One or more assets were not found" });
    const manifest = { version: "content-evidence.v1", caseId: input.caseId, assets: assets.map(item => ({ id: item.id, modality: item.modality, sourceSha256: item.sourceSha256, protectedSha256: item.protectedSha256, status: item.status, firstObservedAt: item.firstObservedAt, claimedCreationAt: item.claimedCreationAt, trustedTimestampAt: item.trustedTimestampAt, publishedAt: item.publishedAt })), disclaimer: "Technical evidence package; not a legal determination." };
    const packageSha256 = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
    const [created] = await database.insert(contentEvidencePackages).values({ id: randomUUID(), tenantId: auth.tenantId, caseId: input.caseId, packageVersion: "content-evidence.v1", packageSha256, manifestObjectKey: `content-protection/evidence/${auth.tenantId}/${packageSha256}.json`, status: "sealed", createdByUserId: auth.userId, sealedAt: new Date() }).returning();
    return { package: created, manifest };
  }),

  createReviewerLink: protectedProcedure.input(z.object({ packageId: assetIdSchema, expiresInHours: z.number().int().min(1).max(168), scope: z.array(z.string().min(1).max(64)).max(32).default([]) }).strict()).mutation(async ({ ctx, input }) => {
    const auth = requireProtectionAuth(ctx);
    await assertContentProtectionEnabled(auth.tenantId);
    const database = await getDb();
    const [pkg] = await database.select().from(contentEvidencePackages).where(and(eq(contentEvidencePackages.id, input.packageId), eq(contentEvidencePackages.tenantId, auth.tenantId), eq(contentEvidencePackages.createdByUserId, auth.userId))).limit(1);
    if (!pkg) throw new TRPCError({ code: "NOT_FOUND", message: "Evidence package not found" });
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000);
    await database.insert(contentExternalReviewLinks).values({ id: randomUUID(), tenantId: auth.tenantId, packageId: pkg.id, tokenHash, scopeJson: input.scope, expiresAt, createdByUserId: auth.userId });
    return { token: rawToken, expiresAt, disclaimer: "Read-only technical evidence; not a legal ownership determination." };
  }),

  getSettings: protectedProcedure.query(async ({ ctx }) => {
    const auth = requireProtectionAuth(ctx);
    await assertContentProtectionEnabled(auth.tenantId);
    const database = await getDb();
    const [settings] = await database.select({ defaultChoice: contentProtectionSettings.defaultChoice, requireConfirmationOnExport: contentProtectionSettings.requireConfirmationOnExport })
      .from(contentProtectionSettings).where(and(eq(contentProtectionSettings.tenantId, auth.tenantId), eq(contentProtectionSettings.userId, auth.userId))).limit(1);
    return settings ?? { defaultChoice: "off", requireConfirmationOnExport: true };
  }),

  setDefaultChoice: protectedProcedure.input(z.object({ defaultChoice: contentProtectionChoiceSchema, requireConfirmationOnExport: z.boolean().optional() }).strict()).mutation(async ({ ctx, input }) => {
    const auth = requireProtectionAuth(ctx);
    await assertContentProtectionEnabled(auth.tenantId);
    const database = await getDb();
    const [settings] = await database.insert(contentProtectionSettings).values({
      id: randomUUID(), tenantId: auth.tenantId, userId: auth.userId,
      defaultChoice: input.defaultChoice,
      requireConfirmationOnExport: input.requireConfirmationOnExport ?? true,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: [contentProtectionSettings.tenantId, contentProtectionSettings.userId],
      set: { defaultChoice: input.defaultChoice, ...(input.requireConfirmationOnExport === undefined ? {} : { requireConfirmationOnExport: input.requireConfirmationOnExport }), updatedAt: new Date() },
    }).returning({ defaultChoice: contentProtectionSettings.defaultChoice, requireConfirmationOnExport: contentProtectionSettings.requireConfirmationOnExport });
    return settings;
  }),
});

export type ContentProtectionRouter = typeof contentProtectionRouter;
