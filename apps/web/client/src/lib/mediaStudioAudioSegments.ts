export interface VoiceoverSegment {
  index: number;
  count: number;
  text: string;
  startTimeSeconds: number;
  targetDurationSeconds: number;
}

const QWEN3_TTS_SAFE_TEXT_LIMIT_CHARS = 560;

function splitLongUnitByWords(unit: string, maxCharacters: number): string[] {
  const words = unit.split(/\s+/).filter(Boolean);
  if (words.length <= 1) {
    const chunks: string[] = [];
    for (let index = 0; index < unit.length; index += maxCharacters) {
      const chunk = unit.slice(index, index + maxCharacters).trim();
      if (chunk) chunks.push(chunk);
    }
    return chunks;
  }

  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    if (word.length > maxCharacters) {
      if (current.trim()) {
        chunks.push(current.trim());
        current = "";
      }
      chunks.push(...splitLongUnitByWords(word, maxCharacters));
      continue;
    }

    const next = current ? `${current} ${word}` : word;
    if (next.length > maxCharacters && current.trim()) {
      chunks.push(current.trim());
      current = word;
    } else {
      current = next;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export function splitVoiceoverTextByLimit(text: string, maxCharacters: number): string[] {
  const limit = Math.max(1, Math.floor(maxCharacters));
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalized) return [];
  if (normalized.length <= limit) return [normalized];

  const units = normalized
    .split(/\n+/)
    .flatMap((paragraph) => paragraph.match(/[^.!?。！？]+[.!?。！？]?/g) ?? [paragraph])
    .map((unit) => unit.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";
  for (const unit of units) {
    const unitChunks = unit.length > limit ? splitLongUnitByWords(unit, limit) : [unit];
    for (const part of unitChunks) {
      const separator = current ? " " : "";
      const next = `${current}${separator}${part}`.trim();
      if (next.length > limit && current.trim()) {
        chunks.push(current.trim());
        current = part;
      } else {
        current = next;
      }
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export function buildVoiceoverSegments(params: {
  script: string;
  targetDurationSeconds: number;
  maxCharacters?: number | null;
}): VoiceoverSegment[] {
  const script = params.script.trim();
  if (!script) return [];

  const chunks = params.maxCharacters && params.maxCharacters > 0
    ? splitVoiceoverTextByLimit(script, params.maxCharacters)
    : [script];
  if (chunks.length === 0) return [];

  const totalTargetDuration = Math.max(0.25, params.targetDurationSeconds);
  const totalCharacters = chunks.reduce((sum, chunk) => sum + Math.max(1, chunk.length), 0);
  let cursor = 0;

  return chunks.map((chunk, index) => {
    const remainingSegments = chunks.length - index;
    const remainingDuration = Math.max(0.25 * remainingSegments, totalTargetDuration - cursor);
    const targetDurationSeconds = index === chunks.length - 1
      ? Math.max(0.25, totalTargetDuration - cursor)
      : Math.max(
        0.25,
        Math.min(
          remainingDuration - (remainingSegments - 1) * 0.25,
          totalTargetDuration * (Math.max(1, chunk.length) / totalCharacters),
        ),
      );
    const segment: VoiceoverSegment = {
      index,
      count: chunks.length,
      text: chunk,
      startTimeSeconds: cursor,
      targetDurationSeconds,
    };
    cursor += targetDurationSeconds;
    return segment;
  });
}

export function inferVoiceoverTextLimitCharacters(modelIds: Iterable<string>): number | null {
  for (const modelId of modelIds) {
    const normalized = modelId.trim().toLowerCase();
    if (normalized.includes("qwen3-tts")) {
      // WaveSpeed currently rejects Qwen3 TTS requests above 600 chars.
      return QWEN3_TTS_SAFE_TEXT_LIMIT_CHARS;
    }
  }
  return null;
}
