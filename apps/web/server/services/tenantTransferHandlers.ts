import { createHash } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";

import { db, type DrizzleDB } from "../db";
import {
  libraryItems,
  mediaAssets,
  mediaProviderAssets,
  mediaTaskArtifacts,
  presentationDecks,
  verticalDramaSeries,
  workflows,
} from "../../drizzle/schema";

/**
 * Feature 189 transfer handlers are deliberately database-only.  The
 * registry is the allowlist: a resource cannot enter a preview unless it has
 * an owner check, a bounded snapshot, a conflict key, and an idempotent
 * ownership update.
 */
export const TENANT_TRANSFER_HANDLER_REGISTRY_VERSION = "feature-189-handlers-v1";
export const TENANT_TRANSFER_POLICY_VERSION = "feature-189-policy-v1";

export type TransferSelection = {
  resourceKind: string;
  resourceIds?: string[];
};

export type TransferActor = {
  tenantId: string;
  sourceUserId: number;
  targetUserId: number;
};

export type TransferPreviewItem = {
  resourceKind: string;
  sourceResourceId: string;
  handlerVersion: string;
  dependencyOrder: number;
  classification: "transferable" | "unsupported" | "conflict" | "active_work" | "queue_cancelled";
  disposition?: string;
  reasonCode?: string;
  reasonDetail?: string;
  contentHash?: string;
  metadata: Record<string, unknown>;
  conflictKey?: string;
};

export type TransferApplyContext = TransferActor & {
  operationId: string;
  itemIdempotencyKey: string;
};

export type TransferApplyResult = {
  destinationResourceId: string;
  destinationMarker: string;
  resultDigest: string;
};

type HandlerDb = DrizzleDB | any;

export type TenantTransferHandler = {
  resourceKind: string;
  version: string;
  dependencyOrder: number;
  description: string;
  list(input: {
    db: HandlerDb;
    actor: TransferActor;
    resourceIds?: string[];
    limit: number;
  }): Promise<TransferPreviewItem[]>;
  apply(input: {
    db: HandlerDb;
    item: TransferPreviewItem;
    context: TransferApplyContext;
  }): Promise<TransferApplyResult>;
};

const MAX_HANDLER_ID_LENGTH = 255;

function boundedId(value: unknown): string {
  const id = String(value ?? "").trim();
  if (!id || id.length > MAX_HANDLER_ID_LENGTH) throw new Error("TRANSFER_RESOURCE_ID_INVALID");
  return id;
}

function selectedIds(resourceIds: string[] | undefined): string[] | undefined {
  if (!resourceIds || resourceIds.length === 0) return undefined;
  const normalized = [...new Set(resourceIds.map(boundedId))];
  return normalized.length > 0 ? normalized : undefined;
}

function hashValue(value: unknown): string {
  // The service owns the final snapshot hash. Handlers only need a stable,
  // bounded content marker for conflict/reconciliation evidence.
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function isTerminalStatus(status: string | null | undefined): boolean {
  return ["completed", "succeeded", "failed", "cancelled", "canceled", "expired"].includes(String(status));
}

function idFilter(column: any, ids: string[] | undefined): any {
  return ids ? inArray(column, ids.map(id => Number(id)).filter(Number.isSafeInteger)) : undefined;
}

function withOptionalIdFilter(base: any, filter: any): any {
  return filter ? and(base, filter) : base;
}

const mediaAssetHandler: TenantTransferHandler = {
  resourceKind: "media_asset",
  version: "media-asset-v1",
  dependencyOrder: 20,
  description: "Managed uploaded image/video metadata whose storage key remains tenant-owned.",
  async list({ db: queryDb, actor, resourceIds, limit }) {
    const ids = selectedIds(resourceIds);
    const rows = await queryDb
      .select({
        id: mediaAssets.id,
        storageKey: mediaAssets.storageKey,
        mimeType: mediaAssets.mimeType,
        fileSize: mediaAssets.fileSize,
        checksum: mediaAssets.checksumSha256,
        status: mediaAssets.status,
      })
      .from(mediaAssets)
      .where(withOptionalIdFilter(and(eq(mediaAssets.tenantId, actor.tenantId), eq(mediaAssets.userId, actor.sourceUserId)), idFilter(mediaAssets.id, ids)))
      .orderBy(asc(mediaAssets.id))
      .limit(limit);
    return rows.map((row: any) => ({
      resourceKind: "media_asset",
      sourceResourceId: String(row.id),
      handlerVersion: "media-asset-v1",
      dependencyOrder: 20,
      classification: "transferable",
      contentHash: row.checksum ?? hashValue([row.storageKey, row.fileSize, row.mimeType]),
      metadata: { mimeType: row.mimeType, fileSize: row.fileSize ?? null, status: row.status ?? null },
      conflictKey: `media_asset:${row.storageKey}`,
    }));
  },
  async apply({ db: queryDb, item, context }) {
    const sourceId = Number(item.sourceResourceId);
    const result = await queryDb.update(mediaAssets).set({ userId: context.targetUserId, updatedAt: new Date() })
      .where(and(eq(mediaAssets.id, sourceId), eq(mediaAssets.tenantId, context.tenantId), eq(mediaAssets.userId, context.sourceUserId)))
      .returning({ id: mediaAssets.id, storageKey: mediaAssets.storageKey });
    const row = result[0] ?? (await queryDb.select({ id: mediaAssets.id, storageKey: mediaAssets.storageKey })
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, sourceId), eq(mediaAssets.tenantId, context.tenantId), eq(mediaAssets.userId, context.targetUserId)))
      .limit(1))[0];
    if (!row) throw new Error("TRANSFER_SOURCE_CHANGED");
    return { destinationResourceId: String(row.id), destinationMarker: `media_asset:${row.storageKey}`, resultDigest: hashValue(row) };
  },
};

