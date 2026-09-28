import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  mediaAssets,
  verticalDramaEpisodes,
  verticalDramaEpisodeObjectReferences,
  verticalDramaObjectReferenceAssets,
  verticalDramaObjectDetectionSuggestions,
  verticalDramaObjectReferenceProjections,
  verticalDramaObjectReferences,
  verticalDramaSeries,
  verticalDramaShotObjectReferences,
  verticalDramaShotReferences,
  verticalDramaObjectReferenceAliases,
} from "../../drizzle/schema";
import {
  buildObjectReferencePrompt,
  normalizeObjectReferenceAlias,
  normalizeObjectReferenceAliases,
  objectReferenceContextFingerprint,
  objectReferenceStableKey,
} from "@shared/verticalDramaSeries/objectReferences";
import { selectObjectReferenceMedia } from "@shared/verticalDramaSeries/objectReferences";

export type VerticalDramaObjectReferenceActor = {
  tenantId: string;
  userId: number;
};

export type VerticalDramaObjectContext = {
  seriesId: number;
  episodeId: number;
  shotNumber: number;
  text: string;
  location?: string;
  timeOfDay?: string;
  continuation: boolean;
};

export function buildVerticalDramaObjectReferenceContext(input: {
  seriesId: number;
  episodeId: number;
  shotNumber: number;
  shot: unknown;
  previousShot?: unknown;
  seriesStory?: unknown;
  episodeStory?: unknown;
  previousEpisodeStory?: unknown;
}): VerticalDramaObjectContext {
  const shot = input.shot && typeof input.shot === "object" ? input.shot : {};
  const record = shot as Record<string, unknown>;
  const text = JSON.stringify({
    series: input.seriesStory ?? null,
    episode: input.episodeStory ?? null,
    shot,
  });
  const previous = JSON.stringify({
    previousShot: input.previousShot ?? null,
    previousEpisode: input.previousEpisodeStory ?? null,
  });
  const location = [record.location, record.scene, record.setting].find(
    value => typeof value === "string"
  ) as string | undefined;
  const timeOfDay = [record.timeOfDay, record.time, record.day].find(
    value => typeof value === "string"
  ) as string | undefined;
  const contextText = `${text} ${previous}`;
  const hasContinuationMarker =
    /ต่อเนื่อง|เดินทาง|กลับมา|ต่อจาก|continue|travel|same day|ระหว่างทาง/i.test(
      contextText
    );
  const hasHardBreakMarker =
    /วันถัดไป|วันใหม่|เช้าวันรุ่งขึ้น|หลายวันต่อมา|next day|new day|days later/i.test(
      contextText
    );
  const continuation = hasContinuationMarker && !hasHardBreakMarker;
  return {
    seriesId: input.seriesId,
    episodeId: input.episodeId,
    shotNumber: input.shotNumber,
    text,
    location,
    timeOfDay,
    continuation,
  };
}

function numberId(value: string | number) {
  const id = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid id");
  return id;
}

async function ownedSeries(
  actor: VerticalDramaObjectReferenceActor,
  seriesId: string | number
) {
  const [row] = await db
    .select({ id: verticalDramaSeries.id })
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, numberId(seriesId)),
        eq(verticalDramaSeries.tenantId, actor.tenantId),
        eq(verticalDramaSeries.userId, actor.userId)
      )
    )
    .limit(1);
  if (!row) throw new Error("Series not found");
  return row.id;
}

async function ownedObject(
  actor: VerticalDramaObjectReferenceActor,
  objectReferenceId: string | number
) {
  const [row] = await db
    .select()
    .from(verticalDramaObjectReferences)
    .where(
      and(
        eq(verticalDramaObjectReferences.id, numberId(objectReferenceId)),
        eq(verticalDramaObjectReferences.tenantId, actor.tenantId),
        eq(verticalDramaObjectReferences.userId, actor.userId)
      )
    )
    .limit(1);
  if (!row) throw new Error("Object reference not found");
  return row;
}

export async function listVerticalDramaObjectReferences(
  actor: VerticalDramaObjectReferenceActor,
  seriesId: string | number,
  options: { includeArchived?: boolean } = {}
) {
  const id = await ownedSeries(actor, seriesId);
  const objects = await db
    .select()
    .from(verticalDramaObjectReferences)
    .where(
      and(
        eq(verticalDramaObjectReferences.tenantId, actor.tenantId),
        eq(verticalDramaObjectReferences.userId, actor.userId),
        eq(verticalDramaObjectReferences.seriesId, id),
        ...(options.includeArchived
          ? []
          : [eq(verticalDramaObjectReferences.status, "active")])
      )
    )
    .orderBy(
      desc(verticalDramaObjectReferences.updatedAt),
      asc(verticalDramaObjectReferences.name)
    );
  if (objects.length === 0) return [];
  const assets = await db
    .select({
      id: verticalDramaObjectReferenceAssets.id,
      objectReferenceId: verticalDramaObjectReferenceAssets.objectReferenceId,
      mediaAssetId: verticalDramaObjectReferenceAssets.mediaAssetId,
      role: verticalDramaObjectReferenceAssets.role,
      source: verticalDramaObjectReferenceAssets.source,
      label: verticalDramaObjectReferenceAssets.label,
      sortOrder: verticalDramaObjectReferenceAssets.sortOrder,
      mediaAssetUrl: mediaAssets.originalUrl,
    })
    .from(verticalDramaObjectReferenceAssets)
    .leftJoin(
      mediaAssets,
      eq(mediaAssets.id, verticalDramaObjectReferenceAssets.mediaAssetId)
    )
    .where(
      and(
        eq(verticalDramaObjectReferenceAssets.tenantId, actor.tenantId),
        eq(verticalDramaObjectReferenceAssets.userId, actor.userId),
        eq(verticalDramaObjectReferenceAssets.state, "active")
      )
    )
    .orderBy(
      asc(verticalDramaObjectReferenceAssets.sortOrder),
      asc(verticalDramaObjectReferenceAssets.id)
    );
  return objects.map(object => ({
    ...object,
    id: String(object.id),
    assets: assets
      .filter(asset => asset.objectReferenceId === object.id)
      .map(asset => ({
        ...asset,
        id: String(asset.id),
        mediaAssetId: String(asset.mediaAssetId),
      })),
  }));
}

