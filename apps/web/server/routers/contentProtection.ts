import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  CONTENT_PROTECTION_MODALITIES,
  WATERMARK_CHOICES,
  validateCompoundArtifactEnvelope,
  type CompoundArtifactEnvelope,
} from "@smartspec/shared";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";
import {
  contentProtectionAssets,
  contentProtectionSettings,
  contentVerificationMatches,
  contentVerificationRuns,
  mediaAssets,
} from "../../drizzle/schema";

export const contentProtectionModalitySchema = z.enum(CONTENT_PROTECTION_MODALITIES);
export const contentProtectionChoiceSchema = z.enum(WATERMARK_CHOICES);
const assetIdSchema = z.string().uuid();
const idempotencyKeySchema = z.string().trim().min(8).max(160).regex(/^[A-Za-z0-9._:-]+$/);
const storageKeySchema = z.string().trim().min(1).max(1024)
  .refine(value => !value.includes("..") && !value.startsWith("/"), "Invalid storage reference");

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
    return { asset: safeAssetView(created), jobId: null, idempotent: false };
  }),

  verifyCopy: protectedProcedure.input(verifyCopyInputSchema).mutation(async ({ ctx, input }) => {
    const auth = requireProtectionAuth(ctx);
    await assertContentProtectionEnabled(auth.tenantId);
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
    const [existing] = await database.select().from(contentVerificationRuns)
      .where(and(eq(contentVerificationRuns.tenantId, auth.tenantId), eq(contentVerificationRuns.querySha256, sourceSha256), eq(contentVerificationRuns.status, "QUEUED"))).limit(1);
    if (existing) return { runId: existing.id, status: existing.status, idempotent: true };
    const [run] = await database.insert(contentVerificationRuns).values({
      id: randomUUID(), tenantId: auth.tenantId, requestedByUserId: auth.userId,
      queryObjectKey, querySha256: sourceSha256, modality: input.modality, status: "QUEUED",
    }).returning({ id: contentVerificationRuns.id, status: contentVerificationRuns.status });
    if (!run) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Verification request could not be created" });
    return { runId: run.id, status: run.status, idempotent: false };
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