const mediaTaskArtifactHandler: TenantTransferHandler = {
  resourceKind: "media_task_artifact",
  version: "media-task-artifact-v1",
  dependencyOrder: 30,
  description: "Completed managed media artifacts; provider-only or missing R2 records remain excluded.",
  async list({ db: queryDb, actor, resourceIds, limit }) {
    const ids = selectedIds(resourceIds);
    const rows = await queryDb
      .select({ id: mediaTaskArtifacts.id, r2Key: mediaTaskArtifacts.r2StorageKey, r2Status: mediaTaskArtifacts.r2Status, providerStatus: mediaTaskArtifacts.providerStatus, mediaType: mediaTaskArtifacts.mediaType, checksum: mediaTaskArtifacts.r2StorageKey })
      .from(mediaTaskArtifacts)
      .where(withOptionalIdFilter(and(eq(mediaTaskArtifacts.tenantId, actor.tenantId), eq(mediaTaskArtifacts.userId, actor.sourceUserId)), idFilter(mediaTaskArtifacts.id, ids)))
      .orderBy(asc(mediaTaskArtifacts.id))
      .limit(limit);
    return rows.map((row: any) => {
      const ready = row.r2Status === "ready" && Boolean(row.r2Key);
      return {
        resourceKind: "media_task_artifact",
        sourceResourceId: String(row.id),
        handlerVersion: "media-task-artifact-v1",
        dependencyOrder: 30,
        classification: ready ? "transferable" : "unsupported",
        ...(ready ? {} : { disposition: "unsupported", reasonCode: "MANAGED_ARTIFACT_NOT_READY", reasonDetail: "Only durable managed artifacts with ready storage may be transferred." }),
        contentHash: row.checksum ?? hashValue([row.r2Key, row.providerStatus, row.mediaType]),
        metadata: { mediaType: row.mediaType, r2Status: row.r2Status, providerStatus: row.providerStatus },
        conflictKey: row.r2Key ? `media_task_artifact:${row.r2Key}` : undefined,
      } satisfies TransferPreviewItem;
    });
  },
  async apply({ db: queryDb, item, context }) {
    const sourceId = Number(item.sourceResourceId);
    const result = await queryDb.update(mediaTaskArtifacts).set({ userId: context.targetUserId, updatedAt: new Date() })
      .where(and(eq(mediaTaskArtifacts.id, sourceId), eq(mediaTaskArtifacts.tenantId, context.tenantId), eq(mediaTaskArtifacts.userId, context.sourceUserId), eq(mediaTaskArtifacts.r2Status, "ready")))
      .returning({ id: mediaTaskArtifacts.id, r2Key: mediaTaskArtifacts.r2StorageKey });
    const row = result[0] ?? (await queryDb.select({ id: mediaTaskArtifacts.id, r2Key: mediaTaskArtifacts.r2StorageKey })
      .from(mediaTaskArtifacts)
      .where(and(eq(mediaTaskArtifacts.id, sourceId), eq(mediaTaskArtifacts.tenantId, context.tenantId), eq(mediaTaskArtifacts.userId, context.targetUserId), eq(mediaTaskArtifacts.r2Status, "ready")))
      .limit(1))[0];
    if (!row) throw new Error("TRANSFER_SOURCE_CHANGED");
    return { destinationResourceId: String(row.id), destinationMarker: `media_task_artifact:${row.r2Key}`, resultDigest: hashValue(row) };
  },
};

