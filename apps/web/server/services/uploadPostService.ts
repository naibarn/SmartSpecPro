import crypto from "node:crypto";

import { TRPCError } from "@trpc/server";
import { and, desc, eq, lt, or, isNull } from "drizzle-orm";
import { SignJWT } from "jose";

import {
  uploadPostConnections,
  uploadPostJobs,
  uploadPostProfiles,
} from "../../drizzle/schema";
import {
  UPLOAD_POST_POLICY_VERSION,
  type UploadPostConnectionDetail,
  type UploadPostJobSummary,
  type UploadPostPlatform,
  type UploadPostProfileSummary,
  type UploadPostQueueSettings,
  type UploadPostQuotaState,
} from "../../shared/uploadPost";
import { type DrizzleDB, getDb } from "../db";
import { decrypt, encrypt } from "./crypto";
import { auditLogger } from "./auditLogger";
import { createUploadPostClient } from "./uploadPostClient";
import { assertUploadPostGatewayEnabled } from "./uploadPostGate";

const DEFAULT_QUEUE_SETTINGS: UploadPostQueueSettings = {
  enabled: true,
  maxPendingJobs: 25,
  publishWindowMinutes: 30,
  retryWindowMinutes: 15,
};

const UPLOAD_POST_JWT_SECRET = process.env.UPLOAD_POST_JWT_SECRET || process.env.JWT_SECRET || "upload-post-dev-secret";
const JWT_BYTES = new TextEncoder().encode(UPLOAD_POST_JWT_SECRET);
const JWT_ISSUER = "smartspec-web";
const JWT_AUDIENCE = "upload-post";
const HANDSHAKE_TTL_MS = 10 * 60 * 1000;

function createFingerprint(apiKey: string): string {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

function keyHint(apiKey: string): string {
  const trimmed = apiKey.trim();
  return trimmed.length <= 4 ? trimmed : trimmed.slice(-4);
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function parseRecord(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object") return null;
  return { ...(input as Record<string, unknown>) };
}

function normalizeQueueSettings(input: unknown): UploadPostQueueSettings {
  if (!input || typeof input !== "object") return { ...DEFAULT_QUEUE_SETTINGS };
  const record = input as Record<string, unknown>;
  return {
    enabled: typeof record.enabled === "boolean" ? record.enabled : DEFAULT_QUEUE_SETTINGS.enabled,
    maxPendingJobs: typeof record.maxPendingJobs === "number" ? record.maxPendingJobs : DEFAULT_QUEUE_SETTINGS.maxPendingJobs,
    publishWindowMinutes: typeof record.publishWindowMinutes === "number" ? record.publishWindowMinutes : DEFAULT_QUEUE_SETTINGS.publishWindowMinutes,
    retryWindowMinutes: typeof record.retryWindowMinutes === "number" ? record.retryWindowMinutes : DEFAULT_QUEUE_SETTINGS.retryWindowMinutes,
  };
}

function normalizeQuotaState(input: { remaining: number | null; limit: number | null; resetAt: Date | null }): UploadPostQuotaState {
  return {
    remaining: input.remaining,
    limit: input.limit,
    resetAt: toIso(input.resetAt),
  };
}

function normalizePlatform(value: string): UploadPostPlatform {
  return value as UploadPostPlatform;
}

function mapConnectionRow(row: {
  id: number;
  tenantId: string;
  userId: number;
  status: string;
  healthStatus: string;
  apiKeyHint: string | null;
  disclosureAcceptedAt: Date | null;
  disclosurePolicyVersion: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastVerifiedAt: Date | null;
  lastHealthCheckAt: Date | null;
  quotaRemaining: number | null;
  quotaLimit: number | null;
  quotaResetAt: Date | null;
  queueSettings: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}): UploadPostConnectionDetail {
  return {
    id: row.id,
    tenantId: row.tenantId,
    userId: row.userId,
    status: (row.status as UploadPostConnectionDetail["status"]) || "pending",
    healthStatus: (row.healthStatus as UploadPostConnectionDetail["healthStatus"]) || "unknown",
    apiKeyHint: row.apiKeyHint,
    consent: {
      accepted: Boolean(row.disclosureAcceptedAt),
      acceptedAt: toIso(row.disclosureAcceptedAt),
      policyVersion: row.disclosurePolicyVersion,
    },
    connectedAt: toIso(row.createdAt) || new Date().toISOString(),
    updatedAt: toIso(row.updatedAt) || new Date().toISOString(),
    lastVerifiedAt: toIso(row.lastVerifiedAt),
    lastHealthCheckAt: toIso(row.lastHealthCheckAt),
    sharedKeyWarning: false,
    quota: normalizeQuotaState({
      remaining: row.quotaRemaining,
      limit: row.quotaLimit,
      resetAt: row.quotaResetAt,
    }),
    queueSettings: normalizeQueueSettings(row.queueSettings),
    analytics: parseRecord(row.metadata),
    profiles: [],
    jobs: [],
  };
}

function mapProfileRow(row: {
  id: number;
  connectionId: number;
  tenantId: string;
  userId: number;
  platform: string;
  platformPageId: string;
  displayName: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}): UploadPostProfileSummary {
  return {
    id: row.id,
    connectionId: row.connectionId,
    tenantId: row.tenantId,
    userId: row.userId,
    platform: normalizePlatform(row.platform),
    platformPageId: row.platformPageId,
    displayName: row.displayName,
    status: row.status as UploadPostProfileSummary["status"],
    metadata: parseRecord(row.metadata),
    createdAt: toIso(row.createdAt) || new Date().toISOString(),
    updatedAt: toIso(row.updatedAt) || new Date().toISOString(),
  };
}

function mapJobRow(row: {
  id: number;
  tenantId: string;
  userId: number;
  connectionId: number;
  profileId: number | null;
  platform: string;
  status: string;
  contentText: string | null;
  contentLink: string | null;
  mediaRefs: string[] | null;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  providerJobId: string | null;
  platformResults: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  metadataClearedAt: Date | null;
  errorMessage: string | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): UploadPostJobSummary {
  return {
    id: row.id,
    tenantId: row.tenantId,
    userId: row.userId,
    connectionId: row.connectionId,
    profileId: row.profileId,
    platform: normalizePlatform(row.platform),
    status: row.status as UploadPostJobSummary["status"],
    contentText: row.contentText,
    contentLink: row.contentLink,
    mediaRefs: row.mediaRefs,
    scheduledAt: toIso(row.scheduledAt),
    publishedAt: toIso(row.publishedAt),
    providerJobId: row.providerJobId,
    errorMessage: row.errorMessage,
    metadata: {
      gateway: "upload_post",
      profileId: row.profileId,
      platform: normalizePlatform(row.platform),
      queueKey: String((row.metadata as Record<string, unknown> | null)?.queueKey || `upload-post:${row.id}`),
      source: (row.metadata as Record<string, unknown> | null)?.source === "workflow"
        ? "workflow"
        : (row.metadata as Record<string, unknown> | null)?.source === "agency"
          ? "agency"
          : "manual",
      scheduledByUserId: typeof (row.metadata as Record<string, unknown> | null)?.scheduledByUserId === "number"
        ? Number((row.metadata as Record<string, unknown> | null)?.scheduledByUserId)
        : null,
      externalJobId: row.providerJobId,
      platformResults: row.platformResults,
      metadataClearedAt: toIso(row.metadataClearedAt),
    },
    lastSyncedAt: toIso(row.lastSyncedAt),
    createdAt: toIso(row.createdAt) || new Date().toISOString(),
    updatedAt: toIso(row.updatedAt) || new Date().toISOString(),
  };
}

async function resolveDb(db?: DrizzleDB | null): Promise<DrizzleDB> {
  const resolved = db ?? await getDb();
  if (!resolved) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not available",
    });
  }
  return resolved;
}

