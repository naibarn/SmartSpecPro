import { createHash } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";

import {
  ragProjectionItems,
  type InsertRagProjectionItem,
} from "../../drizzle/schema.ts";
import type { DrizzleDB } from "../db";

export const RAG_PROJECTION_LIMITS = Object.freeze({
  softBytes: 3_500_000,
  hardBytes: 4_000_000,
  aclScopeBytes: 64,
});

export interface RagProjectionInput {
  tenantId: string;
  sourceType: string;
  sourceId: string;
  sourceVersion: string;
  projectionPart?: string;
  aclScope: string;
  projectionHash: string;
  projectionBytes: number;
  instanceId: string;
  embeddingProfile: string;
}

export class RagProjectionError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "RagProjectionError";
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function requireText(value: string, code: string, maxBytes: number): void {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    Buffer.byteLength(value, "utf8") > maxBytes
  ) {
    throw new RagProjectionError(code);
  }
}

function validateInput(input: RagProjectionInput): void {
  requireText(input.tenantId, "RAG_PROJECTION_TENANT_INVALID", 36);
  requireText(input.sourceType, "RAG_PROJECTION_SOURCE_TYPE_INVALID", 48);
  if (!/^[a-z][a-z0-9_-]{0,47}$/.test(input.sourceType)) {
    throw new RagProjectionError("RAG_PROJECTION_SOURCE_TYPE_INVALID");
  }
  requireText(input.sourceId, "RAG_PROJECTION_SOURCE_ID_INVALID", 256);
  requireText(
    input.sourceVersion,
    "RAG_PROJECTION_SOURCE_VERSION_INVALID",
    160
  );
  const projectionPart = input.projectionPart ?? "whole";
  requireText(projectionPart, "RAG_PROJECTION_PART_INVALID", 128);
  if (!/^[a-z0-9][a-z0-9_-]{0,127}$/.test(projectionPart)) {
    throw new RagProjectionError("RAG_PROJECTION_PART_INVALID");
  }
  requireText(
    input.aclScope,
    "RAG_PROJECTION_ACL_SCOPE_INVALID",
    RAG_PROJECTION_LIMITS.aclScopeBytes
  );
  if (
    !/^(tenant_shared|user_private|group|direct_share):[a-zA-Z0-9_-]+$/.test(
      input.aclScope
    )
  ) {
    throw new RagProjectionError("RAG_PROJECTION_ACL_SCOPE_INVALID");
  }
  if (!/^[a-f0-9]{64}$/.test(input.projectionHash)) {
    throw new RagProjectionError("RAG_PROJECTION_HASH_INVALID");
  }
  if (
    !Number.isSafeInteger(input.projectionBytes) ||
    input.projectionBytes < 1 ||
    input.projectionBytes > RAG_PROJECTION_LIMITS.hardBytes
  ) {
    throw new RagProjectionError("RAG_PROJECTION_SIZE_HARD_LIMIT");
  }
  if (input.projectionBytes > RAG_PROJECTION_LIMITS.softBytes) {
    throw new RagProjectionError("RAG_PROJECTION_SPLIT_REQUIRED");
  }
  requireText(input.instanceId, "RAG_PROJECTION_INSTANCE_INVALID", 64);
  requireText(input.embeddingProfile, "RAG_PROJECTION_PROFILE_INVALID", 96);
}

export function buildRagProjectionKey(input: RagProjectionInput): string {
  validateInput(input);
  const tenantHash = sha256(input.tenantId).slice(0, 20);
  const sourceHash = sha256(input.sourceId).slice(0, 32);
  const versionHash = sha256(
    `${input.sourceVersion}:${input.projectionHash}`
  ).slice(0, 24);
  const aclHash = sha256(input.aclScope).slice(0, 24);
  const instanceHash = sha256(input.instanceId).slice(0, 12);
  const part = input.projectionPart ?? "whole";
  return `rag/${tenantHash}/${input.sourceType}/${sourceHash}/${versionHash}/${aclHash}/${instanceHash}/${part}.md`;
}

/**
 * Map Library's existing permission tokens to opaque provider filter scopes.
 * The tenant hash is part of every scope so equal user/group IDs in separate
 * tenants can never collide into a shared provider authorization partition.
 */