export async function previewVerticalDramaObjectReferencePrompt(
  actor: VerticalDramaObjectReferenceActor,
  input: { objectReferenceId: string; sceneContext?: string }
) {
  const object = await ownedObject(actor, input.objectReferenceId);
  return {
    objectReferenceId: String(object.id),
    prompt: buildObjectReferencePrompt({
      name: object.name,
      objectType: object.objectType,
      description: object.description,
      continuityNotes: object.continuityNotes,
      sceneContext: input.sceneContext,
    }),
    paid: false,
    revision: object.revision,
  };
}

/** Build the paid-image request from owner-scoped catalog data only. */
export async function getVerticalDramaObjectReferenceGenerationContext(
  actor: VerticalDramaObjectReferenceActor,
  input: { objectReferenceId: string; sceneContext?: string }
) {
  const object = await ownedObject(actor, input.objectReferenceId);
  const assets = await db
    .select({
      id: verticalDramaObjectReferenceAssets.id,
      role: verticalDramaObjectReferenceAssets.role,
      mediaAssetUrl: mediaAssets.originalUrl,
    })
    .from(verticalDramaObjectReferenceAssets)
    .innerJoin(
      mediaAssets,
      eq(mediaAssets.id, verticalDramaObjectReferenceAssets.mediaAssetId)
    )
    .where(
      and(
        eq(verticalDramaObjectReferenceAssets.objectReferenceId, object.id),
        eq(verticalDramaObjectReferenceAssets.tenantId, actor.tenantId),
        eq(verticalDramaObjectReferenceAssets.userId, actor.userId),
        eq(verticalDramaObjectReferenceAssets.state, "active"),
        eq(mediaAssets.tenantId, actor.tenantId),
        eq(mediaAssets.userId, actor.userId),
        eq(mediaAssets.status, "ready")
      )
    )
    .orderBy(
      asc(verticalDramaObjectReferenceAssets.sortOrder),
      asc(verticalDramaObjectReferenceAssets.id)
    );
  const referenceImageUrls = selectObjectReferenceMedia(assets, 5)
    .map(asset => asset.mediaAssetUrl?.trim())
    .filter((url): url is string => Boolean(url));
  const prompt = [
    buildObjectReferencePrompt({
      name: object.name,
      objectType: object.objectType,
      description: object.description,
      continuityNotes: object.continuityNotes,
      sceneContext: input.sceneContext,
    }),
    object.canonicalPrompt?.trim() || "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    objectReferenceId: String(object.id),
    seriesId: String(object.seriesId),
    objectName: object.name,
    revision: object.revision,
    prompt,
    referenceImageUrls,
  };
}

/** Persist a free, deterministic prompt request without starting paid work. */
export async function requestVerticalDramaObjectReferencePrompt(
  actor: VerticalDramaObjectReferenceActor,
  input: {
    objectReferenceId: string;
    sceneContext?: string;
    idempotencyKey: string;
  }
) {
  const object = await ownedObject(actor, input.objectReferenceId);
  const prompt = buildObjectReferencePrompt({
    name: object.name,
    objectType: object.objectType,
    description: object.description,
    continuityNotes: object.continuityNotes,
    sceneContext: input.sceneContext,
  });
  const inputFingerprint = objectReferenceContextFingerprint({
    objectReferenceId: object.id,
    revision: object.revision,
    sceneContext: input.sceneContext ?? "",
  });
  const resultJson = {
    version: "174.1",
    prompt,
    inputFingerprint,
    paid: false,
  };
  const [created] = await db
    .insert(verticalDramaObjectReferencePromptRuns)
    .values({
      tenantId: actor.tenantId,
      userId: actor.userId,
      seriesId: object.seriesId,
      objectReferenceId: object.id,
      operation: "prompt_preview",
      inputFingerprint,
      status: "completed",
      resultJson,
      idempotencyKey: input.idempotencyKey,
    })
    .onConflictDoNothing()
    .returning();
  if (created) return { ...created, id: String(created.id), resultJson };
  const [existing] = await db
    .select()
    .from(verticalDramaObjectReferencePromptRuns)
    .where(
      and(
        eq(verticalDramaObjectReferencePromptRuns.tenantId, actor.tenantId),
        eq(
          verticalDramaObjectReferencePromptRuns.idempotencyKey,
          input.idempotencyKey
        )
      )
    )
    .limit(1);
  if (!existing)
    throw new Error("Object prompt request could not be recovered");
  return { ...existing, id: String(existing.id) };
}

export async function createVerticalDramaObjectReference(
  actor: VerticalDramaObjectReferenceActor,
  input: {
    seriesId: string;
    name: string;
    description?: string;
    canonicalPrompt?: string;
    mode: string;
    source: string;
    objectType?: string;
    narrativeRole?: string;
    continuityNotes?: string;
    commercialTieInEnabled?: boolean;
    aliases?: string[];
    marketplaceCaptureId?: string;
    marketplaceProductId?: string;
  }
) {
  const seriesId = await ownedSeries(actor, input.seriesId);
  const stableKey = objectReferenceStableKey({
    mode: input.mode as "story_object" | "commercial_tie_in",
    name: input.name,
    marketplaceCaptureId: input.marketplaceCaptureId,
    marketplaceProductId: input.marketplaceProductId,
  });
  const [row] = await db
    .insert(verticalDramaObjectReferences)
    .values({
      tenantId: actor.tenantId,
      userId: actor.userId,
      seriesId,
      name: input.name,
      description: input.description || null,
      canonicalPrompt: input.canonicalPrompt || null,
      mode: input.mode,
      source: input.source,
      objectType: input.objectType ?? "other",
      narrativeRole: input.narrativeRole || null,
      continuityNotes: input.continuityNotes || null,
      commercialTieInEnabled:
        input.commercialTieInEnabled ?? input.mode === "commercial_tie_in",
      marketplaceCaptureId: input.marketplaceCaptureId || null,
      marketplaceProductId: input.marketplaceProductId || null,
      stableKey,
    })
    .onConflictDoUpdate({
      target: [
        verticalDramaObjectReferences.seriesId,
        verticalDramaObjectReferences.stableKey,
      ],
      set: {
        name: input.name,
        updatedAt: new Date(),
        status: "active",
        archivedAt: null,
      },
    })
    .returning();
  if (input.aliases?.length) {
    await upsertVerticalDramaObjectReferenceAliases(actor, {
      objectReferenceId: String(row.id),
      aliases: input.aliases,
    });
  }
  return { ...row, id: String(row.id) };
}

