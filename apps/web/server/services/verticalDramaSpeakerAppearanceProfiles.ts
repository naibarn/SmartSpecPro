/** Episode-scoped visual appearance observations for roster character matching. */
import { createHash, randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { parseSkillFile } from "@smartspec/skills";
import type { VerticalDramaStartFramePlan } from "@shared/verticalDramaSeries/contracts";
import {
  calculateCreditsForLLMDynamic,
  deductCredits,
  hasEnoughCredits,
} from "./creditService";
import { getSkillRunCreditCost } from "./skillRevenueBilling";
import {
  resolveSkillDirCandidates,
  resolveSkillManifestPath,
} from "./skillFiles";
import { executeVisionAwareJsonCallWithRetry } from "./verticalDramaStoryBible";
import { resolveQualityLargeContextModelId } from "./verticalDramaImproveScript";
import { resolveVerticalDramaSeriesModel } from "./verticalDramaLlmModelPolicy";

const SKILL_FOLDER_PATH = path.join(
  "skills",
  "vertical-drama-episode-character-appearance-profile"
);
const MAX_IMAGES_PER_PROFILE_CALL = 6;

type JsonRecord = Record<string, unknown>;

function asJsonRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function firstText(record: JsonRecord, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function normalizeConfidence(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(
      0,
      Math.min(1, value > 1 && value <= 100 ? value / 100 : value)
    );
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace("%", ""));
    if (Number.isFinite(parsed)) {
      const fraction = value.includes("%") || parsed > 1 ? parsed / 100 : parsed;
      return Math.max(0, Math.min(1, fraction));
    }
  }
  // Confidence is only used to order examples, not to decide identity. Keep
  // qualitative/missing model scores neutral instead of rejecting the frame.
  return 0.5;
}

function normalizeFrameEntries(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asJsonRecord(value);
  return record
    ? Object.entries(record).map(([shotNumber, frame]) => ({
        ...(asJsonRecord(frame) ?? {}),
        shot_number: asJsonRecord(frame)?.shot_number ?? shotNumber,
      }))
    : [];
}

function normalizeCharacterEntries(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asJsonRecord(value);
  if (!record) return [];
  if (
    [
      "character_key",
      "characterKey",
      "character_name",
      "characterName",
      "key",
      "id",
    ].some(key => key in record)
  ) {
    return [record];
  }
  return Object.entries(record).map(([key, character]) =>
    typeof character === "string"
      ? { character_key: key, appearance: character }
      : {
          ...(asJsonRecord(character) ?? {}),
          character_key:
            asJsonRecord(character)?.character_key ??
            asJsonRecord(character)?.characterKey ??
            key,
        }
  );
}

function normalizeProfileEntries(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asJsonRecord(value);
  if (!record) return [];
  return Object.entries(record).map(([characterKey, profile]) =>
    typeof profile === "string"
      ? { character_key: characterKey, general_appearance: profile }
      : {
          ...(asJsonRecord(profile) ?? {}),
          character_key:
            asJsonRecord(profile)?.character_key ??
            asJsonRecord(profile)?.characterKey ??
            characterKey,
        }
  );
}

/**
 * Vision models sometimes express the same observations with nearby field
 * names (e.g. `description`/`position`, or a character-keyed object). Normalize
 * those equivalent shapes before strict validation; identity still has to
 * resolve to one of this frame's supplied character keys below.
 */
