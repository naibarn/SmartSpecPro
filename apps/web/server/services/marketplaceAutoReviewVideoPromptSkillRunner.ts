import { createHash } from "node:crypto";

import type {
  VisionAwareImageInput,
  VisionAwareCallResponse,
} from "./verticalDramaStoryBible";
import { detectVerticalDramaShotPeopleDirect } from "./verticalDramaSpeakerVisualDetection";
import { generateVerticalDramaShotVideoPromptDirect } from "./verticalDramaVideoMotionPromptGeneration";
import {
  calculateCreditsForLLMDynamic,
  deductCredits,
  hasEnoughCredits,
} from "./creditService";
import { getSkillRunCreditCost } from "./skillRevenueBilling";
import { getSkillByIdAsync } from "./skillRegistry";
import { resolveSkillExecutionPolicy } from "./skillExecutionPolicy";
import { loadEnabledLlmModelRows } from "./enabledLlmModels";
import { isCompleteStagedVideoPrompt } from "./marketplaceAutoReviewStagedPromptCompiler";
import {
  PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_VIDEO_PROMPT_MAX_CHARS,
  type SequentialReferenceManifestEntry,
} from "./productReviewSequentialStoryboardSkillRunner";
import type {
  StagedCastMember,
  StagedStoryArcShot,
} from "./marketplaceAutoReviewStoryArcPlanner";
import type { VerticalDramaDetectedShotPerson } from "@shared/verticalDramaSeries/speakerVisualBinding";

export const MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL =
  "vertical-drama-speaker-visual-detection";
export const MARKETPLACE_VERTICAL_DRAMA_VIDEO_PROMPT_SKILL =
  "vertical-drama-shot-video-prompt";

type Usage = {
  promptTokens: number;
  completionTokens: number;
  providerName: string;
};
type DirectUsageObserver = (
  response: VisionAwareCallResponse,
  requestedModel: string,
  providerName: string
) => void;

export type MarketplaceVideoPromptProgress = {
  progress: number;
  stage: string;
  message: string;
};

export type MarketplaceVideoPromptSkillRun = {
  skill: string;
  model: string;
  provider: string;
  estimatedCredits: number;
};

export type GenerateMarketplaceAutoReviewVideoPromptInput = {
  userId: number;
  tenantId: string;
  publicUrl?: string | null;
  runId: string;
  shotId: number;
  approvedImageUrl: string;
  promptModel?: string | null;
  requestIdempotencyKey: string;
  shot: StagedStoryArcShot;
  cast: readonly StagedCastMember[];
  productName: string;
  productFacts: string[];
  referenceManifest: readonly SequentialReferenceManifestEntry[];
  instruction?: string | null;
  onProgress?: (progress: MarketplaceVideoPromptProgress) => Promise<void>;
};

function clean(value: unknown, max = 1200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function absoluteUrl(value: string, publicUrl?: string | null): string {
  if (/^https?:\/\//i.test(value)) return value;
  const base = publicUrl?.trim();
  if (!base) throw new Error("MARKETPLACE_PUBLIC_BASE_URL_REQUIRED");
  return new URL(value, `${base.replace(/\/+$/, "")}/`).toString();
}

function parseDialogue(
  dialogue: string
): Array<{ speaker: string; line: string }> {
  const lines = dialogue
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const match = line.match(/^([^:\n]{1,100}):\s*(.+)$/);
      return match ? { speaker: match[1].trim(), line: match[2].trim() } : null;
    });
  if (lines.some(line => line === null)) {
    throw new Error("MARKETPLACE_VIDEO_PROMPT_APPROVED_DIALOGUE_INVALID");
  }
  return lines as Array<{ speaker: string; line: string }>;
}