export async function updateVerticalDramaObjectReference(
  actor: VerticalDramaObjectReferenceActor,
  input: {
    objectReferenceId: string;
    name?: string;
    description?: string | null;
    canonicalPrompt?: string | null;
    mode?: string;
    objectType?: string;
    narrativeRole?: string | null;
    continuityNotes?: string | null;
    commercialTieInEnabled?: boolean;
    expectedRevision?: number;
  }
) {
  const current = await ownedObject(actor, input.objectReferenceId);
  if (
    input.expectedRevision !== undefined &&
    current.revision !== input.expectedRevision
  )
    throw new Error("Object reference revision conflict");
  const [row] = await db
    .update(verticalDramaObjectReferences)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.canonicalPrompt !== undefined
        ? { canonicalPrompt: input.canonicalPrompt }
        : {}),
      ...(input.mode !== undefined ? { mode: input.mode } : {}),
      ...(input.objectType !== undefined
        ? { objectType: input.objectType }
        : {}),
      ...(input.narrativeRole !== undefined
        ? { narrativeRole: input.narrativeRole }
        : {}),
      ...(input.continuityNotes !== undefined
        ? { continuityNotes: input.continuityNotes }
        : {}),
      ...(input.commercialTieInEnabled !== undefined
        ? { commercialTieInEnabled: input.commercialTieInEnabled }
        : {}),
      revision: current.revision + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(verticalDramaObjectReferences.id, numberId(input.objectReferenceId)),
        eq(verticalDramaObjectReferences.tenantId, actor.tenantId),
        eq(verticalDramaObjectReferences.userId, actor.userId)
      )
    )
    .returning();
  return { ...row, id: String(row.id) };
}

export async function archiveVerticalDramaObjectReference(
  actor: VerticalDramaObjectReferenceActor,
  id: string
) {
  await ownedObject(actor, id);
  await db
    .update(verticalDramaObjectReferences)
    .set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(verticalDramaObjectReferences.id, numberId(id)),
        eq(verticalDramaObjectReferences.tenantId, actor.tenantId),
        eq(verticalDramaObjectReferences.userId, actor.userId)
      )
    );
  return { archived: true };
}

export async function restoreVerticalDramaObjectReference(
  actor: VerticalDramaObjectReferenceActor,
  id: string
) {
  await ownedObject(actor, id);
  const [row] = await db
    .update(verticalDramaObjectReferences)
    .set({ status: "active", archivedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(verticalDramaObjectReferences.id, numberId(id)),
        eq(verticalDramaObjectReferences.tenantId, actor.tenantId),
        eq(verticalDramaObjectReferences.userId, actor.userId)
      )
    )
    .returning();
  return { ...row, id: String(row.id) };
}

export async function addVerticalDramaObjectReferenceAsset(
  actor: VerticalDramaObjectReferenceActor,
  input: {
    objectReferenceId: string;
    mediaAssetId: string;
    role: string;
    source: string;
    label?: string;
  }
) {
  const object = await ownedObject(actor, input.objectReferenceId);
  const [asset] = await db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.id, numberId(input.mediaAssetId)),
        eq(mediaAssets.tenantId, actor.tenantId),
        eq(mediaAssets.userId, actor.userId)
      )
    )
    .limit(1);
  if (!asset) throw new Error("Media asset not found");
  const [row] = await db
    .insert(verticalDramaObjectReferenceAssets)
    .values({
      tenantId: actor.tenantId,
      userId: actor.userId,
      objectReferenceId: object.id,
      mediaAssetId: asset.id,
      role: input.role,
      source: input.source,
      label: input.label || null,
      originalSource: input.source,
    })
    .onConflictDoUpdate({
      target: [
        verticalDramaObjectReferenceAssets.objectReferenceId,
        verticalDramaObjectReferenceAssets.mediaAssetId,
      ],
      set: {
        role: input.role === "primary" ? "canonical" : input.role,
        source: input.source,
        label: input.label || null,
        state: "active",
        removedAt: null,
      },
    })
    .returning();
  await reconcileVerticalDramaObjectReferenceShotProjections(actor, object.id);
  return { ...row, id: String(row.id), mediaAssetId: String(row.mediaAssetId) };
}

export async function removeVerticalDramaObjectReferenceAsset(
  actor: VerticalDramaObjectReferenceActor,
  id: string
) {
  const [asset] = await db
    .select({
      objectReferenceId: verticalDramaObjectReferenceAssets.objectReferenceId,
    })
    .from(verticalDramaObjectReferenceAssets)
    .where(
      and(
        eq(verticalDramaObjectReferenceAssets.id, numberId(id)),
        eq(verticalDramaObjectReferenceAssets.tenantId, actor.tenantId),
        eq(verticalDramaObjectReferenceAssets.userId, actor.userId)
      )
    )
    .limit(1);
  await db
    .update(verticalDramaObjectReferenceAssets)
    .set({ state: "removed", removedAt: new Date() })
    .where(
      and(
        eq(verticalDramaObjectReferenceAssets.id, numberId(id)),
        eq(verticalDramaObjectReferenceAssets.tenantId, actor.tenantId),
        eq(verticalDramaObjectReferenceAssets.userId, actor.userId)
      )
    );
  if (asset)
    await reconcileVerticalDramaObjectReferenceShotProjections(
      actor,
      asset.objectReferenceId
    );
  return { removed: true };
}

export async function restoreVerticalDramaObjectReferenceAsset(
  actor: VerticalDramaObjectReferenceActor,
  id: string
) {
  const [asset] = await db
    .select({
      objectReferenceId: verticalDramaObjectReferenceAssets.objectReferenceId,
    })
    .from(verticalDramaObjectReferenceAssets)
    .where(
      and(
        eq(verticalDramaObjectReferenceAssets.id, numberId(id)),
        eq(verticalDramaObjectReferenceAssets.tenantId, actor.tenantId),
        eq(verticalDramaObjectReferenceAssets.userId, actor.userId)
      )
    )
    .limit(1);
  await db
    .update(verticalDramaObjectReferenceAssets)
    .set({ state: "active", removedAt: null })
    .where(
      and(
        eq(verticalDramaObjectReferenceAssets.id, numberId(id)),
        eq(verticalDramaObjectReferenceAssets.tenantId, actor.tenantId),
        eq(verticalDramaObjectReferenceAssets.userId, actor.userId)
      )
    );
  if (asset)
    await reconcileVerticalDramaObjectReferenceShotProjections(
      actor,
      asset.objectReferenceId
    );
  return { restored: true };
}

