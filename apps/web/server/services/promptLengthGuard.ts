const HARD_MIN_PROMPT_LENGTH = 100;
const HARD_MAX_PROMPT_LENGTH = 10_000;
const DEFAULT_MAX_TOKENS = 4_000;

export type PromptLanguageHint = "en" | "th" | "mixed" | "auto" | "unknown";

export interface PromptLengthPlan {
  maxPromptLength: number;
  targetPromptLength: number;
  maxTokens: number;
  languageHint: PromptLanguageHint;
  directive: string;
}

function clampPromptLength(value: number): number {
  return Math.max(HARD_MIN_PROMPT_LENGTH, Math.min(HARD_MAX_PROMPT_LENGTH, Math.floor(value)));
}

export function normalizePromptLanguageHint(value: unknown): PromptLanguageHint {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized === "en" || normalized === "english") return "en";
  if (normalized === "th" || normalized === "thai") return "th";
  if (normalized === "mixed" || normalized === "bilingual" || normalized === "both") return "mixed";
  if (normalized === "auto") return "auto";

  return "unknown";
}

export function resolvePromptLanguageHintFromInputs(inputs: Record<string, unknown>): PromptLanguageHint {
  return normalizePromptLanguageHint(
    inputs.language
      ?? inputs.promptLanguage
      ?? inputs.dialogueLanguage
      ?? inputs.script_language
      ?? inputs.audio_language,
  );
}

function getSafetyFactor(languageHint: PromptLanguageHint): number {
  switch (languageHint) {
    case "th":
      return 0.85;
    case "mixed":
      return 0.82;
    case "auto":
      return 0.88;
    default:
      return 0.9;
  }
}

function getCharsPerToken(languageHint: PromptLanguageHint): number {
  switch (languageHint) {
    case "th":
      return 1.6;
    case "mixed":
      return 2.2;
    case "auto":
      return 3.2;
    default:
      return 4.0;
  }
}

function buildDirective(maxPromptLength: number, targetPromptLength: number, languageHint: PromptLanguageHint): string {
  const languageNote = languageHint === "th"
    ? "The output is Thai, so keep phrasing especially compact and favor short sentences."
    : languageHint === "mixed"
      ? "The output may mix Thai and English, so stay compact and avoid redundant wording."
      : languageHint === "auto"
        ? "If the output language is Thai or mixed-language, keep it especially concise."
        : "Keep the wording compact and avoid filler.";

  return [
    "## Output Length",
    `Keep the final output under ${maxPromptLength} characters.`,
    `Aim for about ${targetPromptLength} characters or less to leave safety margin.`,
    languageNote,
  ].join("\n");
}

export function buildPromptLengthPlan(
  maxPromptLength: number,
  languageHintInput?: unknown,
): PromptLengthPlan | null {
  if (!Number.isFinite(maxPromptLength) || maxPromptLength <= 0) {
    return null;
  }

  const languageHint = normalizePromptLanguageHint(languageHintInput);
  const normalizedLimit = clampPromptLength(maxPromptLength);
  const targetPromptLength = Math.max(100, Math.floor(normalizedLimit * getSafetyFactor(languageHint)));
  const maxTokens = Math.max(
    128,
    Math.min(
      DEFAULT_MAX_TOKENS,
      Math.ceil(targetPromptLength / getCharsPerToken(languageHint)),
    ),
  );

  return {
    maxPromptLength: normalizedLimit,
    targetPromptLength,
    maxTokens,
    languageHint,
    directive: buildDirective(normalizedLimit, targetPromptLength, languageHint),
  };
}

export function truncateToPromptLength(text: string, maxChars: number): { text: string; wasTruncated: boolean } {
  if (!text || !Number.isFinite(maxChars) || maxChars <= 0 || text.length <= maxChars) {
    return { text, wasTruncated: false };
  }

  const limit = Math.max(1, Math.floor(maxChars));
  const targetLength = Math.max(1, limit - 3);
  let truncated = text.slice(0, targetLength);

  const sentenceBoundaries = [
    truncated.lastIndexOf(". "),
    truncated.lastIndexOf("! "),
    truncated.lastIndexOf("? "),
    truncated.lastIndexOf(".\n"),
    truncated.lastIndexOf("!\n"),
    truncated.lastIndexOf("?\n"),
    truncated.lastIndexOf("\n"),
  ];
  const lastBoundary = Math.max(...sentenceBoundaries);
  const minBoundary = Math.floor(targetLength * 0.8);

  if (lastBoundary > minBoundary) {
    truncated = truncated.slice(0, lastBoundary + 1);
  } else {
    const lastSpace = truncated.lastIndexOf(" ");
    if (lastSpace > Math.floor(targetLength * 0.7)) {
      truncated = truncated.slice(0, lastSpace);
    }
  }

  const cleaned = truncated.trimEnd();
  return {
    text: `${cleaned}...`,
    wasTruncated: true,
  };
}
