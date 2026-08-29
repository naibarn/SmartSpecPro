/**
 * Repair legacy Vertical Drama character-look rows that copied story prose
 * into visual fields.
 *
 * Usage:
 *   npx tsx server/scripts/backfill-vertical-drama-character-looks.ts --series-id 53
 *   npx tsx server/scripts/backfill-vertical-drama-character-looks.ts --series-id 53 --apply
 *
 * Dry-run is the default. Apply mode calls the real
 * vertical-drama-character-look-designer skill and is deliberately limited to
 * unedited system-generated rows with unambiguous episode evidence. An
 * explicit per-row repair may also repair a pre-provenance variant using a
 * sentinel legacy source; it never invents a storyboard reference.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  verticalDramaCharacters,
  verticalDramaEpisodes,
} from "../../drizzle/schema";
import {
  designVerticalDramaCharacterLooks,
  VERTICAL_DRAMA_CHARACTER_LOOK_DESIGN_CONTRACT_VERSION,
  VERTICAL_DRAMA_CHARACTER_LOOK_DESIGNER_SKILL_SLUG,
  stableCharacterLookDesignFingerprint,
} from "../services/verticalDramaCharacterLookDesigner";
import {
  normalizeVerticalDramaCharacterLookImageBrief,
  getVerticalDramaCharacterLookSemanticKey,
  type VerticalDramaCharacterAgeStage,
  type VerticalDramaCharacterLookSuggestion,
  looksLikeCharacterLookStoryLeak,
} from "@shared/verticalDramaSeries/characterLookSelection";

type BackfillMode = "dry-run" | "apply";
type JsonObject = Record<string, unknown>;

type BackfillCandidate = {
  row: CharacterRow;
  data: JsonObject;
  parent: CharacterRow;
  episode: EpisodeRow;
  sourceShotNumbers: number[];
  canonicalIntent: string;
  variantType: "outfit" | "age_stage";
  ageStage?: VerticalDramaCharacterAgeStage;
  legacyVisualOnly: boolean;
  requestKey: string;
  evidence: VerticalDramaCharacterLookSuggestion["evidence"];
};

type CharacterRow = {
  id: number;
  tenantId: string;
  userId: number;
  seriesId: number;
  characterKey: string;
  name: string;
  role: string | null;
  occupation: string | null;
  roleVisualIntent: unknown;
  parentCharacterId: number | null;
  variantLabel: string | null;
  variantType: string | null;
  data: unknown;
};

type EpisodeRow = {
  id: number;
  tenantId: string;
  userId: number;
  seriesId: number;
  episodeNumber: number;
  storyboard: unknown;
};

type BackfillStats = {
  scanned: number;
  eligible: number;
  applied: number;
  reviewed: number;
  skipped: Array<{ rowId: number; characterKey: string; reason: string }>;
  errors: Array<{ rowId: number; characterKey: string; message: string }>;
};

const AGE_STAGES: readonly VerticalDramaCharacterAgeStage[] = [
  "infant",
  "early_childhood",
  "school_age",
  "university_student",
  "adult",
  "older_adult",
];

function objectValue(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function hasUserEdit(data: JsonObject): boolean {
  const provenance = objectValue(data.provenance);
  return Boolean(
    data.userEditedAt ||
    provenance.userEditedAt ||
    data.manualApproved === true ||
    provenance.manualApproved === true
  );
}

function isContaminated(data: JsonObject): boolean {
  const description =
    typeof data.description === "string" ? data.description : "";
  const wardrobeRules = Array.isArray(data.wardrobeRules)
    ? data.wardrobeRules.filter(value => typeof value === "string").join(" ")
    : "";
  const imageBrief =
    typeof data.lookImageBrief === "string" ? data.lookImageBrief : "";
  return (
    data.lookDesignContractVersion !==
      VERTICAL_DRAMA_CHARACTER_LOOK_DESIGN_CONTRACT_VERSION ||
    !data.lookDesign ||
    looksLikeCharacterLookStoryLeak(description) ||
    looksLikeCharacterLookStoryLeak(wardrobeRules) ||
    looksLikeCharacterLookStoryLeak(imageBrief)
  );
}

function positiveShotNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.filter(
        (item): item is number =>
          typeof item === "number" && Number.isInteger(item) && item > 0
      )
    )
  ).sort((a, b) => a - b);
}

function storyboardShots(episode: EpisodeRow): JsonObject[] {
  const storyboard = objectValue(episode.storyboard);
  return Array.isArray(storyboard.shots)
    ? storyboard.shots.filter(
        (shot): shot is JsonObject =>
          shot && typeof shot === "object" && !Array.isArray(shot)
      )
    : [];
}

function shotNumber(shot: JsonObject): number | undefined {
  const value = shot.shot_number ?? shot.shotNumber;
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function shotReferencesCharacter(
  shot: JsonObject,
  characterKey: string
): boolean {
  const refs = [
    shot.required_character_refs,
    shot.requiredCharacterRefs,
    shot.characters,
  ]
    .flatMap(value => (Array.isArray(value) ? value : []))
    .filter((value): value is string => typeof value === "string");
  return refs.includes(characterKey);
}

function cleanText(value: unknown, max = 700): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, max)
    : "";
}

function buildEvidence(shot: JsonObject): {
  shotNumber: number;
  text: string;
  sceneKey?: string;
  locationKey?: string;
  timeKey?: string;
} | null {
  const number = shotNumber(shot);
  if (!number) return null;
  const text = [
    cleanText(shot.action),
    cleanText(shot.visual_description ?? shot.visualDescription),
    cleanText(shot.narrative_purpose ?? shot.narrativePurpose),
  ]
    .filter(Boolean)
    .join("; ")
    .slice(0, 700);
  if (!text) return null;
  const sceneKey = cleanText(shot.scene_key ?? shot.sceneKey, 160);
  const locationKey = cleanText(shot.location_key ?? shot.location, 160);
  const timeKey = cleanText(shot.time_key ?? shot.timecode, 160);
  return {
    shotNumber: number,
    text,
    ...(sceneKey ? { sceneKey } : {}),
    ...(locationKey ? { locationKey } : {}),
    ...(timeKey ? { timeKey } : {}),
  };
}

function canonicalIntent(row: CharacterRow, data: JsonObject): string | null {
  const lookSemanticKey =
    typeof data.lookSemanticKey === "string" ? data.lookSemanticKey : "";
  const source =
    `${row.variantLabel ?? ""} ${lookSemanticKey}`.toLocaleLowerCase();
  if (/casual[_-]?home|ชุดลำลอง|อยู่บ้าน|homewear/.test(source))
    return "casual_home";
  if (/sleepwear|pajama|ชุดนอน|ใส่นอน/.test(source)) return "sleepwear";
  if (/evening|formal|gala|ชุดราตรี|ออกงาน/.test(source))
    return "evening_formal";
  if (/school|ชุดนักเรียน|นักเรียน/.test(source)) return "school_uniform";
  if (/workwear|office|ชุดทำงาน|สำนักงาน/.test(source)) return "workwear";
  return null;
}

function ageStageFromData(
  data: JsonObject
): VerticalDramaCharacterAgeStage | undefined {
  const lookDesign = objectValue(data.lookDesign);
  const value = lookDesign.age_stage;
  return AGE_STAGES.includes(value as VerticalDramaCharacterAgeStage)
    ? (value as VerticalDramaCharacterAgeStage)
    : undefined;
}

function ageStageFromLabel(
  row: CharacterRow
): VerticalDramaCharacterAgeStage | undefined {
  const value = `${row.variantLabel ?? ""}`.toLocaleLowerCase();
  if (/newborn|infant|ทารก|แรกเกิด/.test(value)) return "infant";
  if (/early_childhood|toddler|preschool|เด็กเล็ก|อนุบาล/.test(value))
    return "early_childhood";
  if (/school_age|adolescent|teenager|มัธยม|วัยรุ่น/.test(value))
    return "school_age";
  if (/university|college|นักศึกษา|มหาวิทยาลัย/.test(value))
    return "university_student";
  if (/older_adult|elderly|senior|ผู้สูง|วัยชรา/.test(value))
    return "older_adult";
  if (/adult|ผู้ใหญ่|วัยทำงาน/.test(value)) return "adult";
  return undefined;
}

function findEpisodeForRow(
  row: CharacterRow,
  data: JsonObject,
  episodes: EpisodeRow[],
  sourceShotNumbers: number[]
): { episode: EpisodeRow; shots: JsonObject[] } | null {
  const provenance = objectValue(data.provenance);
  const recordedEpisodeId = Number(
    provenance.sourceEpisodeId ?? data.sourceEpisodeId
  );
  const ranked = episodes
    .map(episode => {
      const matchingShots = storyboardShots(episode).filter(shot =>
        shotReferencesCharacter(shot, row.characterKey)
      );
      const matchingNumbers = new Set(
        matchingShots
          .map(shotNumber)
          .filter((value): value is number => value !== undefined)
      );
      const overlap = sourceShotNumbers.filter(number =>
        matchingNumbers.has(number)
      ).length;
      return { episode, matchingShots, overlap };
    })
    .filter(item => item.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || a.episode.id - b.episode.id);
  if (ranked.length === 0) return null;
  if (Number.isInteger(recordedEpisodeId) && recordedEpisodeId > 0) {
    const recorded = ranked.find(item => item.episode.id === recordedEpisodeId);
    if (recorded && recorded.overlap === sourceShotNumbers.length) {
      return { episode: recorded.episode, shots: recorded.matchingShots };
    }
  }
  const best = ranked[0];
  if (best.overlap !== sourceShotNumbers.length) return null;
  if (ranked[1] && ranked[1].overlap === best.overlap) return null;
  return { episode: best.episode, shots: best.matchingShots };
}

function repairRequest(
  candidate: BackfillCandidate
): VerticalDramaCharacterLookSuggestion {
  const description =
    typeof candidate.data.description === "string"
      ? candidate.data.description.trim()
      : undefined;
  const wardrobeRules = Array.isArray(candidate.data.wardrobeRules)
    ? candidate.data.wardrobeRules.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0
      )
    : undefined;
  const lookImageBrief =
    typeof candidate.data.lookImageBrief === "string"
      ? candidate.data.lookImageBrief.trim()
      : undefined;
  return {
    baseCharacterKey: candidate.parent.characterKey,
    parentCharacterKey: candidate.parent.characterKey,
    variantLabel: candidate.row.variantLabel ?? candidate.canonicalIntent,
    variantType: candidate.variantType,
    ...(candidate.ageStage ? { ageStage: candidate.ageStage } : {}),
    canonicalIntent: candidate.canonicalIntent,
    requestKey: candidate.requestKey,
    evidence: candidate.evidence,
    sourceShotNumbers: candidate.sourceShotNumbers,
    ...(candidate.legacyVisualOnly ? { legacyVisualOnly: true } : {}),
    legacyVisualContext: {
      variantLabel: candidate.row.variantLabel ?? candidate.canonicalIntent,
      ...(description ? { description } : {}),
      ...(wardrobeRules?.length ? { wardrobeRules } : {}),
      ...(lookImageBrief ? { lookImageBrief } : {}),
    },
  };
}

function beforeDerivedFields(data: JsonObject): JsonObject {
  return Object.fromEntries(
    [
      "description",
      "wardrobeRules",
      "lookImageBrief",
      "lookDesign",
      "lookDesignContractVersion",
    ]
      .filter(key => Object.prototype.hasOwnProperty.call(data, key))
      .map(key => [key, data[key]])
  );
}

function clearedForRepair(
  data: JsonObject,
  candidate: BackfillCandidate
): JsonObject {
  const next = { ...data };
  const provenance = objectValue(data.provenance);
  const priorRepair = objectValue(provenance.repair);
  const priorBeforeFields = objectValue(priorRepair.beforeDerivedFields);
  const capturedBeforeFields =
    Object.keys(priorBeforeFields).length > 0
      ? priorBeforeFields
      : beforeDerivedFields(data);
  delete next.description;
  delete next.wardrobeRules;
  delete next.lookImageBrief;
  delete next.lookDesign;
  delete next.lookDesignContractVersion;
  return {
    ...next,
    lookDesignStatus: "waiting_for_look_design",
    provenance: {
      ...provenance,
      repair: {
        ...priorRepair,
        source: VERTICAL_DRAMA_CHARACTER_LOOK_DESIGNER_SKILL_SLUG,
        beforeDataHash: stableCharacterLookDesignFingerprint(data),
        beforeDerivedFields: capturedBeforeFields,
        ...(candidate.legacyVisualOnly
          ? { legacyVisualOnly: true }
          : {
              sourceEpisodeId: candidate.episode.id,
              sourceShotNumbers: candidate.sourceShotNumbers,
            }),
        requestKey: candidate.requestKey,
        detectedAt:
          typeof priorRepair.detectedAt === "string"
            ? priorRepair.detectedAt
            : new Date().toISOString(),
      },
    },
  };
}

async function updateRow(data: JsonObject, row: CharacterRow): Promise<void> {
  const db = getDb();
  await db
    .update(verticalDramaCharacters)
    .set({ data, updatedAt: new Date() })
    .where(
      and(
        eq(verticalDramaCharacters.id, row.id),
        eq(verticalDramaCharacters.tenantId, row.tenantId),
        eq(verticalDramaCharacters.userId, row.userId),
        eq(verticalDramaCharacters.seriesId, row.seriesId)
      )
    );
  row.data = data;
}

function buildCharacterFacts(parent: CharacterRow, familyRows: CharacterRow[]) {
  const parentData = objectValue(parent.data);
  const visualBible = objectValue(parentData.visualBible);
  const designDna = objectValue(visualBible.designDna);
  const ageAnchor =
    typeof visualBible.ageRange === "string"
      ? visualBible.ageRange
      : typeof designDna.ageRange === "string"
        ? designDna.ageRange
        : "unknown";
  return {
    characterKey: parent.characterKey,
    name: parent.name,
    role: parent.role,
    occupation: parent.occupation ?? parent.role,
    apparentAgeAnchor: ageAnchor,
    identityFacts: [
      `name=${parent.name}`,
      `role=${parent.role ?? "unknown"}`,
      `occupation=${parent.occupation ?? "unknown"}`,
      `stored_identity_description=${typeof parentData.description === "string" ? parentData.description : "unknown"}`,
      `apparent_age_anchor=${ageAnchor}; outfit variants must preserve this apparent age and must not turn a school-age child into an infant or an adult`,
      `role_visual_intent=${typeof parent.roleVisualIntent === "string" ? parent.roleVisualIntent : JSON.stringify(parent.roleVisualIntent ?? {})}`,
    ].join("; "),
    existingLookFacts: familyRows
      .filter(row => row.id !== parent.id)
      .slice(0, 12)
      .map(row => {
        const data = objectValue(row.data);
        return [
          row.variantLabel,
          data.description,
          ...(Array.isArray(data.wardrobeRules) ? data.wardrobeRules : []),
        ]
          .filter(
            (value): value is string =>
              typeof value === "string" && value.trim().length > 0
          )
          .join("; ");
      }),
  };
}

async function discoverCandidates(
  options: {
    seriesId?: number;
    tenantId?: string;
    userId?: number;
    rowIds?: Set<number>;
    forceRowIds?: Set<number>;
    limit: number;
  },
  stats: BackfillStats
): Promise<{
  candidates: BackfillCandidate[];
  rows: CharacterRow[];
  episodes: EpisodeRow[];
}> {
  const db = getDb();
  const rows = (await db
    .select({
      id: verticalDramaCharacters.id,
      tenantId: verticalDramaCharacters.tenantId,
      userId: verticalDramaCharacters.userId,
      seriesId: verticalDramaCharacters.seriesId,
      characterKey: verticalDramaCharacters.characterKey,
      name: verticalDramaCharacters.name,
      role: verticalDramaCharacters.role,
      occupation: verticalDramaCharacters.occupation,
      roleVisualIntent: verticalDramaCharacters.roleVisualIntent,
      parentCharacterId: verticalDramaCharacters.parentCharacterId,
      variantLabel: verticalDramaCharacters.variantLabel,
      variantType: verticalDramaCharacters.variantType,
      data: verticalDramaCharacters.data,
    })
    .from(verticalDramaCharacters)
    .where(
      options.seriesId
        ? and(
            eq(verticalDramaCharacters.seriesId, options.seriesId),
            ...(options.tenantId
              ? [eq(verticalDramaCharacters.tenantId, options.tenantId)]
              : []),
            ...(options.userId
              ? [eq(verticalDramaCharacters.userId, options.userId)]
              : [])
          )
        : options.tenantId && options.userId
          ? and(
              eq(verticalDramaCharacters.tenantId, options.tenantId),
              eq(verticalDramaCharacters.userId, options.userId)
            )
          : undefined
    )) as CharacterRow[];
  const episodes = (await db
    .select({
      id: verticalDramaEpisodes.id,
      tenantId: verticalDramaEpisodes.tenantId,
      userId: verticalDramaEpisodes.userId,
      seriesId: verticalDramaEpisodes.seriesId,
      episodeNumber: verticalDramaEpisodes.episodeNumber,
      storyboard: verticalDramaEpisodes.storyboard,
    })
    .from(verticalDramaEpisodes)
    .where(
      options.seriesId
        ? and(
            eq(verticalDramaEpisodes.seriesId, options.seriesId),
            ...(options.tenantId
              ? [eq(verticalDramaEpisodes.tenantId, options.tenantId)]
              : []),
            ...(options.userId
              ? [eq(verticalDramaEpisodes.userId, options.userId)]
              : [])
          )
        : options.tenantId && options.userId
          ? and(
              eq(verticalDramaEpisodes.tenantId, options.tenantId),
              eq(verticalDramaEpisodes.userId, options.userId)
            )
          : undefined
    )) as EpisodeRow[];
  const rowsById = new Map(rows.map(row => [row.id, row]));
  const candidates: BackfillCandidate[] = [];
  for (const row of rows) {
    stats.scanned += 1;
    if (options.rowIds && !options.rowIds.has(row.id)) continue;
    const data = objectValue(row.data);
    const explicitLegacyRepair =
      options.rowIds?.has(row.id) === true &&
      options.forceRowIds?.has(row.id) === true;
    const hasSystemProvenance = data.source === "system_suggested_look";
    if (!hasSystemProvenance && !explicitLegacyRepair) {
      stats.skipped.push({
        rowId: row.id,
        characterKey: row.characterKey,
        reason: "not_system_suggested_look",
      });
      continue;
    }
    if (hasUserEdit(data)) {
      stats.skipped.push({
        rowId: row.id,
        characterKey: row.characterKey,
        reason: "user_edited_or_approved",
      });
      continue;
    }
    if (!isContaminated(data) && !options.forceRowIds?.has(row.id)) continue;
    if (row.parentCharacterId == null || !rowsById.has(row.parentCharacterId)) {
      stats.skipped.push({
        rowId: row.id,
        characterKey: row.characterKey,
        reason: "missing_parent_character",
      });
      continue;
    }
    const sourceShotNumbers = positiveShotNumbers(
      data.suggestedFromShotNumbers
    );
    const legacyVisualOnly =
      explicitLegacyRepair && sourceShotNumbers.length === 0;
    if (sourceShotNumbers.length === 0 && !legacyVisualOnly) {
      stats.skipped.push({
        rowId: row.id,
        characterKey: row.characterKey,
        reason: "missing_source_shots",
      });
      continue;
    }
    const intent =
      canonicalIntent(row, data) ??
      (explicitLegacyRepair ? "legacy_visual_repair" : null);
    if (!intent) {
      stats.skipped.push({
        rowId: row.id,
        characterKey: row.characterKey,
        reason: "unknown_look_intent",
      });
      continue;
    }
    const variantType =
      row.variantType === "age_stage" ? "age_stage" : "outfit";
    const ageStage =
      variantType === "age_stage"
        ? (ageStageFromData(data) ?? ageStageFromLabel(row))
        : undefined;
    if (variantType === "age_stage" && !ageStage) {
      stats.skipped.push({
        rowId: row.id,
        characterKey: row.characterKey,
        reason: "unknown_age_stage",
      });
      continue;
    }
    const ownedEpisodes = episodes.filter(
      episode =>
        episode.seriesId === row.seriesId &&
        episode.tenantId === row.tenantId &&
        episode.userId === row.userId
    );
    const episodeMatch = legacyVisualOnly
      ? ownedEpisodes[0]
        ? { episode: ownedEpisodes[0], shots: [] }
        : null
      : findEpisodeForRow(row, data, ownedEpisodes, sourceShotNumbers);
    if (!episodeMatch) {
      stats.skipped.push({
        rowId: row.id,
        characterKey: row.characterKey,
        reason: "ambiguous_or_unresolved_episode_evidence",
      });
      continue;
    }
    const effectiveSourceShotNumbers = legacyVisualOnly
      ? [0]
      : sourceShotNumbers;
    const evidence = legacyVisualOnly
      ? [
          {
            shotNumber: 0,
            evidenceType: "legacy_visual_context" as const,
            text: "Legacy visual fields supplied for explicit repair; no storyboard evidence is available.",
          },
        ]
      : sourceShotNumbers
          .map(number =>
            episodeMatch.shots.find(shot => shotNumber(shot) === number)
          )
          .map(shot => (shot ? buildEvidence(shot) : null))
          .filter(
            (item): item is NonNullable<ReturnType<typeof buildEvidence>> =>
              Boolean(item)
          );
    if (evidence.length !== effectiveSourceShotNumbers.length) {
      stats.skipped.push({
        rowId: row.id,
        characterKey: row.characterKey,
        reason: "source_shot_text_unavailable",
      });
      continue;
    }
    const requestKey =
      typeof data.lookRequestKey === "string" && data.lookRequestKey.trim()
        ? data.lookRequestKey
        : `legacy-repair:${row.id}:${episodeMatch.episode.id}:${intent}`;
    candidates.push({
      row,
      data,
      parent: rowsById.get(row.parentCharacterId)!,
      episode: episodeMatch.episode,
      sourceShotNumbers: effectiveSourceShotNumbers,
      canonicalIntent: intent,
      variantType,
      legacyVisualOnly,
      ...(ageStage ? { ageStage } : {}),
      requestKey,
      evidence,
    });
    stats.eligible += 1;
    if (candidates.length >= options.limit) break;
  }
  return { candidates, rows, episodes };
}

export async function backfillVerticalDramaCharacterLooks(
  input: {
    mode?: BackfillMode;
    seriesId?: number;
    tenantId?: string;
    userId?: number;
    rowIds?: number[];
    force?: boolean;
    limit?: number;
  } = {}
) {
  if (process.env.VD_CHARACTER_LOOK_BACKFILL_DISABLED === "1") {
    throw new Error(
      "Vertical Drama character-look backfill is disabled by VD_CHARACTER_LOOK_BACKFILL_DISABLED"
    );
  }
  const mode = input.mode ?? "dry-run";
  const stats: BackfillStats = {
    scanned: 0,
    eligible: 0,
    applied: 0,
    reviewed: 0,
    skipped: [],
    errors: [],
  };
  const { candidates, rows } = await discoverCandidates(
    {
      seriesId: input.seriesId,
      tenantId: input.tenantId,
      userId: input.userId,
      rowIds: input.rowIds ? new Set(input.rowIds) : undefined,
      forceRowIds:
        input.force && input.rowIds ? new Set(input.rowIds) : undefined,
      limit: Math.max(1, Math.min(input.limit ?? 50, 200)),
    },
    stats
  );
  if (mode === "dry-run")
    return {
      mode,
      stats,
      candidates: candidates.map(candidate => ({
        rowId: candidate.row.id,
        characterKey: candidate.row.characterKey,
        parentCharacterKey: candidate.parent.characterKey,
        episodeId: candidate.episode.id,
        episodeNumber: candidate.episode.episodeNumber,
        sourceShotNumbers: candidate.sourceShotNumbers,
        canonicalIntent: candidate.canonicalIntent,
        variantType: candidate.variantType,
        legacyVisualOnly: candidate.legacyVisualOnly,
        ageStage: candidate.ageStage,
        requestKey: candidate.requestKey,
      })),
    };

  const groups = new Map<string, BackfillCandidate[]>();
  for (const candidate of candidates) {
    const key = `${candidate.row.tenantId}:${candidate.row.userId}:${candidate.row.seriesId}:${candidate.episode.id}`;
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const first = group[0]!;
    try {
      for (const candidate of group) {
        await updateRow(
          clearedForRepair(candidate.data, candidate),
          candidate.row
        );
      }
      const familyRows = rows.filter(row =>
        group.some(
          candidate =>
            row.id === candidate.parent.id ||
            row.parentCharacterId === candidate.parent.id
        )
      );
      const parentFacts = Array.from(
        new Map(
          group.map(candidate => [candidate.parent.id, candidate.parent])
        ).values()
      ).map(parent =>
        buildCharacterFacts(
          parent,
          familyRows.filter(
            row => row.id === parent.id || row.parentCharacterId === parent.id
          )
        )
      );
      const designResult = await designVerticalDramaCharacterLooks({
        userId: first.row.userId,
        tenantId: first.row.tenantId,
        seriesId: first.row.seriesId,
        episodeId: first.episode.id,
        episodeNumber: first.episode.episodeNumber,
        idempotencyKey: `vd-look-repair:${first.row.tenantId}:${first.row.userId}:${first.row.seriesId}:${first.episode.id}:${group
          .map(candidate => candidate.row.id)
          .sort((a, b) => a - b)
          .join(",")}`,
        seriesContext: { locale: "th" },
        characters: parentFacts,
        requests: group.map(repairRequest),
        materializedCharacterKeys: group.map(
          candidate => candidate.row.characterKey
        ),
      });
      for (const candidate of group) {
        const designed = designResult.designs.get(candidate.requestKey);
        const currentData = objectValue(candidate.row.data);
        const provenance = objectValue(currentData.provenance);
        if (!designed) {
          const repair = objectValue(provenance.repair);
          const priorFields = objectValue(repair.beforeDerivedFields);
          await updateRow(
            {
              ...currentData,
              ...priorFields,
              lookDesignStatus: designResult.reviewRequired.has(
                candidate.requestKey
              )
                ? "review"
                : "waiting_for_look_design",
              provenance: {
                ...provenance,
                repair: {
                  ...repair,
                  ...(designResult.reviewRequired.has(candidate.requestKey)
                    ? {
                        reviewedAt: new Date().toISOString(),
                        reviewReason: "llm_marked_review_required",
                      }
                    : {}),
                },
              },
            },
            candidate.row
          );
          if (designResult.reviewRequired.has(candidate.requestKey))
            stats.reviewed += 1;
          continue;
        }
        const repair = objectValue(provenance.repair);
        const nextDataBase: JsonObject = {
          ...currentData,
          description: designed.description,
          wardrobeRules: designed.wardrobeRules,
          lookImageBrief:
            normalizeVerticalDramaCharacterLookImageBrief(
              designed.imageBrief
            ) ?? designed.imageBrief,
          lookDesign: designed.lookDesign,
          lookDesignContractVersion:
            VERTICAL_DRAMA_CHARACTER_LOOK_DESIGN_CONTRACT_VERSION,
          lookDesignStatus: "ready",
          lookSemanticKey: getVerticalDramaCharacterLookSemanticKey({
            parentCharacterKey: candidate.parent.characterKey,
            canonicalIntent: candidate.canonicalIntent,
            variantType: candidate.variantType,
            requestKey: candidate.requestKey,
          }),
          lookRequestKey: candidate.requestKey,
          suggestedFromShotNumbers: candidate.legacyVisualOnly
            ? []
            : candidate.sourceShotNumbers,
          provenance: {
            ...provenance,
            createdBySkill: VERTICAL_DRAMA_CHARACTER_LOOK_DESIGNER_SKILL_SLUG,
            designVersion:
              VERTICAL_DRAMA_CHARACTER_LOOK_DESIGN_CONTRACT_VERSION,
            generatedFingerprint: stableCharacterLookDesignFingerprint(
              designed.lookDesign
            ),
            ...(candidate.legacyVisualOnly
              ? { legacyVisualOnly: true }
              : {
                  sourceEpisodeId: candidate.episode.id,
                  sourceShotNumbers: candidate.sourceShotNumbers,
                }),
            evidenceRefs: designed.evidenceRefs,
            requestKey: candidate.requestKey,
            designRun: {
              skillSlug: VERTICAL_DRAMA_CHARACTER_LOOK_DESIGNER_SKILL_SLUG,
              skillContentHash: designResult.skillContentHash,
              model: designResult.model,
              attempt: designResult.retryCount + 1,
              validation: "passed",
              materializedCharacterKey: candidate.row.characterKey,
              inputTokens: designResult.usage.inputTokens,
              outputTokens: designResult.usage.outputTokens,
              creditsUsed: designResult.creditsUsed,
            },
          },
        };
        const nextData: JsonObject = {
          ...nextDataBase,
          provenance: {
            ...objectValue(nextDataBase.provenance),
            repair: {
              ...repair,
              repairedAt: new Date().toISOString(),
              afterDataHash: stableCharacterLookDesignFingerprint(nextDataBase),
            },
          },
        };
        await updateRow(nextData, candidate.row);
        stats.applied += 1;
      }
    } catch (error) {
      for (const candidate of group) {
        const currentData = objectValue(candidate.row.data);
        const provenance = objectValue(currentData.provenance);
        const repair = objectValue(provenance.repair);
        const priorFields = objectValue(repair.beforeDerivedFields);
        await updateRow(
          {
            ...currentData,
            ...priorFields,
            lookDesignStatus: "review",
            provenance: {
              ...provenance,
              repair: {
                ...repair,
                failedAt: new Date().toISOString(),
                failureMessage:
                  error instanceof Error ? error.message : String(error),
              },
            },
          },
          candidate.row
        );
      }
      stats.errors.push({
        rowId: first.row.id,
        characterKey: first.row.characterKey,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { mode, stats };
}

function numberArgument(name: string): number | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value <= 0)
    throw new Error(`${name} requires a positive integer`);
  return value;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode: BackfillMode = process.argv.includes("--apply")
    ? "apply"
    : "dry-run";
  const seriesId = numberArgument("--series-id");
  const rowId = numberArgument("--row-id");
  const limit = numberArgument("--limit");
  backfillVerticalDramaCharacterLooks({
    mode,
    seriesId,
    rowIds: rowId ? [rowId] : undefined,
    force: process.argv.includes("--force"),
    limit,
  })
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
      if (result.stats.errors.length > 0) process.exitCode = 2;
    })
    .catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
}