export function normalizeVerticalDramaEpisodeAppearanceProfileOutput(
  value: unknown
): unknown {
  const root = asJsonRecord(value);
  if (!root) return value;
  const frames = normalizeFrameEntries(
    root.frames ?? root.shots ?? root.frame_appearances ?? root.frameAppearances
  ).map(rawFrame => {
    const frame = asJsonRecord(rawFrame) ?? {};
    const rawShotNumber =
      frame.shot_number ??
      frame.shotNumber ??
      frame.frame_number ??
      frame.frameNumber;
    const rawCharacters =
      frame.characters ??
      frame.character_appearances ??
      frame.characterAppearances ??
      frame.people;
    const characters = normalizeCharacterEntries(rawCharacters).map(
      rawCharacter => {
        const character = asJsonRecord(rawCharacter) ?? {};
        const appearance = firstText(character, [
          "appearance",
          "description",
          "visual_description",
          "visualDescription",
          "general_appearance",
          "generalAppearance",
          "summary",
        ]);
        const position = firstText(character, [
          "position",
          "screen_position",
          "screenPosition",
        ]);
        const combinedAppearance =
          position &&
          !appearance.toLocaleLowerCase().includes(position.toLocaleLowerCase())
            ? `${appearance}${appearance ? "; " : ""}position: ${position}`
            : appearance;
        const rawVisible =
          character.visible ??
          character.is_visible ??
          character.isVisible ??
          character.in_frame;
        const visible =
          typeof rawVisible === "boolean"
            ? rawVisible
            : Boolean(appearance);
        return {
          character_key: firstText(character, [
            "character_key",
            "characterKey",
            "key",
            "id",
            "character_name",
            "characterName",
          ]),
          visible,
          appearance: combinedAppearance.slice(0, 600),
          confidence: normalizeConfidence(character.confidence),
        };
      }
    );
    const shotNumber = Number(rawShotNumber);
    return {
      shot_number: Number.isInteger(shotNumber) ? shotNumber : rawShotNumber,
      characters,
    };
  });
  const profiles = normalizeProfileEntries(
    root.profiles ??
      root.episode_cues ??
      root.episodeCues ??
      root.character_profiles ??
      root.characterProfiles
  ).flatMap(rawProfile => {
    const profile = asJsonRecord(rawProfile);
    if (!profile) return [];
    const characterKey = firstText(profile, [
      "character_key",
      "characterKey",
      "key",
      "id",
      "character_name",
      "characterName",
    ]);
    if (!characterKey) return [];
    return [
      {
        character_key: characterKey,
        general_appearance: firstText(profile, [
          "general_appearance",
          "generalAppearance",
          "appearance",
          "description",
          "summary",
        ]).slice(0, 800),
      },
    ];
  });

  return { frames, profiles };
}

export const verticalDramaEpisodeAppearanceProfileOutputSchema = z.preprocess(
  normalizeVerticalDramaEpisodeAppearanceProfileOutput,
  z
    .object({
      frames: z
        .array(
          z
            .object({
              shot_number: z.number().int().positive(),
              characters: z
                .array(
                  z.object({
                    character_key: z.string().trim().min(1).max(64),
                    visible: z.boolean(),
                    appearance: z.string().trim().max(600).default(""),
                    confidence: z.number().min(0).max(1),
                  }).strict()
                )
                .max(12),
            })
            .strict()
        )
        .max(MAX_IMAGES_PER_PROFILE_CALL),
      profiles: z
        .array(
          z.object({
            character_key: z.string().trim().min(1).max(64),
            general_appearance: z.string().trim().max(800),
          }).strict()
        )
        .max(48),
    })
    .strict()
);

export interface VerticalDramaEpisodeAppearanceFrameInput {
  shotNumber: number;
  sourceMediaAssetId: string;
  imageUrl: string;
  characters: Array<{
    characterKey: string;
    characterName: string;
    visualIdentityNotes?: string;
  }>;
}

type StoredAppearanceProfile = NonNullable<
  VerticalDramaStartFramePlan["speakerAppearanceProfiles"]
>["profiles"][number];

function loadSkillSystemPrompt(): string {
  for (const dir of resolveSkillDirCandidates(SKILL_FOLDER_PATH)) {
    const manifestPath = resolveSkillManifestPath(dir);
    if (!manifestPath || !fs.existsSync(manifestPath)) continue;
    const { content } = parseSkillFile(fs.readFileSync(manifestPath, "utf8"));
    if (content?.trim()) return content;
  }
  throw new Error(
    'Could not locate skill.md for "vertical-drama-episode-character-appearance-profile"'
  );
}

async function chargeableUsage(
  usageByModel: Map<string, { promptTokens: number; completionTokens: number }>
): Promise<number> {
  let amount = 0;
  for (const [model, usage] of usageByModel) {
    amount += await calculateCreditsForLLMDynamic(
      usage.promptTokens,
      usage.completionTokens,
      model
    );
  }
  return amount;
}