async function resolveConnectionRow(tenantId: string, userId: number, db?: DrizzleDB | null) {
  const resolvedDb = await resolveDb(db);
  const rows = await resolvedDb
    .select({
      id: uploadPostConnections.id,
      tenantId: uploadPostConnections.tenantId,
      userId: uploadPostConnections.userId,
      status: uploadPostConnections.status,
      healthStatus: uploadPostConnections.healthStatus,
      apiKeyHint: uploadPostConnections.apiKeyHint,
      disclosureAcceptedAt: uploadPostConnections.disclosureAcceptedAt,
      disclosurePolicyVersion: uploadPostConnections.disclosurePolicyVersion,
      createdAt: uploadPostConnections.createdAt,
      updatedAt: uploadPostConnections.updatedAt,
      lastVerifiedAt: uploadPostConnections.lastVerifiedAt,
      lastHealthCheckAt: uploadPostConnections.lastHealthCheckAt,
      handshakeNonce: uploadPostConnections.handshakeNonce,
      handshakeNonceExpiresAt: uploadPostConnections.handshakeNonceExpiresAt,
      quotaRemaining: uploadPostConnections.quotaRemaining,
      quotaLimit: uploadPostConnections.quotaLimit,
      quotaResetAt: uploadPostConnections.quotaResetAt,
      queueSettings: uploadPostConnections.queueSettings,
      metadata: uploadPostConnections.metadata,
    })
    .from(uploadPostConnections)
    .where(and(eq(uploadPostConnections.tenantId, tenantId), eq(uploadPostConnections.userId, userId)))
    .orderBy(desc(uploadPostConnections.id))
    .limit(1);

  return rows[0] ?? null;
}

async function resolveConnectionById(connectionId: number, tenantId: string, db?: DrizzleDB | null) {
  const resolvedDb = await resolveDb(db);
  const rows = await resolvedDb
    .select({
      id: uploadPostConnections.id,
      tenantId: uploadPostConnections.tenantId,
      userId: uploadPostConnections.userId,
      status: uploadPostConnections.status,
      healthStatus: uploadPostConnections.healthStatus,
      apiKeyHint: uploadPostConnections.apiKeyHint,
      disclosureAcceptedAt: uploadPostConnections.disclosureAcceptedAt,
      disclosurePolicyVersion: uploadPostConnections.disclosurePolicyVersion,
      createdAt: uploadPostConnections.createdAt,
      updatedAt: uploadPostConnections.updatedAt,
      lastVerifiedAt: uploadPostConnections.lastVerifiedAt,
      lastHealthCheckAt: uploadPostConnections.lastHealthCheckAt,
      handshakeNonce: uploadPostConnections.handshakeNonce,
      handshakeNonceExpiresAt: uploadPostConnections.handshakeNonceExpiresAt,
      quotaRemaining: uploadPostConnections.quotaRemaining,
      quotaLimit: uploadPostConnections.quotaLimit,
      quotaResetAt: uploadPostConnections.quotaResetAt,
      queueSettings: uploadPostConnections.queueSettings,
      metadata: uploadPostConnections.metadata,
    })
    .from(uploadPostConnections)
    .where(and(eq(uploadPostConnections.id, connectionId), eq(uploadPostConnections.tenantId, tenantId)))
    .limit(1);

  return rows[0] ?? null;
}

async function loadConnectionSecret(connectionId: number, tenantId: string, userId: number, db?: DrizzleDB | null): Promise<string> {
  const resolvedDb = await resolveDb(db);
  const rows = await resolvedDb
    .select({
      apiKeyEncrypted: uploadPostConnections.apiKeyEncrypted,
    })
    .from(uploadPostConnections)
    .where(
      and(
        eq(uploadPostConnections.id, connectionId),
        eq(uploadPostConnections.tenantId, tenantId),
        eq(uploadPostConnections.userId, userId),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Upload-Post connection not found" });
  }
  const secret = decrypt(row.apiKeyEncrypted);
  if (!secret) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to decrypt Upload-Post API key",
    });
  }
  return secret;
}

