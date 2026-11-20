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
  calculateCreditsForLLMDynamic,
  deductCredits,
  hasEnoughCredits,
} from "./creditService";
import { getSkillRunCreditCost } from "./skillRevenueBilling";
import {
  executeVisionAwareJsonCallWithRetry,
  InsufficientCreditsError,
  VdSchemaValidationError,
  type VisionAwareCallResponse,
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

const boundingBoxSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().gt(0).max(1),
    height: z.number().gt(0).max(1),
  })
  .strict()
  .superRefine((box, context) => {
    if (box.x + box.width > 1.001 || box.y + box.height > 1.001) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bounding box must stay inside the image",
      });
    }
  });

const boundingBoxRefinementSchema = z
  .object({
    bounding_boxes: z.array(boundingBoxSchema).max(16),
  })
  .strict();

type DetectedShotPersonOutput = z.infer<typeof personSchema>;

export type VerticalDramaSpeakerDetectionUsageObserver = (
  response: VisionAwareCallResponse,
  requestedModel: string,
  providerName: string
) => void;

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
  idempotencyRunId?: string;
}): Promise<{
  people: VerticalDramaDetectedShotPerson[];
  creditsUsed: number;
  model: string;
}> {
  const skillCreditCost = await getSkillRunCreditCost({
    skillSlug: "vertical-drama-speaker-visual-detection",
    tenantId: params.tenantId,
  });
  if (!(await hasEnoughCredits(params.userId, skillCreditCost)))
    throw new InsufficientCreditsError();

  const model = await resolveVerticalDramaSeriesModel(
    params.seriesId,
    resolveQualityLargeContextModelId
  );
  const runId = params.idempotencyRunId?.trim() || randomUUID();
  const usageByModel = new Map<
    string,
    { promptTokens: number; completionTokens: number }
  >();
  const chargeActualUsage = async () => {
    let amount = 0;
    for (const [usedModel, usage] of usageByModel) {
      amount += await calculateCreditsForLLMDynamic(
        usage.promptTokens,
        usage.completionTokens,
        usedModel
      );
    }
    if (!usageByModel.size) return 0;
    const billing = await deductCredits({
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
    return billing.creditsUsed;
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
      modelFallbackPolicy: "recommended",
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

/**
 * Run the same Vertical Drama detection skill for a caller-owned image.
 * Marketplace Auto Review uses this direct entry point so it can preserve its
 * own billing/source context without inventing a series or episode record.
 * A coordinate-only vision pass may refine the first pass without changing its
 * person roster or descriptions. Provider, model, schema, and text-only
 * fallbacks are intentionally disabled.
 */
export async function detectVerticalDramaShotPeopleDirect(params: {
  userId: number;
  tenantId: string;
  shotNumber: number;
  imageUrl: string;
  model: string;
  publicUrl?: string | null;
  onUsage?: VerticalDramaSpeakerDetectionUsageObserver;
}): Promise<{
  people: VerticalDramaDetectedShotPerson[];
  model: string;
  providerName: string;
  response: VisionAwareCallResponse;
}> {
  const observedUsage: Array<{
    response: VisionAwareCallResponse;
    providerName: string;
  }> = [];
  const onUsage = (
    response: VisionAwareCallResponse,
    _requestedModel: string,
    providerName: string
  ) => {
    observedUsage.push({ response, providerName });
  };
  const reportUsage = (
    response: VisionAwareCallResponse,
    providerName: string
  ) => {
    if (!params.onUsage || observedUsage.length === 0) return;
    const promptTokens = observedUsage.reduce(
      (total, item) => total + (item.response.usage?.prompt_tokens ?? 0),
      0
    );
    const completionTokens = observedUsage.reduce(
      (total, item) => total + (item.response.usage?.completion_tokens ?? 0),
      0
    );
    params.onUsage(
      {
        ...response,
        usage: {
          ...(response.usage ?? {}),
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
        },
      },
      params.model,
      providerName
    );
  };

  let outcome: {
    data: z.infer<typeof outputSchema>;
    response: VisionAwareCallResponse;
    providerName: string;
    usedVision: boolean;
  };
  try {
    outcome = await executeVisionAwareJsonCallWithRetry<
      z.infer<typeof outputSchema>
    >({
      model: params.model,
      systemPrompt: loadSkillSystemPrompt(),
      userPromptText: [
        `Shot number: ${params.shotNumber}. Detect every visible person in the attached approved image.`,
        "Bounding-box precision only: use normalized coordinates against the entire uncropped image, with the top-left corner as (0, 0). For each person, make a tight rectangle around that person's complete visible silhouette, from the top of the visible head or hair to the lowest visible body/clothing edge; include visible torso and limbs, not only the face or central body. Keep the rectangle aligned to that person's actual left, top, right, and bottom edges, exclude neighboring people and background, and do not add padding. If the person is clipped by the image edge, stop the box at that edge. Before returning JSON, check each box against the image and correct any box that misses part of its person or covers a neighboring person.",
        "Keep the person detection, IDs, appearance descriptions, confidence, and ordering governed by the existing skill rules; refine only bounding_box geometry.",
      ].join(" "),
      hasVision: true,
      images: [
        {
          url: params.imageUrl,
          label: "APPROVED_START_FRAME_IMAGE (the only source for people and coordinates):",
        },
      ],
      userId: params.userId,
      tenantId: params.tenantId,
      publicUrl: params.publicUrl,
      schema: outputSchema,
      firstAttemptMaxTokens: 1400,
      retryMaxTokens: 1400,
      singleAttempt: true,
      disableModelFallback: true,
      disableProviderFallbacks: true,
      onUsage,
    });
  } catch (error) {
    const lastUsage = observedUsage[observedUsage.length - 1];
    if (lastUsage) reportUsage(lastUsage.response, lastUsage.providerName);
    throw error;
  }

  if (!outcome.usedVision) {
    reportUsage(outcome.response, outcome.providerName);
    throw new Error("VERTICAL_DRAMA_SPEAKER_DETECTION_VISION_REQUIRED");
  }
  const firstPassPeople = (outcome.data.people as DetectedShotPersonOutput[])
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

  let people = firstPassPeople;
  if (firstPassPeople.length > 0) {
    try {
      const refined = await executeVisionAwareJsonCallWithRetry<
        z.infer<typeof boundingBoxRefinementSchema>
      >({
        model: params.model,
        systemPrompt:
          "You are a precise visual bounding-box annotator. Inspect the attached image and return only JSON matching the supplied schema. Coordinates must describe the visible people in this image.",
        userPromptText: [
          `Shot number: ${params.shotNumber}. Return exactly ${firstPassPeople.length} bounding boxes for the already detected people in the approved image.`,
          "The existing people, their IDs, descriptions, confidence, and order are authoritative and must not be reconsidered. Return one box per roster entry, in exactly the same order. Do not add, omit, merge, split, rename, or reorder people. This pass changes bounding-box coordinates only.",
          "Use normalized coordinates relative to the complete uncropped image, with (0, 0) at the top-left. x and y are the box's LEFT and TOP edges; width and height extend RIGHT and DOWN from those edges (they are not center, right, or bottom coordinates). For each listed person, tightly enclose their visible silhouette from the top of visible head or hair to the lowest visible body/clothing edge, including visible torso and limbs. Exclude background and neighboring people. Keep every box inside the image. Inspect the image itself and place each box on the same person described by its roster entry; do not copy a misplaced initial estimate.",
          `Authoritative roster in required output order: ${JSON.stringify(firstPassPeople.map((person, index) => ({ index: index + 1, id: person.id, appearance: person.appearance, current_box: person.boundingBox })))}`,
        ].join(" "),
        hasVision: true,
        images: [
          {
            url: params.imageUrl,
            label: "APPROVED_START_FRAME_IMAGE (the only source for people and coordinates):",
          },
        ],
        userId: params.userId,
        tenantId: params.tenantId,
        publicUrl: params.publicUrl,
        schema: boundingBoxRefinementSchema,
        firstAttemptMaxTokens: 900,
        retryMaxTokens: 900,
        singleAttempt: true,
        disableModelFallback: true,
        disableProviderFallbacks: true,
        onUsage,
      });
      const refinedBoxes = refined.data.bounding_boxes;
      if (
        refined.usedVision &&
        refined.providerName === outcome.providerName &&
        refinedBoxes.length === firstPassPeople.length
      ) {
        people = firstPassPeople.map((person, index) => ({
          ...person,
          boundingBox: refinedBoxes[index],
        }));
      }
    } catch {
      // Keep the valid first-pass detections if coordinate-only refinement fails.
    }
  }
  reportUsage(outcome.response, outcome.providerName);

  return {
    people,
    model: params.model,
    providerName: outcome.providerName,
    response: outcome.response,
  };
}
