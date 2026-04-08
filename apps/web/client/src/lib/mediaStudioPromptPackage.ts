export interface MediaStudioPromptPackage {
  promptText: string;
  referenceNotes: string;
  continuityNotes: string;
  promptSequence: string[];
  source: "structured_json" | "plain_text" | "unknown";
}

const PROMPT_MARKER_REGEX = /^(PROMPT|SCENE|SHOT|CLIP)\s+\d+\s*(?:\([^)]+\))?:\s*(.*)$/i;
const NOTE_HEADING_REGEX = /(?:^|\n)\s*(Continuity Notes|Reference Notes|Shared Continuity Preamble)\s*:\s*/gi;
const REFERENCE_NOTES_ABSENCE_LINE_PATTERNS = [
  /^\s*[-*•]?\s*ไม่มี(?:ภาพ|รูป|ไฟล์)(?:อ้างอิง)?(?:ที่(?:แนบมา|อัปโหลด|ใช้ในฉากนี้|ใช้ในคลิปนี้))?\.?\s*$/i,
  /^\s*[-*•]?\s*ไม่มีภาพอ้างอิง(?:ที่(?:แนบมา|อัปโหลด|ใช้ในฉากนี้|ใช้ในคลิปนี้))?\.?\s*$/i,
  /^\s*[-*•]?\s*no (?:uploaded )?(?:reference images?|reference files?|reference handles?|image handles?) (?:were |was )?(?:provided|attached|used)(?: because no reference images were attached)?\.?\s*$/i,
  /^\s*[-*•]?\s*there (?:are|were) no (?:uploaded )?(?:reference images?|reference files?)\.?\s*$/i,
];
const REFERENCE_NOTES_ABSENCE_PREFIX_PATTERNS = [
  /^\s*no (?:uploaded )?(?:reference images?|reference files?) (?:were |was )?(?:provided|attached|used)(?: because no reference images were attached)?\.?\s*/i,
  /^\s*there (?:are|were) no (?:uploaded )?(?:reference images?|reference files?)\.?\s*/i,
  /^\s*ไม่มี(?:ภาพ|รูป|ไฟล์)(?:อ้างอิง)?(?:ที่(?:แนบมา|อัปโหลด|ใช้ในฉากนี้|ใช้ในคลิปนี้))?\.?\s*/i,
];

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLineBreaks(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function stripReferenceAbsenceBoilerplate(value: string): string {
  if (!value) return "";

  let sanitized = normalizeLineBreaks(value);
  for (const pattern of REFERENCE_NOTES_ABSENCE_PREFIX_PATTERNS) {
    sanitized = sanitized.replace(pattern, "");
  }

  const filteredLines = sanitized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      return !REFERENCE_NOTES_ABSENCE_LINE_PATTERNS.some((pattern) => pattern.test(line));
    });

  return filteredLines.join("\n").trim();
}

function sanitizeReferenceNotes(value: unknown): string {
  return stripReferenceAbsenceBoilerplate(trimText(value));
}

function collectJsonCandidates(text: string): string[] {
  const normalized = normalizeLineBreaks(text);
  if (!normalized) return [];

  const candidates = new Set<string>([normalized]);
  const fencedMatch = normalized.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch?.[1]) {
    candidates.add(normalizeLineBreaks(fencedMatch[1]));
  }

  const firstBrace = normalized.indexOf("{");
  const lastBrace = normalized.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.add(normalized.slice(firstBrace, lastBrace + 1).trim());
  }

  return Array.from(candidates).filter(Boolean);
}

function extractSinglePromptSections(text: string): {
  promptText: string;
  continuityNotes: string;
  referenceNotes: string;
} {
  const normalized = normalizeLineBreaks(text);
  if (!normalized) {
    return { promptText: "", continuityNotes: "", referenceNotes: "" };
  }

  const matches = Array.from(normalized.matchAll(NOTE_HEADING_REGEX));
  if (matches.length === 0) {
    return { promptText: normalized, continuityNotes: "", referenceNotes: "" };
  }

  const promptText = normalized.slice(0, matches[0].index ?? 0).trim();
  let continuityNotes = "";
  let referenceNotes = "";

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? normalized.length) : normalized.length;
    const value = normalized.slice(start, end).trim();
    const heading = trimText(match[1]).toLowerCase();

    if (!value) continue;

    if (heading === "reference notes") {
      referenceNotes = value;
    } else {
      continuityNotes = value;
    }
  }

  return {
    promptText,
    continuityNotes,
    referenceNotes: sanitizeReferenceNotes(referenceNotes),
  };
}

function pickCommonOrFirst(values: string[]): string {
  const nonEmpty = values.map((value) => value.trim()).filter(Boolean);
  if (nonEmpty.length === 0) return "";

  const first = nonEmpty[0];
  if (nonEmpty.every((value) => value === first)) {
    return first;
  }

  return first;
}