async function updateConnectionSnapshot(
  connectionId: number,
  tenantId: string,
  snapshot: {
    healthStatus?: string;
    lastVerifiedAt?: Date | null;
    lastHealthCheckAt?: Date | null;
    quotaRemaining?: number | null;
    quotaLimit?: number | null;
    quotaResetAt?: Date | null;
    queueSettings?: UploadPostQueueSettings | null;
    metadata?: Record<string, unknown> | null;
    handshakeNonce?: string | null;
    handshakeNonceExpiresAt?: Date | null;
    status?: string;
  },
  db?: DrizzleDB | null,
): Promise<void> {
  const resolvedDb = await resolveDb(db);
  await resolvedDb
    .update(uploadPostConnections)
    .set({
      ...(snapshot.healthStatus ? { healthStatus: snapshot.healthStatus } : {}),
      ...(snapshot.lastVerifiedAt ? { lastVerifiedAt: snapshot.lastVerifiedAt } : {}),
      ...(snapshot.lastHealthCheckAt ? { lastHealthCheckAt: snapshot.lastHealthCheckAt } : {}),
      ...(snapshot.quotaRemaining !== undefined ? { quotaRemaining: snapshot.quotaRemaining } : {}),
      ...(snapshot.quotaLimit !== undefined ? { quotaLimit: snapshot.quotaLimit } : {}),
      ...(snapshot.quotaResetAt !== undefined ? { quotaResetAt: snapshot.quotaResetAt } : {}),
      ...(snapshot.queueSettings ? { queueSettings: snapshot.queueSettings } : {}),
      ...(snapshot.metadata ? { metadata: snapshot.metadata } : {}),
      ...(snapshot.handshakeNonce !== undefined ? { handshakeNonce: snapshot.handshakeNonce } : {}),
      ...(snapshot.handshakeNonceExpiresAt !== undefined ? { handshakeNonceExpiresAt: snapshot.handshakeNonceExpiresAt } : {}),
      ...(snapshot.status ? { status: snapshot.status } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(uploadPostConnections.id, connectionId), eq(uploadPostConnections.tenantId, tenantId)));
}

async function buildConnectionDetail(
  connectionId: number,
  tenantId: string,
  userId: number,
  db?: DrizzleDB | null,
): Promise<UploadPostConnectionDetail> {
  const resolvedDb = await resolveDb(db);
  const connection = await resolveConnectionById(connectionId, tenantId, resolvedDb);
  if (!connection || connection.userId !== userId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Upload-Post connection not found" });
  }

  const profiles = await listUploadPostProfiles({ tenantId, userId, connectionId, db: resolvedDb });
  const jobs = await listUploadPostJobs({ tenantId, userId, connectionId, db: resolvedDb, limit: 50 });
  const detail = mapConnectionRow(connection);
  detail.profiles = profiles;
  detail.jobs = jobs.items;
  detail.sharedKeyWarning = await hasSharedUploadPostKey(tenantId, userId, connectionId, resolvedDb);
  return detail;
}

async function hasSharedUploadPostKey(
  tenantId: string,
  userId: number,
  connectionId: number,
  db?: DrizzleDB | null,
): Promise<boolean> {
  const resolvedDb = await resolveDb(db);
  const rows = await resolvedDb
    .select({
      apiKeyFingerprint: uploadPostConnections.apiKeyFingerprint,
      id: uploadPostConnections.id,
      userId: uploadPostConnections.userId,
    })
    .from(uploadPostConnections)
    .where(and(eq(uploadPostConnections.tenantId, tenantId), eq(uploadPostConnections.id, connectionId)))
    .limit(1);
  const connection = rows[0];
  if (!connection) return false;

  const matches = await resolvedDb
    .select({ id: uploadPostConnections.id })
    .from(uploadPostConnections)
    .where(and(eq(uploadPostConnections.tenantId, tenantId), eq(uploadPostConnections.apiKeyFingerprint, connection.apiKeyFingerprint)))
    .limit(2);
  return matches.length > 1 || (matches.length === 1 && matches[0]?.id !== connectionId && matches.some((item) => item.id !== connectionId));
}

export async function connectUploadPostConnection(params: {
  tenantId: string;
  userId: number;
  apiKey: string;
  disclosureAccepted: boolean;
  disclosurePolicyVersion: string;
}): Promise<UploadPostConnectionDetail> {
  await assertUploadPostGatewayEnabled(params.tenantId);

  if (!params.disclosureAccepted) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "First-use disclosure must be accepted before connecting Upload-Post",
    });
  }

  const apiKey = params.apiKey.trim();
  if (apiKey.length < 20) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Upload-Post API key looks too short",
    });
  }

  const db = await resolveDb();
  const client = createUploadPostClient();
  const fingerprint = createFingerprint(apiKey);
  const now = new Date();
  const encryption = encrypt(apiKey);
  const keyHintValue = keyHint(apiKey);

  let validation: Record<string, unknown> = {};
  try {
    validation = await client.validateConnection(apiKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload-Post validation failed";
    throw new TRPCError({ code: "BAD_REQUEST", message });
  }

  const analytics = await client.getAnalytics(apiKey).catch(() => null);
  const queueSettings = normalizeQueueSettings(validation.queueSettings ?? analytics?.queueSettings ?? null);

  const [existing] = await db
    .select({ id: uploadPostConnections.id })
    .from(uploadPostConnections)
    .where(and(eq(uploadPostConnections.tenantId, params.tenantId), eq(uploadPostConnections.userId, params.userId)))
    .limit(1);

  const [stored] = existing
    ? await db
        .update(uploadPostConnections)
        .set({
          apiKeyEncrypted: encryption,
          apiKeyFingerprint: fingerprint,
          apiKeyHint: keyHintValue,
          status: "active",
          healthStatus: "healthy",
          disclosureAcceptedAt: now,
          disclosurePolicyVersion: params.disclosurePolicyVersion,
          consentAcknowledgedByUserId: params.userId,
          lastVerifiedAt: now,
          lastHealthCheckAt: now,
          quotaRemaining: typeof validation.quotaRemaining === "number" ? validation.quotaRemaining : null,
          quotaLimit: typeof validation.quotaLimit === "number" ? validation.quotaLimit : null,
          quotaResetAt: validation.quotaResetAt ? new Date(String(validation.quotaResetAt)) : null,
          queueSettings,
          metadata: parseRecord(analytics) ?? parseRecord(validation),
          updatedAt: now,
        })
        .where(eq(uploadPostConnections.id, existing.id))
        .returning()
    : await db
        .insert(uploadPostConnections)
        .values({
          tenantId: params.tenantId,
          userId: params.userId,
          apiKeyEncrypted: encryption,
          apiKeyFingerprint: fingerprint,
          apiKeyHint: keyHintValue,
          status: "active",
          healthStatus: "healthy",
          disclosureAcceptedAt: now,
          disclosurePolicyVersion: params.disclosurePolicyVersion,
          consentAcknowledgedByUserId: params.userId,
          lastVerifiedAt: now,
          lastHealthCheckAt: now,
          quotaRemaining: typeof validation.quotaRemaining === "number" ? validation.quotaRemaining : null,
          quotaLimit: typeof validation.quotaLimit === "number" ? validation.quotaLimit : null,
          quotaResetAt: validation.quotaResetAt ? new Date(String(validation.quotaResetAt)) : null,
          queueSettings,
          metadata: parseRecord(analytics) ?? parseRecord(validation),
          createdAt: now,
          updatedAt: now,
        })
        .returning();

  const connectionId = stored?.id ?? existing?.id;
  if (!connectionId) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to persist Upload-Post connection",
    });
  }

  auditLogger.log({
    eventType: "upload_post_connection_connected",
    userId: params.userId,
    metadata: {
      tenantId: params.tenantId,
      connectionId,
      policyVersion: params.disclosurePolicyVersion,
      sharedKeyWarning: await hasSharedUploadPostKey(params.tenantId, params.userId, connectionId, db),
    },
  });

  return buildConnectionDetail(connectionId, params.tenantId, params.userId, db);
}

