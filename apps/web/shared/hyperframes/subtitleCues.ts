import type { HyperframesFinalCompositeConfig } from "./runtimeApiSchemas";

export type HyperframesEditableTranscriptCue = {
  text: string;
  start: number;
  end: number;
};

type HyperframesFinalSubtitleCue =
  HyperframesFinalCompositeConfig["shots"][number]["subtitleCues"][number];

const DEFAULT_MAX_SUBTITLE_CHARS = 48;
const DEFAULT_MAX_CUES = 28;
const MIN_CUE_DURATION_SEC = 0.6;
const MAX_CUE_DURATION_SEC = 3.8;

function roundCueSecond(value: number): number {
  return Math.round(value * 10) / 10;
}

function cleanSubtitleText(value: unknown): string {
  return String(value ?? "")
    .replace(/\[[^\]]*(?:music|เสียง|silence|blank|noise)[^\]]*\]/gi, " ")
    .replace(/[♪♫]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSubtitleTextIntoReadableChunks(
  text: string,
  maxChars = DEFAULT_MAX_SUBTITLE_CHARS,
): string[] {
  const clean = cleanSubtitleText(text);
  if (!clean) return [];

  const sentenceParts = clean
    .split(/(?<=[.!?。！？])\s+|\s*[|/]\s*/g)
    .map(part => cleanSubtitleText(part))
    .filter(Boolean);
  const sourceParts = sentenceParts.length > 0 ? sentenceParts : [clean];
  const chunks: string[] = [];

  for (const part of sourceParts) {
    if (Array.from(part).length <= maxChars) {
      chunks.push(part);
      continue;
    }

    const words = part.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      let current = "";
      for (const word of words) {
        const next = current ? `${current} ${word}` : word;
        if (Array.from(next).length > maxChars && current) {
          chunks.push(current);
          current = word;
        } else {
          current = next;
        }
      }
      if (current) chunks.push(current);
      continue;
    }

    const chars = Array.from(part);
    for (let index = 0; index < chars.length; index += maxChars) {
      chunks.push(chars.slice(index, index + maxChars).join(""));
    }
  }

  return chunks
    .map(chunk => cleanSubtitleText(chunk))
    .filter(Boolean);
}

function parseEditableTimedSubtitleLine(line: string): HyperframesEditableTranscriptCue | null {
  const match = line.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*:\s*(.+)$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  const text = cleanSubtitleText(match[3]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text) return null;
  return { start, end, text };
}

export function buildHyperframesReadableSubtitleTextFromTranscriptCues(
  cues: HyperframesEditableTranscriptCue[],
  durationSec: number,
  options: {
    maxCharsPerCue?: number;
    maxCues?: number;
  } = {},
): string {
  const maxCharsPerCue = options.maxCharsPerCue ?? DEFAULT_MAX_SUBTITLE_CHARS;
  const maxCues = options.maxCues ?? DEFAULT_MAX_CUES;
  const safeDuration = Math.max(0.5, Number.isFinite(durationSec) ? durationSec : 0.5);
  const normalized: HyperframesEditableTranscriptCue[] = [];

  for (const cue of cues) {
    if (normalized.length >= maxCues) break;
    const cueText = cleanSubtitleText(cue.text);
    const cueStart = Math.max(0, Math.min(safeDuration, Number(cue.start)));
    const cueEnd = Math.max(cueStart, Math.min(safeDuration, Number(cue.end)));
    if (!cueText || !Number.isFinite(cueStart) || !Number.isFinite(cueEnd) || cueEnd <= cueStart) continue;

    const chunks = splitSubtitleTextIntoReadableChunks(cueText, maxCharsPerCue);
    if (chunks.length === 0) continue;
    const totalChars = chunks.reduce((sum, chunk) => sum + Math.max(1, Array.from(chunk).length), 0);
    const cueDuration = cueEnd - cueStart;
    let cursor = cueStart;

    chunks.forEach((chunk, index) => {
      if (normalized.length >= maxCues) return;
      const isLast = index === chunks.length - 1;
      const weight = Math.max(1, Array.from(chunk).length) / totalChars;
      const proposedDuration = isLast
        ? cueEnd - cursor
        : cueDuration * weight;
      const chunkDuration = Math.min(
        MAX_CUE_DURATION_SEC,
        Math.max(MIN_CUE_DURATION_SEC, proposedDuration),
      );
      const start = roundCueSecond(cursor);
      const end = roundCueSecond(Math.min(cueEnd, isLast ? cueEnd : cursor + chunkDuration));
      if (end > start) {
        normalized.push({ start, end, text: chunk });
      }
      cursor = Math.min(cueEnd, end);
    });
  }

  const lines: string[] = [];
  let previousEnd = 0;
  for (const cue of normalized.sort((a, b) => a.start - b.start)) {
    const start = roundCueSecond(Math.max(previousEnd, cue.start));
    const end = roundCueSecond(Math.min(safeDuration, Math.max(start + MIN_CUE_DURATION_SEC, cue.end)));
    if (end <= start || start >= safeDuration) continue;
    lines.push(`${start.toFixed(1)}-${end.toFixed(1)}: ${cue.text}`);
    previousEnd = end;
    if (lines.length >= maxCues) break;
  }
  return lines.join("\n");
}