export function libraryAllowedScopeToAiSearchScope(
  tenantId: string,
  allowedScope: string
): string {
  requireText(tenantId, "RAG_PROJECTION_TENANT_INVALID", 36);
  const [kind, ...identityParts] = allowedScope.split(":");
  const identity = identityParts.join(":");
  if (!identity && allowedScope !== "p:global") {
    throw new RagProjectionError("RAG_PROJECTION_LIBRARY_SCOPE_INVALID");
  }
  const tenantHash = sha256(tenantId).slice(0, 20);
  if (kind === "u") {
    return `user_private:${sha256(`${tenantHash}:user:${identity}`).slice(0, 32)}`;
  }
  if (kind === "g") {
    return `group:${sha256(`${tenantHash}:group:${identity}`).slice(0, 32)}`;
  }
  if (kind === "t") {
    const purpose = identity === tenantId ? "team" : `role:${identity}`;
    return `tenant_shared:${sha256(`${tenantHash}:${purpose}`).slice(0, 32)}`;
  }
  if (allowedScope === "p:global") {
    return `tenant_shared:${sha256(`${tenantHash}:public`).slice(0, 32)}`;
  }
  throw new RagProjectionError("RAG_PROJECTION_LIBRARY_SCOPE_INVALID");
}

export function buildAuthorizedLibraryAiSearchScopes(input: {
  tenantId: string;
  userId: number;
  role?: string | null;
  groupIds: Array<number | string>;
}): string[] {
  if (!Number.isSafeInteger(input.userId) || input.userId <= 0) {
    throw new RagProjectionError("RAG_PROJECTION_ACTOR_INVALID");
  }
  const allowedScopes = [
    `u:${input.userId}`,
    ...input.groupIds.map(groupId => `g:${groupId}`),
    ...(input.role ? [`t:${input.role}`] : []),
    `t:${input.tenantId}`,
    "p:global",
  ];
  return [
    ...new Set(
      allowedScopes.map(scope =>
        libraryAllowedScopeToAiSearchScope(input.tenantId, scope)
      )
    ),
  ].sort();
}

export function buildRagProjectionRecord(
  input: RagProjectionInput
): InsertRagProjectionItem {
  validateInput(input);
  return {
    tenantId: input.tenantId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sourceVersion: input.sourceVersion,
    projectionPart: input.projectionPart ?? "whole",
    aclScope: input.aclScope,
    projectionKey: buildRagProjectionKey(input),
    projectionHash: input.projectionHash,
    projectionBytes: input.projectionBytes,
    provider: "cloudflare_ai_search",
    instanceId: input.instanceId,
    providerItemId: null,
    embeddingProfile: input.embeddingProfile,
    status: "queued",
    indexedAt: null,
    deletedAt: null,
    lastError: null,
  };
}

/**
 * Idempotent reconciliation intent: an indexed projection with the same
 * content/profile/instance is a no-op; changed content returns to queued and
 * discards the old provider item identity so stale workers cannot attest it.
 */
