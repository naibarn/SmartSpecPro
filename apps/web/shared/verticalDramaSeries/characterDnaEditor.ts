import { z } from "zod";
import {
  verticalDramaCharacterDesignDnaSchema,
  type VerticalDramaCharacterDesignDna,
} from "./characterProfile";

const editableDnaText = z.string().trim().min(1).max(1_000);

export const verticalDramaCharacterIdentityDnaEditSchema = z
  .object({
    ageRange: z.string().trim().min(1).max(255),
    faceIdentity: z.object({
      facialGeometry: editableDnaText,
      eyesAndGaze: editableDnaText,
      brows: editableDnaText,
      nose: editableDnaText,
      lipsAndSmile: editableDnaText,
      skinAndTexture: editableDnaText,
      hair: editableDnaText,
      distinctiveAsymmetry: editableDnaText,
    }),
  })
  .strict();

export type VerticalDramaCharacterIdentityDnaEdit = z.infer<
  typeof verticalDramaCharacterIdentityDnaEditSchema
>;

export type VerticalDramaCharacterIdentityDnaMetadata = {
  identityDnaRevision?: number;
  identityDnaSource?: "ai_generated" | "user_edited";
  identityDnaUpdatedAt?: string;
  promptDnaRevision?: number;
};

export type CharacterIdentityDnaMergeResult = {
  data: Record<string, unknown>;
  revision: number;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function readCharacterIdentityDnaRevision(
  visualBible: unknown
): number {
  const revision = asRecord(visualBible)?.identityDnaRevision;
  return typeof revision === "number" && Number.isInteger(revision) && revision > 0
    ? revision
    : 1;
}

export function readCharacterIdentityDna(
  data: unknown
): VerticalDramaCharacterDesignDna | undefined {
  const visualBible = asRecord(asRecord(data)?.visualBible);
  const parsed = verticalDramaCharacterDesignDnaSchema.safeParse(
    visualBible?.designDna
  );
  return parsed.success ? parsed.data : undefined;
}

export function readCharacterVisualBibleAgeRange(
  data: unknown
): string | undefined {
  const visualBible = asRecord(asRecord(data)?.visualBible);
  const ageRange = visualBible?.ageRange;
  return typeof ageRange === "string" && ageRange.trim()
    ? ageRange.trim()
    : undefined;
}

export function mergeCharacterIdentityDnaData(params: {
  data: Record<string, unknown>;
  edit: VerticalDramaCharacterIdentityDnaEdit;
  now: string;
}): CharacterIdentityDnaMergeResult {
  const edit = verticalDramaCharacterIdentityDnaEditSchema.parse(params.edit);
  const visualBible = asRecord(params.data.visualBible);
  const existingDna = readCharacterIdentityDna(params.data);
  if (!visualBible || !existingDna) {
    throw new Error("Character DNA is required before editing identity DNA");
  }

  const rawDna = asRecord(visualBible.designDna) ?? {};
  const rawFaceIdentity = asRecord(rawDna.faceIdentity) ?? {};
  const revision = readCharacterIdentityDnaRevision(visualBible) + 1;
  const nextDna = {
    ...rawDna,
    ageRange: edit.ageRange,
    faceIdentity: {
      ...rawFaceIdentity,
      ...edit.faceIdentity,
    },
  };
  const nextVisualBible: Record<string, unknown> = {
    ...visualBible,
    ageRange: edit.ageRange,
    designDna: nextDna,
    identityDnaRevision: revision,
    identityDnaSource: "user_edited",
    identityDnaUpdatedAt: params.now,
  };

  return {
    data: {
      ...params.data,
      visualBible: nextVisualBible,
    },
    revision,
  };
}

export function isCharacterIdentityDnaStale(visualBible: unknown): boolean {
  const record = asRecord(visualBible);
  const current = readCharacterIdentityDnaRevision(record);
  const prompt = record?.promptDnaRevision;
  return typeof prompt !== "number" || prompt !== current;
}