const mediaProviderAssetHandler: TenantTransferHandler = {
  resourceKind: "media_provider_asset",
  version: "media-provider-asset-v1",
  dependencyOrder: 40,
  description: "Provider asset metadata; the provider resource itself is never regenerated by transfer.",
  async list({ db: queryDb, actor, resourceIds, limit }) {
    const ids = selectedIds(resourceIds);
    const rows = await queryDb.select({ id: mediaProviderAssets.id, provider: mediaProviderAssets.provider, providerAssetId: mediaProviderAssets.providerAssetId, assetType: mediaProviderAssets.assetType, status: mediaProviderAssets.status })
      .from(mediaProviderAssets)
      .where(withOptionalIdFilter(and(eq(mediaProviderAssets.tenantId, actor.tenantId), eq(mediaProviderAssets.userId, actor.sourceUserId)), idFilter(mediaProviderAssets.id, ids)))
      .orderBy(asc(mediaProviderAssets.id)).limit(limit);
    return rows.map((row: any) => ({ resourceKind: "media_provider_asset", sourceResourceId: String(row.id), handlerVersion: "media-provider-asset-v1", dependencyOrder: 40, classification: row.status === "deleted" ? "unsupported" : "transferable", ...(row.status === "deleted" ? { disposition: "unsupported", reasonCode: "PROVIDER_ASSET_DELETED" } : {}), contentHash: hashValue([row.provider, row.providerAssetId, row.assetType]), metadata: { provider: row.provider, assetType: row.assetType, status: row.status }, conflictKey: `provider:${row.provider}:${row.providerAssetId}` } satisfies TransferPreviewItem));
  },
  async apply({ db: queryDb, item, context }) {
    const result = await queryDb.update(mediaProviderAssets).set({ userId: context.targetUserId }).where(and(eq(mediaProviderAssets.id, Number(item.sourceResourceId)), eq(mediaProviderAssets.tenantId, context.tenantId), eq(mediaProviderAssets.userId, context.sourceUserId), eq(mediaProviderAssets.status, "active"))).returning({ id: mediaProviderAssets.id, provider: mediaProviderAssets.provider, providerAssetId: mediaProviderAssets.providerAssetId });
    const row = result[0] ?? (await queryDb.select({ id: mediaProviderAssets.id, provider: mediaProviderAssets.provider, providerAssetId: mediaProviderAssets.providerAssetId })
      .from(mediaProviderAssets)
      .where(and(eq(mediaProviderAssets.id, Number(item.sourceResourceId)), eq(mediaProviderAssets.tenantId, context.tenantId), eq(mediaProviderAssets.userId, context.targetUserId), eq(mediaProviderAssets.status, "active")))
      .limit(1))[0];
    if (!row) throw new Error("TRANSFER_SOURCE_CHANGED");
    return { destinationResourceId: String(row.id), destinationMarker: `provider:${row.provider}:${row.providerAssetId}`, resultDigest: hashValue(row) };
  },
};

const libraryItemHandler: TenantTransferHandler = {
  resourceKind: "library_item",
  version: "library-item-v1",
  dependencyOrder: 10,
  description: "Tenant library records; folders and records retain their IDs and tenant scope.",
  async list({ db: queryDb, actor, resourceIds, limit }) {
    const ids = selectedIds(resourceIds);
    const rows = await queryDb.select({ id: libraryItems.id, title: libraryItems.title, itemType: libraryItems.itemType, source: libraryItems.source, parentId: libraryItems.parentId, status: libraryItems.status })
      .from(libraryItems)
      .where(withOptionalIdFilter(and(eq(libraryItems.tenantId, actor.tenantId), eq(libraryItems.ownerUserId, actor.sourceUserId)), idFilter(libraryItems.id, ids)))
      .orderBy(asc(libraryItems.parentId), asc(libraryItems.id)).limit(limit);
    return rows.map((row: any) => ({ resourceKind: "library_item", sourceResourceId: String(row.id), handlerVersion: "library-item-v1", dependencyOrder: row.itemType === "folder" ? 0 : 10, classification: "transferable", contentHash: hashValue([row.title, row.itemType, row.source, row.parentId]), metadata: { title: row.title, itemType: row.itemType, source: row.source, parentId: row.parentId, status: row.status }, conflictKey: `library:${row.parentId ?? "root"}:${row.title}` }));
  },
  async apply({ db: queryDb, item, context }) {
    const result = await queryDb.update(libraryItems).set({ ownerUserId: context.targetUserId, updatedAt: new Date() }).where(and(eq(libraryItems.id, Number(item.sourceResourceId)), eq(libraryItems.tenantId, context.tenantId), eq(libraryItems.ownerUserId, context.sourceUserId))).returning({ id: libraryItems.id });
    const row = result[0] ?? (await queryDb.select({ id: libraryItems.id }).from(libraryItems)
      .where(and(eq(libraryItems.id, Number(item.sourceResourceId)), eq(libraryItems.tenantId, context.tenantId), eq(libraryItems.ownerUserId, context.targetUserId))).limit(1))[0];
    if (!row) throw new Error("TRANSFER_SOURCE_CHANGED");
    return { destinationResourceId: String(row.id), destinationMarker: item.conflictKey ?? `library:${row.id}`, resultDigest: hashValue(row) };
  },
};