export async function refreshUploadPostConnection(params: {
  tenantId: string;
  userId: number;
}): Promise<UploadPostConnectionDetail> {
  await assertUploadPostGatewayEnabled(params.tenantId);
  const db = await resolveDb();
  const connection = await resolveConnectionRow(params.tenantId, params.userId, db);
  if (!connection) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Upload-Post connection not found" });
  }

  const apiKey = await loadConnectionSecret(connection.id, params.tenantId, params.userId, db);
  const client = createUploadPostClient();
  const validation = await client.validateConnection(apiKey);
  const analytics = await client.getAnalytics(apiKey).catch(() => null);
  const now = new Date();

  await updateConnectionSnapshot(connection.id, params.tenantId, {
    healthStatus: "healthy",
    lastHealthCheckAt: now,
    lastVerifiedAt: now,
    quotaRemaining: typeof validation.quotaRemaining === "number" ? validation.quotaRemaining : null,
    quotaLimit: typeof validation.quotaLimit === "number" ? validation.quotaLimit : null,
    quotaResetAt: validation.quotaResetAt ? new Date(String(validation.quotaResetAt)) : null,
    queueSettings: normalizeQueueSettings(validation.queueSettings ?? analytics?.queueSettings ?? connection.queueSettings),
    metadata: parseRecord(analytics) ?? parseRecord(validation),
    status: "active",
  }, db);

  return buildConnectionDetail(connection.id, params.tenantId, params.userId, db);
}

export async function getUploadPostConnection(params: {
  tenantId: string;
  userId: number;
}): Promise<UploadPostConnectionDetail | null> {
  await assertUploadPostGatewayEnabled(params.tenantId);
  const db = await resolveDb();
  const connection = await resolveConnectionRow(params.tenantId, params.userId, db);
  if (!connection) return null;
  return buildConnectionDetail(connection.id, params.tenantId, params.userId, db);
}

export async function updateUploadPostQueueSettings(params: {
  tenantId: string;
  userId: number;
  queueSettings: UploadPostQueueSettings;
}): Promise<UploadPostConnectionDetail> {
  await assertUploadPostGatewayEnabled(params.tenantId);
  const db = await resolveDb();
  const connection = await resolveConnectionRow(params.tenantId, params.userId, db);
  if (!connection) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Upload-Post connection not found" });
  }

  await updateConnectionSnapshot(connection.id, params.tenantId, {
    queueSettings: params.queueSettings,
    lastHealthCheckAt: new Date(),
  }, db);
  return buildConnectionDetail(connection.id, params.tenantId, params.userId, db);
}

export async function disconnectUploadPostConnection(params: {
  tenantId: string;
  userId: number;
}): Promise<{ success: boolean }> {
  await assertUploadPostGatewayEnabled(params.tenantId);
  const db = await resolveDb();
  const connection = await resolveConnectionRow(params.tenantId, params.userId, db);
  if (!connection) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Upload-Post connection not found" });
  }

  await db
    .update(uploadPostConnections)
    .set({
      status: "disconnected",
      healthStatus: "unknown",
      handshakeNonce: null,
      handshakeNonceExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(uploadPostConnections.id, connection.id));

  auditLogger.log({
    eventType: "upload_post_connection_disconnected",
    userId: params.userId,
    metadata: {
      tenantId: params.tenantId,
      connectionId: connection.id,
    },
  });

  return { success: true };
}

export async function listUploadPostProfiles(params: {
  tenantId: string;
  userId: number;
  connectionId?: number | null;
  db?: DrizzleDB | null;
}): Promise<UploadPostProfileSummary[]> {
  const resolvedDb = await resolveDb(params.db);
  const connection = params.connectionId
    ? await resolveConnectionById(params.connectionId, params.tenantId, resolvedDb)
    : await resolveConnectionRow(params.tenantId, params.userId, resolvedDb);
  if (!connection || connection.userId !== params.userId) {
    return [];
  }

  const rows = await resolvedDb
    .select({
      id: uploadPostProfiles.id,
      connectionId: uploadPostProfiles.connectionId,
      tenantId: uploadPostProfiles.tenantId,
      userId: uploadPostProfiles.userId,
      platform: uploadPostProfiles.platform,
      platformPageId: uploadPostProfiles.platformPageId,
      displayName: uploadPostProfiles.displayName,
      status: uploadPostProfiles.status,
      metadata: uploadPostProfiles.metadata,
      createdAt: uploadPostProfiles.createdAt,
      updatedAt: uploadPostProfiles.updatedAt,
    })
    .from(uploadPostProfiles)
    .where(
      and(
        eq(uploadPostProfiles.tenantId, params.tenantId),
        eq(uploadPostProfiles.userId, params.userId),
        eq(uploadPostProfiles.connectionId, connection.id),
      ),
    )
    .orderBy(desc(uploadPostProfiles.createdAt), desc(uploadPostProfiles.id));

  return rows.map(mapProfileRow);
}

export async function createUploadPostProfile(params: {
  tenantId: string;
  userId: number;
  platform: UploadPostPlatform;
  platformPageId: string;
  displayName?: string | null;
}): Promise<UploadPostProfileSummary> {
  await assertUploadPostGatewayEnabled(params.tenantId);
  const db = await resolveDb();
  const connection = await resolveConnectionRow(params.tenantId, params.userId, db);
  if (!connection) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Upload-Post connection is required before creating profiles",
    });
  }
  if (!connection.disclosureAcceptedAt || connection.disclosurePolicyVersion !== UPLOAD_POST_POLICY_VERSION) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Upload-Post disclosure must be accepted before creating profiles",
    });
  }

  const apiKey = await loadConnectionSecret(connection.id, params.tenantId, params.userId, db);
  const client = createUploadPostClient();
  const created = await client.createProfile({
    apiKey,
    tenantId: params.tenantId,
    userId: params.userId,
    platform: params.platform,
    platformPageId: params.platformPageId,
    displayName: params.displayName,
  });

  const now = new Date();
  const [row] = await db
    .insert(uploadPostProfiles)
    .values({
      connectionId: connection.id,
      tenantId: params.tenantId,
      userId: params.userId,
      platform: params.platform,
      platformPageId: params.platformPageId,
      displayName: params.displayName ?? (typeof created.displayName === "string" ? created.displayName : null),
      status: "active",
      metadata: parseRecord(created),
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!row) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to create Upload-Post profile",
    });
  }

  auditLogger.log({
    eventType: "upload_post_profile_created",
    userId: params.userId,
    metadata: {
      tenantId: params.tenantId,
      connectionId: connection.id,
      profileId: row.id,
      platform: params.platform,
    },
  });

  return mapProfileRow(row as any);
}