export async function setVerticalDramaObjectReferenceCanonicalAsset(
  actor: VerticalDramaObjectReferenceActor,
  input: { objectReferenceId: string; assetId: string }
) {
  const object = await ownedObject(actor, input.objectReferenceId);
  const assetId = numberId(input.assetId);
  const [asset] = await db
    .select({ id: verticalDramaObjectReferenceAssets.id })
    .from(verticalDramaObjectReferenceAssets)
    .where(
      and(
        eq(verticalDramaObjectReferenceAssets.id, assetId),
        eq(verticalDramaObjectReferenceAssets.objectReferenceId, object.id),
        eq(verticalDramaObjectReferenceAssets.tenantId, actor.tenantId),
        eq(verticalDramaObjectReferenceAssets.userId, actor.userId),
        eq(verticalDramaObjectReferenceAssets.state, "active")
      )
    )
    .limit(1);
  if (!asset) throw new Error("Object reference asset not found");
  await db.transaction(async tx => {
    await tx
      .update(verticalDramaObjectReferenceAssets)
      .set({ role: "alternate" })
      .where(
        and(
          eq(verticalDramaObjectReferenceAssets.objectReferenceId, object.id),
          eq(verticalDramaObjectReferenceAssets.tenantId, actor.tenantId),
          eq(verticalDramaObjectReferenceAssets.userId, actor.userId),
          eq(verticalDramaObjectReferenceAssets.state, "active")
        )
      );
    await tx
      .update(verticalDramaObjectReferenceAssets)
      .set({ role: "canonical" })
      .where(eq(verticalDramaObjectReferenceAssets.id, asset.id));
  });
  await reconcileVerticalDramaObjectReferenceShotProjections(actor, object.id);
  return { assetId: String(asset.id), canonical: true };
}

export async function reorderVerticalDramaObjectReferenceAssets(
  actor: VerticalDramaObjectReferenceActor,
  input: { objectReferenceId: string; assetIds: string[] }
) {
  const object = await ownedObject(actor, input.objectReferenceId);
  const assetIds = input.assetIds.map(numberId);
  const assets = await db
    .select({ id: verticalDramaObjectReferenceAssets.id })
    .from(verticalDramaObjectReferenceAssets)
    .where(
      and(
        eq(verticalDramaObjectReferenceAssets.objectReferenceId, object.id),
        eq(verticalDramaObjectReferenceAssets.tenantId, actor.tenantId),
        eq(verticalDramaObjectReferenceAssets.userId, actor.userId),
        eq(verticalDramaObjectReferenceAssets.state, "active")
      )
    );
  const allowed = new Set(assets.map(asset => asset.id));
  if (
    assetIds.some(assetId => !allowed.has(assetId)) ||
    new Set(assetIds).size !== assetIds.length
  )
    throw new Error("Invalid object reference asset order");
  await db.transaction(async tx => {
    for (const [sortOrder, assetId] of assetIds.entries()) {
      await tx
        .update(verticalDramaObjectReferenceAssets)
        .set({ sortOrder })
        .where(
          and(
            eq(verticalDramaObjectReferenceAssets.id, assetId),
            eq(verticalDramaObjectReferenceAssets.objectReferenceId, object.id)
          )
        );
    }
  });
  await reconcileVerticalDramaObjectReferenceShotProjections(actor, object.id);
  return {
    objectReferenceId: String(object.id),
    assetIds: assetIds.map(String),
  };
}

type ObjectReferenceProjectionInput = {
  seriesId: number;
  episodeId: number;
  shotNumber: number;
  objectReferenceId: number;
  selectedMediaAssetId?: number | null;
};

async function removeObjectReferenceProjections(
  actor: VerticalDramaObjectReferenceActor,
  input: Pick<
    ObjectReferenceProjectionInput,
    "episodeId" | "shotNumber" | "objectReferenceId"
  >
) {
  const projections = await db
    .select({
      id: verticalDramaObjectReferenceProjections.id,
      shotReferenceId: verticalDramaObjectReferenceProjections.shotReferenceId,
    })
    .from(verticalDramaObjectReferenceProjections)
    .where(
      and(
        eq(verticalDramaObjectReferenceProjections.tenantId, actor.tenantId),
        eq(verticalDramaObjectReferenceProjections.userId, actor.userId),
        eq(verticalDramaObjectReferenceProjections.episodeId, input.episodeId),
        eq(
          verticalDramaObjectReferenceProjections.shotNumber,
          input.shotNumber
        ),
        eq(
          verticalDramaObjectReferenceProjections.objectReferenceId,
          input.objectReferenceId
        )
      )
    );
  if (projections.length === 0) return;
  await db.delete(verticalDramaObjectReferenceProjections).where(
    and(
      eq(verticalDramaObjectReferenceProjections.tenantId, actor.tenantId),
      eq(verticalDramaObjectReferenceProjections.userId, actor.userId),
      inArray(
        verticalDramaObjectReferenceProjections.id,
        projections.map(projection => projection.id)
      )
    )
  );
  await db.delete(verticalDramaShotReferences).where(
    and(
      eq(verticalDramaShotReferences.tenantId, actor.tenantId),
      eq(verticalDramaShotReferences.userId, actor.userId),
      eq(verticalDramaShotReferences.source, "prop_object"),
      inArray(
        verticalDramaShotReferences.id,
        projections.map(projection => projection.shotReferenceId)
      )
    )
  );
}