function parsePlainTextPromptPackage(text: string): MediaStudioPromptPackage {
  const normalized = normalizeLineBreaks(text);
  if (!normalized) {
    return {
      promptText: "",
      referenceNotes: "",
      continuityNotes: "",
      promptSequence: [],
      source: "unknown",
    };
  }

  const lines = normalized.split("\n");
  const promptBlocks: Array<{ heading: string; content: string }> = [];
  let currentHeading = "";
  let currentLines: string[] = [];
  let prefixLines: string[] = [];
  let sawPromptMarker = false;

  const flushCurrent = () => {
    if (!currentHeading) return;
    promptBlocks.push({
      heading: currentHeading,
      content: currentLines.join("\n").trim(),
    });
    currentLines = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const markerMatch = line.match(PROMPT_MARKER_REGEX);
    if (markerMatch) {
      if (!sawPromptMarker) {
        prefixLines = currentLines.slice();
        currentLines = [];
        sawPromptMarker = true;
      } else {
        flushCurrent();
      }

      currentHeading = line.replace(/\s+$/, "");
      const inlinePrompt = trimText(markerMatch[2]);
      currentLines = inlinePrompt ? [inlinePrompt] : [];
      continue;
    }

    currentLines.push(line);
  }

  if (sawPromptMarker) {
    flushCurrent();
  }

  if (!sawPromptMarker) {
    const single = extractSinglePromptSections(normalized);
    return {
      promptText: single.promptText,
      continuityNotes: single.continuityNotes,
      referenceNotes: single.referenceNotes,
      promptSequence: single.promptText ? [single.promptText] : [],
      source: single.continuityNotes || single.referenceNotes ? "plain_text" : "unknown",
    };
  }

  const prefixSections = extractSinglePromptSections(prefixLines.join("\n").trim());
  const promptSequence = promptBlocks.map((block) => {
    const parsed = extractSinglePromptSections(block.content);
    return parsed.promptText ? `${block.heading}\n${parsed.promptText}`.trim() : block.heading;
  });

  const blockContinuityNotes = promptBlocks
    .map((block) => extractSinglePromptSections(block.content).continuityNotes)
    .filter(Boolean);
  const blockReferenceNotes = promptBlocks
    .map((block) => extractSinglePromptSections(block.content).referenceNotes)
    .filter(Boolean);

  const continuityNotes = prefixSections.continuityNotes || pickCommonOrFirst(blockContinuityNotes);
  const referenceNotes = prefixSections.referenceNotes || pickCommonOrFirst(blockReferenceNotes);

  return {
    promptText: promptSequence.join("\n\n").trim(),
    continuityNotes,
    referenceNotes: sanitizeReferenceNotes(referenceNotes),
    promptSequence: promptSequence.map((prompt) => prompt.trim()).filter(Boolean),
    source: "plain_text",
  };
}

function parseStructuredJsonPromptPackage(text: string): MediaStudioPromptPackage | null {
  let parsed: any;
  const jsonCandidate = collectJsonCandidates(text).find((candidate) => {
    try {
      parsed = JSON.parse(candidate);
      return true;
    } catch {
      return false;
    }
  });

  if (!jsonCandidate) {
    return null;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const promptSequenceItems = Array.isArray(parsed.prompt_sequence) ? parsed.prompt_sequence : [];
  const promptSequence = promptSequenceItems
    .map((item: any, index: number) => {
      const promptBody = trimText(item?.prompt) || trimText(item?.prompt_text) || trimText(item?.final_prompt);
      if (!promptBody) return "";
      const promptId = trimText(item?.prompt_id) || `Prompt ${index + 1}`;
      return promptSequenceItems.length > 1 ? `${promptId}\n${promptBody}` : promptBody;
    })
    .filter(Boolean);

  const fallbackFromFinalPrompt = trimText(parsed.final_prompt)
    ? parsePlainTextPromptPackage(trimText(parsed.final_prompt))
    : null;

  const continuityNotes =
    trimText(parsed?.continuity_package?.continuity_notes)
    || trimText(parsed?.continuity_notes)
    || trimText(promptSequenceItems[0]?.continuity_notes)
    || fallbackFromFinalPrompt?.continuityNotes
    || "";

  const referenceNotes =
    sanitizeReferenceNotes(parsed?.continuity_package?.reference_notes)
    || sanitizeReferenceNotes(parsed?.reference_notes)
    || sanitizeReferenceNotes(promptSequenceItems[0]?.reference_notes)
    || sanitizeReferenceNotes(fallbackFromFinalPrompt?.referenceNotes)
    || "";

  const promptText =
    promptSequence.join("\n\n").trim()
    || trimText(parsed.prompt)
    || trimText(parsed.prompt_text)
    || fallbackFromFinalPrompt?.promptText
    || trimText(parsed.short_prompt)
    || trimText(parsed.final_prompt);

  return {
    promptText,
    continuityNotes,
    referenceNotes,
    promptSequence: promptSequence.length > 0
      ? promptSequence
      : (fallbackFromFinalPrompt?.promptSequence ?? (promptText ? [promptText] : [])),
    source: "structured_json",
  };
}

export function parseMediaStudioPromptPackage(text: string): MediaStudioPromptPackage {
  const normalized = normalizeLineBreaks(text);
  if (!normalized) {
    return {
      promptText: "",
      referenceNotes: "",
      continuityNotes: "",
      promptSequence: [],
      source: "unknown",
    };
  }

  return parseStructuredJsonPromptPackage(normalized) ?? parsePlainTextPromptPackage(normalized);
}

export function composePromptWithNotes(input: {
  prompt: string;
  referenceNotes?: string | null;
  continuityNotes?: string | null;
}): string {
  const prompt = trimText(input.prompt);
  const referenceNotes = sanitizeReferenceNotes(input.referenceNotes);
  const continuityNotes = trimText(input.continuityNotes);

  return [
    prompt,
    referenceNotes ? `Reference Notes:\n${referenceNotes}` : "",
    continuityNotes ? `Continuity Notes:\n${continuityNotes}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}