export function buildHyperframesSubtitleCuesFromEditableText(
  text: string,
  startSec: number,
  durationSec: number,
  options: {
    maxCharsPerCue?: number;
    maxCues?: number;
  } = {},
): HyperframesFinalSubtitleCue[] {
  const safeStart = Number.isFinite(startSec) ? Math.max(0, startSec) : 0;
  const safeDuration = Math.max(0.5, Number.isFinite(durationSec) ? durationSec : 0.5);
  const maxCharsPerCue = options.maxCharsPerCue ?? DEFAULT_MAX_SUBTITLE_CHARS;
  const maxCues = options.maxCues ?? DEFAULT_MAX_CUES;
  const rawLines = String(text ?? "")
    .split(/\n+/)
    .map(line => cleanSubtitleText(line))
    .filter(Boolean);
  if (rawLines.length === 0) return [];

  const timedCues = rawLines
    .map(parseEditableTimedSubtitleLine)
    .filter((cue): cue is HyperframesEditableTranscriptCue => Boolean(cue));
  const editableText = timedCues.length === rawLines.length
    ? buildHyperframesReadableSubtitleTextFromTranscriptCues(timedCues, safeDuration, {
      maxCharsPerCue,
      maxCues,
    })
    : buildHyperframesReadableSubtitleTextFromTranscriptCues(
      rawLines.flatMap((line, index) => {
        const chunks = splitSubtitleTextIntoReadableChunks(line, maxCharsPerCue);
        const lineDuration = safeDuration / Math.max(1, rawLines.length);
        const lineStart = index * lineDuration;
        const chunkDuration = lineDuration / Math.max(1, chunks.length);
        return chunks.map((chunk, chunkIndex) => ({
          start: lineStart + chunkIndex * chunkDuration,
          end: lineStart + (chunkIndex + 1) * chunkDuration,
          text: chunk,
        }));
      }),
      safeDuration,
      { maxCharsPerCue, maxCues },
    );

  return editableText
    .split(/\n+/)
    .map(parseEditableTimedSubtitleLine)
    .filter((cue): cue is HyperframesEditableTranscriptCue => Boolean(cue))
    .map(cue => ({
      startSec: roundCueSecond(safeStart + Math.max(0, Math.min(safeDuration, cue.start))),
      endSec: roundCueSecond(safeStart + Math.max(0.1, Math.min(safeDuration, cue.end))),
      text: cleanSubtitleText(cue.text).slice(0, 180),
    }))
    .filter(cue => cue.endSec > cue.startSec && cue.text.length > 0)
    .slice(0, maxCues);
}

export function getHyperframesSubtitlePreviewText(
  text: string,
  durationSec: number,
  currentSec = 0,
): string {
  const cues = buildHyperframesSubtitleCuesFromEditableText(text, 0, durationSec);
  if (cues.length === 0) return "";
  const safeCurrent = Number.isFinite(currentSec) ? Math.max(0, currentSec) : 0;
  const activeCue = cues.find(cue => safeCurrent >= cue.startSec && safeCurrent < cue.endSec);
  return (activeCue ?? cues[0])?.text ?? "";
}
