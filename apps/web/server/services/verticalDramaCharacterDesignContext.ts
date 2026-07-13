import { and, desc, eq, inArray, ne } from "drizzle-orm";
import {
  verticalDramaCharacters,
  verticalDramaSeries,
  type VerticalDramaCharacterRow,
  type VerticalDramaSeriesRow,
} from "../../drizzle/schema";
import { db } from "../db";
import { debugError } from "../_core/logger";
import {
  verticalDramaCharacterDesignContextSchema,
  verticalDramaCharacterDesignDnaSchema,
  type VerticalDramaCharacterDesignContext,
  type VerticalDramaCharacterDesignDna,
} from "@shared/verticalDramaSeries/characterProfile";

const CURRENT_CAST_LIMIT = 30;
const RECENT_SERIES_SCAN_LIMIT = 15;
const RECENT_SERIES_RETAIN_LIMIT = 5;
const LEADS_PER_SERIES_LIMIT = 2;

type CharacterContextRow = Pick<
  VerticalDramaCharacterRow,
  | "id"
  | "seriesId"
  | "characterKey"
  | "name"
  | "role"
  | "data"
  | "parentCharacterId"
  | "sharesFaceWithCharacterId"
  | "updatedAt"
>;

type SeriesContextRow = Pick<
  VerticalDramaSeriesRow,
  "id" | "title" | "genre" | "tone" | "bible" | "updatedAt"
>;