async function projectObjectReferenceAssets(
  actor: VerticalDramaObjectReferenceActor,
  input: ObjectReferenceProjectionInput,
  revision: number
) {
  const assets = await db
    .select({
      id: verticalDramaObjectReferenceAssets.id,
      mediaAssetId: verticalDramaObjectReferenceAssets.mediaAssetId,
      role: verticalDramaObjectReferenceAssets.role,
    })
    .from(verticalDramaObjectReferenceAssets)
    .where(
      and(
        eq(
          verticalDramaObjectReferenceAssets.objectReferenceId,
          input.objectReferenceId
        ),
        eq(verticalDramaObjectReferenceAssets.tenantId, actor.tenantId),
        eq(verticalDramaObjectReferenceAssets.userId, actor.userId),
        eq(verticalDramaObjectReferenceAssets.state, "active")
      )
    )
    .orderBy(
      asc(verticalDramaObjectReferenceAssets.sortOrder),
      asc(verticalDramaObjectReferenceAssets.id)
    );
  const selected = input.selectedMediaAssetId
    ? assets.find(asset => asset.mediaAssetId === input.selectedMediaAssetId)
    : undefined;
  const orderedAssets = selectObjectReferenceMedia(assets, 5).filter(
    asset => asset.id !== selected?.id
  );
  const projectedAssets = selected
    ? [selected, ...orderedAssets].slice(0, 5)
    : orderedAssets;
  for (const [sortOrder, asset] of projectedAssets.entries()) {
    const [inserted] = await db
      .insert(verticalDramaShotReferences)
      .values({
        tenantId: actor.tenantId,
        userId: actor.userId,
        seriesId: input.seriesId,
        episodeId: input.episodeId,
        shotNumber: input.shotNumber,
        mediaAssetId: asset.mediaAssetId,
        role: "reference",
        source: "prop_object",
        sortOrder,
      })
      .onConflictDoNothing()
      .returning({ id: verticalDramaShotReferences.id });
    const reference = inserted
      ? inserted
      : (
          await db
            .select({ id: verticalDramaShotReferences.id })
            .from(verticalDramaShotReferences)
            .where(
              and(
                eq(verticalDramaShotReferences.tenantId, actor.tenantId),
                eq(verticalDramaShotReferences.userId, actor.userId),
                eq(verticalDramaShotReferences.episodeId, input.episodeId),
                eq(verticalDramaShotReferences.shotNumber, input.shotNumber),
                eq(
                  verticalDramaShotReferences.mediaAssetId,
                  asset.mediaAssetId
                ),
                eq(verticalDramaShotReferences.source, "prop_object")
              )
            )
            .limit(1)
        )[0];
    if (!reference) continue;
    await db
      .insert(verticalDramaObjectReferenceProjections)
      .values({
        tenantId: actor.tenantId,
        userId: actor.userId,
        episodeId: input.episodeId,
        shotNumber: input.shotNumber,
        objectReferenceId: input.objectReferenceId,
        shotReferenceId: reference.id,
        sourceRevision: revision,
      })
      .onConflictDoNothing();
  }
}

export async function reconcileVerticalDramaObjectReferenceShotProjections(
  actor: VerticalDramaObjectReferenceActor,
  objectReferenceId: number
) {
  const object = await ownedObject(actor, objectReferenceId);
  const links = await db
    .select({
      episodeId: verticalDramaShotObjectReferences.episodeId,
      shotNumber: verticalDramaShotObjectReferences.shotNumber,
      selectedMediaAssetId:
        verticalDramaShotObjectReferences.selectedMediaAssetId,
    })
    .from(verticalDramaShotObjectReferences)
    .where(
      and(
        eq(verticalDramaShotObjectReferences.objectReferenceId, object.id),
        eq(verticalDramaShotObjectReferences.tenantId, actor.tenantId),
        eq(verticalDramaShotObjectReferences.userId, actor.userId),
        eq(verticalDramaShotObjectReferences.status, "active")
      )
    );
  for (const link of links) {
    await removeObjectReferenceProjections(actor, {
      episodeId: link.episodeId,
      shotNumber: link.shotNumber,
      objectReferenceId: object.id,
    });
    await projectObjectReferenceAssets(
      actor,
      {
        seriesId: object.seriesId,
        episodeId: link.episodeId,
        shotNumber: link.shotNumber,
        objectReferenceId: object.id,
        selectedMediaAssetId: link.selectedMediaAssetId,
      },
      object.revision
    );
  }
  return { reconciled: links.length };
}

export async function upsertVerticalDramaObjectReferenceAliases(
  actor: VerticalDramaObjectReferenceActor,
  input: { objectReferenceId: string; aliases: string[] }
) {
  const object = await ownedObject(actor, input.objectReferenceId);
  const aliases = normalizeObjectReferenceAliases(input.aliases);
  for (const alias of aliases) {
    await db
      .insert(verticalDramaObjectReferenceAliases)
      .values({
        tenantId: actor.tenantId,
        userId: actor.userId,
        seriesId: object.seriesId,
        objectReferenceId: object.id,
        alias,
        normalizedAlias: normalizeObjectReferenceAlias(alias),
      })
      .onConflictDoUpdate({
        target: [
          verticalDramaObjectReferenceAliases.seriesId,
          verticalDramaObjectReferenceAliases.normalizedAlias,
        ],
        set: { alias, objectReferenceId: object.id },
      });
  }
  return { aliases };
}

export async function listVerticalDramaObjectReferenceAliases(
  actor: VerticalDramaObjectReferenceActor,
  objectReferenceId: string
) {
  const object = await ownedObject(actor, objectReferenceId);
  return db
    .select()
    .from(verticalDramaObjectReferenceAliases)
    .where(
      and(
        eq(verticalDramaObjectReferenceAliases.objectReferenceId, object.id),
        eq(verticalDramaObjectReferenceAliases.tenantId, actor.tenantId),
        eq(verticalDramaObjectReferenceAliases.userId, actor.userId)
      )
    )
    .orderBy(asc(verticalDramaObjectReferenceAliases.normalizedAlias));
}

export async function linkVerticalDramaShotObjectReference(
  actor: VerticalDramaObjectReferenceActor,
  input: {
    objectReferenceId: string;
    episodeId: string;
    shotNumber: number;
    assignmentSource: string;
    confidence?: number;
    locked: boolean;
    selectedMediaAssetId?: string;
  }
) {
  const object = await ownedObject(actor, input.objectReferenceId);
  const [episode] = await db
    .select({
      id: verticalDramaEpisodes.id,
      seriesId: verticalDramaEpisodes.seriesId,
    })
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.id, numberId(input.episodeId)),
        eq(verticalDramaEpisodes.tenantId, actor.tenantId),
        eq(verticalDramaEpisodes.userId, actor.userId),
        eq(verticalDramaEpisodes.seriesId, object.seriesId)
      )
    )
    .limit(1);
  if (!episode) throw new Error("Episode not found");
  const selectedMediaAssetId = input.selectedMediaAssetId
    ? numberId(input.selectedMediaAssetId)
    : null;
  if (selectedMediaAssetId !== null) {
    const [selectedAsset] = await db
      .select({ id: verticalDramaObjectReferenceAssets.id })
      .from(verticalDramaObjectReferenceAssets)
      .where(
        and(
          eq(verticalDramaObjectReferenceAssets.id, selectedMediaAssetId),
          eq(verticalDramaObjectReferenceAssets.objectReferenceId, object.id),
          eq(verticalDramaObjectReferenceAssets.tenantId, actor.tenantId),
          eq(verticalDramaObjectReferenceAssets.userId, actor.userId),
          eq(verticalDramaObjectReferenceAssets.state, "active")
        )
      )
      .limit(1);
    if (!selectedAsset)
      throw new Error("Selected object reference asset not found");
  }
  const [row] = await db
    .insert(verticalDramaShotObjectReferences)
    .values({
      tenantId: actor.tenantId,
      userId: actor.userId,
      seriesId: object.seriesId,
      episodeId: episode.id,
      shotNumber: input.shotNumber,
      objectReferenceId: object.id,
      assignmentSource: input.assignmentSource,
      confidence: input.confidence ?? null,
      locked: input.locked,
      selectedMediaAssetId,
    })
    .onConflictDoUpdate({
      target: [
        verticalDramaShotObjectReferences.episodeId,
        verticalDramaShotObjectReferences.shotNumber,
        verticalDramaShotObjectReferences.objectReferenceId,
      ],
      set: {
        assignmentSource: input.assignmentSource,
        confidence: input.confidence ?? null,
        locked: input.locked,
        selectedMediaAssetId,
        status: "active",
        manualOverride: input.assignmentSource === "manual",
        removedAt: null,
        updatedAt: new Date(),
      },
    })
    .returning();
  await removeObjectReferenceProjections(actor, {
    episodeId: episode.id,
    shotNumber: input.shotNumber,
    objectReferenceId: object.id,
  });
  await projectObjectReferenceAssets(
    actor,
    {
      seriesId: object.seriesId,
      episodeId: episode.id,
      shotNumber: input.shotNumber,
      objectReferenceId: object.id,
      selectedMediaAssetId,
    },
    object.revision
  );
  return { ...row, id: String(row.id) };
}

