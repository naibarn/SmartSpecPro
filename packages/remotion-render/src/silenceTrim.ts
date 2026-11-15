export interface SilenceTrimOptions {
  thresholdDb: number;
  minimumSilenceSeconds: number;
  keepPaddingSeconds: number;
}

export interface MediaTimeRange {
  startSec: number;
  endSec: number;
}

/** FFmpeg detection pass. It writes diagnostics to stderr and no media file. */
export function buildSilenceDetectPassArgs(
  inputPath: string,
  options: SilenceTrimOptions,
): string[] {
  return [
    "-hide_banner",
    "-nostats",
    "-i",
    inputPath,
    "-vn",
    "-af",
    `silencedetect=noise=${options.thresholdDb}dB:d=${options.minimumSilenceSeconds}`,
    "-f",
    "null",
    "-",
  ];
}

/**
 * Parse FFmpeg's silence detector output, remove silence while preserving a
 * short handle around speech, and return the remaining synchronized ranges.
 * Returning null means detection found nothing safe to remove.
 */
export function getSilenceTrimKeepRanges(
  stderr: string,
  durationSec: number,
  options: SilenceTrimOptions,
): MediaTimeRange[] | null {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return null;

  const events: Array<{ index: number; type: "start" | "end"; time: number }> = [];
  for (const match of stderr.matchAll(/silence_start:\s*(-?\d+(?:\.\d+)?)/g)) {
    events.push({ index: match.index ?? 0, type: "start", time: Number(match[1]) });
  }
  for (const match of stderr.matchAll(/silence_end:\s*(-?\d+(?:\.\d+)?)/g)) {
    events.push({ index: match.index ?? 0, type: "end", time: Number(match[1]) });
  }
  events.sort((left, right) => left.index - right.index);

  const detectedSilences: MediaTimeRange[] = [];
  let activeStart: number | null = null;
  for (const event of events) {
    if (event.type === "start") {
      activeStart = Math.max(0, Math.min(durationSec, event.time));
    } else if (activeStart !== null) {
      const endSec = Math.max(activeStart, Math.min(durationSec, event.time));
      if (endSec - activeStart >= options.minimumSilenceSeconds - 0.05) {
        detectedSilences.push({ startSec: activeStart, endSec });
      }
      activeStart = null;
    }
  }
  if (activeStart !== null && durationSec - activeStart >= options.minimumSilenceSeconds - 0.05) {
    detectedSilences.push({ startSec: activeStart, endSec: durationSec });
  }
  if (detectedSilences.length === 0) return null;

  const removeRanges = detectedSilences
    .map(range => ({
      startSec: range.startSec === 0
        ? 0
        : Math.min(range.endSec, range.startSec + options.keepPaddingSeconds),
      endSec: range.endSec >= durationSec
        ? durationSec
        : Math.max(range.startSec, range.endSec - options.keepPaddingSeconds),
    }))
    .filter(range => range.endSec - range.startSec >= 0.12)
    .sort((left, right) => left.startSec - right.startSec);
  if (removeRanges.length === 0) return null;

  const mergedRemovals: MediaTimeRange[] = [];
  for (const range of removeRanges) {
    const previous = mergedRemovals[mergedRemovals.length - 1];
    if (previous && range.startSec <= previous.endSec + 0.01) {
      previous.endSec = Math.max(previous.endSec, range.endSec);
    } else {
      mergedRemovals.push({ ...range });
    }
  }

  const keepRanges: MediaTimeRange[] = [];
  let cursorSec = 0;
  for (const range of mergedRemovals) {
    if (range.startSec - cursorSec >= 0.12) {
      keepRanges.push({ startSec: cursorSec, endSec: range.startSec });
    }
    cursorSec = Math.max(cursorSec, range.endSec);
  }
  if (durationSec - cursorSec >= 0.12) {
    keepRanges.push({ startSec: cursorSec, endSec: durationSec });
  }

  // An all-silent clip or a detector result that would erase nearly all of
  // the source is left untouched; a useful render is safer than a blank one.
  const keptDurationSec = keepRanges.reduce(
    (total, range) => total + range.endSec - range.startSec,
    0,
  );
  return keepRanges.length > 0 && keptDurationSec >= 0.5 ? keepRanges : null;
}

export function buildSynchronizedSilenceTrimArgs(
  inputPath: string,
  outputPath: string,
  keepRanges: MediaTimeRange[],
): string[] {
  const filters: string[] = [];
  const concatInputs: string[] = [];
  keepRanges.forEach((range, index) => {
    const start = range.startSec.toFixed(3);
    const end = range.endSec.toFixed(3);
    filters.push(
      `[0:v:0]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v${index}]`,
      `[0:a:0]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${index}]`,
    );
    concatInputs.push(`[v${index}][a${index}]`);
  });
  filters.push(
    `${concatInputs.join("")}concat=n=${keepRanges.length}:v=1:a=1[vout][aout]`,
  );

  return [
    "-y",
    "-i",
    inputPath,
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-movflags",
    "+faststart",
    outputPath,
  ];
}
