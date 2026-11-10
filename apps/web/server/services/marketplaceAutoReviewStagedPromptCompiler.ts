import { buildProductionStableHash } from "../../shared/mediaProduction";
import {
  buildStagedImagePrompt,
  buildStagedVideoPrompt,
  type StagedStoryArcPlan,
  type StagedStoryArcShot,
  type StagedDialogueTurn,
  type StagedCastMember,
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
  approvedDialogue: string,
  derivedDialogueTurns?: readonly StagedDialogueTurn[],
  cast?: readonly StagedCastMember[]
): value is string {
  if (typeof value !== "string") return false;
  const prompt = value.trim();
  const dialogue = approvedDialogue.trim();
  const dialogueLines = dialogue
    .split(/\r?\n/)
    .map(line => {
      const match = line.trim().match(/^([^:\n]{1,100}):\s*(.+)$/);
      return match
        ? { speakerName: match[1].trim(), line: match[2].trim() }
        : null;
    });
  const namedDialogue =
    dialogueLines.length > 0 &&
    dialogueLines.every(
      (line): line is { speakerName: string; line: string } => !!line
    )
      ? dialogueLines
      : undefined;
  const countOccurrences = (text: string) =>
    text ? prompt.split(text).length - 1 : 0;
  const containsDuplicateApprovedLine = namedDialogue
    ? Array.from(
        namedDialogue.reduce((counts, line) => {
          counts.set(line.line, (counts.get(line.line) ?? 0) + 1);
          return counts;
        }, new Map<string, number>())
      ).some(([line, expectedCount]) =>
        line.length >= 8 && countOccurrences(line) > expectedCount
      )
    : dialogue.length >= 8 && countOccurrences(dialogue) > 1;
  const dialogueAppearsInOrder = (() => {
    if (!namedDialogue) return true;
    let searchFrom = 0;
    for (const line of namedDialogue) {
      const position = prompt.indexOf(line.line, searchFrom);
      if (position < 0) return false;
      searchFrom = position + line.line.length;
    }
    return true;
  })();
  const currentTurnKeys = new Set(
    (namedDialogue ?? []).map(
      line => `${line.speakerName.normalize("NFKC").trim().toLocaleLowerCase()}\n${line.line}`
    )
  );
  const containsStaleTurn = (derivedDialogueTurns ?? []).some(turn => {
    const key = `${turn.speakerName.normalize("NFKC").trim().toLocaleLowerCase()}\n${turn.line}`;
    return !currentTurnKeys.has(key) && turn.line.trim().length >= 4 && prompt.includes(turn.line.trim());
  });
  const normalizedName = (value: string) =>
    value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
  const castByName = new Map(
    (cast ?? []).map(member => [normalizedName(member.name), member])
  );
  const requiredSpeakerBindings = (namedDialogue ?? []).flatMap(line => {
    const member = castByName.get(normalizedName(line.speakerName));
    return member ? [member] : [];
  });
  const bindingDirectivePresent =
    /speaker-to-face|speaker.{0,30}face|lip[ -]?sync|mouth|ขยับปาก|ผูกผู้พูดกับใบหน้า/i.test(prompt);
  const visualMapPresent = /SPEAKER VISUAL MAP FOR THIS SHOT/i.test(prompt);
  const escapeRegExp = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const speakerAnchorByName = new Map<string, string>();
  for (const member of requiredSpeakerBindings) {
    const match = prompt.match(
      new RegExp(
        `(?:^|\\n)\\s*[-*]\\s*${escapeRegExp(member.name)}\\s*:\\s*([^\\r\\n]+)`,
        "i"
      )
    );
    if (match?.[1]?.trim()) {
      speakerAnchorByName.set(normalizedName(member.name), match[1].trim());
    }
  }
  const missingSpeakerBinding = requiredSpeakerBindings.some(member => {
    const anchor = speakerAnchorByName.get(normalizedName(member.name));
    return (
      !prompt.includes(member.name) ||
      !anchor ||
      anchor.length < 12 ||
      /@Image\d+|cast-\d+/i.test(anchor)
    );
  });
  const dialogueHasVisualAnchors = (namedDialogue ?? []).every(line => {
    const member = castByName.get(normalizedName(line.speakerName));
    if (!member) return true;
    const anchor = speakerAnchorByName.get(normalizedName(member.name));
    const linePosition = prompt.indexOf(line.line);
    if (!anchor || linePosition < 0) return false;
    const priorText = prompt.slice(0, linePosition);
    const anchorPosition = priorText.lastIndexOf(anchor);
    const speakerPosition = priorText.lastIndexOf(member.name, anchorPosition);
    return (
      anchorPosition >= 0 &&
      speakerPosition >= 0 &&
      anchorPosition - speakerPosition <= 60
    );
  });
  return (
    prompt.length >= STAGED_VIDEO_PROMPT_MIN_CHARS &&
    prompt.length <=
      PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_VIDEO_PROMPT_MAX_CHARS &&
    STAGED_VERTICAL_FORMAT_PATTERN.test(prompt) &&
    STAGED_ACCEPTED_IMAGE_PATTERN.test(prompt) &&
    STAGED_VIDEO_MOTION_PATTERN.test(prompt) &&
    STAGED_NO_TEXT_PATTERN.test(prompt) &&
    (!dialogue || (namedDialogue
      ? namedDialogue.every(line => prompt.includes(line.speakerName) && prompt.includes(line.line))
      : prompt.includes(dialogue))) &&
    dialogueAppearsInOrder &&
    !containsDuplicateApprovedLine &&
    !containsStaleTurn &&
    (requiredSpeakerBindings.length === 0 ||
      (bindingDirectivePresent &&
        visualMapPresent &&
        !missingSpeakerBinding &&
        dialogueHasVisualAnchors))
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
