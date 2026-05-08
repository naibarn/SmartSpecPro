import {
  isAudioFirstStoryboardPromptPackage,
} from "./skillExecutionInput";

const PROMPT_HEADER_PATTERN = /^PROMPT\s*\d+\s*(?:\(|:)/gim;
const PROMPT_SPLIT_PATTERN = /^PROMPT\s*\d+\s*(?:\([^)]*\))?:/gim;
const TRAILING_SHARED_SECTION_PATTERN = /^\s*(?:REFERENCE NOTES|CONTINUITY NOTES|VEO 3\.1 SETTINGS|STORY BEAT PLAN|NEWS BEAT PLAN)\s*:?\s*$/im;
const SHARED_SECTION_HEADING_PATTERN = /^\s*(REFERENCE NOTES|CONTINUITY NOTES)\s*:?\s*$/i;
const SHARED_SECTION_STOP_PATTERN = /^\s*(?:REFERENCE NOTES|CONTINUITY NOTES|VEO 3\.1 SETTINGS|STORY BEAT PLAN|NEWS BEAT PLAN|PROMPT\s*\d+)\b/i;
const ANY_SHARED_SECTION_PATTERN = /^\s*(?:REFERENCE NOTES|CONTINUITY NOTES|VEO 3\.1 SETTINGS|STORY BEAT PLAN|NEWS BEAT PLAN)\s*:?\s*$/im;

function readPositiveNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function countStoryboardPromptBlocks(content: string): number {
  return Array.from(String(content ?? "").matchAll(PROMPT_HEADER_PATTERN)).length;
}

function getStoryboardPromptBlocks(content: string): string[] {
  const text = String(content ?? "");
  const matches = Array.from(text.matchAll(PROMPT_SPLIT_PATTERN));
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? text.length;
    return text.slice(start, end);
  });
}

export function stripTrailingSharedSectionsAfterPromptBlocks(content: string): string {
  const text = String(content ?? "");
  const firstPrompt = text.search(PROMPT_SPLIT_PATTERN);
  if (firstPrompt < 0) return text;
  const afterFirstPrompt = text.slice(firstPrompt);
  const trailingSharedSection = afterFirstPrompt.search(TRAILING_SHARED_SECTION_PATTERN);
  if (trailingSharedSection < 0) return text;
  return text.slice(0, firstPrompt + trailingSharedSection).trim();
}

export function stripSharedSectionsFromPromptBlocks(content: string): string {
  const text = String(content ?? "");
  const firstPrompt = text.search(PROMPT_SPLIT_PATTERN);
  if (firstPrompt < 0) return text.trim();
  const promptSection = text.slice(firstPrompt);
  const firstSharedSection = promptSection.search(ANY_SHARED_SECTION_PATTERN);
  if (firstSharedSection < 0) return promptSection.trim();
  return promptSection.slice(0, firstSharedSection).trim();
}

export function extractStoryboardSharedSections(content: string): string {
  const lines = String(content ?? "").replace(/\r\n/g, "\n").split("\n");
  const sections: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index]?.trim() ?? "";
    if (!SHARED_SECTION_HEADING_PATTERN.test(heading)) {
      continue;
    }

    const collected: string[] = [heading.replace(/\s*:?\s*$/, "")];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor] ?? "";
      const trimmed = line.trim();
      if (trimmed && SHARED_SECTION_STOP_PATTERN.test(trimmed)) {
        break;
      }
      collected.push(line);
    }

    const section = collected.join("\n").trim();
    if (section && !sections.includes(section)) {
      sections.push(section);
    }
  }

  return sections.join("\n\n").trim();
}

export function mergeSharedSectionsWithPromptBlocks(sharedSections: string, promptBlocks: string): string {
  const cleanedPrompts = stripSharedSectionsFromPromptBlocks(promptBlocks).trim();
  const cleanedSharedSections = extractStoryboardSharedSections(sharedSections).trim();
  if (!cleanedSharedSections) return cleanedPrompts;
  if (!cleanedPrompts) return cleanedSharedSections;
  return `${cleanedSharedSections}\n\n${cleanedPrompts}`;
}