export async function deleteUploadPostProfile(params: {
  tenantId: string;
  userId: number;
  profileId: number;
}): Promise<{ success: boolean }> {
  await assertUploadPostGatewayEnabled(params.tenantId);
  const db = await resolveDb();
  const rows = await db
    .select({
      id: uploadPostProfiles.id,
      connectionId: uploadPostProfiles.connectionId,
      platformPageId: uploadPostProfiles.platformPageId,
    })
    .from(uploadPostProfiles)
    .where(and(eq(uploadPostProfiles.id, params.profileId), eq(uploadPostProfiles.tenantId, params.tenantId), eq(uploadPostProfiles.userId, params.userId)))
    .limit(1);
  const profile = rows[0];
  if (!profile) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Upload-Post profile not found" });
  }

  const connection = await resolveConnectionById(profile.connectionId, params.tenantId, db);
  if (!connection || connection.userId !== params.userId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Upload-Post connection not found" });
  }
  const apiKey = await loadConnectionSecret(connection.id, params.tenantId, params.userId, db);
  await createUploadPostClient().deleteProfile(apiKey, profile.id).catch(() => {
    // Best-effort delete; local record is still removed to keep state consistent.
  });

  await db
    .delete(uploadPostProfiles)
    .where(and(eq(uploadPostProfiles.id, params.profileId), eq(uploadPostProfiles.tenantId, params.tenantId), eq(uploadPostProfiles.userId, params.userId)));

  auditLogger.log({
    eventType: "upload_post_profile_deleted",
    userId: params.userId,
    metadata: {
      tenantId: params.tenantId,
      profileId: params.profileId,
      connectionId: connection.id,
    },
  });

  return { success: true };
}

export async function listUploadPostPlatformPages(params: {
  tenantId: string;
  userId: number;
  platform?: string;
}): Promise<Record<string, unknown>[]> {
  await assertUploadPostGatewayEnabled(params.tenantId);
  const db = await resolveDb();
  const connection = await resolveConnectionRow(params.tenantId, params.userId, db);
  if (!connection) return [];

  const apiKey = await loadConnectionSecret(connection.id, params.tenantId, params.userId, db);
  return createUploadPostClient().listPlatformPages(apiKey, params.platform);
}

export async function getUploadPostAnalytics(params: {
  tenantId: string;
  userId: number;
}): Promise<Record<string, unknown>> {
  await assertUploadPostGatewayEnabled(params.tenantId);
  const db = await resolveDb();
  const connection = await resolveConnectionRow(params.tenantId, params.userId, db);
  if (!connection) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Upload-Post connection not found" });
  }

  const apiKey = await loadConnectionSecret(connection.id, params.tenantId, params.userId, db);
  const analytics = await createUploadPostClient().getAnalytics(apiKey);
  await updateConnectionSnapshot(connection.id, params.tenantId, {
    lastHealthCheckAt: new Date(),
    healthStatus: "healthy",
    metadata: parseRecord(analytics),
  }, db);
  return analytics;
}

export async function generateUploadPostJwt(params: {
  tenantId: string;
  userId: number;
}): Promise<{ jwt: string; nonce: string; callbackUrl: string }> {
  await assertUploadPostGatewayEnabled(params.tenantId);
  const db = await resolveDb();
  const connection = await resolveConnectionRow(params.tenantId, params.userId, db);
  if (!connection) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Upload-Post connection not found" });
  }
  const nonce = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + HANDSHAKE_TTL_MS);
  await updateConnectionSnapshot(connection.id, params.tenantId, {
    handshakeNonce: nonce,
    handshakeNonceExpiresAt: expiresAt,
  }, db);

  const jwt = await new SignJWT({
    tenantId: params.tenantId,
    userId: params.userId,
    connectionId: connection.id,
    nonce,
    policyVersion: UPLOAD_POST_POLICY_VERSION,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setSubject(String(connection.id))
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(JWT_BYTES);

  return {
    jwt,
    nonce,
    callbackUrl: `/auth/callback/upload-post?connectionId=${connection.id}&nonce=${encodeURIComponent(nonce)}`,
  };
}

export async function completeUploadPostConnection(params: {
  tenantId: string;
  userId: number;
  connectionId: number;
  nonce: string;
}): Promise<UploadPostConnectionDetail> {
  await assertUploadPostGatewayEnabled(params.tenantId);
  const db = await resolveDb();
  const connection = await resolveConnectionById(params.connectionId, params.tenantId, db);
  if (!connection || connection.userId !== params.userId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Upload-Post connection not found" });
  }
  if (!connection.handshakeNonce || connection.handshakeNonce !== params.nonce) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Upload-Post nonce mismatch" });
  }
  if (connection.handshakeNonceExpiresAt && connection.handshakeNonceExpiresAt.getTime() < Date.now()) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Upload-Post nonce expired" });
  }

  await updateConnectionSnapshot(connection.id, params.tenantId, {
    handshakeNonce: null,
    handshakeNonceExpiresAt: null,
    lastVerifiedAt: new Date(),
    healthStatus: "healthy",
  }, db);

  return buildConnectionDetail(connection.id, params.tenantId, params.userId, db);
}

async function ensureConnectionAndConsent(
  tenantId: string,
  userId: number,
  db?: DrizzleDB | null,
): Promise<{ connectionId: number; apiKey: string }> {
  const resolvedDb = await resolveDb(db);
  const connection = await resolveConnectionRow(tenantId, userId, resolvedDb);
  if (!connection) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Upload-Post connection is required" });
  }
  if (!connection.disclosureAcceptedAt || connection.disclosurePolicyVersion !== UPLOAD_POST_POLICY_VERSION) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Upload-Post disclosure must be accepted first" });
  }
  const apiKey = await loadConnectionSecret(connection.id, tenantId, userId, resolvedDb);
  return { connectionId: connection.id, apiKey };
}

