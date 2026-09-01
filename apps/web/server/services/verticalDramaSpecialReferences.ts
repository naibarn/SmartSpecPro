import crypto from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  mediaAssets,
  verticalDramaCharacterAssets,
  verticalDramaLocationAssets,
  verticalDramaLocations,
  verticalDramaSeries,
  verticalDramaCharacters,
} from "../../drizzle/schema";
import { db } from "../db";
import {
  findSimilarVerticalDramaLocationCandidates,
  normalizeVerticalDramaLocationName,
} from "../../shared/verticalDramaSeries/locationIdentity";
import { getMarketplaceProductWithAccess } from "./marketplaceProductService";
import {
  copyAuthorizedManagedMediaToVerticalDrama,
  ingestVerticalDramaMediaAsset,
  reconcileVerticalDramaMediaAsset,
} from "./verticalDramaMediaAssetService";
import type { SpecialReferenceBinding } from "../../shared/verticalDramaSeries/specialTieInContracts";

export type SpecialReferenceActor = { tenantId: string; userId: number };

export type SpecialSceneLocationCandidate = {
  locationId: number;
  locationKey: string;
  name: string;
  score: number;
};

type SpecialSceneLocationRow = {
  id: number;
  locationKey: string;
  name: string;
};

export async function findSpecialStorySceneMatches(input: {
  actor: SpecialReferenceActor;
  seriesId: number;
  label: string;
}): Promise<{
  exact?: SpecialSceneLocationRow;
  similar: SpecialSceneLocationCandidate[];
}> {
  const label = input.label.trim();
  if (!label) return { similar: [] };
  const rows: SpecialSceneLocationRow[] = await db
    .select({
      id: verticalDramaLocations.id,
      locationKey: verticalDramaLocations.locationKey,
      name: verticalDramaLocations.name,
    })
    .from(verticalDramaLocations)
    .where(
      and(
        eq(verticalDramaLocations.tenantId, input.actor.tenantId),
        eq(verticalDramaLocations.userId, input.actor.userId),
        eq(verticalDramaLocations.seriesId, input.seriesId)
      )
    );
  const exact = rows.find(
    row => normalizeVerticalDramaLocationName(row.name) === normalizeVerticalDramaLocationName(label)
  );
  const normalizedLabel = normalizeVerticalDramaLocationName(label);
  const similar = findSimilarVerticalDramaLocationCandidates(rows, label).map(
    candidate => ({
      locationId: Number(candidate.location.id),
      locationKey: candidate.location.locationKey,
      name: candidate.location.name,
      score: candidate.score,
    })
  );
  return {
    exact: exact
      ? {
          id: Number(exact.id),
          locationKey: exact.locationKey,
          name: exact.name,
        }
      : undefined,
    similar: similar.filter(
      candidate =>
        candidate.locationKey !== exact?.locationKey &&
        normalizeVerticalDramaLocationName(candidate.name) !== normalizedLabel,
    ),
  };
}

export async function resolveSpecialStorySceneSlotDecision(input: {
  actor: SpecialReferenceActor;
  seriesId: number;
  decision: "reuse" | "create";
  locationId?: number;
  label: string;
  description: string;
}): Promise<{ locationId: number; locationKey: string }> {
  if (input.decision === "reuse") {
    if (!input.locationId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "A location is required when reusing a scene" });
    }
    const [location] = await db
      .select({ id: verticalDramaLocations.id, locationKey: verticalDramaLocations.locationKey })
      .from(verticalDramaLocations)
      .where(
        and(
          eq(verticalDramaLocations.id, input.locationId),
          eq(verticalDramaLocations.tenantId, input.actor.tenantId),
          eq(verticalDramaLocations.userId, input.actor.userId),
          eq(verticalDramaLocations.seriesId, input.seriesId)
        )
      )
      .limit(1);
    if (!location) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Scene is not in this series" });
    }
    return { locationId: Number(location.id), locationKey: location.locationKey };
  }
  return reconcileSpecialStorySceneSlot(input);
}

/**
 * Stable key shared by the marketplace idea selector and the special-episode
 * worker. Keeping one key derivation means selecting an idea can provision a
 * normal Scenes slot, while the later worker can safely find/reuse that same
 * slot without creating a second background scene.
 */