export interface CharacterDesignContextOwner {
  tenantId: string;
  userId: number;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readPath(
  root: Record<string, unknown> | undefined,
  path: string
): unknown {
  return path
    .split(".")
    .reduce<unknown>((value, segment) => asRecord(value)?.[segment], root);
}

function firstText(
  root: Record<string, unknown> | undefined,
  paths: string[]
): string | undefined {
  for (const path of paths) {
    const value = readPath(root, path);
    if (typeof value === "string" && value.trim())
      return value.trim().slice(0, 1_000);
  }
  return undefined;
}

function firstTextList(
  root: Record<string, unknown> | undefined,
  paths: string[]
): string[] {
  for (const path of paths) {
    const value = readPath(root, path);
    if (!Array.isArray(value)) continue;
    const texts = value
      .filter(
        (item): item is string =>
          typeof item === "string" && Boolean(item.trim())
      )
      .map(item => item.trim().slice(0, 1_000))
      .slice(0, 12);
    if (texts.length > 0) return texts;
  }
  return [];
}

export function extractCharacterDesignDna(
  data: unknown
): VerticalDramaCharacterDesignDna | undefined {
  const raw = readPath(asRecord(data), "visualBible.designDna");
  const parsed = verticalDramaCharacterDesignDnaSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

function extractVisualSummary(data: unknown): string | undefined {
  const record = asRecord(data);
  return firstText(record, [
    "visualBible.visualIdentitySummary",
    "identityLock",
    "description",
    "appearance",
    "backstory",
  ]);
}

function isLeadRole(role: string | null): boolean {
  const normalized = (role ?? "").trim().toLowerCase();
  return [
    "นางเอก",
    "พระเอก",
    "ตัวเอก",
    "ตัวหลัก",
    "คู่หลัก",
    "female lead",
    "male lead",
    "leading lady",
    "leading man",
    "heroine",
    "protagonist",
    "lead role",
    "lead",
  ].some(keyword => normalized.includes(keyword));
}

function relationshipKind(
  row: CharacterContextRow,
  target: CharacterContextRow
): "target" | "distinct_person" | "same_person_variant" | "face_linked_twin" {
  if (row.id === target.id) return "target";
  if (
    row.sharesFaceWithCharacterId === target.id ||
    target.sharesFaceWithCharacterId === row.id ||
    (row.sharesFaceWithCharacterId != null &&
      row.sharesFaceWithCharacterId === target.sharesFaceWithCharacterId)
  ) {
    return "face_linked_twin";
  }
  const rowIdentityRoot = row.parentCharacterId ?? row.id;
  const targetIdentityRoot = target.parentCharacterId ?? target.id;
  return rowIdentityRoot === targetIdentityRoot
    ? "same_person_variant"
    : "distinct_person";
}

function projectCharacter(
  row: CharacterContextRow,
  target?: CharacterContextRow
) {
  const designDna = extractCharacterDesignDna(row.data);
  const visualSummary = extractVisualSummary(row.data);
  return {
    characterId: row.id,
    characterKey: row.characterKey,
    name: row.name,
    role: row.role,
    relationshipKind: target
      ? relationshipKind(row, target)
      : ("distinct_person" as const),
    ...(visualSummary ? { visualSummary } : {}),
    ...(designDna ? { designDna } : {}),
  };
}

function buildSeriesDna(series: SeriesContextRow) {
  const bible = asRecord(series.bible);
  const genreTone =
    [series.genre, series.tone].filter(Boolean).join(" / ") ||
    "unspecified drama";
  return {
    title: series.title,
    genre: series.genre,
    tone: series.tone,
    storyWorld:
      firstText(bible, [
        "storyWorld",
        "world",
        "setting",
        "premise",
        "series_summary",
      ]) ?? `${series.title}: ${genreTone}`,
    emotionalEngine:
      firstText(bible, [
        "emotionalEngine",
        "coreConflict",
        "theme",
        "logline",
        "premise",
      ]) ?? `Character conflict must express the ${genreTone} premise.`,
    visualCulture:
      firstText(bible, [
        "visualCulture",
        "visualStyle",
        "visualDirection",
        "style.visualLanguage",
      ]) ?? `A coherent visual culture for ${genreTone}.`,
    realismLevel:
      firstText(bible, [
        "realismLevel",
        "beautyRealismScale",
        "style.realismLevel",
      ]) ?? "Grounded, camera-believable human detail.",
    beautyDirection:
      firstText(bible, [
        "beautyDirection",
        "characterDesign.beautyDirection",
        "style.beautyDirection",
      ]) ??
      "Role-specific screen appeal with recognizable, non-generic identity.",
    dominantColors: firstTextList(bible, [
      "dominantColors",
      "palette",
      "visualPalette.colors",
    ]),
    signatureMotifs: firstTextList(bible, [
      "signatureMotifs",
      "motifs",
      "visualMotifs",
    ]),
    prohibitedRepetition: firstTextList(bible, [
      "prohibitedRepetition",
      "forbiddenDrift",
      "characterDesign.prohibitedRepetition",
    ]),
  };
}

export function buildCharacterDesignContextFromRows(input: {
  series: SeriesContextRow;
  target: CharacterContextRow;
  currentCastRows: CharacterContextRow[];
  recentSeriesRows: SeriesContextRow[];
  recentCharacterRows: CharacterContextRow[];
  archiveStatus?: "available" | "unavailable";
}): VerticalDramaCharacterDesignContext {
  const currentCast = [
    projectCharacter(input.target, input.target),
    ...input.currentCastRows
      .filter(row => row.id !== input.target.id)
      .slice(0, CURRENT_CAST_LIMIT - 1)
      .map(row => projectCharacter(row, input.target)),
  ];

  const recentLeadArchive = input.recentSeriesRows
    .slice(0, RECENT_SERIES_SCAN_LIMIT)
    .map(series => {
      const leads = input.recentCharacterRows
        .filter(row => row.seriesId === series.id && isLeadRole(row.role))
        .map(row => projectCharacter(row))
        .filter(row => row.designDna || row.visualSummary)
        .slice(0, LEADS_PER_SERIES_LIMIT);
      return {
        seriesId: series.id,
        title: series.title,
        genre: series.genre,
        tone: series.tone,
        leads,
      };
    })
    .filter(series => series.leads.length > 0)
    .slice(0, RECENT_SERIES_RETAIN_LIMIT);

  return verticalDramaCharacterDesignContextSchema.parse({
    seriesDna: buildSeriesDna(input.series),
    archiveStatus: input.archiveStatus ?? "available",
    currentCast,
    recentLeadArchive,
    approvedDesignDna: extractCharacterDesignDna(input.target.data),
  });
}

/**
 * Loads bounded comparison evidence for one already-authorized character.
 * Every query repeats tenant + user ownership even though the caller has
 * already loaded the target row; this keeps historical lead evidence from
 * crossing account boundaries if the service is reused elsewhere.
 */
export async function loadCharacterDesignContext(
  owner: CharacterDesignContextOwner,
  series: SeriesContextRow,
  target: CharacterContextRow
): Promise<VerticalDramaCharacterDesignContext> {
  const currentCastRows = await db
    .select()
    .from(verticalDramaCharacters)
    .where(
      and(
        eq(verticalDramaCharacters.tenantId, owner.tenantId),
        eq(verticalDramaCharacters.userId, owner.userId),
        eq(verticalDramaCharacters.seriesId, series.id)
      )
    )
    .orderBy(desc(verticalDramaCharacters.updatedAt))
    .limit(CURRENT_CAST_LIMIT * 2);

  let archiveStatus: "available" | "unavailable" = "available";
  let recentSeriesRows: SeriesContextRow[] = [];
  let recentCharacterRows: CharacterContextRow[] = [];
  try {
    recentSeriesRows = (await db
      .select()
      .from(verticalDramaSeries)
      .where(
        and(
          eq(verticalDramaSeries.tenantId, owner.tenantId),
          eq(verticalDramaSeries.userId, owner.userId),
          ne(verticalDramaSeries.id, series.id)
        )
      )
      .orderBy(desc(verticalDramaSeries.updatedAt))
      .limit(RECENT_SERIES_SCAN_LIMIT)) as SeriesContextRow[];

    const recentSeriesIds = recentSeriesRows.map(row => row.id);
    recentCharacterRows =
      recentSeriesIds.length === 0
        ? []
        : ((await db
            .select()
            .from(verticalDramaCharacters)
            .where(
              and(
                eq(verticalDramaCharacters.tenantId, owner.tenantId),
                eq(verticalDramaCharacters.userId, owner.userId),
                inArray(verticalDramaCharacters.seriesId, recentSeriesIds)
              )
            )
            .orderBy(desc(verticalDramaCharacters.updatedAt))
            .limit(
              RECENT_SERIES_SCAN_LIMIT * CURRENT_CAST_LIMIT
            )) as CharacterContextRow[]);
  } catch (error) {
    archiveStatus = "unavailable";
    recentSeriesRows = [];
    recentCharacterRows = [];
    debugError(
      "verticalDramaCharacterDesignContext",
      `Recent Character DNA archive unavailable for series ${series.id}; continuing with the owned current cast only`,
      error
    );
  }

  return buildCharacterDesignContextFromRows({
    series,
    target,
    currentCastRows,
    recentSeriesRows,
    recentCharacterRows,
    archiveStatus,
  });
}