const presentationDeckHandler: TenantTransferHandler = {
  resourceKind: "presentation_deck",
  version: "presentation-deck-v1",
  dependencyOrder: 15,
  description: "Presentation ownership follows its library item; slide rows remain linked by the stable deck ID.",
  async list({ db: queryDb, actor, resourceIds, limit }) {
    const ids = selectedIds(resourceIds);
    const rows = await queryDb.select({ id: presentationDecks.id, libraryItemId: presentationDecks.libraryItemId, title: presentationDecks.title })
      .from(presentationDecks).innerJoin(libraryItems, eq(presentationDecks.libraryItemId, libraryItems.id))
      .where(withOptionalIdFilter(and(eq(presentationDecks.tenantId, actor.tenantId), eq(libraryItems.ownerUserId, actor.sourceUserId)), idFilter(presentationDecks.id, ids))).orderBy(asc(presentationDecks.id)).limit(limit);
    return rows.map((row: any) => ({ resourceKind: "presentation_deck", sourceResourceId: String(row.id), handlerVersion: "presentation-deck-v1", dependencyOrder: 15, classification: "transferable", contentHash: hashValue([row.libraryItemId, row.title]), metadata: { title: row.title, libraryItemId: row.libraryItemId }, conflictKey: `presentation:${row.libraryItemId}` }));
  },
  async apply({ db: queryDb, item, context }) {
    const [deck] = await queryDb.select({ libraryItemId: presentationDecks.libraryItemId }).from(presentationDecks).where(and(eq(presentationDecks.id, Number(item.sourceResourceId)), eq(presentationDecks.tenantId, context.tenantId))).limit(1);
    if (!deck) throw new Error("TRANSFER_SOURCE_CHANGED");
    const result = await queryDb.update(libraryItems).set({ ownerUserId: context.targetUserId, updatedAt: new Date() }).where(and(eq(libraryItems.id, deck.libraryItemId), eq(libraryItems.tenantId, context.tenantId), eq(libraryItems.ownerUserId, context.sourceUserId))).returning({ id: libraryItems.id });
    const row = result[0] ?? (await queryDb.select({ id: libraryItems.id }).from(libraryItems)
      .where(and(eq(libraryItems.id, deck.libraryItemId), eq(libraryItems.tenantId, context.tenantId), eq(libraryItems.ownerUserId, context.targetUserId))).limit(1))[0];
    if (!row) throw new Error("TRANSFER_SOURCE_CHANGED");
    return { destinationResourceId: item.sourceResourceId, destinationMarker: item.conflictKey ?? `presentation:${row.id}`, resultDigest: hashValue(row) };
  },
};

const workflowHandler: TenantTransferHandler = {
  resourceKind: "workflow",
  version: "workflow-v1",
  dependencyOrder: 50,
  description: "User-owned workflow definitions; execution history is not copied or rewritten.",
  async list({ db: queryDb, actor, resourceIds, limit }) {
    const ids = selectedIds(resourceIds);
    const rows = await queryDb.select({ id: workflows.id, name: workflows.name, status: workflows.status, schemaVersion: workflows.schemaVersion }).from(workflows).where(withOptionalIdFilter(and(eq(workflows.tenantId, actor.tenantId), eq(workflows.userId, actor.sourceUserId)), idFilter(workflows.id, ids))).orderBy(asc(workflows.id)).limit(limit);
    return rows.map((row: any) => ({ resourceKind: "workflow", sourceResourceId: String(row.id), handlerVersion: "workflow-v1", dependencyOrder: 50, classification: "transferable", contentHash: hashValue([row.name, row.status, row.schemaVersion]), metadata: { name: row.name, status: row.status, schemaVersion: row.schemaVersion }, conflictKey: `workflow:${row.id}` }));
  },
  async apply({ db: queryDb, item, context }) {
    const result = await queryDb.update(workflows).set({ userId: context.targetUserId }).where(and(eq(workflows.id, Number(item.sourceResourceId)), eq(workflows.tenantId, context.tenantId), eq(workflows.userId, context.sourceUserId))).returning({ id: workflows.id });
    const row = result[0] ?? (await queryDb.select({ id: workflows.id }).from(workflows)
      .where(and(eq(workflows.id, Number(item.sourceResourceId)), eq(workflows.tenantId, context.tenantId), eq(workflows.userId, context.targetUserId))).limit(1))[0];
    if (!row) throw new Error("TRANSFER_SOURCE_CHANGED");
    return { destinationResourceId: String(row.id), destinationMarker: item.conflictKey ?? `workflow:${row.id}`, resultDigest: hashValue(row) };
  },
};