async function createJobRow(params: {
  tenantId: string;
  userId: number;
  connectionId: number;
  profileId: number | null;
  platform: UploadPostPlatform;
  contentText?: string | null;
  contentLink?: string | null;
  mediaRefs?: string[] | null;
  scheduledAt?: Date | null;
  status: string;
  providerJobId?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown> | null;
  platformResults?: Record<string, unknown> | null;
  db?: DrizzleDB | null;
}): Promise<UploadPostJobSummary> {
  const resolvedDb = await resolveDb(params.db);
  const now = new Date();
  const queueKey = String(params.metadata?.queueKey || `upload-post:${params.tenantId}:${params.connectionId}:${params.profileId ?? "direct"}:${now.getTime()}`);
  const [row] = await resolvedDb
    .insert(uploadPostJobs)
    .values({
      tenantId: params.tenantId,
      userId: params.userId,
      connectionId: params.connectionId,
      profileId: params.profileId,
      platform: params.platform,
      queueKey,
      status: params.status,
      contentText: params.contentText ?? null,
      contentLink: params.contentLink ?? null,
      mediaRefs: params.mediaRefs ?? null,
      scheduledAt: params.scheduledAt ?? null,
      publishedAt: params.status === "published" ? now : null,
      providerJobId: params.providerJobId ?? null,
      platformResults: params.platformResults ?? null,
      metadata: { ...(params.metadata ?? {}), queueKey },
      metadataClearedAt: null,
      errorMessage: params.errorMessage ?? null,
      lastSyncedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!row) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create Upload-Post job" });
  }
  return mapJobRow(row as any);
}

export async function publishUploadPostNow(params: {
  tenantId: string;
  userId: number;
  profileId?: number | null;
  platform?: UploadPostPlatform;
  contentText?: string | null;
  contentLink?: string | null;
  mediaRefs?: string[] | null;
  metadata?: Record<string, unknown> | null;
}): Promise<UploadPostJobSummary> {
  await assertUploadPostGatewayEnabled(params.tenantId);
  const db = await resolveDb();
  const { connectionId, apiKey } = await ensureConnectionAndConsent(params.tenantId, params.userId, db);
  const profile = params.profileId
    ? await db
        .select({
          id: uploadPostProfiles.id,
          platform: uploadPostProfiles.platform,
        })
        .from(uploadPostProfiles)
        .where(and(eq(uploadPostProfiles.id, params.profileId), eq(uploadPostProfiles.tenantId, params.tenantId), eq(uploadPostProfiles.userId, params.userId)))
        .limit(1)
    : [];
  const platform = (profile[0]?.platform ?? params.platform ?? "other") as UploadPostPlatform;
  const job = await createJobRow({
    tenantId: params.tenantId,
    userId: params.userId,
    connectionId,
    profileId: params.profileId ?? profile[0]?.id ?? null,
    platform,
    contentText: params.contentText ?? null,
    contentLink: params.contentLink ?? null,
    mediaRefs: params.mediaRefs ?? null,
    status: "queued",
    metadata: {
      ...(params.metadata ?? {}),
      source: "manual",
    },
    db,
  });

  try {
    const client = createUploadPostClient();
    const remote = await client.createJob({
      apiKey,
      tenantId: params.tenantId,
      userId: params.userId,
      profileId: job.profileId,
      platform: job.platform,
      contentText: job.contentText,
      contentLink: job.contentLink,
      mediaRefs: job.mediaRefs,
      queueKey: job.metadata?.queueKey ?? null,
      metadata: params.metadata,
    });

    const providerJobId = typeof remote.id === "string" ? remote.id : typeof remote.jobId === "string" ? remote.jobId : null;
    await db
      .update(uploadPostJobs)
      .set({
        providerJobId,
        status: typeof remote.status === "string" ? remote.status : "published",
        publishedAt: typeof remote.status === "string" && remote.status === "published" ? new Date() : null,
        platformResults: parseRecord(remote),
        updatedAt: new Date(),
      })
      .where(eq(uploadPostJobs.id, job.id));

    const [updated] = await db
      .select({
        id: uploadPostJobs.id,
        tenantId: uploadPostJobs.tenantId,
        userId: uploadPostJobs.userId,
        connectionId: uploadPostJobs.connectionId,
        profileId: uploadPostJobs.profileId,
        platform: uploadPostJobs.platform,
        status: uploadPostJobs.status,
        contentText: uploadPostJobs.contentText,
        contentLink: uploadPostJobs.contentLink,
        mediaRefs: uploadPostJobs.mediaRefs,
        scheduledAt: uploadPostJobs.scheduledAt,
        publishedAt: uploadPostJobs.publishedAt,
        providerJobId: uploadPostJobs.providerJobId,
        platformResults: uploadPostJobs.platformResults,
        metadata: uploadPostJobs.metadata,
        metadataClearedAt: uploadPostJobs.metadataClearedAt,
        errorMessage: uploadPostJobs.errorMessage,
        lastSyncedAt: uploadPostJobs.lastSyncedAt,
        createdAt: uploadPostJobs.createdAt,
        updatedAt: uploadPostJobs.updatedAt,
      })
      .from(uploadPostJobs)
      .where(eq(uploadPostJobs.id, job.id))
      .limit(1);
    if (!updated) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to refresh Upload-Post job" });
    }
    return mapJobRow(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload-Post publish failed";
    await db
      .update(uploadPostJobs)
      .set({
        status: "failed",
        errorMessage: message,
        updatedAt: new Date(),
      })
      .where(eq(uploadPostJobs.id, job.id));
    throw error instanceof TRPCError ? error : new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
  }
}

export async function scheduleUploadPostJob(params: {
  tenantId: string;
  userId: number;
  profileId?: number | null;
  platform?: UploadPostPlatform;
  contentText?: string | null;
  contentLink?: string | null;
  mediaRefs?: string[] | null;
  scheduledAt: string;
  metadata?: Record<string, unknown> | null;
}): Promise<UploadPostJobSummary> {
  await assertUploadPostGatewayEnabled(params.tenantId);
  const db = await resolveDb();
  const { connectionId } = await ensureConnectionAndConsent(params.tenantId, params.userId, db);
  const parsedScheduledAt = new Date(params.scheduledAt);
  if (Number.isNaN(parsedScheduledAt.getTime())) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid scheduledAt value" });
  }

  const profile = params.profileId
    ? await db
        .select({ id: uploadPostProfiles.id, platform: uploadPostProfiles.platform })
        .from(uploadPostProfiles)
        .where(and(eq(uploadPostProfiles.id, params.profileId), eq(uploadPostProfiles.tenantId, params.tenantId), eq(uploadPostProfiles.userId, params.userId)))
        .limit(1)
    : [];
  const platform = (profile[0]?.platform ?? params.platform ?? "other") as UploadPostPlatform;

  return createJobRow({
    tenantId: params.tenantId,
    userId: params.userId,
    connectionId,
    profileId: params.profileId ?? profile[0]?.id ?? null,
    platform,
    contentText: params.contentText ?? null,
    contentLink: params.contentLink ?? null,
    mediaRefs: params.mediaRefs ?? null,
    scheduledAt: parsedScheduledAt,
    status: "scheduled",
    metadata: {
      ...(params.metadata ?? {}),
      source: "manual",
    },
    db,
  });
}