function modelMatches(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

async function resolveDirectVisionModel(
  skillSlug: string,
  requestedModel?: string | null
) {
  const skill = await getSkillByIdAsync(skillSlug);
  if (!skill) throw new Error(`MARKETPLACE_SKILL_NOT_FOUND:${skillSlug}`);
  const policy = await resolveSkillExecutionPolicy({
    skill,
    conversationModel: requestedModel?.trim() || null,
  });
  const modelId = policy.modelId?.trim();
  if (!modelId)
    throw new Error(`MARKETPLACE_SKILL_MODEL_NOT_CONFIGURED:${skillSlug}`);
  if (/^wllm_[A-Za-z0-9_-]{8,128}$/.test(modelId)) {
    throw new Error(
      `MARKETPLACE_SKILL_DIRECT_EXECUTION_REQUIRES_PROVIDER_MODEL:${skillSlug}`
    );
  }

  const rows = await loadEnabledLlmModelRows();
  const model = rows.find(row =>
    [row.modelId, row.providerModelId, ...(row.legacyModelAliases ?? [])]
      .filter((value): value is string => typeof value === "string")
      .some(value => modelMatches(value, modelId))
  );
  if (!model || model.supportsVision !== true) {
    throw new Error(
      `MARKETPLACE_SKILL_REQUIRES_VISION_MODEL:${skillSlug}:${modelId}`
    );
  }
  return { modelId, allowFreeModels: policy.allowFreeModels };
}

function makeChargeKey(input: {
  runId: string;
  shotId: number;
  requestIdempotencyKey: string;
  skillSlug: string;
}): string {
  const digest = createHash("sha256")
    .update(
      `${input.runId}\n${input.shotId}\n${input.requestIdempotencyKey}\n${input.skillSlug}`
    )
    .digest("hex");
  return `marketplace-auto-review-skill:${digest}`;
}

async function assertCreditPreflight(input: {
  userId: number;
  tenantId: string;
  skillSlug: string;
}) {
  const credits = await getSkillRunCreditCost({
    skillSlug: input.skillSlug,
    tenantId: input.tenantId,
  });
  if (!(await hasEnoughCredits(input.userId, credits))) {
    throw new Error(
      `MARKETPLACE_SKILL_INSUFFICIENT_CREDITS:${input.skillSlug}`
    );
  }
}

async function chargeActualUsage(input: {
  userId: number;
  tenantId: string;
  runId: string;
  shotId: number;
  skillSlug: string;
  modelId: string;
  providerName?: string;
  requestIdempotencyKey: string;
  usage: Usage | null;
}): Promise<number> {
  if (!input.usage) {
    throw new Error(`MARKETPLACE_SKILL_USAGE_REQUIRED:${input.skillSlug}`);
  }
  const providerName = input.usage.providerName.trim();
  if (!providerName) {
    throw new Error(`MARKETPLACE_SKILL_PROVIDER_REQUIRED:${input.skillSlug}`);
  }
  if (input.providerName && input.providerName.trim() !== providerName) {
    throw new Error(`MARKETPLACE_SKILL_PROVIDER_MISMATCH:${input.skillSlug}`);
  }
  const amount = await calculateCreditsForLLMDynamic(
    input.usage.promptTokens,
    input.usage.completionTokens,
    input.modelId
  );
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`MARKETPLACE_SKILL_USAGE_COST_INVALID:${input.skillSlug}`);
  }
  if (amount > 0) {
    await deductCredits({
      userId: input.userId,
      tenantId: input.tenantId,
      amount,
      description: `Marketplace Auto Review · ${input.skillSlug} · Shot ${input.shotId}`,
      idempotencyKey: makeChargeKey(input),
      skillSlug: input.skillSlug,
      sourceType: "skill",
      metadata: {
        feature: "marketplace_auto_review",
        runId: input.runId,
        shotId: input.shotId,
        operation: input.skillSlug,
        model: input.modelId,
        provider: providerName,
      },
    });
  }
  return amount;
}

function collectUsageObserver(target: {
  current: Usage | null;
}): DirectUsageObserver {
  return (response, _requestedModel, providerName) => {
    const promptTokens = Number(response.usage?.prompt_tokens);
    const completionTokens = Number(response.usage?.completion_tokens);
    if (
      !Number.isFinite(promptTokens) ||
      promptTokens < 0 ||
      !Number.isFinite(completionTokens) ||
      completionTokens < 0
    ) {
      target.current = null;
      return;
    }
    target.current = {
      promptTokens,
      completionTokens,
      providerName,
    };
  };
}

function formatDetectedPeople(
  people: readonly VerticalDramaDetectedShotPerson[]
): string {
  if (!people.length)
    return "No visible people were detected in the approved image.";
  return people
    .map(person => {
      const box = person.boundingBox;
      const centerX = box.x + box.width / 2;
      const position =
        centerX < 0.34
          ? "viewer-left"
          : centerX > 0.66
            ? "viewer-right"
            : "viewer-center";
      return `- ${person.id}: ${person.appearance}; ${position}; normalized region x=${box.x.toFixed(3)}, y=${box.y.toFixed(3)}, width=${box.width.toFixed(3)}, height=${box.height.toFixed(3)}; confidence=${person.confidence.toFixed(2)}`;
    })
    .join("\n");
}

type MarketplaceSpeakerVisualEntry = {
  name: string;
  position: string;
  detected_person_id?: string;
};

const MARKETPLACE_VIDEO_PROMPT_PREFIX =
  "Create a vertical 9:16 video using the approved image as the exact start frame. Camera movement follows the shot action. No on-screen text, captions, or subtitles.";

type SpeakerBinding = {
  speaker: string;
  line: string;
  person: Pick<VerticalDramaDetectedShotPerson, "id" | "appearance">;
  cue: string;
};