export async function unlinkVerticalDramaShotObjectReference(
  actor: VerticalDramaObjectReferenceActor,
  id: string
) {
  const [link] = await db
    .select({
      episodeId: verticalDramaShotObjectReferences.episodeId,
      shotNumber: verticalDramaShotObjectReferences.shotNumber,
      objectReferenceId: verticalDramaShotObjectReferences.objectReferenceId,
    })
    .from(verticalDramaShotObjectReferences)
    .where(
      and(
        eq(verticalDramaShotObjectReferences.id, numberId(id)),
        eq(verticalDramaShotObjectReferences.tenantId, actor.tenantId),
        eq(verticalDramaShotObjectReferences.userId, actor.userId)
      )
    )
    .limit(1);
  const [row] = await db
    .update(verticalDramaShotObjectReferences)
    .set({
      status: "removed",
      manualOverride: true,
      removedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(verticalDramaShotObjectReferences.id, numberId(id)),
        eq(verticalDramaShotObjectReferences.tenantId, actor.tenantId),
        eq(verticalDramaShotObjectReferences.userId, actor.userId)
      )
    )
    .returning();
  if (row && link) {
    await removeObjectReferenceProjections(actor, {
      episodeId: link.episodeId,
      shotNumber: link.shotNumber,
      objectReferenceId: link.objectReferenceId,
    });
    // Catalog projections are already removed above. Any remaining active
    // object link keeps its own projected references intact.
  }
  return { removed: true };
}

export async function listVerticalDramaObjectReferenceUsages(
  actor: VerticalDramaObjectReferenceActor,
  input: { objectReferenceId: string; includeRemoved?: boolean }
) {
  const object = await ownedObject(actor, input.objectReferenceId);
  return db
    .select()
    .from(verticalDramaShotObjectReferences)
    .where(
      and(
        eq(verticalDramaShotObjectReferences.objectReferenceId, object.id),
        eq(verticalDramaShotObjectReferences.tenantId, actor.tenantId),
        eq(verticalDramaShotObjectReferences.userId, actor.userId),
        ...(input.includeRemoved
          ? []
          : [eq(verticalDramaShotObjectReferences.status, "active")])
      )
    )
    .orderBy(
      asc(verticalDramaShotObjectReferences.episodeId),
      asc(verticalDramaShotObjectReferences.shotNumber)
    );
}

export async function listVerticalDramaShotObjectReferences(
  actor: VerticalDramaObjectReferenceActor,
  episodeId: string | number
) {
  const id = numberId(episodeId);
  const [episode] = await db
    .select({ seriesId: verticalDramaEpisodes.seriesId })
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.id, id),
        eq(verticalDramaEpisodes.tenantId, actor.tenantId),
        eq(verticalDramaEpisodes.userId, actor.userId)
      )
    )
    .limit(1);
  if (!episode) throw new Error("Episode not found");
  const rows = await db
    .select({
      id: verticalDramaShotObjectReferences.id,
      shotNumber: verticalDramaShotObjectReferences.shotNumber,
      objectReferenceId: verticalDramaShotObjectReferences.objectReferenceId,
      name: verticalDramaObjectReferences.name,
      status: verticalDramaShotObjectReferences.status,
      assignmentSource: verticalDramaShotObjectReferences.assignmentSource,
      confidence: verticalDramaShotObjectReferences.confidence,
      locked: verticalDramaShotObjectReferences.locked,
    })
    .from(verticalDramaShotObjectReferences)
    .innerJoin(
      verticalDramaObjectReferences,
      eq(
        verticalDramaObjectReferences.id,
        verticalDramaShotObjectReferences.objectReferenceId
      )
    )
    .where(
      and(
        eq(verticalDramaShotObjectReferences.episodeId, id),
        eq(verticalDramaShotObjectReferences.seriesId, episode.seriesId),
        eq(verticalDramaShotObjectReferences.tenantId, actor.tenantId),
        eq(verticalDramaShotObjectReferences.userId, actor.userId),
        eq(verticalDramaShotObjectReferences.status, "active")
      )
    )
    .orderBy(
      asc(verticalDramaShotObjectReferences.shotNumber),
      asc(verticalDramaObjectReferences.name)
    );
  return rows.map(row => ({
    ...row,
    id: String(row.id),
    objectReferenceId: String(row.objectReferenceId),
  }));
}

export async function reviewVerticalDramaObjectReferenceSuggestion(
  actor: VerticalDramaObjectReferenceActor,
  input: { suggestionId: string; decision: "accepted" | "rejected" | "reset" }
) {
  const suggestionId = numberId(input.suggestionId);
  const [suggestion] = await db
    .select()
    .from(verticalDramaObjectDetectionSuggestions)
    .where(
      and(
        eq(verticalDramaObjectDetectionSuggestions.id, suggestionId),
        eq(verticalDramaObjectDetectionSuggestions.tenantId, actor.tenantId),
        eq(verticalDramaObjectDetectionSuggestions.userId, actor.userId)
      )
    )
    .limit(1);
  if (!suggestion) throw new Error("Object suggestion not found");
  await db
    .update(verticalDramaObjectDetectionSuggestions)
    .set({
      decision: input.decision,
      status: input.decision === "reset" ? "pending" : "reviewed",
      updatedAt: new Date(),
    })
    .where(eq(verticalDramaObjectDetectionSuggestions.id, suggestionId));
  if (input.decision === "accepted") {
    await linkVerticalDramaShotObjectReference(actor, {
      objectReferenceId: String(suggestion.objectReferenceId),
      episodeId: String(suggestion.episodeId),
      shotNumber: suggestion.shotNumber,
      assignmentSource: "detected",
      confidence: suggestion.confidence ?? undefined,
      locked: false,
    });
  }
  return { suggestionId: String(suggestionId), decision: input.decision };
}

