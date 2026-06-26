export type StoryboardPromptSpeechMode = "none" | "en" | "th" | "other" | string | null | undefined;

function cleanSpokenText(text: string): string {
  return text
    .replace(/^\s*(?:VOICEOVER SCRIPT|NARRATION SCRIPT|AUDIO SCRIPT)\s*:\s*/i, "")
    .replace(/^\s*(?:ผู้ประกาศ|ตัวละคร|speaker|presenter|host|narrator|character)\s*/i, "")
    .replace(/^\s*(?:พูดเป็นภาษาไทยว่า|speaks?\s+in\s+[A-Za-z() ]+\s*:|says?|speaks?|กล่าวว่า)\s*/i, "")
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanStoryboardVoiceoverShotSegment(text: string): string {
  return cleanSpokenText(
    text
      .replace(/^\s*(?:shot|scene|clip|ช็อต|ซีน)\s*\d{1,2}\s*[\).:\-–]?\s*/i, "")
      .replace(/^\s*\d{1,2}\s*[\).:\-–]\s*/i, "")
      .replace(/^\s*\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?\s*(?:s|sec|secs|second|seconds|วินาที)?\s*/i, "")
      .replace(/^\s*(?:เปิดปัญหา|ขยาย\s*pain\s*point|สินค้าเข้ามาแก้|ผลลัพธ์|ปิดการขาย|hook|problem|desire|proof|feature|cta)\s*:\s*/i, "")
  );
}

function splitVoiceoverSegmentNearMiddle(segment: string): [string, string] | null {
  const clean = cleanStoryboardVoiceoverShotSegment(segment);
  if (clean.length < 48) return null;
  const midpoint = clean.length / 2;
  const splitPoints = Array.from(clean.matchAll(/\s+/g))
    .map((match) => match.index ?? -1)
    .filter((index) => index >= 18 && clean.length - index >= 18)
    .sort((a, b) => Math.abs(a - midpoint) - Math.abs(b - midpoint));
  const splitAt = splitPoints[0];
  if (typeof splitAt !== "number") return null;
  const first = cleanStoryboardVoiceoverShotSegment(clean.slice(0, splitAt));
  const second = cleanStoryboardVoiceoverShotSegment(clean.slice(splitAt));
  return first && second ? [first, second] : null;
}

function distributeVoiceoverSegmentsAcrossShots(segments: string[], shotCount: number): string[] {
  const count = Math.max(0, Math.floor(Number(shotCount) || 0));
  if (count === 0) return [];
  const cleanSegments = segments
    .map(cleanStoryboardVoiceoverShotSegment)
    .filter(Boolean);
  if (cleanSegments.length === 0) return Array.from({ length: count }, () => "");
  if (cleanSegments.length <= count) {
    const expandedSegments = [...cleanSegments];
    while (expandedSegments.length < count) {
      const longestIndex = expandedSegments
        .map((segment, index) => ({ segment, index }))
        .sort((a, b) => b.segment.length - a.segment.length)[0]?.index;
      if (typeof longestIndex !== "number") break;
      const split = splitVoiceoverSegmentNearMiddle(expandedSegments[longestIndex] ?? "");
      if (!split) break;
      expandedSegments.splice(longestIndex, 1, ...split);
    }
    return Array.from({ length: count }, (_, index) => expandedSegments[index] ?? "");
  }

  const totalLength = cleanSegments.reduce((sum, segment) => sum + segment.length, 0);
  const targetLength = Math.max(1, Math.ceil(totalLength / count));
  const result: string[] = [];
  let cursor = 0;
  for (let shotIndex = 0; shotIndex < count; shotIndex += 1) {
    const remainingShots = count - shotIndex;
    const remainingSegments = cleanSegments.length - cursor;
    const chunk: string[] = [];
    let chunkLength = 0;
    while (cursor < cleanSegments.length && remainingSegments - chunk.length > remainingShots - 1) {
      chunk.push(cleanSegments[cursor] ?? "");
      chunkLength += cleanSegments[cursor]?.length ?? 0;
      cursor += 1;
      if (chunkLength >= targetLength) break;
    }
    result.push(cleanStoryboardVoiceoverShotSegment(chunk.join(" ")));
  }
  return result;
}

