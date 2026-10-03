import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { matchSpec260ApiRouteWithParams } from "../../../../packages/shared/src/emergencyRouteManifest";
import { composeLocalSituationFeed, type LocalSituationFeedSourceRecord } from "../../../../packages/shared/src/emergency/feedSemantics";
import {
  canTransitionStoredEmergencyNeed,
  canTransitionStoredEmergencyTask,
} from "../../../../packages/shared/src/emergency/contracts";
import { parseEmergencyMapBounds } from "../../../../packages/shared/src/emergency/mapBounds";
import {
  canDomainAdminReviewIntelligenceSource,
  isAdminIntelligenceRegistryRoute,
} from "../../../../packages/shared/src/emergency/intelligenceRegistryAuthorization";
import { resolveEmergencyNeedFulfillment } from "../../../../packages/shared/src/emergency/needFulfillment";
import {
  generalizeEmergencyPublicCoordinate,
  PUBLIC_LOCATION_GRID_DEGREES,
} from "../../../../packages/shared/src/emergency/publicLocation";
import { verifyEmergencyEvidenceIntegrity } from "../../../../packages/shared/src/emergency/evidenceIntegrity";
import { prepareEmergencyHelperAvailability } from "../../../../packages/shared/src/emergency/helperAvailability";
import { discloseEmergencyFields } from "../../../../packages/shared/src/emergency/disclosureGrant";
import {
  decodeSpec260EmergencyMessageCursor,
  encodeSpec260EmergencyMessageCursor,
} from "./spec260EmergencyMessageCursor";
import { evaluateEmergencyTriage } from "../../../../packages/shared/src/emergency/triage";
import { requiredEmergencyCaseReviews } from "../../../../packages/shared/src/emergency/reviewQueue";
import {
  canTransitionEmergencyIntelClaim,
  countIndependentEmergencyIntelSources,
} from "../../../../packages/shared/src/emergency/intelligenceClaims";
import {
  canCreateEmergencyFederationShare,
  projectFederatedCase,
} from "../../../../packages/shared/src/emergency/federation";
import {
  getEmergencyProtocolPack,
  satisfiesEmergencyProtocolSafetyClass,
} from "../../../../packages/shared/src/emergency/protocolPacks";
import { parseGeospatialWatch } from "../../../../packages/shared/src/emergency/geospatialWatches";
import {
  emergencyAssignments,
  emergencyAuditEvents,
  emergencyCapabilityGrants,
  emergencyCaseEvents,
  emergencyCaseMessages,
  emergencyCaseReviewItems,
  emergencyConsentReceipts,
  emergencyCases,
  emergencyContributions,
  emergencyFundAllocations,
  emergencyEvents,
  emergencyEvidenceAssets,
  emergencyFacilities,
  emergencyFederationPartners,
  emergencyFederationShares,
  emergencyGeoWatches,
  emergencyHelperProfiles,
  emergencyDisclosureGrants,
  emergencyIncidents,
  emergencyIntelSources,
  emergencyIntelCaptures,
  emergencyIntelClaims,
  emergencyIntelClaimSources,
  emergencyLegalHolds,
  emergencyNeeds,
  emergencyPublicAlerts,
  emergencyReports,
  emergencyResponseTasks,
  emergencyReportAccessTokens,
  emergencySituations,
  emergencySupportPools,
  economicLedgerAccounts,
  economicJournalEntries,
  economicJournalLines,
  payments,
  tenants,
  type Tenant,
  type User,
  users,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";
import { getTenantByDomain } from "../_core/tenant";
import {
  compareCachedSpec260PlatformEdgeToken,
  resolveSpec260IngressMode,
} from "../services/appRuntimeConfig";
import { consumeSlidingWindow } from "../services/postgresRateLimitStore";
import {
  getPublicGeoMapConfiguration,
  getPublicGoogleMapAttribution,
  getPublicGoogleMapTile,
} from "../services/geoMapProviderRuntime";
import { createCanonicalJobInTransaction } from "../services/jobControlPlane";
import { createControlPlaneJob } from "../services/jobControlPlaneGateway";
import { createInvoiceChargeFlow } from "../services/billing/orchestration";
import { createBeamProvider } from "../services/billing/beamProvider";
import {
  getBeamProviderRuntimeConfig,
  testBeamProviderAdminSettings,
} from "../services/billing/providerConfig";
import {
  allocateEmergencySupport,
  EmergencyFinancialError,
  settleEmergencyContribution,
} from "../services/emergencyFinancialService";
import {
  assertR2StorageActive,
  storageDelete,
  storageHeadFile,
  storagePresignPut,
  storagePut,
  storageStreamFile,
} from "../storage";
import {
  emergencyAlertGeometryIntersectsBounds,
  normalizeEmergencyAlertGeometry,
} from "@smartspec/shared/src/emergency/alertGeometry";
import { createGeographicSearchService } from "../services/geographicSearchService";
import {
  projectSpec260PublicAlertGeometry,
  projectSpec260PublicLocation,
  resolveSpec262PublicSpatialClass,
} from "../services/spec262PublicSpatialProjection";

async function readBoundedMapTile(
  response: globalThis.Response,
  maxBytes: number
): Promise<Buffer | "too-large" | "timeout"> {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => undefined);
  }, 10_000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return "too-large";
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  if (timedOut) return "timeout";
  return Buffer.concat(
    chunks.map(chunk => Buffer.from(chunk)),
    size
  );
}

const reportSchema = z
  .object({
    description: z.string().trim().min(4).max(4000),
    reportType: z.string().trim().min(1).max(64).optional(),
    observedAt: z.string().datetime({ offset: true }).optional(),
    location: z
      .object({
        latitude: z.number().finite().min(-90).max(90),
        longitude: z.number().finite().min(-180).max(180),
        accuracyMeters: z.number().finite().min(0).max(100_000).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const anonymousCaseUpdateSchema = z
  .object({
    notes: z.string().trim().min(1).max(2000),
    reason: z
      .string()
      .trim()
      .min(1)
      .max(300)
      .default("Anonymous reporter added an update"),
  })
  .strict();

const publicContributionSchema = z
  .object({
    amountMinorUnits: z.number().int().min(100).max(100_000_000),
    paymentMethod: z.enum(["promptpay", "card"]).default("promptpay"),
    poolRef: z.string().trim().min(1).max(24).optional(),
  })
  .strict();
const supportAllocationSchema = z
  .object({
    purposeCode: z.enum([
      "shelter",
      "medical",
      "food_water",
      "transport",
      "rescue",
      "communications",
      "other",
    ]),
    restriction: z.string().trim().min(8).max(500),
    amountMinorUnits: z.number().int().min(100).max(100_000_000),
  })
  .strict();

const alertCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    message: z.string().trim().min(1).max(4000),
    severity: z.enum(["unknown", "low", "moderate", "high", "critical"]),
    situationId: z.string().uuid().optional(),
    publicGeometry: z.unknown().optional(),
    spatialDisclosureClass: z
      .enum([
        "ordinary-public-feature",
        "protected-household",
        "sensitive-facility",
        "critical-infrastructure",
        "responder-journey",
      ])
      .default("ordinary-public-feature"),
    status: z.enum(["draft", "published"]).default("draft"),
    expiresAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

const alertUpdateSchema = z
  .object({
    expectedStatus: z.enum(["published", "updated"]),
    status: z.enum(["updated", "cancelled", "expired"]),
    title: z.string().trim().min(1).max(200).optional(),
    message: z.string().trim().min(1).max(4000).optional(),
    severity: z
      .enum(["unknown", "low", "moderate", "high", "critical"])
      .optional(),
    publicGeometry: z.unknown().optional(),
    spatialDisclosureClass: z
      .enum([
        "ordinary-public-feature",
        "protected-household",
        "sensitive-facility",
        "critical-infrastructure",
        "responder-journey",
      ])
      .optional(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

const needCreateSchema = z
  .object({
    needType: z.string().trim().min(1).max(64),
    priority: z
      .enum(["unknown", "low", "moderate", "high", "critical"])
      .default("unknown"),
    requestedQuantity: z
      .number()
      .finite()
      .positive()
      .max(99_999_999_999.999)
      .multipleOf(0.001)
      .optional(),
    unit: z.string().trim().max(32).optional(),
    description: z.string().trim().max(1000).optional(),
  })
  .strict();

const needUpdateSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    status: z
      .enum([
        "reported",
        "triage",
        "verified",
        "partially_fulfilled",
        "fulfilled",
        "verified_fulfilled",
        "cancelled",
      ])
      .optional(),
    priority: z
      .enum(["unknown", "low", "moderate", "high", "critical"])
      .optional(),
    fulfilledQuantity: z
      .number()
      .finite()
      .nonnegative()
      .max(99_999_999_999.999)
      .multipleOf(0.001)
      .optional(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict()
  .refine(
    value =>
      value.status !== undefined ||
      value.priority !== undefined ||
      value.fulfilledQuantity !== undefined
  );

const taskCreateSchema = z
  .object({
    taskType: z.string().trim().min(1).max(64),
    needId: z.string().uuid().optional(),
    safetyClass: z
      .enum([
        "community_safe",
        "verified_only",
        "professional_only",
        "restricted",
      ])
      .default("professional_only"),
    title: z.string().trim().min(1).max(200),
    instructions: z.string().trim().max(2000).optional(),
  })
  .strict();

const taskStatusSchema = z
  .object({
    expectedStatus: z.enum([
      "draft",
      "ready",
      "offered",
      "claimed",
      "blocked",
      "cancelled",
    ]),
    status: z.enum(["draft", "ready", "cancelled"]),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

const taskAssignSchema = z
  .object({
    responderUserId: z.number().int().positive(),
    expectedContribution: z
      .number()
      .finite()
      .positive()
      .max(99_999_999_999.999)
      .multipleOf(0.001)
      .optional(),
    humanReviewConfirmed: z.boolean().default(false),
    protocolReviewVersion: z.string().trim().min(1).max(64).optional(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

const facilityCreateSchema = z
  .object({
    facilityType: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(500).default(""),
    capacityClass: z
      .enum(["unknown", "limited", "available", "full"])
      .default("unknown"),
    spatialDisclosureClass: z
      .enum([
        "ordinary-public-feature",
        "protected-household",
        "sensitive-facility",
        "critical-infrastructure",
        "responder-journey",
      ])
      .default("sensitive-facility"),
  })
  .strict();

const facilityUpdateSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    status: z.enum(["open", "limited", "full", "closed", "unknown"]),
    latitude: z.number().finite().min(-90).max(90).optional(),
    longitude: z.number().finite().min(-180).max(180).optional(),
    capacityClass: z
      .enum(["unknown", "limited", "available", "full"])
      .optional(),
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(500).optional(),
    spatialDisclosureClass: z
      .enum([
        "ordinary-public-feature",
        "protected-household",
        "sensitive-facility",
        "critical-infrastructure",
        "responder-journey",
      ])
      .optional(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict()
  .refine(
    value => (value.latitude === undefined) === (value.longitude === undefined)
  );

const caseMessageSchema = z
  .object({ body: z.string().trim().min(1).max(2000) })
  .strict();
const helperAvailabilitySchema = z.discriminatedUnion("optIn", [
  z.object({ optIn: z.literal(false) }).strict(),
  z
    .object({
      optIn: z.literal(true),
      latitude: z.number().finite().min(-90).max(90),
      longitude: z.number().finite().min(-180).max(180),
      jurisdictionRef: z.string().trim().min(1).max(160),
      availableUntil: z.string().datetime({ offset: true }),
    })
    .strict(),
]);
const geoWatchCreateSchema = z
  .object({
    scope: z.unknown(),
    condition: z.unknown(),
    expiresAt: z.string().datetime({ offset: true }),
    notifyOn: z
      .array(z.enum(["enter", "exit", "material-update"]))
      .min(1)
      .max(3),
  })
  .strict();
const geoWatchUpdateSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    status: z.enum(["active", "paused"]),
  })
  .strict();
const disclosureGrantSchema = z
  .object({
    assignmentId: z.string().uuid(),
    fields: z
      .array(
        z.enum([
          "approximateLocation",
          "needSummary",
          "taskInstructions",
          "callbackRelay",
        ])
      )
      .min(1)
      .max(4),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();
const emergencyEvidenceSchema = z
  .object({
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    mediaType: z
      .string()
      .trim()
      .toLowerCase()
      .max(128)
      .regex(
        /^(image\/(jpeg|png|webp|heic)|audio\/(mpeg|mp4|ogg|webm)|video\/(mp4|webm))$/
      ),
    byteLength: z
      .number()
      .int()
      .positive()
      .max(20 * 1024 * 1024),
  })
  .strict();

const intelSourceCreateSchema = z
  .object({
    sourceRef: z.string().trim().min(1).max(160),
    displayName: z.string().trim().min(1).max(200),
    sourceType: z.enum(["official", "partner", "field", "manual"]),
    canonicalOrigin: z.string().url().max(512).optional(),
    independenceGroup: z.string().trim().min(1).max(160),
    jurisdictionRef: z.string().trim().min(1).max(160),
    dataClassification: z
      .enum(["general", "sensitive", "restricted"])
      .optional(),
  })
  .strict();
const intelCaptureCreateSchema = z
  .object({
    sourceId: z.string().uuid(),
    sourceItemRef: z.string().trim().min(1).max(512),
    excerpt: z.string().trim().min(1).max(10000),
    observedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
const intelSourceReviewSchema = z
  .object({
    status: z.enum(["active", "paused", "revoked"]),
    reason: z.string().trim().min(8).max(500),
  })
  .strict();

const intelClaimCreateSchema = z
  .object({
    claimText: z.string().trim().min(8).max(1200),
    situationId: z.string().uuid().optional(),
    captureIds: z.array(z.string().uuid()).min(1).max(20),
    correctionOfClaimId: z.string().uuid().optional(),
  })
  .strict();
const intelClaimReviewSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    status: z.enum(["under_review", "verified", "disputed", "retracted"]),
    reason: z.string().trim().min(8).max(500),
    publicSummary: z.string().trim().min(8).max(500).optional(),
  })
  .strict()
  .refine(value => value.status !== "verified" || Boolean(value.publicSummary));

type EmergencyEvidenceInput = z.infer<typeof emergencyEvidenceSchema>;

async function createEmergencyEvidenceUpload(input: {
  tenantId: string;
  caseId: string;
  reportId: string | null;
  actorRef: string;
  visibility: "restricted" | "responder";
  requestKey: string;
  file: EmergencyEvidenceInput;
}) {
  await assertR2StorageActive();
  const eventKey = `evidence:create:${sha256(input.requestKey)}`;
  const fingerprint = requestFingerprint({
    caseId: input.caseId,
    reportId: input.reportId,
    file: input.file,
  });
  const created = await getDb().transaction(async tx => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.tenantId}:${eventKey}`}, 0))`
    );
    const [caseRow] = await tx
      .select({ id: emergencyCases.id, reportId: emergencyCases.reportId })
      .from(emergencyCases)
      .where(
        and(
          eq(emergencyCases.tenantId, input.tenantId),
          eq(emergencyCases.id, input.caseId)
        )
      )
      .for("update")
      .limit(1);
    if (
      !caseRow ||
      (input.reportId !== null && caseRow.reportId !== input.reportId)
    )
      return "not_found" as const;
    const [prior] = await tx
      .select({
        subjectId: emergencyAuditEvents.subjectId,
        afterJson: emergencyAuditEvents.afterJson,
      })
      .from(emergencyAuditEvents)
      .where(
        and(
          eq(emergencyAuditEvents.tenantId, input.tenantId),
          eq(emergencyAuditEvents.eventIdempotencyKey, eventKey)
        )
      )
      .limit(1);
    if (prior) {
      if (safeRecord(prior.afterJson).requestFingerprint !== fingerprint)
        return "idempotency_reused" as const;
      const [asset] = await tx
        .select()
        .from(emergencyEvidenceAssets)
        .where(
          and(
            eq(emergencyEvidenceAssets.tenantId, input.tenantId),
            eq(emergencyEvidenceAssets.id, prior.subjectId)
          )
        )
        .limit(1);
      if (!asset) return "not_found" as const;
      const currentChain = safeRecord(asset.chainJson);
      if (
        currentChain.phase === "pending" ||
        currentChain.phase === "expired"
      ) {
        if (
          currentChain.phase === "expired" &&
          currentChain.stagingCleanupPending === true &&
          typeof currentChain.stagingKey === "string"
        ) {
          try {
            await storageDelete(currentChain.stagingKey);
          } catch {
            return "storage_cleanup" as const;
          }
        }
        const refreshedChain = {
          ...currentChain,
          phase: "pending",
          stagingCleanupPending: true,
          uploadExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        };
        const [refreshedAsset] = await tx
          .update(emergencyEvidenceAssets)
          .set({ chainJson: refreshedChain })
          .where(
            and(
              eq(emergencyEvidenceAssets.tenantId, input.tenantId),
              eq(emergencyEvidenceAssets.id, asset.id)
            )
          )
          .returning();
        return refreshedAsset
          ? { asset: refreshedAsset, duplicate: true }
          : ("not_found" as const);
      }
      return { asset, duplicate: true };
    }
    const [usage] = await tx
      .select({
        activeCount: sql<number>`count(*) FILTER (WHERE ${emergencyEvidenceAssets.chainJson}->>'phase' IN ('pending', 'verifying'))::int`,
        activeBytes: sql<number>`COALESCE(sum(${emergencyEvidenceAssets.byteLength}) FILTER (WHERE ${emergencyEvidenceAssets.chainJson}->>'phase' IN ('pending', 'verifying')), 0)::bigint`,
        count: sql<number>`count(*) FILTER (WHERE COALESCE(${emergencyEvidenceAssets.chainJson}->>'phase', 'available') <> 'expired')::int`,
        bytes: sql<number>`COALESCE(sum(${emergencyEvidenceAssets.byteLength}) FILTER (WHERE COALESCE(${emergencyEvidenceAssets.chainJson}->>'phase', 'available') <> 'expired'), 0)::bigint`,
      })
      .from(emergencyEvidenceAssets)
      .where(
        and(
          eq(emergencyEvidenceAssets.tenantId, input.tenantId),
          eq(emergencyEvidenceAssets.caseId, input.caseId)
        )
      );
    if (
      (usage?.activeCount ?? 0) >= 3 ||
      Number(usage?.activeBytes ?? 0) + input.file.byteLength >
        60 * 1024 * 1024 ||
      (usage?.count ?? 0) >= 25 ||
      Number(usage?.bytes ?? 0) + input.file.byteLength > 200 * 1024 * 1024
    )
      return "quota" as const;
    const id = randomUUID();
    const finalKey = `emergency-evidence/${input.tenantId}/${input.caseId}/${id}/${input.file.sha256}`;
    const stagingKey = `emergency-evidence-staging/${input.tenantId}/${input.caseId}/${id}`;
    const [asset] = await tx
      .insert(emergencyEvidenceAssets)
      .values({
        id,
        tenantId: input.tenantId,
        caseId: input.caseId,
        reportId: input.reportId,
        objectRef: finalKey,
        sha256: input.file.sha256,
        mediaType: input.file.mediaType,
        byteLength: input.file.byteLength,
        visibility: input.visibility,
        chainJson: {
          phase: "pending",
          stagingKey,
          stagingCleanupPending: true,
          requestFingerprint: fingerprint,
          uploadExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        },
      })
      .returning();
    const after = {
      sha256: input.file.sha256,
      mediaType: input.file.mediaType,
      byteLength: input.file.byteLength,
      requestFingerprint: fingerprint,
    };
    const audit = {
      tenantId: input.tenantId,
      subjectType: "evidence",
      subjectId: id,
      actorType:
        input.actorRef === "anonymous_reporter" ? "anonymous_reporter" : "user",
      actorRef: input.actorRef,
      eventType: "evidence_upload_started",
      reason: "Case-scoped evidence upload initialized",
      after,
      createdAt: new Date().toISOString(),
    };
    await tx.insert(emergencyAuditEvents).values({
      ...audit,
      eventIdempotencyKey: eventKey,
      eventHash: auditHash(audit),
      afterJson: after,
      createdAt: new Date(),
    });
    return { asset, duplicate: false };
  });
  const geographicSearch = createGeographicSearchService();
  if (created === "idempotency_reused" || created === "not_found")
    return created;
  if (created === "quota") return "quota";
  if (created === "storage_cleanup") return created;
  const chain = safeRecord(created.asset.chainJson);
  if (chain.phase === "available")
    return {
      evidenceId: created.asset.id,
      duplicate: created.duplicate,
      uploaded: true as const,
    };
  const stagingKey =
    typeof chain.stagingKey === "string" ? chain.stagingKey : "";
  if (!stagingKey) throw new Error("EMERGENCY_EVIDENCE_STAGING_KEY_MISSING");
  const upload = await storagePresignPut(
    stagingKey,
    created.asset.mediaType,
    created.asset.byteLength,
    900
  );
  if (!upload) throw new Error("EMERGENCY_R2_UPLOAD_UNAVAILABLE");
  return {
    evidenceId: created.asset.id,
    duplicate: created.duplicate,
    uploaded: false as const,
    uploadUrl: upload.url,
    requiredHeaders: { "Content-Type": created.asset.mediaType },
  };
}

async function readAndVerifyEvidenceObject(
  key: string,
  asset: typeof emergencyEvidenceAssets.$inferSelect
) {
  const head = await storageHeadFile(key);
  if (
    !head ||
    head.contentType !== asset.mediaType ||
    head.contentLength !== asset.byteLength
  )
    return null;
  const stored = await storageStreamFile(key);
  if (!stored || stored.contentLength !== asset.byteLength) return null;
  const chunks: Buffer[] = [];
  const digest = createHash("sha256");
  let byteLength = 0;
  for await (const chunk of stored.stream as AsyncIterable<
    Buffer | Uint8Array | string
  >) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    byteLength += buffer.byteLength;
    if (byteLength > asset.byteLength) return null;
    digest.update(buffer);
    chunks.push(buffer);
  }
  return verifyEmergencyEvidenceIntegrity({
    actualByteLength: byteLength,
    expectedByteLength: asset.byteLength,
    actualSha256: digest.digest("hex"),
    expectedSha256: asset.sha256,
  })
    ? Buffer.concat(chunks)
    : null;
}

async function verifyAndPromoteEmergencyEvidence(
  asset: typeof emergencyEvidenceAssets.$inferSelect
) {
  await assertR2StorageActive();
  const chain = safeRecord(asset.chainJson);
  const stagingKey =
    typeof chain.stagingKey === "string" ? chain.stagingKey : "";
  if (!stagingKey) return "unavailable" as const;
  const existingFinal = await readAndVerifyEvidenceObject(
    asset.objectRef,
    asset
  );
  if (existingFinal) return { result: "verified" as const, stagingKey };
  const uploadExpiresAt =
    typeof chain.uploadExpiresAt === "string"
      ? Date.parse(chain.uploadExpiresAt)
      : asset.createdAt.getTime() + 15 * 60_000;
  if (!Number.isFinite(uploadExpiresAt) || uploadExpiresAt < Date.now()) {
    return "expired" as const;
  }
  const staged = await readAndVerifyEvidenceObject(stagingKey, asset);
  if (!staged) {
    const head = await storageHeadFile(stagingKey);
    return head
      ? ("checksum_mismatch" as const)
      : ("metadata_mismatch" as const);
  }
  await storagePut(asset.objectRef, staged, asset.mediaType);
  return { result: "verified" as const, stagingKey };
}

async function completeEmergencyEvidence(
  tenantId: string,
  evidenceId: string,
  actorRef: string,
  requestKey: string
) {
  const leaseId = randomUUID();
  const claimed = await getDb().transaction(async tx => {
    const [asset] = await tx
      .select()
      .from(emergencyEvidenceAssets)
      .where(
        and(
          eq(emergencyEvidenceAssets.tenantId, tenantId),
          eq(emergencyEvidenceAssets.id, evidenceId)
        )
      )
      .for("update")
      .limit(1);
    if (!asset) return "not_found" as const;
    const before = safeRecord(asset.chainJson);
    if (before.phase === "available" || before.phase === "expired")
      return before.stagingCleanupPending === true
        ? { cleanup: true as const }
        : ("duplicate" as const);
    const leaseUntil =
      typeof before.verificationLeaseUntil === "string"
        ? Date.parse(before.verificationLeaseUntil)
        : 0;
    if (before.phase === "verifying" && leaseUntil > Date.now())
      return "busy" as const;
    const now = new Date();
    const after = {
      ...before,
      phase: "verifying",
      verificationLeaseId: leaseId,
      verificationLeaseUntil: new Date(
        now.getTime() + 2 * 60_000
      ).toISOString(),
    };
    const [updated] = await tx
      .update(emergencyEvidenceAssets)
      .set({ chainJson: after })
      .where(
        and(
          eq(emergencyEvidenceAssets.tenantId, tenantId),
          eq(emergencyEvidenceAssets.id, evidenceId)
        )
      )
      .returning();
    return updated ?? ("not_found" as const);
  });
  if (claimed === "not_found" || claimed === "duplicate" || claimed === "busy")
    return claimed;
  if (typeof claimed === "object" && "cleanup" in claimed) {
    return (await reconcileEmergencyEvidenceStaging(tenantId, evidenceId))
      ? "duplicate"
      : "unavailable";
  }
  const verified = await verifyAndPromoteEmergencyEvidence(claimed).catch(
    () => "unavailable" as const
  );
  if (
    verified === "expired" ||
    verified === "metadata_mismatch" ||
    verified === "checksum_mismatch" ||
    verified === "unavailable"
  ) {
    await getDb().transaction(async tx => {
      const [current] = await tx
        .select()
        .from(emergencyEvidenceAssets)
        .where(
          and(
            eq(emergencyEvidenceAssets.tenantId, tenantId),
            eq(emergencyEvidenceAssets.id, evidenceId)
          )
        )
        .for("update")
        .limit(1);
      if (
        current &&
        safeRecord(current.chainJson).verificationLeaseId === leaseId
      ) {
        const before = safeRecord(current.chainJson);
        const after = {
          ...before,
          phase: verified === "expired" ? "expired" : "pending",
          stagingCleanupPending: true,
        };
        delete after.verificationLeaseId;
        delete after.verificationLeaseUntil;
        if (verified === "expired") delete after.uploadExpiresAt;
        await tx
          .update(emergencyEvidenceAssets)
          .set({ chainJson: after })
          .where(eq(emergencyEvidenceAssets.id, evidenceId));
      }
    });
    if (verified === "expired")
      await reconcileEmergencyEvidenceStaging(tenantId, evidenceId);
    return verified;
  }
  const eventIdempotencyKey = `evidence:complete:${claimed.id}:${sha256(requestKey)}`;
  const completed = await getDb().transaction(async tx => {
    const [locked] = await tx
      .select()
      .from(emergencyEvidenceAssets)
      .where(
        and(
          eq(emergencyEvidenceAssets.tenantId, tenantId),
          eq(emergencyEvidenceAssets.id, claimed.id)
        )
      )
      .for("update")
      .limit(1);
    if (!locked) return "not_found" as const;
    const before = safeRecord(locked.chainJson);
    if (before.phase === "available") return "duplicate" as const;
    if (before.verificationLeaseId !== leaseId) return "busy" as const;
    const [prior] = await tx
      .select({ id: emergencyAuditEvents.id })
      .from(emergencyAuditEvents)
      .where(
        and(
          eq(emergencyAuditEvents.tenantId, tenantId),
          eq(emergencyAuditEvents.eventIdempotencyKey, eventIdempotencyKey)
        )
      )
      .limit(1);
    if (prior) return "duplicate" as const;
    const now = new Date();
    const after = {
      ...before,
      phase: "available",
      stagingCleanupPending: true,
      verifiedAt: now.toISOString(),
    };
    delete after.verificationLeaseId;
    delete after.verificationLeaseUntil;
    await tx
      .update(emergencyEvidenceAssets)
      .set({ chainJson: after })
      .where(eq(emergencyEvidenceAssets.id, claimed.id));
    const [previousAudit] = await tx
      .select({ eventHash: emergencyAuditEvents.eventHash })
      .from(emergencyAuditEvents)
      .where(
        and(
          eq(emergencyAuditEvents.tenantId, tenantId),
          eq(emergencyAuditEvents.subjectType, "evidence"),
          eq(emergencyAuditEvents.subjectId, claimed.id)
        )
      )
      .orderBy(desc(emergencyAuditEvents.createdAt))
      .limit(1);
    const audit = {
      tenantId,
      subjectType: "evidence",
      subjectId: claimed.id,
      actorType:
        actorRef === "anonymous_reporter" ? "anonymous_reporter" : "user",
      actorRef,
      eventType: "evidence_upload_verified",
      reason: "R2 object metadata and SHA-256 verified",
      before,
      after,
      previousHash: previousAudit?.eventHash ?? null,
      createdAt: now.toISOString(),
    };
    await tx.insert(emergencyAuditEvents).values({
      ...audit,
      eventIdempotencyKey,
      eventHash: auditHash(audit),
      beforeJson: before,
      afterJson: after,
      createdAt: now,
    });
    return "completed" as const;
  });
  if (completed === "completed" || completed === "duplicate")
    await reconcileEmergencyEvidenceStaging(tenantId, evidenceId);
  return completed;
}

async function reconcileEmergencyEvidenceStaging(
  tenantId: string,
  evidenceId: string
): Promise<boolean> {
  const leaseId = randomUUID();
  const claim = await getDb().transaction(async tx => {
    const [locked] = await tx
      .select()
      .from(emergencyEvidenceAssets)
      .where(
        and(
          eq(emergencyEvidenceAssets.tenantId, tenantId),
          eq(emergencyEvidenceAssets.id, evidenceId)
        )
      )
      .for("update")
      .limit(1);
    if (!locked) return null;
    const chain = safeRecord(locked.chainJson);
    if (chain.stagingCleanupPending !== true)
      return { alreadyClean: true as const };
    if (
      typeof chain.stagingKey !== "string" ||
      !chain.stagingKey.startsWith("emergency-evidence-staging/")
    )
      return null;
    const leaseUntil =
      typeof chain.stagingCleanupLeaseUntil === "string"
        ? Date.parse(chain.stagingCleanupLeaseUntil)
        : 0;
    if (leaseUntil > Date.now()) return null;
    if (chain.phase !== "available" && locked.caseId) {
      const [hold] = await tx
        .select({ id: emergencyLegalHolds.id })
        .from(emergencyLegalHolds)
        .where(
          and(
            eq(emergencyLegalHolds.tenantId, tenantId),
            eq(emergencyLegalHolds.caseId, locked.caseId),
            eq(emergencyLegalHolds.status, "active"),
            or(
              isNull(emergencyLegalHolds.evidenceId),
              eq(emergencyLegalHolds.evidenceId, locked.id)
            )
          )
        )
        .limit(1);
      if (hold) return null;
    }
    const claimedChain = {
      ...chain,
      stagingCleanupLeaseId: leaseId,
      stagingCleanupLeaseUntil: new Date(Date.now() + 2 * 60_000).toISOString(),
    };
    await tx
      .update(emergencyEvidenceAssets)
      .set({ chainJson: claimedChain })
      .where(
        and(
          eq(emergencyEvidenceAssets.tenantId, tenantId),
          eq(emergencyEvidenceAssets.id, locked.id)
        )
      );
    return { alreadyClean: false as const, stagingKey: chain.stagingKey };
  });
  if (!claim) return false;
  if (claim.alreadyClean) return true;
  try {
    await storageDelete(claim.stagingKey);
  } catch {
    await getDb().transaction(async tx => {
      const [locked] = await tx
        .select()
        .from(emergencyEvidenceAssets)
        .where(
          and(
            eq(emergencyEvidenceAssets.tenantId, tenantId),
            eq(emergencyEvidenceAssets.id, evidenceId)
          )
        )
        .for("update")
        .limit(1);
      if (!locked) return;
      const chain = safeRecord(locked.chainJson);
      if (chain.stagingCleanupLeaseId !== leaseId) return;
      const next = { ...chain };
      delete next.stagingCleanupLeaseId;
      delete next.stagingCleanupLeaseUntil;
      await tx
        .update(emergencyEvidenceAssets)
        .set({ chainJson: next })
        .where(eq(emergencyEvidenceAssets.id, evidenceId));
    });
    return false;
  }
  return getDb().transaction(async tx => {
    const [locked] = await tx
      .select()
      .from(emergencyEvidenceAssets)
      .where(
        and(
          eq(emergencyEvidenceAssets.tenantId, tenantId),
          eq(emergencyEvidenceAssets.id, evidenceId)
        )
      )
      .for("update")
      .limit(1);
    if (!locked) return false;
    const current = safeRecord(locked.chainJson);
    if (
      current.stagingKey !== claim.stagingKey ||
      current.stagingCleanupLeaseId !== leaseId
    )
      return false;
    const next = { ...current, stagingCleanupPending: false };
    delete next.stagingCleanupLeaseId;
    delete next.stagingCleanupLeaseUntil;
    await tx
      .update(emergencyEvidenceAssets)
      .set({ chainJson: next })
      .where(eq(emergencyEvidenceAssets.id, evidenceId));
    return true;
  });
}

export async function completeEmergencyEvidenceForRetention(
  tenantId: string,
  evidenceId: string,
  now: Date
) {
  return completeEmergencyEvidence(
    tenantId,
    evidenceId,
    "spec260.evidence.retention",
    `retention:${evidenceId}:${now.toISOString().slice(0, 10)}`
  );
}

export async function reconcileEmergencyEvidenceStagingForRetention(
  tenantId: string,
  evidenceId: string
) {
  return reconcileEmergencyEvidenceStaging(tenantId, evidenceId);
}

const caseUpdateSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    notes: z.string().trim().min(1).max(2000),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

const assignmentUpdateSchema = z
  .object({
    expectedStatus: z.enum([
      "offered",
      "accepted",
      "en_route",
      "working",
      "completed",
      "declined",
      "cancelled",
      "safety_stopped",
    ]),
    status: z.enum([
      "accepted",
      "en_route",
      "working",
      "completed",
      "declined",
      "safety_stopped",
    ]),
    actualContribution: z
      .number()
      .finite()
      .positive()
      .max(99_999_999_999.999)
      .multipleOf(0.001)
      .optional(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

const situationUpdateSchema = z
  .object({
    expectedStatus: z.enum([
      "monitoring",
      "active",
      "contained",
      "resolved",
      "cancelled",
    ]),
    status: z.enum([
      "monitoring",
      "active",
      "contained",
      "resolved",
      "cancelled",
    ]),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

const commandCaseUpdateSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    status: z.enum([
      "open",
      "triage",
      "active",
      "waiting",
      "resolved",
      "closed",
    ]),
    hazardCategory: z.enum([
      "natural",
      "structural",
      "infrastructure",
      "fire",
      "hazardous_material",
      "medical",
      "accident",
      "security",
      "civil_crowd",
      "unknown",
      "multi_hazard",
    ]),
    hazardCode: z.string().trim().min(1).max(96),
    severity: z.enum(["unknown", "low", "moderate", "high", "critical"]),
    publicSummary: z.string().trim().max(1000).optional(),
    jurisdictionRef: z.string().trim().min(1).max(160).optional(),
    publishToPublic: z.boolean().default(false),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

const reviewItemResolveSchema = z
  .object({
    reason: z.string().trim().min(8).max(500),
    expectedState: z.literal("open"),
  })
  .strict();

const contactAttemptSchema = z
  .object({
    channel: z.enum(["voice", "sms", "in_app", "email", "in_person"]),
    outcome: z.enum(["no_answer", "reached", "unsafe", "invalid_contact"]),
    reason: z.string().trim().min(8).max(500),
  })
  .strict();

const federationPartnerCreateSchema = z
  .object({
    partnerRef: z
      .string()
      .trim()
      .min(2)
      .max(160)
      .regex(/^[A-Za-z0-9._:-]+$/),
    displayName: z.string().trim().min(2).max(200),
    contractVersion: z.literal("spec260-federation-v1"),
    jurisdictionRefs: z.array(z.string().trim().min(1).max(160)).min(1).max(50),
    capabilityRefs: z
      .array(z.string().trim().min(1).max(96))
      .max(50)
      .default([]),
  })
  .strict();
const federationPartnerUpdateSchema = z
  .object({
    expectedStatus: z.enum(["pending", "active", "paused"]),
    status: z.enum(["active", "paused", "revoked"]),
    trustLevel: z.enum(["verified", "trusted"]).optional(),
    reason: z.string().trim().min(8).max(500),
  })
  .strict();
const federationShareCreateSchema = z
  .object({
    partnerId: z.string().uuid(),
    resourceType: z.enum(["case", "situation"]),
    resourceRef: z.string().uuid(),
    jurisdictionRef: z.string().trim().min(1).max(160),
    expiresAt: z.string().datetime({ offset: true }),
    reason: z.string().trim().min(8).max(500),
  })
  .strict();
const legalHoldCreateSchema = z
  .object({
    caseId: z.string().uuid(),
    evidenceId: z.string().uuid().optional(),
    reason: z.string().trim().min(8).max(1000),
  })
  .strict();
const legalHoldReleaseSchema = z
  .object({
    reason: z.string().trim().min(8).max(1000),
  })
  .strict();

const capabilityGrantSchema = z
  .object({
    userId: z.number().int().positive(),
    capability: z.enum([
      "emergency.respond",
      "emergency.respond.restricted",
      "emergency.command",
      "emergency.sponsorship",
      "emergency.verify",
    ]),
    scopeType: z
      .enum(["tenant", "case", "situation", "support_pool"])
      .default("tenant"),
    scopeRef: z.string().trim().min(1).max(160).default("tenant"),
    expiresAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

type EmergencyRouteRequest = Request & {
  spec260Tenant?: Tenant;
  spec260User?: User;
};

function reply(res: Response, status: number, payload: unknown) {
  return res
    .status(status)
    .set("Cache-Control", "private, no-store")
    .json(payload);
}

function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter(key => record[key] !== undefined)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function requestFingerprint(value: unknown): string {
  return sha256(stableJson(value));
}

function quantityMilli(value: number | string): number {
  return Math.round(Number(value) * 1000);
}

function quantityDecimal(milli: number): string {
  return (milli / 1000).toFixed(3);
}

function anonymousCaseToken(
  tenantId: string,
  reportId: string,
  caseId: string,
  idempotencyHash: string
): string {
  const secret = process.env.SPEC260_ANON_CASE_TOKEN_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("ANONYMOUS_CASE_TOKEN_SECRET_NOT_CONFIGURED");
  return createHmac("sha256", secret)
    .update(`${tenantId}:${reportId}:${caseId}:${idempotencyHash}`)
    .digest("base64url");
}

function publicRef(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString("base64url")}`;
}

function normalizedHost(value: string | undefined): string | null {
  if (
    !value ||
    value.length > 255 ||
    value.includes("@") ||
    /[\s/\\]/.test(value)
  )
    return null;
  try {
    const parsed = new URL(`https://${value}`);
    return parsed.host.toLowerCase() === value.toLowerCase()
      ? parsed.hostname.toLowerCase()
      : null;
  } catch {
    return null;
  }
}

async function tenantForEdgeRequest(req: Request): Promise<Tenant | null> {
  const host = normalizedHost(req.header("x-spec260-original-host"));
  if (!host) return null;
  const tenant = await getTenantByDomain(host);
  return tenant?.isActive ? tenant : null;
}

async function identityForRequest(req: Request): Promise<User | null> {
  try {
    const user = await sdk.authenticateRequest(req);
    if (user.isDisabled) return null;
    return user;
  } catch {
    return null;
  }
}

async function hasCapability(
  tenantId: string,
  userId: number,
  capability: string,
  resource?: {
    scopeType: "case" | "situation" | "support_pool";
    scopeRef: string;
  }
): Promise<boolean> {
  const [actor] = await getDb()
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (actor?.role === "admin") return true;

  const now = new Date();
  const [grant] = await getDb()
    .select({ id: emergencyCapabilityGrants.id })
    .from(emergencyCapabilityGrants)
    .where(
      and(
        eq(emergencyCapabilityGrants.tenantId, tenantId),
        eq(emergencyCapabilityGrants.userId, userId),
        eq(emergencyCapabilityGrants.capability, capability),
        resource
          ? or(
              and(
                eq(emergencyCapabilityGrants.scopeType, "tenant"),
                eq(emergencyCapabilityGrants.scopeRef, "tenant")
              ),
              and(
                eq(emergencyCapabilityGrants.scopeType, resource.scopeType),
                eq(emergencyCapabilityGrants.scopeRef, resource.scopeRef)
              )
            )!
          : and(
              eq(emergencyCapabilityGrants.scopeType, "tenant"),
              eq(emergencyCapabilityGrants.scopeRef, "tenant")
            )!,
        isNull(emergencyCapabilityGrants.revokedAt),
        or(
          isNull(emergencyCapabilityGrants.expiresAt),
          sql`${emergencyCapabilityGrants.expiresAt} > ${now}`
        )
      )
    )
    .limit(1);
  return Boolean(grant);
}

async function hasAnyActiveCapability(
  tenantId: string,
  userId: number,
  capability: string
): Promise<boolean> {
  const [actor] = await getDb()
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (actor?.role === "admin") return true;

  const now = new Date();
  const [grant] = await getDb()
    .select({ id: emergencyCapabilityGrants.id })
    .from(emergencyCapabilityGrants)
    .where(
      and(
        eq(emergencyCapabilityGrants.tenantId, tenantId),
        eq(emergencyCapabilityGrants.userId, userId),
        eq(emergencyCapabilityGrants.capability, capability),
        isNull(emergencyCapabilityGrants.revokedAt),
        or(
          isNull(emergencyCapabilityGrants.expiresAt),
          sql`${emergencyCapabilityGrants.expiresAt} > ${now}`
        )
      )
    )
    .limit(1);
  return Boolean(grant);
}

async function emergencyCaseEvidenceAccess(
  tenantId: string,
  userId: number,
  caseId: string
): Promise<{ owner: boolean; command: boolean; responder: boolean } | null> {
  const [caseRow] = await getDb()
    .select({
      id: emergencyCases.id,
      reporterUserId: emergencyCases.reporterUserId,
    })
    .from(emergencyCases)
    .where(
      and(eq(emergencyCases.tenantId, tenantId), eq(emergencyCases.id, caseId))
    )
    .limit(1);
  if (!caseRow) return null;
  const owner = caseRow.reporterUserId === userId;
  const command = await hasCapability(tenantId, userId, "emergency.command", {
    scopeType: "case",
    scopeRef: caseId,
  });
  const [assignment] = await getDb()
    .select({ id: emergencyAssignments.id })
    .from(emergencyAssignments)
    .where(
      and(
        eq(emergencyAssignments.tenantId, tenantId),
        eq(emergencyAssignments.caseId, caseId),
        eq(emergencyAssignments.responderUserId, userId),
        inArray(emergencyAssignments.status, [
          "offered",
          "accepted",
          "en_route",
          "working",
        ])
      )
    )
    .limit(1);
  const responder = Boolean(
    assignment &&
    (await hasCapability(tenantId, userId, "emergency.respond", {
      scopeType: "case",
      scopeRef: caseId,
    }))
  );
  return owner || command || responder ? { owner, command, responder } : null;
}

async function ensureIdentity(
  req: EmergencyRouteRequest,
  res: Response
): Promise<{ tenantId: string; user: User } | null> {
  const user = await identityForRequest(req);
  if (!user) {
    reply(res, 401, { error: "UNAUTHENTICATED" });
    return null;
  }
  const tenantId = user.currentTenantId;
  if (!tenantId) {
    reply(res, 403, { error: "TENANT_SCOPE_REQUIRED" });
    return null;
  }
  const [tenant] = await getDb()
    .select({ id: tenants.id })
    .from(tenants)
    .where(and(eq(tenants.id, tenantId), eq(tenants.isActive, true)))
    .limit(1);
  if (!tenant) {
    reply(res, 403, { error: "TENANT_SCOPE_REQUIRED" });
    return null;
  }
  req.spec260User = user;
  return { tenantId, user };
}

function publicSituation(row: typeof emergencySituations.$inferSelect) {
  const projection = safeRecord(row.publicProjectionJson);
  const hazard = safeRecord(projection.hazard);
  const status =
    row.status === "resolved" || row.status === "cancelled"
      ? "resolved"
      : row.status === "contained"
        ? "stabilizing"
        : "active";
  const sourceStatus = ["confirmed", "corroborated", "unverified"].includes(
    String(projection.sourceStatus)
  )
    ? projection.sourceStatus
    : "unverified";
  const freshness = row.freshUntil
    ? row.freshUntil.getTime() >= Date.now()
      ? "current"
      : "stale"
    : "unknown";
  return {
    publicRef: row.publicRef,
    hazard: {
      category:
        typeof hazard.category === "string" ? hazard.category : "unknown",
      code: typeof hazard.code === "string" ? hazard.code : row.severity,
      taxonomyVersion:
        typeof hazard.taxonomyVersion === "string"
          ? hazard.taxonomyVersion
          : "unspecified",
    },
    status,
    summary:
      typeof projection.summary === "string"
        ? projection.summary.slice(0, 1000)
        : "",
    updatedAt: row.updatedAt.toISOString(),
    freshness,
    sourceStatus,
  };
}

function safePool(
  row: typeof emergencySupportPools.$inferSelect,
  settledMinorUnits: string,
  earmarkedMinorUnits = "0",
  restrictedBalanceMinorUnits = "0"
) {
  return {
    id: row.publicRef,
    title: row.title,
    description: row.description,
    currency: row.currency,
    targetMinorUnits: row.targetMinorUnits?.toString() ?? null,
    settledMinorUnits,
    earmarkedMinorUnits,
    restrictedBalanceMinorUnits,
    financeNotice:
      "Settled and restricted liability projections; earmarking is not a cash disbursement.",
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function auditHash(input: {
  previousHash?: string | null;
  tenantId: string;
  subjectType: string;
  subjectId: string;
  actorType: string;
  actorRef: string;
  eventType: string;
  reason: string;
  before?: unknown;
  after?: unknown;
  createdAt: string;
}): string {
  return sha256(JSON.stringify(input));
}

function requireSameOriginForWrite(req: Request): boolean {
  const incomingHost = req.header("x-spec260-original-host");
  const incomingProtocol = req.header("x-spec260-original-protocol");
  const origin = req.header("origin");
  if (!incomingHost || !origin || incomingProtocol !== "https") return false;
  try {
    const expected = new URL(`${incomingProtocol}://${incomingHost}`).origin;
    return new URL(origin).origin === expected;
  } catch {
    return false;
  }
}

async function createReport(
  req: EmergencyRouteRequest,
  res: Response,
  tenant: Tenant
) {
  if (!requireSameOriginForWrite(req))
    return reply(res, 403, { error: "ORIGIN_REJECTED" });
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success)
    return reply(res, 400, {
      error: "INVALID_REPORT",
      issues: parsed.error.issues.map(issue => issue.path.join(".")),
    });
  const idempotencyKey = req.header("idempotency-key")?.trim();
  if (
    !idempotencyKey ||
    idempotencyKey.length < 8 ||
    idempotencyKey.length > 160
  ) {
    return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
  }
  const idempotencyHash = sha256(idempotencyKey);
  const fingerprint = sha256(JSON.stringify(parsed.data));
  const ip = req.header("x-spec260-client-ip") || "unknown";
  try {
    const [prior] = await getDb()
      .select({
        id: emergencyReports.id,
        publicRef: emergencyReports.publicRef,
        sourceJson: emergencyReports.sourceJson,
      })
      .from(emergencyReports)
      .where(
        and(
          eq(emergencyReports.tenantId, tenant.id),
          eq(emergencyReports.idempotencyKeyHash, idempotencyHash)
        )
      )
      .limit(1);
    if (prior) {
      if (safeRecord(prior.sourceJson).requestFingerprint !== fingerprint)
        return reply(res, 409, { error: "IDEMPOTENCY_KEY_REUSED" });
      const [linkedCase] = await getDb()
        .select({ id: emergencyCases.id })
        .from(emergencyCases)
        .where(
          and(
            eq(emergencyCases.tenantId, tenant.id),
            eq(emergencyCases.reportId, prior.id)
          )
        )
        .limit(1);
      if (!linkedCase)
        return reply(res, 503, {
          accepted: false,
          error: "REPORT_CONTINUATION_UNAVAILABLE",
        });
      const token = anonymousCaseToken(
        tenant.id,
        prior.id,
        linkedCase.id,
        idempotencyHash
      );
      return reply(res, 200, {
        accepted: true,
        reportRef: prior.publicRef,
        continuationToken: token,
        duplicate: true,
        nextStep:
          "Emergency information has been received. A report is not yet verified.",
      });
    }
    const rate = await consumeSlidingWindow(
      "emergency-report-intake",
      `${tenant.id}:${ip}`,
      5,
      300
    );
    if (!rate.allowed) {
      res.setHeader("Retry-After", String(rate.retryAfterSeconds ?? 60));
      return reply(res, 429, { error: "REPORT_RATE_LIMITED" });
    }

    const reportId = randomUUID();
    const caseId = randomUUID();
    const result = await getDb().transaction(async tx => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenant.id}:${idempotencyHash}`}, 0))`
      );
      const [transactionPrior] = await tx
        .select({
          id: emergencyReports.id,
          publicRef: emergencyReports.publicRef,
          sourceJson: emergencyReports.sourceJson,
        })
        .from(emergencyReports)
        .where(
          and(
            eq(emergencyReports.tenantId, tenant.id),
            eq(emergencyReports.idempotencyKeyHash, idempotencyHash)
          )
        )
        .limit(1);
      if (transactionPrior) {
        if (
          safeRecord(transactionPrior.sourceJson).requestFingerprint !==
          fingerprint
        )
          throw new Error("IDEMPOTENCY_KEY_REUSED");
        const [linkedCase] = await tx
          .select({ id: emergencyCases.id })
          .from(emergencyCases)
          .where(
            and(
              eq(emergencyCases.tenantId, tenant.id),
              eq(emergencyCases.reportId, transactionPrior.id)
            )
          )
          .limit(1);
        if (!linkedCase) throw new Error("REPORT_CONTINUATION_UNAVAILABLE");
        return {
          ...transactionPrior,
          continuationToken: anonymousCaseToken(
            tenant.id,
            transactionPrior.id,
            linkedCase.id,
            idempotencyHash
          ),
          duplicate: true,
        };
      }
      const inserted = await tx
        .insert(emergencyReports)
        .values({
          id: reportId,
          tenantId: tenant.id,
          publicRef: publicRef("RPT"),
          idempotencyKeyHash: idempotencyHash,
          reportType: parsed.data.reportType ?? "unknown",
          summary: parsed.data.description.slice(0, 1000),
          detailsJson: { description: parsed.data.description },
          observedAt: parsed.data.observedAt
            ? new Date(parsed.data.observedAt)
            : null,
          exactLocation: parsed.data.location
            ? `SRID=4326;POINT(${parsed.data.location.longitude} ${parsed.data.location.latitude})`
            : null,
          locationAccuracyMeters: parsed.data.location?.accuracyMeters ?? null,
          locationDisclosure: "private",
          sourceJson: {
            channel: "public_web",
            verification: "unverified",
            requestFingerprint: fingerprint,
          },
          workerJobId: null,
        })
        .onConflictDoNothing()
        .returning({
          id: emergencyReports.id,
          publicRef: emergencyReports.publicRef,
        });
      if (!inserted[0]) {
        const [existing] = await tx
          .select({
            id: emergencyReports.id,
            publicRef: emergencyReports.publicRef,
            sourceJson: emergencyReports.sourceJson,
          })
          .from(emergencyReports)
          .where(
            and(
              eq(emergencyReports.tenantId, tenant.id),
              eq(emergencyReports.idempotencyKeyHash, idempotencyHash)
            )
          )
          .limit(1);
        if (!existing) throw new Error("REPORT_IDEMPOTENCY_CONFLICT");
        if (safeRecord(existing.sourceJson).requestFingerprint !== fingerprint)
          throw new Error("IDEMPOTENCY_KEY_REUSED");
        const [linkedCase] = await tx
          .select({ id: emergencyCases.id })
          .from(emergencyCases)
          .where(
            and(
              eq(emergencyCases.tenantId, tenant.id),
              eq(emergencyCases.reportId, existing.id)
            )
          )
          .limit(1);
        if (!linkedCase) throw new Error("REPORT_CONTINUATION_UNAVAILABLE");
        return {
          ...existing,
          continuationToken: anonymousCaseToken(
            tenant.id,
            existing.id,
            linkedCase.id,
            idempotencyHash
          ),
          duplicate: true,
        };
      }

      const job = await createCanonicalJobInTransaction({
        query: tx,
        definition: {
          contractVersion: "feature-186-v1",
          tenantId: tenant.id,
          jobType: "emergency.report.intake",
          executionClass: "short",
          priority: 100,
          input: { reportId, tenantId: tenant.id },
          idempotencyKey: `emergency-report:${idempotencyHash}`,
          retryPolicy: {
            maxAttempts: 5,
            baseDelayMs: 1000,
            maxDelayMs: 60_000,
            jitter: "bounded",
            deadlineMs: 24 * 60 * 60_000,
            allowedErrorClasses: ["transient"],
          },
          timeoutPolicy: { softTimeoutMs: 0, hardTimeoutMs: 60_000 },
          requiredCapabilities: {
            purpose: "emergency-report-intake",
            noUserCredit: true,
          },
        },
        options: {
          requestedBySystemComponent: "spec260.emergency-report-intake",
          runtimeType: "cloudflare",
        },
      });
      await tx
        .update(emergencyReports)
        .set({ workerJobId: job.jobId, updatedAt: new Date() })
        .where(
          and(
            eq(emergencyReports.id, reportId),
            eq(emergencyReports.tenantId, tenant.id)
          )
        );
      await tx.insert(emergencyCases).values({
        id: caseId,
        tenantId: tenant.id,
        reportId,
        status: "open",
        revision: 0,
        caseContextJson: {
          intakeStatus: "received",
          citizenSummary: parsed.data.description,
        },
      });
      const token = anonymousCaseToken(
        tenant.id,
        reportId,
        caseId,
        idempotencyHash
      );
      await tx.insert(emergencyReportAccessTokens).values({
        tenantId: tenant.id,
        reportId,
        caseId,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
      });
      const eventPayload = { reportId, status: "open", revision: 0 };
      const eventCreatedAt = new Date().toISOString();
      const eventHash = auditHash({
        tenantId: tenant.id,
        subjectType: "case",
        subjectId: caseId,
        actorType: "public_reporter",
        actorRef: "anonymous",
        eventType: "report_received",
        reason: "Citizen submitted an emergency report",
        after: eventPayload,
        createdAt: eventCreatedAt,
      });
      await tx.insert(emergencyCaseEvents).values({
        tenantId: tenant.id,
        caseId,
        eventIdempotencyKey: `report-received:${reportId}`,
        actorType: "public_reporter",
        actorRef: "anonymous",
        eventType: "report_received",
        reason: "Citizen submitted an emergency report",
        revision: 0,
        eventHash,
        payloadJson: eventPayload,
        createdAt: new Date(eventCreatedAt),
      });
      return { ...inserted[0], continuationToken: token, duplicate: false };
    });
    return reply(res, result.duplicate ? 200 : 201, {
      accepted: true,
      reportRef: result.publicRef,
      continuationToken: result.continuationToken,
      nextStep:
        "Emergency information has been received. A report is not yet verified.",
      duplicate: result.duplicate,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    if (reason === "IDEMPOTENCY_KEY_REUSED")
      return reply(res, 409, { error: reason });
    console.error("[Spec260] report admission failed", {
      tenantId: tenant.id,
      error: reason.slice(0, 120),
    });
    return reply(res, 503, { accepted: false, error: "REPORT_NOT_SUBMITTED" });
  }
}

async function getPublicSupportPools(tenantId: string) {
  const pools = await getDb()
    .select()
    .from(emergencySupportPools)
    .where(
      and(
        eq(emergencySupportPools.tenantId, tenantId),
        eq(emergencySupportPools.status, "active")
      )
    )
    .orderBy(desc(emergencySupportPools.updatedAt))
    .limit(100);
  if (!pools.length) return [];
  const totals = await getDb()
    .select({
      poolId: emergencyContributions.poolId,
      total: sql<string>`COALESCE(SUM(${emergencyContributions.amountMinorUnits}), 0)::text`,
    })
    .from(emergencyContributions)
    .where(
      and(
        eq(emergencyContributions.tenantId, tenantId),
        inArray(
          emergencyContributions.poolId,
          pools.map(pool => pool.id)
        ),
        eq(emergencyContributions.status, "settled")
      )
    )
    .groupBy(emergencyContributions.poolId);
  const totalByPool = new Map(totals.map(total => [total.poolId, total.total]));
  const poolAccounts = await getDb()
    .select({
      id: economicLedgerAccounts.id,
      ownerRef: economicLedgerAccounts.ownerRef,
    })
    .from(economicLedgerAccounts)
    .where(
      and(
        eq(economicLedgerAccounts.tenantId, tenantId),
        eq(economicLedgerAccounts.accountType, "restricted_support_fund"),
        eq(economicLedgerAccounts.currency, "THB"),
        inArray(
          economicLedgerAccounts.ownerRef,
          pools.map(pool => `pool:${pool.id}`)
        )
      )
    );
  const balances = poolAccounts.length
    ? await getDb()
        .select({
          accountId: economicJournalLines.accountId,
          balance: sql<string>`COALESCE(SUM(${economicJournalLines.creditMinorUnits} - ${economicJournalLines.debitMinorUnits}), 0)::text`,
        })
        .from(economicJournalLines)
        .innerJoin(
          economicJournalEntries,
          and(
            eq(economicJournalEntries.id, economicJournalLines.entryId),
            eq(economicJournalEntries.tenantId, economicJournalLines.tenantId)
          )
        )
        .where(
          and(
            eq(economicJournalLines.tenantId, tenantId),
            eq(economicJournalEntries.status, "posted"),
            inArray(
              economicJournalLines.accountId,
              poolAccounts.map(account => account.id)
            )
          )
        )
        .groupBy(economicJournalLines.accountId)
    : [];
  const balanceByAccount = new Map(
    balances.map(item => [item.accountId, item.balance])
  );
  const accountByPool = new Map(
    poolAccounts.map(account => [
      account.ownerRef.slice("pool:".length),
      account.id,
    ])
  );
  const allocationTotals = await getDb()
    .select({
      poolId: emergencyFundAllocations.poolId,
      total: sql<string>`COALESCE(SUM(${emergencyFundAllocations.amountMinorUnits}), 0)::text`,
    })
    .from(emergencyFundAllocations)
    .where(
      and(
        eq(emergencyFundAllocations.tenantId, tenantId),
        inArray(
          emergencyFundAllocations.poolId,
          pools.map(pool => pool.id)
        ),
        eq(emergencyFundAllocations.status, "active")
      )
    )
    .groupBy(emergencyFundAllocations.poolId);
  const earmarkedByPool = new Map(
    allocationTotals.map(item => [item.poolId, item.total])
  );
  return pools.map(pool =>
    safePool(
      pool,
      totalByPool.get(pool.id) ?? "0",
      earmarkedByPool.get(pool.id) ?? "0",
      balanceByAccount.get(accountByPool.get(pool.id) ?? "") ?? "0"
    )
  );
}

async function createPublicContribution(
  req: EmergencyRouteRequest,
  res: Response,
  tenantId: string,
  poolRef: string
) {
  const donor = await identityForRequest(req);
  if (!donor)
    return reply(res, 401, { error: "AUTHENTICATION_REQUIRED_TO_PAY" });
  if (donor.currentTenantId !== tenantId)
    return reply(res, 403, { error: "TENANT_SCOPE_MISMATCH" });
  const parsed = publicContributionSchema.safeParse(req.body);
  if (!parsed.success)
    return reply(res, 400, { error: "INVALID_CONTRIBUTION" });
  if (parsed.data.poolRef && parsed.data.poolRef !== poolRef)
    return reply(res, 400, { error: "SUPPORT_POOL_MISMATCH" });
  const idempotencyKey = req.header("idempotency-key")?.trim();
  if (
    !idempotencyKey ||
    idempotencyKey.length < 8 ||
    idempotencyKey.length > 160
  )
    return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });

  const [pool] = await getDb()
    .select()
    .from(emergencySupportPools)
    .where(
      and(
        eq(emergencySupportPools.tenantId, tenantId),
        eq(emergencySupportPools.publicRef, poolRef),
        eq(emergencySupportPools.status, "active")
      )
    )
    .limit(1);
  if (!pool) return reply(res, 404, { error: "SUPPORT_POOL_NOT_FOUND" });
  if (pool.currency !== "THB")
    return reply(res, 422, { error: "CONTRIBUTION_CURRENCY_UNAVAILABLE" });
  const keyHash = sha256(idempotencyKey);
  const [existing] = await getDb()
    .select()
    .from(emergencyContributions)
    .where(
      and(
        eq(emergencyContributions.tenantId, tenantId),
        eq(emergencyContributions.idempotencyKeyHash, keyHash)
      )
    )
    .limit(1);
  if (existing) {
    if (
      existing.poolId !== pool.id ||
      existing.donorUserId !== donor.id ||
      Number(existing.amountMinorUnits) !== parsed.data.amountMinorUnits
    ) {
      return reply(res, 409, { error: "IDEMPOTENCY_KEY_REUSED" });
    }
    const paymentId = existing.paymentRecordRef;
    const [payment] = paymentId
      ? await getDb()
          .select({
            id: payments.id,
            status: payments.status,
            raw: payments.rawResponseJson,
            providerPaymentId: payments.providerPaymentId,
            expiresAt: payments.expiresAt,
          })
          .from(payments)
          .where(eq(payments.id, paymentId))
          .limit(1)
      : [];
    const checkout = safeRecord(payment?.raw);
    const paymentUrl =
      typeof checkout.paymentUrl === "string" &&
      checkout.paymentUrl.startsWith("https://")
        ? checkout.paymentUrl
        : null;
    const qrCodeUrl =
      typeof checkout.qrCodeUrl === "string" ? checkout.qrCodeUrl : null;
    return reply(res, paymentUrl ? 200 : 202, {
      contributionRef: existing.id,
      status: existing.status,
      paymentUrl,
      qrCodeUrl,
      expiresAt: payment?.expiresAt?.toISOString() ?? null,
      duplicate: true,
    });
  }

  const [contribution] = await getDb()
    .insert(emergencyContributions)
    .values({
      tenantId,
      poolId: pool.id,
      donorUserId: donor.id,
      idempotencyKeyHash: keyHash,
      amountMinorUnits: BigInt(parsed.data.amountMinorUnits),
      currency: pool.currency,
      status: "pending",
    })
    .onConflictDoNothing()
    .returning({ id: emergencyContributions.id });
  if (!contribution)
    return reply(res, 409, { error: "CONTRIBUTION_ALREADY_PROCESSING" });

  try {
    const [health, config] = await Promise.all([
      testBeamProviderAdminSettings(),
      getBeamProviderRuntimeConfig(),
    ]);
    if (
      !health.configured ||
      (parsed.data.paymentMethod === "card" && !health.paymentLinkConfigured) ||
      (parsed.data.paymentMethod === "promptpay" && !config.chargesPath?.trim())
    ) {
      await getDb()
        .update(emergencyContributions)
        .set({ status: "failed", updatedAt: new Date() })
        .where(
          and(
            eq(emergencyContributions.id, contribution.id),
            eq(emergencyContributions.tenantId, tenantId)
          )
        );
      return reply(res, 503, { error: "PAYMENT_CHANNEL_UNAVAILABLE" });
    }
    const paymentResult = await createInvoiceChargeFlow({
      tenantId,
      userId: donor.id,
      actorUserId: null,
      invoiceType: "manual",
      currency: pool.currency,
      documentLanguage: "th",
      provider: await createBeamProvider(),
      providerPaymentType:
        parsed.data.paymentMethod === "card" ? "payment_link" : "charge",
      lineItems: [
        {
          itemType: "emergency_contribution",
          description: `Emergency contribution: ${pool.title.slice(0, 120)}`,
          quantity: 1,
          unitPrice: parsed.data.amountMinorUnits / 100,
          metadataJson: {
            program: "spec260_emergency_support",
            poolRef: pool.publicRef,
            contributionRef: contribution.id,
          },
        },
      ],
      chargePayload: {
        description: `Emergency support contribution ${contribution.id}`,
        idempotencyKey,
        program: "spec260_emergency_support",
        supportPoolRef: pool.publicRef,
      },
      renderInitialDocument: false,
      suppressInvoiceIssuedNotification: true,
      suppressQrReadyNotification: true,
    });
    const paid = paymentResult.payment.status === "paid";
    await getDb()
      .update(emergencyContributions)
      .set({
        status: paid ? "authorized" : "pending",
        paymentIntentRef: paymentResult.payment.providerPaymentId,
        paymentRecordRef: paymentResult.payment.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(emergencyContributions.id, contribution.id),
          eq(emergencyContributions.tenantId, tenantId)
        )
      );
    if (paid) {
      try {
        await settleEmergencyContribution(getDb(), {
          tenantId,
          contributionId: contribution.id,
          paymentId: paymentResult.payment.id,
          policyVersion: "spec260-financial-v1",
        });
      } catch (error) {
        console.error(
          "[Spec260] paid contribution awaiting financial reconciliation",
          {
            tenantId,
            contributionId: contribution.id,
            error:
              error instanceof Error ? error.message.slice(0, 100) : "unknown",
          }
        );
        if (error instanceof EmergencyFinancialError) {
          await getDb()
            .update(emergencyContributions)
            .set({ status: "disputed", updatedAt: new Date() })
            .where(
              and(
                eq(emergencyContributions.id, contribution.id),
                eq(emergencyContributions.tenantId, tenantId)
              )
            );
        }
        return reply(res, 202, {
          contributionRef: contribution.id,
          status: "pending",
          checkout: "being_reconciled",
        });
      }
    }
    const raw = safeRecord(paymentResult.payment.rawResponseJson);
    const paymentUrl =
      typeof raw.paymentUrl === "string" &&
      raw.paymentUrl.startsWith("https://")
        ? raw.paymentUrl
        : null;
    const qrCodeUrl = typeof raw.qrCodeUrl === "string" ? raw.qrCodeUrl : null;
    if (!paymentUrl && !qrCodeUrl && !paid)
      return reply(res, 202, {
        contributionRef: contribution.id,
        status: "pending",
        checkout: "being_reconciled",
      });
    return reply(res, 201, {
      contributionRef: contribution.id,
      status: paymentResult.payment.status,
      paymentUrl,
      qrCodeUrl,
      expiresAt: paymentResult.payment.expiresAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error("[Spec260] contribution checkout failed", {
      tenantId,
      contributionId: contribution.id,
      error: error instanceof Error ? error.message.slice(0, 100) : "unknown",
    });
    // Provider timeouts can be ambiguous after a charge request was accepted.
    // Keep the idempotency record retryable; only a verified provider decline may fail it.
    await getDb()
      .update(emergencyContributions)
      .set({ status: "pending", updatedAt: new Date() })
      .where(
        and(
          eq(emergencyContributions.id, contribution.id),
          eq(emergencyContributions.tenantId, tenantId)
        )
      );
    return reply(res, 503, { error: "CONTRIBUTION_CHECKOUT_UNAVAILABLE" });
  }
}

async function handleEmergencyRoute(
  req: EmergencyRouteRequest,
  res: Response
): Promise<unknown> {
  const pathname = req.originalUrl.split("?", 1)[0];
  const matched = matchSpec260ApiRouteWithParams(req.method, pathname);
  if (!matched) return undefined;
  const { route, params } = matched;
  const tenant = await tenantForEdgeRequest(req);
  if (!tenant && route.access === "public")
    return reply(res, 404, { error: "TENANT_NOT_FOUND" });
  if (tenant) req.spec260Tenant = tenant;

  if (route.method !== "GET" && !requireSameOriginForWrite(req)) {
    return reply(res, 403, { error: "ORIGIN_REJECTED" });
  }

  if (route.access !== "public") {
    const identity = await ensureIdentity(req, res);
    if (!identity) return undefined;
    const { tenantId, user } = identity;
    const publicHostTenantId = tenant?.id;
    if (publicHostTenantId && tenantId !== publicHostTenantId) {
      return reply(res, 403, { error: "TENANT_SCOPE_MISMATCH" });
    }
    const capability =
      route.access === "verified"
        ? "emergency.respond"
        : route.access === "operations"
          ? "emergency.command"
          : route.access === "sponsor"
            ? "emergency.sponsorship"
            : null;
    let scopedCapabilityResource:
      | { scopeType: "case" | "situation" | "support_pool"; scopeRef: string }
      | undefined = route.id.startsWith("operations.command.case.")
      ? { scopeType: "case" as const, scopeRef: params.caseId ?? "" }
      : route.id.startsWith("operations.command.need.") && params.needId
        ? await (async () => {
            const [row] = await getDb()
              .select({ caseId: emergencyNeeds.caseId })
              .from(emergencyNeeds)
              .where(
                and(
                  eq(emergencyNeeds.tenantId, tenantId),
                  eq(emergencyNeeds.id, params.needId)
                )
              )
              .limit(1);
            return row
              ? { scopeType: "case" as const, scopeRef: row.caseId }
              : { scopeType: "case" as const, scopeRef: "" };
          })()
        : (route.id.startsWith("operations.command.task.") ||
              route.id === "operations.command.tasks") &&
            params.taskId
          ? await (async () => {
              const [row] = await getDb()
                .select({ caseId: emergencyResponseTasks.caseId })
                .from(emergencyResponseTasks)
                .where(
                  and(
                    eq(emergencyResponseTasks.tenantId, tenantId),
                    eq(emergencyResponseTasks.id, params.taskId)
                  )
                )
                .limit(1);
              return row
                ? { scopeType: "case" as const, scopeRef: row.caseId }
                : { scopeType: "case" as const, scopeRef: "" };
            })()
          : route.id.startsWith("operations.command.") && params.caseId
            ? { scopeType: "case" as const, scopeRef: params.caseId }
            : route.id.startsWith("operations.command.update")
              ? {
                  scopeType: "situation" as const,
                  scopeRef: params.situationId ?? "",
                }
              : route.id === "verified.response.update" && params.assignmentId
                ? await (async () => {
                    const [row] = await getDb()
                      .select({ caseId: emergencyAssignments.caseId })
                      .from(emergencyAssignments)
                      .where(
                        and(
                          eq(emergencyAssignments.tenantId, tenantId),
                          eq(emergencyAssignments.id, params.assignmentId),
                          eq(emergencyAssignments.responderUserId, user.id)
                        )
                      )
                      .limit(1);
                    return row
                      ? { scopeType: "case" as const, scopeRef: row.caseId }
                      : { scopeType: "case" as const, scopeRef: "" };
                  })()
                : undefined;
    if (route.id === "sponsor.pools.manage" && params.poolId) {
      const [pool] = await getDb()
        .select({ id: emergencySupportPools.id })
        .from(emergencySupportPools)
        .where(
          and(
            eq(emergencySupportPools.tenantId, tenantId),
            eq(emergencySupportPools.publicRef, params.poolId)
          )
        )
        .limit(1);
      if (!pool) return reply(res, 404, { error: "SUPPORT_POOL_NOT_FOUND" });
      scopedCapabilityResource = {
        scopeType: "support_pool",
        scopeRef: pool.id,
      };
    }
    if (route.id.startsWith("sponsor.allocation.") && params.poolId) {
      const [pool] = await getDb()
        .select({ id: emergencySupportPools.id })
        .from(emergencySupportPools)
        .where(
          and(
            eq(emergencySupportPools.tenantId, tenantId),
            eq(emergencySupportPools.publicRef, params.poolId)
          )
        )
        .limit(1);
      if (!pool) return reply(res, 404, { error: "SUPPORT_POOL_NOT_FOUND" });
      scopedCapabilityResource = {
        scopeType: "support_pool",
        scopeRef: pool.id,
      };
    }
    const grantAdminRoute =
      (route.id.startsWith("operations.capabilities.") &&
        (user.role === "admin" || user.role === "domain_admin")) ||
      isAdminIntelligenceRegistryRoute(route.id, user.role);
    const hasRouteCapability =
      route.id === "verified.response.assignments"
        ? await hasAnyActiveCapability(
            tenantId,
            user.id,
            capability ?? "emergency.respond"
          )
        : capability
          ? await hasCapability(
              tenantId,
              user.id,
              capability,
              scopedCapabilityResource
            )
          : true;
    if (capability && !grantAdminRoute && !hasRouteCapability) {
      return reply(res, 403, { error: "EMERGENCY_CAPABILITY_REQUIRED" });
    }
    req.spec260Tenant = tenant ?? ({ id: tenantId } as Tenant);
  }

  const scopedTenant = req.spec260Tenant!;
  const user = req.spec260User;
  const tenantId = user?.currentTenantId ?? scopedTenant.id;

  switch (route.id) {
    case "public.claims": {
      const rows = await getDb().execute(sql<
        Array<{
          claimRef: string;
          summary: unknown;
          updatedAt: Date;
          revision: number;
        }>
      >`
        SELECT c."claimRef", c."publicProjectionJson" AS summary, c."updatedAt", c."revision"
        FROM "emergency_intel_claims" c
        WHERE c."tenantId" = ${scopedTenant.id} AND c."status" = 'verified'
          AND (SELECT count(DISTINCT s."independenceGroup") FROM "emergency_intel_claim_sources" cs
            INNER JOIN "emergency_intel_captures" cap ON cap."id" = cs."captureId" AND cap."tenantId" = cs."tenantId"
            INNER JOIN "emergency_intel_sources" s ON s."id" = cap."sourceId" AND s."tenantId" = cap."tenantId"
            WHERE cs."tenantId" = c."tenantId" AND cs."claimId" = c."id" AND s."status" = 'active') >= 2
        ORDER BY c."updatedAt" DESC LIMIT 100
      `);
      return reply(res, 200, {
        items: rows.map(row => {
          const projection = safeRecord(row.summary);
          return {
            claimRef: row.claimRef,
            summary:
              typeof projection.summary === "string"
                ? projection.summary.slice(0, 500)
                : "",
            sourceGroupCount: Number.isInteger(projection.sourceGroupCount)
              ? projection.sourceGroupCount
              : 0,
            updatedAt: row.updatedAt.toISOString(),
            revision: row.revision,
          };
        }),
      });
    }
    case "operations.privacy.holds": {
      const rows = await getDb()
        .select({
          id: emergencyLegalHolds.id,
          caseId: emergencyLegalHolds.caseId,
          evidenceId: emergencyLegalHolds.evidenceId,
          reason: emergencyLegalHolds.reason,
          status: emergencyLegalHolds.status,
          createdAt: emergencyLegalHolds.createdAt,
          releasedAt: emergencyLegalHolds.releasedAt,
        })
        .from(emergencyLegalHolds)
        .where(eq(emergencyLegalHolds.tenantId, tenantId))
        .orderBy(desc(emergencyLegalHolds.createdAt))
        .limit(200);
      return reply(res, 200, {
        items: rows.map(row => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
          releasedAt: row.releasedAt?.toISOString() ?? null,
        })),
      });
    }
    case "operations.privacy.hold.create": {
      if (!(await hasCapability(tenantId, user!.id, "emergency.verify")))
        return reply(res, 403, { error: "EMERGENCY_VERIFIER_REQUIRED" });
      const parsed = legalHoldCreateSchema.safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "INVALID_LEGAL_HOLD" });
      const key = req.header("idempotency-key")?.trim();
      if (!key || key.length < 8 || key.length > 160)
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      const eventKey = `privacy-hold:create:${sha256(key)}`;
      const fingerprint = requestFingerprint(parsed.data);
      const result = await getDb().transaction(async tx => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${eventKey}`}, 0))`
        );
        const [prior] = await tx
          .select({
            subjectId: emergencyAuditEvents.subjectId,
            afterJson: emergencyAuditEvents.afterJson,
          })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.eventIdempotencyKey, eventKey)
            )
          )
          .limit(1);
        if (prior)
          return {
            id: prior.subjectId,
            state:
              safeRecord(prior.afterJson).requestFingerprint === fingerprint
                ? ("duplicate" as const)
                : ("idempotency_reused" as const),
          };
        const [caseRow] = await tx
          .select({ id: emergencyCases.id })
          .from(emergencyCases)
          .where(
            and(
              eq(emergencyCases.tenantId, tenantId),
              eq(emergencyCases.id, parsed.data.caseId)
            )
          )
          .limit(1);
        if (!caseRow) return { state: "case_missing" as const };
        if (parsed.data.evidenceId) {
          const [evidence] = await tx
            .select({
              id: emergencyEvidenceAssets.id,
              chainJson: emergencyEvidenceAssets.chainJson,
            })
            .from(emergencyEvidenceAssets)
            .where(
              and(
                eq(emergencyEvidenceAssets.tenantId, tenantId),
                eq(emergencyEvidenceAssets.id, parsed.data.evidenceId),
                eq(emergencyEvidenceAssets.caseId, caseRow.id)
              )
            )
            .for("update")
            .limit(1);
          if (!evidence) return { state: "evidence_missing" as const };
          const cleanupUntil = Date.parse(
            String(
              safeRecord(evidence.chainJson).stagingCleanupLeaseUntil ?? ""
            )
          );
          if (Number.isFinite(cleanupUntil) && cleanupUntil > Date.now())
            return { state: "cleanup_in_progress" as const };
        } else {
          const evidenceRows = await tx
            .select({ chainJson: emergencyEvidenceAssets.chainJson })
            .from(emergencyEvidenceAssets)
            .where(
              and(
                eq(emergencyEvidenceAssets.tenantId, tenantId),
                eq(emergencyEvidenceAssets.caseId, caseRow.id)
              )
            )
            .orderBy(asc(emergencyEvidenceAssets.id))
            .for("update");
          if (
            evidenceRows.some(row => {
              const until = Date.parse(
                String(safeRecord(row.chainJson).stagingCleanupLeaseUntil ?? "")
              );
              return Number.isFinite(until) && until > Date.now();
            })
          )
            return { state: "cleanup_in_progress" as const };
        }
        const id = randomUUID();
        const now = new Date();
        const after = {
          id,
          caseId: caseRow.id,
          evidenceId: parsed.data.evidenceId ?? null,
          reason: parsed.data.reason,
          status: "active",
          requestFingerprint: fingerprint,
        };
        await tx.insert(emergencyLegalHolds).values({
          id,
          tenantId,
          caseId: caseRow.id,
          evidenceId: parsed.data.evidenceId,
          reason: parsed.data.reason,
          placedByUserId: user!.id,
          idempotencyKey: eventKey,
          createdAt: now,
        });
        const audit = {
          tenantId,
          subjectType: "legal_hold",
          subjectId: id,
          actorType: "user",
          actorRef: String(user!.id),
          eventType: "emergency_legal_hold_placed",
          reason: parsed.data.reason,
          after,
          previousHash: null,
          createdAt: now.toISOString(),
        };
        await tx.insert(emergencyAuditEvents).values({
          ...audit,
          eventIdempotencyKey: eventKey,
          eventHash: auditHash(audit),
          afterJson: after,
          createdAt: now,
        });
        return { id, state: "created" as const };
      });
      if (result.state === "case_missing")
        return reply(res, 404, { error: "CASE_NOT_FOUND" });
      if (result.state === "evidence_missing")
        return reply(res, 404, { error: "EVIDENCE_NOT_FOUND_FOR_CASE" });
      if (result.state === "cleanup_in_progress")
        return reply(res, 409, {
          error: "EVIDENCE_CLEANUP_IN_PROGRESS_RETRY_HOLD",
        });
      if (result.state === "idempotency_reused")
        return reply(res, 409, { error: "IDEMPOTENCY_KEY_REUSED" });
      return reply(res, result.state === "created" ? 201 : 200, {
        holdId: result.id,
        duplicate: result.state === "duplicate",
      });
    }
    case "operations.privacy.hold.release": {
      if (!(await hasCapability(tenantId, user!.id, "emergency.verify")))
        return reply(res, 403, { error: "EMERGENCY_VERIFIER_REQUIRED" });
      const parsed = legalHoldReleaseSchema.safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "INVALID_LEGAL_HOLD_RELEASE" });
      const key = req.header("idempotency-key")?.trim();
      if (!key || key.length < 8 || key.length > 160)
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      const holdId = params.holdId;
      const eventKey = `privacy-hold:release:${holdId}:${sha256(key)}`;
      const fingerprint = requestFingerprint(parsed.data);
      const result = await getDb().transaction(async tx => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${eventKey}`}, 0))`
        );
        const [prior] = await tx
          .select({ afterJson: emergencyAuditEvents.afterJson })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.eventIdempotencyKey, eventKey)
            )
          )
          .limit(1);
        if (prior)
          return safeRecord(prior.afterJson).requestFingerprint === fingerprint
            ? ("duplicate" as const)
            : ("idempotency_reused" as const);
        const [hold] = await tx
          .select()
          .from(emergencyLegalHolds)
          .where(
            and(
              eq(emergencyLegalHolds.tenantId, tenantId),
              eq(emergencyLegalHolds.id, holdId)
            )
          )
          .for("update")
          .limit(1);
        if (!hold) return "missing" as const;
        if (hold.status !== "active") return "already_released" as const;
        const now = new Date();
        await tx
          .update(emergencyLegalHolds)
          .set({
            status: "released",
            releasedByUserId: user!.id,
            releaseReason: parsed.data.reason,
            releasedAt: now,
          })
          .where(eq(emergencyLegalHolds.id, hold.id));
        const before = {
          id: hold.id,
          caseId: hold.caseId,
          evidenceId: hold.evidenceId,
          status: hold.status,
        };
        const after = {
          ...before,
          status: "released",
          releaseReason: parsed.data.reason,
          requestFingerprint: fingerprint,
        };
        const [previousAudit] = await tx
          .select({ eventHash: emergencyAuditEvents.eventHash })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.subjectType, "legal_hold"),
              eq(emergencyAuditEvents.subjectId, hold.id)
            )
          )
          .orderBy(desc(emergencyAuditEvents.createdAt))
          .limit(1);
        const audit = {
          tenantId,
          subjectType: "legal_hold",
          subjectId: hold.id,
          actorType: "user",
          actorRef: String(user!.id),
          eventType: "emergency_legal_hold_released",
          reason: parsed.data.reason,
          before,
          after,
          previousHash: previousAudit?.eventHash ?? null,
          createdAt: now.toISOString(),
        };
        await tx.insert(emergencyAuditEvents).values({
          ...audit,
          eventIdempotencyKey: eventKey,
          eventHash: auditHash(audit),
          beforeJson: before,
          afterJson: after,
          createdAt: now,
        });
        return "released" as const;
      });
      if (result === "missing")
        return reply(res, 404, { error: "LEGAL_HOLD_NOT_FOUND" });
      if (result === "already_released")
        return reply(res, 409, { error: "LEGAL_HOLD_ALREADY_RELEASED" });
      if (result === "idempotency_reused")
        return reply(res, 409, { error: "IDEMPOTENCY_KEY_REUSED" });
      return reply(res, 200, {
        released: result === "released",
        duplicate: result === "duplicate",
      });
    }
    case "operations.intel.sources": {
      const rows = await getDb()
        .select()
        .from(emergencyIntelSources)
        .where(eq(emergencyIntelSources.tenantId, tenantId))
        .orderBy(desc(emergencyIntelSources.updatedAt))
        .limit(200);
      return reply(res, 200, {
        items: rows.map(row => ({
          id: row.id,
          sourceRef: row.sourceRef,
          displayName: row.displayName,
          sourceType: row.sourceType,
          dataClassification:
            safeRecord(row.policyJson).dataClassification ?? "unclassified",
          canonicalOrigin: row.canonicalOrigin,
          independenceGroup: row.independenceGroup,
          jurisdictionRef: row.jurisdictionRef,
          status: row.status,
          createdAt: row.createdAt.toISOString(),
        })),
      });
    }
    case "operations.federation.partners": {
      const rows = await getDb()
        .select()
        .from(emergencyFederationPartners)
        .where(eq(emergencyFederationPartners.tenantId, tenantId))
        .orderBy(desc(emergencyFederationPartners.updatedAt))
        .limit(200);
      return reply(res, 200, {
        items: rows.map(row => ({
          id: row.id,
          partnerRef: row.partnerRef,
          displayName: row.displayName,
          contractVersion: row.contractVersion,
          jurisdictionRefs: row.jurisdictionRefs,
          capabilityRefs: row.capabilityRefs,
          status: row.status,
          trustLevel: row.trustLevel,
          revokedAt: row.revokedAt?.toISOString() ?? null,
        })),
      });
    }
    case "operations.federation.partner.create": {
      const parsed = federationPartnerCreateSchema.safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "INVALID_FEDERATION_PARTNER" });
      const key = req.header("idempotency-key")?.trim();
      if (!key || key.length < 8 || key.length > 160)
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      const eventKey = `federation-partner:create:${sha256(key)}`;
      const fingerprint = requestFingerprint(parsed.data);
      const now = new Date();
      const result = await getDb().transaction(async tx => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${eventKey}`}, 0))`
        );
        const [prior] = await tx
          .select({
            subjectId: emergencyAuditEvents.subjectId,
            afterJson: emergencyAuditEvents.afterJson,
          })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.eventIdempotencyKey, eventKey)
            )
          )
          .limit(1);
        if (prior)
          return {
            id: prior.subjectId,
            state:
              safeRecord(prior.afterJson).requestFingerprint === fingerprint
                ? ("duplicate" as const)
                : ("idempotency_reused" as const),
          };
        const id = randomUUID();
        const [partner] = await tx
          .insert(emergencyFederationPartners)
          .values({
            id,
            tenantId,
            ...parsed.data,
            jurisdictionRefs: [...new Set(parsed.data.jurisdictionRefs)],
            capabilityRefs: [...new Set(parsed.data.capabilityRefs)],
            status: "pending",
            trustLevel: "unverified",
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing()
          .returning({ id: emergencyFederationPartners.id });
        if (!partner) return { id: "", state: "conflict" as const };
        const after = {
          partnerRef: parsed.data.partnerRef,
          status: "pending",
          trustLevel: "unverified",
          requestFingerprint: fingerprint,
        };
        const audit = {
          tenantId,
          subjectType: "federation_partner",
          subjectId: id,
          actorType: "user",
          actorRef: String(user!.id),
          eventType: "federation_partner_registered",
          reason: "Partner registered pending identity and trust verification",
          after,
          createdAt: now.toISOString(),
        };
        await tx.insert(emergencyAuditEvents).values({
          ...audit,
          eventIdempotencyKey: eventKey,
          eventHash: auditHash(audit),
          afterJson: after,
          createdAt: now,
        });
        return { id, state: "created" as const };
      });
      return result.state === "conflict"
        ? reply(res, 409, { error: "FEDERATION_PARTNER_REF_CONFLICT" })
        : result.state === "idempotency_reused"
          ? reply(res, 409, { error: "IDEMPOTENCY_KEY_REUSED" })
          : reply(res, result.state === "created" ? 201 : 200, {
              partnerId: result.id,
              status: "pending",
              duplicate: result.state === "duplicate",
            });
    }
    case "operations.federation.partner.update": {
      const parsed = federationPartnerUpdateSchema.safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "INVALID_FEDERATION_PARTNER_UPDATE" });
      if (
        parsed.data.status === "active" &&
        !(await hasCapability(tenantId, user!.id, "emergency.verify"))
      )
        return reply(res, 403, {
          error: "EMERGENCY_VERIFICATION_CAPABILITY_REQUIRED",
        });
      const key = req.header("idempotency-key")?.trim();
      if (!key || key.length < 8 || key.length > 160)
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      const eventKey = `federation-partner:update:${params.partnerId}:${sha256(key)}`;
      const fingerprint = requestFingerprint(parsed.data);
      const now = new Date();
      const outcome = await getDb().transaction(async tx => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${eventKey}`}, 0))`
        );
        const [prior] = await tx
          .select({ afterJson: emergencyAuditEvents.afterJson })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.eventIdempotencyKey, eventKey)
            )
          )
          .limit(1);
        if (prior)
          return safeRecord(prior.afterJson).requestFingerprint === fingerprint
            ? ("duplicate" as const)
            : ("idempotency_reused" as const);
        const [partner] = await tx
          .select()
          .from(emergencyFederationPartners)
          .where(
            and(
              eq(emergencyFederationPartners.tenantId, tenantId),
              eq(emergencyFederationPartners.id, params.partnerId)
            )
          )
          .for("update")
          .limit(1);
        if (!partner) return "not_found" as const;
        if (partner.status !== parsed.data.expectedStatus)
          return "conflict" as const;
        if (
          partner.status === "revoked" ||
          (partner.status === "pending" &&
            !["active", "revoked"].includes(parsed.data.status)) ||
          (partner.status === "active" &&
            !["paused", "revoked"].includes(parsed.data.status)) ||
          (partner.status === "paused" &&
            !["active", "revoked"].includes(parsed.data.status))
        )
          return "transition" as const;
        const trustLevel =
          parsed.data.status === "revoked"
            ? partner.trustLevel
            : (parsed.data.trustLevel ?? partner.trustLevel);
        if (
          parsed.data.status === "active" &&
          !["verified", "trusted"].includes(trustLevel)
        )
          return "unverified" as const;
        await tx
          .update(emergencyFederationPartners)
          .set({
            status: parsed.data.status,
            trustLevel,
            ...(parsed.data.status === "revoked" ? { revokedAt: now } : {}),
            updatedAt: now,
          })
          .where(
            and(
              eq(emergencyFederationPartners.tenantId, tenantId),
              eq(emergencyFederationPartners.id, partner.id),
              eq(emergencyFederationPartners.status, partner.status)
            )
          );
        if (parsed.data.status === "revoked")
          await tx
            .update(emergencyFederationShares)
            .set({ revokedAt: now })
            .where(
              and(
                eq(emergencyFederationShares.tenantId, tenantId),
                eq(emergencyFederationShares.partnerId, partner.id),
                isNull(emergencyFederationShares.revokedAt)
              )
            );
        const before = {
          status: partner.status,
          trustLevel: partner.trustLevel,
        };
        const after = {
          status: parsed.data.status,
          trustLevel,
          requestFingerprint: fingerprint,
        };
        const audit = {
          tenantId,
          subjectType: "federation_partner",
          subjectId: partner.id,
          actorType: "user",
          actorRef: String(user!.id),
          eventType:
            parsed.data.status === "revoked"
              ? "federation_partner_revoked"
              : "federation_partner_reviewed",
          reason: parsed.data.reason,
          before,
          after,
          createdAt: now.toISOString(),
        };
        await tx.insert(emergencyAuditEvents).values({
          ...audit,
          eventIdempotencyKey: eventKey,
          eventHash: auditHash(audit),
          beforeJson: before,
          afterJson: after,
          createdAt: now,
        });
        return "updated" as const;
      });
      return outcome === "not_found"
        ? reply(res, 404, { error: "FEDERATION_PARTNER_NOT_FOUND" })
        : outcome === "unverified"
          ? reply(res, 409, { error: "FEDERATION_PARTNER_TRUST_REQUIRED" })
          : outcome === "transition"
            ? reply(res, 409, {
                error: "FEDERATION_PARTNER_TRANSITION_INVALID",
              })
            : outcome === "conflict"
              ? reply(res, 409, { error: "FEDERATION_PARTNER_STATUS_CONFLICT" })
              : outcome === "idempotency_reused"
                ? reply(res, 409, { error: "IDEMPOTENCY_KEY_REUSED" })
                : reply(res, 200, {
                    updated: outcome === "updated",
                    duplicate: outcome === "duplicate",
                  });
    }
    case "operations.federation.case-options": {
      const rows = await getDb()
        .select({
          id: emergencyCases.id,
          status: emergencyCases.status,
          context: emergencyCases.caseContextJson,
        })
        .from(emergencyCases)
        .where(
          and(
            eq(emergencyCases.tenantId, tenantId),
            inArray(emergencyCases.status, [
              "open",
              "triage",
              "active",
              "waiting",
            ])
          )
        )
        .orderBy(desc(emergencyCases.updatedAt))
        .limit(200);
      return reply(res, 200, {
        items: rows
          .map(row => {
            const triage = safeRecord(safeRecord(row.context).triage);
            return {
              id: row.id,
              status: row.status,
              hazardCategory:
                typeof triage.hazardCategory === "string"
                  ? triage.hazardCategory
                  : "unknown",
              jurisdictionRef:
                typeof triage.jurisdictionRef === "string"
                  ? triage.jurisdictionRef
                  : null,
            };
          })
          .filter(row => row.jurisdictionRef !== null),
      });
    }
    case "operations.federation.shares": {
      const rows = await getDb()
        .select({
          share: emergencyFederationShares,
          partner: emergencyFederationPartners,
        })
        .from(emergencyFederationShares)
        .innerJoin(
          emergencyFederationPartners,
          and(
            eq(
              emergencyFederationPartners.id,
              emergencyFederationShares.partnerId
            ),
            eq(emergencyFederationPartners.tenantId, tenantId)
          )
        )
        .where(eq(emergencyFederationShares.tenantId, tenantId))
        .orderBy(desc(emergencyFederationShares.createdAt))
        .limit(300);
      const now = Date.now();
      return reply(res, 200, {
        items: rows.map(({ share, partner }) => ({
          id: share.id,
          partnerId: partner.id,
          partnerName: partner.displayName,
          resourceType: share.sourceResourceType,
          resourceRef: share.sourceResourceRef,
          projection: share.projectionJson,
          jurisdictionRef: share.jurisdictionRef,
          expiresAt: share.expiresAt.toISOString(),
          revokedAt: share.revokedAt?.toISOString() ?? null,
          state: share.revokedAt
            ? "revoked"
            : share.expiresAt.getTime() <= now || partner.status !== "active"
              ? "inactive"
              : "queued_not_delivered",
        })),
      });
    }
    case "operations.federation.share.create": {
      const parsed = federationShareCreateSchema.safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "INVALID_FEDERATION_SHARE" });
      const expiresAt = new Date(parsed.data.expiresAt);
      const now = new Date();
      if (
        expiresAt <= now ||
        expiresAt.getTime() > now.getTime() + 24 * 60 * 60_000
      )
        return reply(res, 400, {
          error: "FEDERATION_SHARE_EXPIRY_OUT_OF_RANGE",
        });
      const key = req.header("idempotency-key")?.trim();
      if (!key || key.length < 8 || key.length > 160)
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      const eventKey = `federation-share:create:${sha256(key)}`;
      const fingerprint = requestFingerprint(parsed.data);
      const outcome = await getDb().transaction(async tx => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${eventKey}`}, 0))`
        );
        const [prior] = await tx
          .select({
            subjectId: emergencyAuditEvents.subjectId,
            afterJson: emergencyAuditEvents.afterJson,
          })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.eventIdempotencyKey, eventKey)
            )
          )
          .limit(1);
        if (prior)
          return {
            id: prior.subjectId,
            state:
              safeRecord(prior.afterJson).requestFingerprint === fingerprint
                ? ("duplicate" as const)
                : ("idempotency_reused" as const),
          };
        const [partner] = await tx
          .select()
          .from(emergencyFederationPartners)
          .where(
            and(
              eq(emergencyFederationPartners.tenantId, tenantId),
              eq(emergencyFederationPartners.id, parsed.data.partnerId)
            )
          )
          .for("update")
          .limit(1);
        if (
          !partner ||
          partner.status !== "active" ||
          !["verified", "trusted"].includes(partner.trustLevel)
        )
          return { id: "", state: "partner_unavailable" as const };
        if (!partner.jurisdictionRefs.includes(parsed.data.jurisdictionRef))
          return { id: "", state: "jurisdiction_mismatch" as const };
        let projection: Record<string, unknown>;
        if (parsed.data.resourceType === "case") {
          const [row] = await tx
            .select()
            .from(emergencyCases)
            .where(
              and(
                eq(emergencyCases.tenantId, tenantId),
                eq(emergencyCases.id, parsed.data.resourceRef)
              )
            )
            .limit(1);
          if (!row) return { id: "", state: "resource_not_found" as const };
          const context = safeRecord(row.caseContextJson);
          const triage = safeRecord(context.triage);
          if (
            !canCreateEmergencyFederationShare({
              resourceType: "case",
              sourceTenantId: tenantId,
              tenantId,
              sourceJurisdiction:
                typeof triage.jurisdictionRef === "string"
                  ? triage.jurisdictionRef
                  : null,
              requestedJurisdiction: parsed.data.jurisdictionRef,
              partnerJurisdictions: partner.jurisdictionRefs,
            })
          )
            return { id: "", state: "jurisdiction_mismatch" as const };
          const [report] = row.reportId
            ? await tx
                .select({ publicRef: emergencyReports.publicRef })
                .from(emergencyReports)
                .where(
                  and(
                    eq(emergencyReports.tenantId, tenantId),
                    eq(emergencyReports.id, row.reportId)
                  )
                )
                .limit(1)
            : [];
          const publicRef =
            report?.publicRef ??
            `CASE-${row.id.replaceAll("-", "").slice(0, 19)}`;
          projection = projectFederatedCase(
            {
              publicRef,
              status: row.status,
              hazardCategory:
                typeof triage.hazardCategory === "string"
                  ? triage.hazardCategory
                  : "unknown",
              severity:
                typeof triage.severity === "string"
                  ? triage.severity
                  : "unknown",
            },
            now.toISOString()
          );
        } else {
          const [row] = await tx
            .select()
            .from(emergencySituations)
            .where(
              and(
                eq(emergencySituations.tenantId, tenantId),
                eq(emergencySituations.id, parsed.data.resourceRef)
              )
            )
            .limit(1);
          if (!row) return { id: "", state: "resource_not_found" as const };
          // Situations currently have no authoritative jurisdiction field. Do not infer it from an operator-supplied request.
          return {
            id: "",
            state: "jurisdiction_authority_unavailable" as const,
          };
        }
        const id = randomUUID();
        await tx.insert(emergencyFederationShares).values({
          id,
          tenantId,
          partnerId: partner.id,
          sourceTenantId: tenantId,
          sourceResourceType: parsed.data.resourceType,
          sourceResourceRef: parsed.data.resourceRef,
          projectionJson: projection,
          jurisdictionRef: parsed.data.jurisdictionRef,
          expiresAt,
          createdAt: now,
        });
        const after = {
          partnerId: partner.id,
          resourceType: parsed.data.resourceType,
          resourceRef: parsed.data.resourceRef,
          state: "queued_not_delivered",
          requestFingerprint: fingerprint,
        };
        const audit = {
          tenantId,
          subjectType: "federation_share",
          subjectId: id,
          actorType: "user",
          actorRef: String(user!.id),
          eventType: "federation_share_queued",
          reason: parsed.data.reason,
          after,
          createdAt: now.toISOString(),
        };
        await tx.insert(emergencyAuditEvents).values({
          ...audit,
          eventIdempotencyKey: eventKey,
          eventHash: auditHash(audit),
          afterJson: after,
          createdAt: now,
        });
        return { id, state: "created" as const };
      });
      return outcome.state === "partner_unavailable"
        ? reply(res, 409, { error: "ACTIVE_VERIFIED_PARTNER_REQUIRED" })
        : outcome.state === "jurisdiction_mismatch"
          ? reply(res, 403, { error: "FEDERATION_JURISDICTION_MISMATCH" })
          : outcome.state === "jurisdiction_authority_unavailable"
            ? reply(res, 409, {
                error: "FEDERATION_RESOURCE_JURISDICTION_UNAVAILABLE",
              })
            : outcome.state === "resource_not_found"
              ? reply(res, 404, { error: "FEDERATION_RESOURCE_NOT_FOUND" })
              : outcome.state === "idempotency_reused"
                ? reply(res, 409, { error: "IDEMPOTENCY_KEY_REUSED" })
                : reply(res, outcome.state === "created" ? 201 : 200, {
                    shareId: outcome.id,
                    deliveryState: "queued_not_delivered",
                    duplicate: outcome.state === "duplicate",
                  });
    }
    case "operations.federation.share.revoke": {
      const key = req.header("idempotency-key")?.trim();
      if (!key || key.length < 8 || key.length > 160)
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      const eventKey = `federation-share:revoke:${params.shareId}:${sha256(key)}`;
      const reason =
        typeof safeRecord(req.body).reason === "string"
          ? String(safeRecord(req.body).reason).trim()
          : "";
      if (reason.length < 8 || reason.length > 500)
        return reply(res, 400, { error: "REVOCATION_REASON_REQUIRED" });
      const now = new Date();
      const outcome = await getDb().transaction(async tx => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${eventKey}`}, 0))`
        );
        const [prior] = await tx
          .select({ id: emergencyAuditEvents.id })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.eventIdempotencyKey, eventKey)
            )
          )
          .limit(1);
        if (prior) return "duplicate" as const;
        const [share] = await tx
          .select()
          .from(emergencyFederationShares)
          .where(
            and(
              eq(emergencyFederationShares.tenantId, tenantId),
              eq(emergencyFederationShares.id, params.shareId)
            )
          )
          .for("update")
          .limit(1);
        if (!share) return "not_found" as const;
        if (share.revokedAt) return "duplicate" as const;
        await tx
          .update(emergencyFederationShares)
          .set({ revokedAt: now })
          .where(
            and(
              eq(emergencyFederationShares.tenantId, tenantId),
              eq(emergencyFederationShares.id, share.id),
              isNull(emergencyFederationShares.revokedAt)
            )
          );
        const before = { revokedAt: null };
        const after = { revokedAt: now.toISOString() };
        const audit = {
          tenantId,
          subjectType: "federation_share",
          subjectId: share.id,
          actorType: "user",
          actorRef: String(user!.id),
          eventType: "federation_share_revoked",
          reason,
          before,
          after,
          createdAt: now.toISOString(),
        };
        await tx.insert(emergencyAuditEvents).values({
          ...audit,
          eventIdempotencyKey: eventKey,
          eventHash: auditHash(audit),
          beforeJson: before,
          afterJson: after,
          createdAt: now,
        });
        return "revoked" as const;
      });
      return outcome === "not_found"
        ? reply(res, 404, { error: "FEDERATION_SHARE_NOT_FOUND" })
        : reply(res, 200, {
            revoked: outcome === "revoked",
            duplicate: outcome === "duplicate",
          });
    }
    case "operations.intel.source.create": {
      const parsed = intelSourceCreateSchema.safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "INVALID_INTELLIGENCE_SOURCE" });
      if (
        user!.role === "domain_admin" &&
        parsed.data.dataClassification !== "general"
      )
        return reply(res, 403, {
          error: "DOMAIN_ADMIN_GENERAL_DATA_ONLY",
          message: "Domain admins may register only general data sources.",
        });
      if (
        parsed.data.canonicalOrigin &&
        new URL(parsed.data.canonicalOrigin).protocol !== "https:"
      )
        return reply(res, 400, { error: "INTELLIGENCE_SOURCE_HTTPS_REQUIRED" });
      const key = req.header("idempotency-key")?.trim();
      if (!key || key.length < 8 || key.length > 160)
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      const eventKey = `intel-source:create:${sha256(key)}`;
      const fingerprint = requestFingerprint(parsed.data);
      const now = new Date();
      const outcome = await getDb().transaction(async tx => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${eventKey}`}, 0))`
        );
        const [prior] = await tx
          .select({
            subjectId: emergencyAuditEvents.subjectId,
            afterJson: emergencyAuditEvents.afterJson,
          })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.eventIdempotencyKey, eventKey)
            )
          )
          .limit(1);
        if (prior)
          return {
            id: prior.subjectId,
            duplicate: true,
            reused:
              safeRecord(prior.afterJson).requestFingerprint !== fingerprint,
          };
        const id = randomUUID();
        const { dataClassification, ...sourceInput } = parsed.data;
        const [source] = await tx
          .insert(emergencyIntelSources)
          .values({
            id,
            tenantId,
            ...sourceInput,
            policyJson: {
              dataClassification: dataClassification ?? "unclassified",
            },
            status: "pending_review",
            createdByUserId: user!.id,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing()
          .returning({ id: emergencyIntelSources.id });
        if (!source) return null;
        const after = {
          sourceRef: parsed.data.sourceRef,
          sourceType: parsed.data.sourceType,
          status: "pending_review",
          requestFingerprint: fingerprint,
        };
        const audit = {
          tenantId,
          subjectType: "intel_source",
          subjectId: id,
          actorType: "user",
          actorRef: String(user!.id),
          eventType: "intel_source_registered",
          reason:
            "Source registered for review; registration does not authorize network retrieval",
          after,
          createdAt: now.toISOString(),
        };
        await tx.insert(emergencyAuditEvents).values({
          ...audit,
          eventIdempotencyKey: eventKey,
          eventHash: auditHash(audit),
          afterJson: after,
          createdAt: now,
        });
        return { id, duplicate: false, reused: false };
      });
      return outcome
        ? outcome.reused
          ? reply(res, 409, { error: "IDEMPOTENCY_KEY_REUSED" })
          : reply(res, outcome.duplicate ? 200 : 201, {
              sourceId: outcome.id,
              status: "pending_review",
              duplicate: outcome.duplicate,
            })
        : reply(res, 409, { error: "INTELLIGENCE_SOURCE_REF_CONFLICT" });
    }
    case "operations.intel.source.review": {
      if (
        !isAdminIntelligenceRegistryRoute(route.id, user!.role) &&
        !(await hasCapability(tenantId, user!.id, "emergency.verify"))
      )
        return reply(res, 403, {
          error: "EMERGENCY_VERIFICATION_CAPABILITY_REQUIRED",
        });
      const parsed = intelSourceReviewSchema.safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "INVALID_INTELLIGENCE_SOURCE_REVIEW" });
      const key = req.header("idempotency-key")?.trim();
      if (!key || key.length < 8 || key.length > 160)
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      const eventKey = `intel-source-review:${params.sourceId}:${sha256(key)}`;
      const fingerprint = requestFingerprint(parsed.data);
      const now = new Date();
      const outcome = await getDb().transaction(async tx => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${eventKey}`}, 0))`
        );
        const [prior] = await tx
          .select({ afterJson: emergencyAuditEvents.afterJson })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.eventIdempotencyKey, eventKey)
            )
          )
          .limit(1);
        if (prior)
          return safeRecord(prior.afterJson).requestFingerprint === fingerprint
            ? ("duplicate" as const)
            : ("idempotency_reused" as const);
        const [source] = await tx
          .select()
          .from(emergencyIntelSources)
          .where(
            and(
              eq(emergencyIntelSources.tenantId, tenantId),
              eq(emergencyIntelSources.id, params.sourceId)
            )
          )
          .for("update")
          .limit(1);
        if (!source) return "not_found" as const;
        if (
          user!.role === "domain_admin" &&
          !canDomainAdminReviewIntelligenceSource(
            user!.role,
            safeRecord(source.policyJson).dataClassification
          )
        )
          return "classification" as const;
        const transitions: Record<string, string[]> = {
          pending_review: ["active", "revoked"],
          active: ["paused", "revoked"],
          paused: ["active", "revoked"],
        };
        if (!transitions[source.status]?.includes(parsed.data.status))
          return "transition" as const;
        await tx
          .update(emergencyIntelSources)
          .set({ status: parsed.data.status, updatedAt: now })
          .where(
            and(
              eq(emergencyIntelSources.tenantId, tenantId),
              eq(emergencyIntelSources.id, source.id),
              eq(emergencyIntelSources.status, source.status)
            )
          );
        const before = { status: source.status };
        const after = {
          status: parsed.data.status,
          requestFingerprint: fingerprint,
        };
        const audit = {
          tenantId,
          subjectType: "intel_source",
          subjectId: source.id,
          actorType: "user",
          actorRef: String(user!.id),
          eventType: "intel_source_reviewed",
          reason: parsed.data.reason,
          before,
          after,
          createdAt: now.toISOString(),
        };
        await tx.insert(emergencyAuditEvents).values({
          ...audit,
          eventIdempotencyKey: eventKey,
          eventHash: auditHash(audit),
          beforeJson: before,
          afterJson: after,
          createdAt: now,
        });
        return "updated" as const;
      });
      return outcome === "not_found"
        ? reply(res, 404, { error: "INTELLIGENCE_SOURCE_NOT_FOUND" })
        : outcome === "classification"
          ? reply(res, 403, {
              error: "DOMAIN_ADMIN_GENERAL_DATA_ONLY",
              message:
                "Domain admins can approve only sources classified as general by a platform admin.",
            })
          : outcome === "transition"
            ? reply(res, 409, {
                error: "INTELLIGENCE_SOURCE_TRANSITION_INVALID",
              })
            : outcome === "idempotency_reused"
              ? reply(res, 409, { error: "IDEMPOTENCY_KEY_REUSED" })
              : reply(res, 200, {
                  updated: outcome === "updated",
                  duplicate: outcome === "duplicate",
                });
    }
    case "operations.intel.capture.create": {
      const parsed = intelCaptureCreateSchema.safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "INVALID_INTELLIGENCE_CAPTURE" });
      const [source] = await getDb()
        .select()
        .from(emergencyIntelSources)
        .where(
          and(
            eq(emergencyIntelSources.tenantId, tenantId),
            eq(emergencyIntelSources.id, parsed.data.sourceId),
            eq(emergencyIntelSources.status, "active")
          )
        )
        .limit(1);
      if (!source)
        return reply(res, 404, {
          error: "ACTIVE_INTELLIGENCE_SOURCE_NOT_FOUND",
        });
      const key = req.header("idempotency-key")?.trim();
      if (!key || key.length < 8 || key.length > 160)
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      const excerpt = parsed.data.excerpt.normalize("NFC");
      const contentHash = sha256(excerpt);
      const objectRef = `emergency-intelligence/${tenantId}/${source.id}/${contentHash}.txt`;
      try {
        await assertR2StorageActive();
        await storagePut(
          objectRef,
          Buffer.from(excerpt, "utf8"),
          "application/octet-stream"
        );
      } catch {
        return reply(res, 503, { error: "INTELLIGENCE_ARCHIVE_UNAVAILABLE" });
      }
      const now = new Date();
      const eventKey = `intel-capture:create:${sha256(key)}`;
      const fingerprint = requestFingerprint({
        sourceId: source.id,
        sourceItemRef: parsed.data.sourceItemRef,
        contentHash,
        observedAt: parsed.data.observedAt ?? null,
      });
      const result = await getDb().transaction(async tx => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${eventKey}`}, 0))`
        );
        const [prior] = await tx
          .select({
            subjectId: emergencyAuditEvents.subjectId,
            afterJson: emergencyAuditEvents.afterJson,
          })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.eventIdempotencyKey, eventKey)
            )
          )
          .limit(1);
        if (prior)
          return {
            id: prior.subjectId,
            duplicate: true,
            reused:
              safeRecord(prior.afterJson).requestFingerprint !== fingerprint,
          };
        const [capture] = await tx
          .insert(emergencyIntelCaptures)
          .values({
            tenantId,
            sourceId: source.id,
            sourceItemRef: parsed.data.sourceItemRef,
            contentHash,
            objectRef,
            mediaType: "text/plain; charset=utf-8",
            byteLength: Buffer.byteLength(excerpt, "utf8"),
            observedAt: parsed.data.observedAt
              ? new Date(parsed.data.observedAt)
              : null,
            capturedAt: now,
            provenanceJson: {
              excerpt,
              sourceRef: source.sourceRef,
              independenceGroup: source.independenceGroup,
              captureMethod: "operator-entered",
            },
          })
          .onConflictDoNothing()
          .returning({ id: emergencyIntelCaptures.id });
        if (!capture) return null;
        const audit = {
          tenantId,
          subjectType: "intel_capture",
          subjectId: capture.id,
          actorType: "user",
          actorRef: String(user!.id),
          eventType: "intel_capture_recorded",
          reason: "Bounded source excerpt recorded as immutable provenance",
          after: {
            sourceId: source.id,
            contentHash,
            requestFingerprint: fingerprint,
          },
          createdAt: now.toISOString(),
        };
        await tx.insert(emergencyAuditEvents).values({
          ...audit,
          eventIdempotencyKey: eventKey,
          eventHash: auditHash(audit),
          afterJson: audit.after,
          createdAt: now,
        });
        return { id: capture.id, duplicate: false, reused: false };
      });
      return result
        ? result.reused
          ? reply(res, 409, { error: "IDEMPOTENCY_KEY_REUSED" })
          : reply(res, result.duplicate ? 200 : 201, {
              captureId: result.id,
              duplicate: result.duplicate,
            })
        : reply(res, 409, { error: "INTELLIGENCE_CAPTURE_ALREADY_RECORDED" });
    }
    case "operations.intel.captures": {
      const rows = await getDb()
        .select({
          id: emergencyIntelCaptures.id,
          sourceId: emergencyIntelCaptures.sourceId,
          sourceItemRef: emergencyIntelCaptures.sourceItemRef,
          contentHash: emergencyIntelCaptures.contentHash,
          capturedAt: emergencyIntelCaptures.capturedAt,
          sourceName: emergencyIntelSources.displayName,
        })
        .from(emergencyIntelCaptures)
        .innerJoin(
          emergencyIntelSources,
          and(
            eq(emergencyIntelSources.id, emergencyIntelCaptures.sourceId),
            eq(emergencyIntelSources.tenantId, emergencyIntelCaptures.tenantId)
          )
        )
        .where(eq(emergencyIntelCaptures.tenantId, tenantId))
        .orderBy(desc(emergencyIntelCaptures.capturedAt))
        .limit(200);
      return reply(res, 200, {
        items: rows.map(row => ({
          id: row.id,
          sourceId: row.sourceId,
          sourceName: row.sourceName,
          sourceItemRef: row.sourceItemRef,
          contentHash: row.contentHash,
          capturedAt: row.capturedAt.toISOString(),
        })),
      });
    }
    case "operations.intel.claims": {
      const rows = await getDb()
        .select()
        .from(emergencyIntelClaims)
        .where(eq(emergencyIntelClaims.tenantId, tenantId))
        .orderBy(desc(emergencyIntelClaims.updatedAt))
        .limit(200);
      const items = await Promise.all(
        rows.map(async row => {
          const evidence = await getDb()
            .select({
              excerpt: emergencyIntelCaptures.provenanceJson,
              sourceItemRef: emergencyIntelCaptures.sourceItemRef,
              sourceName: emergencyIntelSources.displayName,
              independenceGroup: emergencyIntelSources.independenceGroup,
              contentHash: emergencyIntelCaptures.contentHash,
            })
            .from(emergencyIntelClaimSources)
            .innerJoin(
              emergencyIntelCaptures,
              and(
                eq(
                  emergencyIntelCaptures.id,
                  emergencyIntelClaimSources.captureId
                ),
                eq(
                  emergencyIntelCaptures.tenantId,
                  emergencyIntelClaimSources.tenantId
                )
              )
            )
            .innerJoin(
              emergencyIntelSources,
              and(
                eq(emergencyIntelSources.id, emergencyIntelCaptures.sourceId),
                eq(
                  emergencyIntelSources.tenantId,
                  emergencyIntelCaptures.tenantId
                )
              )
            )
            .where(
              and(
                eq(emergencyIntelClaimSources.tenantId, tenantId),
                eq(emergencyIntelClaimSources.claimId, row.id)
              )
            );
          return {
            id: row.id,
            claimRef: row.claimRef,
            claimText: row.claimText,
            status: row.status,
            confidence: row.confidence,
            independenceGroupCount: row.independenceGroupCount,
            revision: row.revision,
            situationId: row.situationId,
            updatedAt: row.updatedAt.toISOString(),
            evidence: evidence.map(item => ({
              excerpt:
                typeof safeRecord(item.excerpt).excerpt === "string"
                  ? (safeRecord(item.excerpt).excerpt as string).slice(0, 10000)
                  : "",
              sourceItemRef: item.sourceItemRef,
              sourceName: item.sourceName,
              independenceGroup: item.independenceGroup,
              contentHash: item.contentHash,
            })),
          };
        })
      );
      return reply(res, 200, { items });
    }
    case "operations.intel.claim.create": {
      const parsed = intelClaimCreateSchema.safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "INVALID_INTELLIGENCE_CLAIM" });
      const key = req.header("idempotency-key")?.trim();
      if (!key || key.length < 8 || key.length > 160)
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      if (parsed.data.situationId) {
        const [situation] = await getDb()
          .select({ id: emergencySituations.id })
          .from(emergencySituations)
          .where(
            and(
              eq(emergencySituations.tenantId, tenantId),
              eq(emergencySituations.id, parsed.data.situationId)
            )
          )
          .limit(1);
        if (!situation)
          return reply(res, 404, { error: "SITUATION_NOT_FOUND" });
      }
      const eventKey = `intel-claim:create:${sha256(key)}`;
      const fingerprint = requestFingerprint(parsed.data);
      const now = new Date();
      const outcome = await getDb().transaction(async tx => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${eventKey}`}, 0))`
        );
        const [prior] = await tx
          .select({
            subjectId: emergencyAuditEvents.subjectId,
            afterJson: emergencyAuditEvents.afterJson,
          })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.eventIdempotencyKey, eventKey)
            )
          )
          .limit(1);
        if (prior)
          return {
            id: prior.subjectId,
            duplicate: true,
            reused:
              safeRecord(prior.afterJson).requestFingerprint !== fingerprint,
          };
        const captures = await tx
          .select({
            captureId: emergencyIntelCaptures.id,
            sourceId: emergencyIntelCaptures.sourceId,
            sourceStatus: emergencyIntelSources.status,
            independenceGroup: emergencyIntelSources.independenceGroup,
          })
          .from(emergencyIntelCaptures)
          .innerJoin(
            emergencyIntelSources,
            and(
              eq(emergencyIntelSources.id, emergencyIntelCaptures.sourceId),
              eq(
                emergencyIntelSources.tenantId,
                emergencyIntelCaptures.tenantId
              )
            )
          )
          .where(
            and(
              eq(emergencyIntelCaptures.tenantId, tenantId),
              inArray(emergencyIntelCaptures.id, parsed.data.captureIds)
            )
          );
        if (
          captures.length !== new Set(parsed.data.captureIds).size ||
          captures.some(item => item.sourceStatus !== "active")
        )
          return null;
        let correctedClaim:
          | typeof emergencyIntelClaims.$inferSelect
          | undefined;
        if (parsed.data.correctionOfClaimId) {
          [correctedClaim] = await tx
            .select()
            .from(emergencyIntelClaims)
            .where(
              and(
                eq(emergencyIntelClaims.tenantId, tenantId),
                eq(emergencyIntelClaims.id, parsed.data.correctionOfClaimId)
              )
            )
            .for("update")
            .limit(1);
          if (
            !correctedClaim ||
            !["verified", "disputed"].includes(correctedClaim.status)
          )
            return null;
        }
        const id = randomUUID();
        const claimRef = `IC-${id.replace(/-/g, "").slice(0, 16).toUpperCase()}`;
        const groups = [
          ...new Set(captures.map(item => item.independenceGroup)),
        ];
        await tx.insert(emergencyIntelClaims).values({
          id,
          tenantId,
          claimRef,
          situationId: parsed.data.situationId,
          claimText: parsed.data.claimText,
          status: "unreviewed",
          independenceGroupCount: groups.length,
          correctionOfClaimId: correctedClaim?.id ?? null,
          createdAt: now,
          updatedAt: now,
        });
        await tx.insert(emergencyIntelClaimSources).values(
          captures.map(item => ({
            tenantId,
            claimId: id,
            captureId: item.captureId,
            independenceGroup: item.independenceGroup,
            sourceRole: "supports" as const,
            createdAt: now,
          }))
        );
        const after = {
          claimRef,
          sourceCount: captures.length,
          independenceGroupCount: groups.length,
          requestFingerprint: fingerprint,
        };
        const audit = {
          tenantId,
          subjectType: "intel_claim",
          subjectId: id,
          actorType: "user",
          actorRef: String(user!.id),
          eventType: "intel_claim_created",
          reason: "Claim entered unreviewed with source lineage",
          after,
          createdAt: now.toISOString(),
        };
        await tx.insert(emergencyAuditEvents).values({
          ...audit,
          eventIdempotencyKey: eventKey,
          eventHash: auditHash(audit),
          afterJson: after,
          createdAt: now,
        });
        return { id, claimRef, duplicate: false, reused: false };
      });
      return outcome
        ? outcome.reused
          ? reply(res, 409, { error: "IDEMPOTENCY_KEY_REUSED" })
          : reply(res, outcome.duplicate ? 200 : 201, outcome)
        : reply(res, 422, { error: "ACTIVE_SOURCE_CAPTURE_REQUIRED" });
    }
    case "operations.intel.claim.review": {
      const parsed = intelClaimReviewSchema.safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "INVALID_INTELLIGENCE_CLAIM_REVIEW" });
      const key = req.header("idempotency-key")?.trim();
      if (!key || key.length < 8 || key.length > 160)
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      const [existing] = await getDb()
        .select()
        .from(emergencyIntelClaims)
        .where(
          and(
            eq(emergencyIntelClaims.tenantId, tenantId),
            eq(emergencyIntelClaims.id, params.claimId)
          )
        )
        .limit(1);
      if (!existing)
        return reply(res, 404, { error: "INTELLIGENCE_CLAIM_NOT_FOUND" });
      if (
        parsed.data.status !== "under_review" &&
        !(await hasCapability(tenantId, user!.id, "emergency.verify"))
      )
        return reply(res, 403, {
          error: "EMERGENCY_VERIFICATION_CAPABILITY_REQUIRED",
        });
      const now = new Date();
      const eventKey = `intel-claim:review:${existing.id}:${sha256(key)}`;
      const fingerprint = requestFingerprint(parsed.data);
      const outcome = await getDb().transaction(async tx => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${eventKey}`}, 0))`
        );
        const [row] = await tx
          .select()
          .from(emergencyIntelClaims)
          .where(
            and(
              eq(emergencyIntelClaims.tenantId, tenantId),
              eq(emergencyIntelClaims.id, existing.id)
            )
          )
          .for("update")
          .limit(1);
        if (!row) return "not_found" as const;
        const [prior] = await tx
          .select({ afterJson: emergencyAuditEvents.afterJson })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.eventIdempotencyKey, eventKey)
            )
          )
          .limit(1);
        if (prior)
          return safeRecord(prior.afterJson).requestFingerprint === fingerprint
            ? ("duplicate" as const)
            : ("idempotency_reused" as const);
        if (row.revision !== parsed.data.expectedRevision)
          return "conflict" as const;
        if (row.status === "retracted" || row.status === "superseded")
          return "terminal" as const;
        if (!canTransitionEmergencyIntelClaim(row.status, parsed.data.status))
          return "transition" as const;
        const activeSources = await tx
          .select({
            independenceGroup: emergencyIntelSources.independenceGroup,
          })
          .from(emergencyIntelClaimSources)
          .innerJoin(
            emergencyIntelCaptures,
            and(
              eq(
                emergencyIntelCaptures.id,
                emergencyIntelClaimSources.captureId
              ),
              eq(
                emergencyIntelCaptures.tenantId,
                emergencyIntelClaimSources.tenantId
              )
            )
          )
          .innerJoin(
            emergencyIntelSources,
            and(
              eq(emergencyIntelSources.id, emergencyIntelCaptures.sourceId),
              eq(
                emergencyIntelSources.tenantId,
                emergencyIntelCaptures.tenantId
              )
            )
          )
          .where(
            and(
              eq(emergencyIntelClaimSources.tenantId, tenantId),
              eq(emergencyIntelClaimSources.claimId, row.id),
              eq(emergencyIntelSources.status, "active")
            )
          );
        const activeGroupCount = countIndependentEmergencyIntelSources(
          activeSources.map(source => source.independenceGroup)
        );
        if (parsed.data.status === "verified" && activeGroupCount < 2)
          return "independent_sources_required" as const;
        let correctionParent:
          | typeof emergencyIntelClaims.$inferSelect
          | undefined;
        if (parsed.data.status === "verified" && row.correctionOfClaimId) {
          [correctionParent] = await tx
            .select()
            .from(emergencyIntelClaims)
            .where(
              and(
                eq(emergencyIntelClaims.tenantId, tenantId),
                eq(emergencyIntelClaims.id, row.correctionOfClaimId)
              )
            )
            .for("update")
            .limit(1);
          if (
            !correctionParent ||
            !["verified", "disputed"].includes(correctionParent.status)
          )
            return "correction_parent_changed" as const;
        }
        const revision = row.revision + 1;
        const publicProjectionJson =
          parsed.data.status === "verified"
            ? {
                summary: parsed.data.publicSummary,
                sourceGroupCount: activeGroupCount,
              }
            : row.publicProjectionJson;
        const [updated] = await tx
          .update(emergencyIntelClaims)
          .set({
            status: parsed.data.status,
            revision,
            publicProjectionJson,
            reviewedByUserId: user!.id,
            reviewedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(emergencyIntelClaims.tenantId, tenantId),
              eq(emergencyIntelClaims.id, row.id),
              eq(emergencyIntelClaims.revision, row.revision)
            )
          )
          .returning({ id: emergencyIntelClaims.id });
        if (!updated) return "conflict" as const;
        const before = { status: row.status, revision: row.revision };
        const after = {
          status: parsed.data.status,
          revision,
          publicProjectionJson,
          independenceGroupCount: activeGroupCount,
          requestFingerprint: fingerprint,
        };
        await tx
          .update(emergencyIntelClaims)
          .set({ independenceGroupCount: activeGroupCount })
          .where(
            and(
              eq(emergencyIntelClaims.tenantId, tenantId),
              eq(emergencyIntelClaims.id, row.id)
            )
          );
        const audit = {
          tenantId,
          subjectType: "intel_claim",
          subjectId: row.id,
          actorType: "user",
          actorRef: String(user!.id),
          eventType: `intel_claim_${parsed.data.status}`,
          reason: parsed.data.reason,
          before,
          after,
          createdAt: now.toISOString(),
        };
        await tx.insert(emergencyAuditEvents).values({
          ...audit,
          eventIdempotencyKey: eventKey,
          eventHash: auditHash(audit),
          beforeJson: before,
          afterJson: after,
          createdAt: now,
        });
        if (correctionParent) {
          const parentRevision = correctionParent.revision + 1;
          await tx
            .update(emergencyIntelClaims)
            .set({
              status: "superseded",
              revision: parentRevision,
              updatedAt: now,
            })
            .where(
              and(
                eq(emergencyIntelClaims.tenantId, tenantId),
                eq(emergencyIntelClaims.id, correctionParent.id),
                eq(emergencyIntelClaims.revision, correctionParent.revision)
              )
            );
          const parentBefore = {
            status: correctionParent.status,
            revision: correctionParent.revision,
          };
          const parentAfter = {
            status: "superseded",
            revision: parentRevision,
            replacementClaimId: row.id,
          };
          const parentAudit = {
            tenantId,
            subjectType: "intel_claim",
            subjectId: correctionParent.id,
            actorType: "user",
            actorRef: String(user!.id),
            eventType: "intel_claim_superseded",
            reason: "A verified source-linked correction replaced this claim",
            before: parentBefore,
            after: parentAfter,
            createdAt: now.toISOString(),
          };
          await tx.insert(emergencyAuditEvents).values({
            ...parentAudit,
            eventIdempotencyKey: `${eventKey}:parent`,
            eventHash: auditHash(parentAudit),
            beforeJson: parentBefore,
            afterJson: parentAfter,
            createdAt: now,
          });
        }
        return "updated" as const;
      });
      return outcome === "not_found"
        ? reply(res, 404, { error: "INTELLIGENCE_CLAIM_NOT_FOUND" })
        : outcome === "conflict"
          ? reply(res, 409, { error: "INTELLIGENCE_CLAIM_REVISION_CONFLICT" })
          : outcome === "terminal"
            ? reply(res, 409, { error: "INTELLIGENCE_CLAIM_TERMINAL" })
            : outcome === "transition"
              ? reply(res, 409, {
                  error: "INTELLIGENCE_CLAIM_TRANSITION_INVALID",
                })
              : outcome === "independent_sources_required"
                ? reply(res, 422, {
                    error: "INDEPENDENT_SOURCE_GROUPS_REQUIRED",
                  })
                : outcome === "correction_parent_changed"
                  ? reply(res, 409, {
                      error: "INTELLIGENCE_CORRECTION_PARENT_CHANGED",
                    })
                  : outcome === "idempotency_reused"
                    ? reply(res, 409, { error: "IDEMPOTENCY_KEY_REUSED" })
                    : reply(res, 200, {
                        updated: outcome === "updated",
                        duplicate: outcome === "duplicate",
                      });
    }
    case "public.report.evidence.create": {
      if (!requireSameOriginForWrite(req))
        return reply(res, 403, { error: "ORIGIN_REJECTED" });
      const token = req.header("x-emergency-case-token")?.trim();
      if (!token || token.length > 256)
        return reply(res, 401, { error: "CASE_CONTINUATION_REQUIRED" });
      const parsed = emergencyEvidenceSchema.safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "INVALID_EVIDENCE_METADATA" });
      const key = req.header("idempotency-key")?.trim();
      if (!key || key.length < 8 || key.length > 160)
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      const [access] = await getDb()
        .select({
          caseId: emergencyReportAccessTokens.caseId,
          reportId: emergencyReportAccessTokens.reportId,
        })
        .from(emergencyReportAccessTokens)
        .innerJoin(
          emergencyReports,
          and(
            eq(emergencyReports.id, emergencyReportAccessTokens.reportId),
            eq(emergencyReports.tenantId, emergencyReportAccessTokens.tenantId)
          )
        )
        .where(
          and(
            eq(emergencyReportAccessTokens.tenantId, scopedTenant.id),
            eq(emergencyReports.publicRef, params.reportRef),
            eq(emergencyReportAccessTokens.tokenHash, sha256(token)),
            isNull(emergencyReportAccessTokens.revokedAt),
            sql`${emergencyReportAccessTokens.expiresAt} > now()`
          )
        )
        .limit(1);
      if (!access) return reply(res, 404, { error: "REPORT_NOT_FOUND" });
      const ip =
        req.header("x-spec260-client-ip") ||
        req.ip ||
        req.socket.remoteAddress ||
        "unknown";
      const rate = await consumeSlidingWindow(
        "emergency-evidence-init",
        `${scopedTenant.id}:${access.reportId}:${ip}`,
        5,
        3600
      );
      if (!rate.allowed) {
        res.setHeader("Retry-After", String(rate.retryAfterSeconds ?? 3600));
        return reply(res, 429, { error: "EVIDENCE_UPLOAD_RATE_LIMITED" });
      }
      try {
        const result = await createEmergencyEvidenceUpload({
          tenantId: scopedTenant.id,
          caseId: access.caseId,
          reportId: access.reportId,
          actorRef: "anonymous_reporter",
          visibility: "restricted",
          requestKey: key,
          file: parsed.data,
        });
        return result === "idempotency_reused"
          ? reply(res, 409, { error: "IDEMPOTENCY_KEY_REUSED" })
          : result === "not_found"
            ? reply(res, 404, { error: "EVIDENCE_NOT_FOUND" })
            : result === "quota"
              ? reply(res, 429, { error: "CASE_EVIDENCE_QUOTA_EXCEEDED" })
              : result === "storage_cleanup"
                ? reply(res, 503, { error: "EVIDENCE_STAGING_CLEANUP_PENDING" })
                : reply(res, result.uploaded ? 200 : 201, result);
      } catch {
        return reply(res, 503, {
          error: "EMERGENCY_EVIDENCE_STORAGE_UNAVAILABLE",
        });
      }
    }
    case "public.report.evidence.complete": {
      if (!requireSameOriginForWrite(req))
        return reply(res, 403, { error: "ORIGIN_REJECTED" });
      const token = req.header("x-emergency-case-token")?.trim();
      const key = req.header("idempotency-key")?.trim();
      if (!token || token.length > 256)
        return reply(res, 401, { error: "CASE_CONTINUATION_REQUIRED" });
      if (!key || key.length < 8 || key.length > 160)
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      const [access] = await getDb()
        .select({
          caseId: emergencyReportAccessTokens.caseId,
          reportId: emergencyReportAccessTokens.reportId,
        })
        .from(emergencyReportAccessTokens)
        .innerJoin(
          emergencyReports,
          and(
            eq(emergencyReports.id, emergencyReportAccessTokens.reportId),
            eq(emergencyReports.tenantId, emergencyReportAccessTokens.tenantId)
          )
        )
        .where(
          and(
            eq(emergencyReportAccessTokens.tenantId, scopedTenant.id),
            eq(emergencyReports.publicRef, params.reportRef),
            eq(emergencyReportAccessTokens.tokenHash, sha256(token)),
            isNull(emergencyReportAccessTokens.revokedAt),
            sql`${emergencyReportAccessTokens.expiresAt} > now()`
          )
        )
        .limit(1);
      if (!access) return reply(res, 404, { error: "REPORT_NOT_FOUND" });
      const [asset] = await getDb()
        .select({ id: emergencyEvidenceAssets.id })
        .from(emergencyEvidenceAssets)
        .where(
          and(
            eq(emergencyEvidenceAssets.tenantId, scopedTenant.id),
            eq(emergencyEvidenceAssets.id, params.evidenceId),
            eq(emergencyEvidenceAssets.caseId, access.caseId),
            eq(emergencyEvidenceAssets.reportId, access.reportId)
          )
        )
        .limit(1);
      if (!asset) return reply(res, 404, { error: "EVIDENCE_NOT_FOUND" });
      const ip =
        req.header("x-spec260-client-ip") ||
        req.ip ||
        req.socket.remoteAddress ||
        "unknown";
      const rate = await consumeSlidingWindow(
        "emergency-evidence-complete",
        `${scopedTenant.id}:${access.reportId}:${ip}`,
        3,
        60
      );
      if (!rate.allowed) {
        res.setHeader("Retry-After", String(rate.retryAfterSeconds ?? 60));
        return reply(res, 429, { error: "EVIDENCE_COMPLETE_RATE_LIMITED" });
      }
      const result = await completeEmergencyEvidence(
        scopedTenant.id,
        asset.id,
        "anonymous_reporter",
        key
      ).catch(() => "unavailable" as const);
      return result === "not_found"
        ? reply(res, 404, { error: "EVIDENCE_NOT_FOUND" })
        : result === "metadata_mismatch" || result === "checksum_mismatch"
          ? reply(res, 422, { error: `EVIDENCE_${result.toUpperCase()}` })
          : result === "expired"
            ? reply(res, 410, { error: "EVIDENCE_UPLOAD_EXPIRED" })
            : result === "busy"
              ? reply(res, 409, { error: "EVIDENCE_VERIFICATION_IN_PROGRESS" })
              : result === "unavailable"
                ? reply(res, 503, {
                    error: "EMERGENCY_EVIDENCE_STORAGE_UNAVAILABLE",
                  })
                : reply(res, 200, {
                    completed: result === "completed",
                    duplicate: result === "duplicate",
                  });
    }
    case "public.report.claim": {
      const token = req.header("x-emergency-case-token")?.trim();
      if (!token || token.length > 256)
        return reply(res, 401, { error: "CASE_CONTINUATION_REQUIRED" });
      const claimant = await identityForRequest(req);
      if (!claimant)
        return reply(res, 401, { error: "AUTHENTICATION_REQUIRED_TO_CLAIM" });
      if (claimant.currentTenantId !== scopedTenant.id)
        return reply(res, 403, { error: "TENANT_SCOPE_MISMATCH" });
      const [access] = await getDb()
        .select({
          id: emergencyReportAccessTokens.id,
          caseId: emergencyReportAccessTokens.caseId,
          reportId: emergencyReportAccessTokens.reportId,
          revokedAt: emergencyReportAccessTokens.revokedAt,
          expiresAt: emergencyReportAccessTokens.expiresAt,
          reporterUserId: emergencyCases.reporterUserId,
        })
        .from(emergencyReportAccessTokens)
        .innerJoin(
          emergencyReports,
          and(
            eq(emergencyReports.id, emergencyReportAccessTokens.reportId),
            eq(emergencyReports.tenantId, emergencyReportAccessTokens.tenantId)
          )
        )
        .innerJoin(
          emergencyCases,
          and(
            eq(emergencyCases.id, emergencyReportAccessTokens.caseId),
            eq(emergencyCases.tenantId, emergencyReportAccessTokens.tenantId)
          )
        )
        .where(
          and(
            eq(emergencyReportAccessTokens.tenantId, scopedTenant.id),
            eq(emergencyReports.publicRef, params.reportRef),
            eq(emergencyReportAccessTokens.tokenHash, sha256(token))
          )
        )
        .limit(1);
      if (!access) return reply(res, 404, { error: "REPORT_NOT_FOUND" });
      if (access.reporterUserId === claimant.id)
        return reply(res, 200, {
          claimed: true,
          duplicate: true,
          caseId: access.caseId,
        });
      if (
        access.reporterUserId ||
        access.revokedAt ||
        access.expiresAt <= new Date()
      )
        return reply(res, 404, { error: "REPORT_NOT_FOUND" });
      const result = await getDb().transaction(async tx => {
        const [row] = await tx
          .select()
          .from(emergencyCases)
          .where(
            and(
              eq(emergencyCases.tenantId, scopedTenant.id),
              eq(emergencyCases.id, access.caseId)
            )
          )
          .for("update")
          .limit(1);
        if (!row) return "not_found" as const;
        if (row.reporterUserId && row.reporterUserId !== claimant.id)
          return "already_claimed" as const;
        if (row.reporterUserId === claimant.id) return "duplicate" as const;
        const now = new Date();
        const revision = row.revision + 1;
        await tx
          .update(emergencyCases)
          .set({ reporterUserId: claimant.id, revision, updatedAt: now })
          .where(
            and(
              eq(emergencyCases.tenantId, scopedTenant.id),
              eq(emergencyCases.id, row.id),
              isNull(emergencyCases.reporterUserId)
            )
          );
        await tx
          .update(emergencyReports)
          .set({ reporterUserId: claimant.id, updatedAt: now })
          .where(
            and(
              eq(emergencyReports.tenantId, scopedTenant.id),
              eq(emergencyReports.id, access.reportId),
              isNull(emergencyReports.reporterUserId)
            )
          );
        await tx
          .update(emergencyReportAccessTokens)
          .set({ revokedAt: now })
          .where(
            and(
              eq(emergencyReportAccessTokens.tenantId, scopedTenant.id),
              eq(emergencyReportAccessTokens.caseId, row.id),
              isNull(emergencyReportAccessTokens.revokedAt)
            )
          );
        const [previousEvent] = await tx
          .select({ eventHash: emergencyCaseEvents.eventHash })
          .from(emergencyCaseEvents)
          .where(
            and(
              eq(emergencyCaseEvents.tenantId, scopedTenant.id),
              eq(emergencyCaseEvents.caseId, row.id)
            )
          )
          .orderBy(desc(emergencyCaseEvents.revision))
          .limit(1);
        const payload = { revision, reporterLinked: true };
        const eventInput = {
          previousHash: previousEvent?.eventHash ?? null,
          tenantId: scopedTenant.id,
          subjectType: "case",
          subjectId: row.id,
          actorType: "user",
          actorRef: String(claimant.id),
          eventType: "anonymous_case_claimed",
          reason:
            "Reporter proved possession of the case continuation capability",
          before: { reporterUserId: null },
          after: payload,
          createdAt: now.toISOString(),
        };
        await tx.insert(emergencyCaseEvents).values({
          tenantId: scopedTenant.id,
          caseId: row.id,
          eventIdempotencyKey: `anonymous-claim:${row.id}`,
          actorType: "user",
          actorRef: String(claimant.id),
          eventType: "anonymous_case_claimed",
          reason:
            "Reporter proved possession of the case continuation capability",
          revision,
          previousHash: previousEvent?.eventHash ?? null,
          eventHash: auditHash(eventInput),
          payloadJson: payload,
          createdAt: now,
        });
        return "claimed" as const;
      });
      return result === "not_found"
        ? reply(res, 404, { error: "REPORT_NOT_FOUND" })
        : result === "already_claimed"
          ? reply(res, 409, { error: "REPORT_ALREADY_CLAIMED" })
          : reply(res, 200, {
              claimed: true,
              duplicate: result === "duplicate",
              caseId: access.caseId,
            });
    }
    case "public.report.continuation":
    case "public.report.update": {
      const rawToken = req.header("x-emergency-case-token")?.trim();
      if (!rawToken || rawToken.length > 256)
        return reply(res, 401, { error: "CASE_CONTINUATION_REQUIRED" });
      const [access] = await getDb()
        .select({
          caseId: emergencyReportAccessTokens.caseId,
          reportId: emergencyReportAccessTokens.reportId,
          caseStatus: emergencyCases.status,
          revision: emergencyCases.revision,
          context: emergencyCases.caseContextJson,
        })
        .from(emergencyReportAccessTokens)
        .innerJoin(
          emergencyReports,
          and(
            eq(emergencyReports.id, emergencyReportAccessTokens.reportId),
            eq(emergencyReports.tenantId, emergencyReportAccessTokens.tenantId)
          )
        )
        .innerJoin(
          emergencyCases,
          and(
            eq(emergencyCases.id, emergencyReportAccessTokens.caseId),
            eq(emergencyCases.tenantId, emergencyReportAccessTokens.tenantId)
          )
        )
        .where(
          and(
            eq(emergencyReportAccessTokens.tenantId, scopedTenant.id),
            eq(emergencyReports.publicRef, params.reportRef),
            eq(emergencyReportAccessTokens.tokenHash, sha256(rawToken)),
            isNull(emergencyReportAccessTokens.revokedAt),
            sql`${emergencyReportAccessTokens.expiresAt} > now()`
          )
        )
        .limit(1);
      if (!access) return reply(res, 404, { error: "REPORT_NOT_FOUND" });
      if (route.id === "public.report.continuation") {
        const context = safeRecord(access.context);
        return reply(res, 200, {
          item: {
            reportRef: params.reportRef,
            status: access.caseStatus,
            revision: access.revision,
            summary:
              typeof context.citizenSummary === "string"
                ? context.citizenSummary
                : "",
            notes: Array.isArray(context.citizenNotes)
              ? context.citizenNotes
              : [],
          },
        });
      }
      const parsed = anonymousCaseUpdateSchema.safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "INVALID_CASE_UPDATE" });
      const idempotencyKey = req.header("idempotency-key")?.trim();
      if (
        !idempotencyKey ||
        idempotencyKey.length < 8 ||
        idempotencyKey.length > 160
      )
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      const result = await getDb().transaction(async tx => {
        const eventIdempotencyKey = `anonymous-update:${access.caseId}:${sha256(idempotencyKey)}`;
        const [existingEvent] = await tx
          .select({ id: emergencyCaseEvents.id })
          .from(emergencyCaseEvents)
          .where(
            and(
              eq(emergencyCaseEvents.tenantId, scopedTenant.id),
              eq(emergencyCaseEvents.eventIdempotencyKey, eventIdempotencyKey)
            )
          )
          .limit(1);
        if (existingEvent) return "duplicate" as const;
        const [row] = await tx
          .select()
          .from(emergencyCases)
          .where(
            and(
              eq(emergencyCases.tenantId, scopedTenant.id),
              eq(emergencyCases.id, access.caseId)
            )
          )
          .for("update")
          .limit(1);
        if (!row) return "not_found" as const;
        const now = new Date();
        const revision = row.revision + 1;
        const oldContext = safeRecord(row.caseContextJson);
        const priorNotes = Array.isArray(oldContext.citizenNotes)
          ? (oldContext.citizenNotes as Array<Record<string, unknown>>)
          : [];
        const nextContext = {
          ...oldContext,
          citizenNotes: [
            ...priorNotes,
            { text: parsed.data.notes, createdAt: now.toISOString() },
          ].slice(-50),
        };
        const payload = { revision, status: row.status, noteUpdated: true };
        const [previousEvent] = await tx
          .select({ eventHash: emergencyCaseEvents.eventHash })
          .from(emergencyCaseEvents)
          .where(
            and(
              eq(emergencyCaseEvents.tenantId, scopedTenant.id),
              eq(emergencyCaseEvents.caseId, row.id)
            )
          )
          .orderBy(desc(emergencyCaseEvents.revision))
          .limit(1);
        const eventInput = {
          previousHash: previousEvent?.eventHash ?? null,
          tenantId: scopedTenant.id,
          subjectType: "case",
          subjectId: row.id,
          actorType: "anonymous_reporter",
          actorRef: params.reportRef,
          eventType: "anonymous_update",
          reason: parsed.data.reason,
          before: { revision: row.revision },
          after: payload,
          createdAt: now.toISOString(),
        };
        const [updated] = await tx
          .update(emergencyCases)
          .set({ revision, caseContextJson: nextContext, updatedAt: now })
          .where(
            and(
              eq(emergencyCases.tenantId, scopedTenant.id),
              eq(emergencyCases.id, row.id),
              eq(emergencyCases.revision, row.revision)
            )
          )
          .returning({ id: emergencyCases.id });
        if (!updated) return "conflict" as const;
        await tx.insert(emergencyCaseEvents).values({
          tenantId: scopedTenant.id,
          caseId: row.id,
          eventIdempotencyKey,
          actorType: "anonymous_reporter",
          actorRef: params.reportRef,
          eventType: "anonymous_update",
          reason: parsed.data.reason,
          revision,
          previousHash: previousEvent?.eventHash ?? null,
          eventHash: auditHash(eventInput),
          payloadJson: payload,
          createdAt: now,
        });
        return "updated" as const;
      });
      return result === "not_found"
        ? reply(res, 404, { error: "REPORT_NOT_FOUND" })
        : result === "conflict"
          ? reply(res, 409, { error: "CASE_REVISION_CONFLICT" })
          : reply(res, 200, {
              updated: result === "updated",
              duplicate: result === "duplicate",
            });
    }
    case "public.map.config": {
      const ip =
        req.header("x-spec260-client-ip") ||
        req.ip ||
        req.socket.remoteAddress ||
        "unknown";
      const rate = await consumeSlidingWindow(
        "emergency-map-config",
        `${scopedTenant.id}:${ip}`,
        12,
        60
      );
      if (!rate.allowed) {
        res.setHeader("Retry-After", String(rate.retryAfterSeconds ?? 60));
        return reply(res, 429, { error: "MAP_CONFIGURATION_RATE_LIMITED" });
      }
      const mapType =
        typeof req.query.mapType === "string" ? req.query.mapType : undefined;
      const config = await getPublicGeoMapConfiguration({
        fallbackOnly: req.query.fallback === "1",
        mapType,
      });
      return config
        ? reply(res, 200, config)
        : reply(res, 503, { error: "MAP_PROVIDER_UNAVAILABLE" });
    }
    case "public.map.google.attribution": {
      const ip =
        req.header("x-spec260-client-ip") ||
        req.ip ||
        req.socket.remoteAddress ||
        "unknown";
      const rate = await consumeSlidingWindow(
        "emergency-map-attribution",
        `${scopedTenant.id}:${ip}`,
        90,
        60
      );
      if (!rate.allowed) {
        res.setHeader("Retry-After", String(rate.retryAfterSeconds ?? 60));
        return reply(res, 429, { error: "MAP_ATTRIBUTION_RATE_LIMITED" });
      }
      // MapLibre emits viewport coordinates with 15+ decimal digits. Keep a
      // bounded query length, but do not turn valid coordinates into NaN.
      const numberParam = (key: string) =>
        typeof req.query[key] === "string" && req.query[key].length <= 32
          ? Number(req.query[key])
          : NaN;
      const session =
        typeof req.query.session === "string" ? req.query.session : "";
      try {
        const attribution = await getPublicGoogleMapAttribution({
          session,
          zoom: numberParam("zoom"),
          north: numberParam("north"),
          south: numberParam("south"),
          east: numberParam("east"),
          west: numberParam("west"),
        });
        return attribution
          ? reply(res, 200, { attribution })
          : reply(res, 403, { error: "GOOGLE_MAPS_SESSION_INVALID" });
      } catch {
        return reply(res, 503, {
          error: "GOOGLE_MAPS_ATTRIBUTION_UNAVAILABLE",
        });
      }
    }
    case "public.map.google.tile": {
      const ip =
        req.header("x-spec260-client-ip") ||
        req.ip ||
        req.socket.remoteAddress ||
        "unknown";
      const rate = await consumeSlidingWindow(
        "emergency-map-google-tiles",
        `${scopedTenant.id}:${ip}`,
        600,
        60
      );
      if (!rate.allowed) {
        res.setHeader("Retry-After", String(rate.retryAfterSeconds ?? 60));
        return reply(res, 429, { error: "MAP_TILE_RATE_LIMITED" });
      }
      const z = /^\d{1,2}$/.test(params.z ?? "") ? Number(params.z) : NaN;
      const x = /^\d{1,10}$/.test(params.x ?? "") ? Number(params.x) : NaN;
      const y = /^\d{1,10}$/.test(params.y ?? "") ? Number(params.y) : NaN;
      const session =
        typeof req.query.session === "string" ? req.query.session : "";
      const tile = await getPublicGoogleMapTile({ session, z, x, y });
      res
        .status(tile.status)
        .set("Cache-Control", "private, no-store")
        .set("X-Content-Type-Options", "nosniff");
      const contentType = tile.headers.get("content-type");
      if (contentType) res.set("Content-Type", contentType);
      if (!tile.ok) {
        const errorBody = await readBoundedMapTile(tile, 8 * 1024);
        if (errorBody === "timeout")
          return reply(res, 504, {
            error: "GOOGLE_MAPS_TILE_RESPONSE_TIMEOUT",
          });
        if (errorBody === "too-large")
          return reply(res, 502, {
            error: "GOOGLE_MAPS_TILE_RESPONSE_TOO_LARGE",
          });
        return res.send(errorBody);
      }
      const declaredLength = Number(tile.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > 2 * 1024 * 1024) {
        await tile.body?.cancel();
        return reply(res, 502, {
          error: "GOOGLE_MAPS_TILE_RESPONSE_TOO_LARGE",
        });
      }
      const bytes = await readBoundedMapTile(tile, 2 * 1024 * 1024);
      if (bytes === "timeout")
        return reply(res, 504, { error: "GOOGLE_MAPS_TILE_RESPONSE_TIMEOUT" });
      if (bytes === "too-large")
        return reply(res, 502, {
          error: "GOOGLE_MAPS_TILE_RESPONSE_TOO_LARGE",
        });
      return res.send(bytes);
    }
    case "public.map.list": {
      const bounds = parseEmergencyMapBounds(req.query.bbox);
      if (bounds === undefined)
        return reply(res, 400, { error: "MAP_BOUNDS_INVALID" });
      const ip =
        req.header("x-spec260-client-ip") ||
        req.ip ||
        req.socket.remoteAddress ||
        "unknown";
      const rate = await consumeSlidingWindow(
        "emergency-map-viewport",
        `${scopedTenant.id}:${ip}`,
        60,
        60
      );
      if (!rate.allowed) {
        res.setHeader("Retry-After", String(rate.retryAfterSeconds ?? 60));
        return reply(res, 429, { error: "MAP_VIEWPORT_RATE_LIMITED" });
      }
      const situationRows = await getDb().execute(sql<
        Array<{
          publicRef: string;
          status: string;
          severity: string;
          publicProjectionJson: unknown;
          latitude: number;
          longitude: number;
          updatedAt: Date;
          observedAt: Date | null;
          freshUntil: Date | null;
        }>
      >`
        SELECT "publicRef", "status", "severity", "publicProjectionJson",
          ST_Y(ST_SnapToGrid("publicLocation"::geometry, ${PUBLIC_LOCATION_GRID_DEGREES}))::float AS "latitude",
          ST_X(ST_SnapToGrid("publicLocation"::geometry, ${PUBLIC_LOCATION_GRID_DEGREES}))::float AS "longitude",
          "updatedAt", "observedAt", "freshUntil"
        FROM "emergency_situations" s
        WHERE "tenantId" = ${scopedTenant.id} AND "publicLocation" IS NOT NULL
          AND "status" IN ('monitoring', 'active', 'contained', 'resolved')
          AND ST_Intersects(ST_SnapToGrid("publicLocation"::geometry, ${PUBLIC_LOCATION_GRID_DEGREES}), ST_MakeEnvelope(${bounds[0]}, ${bounds[1]}, ${bounds[2]}, ${bounds[3]}, 4326))
        ORDER BY "updatedAt" DESC LIMIT 301
      `);
      const facilityRows = await getDb().execute(sql<
        Array<{
          publicRef: string;
          facilityType: string;
          status: string;
          capacityClass: string | null;
          publicProjectionJson: unknown;
          latitude: number;
          longitude: number;
          updatedAt: Date;
          freshUntil: Date | null;
        }>
      >`
        SELECT "publicRef", "facilityType", "status", "capacityClass", "publicProjectionJson",
          ST_Y(ST_SnapToGrid("publicLocation"::geometry, ${PUBLIC_LOCATION_GRID_DEGREES}))::float AS "latitude",
          ST_X(ST_SnapToGrid("publicLocation"::geometry, ${PUBLIC_LOCATION_GRID_DEGREES}))::float AS "longitude",
          "updatedAt", "freshUntil"
        FROM "emergency_facilities" f
        WHERE "tenantId" = ${scopedTenant.id} AND "publicLocation" IS NOT NULL
          AND "status" IN ('open', 'limited', 'full') AND "verifiedAt" IS NOT NULL
          AND ST_Intersects(ST_SnapToGrid("publicLocation"::geometry, ${PUBLIC_LOCATION_GRID_DEGREES}), ST_MakeEnvelope(${bounds[0]}, ${bounds[1]}, ${bounds[2]}, ${bounds[3]}, 4326))
        ORDER BY "updatedAt" DESC LIMIT 301
      `);
      const alertRows = await getDb().execute(sql<
        Array<{
          publicRef: string;
          situationRef: string | null;
          situationPublicProjectionJson: unknown;
          status: string;
          severity: string;
          messageJson: unknown;
          publicGeometryJson: unknown;
          latitude: number | null;
          longitude: number | null;
          issuedAt: Date | null;
          expiresAt: Date | null;
        }>
      >`
        SELECT a."publicRef", s."publicRef" AS "situationRef", s."publicProjectionJson" AS "situationPublicProjectionJson", a."status", a."severity", a."messageJson", a."publicGeometryJson",
          ST_Y(ST_SnapToGrid(s."publicLocation"::geometry, ${PUBLIC_LOCATION_GRID_DEGREES}))::float AS "latitude",
          ST_X(ST_SnapToGrid(s."publicLocation"::geometry, ${PUBLIC_LOCATION_GRID_DEGREES}))::float AS "longitude",
          a."issuedAt", a."expiresAt"
        FROM "emergency_public_alerts" a
        LEFT JOIN "emergency_situations" s ON s."id" = a."situationId" AND s."tenantId" = a."tenantId"
        WHERE a."tenantId" = ${scopedTenant.id} AND a."status" IN ('published', 'updated')
          AND (a."expiresAt" IS NULL OR a."expiresAt" > now())
          AND (a."situationId" IS NULL OR
            (s."status" IN ('monitoring', 'active', 'contained') AND s."publicLocation" IS NOT NULL AND
              ST_Intersects(ST_SnapToGrid(s."publicLocation"::geometry, ${PUBLIC_LOCATION_GRID_DEGREES}), ST_MakeEnvelope(${bounds[0]}, ${bounds[1]}, ${bounds[2]}, ${bounds[3]}, 4326))) OR
            (s."status" IN ('monitoring', 'active', 'contained') AND a."publicGeometryJson" IS NOT NULL))
        ORDER BY a."issuedAt" DESC NULLS LAST LIMIT 301
      `);
      const visibleAlertRows = alertRows.filter(row => {
        const geometry = normalizeEmergencyAlertGeometry(
          row.publicGeometryJson
        );
        const pointMatches =
          row.latitude !== null &&
          row.latitude !== undefined &&
          row.longitude !== null &&
          row.longitude !== undefined &&
          row.longitude >= bounds[0] &&
          row.longitude <= bounds[2] &&
          row.latitude >= bounds[1] &&
          row.latitude <= bounds[3];
        return (
          pointMatches ||
          emergencyAlertGeometryIntersectsBounds(geometry, bounds)
        );
      });
      const items = [
        ...situationRows.slice(0, 8).map(row => {
          const projection = safeRecord(row.publicProjectionJson);
          return {
            kind: "situation",
            publicRef: row.publicRef,
            status: row.status,
            severity: row.severity,
            title:
              typeof projection.summary === "string"
                ? projection.summary.slice(0, 200)
                : "Emergency situation",
            location: projectSpec260PublicLocation(
              { latitude: row.latitude, longitude: row.longitude },
              projection.spatialDisclosureClass
            ),
            freshness: row.freshUntil
              ? row.freshUntil >= new Date()
                ? "current"
                : "stale"
              : "unknown",
            updatedAt: row.updatedAt.toISOString(),
            observedAt: row.observedAt?.toISOString() ?? null,
          };
        }),
        ...facilityRows.slice(0, 8).map(row => {
          const projection = safeRecord(row.publicProjectionJson);
          return {
            kind: "facility",
            publicRef: row.publicRef,
            status: row.status,
            severity: row.capacityClass ?? "unknown",
            title:
              typeof projection.name === "string"
                ? projection.name.slice(0, 200)
                : "Emergency facility",
            location: projectSpec260PublicLocation(
              { latitude: row.latitude, longitude: row.longitude },
              projection.spatialDisclosureClass
            ),
            freshness: row.freshUntil
              ? row.freshUntil >= new Date()
                ? "current"
                : "stale"
              : "unknown",
            updatedAt: row.updatedAt.toISOString(),
            observedAt: row.updatedAt.toISOString(),
          };
        }),
        ...visibleAlertRows.slice(0, 100).map(row => {
          const message = safeRecord(row.messageJson);
          const situationProjection = safeRecord(
            row.situationPublicProjectionJson
          );
          const spatialDisclosureClass = resolveSpec262PublicSpatialClass(
            situationProjection.spatialDisclosureClass,
            message.spatialDisclosureClass
          );
          return {
            kind: "alert",
            publicRef: row.publicRef,
            situationRef: row.situationRef,
            status: row.status,
            severity: row.severity,
            title:
              typeof message.title === "string"
                ? message.title.slice(0, 200)
                : "Emergency alert",
            publicGeometry: projectSpec260PublicAlertGeometry(
              row.publicGeometryJson,
              spatialDisclosureClass
            ),
            location:
              row.latitude !== null &&
              row.latitude !== undefined &&
              row.longitude !== null &&
              row.longitude !== undefined
                ? projectSpec260PublicLocation(
                    { latitude: row.latitude, longitude: row.longitude },
                    spatialDisclosureClass
                  )
                : null,
            freshness: row.expiresAt
              ? row.expiresAt >= new Date()
                ? "current"
                : "stale"
              : "unknown",
            updatedAt: row.issuedAt?.toISOString() ?? null,
            observedAt: row.issuedAt?.toISOString() ?? null,
          };
        }),
      ];
      const feed = composeLocalSituationFeed(
        items.map(item => ({ ...item, spatialRelation: "IN_VIEWPORT" })) as LocalSituationFeedSourceRecord[],
        { generatedAt: new Date().toISOString(), budget: 10 }
      );
      const truncated =
        situationRows.length > 300 ||
        facilityRows.length > 300 ||
        alertRows.length > 300 ||
        visibleAlertRows.length > 100 ||
        items.length > 600;
      return reply(res, 200, {
        items: items.slice(0, 600),
        feed: feed.items,
        feedPolicyVersion: feed.policyVersion,
        feedTruncated: feed.truncated,
        feedOmittedCount: feed.omittedCount,
        projection: "public_approximate",
        bounds,
        truncated,
      });
    }
    case "public.search": {
      // Public search is bounded, tenant-local and searches only publishable summaries.
      // Strip SQL LIKE metacharacters so callers cannot expand the requested match pattern.
      const query = (typeof req.query.q === "string" ? req.query.q : "")
        .trim()
        .replace(/[\\%_]/g, "")
        .slice(0, 80);
      if (query.length < 2 || /[\u0000-\u001f]/.test(query))
        return reply(res, 400, { error: "SEARCH_QUERY_INVALID" });
      const ip =
        req.header("x-spec260-client-ip") ||
        req.ip ||
        req.socket.remoteAddress ||
        "unknown";
      const rate = await consumeSlidingWindow(
        "emergency-public-search",
        `${scopedTenant.id}:${ip}`,
        20,
        60
      );
      if (!rate.allowed) {
        res.setHeader("Retry-After", String(rate.retryAfterSeconds ?? 60));
        return reply(res, 429, { error: "SEARCH_RATE_LIMITED" });
      }
      const pattern = `%${query}%`;
      const situationRows = await getDb().execute(sql<
        Array<{
          publicRef: string;
          status: string;
          severity: string;
          publicProjectionJson: unknown;
          latitude: number | null;
          longitude: number | null;
          updatedAt: Date;
          freshUntil: Date | null;
        }>
      >`
        SELECT "publicRef", "status", "severity", "publicProjectionJson",
          ST_Y(ST_SnapToGrid("publicLocation"::geometry, ${PUBLIC_LOCATION_GRID_DEGREES}))::float AS "latitude",
          ST_X(ST_SnapToGrid("publicLocation"::geometry, ${PUBLIC_LOCATION_GRID_DEGREES}))::float AS "longitude",
          "updatedAt", "freshUntil"
        FROM "emergency_situations" s
        WHERE "tenantId" = ${scopedTenant.id} AND "status" IN ('monitoring', 'active', 'contained', 'resolved')
          AND (COALESCE("publicProjectionJson"->>'summary', '') ILIKE ${pattern} OR "publicRef" ILIKE ${pattern})
        ORDER BY "updatedAt" DESC LIMIT 9
      `);
      const facilityRows = await getDb().execute(sql<
        Array<{
          publicRef: string;
          facilityType: string;
          status: string;
          capacityClass: string | null;
          publicProjectionJson: unknown;
          latitude: number | null;
          longitude: number | null;
          updatedAt: Date;
          freshUntil: Date | null;
        }>
      >`
        SELECT "publicRef", "facilityType", "status", "capacityClass", "publicProjectionJson",
          ST_Y(ST_SnapToGrid("publicLocation"::geometry, ${PUBLIC_LOCATION_GRID_DEGREES}))::float AS "latitude",
          ST_X(ST_SnapToGrid("publicLocation"::geometry, ${PUBLIC_LOCATION_GRID_DEGREES}))::float AS "longitude",
          "updatedAt", "freshUntil"
        FROM "emergency_facilities" f
        WHERE "tenantId" = ${scopedTenant.id} AND "status" IN ('open', 'limited', 'full') AND "verifiedAt" IS NOT NULL
          AND (COALESCE("publicProjectionJson"->>'name', '') ILIKE ${pattern} OR COALESCE("publicProjectionJson"->>'description', '') ILIKE ${pattern})
        ORDER BY "updatedAt" DESC LIMIT 9
      `);
      const alertRows = await getDb().execute(sql<
        Array<{
          publicRef: string;
          status: string;
          severity: string;
          messageJson: unknown;
          issuedAt: Date | null;
          expiresAt: Date | null;
        }>
      >`
        SELECT a."publicRef", a."status", a."severity", a."messageJson", a."issuedAt", a."expiresAt"
        FROM "emergency_public_alerts" a
        LEFT JOIN "emergency_situations" s ON s."id" = a."situationId" AND s."tenantId" = a."tenantId"
        WHERE a."tenantId" = ${scopedTenant.id} AND a."status" IN ('published', 'updated')
          AND (a."expiresAt" IS NULL OR a."expiresAt" > now())
          AND (a."situationId" IS NULL OR s."status" IN ('monitoring', 'active', 'contained'))
          AND (COALESCE(a."messageJson"->>'title', '') ILIKE ${pattern} OR COALESCE(a."messageJson"->>'message', '') ILIKE ${pattern})
        ORDER BY a."issuedAt" DESC NULLS LAST LIMIT 9
      `);
      const items = [
        ...situationRows.map(row => {
          const projection = safeRecord(row.publicProjectionJson);
          return {
            kind: "situation",
            publicRef: row.publicRef,
            title:
              typeof projection.summary === "string"
                ? projection.summary.slice(0, 200)
                : "Emergency situation",
            status: row.status,
            severity: row.severity,
            location:
              row.latitude !== null && row.longitude !== null
                ? projectSpec260PublicLocation(
                    { latitude: row.latitude, longitude: row.longitude },
                    projection.spatialDisclosureClass
                  )
                : null,
            freshness: row.freshUntil
              ? row.freshUntil >= new Date()
                ? "current"
                : "stale"
              : "unknown",
            updatedAt: row.updatedAt.toISOString(),
          };
        }),
        ...facilityRows.map(row => {
          const projection = safeRecord(row.publicProjectionJson);
          return {
            kind: "facility",
            publicRef: row.publicRef,
            title:
              typeof projection.name === "string"
                ? projection.name.slice(0, 200)
                : "Emergency facility",
            status: row.status,
            severity: row.capacityClass ?? "unknown",
            location:
              row.latitude !== null && row.longitude !== null
                ? projectSpec260PublicLocation(
                    { latitude: row.latitude, longitude: row.longitude },
                    projection.spatialDisclosureClass
                  )
                : null,
            freshness: row.freshUntil
              ? row.freshUntil >= new Date()
                ? "current"
                : "stale"
              : "unknown",
            updatedAt: row.updatedAt.toISOString(),
          };
        }),
        ...alertRows.map(row => {
          const message = safeRecord(row.messageJson);
          return {
            kind: "alert",
            publicRef: row.publicRef,
            title:
              typeof message.title === "string"
                ? message.title.slice(0, 200)
                : "Emergency alert",
            status: row.status,
            severity: row.severity,
            location: null,
            freshness: row.expiresAt ? "current" : "unknown",
            updatedAt: row.issuedAt?.toISOString() ?? null,
          };
        }),
      ]
        .sort(
          (left, right) =>
            Date.parse(right.updatedAt ?? "") - Date.parse(left.updatedAt ?? "")
        )
        .slice(0, 20);
      const truncated =
        situationRows.length > 8 ||
        facilityRows.length > 8 ||
        alertRows.length > 8 ||
        situationRows.length + facilityRows.length + alertRows.length > 20;
      return reply(res, 200, {
        items,
        query,
        projection: "public_approximate",
        truncated,
      });
    }
    case "public.situations.list": {
      const rows = await getDb()
        .select()
        .from(emergencySituations)
        .where(
          and(
            eq(emergencySituations.tenantId, scopedTenant.id),
            inArray(emergencySituations.status, [
              "monitoring",
              "active",
              "contained",
              "resolved",
            ])
          )
        )
        .orderBy(desc(emergencySituations.updatedAt))
        .limit(101);
      return reply(res, 200, {
        items: rows.slice(0, 100).map(publicSituation),
        truncated: rows.length > 100,
      });
    }
    case "public.situation.detail": {
      const [row] = await getDb()
        .select()
        .from(emergencySituations)
        .where(
          and(
            eq(emergencySituations.tenantId, scopedTenant.id),
            eq(emergencySituations.publicRef, params.publicRef),
            inArray(emergencySituations.status, [
              "monitoring",
              "active",
              "contained",
              "resolved",
            ])
          )
        )
        .limit(1);
      return row
        ? reply(res, 200, { item: publicSituation(row) })
        : reply(res, 404, { error: "SITUATION_NOT_FOUND" });
    }
    case "public.alerts.list": {
      const rows = await getDb()
        .select({
          publicRef: emergencyPublicAlerts.publicRef,
          situationId: emergencyPublicAlerts.situationId,
          status: emergencyPublicAlerts.status,
          severity: emergencyPublicAlerts.severity,
          messageJson: emergencyPublicAlerts.messageJson,
          publicGeometryJson: emergencyPublicAlerts.publicGeometryJson,
          situationPublicProjectionJson:
            emergencySituations.publicProjectionJson,
          issuedAt: emergencyPublicAlerts.issuedAt,
          expiresAt: emergencyPublicAlerts.expiresAt,
          situationRef: emergencySituations.publicRef,
          latitude: sql<
            number | null
          >`ST_Y(ST_SnapToGrid(${emergencySituations.publicLocation}::geometry, ${PUBLIC_LOCATION_GRID_DEGREES}))::float`,
          longitude: sql<
            number | null
          >`ST_X(ST_SnapToGrid(${emergencySituations.publicLocation}::geometry, ${PUBLIC_LOCATION_GRID_DEGREES}))::float`,
        })
        .from(emergencyPublicAlerts)
        .leftJoin(
          emergencySituations,
          and(
            eq(emergencySituations.id, emergencyPublicAlerts.situationId),
            eq(emergencySituations.tenantId, emergencyPublicAlerts.tenantId)
          )
        )
        .where(
          and(
            eq(emergencyPublicAlerts.tenantId, scopedTenant.id),
            inArray(emergencyPublicAlerts.status, ["published", "updated"]),
            or(
              isNull(emergencyPublicAlerts.expiresAt),
              gt(emergencyPublicAlerts.expiresAt, new Date())
            ),
            or(
              isNull(emergencyPublicAlerts.situationId),
              inArray(emergencySituations.status, [
                "monitoring",
                "active",
                "contained",
              ])
            )
          )
        )
        .orderBy(desc(emergencyPublicAlerts.issuedAt))
        .limit(101);
      return reply(res, 200, {
        items: rows.slice(0, 100).map(row => {
          const content = safeRecord(row.messageJson);
          return {
            publicRef: row.publicRef,
            status: row.status,
            severity: row.severity,
            title:
              typeof content.title === "string"
                ? content.title.slice(0, 200)
                : "Emergency alert",
            message:
              typeof content.message === "string"
                ? content.message.slice(0, 2000)
                : "",
            freshness: row.expiresAt ? "current" : "unknown",
            situationRef: row.situationRef,
            publicGeometry: projectSpec260PublicAlertGeometry(
              row.publicGeometryJson,
              resolveSpec262PublicSpatialClass(
                safeRecord(row.situationPublicProjectionJson)
                  .spatialDisclosureClass,
                content.spatialDisclosureClass
              )
            ),
            location:
              row.latitude !== null &&
              row.latitude !== undefined &&
              row.longitude !== null &&
              row.longitude !== undefined
                ? projectSpec260PublicLocation(
                    { latitude: row.latitude, longitude: row.longitude },
                    resolveSpec262PublicSpatialClass(
                      safeRecord(row.situationPublicProjectionJson)
                        .spatialDisclosureClass,
                      content.spatialDisclosureClass
                    )
                  )
                : null,
            issuedAt: row.issuedAt?.toISOString() ?? null,
            expiresAt: row.expiresAt?.toISOString() ?? null,
          };
        }),
        truncated: rows.length > 100,
      });
    }
    case "public.facilities.list": {
      const rows = await getDb()
        .select({
          id: emergencyFacilities.id,
          publicRef: emergencyFacilities.publicRef,
          facilityType: emergencyFacilities.facilityType,
          status: emergencyFacilities.status,
          capacityClass: emergencyFacilities.capacityClass,
          publicProjectionJson: emergencyFacilities.publicProjectionJson,
          updatedAt: emergencyFacilities.updatedAt,
          freshUntil: emergencyFacilities.freshUntil,
          latitude: sql<
            number | null
          >`ST_Y(ST_SnapToGrid(${emergencyFacilities.publicLocation}::geometry, ${PUBLIC_LOCATION_GRID_DEGREES}))::float`,
          longitude: sql<
            number | null
          >`ST_X(ST_SnapToGrid(${emergencyFacilities.publicLocation}::geometry, ${PUBLIC_LOCATION_GRID_DEGREES}))::float`,
        })
        .from(emergencyFacilities)
        .where(
          and(
            eq(emergencyFacilities.tenantId, scopedTenant.id),
            inArray(emergencyFacilities.status, ["open", "limited", "full"]),
            isNotNull(emergencyFacilities.verifiedAt)
          )
        )
        .orderBy(desc(emergencyFacilities.updatedAt))
        .limit(101);
      return reply(res, 200, {
        items: rows.slice(0, 100).map(row => {
          const view = safeRecord(row.publicProjectionJson);
          return {
            publicRef: row.publicRef,
            type: row.facilityType,
            status: row.status,
            capacityClass: row.capacityClass,
            name:
              typeof view.name === "string"
                ? view.name.slice(0, 200)
                : "Emergency facility",
            description:
              typeof view.description === "string"
                ? view.description.slice(0, 500)
                : "",
            location:
              row.latitude !== null && row.longitude !== null
                ? projectSpec260PublicLocation(
                    { latitude: row.latitude, longitude: row.longitude },
                    view.spatialDisclosureClass
                  )
                : null,
            updatedAt: row.updatedAt.toISOString(),
            freshness: row.freshUntil
              ? row.freshUntil >= new Date()
                ? "current"
                : "stale"
              : "unknown",
          };
        }),
        truncated: rows.length > 100,
      });
    }
    case "public.nearby.list": {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      if (
        !Number.isFinite(lat) ||
        lat < -90 ||
        lat > 90 ||
        !Number.isFinite(lng) ||
        lng < -180 ||
        lng > 180
      ) {
        return reply(res, 400, { error: "APPROXIMATE_LOCATION_REQUIRED" });
      }
      const ip =
        req.header("x-spec260-client-ip") ||
        req.ip ||
        req.socket.remoteAddress ||
        "unknown";
      const rate = await consumeSlidingWindow(
        "emergency-nearby",
        `${scopedTenant.id}:${ip}`,
        30,
        60
      );
      if (!rate.allowed) {
        res.setHeader("Retry-After", String(rate.retryAfterSeconds ?? 60));
        return reply(res, 429, { error: "NEARBY_RATE_LIMITED" });
      }
      // Use a coarse reference point and fixed radius so repeated arbitrary probes cannot
      // reconstruct the exact public location from distance or ordering information.
      const approximateLat = generalizeEmergencyPublicCoordinate(lat);
      const approximateLng = generalizeEmergencyPublicCoordinate(lng);
      const radiusMeters = 5_000;
      const rows = await getDb().execute(sql<
        Array<{ publicRef: string; hazard: string; status: string }>
      >`
        SELECT "publicRef", "severity" AS hazard, "status"
        FROM "emergency_situations"
        WHERE "publicLocation" IS NOT NULL
          AND "tenantId" = ${scopedTenant.id}
          AND "status" IN ('monitoring', 'active', 'contained')
          AND ST_DWithin(ST_SetSRID(ST_SnapToGrid("publicLocation"::geometry, ${PUBLIC_LOCATION_GRID_DEGREES}), 4326)::geography, ST_SetSRID(ST_MakePoint(${approximateLng}, ${approximateLat}), 4326)::geography, ${radiusMeters})
        ORDER BY "publicRef"
        LIMIT 100
      `);
      return reply(res, 200, {
        items: rows.map(row => ({
          publicRef: row.publicRef,
          hazard: row.hazard,
          status: row.status,
          proximity: "nearby",
        })),
      });
    }
    case "public.geo.places.search": {
      const optionalQueryKeys = [
        "locale",
        "countryCode",
        "admin1Code",
        "kinds",
        "limit",
      ] as const;
      if (
        optionalQueryKeys.some(
          key =>
            req.query[key] !== undefined && typeof req.query[key] !== "string"
        )
      ) {
        return reply(res, 400, { error: "GEOGRAPHIC_SEARCH_INVALID" });
      }
      const query = typeof req.query.q === "string" ? req.query.q : "";
      const locale =
        typeof req.query.locale === "string" ? req.query.locale : undefined;
      const countryCode =
        typeof req.query.countryCode === "string"
          ? req.query.countryCode
          : undefined;
      const admin1Code =
        typeof req.query.admin1Code === "string"
          ? req.query.admin1Code
          : undefined;
      const kindValues =
        typeof req.query.kinds === "string"
          ? req.query.kinds.split(",")
          : undefined;
      if (
        req.query.limit !== undefined &&
        (typeof req.query.limit !== "string" ||
          !/^\d{1,2}$/.test(req.query.limit))
      ) {
        return reply(res, 400, { error: "GEOGRAPHIC_SEARCH_INVALID" });
      }
      const limit =
        typeof req.query.limit === "string"
          ? Number(req.query.limit)
          : undefined;
      const ip =
        req.header("x-spec260-client-ip") ||
        req.ip ||
        req.socket.remoteAddress ||
        "unknown";
      const rate = await consumeSlidingWindow(
        "emergency-geographic-search",
        `${scopedTenant.id}:${ip}`,
        30,
        60
      );
      if (!rate.allowed) {
        res.setHeader("Retry-After", String(rate.retryAfterSeconds ?? 60));
        return reply(res, 429, { error: "GEOGRAPHIC_SEARCH_RATE_LIMITED" });
      }
      const result = geographicSearch.search({
        query,
        locale,
        countryCode,
        admin1Code,
        kinds: kindValues,
        limit,
      });
      if (result.status === "invalid_request")
        return reply(res, 400, { error: "GEOGRAPHIC_SEARCH_INVALID" });
      return reply(res, 200, result);
    }
    case "public.report.create":
      return createReport(req, res, scopedTenant);
    case "public.support.list":
      return reply(res, 200, {
        items: await getPublicSupportPools(scopedTenant.id),
      });
    case "public.support.detail": {
      const pools = await getPublicSupportPools(scopedTenant.id);
      const item = pools.find(pool => pool.id === params.poolId);
      return item
        ? reply(res, 200, { item })
        : reply(res, 404, { error: "SUPPORT_POOL_NOT_FOUND" });
    }
    case "public.support.contribution":
      return createPublicContribution(req, res, scopedTenant.id, params.poolId);
    case "auth.capabilities": {
      const grants = await getDb()
        .select({
          capability: emergencyCapabilityGrants.capability,
          scopeType: emergencyCapabilityGrants.scopeType,
          scopeRef: emergencyCapabilityGrants.scopeRef,
          expiresAt: emergencyCapabilityGrants.expiresAt,
        })
        .from(emergencyCapabilityGrants)
        .where(
          and(
            eq(emergencyCapabilityGrants.tenantId, tenantId),
            eq(emergencyCapabilityGrants.userId, user!.id),
            isNull(emergencyCapabilityGrants.revokedAt),
            or(
              isNull(emergencyCapabilityGrants.expiresAt),
              sql`${emergencyCapabilityGrants.expiresAt} > now()`
            )
          )
        );
      return reply(res, 200, {
        capabilities: [
          ...new Set(
            grants
              .filter(
                grant =>
                  grant.scopeType === "tenant" && grant.scopeRef === "tenant"
              )
              .map(grant => grant.capability)
          ),
        ],
        grants,
      });
    }
    case "auth.geo.watches": {
      const rows = await getDb()
        .select({
          id: emergencyGeoWatches.id,
          status: emergencyGeoWatches.status,
          revision: emergencyGeoWatches.revision,
          expiresAt: emergencyGeoWatches.expiresAt,
          watch: emergencyGeoWatches.watchJson,
          createdAt: emergencyGeoWatches.createdAt,
          updatedAt: emergencyGeoWatches.updatedAt,
        })
        .from(emergencyGeoWatches)
        .where(
          and(
            eq(emergencyGeoWatches.tenantId, tenantId),
            eq(emergencyGeoWatches.ownerUserId, user!.id)
          )
        )
        .orderBy(desc(emergencyGeoWatches.updatedAt))
        .limit(100);
      return reply(res, 200, {
        items: rows.map(row => ({
          id: row.id,
          status:
            row.status === "active" && row.expiresAt <= new Date()
              ? "expired"
              : row.status,
          revision: row.revision,
          expiresAt: row.expiresAt.toISOString(),
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          watch: row.watch,
        })),
      });
    }
    case "auth.geo.watch.create": {
      const parsed = geoWatchCreateSchema.safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "INVALID_GEOSPATIAL_WATCH" });
      const key = req.header("idempotency-key")?.trim();
      if (!key || key.length < 8 || key.length > 160)
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      const rate = await consumeSlidingWindow(
        "emergency-geospatial-watch",
        `${tenantId}:${user!.id}`,
        20,
        3600
      );
      if (!rate.allowed) {
        res.setHeader("Retry-After", String(rate.retryAfterSeconds ?? 3600));
        return reply(res, 429, { error: "GEOSPATIAL_WATCH_RATE_LIMITED" });
      }
      const now = new Date();
      const id = randomUUID();
      const input = {
        schemaVersion: 1,
        id,
        ownerId: String(user!.id),
        tenantId,
        revision: 1,
        scope: parsed.data.scope,
        condition: parsed.data.condition,
        status: "active",
        createdAt: now.toISOString(),
        expiresAt: parsed.data.expiresAt,
        notifyOn: parsed.data.notifyOn,
      };
      const watch = parseGeospatialWatch(input);
      if (!watch)
        return reply(res, 422, { error: "GEOSPATIAL_WATCH_SCOPE_INVALID" });
      if (
        Date.parse(watch.expiresAt) <= now.getTime() ||
        Date.parse(watch.expiresAt) > now.getTime() + 366 * 24 * 60 * 60_000
      )
        return reply(res, 422, { error: "GEOSPATIAL_WATCH_EXPIRY_INVALID" });
      const idempotencyKeyHash = sha256(key);
      const eventKey = `geo-watch:create:${idempotencyKeyHash}`;
      const fingerprint = requestFingerprint({
        scope: watch.scope,
        condition: watch.condition,
        expiresAt: watch.expiresAt,
        notifyOn: watch.notifyOn,
      });
      const result = await getDb().transaction(async tx => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${user!.id}:${eventKey}`}, 0))`
        );
        const [prior] = await tx
          .select({
            id: emergencyGeoWatches.id,
            watch: emergencyGeoWatches.watchJson,
          })
          .from(emergencyGeoWatches)
          .where(
            and(
              eq(emergencyGeoWatches.tenantId, tenantId),
              eq(emergencyGeoWatches.ownerUserId, user!.id),
              eq(emergencyGeoWatches.idempotencyKeyHash, idempotencyKeyHash)
            )
          )
          .limit(1);
        if (prior)
          return {
            id: prior.id,
            duplicate: true,
            reused:
              requestFingerprint({
                scope: safeRecord(prior.watch).scope,
                condition: safeRecord(prior.watch).condition,
                expiresAt: safeRecord(prior.watch).expiresAt,
                notifyOn: safeRecord(prior.watch).notifyOn,
              }) !== fingerprint,
          };
        await tx.insert(emergencyGeoWatches).values({
          id,
          tenantId,
          ownerUserId: user!.id,
          idempotencyKeyHash,
          watchJson: watch as unknown as Record<string, unknown>,
          status: "active",
          revision: 1,
          expiresAt: new Date(watch.expiresAt),
          createdAt: now,
          updatedAt: now,
        });
        const after = {
          id,
          status: "active",
          revision: 1,
          expiresAt: watch.expiresAt,
          requestFingerprint: fingerprint,
        };
        const audit = {
          tenantId,
          subjectType: "geospatial_watch",
          subjectId: id,
          actorType: "user",
          actorRef: String(user!.id),
          eventType: "geospatial_watch_created",
          reason: "User created an expiring geospatial watch",
          after,
          previousHash: null,
          createdAt: now.toISOString(),
        };
        await tx.insert(emergencyAuditEvents).values({
          ...audit,
          eventIdempotencyKey: eventKey,
          eventHash: auditHash(audit),
          afterJson: after,
          createdAt: now,
        });
        return { id, duplicate: false, reused: false };
      });
      if (result.reused)
        return reply(res, 409, { error: "IDEMPOTENCY_KEY_REUSED" });
      return reply(res, result.duplicate ? 200 : 201, {
        watchId: result.id,
        duplicate: result.duplicate,
      });
    }
    case "auth.geo.watch.update":
    case "auth.geo.watch.revoke": {
      let expectedRevision: number | undefined;
      let requestedStatus: "active" | "paused" | undefined;
      if (route.id === "auth.geo.watch.update") {
        const parsed = geoWatchUpdateSchema.safeParse(req.body);
        if (!parsed.success)
          return reply(res, 400, { error: "INVALID_GEOSPATIAL_WATCH_UPDATE" });
        expectedRevision = parsed.data.expectedRevision;
        requestedStatus = parsed.data.status;
      }
      const key = req.header("idempotency-key")?.trim();
      if (!key || key.length < 8 || key.length > 160)
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      const action = route.id === "auth.geo.watch.revoke" ? "revoke" : "update";
      const requestHash = requestFingerprint({
        action,
        expectedRevision,
        requestedStatus,
      });
      const eventKey = `geo-watch:${action}:${params.watchId}:${sha256(key)}`;
      const rate = await consumeSlidingWindow(
        "emergency-geospatial-watch",
        `${tenantId}:${user!.id}`,
        40,
        3600
      );
      if (!rate.allowed) {
        res.setHeader("Retry-After", String(rate.retryAfterSeconds ?? 3600));
        return reply(res, 429, { error: "GEOSPATIAL_WATCH_RATE_LIMITED" });
      }
      const result = await getDb().transaction(async tx => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${user!.id}:${eventKey}`}, 0))`
        );
        const [prior] = await tx
          .select({ after: emergencyAuditEvents.afterJson })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.eventIdempotencyKey, eventKey)
            )
          )
          .limit(1);
        if (prior)
          return safeRecord(prior.after).requestFingerprint === requestHash
            ? { state: "duplicate" as const, after: safeRecord(prior.after) }
            : { state: "idempotency_reused" as const };
        const [row] = await tx
          .select()
          .from(emergencyGeoWatches)
          .where(
            and(
              eq(emergencyGeoWatches.tenantId, tenantId),
              eq(emergencyGeoWatches.ownerUserId, user!.id),
              eq(emergencyGeoWatches.id, params.watchId)
            )
          )
          .for("update")
          .limit(1);
        if (!row) return { state: "missing" as const };
        if (
          row.status === "revoked" ||
          row.status === "expired" ||
          row.expiresAt <= new Date()
        )
          return { state: "inactive" as const };
        if (action === "update" && row.revision !== expectedRevision)
          return { state: "revision_conflict" as const };
        const nextStatus = action === "revoke" ? "revoked" : requestedStatus!;
        if (row.status === nextStatus) return { state: "unchanged" as const };
        const now = new Date();
        const nextRevision = row.revision + 1;
        const nextWatch = {
          ...safeRecord(row.watchJson),
          revision: nextRevision,
          status: nextStatus,
        };
        await tx
          .update(emergencyGeoWatches)
          .set({
            status: nextStatus,
            revision: nextRevision,
            watchJson: nextWatch,
            updatedAt: now,
          })
          .where(eq(emergencyGeoWatches.id, row.id));
        const before = {
          id: row.id,
          status: row.status,
          revision: row.revision,
        };
        const after = {
          id: row.id,
          status: nextStatus,
          revision: nextRevision,
          requestFingerprint: requestHash,
        };
        const audit = {
          tenantId,
          subjectType: "geospatial_watch",
          subjectId: row.id,
          actorType: "user",
          actorRef: String(user!.id),
          eventType:
            nextStatus === "revoked"
              ? "geospatial_watch_revoked"
              : "geospatial_watch_updated",
          reason:
            nextStatus === "revoked"
              ? "User revoked geospatial watch"
              : "User changed geospatial watch state",
          before,
          after,
          previousHash: null,
          createdAt: now.toISOString(),
        };
        await tx.insert(emergencyAuditEvents).values({
          ...audit,
          eventIdempotencyKey: eventKey,
          eventHash: auditHash(audit),
          beforeJson: before,
          afterJson: after,
          createdAt: now,
        });
        return { state: "updated" as const, after };
      });
      if (result.state === "missing")
        return reply(res, 404, { error: "GEOSPATIAL_WATCH_NOT_FOUND" });
      if (result.state === "inactive")
        return reply(res, 409, { error: "GEOSPATIAL_WATCH_INACTIVE" });
      if (result.state === "revision_conflict")
        return reply(res, 409, { error: "GEOSPATIAL_WATCH_REVISION_CONFLICT" });
      if (result.state === "idempotency_reused")
        return reply(res, 409, { error: "IDEMPOTENCY_KEY_REUSED" });
      if (result.state === "unchanged")
        return reply(res, 200, { unchanged: true });
      return reply(res, 200, {
        ...result.after,
        duplicate: result.state === "duplicate",
      });
    }
    case "auth.helper.availability": {
      const [profile] = await getDb()
        .select({
          profile: emergencyHelperProfiles,
          longitude: sql<
            number | null
          >`ST_X(${emergencyHelperProfiles.coarseLocation}::geometry)::float`,
          latitude: sql<
            number | null
          >`ST_Y(${emergencyHelperProfiles.coarseLocation}::geometry)::float`,
        })
        .from(emergencyHelperProfiles)
        .where(
          and(
            eq(emergencyHelperProfiles.tenantId, tenantId),
            eq(emergencyHelperProfiles.userId, user!.id)
          )
        )
        .limit(1);
      return reply(res, 200, {
        item: profile
          ? {
              optIn: profile.profile.optIn,
              capabilityCodes: profile.profile.capabilityCodes,
              location:
                typeof profile.longitude === "number" &&
                typeof profile.latitude === "number"
                  ? { longitude: profile.longitude, latitude: profile.latitude }
                  : null,
              jurisdictionRef: profile.profile.jurisdictionRef,
              availableUntil:
                profile.profile.availableUntil?.toISOString() ?? null,
              revokedAt: profile.profile.revokedAt?.toISOString() ?? null,
            }
          : null,
      });
    }
    case "auth.helper.availability.update": {
      const parsed = helperAvailabilitySchema.safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "INVALID_HELPER_AVAILABILITY" });
      const key = req.header("idempotency-key")?.trim();
      if (!key || key.length < 8 || key.length > 160)
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      const rate = await consumeSlidingWindow(
        "emergency-helper-availability",
        `${tenantId}:${user!.id}`,
        20,
        3600
      );
      if (!rate.allowed) {
        res.setHeader("Retry-After", String(rate.retryAfterSeconds ?? 3600));
        return reply(res, 429, { error: "HELPER_AVAILABILITY_RATE_LIMITED" });
      }
      const now = new Date();
      const expires = parsed.data.optIn
        ? new Date(parsed.data.availableUntil)
        : new Date(now.getTime() + 1);
      const availability = prepareEmergencyHelperAvailability({
        ...parsed.data,
        now,
        availableUntil: expires,
      });
      if (!availability)
        return reply(res, 422, { error: "HELPER_AVAILABILITY_SCOPE_INVALID" });
      const fingerprint = requestFingerprint(parsed.data);
      const eventKey = `helper-availability:${tenantId}:${user!.id}:${sha256(key)}`;
      const outcome = await getDb().transaction(async tx => {
        const [prior] = await tx
          .select({ afterJson: emergencyAuditEvents.afterJson })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.eventIdempotencyKey, eventKey)
            )
          )
          .limit(1);
        if (prior)
          return safeRecord(prior.afterJson).requestFingerprint === fingerprint
            ? ("duplicate" as const)
            : ("idempotency_reused" as const);
        const [beforeProfile] = await tx
          .select()
          .from(emergencyHelperProfiles)
          .where(
            and(
              eq(emergencyHelperProfiles.tenantId, tenantId),
              eq(emergencyHelperProfiles.userId, user!.id)
            )
          )
          .for("update")
          .limit(1);
        const afterProfile = {
          tenantId,
          userId: user!.id,
          optIn: availability.optIn,
          capabilityCodes: availability.optIn
            ? (beforeProfile?.capabilityCodes ?? [])
            : [],
          coarseLocation:
            availability.optIn &&
            availability.latitude !== null &&
            availability.longitude !== null
              ? sql`ST_SetSRID(ST_MakePoint(${availability.longitude}, ${availability.latitude}), 4326)::geography`
              : null,
          jurisdictionRef: availability.jurisdictionRef,
          availableUntil: availability.availableUntil,
          revokedAt: null,
          updatedAt: now,
        };
        await tx
          .insert(emergencyHelperProfiles)
          .values(afterProfile)
          .onConflictDoUpdate({
            target: [
              emergencyHelperProfiles.tenantId,
              emergencyHelperProfiles.userId,
            ],
            set: {
              optIn: afterProfile.optIn,
              capabilityCodes: afterProfile.capabilityCodes,
              coarseLocation: afterProfile.coarseLocation,
              jurisdictionRef: afterProfile.jurisdictionRef,
              availableUntil: afterProfile.availableUntil,
              revokedAt: null,
              updatedAt: now,
            },
          });
        if (!availability.optIn) {
          await tx
            .update(emergencyDisclosureGrants)
            .set({ revokedAt: now, revokedBy: user!.id })
            .where(
              and(
                eq(emergencyDisclosureGrants.tenantId, tenantId),
                eq(emergencyDisclosureGrants.recipientRef, `user:${user!.id}`),
                isNull(emergencyDisclosureGrants.revokedAt)
              )
            );
        }
        const previous = await tx
          .select({ eventHash: emergencyAuditEvents.eventHash })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.subjectType, "helper_profile"),
              eq(emergencyAuditEvents.subjectId, String(user!.id))
            )
          )
          .orderBy(desc(emergencyAuditEvents.createdAt))
          .limit(1);
        const before = beforeProfile
          ? {
              optIn: beforeProfile.optIn,
              jurisdictionRef: beforeProfile.jurisdictionRef,
            }
          : null;
        const after = {
          optIn: availability.optIn,
          jurisdictionRef: availability.jurisdictionRef,
          availableUntil: availability.availableUntil?.toISOString() ?? null,
          requestFingerprint: fingerprint,
        };
        const audit = {
          tenantId,
          subjectType: "helper_profile",
          subjectId: String(user!.id),
          actorType: "user",
          actorRef: String(user!.id),
          eventType: availability.optIn
            ? "helper_availability_enabled"
            : "helper_availability_revoked",
          reason: "Helper explicitly updated opt-in availability",
          previousHash: previous[0]?.eventHash ?? null,
          before,
          after,
          createdAt: now.toISOString(),
        };
        await tx.insert(emergencyAuditEvents).values({
          ...audit,
          eventIdempotencyKey: eventKey,
          eventHash: auditHash(audit),
          beforeJson: before,
          afterJson: after,
          createdAt: now,
        });
        return "updated" as const;
      });
      return outcome === "idempotency_reused"
        ? reply(res, 409, { error: "IDEMPOTENCY_KEY_REUSED" })
        : reply(res, 200, {
            updated: outcome === "updated",
            duplicate: outcome === "duplicate",
            item: availability,
          });
    }
    case "auth.case.evidence.list": {
      const access = await emergencyCaseEvidenceAccess(
        tenantId,
        user!.id,
        params.caseId
      );
      if (!access) return reply(res, 404, { error: "CASE_NOT_FOUND" });
      const rows = await getDb()
        .select({
          id: emergencyEvidenceAssets.id,
          mediaType: emergencyEvidenceAssets.mediaType,
          byteLength: emergencyEvidenceAssets.byteLength,
          sha256: emergencyEvidenceAssets.sha256,
          visibility: emergencyEvidenceAssets.visibility,
          chainJson: emergencyEvidenceAssets.chainJson,
          createdAt: emergencyEvidenceAssets.createdAt,
        })
        .from(emergencyEvidenceAssets)
        .where(
          and(
            eq(emergencyEvidenceAssets.tenantId, tenantId),
            eq(emergencyEvidenceAssets.caseId, params.caseId)
          )
        )
        .orderBy(desc(emergencyEvidenceAssets.createdAt))
        .limit(100);
      return reply(res, 200, {
        items: rows
          .filter(
            row =>
              safeRecord(row.chainJson).phase === "available" &&
              (access.owner ||
                access.command ||
                (access.responder && row.visibility === "responder"))
          )
          .map(row => ({
            id: row.id,
            mediaType: row.mediaType,
            byteLength: row.byteLength,
            sha256: row.sha256,
            visibility: row.visibility,
            createdAt: row.createdAt.toISOString(),
            contentPath: `/api/auth/emergency/evidence/${encodeURIComponent(row.id)}/content`,
          })),
      });
    }
    case "auth.case.evidence.create": {
      if (!requireSameOriginForWrite(req))
        return reply(res, 403, { error: "ORIGIN_REJECTED" });
      const access = await emergencyCaseEvidenceAccess(
        tenantId,
        user!.id,
        params.caseId
      );
      if (!access) return reply(res, 404, { error: "CASE_NOT_FOUND" });
      const parsed = emergencyEvidenceSchema.safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "INVALID_EVIDENCE_METADATA" });
      const key = req.header("idempotency-key")?.trim();
      if (!key || key.length < 8 || key.length > 160)
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      const rate = await consumeSlidingWindow(
        "emergency-evidence-init",
        `${tenantId}:${params.caseId}:user:${user!.id}`,
        20,
        3600
      );
      if (!rate.allowed) {
        res.setHeader("Retry-After", String(rate.retryAfterSeconds ?? 3600));
        return reply(res, 429, { error: "EVIDENCE_UPLOAD_RATE_LIMITED" });
      }
      try {
        const result = await createEmergencyEvidenceUpload({
          tenantId,
          caseId: params.caseId,
          reportId: null,
          actorRef: String(user!.id),
          visibility:
            access.responder && !access.owner && !access.command
              ? "responder"
              : "restricted",
          requestKey: key,
          file: parsed.data,
        });
        return result === "idempotency_reused"
          ? reply(res, 409, { error: "IDEMPOTENCY_KEY_REUSED" })
          : result === "not_found"
            ? reply(res, 404, { error: "EVIDENCE_NOT_FOUND" })
            : result === "quota"
              ? reply(res, 429, { error: "CASE_EVIDENCE_QUOTA_EXCEEDED" })
              : result === "storage_cleanup"
                ? reply(res, 503, { error: "EVIDENCE_STAGING_CLEANUP_PENDING" })
                : reply(res, result.uploaded ? 200 : 201, result);
      } catch {
        return reply(res, 503, {
          error: "EMERGENCY_EVIDENCE_STORAGE_UNAVAILABLE",
        });
      }
    }
    case "auth.evidence.complete": {
      if (!requireSameOriginForWrite(req))
        return reply(res, 403, { error: "ORIGIN_REJECTED" });
      const key = req.header("idempotency-key")?.trim();
      if (!key || key.length < 8 || key.length > 160)
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      const [asset] = await getDb()
        .select({
          id: emergencyEvidenceAssets.id,
          caseId: emergencyEvidenceAssets.caseId,
        })
        .from(emergencyEvidenceAssets)
        .where(
          and(
            eq(emergencyEvidenceAssets.tenantId, tenantId),
            eq(emergencyEvidenceAssets.id, params.evidenceId)
          )
        )
        .limit(1);
      if (
        !asset ||
        !asset.caseId ||
        !(await emergencyCaseEvidenceAccess(tenantId, user!.id, asset.caseId))
      )
        return reply(res, 404, { error: "EVIDENCE_NOT_FOUND" });
      const rate = await consumeSlidingWindow(
        "emergency-evidence-complete",
        `${tenantId}:${asset.caseId}:user:${user!.id}`,
        10,
        60
      );
      if (!rate.allowed) {
        res.setHeader("Retry-After", String(rate.retryAfterSeconds ?? 60));
        return reply(res, 429, { error: "EVIDENCE_COMPLETE_RATE_LIMITED" });
      }
      const result = await completeEmergencyEvidence(
        tenantId,
        asset.id,
        String(user!.id),
        key
      ).catch(() => "unavailable" as const);
      return result === "not_found"
        ? reply(res, 404, { error: "EVIDENCE_NOT_FOUND" })
        : result === "metadata_mismatch" || result === "checksum_mismatch"
          ? reply(res, 422, { error: `EVIDENCE_${result.toUpperCase()}` })
          : result === "expired"
            ? reply(res, 410, { error: "EVIDENCE_UPLOAD_EXPIRED" })
            : result === "busy"
              ? reply(res, 409, { error: "EVIDENCE_VERIFICATION_IN_PROGRESS" })
              : result === "unavailable"
                ? reply(res, 503, {
                    error: "EMERGENCY_EVIDENCE_STORAGE_UNAVAILABLE",
                  })
                : reply(res, 200, {
                    completed: result === "completed",
                    duplicate: result === "duplicate",
                  });
    }
    case "auth.evidence.content": {
      const [asset] = await getDb()
        .select()
        .from(emergencyEvidenceAssets)
        .where(
          and(
            eq(emergencyEvidenceAssets.tenantId, tenantId),
            eq(emergencyEvidenceAssets.id, params.evidenceId)
          )
        )
        .limit(1);
      const access = asset?.caseId
        ? await emergencyCaseEvidenceAccess(tenantId, user!.id, asset.caseId)
        : null;
      const mayRead = Boolean(
        access &&
        (access.owner ||
          access.command ||
          (access.responder && asset?.visibility === "responder"))
      );
      if (
        !asset ||
        !asset.caseId ||
        safeRecord(asset.chainJson).phase !== "available" ||
        !mayRead
      ) {
        return reply(res, 404, { error: "EVIDENCE_NOT_FOUND" });
      }
      try {
        await assertR2StorageActive();
        const stored = await storageStreamFile(asset.objectRef);
        if (!stored)
          return reply(res, 503, {
            error: "EMERGENCY_EVIDENCE_STORAGE_UNAVAILABLE",
          });
        res.status(200).setHeader("content-type", asset.mediaType);
        res.setHeader("content-length", String(asset.byteLength));
        res.setHeader(
          "content-disposition",
          `attachment; filename="emergency-evidence-${asset.id}"`
        );
        res.setHeader("cache-control", "private, no-store");
        res.setHeader("x-content-type-options", "nosniff");
        for await (const chunk of stored.stream as AsyncIterable<
          Buffer | Uint8Array | string
        >)
          res.write(chunk);
        return res.end();
      } catch {
        return reply(res, 503, {
          error: "EMERGENCY_EVIDENCE_STORAGE_UNAVAILABLE",
        });
      }
    }
    case "auth.cases.list": {
      const rows = await getDb()
        .select({
          id: emergencyCases.id,
          reportId: emergencyCases.reportId,
          status: emergencyCases.status,
          revision: emergencyCases.revision,
          createdAt: emergencyCases.createdAt,
          updatedAt: emergencyCases.updatedAt,
        })
        .from(emergencyCases)
        .where(
          and(
            eq(emergencyCases.tenantId, tenantId),
            eq(emergencyCases.reporterUserId, user!.id)
          )
        )
        .orderBy(desc(emergencyCases.updatedAt))
        .limit(100);
      return reply(res, 200, { items: rows });
    }
    case "auth.case.detail": {
      const [row] = await getDb()
        .select()
        .from(emergencyCases)
        .where(
          and(
            eq(emergencyCases.tenantId, tenantId),
            eq(emergencyCases.id, params.caseId)
          )
        )
        .limit(1);
      if (!row) return reply(res, 404, { error: "CASE_NOT_FOUND" });
      const owner = row.reporterUserId === user!.id;
      const commandAccess = await hasCapability(
        tenantId,
        user!.id,
        "emergency.command"
      );
      const commandScopedAccess = await hasCapability(
        tenantId,
        user!.id,
        "emergency.command",
        { scopeType: "case", scopeRef: row.id }
      );
      const [assignment] = await getDb()
        .select({ id: emergencyAssignments.id })
        .from(emergencyAssignments)
        .where(
          and(
            eq(emergencyAssignments.tenantId, tenantId),
            eq(emergencyAssignments.caseId, row.id),
            eq(emergencyAssignments.responderUserId, user!.id),
            inArray(emergencyAssignments.status, [
              "offered",
              "accepted",
              "en_route",
              "working",
            ])
          )
        )
        .limit(1);
      const responderAccess = Boolean(
        assignment &&
        (await hasCapability(tenantId, user!.id, "emergency.respond", {
          scopeType: "case",
          scopeRef: row.id,
        }))
      );
      if (!owner && !commandAccess && !commandScopedAccess && !responderAccess)
        return reply(res, 404, { error: "CASE_NOT_FOUND" });
      const events = await getDb()
        .select({
          eventType: emergencyCaseEvents.eventType,
          reason:
            owner || commandAccess || commandScopedAccess
              ? emergencyCaseEvents.reason
              : sql<string>`'Case activity updated'`,
          revision: emergencyCaseEvents.revision,
          createdAt: emergencyCaseEvents.createdAt,
        })
        .from(emergencyCaseEvents)
        .where(
          and(
            eq(emergencyCaseEvents.tenantId, tenantId),
            eq(emergencyCaseEvents.caseId, row.id)
          )
        )
        .orderBy(desc(emergencyCaseEvents.revision))
        .limit(100);
      const context = safeRecord(row.caseContextJson);
      const disclosureAssignments = owner
        ? await getDb()
            .select({
              id: emergencyAssignments.id,
              status: emergencyAssignments.status,
            })
            .from(emergencyAssignments)
            .where(
              and(
                eq(emergencyAssignments.tenantId, tenantId),
                eq(emergencyAssignments.caseId, row.id),
                inArray(emergencyAssignments.status, [
                  "offered",
                  "accepted",
                  "en_route",
                  "working",
                ])
              )
            )
            .orderBy(desc(emergencyAssignments.updatedAt))
            .limit(50)
        : [];
      const activeDisclosureGrants = owner
        ? await getDb()
            .select({
              id: emergencyDisclosureGrants.id,
              resourceRef: emergencyDisclosureGrants.resourceRef,
              fields: emergencyDisclosureGrants.fields,
              expiresAt: emergencyDisclosureGrants.expiresAt,
            })
            .from(emergencyDisclosureGrants)
            .innerJoin(
              emergencyAssignments,
              and(
                eq(
                  emergencyAssignments.id,
                  emergencyDisclosureGrants.resourceRef
                ),
                eq(
                  emergencyAssignments.tenantId,
                  emergencyDisclosureGrants.tenantId
                )
              )
            )
            .where(
              and(
                eq(emergencyDisclosureGrants.tenantId, tenantId),
                eq(emergencyDisclosureGrants.subjectRef, `user:${user!.id}`),
                eq(emergencyDisclosureGrants.resourceType, "assignment"),
                eq(emergencyAssignments.caseId, row.id),
                isNull(emergencyDisclosureGrants.revokedAt),
                gt(emergencyDisclosureGrants.expiresAt, new Date())
              )
            )
            .limit(50)
        : [];
      return reply(res, 200, {
        item: {
          id: row.id,
          status: row.status,
          revision: row.revision,
          context: owner
            ? {
                intakeStatus: context.intakeStatus,
                citizenSummary: context.citizenSummary,
                citizenNotes: context.citizenNotes,
              }
            : commandAccess || commandScopedAccess
              ? { intakeStatus: context.intakeStatus, triage: context.triage }
              : { intakeStatus: context.intakeStatus },
          events,
          ...(owner ? { disclosureAssignments, activeDisclosureGrants } : {}),
        },
      });
    }
    case "auth.case.disclosure.create": {
      const parsed = disclosureGrantSchema.safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "INVALID_DISCLOSURE_GRANT" });
      const expiresAt = new Date(parsed.data.expiresAt);
      const now = new Date();
      if (
        expiresAt <= now ||
        expiresAt.getTime() > now.getTime() + 2 * 60 * 60_000
      )
        return reply(res, 422, { error: "DISCLOSURE_EXPIRY_OUT_OF_RANGE" });
      const idempotencyKey = req.header("idempotency-key")?.trim();
      if (
        !idempotencyKey ||
        idempotencyKey.length < 8 ||
        idempotencyKey.length > 160
      )
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      const fingerprint = requestFingerprint(parsed.data);
      const outcome = await getDb().transaction(async tx => {
        const [caseRow] = await tx
          .select()
          .from(emergencyCases)
          .where(
            and(
              eq(emergencyCases.tenantId, tenantId),
              eq(emergencyCases.id, params.caseId)
            )
          )
          .for("update")
          .limit(1);
        if (!caseRow || caseRow.reporterUserId !== user!.id)
          return "not_owner" as const;
        const triage = safeRecord(safeRecord(caseRow.caseContextJson).triage);
        const jurisdictionRef =
          typeof triage.jurisdictionRef === "string"
            ? triage.jurisdictionRef
            : "";
        if (!jurisdictionRef) return "jurisdiction_required" as const;
        const [assignment] = await tx
          .select()
          .from(emergencyAssignments)
          .where(
            and(
              eq(emergencyAssignments.tenantId, tenantId),
              eq(emergencyAssignments.caseId, caseRow.id),
              eq(emergencyAssignments.id, parsed.data.assignmentId),
              inArray(emergencyAssignments.status, [
                "offered",
                "accepted",
                "en_route",
                "working",
              ])
            )
          )
          .limit(1);
        if (
          !assignment ||
          !(await hasCapability(
            tenantId,
            assignment.responderUserId,
            "emergency.respond",
            { scopeType: "case", scopeRef: caseRow.id }
          ))
        )
          return "assignment_unavailable" as const;
        const eventIdempotencyKey = `disclosure-grant:${caseRow.id}:${sha256(idempotencyKey)}`;
        const [existingEvent] = await tx
          .select({
            subjectId: emergencyAuditEvents.subjectId,
            afterJson: emergencyAuditEvents.afterJson,
          })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.eventIdempotencyKey, eventIdempotencyKey)
            )
          )
          .limit(1);
        if (existingEvent)
          return safeRecord(existingEvent.afterJson).requestFingerprint ===
            fingerprint
            ? ({ id: existingEvent.subjectId, duplicate: true } as const)
            : ("idempotency_reused" as const);
        const grantId = randomUUID();
        const auditInput = {
          tenantId,
          subjectType: "disclosure",
          subjectId: grantId,
          actorType: "user",
          actorRef: String(user!.id),
          eventType: "disclosure_granted",
          reason: "Case owner authorized assignment-specific disclosure",
          after: {
            fields: parsed.data.fields,
            recipientRef: `user:${assignment.responderUserId}`,
            resourceRef: assignment.id,
            jurisdictionRef,
            expiresAt: expiresAt.toISOString(),
            requestFingerprint: fingerprint,
          },
          createdAt: now.toISOString(),
        };
        const [audit] = await tx
          .insert(emergencyAuditEvents)
          .values({
            ...auditInput,
            eventIdempotencyKey,
            eventHash: auditHash(auditInput),
            afterJson: auditInput.after,
            createdAt: now,
          })
          .returning({ id: emergencyAuditEvents.id });
        await tx.insert(emergencyDisclosureGrants).values({
          id: grantId,
          tenantId,
          subjectRef: `user:${user!.id}`,
          recipientRef: `user:${assignment.responderUserId}`,
          purpose: "task-response",
          resourceType: "assignment",
          resourceRef: assignment.id,
          fields: parsed.data.fields,
          jurisdictionRef,
          expiresAt,
          auditEventId: audit.id,
          createdAt: now,
        });
        await tx.insert(emergencyConsentReceipts).values({
          id: randomUUID(),
          tenantId,
          caseId: caseRow.id,
          subjectUserId: user!.id,
          purpose: "task-response",
          dataCategoriesJson: parsed.data.fields,
          recipientScopeJson: {
            assignmentId: assignment.id,
            grantId,
            recipientRef: `user:${assignment.responderUserId}`,
            jurisdictionRef,
            expiresAt: expiresAt.toISOString(),
          },
          legalBasis: "consent",
          decision: "granted",
          createdAt: now,
        });
        return { id: grantId, duplicate: false } as const;
      });
      if (outcome === "not_owner")
        return reply(res, 404, { error: "CASE_NOT_FOUND" });
      if (outcome === "jurisdiction_required")
        return reply(res, 409, { error: "CASE_JURISDICTION_REQUIRED" });
      if (outcome === "assignment_unavailable")
        return reply(res, 404, { error: "ASSIGNMENT_NOT_AVAILABLE" });
      if (outcome === "idempotency_reused")
        return reply(res, 409, { error: "IDEMPOTENCY_KEY_REUSED" });
      return reply(res, outcome.duplicate ? 200 : 201, {
        grantId: outcome.id,
        duplicate: outcome.duplicate,
      });
    }
    case "auth.case.disclosure.revoke": {
      const now = new Date();
      const outcome = await getDb().transaction(async tx => {
        const [caseRow] = await tx
          .select({
            id: emergencyCases.id,
            reporterUserId: emergencyCases.reporterUserId,
          })
          .from(emergencyCases)
          .where(
            and(
              eq(emergencyCases.tenantId, tenantId),
              eq(emergencyCases.id, params.caseId)
            )
          )
          .limit(1);
        if (!caseRow || caseRow.reporterUserId !== user!.id)
          return "not_owner" as const;
        const [grant] = await tx
          .select()
          .from(emergencyDisclosureGrants)
          .where(
            and(
              eq(emergencyDisclosureGrants.tenantId, tenantId),
              eq(emergencyDisclosureGrants.id, params.grantId),
              eq(emergencyDisclosureGrants.resourceType, "assignment")
            )
          )
          .for("update")
          .limit(1);
        if (!grant) return "not_found" as const;
        const [assignment] = await tx
          .select({ caseId: emergencyAssignments.caseId })
          .from(emergencyAssignments)
          .where(
            and(
              eq(emergencyAssignments.tenantId, tenantId),
              eq(emergencyAssignments.id, grant.resourceRef)
            )
          )
          .limit(1);
        if (
          !assignment ||
          assignment.caseId !== caseRow.id ||
          grant.subjectRef !== `user:${user!.id}`
        )
          return "not_found" as const;
        if (grant.revokedAt) return "duplicate" as const;
        await tx
          .update(emergencyDisclosureGrants)
          .set({ revokedAt: now, revokedBy: user!.id })
          .where(eq(emergencyDisclosureGrants.id, grant.id));
        await tx
          .update(emergencyConsentReceipts)
          .set({ revokedAt: now })
          .where(
            and(
              eq(emergencyConsentReceipts.tenantId, tenantId),
              eq(emergencyConsentReceipts.caseId, caseRow.id),
              eq(emergencyConsentReceipts.subjectUserId, user!.id),
              eq(emergencyConsentReceipts.purpose, "task-response"),
              sql`${emergencyConsentReceipts.recipientScopeJson}->>'grantId' = ${grant.id}`,
              isNull(emergencyConsentReceipts.revokedAt)
            )
          );
        const auditInput = {
          tenantId,
          subjectType: "disclosure",
          subjectId: grant.id,
          actorType: "user",
          actorRef: String(user!.id),
          eventType: "disclosure_revoked",
          reason: "Case owner revoked assignment-specific disclosure",
          before: { revokedAt: null },
          after: { revokedAt: now.toISOString() },
          createdAt: now.toISOString(),
        };
        await tx.insert(emergencyAuditEvents).values({
          ...auditInput,
          eventIdempotencyKey: `disclosure-revoke:${grant.id}`,
          eventHash: auditHash(auditInput),
          beforeJson: auditInput.before,
          afterJson: auditInput.after,
          createdAt: now,
        });
        return "revoked" as const;
      });
      return outcome === "not_owner" || outcome === "not_found"
        ? reply(res, 404, { error: "DISCLOSURE_GRANT_NOT_FOUND" })
        : reply(res, 200, {
            revoked: outcome === "revoked",
            duplicate: outcome === "duplicate",
          });
    }
    case "auth.case.update": {
      const parsed = caseUpdateSchema.safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "INVALID_CASE_UPDATE" });
      const result = await getDb().transaction(async tx => {
        const [row] = await tx
          .select()
          .from(emergencyCases)
          .where(
            and(
              eq(emergencyCases.tenantId, tenantId),
              eq(emergencyCases.id, params.caseId)
            )
          )
          .for("update")
          .limit(1);
        if (!row || row.reporterUserId !== user!.id)
          return "not_found" as const;
        if (row.revision !== parsed.data.revision) return "conflict" as const;
        const revision = row.revision + 1;
        const createdAt = new Date();
        const priorNotes = Array.isArray(
          safeRecord(row.caseContextJson).citizenNotes
        )
          ? (safeRecord(row.caseContextJson).citizenNotes as Array<
              Record<string, unknown>
            >)
          : [];
        const context = {
          ...safeRecord(row.caseContextJson),
          citizenNotes: [
            ...priorNotes,
            { text: parsed.data.notes, createdAt: createdAt.toISOString() },
          ].slice(-50),
        };
        const payload = { revision, status: row.status, noteUpdated: true };
        const [previousEvent] = await tx
          .select({ eventHash: emergencyCaseEvents.eventHash })
          .from(emergencyCaseEvents)
          .where(
            and(
              eq(emergencyCaseEvents.tenantId, tenantId),
              eq(emergencyCaseEvents.caseId, row.id)
            )
          )
          .orderBy(desc(emergencyCaseEvents.revision))
          .limit(1);
        const hash = auditHash({
          previousHash: previousEvent?.eventHash ?? null,
          tenantId,
          subjectType: "case",
          subjectId: row.id,
          actorType: "user",
          actorRef: String(user!.id),
          eventType: "citizen_update",
          reason: parsed.data.reason,
          before: { revision: row.revision, status: row.status },
          after: payload,
          createdAt: createdAt.toISOString(),
        });
        const [updated] = await tx
          .update(emergencyCases)
          .set({ revision, caseContextJson: context, updatedAt: createdAt })
          .where(
            and(
              eq(emergencyCases.tenantId, tenantId),
              eq(emergencyCases.id, row.id),
              eq(emergencyCases.revision, row.revision)
            )
          )
          .returning({ id: emergencyCases.id });
        if (!updated) return "conflict" as const;
        await tx.insert(emergencyCaseEvents).values({
          tenantId,
          caseId: row.id,
          eventIdempotencyKey: `citizen-update:${row.id}:${revision}`,
          actorType: "user",
          actorRef: String(user!.id),
          eventType: "citizen_update",
          reason: parsed.data.reason,
          revision,
          eventHash: hash,
          previousHash: previousEvent?.eventHash ?? null,
          payloadJson: payload,
          createdAt,
        });
        return "updated" as const;
      });
      return result === "not_found"
        ? reply(res, 404, { error: "CASE_NOT_FOUND" })
        : result === "conflict"
          ? reply(res, 409, { error: "CASE_REVISION_CONFLICT" })
          : reply(res, 200, { updated: true });
    }
    case "auth.case.messages":
    case "auth.case.message.create": {
      const [caseRow] = await getDb()
        .select({
          id: emergencyCases.id,
          reporterUserId: emergencyCases.reporterUserId,
        })
        .from(emergencyCases)
        .where(
          and(
            eq(emergencyCases.tenantId, tenantId),
            eq(emergencyCases.id, params.caseId)
          )
        )
        .limit(1);
      if (!caseRow) return reply(res, 404, { error: "CASE_NOT_FOUND" });
      const owner = caseRow.reporterUserId === user!.id;
      const commandAccess = await hasCapability(
        tenantId,
        user!.id,
        "emergency.command",
        { scopeType: "case", scopeRef: caseRow.id }
      );
      const responderAccess = await hasCapability(
        tenantId,
        user!.id,
        "emergency.respond",
        { scopeType: "case", scopeRef: caseRow.id }
      );
      if (!owner && !commandAccess && !responderAccess)
        return reply(res, 404, { error: "CASE_NOT_FOUND" });
      if (route.id === "auth.case.messages") {
        const rawCursor =
          typeof req.query.cursor === "string" ? req.query.cursor : "";
        const cursor = rawCursor
          ? decodeSpec260EmergencyMessageCursor(rawCursor)
          : null;
        if (rawCursor && !cursor)
          return reply(res, 400, { error: "MESSAGE_CURSOR_INVALID" });
        const rows = await getDb()
          .select()
          .from(emergencyCaseMessages)
          .where(
            and(
              eq(emergencyCaseMessages.tenantId, tenantId),
              eq(emergencyCaseMessages.caseId, caseRow.id),
              cursor
                ? or(
                    lt(emergencyCaseMessages.createdAt, cursor.createdAt),
                    and(
                      eq(emergencyCaseMessages.createdAt, cursor.createdAt),
                      lt(emergencyCaseMessages.id, cursor.id)
                    )
                  )
                : undefined
            )
          )
          .orderBy(
            desc(emergencyCaseMessages.createdAt),
            desc(emergencyCaseMessages.id)
          )
          .limit(101);
        const page = rows.slice(0, 100);
        const last = page.at(-1);
        const nextCursor =
          rows.length > 100 && last
            ? encodeSpec260EmergencyMessageCursor({
                createdAt: last.createdAt,
                id: last.id,
              })
            : null;
        return reply(res, 200, {
          items: page
            .map(row => ({
              id: row.id,
              senderType: row.senderType,
              body: row.body,
              createdAt: row.createdAt.toISOString(),
            }))
            .reverse(),
          nextCursor,
          hasMore: Boolean(nextCursor),
        });
      }
      const parsed = caseMessageSchema.safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "INVALID_CASE_MESSAGE" });
      const idempotencyKey = req.header("idempotency-key")?.trim();
      if (
        !idempotencyKey ||
        idempotencyKey.length < 8 ||
        idempotencyKey.length > 160
      )
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      const messageKey = `case-message:${caseRow.id}:${sha256(idempotencyKey)}`;
      const result = await getDb().transaction(async tx => {
        const [prior] = await tx
          .select({ id: emergencyCaseMessages.id })
          .from(emergencyCaseMessages)
          .where(
            and(
              eq(emergencyCaseMessages.tenantId, tenantId),
              eq(emergencyCaseMessages.idempotencyKey, messageKey)
            )
          )
          .limit(1);
        if (prior) return { id: prior.id, duplicate: true };
        const now = new Date();
        const senderType = owner
          ? "case_owner"
          : responderAccess
            ? "responder"
            : "operations";
        const [message] = await tx
          .insert(emergencyCaseMessages)
          .values({
            tenantId,
            caseId: caseRow.id,
            senderType,
            senderRef: String(user!.id),
            channel: "case",
            body: parsed.data.body,
            idempotencyKey: messageKey,
            createdAt: now,
          })
          .onConflictDoNothing()
          .returning({ id: emergencyCaseMessages.id });
        if (!message) {
          const [existing] = await tx
            .select({ id: emergencyCaseMessages.id })
            .from(emergencyCaseMessages)
            .where(
              and(
                eq(emergencyCaseMessages.tenantId, tenantId),
                eq(emergencyCaseMessages.idempotencyKey, messageKey)
              )
            )
            .limit(1);
          return existing ? { id: existing.id, duplicate: true } : null;
        }
        const [previousAudit] = await tx
          .select({ eventHash: emergencyAuditEvents.eventHash })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.subjectType, "case"),
              eq(emergencyAuditEvents.subjectId, caseRow.id)
            )
          )
          .orderBy(desc(emergencyAuditEvents.createdAt))
          .limit(1);
        const after = { messageId: message.id, senderType, channel: "case" };
        const audit = {
          tenantId,
          subjectType: "case",
          subjectId: caseRow.id,
          actorType: "user",
          actorRef: String(user!.id),
          eventType: "case_message_created",
          reason: "Authorized case member added a message",
          after,
          previousHash: previousAudit?.eventHash ?? null,
          createdAt: now.toISOString(),
        };
        await tx.insert(emergencyAuditEvents).values({
          ...audit,
          eventIdempotencyKey: messageKey,
          eventHash: auditHash(audit),
          afterJson: after,
          createdAt: now,
        });
        return { id: message.id, duplicate: false };
      });
      return result
        ? reply(res, result.duplicate ? 200 : 201, {
            messageId: result.id,
            duplicate: result.duplicate,
          })
        : reply(res, 503, { error: "CASE_MESSAGE_NOT_SAVED" });
    }
    case "auth.support.history": {
      const rows = await getDb()
        .select({
          poolId: emergencyContributions.poolId,
          amountMinorUnits: emergencyContributions.amountMinorUnits,
          currency: emergencyContributions.currency,
          status: emergencyContributions.status,
          createdAt: emergencyContributions.createdAt,
        })
        .from(emergencyContributions)
        .where(
          and(
            eq(emergencyContributions.tenantId, tenantId),
            eq(emergencyContributions.donorUserId, user!.id)
          )
        )
        .orderBy(desc(emergencyContributions.createdAt))
        .limit(100);
      return reply(res, 200, {
        items: rows.map(row => ({
          amountMinorUnits: row.amountMinorUnits.toString(),
          currency: row.currency,
          status: row.status,
          createdAt: row.createdAt.toISOString(),
        })),
      });
    }
    case "verified.response.assignments": {
      const rows = await getDb()
        .select()
        .from(emergencyAssignments)
        .where(
          and(
            eq(emergencyAssignments.tenantId, tenantId),
            eq(emergencyAssignments.responderUserId, user!.id),
            inArray(emergencyAssignments.status, [
              "offered",
              "accepted",
              "en_route",
              "working",
            ])
          )
        )
        .orderBy(desc(emergencyAssignments.updatedAt))
        .limit(100);
      const visible = await Promise.all(
        rows.map(async row => {
          const responderAllowed = await hasCapability(
            tenantId,
            user!.id,
            "emergency.respond",
            { scopeType: "case", scopeRef: row.caseId }
          );
          const restrictedAllowed =
            safeRecord(row.scopeJson).safetyClass !== "restricted" ||
            (await hasCapability(
              tenantId,
              user!.id,
              "emergency.respond.restricted",
              { scopeType: "case", scopeRef: row.caseId }
            ));
          const [task] = row.taskId
            ? await getDb()
                .select({ taskJson: emergencyResponseTasks.taskJson })
                .from(emergencyResponseTasks)
                .where(
                  and(
                    eq(emergencyResponseTasks.tenantId, tenantId),
                    eq(emergencyResponseTasks.id, row.taskId)
                  )
                )
                .limit(1)
            : [];
          const [caseContext] = await getDb()
            .select({ context: emergencyCases.caseContextJson })
            .from(emergencyCases)
            .where(
              and(
                eq(emergencyCases.tenantId, tenantId),
                eq(emergencyCases.id, row.caseId)
              )
            )
            .limit(1);
          const triage = safeRecord(safeRecord(caseContext?.context).triage);
          const currentProtocol = getEmergencyProtocolPack({
            hazardCategory: (typeof triage.hazardCategory === "string"
              ? triage.hazardCategory
              : "unknown") as Parameters<
              typeof getEmergencyProtocolPack
            >[0]["hazardCategory"],
            severity: (typeof triage.severity === "string"
              ? triage.severity
              : "unknown") as Parameters<
              typeof getEmergencyProtocolPack
            >[0]["severity"],
          });
          const taskSnapshot = safeRecord(task?.taskJson);
          const protocolCurrent = Boolean(
            row.taskId &&
            taskSnapshot.protocolVersion === currentProtocol.version &&
            JSON.stringify(taskSnapshot.protocolActions) ===
              JSON.stringify(currentProtocol.actions)
          );
          return {
            row,
            allowed: responderAllowed && restrictedAllowed && protocolCurrent,
          };
        })
      );
      const items = await Promise.all(
        visible
          .filter(item => item.allowed)
          .map(async ({ row }) => {
            const [caseRow] = await getDb()
              .select({
                reporterUserId: emergencyCases.reporterUserId,
                reportId: emergencyCases.reportId,
                context: emergencyCases.caseContextJson,
              })
              .from(emergencyCases)
              .where(
                and(
                  eq(emergencyCases.tenantId, tenantId),
                  eq(emergencyCases.id, row.caseId)
                )
              )
              .limit(1);
            const triage = safeRecord(safeRecord(caseRow?.context).triage);
            const jurisdictionRef =
              typeof triage.jurisdictionRef === "string"
                ? triage.jurisdictionRef
                : "";
            const [grant] =
              caseRow?.reporterUserId && jurisdictionRef
                ? await getDb()
                    .select()
                    .from(emergencyDisclosureGrants)
                    .where(
                      and(
                        eq(emergencyDisclosureGrants.tenantId, tenantId),
                        eq(
                          emergencyDisclosureGrants.subjectRef,
                          `user:${caseRow.reporterUserId}`
                        ),
                        eq(
                          emergencyDisclosureGrants.recipientRef,
                          `user:${user!.id}`
                        ),
                        eq(emergencyDisclosureGrants.purpose, "task-response"),
                        eq(
                          emergencyDisclosureGrants.resourceType,
                          "assignment"
                        ),
                        eq(emergencyDisclosureGrants.resourceRef, row.id),
                        eq(
                          emergencyDisclosureGrants.jurisdictionRef,
                          jurisdictionRef
                        ),
                        isNull(emergencyDisclosureGrants.revokedAt),
                        gt(emergencyDisclosureGrants.expiresAt, new Date())
                      )
                    )
                    .orderBy(desc(emergencyDisclosureGrants.createdAt))
                    .limit(1)
                : [];
            const [report] = caseRow?.reportId
              ? await getDb()
                  .select({
                    latitude: sql<
                      number | null
                    >`ST_Y(${emergencyReports.exactLocation}::geometry)::float`,
                    longitude: sql<
                      number | null
                    >`ST_X(${emergencyReports.exactLocation}::geometry)::float`,
                    summary: emergencyReports.summary,
                  })
                  .from(emergencyReports)
                  .where(
                    and(
                      eq(emergencyReports.tenantId, tenantId),
                      eq(emergencyReports.id, caseRow.reportId)
                    )
                  )
                  .limit(1)
              : [];
            const [task] = row.taskId
              ? await getDb()
                  .select({ taskJson: emergencyResponseTasks.taskJson })
                  .from(emergencyResponseTasks)
                  .where(
                    and(
                      eq(emergencyResponseTasks.tenantId, tenantId),
                      eq(emergencyResponseTasks.id, row.taskId)
                    )
                  )
                  .limit(1)
              : [];
            const [need] = row.needId
              ? await getDb()
                  .select({
                    needJson: emergencyNeeds.needJson,
                    needType: emergencyNeeds.needType,
                  })
                  .from(emergencyNeeds)
                  .where(
                    and(
                      eq(emergencyNeeds.tenantId, tenantId),
                      eq(emergencyNeeds.id, row.needId)
                    )
                  )
                  .limit(1)
              : [];
            const source: Record<string, unknown> = {
              ...(report?.latitude !== null &&
              report?.latitude !== undefined &&
              report.longitude !== null &&
              report.longitude !== undefined
                ? {
                    approximateLocation: {
                      latitude: report.latitude,
                      longitude: report.longitude,
                    },
                  }
                : {}),
              ...(need
                ? {
                    needSummary: [
                      need.needType,
                      safeRecord(need.needJson).description,
                    ]
                      .filter(
                        value => typeof value === "string" && value.trim()
                      )
                      .join(": ")
                      .slice(0, 500),
                  }
                : {}),
              ...(typeof safeRecord(task?.taskJson).instructions === "string"
                ? {
                    taskInstructions: (
                      safeRecord(task?.taskJson).instructions as string
                    ).slice(0, 1000),
                  }
                : {}),
            };
            const disclosure = grant
              ? discloseEmergencyFields(
                  source,
                  {
                    ...grant,
                    fields: Array.isArray(grant.fields) ? grant.fields : [],
                    expiresAt: grant.expiresAt.toISOString(),
                    revokedAt: grant.revokedAt?.toISOString() ?? null,
                  },
                  {
                    subjectRef: `user:${caseRow!.reporterUserId}`,
                    recipientRef: `user:${user!.id}`,
                    purpose: "task-response",
                    resourceType: "assignment",
                    resourceRef: row.id,
                    jurisdictionRef,
                    now: new Date(),
                  }
                )
              : null;
            return {
              id: row.id,
              caseId: row.caseId,
              needId: row.needId,
              taskId: row.taskId,
              status: row.status,
              expectedContribution:
                safeRecord(row.scopeJson).expectedContribution ?? null,
              safetyClass: safeRecord(row.scopeJson).safetyClass ?? null,
              protocolActions: Array.isArray(
                safeRecord(task?.taskJson).protocolActions
              )
                ? safeRecord(task?.taskJson).protocolActions
                : [],
              updatedAt: row.updatedAt.toISOString(),
              ...(disclosure ? { disclosure } : {}),
            };
          })
      );
      return reply(res, 200, { items });
    }
    case "verified.response.update": {
      const parsed = assignmentUpdateSchema.safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "INVALID_ASSIGNMENT_UPDATE" });
      const result = await getDb().transaction(async tx => {
        const [row] = await tx
          .select()
          .from(emergencyAssignments)
          .where(
            and(
              eq(emergencyAssignments.tenantId, tenantId),
              eq(emergencyAssignments.id, params.assignmentId),
              eq(emergencyAssignments.responderUserId, user!.id)
            )
          )
          .for("update")
          .limit(1);
        if (!row) return "not_found" as const;
        if (
          !(await hasCapability(tenantId, user!.id, "emergency.respond", {
            scopeType: "case",
            scopeRef: row.caseId,
          }))
        )
          return "responder_capability_revoked" as const;
        if (
          safeRecord(row.scopeJson).safetyClass === "restricted" &&
          !(await hasCapability(
            tenantId,
            user!.id,
            "emergency.respond.restricted",
            { scopeType: "case", scopeRef: row.caseId }
          ))
        )
          return "restricted_responder_revoked" as const;
        const [taskSnapshot] = row.taskId
          ? await tx
              .select({ taskJson: emergencyResponseTasks.taskJson })
              .from(emergencyResponseTasks)
              .where(
                and(
                  eq(emergencyResponseTasks.tenantId, tenantId),
                  eq(emergencyResponseTasks.id, row.taskId)
                )
              )
              .limit(1)
          : [];
        const [caseSnapshot] = await tx
          .select({ context: emergencyCases.caseContextJson })
          .from(emergencyCases)
          .where(
            and(
              eq(emergencyCases.tenantId, tenantId),
              eq(emergencyCases.id, row.caseId)
            )
          )
          .limit(1);
        const currentTriage = safeRecord(
          safeRecord(caseSnapshot?.context).triage
        );
        const currentProtocol = getEmergencyProtocolPack({
          hazardCategory: (typeof currentTriage.hazardCategory === "string"
            ? currentTriage.hazardCategory
            : "unknown") as Parameters<
            typeof getEmergencyProtocolPack
          >[0]["hazardCategory"],
          severity: (typeof currentTriage.severity === "string"
            ? currentTriage.severity
            : "unknown") as Parameters<
            typeof getEmergencyProtocolPack
          >[0]["severity"],
        });
        const taskSnapshotJson = safeRecord(taskSnapshot?.taskJson);
        const protocolCurrent = Boolean(
          row.taskId &&
          taskSnapshotJson.protocolVersion === currentProtocol.version &&
          JSON.stringify(taskSnapshotJson.protocolActions) ===
            JSON.stringify(currentProtocol.actions)
        );
        if (
          !protocolCurrent &&
          !["declined", "safety_stopped"].includes(parsed.data.status)
        )
          return "protocol_stale" as const;
        const fingerprint = requestFingerprint(parsed.data);
        const eventIdempotencyKey = `assignment:${row.id}:${parsed.data.expectedStatus}:${parsed.data.status}`;
        const [alreadyApplied] = await tx
          .select({
            id: emergencyAuditEvents.id,
            afterJson: emergencyAuditEvents.afterJson,
          })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.eventIdempotencyKey, eventIdempotencyKey)
            )
          )
          .limit(1);
        if (alreadyApplied && row.status === parsed.data.status)
          return safeRecord(alreadyApplied.afterJson).requestFingerprint ===
            fingerprint
            ? ("duplicate" as const)
            : ("idempotency_reused" as const);
        if (row.status !== parsed.data.expectedStatus)
          return "conflict" as const;
        const allowed: Record<string, string[]> = {
          offered: ["accepted", "declined"],
          accepted: ["en_route", "working", "declined", "safety_stopped"],
          en_route: ["working", "safety_stopped"],
          working: ["completed", "safety_stopped"],
        };
        if (!allowed[row.status]?.includes(parsed.data.status))
          return "transition" as const;
        const nextTaskStatus: Record<string, string> = {
          accepted: "claimed",
          en_route: "in_progress",
          working: "in_progress",
          completed: "completed",
        };
        const [task] = row.taskId
          ? await tx
              .select()
              .from(emergencyResponseTasks)
              .where(
                and(
                  eq(emergencyResponseTasks.tenantId, tenantId),
                  eq(emergencyResponseTasks.id, row.taskId)
                )
              )
              .for("update")
              .limit(1)
          : [];
        const requestedTaskStatus = nextTaskStatus[parsed.data.status];
        if (
          requestedTaskStatus &&
          (!task ||
            !canTransitionStoredEmergencyTask(task.status, requestedTaskStatus))
        )
          return "conflict" as const;
        if (
          task &&
          ["declined", "safety_stopped"].includes(parsed.data.status)
        ) {
          const activeOthers = await tx
            .select({ id: emergencyAssignments.id })
            .from(emergencyAssignments)
            .where(
              and(
                eq(emergencyAssignments.tenantId, tenantId),
                eq(emergencyAssignments.taskId, task.id),
                ne(emergencyAssignments.id, row.id),
                inArray(emergencyAssignments.status, [
                  "offered",
                  "accepted",
                  "en_route",
                  "working",
                ])
              )
            )
            .limit(1);
          if (!activeOthers.length) {
            const safetyHistory = await tx
              .select({ id: emergencyAssignments.id })
              .from(emergencyAssignments)
              .where(
                and(
                  eq(emergencyAssignments.tenantId, tenantId),
                  eq(emergencyAssignments.taskId, task.id),
                  eq(emergencyAssignments.status, "safety_stopped")
                )
              )
              .limit(1);
            const terminalTaskStatus =
              parsed.data.status === "safety_stopped" ||
              safetyHistory.length > 0
                ? "blocked"
                : "ready";
            if (
              !canTransitionStoredEmergencyTask(task.status, terminalTaskStatus)
            )
              return "conflict" as const;
          }
        }
        let lockedNeed: typeof emergencyNeeds.$inferSelect | undefined;
        if (parsed.data.status === "completed" && row.taskId) {
          const activeOthers = await tx
            .select({ id: emergencyAssignments.id })
            .from(emergencyAssignments)
            .where(
              and(
                eq(emergencyAssignments.tenantId, tenantId),
                eq(emergencyAssignments.taskId, row.taskId!),
                ne(emergencyAssignments.id, row.id),
                inArray(emergencyAssignments.status, [
                  "offered",
                  "accepted",
                  "en_route",
                  "working",
                ])
              )
            )
            .limit(1);
          if (activeOthers.length) return "other_assignments_active" as const;
        }
        if (parsed.data.status === "completed" && row.needId) {
          const [need] = await tx
            .select()
            .from(emergencyNeeds)
            .where(
              and(
                eq(emergencyNeeds.tenantId, tenantId),
                eq(emergencyNeeds.id, row.needId)
              )
            )
            .for("update")
            .limit(1);
          if (!need) return "need_not_found" as const;
          lockedNeed = need;
          const expectedValue = safeRecord(row.scopeJson).expectedContribution;
          const expected =
            typeof expectedValue === "number"
              ? expectedValue
              : Number(expectedValue);
          const actual = parsed.data.actualContribution;
          if (
            !Number.isFinite(expected) ||
            expected <= 0 ||
            actual === undefined ||
            actual > expected
          )
            return "contribution_invalid" as const;
          const nextFulfilledMilli =
            quantityMilli(need.fulfilledQuantity) + quantityMilli(actual);
          const completionStatus =
            need.requestedQuantity !== null &&
            nextFulfilledMilli >= quantityMilli(need.requestedQuantity)
              ? "fulfilled"
              : "partially_fulfilled";
          if (!canTransitionStoredEmergencyNeed(need.status, completionStatus))
            return "need_terminal" as const;
          if (
            need.requestedQuantity !== null &&
            nextFulfilledMilli > quantityMilli(need.requestedQuantity)
          )
            return "contribution_over_requested" as const;
        } else if (parsed.data.actualContribution !== undefined)
          return "contribution_unexpected" as const;
        const now = new Date();
        const [updated] = await tx
          .update(emergencyAssignments)
          .set({ status: parsed.data.status, updatedAt: now })
          .where(
            and(
              eq(emergencyAssignments.id, row.id),
              eq(emergencyAssignments.status, row.status)
            )
          )
          .returning({ id: emergencyAssignments.id });
        if (!updated) return "conflict" as const;
        const [previousAudit] = await tx
          .select({ eventHash: emergencyAuditEvents.eventHash })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.subjectType, "assignment"),
              eq(emergencyAuditEvents.subjectId, row.id)
            )
          )
          .orderBy(desc(emergencyAuditEvents.createdAt))
          .limit(1);
        const auditInput = {
          tenantId,
          subjectType: "assignment",
          subjectId: row.id,
          actorType: "user",
          actorRef: String(user!.id),
          eventType: "assignment_status_changed",
          reason: parsed.data.reason,
          before: { status: row.status },
          after: {
            status: parsed.data.status,
            requestFingerprint: fingerprint,
          },
          previousHash: previousAudit?.eventHash ?? null,
          createdAt: now.toISOString(),
        };
        await tx.insert(emergencyAuditEvents).values({
          ...auditInput,
          eventIdempotencyKey,
          eventHash: auditHash(auditInput),
          beforeJson: { status: row.status },
          afterJson: auditInput.after,
          createdAt: now,
        });
        if (task && requestedTaskStatus) {
          await tx
            .update(emergencyResponseTasks)
            .set({ status: requestedTaskStatus, updatedAt: now })
            .where(eq(emergencyResponseTasks.id, task.id));
          const taskAudit = {
            tenantId,
            subjectType: "response_task",
            subjectId: task.id,
            actorType: "user",
            actorRef: String(user!.id),
            eventType: `task_${requestedTaskStatus}`,
            reason: `Responder assignment ${parsed.data.status}`,
            before: { status: task.status },
            after: { status: requestedTaskStatus, assignmentId: row.id },
            createdAt: now.toISOString(),
          };
          await tx.insert(emergencyAuditEvents).values({
            ...taskAudit,
            eventIdempotencyKey: `${eventIdempotencyKey}:task`,
            eventHash: auditHash(taskAudit),
            beforeJson: taskAudit.before,
            afterJson: taskAudit.after,
            createdAt: now,
          });
        } else if (
          task &&
          ["declined", "safety_stopped"].includes(parsed.data.status)
        ) {
          const active = await tx
            .select({ id: emergencyAssignments.id })
            .from(emergencyAssignments)
            .where(
              and(
                eq(emergencyAssignments.tenantId, tenantId),
                eq(emergencyAssignments.taskId, task.id),
                inArray(emergencyAssignments.status, [
                  "offered",
                  "accepted",
                  "en_route",
                  "working",
                ])
              )
            )
            .limit(1);
          if (active.length === 0) {
            const history = await tx
              .select({ status: emergencyAssignments.status })
              .from(emergencyAssignments)
              .where(
                and(
                  eq(emergencyAssignments.tenantId, tenantId),
                  eq(emergencyAssignments.taskId, task.id)
                )
              );
            const taskStatusAfter =
              parsed.data.status === "safety_stopped" ||
              history.some(assignment => assignment.status === "safety_stopped")
                ? "blocked"
                : "ready";
            await tx
              .update(emergencyResponseTasks)
              .set({ status: taskStatusAfter, updatedAt: now })
              .where(eq(emergencyResponseTasks.id, task.id));
            const taskAudit = {
              tenantId,
              subjectType: "response_task",
              subjectId: task.id,
              actorType: "user",
              actorRef: String(user!.id),
              eventType:
                taskStatusAfter === "blocked"
                  ? "task_blocked_for_safety"
                  : "task_reopened_after_decline",
              reason:
                taskStatusAfter === "blocked"
                  ? "No active responders remain after a safety stop"
                  : "All offered responders declined",
              before: { status: task.status },
              after: { status: taskStatusAfter, assignmentId: row.id },
              createdAt: now.toISOString(),
            };
            await tx.insert(emergencyAuditEvents).values({
              ...taskAudit,
              eventIdempotencyKey: `${eventIdempotencyKey}:task`,
              eventHash: auditHash(taskAudit),
              beforeJson: taskAudit.before,
              afterJson: taskAudit.after,
              createdAt: now,
            });
          }
        }
        if (lockedNeed && parsed.data.actualContribution !== undefined) {
          const fulfilledMilli =
            quantityMilli(lockedNeed.fulfilledQuantity) +
            quantityMilli(parsed.data.actualContribution);
          const fulfilled = fulfilledMilli / 1000;
          const complete =
            lockedNeed.requestedQuantity !== null &&
            fulfilledMilli >= quantityMilli(lockedNeed.requestedQuantity);
          const nextStatus = complete ? "fulfilled" : "partially_fulfilled";
          const [updatedNeed] = await tx
            .update(emergencyNeeds)
            .set({
              fulfilledQuantity: quantityDecimal(fulfilledMilli),
              status: nextStatus,
              revision: lockedNeed.revision + 1,
              updatedAt: now,
            })
            .where(
              and(
                eq(emergencyNeeds.tenantId, tenantId),
                eq(emergencyNeeds.id, lockedNeed.id),
                eq(emergencyNeeds.revision, lockedNeed.revision)
              )
            )
            .returning({ id: emergencyNeeds.id });
          if (!updatedNeed)
            throw new Error("EMERGENCY_NEED_REVISION_LOCK_LOST");
          const needAudit = {
            tenantId,
            subjectType: "need",
            subjectId: lockedNeed.id,
            actorType: "user",
            actorRef: String(user!.id),
            eventType: "need_contribution_recorded",
            reason: "Responder completed an assigned contribution",
            before: {
              fulfilledQuantity: Number(lockedNeed.fulfilledQuantity),
              status: lockedNeed.status,
            },
            after: {
              fulfilledQuantity: fulfilled,
              status: nextStatus,
              assignmentId: row.id,
              actualContribution: parsed.data.actualContribution,
            },
            createdAt: now.toISOString(),
          };
          await tx.insert(emergencyAuditEvents).values({
            ...needAudit,
            eventIdempotencyKey: `${eventIdempotencyKey}:need`,
            eventHash: auditHash(needAudit),
            beforeJson: needAudit.before,
            afterJson: needAudit.after,
            createdAt: now,
          });
        }
        return "updated" as const;
      });
      return result === "not_found"
        ? reply(res, 404, { error: "ASSIGNMENT_NOT_FOUND" })
        : result === "protocol_stale"
          ? reply(res, 409, {
              error: "ASSIGNMENT_PROTOCOL_STALE_STOP_OR_DECLINE",
            })
          : result === "responder_capability_revoked"
            ? reply(res, 403, { error: "RESPONDER_CASE_CAPABILITY_REVOKED" })
            : result === "restricted_responder_revoked"
              ? reply(res, 403, {
                  error: "RESTRICTED_RESPONSE_CAPABILITY_REVOKED",
                })
              : result === "idempotency_reused"
                ? reply(res, 409, { error: "IDEMPOTENCY_KEY_REUSED" })
                : result === "conflict"
                  ? reply(res, 409, { error: "ASSIGNMENT_STATUS_CONFLICT" })
                  : result === "transition"
                    ? reply(res, 422, {
                        error: "ASSIGNMENT_TRANSITION_INVALID",
                      })
                    : result === "other_assignments_active"
                      ? reply(res, 409, {
                          error: "OTHER_RESPONDERS_STILL_ACTIVE",
                        })
                      : result === "need_not_found"
                        ? reply(res, 404, { error: "NEED_NOT_FOUND" })
                        : result === "need_terminal"
                          ? reply(res, 409, {
                              error: "NEED_NOT_ACCEPTING_FULFILLMENT",
                            })
                          : result === "contribution_invalid" ||
                              result === "contribution_over_requested" ||
                              result === "contribution_unexpected"
                            ? reply(res, 422, { error: result.toUpperCase() })
                            : reply(res, 200, {
                                updated: true,
                                duplicate: result === "duplicate",
                              });
    }
    case "operations.command.situations": {
      const rows = await getDb()
        .select()
        .from(emergencySituations)
        .where(eq(emergencySituations.tenantId, tenantId))
        .orderBy(desc(emergencySituations.updatedAt))
        .limit(200);
      return reply(res, 200, {
        items: rows.map(row => ({
          id: row.id,
          publicRef: row.publicRef,
          status: row.status,
          severity: row.severity,
          updatedAt: row.updatedAt.toISOString(),
        })),
      });
    }
    case "operations.command.alerts": {
      const rows = await getDb()
        .select()
        .from(emergencyPublicAlerts)
        .where(eq(emergencyPublicAlerts.tenantId, tenantId))
        .orderBy(desc(emergencyPublicAlerts.updatedAt))
        .limit(200);
      return reply(res, 200, {
        items: rows.map(row => {
          const content = safeRecord(row.messageJson);
          return {
            id: row.id,
            publicRef: row.publicRef,
            status: row.status,
            severity: row.severity,
            title: typeof content.title === "string" ? content.title : "",
            message: typeof content.message === "string" ? content.message : "",
            situationId: row.situationId,
            issuedAt: row.issuedAt?.toISOString() ?? null,
            expiresAt: row.expiresAt?.toISOString() ?? null,
          };
        }),
      });
    }
    case "operations.command.alert.create": {
      const parsed = alertCreateSchema.safeParse(req.body);
      if (!parsed.success) return reply(res, 400, { error: "INVALID_ALERT" });
      const publicGeometry =
        parsed.data.publicGeometry === undefined
          ? null
          : normalizeEmergencyAlertGeometry(parsed.data.publicGeometry);
      if (parsed.data.publicGeometry !== undefined && !publicGeometry)
        return reply(res, 400, { error: "INVALID_PUBLIC_ALERT_GEOMETRY" });
      const alertExpiresAt = parsed.data.expiresAt
        ? new Date(parsed.data.expiresAt)
        : parsed.data.status === "published"
          ? new Date(Date.now() + 24 * 60 * 60_000)
          : null;
      if (
        alertExpiresAt &&
        (alertExpiresAt <= new Date() ||
          alertExpiresAt.getTime() > Date.now() + 7 * 24 * 60 * 60_000)
      ) {
        return reply(res, 400, { error: "ALERT_EXPIRY_OUT_OF_RANGE" });
      }
      if (
        parsed.data.status === "published" &&
        user!.role !== "admin" &&
        !(await hasCapability(tenantId, user!.id, "emergency.verify"))
      ) {
        return reply(res, 403, {
          error: "EMERGENCY_PUBLICATION_REQUIRES_VERIFICATION_CAPABILITY",
        });
      }
      const idempotencyKey = req.header("idempotency-key")?.trim();
      if (
        !idempotencyKey ||
        idempotencyKey.length < 8 ||
        idempotencyKey.length > 160
      )
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      if (parsed.data.situationId) {
        const [situation] = await getDb()
          .select({ id: emergencySituations.id })
          .from(emergencySituations)
          .where(
            and(
              eq(emergencySituations.tenantId, tenantId),
              eq(emergencySituations.id, parsed.data.situationId)
            )
          )
          .limit(1);
        if (!situation)
          return reply(res, 404, { error: "SITUATION_NOT_FOUND" });
      }
      const id = randomUUID();
      const now = new Date();
      const key = `alert:create:${sha256(idempotencyKey)}`;
      const result = await getDb().transaction(async tx => {
        const [prior] = await tx
          .select({ subjectId: emergencyAuditEvents.subjectId })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.eventIdempotencyKey, key)
            )
          )
          .limit(1);
        if (prior) return prior.subjectId;
        await tx.insert(emergencyPublicAlerts).values({
          id,
          tenantId,
          situationId: parsed.data.situationId ?? null,
          publicRef: publicRef("ALT"),
          status: parsed.data.status,
          severity: parsed.data.severity,
          publicGeometryJson: publicGeometry,
          messageJson: {
            title: parsed.data.title,
            message: parsed.data.message,
            sourceStatus: "unverified",
            spatialDisclosureClass: parsed.data.spatialDisclosureClass,
          },
          issuedAt: parsed.data.status === "published" ? now : null,
          expiresAt: alertExpiresAt,
          updatedAt: now,
        });
        const auditInput = {
          tenantId,
          subjectType: "alert",
          subjectId: id,
          actorType: "user",
          actorRef: String(user!.id),
          eventType:
            parsed.data.status === "published"
              ? "alert_published"
              : "alert_drafted",
          reason: "Emergency alert created by authorized operator",
          after: {
            status: parsed.data.status,
            severity: parsed.data.severity,
            situationId: parsed.data.situationId ?? null,
            publicGeometry,
            expiresAt: alertExpiresAt?.toISOString() ?? null,
          },
          createdAt: now.toISOString(),
        };
        await tx.insert(emergencyAuditEvents).values({
          ...auditInput,
          eventIdempotencyKey: key,
          eventHash: auditHash(auditInput),
          afterJson: auditInput.after,
          createdAt: now,
        });
        return id;
      });
      return reply(res, 201, { created: true, alertId: result });
    }
    case "operations.command.alert.update": {
      const parsed = alertUpdateSchema.safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "INVALID_ALERT_UPDATE" });
      const publicGeometry =
        parsed.data.publicGeometry === undefined ||
        parsed.data.publicGeometry === null
          ? parsed.data.publicGeometry
          : normalizeEmergencyAlertGeometry(parsed.data.publicGeometry);
      if (
        parsed.data.publicGeometry !== undefined &&
        parsed.data.publicGeometry !== null &&
        !publicGeometry
      )
        return reply(res, 400, { error: "INVALID_PUBLIC_ALERT_GEOMETRY" });
      if (
        user!.role !== "admin" &&
        !(await hasCapability(tenantId, user!.id, "emergency.verify"))
      ) {
        return reply(res, 403, {
          error: "EMERGENCY_PUBLICATION_REQUIRES_VERIFICATION_CAPABILITY",
        });
      }
      const idempotencyKey = req.header("idempotency-key")?.trim();
      if (
        !idempotencyKey ||
        idempotencyKey.length < 8 ||
        idempotencyKey.length > 160
      )
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      const result = await getDb().transaction(async tx => {
        const key = `alert:update:${params.alertId}:${sha256(idempotencyKey)}`;
        const [prior] = await tx
          .select({ id: emergencyAuditEvents.id })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.eventIdempotencyKey, key)
            )
          )
          .limit(1);
        if (prior) return "duplicate" as const;
        const [row] = await tx
          .select()
          .from(emergencyPublicAlerts)
          .where(
            and(
              eq(emergencyPublicAlerts.tenantId, tenantId),
              eq(emergencyPublicAlerts.id, params.alertId)
            )
          )
          .for("update")
          .limit(1);
        if (!row) return "not_found" as const;
        if (row.status !== parsed.data.expectedStatus)
          return "conflict" as const;
        const nextStatusAllowed: Record<string, string[]> = {
          published: ["updated", "cancelled", "expired"],
          updated: ["updated", "cancelled", "expired"],
        };
        if (!nextStatusAllowed[row.status]?.includes(parsed.data.status))
          return "transition" as const;
        const now = new Date();
        const before = {
          status: row.status,
          severity: row.severity,
          message: row.messageJson,
          publicGeometry: row.publicGeometryJson,
        };
        const currentMessage = safeRecord(row.messageJson);
        const nextMessage = {
          ...currentMessage,
          ...(parsed.data.title ? { title: parsed.data.title } : {}),
          ...(parsed.data.message ? { message: parsed.data.message } : {}),
          ...(parsed.data.spatialDisclosureClass
            ? { spatialDisclosureClass: parsed.data.spatialDisclosureClass }
            : {}),
        };
        const [updated] = await tx
          .update(emergencyPublicAlerts)
          .set({
            status: parsed.data.status,
            severity: parsed.data.severity ?? row.severity,
            messageJson: nextMessage,
            ...(parsed.data.publicGeometry !== undefined
              ? { publicGeometryJson: publicGeometry ?? null }
              : {}),
            updatedAt: now,
          })
          .where(
            and(
              eq(emergencyPublicAlerts.tenantId, tenantId),
              eq(emergencyPublicAlerts.id, row.id),
              eq(emergencyPublicAlerts.status, row.status)
            )
          )
          .returning({ id: emergencyPublicAlerts.id });
        if (!updated) return "conflict" as const;
        const [previousAudit] = await tx
          .select({ eventHash: emergencyAuditEvents.eventHash })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.subjectType, "alert"),
              eq(emergencyAuditEvents.subjectId, row.id)
            )
          )
          .orderBy(desc(emergencyAuditEvents.createdAt))
          .limit(1);
        const auditInput = {
          tenantId,
          subjectType: "alert",
          subjectId: row.id,
          actorType: "user",
          actorRef: String(user!.id),
          eventType: `alert_${parsed.data.status}`,
          reason: parsed.data.reason,
          before,
          after: {
            status: parsed.data.status,
            severity: parsed.data.severity ?? row.severity,
            message: nextMessage,
            publicGeometry:
              parsed.data.publicGeometry === undefined
                ? row.publicGeometryJson
                : (publicGeometry ?? null),
          },
          previousHash: previousAudit?.eventHash ?? null,
          createdAt: now.toISOString(),
        };
        await tx.insert(emergencyAuditEvents).values({
          ...auditInput,
          eventIdempotencyKey: key,
          eventHash: auditHash(auditInput),
          beforeJson: before,
          afterJson: auditInput.after,
          createdAt: now,
        });
        return "updated" as const;
      });
      return result === "not_found"
        ? reply(res, 404, { error: "ALERT_NOT_FOUND" })
        : result === "conflict"
          ? reply(res, 409, { error: "ALERT_STATUS_CONFLICT" })
          : result === "transition"
            ? reply(res, 422, { error: "ALERT_TRANSITION_INVALID" })
            : reply(res, 200, {
                updated: result === "updated",
                duplicate: result === "duplicate",
              });
    }
    case "operations.command.facilities": {
      const rows = await getDb()
        .select()
        .from(emergencyFacilities)
        .where(eq(emergencyFacilities.tenantId, tenantId))
        .orderBy(desc(emergencyFacilities.updatedAt))
        .limit(200);
      return reply(res, 200, {
        items: rows.map(row => {
          const projection = safeRecord(row.publicProjectionJson);
          return {
            id: row.id,
            publicRef: row.publicRef,
            facilityType: row.facilityType,
            status: row.status,
            capacityClass: row.capacityClass,
            name: typeof projection.name === "string" ? projection.name : "",
            description:
              typeof projection.description === "string"
                ? projection.description
                : "",
            verifiedAt: row.verifiedAt?.toISOString() ?? null,
            updatedAt: row.updatedAt.toISOString(),
          };
        }),
      });
    }
    case "operations.command.facility.create": {
      const parsed = facilityCreateSchema.safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "INVALID_FACILITY" });
      const idempotencyKey = req.header("idempotency-key")?.trim();
      if (
        !idempotencyKey ||
        idempotencyKey.length < 8 ||
        idempotencyKey.length > 160
      )
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      const result = await getDb().transaction(async tx => {
        const idem = `facility:create:${sha256(idempotencyKey)}`;
        const fingerprint = requestFingerprint(parsed.data);
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${idem}`}, 0))`
        );
        const [prior] = await tx
          .select({
            subjectId: emergencyAuditEvents.subjectId,
            afterJson: emergencyAuditEvents.afterJson,
          })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.eventIdempotencyKey, idem)
            )
          )
          .limit(1);
        if (prior)
          return safeRecord(prior.afterJson).requestFingerprint === fingerprint
            ? { id: prior.subjectId, duplicate: true }
            : ("idempotency_reused" as const);
        const now = new Date();
        const [facility] = await tx
          .insert(emergencyFacilities)
          .values({
            tenantId,
            publicRef: publicRef("FAC"),
            facilityType: parsed.data.facilityType,
            status: "unknown",
            capacityClass: parsed.data.capacityClass,
            publicProjectionJson: {
              name: parsed.data.name,
              description: parsed.data.description,
              spatialDisclosureClass: parsed.data.spatialDisclosureClass,
            },
            updatedAt: now,
          })
          .returning({ id: emergencyFacilities.id });
        const after = { ...parsed.data, requestFingerprint: fingerprint };
        const audit = {
          tenantId,
          subjectType: "facility",
          subjectId: facility.id,
          actorType: "user",
          actorRef: String(user!.id),
          eventType: "facility_created_unverified",
          reason: "Operations registered a facility pending verification",
          after,
          createdAt: now.toISOString(),
        };
        await tx.insert(emergencyAuditEvents).values({
          ...audit,
          eventIdempotencyKey: idem,
          eventHash: auditHash(audit),
          afterJson: after,
          createdAt: now,
        });
        return { id: facility.id, duplicate: false };
      });
      return result === "idempotency_reused"
        ? reply(res, 409, { error: "IDEMPOTENCY_KEY_REUSED" })
        : reply(res, result.duplicate ? 200 : 201, {
            facilityId: result.id,
            duplicate: result.duplicate,
          });
    }
    case "operations.command.facility.update": {
      const parsed = facilityUpdateSchema.safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "INVALID_FACILITY_UPDATE" });
      if (
        parsed.data.status !== "unknown" &&
        user!.role !== "admin" &&
        !(await hasCapability(tenantId, user!.id, "emergency.verify"))
      ) {
        return reply(res, 403, {
          error: "FACILITY_PUBLICATION_REQUIRES_VERIFICATION_CAPABILITY",
        });
      }
      const idempotencyKey = req.header("idempotency-key")?.trim();
      if (
        !idempotencyKey ||
        idempotencyKey.length < 8 ||
        idempotencyKey.length > 160
      )
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      const outcome = await getDb().transaction(async tx => {
        const idem = `facility:update:${params.facilityId}:${sha256(idempotencyKey)}`;
        const [prior] = await tx
          .select({ id: emergencyAuditEvents.id })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.eventIdempotencyKey, idem)
            )
          )
          .limit(1);
        if (prior) return "duplicate" as const;
        const [row] = await tx
          .select()
          .from(emergencyFacilities)
          .where(
            and(
              eq(emergencyFacilities.tenantId, tenantId),
              eq(emergencyFacilities.id, params.facilityId)
            )
          )
          .for("update")
          .limit(1);
        if (!row) return "not_found" as const;
        const [lockedPrior] = await tx
          .select({ id: emergencyAuditEvents.id })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.eventIdempotencyKey, idem)
            )
          )
          .limit(1);
        if (lockedPrior) return "duplicate" as const;
        if (row.updatedAt.toISOString() !== parsed.data.expectedUpdatedAt)
          return "conflict" as const;
        const now = new Date();
        const projection = safeRecord(row.publicProjectionJson);
        const before = {
          status: row.status,
          capacityClass: row.capacityClass,
          publicProjection: projection,
        };
        const nextProjection = {
          ...projection,
          ...(parsed.data.name ? { name: parsed.data.name } : {}),
          ...(parsed.data.description !== undefined
            ? { description: parsed.data.description }
            : {}),
          ...(parsed.data.spatialDisclosureClass
            ? { spatialDisclosureClass: parsed.data.spatialDisclosureClass }
            : {}),
        };
        await tx
          .update(emergencyFacilities)
          .set({
            status: parsed.data.status,
            capacityClass: parsed.data.capacityClass ?? row.capacityClass,
            ...(parsed.data.latitude !== undefined &&
            parsed.data.longitude !== undefined
              ? {
                  publicLocation: sql`ST_SetSRID(ST_MakePoint(${parsed.data.longitude}, ${parsed.data.latitude}), 4326)::geography`,
                }
              : {}),
            publicProjectionJson: nextProjection,
            verifiedAt: parsed.data.status === "unknown" ? null : now,
            freshUntil:
              parsed.data.status === "unknown"
                ? null
                : new Date(now.getTime() + 60 * 60_000),
            updatedAt: now,
          })
          .where(
            and(
              eq(emergencyFacilities.tenantId, tenantId),
              eq(emergencyFacilities.id, row.id),
              eq(emergencyFacilities.updatedAt, row.updatedAt)
            )
          );
        const [previousAudit] = await tx
          .select({ eventHash: emergencyAuditEvents.eventHash })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.subjectType, "facility"),
              eq(emergencyAuditEvents.subjectId, row.id)
            )
          )
          .orderBy(desc(emergencyAuditEvents.createdAt))
          .limit(1);
        const after = {
          status: parsed.data.status,
          capacityClass: parsed.data.capacityClass ?? row.capacityClass,
          publicProjection: nextProjection,
        };
        const audit = {
          tenantId,
          subjectType: "facility",
          subjectId: row.id,
          actorType: "user",
          actorRef: String(user!.id),
          eventType:
            parsed.data.status === "unknown"
              ? "facility_unverified"
              : "facility_verified_update",
          reason: parsed.data.reason,
          before,
          after,
          previousHash: previousAudit?.eventHash ?? null,
          createdAt: now.toISOString(),
        };
        await tx.insert(emergencyAuditEvents).values({
          ...audit,
          eventIdempotencyKey: idem,
          eventHash: auditHash(audit),
          beforeJson: before,
          afterJson: after,
          createdAt: now,
        });
        return "updated" as const;
      });
      return outcome === "not_found"
        ? reply(res, 404, { error: "FACILITY_NOT_FOUND" })
        : outcome === "conflict"
          ? reply(res, 409, { error: "FACILITY_REVISION_CONFLICT" })
          : reply(res, 200, {
              updated: outcome === "updated",
              duplicate: outcome === "duplicate",
            });
    }
    case "operations.command.cases": {
      const rows = await getDb().execute(sql<
        Array<{
          id: string;
          reportId: string | null;
          status: string;
          revision: number;
          hazardType: string | null;
          summary: string | null;
          jurisdictionRef: string | null;
          locationDisclosure: string | null;
          locationLatitude: number | null;
          locationLongitude: number | null;
          observedAt: Date | null;
          createdAt: Date;
          updatedAt: Date;
        }>
      >`
        SELECT c."id", c."reportId", c."status", c."revision", r."reportType" AS "hazardType",
          r."summary", c."caseContextJson"->'triage'->>'jurisdictionRef' AS "jurisdictionRef", r."locationDisclosure", ST_Y(r."exactLocation"::geometry) AS "locationLatitude",
          ST_X(r."exactLocation"::geometry) AS "locationLongitude", r."observedAt",
          c."createdAt", c."updatedAt"
        FROM "emergency_cases" c
        LEFT JOIN "emergency_reports" r ON r."id" = c."reportId" AND r."tenantId" = c."tenantId"
        WHERE c."tenantId" = ${tenantId} AND c."status" NOT IN ('resolved', 'closed')
        ORDER BY c."updatedAt" ASC
        LIMIT 200
      `);
      return reply(res, 200, {
        items: rows.map(row => ({
          id: row.id,
          reportRef: row.reportId,
          status: row.status,
          revision: row.revision,
          hazardType: row.hazardType,
          summary: row.summary,
          jurisdictionRef: row.jurisdictionRef,
          exactLocation:
            row.locationDisclosure !== "operations" ||
            row.locationLatitude === null ||
            row.locationLongitude === null
              ? null
              : {
                  latitude: row.locationLatitude,
                  longitude: row.locationLongitude,
                },
          observedAt: row.observedAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        })),
      });
    }
    case "operations.command.review-items":
    case "operations.command.case.review-items": {
      const queueFilters = [
        eq(emergencyCaseReviewItems.tenantId, tenantId),
        eq(emergencyCaseReviewItems.state, "open"),
        ...(params.caseId
          ? [eq(emergencyCaseReviewItems.caseId, params.caseId)]
          : []),
      ];
      const rows = await getDb()
        .select({
          id: emergencyCaseReviewItems.id,
          caseId: emergencyCaseReviewItems.caseId,
          kind: emergencyCaseReviewItems.kind,
          state: emergencyCaseReviewItems.state,
          caseRevision: emergencyCaseReviewItems.caseRevision,
          basisJson: emergencyCaseReviewItems.basisJson,
          dueAt: emergencyCaseReviewItems.dueAt,
          createdAt: emergencyCaseReviewItems.createdAt,
          status: emergencyCases.status,
          context: emergencyCases.caseContextJson,
        })
        .from(emergencyCaseReviewItems)
        .innerJoin(
          emergencyCases,
          and(
            eq(emergencyCases.id, emergencyCaseReviewItems.caseId),
            eq(emergencyCases.tenantId, emergencyCaseReviewItems.tenantId)
          )
        )
        .where(and(...queueFilters))
        .orderBy(
          asc(emergencyCaseReviewItems.dueAt),
          asc(emergencyCaseReviewItems.createdAt)
        )
        .limit(200);
      return reply(res, 200, {
        items: rows.map(row => {
          const context = safeRecord(row.context);
          const triage = safeRecord(context.triage);
          const basis = safeRecord(row.basisJson);
          const basisNotes = Array.isArray(basis.basis)
            ? basis.basis.filter(
                (value): value is string => typeof value === "string"
              )
            : [];
          if (
            typeof basis.channel === "string" &&
            typeof basis.outcome === "string"
          )
            basisNotes.push(`${basis.channel}:${basis.outcome}`);
          if (typeof basis.reason === "string") basisNotes.push(basis.reason);
          if (typeof basis.attemptCount === "number" && basis.attemptCount > 1)
            basisNotes.push(`attempts:${basis.attemptCount}`);
          return {
            id: row.id,
            caseId: row.caseId,
            caseStatus: row.status,
            kind: row.kind,
            caseRevision: row.caseRevision,
            hazardCategory:
              typeof triage.hazardCategory === "string"
                ? triage.hazardCategory
                : "unknown",
            severity:
              typeof triage.severity === "string" ? triage.severity : "unknown",
            basis: basisNotes,
            dueAt: row.dueAt?.toISOString() ?? null,
            createdAt: row.createdAt.toISOString(),
          };
        }),
      });
    }
    case "operations.command.review-item.resolve": {
      const parsed = reviewItemResolveSchema.safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "INVALID_REVIEW_RESOLUTION" });
      const idempotencyKey = req.header("idempotency-key")?.trim();
      if (
        !idempotencyKey ||
        idempotencyKey.length < 8 ||
        idempotencyKey.length > 160
      )
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      const outcome = await getDb().transaction(async tx => {
        const idem = `review-item:${params.reviewItemId}:${sha256(idempotencyKey)}`;
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${idem}`}, 0))`
        );
        const [priorAudit] = await tx
          .select({
            id: emergencyAuditEvents.id,
            afterJson: emergencyAuditEvents.afterJson,
          })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.eventIdempotencyKey, idem)
            )
          )
          .limit(1);
        if (priorAudit)
          return safeRecord(priorAudit.afterJson).requestFingerprint ===
            requestFingerprint(parsed.data)
            ? { state: "duplicate" as const }
            : { state: "idempotency_reused" as const };
        const [item] = await tx
          .select()
          .from(emergencyCaseReviewItems)
          .where(
            and(
              eq(emergencyCaseReviewItems.tenantId, tenantId),
              eq(emergencyCaseReviewItems.caseId, params.caseId),
              eq(emergencyCaseReviewItems.id, params.reviewItemId)
            )
          )
          .for("update")
          .limit(1);
        if (!item) return { state: "not_found" as const };
        if (item.state !== "open") return { state: "conflict" as const };
        if (
          item.kind === "verification" &&
          !(await hasCapability(tenantId, user!.id, "emergency.verify", {
            scopeType: "case",
            scopeRef: params.caseId,
          }))
        ) {
          return { state: "verify_forbidden" as const };
        }
        const now = new Date();
        const [previousAudit] = await tx
          .select({ eventHash: emergencyAuditEvents.eventHash })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.subjectType, "case_review_item"),
              eq(emergencyAuditEvents.subjectId, item.id)
            )
          )
          .orderBy(desc(emergencyAuditEvents.createdAt))
          .limit(1);
        const fingerprint = requestFingerprint(parsed.data);
        const audit = {
          tenantId,
          subjectType: "case_review_item",
          subjectId: item.id,
          actorType: "user",
          actorRef: String(user!.id),
          eventType: `${item.kind}_review_completed`,
          reason: parsed.data.reason,
          before: { state: item.state },
          after: {
            state: "completed",
            caseRevision: item.caseRevision,
            requestFingerprint: fingerprint,
          },
          previousHash: previousAudit?.eventHash ?? null,
          createdAt: now.toISOString(),
        };
        await tx
          .update(emergencyCaseReviewItems)
          .set({
            state: "completed",
            resolutionReason: parsed.data.reason,
            resolvedByUserId: user!.id,
            resolvedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(emergencyCaseReviewItems.id, item.id),
              eq(emergencyCaseReviewItems.state, "open")
            )
          );
        await tx.insert(emergencyAuditEvents).values({
          ...audit,
          eventIdempotencyKey: idem,
          eventHash: auditHash(audit),
          beforeJson: audit.before,
          afterJson: audit.after,
          createdAt: now,
        });
        return { state: "resolved" as const };
      });
      return outcome.state === "not_found"
        ? reply(res, 404, { error: "CASE_REVIEW_ITEM_NOT_FOUND" })
        : outcome.state === "idempotency_reused"
          ? reply(res, 409, { error: "IDEMPOTENCY_KEY_REUSED" })
          : outcome.state === "conflict"
            ? reply(res, 409, { error: "CASE_REVIEW_ITEM_NOT_OPEN" })
            : outcome.state === "verify_forbidden"
              ? reply(res, 403, {
                  error: "EMERGENCY_VERIFICATION_CAPABILITY_REQUIRED",
                })
              : reply(res, 200, {
                  resolved: outcome.state === "resolved",
                  duplicate: outcome.state === "duplicate",
                });
    }
    case "operations.command.contact-attempt": {
      const parsed = contactAttemptSchema.safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "INVALID_CONTACT_ATTEMPT" });
      const key = req.header("idempotency-key")?.trim();
      if (!key || key.length < 8 || key.length > 160)
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      const result = await getDb().transaction(async tx => {
        const eventIdempotencyKey = `contact-attempt:${params.caseId}:${sha256(key)}`;
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${eventIdempotencyKey}`}, 0))`
        );
        const [prior] = await tx
          .select({
            id: emergencyAuditEvents.id,
            afterJson: emergencyAuditEvents.afterJson,
          })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.eventIdempotencyKey, eventIdempotencyKey)
            )
          )
          .limit(1);
        if (prior)
          return safeRecord(prior.afterJson).requestFingerprint ===
            requestFingerprint(parsed.data)
            ? ("duplicate" as const)
            : ("idempotency_reused" as const);
        const [caseRow] = await tx
          .select({
            id: emergencyCases.id,
            revision: emergencyCases.revision,
            status: emergencyCases.status,
          })
          .from(emergencyCases)
          .where(
            and(
              eq(emergencyCases.tenantId, tenantId),
              eq(emergencyCases.id, params.caseId)
            )
          )
          .for("update")
          .limit(1);
        if (!caseRow) return "not_found" as const;
        if (caseRow.status === "resolved" || caseRow.status === "closed")
          return "terminal" as const;
        const now = new Date();
        const previous = await tx
          .select({ eventHash: emergencyAuditEvents.eventHash })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.subjectType, "case"),
              eq(emergencyAuditEvents.subjectId, caseRow.id)
            )
          )
          .orderBy(desc(emergencyAuditEvents.createdAt))
          .limit(1);
        const fingerprint = requestFingerprint(parsed.data);
        const after = {
          ...parsed.data,
          attemptedAt: now.toISOString(),
          requestFingerprint: fingerprint,
          followUpRequired: parsed.data.outcome !== "reached",
        };
        const audit = {
          tenantId,
          subjectType: "case",
          subjectId: caseRow.id,
          actorType: "user",
          actorRef: String(user!.id),
          eventType: "reporter_contact_attempt",
          reason: parsed.data.reason,
          before: { revision: caseRow.revision },
          after,
          previousHash: previous[0]?.eventHash ?? null,
          createdAt: now.toISOString(),
        };
        await tx.insert(emergencyAuditEvents).values({
          ...audit,
          eventIdempotencyKey,
          eventHash: auditHash(audit),
          beforeJson: audit.before,
          afterJson: after,
          createdAt: now,
        });
        if (parsed.data.outcome !== "reached") {
          const [openItem] = await tx
            .select()
            .from(emergencyCaseReviewItems)
            .where(
              and(
                eq(emergencyCaseReviewItems.tenantId, tenantId),
                eq(emergencyCaseReviewItems.caseId, caseRow.id),
                eq(emergencyCaseReviewItems.kind, "no_response"),
                eq(emergencyCaseReviewItems.state, "open")
              )
            )
            .for("update")
            .limit(1);
          const dueAt = new Date(
            now.getTime() + (parsed.data.outcome === "unsafe" ? 0 : 15 * 60_000)
          );
          if (openItem) {
            const oldBasis = safeRecord(openItem.basisJson);
            const priorAttemptCount =
              typeof oldBasis.attemptCount === "number"
                ? oldBasis.attemptCount
                : 1;
            await tx
              .update(emergencyCaseReviewItems)
              .set({
                caseRevision: caseRow.revision,
                basisJson: {
                  channel: parsed.data.channel,
                  outcome: parsed.data.outcome,
                  attemptedAt: now.toISOString(),
                  reason: parsed.data.reason,
                  attemptCount: priorAttemptCount + 1,
                },
                dueAt:
                  openItem.dueAt && openItem.dueAt < dueAt
                    ? openItem.dueAt
                    : dueAt,
                updatedAt: now,
              })
              .where(eq(emergencyCaseReviewItems.id, openItem.id));
          } else {
            await tx
              .insert(emergencyCaseReviewItems)
              .values({
                tenantId,
                caseId: caseRow.id,
                kind: "no_response",
                state: "open",
                caseRevision: caseRow.revision,
                basisJson: {
                  channel: parsed.data.channel,
                  outcome: parsed.data.outcome,
                  attemptedAt: now.toISOString(),
                  reason: parsed.data.reason,
                  attemptCount: 1,
                },
                dueAt,
                openedByUserId: user!.id,
                createdAt: now,
                updatedAt: now,
              })
              .onConflictDoNothing();
          }
        }
        return "recorded" as const;
      });
      return result === "not_found"
        ? reply(res, 404, { error: "CASE_NOT_FOUND" })
        : result === "terminal"
          ? reply(res, 409, { error: "CASE_TERMINAL_CONTACT_NOT_ALLOWED" })
          : result === "idempotency_reused"
            ? reply(res, 409, { error: "IDEMPOTENCY_KEY_REUSED" })
            : reply(res, 200, {
                recorded: result === "recorded",
                duplicate: result === "duplicate",
                followUpRequired: parsed.data.outcome !== "reached",
              });
    }
    case "operations.command.needs": {
      const [caseRow] = await getDb()
        .select({ id: emergencyCases.id })
        .from(emergencyCases)
        .where(
          and(
            eq(emergencyCases.tenantId, tenantId),
            eq(emergencyCases.id, params.caseId)
          )
        )
        .limit(1);
      if (!caseRow) return reply(res, 404, { error: "CASE_NOT_FOUND" });
      const rows = await getDb()
        .select()
        .from(emergencyNeeds)
        .where(
          and(
            eq(emergencyNeeds.tenantId, tenantId),
            eq(emergencyNeeds.caseId, params.caseId)
          )
        )
        .orderBy(desc(emergencyNeeds.updatedAt))
        .limit(200);
      return reply(res, 200, {
        items: rows.map(row => ({
          id: row.id,
          caseId: row.caseId,
          type: row.needType,
          status: row.status,
          priority: row.priority,
          requestedQuantity: row.requestedQuantity,
          fulfilledQuantity: row.fulfilledQuantity,
          revision: row.revision,
          details: row.needJson,
          updatedAt: row.updatedAt.toISOString(),
        })),
      });
    }
    case "operations.command.need.create": {
      const parsed = needCreateSchema.safeParse(req.body);
      if (!parsed.success) return reply(res, 400, { error: "INVALID_NEED" });
      const key = req.header("idempotency-key")?.trim();
      if (!key || key.length < 8 || key.length > 160)
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      const result = await getDb().transaction(async tx => {
        const idem = `need:create:${params.caseId}:${sha256(key)}`;
        const fingerprint = requestFingerprint(parsed.data);
        const [prior] = await tx
          .select({
            subjectId: emergencyAuditEvents.subjectId,
            afterJson: emergencyAuditEvents.afterJson,
          })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.eventIdempotencyKey, idem)
            )
          )
          .limit(1);
        if (prior)
          return safeRecord(prior.afterJson).requestFingerprint === fingerprint
            ? { id: prior.subjectId, duplicate: true }
            : ("idempotency_reused" as const);
        const [caseRow] = await tx
          .select({ id: emergencyCases.id })
          .from(emergencyCases)
          .where(
            and(
              eq(emergencyCases.tenantId, tenantId),
              eq(emergencyCases.id, params.caseId)
            )
          )
          .for("update")
          .limit(1);
        if (!caseRow) return null;
        const [lockedPrior] = await tx
          .select({
            subjectId: emergencyAuditEvents.subjectId,
            afterJson: emergencyAuditEvents.afterJson,
          })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.eventIdempotencyKey, idem)
            )
          )
          .limit(1);
        if (lockedPrior)
          return safeRecord(lockedPrior.afterJson).requestFingerprint ===
            fingerprint
            ? { id: lockedPrior.subjectId, duplicate: true }
            : ("idempotency_reused" as const);
        const now = new Date();
        const [need] = await tx
          .insert(emergencyNeeds)
          .values({
            tenantId,
            caseId: caseRow.id,
            needType: parsed.data.needType,
            priority: parsed.data.priority,
            requestedQuantity:
              parsed.data.requestedQuantity?.toString() ?? null,
            needJson: {
              unit: parsed.data.unit ?? null,
              description: parsed.data.description ?? "",
            },
            updatedAt: now,
          })
          .returning({ id: emergencyNeeds.id });
        const after = { ...parsed.data, requestFingerprint: fingerprint };
        const audit = {
          tenantId,
          subjectType: "need",
          subjectId: need.id,
          actorType: "user",
          actorRef: String(user!.id),
          eventType: "need_reported",
          reason: "Operations recorded a case need",
          after,
          createdAt: now.toISOString(),
        };
        await tx.insert(emergencyAuditEvents).values({
          ...audit,
          eventIdempotencyKey: idem,
          eventHash: auditHash(audit),
          afterJson: after,
          createdAt: now,
        });
        return { id: need.id, duplicate: false };
      });
      return result === "idempotency_reused"
        ? reply(res, 409, { error: "IDEMPOTENCY_KEY_REUSED" })
        : result
          ? reply(res, result.duplicate ? 200 : 201, {
              needId: result.id,
              duplicate: result.duplicate,
            })
          : reply(res, 404, { error: "CASE_NOT_FOUND" });
    }
    case "operations.command.need.update": {
      const parsed = needUpdateSchema.safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "INVALID_NEED_UPDATE" });
      const key = req.header("idempotency-key")?.trim();
      if (!key || key.length < 8 || key.length > 160)
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      const outcome = await getDb().transaction(async tx => {
        const idem = `need:update:${params.needId}:${sha256(key)}`;
        const fingerprint = requestFingerprint(parsed.data);
        const [prior] = await tx
          .select({
            id: emergencyAuditEvents.id,
            afterJson: emergencyAuditEvents.afterJson,
          })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.eventIdempotencyKey, idem)
            )
          )
          .limit(1);
        if (prior)
          return safeRecord(prior.afterJson).requestFingerprint === fingerprint
            ? ("duplicate" as const)
            : ("idempotency_reused" as const);
        const [row] = await tx
          .select()
          .from(emergencyNeeds)
          .where(
            and(
              eq(emergencyNeeds.tenantId, tenantId),
              eq(emergencyNeeds.id, params.needId)
            )
          )
          .for("update")
          .limit(1);
        if (!row) return "not_found" as const;
        const [lockedPrior] = await tx
          .select({
            id: emergencyAuditEvents.id,
            afterJson: emergencyAuditEvents.afterJson,
          })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.eventIdempotencyKey, idem)
            )
          )
          .limit(1);
        if (lockedPrior)
          return safeRecord(lockedPrior.afterJson).requestFingerprint ===
            fingerprint
            ? ("duplicate" as const)
            : ("idempotency_reused" as const);
        if (row.revision !== parsed.data.expectedRevision)
          return "conflict" as const;
        const activeAssignments = await tx
          .select({ scopeJson: emergencyAssignments.scopeJson })
          .from(emergencyAssignments)
          .where(
            and(
              eq(emergencyAssignments.tenantId, tenantId),
              eq(emergencyAssignments.needId, row.id),
              inArray(emergencyAssignments.status, [
                "offered",
                "accepted",
                "en_route",
                "working",
              ])
            )
          );
        const reservedMilli = activeAssignments.reduce((total, assignment) => {
          const value = safeRecord(assignment.scopeJson).expectedContribution;
          return (
            total +
            (typeof value === "number" || typeof value === "string"
              ? quantityMilli(value)
              : 0)
          );
        }, 0);
        const fulfillment = resolveEmergencyNeedFulfillment({
          currentStatus: row.status as Parameters<
            typeof resolveEmergencyNeedFulfillment
          >[0]["currentStatus"],
          requestedQuantity: row.requestedQuantity,
          currentFulfilledQuantity: row.fulfilledQuantity,
          fulfilledQuantity: parsed.data.fulfilledQuantity,
          requestedStatus: parsed.data.status,
          activeReservationsMilli: reservedMilli,
        });
        if (!fulfillment.ok) return fulfillment.reason;
        const fulfilled = fulfillment.fulfilledQuantity;
        const nextStatus = fulfillment.status;
        if (!canTransitionStoredEmergencyNeed(row.status, nextStatus))
          return "transition" as const;
        const next = nextStatus;
        const now = new Date();
        const before = {
          status: row.status,
          priority: row.priority,
          fulfilledQuantity: row.fulfilledQuantity,
          revision: row.revision,
        };
        const after = {
          status: next,
          priority: parsed.data.priority ?? row.priority,
          fulfilledQuantity: fulfilled,
          revision: row.revision + 1,
          requestFingerprint: fingerprint,
        };
        const [previousAudit] = await tx
          .select({ eventHash: emergencyAuditEvents.eventHash })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.subjectType, "need"),
              eq(emergencyAuditEvents.subjectId, row.id)
            )
          )
          .orderBy(desc(emergencyAuditEvents.createdAt))
          .limit(1);
        const audit = {
          tenantId,
          subjectType: "need",
          subjectId: row.id,
          actorType: "user",
          actorRef: String(user!.id),
          eventType: "need_updated",
          reason: parsed.data.reason,
          before,
          after,
          previousHash: previousAudit?.eventHash ?? null,
          createdAt: now.toISOString(),
        };
        const [updated] = await tx
          .update(emergencyNeeds)
          .set({
            status: next,
            priority: after.priority,
            fulfilledQuantity: fulfilled,
            revision: after.revision,
            updatedAt: now,
          })
          .where(
            and(
              eq(emergencyNeeds.tenantId, tenantId),
              eq(emergencyNeeds.id, row.id),
              eq(emergencyNeeds.revision, row.revision)
            )
          )
          .returning({ id: emergencyNeeds.id });
        if (!updated) return "conflict" as const;
        await tx.insert(emergencyAuditEvents).values({
          ...audit,
          eventIdempotencyKey: idem,
          eventHash: auditHash(audit),
          beforeJson: before,
          afterJson: after,
          createdAt: now,
        });
        return "updated" as const;
      });
      return outcome === "not_found"
        ? reply(res, 404, { error: "NEED_NOT_FOUND" })
        : outcome === "idempotency_reused"
          ? reply(res, 409, { error: "IDEMPOTENCY_KEY_REUSED" })
          : outcome === "conflict"
            ? reply(res, 409, { error: "NEED_REVISION_CONFLICT" })
            : outcome === "active_assignments"
              ? reply(res, 409, { error: "NEED_HAS_ACTIVE_RESPONDERS" })
              : outcome === "transition" ||
                  outcome === "quantity" ||
                  outcome === "quantity_status"
                ? reply(res, 422, {
                    error: `NEED_${outcome.toUpperCase()}_INVALID`,
                  })
                : reply(res, 200, {
                    updated: outcome === "updated",
                    duplicate: outcome === "duplicate",
                  });
    }
    case "operations.command.tasks": {
      const [caseRow] = await getDb()
        .select({ id: emergencyCases.id })
        .from(emergencyCases)
        .where(
          and(
            eq(emergencyCases.tenantId, tenantId),
            eq(emergencyCases.id, params.caseId)
          )
        )
        .limit(1);
      if (!caseRow) return reply(res, 404, { error: "CASE_NOT_FOUND" });
      const rows = await getDb()
        .select()
        .from(emergencyResponseTasks)
        .where(
          and(
            eq(emergencyResponseTasks.tenantId, tenantId),
            eq(emergencyResponseTasks.caseId, params.caseId)
          )
        )
        .orderBy(desc(emergencyResponseTasks.updatedAt))
        .limit(200);
      return reply(res, 200, {
        items: rows.map(row => ({
          id: row.id,
          caseId: row.caseId,
          needId: row.needId,
          type: row.taskType,
          title: safeRecord(row.taskJson).title ?? row.taskType,
          status: row.status,
          safetyClass: row.safetyClass,
          details: row.taskJson,
          updatedAt: row.updatedAt.toISOString(),
        })),
      });
    }
    case "operations.command.responders": {
      const [caseRow] = await getDb()
        .select({
          id: emergencyCases.id,
          context: emergencyCases.caseContextJson,
        })
        .from(emergencyCases)
        .where(
          and(
            eq(emergencyCases.tenantId, tenantId),
            eq(emergencyCases.id, params.caseId)
          )
        )
        .limit(1);
      if (!caseRow) return reply(res, 404, { error: "CASE_NOT_FOUND" });
      const grants = await getDb()
        .select({ userId: emergencyCapabilityGrants.userId })
        .from(emergencyCapabilityGrants)
        .where(
          and(
            eq(emergencyCapabilityGrants.tenantId, tenantId),
            eq(emergencyCapabilityGrants.capability, "emergency.respond"),
            isNull(emergencyCapabilityGrants.revokedAt),
            or(
              isNull(emergencyCapabilityGrants.expiresAt),
              gt(emergencyCapabilityGrants.expiresAt, new Date())
            ),
            or(
              eq(emergencyCapabilityGrants.scopeType, "tenant"),
              and(
                eq(emergencyCapabilityGrants.scopeType, "case"),
                eq(emergencyCapabilityGrants.scopeRef, caseRow.id)
              )
            )
          )
        );
      const responderIds = [...new Set(grants.map(grant => grant.userId))];
      const triage = safeRecord(safeRecord(caseRow.context).triage);
      const jurisdictionRef =
        typeof triage.jurisdictionRef === "string"
          ? triage.jurisdictionRef
          : "";
      const helperIds = jurisdictionRef
        ? (
            await getDb()
              .select({ userId: emergencyHelperProfiles.userId })
              .from(emergencyHelperProfiles)
              .innerJoin(
                emergencyCapabilityGrants,
                and(
                  eq(
                    emergencyCapabilityGrants.tenantId,
                    emergencyHelperProfiles.tenantId
                  ),
                  eq(
                    emergencyCapabilityGrants.userId,
                    emergencyHelperProfiles.userId
                  )
                )
              )
              .where(
                and(
                  eq(emergencyHelperProfiles.tenantId, tenantId),
                  eq(emergencyHelperProfiles.optIn, true),
                  eq(emergencyHelperProfiles.jurisdictionRef, jurisdictionRef),
                  isNull(emergencyHelperProfiles.revokedAt),
                  gt(emergencyHelperProfiles.availableUntil, new Date()),
                  eq(emergencyCapabilityGrants.capability, "emergency.respond"),
                  isNull(emergencyCapabilityGrants.revokedAt),
                  or(
                    isNull(emergencyCapabilityGrants.expiresAt),
                    gt(emergencyCapabilityGrants.expiresAt, new Date())
                  ),
                  or(
                    eq(emergencyCapabilityGrants.scopeType, "tenant"),
                    and(
                      eq(emergencyCapabilityGrants.scopeType, "case"),
                      eq(emergencyCapabilityGrants.scopeRef, caseRow.id)
                    )
                  )
                )
              )
              .limit(200)
          ).map(row => row.userId)
        : [];
      const helperIdSet = new Set(helperIds);
      const eligibleResponderIds = [
        ...new Set([...responderIds, ...helperIds]),
      ];
      if (!eligibleResponderIds.length) return reply(res, 200, { items: [] });
      const responders = await getDb()
        .select({
          id: users.id,
          name: users.name,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(users)
        .where(inArray(users.id, eligibleResponderIds))
        .orderBy(asc(users.id))
        .limit(200);
      return reply(res, 200, {
        items: responders.map(responder => ({
          id: responder.id,
          label:
            [responder.firstName, responder.lastName]
              .filter(Boolean)
              .join(" ") ||
            responder.name ||
            `Responder ${responder.id}`,
          helperOptIn: helperIdSet.has(responder.id),
        })),
      });
    }
    case "operations.command.task.create": {
      const parsed = taskCreateSchema.safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "INVALID_RESPONSE_TASK" });
      const key = req.header("idempotency-key")?.trim();
      if (!key || key.length < 8 || key.length > 160)
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      const result = await getDb().transaction(async tx => {
        const idem = `task:create:${params.caseId}:${sha256(key)}`;
        const fingerprint = requestFingerprint(parsed.data);
        const [prior] = await tx
          .select({
            subjectId: emergencyAuditEvents.subjectId,
            afterJson: emergencyAuditEvents.afterJson,
          })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.eventIdempotencyKey, idem)
            )
          )
          .limit(1);
        if (prior) {
          const priorPayload = safeRecord(prior.afterJson);
          return priorPayload.requestFingerprint === fingerprint
            ? {
                id: prior.subjectId,
                duplicate: true,
                protocolVersion: priorPayload.protocolVersion,
                protocolActions: priorPayload.protocolActions,
              }
            : ("idempotency_reused" as const);
        }
        const [caseRow] = await tx
          .select({
            id: emergencyCases.id,
            context: emergencyCases.caseContextJson,
          })
          .from(emergencyCases)
          .where(
            and(
              eq(emergencyCases.tenantId, tenantId),
              eq(emergencyCases.id, params.caseId)
            )
          )
          .for("update")
          .limit(1);
        if (!caseRow) return null;
        const triage = safeRecord(safeRecord(caseRow.context).triage);
        const hazardCategory =
          typeof triage.hazardCategory === "string"
            ? triage.hazardCategory
            : "unknown";
        const severity =
          typeof triage.severity === "string" ? triage.severity : "unknown";
        const protocol = getEmergencyProtocolPack({
          hazardCategory: hazardCategory as Parameters<
            typeof getEmergencyProtocolPack
          >[0]["hazardCategory"],
          severity: severity as Parameters<
            typeof getEmergencyProtocolPack
          >[0]["severity"],
        });
        if (
          !satisfiesEmergencyProtocolSafetyClass(
            parsed.data.safetyClass,
            protocol.minimumSafetyClass
          )
        )
          return "protocol_safety_class" as const;
        const [lockedPrior] = await tx
          .select({
            subjectId: emergencyAuditEvents.subjectId,
            afterJson: emergencyAuditEvents.afterJson,
          })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.eventIdempotencyKey, idem)
            )
          )
          .limit(1);
        if (lockedPrior) {
          const priorPayload = safeRecord(lockedPrior.afterJson);
          return priorPayload.requestFingerprint === fingerprint
            ? {
                id: lockedPrior.subjectId,
                duplicate: true,
                protocolVersion: priorPayload.protocolVersion,
                protocolActions: priorPayload.protocolActions,
              }
            : ("idempotency_reused" as const);
        }
        if (parsed.data.needId) {
          const [need] = await tx
            .select({ id: emergencyNeeds.id, status: emergencyNeeds.status })
            .from(emergencyNeeds)
            .where(
              and(
                eq(emergencyNeeds.tenantId, tenantId),
                eq(emergencyNeeds.caseId, caseRow.id),
                eq(emergencyNeeds.id, parsed.data.needId)
              )
            )
            .for("update")
            .limit(1);
          if (!need) return false;
          if (!["verified", "partially_fulfilled"].includes(need.status))
            return "need_not_verified" as const;
        }
        const now = new Date();
        const [task] = await tx
          .insert(emergencyResponseTasks)
          .values({
            tenantId,
            caseId: caseRow.id,
            needId: parsed.data.needId ?? null,
            taskType: parsed.data.taskType,
            status: "ready",
            safetyClass: parsed.data.safetyClass,
            taskJson: {
              title: parsed.data.title,
              instructions: parsed.data.instructions ?? "",
              protocolVersion: protocol.version,
              protocolActions: protocol.actions,
              humanReviewRequired: protocol.humanReviewRequired,
            },
            updatedAt: now,
          })
          .returning({ id: emergencyResponseTasks.id });
        const after = {
          ...parsed.data,
          protocolVersion: protocol.version,
          protocolActions: protocol.actions,
          requestFingerprint: fingerprint,
        };
        const audit = {
          tenantId,
          subjectType: "response_task",
          subjectId: task.id,
          actorType: "user",
          actorRef: String(user!.id),
          eventType: "task_created",
          reason: "Operations created a response task",
          after,
          createdAt: now.toISOString(),
        };
        await tx.insert(emergencyAuditEvents).values({
          ...audit,
          eventIdempotencyKey: idem,
          eventHash: auditHash(audit),
          afterJson: after,
          createdAt: now,
        });
        return {
          id: task.id,
          duplicate: false,
          protocolVersion: protocol.version,
          protocolActions: protocol.actions,
        };
      });
      return result === null
        ? reply(res, 404, { error: "CASE_NOT_FOUND" })
        : result === false
          ? reply(res, 404, { error: "NEED_NOT_FOUND" })
          : result === "need_not_verified"
            ? reply(res, 409, { error: "NEED_NOT_VERIFIED" })
            : result === "protocol_safety_class"
              ? reply(res, 422, {
                  error: "TASK_SAFETY_CLASS_BELOW_PROTOCOL_MINIMUM",
                })
              : result === "idempotency_reused"
                ? reply(res, 409, { error: "IDEMPOTENCY_KEY_REUSED" })
                : reply(res, result.duplicate ? 200 : 201, {
                    taskId: result.id,
                    protocolVersion: result.protocolVersion,
                    protocolActions: result.protocolActions,
                    duplicate: result.duplicate,
                  });
    }
    case "operations.command.task.assign": {
      const parsed = taskAssignSchema.safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "INVALID_TASK_ASSIGNMENT" });
      const key = req.header("idempotency-key")?.trim();
      if (!key || key.length < 8 || key.length > 160)
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      const outcome = await getDb().transaction(async tx => {
        const idem = `task:assign:${params.taskId}:${sha256(key)}`;
        const fingerprint = requestFingerprint(parsed.data);
        const [prior] = await tx
          .select({
            subjectId: emergencyAuditEvents.subjectId,
            afterJson: emergencyAuditEvents.afterJson,
          })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.eventIdempotencyKey, idem)
            )
          )
          .limit(1);
        if (prior)
          return safeRecord(prior.afterJson).requestFingerprint === fingerprint
            ? { id: prior.subjectId, duplicate: true }
            : ("idempotency_reused" as const);
        const [task] = await tx
          .select()
          .from(emergencyResponseTasks)
          .where(
            and(
              eq(emergencyResponseTasks.tenantId, tenantId),
              eq(emergencyResponseTasks.id, params.taskId)
            )
          )
          .for("update")
          .limit(1);
        if (!task) return null;
        const [lockedPrior] = await tx
          .select({
            subjectId: emergencyAuditEvents.subjectId,
            afterJson: emergencyAuditEvents.afterJson,
          })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.eventIdempotencyKey, idem)
            )
          )
          .limit(1);
        if (lockedPrior)
          return safeRecord(lockedPrior.afterJson).requestFingerprint ===
            fingerprint
            ? { id: lockedPrior.subjectId, duplicate: true }
            : ("idempotency_reused" as const);
        if (
          !(await hasCapability(
            tenantId,
            parsed.data.responderUserId,
            "emergency.respond",
            { scopeType: "case", scopeRef: task.caseId }
          ))
        )
          return "unverified" as const;
        if (!["ready", "offered"].includes(task.status)) return false;
        const [caseContext] = await tx
          .select({ context: emergencyCases.caseContextJson })
          .from(emergencyCases)
          .where(
            and(
              eq(emergencyCases.tenantId, tenantId),
              eq(emergencyCases.id, task.caseId)
            )
          )
          .limit(1);
        const triage = safeRecord(safeRecord(caseContext?.context).triage);
        const protocol = getEmergencyProtocolPack({
          hazardCategory: (typeof triage.hazardCategory === "string"
            ? triage.hazardCategory
            : "unknown") as Parameters<
            typeof getEmergencyProtocolPack
          >[0]["hazardCategory"],
          severity: (typeof triage.severity === "string"
            ? triage.severity
            : "unknown") as Parameters<
            typeof getEmergencyProtocolPack
          >[0]["severity"],
        });
        if (
          !satisfiesEmergencyProtocolSafetyClass(
            task.safetyClass as Parameters<
              typeof satisfiesEmergencyProtocolSafetyClass
            >[0],
            protocol.minimumSafetyClass
          )
        )
          return "protocol_safety_class" as const;
        const storedTaskJson = safeRecord(task.taskJson);
        if (
          storedTaskJson.protocolVersion !== protocol.version ||
          JSON.stringify(storedTaskJson.protocolActions) !==
            JSON.stringify(protocol.actions)
        )
          return "protocol_stale" as const;
        if (
          protocol.humanReviewRequired &&
          (!parsed.data.humanReviewConfirmed ||
            parsed.data.protocolReviewVersion !== protocol.version)
        )
          return "protocol_review_required" as const;
        if (
          task.safetyClass === "restricted" &&
          !(await hasCapability(
            tenantId,
            parsed.data.responderUserId,
            "emergency.respond.restricted",
            { scopeType: "case", scopeRef: task.caseId }
          ))
        )
          return "restricted_responder_required" as const;
        const expectedContribution = parsed.data.expectedContribution;
        if (task.needId) {
          if (expectedContribution === undefined)
            return "contribution_required" as const;
          const [need] = await tx
            .select()
            .from(emergencyNeeds)
            .where(
              and(
                eq(emergencyNeeds.tenantId, tenantId),
                eq(emergencyNeeds.id, task.needId)
              )
            )
            .for("update")
            .limit(1);
          if (!need) return false;
          if (!["verified", "partially_fulfilled"].includes(need.status))
            return "need_not_verified" as const;
          if (need.requestedQuantity !== null) {
            const active = await tx
              .select({ scopeJson: emergencyAssignments.scopeJson })
              .from(emergencyAssignments)
              .where(
                and(
                  eq(emergencyAssignments.tenantId, tenantId),
                  eq(emergencyAssignments.needId, need.id),
                  inArray(emergencyAssignments.status, [
                    "offered",
                    "accepted",
                    "en_route",
                    "working",
                  ])
                )
              );
            const reserved = active.reduce((sum, assignment) => {
              const value = safeRecord(
                assignment.scopeJson
              ).expectedContribution;
              const quantity =
                typeof value === "number" ? value : Number(value);
              return (
                sum +
                (Number.isFinite(quantity) && quantity > 0
                  ? quantityMilli(quantity)
                  : 0)
              );
            }, 0);
            if (
              quantityMilli(need.fulfilledQuantity) +
                reserved +
                quantityMilli(expectedContribution) >
              quantityMilli(need.requestedQuantity)
            )
              return "contribution_over_requested" as const;
          }
        }
        const now = new Date();
        const [assignment] = await tx
          .insert(emergencyAssignments)
          .values({
            tenantId,
            caseId: task.caseId,
            needId: task.needId,
            taskId: task.id,
            responderUserId: parsed.data.responderUserId,
            status: "offered",
            scopeJson: {
              safetyClass: task.safetyClass,
              instructions: safeRecord(task.taskJson).instructions ?? "",
              protocolVersion: protocol.version,
              humanReviewConfirmed: parsed.data.humanReviewConfirmed,
              ...(expectedContribution !== undefined
                ? { expectedContribution }
                : {}),
            },
            updatedAt: now,
          })
          .onConflictDoNothing()
          .returning({ id: emergencyAssignments.id });
        if (!assignment) return false;
        await tx
          .update(emergencyResponseTasks)
          .set({ status: "offered", updatedAt: now })
          .where(eq(emergencyResponseTasks.id, task.id));
        const after = {
          assignmentId: assignment.id,
          responderUserId: parsed.data.responderUserId,
          protocolVersion: protocol.version,
          humanReviewConfirmed: parsed.data.humanReviewConfirmed,
          requestFingerprint: fingerprint,
        };
        const audit = {
          tenantId,
          subjectType: "response_task",
          subjectId: task.id,
          actorType: "user",
          actorRef: String(user!.id),
          eventType: "task_offered",
          reason: parsed.data.reason,
          after,
          createdAt: now.toISOString(),
        };
        await tx.insert(emergencyAuditEvents).values({
          ...audit,
          eventIdempotencyKey: idem,
          eventHash: auditHash(audit),
          afterJson: audit.after,
          createdAt: now,
        });
        return { id: assignment.id, duplicate: false };
      });
      return outcome === null
        ? reply(res, 404, { error: "TASK_NOT_FOUND" })
        : outcome === "unverified"
          ? reply(res, 422, { error: "RESPONDER_NOT_VERIFIED" })
          : outcome === "protocol_stale"
            ? reply(res, 409, {
                error: "TASK_PROTOCOL_STALE_RECREATE_REQUIRED",
              })
            : outcome === "protocol_safety_class"
              ? reply(res, 422, {
                  error: "TASK_SAFETY_CLASS_BELOW_PROTOCOL_MINIMUM",
                })
              : outcome === "protocol_review_required"
                ? reply(res, 422, { error: "HUMAN_PROTOCOL_REVIEW_REQUIRED" })
                : outcome === "restricted_responder_required"
                  ? reply(res, 422, {
                      error: "RESTRICTED_RESPONSE_CAPABILITY_REQUIRED",
                    })
                  : outcome === "need_not_verified"
                    ? reply(res, 409, { error: "NEED_NOT_VERIFIED" })
                    : outcome === "contribution_required"
                      ? reply(res, 400, {
                          error: "EXPECTED_CONTRIBUTION_REQUIRED",
                        })
                      : outcome === "contribution_over_requested"
                        ? reply(res, 409, {
                            error: "NEED_CONTRIBUTION_EXCEEDS_REMAINING",
                          })
                        : outcome === "idempotency_reused"
                          ? reply(res, 409, { error: "IDEMPOTENCY_KEY_REUSED" })
                          : outcome === false
                            ? reply(res, 409, { error: "TASK_NOT_ASSIGNABLE" })
                            : reply(res, outcome.duplicate ? 200 : 201, {
                                assignmentId: outcome.id,
                                duplicate: outcome.duplicate,
                              });
    }
    case "operations.command.task.update": {
      const parsed = taskStatusSchema.safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "INVALID_TASK_UPDATE" });
      const key = req.header("idempotency-key")?.trim();
      if (!key || key.length < 8 || key.length > 160)
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      const outcome = await getDb().transaction(async tx => {
        const idem = `task:update:${params.taskId}:${sha256(key)}`;
        const fingerprint = requestFingerprint(parsed.data);
        const [prior] = await tx
          .select({
            id: emergencyAuditEvents.id,
            afterJson: emergencyAuditEvents.afterJson,
          })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.eventIdempotencyKey, idem)
            )
          )
          .limit(1);
        if (prior)
          return safeRecord(prior.afterJson).requestFingerprint === fingerprint
            ? ("duplicate" as const)
            : ("idempotency_reused" as const);
        const [task] = await tx
          .select()
          .from(emergencyResponseTasks)
          .where(
            and(
              eq(emergencyResponseTasks.tenantId, tenantId),
              eq(emergencyResponseTasks.id, params.taskId)
            )
          )
          .for("update")
          .limit(1);
        if (!task) return "not_found" as const;
        const [lockedPrior] = await tx
          .select({
            id: emergencyAuditEvents.id,
            afterJson: emergencyAuditEvents.afterJson,
          })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.eventIdempotencyKey, idem)
            )
          )
          .limit(1);
        if (lockedPrior)
          return safeRecord(lockedPrior.afterJson).requestFingerprint ===
            fingerprint
            ? ("duplicate" as const)
            : ("idempotency_reused" as const);
        if (task.status !== parsed.data.expectedStatus)
          return "conflict" as const;
        if (!canTransitionStoredEmergencyTask(task.status, parsed.data.status))
          return "transition" as const;
        if (parsed.data.status === "cancelled") {
          const [caseContext] = await tx
            .select({ context: emergencyCases.caseContextJson })
            .from(emergencyCases)
            .where(
              and(
                eq(emergencyCases.tenantId, tenantId),
                eq(emergencyCases.id, task.caseId)
              )
            )
            .limit(1);
          const triage = safeRecord(safeRecord(caseContext?.context).triage);
          const protocol = getEmergencyProtocolPack({
            hazardCategory: (typeof triage.hazardCategory === "string"
              ? triage.hazardCategory
              : "unknown") as Parameters<
              typeof getEmergencyProtocolPack
            >[0]["hazardCategory"],
            severity: (typeof triage.severity === "string"
              ? triage.severity
              : "unknown") as Parameters<
              typeof getEmergencyProtocolPack
            >[0]["severity"],
          });
          const taskJson = safeRecord(task.taskJson);
          const protocolCurrent =
            taskJson.protocolVersion === protocol.version &&
            JSON.stringify(taskJson.protocolActions) ===
              JSON.stringify(protocol.actions);
          const activeAssignments = await tx
            .select({ id: emergencyAssignments.id })
            .from(emergencyAssignments)
            .where(
              and(
                eq(emergencyAssignments.tenantId, tenantId),
                eq(emergencyAssignments.taskId, task.id),
                inArray(emergencyAssignments.status, [
                  "offered",
                  "accepted",
                  "en_route",
                  "working",
                ])
              )
            )
            .limit(1);
          if (activeAssignments.length) {
            const rows = await tx
              .select()
              .from(emergencyAssignments)
              .where(
                and(
                  eq(emergencyAssignments.tenantId, tenantId),
                  eq(emergencyAssignments.taskId, task.id),
                  inArray(emergencyAssignments.status, [
                    "offered",
                    "accepted",
                    "en_route",
                    "working",
                  ])
                )
              )
              .for("update");
            let authorizedAssignmentsRemain = false;
            for (const assignment of rows) {
              const needsRestricted =
                safeRecord(assignment.scopeJson).safetyClass === "restricted";
              const baseAuthorized = await hasCapability(
                tenantId,
                assignment.responderUserId,
                "emergency.respond",
                { scopeType: "case", scopeRef: assignment.caseId }
              );
              const restrictedAuthorized =
                !needsRestricted ||
                (await hasCapability(
                  tenantId,
                  assignment.responderUserId,
                  "emergency.respond.restricted",
                  { scopeType: "case", scopeRef: assignment.caseId }
                ));
              const stillAuthorized =
                baseAuthorized && restrictedAuthorized && protocolCurrent;
              if (stillAuthorized) {
                authorizedAssignmentsRemain = true;
                continue;
              }
              const now = new Date();
              await tx
                .update(emergencyAssignments)
                .set({ status: "cancelled", updatedAt: now })
                .where(
                  and(
                    eq(emergencyAssignments.tenantId, tenantId),
                    eq(emergencyAssignments.id, assignment.id),
                    inArray(emergencyAssignments.status, [
                      "offered",
                      "accepted",
                      "en_route",
                      "working",
                    ])
                  )
                );
              const audit = {
                tenantId,
                subjectType: "response_task",
                subjectId: task.id,
                actorType: "system",
                actorRef: "policy:assignment_eligibility_changed",
                eventType: "ineligible_assignment_cancelled",
                reason: protocolCurrent
                  ? "Responder capability required by the active assignment is no longer active"
                  : "Current hazard protocol no longer matches the assignment snapshot",
                before: {
                  assignmentId: assignment.id,
                  status: assignment.status,
                },
                after: { assignmentId: assignment.id, status: "cancelled" },
                createdAt: now.toISOString(),
              };
              await tx
                .insert(emergencyAuditEvents)
                .values({
                  ...audit,
                  eventIdempotencyKey: `unauthorized-assignment-cancel:${assignment.id}`,
                  eventHash: auditHash(audit),
                  beforeJson: audit.before,
                  afterJson: audit.after,
                  createdAt: now,
                })
                .onConflictDoNothing();
            }
            if (authorizedAssignmentsRemain)
              return "active_assignments" as const;
          }
        }
        const now = new Date();
        await tx
          .update(emergencyResponseTasks)
          .set({ status: parsed.data.status, updatedAt: now })
          .where(eq(emergencyResponseTasks.id, task.id));
        const after = {
          status: parsed.data.status,
          requestFingerprint: fingerprint,
        };
        const audit = {
          tenantId,
          subjectType: "response_task",
          subjectId: task.id,
          actorType: "user",
          actorRef: String(user!.id),
          eventType: `task_${parsed.data.status}`,
          reason: parsed.data.reason,
          before: { status: task.status },
          after,
          createdAt: now.toISOString(),
        };
        await tx.insert(emergencyAuditEvents).values({
          ...audit,
          eventIdempotencyKey: idem,
          eventHash: auditHash(audit),
          beforeJson: audit.before,
          afterJson: audit.after,
          createdAt: now,
        });
        return "updated" as const;
      });
      return outcome === "not_found"
        ? reply(res, 404, { error: "TASK_NOT_FOUND" })
        : outcome === "idempotency_reused"
          ? reply(res, 409, { error: "IDEMPOTENCY_KEY_REUSED" })
          : outcome === "conflict"
            ? reply(res, 409, { error: "TASK_STATUS_CONFLICT" })
            : outcome === "transition"
              ? reply(res, 422, { error: "TASK_TRANSITION_INVALID" })
              : outcome === "active_assignments"
                ? reply(res, 409, { error: "TASK_HAS_ACTIVE_RESPONDERS" })
                : reply(res, 200, {
                    updated: outcome === "updated",
                    duplicate: outcome === "duplicate",
                  });
    }
    case "operations.command.case.update": {
      const parsed = commandCaseUpdateSchema.safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "INVALID_COMMAND_CASE_UPDATE" });
      if (
        parsed.data.publishToPublic &&
        user!.role !== "admin" &&
        !(await hasCapability(tenantId, user!.id, "emergency.verify", {
          scopeType: "case",
          scopeRef: params.caseId,
        }))
      ) {
        return reply(res, 403, {
          error: "EMERGENCY_PUBLICATION_REQUIRES_VERIFICATION_CAPABILITY",
        });
      }
      const idempotencyKey = req.header("idempotency-key")?.trim();
      if (
        !idempotencyKey ||
        idempotencyKey.length < 8 ||
        idempotencyKey.length > 160
      )
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      const result = await getDb().transaction(async tx => {
        const eventIdempotencyKey = `command-case:${params.caseId}:${sha256(idempotencyKey)}`;
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:${eventIdempotencyKey}`}, 0))`
        );
        const [priorEvent] = await tx
          .select({
            id: emergencyCaseEvents.id,
            payloadJson: emergencyCaseEvents.payloadJson,
          })
          .from(emergencyCaseEvents)
          .where(
            and(
              eq(emergencyCaseEvents.tenantId, tenantId),
              eq(emergencyCaseEvents.eventIdempotencyKey, eventIdempotencyKey)
            )
          )
          .limit(1);
        if (priorEvent)
          return safeRecord(priorEvent.payloadJson).requestFingerprint ===
            requestFingerprint(parsed.data)
            ? { state: "duplicate" as const, situationRef: null }
            : { state: "idempotency_reused" as const, situationRef: null };
        const [row] = await tx
          .select()
          .from(emergencyCases)
          .where(
            and(
              eq(emergencyCases.tenantId, tenantId),
              eq(emergencyCases.id, params.caseId)
            )
          )
          .for("update")
          .limit(1);
        if (!row) return { state: "not_found" as const, situationRef: null };
        if (row.revision !== parsed.data.revision)
          return { state: "conflict" as const, situationRef: null };
        const allowed: Record<string, string[]> = {
          open: ["triage", "active", "waiting", "resolved", "closed"],
          triage: ["active", "waiting", "resolved", "closed"],
          active: ["waiting", "resolved", "closed"],
          waiting: ["active", "resolved", "closed"],
          resolved: ["active", "closed"],
          closed: ["active"],
        };
        if (
          parsed.data.status !== row.status &&
          !allowed[row.status]?.includes(parsed.data.status)
        )
          return { state: "transition" as const, situationRef: null };
        const [report] = row.reportId
          ? await tx
              .select()
              .from(emergencyReports)
              .where(
                and(
                  eq(emergencyReports.tenantId, tenantId),
                  eq(emergencyReports.id, row.reportId)
                )
              )
              .limit(1)
          : [];
        const now = new Date();
        const triageAdvisory = evaluateEmergencyTriage({
          hazardCategory: parsed.data.hazardCategory,
          severity: parsed.data.severity,
          observedAt: report?.observedAt?.toISOString() ?? null,
          now,
        });
        const requiredReviews = requiredEmergencyCaseReviews(triageAdvisory);
        const reviewFingerprint = sha256(
          JSON.stringify({
            hazardCategory: parsed.data.hazardCategory,
            hazardCode: parsed.data.hazardCode,
            severity: parsed.data.severity,
            observedAt: report?.observedAt?.toISOString() ?? null,
          })
        );
        const priorReviews = await tx
          .select()
          .from(emergencyCaseReviewItems)
          .where(
            and(
              eq(emergencyCaseReviewItems.tenantId, tenantId),
              eq(emergencyCaseReviewItems.caseId, row.id)
            )
          );
        const openReviews = priorReviews.filter(item => item.state === "open");
        const satisfiedReviews = new Set(
          priorReviews
            .filter(
              item =>
                item.state === "completed" &&
                safeRecord(item.basisJson).fingerprint === reviewFingerprint
            )
            .map(item => item.kind)
        );
        for (const kind of requiredReviews) {
          if (satisfiedReviews.has(kind)) continue;
          const existingOpen = openReviews.find(item => item.kind === kind);
          if (existingOpen) {
            if (
              safeRecord(existingOpen.basisJson).fingerprint !==
              reviewFingerprint
            ) {
              await tx
                .update(emergencyCaseReviewItems)
                .set({
                  caseRevision: row.revision + 1,
                  basisJson: {
                    basis: triageAdvisory.basis,
                    fingerprint: reviewFingerprint,
                    supersedesFingerprint: safeRecord(existingOpen.basisJson)
                      .fingerprint,
                  },
                  dueAt:
                    kind === "verification"
                      ? now
                      : new Date(now.getTime() + 30 * 60_000),
                  updatedAt: now,
                })
                .where(
                  and(
                    eq(emergencyCaseReviewItems.tenantId, tenantId),
                    eq(emergencyCaseReviewItems.id, existingOpen.id),
                    eq(emergencyCaseReviewItems.state, "open")
                  )
                );
            }
            continue;
          }
          await tx
            .insert(emergencyCaseReviewItems)
            .values({
              tenantId,
              caseId: row.id,
              kind,
              caseRevision: row.revision + 1,
              basisJson: {
                basis: triageAdvisory.basis,
                fingerprint: reviewFingerprint,
              },
              dueAt:
                kind === "verification"
                  ? now
                  : new Date(now.getTime() + 30 * 60_000),
              openedByUserId: user!.id,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoNothing();
        }
        if (
          parsed.data.status === "resolved" ||
          parsed.data.status === "closed"
        ) {
          if (
            openReviews.length ||
            requiredReviews.some(kind => !satisfiedReviews.has(kind))
          ) {
            return { state: "review_required" as const, situationRef: null };
          }
        }
        let incidentId = row.incidentId;
        let eventId: string | null = null;
        if (!incidentId) {
          const [event] = await tx
            .insert(emergencyEvents)
            .values({
              tenantId,
              eventType: "citizen_report",
              status: "monitoring",
              occurredAt: report?.observedAt ?? report?.createdAt ?? now,
              provenanceJson: {
                source: "citizen_report",
                reportId: report?.id ?? null,
                verification: "unverified",
              },
            })
            .returning({ id: emergencyEvents.id });
          eventId = event.id;
          const [incident] = await tx
            .insert(emergencyIncidents)
            .values({
              tenantId,
              eventId,
              reportId: report?.id ?? null,
              hazardType: `${parsed.data.hazardCategory}:${parsed.data.hazardCode}`,
              status: parsed.data.status === "active" ? "active" : "assessed",
              severity: parsed.data.severity,
              exactLocation: report?.exactLocation ?? null,
              provenanceJson: {
                source: "human_triage",
                verification: "unverified",
              },
            })
            .returning({ id: emergencyIncidents.id });
          incidentId = incident.id;
        }
        await tx
          .update(emergencyIncidents)
          .set({
            hazardType: `${parsed.data.hazardCategory}:${parsed.data.hazardCode}`,
            severity: parsed.data.severity,
            status:
              parsed.data.status === "resolved" ||
              parsed.data.status === "closed"
                ? "resolved"
                : parsed.data.status === "active"
                  ? "active"
                  : "assessed",
            updatedAt: now,
          })
          .where(
            and(
              eq(emergencyIncidents.tenantId, tenantId),
              eq(emergencyIncidents.id, incidentId)
            )
          );
        let situationRef: string | null = null;
        const [existingSituation] = await tx
          .select()
          .from(emergencySituations)
          .where(
            and(
              eq(emergencySituations.tenantId, tenantId),
              eq(emergencySituations.incidentId, incidentId)
            )
          )
          .limit(1);
        if (existingSituation) {
          situationRef = existingSituation.publicRef;
          const terminalSituation =
            parsed.data.status === "resolved" ||
            parsed.data.status === "closed";
          if (parsed.data.publishToPublic || terminalSituation) {
            await tx
              .update(emergencySituations)
              .set({
                status: terminalSituation ? "resolved" : "active",
                severity: parsed.data.severity,
                ...(parsed.data.publishToPublic
                  ? {
                      publicProjectionJson: {
                        summary: parsed.data.publicSummary,
                        hazard: {
                          category: parsed.data.hazardCategory,
                          code: parsed.data.hazardCode,
                          taxonomyVersion: "spec260-v1",
                        },
                        sourceStatus: "unverified",
                      },
                      observedAt: now,
                    }
                  : {}),
                freshUntil: terminalSituation
                  ? now
                  : new Date(now.getTime() + 60 * 60_000),
                updatedAt: now,
              })
              .where(
                and(
                  eq(emergencySituations.id, existingSituation.id),
                  eq(emergencySituations.tenantId, tenantId)
                )
              );
          }
        } else if (parsed.data.publicSummary) {
          const terminalSituation =
            parsed.data.status === "resolved" ||
            parsed.data.status === "closed";
          situationRef = publicRef("SIT");
          await tx.insert(emergencySituations).values({
            tenantId,
            eventId,
            incidentId,
            publicRef: situationRef,
            status: parsed.data.publishToPublic
              ? terminalSituation
                ? "resolved"
                : "active"
              : "draft",
            severity: parsed.data.severity,
            publicProjectionJson: parsed.data.publishToPublic
              ? {
                  summary: parsed.data.publicSummary,
                  hazard: {
                    category: parsed.data.hazardCategory,
                    code: parsed.data.hazardCode,
                    taxonomyVersion: "spec260-v1",
                  },
                  sourceStatus: "unverified",
                }
              : {},
            observedAt: parsed.data.publishToPublic ? now : null,
            freshUntil: parsed.data.publishToPublic
              ? new Date(now.getTime() + 60 * 60_000)
              : null,
          });
        }
        const revision = row.revision + 1;
        const before = {
          status: row.status,
          revision: row.revision,
          incidentId: row.incidentId,
        };
        const after = {
          status: parsed.data.status,
          revision,
          incidentId,
          situationRef,
          hazardCategory: parsed.data.hazardCategory,
          hazardCode: parsed.data.hazardCode,
          severity: parsed.data.severity,
          triageAdvisory,
        };
        const payload = {
          ...after,
          publicSummary: parsed.data.publicSummary ?? null,
          requestFingerprint: requestFingerprint(parsed.data),
        };
        const [previousEvent] = await tx
          .select({ eventHash: emergencyCaseEvents.eventHash })
          .from(emergencyCaseEvents)
          .where(
            and(
              eq(emergencyCaseEvents.tenantId, tenantId),
              eq(emergencyCaseEvents.caseId, row.id)
            )
          )
          .orderBy(desc(emergencyCaseEvents.revision))
          .limit(1);
        const hash = auditHash({
          previousHash: previousEvent?.eventHash ?? null,
          tenantId,
          subjectType: "case",
          subjectId: row.id,
          actorType: "user",
          actorRef: String(user!.id),
          eventType: "human_triage",
          reason: parsed.data.reason,
          before,
          after,
          createdAt: now.toISOString(),
        });
        const context = {
          ...safeRecord(row.caseContextJson),
          triage: {
            ...safeRecord(safeRecord(row.caseContextJson).triage),
            hazardCategory: parsed.data.hazardCategory,
            hazardCode: parsed.data.hazardCode,
            severity: parsed.data.severity,
            publicSummary: parsed.data.publicSummary ?? null,
            ...(parsed.data.jurisdictionRef
              ? { jurisdictionRef: parsed.data.jurisdictionRef }
              : {}),
            advisory: triageAdvisory,
            reviewedAt: now.toISOString(),
            reviewedBy: user!.id,
          },
        };
        const [updated] = await tx
          .update(emergencyCases)
          .set({
            status: parsed.data.status,
            incidentId,
            revision,
            caseContextJson: context,
            updatedAt: now,
          })
          .where(
            and(
              eq(emergencyCases.tenantId, tenantId),
              eq(emergencyCases.id, row.id),
              eq(emergencyCases.revision, row.revision)
            )
          )
          .returning({ id: emergencyCases.id });
        if (!updated) throw new Error("CASE_REVISION_CONFLICT");
        await tx.insert(emergencyCaseEvents).values({
          tenantId,
          caseId: row.id,
          eventIdempotencyKey,
          actorType: "user",
          actorRef: String(user!.id),
          eventType: "human_triage",
          reason: parsed.data.reason,
          revision,
          previousHash: previousEvent?.eventHash ?? null,
          eventHash: hash,
          payloadJson: payload,
          createdAt: now,
        });
        if (report)
          await tx
            .update(emergencyReports)
            .set({ status: "linked", updatedAt: now })
            .where(
              and(
                eq(emergencyReports.id, report.id),
                eq(emergencyReports.tenantId, tenantId)
              )
            );
        if (situationRef) {
          const [situation] = await tx
            .select({
              id: emergencySituations.id,
              status: emergencySituations.status,
            })
            .from(emergencySituations)
            .where(
              and(
                eq(emergencySituations.tenantId, tenantId),
                eq(emergencySituations.publicRef, situationRef)
              )
            )
            .limit(1);
          if (situation) {
            const [previousAudit] = await tx
              .select({ eventHash: emergencyAuditEvents.eventHash })
              .from(emergencyAuditEvents)
              .where(
                and(
                  eq(emergencyAuditEvents.tenantId, tenantId),
                  eq(emergencyAuditEvents.subjectType, "situation"),
                  eq(emergencyAuditEvents.subjectId, situation.id)
                )
              )
              .orderBy(desc(emergencyAuditEvents.createdAt))
              .limit(1);
            const auditInput = {
              tenantId,
              subjectType: "situation",
              subjectId: situation.id,
              actorType: "user",
              actorRef: String(user!.id),
              eventType: "human_triage_projection",
              reason: parsed.data.reason,
              after: { status: situation.status, publicRef: situationRef },
              previousHash: previousAudit?.eventHash ?? null,
              createdAt: now.toISOString(),
            };
            await tx
              .insert(emergencyAuditEvents)
              .values({
                ...auditInput,
                eventIdempotencyKey: `triage-projection:${sha256(idempotencyKey)}`,
                eventHash: auditHash(auditInput),
                afterJson: auditInput.after,
                createdAt: now,
              })
              .onConflictDoNothing();
          }
        }
        return { state: "updated" as const, situationRef };
      });
      if (result.state === "not_found")
        return reply(res, 404, { error: "CASE_NOT_FOUND" });
      if (result.state === "conflict")
        return reply(res, 409, { error: "CASE_REVISION_CONFLICT" });
      if (result.state === "transition")
        return reply(res, 422, { error: "CASE_TRANSITION_INVALID" });
      if (result.state === "review_required")
        return reply(res, 409, { error: "CASE_REVIEW_ITEMS_OPEN" });
      if (result.state === "idempotency_reused")
        return reply(res, 409, { error: "IDEMPOTENCY_KEY_REUSED" });
      return reply(res, 200, {
        updated: result.state === "updated",
        duplicate: result.state === "duplicate",
        situationRef: result.situationRef,
      });
    }
    case "operations.command.update": {
      const parsed = situationUpdateSchema.safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "INVALID_SITUATION_UPDATE" });
      const result = await getDb().transaction(async tx => {
        const [row] = await tx
          .select()
          .from(emergencySituations)
          .where(
            and(
              eq(emergencySituations.tenantId, tenantId),
              eq(emergencySituations.id, params.situationId)
            )
          )
          .for("update")
          .limit(1);
        if (!row) return "not_found" as const;
        if (row.status !== parsed.data.expectedStatus)
          return "conflict" as const;
        const allowed: Record<string, string[]> = {
          monitoring: ["active", "contained", "resolved", "cancelled"],
          active: ["contained", "resolved", "cancelled"],
          contained: ["active", "resolved", "cancelled"],
          resolved: ["active"],
          cancelled: [],
        };
        if (
          row.status !== parsed.data.status &&
          !allowed[row.status]?.includes(parsed.data.status)
        )
          return "transition" as const;
        const now = new Date();
        const [updated] = await tx
          .update(emergencySituations)
          .set({ status: parsed.data.status, updatedAt: now })
          .where(
            and(
              eq(emergencySituations.id, row.id),
              eq(emergencySituations.status, row.status)
            )
          )
          .returning({ id: emergencySituations.id });
        if (!updated) return "conflict" as const;
        const [previousAudit] = await tx
          .select({ eventHash: emergencyAuditEvents.eventHash })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.subjectType, "situation"),
              eq(emergencyAuditEvents.subjectId, row.id)
            )
          )
          .orderBy(desc(emergencyAuditEvents.createdAt))
          .limit(1);
        const auditInput = {
          tenantId,
          subjectType: "situation",
          subjectId: row.id,
          actorType: "user",
          actorRef: String(user!.id),
          eventType: "situation_status_changed",
          reason: parsed.data.reason,
          before: { status: row.status },
          after: { status: parsed.data.status },
          previousHash: previousAudit?.eventHash ?? null,
          createdAt: now.toISOString(),
        };
        await tx.insert(emergencyAuditEvents).values({
          ...auditInput,
          eventIdempotencyKey: `situation:${row.id}:${row.updatedAt.toISOString()}:${parsed.data.status}`,
          eventHash: auditHash(auditInput),
          beforeJson: { status: row.status },
          afterJson: { status: parsed.data.status },
          createdAt: now,
        });
        return "updated" as const;
      });
      return result === "not_found"
        ? reply(res, 404, { error: "SITUATION_NOT_FOUND" })
        : result === "conflict"
          ? reply(res, 409, { error: "SITUATION_STATUS_CONFLICT" })
          : result === "transition"
            ? reply(res, 422, { error: "SITUATION_TRANSITION_INVALID" })
            : reply(res, 200, { updated: true });
    }
    case "operations.capabilities.list": {
      if (user!.role !== "admin" && user!.role !== "domain_admin")
        return reply(res, 403, { error: "ADMIN_REQUIRED" });
      const rows = await getDb()
        .select({
          id: emergencyCapabilityGrants.id,
          userId: emergencyCapabilityGrants.userId,
          capability: emergencyCapabilityGrants.capability,
          scopeType: emergencyCapabilityGrants.scopeType,
          scopeRef: emergencyCapabilityGrants.scopeRef,
          expiresAt: emergencyCapabilityGrants.expiresAt,
          revokedAt: emergencyCapabilityGrants.revokedAt,
        })
        .from(emergencyCapabilityGrants)
        .where(eq(emergencyCapabilityGrants.tenantId, tenantId))
        .limit(500);
      return reply(res, 200, { items: rows });
    }
    case "operations.capabilities.grant": {
      if (
        user!.role !== "admin" &&
        (user!.role !== "domain_admin" || user!.currentTenantId !== tenantId)
      )
        return reply(res, 403, { error: "ADMIN_REQUIRED" });
      const parsed = capabilityGrantSchema.safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "INVALID_CAPABILITY_GRANT" });
      if (
        (parsed.data.scopeType === "tenant" &&
          parsed.data.scopeRef !== "tenant") ||
        (parsed.data.scopeType !== "tenant" &&
          !/^[0-9a-f-]{36}$/i.test(parsed.data.scopeRef))
      ) {
        return reply(res, 400, { error: "INVALID_CAPABILITY_SCOPE" });
      }
      const [target] = await getDb()
        .select({ id: users.id, currentTenantId: users.currentTenantId })
        .from(users)
        .where(eq(users.id, parsed.data.userId))
        .limit(1);
      if (!target || target.currentTenantId !== tenantId)
        return reply(res, 404, { error: "USER_NOT_FOUND" });
      const grantId = randomUUID();
      if (parsed.data.scopeType === "case") {
        const [resource] = await getDb()
          .select({ id: emergencyCases.id })
          .from(emergencyCases)
          .where(
            and(
              eq(emergencyCases.tenantId, tenantId),
              eq(emergencyCases.id, parsed.data.scopeRef)
            )
          )
          .limit(1);
        if (!resource)
          return reply(res, 404, { error: "CAPABILITY_SCOPE_NOT_FOUND" });
      } else if (parsed.data.scopeType === "situation") {
        const [resource] = await getDb()
          .select({ id: emergencySituations.id })
          .from(emergencySituations)
          .where(
            and(
              eq(emergencySituations.tenantId, tenantId),
              eq(emergencySituations.id, parsed.data.scopeRef)
            )
          )
          .limit(1);
        if (!resource)
          return reply(res, 404, { error: "CAPABILITY_SCOPE_NOT_FOUND" });
      } else if (parsed.data.scopeType === "support_pool") {
        const [resource] = await getDb()
          .select({ id: emergencySupportPools.id })
          .from(emergencySupportPools)
          .where(
            and(
              eq(emergencySupportPools.tenantId, tenantId),
              eq(emergencySupportPools.id, parsed.data.scopeRef)
            )
          )
          .limit(1);
        if (!resource)
          return reply(res, 404, { error: "CAPABILITY_SCOPE_NOT_FOUND" });
      }
      const now = new Date();
      const idempotencyKey = req.header("idempotency-key")?.trim();
      if (
        !idempotencyKey ||
        idempotencyKey.length < 8 ||
        idempotencyKey.length > 160
      )
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      const [grant] = await getDb().transaction(async tx => {
        const [existing] = await tx
          .select()
          .from(emergencyCapabilityGrants)
          .where(
            and(
              eq(emergencyCapabilityGrants.tenantId, tenantId),
              eq(emergencyCapabilityGrants.userId, target.id),
              eq(emergencyCapabilityGrants.capability, parsed.data.capability),
              eq(emergencyCapabilityGrants.scopeType, parsed.data.scopeType),
              eq(emergencyCapabilityGrants.scopeRef, parsed.data.scopeRef)
            )
          )
          .for("update")
          .limit(1);
        const inserted = await tx
          .insert(emergencyCapabilityGrants)
          .values({
            id: grantId,
            tenantId,
            userId: target.id,
            capability: parsed.data.capability,
            scopeType: parsed.data.scopeType,
            scopeRef: parsed.data.scopeRef,
            grantedByUserId: user!.id,
            expiresAt: parsed.data.expiresAt
              ? new Date(parsed.data.expiresAt)
              : null,
          })
          .onConflictDoUpdate({
            target: [
              emergencyCapabilityGrants.tenantId,
              emergencyCapabilityGrants.userId,
              emergencyCapabilityGrants.capability,
              emergencyCapabilityGrants.scopeType,
              emergencyCapabilityGrants.scopeRef,
            ],
            set: {
              grantedByUserId: user!.id,
              expiresAt: parsed.data.expiresAt
                ? new Date(parsed.data.expiresAt)
                : null,
              revokedAt: null,
            },
          })
          .returning({ id: emergencyCapabilityGrants.id });
        const persistedId = inserted[0]?.id;
        if (persistedId) {
          const [previousAudit] = await tx
            .select({ eventHash: emergencyAuditEvents.eventHash })
            .from(emergencyAuditEvents)
            .where(
              and(
                eq(emergencyAuditEvents.tenantId, tenantId),
                eq(emergencyAuditEvents.subjectType, "capability_grant"),
                eq(emergencyAuditEvents.subjectId, persistedId)
              )
            )
            .orderBy(desc(emergencyAuditEvents.createdAt))
            .limit(1);
          const auditInput = {
            tenantId,
            subjectType: "capability_grant",
            subjectId: persistedId,
            actorType: "user",
            actorRef: String(user!.id),
            eventType: existing ? "capability_regranted" : "capability_granted",
            reason: "Emergency capability provisioned by tenant administrator",
            before: existing
              ? {
                  expiresAt: existing.expiresAt?.toISOString() ?? null,
                  revokedAt: existing.revokedAt?.toISOString() ?? null,
                }
              : null,
            after: {
              userId: target.id,
              capability: parsed.data.capability,
              scopeType: parsed.data.scopeType,
              scopeRef: parsed.data.scopeRef,
              expiresAt: parsed.data.expiresAt ?? null,
            },
            previousHash: previousAudit?.eventHash ?? null,
            createdAt: now.toISOString(),
          };
          await tx
            .insert(emergencyAuditEvents)
            .values({
              ...auditInput,
              eventIdempotencyKey: `grant:${persistedId}:${sha256(idempotencyKey)}`,
              eventHash: auditHash(auditInput),
              beforeJson: auditInput.before,
              afterJson: auditInput.after,
              createdAt: now,
            })
            .onConflictDoNothing();
        }
        return inserted;
      });
      return reply(res, 201, { granted: true, grantId: grant?.id });
    }
    case "operations.capabilities.revoke": {
      if (
        user!.role !== "admin" &&
        (user!.role !== "domain_admin" || user!.currentTenantId !== tenantId)
      )
        return reply(res, 403, { error: "ADMIN_REQUIRED" });
      const now = new Date();
      const [grant] = await getDb().transaction(async tx => {
        const [existing] = await tx
          .select()
          .from(emergencyCapabilityGrants)
          .where(
            and(
              eq(emergencyCapabilityGrants.tenantId, tenantId),
              eq(emergencyCapabilityGrants.id, params.grantId),
              isNull(emergencyCapabilityGrants.revokedAt)
            )
          )
          .for("update")
          .limit(1);
        if (!existing) return [];
        const [updated] = await tx
          .update(emergencyCapabilityGrants)
          .set({ revokedAt: now })
          .where(eq(emergencyCapabilityGrants.id, existing.id))
          .returning();
        const [previousAudit] = await tx
          .select({ eventHash: emergencyAuditEvents.eventHash })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.subjectType, "capability_grant"),
              eq(emergencyAuditEvents.subjectId, existing.id)
            )
          )
          .orderBy(desc(emergencyAuditEvents.createdAt))
          .limit(1);
        const auditInput = {
          tenantId,
          subjectType: "capability_grant",
          subjectId: existing.id,
          actorType: "user",
          actorRef: String(user!.id),
          eventType: "capability_revoked",
          reason: "Emergency capability revoked by tenant administrator",
          before: { userId: existing.userId, capability: existing.capability },
          previousHash: previousAudit?.eventHash ?? null,
          createdAt: now.toISOString(),
        };
        await tx.insert(emergencyAuditEvents).values({
          ...auditInput,
          eventIdempotencyKey: `revoke:${existing.id}:${now.getTime()}`,
          eventHash: auditHash(auditInput),
          beforeJson: auditInput.before,
          createdAt: now,
        });
        return updated ? [updated] : [];
      });
      return grant
        ? reply(res, 200, { revoked: true })
        : reply(res, 404, { error: "CAPABILITY_GRANT_NOT_FOUND" });
    }
    case "sponsor.pools.list": {
      return reply(res, 200, { items: await getPublicSupportPools(tenantId) });
    }
    case "sponsor.allocations.list": {
      const [pool] = await getDb()
        .select({ id: emergencySupportPools.id })
        .from(emergencySupportPools)
        .where(
          and(
            eq(emergencySupportPools.tenantId, tenantId),
            eq(emergencySupportPools.publicRef, params.poolId)
          )
        )
        .limit(1);
      if (!pool) return reply(res, 404, { error: "SUPPORT_POOL_NOT_FOUND" });
      const items = await getDb()
        .select()
        .from(emergencyFundAllocations)
        .where(
          and(
            eq(emergencyFundAllocations.tenantId, tenantId),
            eq(emergencyFundAllocations.poolId, pool.id)
          )
        )
        .orderBy(desc(emergencyFundAllocations.createdAt))
        .limit(200);
      return reply(res, 200, {
        items: items.map(item => ({
          id: item.id,
          purposeCode: item.purposeCode,
          restriction: item.restriction,
          amountMinorUnits: item.amountMinorUnits.toString(),
          currency: item.currency,
          status: item.status,
          journalEntryId: item.journalEntryId,
          createdAt: item.createdAt.toISOString(),
        })),
      });
    }
    case "sponsor.allocation.create": {
      const parsed = supportAllocationSchema.safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "INVALID_SUPPORT_ALLOCATION" });
      const idempotencyKey = req.header("idempotency-key")?.trim();
      if (
        !idempotencyKey ||
        idempotencyKey.length < 8 ||
        idempotencyKey.length > 160
      )
        return reply(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      try {
        const allocation = await allocateEmergencySupport(getDb(), {
          tenantId,
          poolRef: params.poolId,
          ...parsed.data,
          actorUserId: user!.id,
          idempotencyKey,
        });
        return reply(res, allocation.replayed ? 200 : 201, allocation);
      } catch (error) {
        if (error instanceof EmergencyFinancialError) {
          const status =
            error.code === "POOL_NOT_FOUND"
              ? 404
              : error.code === "ALLOCATION_FUNDS_INSUFFICIENT"
                ? 409
                : 422;
          return reply(res, status, { error: error.code });
        }
        throw error;
      }
    }
    case "sponsor.pools.manage": {
      const statusSchema = z
        .object({
          status: z.enum(["active", "paused", "closed"]),
          reason: z.string().trim().min(1).max(500),
        })
        .strict();
      const parsed = statusSchema.safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "INVALID_SUPPORT_POOL_UPDATE" });
      const [row] = await getDb()
        .select()
        .from(emergencySupportPools)
        .where(
          and(
            eq(emergencySupportPools.tenantId, tenantId),
            eq(emergencySupportPools.publicRef, params.poolId)
          )
        )
        .limit(1);
      if (!row) return reply(res, 404, { error: "SUPPORT_POOL_NOT_FOUND" });
      const now = new Date();
      const [updated] = await getDb().transaction(async tx => {
        const values = await tx
          .update(emergencySupportPools)
          .set({ status: parsed.data.status, updatedAt: now })
          .where(
            and(
              eq(emergencySupportPools.tenantId, tenantId),
              eq(emergencySupportPools.id, row.id),
              eq(emergencySupportPools.status, row.status)
            )
          )
          .returning();
        const [previousAudit] = await tx
          .select({ eventHash: emergencyAuditEvents.eventHash })
          .from(emergencyAuditEvents)
          .where(
            and(
              eq(emergencyAuditEvents.tenantId, tenantId),
              eq(emergencyAuditEvents.subjectType, "support_pool"),
              eq(emergencyAuditEvents.subjectId, row.id)
            )
          )
          .orderBy(desc(emergencyAuditEvents.createdAt))
          .limit(1);
        const auditInput = {
          tenantId,
          subjectType: "support_pool",
          subjectId: row.id,
          actorType: "user",
          actorRef: String(user!.id),
          eventType: "support_pool_status_changed",
          reason: parsed.data.reason,
          before: { status: row.status },
          after: { status: parsed.data.status },
          previousHash: previousAudit?.eventHash ?? null,
          createdAt: now.toISOString(),
        };
        if (values[0])
          await tx.insert(emergencyAuditEvents).values({
            ...auditInput,
            eventIdempotencyKey: `pool:${row.id}:${now.getTime()}`,
            eventHash: auditHash(auditInput),
            beforeJson: auditInput.before,
            afterJson: auditInput.after,
            createdAt: now,
          });
        return values;
      });
      return updated
        ? reply(res, 200, { updated: true })
        : reply(res, 409, { error: "SUPPORT_POOL_STATUS_CONFLICT" });
    }
    case "sponsor.contributions.create": {
      const parsed = z
        .object({ poolRef: z.string().trim().min(1).max(24) })
        .passthrough()
        .safeParse(req.body);
      if (!parsed.success)
        return reply(res, 400, { error: "SUPPORT_POOL_REQUIRED" });
      return createPublicContribution(req, res, tenantId, parsed.data.poolRef);
    }
    default:
      return reply(res, 501, { error: "EMERGENCY_ROUTE_NOT_IMPLEMENTED" });
  }
}

/**
 * This router must run before hostname tenant middleware and the general /api
 * CSRF middleware. Cloudflare ingress requires a Worker token and route
 * attestation; direct Linux ingress derives trusted request metadata locally.
 * Writes enforce same-origin in both modes.
 */
export function registerSpec260EmergencyEdgeRoutes(app: Express): void {
  app.use("/api", (req: Request, res: Response, next) => {
    const path = req.originalUrl.split("?", 1)[0];
    if (path === "/api/internal/spec260/schedules/evidence-retention") {
      if (
        req.method !== "POST" ||
        req.header("x-spec260-schedule") !== "evidence-retention-v1" ||
        !compareCachedSpec260PlatformEdgeToken(req.header("x-internal-token"))
      ) {
        return reply(res, 401, { error: "SPEC260_SCHEDULE_AUTH_REQUIRED" });
      }
      const body = z
        .object({
          scheduledTime: z.number().int().positive().max(8_000_000_000_000),
          occurrenceKey: z.string().trim().min(1).max(96),
        })
        .strict()
        .safeParse(req.body);
      if (!body.success)
        return reply(res, 400, { error: "SPEC260_SCHEDULE_REQUEST_INVALID" });
      const scheduledAt = new Date(body.data.scheduledTime);
      const requestedOccurrence = `${new Date(Math.floor(scheduledAt.getTime() / 300_000) * 300_000).toISOString().slice(0, 16)}Z:emergency-evidence-retention`;
      const admissionTime = new Date();
      if (
        admissionTime.getTime() - scheduledAt.getTime() >
          7 * 24 * 60 * 60_000 ||
        scheduledAt.getTime() - admissionTime.getTime() > 5 * 60_000 ||
        body.data.occurrenceKey !== requestedOccurrence
      ) {
        return reply(res, 400, {
          error: "SPEC260_SCHEDULE_OCCURRENCE_INVALID",
        });
      }
      const tenantId = process.env.FEATURE_186_SYSTEM_TENANT_ID?.trim();
      if (!tenantId)
        return reply(res, 503, {
          error: "SPEC260_SYSTEM_TENANT_NOT_CONFIGURED",
        });
      const scheduleId = "spec260-emergency-evidence-retention";
      // Missed cron occurrences coalesce into the current five-minute bucket;
      // the original timestamp remains provenance in the job input.
      const occurrenceKey = `${new Date(Math.floor(admissionTime.getTime() / 300_000) * 300_000).toISOString().slice(0, 16)}Z:emergency-evidence-retention`;
      const idempotencyKey = `feature-186:${scheduleId}:${occurrenceKey}`;
      void createControlPlaneJob({
        context: {
          tenantId,
          actorType: "system",
          authorizationScope: `system:schedule:${scheduleId}`,
          correlationId: idempotencyKey,
          idempotencyKey,
        },
        definition: {
          contractVersion: "feature-186-v1",
          jobType: "emergency.evidence.retention",
          executionClass: "short",
          priority: 80,
          input: {
            maxRows: 100,
            requestedOccurrenceKey: body.data.occurrenceKey,
          },
          idempotencyKey,
          retryPolicy: {
            maxAttempts: 3,
            baseDelayMs: 5_000,
            maxDelayMs: 15 * 60_000,
            jitter: "bounded",
            deadlineMs: 6 * 60 * 60 * 1000,
            allowedErrorClasses: ["retryable", "timeout", "unavailable"],
          },
          timeoutPolicy: {
            softTimeoutMs: 10 * 60_000,
            hardTimeoutMs: 30 * 60 * 1000,
          },
          schedule: {
            scheduleId,
            occurrenceKey,
            scheduleVersion: "1",
            timezone: "UTC",
            missedOccurrencePolicy: "coalesce",
          },
        },
        createOptions: { runtimeType: "cloudflare" },
      })
        .then(job =>
          reply(res, 202, {
            accepted: true,
            jobId: job.jobId,
            created: job.created,
          })
        )
        .catch(error => {
          const code =
            error instanceof Error
              ? error.message.slice(0, 120)
              : "SCHEDULE_ADMISSION_FAILED";
          console.error(
            "[Spec260] evidence retention schedule admission failed",
            { code }
          );
          if (!res.headersSent)
            reply(res, 503, { error: "SPEC260_SCHEDULE_ADMISSION_FAILED" });
        });
      return;
    }
    const matched = matchSpec260ApiRouteWithParams(
      req.method,
      req.originalUrl.split("?", 1)[0]
    );
    if (!matched) return next();
    if (resolveSpec260IngressMode() === "cloudflare") {
      if (
        !compareCachedSpec260PlatformEdgeToken(req.header("x-internal-token"))
      ) {
        return reply(res, 401, { error: "EMERGENCY_EDGE_AUTH_REQUIRED" });
      }
      const attestedId = req.header("x-spec260-route-id");
      if (attestedId !== matched.route.id)
        return reply(res, 400, {
          error: "EMERGENCY_ROUTE_ATTESTATION_MISMATCH",
        });
    } else {
      // Direct Linux ingress: replace, never trust, edge-only metadata supplied
      // by callers. Route authorization, tenant scoping, rate limits, and
      // same-origin write checks still run in the canonical handler.
      const host = req.get("host") ?? req.hostname;
      req.headers["x-spec260-original-host"] = host;
      req.headers["x-spec260-original-protocol"] = req.protocol;
      req.headers["x-spec260-route-id"] = matched.route.id;
    }
    void handleEmergencyRoute(req as EmergencyRouteRequest, res).catch(
      error => {
        const code =
          error instanceof Error ? error.message.slice(0, 120) : "unknown";
        console.error("[Spec260] edge request failed", {
          routeId: matched.route.id,
          error: code,
        });
        if (!res.headersSent)
          reply(res, 503, { error: "EMERGENCY_SERVICE_UNAVAILABLE" });
      }
    );
  });
}