const verticalDramaSeriesHandler: TenantTransferHandler = {
  resourceKind: "vertical_drama_series",
  version: "vertical-drama-series-v1",
  dependencyOrder: 60,
  description: "Series root ownership; dependent rows retain stable series IDs and are included by the same tenant fence.",
  async list({ db: queryDb, actor, resourceIds, limit }) {
    const ids = selectedIds(resourceIds);
    const rows = await queryDb.select({ id: verticalDramaSeries.id, title: verticalDramaSeries.title, status: verticalDramaSeries.status }).from(verticalDramaSeries).where(withOptionalIdFilter(and(eq(verticalDramaSeries.tenantId, actor.tenantId), eq(verticalDramaSeries.userId, actor.sourceUserId)), idFilter(verticalDramaSeries.id, ids))).orderBy(asc(verticalDramaSeries.id)).limit(limit);
    return rows.map((row: any) => ({ resourceKind: "vertical_drama_series", sourceResourceId: String(row.id), handlerVersion: "vertical-drama-series-v1", dependencyOrder: 60, classification: "transferable", contentHash: hashValue([row.title, row.status]), metadata: { title: row.title, status: row.status }, conflictKey: `vertical_drama_series:${row.id}` }));
  },
  async apply({ db: queryDb, item, context }) {
    const result = await queryDb.update(verticalDramaSeries).set({ userId: context.targetUserId, updatedAt: new Date() }).where(and(eq(verticalDramaSeries.id, Number(item.sourceResourceId)), eq(verticalDramaSeries.tenantId, context.tenantId), eq(verticalDramaSeries.userId, context.sourceUserId))).returning({ id: verticalDramaSeries.id });
    const row = result[0] ?? (await queryDb.select({ id: verticalDramaSeries.id }).from(verticalDramaSeries)
      .where(and(eq(verticalDramaSeries.id, Number(item.sourceResourceId)), eq(verticalDramaSeries.tenantId, context.tenantId), eq(verticalDramaSeries.userId, context.targetUserId))).limit(1))[0];
    if (!row) throw new Error("TRANSFER_SOURCE_CHANGED");
    return { destinationResourceId: String(row.id), destinationMarker: item.conflictKey ?? `vertical_drama_series:${row.id}`, resultDigest: hashValue(row) };
  },
};

/**
 * These handlers are intentionally explicit. Tables such as billing,
 * credentials, sessions, active provider operations, and the job ledger are
 * not registered because copying them would violate Feature 189 ownership.
 */
const HANDLERS: readonly TenantTransferHandler[] = [
  libraryItemHandler,
  presentationDeckHandler,
  mediaAssetHandler,
  mediaTaskArtifactHandler,
  mediaProviderAssetHandler,
  workflowHandler,
  verticalDramaSeriesHandler,
];

export function listTenantTransferHandlers(): TenantTransferHandler[] {
  return [...HANDLERS];
}

export function getTenantTransferHandler(resourceKind: string): TenantTransferHandler | undefined {
  return HANDLERS.find(handler => handler.resourceKind === resourceKind);
}

export function getTenantTransferHandlerSnapshot(): Record<string, unknown> {
  return Object.fromEntries(HANDLERS.map(handler => [handler.resourceKind, {
    version: handler.version,
    dependencyOrder: handler.dependencyOrder,
    description: handler.description,
  }]));
}

export function assertTransferHandlerRegistered(resourceKind: string): TenantTransferHandler {
  const handler = getTenantTransferHandler(resourceKind);
  if (!handler) throw new Error(`UNSUPPORTED_RESOURCE:${resourceKind}`);
  return handler;
}

export function isTerminalTransferResourceStatus(status: string | null | undefined): boolean {
  return isTerminalStatus(status);
}

export function getTransferDatabase(): HandlerDb {
  return db.instance;
}
