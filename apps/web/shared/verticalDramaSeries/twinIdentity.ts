import type { VerticalDramaCharacterDesignDna } from "./characterProfile";
import { readCharacterIdentityDna, readCharacterIdentityDnaRevision } from "./characterDnaEditor";

export const TWIN_SHARED_FACE_FIELDS = [
  "facialGeometry",
  "eyesAndGaze",
  "brows",
  "nose",
  "lipsAndSmile",
  "skinAndTexture",
  "distinctiveAsymmetry",
] as const;

export type TwinIdentityMetadata = {
  sourceCharacterId: string;
  sourceDnaRevision: number;
  syncedAt: string;
  sharedFields: readonly string[];
};

export type TwinIdentityRow = {
  id: number;
  sharesFaceWithCharacterId?: number | null;
  parentCharacterId?: number | null;
  data?: unknown;
};

export type TwinIdentityResolution = {
  sourceId: number;
  targetId: number;
  sourceDna: VerticalDramaCharacterDesignDna;
  targetDna: VerticalDramaCharacterDesignDna;
  sourceRevision: number;
  targetRevision: number;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function visualBibleOf(data: unknown): Record<string, unknown> | undefined {
  return asRecord(asRecord(data)?.visualBible);
}

export function readTwinIdentityMetadata(data: unknown): TwinIdentityMetadata | undefined {
  const raw = visualBibleOf(data)?.twinIdentity;
  const record = asRecord(raw);
  if (!record || typeof record.sourceCharacterId !== "string") return undefined;
  return {
    sourceCharacterId: record.sourceCharacterId,
    sourceDnaRevision:
      typeof record.sourceDnaRevision === "number" && record.sourceDnaRevision > 0
        ? record.sourceDnaRevision
        : 1,
    syncedAt: typeof record.syncedAt === "string" ? record.syncedAt : "",
    sharedFields: Array.isArray(record.sharedFields)
      ? record.sharedFields.filter((value): value is string => typeof value === "string")
      : [...TWIN_SHARED_FACE_FIELDS, "ageRange"],
  };
}

function directTwinId(row: TwinIdentityRow): number | null {
  return row.sharesFaceWithCharacterId != null ? row.sharesFaceWithCharacterId : null;
}

/** Resolve the one-way compatibility pointer as an undirected pair. */
export function resolveTwinPair(
  row: TwinIdentityRow,
  rows: readonly TwinIdentityRow[]
): { sourceId: number; targetId: number } | null {
  const direct = directTwinId(row);
  if (direct != null && rows.some(candidate => candidate.id === direct)) {
    return { sourceId: direct, targetId: row.id };
  }
  const reverse = rows
    .filter(candidate => candidate.id !== row.id && directTwinId(candidate) === row.id)
    .sort((left, right) => left.id - right.id)[0];
  return reverse ? { sourceId: row.id, targetId: reverse.id } : null;
}

function pickSharedFace(
  source: VerticalDramaCharacterDesignDna,
  target: VerticalDramaCharacterDesignDna
): VerticalDramaCharacterDesignDna["faceIdentity"] {
  const face = { ...target.faceIdentity };
  for (const field of TWIN_SHARED_FACE_FIELDS) {
    face[field] = source.faceIdentity[field];
  }
  return face;
}

/** Merge canonical face/age from source while preserving target-local styling/personality. */
export function mergeTwinDna(
  source: VerticalDramaCharacterDesignDna,
  target?: VerticalDramaCharacterDesignDna
): VerticalDramaCharacterDesignDna {
  if (!target) return structuredClone(source);
  return {
    ...target,
    ageRange: source.ageRange,
    faceIdentity: pickSharedFace(source, target),
  };
}

export function materializeTwinDnaData(params: {
  data: Record<string, unknown>;
  sourceData: Record<string, unknown>;
  sourceCharacterId: number;
  now: string;
}): { data: Record<string, unknown>; sourceRevision: number } {
  const sourceDna = readCharacterIdentityDna(params.sourceData);
  if (!sourceDna) throw new Error("Twin source Character DNA is required");
  const sourceVisualBible = visualBibleOf(params.sourceData);
  if (!sourceVisualBible) throw new Error("Twin source visual bible is required");
  const targetVisualBible = visualBibleOf(params.data);
  const targetDna = readCharacterIdentityDna(params.data);
  const targetBible = targetVisualBible ?? {
    ...sourceVisualBible,
    createdAt: params.now,
    model: "twin-synchronized",
    identityDnaRevision: 0,
    promptDnaRevision: undefined,
  };
  const nextDna = mergeTwinDna(sourceDna, targetDna);
  const sourceRevision = readCharacterIdentityDnaRevision(visualBibleOf(params.sourceData));
  const targetRevision = readCharacterIdentityDnaRevision(targetBible);
  return {
    sourceRevision,
    data: {
      ...params.data,
      visualBible: {
        ...targetBible,
        ageRange: nextDna.ageRange,
        designDna: nextDna,
        identityDnaRevision: targetRevision + 1,
        identityDnaSource: "ai_generated",
        identityDnaUpdatedAt: params.now,
        twinIdentity: {
          sourceCharacterId: String(params.sourceCharacterId),
          sourceDnaRevision: sourceRevision,
          syncedAt: params.now,
          sharedFields: ["ageRange", ...TWIN_SHARED_FACE_FIELDS],
        } satisfies TwinIdentityMetadata,
      },
    },
  };
}

export function buildEffectiveTwinDna(params: {
  sourceData: Record<string, unknown>;
  targetData: Record<string, unknown>;
  sourceCharacterId: number;
  targetCharacterId: number;
}): TwinIdentityResolution {
  const sourceDna = readCharacterIdentityDna(params.sourceData);
  const targetDna = readCharacterIdentityDna(params.targetData);
  if (!sourceDna || !targetDna) throw new Error("Twin pair Character DNA is incomplete");
  return {
    sourceId: params.sourceCharacterId,
    targetId: params.targetCharacterId,
    sourceDna,
    targetDna: mergeTwinDna(sourceDna, targetDna),
    sourceRevision: readCharacterIdentityDnaRevision(visualBibleOf(params.sourceData)),
    targetRevision: readCharacterIdentityDnaRevision(visualBibleOf(params.targetData)),
  };
}