export async function listVerticalDramaObjectReferenceSuggestions(
  actor: VerticalDramaObjectReferenceActor,
  episodeId: string | number
) {
  const id = numberId(episodeId);
  return db
    .select({
      id: verticalDramaObjectDetectionSuggestions.id,
      objectReferenceId:
        verticalDramaObjectDetectionSuggestions.objectReferenceId,
      name: verticalDramaObjectReferences.name,
      shotNumber: verticalDramaObjectDetectionSuggestions.shotNumber,
      confidence: verticalDramaObjectDetectionSuggestions.confidence,
      status: verticalDramaObjectDetectionSuggestions.status,
      decision: verticalDramaObjectDetectionSuggestions.decision,
      evidenceJson: verticalDramaObjectDetectionSuggestions.evidenceJson,
    })
    .from(verticalDramaObjectDetectionSuggestions)
    .innerJoin(
      verticalDramaObjectReferences,
      eq(
        verticalDramaObjectReferences.id,
        verticalDramaObjectDetectionSuggestions.objectReferenceId
      )
    )
    .where(
      and(
        eq(verticalDramaObjectDetectionSuggestions.episodeId, id),
        eq(verticalDramaObjectDetectionSuggestions.tenantId, actor.tenantId),
        eq(verticalDramaObjectDetectionSuggestions.userId, actor.userId),
        eq(verticalDramaObjectReferences.tenantId, actor.tenantId),
        eq(verticalDramaObjectReferences.userId, actor.userId)
      )
    )
    .orderBy(desc(verticalDramaObjectDetectionSuggestions.updatedAt));
}

/** Remove a manual tombstone so the advisory detector can suggest the shot again. */
export async function resetVerticalDramaObjectReferenceShotDecision(
  actor: VerticalDramaObjectReferenceActor,
  id: string
) {
  const [row] = await db
    .update(verticalDramaShotObjectReferences)
    .set({
      status: "active",
      manualOverride: false,
      removedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(verticalDramaShotObjectReferences.id, numberId(id)),
        eq(verticalDramaShotObjectReferences.tenantId, actor.tenantId),
        eq(verticalDramaShotObjectReferences.userId, actor.userId)
      )
    )
    .returning({ id: verticalDramaShotObjectReferences.id });
  return { reset: Boolean(row), linkId: row ? String(row.id) : id };
}

export async function ensureCommercialObjectReference(
  actor: VerticalDramaObjectReferenceActor,
  input: {
    seriesId: string;
    name: string;
    marketplaceCaptureId?: string;
    marketplaceProductId?: string;
    mediaAssetIds?: string[];
  }
) {
  const object = await createVerticalDramaObjectReference(actor, {
    ...input,
    mode: "commercial_tie_in",
    source: input.marketplaceCaptureId
      ? "marketplace_capture"
      : "legacy_product_tie_in",
  });
  for (const mediaAssetId of input.mediaAssetIds ?? [])
    await addVerticalDramaObjectReferenceAsset(actor, {
      objectReferenceId: object.id,
      mediaAssetId,
      role: "alternate",
      source: input.marketplaceCaptureId
        ? "marketplace_capture"
        : "legacy_product_tie_in",
    });
  return object;
}

export async function reconcileCommercialObjectReference(
  actor: VerticalDramaObjectReferenceActor,
  input: {
    seriesId: string;
    episodeId: string;
    name: string;
    marketplaceCaptureId?: string;
    marketplaceProductId?: string;
    mediaAssetIds?: string[];
    reviewedSnapshot?: unknown;
  }
) {
  const object = await ensureCommercialObjectReference(actor, input);
  const episodeId = numberId(input.episodeId);
  const [episode] = await db
    .select({
      id: verticalDramaEpisodes.id,
      seriesId: verticalDramaEpisodes.seriesId,
    })
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.id, episodeId),
        eq(verticalDramaEpisodes.seriesId, object.seriesId),
        eq(verticalDramaEpisodes.tenantId, actor.tenantId),
        eq(verticalDramaEpisodes.userId, actor.userId)
      )
    )
    .limit(1);
  if (!episode) throw new Error("Episode not found");
  const [binding] = await db
    .insert(verticalDramaEpisodeObjectReferences)
    .values({
      tenantId: actor.tenantId,
      userId: actor.userId,
      seriesId: object.seriesId,
      episodeId: episode.id,
      objectReferenceId: object.id,
      role: "commercial_object",
      source: "special_tie_in",
      reviewedSnapshot: input.reviewedSnapshot ?? {
        name: input.name,
        marketplaceCaptureId: input.marketplaceCaptureId ?? null,
        marketplaceProductId: input.marketplaceProductId ?? null,
      },
    })
    .onConflictDoUpdate({
      target: [
        verticalDramaEpisodeObjectReferences.episodeId,
        verticalDramaEpisodeObjectReferences.objectReferenceId,
      ],
      set: {
        reviewedSnapshot: input.reviewedSnapshot ?? null,
        source: "special_tie_in",
      },
    })
    .returning();
  return { object, binding: { ...binding, id: String(binding.id) } };
}