function normalizeAppearanceText(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[.,;:!?]/g, "")
    .replace(/\s+/g, " ");
}

export function createVerticalDramaSpeakerAppearanceFingerprint(params: {
  frames: Array<{
    shotNumber: number;
    sourceMediaAssetId?: string | null;
    characterKeys: string[];
  }>;
  characters: Array<{
    id: number;
    characterKey: string;
    name: string;
    visualIdentityNotes?: string;
    updatedAt?: string | null;
  }>;
}): string {
  const stablePayload = {
    version: 1,
    frames: params.frames
      .map(frame => ({
        shotNumber: frame.shotNumber,
        sourceMediaAssetId: frame.sourceMediaAssetId ?? null,
        characterKeys: [...new Set(frame.characterKeys)].sort(),
      }))
      .sort((a, b) => a.shotNumber - b.shotNumber),
    characters: params.characters
      .map(character => ({
        id: character.id,
        characterKey: character.characterKey,
        name: character.name,
        visualIdentityNotes: character.visualIdentityNotes ?? "",
        updatedAt: character.updatedAt ?? null,
      }))
      .sort((a, b) => a.characterKey.localeCompare(b.characterKey)),
  };
  return createHash("sha256")
    .update(JSON.stringify(stablePayload))
    .digest("hex");
}