export async function ensureRagProjection(
  db: DrizzleDB,
  input: RagProjectionInput
): Promise<{
  action: "unchanged" | "queued";
  projection: InsertRagProjectionItem;
}> {
  const record = buildRagProjectionRecord(input);
  const [existing] = await db
    .select()
    .from(ragProjectionItems)
    .where(
      and(
        eq(ragProjectionItems.tenantId, record.tenantId),
        eq(ragProjectionItems.sourceType, record.sourceType),
        eq(ragProjectionItems.sourceId, record.sourceId),
        eq(ragProjectionItems.sourceVersion, record.sourceVersion),
        eq(ragProjectionItems.projectionPart, record.projectionPart),
        eq(ragProjectionItems.aclScope, record.aclScope),
        eq(ragProjectionItems.instanceId, record.instanceId),
        eq(ragProjectionItems.embeddingProfile, record.embeddingProfile)
      )
    )
    .limit(1);

  if (existing && existing.projectionHash !== record.projectionHash) {
    throw new RagProjectionError(
      "RAG_PROJECTION_IMMUTABLE_REVISION_DIGEST_CONFLICT"
    );
  }

  if (
    existing?.status === "indexed" &&
    existing.providerItemId &&
    existing.projectionHash === record.projectionHash &&
    existing.projectionBytes === record.projectionBytes &&
    existing.instanceId === record.instanceId &&
    existing.embeddingProfile === record.embeddingProfile
  ) {
    return { action: "unchanged", projection: existing };
  }

  const [projection] = await db
    .insert(ragProjectionItems)
    .values(record)
    .onConflictDoUpdate({
      target: [
        ragProjectionItems.tenantId,
        ragProjectionItems.sourceType,
        ragProjectionItems.sourceId,
        ragProjectionItems.sourceVersion,
        ragProjectionItems.projectionPart,
        ragProjectionItems.aclScope,
        ragProjectionItems.instanceId,
        ragProjectionItems.embeddingProfile,
      ],
      set: {
        sourceType: record.sourceType,
        sourceId: record.sourceId,
        sourceVersion: record.sourceVersion,
        projectionPart: record.projectionPart,
        aclScope: record.aclScope,
        projectionHash: record.projectionHash,
        projectionBytes: record.projectionBytes,
        instanceId: record.instanceId,
        providerItemId: null,
        embeddingProfile: record.embeddingProfile,
        status: "queued",
        indexedAt: null,
        deletedAt: null,
        lastError: null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return { action: "queued", projection };
}

export async function markRagProjectionIndexed(
  db: DrizzleDB,
  input: {
    tenantId: string;
    projectionKey: string;
    projectionHash: string;
    providerItemId: string;
  }
): Promise<boolean> {
  requireText(input.tenantId, "RAG_PROJECTION_TENANT_INVALID", 36);
  requireText(input.projectionKey, "RAG_PROJECTION_KEY_INVALID", 256);
  requireText(
    input.providerItemId,
    "RAG_PROJECTION_PROVIDER_ITEM_INVALID",
    256
  );
  if (!/^[a-f0-9]{64}$/.test(input.projectionHash)) {
    throw new RagProjectionError("RAG_PROJECTION_HASH_INVALID");
  }
  const rows = await db
    .update(ragProjectionItems)
    .set({
      providerItemId: input.providerItemId,
      status: "indexed",
      indexedAt: new Date(),
      deletedAt: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(ragProjectionItems.tenantId, input.tenantId),
        eq(ragProjectionItems.projectionKey, input.projectionKey),
        eq(ragProjectionItems.projectionHash, input.projectionHash),
        inArray(ragProjectionItems.status, ["queued", "indexing"])
      )
    )
    .returning({ id: ragProjectionItems.id });
  return rows.length === 1;
}

export async function markRagProjectionFailed(
  db: DrizzleDB,
  input: {
    tenantId: string;
    projectionKey: string;
    projectionHash: string;
    errorCode: string;
  }
): Promise<boolean> {
  const safeErrorCode = /^[A-Z0-9_.:-]{1,96}$/.test(input.errorCode)
    ? input.errorCode
    : "AI_SEARCH_PROVIDER_FAILED";
  const rows = await db
    .update(ragProjectionItems)
    .set({
      status: "failed",
      lastError: safeErrorCode,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(ragProjectionItems.tenantId, input.tenantId),
        eq(ragProjectionItems.projectionKey, input.projectionKey),
        eq(ragProjectionItems.projectionHash, input.projectionHash),
        inArray(ragProjectionItems.status, ["queued", "indexing"])
      )
    )
    .returning({ id: ragProjectionItems.id });
  return rows.length === 1;
}

export async function markRagProjectionDeletePending(
  db: DrizzleDB,
  input: {
    tenantId: string;
    sourceType: string;
    sourceId: string;
    sourceVersion?: string;
  }
): Promise<number> {
  const conditions = [
    eq(ragProjectionItems.tenantId, input.tenantId),
    eq(ragProjectionItems.sourceType, input.sourceType),
    eq(ragProjectionItems.sourceId, input.sourceId),
    inArray(ragProjectionItems.status, [
      "queued",
      "indexing",
      "indexed",
      "stale",
      "failed",
    ]),
  ];
  if (input.sourceVersion) {
    conditions.push(eq(ragProjectionItems.sourceVersion, input.sourceVersion));
  }
  const rows = await db
    .update(ragProjectionItems)
    .set({ status: "delete_pending", updatedAt: new Date() })
    .where(and(...conditions))
    .returning({ id: ragProjectionItems.id });
  return rows.length;
}

/** Tombstone one exact ACL/shard receipt before attempting provider deletion. */
export async function markRagProjectionItemDeletePending(
  db: DrizzleDB,
  input: {
    tenantId: string;
    projectionKey: string;
    instanceId: string;
    providerItemId: string | null;
  }
): Promise<boolean> {
  const providerItemCondition = input.providerItemId === null
    ? isNull(ragProjectionItems.providerItemId)
    : eq(ragProjectionItems.providerItemId, input.providerItemId);
  const rows = await db
    .update(ragProjectionItems)
    .set({ status: "delete_pending", updatedAt: new Date() })
    .where(and(
      eq(ragProjectionItems.tenantId, input.tenantId),
      eq(ragProjectionItems.projectionKey, input.projectionKey),
      eq(ragProjectionItems.instanceId, input.instanceId),
      providerItemCondition,
      inArray(ragProjectionItems.status, ["queued", "indexing", "indexed", "stale", "failed", "delete_pending"])
    ))
    .returning({ id: ragProjectionItems.id });
  return rows.length === 1;
}

/**
 * Finish provider cleanup only for the exact receipt that was deleted. The
 * tenant, projection key, instance and provider item fence concurrent
 * reindexing from allowing an old delete worker to tombstone a replacement.
 */
export async function markRagProjectionDeleted(
  db: DrizzleDB,
  input: {
    tenantId: string;
    projectionKey: string;
    instanceId: string;
    providerItemId: string | null;
  }
): Promise<boolean> {
  requireText(input.tenantId, "RAG_PROJECTION_TENANT_INVALID", 36);
  requireText(input.projectionKey, "RAG_PROJECTION_KEY_INVALID", 256);
  requireText(input.instanceId, "RAG_PROJECTION_INSTANCE_INVALID", 64);
  if (input.providerItemId !== null) {
    requireText(
      input.providerItemId,
      "RAG_PROJECTION_PROVIDER_ITEM_INVALID",
      256
    );
  }
  const providerItemCondition =
    input.providerItemId === null
      ? isNull(ragProjectionItems.providerItemId)
      : eq(ragProjectionItems.providerItemId, input.providerItemId);
  const rows = await db
    .update(ragProjectionItems)
    .set({ status: "deleted", deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(ragProjectionItems.tenantId, input.tenantId),
        eq(ragProjectionItems.projectionKey, input.projectionKey),
        eq(ragProjectionItems.provider, "cloudflare_ai_search"),
        eq(ragProjectionItems.instanceId, input.instanceId),
        providerItemCondition,
        eq(ragProjectionItems.status, "delete_pending")
      )
    )
    .returning({ id: ragProjectionItems.id });
  return rows.length === 1;
}

export async function listRagProjectionItemsForSource(
  db: DrizzleDB,
  input: { tenantId: string; sourceType: string; sourceId: string }
) {
  requireText(input.tenantId, "RAG_PROJECTION_TENANT_INVALID", 36);
  requireText(input.sourceType, "RAG_PROJECTION_SOURCE_TYPE_INVALID", 48);
  requireText(input.sourceId, "RAG_PROJECTION_SOURCE_ID_INVALID", 256);
  return db
    .select()
    .from(ragProjectionItems)
    .where(
      and(
        eq(ragProjectionItems.tenantId, input.tenantId),
        eq(ragProjectionItems.sourceType, input.sourceType),
        eq(ragProjectionItems.sourceId, input.sourceId)
      )
    );
}

/**
 * Candidate resolution is tenant- and ACL-scoped and yields identity only.
 * The owning domain must still re-read canonical source and current ACL before
 * exposing any text or citation.
 */
export async function resolveIndexedRagProjection(
  db: DrizzleDB,
  input: {
    tenantId: string;
    provider: "cloudflare_ai_search";
    instanceId: string;
    providerItemId: string;
    authorizedAclScopes: string[];
  }
) {
  if (!input.authorizedAclScopes.length) {
    throw new RagProjectionError("RAG_PROJECTION_AUTHORIZED_SCOPES_REQUIRED");
  }
  for (const scope of input.authorizedAclScopes) {
    requireText(scope, "RAG_PROJECTION_ACL_SCOPE_INVALID", 64);
  }
  const [projection] = await db
    .select({
      id: ragProjectionItems.id,
      tenantId: ragProjectionItems.tenantId,
      sourceType: ragProjectionItems.sourceType,
      sourceId: ragProjectionItems.sourceId,
      sourceVersion: ragProjectionItems.sourceVersion,
      projectionPart: ragProjectionItems.projectionPart,
      projectionHash: ragProjectionItems.projectionHash,
      aclScope: ragProjectionItems.aclScope,
      embeddingProfile: ragProjectionItems.embeddingProfile,
    })
    .from(ragProjectionItems)
    .where(
      and(
        eq(ragProjectionItems.tenantId, input.tenantId),
        eq(ragProjectionItems.provider, input.provider),
        eq(ragProjectionItems.instanceId, input.instanceId),
        eq(ragProjectionItems.providerItemId, input.providerItemId),
        eq(ragProjectionItems.status, "indexed"),
        inArray(ragProjectionItems.aclScope, input.authorizedAclScopes)
      )
    )
    .limit(1);
  return projection ?? null;
}

/** Resolve an AI Search key through PostgreSQL before trusting candidate identity. */
export async function resolveIndexedRagProjectionByKey(
  db: DrizzleDB,
  input: {
    tenantId: string;
    instanceId: string;
    projectionKey: string;
    authorizedAclScopes: string[];
  }
) {
  requireText(input.tenantId, "RAG_PROJECTION_TENANT_INVALID", 36);
  requireText(input.instanceId, "RAG_PROJECTION_INSTANCE_INVALID", 64);
  requireText(input.projectionKey, "RAG_PROJECTION_KEY_INVALID", 256);
  if (!input.authorizedAclScopes.length) {
    throw new RagProjectionError("RAG_PROJECTION_AUTHORIZED_SCOPES_REQUIRED");
  }
  for (const scope of input.authorizedAclScopes) {
    requireText(scope, "RAG_PROJECTION_ACL_SCOPE_INVALID", 64);
  }
  const [projection] = await db
    .select({
      id: ragProjectionItems.id,
      tenantId: ragProjectionItems.tenantId,
      sourceType: ragProjectionItems.sourceType,
      sourceId: ragProjectionItems.sourceId,
      sourceVersion: ragProjectionItems.sourceVersion,
      projectionPart: ragProjectionItems.projectionPart,
      projectionHash: ragProjectionItems.projectionHash,
      projectionKey: ragProjectionItems.projectionKey,
      aclScope: ragProjectionItems.aclScope,
      embeddingProfile: ragProjectionItems.embeddingProfile,
      instanceId: ragProjectionItems.instanceId,
      providerItemId: ragProjectionItems.providerItemId,
    })
    .from(ragProjectionItems)
    .where(
      and(
        eq(ragProjectionItems.tenantId, input.tenantId),
        eq(ragProjectionItems.provider, "cloudflare_ai_search"),
        eq(ragProjectionItems.instanceId, input.instanceId),
        eq(ragProjectionItems.projectionKey, input.projectionKey),
        eq(ragProjectionItems.status, "indexed"),
        inArray(ragProjectionItems.aclScope, input.authorizedAclScopes)
      )
    )
    .limit(1);
  return projection ?? null;
}

export async function isCurrentIndexedRagProjectionItem(
  db: DrizzleDB,
  input: {
    tenantId: string;
    projectionKey: string;
    projectionHash: string;
    providerItemId: string;
  }
): Promise<boolean> {
  const [projection] = await db
    .select({ id: ragProjectionItems.id })
    .from(ragProjectionItems)
    .where(
      and(
        eq(ragProjectionItems.tenantId, input.tenantId),
        eq(ragProjectionItems.projectionKey, input.projectionKey),
        eq(ragProjectionItems.projectionHash, input.projectionHash),
        eq(ragProjectionItems.providerItemId, input.providerItemId),
        eq(ragProjectionItems.status, "indexed")
      )
    )
    .limit(1);
  return Boolean(projection);
}
