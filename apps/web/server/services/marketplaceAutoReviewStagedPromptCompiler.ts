import { buildProductionStableHash } from "../../shared/mediaProduction";
import {
  buildStagedImagePrompt,
  buildStagedVideoPrompt,
  type StagedStoryArcPlan,
  type StagedStoryArcShot,
} from "./marketplaceAutoReviewStoryArcPlanner";
import {
  PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_IMAGE_PROMPT_MAX_CHARS,
  PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_VIDEO_PROMPT_MAX_CHARS,
} from "./productReviewSequentialStoryboardSkillRunner";

export const STAGED_IMAGE_PROMPT_MIN_CHARS = 80;
export const STAGED_VIDEO_PROMPT_MIN_CHARS = 80;

const STAGED_VERTICAL_FORMAT_PATTERN = /9\s*:\s*16|vertical|แนวตั้ง/i;
const STAGED_REFERENCE_LOCK_PATTERN = /@Image\s*\d+|reference|ภาพอ้างอิง|อ้างอิง/i;
const STAGED_IMAGE_COMPOSITION_PATTERN =
  /camera|framing|composition|lighting|focus|มุมกล้อง|กล้อง|องค์ประกอบ|จัดกรอบ|แสง|โฟกัส/i;
const STAGED_NO_TEXT_PATTERN =
  /(?:no|without|do not|don't)[^.]{0,100}\b(?:text|captions?|subtitles?)\b|ห้าม.{0,40}(?:ข้อความ|caption|ซับ)|ไม่แสดง.{0,40}ข้อความ/i;
const STAGED_ACCEPTED_IMAGE_PATTERN =
  /accepted image|approved image|image artifact|ภาพที่(?:ยอมรับ|ผ่าน|อนุมัติ)|ใช้ภาพ.*(?:ช็อต|ต้นฉบับ)/i;
const STAGED_VIDEO_MOTION_PATTERN =
  /camera|motion|movement|action|กล้อง|เคลื่อนไหว|การเคลื่อนไหว|การกระทำ/i;

export function isCompleteStagedImagePrompt(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const prompt = value.trim();
  return (
    prompt.length >= STAGED_IMAGE_PROMPT_MIN_CHARS &&
    prompt.length <=
      PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_IMAGE_PROMPT_MAX_CHARS &&
    STAGED_VERTICAL_FORMAT_PATTERN.test(prompt) &&
    STAGED_REFERENCE_LOCK_PATTERN.test(prompt) &&
    STAGED_IMAGE_COMPOSITION_PATTERN.test(prompt) &&
    STAGED_NO_TEXT_PATTERN.test(prompt)
  );
}

export function isCompleteStagedVideoPrompt(
  value: unknown,
  approvedDialogue: string
): value is string {
  if (typeof value !== "string") return false;
  const prompt = value.trim();
  const dialogue = approvedDialogue.trim();
  return (
    prompt.length >= STAGED_VIDEO_PROMPT_MIN_CHARS &&
    prompt.length <=
      PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_VIDEO_PROMPT_MAX_CHARS &&
    STAGED_VERTICAL_FORMAT_PATTERN.test(prompt) &&
    STAGED_ACCEPTED_IMAGE_PATTERN.test(prompt) &&
    STAGED_VIDEO_MOTION_PATTERN.test(prompt) &&
    STAGED_NO_TEXT_PATTERN.test(prompt) &&
    (!dialogue || prompt.includes(dialogue))
  );
}

export function buildStagedImagePromptContentHash(input: {
  revision: number;
  shotId: number;
  prompt: string;
  referenceManifestHash: string;
}) {
  return buildProductionStableHash({
    kind: "image_prompt",
    revision: input.revision,
    shotId: input.shotId,
    prompt: input.prompt,
    referenceManifestHash: input.referenceManifestHash,
  });
}

export function buildStagedVideoPromptContentHash(input: {
  revision: number;
  shotId: number;
  prompt: string;
  imageArtifactHash: string;
}) {
  return buildProductionStableHash({
    kind: "video_prompt",
    shotId: input.shotId,
    revision: input.revision,
    prompt: input.prompt,
    imageArtifactHash: input.imageArtifactHash,
  });
}

export function compileStagedImagePrompt(input: {
  plan: StagedStoryArcPlan;
  shot: StagedStoryArcShot;
  customManifest?: Array<{ url: string; role?: string; label?: string; active?: boolean }>;
}) {
  const prompt = buildStagedImagePrompt(input);
  return {
    prompt,
    contentHash: buildStagedImagePromptContentHash({
      revision: input.plan.planRevision,
      shotId: input.shot.shotId,
      prompt,
      referenceManifestHash: input.plan.referenceManifestHash,
    }),
  };
}

export function compileStagedVideoPrompt(input: {
  plan: StagedStoryArcPlan;
  shot: StagedStoryArcShot;
  imageArtifactHash: string;
}) {
  const prompt = buildStagedVideoPrompt(input);
  return {
    prompt,
    contentHash: buildStagedVideoPromptContentHash({
      revision: input.plan.planRevision,
      shotId: input.shot.shotId,
      prompt,
      imageArtifactHash: input.imageArtifactHash,
    }),
  };
}