export async function editUploadPostJob(params: {
  tenantId: string;
  userId: number;
  jobId: number;
  contentText?: string | null;
  contentLink?: string | null;
  mediaRefs?: string[] | null;
  platform?: UploadPostPlatform;
  scheduledAt?: string | null;
}): Promise<UploadPostJobSummary> {
  await assertUploadPostGatewayEnabled(params.tenantId);
  const db = await resolveDb();
  const rows = await db
    .select({
      id: uploadPostJobs.id,
      tenantId: uploadPostJobs.tenantId,
      userId: uploadPostJobs.userId,
      connectionId: uploadPostJobs.connectionId,
      profileId: uploadPostJobs.profileId,
      platform: uploadPostJobs.platform,
      status: uploadPostJobs.status,
      contentText: uploadPostJobs.contentText,
      contentLink: uploadPostJobs.contentLink,
      mediaRefs: uploadPostJobs.mediaRefs,
      scheduledAt: uploadPostJobs.scheduledAt,
      publishedAt: uploadPostJobs.publishedAt,
      providerJobId: uploadPostJobs.providerJobId,
      platformResults: uploadPostJobs.platformResults,
      metadata: uploadPostJobs.metadata,
      metadataClearedAt: uploadPostJobs.metadataClearedAt,
      errorMessage: uploadPostJobs.errorMessage,
      lastSyncedAt: uploadPostJobs.lastSyncedAt,
      createdAt: uploadPostJobs.createdAt,
      updatedAt: uploadPostJobs.updatedAt,
    })
    .from(uploadPostJobs)
    .where(and(eq(uploadPostJobs.id, params.jobId), eq(uploadPostJobs.tenantId, params.tenantId), eq(uploadPostJobs.userId, params.userId)))
    .limit(1);
  const job = rows[0];
  if (!job) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Upload-Post job not found" });
  }

  const nextScheduledAt = params.scheduledAt ? new Date(params.scheduledAt) : job.scheduledAt ?? null;
  if (params.scheduledAt && (!nextScheduledAt || Number.isNaN(nextScheduledAt.getTime()))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid scheduledAt value" });
  }

  await db
    .update(uploadPostJobs)
    .set({
      contentText: params.contentText ?? job.contentText,
      contentLink: params.contentLink ?? job.contentLink,
      mediaRefs: params.mediaRefs ?? job.mediaRefs,
      platform: params.platform ?? job.platform,
      scheduledAt: nextScheduledAt,
      updatedAt: new Date(),
    })
    .where(eq(uploadPostJobs.id, params.jobId));

  const updated = await db
    .select({
      id: uploadPostJobs.id,
      tenantId: uploadPostJobs.tenantId,
      userId: uploadPostJobs.userId,
      connectionId: uploadPostJobs.connectionId,
      profileId: uploadPostJobs.profileId,
      platform: uploadPostJobs.platform,
      status: uploadPostJobs.status,
      contentText: uploadPostJobs.contentText,
      contentLink: uploadPostJobs.contentLink,
      mediaRefs: uploadPostJobs.mediaRefs,
      scheduledAt: uploadPostJobs.scheduledAt,
      publishedAt: uploadPostJobs.publishedAt,
      providerJobId: uploadPostJobs.providerJobId,
      platformResults: uploadPostJobs.platformResults,
      metadata: uploadPostJobs.metadata,
      metadataClearedAt: uploadPostJobs.metadataClearedAt,
      errorMessage: uploadPostJobs.errorMessage,
      lastSyncedAt: uploadPostJobs.lastSyncedAt,
      createdAt: uploadPostJobs.createdAt,
      updatedAt: uploadPostJobs.updatedAt,
    })
    .from(uploadPostJobs)
    .where(eq(uploadPostJobs.id, params.jobId))
    .limit(1);

  const mapped = updated[0] ?? job;
  return mapJobRow(mapped as any);
}

export async function cancelUploadPostJob(params: {
  tenantId: string;
  userId: number;
  jobId: number;
}): Promise<UploadPostJobSummary> {
  await assertUploadPostGatewayEnabled(params.tenantId);
  const db = await resolveDb();
  const rows = await db
    .select({
      id: uploadPostJobs.id,
      tenantId: uploadPostJobs.tenantId,
      userId: uploadPostJobs.userId,
      connectionId: uploadPostJobs.connectionId,
      providerJobId: uploadPostJobs.providerJobId,
      profileId: uploadPostJobs.profileId,
      platform: uploadPostJobs.platform,
      status: uploadPostJobs.status,
      contentText: uploadPostJobs.contentText,
      contentLink: uploadPostJobs.contentLink,
      mediaRefs: uploadPostJobs.mediaRefs,
      scheduledAt: uploadPostJobs.scheduledAt,
      publishedAt: uploadPostJobs.publishedAt,
      platformResults: uploadPostJobs.platformResults,
      metadata: uploadPostJobs.metadata,
      metadataClearedAt: uploadPostJobs.metadataClearedAt,
      errorMessage: uploadPostJobs.errorMessage,
      lastSyncedAt: uploadPostJobs.lastSyncedAt,
      createdAt: uploadPostJobs.createdAt,
      updatedAt: uploadPostJobs.updatedAt,
    })
    .from(uploadPostJobs)
    .where(and(eq(uploadPostJobs.id, params.jobId), eq(uploadPostJobs.tenantId, params.tenantId), eq(uploadPostJobs.userId, params.userId)))
    .limit(1);
  const job = rows[0];
  if (!job) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Upload-Post job not found" });
  }

  if (job.providerJobId) {
    const connection = await resolveConnectionById(job.connectionId, params.tenantId, db);
    if (connection) {
      const apiKey = await loadConnectionSecret(connection.id, params.tenantId, params.userId, db);
      await createUploadPostClient().cancelJob(apiKey, Number(job.providerJobId)).catch(() => {});
    }
  }

  await db
    .update(uploadPostJobs)
    .set({
      status: "cancelled",
      updatedAt: new Date(),
    })
    .where(eq(uploadPostJobs.id, params.jobId));

  return mapJobRow({
    ...job,
    status: "cancelled",
    updatedAt: new Date(),
  } as any);
}

