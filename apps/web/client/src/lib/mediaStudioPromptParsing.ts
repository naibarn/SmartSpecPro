const MULTI_PROMPT_REGEX = /^\s*(?:PROMPT|SCENE|SHOT|CLIP)\s+\d+\s*(?:\([^)]+\))?:/im;
const PROMPT_MARKER_LINE_REGEX = /^\s*(?:PROMPT|SCENE|SHOT|CLIP)\s+\d+\s*(?:\([^)]+\))?:\s*(.*)$/i;
const NON_GENERATION_SHARED_SECTION_REGEX = /^\s*(?:VEO(?:\s+3\.1)?\s+SETTINGS|NEWS BEAT PLAN|STORY BEAT PLAN)\s*:\s*$/i;
const TECHNICAL_CONTROL_LINE_REGEX = /^\s*(?:Veo Settings|Reference Image Role|Dialogue Budget(?: Example)?|News Beat Goal|Model|Resolved Veo Provider Model|Veo 3\.1 Model|Generation Type|Reference Images|Output Quality|Runtime Resolution Alias|Aspect Ratio|Enable Translation|Enable Fallback|Watermark)\s*:/i;
const NEWS_BEAT_PLAN_LINE_REGEX = /^\s*Beat\s+\d+\s*[-:]/i;
const UNRESOLVED_TEXT_OVERLAY_CONDITION_REGEX = /No subtitles,\s*no extra on-screen captions unless includeTextOverlays=true,\s*no narrator\.\s*Only presenter voice\./i;
const GENERIC_NO_TEXT_LINE_REGEX = /No subtitles,\s*no on-screen text(?:\.|,)\s*No narrator\.\s*Only (?:character|presenter) voice\./i;
const STRONG_NO_TEXT_LINE = "No subtitles, no captions, no lower-thirds, no readable text or numbers anywhere in frame, no logos with letters, no random glyphs, no narrator. Only the intended character or presenter voice.";
const VISUAL_TEXT_RESTRICTION_LINE = "No subtitles, no captions, no lower-thirds, no readable text or numbers anywhere in frame, no logos with letters, no random glyphs.";
const EXTERNAL_AUDIO_WORKFLOW_LINE_REGEX = /^\s*External audio workflow\s*:/i;
const HARD_EXTERNAL_NO_AUDIO_LINE_REGEX = /no narrator,\s*no speech,\s*no dialogue(?:,\s*no music,\s*no sound effects)?/i;
const TEXT_RESTRICTION_WITH_AUDIO_CONTROL_REGEX = /^No subtitles\b.*\b(?:no narrator|no speech|no dialogue|no music|no sound effects)\b/i;
const AUDIO_DIRECTION_LINE_REGEX = /^\s*(?:Audio Cue|Speech Delivery|Sound Design)\s*:/i;
const SPEAKER_LINE_REGEX = /^\s*Speaker\s*:/i;
const EXTERNAL_VOICEOVER_SECTION_HEADING_REGEX = /^\s*(?:VOICEOVER SCRIPT|NARRATION SCRIPT|SEPARATE VOICEOVER SCRIPT|EXTERNAL VOICEOVER SCRIPT|AUDIO SCRIPT)\s*:\s*(.*)$/i;
const EXTERNAL_MUSIC_SECTION_HEADING_REGEX = /^\s*(?:SOUND BED BRIEF|MUSIC BRIEF|BACKGROUND MUSIC BRIEF|SEPARATE MUSIC BRIEF|EXTERNAL MUSIC BRIEF)\s*:\s*(.*)$/i;
const SECTION_BOUNDARY_HEADING_REGEX = /^\s*(?:REFERENCE NOTES|CONTINUITY NOTES|VEO(?:\s+3\.1)?\s+SETTINGS|NEWS BEAT PLAN|STORY BEAT PLAN|VOICEOVER SCRIPT|NARRATION SCRIPT|SEPARATE VOICEOVER SCRIPT|EXTERNAL VOICEOVER SCRIPT|AUDIO SCRIPT|SOUND BED BRIEF|MUSIC BRIEF|BACKGROUND MUSIC BRIEF|SEPARATE MUSIC BRIEF|EXTERNAL MUSIC BRIEF|PROMPT|SCENE|SHOT|CLIP)\b/i;
const CONTINUITY_LOCK_LINE_REGEX = /^\s*Continuity Lock\s*:/im;
const SPOKEN_DIALOGUE_LINE_REGEX = /^\s*(?:(?:the\s+)?(?:ผู้ประกาศ|ตัวละคร|speaker|presenter|host|narrator|character)|[A-Za-zก-๙0-9 _-]+\s*)[^:\n]*(?:พูดเป็น[^"]*ว่า|says?|speaks?|กล่าวว่า)\s*(?:in\s+[A-Za-z() ]+\s*:)?\s*["“](.+?)["”]\s*\.?\s*$/i;
const QUOTED_DIALOGUE_REGEXES = [
  /พูดเป็น[^"]*ว่า\s*["“](.+?)["”]/i,
  /(?:says?|speaks?|กล่าวว่า)\s*["“](.+?)["”]/i,
];

export interface ParsedMultiVideoPromptOutput {
  sharedContext: string;
  prompts: string[];
}

function stripSharedHeader(text: string): string {
  return text
    .replace(/^(?:SHARED CONTINUITY PREAMBLE|REFERENCE NOTES|CONTINUITY NOTES|STORY CONTINUITY BIBLE)(?:\s*\([^)]*\))?\s*:\s*/i, "")
    .trim();
}

function stripNonGenerationSharedSections(text: string): string {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  let skipping = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (NON_GENERATION_SHARED_SECTION_REGEX.test(line)) {
      skipping = true;
      continue;
    }

    if (skipping) {
      continue;
    }

    kept.push(line);
  }

  return kept.join("\n").trim();
}

export function splitMultiVideoPromptOutput(text: string): ParsedMultiVideoPromptOutput {
  const trimmed = text.trim();
  if (!trimmed) {
    return { sharedContext: "", prompts: [] };
  }

  const parts = trimmed.split(MULTI_PROMPT_REGEX);
  if (parts.length <= 1) {
    return { sharedContext: stripSharedHeader(trimmed), prompts: [] };
  }

  const sharedContext = stripSharedHeader(stripNonGenerationSharedSections(parts[0].trim()));
  const prompts: string[] = [];

  for (let i = 1; i < parts.length; i++) {
    const promptText = parts[i].trim();
    if (!promptText) {
      continue;
    }

    prompts.push(promptText);
  }

  return { sharedContext, prompts };
}

function extractTopLevelSection(text: string, headingRegex: RegExp): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const collected: string[] = [];
  let collecting = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    const headingMatch = !collecting ? trimmed.match(headingRegex) : null;
    if (headingMatch) {
      collecting = true;
      const inlineValue = headingMatch[1]?.trim();
      if (inlineValue) {
        collected.push(inlineValue);
      }
      continue;
    }

    if (collecting && SECTION_BOUNDARY_HEADING_REGEX.test(trimmed)) {
      break;
    }

    if (collecting) {
      collected.push(line.replace(/^\s*[-*•]\s*/, ""));
    }
  }

  return collected.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function getPromptMarkerHeadings(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      const match = line.match(/^(\s*(?:PROMPT|SCENE|SHOT|CLIP)\s+\d+\s*(?:\([^)]+\))?:)/i);
      return match?.[1]?.trim() || "";
    })
    .filter(Boolean);
}