export function sanitizeAudioFirstStoryboardPromptBlocks(content: string): string {
  return String(content ?? "")
    .replace(/prompting the mother to presents visually to him/gi, "prompting the mother to lean closer with a gentle expression")
    .replace(/as she presents visually softly/gi, "as she gazes gently")
    .replace(/presents visually softly/gi, "gazes gently")
    .replace(/presents visually to him/gi, "leans closer with a gentle expression")
    .replace(/The mother hums a lullaby while gently rocking the baby\./gi, "The mother gently rocks the baby with a calm, soothing expression.")
    .replace(/The mother softly sings a lullaby to the baby\./gi, "The mother comforts the baby with silent, gentle rocking and a calm, loving expression.")
    .replace(/The mother whispers soft words of comfort as she rocks the baby\./gi, "The mother comforts the baby with silent, gentle rocking and a tender expression.")
    .replace(/while singing/gi, "with a calm, loving expression")
    .replace(/\bhums?\s+(?:a\s+)?lullaby\s+while\b/gi, "keeps a silent soothing rhythm while")
    .replace(/\bsoftly\s+sings?\s+(?:a\s+)?lullaby\b/gi, "silently comforts the baby")
    .replace(/\bsings?\s+(?:a\s+)?lullaby\b/gi, "silently comforts the baby")
    .replace(/\bwhispers?\s+soft\s+words\s+of\s+comfort\s+as\b/gi, "offers a tender, silent expression as")
    .replace(/\bwhispering\s+(?:soothing|soft)\s+words\b/gi, "showing a tender, silent expression")
    .trim();
}

export function buildAudioFirstStoryboardSharedSectionsFallback(input: {
  skillId: string;
  userInputs: Record<string, unknown>;
  referenceImageCount?: number;
}): string {
  if (!isAudioFirstStoryboardPromptPackage(input.skillId, input.userInputs)) {
    return "";
  }

  const storyBible = readNonEmptyString(input.userInputs.storyBible)
    || readNonEmptyString(input.userInputs.story_bible);
  const visualBible = readNonEmptyString(input.userInputs.visualBible)
    || readNonEmptyString(input.userInputs.visual_bible);
  const hasMotherBabyReferences = (input.referenceImageCount ?? 0) >= 2;

  const referenceLines = hasMotherBabyReferences
    ? [
        "@Image1 is the recurring mother character reference: Thai mother, 20 years old, long wavy hair, wearing luxurious small floral-patterned pajamas.",
        "@Image2 is the recurring baby character reference: Thai baby boy, 6 months old, keep his face, hair, outfit, and proportions consistent in every clip.",
      ]
    : [
        "Use all attached reference images as recurring character and scene references. Keep faces, outfits, and signature props consistent in every clip.",
      ];

  return [
    "REFERENCE NOTES",
    ...referenceLines,
    visualBible ? `Visual Bible: ${visualBible}` : "",
    "",
    "CONTINUITY NOTES",
    "Presenter Identity: Thai mother, 20 years old, beautiful, caring, same face and hairstyle from @Image1.",
    "Wardrobe: Luxurious pajamas with small floral pattern throughout every prompt.",
    "Child Identity: Same 6-month-old Thai baby boy from @Image2 throughout every prompt.",
    "Studio/Layout: Luxurious child's bedroom/nursery with scattered toys, crib, soft bedding, and cozy nighttime details.",
    "Lighting: Soft, warm nighttime lighting throughout.",
    "Camera Language: full vertical 9:16 edge-to-edge framing with medium shots and close-ups focused on mother and baby interaction; no letterboxing, no cinematic black bars, no top or bottom matte bars.",
    "Story Arc: Restless baby wakes and cries at night; mother holds, rocks, comforts, and keeps soothing him until he finally sleeps.",
    storyBible ? `Story Bible: ${storyBible}` : "",
  ].filter(Boolean).join("\n").trim();
}

export function shouldUseAudioFirstStoryboardSharedSectionsFallback(input: {
  skillId: string;
  userInputs: Record<string, unknown>;
  referenceImageCount?: number;
}): boolean {
  return isAudioFirstStoryboardPromptPackage(input.skillId, input.userInputs)
    && (input.referenceImageCount ?? 0) >= 2;
}

