import { createHash, createPrivateKey, createPublicKey, randomBytes, randomUUID, sign as signPayload } from "node:crypto";
import AdmZip from "adm-zip";
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
  CONTENT_PROTECTION_RUNTIME_TYPE,
  CONTENT_PROTECTION_REQUIRED_CLAIM_CAPABILITY,
  CONTENT_PROTECTION_VERIFY_CONTRACT_VERSION,
  CONTENT_PROTECTION_VERIFY_JOB_TYPE,
} from "../../shared/contentProtectionWorker";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";
import { createControlPlaneJob } from "../services/jobControlPlaneGateway";
import { getOwnershipProfile } from "../services/profileOwnershipService";
import { storagePut, storageStreamFile } from "../storage";
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
export const rightsClaimInputSchema = z.object({
  assetId: assetIdSchema,
  claimType: z.string().trim().min(1).max(48),
  legalDeclarationConfirmed: z.boolean().default(false),
}).strict();

export function resolveRightsHolderSnapshot(profile: {
  displayName?: string | null;
  legalName?: string | null;
  contactEmail?: string | null;
} | null) {
  const displayName = profile?.displayName?.trim() || profile?.legalName?.trim() || null;
  if (!displayName) return null;
  return {
    displayName,
    contactEmail: profile?.contactEmail?.trim() || null,
  };
}

function createEvidencePdf(title: string, lines: string[]): Buffer {
  const safeLines = [title, ...lines].map(line => line.replace(/[^\x20-\x7E]/g, "?").replace(/[()\\]/g, character => `\\${character}`).slice(0, 180)).slice(0, 44);
  const content = [
    "BT",
    "/F1 10 Tf",
    "50 760 Td",
    ...safeLines.map((line, index) => `(${line}) Tj${index === safeLines.length - 1 ? "" : " 0 -16 Td"}`),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "ascii")} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}

function signEvidencePayload(payload: string): {
  signerKeyId: string;
  signatureAlgorithm: "ed25519";
  signerPublicKey: string;
  signature: string;
} {
  const signingKeyPem = process.env.CONTENT_PROTECTION_SIGNING_PRIVATE_KEY_PEM?.trim();
  const signerKeyId = process.env.CONTENT_PROTECTION_SIGNING_KEY_ID?.trim();
  if (!signingKeyPem || !signerKeyId) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Content protection evidence signing is not configured" });
  }
  try {
    const privateKey = createPrivateKey(signingKeyPem);
    if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("UNSUPPORTED_SIGNING_KEY");
    return {
      signerKeyId,
      signatureAlgorithm: "ed25519",
      signerPublicKey: createPublicKey(privateKey).export({ type: "spki", format: "der" }).toString("base64"),
      signature: signPayload(null, Buffer.from(payload, "utf8"), privateKey).toString("base64"),
    };
  } catch {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Content protection evidence signing key is invalid" });
  }
}

async function readBoundedStoredText(storageKey: string, maxBytes = 2 * 1024 * 1024): Promise<string | null> {
  const stored = await storageStreamFile(storageKey);
  if (!stored) return null;
  const chunks: Buffer[] = [];
  let total = 0;
  const consume = (chunk: Buffer | Uint8Array | string) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > maxBytes) throw new Error("STORED_EVIDENCE_OBJECT_TOO_LARGE");
    chunks.push(buffer);
  };
  const stream = stored.stream as any;
  if (typeof stream?.[Symbol.asyncIterator] === "function") {
    for await (const chunk of stream as AsyncIterable<Buffer | Uint8Array | string>) consume(chunk);
  } else if (typeof stream?.getReader === "function") {
    const reader = stream.getReader();
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        consume(next.value);
      }
    } finally {
      reader.releaseLock?.();
    }
  } else {
    return null;
  }
  return Buffer.concat(chunks).toString("utf8");
}

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
    publicAssetId: row.publicAssetId,
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