function collectJsonCandidates(text: string): string[] {
  const normalized = text.trim();
  if (!normalized) return [];

  const candidates = new Set<string>([normalized]);
  const fencedMatch = normalized.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch?.[1]) {
    candidates.add(fencedMatch[1].trim());
  }

  const firstBrace = normalized.indexOf("{");
  const lastBrace = normalized.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.add(normalized.slice(firstBrace, lastBrace + 1).trim());
  }

  return Array.from(candidates).filter(Boolean);
}

function parseJsonObjectCandidate(text: string): Record<string, unknown> | null {
  for (const candidate of collectJsonCandidates(text)) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function getNestedString(source: unknown, path: string[]): string {
  let current = source;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return "";
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current.trim() : "";
}

function extractStructuredVoiceoverScript(text: string): string {
  const parsed = parseJsonObjectCandidate(text);
  if (!parsed) return "";

  return (
    getNestedString(parsed, ["audioWorkflow", "voiceoverScript"]) ||
    getNestedString(parsed, ["audioWorkflow", "voiceover_script"]) ||
    getNestedString(parsed, ["audio_workflow", "voiceoverScript"]) ||
    getNestedString(parsed, ["audio_workflow", "voiceover_script"]) ||
    getNestedString(parsed, ["voiceoverScript"]) ||
    getNestedString(parsed, ["voiceover_script"]) ||
    getNestedString(parsed, ["narrationScript"]) ||
    getNestedString(parsed, ["narration_script"]) ||
    ""
  );
}

function extractStructuredMusicBrief(text: string): string {
  const parsed = parseJsonObjectCandidate(text);
  if (!parsed) return "";

  return (
    getNestedString(parsed, ["audioWorkflow", "musicPrompt"]) ||
    getNestedString(parsed, ["audioWorkflow", "music_prompt"]) ||
    getNestedString(parsed, ["audio_workflow", "musicPrompt"]) ||
    getNestedString(parsed, ["audio_workflow", "music_prompt"]) ||
    getNestedString(parsed, ["audioWorkflow", "soundBedBrief"]) ||
    getNestedString(parsed, ["audioWorkflow", "sound_bed_brief"]) ||
    getNestedString(parsed, ["soundBedBrief"]) ||
    getNestedString(parsed, ["sound_bed_brief"]) ||
    getNestedString(parsed, ["musicPrompt"]) ||
    getNestedString(parsed, ["music_prompt"]) ||
    getNestedString(parsed, ["continuityPackage", "sharedSoundDesign"]) ||
    getNestedString(parsed, ["continuity_package", "sharedSoundDesign"]) ||
    getNestedString(parsed, ["continuity_package", "shared_sound_design"]) ||
    ""
  );
}

function isExternalAudioSectionHeading(line: string): boolean {
  return EXTERNAL_VOICEOVER_SECTION_HEADING_REGEX.test(line)
    || EXTERNAL_MUSIC_SECTION_HEADING_REGEX.test(line);
}

function stripTopLevelExternalAudioSections(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  let skipping = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (isExternalAudioSectionHeading(trimmed)) {
      skipping = true;
      continue;
    }

    if (skipping) {
      if (SECTION_BOUNDARY_HEADING_REGEX.test(trimmed)) {
        skipping = false;
        kept.push(line);
      }
      continue;
    }

    kept.push(line);
  }

  return kept.join("\n").trim();
}