export async function analyzeVerticalDramaEpisodeAppearanceProfiles(params: {
  userId: number;
  tenantId: string;
  seriesId: number;
  episodeId: number;
  fingerprint: string;
  frames: VerticalDramaEpisodeAppearanceFrameInput[];
  publicUrl?: string | null;
  idempotencyRunId?: string;
}): Promise<{
  complete: boolean;
  profiles: StoredAppearanceProfile[];
  analyzedShotNumbers: number[];
  creditsUsed: number;
  model: string;
  issue?:
    | "insufficient_credits"
    | "provider_error"
    | "vision_unavailable"
    | "incomplete_result";
}> {
  if (params.frames.length === 0) {
    return {
      complete: false,
      profiles: [],
      analyzedShotNumbers: [],
      creditsUsed: 0,
      model: "",
      issue: "incomplete_result",
    };
  }

  const model = await resolveVerticalDramaSeriesModel(
    params.seriesId,
    resolveQualityLargeContextModelId
  );
  const profilesByKey = new Map<
    string,
    {
      characterName: string;
      summaries: string[];
      examples: StoredAppearanceProfile["examples"];
    }
  >();
  const analyzedShots = new Set<number>();
  let creditsUsed = 0;
  const runId = params.idempotencyRunId?.trim() || randomUUID();
  const skillCreditCost = await getSkillRunCreditCost({
    skillSlug: "vertical-drama-speaker-visual-attribution",
    tenantId: params.tenantId,
  });

  for (
    let offset = 0;
    offset < params.frames.length;
    offset += MAX_IMAGES_PER_PROFILE_CALL
  ) {
    const batch = params.frames.slice(
      offset,
      offset + MAX_IMAGES_PER_PROFILE_CALL
    );
    if (!(await hasEnoughCredits(params.userId, skillCreditCost))) {
      return {
        complete: false,
        profiles: [],
        analyzedShotNumbers: Array.from(analyzedShots).sort((a, b) => a - b),
        creditsUsed,
        model,
        issue: "insufficient_credits",
      };
    }

    const usageByModel = new Map<
      string,
      { promptTokens: number; completionTokens: number }
    >();
    const images = batch.map(frame => ({
      url: frame.imageUrl,
      label: `APPROVED START FRAME FOR SHOT ${frame.shotNumber}:`,
    }));
    let outcome: Awaited<
      ReturnType<
        typeof executeVisionAwareJsonCallWithRetry<
          z.infer<typeof verticalDramaEpisodeAppearanceProfileOutputSchema>
        >
      >
    >;
    try {
      outcome = await executeVisionAwareJsonCallWithRetry<
        z.infer<typeof verticalDramaEpisodeAppearanceProfileOutputSchema>
      >({
        model,
        systemPrompt: loadSkillSystemPrompt(),
        userPromptText: JSON.stringify({
          task: "For each supplied shot, describe the visible appearance of each expected on-screen character, then summarize recurring episode-wide appearance cues for those same character keys.",
          frames: batch.map(frame => ({
            shot_number: frame.shotNumber,
            image_label: `APPROVED START FRAME FOR SHOT ${frame.shotNumber}`,
            expected_characters: frame.characters.map(character => ({
              character_key: character.characterKey,
              character_name: character.characterName,
              visual_identity_notes: character.visualIdentityNotes ?? "",
            })),
          })),
          output_rules: [
            "Return one frames entry for every supplied shot number, even if nobody can be identified.",
            "For each visible expected character, describe only visible cues; mention outfit color/style and viewer-relative position when clear.",
            "Do not match a person just because a character is named in expected_characters; compare visible features with visual_identity_notes and the other supplied images.",
            "Use the exact character_key from expected_characters. Do not invent or translate keys.",
            "General appearance should summarize stable face, hair, age presentation, build, and repeated outfit cues. Mention outfit variation when observations disagree.",
            "Return exactly `frames` and `profiles` at the top level. Each frame has integer `shot_number` and a `characters` array; each character has exact `character_key`, boolean `visible`, string `appearance`, and numeric `confidence` from 0 to 1. `profiles` is always an array and may be empty.",
            "A still image cannot establish who is actively speaking. Do not infer speech activity.",
          ],
        }),
        hasVision: true,
        images,
        userId: params.userId,
        tenantId: params.tenantId,
        publicUrl: params.publicUrl,
        schema: verticalDramaEpisodeAppearanceProfileOutputSchema,
        firstAttemptMaxTokens: 2200,
        retryMaxTokens: 3400,
        maxSchemaRetries: 1,
        disableModelFallback: false,
        modelFallbackPolicy: "recommended",
        verticalDramaContext: {
          seriesId: params.seriesId,
          episodeId: params.episodeId,
          taskClass: "visual_bible",
        },
        onUsage: (response, requestedModel) => {
          const usedModel = response.model?.trim() || requestedModel;
          const usage = usageByModel.get(usedModel) ?? {
            promptTokens: 0,
            completionTokens: 0,
          };
          usage.promptTokens += response.usage?.prompt_tokens ?? 0;
          usage.completionTokens += response.usage?.completion_tokens ?? 0;
          usageByModel.set(usedModel, usage);
        },
      });
    } catch {
      const amount = await chargeableUsage(usageByModel);
      if (usageByModel.size) {
        const billing = await deductCredits({
          userId: params.userId,
          tenantId: params.tenantId,
          amount,
          contextRef: {
            contextType: "series",
            sourceType: "vertical_drama_series",
            sourceId: String(params.seriesId),
          },
          description: "Vertical Drama — analyze episode character appearances",
          skillSlug: "vertical-drama-speaker-visual-attribution",
          sourceType: "skill",
          idempotencyKey: `vd-speaker-profile:${params.episodeId}:${params.fingerprint}:${offset}:${runId}`,
          metadata: {
            model,
            llmModel: model,
            feature: "vertical_drama_series",
            seriesId: params.seriesId,
            episodeId: params.episodeId,
            profileBatchStart: offset,
          },
        });
        creditsUsed += billing.creditsUsed;
      }
      return {
        complete: false,
        profiles: [],
        analyzedShotNumbers: Array.from(analyzedShots).sort((a, b) => a - b),
        creditsUsed,
        model,
        issue: "provider_error",
      };
    }

    const amount = await chargeableUsage(usageByModel);
    if (usageByModel.size) {
      const billing = await deductCredits({
        userId: params.userId,
        tenantId: params.tenantId,
        amount,
        contextRef: {
          contextType: "series",
          sourceType: "vertical_drama_series",
          sourceId: String(params.seriesId),
        },
        description: "Vertical Drama — analyze episode character appearances",
        skillSlug: "vertical-drama-speaker-visual-attribution",
        sourceType: "skill",
        idempotencyKey: `vd-speaker-profile:${params.episodeId}:${params.fingerprint}:${offset}:${runId}`,
        metadata: {
          model,
          llmModel: model,
          feature: "vertical_drama_series",
          seriesId: params.seriesId,
          episodeId: params.episodeId,
          profileBatchStart: offset,
          usageByModel: Array.from(usageByModel, ([usedModel, usage]) => ({
            model: usedModel,
            ...usage,
          })),
        },
      });
      creditsUsed += billing.creditsUsed;
    }
    if (!outcome.usedVision) {
      return {
        complete: false,
        profiles: [],
        analyzedShotNumbers: Array.from(analyzedShots).sort((a, b) => a - b),
        creditsUsed,
        model,
        issue: "vision_unavailable",
      };
    }

    const framesByShot = new Map(
      outcome.data.frames.map(frame => [frame.shot_number, frame])
    );
    if (batch.some(frame => !framesByShot.has(frame.shotNumber))) {
      return {
        complete: false,
        profiles: [],
        analyzedShotNumbers: Array.from(analyzedShots).sort((a, b) => a - b),
        creditsUsed,
        model,
        issue: "incomplete_result",
      };
    }
    for (const frame of batch) {
      const result = framesByShot.get(frame.shotNumber)!;
      analyzedShots.add(frame.shotNumber);
      const resolveAllowedCharacter = (modelKey: string) => {
        const normalizedKey = modelKey.trim().toLocaleLowerCase();
        const matches = frame.characters.filter(character =>
          [character.characterKey, character.characterName].some(
            value => value.trim().toLocaleLowerCase() === normalizedKey
          )
        );
        return matches.length === 1 ? matches[0] : undefined;
      };
      for (const observed of result.characters) {
        const character = resolveAllowedCharacter(observed.character_key);
        if (!character || !observed.visible || !observed.appearance) continue;
        const profile = profilesByKey.get(character.characterKey) ?? {
          characterName: character.characterName,
          summaries: [],
          examples: [],
        };
        profile.examples.push({
          shotNumber: frame.shotNumber,
          appearance: observed.appearance.slice(0, 360),
          confidence: observed.confidence,
        });
        profilesByKey.set(character.characterKey, profile);
      }
    }
    const expectedCharacters = Array.from(
      new Map(
        batch
          .flatMap(frame => frame.characters)
          .map(character => [character.characterKey, character])
      ).values()
    );
    for (const summary of outcome.data.profiles) {
      const normalizedKey = summary.character_key.trim().toLocaleLowerCase();
      const matches = expectedCharacters.filter(character =>
        [character.characterKey, character.characterName].some(
          value => value.trim().toLocaleLowerCase() === normalizedKey
        )
      );
      if (matches.length !== 1) continue;
      const profile = profilesByKey.get(matches[0].characterKey);
      if (profile && summary.general_appearance)
        profile.summaries.push(summary.general_appearance);
    }
  }

  const profiles: StoredAppearanceProfile[] = Array.from(
    profilesByKey,
    ([characterKey, profile]) => {
      const examples = profile.examples
        .sort(
          (a, b) => b.confidence - a.confidence || a.shotNumber - b.shotNumber
        )
        .filter(
          (example, index, all) =>
            all.findIndex(
              other =>
                normalizeAppearanceText(other.appearance) ===
                normalizeAppearanceText(example.appearance)
            ) === index
        )
        .slice(0, 8)
        .sort((a, b) => a.shotNumber - b.shotNumber);
      const summarySet = Array.from(
        new Set(profile.summaries.map(value => value.trim()).filter(Boolean))
      );
      const generalAppearance = (
        summarySet.length > 0
          ? summarySet.join("; ")
          : examples.map(example => example.appearance).join("; ")
      ).slice(0, 1_200);
      return {
        characterKey,
        characterName: profile.characterName,
        generalAppearance,
        examples,
      };
    }
  ).filter(profile => profile.examples.length > 0);

  return {
    complete: analyzedShots.size === params.frames.length,
    profiles,
    analyzedShotNumbers: Array.from(analyzedShots).sort((a, b) => a - b),
    creditsUsed,
    model,
    ...(analyzedShots.size !== params.frames.length
      ? { issue: "incomplete_result" as const }
      : {}),
  };
}