export async function listUploadPostJobs(params: {
  tenantId: string;
  userId: number;
  connectionId?: number | null;
  status?: string | null;
  cursor?: string | null;
  limit?: number;
  db?: DrizzleDB | null;
}): Promise<{ items: UploadPostJobSummary[]; nextCursor: string | null; hasMore: boolean }> {
  await assertUploadPostGatewayEnabled(params.tenantId);
  const resolvedDb = await resolveDb(params.db);
  const connection = params.connectionId
    ? await resolveConnectionById(params.connectionId, params.tenantId, resolvedDb)
    : await resolveConnectionRow(params.tenantId, params.userId, resolvedDb);
  if (!connection || connection.userId !== params.userId) {
    return { items: [], nextCursor: null, hasMore: false };
  }

  const limit = Math.max(1, Math.min(params.limit ?? 20, 50));
  const cursorDate = params.cursor ? new Date(params.cursor) : null;
  const cursorFilter = cursorDate && !Number.isNaN(cursorDate.getTime())
    ? lt(uploadPostJobs.createdAt, cursorDate)
    : null;

  const conditions = [
    eq(uploadPostJobs.tenantId, params.tenantId),
    eq(uploadPostJobs.userId, params.userId),
    eq(uploadPostJobs.connectionId, connection.id),
  ];
  if (params.status) {
    conditions.push(eq(uploadPostJobs.status, params.status));
  }
  if (cursorFilter) {
    conditions.push(cursorFilter);
  }

  const rows = await resolvedDb
    .select({
      id: uploadPostJobs.id,
      tenantId: uploadPostJobs.tenantId,
      userId: uploadPostJobs.userId,
      connectionId: uploadPostJobs.connectionId,
      profileId: uploadPostJobs.profileId,
      platform: uploadPostJobs.platform,
      status: uploadPostJobs.status,
      contentText: uploadPostJobs.contentText,
      contentLink: uploadPostJobs.contentLink,
      mediaRefs: uploadPostJobs.mediaRefs,
      scheduledAt: uploadPostJobs.scheduledAt,
      publishedAt: uploadPostJobs.publishedAt,
      providerJobId: uploadPostJobs.providerJobId,
      platformResults: uploadPostJobs.platformResults,
      metadata: uploadPostJobs.metadata,
      metadataClearedAt: uploadPostJobs.metadataClearedAt,
      errorMessage: uploadPostJobs.errorMessage,
      lastSyncedAt: uploadPostJobs.lastSyncedAt,
      createdAt: uploadPostJobs.createdAt,
      updatedAt: uploadPostJobs.updatedAt,
    })
    .from(uploadPostJobs)
    .where(and(...conditions))
    .orderBy(desc(uploadPostJobs.createdAt), desc(uploadPostJobs.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(mapJobRow);
  return {
    items,
    nextCursor: hasMore ? items.at(-1)?.createdAt ?? null : null,
    hasMore,
  };
}

export async function syncUploadPostJobStatuses(params: {
  tenantId: string;
  userId: number;
  connectionId?: number | null;
  db?: DrizzleDB | null;
}): Promise<{ updated: number }> {
  await assertUploadPostGatewayEnabled(params.tenantId);
  const resolvedDb = await resolveDb(params.db);
  const connection = params.connectionId
    ? await resolveConnectionById(params.connectionId, params.tenantId, resolvedDb)
    : await resolveConnectionRow(params.tenantId, params.userId, resolvedDb);
  if (!connection || connection.userId !== params.userId) {
    return { updated: 0 };
  }

  const rows = await resolvedDb
    .select({
      id: uploadPostJobs.id,
      providerJobId: uploadPostJobs.providerJobId,
      status: uploadPostJobs.status,
      metadata: uploadPostJobs.metadata,
    })
    .from(uploadPostJobs)
    .where(
      and(
        eq(uploadPostJobs.tenantId, params.tenantId),
        eq(uploadPostJobs.userId, params.userId),
        eq(uploadPostJobs.connectionId, connection.id),
        or(eq(uploadPostJobs.status, "queued"), eq(uploadPostJobs.status, "scheduled"), eq(uploadPostJobs.status, "publishing")),
      ),
    )
    .limit(25);

  const apiKey = await loadConnectionSecret(connection.id, params.tenantId, params.userId, resolvedDb);
  const client = createUploadPostClient();
  let updated = 0;
  for (const job of rows) {
    if (!job.providerJobId) continue;
    const parsedId = Number(job.providerJobId);
    if (!Number.isFinite(parsedId)) continue;
    try {
      const remote = await client.getJobStatus(apiKey, parsedId);
      const nextStatus = typeof remote.status === "string" ? remote.status : job.status;
      await resolvedDb
        .update(uploadPostJobs)
        .set({
          status: nextStatus,
          providerJobId: typeof remote.id === "string" ? remote.id : job.providerJobId,
          platformResults: parseRecord(remote),
          lastSyncedAt: new Date(),
          publishedAt: nextStatus === "published" ? new Date() : undefined,
          errorMessage: typeof remote.error === "string" ? remote.error : null,
          updatedAt: new Date(),
        })
        .where(eq(uploadPostJobs.id, job.id));
      updated += 1;
    } catch {
      // Best-effort poll; keep the request path resilient.
    }
  }

  return { updated };
}

export async function sweepUploadPostJobRetention(params: {
  tenantId?: string;
  db?: DrizzleDB | null;
} = {}): Promise<{ metadataCleared: number; deleted: number }> {
  const resolvedDb = await resolveDb(params.db);
  const now = new Date();
  const metadataCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const deleteCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const tenantClause = params.tenantId ? eq(uploadPostJobs.tenantId, params.tenantId) : undefined;
  const metadataWhere = tenantClause
    ? and(isNull(uploadPostJobs.metadataClearedAt), lt(uploadPostJobs.createdAt, metadataCutoff), tenantClause)
    : and(isNull(uploadPostJobs.metadataClearedAt), lt(uploadPostJobs.createdAt, metadataCutoff));
  const deleteWhere = tenantClause
    ? and(lt(uploadPostJobs.createdAt, deleteCutoff), tenantClause)
    : lt(uploadPostJobs.createdAt, deleteCutoff);

  const metadataCleared = await resolvedDb
    .update(uploadPostJobs)
    .set({
      metadata: null,
      platformResults: null,
      metadataClearedAt: now,
      updatedAt: now,
    })
    .where(metadataWhere)
    .returning({ id: uploadPostJobs.id });

  const deleted = await resolvedDb
    .delete(uploadPostJobs)
    .where(deleteWhere)
    .returning({ id: uploadPostJobs.id });

  return {
    metadataCleared: metadataCleared.length,
    deleted: deleted.length,
  };
}