export function buildSpecialSceneLocationKey(
  seriesId: number,
  label: string,
): string {
  return `tie-in-${crypto
    .createHash("sha256")
    .update(`${seriesId}:${label.trim()}`)
    .digest("hex")
    .slice(0, 56)}`;
}

/**
 * Provision a product tie-in's background in the existing series Scenes
 * roster. This intentionally creates only the durable scene slot; image
 * generation remains the existing Scenes tab workflow, so a product image is
 * never promoted to a background image and no hidden paid render occurs.
 */
export async function reconcileSpecialStorySceneSlot(input: {
  actor: SpecialReferenceActor;
  seriesId: number;
  label: string;
  description: string;
  metadata?: Record<string, unknown>;
}): Promise<{ locationId: number; locationKey: string }> {
  const label = input.label.trim().slice(0, 255) || "ฉากตอนพิเศษ";
  const description = input.description.trim().slice(0, 4_000) || label;
  const matches = await findSpecialStorySceneMatches({
    actor: input.actor,
    seriesId: input.seriesId,
    label,
  });
  if (matches.exact) {
    return {
      locationId: matches.exact.id,
      locationKey: matches.exact.locationKey,
    };
  }
  const locationKey = buildSpecialSceneLocationKey(input.seriesId, label);
  const [location] = await db
    .insert(verticalDramaLocations)
    .values({
      tenantId: input.actor.tenantId,
      userId: input.actor.userId,
      seriesId: input.seriesId,
      locationKey,
      name: label,
      data: {
        description,
        slotStatus: "pending",
        slotReason: "ฉากพื้นหลังของตอนพิเศษ Tie-in",
        source: "special_tie_in",
        sceneKind: "product_tie_in_background",
        ...(input.metadata ?? {}),
      },
    })
    .onConflictDoUpdate({
      target: [
        verticalDramaLocations.seriesId,
        verticalDramaLocations.locationKey,
      ],
      // Preserve an existing user-edited/approved scene. The slot is
      // idempotent and only needs its last-seen timestamp refreshed.
      set: { updatedAt: new Date() },
    })
    .returning({
      id: verticalDramaLocations.id,
      locationKey: verticalDramaLocations.locationKey,
    });
  if (!location) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Could not create special Scenes slot",
    });
  }
  return { locationId: Number(location.id), locationKey: location.locationKey };
}

export function isUsableSpecialCharacterReference(asset: {
  mediaAssetId: number | null;
  originalUrl: string | null;
  status: string;
  assetType: string;
}) {
  return Boolean(
    asset.mediaAssetId &&
      asset.originalUrl &&
      asset.status !== "expired" &&
      asset.assetType === "character_reference",
  );
}