function renderSpeakerSections(bindings: readonly SpeakerBinding[]): string {
  const normalizedName = (value: string) =>
    value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  const uniqueBindings = bindings.filter(
    (binding, index) =>
      bindings.findIndex(
        item => normalizedName(item.speaker) === normalizedName(binding.speaker)
      ) === index
  );
  return [
    "SPEAKER VISUAL MAP FOR THIS SHOT:",
    ...uniqueBindings.map(
      binding => `- ${binding.speaker}: ${binding.cue} — ${binding.person.appearance}`
    ),
    "SPEAKER-TO-FACE LOCK: Match each spoken line only to the detected person named for that line. All other visible people keep their mouths closed.",
    "Approved dialogue:",
    ...bindings.map(
      binding =>
        `${binding.speaker}: ${binding.cue} says verbatim: "${binding.line}"`
    ),
  ].join("\n");
}

function motionPromptBudget(
  dialogue: readonly { speaker: string; line: string }[],
  people: readonly VerticalDramaDetectedShotPerson[],
  estimate: "longest" | "shortest"
): number {
  const id = people.reduce(
    (selected, person) =>
      (
        estimate === "longest"
          ? person.id.length > selected.length
          : person.id.length < selected.length
      )
        ? person.id
        : selected,
    people[0]?.id ?? "person-1"
  );
  const appearance = people.reduce(
    (selected, person) =>
      (
        estimate === "longest"
          ? person.appearance.length > selected.length
          : person.appearance.length < selected.length
      )
        ? person.appearance
        : selected,
    people[0]?.appearance ?? ""
  );
  const cue = `${id}, viewer-center`;
  const sections = renderSpeakerSections(
    dialogue.map(turn => ({
      ...turn,
      person: { id, appearance },
      cue,
    }))
  );
  return (
    PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_VIDEO_PROMPT_MAX_CHARS -
    MARKETPLACE_VIDEO_PROMPT_PREFIX.length -
    sections.length -
    4
  );
}

function detectedPersonPosition(
  person: VerticalDramaDetectedShotPerson
): "viewer-left" | "viewer-center" | "viewer-right" {
  const centerX = person.boundingBox.x + person.boundingBox.width / 2;
  return centerX < 0.34
    ? "viewer-left"
    : centerX > 0.66
      ? "viewer-right"
      : "viewer-center";
}

function positionTargetX(value: string): number | undefined {
  const normalized = value.trim().toLowerCase();
  if (/far[- ]left/.test(normalized)) return 0.08;
  if (/center[- ]left|centre[- ]left/.test(normalized)) return 0.4;
  if (/\bleft\b/.test(normalized)) return 0.25;
  if (/far[- ]right/.test(normalized)) return 0.92;
  if (/center[- ]right|centre[- ]right/.test(normalized)) return 0.6;
  if (/\bright\b/.test(normalized)) return 0.75;
  if (/center|centre|middle/.test(normalized)) return 0.5;
  return undefined;
}

function buildAuthoritativeSpeakerSections(input: {
  shotId: number;
  dialogue: Array<{ speaker: string; line: string }>;
  detectedPeople: readonly VerticalDramaDetectedShotPerson[];
  frameAnalysisPeople: readonly MarketplaceSpeakerVisualEntry[];
}): string {
  const matchError = (reason: string) =>
    new Error(
      `MARKETPLACE_VIDEO_PROMPT_SPEAKER_VISUAL_MATCH_MISSING:shot-${input.shotId}:${reason}`
    );
  const normalizedName = (value: string) =>
    value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  const usedPersonIds = new Set<string>();
  const bySpeaker = new Map<
    string,
    { person: VerticalDramaDetectedShotPerson; cue: string }
  >();
  const bindings = input.dialogue.map(turn => {
    const speakerKey = normalizedName(turn.speaker);
    const previous = bySpeaker.get(speakerKey);
    if (previous) return { ...turn, ...previous };
    const matches = input.frameAnalysisPeople.filter(
      person => normalizedName(person.name) === speakerKey
    );
    if (matches.length !== 1) {
      throw matchError("speaker-label");
    }
    const analysis = matches[0];
    const explicitId = analysis?.detected_person_id?.trim();
    const explicitPerson = explicitId
      ? input.detectedPeople.find(person => person.id === explicitId)
      : undefined;
    if (explicitId && !explicitPerson) {
      throw matchError("detected-person-id");
    }
    let person = explicitPerson;
    if (!person) {
      const targetX = positionTargetX(analysis.position);
      if (targetX === undefined) {
        throw matchError("speaker-position");
      }
      const positionalCandidates = input.detectedPeople
        .map(candidate => ({
          person: candidate,
          distance: Math.abs(
            candidate.boundingBox.x + candidate.boundingBox.width / 2 - targetX
          ),
        }))
        .sort((left, right) => left.distance - right.distance);
      const nearestCandidate = positionalCandidates[0];
      const nextCandidate = positionalCandidates[1];
      person =
        input.detectedPeople.length === 1
          ? input.detectedPeople[0]
          : nearestCandidate &&
              (!nextCandidate ||
                nextCandidate.distance - nearestCandidate.distance >= 0.08)
            ? nearestCandidate.person
            : undefined;
    }
    if (!person || usedPersonIds.has(person.id)) {
      throw matchError("detected-person-binding");
    }
    usedPersonIds.add(person.id);
    const position = detectedPersonPosition(person);
    const cue = `${person.id}, ${position}`;
    bySpeaker.set(speakerKey, { person, cue });
    return { ...turn, person, cue };
  });
  return renderSpeakerSections(bindings);
}

