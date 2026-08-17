import { and, eq, inArray, ne } from "drizzle-orm";
import {
  mediaAssets,
  type VerticalDramaEpisodeRow,
} from "../../drizzle/schema";
import type { db as dbProxy } from "../db";
import {
  buildEpisodeCoverPrompt,
  readEpisodeCoverState,
  readEpisodeCoverVariants,
  type VerticalDramaEpisodeCoverSlotId,
  selectEpisodeCoverReferences,
  toEpisodeCoverDisplay,
  upsertEpisodeCoverVariant,
  type EpisodeCoverReferenceCandidate,
  type VerticalDramaEpisodeCoverDisplay,
  type VerticalDramaEpisodeCoverState,
} from "../../shared/verticalDramaSeries/episodeCover";
import { parseSeriesWatermarkConfig } from "../../shared/verticalDramaSeries/textOverlay";

type Db = typeof dbProxy;

export type EpisodeCoverOwner = {
  tenantId: string;
  userId: number;
};

export type EpisodeCoverNarrativeSnapshot = {
  seriesTitle: string;
  episodeNumber: number;
  episodeTitle: string | null;
  synopsis: string | null;
  plotBeats: string[];
};

export type EpisodeCoverGenerationSnapshot = EpisodeCoverNarrativeSnapshot & {
  prompt: string;
  references: Array<{
    shotNumber: number;
    mediaAssetId: string;
    url: string;
  }>;
  logoReferences: Array<{
    kind: "title_logo" | "channel_logo";
    url: string;
  }>;
};

export type EpisodeCoverLogoReference = {
  kind: "title_logo" | "channel_logo";
  url: string;
};

type StartFrameLike = {
  shotNumber?: unknown;
  approvedMediaAssetId?: unknown;
  imagePrompt?: unknown;
  canonicalShotSummary?: unknown;
  requiredCharacterRefs?: unknown;
  locationKey?: unknown;
};

export function readEpisodeCoverStateFromRow(
  row: Pick<VerticalDramaEpisodeRow, "coverImage">,
  slotId?: VerticalDramaEpisodeCoverSlotId
): VerticalDramaEpisodeCoverState | null {
  return readEpisodeCoverState(row.coverImage, slotId);
}

export function readEpisodeCoverVariantsFromRow(
  row: Pick<VerticalDramaEpisodeRow, "coverImage">
) {
  return readEpisodeCoverVariants(row.coverImage);
}

export function upsertEpisodeCoverStateInRow(
  row: Pick<VerticalDramaEpisodeRow, "coverImage">,
  slotId: VerticalDramaEpisodeCoverSlotId,
  state: VerticalDramaEpisodeCoverState
) {
  return upsertEpisodeCoverVariant(row.coverImage, slotId, state);
}

export async function resolveEpisodeCoverAssetUrls(
  db: Db,
  owner: EpisodeCoverOwner,
  states: Array<VerticalDramaEpisodeCoverState | null>
): Promise<Map<string, string>> {
  const ids = Array.from(
    new Set(
      states
        .map(state => state?.mediaAssetId)
        .filter((id): id is string => Boolean(id && /^\d+$/.test(id)))
    )
  );
  const urls = new Map<string, string>();
  if (ids.length === 0) return urls;

  const rows = await db
    .select({
      id: mediaAssets.id,
      mimeType: mediaAssets.mimeType,
      thumbnailUrl: mediaAssets.thumbnailUrl,
      originalUrl: mediaAssets.originalUrl,
    })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.tenantId, owner.tenantId),
        eq(mediaAssets.userId, owner.userId),
        ne(mediaAssets.status, "expired"),
        inArray(mediaAssets.id, ids.map(Number))
      )
    );

  for (const row of rows) {
    if (!row.mimeType.toLowerCase().startsWith("image/")) continue;
    const url = row.thumbnailUrl ?? row.originalUrl;
    if (url) urls.set(String(row.id), url);
  }
  return urls;
}

export async function resolveOwnedEpisodeCoverReferenceUrls(
  db: Db,
  owner: EpisodeCoverOwner,
  assetIds: readonly string[]
): Promise<Map<string, string>> {
  const ids = Array.from(
    new Set(assetIds.filter(id => /^\d+$/.test(id)).map(Number))
  );
  const urls = new Map<string, string>();
  if (ids.length === 0) return urls;

  const rows = await db
    .select({
      id: mediaAssets.id,
      mimeType: mediaAssets.mimeType,
      thumbnailUrl: mediaAssets.thumbnailUrl,
      originalUrl: mediaAssets.originalUrl,
    })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.tenantId, owner.tenantId),
        eq(mediaAssets.userId, owner.userId),
        inArray(mediaAssets.id, ids)
      )
    );
  for (const row of rows) {
    if (!row.mimeType.toLowerCase().startsWith("image/")) continue;
    const url = row.thumbnailUrl ?? row.originalUrl;
    if (url) urls.set(String(row.id), url);
  }
  return urls;
}