function promptBlocksNeedSharedMotherBabyLock(content: string, expectedPromptCount: number): boolean {
  const blocks = getStoryboardPromptBlocks(content);
  if (blocks.length < expectedPromptCount) return false;
  return blocks.slice(0, expectedPromptCount).some((block) => {
    const continuityLine = block
      .split(/\r?\n/)
      .find((line) => /^\s*Continuity Lock\s*:/i.test(line)) ?? "";
    return !/@Image1\b/i.test(continuityLine) || !/@Image2\b/i.test(continuityLine);
  });
}

export function resolveAudioFirstStoryboardPromptRepair(input: {
  skillId: string;
  userInputs: Record<string, unknown>;
  content: string;
  referenceImageCount?: number;
}): {
  expectedPromptCount: number;
  actualPromptCount: number;
  clipDurationSeconds: number;
  reason: "missing_prompt_blocks" | "weak_reference_continuity";
} | null {
  if (!isAudioFirstStoryboardPromptPackage(input.skillId, input.userInputs)) {
    return null;
  }

  const expectedPromptCount = Math.ceil(readPositiveNumber(input.userInputs.storyboardAudioPromptCount) ?? 0);
  const clipDurationSeconds = readPositiveNumber(input.userInputs.storyboardClipDurationSeconds) ?? 8;
  const actualPromptCount = countStoryboardPromptBlocks(input.content);
  if (expectedPromptCount <= 1) {
    return null;
  }

  if (actualPromptCount < expectedPromptCount) {
    return {
      expectedPromptCount,
      actualPromptCount,
      clipDurationSeconds,
      reason: "missing_prompt_blocks",
    };
  }

  if (
    (input.referenceImageCount ?? 0) >= 2
    && promptBlocksNeedSharedMotherBabyLock(input.content, expectedPromptCount)
  ) {
    return {
      expectedPromptCount,
      actualPromptCount,
      clipDurationSeconds,
      reason: "weak_reference_continuity",
    };
  }

  return null;
}

export function buildAudioFirstStoryboardRepairPrompt(input: {
  userInputs: Record<string, unknown>;
  previousContent: string;
  expectedPromptCount: number;
  actualPromptCount: number;
  clipDurationSeconds: number;
  reason?: "missing_prompt_blocks" | "weak_reference_continuity";
}): string {
  const safePreviousContent = String(input.previousContent ?? "").slice(0, 6000);
  const problem = input.reason === "weak_reference_continuity"
    ? `The previous answer had ${input.actualPromptCount} PROMPT blocks, but the continuity lock was too weak or split the mother and baby across different locks.`
    : `The previous answer only contained ${input.actualPromptCount} PROMPT blocks, but the audio-first timing requires exactly ${input.expectedPromptCount}.`;
  return [
    "Repair this incomplete Media Studio storyboard prompt package.",
    problem,
    `Return exactly PROMPT 1 through PROMPT ${input.expectedPromptCount}.`,
    `Every header must be formatted exactly like: PROMPT N (${input.clipDurationSeconds} seconds):`,
    "Return only the prompt blocks. Do not output REFERENCE NOTES, CONTINUITY NOTES, VEO settings, beat plans, explanations, markdown fences, or placeholder continuation lines.",
    `Each prompt block must include these exact lines: Continuity Lock:, A high-quality Realistic clip (${input.clipDurationSeconds} seconds)., Visual action:, Background Visuals:, Continuity Transition:, Camera:, and Lighting:.`,
    "Do not write 'High-Quality Clip Line:' as a label.",
    "Every Continuity Lock must mention both recurring characters together: @Image1 Thai mother in luxurious small floral pajamas and @Image2 Thai 6-month-old baby boy, in the same luxurious child's bedroom/nursery with scattered toys, soft warm lighting, full vertical 9:16 edge-to-edge framing, no letterboxing, no cinematic black bars, no top or bottom matte bars.",
    "Keep each block concise, visual-only, and self-contained. Preserve the nighttime soothing story: restless baby, crying, mother holding/rocking/comforting, sometimes still fussy. Do not turn it into cheerful playtime.",
    "Do not put spoken dialogue, whispering words, singing lyrics, humming, narration, sound design, or audio instructions inside prompt blocks for separate voice workflow.",
    "Do not stop early. Do not summarize missing prompts. Do not write '[continue]'.",
    "",
    "USER_INPUTS_JSON:",
    JSON.stringify(input.userInputs, null, 2),
    "",
    "INCOMPLETE_PREVIOUS_ANSWER:",
    safePreviousContent,
  ].join("\n");
}