/**
 * Replace or inject the shared continuity paragraph at the top of a multi-prompt script.
 * Keeps the existing prompt marker section intact so the script stays parseable.
 */
export function applySharedContextToMultiVideoText(text: string, sharedContext: string): string {
  const trimmed = text.trim();
  const normalizedSharedContext = sharedContext.trim();

  if (!trimmed) {
    return normalizedSharedContext ? `REFERENCE NOTES:\n${normalizedSharedContext}` : "";
  }

  const markerIndex = trimmed.search(MULTI_PROMPT_REGEX);
  if (markerIndex < 0) {
    return normalizedSharedContext
      ? `REFERENCE NOTES:\n${normalizedSharedContext}\n\n${trimmed}`
      : trimmed;
  }

  const promptSection = trimmed.slice(markerIndex).trimStart();
  if (!normalizedSharedContext) {
    return promptSection;
  }

  return `REFERENCE NOTES:\n${normalizedSharedContext}\n\n${promptSection}`;
}

/**
 * Split a multi-prompt video script into per-shot prompts.
 *
 * If a legacy prompt block has no continuity lock, prepend the shared preamble
 * so recurring character and setting details survive the split. Modern storyboard
 * prompts already carry a scene-specific Continuity Lock, so avoid prepending
 * long story bibles that can make each generated shot repeat the full arc.
 */
export function parseMultiVideoPrompts(text: string): string[] {
  const { sharedContext, prompts } = splitMultiVideoPromptOutput(text);
  if (prompts.length === 0) {
    return [];
  }

  return prompts.map((promptText) => {
    if (!sharedContext || CONTINUITY_LOCK_LINE_REGEX.test(promptText)) {
      return promptText;
    }
    return `${sharedContext}\n\n${promptText}`;
  });
}

/**
 * Remove review-only / provider-control metadata before sending text to image/video models.
 * Media Studio sends these controls through payload fields, so keeping them in the prompt
 * can make the model render or speak technical UI text.
 */
export function sanitizeMediaGenerationPromptText(text: string): string {
  const lines = stripTopLevelExternalAudioSections(text).replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      kept.push("");
      continue;
    }

    const promptMarkerMatch = line.match(PROMPT_MARKER_LINE_REGEX);
    if (promptMarkerMatch) {
      const inlinePrompt = promptMarkerMatch[1]?.trim();
      if (inlinePrompt) {
        kept.push(inlinePrompt);
      }
      continue;
    }

    if (
      NON_GENERATION_SHARED_SECTION_REGEX.test(line)
      || TECHNICAL_CONTROL_LINE_REGEX.test(line)
      || NEWS_BEAT_PLAN_LINE_REGEX.test(line)
    ) {
      continue;
    }

    let generationLine = line;
    if (UNRESOLVED_TEXT_OVERLAY_CONDITION_REGEX.test(generationLine)) {
      generationLine = generationLine.replace(UNRESOLVED_TEXT_OVERLAY_CONDITION_REGEX, STRONG_NO_TEXT_LINE);
    } else if (GENERIC_NO_TEXT_LINE_REGEX.test(generationLine)) {
      generationLine = generationLine.replace(GENERIC_NO_TEXT_LINE_REGEX, STRONG_NO_TEXT_LINE);
    }

    kept.push(generationLine);
  }

  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractQuotedDialogueFromLine(line: string): string | null {
  const directMatch = line.match(SPOKEN_DIALOGUE_LINE_REGEX);
  if (directMatch?.[1]?.trim()) {
    return directMatch[1].trim();
  }

  for (const regex of QUOTED_DIALOGUE_REGEXES) {
    const match = line.match(regex);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }

  return null;
}