export function splitStoryboardVoiceoverScriptByShot(script: string, shotCount: number): string[] {
  const count = Math.max(0, Math.floor(Number(shotCount) || 0));
  if (count === 0) return [];
  const rawScript = String(script ?? "")
    .replace(/^\s*(?:VOICEOVER SCRIPT BY SHOT|VOICEOVER SCRIPT|NARRATION SCRIPT|AUDIO SCRIPT)\s*:\s*/i, "")
    .trim();
  if (!rawScript) return Array.from({ length: count }, () => "");

  const markerNormalized = rawScript
    .replace(/(?:^|\s)((?:shot|scene|clip|ช็อต|ซีน)\s*\d{1,2}\s*[\).:\-–]?)/gi, "\n$1 ")
    .replace(/(?:^|\s)(\d{1,2}[\).]\s+(?=(?:\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?\s*(?:s|sec|secs|second|seconds|วินาที)?\s*)|[^\d]))/gi, "\n$1");
  const explicitSegments = markerNormalized
    .split(/\n+/)
    .map(cleanStoryboardVoiceoverShotSegment)
    .filter(Boolean);
  if (explicitSegments.length >= 2) {
    return distributeVoiceoverSegmentsAcrossShots(explicitSegments, count);
  }

  const lineSegments = rawScript
    .split(/\n+/)
    .map(cleanStoryboardVoiceoverShotSegment)
    .filter(Boolean);
  if (lineSegments.length >= 2) {
    return distributeVoiceoverSegmentsAcrossShots(lineSegments, count);
  }

  const sentenceSegments = rawScript
    .replace(/([.!?。！？]+)\s+/g, "$1\n")
    .replace(/((?:เลยค่ะ|เลยครับ|นะคะ|นะครับ|ค่ะ|ครับ|คะ|จ้า|จ่ะ))\s+/gu, "$1\n")
    .split(/\n+/)
    .map(cleanStoryboardVoiceoverShotSegment)
    .filter(Boolean);
  if (sentenceSegments.length >= 2) {
    return distributeVoiceoverSegmentsAcrossShots(sentenceSegments, count);
  }

  const words = rawScript.split(/\s+/).map(cleanStoryboardVoiceoverShotSegment).filter(Boolean);
  if (words.length > 1) {
    return distributeVoiceoverSegmentsAcrossShots(words, count);
  }

  return distributeVoiceoverSegmentsAcrossShots([rawScript], count);
}