/** Best-effort, deterministic first pass used after storyboard reads. */
export async function detectAndLinkVerticalDramaObjectReferences(
  actor: VerticalDramaObjectReferenceActor,
  episodeId: string | number
) {
  const id = numberId(episodeId);
  const [episode] = await db
    .select({
      seriesId: verticalDramaEpisodes.seriesId,
      episodeNumber: verticalDramaEpisodes.episodeNumber,
      title: verticalDramaEpisodes.title,
      script: verticalDramaEpisodes.script,
      storyboard: verticalDramaEpisodes.storyboard,
    })
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.id, id),
        eq(verticalDramaEpisodes.tenantId, actor.tenantId),
        eq(verticalDramaEpisodes.userId, actor.userId)
      )
    )
    .limit(1);
  if (
    !episode ||
    !Array.isArray((episode.storyboard as { shots?: unknown[] } | null)?.shots)
  )
    return { linked: 0 };
  const objects = await db
    .select()
    .from(verticalDramaObjectReferences)
    .where(
      and(
        eq(verticalDramaObjectReferences.seriesId, episode.seriesId),
        eq(verticalDramaObjectReferences.tenantId, actor.tenantId),
        eq(verticalDramaObjectReferences.userId, actor.userId),
        eq(verticalDramaObjectReferences.status, "active")
      )
    );
  let linked = 0;
  for (const [index, rawShot] of (
    episode.storyboard as { shots: unknown[] }
  ).shots.entries()) {
    if (!rawShot || typeof rawShot !== "object") continue;
    const shot = rawShot as Record<string, unknown>;
    const shotNumber = Number(
      shot.shotNumber ?? shot.shot_number ?? shot.number ?? index + 1
    );
    if (!Number.isSafeInteger(shotNumber) || shotNumber <= 0) continue;
    const haystack = JSON.stringify(rawShot).toLocaleLowerCase();
    for (const object of objects) {
      if (
        object.name.trim().length < 3 ||
        !haystack.includes(object.name.trim().toLocaleLowerCase())
      )
        continue;
      await linkVerticalDramaShotObjectReference(actor, {
        objectReferenceId: String(object.id),
        episodeId: String(id),
        shotNumber,
        assignmentSource: "detected",
        locked: false,
      });
      linked += 1;
    }
  }
  return { linked };
}

/**
 * Advisory detector entry point. It only persists reviewable suggestions;
 * callers decide whether high-confidence results should be linked. This keeps
 * episode detail reads pure and makes retries/deduplication explicit.
 */
export async function suggestVerticalDramaObjectReferences(
  actor: VerticalDramaObjectReferenceActor,
  episodeId: string | number
) {
  const id = numberId(episodeId);
  const [episode] = await db
    .select({
      seriesId: verticalDramaEpisodes.seriesId,
      episodeNumber: verticalDramaEpisodes.episodeNumber,
      title: verticalDramaEpisodes.title,
      script: verticalDramaEpisodes.script,
      storyboard: verticalDramaEpisodes.storyboard,
    })
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.id, id),
        eq(verticalDramaEpisodes.tenantId, actor.tenantId),
        eq(verticalDramaEpisodes.userId, actor.userId)
      )
    )
    .limit(1);
  if (
    !episode ||
    !Array.isArray((episode.storyboard as { shots?: unknown[] } | null)?.shots)
  )
    return { suggestions: [], warnings: [] };
  const [series] = await db
    .select({
      title: verticalDramaSeries.title,
      bible: verticalDramaSeries.bible,
      memory: verticalDramaSeries.memory,
    })
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, episode.seriesId),
        eq(verticalDramaSeries.tenantId, actor.tenantId),
        eq(verticalDramaSeries.userId, actor.userId)
      )
    )
    .limit(1);
  const [previousEpisode] = await db
    .select({
      episodeNumber: verticalDramaEpisodes.episodeNumber,
      title: verticalDramaEpisodes.title,
      script: verticalDramaEpisodes.script,
      storyboard: verticalDramaEpisodes.storyboard,
    })
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.seriesId, episode.seriesId),
        eq(verticalDramaEpisodes.tenantId, actor.tenantId),
        eq(verticalDramaEpisodes.userId, actor.userId),
        eq(
          verticalDramaEpisodes.episodeNumber,
          Math.max(0, episode.episodeNumber - 1)
        )
      )
    )
    .limit(1);
  const objects = await db
    .select()
    .from(verticalDramaObjectReferences)
    .where(
      and(
        eq(verticalDramaObjectReferences.seriesId, episode.seriesId),
        eq(verticalDramaObjectReferences.tenantId, actor.tenantId),
        eq(verticalDramaObjectReferences.userId, actor.userId),
        eq(verticalDramaObjectReferences.status, "active")
      )
    );
  const aliases = await db
    .select()
    .from(verticalDramaObjectReferenceAliases)
    .where(
      and(
        eq(verticalDramaObjectReferenceAliases.seriesId, episode.seriesId),
        eq(verticalDramaObjectReferenceAliases.tenantId, actor.tenantId),
        eq(verticalDramaObjectReferenceAliases.userId, actor.userId)
      )
    );
  const suggestions: Array<{
    objectReferenceId: string;
    shotNumber: number;
    confidence: number;
  }> = [];
  const shots = (episode.storyboard as { shots: unknown[] }).shots;
  for (const [index, rawShot] of shots.entries()) {
    if (!rawShot || typeof rawShot !== "object") continue;
    const shotNumber = Number(
      (rawShot as Record<string, unknown>).shotNumber ?? index + 1
    );
    if (!Number.isSafeInteger(shotNumber) || shotNumber <= 0) continue;
    const context = buildVerticalDramaObjectReferenceContext({
      seriesId: episode.seriesId,
      episodeId: id,
      shotNumber,
      shot: rawShot,
      previousShot: shots[index - 1],
      seriesStory: series,
      episodeStory: {
        episodeNumber: episode.episodeNumber,
        title: episode.title,
        script: episode.script,
      },
      previousEpisodeStory: previousEpisode,
    });
    const normalizedText = context.text.toLocaleLowerCase();
    for (const object of objects) {
      const terms = [
        object.name,
        ...aliases
          .filter(alias => alias.objectReferenceId === object.id)
          .map(alias => alias.alias),
      ].filter(term => term.trim().length >= 2);
      const matched = terms.find(term =>
        normalizedText.includes(term.trim().toLocaleLowerCase())
      );
      if (!matched) continue;
      const confidence = matched === object.name ? 0.92 : 0.78;
      const fingerprint = objectReferenceContextFingerprint(context);
      await db
        .insert(verticalDramaObjectDetectionSuggestions)
        .values({
          tenantId: actor.tenantId,
          userId: actor.userId,
          seriesId: episode.seriesId,
          episodeId: id,
          shotNumber,
          objectReferenceId: object.id,
          detectorVersion: "feature-174-v2",
          contextFingerprint: fingerprint,
          evidenceJson: {
            matchedTerm: matched,
            continuation: context.continuation,
          },
          confidence,
          status: "pending",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        })
        .onConflictDoNothing();
      suggestions.push({
        objectReferenceId: String(object.id),
        shotNumber,
        confidence,
      });
    }
  }
  return { suggestions, warnings: [] };
}