function replaceGeneratedSpeakerSections(
  prompt: string,
  authoritativeSections: string,
  approvedDialogue: readonly { line: string }[]
): string {
  const withoutSpeakerMap = prompt.replace(
    /(?:^|\n)\s*SPEAKER VISUAL MAP FOR THIS SHOT[^\n]*[\s\S]*?(?=\n\s*(?:Approved dialogue\b|Camera\/action:|Pacing:|Audio:|Photorealistic\b|No unsupported claims\b)|$)/gi,
    "\n"
  );
  const withoutDialogue = withoutSpeakerMap.replace(
    /(?:^|\n)\s*Approved dialogue[^\n]*\n[\s\S]*?(?=\n\s*(?:SPEAKER-TO-FACE LOCK:|Camera\/action:|Pacing:|Audio:|Photorealistic\b|No unsupported claims\b)|$)/gi,
    "\n"
  );
  const withoutLock = withoutDialogue.replace(
    /(?:^|\n)\s*SPEAKER-TO-FACE LOCK:[^\n]*(?:\n(?!\s*(?:Camera\/action:|Pacing:|Audio:|Photorealistic\b|No unsupported claims\b))[^\n]*)*/gi,
    "\n"
  );
  let motion = withoutLock.trim();
  for (const line of approvedDialogue) {
    // The visual map owns the only spoken transcript. Models can still echo a
    // supplied line in their prose despite being asked not to do so.
    const escaped = line.line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    motion = motion.replace(
      new RegExp(`["“‘']\\s*${escaped}\\s*["”’']`, "gu"),
      "the approved line"
    );
    if (line.line.length >= 8) {
      motion = motion.split(line.line).join("the approved line");
    }
  }
  if (
    motion.length < 40 ||
    /^(?:i\s+)?(?:cannot|can't|am unable|am sorry|apolog)/i.test(motion)
  ) {
    throw new Error("MARKETPLACE_VIDEO_PROMPT_MOTION_INCOMPLETE");
  }
  const maxLength = PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_VIDEO_PROMPT_MAX_CHARS;
  const remaining =
    maxLength -
    MARKETPLACE_VIDEO_PROMPT_PREFIX.length -
    authoritativeSections.length -
    4;
  if (remaining < 80) {
    throw new Error("MARKETPLACE_VIDEO_PROMPT_APPROVED_CONTENT_TOO_LONG");
  }
  if (motion.length > remaining) {
    let end = remaining;
    if (/[\uD800-\uDBFF]/.test(motion.charAt(end - 1))) end -= 1;
    const slice = motion.slice(0, end);
    const sentenceEnd = Math.max(
      slice.lastIndexOf(". "),
      slice.lastIndexOf("! "),
      slice.lastIndexOf("? "),
      slice.lastIndexOf("\n")
    );
    motion = (
      sentenceEnd >= Math.floor(remaining / 2)
        ? slice.slice(0, sentenceEnd + 1)
        : slice
    ).trimEnd();
  }
  return `${MARKETPLACE_VIDEO_PROMPT_PREFIX}\n\n${motion}\n\n${authoritativeSections}`;
}

export function buildMarketplaceVerticalDramaVideoPromptInput(input: {
  shotId: number;
  shot: StagedStoryArcShot;
  cast: readonly StagedCastMember[];
  productName: string;
  productFacts: string[];
  detectedPeople: readonly VerticalDramaDetectedShotPerson[];
  characterPortraits: ReadonlyArray<{
    imageNumber: number;
    characterName: string;
    role?: string;
    descriptor?: string;
  }>;
  instruction?: string | null;
}): string {
  if (!clean(input.productName, 200)) {
    throw new Error("MARKETPLACE_VIDEO_PROMPT_PRODUCT_NAME_REQUIRED");
  }
  const dialogue = parseDialogue(input.shot.dialogue);
  const maximumMotionBudget = motionPromptBudget(
    dialogue,
    input.detectedPeople,
    "shortest"
  );
  if (maximumMotionBudget < 80) {
    throw new Error("MARKETPLACE_VIDEO_PROMPT_APPROVED_CONTENT_TOO_LONG");
  }
  const motionBudget = Math.max(
    80,
    motionPromptBudget(dialogue, input.detectedPeople, "longest")
  );
  const castByName = new Map(
    input.cast.map(member => [
      member.name.normalize("NFKC").trim().toLowerCase(),
      member,
    ])
  );
  const portraitsByName = new Map(
    input.characterPortraits.map(member => [
      member.characterName.normalize("NFKC").trim().toLowerCase(),
      member,
    ])
  );
  const unknownSpeaker = dialogue.find(
    line => !castByName.has(line.speaker.normalize("NFKC").trim().toLowerCase())
  );
  if (unknownSpeaker) {
    throw new Error(
      `MARKETPLACE_VIDEO_PROMPT_SPEAKER_NOT_IN_CAST:${unknownSpeaker.speaker}`
    );
  }
  const missingPortrait = dialogue.find(line => {
    const key = line.speaker.normalize("NFKC").trim().toLowerCase();
    return castByName.has(key) && !portraitsByName.has(key);
  });
  if (missingPortrait) {
    throw new Error(
      `MARKETPLACE_VIDEO_PROMPT_SPEAKER_PORTRAIT_MISSING:${missingPortrait.speaker}`
    );
  }

  const portraitManifest = input.characterPortraits.length
    ? input.characterPortraits
        .map(
          person =>
            `- Image ${person.imageNumber} = ${person.characterName}${person.role ? ` (${person.role})` : ""}${person.descriptor ? `; reference description: ${clean(person.descriptor, 240)}` : ""}`
        )
        .join("\n")
    : "(No character portrait references are attached.)";
  const approvedDialogue = dialogue.length
    ? dialogue
        .map((line, index) => `${index + 1}. ${line.speaker}: "${line.line}"`)
        .join("\n")
    : "(No spoken dialogue is approved for this shot.)";
  const facts = input.productFacts
    .map(fact => clean(fact, 240))
    .filter(Boolean);

  return [
    `Create one video motion prompt for Marketplace Auto Review shot ${input.shotId}. This action creates prompt text only; do not render or generate a video.`,
    "Use Image 1 as the exact approved start frame and the source of truth for the people, product, blocking, and scene.",
    `Format: vertical 9:16, ${input.shot.durationSeconds} seconds.`,
    `Limit the generated motion prompt field to ${motionBudget} characters; the application reserves the remaining space for the exact speaker map and dialogue.`,
    "Begin the video prompt with: Use the approved image (Image 1) as the exact start frame and visual source of truth.",
    `Product: ${clean(input.productName, 200)}`,
    facts.length
      ? `Verified product facts:\n${facts.map(fact => `- ${fact}`).join("\n")}`
      : null,
    `Shot title: ${clean(input.shot.title, 200)}`,
    `Approved story beat: ${clean(input.shot.storySummary, 900)}`,
    `Approved visual direction: ${clean(input.shot.visualSummary, 900)}`,
    input.shot.cameraDirection
      ? `Planned camera framing and movement: ${clean(input.shot.cameraDirection, 240)}`
      : null,
    input.shot.movementDirection
      ? `Required visible action: ${clean(input.shot.movementDirection, 240)}`
      : null,
    input.shot.transition
      ? `Planned scene transition: ${clean(input.shot.transition, 180)}`
      : null,
    `CHARACTER IDENTITY MAP (portraits attached after Image 1):\n${portraitManifest}`,
    `People detected from Image 1 by ${MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL}:\n${formatDetectedPeople(input.detectedPeople)}`,
    `Approved dialogue (use each line exactly once, in this order; do not rewrite, duplicate, or add dialogue):\n${approvedDialogue}`,
    "SHOT-LOCAL SPEAKER MAP (mandatory): Before writing the prompt, compare each attached portrait with the detected people in Image 1. In JSON frame_analysis.people, include every dialogue speaker using the exact speaker label from Approved dialogue as name, the observed position, and detected_person_id copied from the matching person-N entry above. Do not add honorifics, translate, abbreviate, or otherwise rewrite names. Do not infer identity from cast order, dialogue order, or left-to-right order. If a visual match is ambiguous, omit that speaker rather than guessing; the application will request a safe correction.",
    "Do not include a SPEAKER VISUAL MAP or repeat any dialogue in the generated prompt; the application will add the verified speaker-to-face map and approved dialogue exactly once. Write the remaining motion prompt only. Only the named, detected person should move their mouth during that person's line; all other visible people remain silent with mouths closed. Keep the product and scene consistent with Image 1. Include one clear, physically plausible action and camera movement. Do not add on-screen text, subtitles, captions, logos, watermarks, or unsupported product claims.",
    clean(input.instruction, 1200)
      ? `User instruction for this shot:\n${clean(input.instruction, 1200)}`
      : null,
    "Return exactly the JSON object required by this skill. The prompt field must contain the complete video prompt. Do not return commentary.",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n\n");
}

export async function generateMarketplaceAutoReviewVideoPrompt(
  input: GenerateMarketplaceAutoReviewVideoPromptInput
): Promise<{
  prompt: string;
  detectedPeople: VerticalDramaDetectedShotPerson[];
  model: string;
  provider: string;
  estimatedCredits: number;
  skillRuns: MarketplaceVideoPromptSkillRun[];
}> {
  if (!input.approvedImageUrl.trim()) {
    throw new Error("MARKETPLACE_VIDEO_PROMPT_APPROVED_IMAGE_REQUIRED");
  }
  if (!clean(input.productName, 200)) {
    throw new Error("MARKETPLACE_VIDEO_PROMPT_PRODUCT_NAME_REQUIRED");
  }
  const approvedFrame = absoluteUrl(input.approvedImageUrl, input.publicUrl);
  if (!approvedFrame) {
    throw new Error("MARKETPLACE_VIDEO_PROMPT_APPROVED_IMAGE_URL_INVALID");
  }
  const dialogue = parseDialogue(input.shot.dialogue);
  const castNames = new Set(
    input.cast.map(member => member.name.normalize("NFKC").trim().toLowerCase())
  );
  const portraitNames = new Set(
    input.referenceManifest
      .filter(
        entry => entry.role === "character" && entry.characterName?.trim()
      )
      .map(entry => entry.characterName!.normalize("NFKC").trim().toLowerCase())
  );
  for (const line of dialogue) {
    const speaker = line.speaker.normalize("NFKC").trim().toLowerCase();
    if (!castNames.has(speaker)) {
      throw new Error(
        `MARKETPLACE_VIDEO_PROMPT_SPEAKER_NOT_IN_CAST:${line.speaker}`
      );
    }
    if (!portraitNames.has(speaker)) {
      throw new Error(
        `MARKETPLACE_VIDEO_PROMPT_SPEAKER_PORTRAIT_MISSING:${line.speaker}`
      );
    }
  }
  const characterPortraits = input.referenceManifest
    .filter(entry => entry.role === "character" && entry.characterName?.trim())
    .map(entry => {
      const url = absoluteUrl(entry.url, input.publicUrl);
      if (!url) {
        throw new Error(
          `MARKETPLACE_VIDEO_PROMPT_CHARACTER_REFERENCE_URL_INVALID:${entry.characterName}`
        );
      }
      return { entry, url };
    });
  const detectionModel = await resolveDirectVisionModel(
    MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL,
    input.promptModel
  );
  const videoPromptModel = await resolveDirectVisionModel(
    MARKETPLACE_VERTICAL_DRAMA_VIDEO_PROMPT_SKILL,
    input.promptModel
  );
  await assertCreditPreflight({
    userId: input.userId,
    tenantId: input.tenantId,
    skillSlug: MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL,
  });
  await assertCreditPreflight({
    userId: input.userId,
    tenantId: input.tenantId,
    skillSlug: MARKETPLACE_VERTICAL_DRAMA_VIDEO_PROMPT_SKILL,
  });
  await input.onProgress?.({
    progress: 15,
    stage: MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL,
    message: `กำลังตรวจจับบุคคลจากภาพที่อนุมัติ · ${MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL} · Shot ${input.shotId}`,
  });

  const detectionUsage = { current: null as Usage | null };
  let detection: Awaited<
    ReturnType<typeof detectVerticalDramaShotPeopleDirect>
  >;
  try {
    detection = await detectVerticalDramaShotPeopleDirect({
      userId: input.userId,
      tenantId: input.tenantId,
      shotNumber: input.shotId,
      imageUrl: approvedFrame,
      model: detectionModel.modelId,
      publicUrl: input.publicUrl,
      onUsage: collectUsageObserver(detectionUsage),
    });
  } catch (error) {
    if (detectionUsage.current) {
      await chargeActualUsage({
        userId: input.userId,
        tenantId: input.tenantId,
        runId: input.runId,
        shotId: input.shotId,
        skillSlug: MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL,
        modelId: detectionModel.modelId,
        requestIdempotencyKey: input.requestIdempotencyKey,
        usage: detectionUsage.current,
      });
    }
    throw error;
  }
  const detectionCredits = await chargeActualUsage({
    userId: input.userId,
    tenantId: input.tenantId,
    runId: input.runId,
    shotId: input.shotId,
    skillSlug: MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL,
    modelId: detectionModel.modelId,
    providerName: detection.providerName,
    requestIdempotencyKey: input.requestIdempotencyKey,
    usage: detectionUsage.current,
  });
  if (dialogue.length > 0 && detection.people.length === 0) {
    throw new Error(
      `MARKETPLACE_VIDEO_PROMPT_NO_PEOPLE_DETECTED:shot-${input.shotId}`
    );
  }

  await input.onProgress?.({
    progress: 50,
    stage: MARKETPLACE_VERTICAL_DRAMA_VIDEO_PROMPT_SKILL,
    message: `ตรวจจับบุคคลแล้ว ${detection.people.length} คน · กำลังสร้าง Prompt วิดีโอ · ${MARKETPLACE_VERTICAL_DRAMA_VIDEO_PROMPT_SKILL} · Shot ${input.shotId}`,
  });
  const imageInputs: VisionAwareImageInput[] = [
    {
      url: approvedFrame,
      label:
        "Image 1 — exact approved start frame. This image defines actual shot composition and visible people.",
    },
    ...characterPortraits.map((item, index) => ({
      url: item.url,
      label: `Image ${index + 2} — character portrait for ${item.entry.characterName}${item.entry.characterRole ? ` (${item.entry.characterRole})` : ""}. Use only to match identity to a person visible in Image 1.`,
    })),
  ];
  const promptInput = buildMarketplaceVerticalDramaVideoPromptInput({
    shotId: input.shotId,
    shot: input.shot,
    cast: input.cast,
    productName: input.productName,
    productFacts: input.productFacts,
    detectedPeople: detection.people,
    characterPortraits: characterPortraits.map((item, index) => ({
      imageNumber: index + 2,
      characterName: item.entry.characterName!,
      role: item.entry.characterRole,
      descriptor: input.cast.find(
        cast => cast.name === item.entry.characterName
      )?.descriptor,
    })),
    instruction: input.instruction,
  });

  const promptUsage = { current: null as Usage | null };
  let generated: Awaited<
    ReturnType<typeof generateVerticalDramaShotVideoPromptDirect>
  >;
  try {
    generated = await generateVerticalDramaShotVideoPromptDirect({
      model: videoPromptModel.modelId,
      userId: input.userId,
      tenantId: input.tenantId,
      publicUrl: input.publicUrl,
      userPromptText: promptInput,
      images: imageInputs,
      onUsage: collectUsageObserver(promptUsage),
    });
  } catch (error) {
    if (promptUsage.current) {
      await chargeActualUsage({
        userId: input.userId,
        tenantId: input.tenantId,
        runId: input.runId,
        shotId: input.shotId,
        skillSlug: MARKETPLACE_VERTICAL_DRAMA_VIDEO_PROMPT_SKILL,
        modelId: videoPromptModel.modelId,
        requestIdempotencyKey: input.requestIdempotencyKey,
        usage: promptUsage.current,
      });
    }
    throw error;
  }
  let promptCredits = await chargeActualUsage({
    userId: input.userId,
    tenantId: input.tenantId,
    runId: input.runId,
    shotId: input.shotId,
    skillSlug: MARKETPLACE_VERTICAL_DRAMA_VIDEO_PROMPT_SKILL,
    modelId: videoPromptModel.modelId,
    providerName: generated.providerName,
    requestIdempotencyKey: input.requestIdempotencyKey,
    usage: promptUsage.current,
  });

  const approvedTurns = parseDialogue(input.shot.dialogue);
  const buildSpeakerSections = (data: typeof generated.data) => {
    const positionSource = data.frame_analysis?.position_source
      ?.trim()
      .toLowerCase();
    if (approvedTurns.length && positionSource && positionSource !== "image") {
      throw new Error(
        `MARKETPLACE_VIDEO_PROMPT_FRAME_ANALYSIS_REQUIRED:shot-${input.shotId}`
      );
    }
    return buildAuthoritativeSpeakerSections({
      shotId: input.shotId,
      dialogue: approvedTurns,
      detectedPeople: detection.people,
      frameAnalysisPeople: (data.frame_analysis?.people ??
        []) as MarketplaceSpeakerVisualEntry[],
    });
  };
  let speakerSections: string;
  try {
    speakerSections = buildSpeakerSections(generated.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const repairable =
      message.startsWith("MARKETPLACE_VIDEO_PROMPT_SPEAKER_VISUAL_MATCH_MISSING") ||
      message.startsWith("MARKETPLACE_VIDEO_PROMPT_FRAME_ANALYSIS_REQUIRED");
    if (!repairable || approvedTurns.length === 0) throw error;

    await assertCreditPreflight({
      userId: input.userId,
      tenantId: input.tenantId,
      skillSlug: MARKETPLACE_VERTICAL_DRAMA_VIDEO_PROMPT_SKILL,
    });
    await input.onProgress?.({
      progress: 65,
      stage: MARKETPLACE_VERTICAL_DRAMA_VIDEO_PROMPT_SKILL,
      message: `กำลังแก้การจับคู่ผู้พูดกับบุคคลในภาพ · Shot ${input.shotId}`,
    });
    const repairUsage = { current: null as Usage | null };
    const repairInstruction = [
      "SPEAKER MAP CORRECTION REQUIRED: Your previous frame_analysis could not be safely matched to the approved dialogue.",
      "Return the same complete JSON contract and preserve the approved prompt content, but correct frame_analysis.people.",
      "For every approved dialogue speaker that is visibly matched to a portrait, use the exact approved speaker label as name, the visually verified position, and the exact detected_person_id from the detected-person map.",
      "Do not guess, use cast/order assumptions, rename speakers, or omit a speaker that can be visually matched. If a speaker cannot be confidently identified from the supplied images, omit that person and do not invent a binding.",
      `Approved speaker labels: ${approvedTurns.map(turn => turn.speaker).join(" | ")}`,
      `Detected people: ${formatDetectedPeople(detection.people)}`,
    ].join("\n");
    let repaired: Awaited<
      ReturnType<typeof generateVerticalDramaShotVideoPromptDirect>
    >;
    try {
      repaired = await generateVerticalDramaShotVideoPromptDirect({
        model: videoPromptModel.modelId,
        userId: input.userId,
        tenantId: input.tenantId,
        publicUrl: input.publicUrl,
        userPromptText: `${promptInput}\n\n${repairInstruction}`,
        images: imageInputs,
        onUsage: collectUsageObserver(repairUsage),
      });
    } catch (repairError) {
      if (repairUsage.current) {
        promptCredits += await chargeActualUsage({
          userId: input.userId,
          tenantId: input.tenantId,
          runId: input.runId,
          shotId: input.shotId,
          skillSlug: MARKETPLACE_VERTICAL_DRAMA_VIDEO_PROMPT_SKILL,
          modelId: videoPromptModel.modelId,
          requestIdempotencyKey: `${input.requestIdempotencyKey}:speaker-map-repair`,
          usage: repairUsage.current,
        });
      }
      throw repairError;
    }
    promptCredits += await chargeActualUsage({
      userId: input.userId,
      tenantId: input.tenantId,
      runId: input.runId,
      shotId: input.shotId,
      skillSlug: MARKETPLACE_VERTICAL_DRAMA_VIDEO_PROMPT_SKILL,
      modelId: videoPromptModel.modelId,
      providerName: repaired.providerName,
      requestIdempotencyKey: `${input.requestIdempotencyKey}:speaker-map-repair`,
      usage: repairUsage.current,
    });
    generated = repaired;
    speakerSections = buildSpeakerSections(generated.data);
  }
  const prompt = replaceGeneratedSpeakerSections(
    generated.data.prompt.trim(),
    speakerSections,
    approvedTurns
  );
  if (
    !isCompleteStagedVideoPrompt(
      prompt,
      input.shot.dialogue,
      input.shot.dialogueTurns,
      input.cast,
      detection.people.map(person => person.id)
    )
  ) {
    const failedCheck = !isCompleteStagedVideoPrompt(prompt, "")
      ? "format_or_length"
      : !isCompleteStagedVideoPrompt(prompt, input.shot.dialogue)
        ? "dialogue"
        : !isCompleteStagedVideoPrompt(
              prompt,
              input.shot.dialogue,
              input.shot.dialogueTurns
            )
          ? "stale_dialogue"
          : !isCompleteStagedVideoPrompt(
                prompt,
                input.shot.dialogue,
                input.shot.dialogueTurns,
                input.cast
              )
            ? "speaker_map"
            : "detected_people";
    console.warn("[MarketplaceVideoPrompt] validation failed", {
      shotId: input.shotId,
      failedCheck,
      promptLength: prompt.length,
      maxLength: PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_VIDEO_PROMPT_MAX_CHARS,
    });
    throw new Error(
      `MARKETPLACE_VIDEO_PROMPT_SKILL_OUTPUT_INCOMPLETE:shot-${input.shotId}`
    );
  }
  return {
    prompt,
    detectedPeople: detection.people,
    model: videoPromptModel.modelId,
    provider: generated.providerName,
    estimatedCredits: detectionCredits + promptCredits,
    skillRuns: [
      {
        skill: MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL,
        model: detectionModel.modelId,
        provider: detection.providerName,
        estimatedCredits: detectionCredits,
      },
      {
        skill: MARKETPLACE_VERTICAL_DRAMA_VIDEO_PROMPT_SKILL,
        model: videoPromptModel.modelId,
        provider: generated.providerName,
        estimatedCredits: promptCredits,
      },
    ],
  };
}
