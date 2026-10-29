/** Vision grounded, skill-first detection of people in an approved shot frame. */
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { z } from "zod";
import { parseSkillFile } from "@smartspec/skills";
import {
  resolveSkillDirCandidates,
  resolveSkillManifestPath,
} from "./skillFiles";
import {
  calculateCreditsForLLM,
  deductCredits,
  hasEnoughCredits,
} from "./creditService";
import {
  executeVisionAwareJsonCallWithRetry,
  InsufficientCreditsError,
  VdSchemaValidationError,
} from "./verticalDramaStoryBible";
import { resolveQualityLargeContextModelId } from "./verticalDramaImproveScript";
import { resolveVerticalDramaSeriesModel } from "./verticalDramaLlmModelPolicy";
import type { VerticalDramaDetectedShotPerson } from "@shared/verticalDramaSeries/speakerVisualBinding";

export { InsufficientCreditsError, VdSchemaValidationError };

const SKILL_FOLDER_PATH = path.join(
  "skills",
  "vertical-drama-speaker-visual-detection"
);
const personSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    bounding_box: z.object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().gt(0).max(1),
      height: z.number().gt(0).max(1),
    }),
    appearance: z.string().trim().min(1).max(240),
    confidence: z.number().min(0).max(1),
  })
  .strict();

const outputSchema = z
  .object({
    people: z.array(personSchema).max(16),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = new Set<string>();
    for (const [index, person] of value.people.entries()) {
      if (ids.has(person.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["people", index, "id"],
          message: "Person IDs must be unique",
        });
      }
      ids.add(person.id);
      if (
        person.bounding_box.x + person.bounding_box.width > 1.001 ||
        person.bounding_box.y + person.bounding_box.height > 1.001
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["people", index, "bounding_box"],
          message: "Bounding box must stay inside the image",
        });
      }
    }
  });

type DetectedShotPersonOutput = z.infer<typeof personSchema>;

let cachedSystemPrompt: string | null = null;
let cachedSystemPromptTime = 0;

function loadSkillSystemPrompt(): string {
  if (cachedSystemPrompt && Date.now() - cachedSystemPromptTime < 60_000)
    return cachedSystemPrompt;
  for (const dir of resolveSkillDirCandidates(SKILL_FOLDER_PATH)) {
    const manifestPath = resolveSkillManifestPath(dir);
    if (!manifestPath || !fs.existsSync(manifestPath)) continue;
    const { content } = parseSkillFile(fs.readFileSync(manifestPath, "utf8"));
    if (content?.trim()) {
      cachedSystemPrompt = content;
      cachedSystemPromptTime = Date.now();
      return content;
    }
  }
  throw new Error(
    `Could not locate skill.md for "vertical-drama-speaker-visual-detection"`
  );
}

export async function detectVerticalDramaShotPeople(params: {
  userId: number;
  tenantId: string;
  seriesId: number;
  episodeId: number;
  shotNumber: number;
  sourceMediaAssetId: string;
  imageUrl: string;
  publicUrl?: string | null;
}): Promise<{
  people: VerticalDramaDetectedShotPerson[];
  creditsUsed: number;
  model: string;
}> {
  if (!(await hasEnoughCredits(params.userId, 1)))
    throw new InsufficientCreditsError();

  const model = await resolveVerticalDramaSeriesModel(
    params.seriesId,
    resolveQualityLargeContextModelId
  );
  const runId = randomUUID();
  const usageByModel = new Map<
    string,
    { promptTokens: number; completionTokens: number }
  >();
  const chargeActualUsage = async () => {
    const amount = Array.from(usageByModel.entries()).reduce(
      (sum, [usedModel, usage]) =>
        sum +
        calculateCreditsForLLM(
          usage.promptTokens,
          usage.completionTokens,
          usedModel
        ),
      0
    );
    if (!usageByModel.size) return 0;
    await deductCredits({
      userId: params.userId,
      tenantId: params.tenantId,
      amount,
      contextRef: {
        contextType: "series",
        sourceType: "vertical_drama_series",
        sourceId: String(params.seriesId),
      },
      description: `Vertical Drama — detect people in shot ${params.shotNumber}`,
      skillSlug: "vertical-drama-speaker-visual-detection",
      sourceType: "skill",
      idempotencyKey: `vd-speaker-detection:${params.episodeId}:${params.shotNumber}:${params.sourceMediaAssetId}:${runId}`,
      metadata: {
        model,
        llmModel: model,
        feature: "vertical_drama_series",
        seriesId: params.seriesId,
        episodeId: params.episodeId,
        shotNumber: params.shotNumber,
        sourceMediaAssetId: params.sourceMediaAssetId,
        usageByModel: Array.from(usageByModel, ([usedModel, usage]) => ({
          model: usedModel,
          ...usage,
        })),
      },
    });
    return amount;
  };
  let outcome: Awaited<
    ReturnType<
      typeof executeVisionAwareJsonCallWithRetry<z.infer<typeof outputSchema>>
    >
  >;
  try {
    outcome = await executeVisionAwareJsonCallWithRetry<
      z.infer<typeof outputSchema>
    >({
      model,
      systemPrompt: loadSkillSystemPrompt(),
      userPromptText: `Shot number: ${params.shotNumber}.`,
      hasVision: true,
      images: [
        {
          url: params.imageUrl,
          label:
            "APPROVED_START_FRAME_IMAGE (the only source for people and coordinates):",
        },
      ],
      userId: params.userId,
      tenantId: params.tenantId,
      publicUrl: params.publicUrl,
      schema: outputSchema,
      firstAttemptMaxTokens: 1400,
      retryMaxTokens: 2200,
      maxSchemaRetries: 1,
      disableModelFallback: false,
      verticalDramaContext: {
        seriesId: params.seriesId,
        episodeId: params.episodeId,
        taskClass: "visual_bible",
      },
      onUsage: (response, requestedModel) => {
        const usedModel = response.model?.trim() || requestedModel;
        const current = usageByModel.get(usedModel) ?? {
          promptTokens: 0,
          completionTokens: 0,
        };
        current.promptTokens += response.usage?.prompt_tokens ?? 0;
        current.completionTokens += response.usage?.completion_tokens ?? 0;
        usageByModel.set(usedModel, current);
      },
    });
  } catch (error) {
    await chargeActualUsage();
    throw error;
  }

  // Every successful and schema-repair provider response is charged by its
  // reported model and token usage. Text-only recovery is billed, then failed closed.
  const creditsUsed = await chargeActualUsage();

  if (!outcome.usedVision) {
    throw new Error(
      "ไม่สามารถวิเคราะห์ภาพด้วยโมเดลที่รองรับ vision ได้ กรุณาลองใหม่อีกครั้ง"
    );
  }
  const people = (
    outcome.data.people as DetectedShotPersonOutput[]
  )
    .map(person => ({
      id: person.id,
      boundingBox: person.bounding_box,
      appearance: person.appearance,
      confidence: person.confidence,
    }))
    .sort((left, right) => {
      const centerDelta =
        left.boundingBox.x + left.boundingBox.width / 2 -
        (right.boundingBox.x + right.boundingBox.width / 2);
      return Math.abs(centerDelta) > 0.03
        ? centerDelta
        : left.boundingBox.y - right.boundingBox.y;
    })
    .map((person, index) => ({ ...person, id: `person-${index + 1}` }));
  return { people, creditsUsed, model };
}