export async function resolveSpecialCharacterBindings(input: {
  actor: SpecialReferenceActor;
  seriesId: number;
  characterIds: string[];
}): Promise<Array<SpecialReferenceBinding & { authorizedUrl: string }>> {
  const ids = input.characterIds
    .map(value => Number(value))
    .filter(Number.isInteger);
  if (ids.length === 0) return [];
  const characters = await db
    .select({
      id: verticalDramaCharacters.id,
      characterKey: verticalDramaCharacters.characterKey,
      name: verticalDramaCharacters.name,
    })
    .from(verticalDramaCharacters)
    .where(
      and(
        eq(verticalDramaCharacters.tenantId, input.actor.tenantId),
        eq(verticalDramaCharacters.userId, input.actor.userId),
        eq(verticalDramaCharacters.seriesId, input.seriesId),
        inArray(verticalDramaCharacters.id, ids)
      )
    );
  if (characters.length !== ids.length)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "One or more characters are not in this series",
    });
  const assets = await db
    .select({
      characterId: verticalDramaCharacterAssets.characterId,
      mediaAssetId: verticalDramaCharacterAssets.mediaAssetId,
      originalUrl: mediaAssets.originalUrl,
      status: mediaAssets.status,
    })
    .from(verticalDramaCharacterAssets)
    .innerJoin(
      mediaAssets,
      eq(mediaAssets.id, verticalDramaCharacterAssets.mediaAssetId)
    )
    .where(
      and(
        eq(verticalDramaCharacterAssets.tenantId, input.actor.tenantId),
        eq(verticalDramaCharacterAssets.userId, input.actor.userId),
        eq(verticalDramaCharacterAssets.seriesId, input.seriesId),
        inArray(verticalDramaCharacterAssets.characterId, ids),
        eq(verticalDramaCharacterAssets.assetType, "character_reference"),
        eq(verticalDramaCharacterAssets.approved, true),
        eq(mediaAssets.status, "ready")
      )
    );
  const byCharacter = new Map(
    assets
      .filter(asset => asset.mediaAssetId && asset.originalUrl)
      .map(asset => [Number(asset.characterId), asset])
  );
  return characters.map(character => {
    const asset = byCharacter.get(Number(character.id));
    if (!asset?.originalUrl || !asset.mediaAssetId)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Character ${character.name} has no approved portrait`,
      });
    return {
      skillReferenceId: `character_${character.characterKey}`,
      role: "person" as const,
      mediaAssetId: String(asset.mediaAssetId),
      provenance: {
        source: "series_character",
        characterId: String(character.id),
        characterKey: character.characterKey,
      },
      authorizedUrl: asset.originalUrl,
    };
  });
}

export async function assertOwnedSpecialMediaAssets(
  actor: SpecialReferenceActor,
  mediaAssetIds: string[]
): Promise<void> {
  const ids = Array.from(
    new Set(mediaAssetIds.map(value => Number(value)).filter(Number.isInteger))
  );
  if (ids.length !== mediaAssetIds.length)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Special references must be managed media assets",
    });
  if (ids.length === 0) return;
  const rows = await db
    .select({
      id: mediaAssets.id,
      status: mediaAssets.status,
      originalUrl: mediaAssets.originalUrl,
      mimeType: mediaAssets.mimeType,
    })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.tenantId, actor.tenantId),
        eq(mediaAssets.userId, actor.userId)
      )
    );
  const allowed = new Map(rows.map(row => [String(row.id), row]));
  if (mediaAssetIds.some(id => !allowed.has(id)))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "One or more reference images are not accessible",
    });
  if (
    mediaAssetIds.some(id => {
      const asset = allowed.get(id);
      return (
        asset?.status !== "ready" ||
        !asset.originalUrl ||
        !asset.mimeType.toLowerCase().startsWith("image/")
      );
    })
  )
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "One or more reference images are not ready image assets",
    });
}

export async function materializeMarketplaceImageReference(input: {
  actor: SpecialReferenceActor;
  productId: string;
  imageId: string;
  seriesId: number;
}): Promise<{
  mediaAssetId: string;
  source: "marketplace_capture";
  label: string;
  url: string;
  provenance: Record<string, unknown>;
}> {
  const [series] = await db
    .select({ id: verticalDramaSeries.id })
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, input.seriesId),
        eq(verticalDramaSeries.tenantId, input.actor.tenantId),
        eq(verticalDramaSeries.userId, input.actor.userId)
      )
    )
    .limit(1);
  if (!series)
    throw new TRPCError({ code: "NOT_FOUND", message: "Series not found" });
  const bundle = await getMarketplaceProductWithAccess(
    input.productId,
    input.actor
  );
  const image = bundle.images.find(candidate => candidate.id === input.imageId);
  if (!image || !image.url)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Marketplace image is unavailable",
    });
  const asset = image.storageKey
    ? await copyAuthorizedManagedMediaToVerticalDrama({
        tenantId: input.actor.tenantId,
        userId: input.actor.userId,
        seriesId: input.seriesId,
        mediaType: "image",
        sourceStorageKey: image.storageKey,
        mimeType: image.mimeType ?? "image/png",
        identity: `marketplace:${input.productId}:${input.imageId}`,
        purpose: "special-tie-in-reference",
      })
    : await ingestVerticalDramaMediaAsset({
        tenantId: input.actor.tenantId,
        userId: input.actor.userId,
        seriesId: input.seriesId,
        mediaType: "image",
        sourceUrl: image.url,
        mimeType: "image/*",
        identity: `marketplace:${input.productId}:${input.imageId}`,
        purpose: "special-tie-in-reference",
      });
  return {
    mediaAssetId: String(asset.mediaAssetId),
    source: "marketplace_capture",
    label: image.type,
    url: asset.url,
    provenance: {
      marketplaceProductId: input.productId,
      marketplaceImageId: input.imageId,
      imageType: image.type,
      accessType: bundle.accessType,
    },
  };
}

export async function reconcileSpecialLocationSlot(input: {
  actor: SpecialReferenceActor;
  seriesId: number;
  referenceType: "location" | "store";
  label: string;
  mediaAssetIds: string[];
}): Promise<{ locationId: number; locationKey: string }> {
  await assertOwnedSpecialMediaAssets(input.actor, input.mediaAssetIds);
  const fingerprint = crypto
    .createHash("sha256")
    .update(
      JSON.stringify([
        input.seriesId,
        input.referenceType,
        input.label.trim().toLowerCase(),
        [...input.mediaAssetIds].sort(),
      ])
    )
    .digest("hex");
  const locationKey = `special-${fingerprint.slice(0, 56)}`;
  const [location] = await db
    .insert(verticalDramaLocations)
    .values({
      tenantId: input.actor.tenantId,
      userId: input.actor.userId,
      seriesId: input.seriesId,
      locationKey,
      name: input.label.trim().slice(0, 255),
      data: {
        source: "special_tie_in",
        referenceType: input.referenceType,
        fingerprint,
      },
    })
    .onConflictDoUpdate({
      target: [
        verticalDramaLocations.seriesId,
        verticalDramaLocations.locationKey,
      ],
      set: { updatedAt: new Date() },
    })
    .returning({
      id: verticalDramaLocations.id,
      locationKey: verticalDramaLocations.locationKey,
    });
  if (!location)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Could not create Scenes slot",
    });
  for (const mediaAssetId of input.mediaAssetIds) {
    const [existingAsset] = await db
      .select({ id: verticalDramaLocationAssets.id })
      .from(verticalDramaLocationAssets)
      .where(
        and(
          eq(verticalDramaLocationAssets.tenantId, input.actor.tenantId),
          eq(verticalDramaLocationAssets.userId, input.actor.userId),
          eq(verticalDramaLocationAssets.seriesId, input.seriesId),
          eq(verticalDramaLocationAssets.locationId, location.id),
          eq(verticalDramaLocationAssets.mediaAssetId, Number(mediaAssetId)),
          eq(verticalDramaLocationAssets.assetType, "location_reference")
        )
      )
      .limit(1);
    if (!existingAsset) {
      await db.insert(verticalDramaLocationAssets).values({
        tenantId: input.actor.tenantId,
        userId: input.actor.userId,
        seriesId: input.seriesId,
        locationId: location.id,
        mediaAssetId: Number(mediaAssetId),
        assetType: "location_reference",
        role: "establishing_plate",
        approved: false,
        qcStatus: "pending",
        metadata: { source: "special_tie_in", fingerprint },
      });
    }
  }
  return { locationId: Number(location.id), locationKey: location.locationKey };
}

export async function resolveSpecialReferenceBindings(
  actor: SpecialReferenceActor,
  bindings: SpecialReferenceBinding[]
): Promise<Array<SpecialReferenceBinding & { authorizedUrl: string }>> {
  await assertOwnedSpecialMediaAssets(
    actor,
    bindings.map(binding => binding.mediaAssetId)
  );
  const rows = await db
    .select({
      id: mediaAssets.id,
      originalUrl: mediaAssets.originalUrl,
      status: mediaAssets.status,
    })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.tenantId, actor.tenantId),
        eq(mediaAssets.userId, actor.userId)
      )
    );
  const byId = new Map(rows.map(row => [String(row.id), row]));
  return bindings.map(binding => {
    const row = byId.get(binding.mediaAssetId);
    if (!row || row.status !== "ready" || !row.originalUrl)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Reference ${binding.skillReferenceId} is unavailable`,
      });
    return { ...binding, authorizedUrl: row.originalUrl };
  });
}