export function buildEpisodeCoverGenerationSnapshot(input: {
  narrative: EpisodeCoverNarrativeSnapshot;
  startFramePlan: unknown;
  referenceUrls: Map<string, string>;
  coverSlotId?: VerticalDramaEpisodeCoverSlotId;
  logoReferences?: readonly EpisodeCoverLogoReference[];
  maxReferenceImages?: number;
  referenceImageCount?: number;
}): EpisodeCoverGenerationSnapshot {
  const frames =
    input.startFramePlan && typeof input.startFramePlan === "object"
      ? (input.startFramePlan as { frames?: unknown }).frames
      : null;
  const frameRows: StartFrameLike[] = Array.isArray(frames)
    ? frames.filter((frame): frame is StartFrameLike =>
        Boolean(frame && typeof frame === "object")
      )
    : [];

  const candidates: EpisodeCoverReferenceCandidate[] = frameRows.flatMap(
    (frame, sourceIndex) => {
      const shotNumber = Number(frame.shotNumber);
      const mediaAssetId = String(frame.approvedMediaAssetId ?? "").trim();
      if (!Number.isInteger(shotNumber) || !mediaAssetId) return [];
      const characters = Array.isArray(frame.requiredCharacterRefs)
        ? frame.requiredCharacterRefs.filter(
            (value): value is string => typeof value === "string"
          )
        : [];
      return [
        {
          shotNumber,
          approvedMediaAssetId: mediaAssetId,
          sourceIndex,
          visual: String(frame.canonicalShotSummary ?? frame.imagePrompt ?? ""),
          action: String(frame.imagePrompt ?? ""),
          characters,
          location: String(frame.locationKey ?? ""),
        },
      ];
    }
  );

  const narrativeText = [
    input.narrative.seriesTitle,
    input.narrative.episodeTitle,
    input.narrative.synopsis,
    ...input.narrative.plotBeats,
  ]
    .filter(Boolean)
    .join(" ");
  const logoReferences = [...(input.logoReferences ?? [])];
  const frameReferenceLimit = Math.max(
    0,
    Math.floor(input.maxReferenceImages ?? 4) - logoReferences.length
  );
  const selected = selectEpisodeCoverReferences(
    candidates,
    narrativeText,
    Math.min(frameReferenceLimit, input.referenceImageCount ?? frameReferenceLimit)
  );
  const references = selected.flatMap(reference => {
    const url = input.referenceUrls.get(reference.approvedMediaAssetId);
    return url
      ? [
          {
            shotNumber: reference.shotNumber,
            mediaAssetId: reference.approvedMediaAssetId,
            url,
          },
        ]
      : [];
  });

  return {
    ...input.narrative,
    prompt: buildEpisodeCoverPrompt({
      ...input.narrative,
      coverSlotId: input.coverSlotId,
      logoReferences: logoReferences.map(reference => reference.kind),
      referenceImageCountBeforeLogos: references.length,
    }),
    references,
    logoReferences,
  };
}

/** Resolve the two configured series watermark image URLs for cover references. */
export function resolveEpisodeCoverLogoReferences(
  watermark: unknown,
  options: {
    includeTitleLogo: boolean;
    includeChannelLogo: boolean;
  }
): EpisodeCoverLogoReference[] {
  const config = parseSeriesWatermarkConfig(watermark);
  if (!config) return [];

  const references: EpisodeCoverLogoReference[] = [];
  if (
    options.includeTitleLogo &&
    config.type === "image" &&
    config.imageUrl?.trim()
  ) {
    references.push({ kind: "title_logo", url: config.imageUrl.trim() });
  }
  if (
    options.includeChannelLogo &&
    config.secondary?.type === "image" &&
    config.secondary.imageUrl?.trim()
  ) {
    references.push({
      kind: "channel_logo",
      url: config.secondary.imageUrl.trim(),
    });
  }
  return references;
}

export function projectEpisodeCover(
  value: unknown,
  url: string | null
): VerticalDramaEpisodeCoverDisplay | null {
  return toEpisodeCoverDisplay(value, url);
}

export async function projectEpisodeCoverVariants(
  db: Db,
  owner: EpisodeCoverOwner,
  row: Pick<VerticalDramaEpisodeRow, "coverImage">
): Promise<
  Array<{
    slotId: VerticalDramaEpisodeCoverSlotId;
    coverImage: VerticalDramaEpisodeCoverDisplay;
  }>
> {
  const variants = readEpisodeCoverVariants(row.coverImage);
  const urls = await resolveEpisodeCoverAssetUrls(
    db,
    owner,
    variants.map(variant => variant.state)
  );
  return variants.flatMap(variant => {
    const url = variant.state.mediaAssetId
      ? (urls.get(variant.state.mediaAssetId) ?? null)
      : null;
    const coverImage = projectEpisodeCover(variant.state, url);
    return coverImage ? [{ slotId: variant.slotId, coverImage }] : [];
  });
}