function safeCaseView(row: typeof contentProtectionCases.$inferSelect) {
  return {
    publicCaseId: row.publicCaseId,
    status: row.status,
    title: row.title,
    summary: row.summary,
    legalDeclarationConfirmed: row.legalDeclarationConfirmed,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function outputExtension(mimeType: string): string {
  const subtype = mimeType.split("/", 2)[1]?.toLowerCase().replace(/[^a-z0-9]/g, "");
  return subtype && subtype.length <= 8 ? subtype : "bin";
}

async function computeManagedAssetSha256(storageKey: string): Promise<string> {
  const stored = await storageStreamFile(storageKey);
  if (!stored) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Source media is not available" });
  const hash = createHash("sha256");
  const maxBytes = 2 * 1024 * 1024 * 1024;
  let totalBytes = 0;
  const consume = (chunk: Buffer | Uint8Array | string) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > maxBytes) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Source media exceeds the verification size limit" });
    }
    hash.update(buffer);
  };
  const stream = stored.stream as any;
  if (typeof stream?.[Symbol.asyncIterator] === "function") {
    for await (const chunk of stream as AsyncIterable<Buffer | Uint8Array | string>) consume(chunk);
  } else if (typeof stream?.getReader === "function") {
    const reader = stream.getReader();
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        consume(next.value);
      }
    } finally {
      reader.releaseLock?.();
    }
  } else {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Source media stream is unavailable" });
  }
  if (totalBytes === 0) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Source media is empty" });
  return hash.digest("hex");
}

async function hydrateSourceAssetChecksum(
  row: typeof mediaAssets.$inferSelect,
  database: ReturnType<typeof getDb>,
  tenantId: string,
): Promise<typeof mediaAssets.$inferSelect> {
  if (row.status !== "ready") {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Source asset is not ready" });
  }
  if (row.checksumSha256) return row;
  const checksumSha256 = await computeManagedAssetSha256(row.storageKey);
  const [updated] = await database.update(mediaAssets).set({ checksumSha256, updatedAt: new Date() })
    .where(and(eq(mediaAssets.id, row.id), eq(mediaAssets.tenantId, tenantId))).returning();
  return updated ?? { ...row, checksumSha256 };
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
  return hydrateSourceAssetChecksum(row, database, input.tenantId);
}