function cleanPromptText(text: string): string {
  return String(text || "")
    .replace(/^```(?:text|prompt|markdown)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function compactInlineText(text: string): string {
  return cleanPromptText(text)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeStoryboardVideoPromptContract(text: string): string {
  return cleanPromptText(text)
    .replace(/^Create an?\s+\d+(?:\.\d+)?-second cinematic video\./i, "Create a cinematic video.")
    .replace(/\bFor\s+Veo\s+3\.1,\s*/gi, "")
    .replace(/\bVeo\s+3\.1 can finish a slightly longer line\.\s*/gi, "")
    .replace(/\s+Avoid a short 5-6 second line or silent tail\./gi, " Avoid a short line or silent tail.")
    .trim();
}

function compactPromptContext(text: string, maxLength = 320): string {
  const compacted = compactInlineText(text).replace(/\s+/g, " ").trim();
  if (compacted.length <= maxLength) return compacted;
  return `${compacted.slice(0, maxLength).replace(/[\s,.;:|-]+$/g, "").trim()}...`;
}

function normalizePromptContext(text: string): string {
  return compactInlineText(text).replace(/\s+/g, " ").trim().toLowerCase();
}

function promptContainsContext(promptText: string, contextText: string): boolean {
  const context = normalizePromptContext(contextText);
  if (context.length < 24) return false;
  return normalizePromptContext(promptText).includes(context);
}

function removeDuplicatedPromptContext(text: string, duplicateText: string): string {
  const value = compactInlineText(text);
  const duplicate = compactInlineText(duplicateText);
  if (!value || !duplicate || duplicate.length < 24) return value;
  return value
    .split(duplicate)
    .join("")
    .replace(/(?:^|\n)\s*(?:Concept and product facts|Product\/concept details)\s*:\s*(?=\n|$)/gi, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isThaiSpeechMode(speechMode: StoryboardPromptSpeechMode, speechLanguage?: string | null): boolean {
  const mode = String(speechMode ?? "").trim().toLowerCase();
  const language = String(speechLanguage ?? "").trim().toLowerCase();
  return mode === "th" || language === "thai" || language === "ไทย";
}

function isEnglishSpeechMode(speechMode: StoryboardPromptSpeechMode, speechLanguage?: string | null): boolean {
  const mode = String(speechMode ?? "").trim().toLowerCase();
  const language = String(speechLanguage ?? "").trim().toLowerCase();
  return mode === "en" || language === "english";
}

export function formatStoryboardNativeSpeechDirective(
  spokenText: string,
  speechMode: StoryboardPromptSpeechMode,
  speechLanguage?: string | null,
): string {
  const cleaned = cleanSpokenText(spokenText);
  if (!cleaned) return "";

  if (isThaiSpeechMode(speechMode, speechLanguage)) {
    return `พูดเป็นภาษาไทยว่า "${cleaned}"`;
  }

  if (isEnglishSpeechMode(speechMode, speechLanguage)) {
    return `The presenter speaks in English: "${cleaned}"`;
  }

  const language = String(speechLanguage ?? "").trim();
  return language
    ? `The presenter speaks in ${language}: "${cleaned}"`
    : `The presenter says: "${cleaned}"`;
}

export function extractStoryboardNativeSpeechText(promptText: string): string {
  const text = String(promptText || "");
  const patterns = [
    /พูดเป็นภาษาไทยว่า\s*["“]([^"”]+)["”]/i,
    /says\s+in\s+thai[^:"“”]*:\s*["“]([^"”]+)["”]/i,
    /replies\s+in\s+thai[^:"“”]*:\s*["“]([^"”]+)["”]/i,
    /(?:the\s+)?presenter\s+speaks\s+in\s+english\s*:\s*["“]([^"”]+)["”]/i,
    /says\s*,?\s*[^:"“”]*:\s*["“]([^"”]+)["”]/i,
    /replies\s*,?\s*[^:"“”]*:\s*["“]([^"”]+)["”]/i,
    /(?:the\s+)?presenter\s+speaks\s+in\s+[^:]+:\s*["“]([^"”]+)["”]/i,
    /(?:the\s+)?presenter\s+says\s*:\s*["“]([^"”]+)["”]/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1]?.trim();
    if (value) return cleanSpokenText(value);
  }

  return "";
}

export function storyboardPromptHasNativeSpeechDirective(promptText: string): boolean {
  return Boolean(extractStoryboardNativeSpeechText(promptText));
}

export function appendNativeSpeechDirectiveToStoryboardPrompt(
  promptText: string,
  spokenText: string,
  speechMode: StoryboardPromptSpeechMode,
  speechLanguage?: string | null,
): string {
  const prompt = String(promptText || "").trim();
  if (!prompt) return prompt;
  if (storyboardPromptHasNativeSpeechDirective(prompt)) return prompt;

  const directive = formatStoryboardNativeSpeechDirective(spokenText, speechMode, speechLanguage);
  return directive ? `${prompt}\n\n${directive}` : prompt;
}

export interface BuildVeo31StoryboardVideoPromptInput {
  visualPrompt: string;
  durationSeconds?: number | null;
  aspectRatio?: string | null;
  frameRoles?: readonly string[] | null;
  conceptDetails?: string | null;
  storyboardGuide?: string | null;
  includeVoiceover?: boolean;
  speechMode?: StoryboardPromptSpeechMode;
  speechLanguage?: string | null;
  voiceoverScript?: string | null;
  voiceBrief?: string | null;
  includeSound?: boolean;
  soundBrief?: string | null;
}

export interface BuildCompactStoryboardReviewVideoPromptInput extends BuildVeo31StoryboardVideoPromptInput {
  maxCharacters?: number | null;
}

const DEFAULT_COMPACT_STORYBOARD_REVIEW_VIDEO_PROMPT_MAX_CHARS = 2000;

export function storyboardPromptHasVeo31Sections(promptText: string): boolean {
  const text = sanitizeStoryboardVideoPromptContract(promptText);
  return /Create (?:a cinematic video|an?\s+\d+(?:\.\d+)?-second cinematic video)\./i.test(text)
    && /\nScene:\s*/i.test(`\n${text}`)
    && /\nAction:\s*/i.test(`\n${text}`)
    && /\nCamera:\s*/i.test(`\n${text}`)
    && /\nAudio:\s*/i.test(`\n${text}`);
}

function durationIntro(durationSeconds?: number | null): string {
  void durationSeconds;
  return "Create a cinematic video.";
}

function describeFrameRoles(frameRoles?: readonly string[] | null): string {
  const roles = Array.isArray(frameRoles) && frameRoles.length > 0 ? frameRoles : ["start", "stop"];
  const describeRole = (role: string | undefined) => {
    if (role === "reference") return "reference image";
    if (role === "single_storyboard") return "single storyboard frame";
    if (role === "product_reference") return "product reference image";
    if (role === "stop") return "stop/end frame";
    return "start frame";
  };
  if (roles.length === 1) return `Use @Image1 as ${describeRole(roles[0])}.`;
  const firstRole = describeRole(roles[0]);
  const secondRole = describeRole(roles[1]);
  return `Use @Image1 as ${firstRole} and @Image2 as ${secondRole}.`;
}

function describeCompactFrameRoles(frameRoles?: readonly string[] | null): string {
  const roles = Array.isArray(frameRoles) && frameRoles.length > 0 ? frameRoles : ["start", "stop"];
  const describeRole = (role: string | undefined) => {
    if (role === "reference") return "reference image";
    if (role === "single_storyboard") return "single storyboard frame";
    if (role === "product_reference") return "product reference image";
    if (role === "stop") return "stop/end frame";
    return "start frame";
  };
  if (roles.length === 1) return `Use @Image1 as ${describeRole(roles[0])}.`;
  return `Use @Image1 as ${describeRole(roles[0])}. Use @Image2 as ${describeRole(roles[1])}.`;
}

function buildDialoguePacingRule(
  durationSeconds: number | null | undefined,
  speechMode: StoryboardPromptSpeechMode,
  speechLanguage?: string | null,
): string {
  void durationSeconds;
  void speechMode;
  void speechLanguage;
  return "Dialogue pacing: write enough spoken content for the selected clip duration and avoid a short line or silent tail.";
}

function buildAudioSection(input: BuildVeo31StoryboardVideoPromptInput, hasVoiceover: boolean): string {
  const soundBrief = compactInlineText(input.soundBrief ?? "");
  const voiceBrief = compactInlineText(input.voiceBrief ?? "");
  const lines = input.includeSound && soundBrief
    ? ["Native audio."]
    : hasVoiceover
      ? ["Native dialogue audio only."]
      : ["No audio."];

  if (input.includeSound && soundBrief) {
    lines.push(`Sound design: ${soundBrief}`);
    lines.push("Keep speech clear.");
    lines.push("No background music, jingles, copyrighted melodies, or song-like beds.");
  } else if (hasVoiceover) {
    lines.push("Do not add background music, sound effects, foley, room tone, or ambient/environment audio.");
  } else {
    lines.push("Do not add background music, sound effects, foley, room tone, or ambient/environment audio.");
  }

  if (hasVoiceover) {
    lines.push(
      voiceBrief
        ? `Voice: ${voiceBrief}`
        : "Voice: warm, trustworthy Thai female presenter; calm, friendly ecommerce review tone."
    );
    if (isThaiSpeechMode(input.speechMode, input.speechLanguage)) {
      lines.push("Dialogue must be spoken in natural Thai, central Thai accent.");
    } else if (isEnglishSpeechMode(input.speechMode, input.speechLanguage)) {
      lines.push("Dialogue must be spoken in natural English with a soft American accent.");
    } else {
      const language = String(input.speechLanguage ?? "").trim() || "the requested language";
      lines.push(`Dialogue must be spoken naturally in ${language}.`);
    }
    lines.push("Lip-sync clearly.");
    lines.push(buildDialoguePacingRule(input.durationSeconds, input.speechMode, input.speechLanguage));
    lines.push("No subtitles or extra dialogue.");
  } else {
    lines.push("No spoken dialogue.");
    lines.push("No subtitles.");
  }

  return lines.join(" ");
}

function replacePromptSection(promptText: string, sectionName: string, sectionContent: string): string {
  const prompt = cleanPromptText(promptText);
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nextSectionPattern = "\\n(?:Scene|Characters|Action|Camera|Lighting\\s*/\\s*Style|Audio|Dialogue):\\s*";
  const sectionPattern = new RegExp(`(\\n?${escaped}:\\s*)([\\s\\S]*?)(?=${nextSectionPattern}|$)`, "i");
  if (!sectionPattern.test(prompt)) {
    return `${prompt}\n\n${sectionName}:\n${sectionContent}`.trim();
  }
  return prompt.replace(sectionPattern, (_match, prefix: string) => `${prefix}\n${sectionContent}\n`).trim();
}

function buildDialogueAudioRules(
  speechMode: StoryboardPromptSpeechMode,
  speechLanguage?: string | null,
  durationSeconds?: number | null,
): string {
  const lines: string[] = [];
  if (isThaiSpeechMode(speechMode, speechLanguage)) {
    lines.push("Dialogue must be spoken in natural Thai, central Thai accent.");
  } else if (isEnglishSpeechMode(speechMode, speechLanguage)) {
    lines.push("Dialogue must be spoken in natural English with a soft American accent.");
  } else {
    const language = String(speechLanguage ?? "").trim() || "the requested language";
    lines.push(`Dialogue must be spoken naturally in ${language}.`);
  }
  lines.push("Lip-sync clearly.");
  lines.push(buildDialoguePacingRule(durationSeconds, speechMode, speechLanguage));
  lines.push("No subtitles or extra dialogue.");
  return lines.join(" ");
}

function buildDialogueSection(
  spokenText: string,
  speechMode: StoryboardPromptSpeechMode,
  speechLanguage?: string | null,
): string {
  const cleaned = cleanSpokenText(spokenText);
  if (!cleaned) return "No spoken dialogue.";

  if (isThaiSpeechMode(speechMode, speechLanguage)) {
    return `Presenter พูดเป็นภาษาไทยว่า "${cleaned}"`;
  }

  if (isEnglishSpeechMode(speechMode, speechLanguage)) {
    return `Presenter says, clearly: "${cleaned}"`;
  }

  const language = String(speechLanguage ?? "").trim();
  return language
    ? `Presenter says in ${language}, clearly: "${cleaned}"`
    : `Presenter says, clearly: "${cleaned}"`;
}

function extractVeoPromptSection(promptText: string, sectionName: string): string {
  const prompt = cleanPromptText(promptText);
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nextSectionPattern = "\\n(?:Scene|Characters|Action|Camera|Lighting\\s*/\\s*Style|Audio|Dialogue):\\s*";
  const sectionPattern = new RegExp(`(?:^|\\n)${escaped}:\\s*([\\s\\S]*?)(?=${nextSectionPattern}|$)`, "i");
  return sectionPattern.exec(prompt)?.[1]?.trim() ?? "";
}

function compactSpokenText(text: string, maxLength: number): string {
  const cleaned = cleanSpokenText(text);
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength).replace(/[\s,.;:!?|-]+$/g, "").trim();
}

const STORYBOARD_REVIEW_STATIC_CONTEXT_LINE_PATTERN =
  /\b(?:USER-SELECTED CREATIVE DIRECTION LOCK|PRODUCT FACTS LOCK|Product metadata|Marketplace product metadata|Production Director concept|Production concept|Concept and product facts|Storyboard guide|Options|User-selected visual details|User-selected character brief|Character brief|Prop details|Storytelling structure|Price signal|Rating signal|Sold signal)\b/i;

function sanitizeCompactStoryboardReviewMotionText(text: string): string {
  return sanitizeStoryboardVideoPromptContract(text)
    .replace(/^Create an?\s+\d+(?:\.\d+)?-second cinematic video\.?/i, "")
    .replace(/(?:^|\n)\s*(?:Scene|Characters|Action|Camera|Lighting\s*\/\s*Style|Audio|Dialogue):\s*/gi, "\n")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !STORYBOARD_REVIEW_STATIC_CONTEXT_LINE_PATTERN.test(line))
    .join(" ")
    .replace(/\b(?:USER-SELECTED CREATIVE DIRECTION LOCK|PRODUCT FACTS LOCK|User-selected visual details|User-selected character brief|Prop details)\s*:\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildCompactStoryboardReviewVideoPrompt(input: BuildCompactStoryboardReviewVideoPromptInput): string {
  const visualPrompt = compactInlineText(input.visualPrompt);
  if (!visualPrompt) return "";

  const wantsVoiceover = String(input.speechMode ?? "none").trim() !== "none";
  const rawVoiceoverScript =
    cleanSpokenText(input.voiceoverScript ?? "") ||
    extractStoryboardNativeSpeechText(visualPrompt);
  const hasVoiceover = Boolean(wantsVoiceover && rawVoiceoverScript);
  const rawAction = extractVeoPromptSection(visualPrompt, "Action")
    || sanitizeCompactStoryboardReviewMotionText(visualPrompt);
  const rawCamera = extractVeoPromptSection(visualPrompt, "Camera");
  const motionSource = sanitizeCompactStoryboardReviewMotionText(rawAction);
  if (!motionSource) return "";

  const aspectRatio = String(input.aspectRatio ?? "").trim();
  const frameRoleLine = describeCompactFrameRoles(input.frameRoles);
  const requestedMaxCharacters = Number(input.maxCharacters ?? DEFAULT_COMPACT_STORYBOARD_REVIEW_VIDEO_PROMPT_MAX_CHARS);
  const maxCharacters = Number.isFinite(requestedMaxCharacters)
    ? Math.max(800, Math.min(4000, Math.floor(requestedMaxCharacters)))
    : DEFAULT_COMPACT_STORYBOARD_REVIEW_VIDEO_PROMPT_MAX_CHARS;

  const buildWithBudgets = (budgets: {
    action: number;
    camera: number;
    sound: number;
    voiceover: number;
  }): string => {
    const action = compactPromptContext(motionSource, budgets.action);
    const cameraSource = sanitizeCompactStoryboardReviewMotionText(rawCamera);
    const camera = compactPromptContext(cameraSource, budgets.camera);
    const soundBrief = budgets.sound > 0 ? compactPromptContext(input.soundBrief ?? "", budgets.sound) : "";
    const voiceoverScript = compactSpokenText(rawVoiceoverScript, budgets.voiceover);
    const compactInput: BuildVeo31StoryboardVideoPromptInput = {
      ...input,
      soundBrief,
      voiceoverScript,
    };

    return [
      durationIntro(input.durationSeconds),
      "",
      "Scene:",
      `${frameRoleLine} Frames define the product, people, props, location, lighting, and final look; do not redesign or re-describe static details.`,
      "",
      "Characters:",
      "Use only people or hands already visible in the frames. Preserve identity, wardrobe, age impression, and product scale. Do not add new people.",
      "",
      "Action:",
      `${action} Animate only the visible transition/action between the two frame endpoints.`,
      "",
      "Camera:",
      [
        camera || "Use a restrained cinematic move that fits the endpoint change.",
        aspectRatio ? `Compose for ${aspectRatio}.` : "",
        "Preserve exact start/stop continuity and avoid new captions, UI, price badges, or readable text.",
      ].filter(Boolean).join(" "),
      "",
      "Lighting / Style:",
      "Match the reference frames with realistic ecommerce cinematic lighting, natural depth, clean product fidelity, and consistent color.",
      "",
      "Audio:",
      buildAudioSection(compactInput, hasVoiceover),
      "",
      "Dialogue:",
      hasVoiceover
        ? buildDialogueSection(voiceoverScript, input.speechMode, input.speechLanguage)
        : "No spoken dialogue.",
    ].join("\n").trim();
  };

  const budgetOptions = [
    { action: 520, camera: 220, sound: 180, voiceover: 420 },
    { action: 360, camera: 160, sound: 120, voiceover: 320 },
    { action: 260, camera: 120, sound: 80, voiceover: 260 },
  ];
  for (const budgets of budgetOptions) {
    const prompt = buildWithBudgets(budgets);
    if (prompt.length <= maxCharacters) return prompt;
  }

  const compactPrompt = buildWithBudgets({ action: 180, camera: 90, sound: 0, voiceover: 220 });
  return compactPrompt.length <= maxCharacters
    ? compactPrompt
    : compactPrompt.slice(0, maxCharacters).replace(/\s+\S*$/, "").trim();
}

function appendLineToSection(promptText: string, sectionName: string, line: string): string {
  const prompt = cleanPromptText(promptText);
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sectionPattern = new RegExp(`(\\n${escaped}:\\s*)`, "i");
  if (!sectionPattern.test(`\n${prompt}`)) {
    return `${prompt}\n\n${sectionName}:\n${line}`.trim();
  }
  return `${prompt}\n${line}`.trim();
}

export function buildVeo31StoryboardVideoPrompt(input: BuildVeo31StoryboardVideoPromptInput): string {
  const visualPrompt = compactInlineText(input.visualPrompt);
  const wantsVoiceover = Boolean(
    input.includeVoiceover && String(input.speechMode ?? "none") !== "none"
  );
  const fallbackVoiceover = isThaiSpeechMode(input.speechMode, input.speechLanguage)
    ? "เล่าให้เห็นปัญหาและประโยชน์ของสินค้านี้อย่างชัดเจน"
    : "Explain the product problem and benefit clearly.";
  const voiceoverScript =
    cleanSpokenText(input.voiceoverScript ?? extractStoryboardNativeSpeechText(visualPrompt)) ||
    (wantsVoiceover ? fallbackVoiceover : "");
  const hasVoiceover = Boolean(wantsVoiceover && voiceoverScript);

  if (storyboardPromptHasVeo31Sections(visualPrompt)) {
    let prompt = sanitizeStoryboardVideoPromptContract(visualPrompt);
    const soundBrief = compactInlineText(input.soundBrief ?? "");
    const existingAudioConflicts =
      /\nAudio:\s*\n?\s*No audio\./i.test(`\n${prompt}`) ||
      /\nDialogue:\s*\n?\s*No spoken dialogue\./i.test(`\n${prompt}`);
    if (!input.includeSound || existingAudioConflicts) {
      prompt = replacePromptSection(prompt, "Audio", buildAudioSection(input, hasVoiceover));
    }
    if (hasVoiceover && existingAudioConflicts) {
      prompt = replacePromptSection(
        prompt,
        "Dialogue",
        buildDialogueSection(voiceoverScript, input.speechMode, input.speechLanguage),
      );
    }
    if (input.includeSound && soundBrief && !prompt.toLowerCase().includes(soundBrief.toLowerCase().slice(0, 48))) {
      prompt = appendLineToSection(prompt, "Audio", `Sound design: ${soundBrief} Keep speech clear.`);
    }
    const voiceBrief = compactInlineText(input.voiceBrief ?? "");
    if (hasVoiceover && voiceBrief && !prompt.toLowerCase().includes(voiceBrief.toLowerCase().slice(0, 48))) {
      prompt = appendLineToSection(prompt, "Audio", `Voice: ${voiceBrief}`);
    }
    if (hasVoiceover && !/Dialogue must be spoken/i.test(prompt)) {
      prompt = appendLineToSection(prompt, "Audio", buildDialogueAudioRules(input.speechMode, input.speechLanguage, input.durationSeconds));
    } else if (hasVoiceover && !/Dialogue pacing:/i.test(prompt)) {
      prompt = appendLineToSection(prompt, "Audio", buildDialoguePacingRule(input.durationSeconds, input.speechMode, input.speechLanguage));
    }
    if (hasVoiceover && !storyboardPromptHasNativeSpeechDirective(prompt)) {
      prompt = appendLineToSection(
        prompt,
        "Dialogue",
        buildDialogueSection(voiceoverScript, input.speechMode, input.speechLanguage),
      );
    }
    return prompt;
  }

  const rawConceptDetails = compactInlineText(input.conceptDetails ?? "");
  const rawStoryboardGuide = compactInlineText(input.storyboardGuide ?? "");
  const aspectRatio = String(input.aspectRatio ?? "").trim();
  const action = visualPrompt || "Create a precise storyboard image-to-video movement from the attached reference frames.";
  const frameRoleLine = describeFrameRoles(input.frameRoles);
  const isSingleStoryboardFrame = Array.isArray(input.frameRoles)
    && input.frameRoles.length === 1
    && input.frameRoles[0] === "single_storyboard";
  const conceptDetails = promptContainsContext(action, rawConceptDetails)
    ? ""
    : compactPromptContext(rawConceptDetails);
  const storyboardGuide = compactPromptContext(removeDuplicatedPromptContext(rawStoryboardGuide, rawConceptDetails), 240);

  return [
    durationIntro(input.durationSeconds),
    "",
    "Scene:",
    [
      "Frames are visual truth for location, product, people, props, mood, and atmosphere.",
      conceptDetails ? `Creative context: ${conceptDetails}` : "",
    ].filter(Boolean).join(" "),
    "",
    "Characters:",
    hasVoiceover
      ? "Use only visible person, hands, or presenter implied by frames. Keep identity, wardrobe, product scale. No new characters."
      : "Use only people or hands visible in frames. Keep identity, wardrobe, product scale. No new characters.",
    "",
    "Action:",
    [action, storyboardGuide ? `Guide: ${storyboardGuide}` : ""].filter(Boolean).join(" "),
    "",
    "Camera:",
    [
      frameRoleLine,
      aspectRatio ? `Compose for ${aspectRatio}.` : "",
      isSingleStoryboardFrame
        ? "Use a subtle cinematic move from the storyboard frame, preserving composition, product geometry, character identity, lighting, and environment; do not invent a second endpoint."
        : "Use a smooth move that fits duration and preserves endpoint continuity.",
    ].filter(Boolean).join(" "),
    "",
    "Lighting / Style:",
    "Realistic ecommerce cinematic style, clean product fidelity, natural depth, consistent colors, matching reference lighting.",
    "",
    "Audio:",
    buildAudioSection(input, hasVoiceover),
    "",
    "Dialogue:",
    hasVoiceover
      ? buildDialogueSection(voiceoverScript, input.speechMode, input.speechLanguage)
      : "No spoken dialogue.",
  ].join("\n");
}
