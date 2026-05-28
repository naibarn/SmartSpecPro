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
  includeSound?: boolean;
  soundBrief?: string | null;
}

export function storyboardPromptHasVeo31Sections(promptText: string): boolean {
  const text = cleanPromptText(promptText);
  return /Create an?\s+\d+(?:\.\d+)?-second cinematic video\./i.test(text)
    && /\nScene:\s*/i.test(`\n${text}`)
    && /\nAction:\s*/i.test(`\n${text}`)
    && /\nCamera:\s*/i.test(`\n${text}`)
    && /\nAudio:\s*/i.test(`\n${text}`);
}

function normalizeDurationSeconds(durationSeconds?: number | null): number {
  const value = Number(durationSeconds);
  if (!Number.isFinite(value) || value <= 0) return 8;
  return Math.round(value * 10) / 10;
}

function durationIntro(durationSeconds?: number | null): string {
  const value = normalizeDurationSeconds(durationSeconds);
  const text = Number.isInteger(value) ? String(value) : String(value);
  const article = /^8(?:\.|$)/.test(text) || /^11(?:\.|$)/.test(text) || /^18(?:\.|$)/.test(text)
    ? "an"
    : "a";
  return `Create ${article} ${text}-second cinematic video.`;
}

function describeFrameRoles(frameRoles?: readonly string[] | null): string {
  const roles = Array.isArray(frameRoles) && frameRoles.length >= 2 ? frameRoles : ["start", "stop"];
  const firstRole = roles[0] === "reference" ? "reference image" : roles[0] === "stop" ? "stop/end frame" : "start frame";
  const secondRole = roles[1] === "reference" ? "reference image" : roles[1] === "start" ? "start frame" : "stop/end frame";
  return `Use @Image1 as the ${firstRole} and @Image2 as the ${secondRole}.`;
}

function dialogueTargetSeconds(durationSeconds?: number | null): number {
  const duration = normalizeDurationSeconds(durationSeconds);
  const target = duration <= 12 ? duration : duration - 1;
  return Math.round(Math.max(1, target) * 2) / 2;
}

function buildDialoguePacingRule(
  durationSeconds: number | null | undefined,
  speechMode: StoryboardPromptSpeechMode,
  speechLanguage?: string | null,
): string {
  const targetSeconds = dialogueTargetSeconds(durationSeconds);
  const secondsLabel = isThaiSpeechMode(speechMode, speechLanguage) ? `${targetSeconds} วินาที` : `${targetSeconds} seconds`;
  return `Dialogue pacing: aim for the spoken line to fill about ${secondsLabel} of the clip at a natural pace, with no rushed delivery and no abrupt early cutoff.`;
}

function buildAudioSection(input: BuildVeo31StoryboardVideoPromptInput, hasVoiceover: boolean): string {
  const soundBrief = compactInlineText(input.soundBrief ?? "");
  const lines = input.includeSound && soundBrief
    ? ["Native audio."]
    : hasVoiceover
      ? ["Native dialogue audio only."]
      : ["No audio."];

  if (input.includeSound && soundBrief) {
    lines.push(`Sound design: ${soundBrief}`);
    lines.push("Keep sound low and clear so it never overpowers speech.");
  } else if (hasVoiceover) {
    lines.push("Do not add background music, sound effects, foley, room tone, or ambient/environment audio.");
  } else {
    lines.push("Do not add background music, sound effects, foley, room tone, or ambient/environment audio.");
  }

  if (hasVoiceover) {
    if (isThaiSpeechMode(input.speechMode, input.speechLanguage)) {
      lines.push("Dialogue must be spoken in natural Thai, central Thai accent.");
    } else if (isEnglishSpeechMode(input.speechMode, input.speechLanguage)) {
      lines.push("Dialogue must be spoken in natural English with a soft American accent.");
    } else {
      const language = String(input.speechLanguage ?? "").trim() || "the requested language";
      lines.push(`Dialogue must be spoken naturally in ${language}.`);
    }
    lines.push("Lip-sync the dialogue clearly.");
    lines.push(buildDialoguePacingRule(input.durationSeconds, input.speechMode, input.speechLanguage));
    lines.push("No subtitles. No extra dialogue.");
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
  lines.push("Lip-sync the dialogue clearly.");
  lines.push(buildDialoguePacingRule(durationSeconds, speechMode, speechLanguage));
  lines.push("No subtitles. No extra dialogue.");
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
  const voiceoverScript = cleanSpokenText(input.voiceoverScript ?? extractStoryboardNativeSpeechText(visualPrompt));
  const hasVoiceover = Boolean(input.includeVoiceover && voiceoverScript && String(input.speechMode ?? "none") !== "none");

  if (storyboardPromptHasVeo31Sections(visualPrompt)) {
    let prompt = visualPrompt;
    const soundBrief = compactInlineText(input.soundBrief ?? "");
    if (!input.includeSound) {
      prompt = replacePromptSection(prompt, "Audio", buildAudioSection(input, hasVoiceover));
    }
    if (input.includeSound && soundBrief && !prompt.toLowerCase().includes(soundBrief.toLowerCase().slice(0, 48))) {
      prompt = appendLineToSection(prompt, "Audio", `Sound design: ${soundBrief} Keep sound low and clear so it never overpowers speech.`);
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

  const conceptDetails = compactInlineText(input.conceptDetails ?? "");
  const storyboardGuide = compactInlineText(input.storyboardGuide ?? "");
  const aspectRatio = String(input.aspectRatio ?? "").trim();
  const action = visualPrompt || "Create a precise storyboard image-to-video movement from the attached reference frames.";
  const frameRoleLine = describeFrameRoles(input.frameRoles);

  return [
    durationIntro(input.durationSeconds),
    "",
    "Scene:",
    [
      "Use the attached storyboard frames as the visual truth for the location, product, people, props, mood, and atmosphere.",
      conceptDetails ? `Creative context: ${conceptDetails}` : "",
    ].filter(Boolean).join(" "),
    "",
    "Characters:",
    hasVoiceover
      ? "Use only the visible person, hands, or natural presenter implied by the reference frames. Keep identity, wardrobe, and product scale consistent. Do not introduce new characters."
      : "Use only people or hands visible in the reference frames. Keep identity, wardrobe, and product scale consistent. Do not introduce new characters.",
    "",
    "Action:",
    [action, storyboardGuide ? `Storyboard guide for shot order and continuity: ${storyboardGuide}` : ""].filter(Boolean).join(" "),
    "",
    "Camera:",
    [
      frameRoleLine,
      aspectRatio ? `Compose for ${aspectRatio}.` : "",
      "Use a smooth cinematic camera move that fits the shot duration and preserves continuity between the endpoint frames.",
    ].filter(Boolean).join(" "),
    "",
    "Lighting / Style:",
    "Realistic ecommerce cinematic style, clean product fidelity, natural depth, consistent colors, and lighting that matches the reference frames.",
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