async function loadOwnedProtectionAsset(input: {
  tenantId: string;
  userId: number;
  assetId: string;
  admin?: boolean;
}) {
  const database = await getDb();
  const predicates = [
    or(
      eq(contentProtectionAssets.id, input.assetId),
      eq(contentProtectionAssets.publicAssetId, input.assetId),
    ),
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
    const predicates = [
      or(
        eq(contentProtectionAssets.id, input.assetId),
        eq(contentProtectionAssets.publicAssetId, input.assetId),
      ),
      eq(contentProtectionAssets.tenantId, auth.tenantId),
    ];
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
            requiredClaimCapability: CONTENT_PROTECTION_REQUIRED_CLAIM_CAPABILITY,
            providerId,
            modalities: [input.modality],
          },
          retryPolicy: { maxAttempts: 2, baseDelayMs: 1000, maxDelayMs: 60_000, jitter: "bounded", deadlineMs: 15 * 60_000, allowedErrorClasses: ["retryable"] },
          timeoutPolicy: { softTimeoutMs: 30_000, hardTimeoutMs: 15 * 60_000 },
        },
        createOptions: { runtimeType: CONTENT_PROTECTION_RUNTIME_TYPE },
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
    const database = await getDb();
    let sourceSha256 = "";
    let queryObjectKey = "";
    let queryPerceptualHash: string | null = null;
    let source: typeof mediaAssets.$inferSelect;
    if ("sourceAssetId" in input) {
      source = await loadSourceAsset({ ...auth, sourceAssetId: input.sourceAssetId, admin: isAdmin(ctx.user) });
    } else {
      const predicates = [
        eq(mediaAssets.storageKey, input.storageKey),
        eq(mediaAssets.tenantId, auth.tenantId),
      ];
      if (!isAdmin(ctx.user)) predicates.push(eq(mediaAssets.userId, auth.userId));
      const [storageSource] = await database.select().from(mediaAssets).where(and(...predicates)).limit(1);
      if (!storageSource) throw new TRPCError({ code: "NOT_FOUND", message: "Source asset not found" });
      source = await hydrateSourceAssetChecksum(storageSource, database, auth.tenantId);
    }
    sourceSha256 = source.checksumSha256!;
    queryObjectKey = source.storageKey;
    queryPerceptualHash = source.perceptualHash;
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
    if (existing && existing.status !== "QUEUED" && existing.status !== "FAILED") {
      return { runId: existing.id, status: existing.status, idempotent: true };
    }
    const run = existing?.status === "QUEUED" ? existing : (await database.insert(contentVerificationRuns).values({
      id: randomUUID(), tenantId: auth.tenantId, requestedByUserId: auth.userId,
      queryObjectKey, querySha256: sourceSha256, modality: input.modality, status: "QUEUED",
    }).returning({ id: contentVerificationRuns.id, status: contentVerificationRuns.status }))[0];
    if (!run) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Verification request could not be created" });
    try {
      const job = await createControlPlaneJob({
        context: {
          tenantId: auth.tenantId,
          actorType: isAdmin(ctx.user) ? "admin" : "user",
          actorId: auth.userId,
          authorizationScope: "content_protection.verify",
          correlationId: ctx.req.requestId ?? run.id,
          idempotencyKey: `content-protection-verify:${run.id}`,
        },
        definition: {
          contractVersion: CONTENT_PROTECTION_VERIFY_CONTRACT_VERSION,
          jobType: CONTENT_PROTECTION_VERIFY_JOB_TYPE,
          executionClass: "cpu",
          input: {
            contractVersion: CONTENT_PROTECTION_VERIFY_CONTRACT_VERSION,
            jobType: CONTENT_PROTECTION_VERIFY_JOB_TYPE,
            tenantId: auth.tenantId,
            runId: run.id,
            requestedByUserId: auth.userId,
            candidateScope: isAdmin(ctx.user) ? "tenant" : "owner",
            queryObjectKey,
            querySha256: sourceSha256,
            queryPerceptualHash,
            modality: input.modality,
          },
          idempotencyKey: `content-protection-verify:${run.id}`,
          requiredCapabilities: {
            capabilityFamilies: ["content_protection"],
            requiredClaimCapability: "content-protection-verification-v1",
            modalities: [input.modality],
          },
          retryPolicy: { maxAttempts: 2, baseDelayMs: 1000, maxDelayMs: 60_000, jitter: "bounded", deadlineMs: 15 * 60_000, allowedErrorClasses: ["retryable"] },
          timeoutPolicy: { softTimeoutMs: 30_000, hardTimeoutMs: 15 * 60_000 },
        },
      });
      return { runId: run.id, status: run.status, jobId: job.jobId, idempotent: existing?.status === "QUEUED" };
    } catch {
      await database.update(contentVerificationRuns).set({
        status: "FAILED",
        resultSummary: { technicalOnly: true, errorCode: "VERIFICATION_JOB_CREATE_FAILED" },
        completedAt: new Date(),
      }).where(and(eq(contentVerificationRuns.id, run.id), eq(contentVerificationRuns.tenantId, auth.tenantId)));
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Verification request could not be queued" });
    }
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
      publicCaseId: contentProtectionCases.publicCaseId,
      status: contentProtectionCases.status,
      title: contentProtectionCases.title,
      summary: contentProtectionCases.summary,
      legalDeclarationConfirmed: contentProtectionCases.legalDeclarationConfirmed,
      createdAt: contentProtectionCases.createdAt,
      updatedAt: contentProtectionCases.updatedAt,
    }).from(contentProtectionCases).where(and(...predicates)).orderBy(desc(contentProtectionCases.updatedAt));
  }),

  getCase: protectedProcedure.input(z.object({ caseId: assetIdSchema }).strict()).query(async ({ ctx, input }) => {
    const auth = requireProtectionAuth(ctx);
    await assertContentProtectionEnabled(auth.tenantId);
    const database = await getDb();
    const predicates = [
      or(
        eq(contentProtectionCases.id, input.caseId),
        eq(contentProtectionCases.publicCaseId, input.caseId),
      ),
      eq(contentProtectionCases.tenantId, auth.tenantId),
    ];
    if (!isAdmin(ctx.user)) predicates.push(eq(contentProtectionCases.openedByUserId, auth.userId));
    const [caseRow] = await database.select({
      publicCaseId: contentProtectionCases.publicCaseId,
      status: contentProtectionCases.status,
      title: contentProtectionCases.title,
      summary: contentProtectionCases.summary,
      legalDeclarationConfirmed: contentProtectionCases.legalDeclarationConfirmed,
      createdAt: contentProtectionCases.createdAt,
      updatedAt: contentProtectionCases.updatedAt,
    }).from(contentProtectionCases).where(and(...predicates)).limit(1);
    if (!caseRow) throw new TRPCError({ code: "NOT_FOUND", message: "Protection case not found" });
    return caseRow;
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
    return safeCaseView(created);
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
    return safeCaseView(updated);
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
    const ownershipProfile = resolveRightsHolderSnapshot(await getOwnershipProfile(auth.userId));
    if (!ownershipProfile) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Complete your creator ownership profile in Settings before creating a rights claim",
      });
    }
    const database = await getDb();
    const [holder] = await database.insert(contentRightsHolderProfiles).values({
      id: randomUUID(), tenantId: auth.tenantId, userId: auth.userId,
      displayName: ownershipProfile.displayName, contactEmail: ownershipProfile.contactEmail,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: [contentRightsHolderProfiles.tenantId, contentRightsHolderProfiles.userId],
      set: { displayName: ownershipProfile.displayName, contactEmail: ownershipProfile.contactEmail, updatedAt: new Date() },
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
    const payload = JSON.stringify({
      certificateVersion: "content-certificate.v1",
      publicAssetId: asset.publicAssetId,
      sourceSha256: asset.sourceSha256,
      protectedSha256: asset.protectedSha256,
      compoundPlanDigest: asset.compoundPlanDigest,
      protectedAt: asset.protectedAt?.toISOString() ?? null,
      technicalOnly: true,
    });
    const signatureRecord = signEvidencePayload(payload);
    const certificateDocument = {
      format: "sah-content-certificate.v1",
      payload: JSON.parse(payload),
      ...signatureRecord,
      disclaimer: "Technical provenance evidence does not by itself establish legal ownership.",
    };
    const certificateSha256 = createHash("sha256").update(JSON.stringify(certificateDocument)).digest("hex");
    const certificateObjectKey = `content-protection/${auth.tenantId}/assets/${asset.id}/certificates/content-certificate.v1.json`;
    try {
      await storagePut(certificateObjectKey, Buffer.from(JSON.stringify(certificateDocument, null, 2), "utf8"), "application/json");
    } catch {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Signed content certificate could not be stored" });
    }
    const database = await getDb();
    const [certificate] = await database.insert(contentCreationCertificates).values({
      id: randomUUID(), tenantId: auth.tenantId, assetId: asset.id, certificateVersion: "content-certificate.v1",
      certificateSha256, certificateObjectKey, signerKeyId: signatureRecord.signerKeyId, signedAt: new Date(),
    }).onConflictDoNothing().returning();
    await database.insert(contentProtectionEvents).values({ tenantId: auth.tenantId, assetId: asset.id, actorUserId: auth.userId, eventType: "creation_certificate_signed", eventJson: { certificateVersion: "content-certificate.v1", certificateSha256, signerKeyId: signatureRecord.signerKeyId } });
    return certificate ?? (await database.select().from(contentCreationCertificates).where(and(eq(contentCreationCertificates.tenantId, auth.tenantId), eq(contentCreationCertificates.assetId, asset.id))).limit(1))[0] ?? null;
  }),

  createEvidencePackage: protectedProcedure.input(z.object({ caseId: assetIdSchema, assetIds: z.array(assetIdSchema).min(1).max(100) }).strict()).mutation(async ({ ctx, input }) => {
    const auth = requireProtectionAuth(ctx);
    await assertContentProtectionEnabled(auth.tenantId);
    const database = await getDb();
    const casePredicates = [
      or(
        eq(contentProtectionCases.id, input.caseId),
        eq(contentProtectionCases.publicCaseId, input.caseId),
      ),
      eq(contentProtectionCases.tenantId, auth.tenantId),
    ];
    if (!isAdmin(ctx.user)) casePredicates.push(eq(contentProtectionCases.openedByUserId, auth.userId));
    const [caseRow] = await database.select().from(contentProtectionCases).where(and(...casePredicates)).limit(1);
    if (!caseRow) throw new TRPCError({ code: "NOT_FOUND", message: "Protection case not found" });
    const assetPredicates = [
      eq(contentProtectionAssets.tenantId, auth.tenantId),
      or(
        inArray(contentProtectionAssets.id, input.assetIds),
        inArray(contentProtectionAssets.publicAssetId, input.assetIds),
      ),
    ];
    if (!isAdmin(ctx.user)) assetPredicates.push(eq(contentProtectionAssets.ownerUserId, auth.userId));
    const assets = await database.select().from(contentProtectionAssets).where(and(...assetPredicates));
    if (assets.length !== input.assetIds.length) throw new TRPCError({ code: "NOT_FOUND", message: "One or more assets were not found" });
    const notReady = assets.filter(item => !["PROTECTED", "PROTECTED_WITH_WARNINGS"].includes(item.status));
    if (notReady.length > 0) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Evidence packages require protected, self-verified assets",
      });
    }
    const assetIds = assets.map(item => item.id);
    const certificates = await database.select().from(contentCreationCertificates).where(and(
      eq(contentCreationCertificates.tenantId, auth.tenantId),
      inArray(contentCreationCertificates.assetId, assetIds),
    ));
    const publicAssetIdByInternalId = new Map(assets.map(asset => [asset.id, asset.publicAssetId]));
    const certificateSummaries = certificates.map(certificate => ({
      id: certificate.id,
      publicAssetId: publicAssetIdByInternalId.get(certificate.assetId) ?? null,
      certificateVersion: certificate.certificateVersion,
      certificateSha256: certificate.certificateSha256,
      signerKeyId: certificate.signerKeyId,
      signedAt: certificate.signedAt,
    }));
    const certificateDocuments: Array<Record<string, unknown>> = await Promise.all(certificates.map(async certificate => {
      const text = await readBoundedStoredText(certificate.certificateObjectKey);
      if (!text) return { available: false, certificateId: certificate.id, reason: "Signed certificate object is unavailable." };
      try {
        const document = JSON.parse(text) as Record<string, unknown>;
        const payload = document.payload && typeof document.payload === "object"
          ? document.payload as Record<string, unknown>
          : null;
        const rawPublicAssetId = typeof payload?.publicAssetId === "string"
          ? payload.publicAssetId
          : typeof payload?.assetId === "string"
            ? publicAssetIdByInternalId.get(payload.assetId) ?? null
            : null;
        return payload
          ? { ...document, payload: { ...payload, publicAssetId: rawPublicAssetId } }
          : document;
      } catch {
        return { available: false, certificateId: certificate.id, reason: "Signed certificate object is not valid JSON." };
      }
    }));
    const claims = await database.select().from(contentRightsClaims).where(and(
      eq(contentRightsClaims.tenantId, auth.tenantId),
      inArray(contentRightsClaims.assetId, assetIds),
    ));
    const claimIds = claims.map(claim => claim.id);
    const supportingDocuments = claimIds.length > 0
      ? await database.select().from(contentRightsEvidenceDocuments).where(and(
          eq(contentRightsEvidenceDocuments.tenantId, auth.tenantId),
          inArray(contentRightsEvidenceDocuments.claimId, claimIds),
        ))
      : [];
    const auditEvents = await database.select().from(contentProtectionEvents).where(and(
      eq(contentProtectionEvents.tenantId, auth.tenantId),
      inArray(contentProtectionEvents.assetId, assetIds),
    )).orderBy(asc(contentProtectionEvents.createdAt));
    const assetsManifest = assets.map(item => ({
      publicAssetId: item.publicAssetId,
      modality: item.modality,
      sourceSha256: item.sourceSha256,
      protectedSha256: item.protectedSha256,
      status: item.status,
      firstObservedAt: item.firstObservedAt,
      claimedCreationAt: item.claimedCreationAt,
      trustedTimestampAt: item.trustedTimestampAt,
      publishedAt: item.publishedAt,
    }));
    const packageId = randomUUID();
    const verificationProcedure = {
      format: "sah-verification-procedure-v1",
      detectorPolicyVersion: "content-protection-policy.v1",
      exactHash: { algorithm: "SHA-256", comparison: "byte-for-byte" },
      imagePerceptualHash: { algorithm: "dHash", threshold: 12, available: true },
      invisibleWatermark: { status: "recorded_from_protected_asset_self_verification", legalMeaning: "technical_only" },
      modalityCoverage: { image: "exact_hash_plus_dhash", video: "exact_hash_and_protected_record", audio: "exact_hash_and_protected_record" },
      providerAndVersion: assets.map(item => ({ publicAssetId: item.publicAssetId, provider: "recorded_in_content_protection_watermarks", version: "content-protection.v1" })),
      normalization: "The package records the exact persisted source/protected SHA-256 values; no additional normalization is applied by package generation.",
      matchedRegionsOrSegments: "Not available unless a verification run is linked to this case.",
      calibrationReference: "No external calibration reference is asserted by this package.",
      technicalOnly: true,
    };
    const report = {
      format: "sah-content-protection-report-v1",
      case: {
        publicCaseId: caseRow.publicCaseId,
        title: caseRow.title,
        status: caseRow.status,
        summary: caseRow.summary,
        legalDeclarationConfirmed: caseRow.legalDeclarationConfirmed,
        createdAt: caseRow.createdAt,
        updatedAt: caseRow.updatedAt,
      },
      assets: assetsManifest,
      certificates: certificateSummaries,
      rightsClaims: claims.map(claim => ({
        id: claim.id,
        publicAssetId: publicAssetIdByInternalId.get(claim.assetId) ?? null,
        holderProfileId: claim.holderProfileId,
        claimType: claim.claimType,
        status: claim.status,
        claimedCreationAt: claim.claimedCreationAt,
        legalDeclarationConfirmed: claim.legalDeclarationConfirmed,
        createdAt: claim.createdAt,
      })),
      supportingDocuments: supportingDocuments.map(document => ({
        id: document.id,
        claimId: document.claimId,
        documentType: document.documentType,
        sha256: document.sha256,
        capturedAt: document.capturedAt,
      })),
      limitations: [
        "This is technical provenance evidence, not a legal ownership determination.",
        "Original full-resolution masters and internal storage keys are not embedded by default.",
        "C2PA, trusted timestamp, PDF report, and external publication evidence are included only when persisted and configured.",
      ],
    };
    const json = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2), "utf8");
    const sourceHashes = assets.map(item => `${item.publicAssetId} ${item.sourceSha256}`).join("\n") + "\n";
    const protectedHashes = assets.map(item => `${item.publicAssetId} ${item.protectedSha256 ?? "UNAVAILABLE"}`).join("\n") + "\n";
    const unavailable = (reason: string) => ({ available: false, reason });
    const reviewerInstructions = [
      "SmartAIHub Content Protection — reviewer instructions",
      "1. Verify the ZIP SHA-256 against the package record before relying on any file.",
      "2. Read verification-procedure.json to identify the exact detector policy and thresholds.",
      "3. Treat hashes, watermark records, and similarity signals as technical corroboration only.",
      "4. Verify claimant authority, licences, timestamps, and the original/publication chain separately.",
      "5. SmartAIHub does not adjudicate copyright ownership.",
    ].join("\n");
    const files: Record<string, Buffer> = {
      "README.txt": Buffer.from([
        "SmartAIHub Content Protection evidence package",
        `Case: ${caseRow.publicCaseId}`,
        "",
        "This bundle is a self-describing technical evidence record. It does not decide legal ownership or infringement.",
        "Start with report.json, then verification-procedure.json and integrity/manifest.json.",
        "Original full-resolution masters are intentionally omitted by default.",
      ].join("\n"), "utf8"),
      "REVIEWER-INSTRUCTIONS.pdf": createEvidencePdf("SmartAIHub reviewer instructions", [
        "Verify the ZIP SHA-256 against the package record.",
        "Read verification-procedure.json before interpreting a result.",
        "Technical evidence is not a legal ownership determination.",
      ]),
      "REVIEWER-INSTRUCTIONS.txt": Buffer.from(reviewerInstructions, "utf8"),
      "report.json": json(report),
      "verification-procedure.json": json(verificationProcedure),
      "report.pdf": createEvidencePdf("SmartAIHub content protection report", [
        `Case ${caseRow.publicCaseId}`,
        `${assets.length} protected asset(s) included`,
        "See report.json for machine-readable details and limitations.",
      ]),
      "certificate/creation-registration-certificate.json": json(certificateDocuments.length > 0 ? certificateDocuments : unavailable("No creation certificate was persisted for the selected assets.")),
      "certificate/creation-registration-certificate.sig": json(certificateDocuments.length > 0 ? certificateDocuments.map(document => ({
        certificateVersion: document.certificateVersion ?? null,
        publicAssetId: (document.payload as Record<string, unknown> | undefined)?.publicAssetId ?? null,
        signerKeyId: document.signerKeyId ?? null,
        signatureAlgorithm: document.signatureAlgorithm ?? null,
        signature: document.signature ?? null,
        certificateSha256: certificateSummaries.find(item => item.publicAssetId === ((document.payload as Record<string, unknown> | undefined)?.publicAssetId ?? ""))?.certificateSha256 ?? null,
      })) : unavailable("No detached certificate signature was persisted for the selected assets.")),
      "certificate/trusted-timestamp.tsr": Buffer.from("UNAVAILABLE: no external trusted timestamp token is configured for this package.\n", "utf8"),
      "certificate/signer-public-key.json": json(certificateDocuments.length > 0 ? certificateDocuments.map(document => ({
        signerKeyId: document.signerKeyId ?? null,
        signatureAlgorithm: document.signatureAlgorithm ?? null,
        signerPublicKey: document.signerPublicKey ?? null,
      })) : unavailable("No signer public key was persisted for the selected assets.")),
      "certificate/transparency-proof.json": json(unavailable("Transparency proof export is not configured.")),
      "rights/rights-claim.json": json(claims.length > 0 ? claims : unavailable("No rights claim was persisted for the selected assets.")),
      "rights/rights-holder-summary.pdf": createEvidencePdf("Rights-holder summary", [
        claims.length > 0 ? `${claims.length} claim record(s) are included in rights/rights-claim.json.` : "No rights claim was persisted for the selected assets.",
        "This summary is technical and user-provided where applicable.",
      ]),
      "rights/claim-scope.json": json({ available: false, reason: "Claim scope records are not persisted in the current case model." }),
      "rights/component-rights-matrix.json": json({ available: false, reason: "No component-rights rows were attached to this package." }),
      "rights/supporting-document-index.json": json(supportingDocuments),
      "original/protected-asset-summary.json": json(assetsManifest),
      "original/source-master-sha256.txt": Buffer.from(sourceHashes, "utf8"),
      "original/protected-master-sha256.txt": Buffer.from(protectedHashes, "utf8"),
      "original/provenance-summary.json": json({ available: false, reason: "Full production provenance receipts are not attached to this case package." }),
      "original/generation-receipts.json": json({ available: false, reason: "Generation receipt export is not attached to this case package." }),
      "original/publication-history.json": json({ available: false, reason: "No publication records were attached to this case package." }),
      "original/c2pa-verification.json": json(unavailable("C2PA manifest export is not configured.")),
      "original/image-pdq.json": json(unavailable("Image PDQ export is not configured.")),
      "original/video-vpdq-summary.json": json(unavailable("Video VPDQ export is not configured.")),
      "original/audio-fingerprint-summary.json": json(unavailable("Audio fingerprint export is not configured.")),
      "original/thumbnails-or-waveform/README.txt": Buffer.from("No thumbnail or waveform artifact was attached to this package.\n", "utf8"),
      "suspected/source-summary.json": json(unavailable("No suspected-copy upload is attached to an evidence package.")),
      "suspected/sha256.txt": Buffer.from("UNAVAILABLE: no suspected-copy upload is attached.\n", "utf8"),
      "suspected/media-info.json": json(unavailable("No suspected-copy media info is attached.")),
      "comparison/verification-result.json": json(unavailable("No verification run is linked to this evidence package.")),
      "comparison/verification-procedure.json": json(verificationProcedure),
      "comparison/detector-policy.json": json({ version: "content-protection-policy.v1", exactHash: "SHA-256", imageDHashThreshold: 12 }),
      "comparison/matched-regions.json": json(unavailable("No image verification run is linked.")),
      "comparison/matched-segments.json": json(unavailable("No audio/video verification run is linked.")),
      "comparison/watermark-analysis.json": json({ available: true, status: "recorded_from_protected_asset_self_verification", technicalOnly: true }),
      "comparison/image-fingerprint-analysis.json": json(unavailable("No image verification run is linked.")),
      "comparison/video-fingerprint-analysis.json": json(unavailable("No video verification run is linked.")),
      "comparison/audio-fingerprint-analysis.json": json(unavailable("No audio verification run is linked.")),
      "comparison/visual-comparison-contact-sheet.pdf": createEvidencePdf("Visual comparison", ["No verification run is linked to this package."]),
      "comparison/audio-comparison-summary.pdf": createEvidencePdf("Audio comparison", ["No verification run is linked to this package."]),
      "integrity/manifest.json": json({ packageId, packageVersion: "content-evidence.v1", files: "See top-level manifest.json for the signed-bundle input manifest.", signature: unavailable("Detached signing is not configured.") }),
      "integrity/manifest.sig": Buffer.from("UNAVAILABLE: detached manifest signature is not configured for this package.\n", "utf8"),
      "integrity/bundle-sha256.txt": Buffer.from("The ZIP SHA-256 is stored in the package record and returned with the sealed package.\n", "utf8"),
      "audit/chain-of-custody.json": json({ packageId, createdAt: new Date(), events: auditEvents.map(event => ({ eventType: event.eventType, publicAssetId: event.assetId ? publicAssetIdByInternalId.get(event.assetId) ?? null : null, createdAt: event.createdAt })) }),
      "audit/relevant-events.json": json(auditEvents.map(event => ({ eventType: event.eventType, publicAssetId: event.assetId ? publicAssetIdByInternalId.get(event.assetId) ?? null : null, createdAt: event.createdAt }))),
    };
    const manifest = {
      version: "content-evidence.v1",
      packageId,
      publicCaseId: caseRow.publicCaseId,
      assets: assetsManifest,
      files: ["manifest.json", ...Object.keys(files)].sort(),
      disclaimer: "Technical evidence package; not a legal determination.",
    };
    const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");
    const manifestSignature = signEvidencePayload(manifestBytes.toString("utf8"));
    files["integrity/manifest.json"] = manifestBytes;
    files["integrity/manifest.sig"] = Buffer.from(JSON.stringify({
      format: "sah-content-evidence-manifest-signature.v1",
      manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
      ...manifestSignature,
    }, null, 2), "utf8");
    const zip = new AdmZip();
    zip.addFile("manifest.json", manifestBytes);
    for (const [fileName, contents] of Object.entries(files)) zip.addFile(fileName, contents);
    const archive = zip.toBuffer();
    const packageSha256 = createHash("sha256").update(archive).digest("hex");
    const packageObjectKey = `content-protection/${auth.tenantId}/cases/${caseRow.id}/evidence/${packageId}/evidence.zip`;
    await storagePut(packageObjectKey, archive, "application/zip");
    const [created] = await database.insert(contentEvidencePackages).values({ id: packageId, tenantId: auth.tenantId, caseId: caseRow.id, packageVersion: "content-evidence.v1", packageSha256, manifestObjectKey: packageObjectKey, status: "sealed", createdByUserId: auth.userId, sealedAt: new Date() }).returning();
    return { package: created ? { ...created, publicCaseId: caseRow.publicCaseId } : created, manifest, verificationProcedure };
  }),

  createReviewerLink: protectedProcedure.input(z.object({ packageId: assetIdSchema, expiresInHours: z.number().int().min(1).max(168), scope: z.array(z.string().min(1).max(64)).max(32).default([]) }).strict()).mutation(async ({ ctx, input }) => {
    const auth = requireProtectionAuth(ctx);
    await assertContentProtectionEnabled(auth.tenantId);
    const database = await getDb();
    const [pkg] = await database.select().from(contentEvidencePackages).where(and(eq(contentEvidencePackages.id, input.packageId), eq(contentEvidencePackages.tenantId, auth.tenantId), eq(contentEvidencePackages.createdByUserId, auth.userId))).limit(1);
    if (!pkg) throw new TRPCError({ code: "NOT_FOUND", message: "Evidence package not found" });
    if (!pkg.caseId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Evidence package must be attached to a protection case" });
    const [caseRow] = await database.select({ publicCaseId: contentProtectionCases.publicCaseId })
      .from(contentProtectionCases)
      .where(and(eq(contentProtectionCases.id, pkg.caseId), eq(contentProtectionCases.tenantId, auth.tenantId)))
      .limit(1);
    if (!caseRow) throw new TRPCError({ code: "NOT_FOUND", message: "Evidence case not found" });
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000);
    await database.insert(contentExternalReviewLinks).values({ id: randomUUID(), tenantId: auth.tenantId, packageId: pkg.id, tokenHash, scopeJson: input.scope, expiresAt, createdByUserId: auth.userId });
    return {
      token: rawToken,
      publicCaseId: caseRow.publicCaseId,
      reviewPath: `/evidence-review/${caseRow.publicCaseId}?token=${encodeURIComponent(rawToken)}`,
      expiresAt,
      disclaimer: "Read-only technical evidence; not a legal ownership determination.",
    };
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
