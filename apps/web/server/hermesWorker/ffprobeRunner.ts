/**
 * Feature 135 — Hermes Grok media worker: the REAL `ffprobe` adapter for
 * `outputCollector.ts`'s injectable `ffprobeImpl` seam.
 *
 * WHY this module exists: `outputCollector.defaultFfprobe` deliberately
 * fails closed (`{ ok: false }`) so a video job can never silently pass
 * validation when no prober was wired. `main.ts` never wired one, so EVERY
 * video job failed with "Output file <name> failed ffprobe video
 * validation" even when the downloaded mp4 was perfectly valid (observed
 * 2026-08-02: a 720x1280 / 2.04s clip with an audio track was rejected).
 * This module supplies the missing implementation.
 *
 * Namespace rule (hard): `hermes*` only — see
 * `server/services/__tests__/hermesMediaNamespaceGuard.test.ts`.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import type { FfprobeCheckResult } from "./outputCollector";

const execFileAsync = promisify(execFile);

/** Mirrors `hyperframesRenderWorker.ts`'s resolution order (FFPROBE_PATH
 *  first, then the usual install locations, then bare `ffprobe` on PATH). */
export function resolveHermesFfprobeBinary(): string {
  const candidates = [
    process.env.FFPROBE_PATH,
    "/usr/bin/ffprobe",
    "/usr/local/bin/ffprobe",
    join(homedir(), ".local/bin/ffprobe"),
  ].filter((value): value is string => Boolean(value && value.trim()));
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return "ffprobe";
}

interface FfprobeStreamsJson {
  streams?: Array<{ codec_type?: string; duration?: string }>;
  format?: { duration?: string };
}

/**
 * Probes `filePath` and reports stream presence + duration. Never throws —
 * any failure (missing binary, unreadable/corrupt file, malformed JSON)
 * resolves to `{ ok: false }`, which the collector treats as a validation
 * rejection. `timeoutMs` bounds a pathological probe.
 */
export async function hermesFfprobe(
  filePath: string,
  options: { binary?: string; timeoutMs?: number } = {},
): Promise<FfprobeCheckResult> {
  const binary = options.binary ?? resolveHermesFfprobeBinary();
  try {
    const { stdout } = await execFileAsync(
      binary,
      [
        "-v", "error",
        "-print_format", "json",
        "-show_entries", "stream=codec_type,duration:format=duration",
        filePath,
      ],
      { timeout: options.timeoutMs ?? 30_000, maxBuffer: 4 * 1024 * 1024 },
    );
    const parsed = JSON.parse(stdout) as FfprobeStreamsJson;
    const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
    const hasVideoStream = streams.some((stream) => stream.codec_type === "video");
    const hasAudioStream = streams.some((stream) => stream.codec_type === "audio");
    const rawDuration =
      parsed.format?.duration
      ?? streams.find((stream) => stream.codec_type === "video")?.duration;
    const durationSec = rawDuration !== undefined ? Number.parseFloat(rawDuration) : undefined;
    const result: FfprobeCheckResult = { ok: true, hasVideoStream, hasAudioStream };
    if (durationSec !== undefined && Number.isFinite(durationSec)) {
      result.durationSec = durationSec;
    }
    return result;
  } catch {
    return { ok: false };
  }
}
