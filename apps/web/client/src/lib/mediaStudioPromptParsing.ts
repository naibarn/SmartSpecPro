const MULTI_PROMPT_REGEX = /\b(?:PROMPT|SCENE|SHOT|CLIP)\s+\d+\s*(?:\([^)]+\))?:/i;

export interface ParsedMultiVideoPromptOutput {
  sharedContext: string;
  prompts: string[];
}

function stripSharedHeader(text: string): string {
  return text
    .replace(/^(?:SHARED CONTINUITY PREAMBLE|REFERENCE NOTES|Reference Notes)\s*:\s*/i, "")
    .trim();
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

  const sharedContext = stripSharedHeader(parts[0].trim());
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
 * If the text includes a shared preamble before the first prompt marker,
 * preserve it and prepend it to each extracted prompt so recurring character
 * and setting details survive the split.
 */
export function parseMultiVideoPrompts(text: string): string[] {
  const { sharedContext, prompts } = splitMultiVideoPromptOutput(text);
  if (prompts.length === 0) {
    return [];
  }

  return prompts.map((promptText) => (sharedContext ? `${sharedContext}\n\n${promptText}` : promptText));
}