export function extractVoiceoverScriptFromPromptText(text: string): string {
  const structuredVoiceoverScript = extractStructuredVoiceoverScript(text);
  if (structuredVoiceoverScript) {
    return structuredVoiceoverScript;
  }

  const topLevelVoiceoverScript = extractTopLevelSection(text, EXTERNAL_VOICEOVER_SECTION_HEADING_REGEX);
  if (topLevelVoiceoverScript) {
    return topLevelVoiceoverScript;
  }

  const { prompts } = splitMultiVideoPromptOutput(text);
  const sourceBlocks = prompts.length > 0 ? prompts : [text];
  const dialogueLines: string[] = [];

  for (const block of sourceBlocks) {
    for (const rawLine of block.replace(/\r\n/g, "\n").split("\n")) {
      const extracted = extractQuotedDialogueFromLine(rawLine.trim());
      if (extracted) {
        dialogueLines.push(extracted);
      }
    }
  }

  if (dialogueLines.length > 0) {
    return dialogueLines.join("\n");
  }

  return "";
}

export function extractMusicBriefFromPromptText(text: string): string {
  const structuredBrief = extractStructuredMusicBrief(text);
  if (structuredBrief) {
    return structuredBrief;
  }

  const explicitBrief = extractTopLevelSection(text, EXTERNAL_MUSIC_SECTION_HEADING_REGEX);
  if (explicitBrief) {
    return explicitBrief;
  }

  const sourceBlocks = splitMultiVideoPromptOutput(text).prompts;
  const blocks = sourceBlocks.length > 0 ? sourceBlocks : [text];
  const seen = new Set<string>();
  const soundDesignLines: string[] = [];

  for (const block of blocks) {
    for (const rawLine of block.replace(/\r\n/g, "\n").split("\n")) {
      const match = rawLine.match(/^\s*Sound Design\s*:\s*(.+?)\s*$/i);
      const value = match?.[1]?.trim();
      if (!value) {
        continue;
      }
      const normalized = value.toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        soundDesignLines.push(value);
      }
    }
  }

  return soundDesignLines.join("\n").trim();
}

export function prepareSilentVideoPromptForExternalAudio(text: string): string {
  const kept: string[] = [];
  for (const rawLine of sanitizeMediaGenerationPromptText(text).replace(/\r\n/g, "\n").split("\n")) {
    let line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      kept.push("");
      continue;
    }
    if (AUDIO_DIRECTION_LINE_REGEX.test(trimmed) || SPEAKER_LINE_REGEX.test(trimmed) || extractQuotedDialogueFromLine(trimmed)) {
      continue;
    }
    if (EXTERNAL_AUDIO_WORKFLOW_LINE_REGEX.test(trimmed)) {
      continue;
    }
    if (/visual-only (?:silent )?footage/i.test(trimmed) || /must not (?:speak|lip-sync|mouth words)/i.test(trimmed)) {
      continue;
    }
    if (/Only (?:the intended character or presenter|character|presenter) voice\./i.test(trimmed)) {
      kept.push(VISUAL_TEXT_RESTRICTION_LINE);
      continue;
    }
    if (HARD_EXTERNAL_NO_AUDIO_LINE_REGEX.test(trimmed) || TEXT_RESTRICTION_WITH_AUDIO_CONTROL_REGEX.test(trimmed)) {
      kept.push(VISUAL_TEXT_RESTRICTION_LINE);
      continue;
    }
    line = line
      .replace(/\bwhile speaking\b/gi, "with natural presenter gestures")
      .replace(/\bspeaking to camera\b/gi, "addressing the camera with natural gestures")
      .replace(/\bspeaks? to camera\b/gi, "addresses the camera with natural gestures")
      .replace(/\bspeaking\b/gi, "presenting visually")
      .replace(/\bspeaks?\b/gi, "presents visually")
      .replace(/\blip-sync(?:ing)?\b/gi, "natural facial expression")
      .replace(/\bnarrat(?:e|es|ing|ion)\b/gi, "present");
    kept.push(line);
  }

  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function prepareSilentVideoPromptDisplayForExternalAudio(text: string): string {
  const { sharedContext, prompts } = splitMultiVideoPromptOutput(text);
  if (prompts.length === 0) {
    return prepareSilentVideoPromptForExternalAudio(text);
  }

  const headings = getPromptMarkerHeadings(text);
  return prompts
    .map((promptText, index) => {
      const heading = headings[index] || `PROMPT ${index + 1}:`;
      const body = prepareSilentVideoPromptForExternalAudio(
        sharedContext ? `${sharedContext}\n\n${promptText}` : promptText,
      );
      return `${heading}\n${body}`.trim();
    })
    .join("\n\n")
    .trim();
}
