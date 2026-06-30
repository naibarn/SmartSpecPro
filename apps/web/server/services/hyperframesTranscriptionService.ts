import { execFile, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, open, readFile, rm, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  buildHyperframesCliProcessEnv,
  type HyperframesRuntimeAdapterEnv,
} from "./hyperframesRuntimeAdapter";
import { storageCopyToPath } from "../storage";
import {
  HYPERFRAMES_FINAL_COMPOSITE_MAX_SEC,
  HYPERFRAMES_FINAL_COMPOSITE_SHOT_MAX_SEC,
} from "../../shared/hyperframes/limits";

const execFileAsync = promisify(execFile);

export interface HyperframesTranscriptToken {
  id: string;
  text: string;
  start: number;
  end: number;
}

export interface HyperframesTranscriptCue {
  index: number;
  text: string;
  start: number;
  end: number;
}

export interface HyperframesStoryboardShotTranscription {
  text: string;
  cues: HyperframesTranscriptCue[];
  vtt: string;
  srt: string;
  model: string;
  language: string;
}

export interface HyperframesTranscriptionSegment {
  mediaStartSec: number;
  durationSec?: number;
}

export interface HyperframesTranscriptionDeps {
  copyStorageToPath?: typeof storageCopyToPath;
  extractAudioFromVideo?: (
    inputPath: string,
    outputPath: string,
    env?: HyperframesRuntimeAdapterEnv,
    segment?: HyperframesTranscriptionSegment,
  ) => void | Promise<void>;
  resolveModelPath?: (model: string) => string;
  runCommand?: (
    command: string,
    args: string[],
    options: { cwd: string; timeout: number; maxBuffer: number; env?: NodeJS.ProcessEnv },
  ) => Promise<{ stdout?: string; stderr?: string }>;
  env?: HyperframesRuntimeAdapterEnv;
}

const DEFAULT_TRANSCRIBE_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_TRANSCRIBE_MAX_BUFFER = 8 * 1024 * 1024;
const HYPERFRAMES_TRANSCRIBE_TEXT_MAX_CHARS = 4000;
const HYPERFRAMES_TRANSCRIBE_DEFAULT_LOCK_WAIT_MS = 20 * 60 * 1000;
const HYPERFRAMES_TRANSCRIBE_LOCK_STALE_MS = 30 * 60 * 1000;
const HYPERFRAMES_TRANSCRIBE_LOCK_POLL_MS = 1000;
const HYPERFRAMES_DEFAULT_WHISPER_MODELS_DIR = path.join(
  os.homedir(),
  ".cache",
  "hyperframes",
  "whisper",
  "models",
);
const HYPERFRAMES_DEFAULT_WHISPER_BIN_DIR = path.join(
  os.homedir(),
  ".cache",
  "hyperframes",
  "whisper",
  "whisper.cpp",
  "build",
  "bin",
);
const HYPERFRAMES_TRANSCRIBE_SUPPORTED_MODELS = new Set([
  "tiny.en",
  "base.en",
  "small.en",
  "medium.en",
  "large-v3",
]);

function resolveRequestedTranscribeModel(language: string, requestedModel?: string): string {
  const cleanRequested = cleanTranscriptText(requestedModel);
  if (cleanRequested) return cleanRequested;
  return /^en\b/i.test(language) ? "small.en" : "large-v3";
}

function validateRequestedTranscribeModel(language: string, model: string): void {
  if (!HYPERFRAMES_TRANSCRIBE_SUPPORTED_MODELS.has(model)) {
    throw new Error(
      `Unsupported HyperFrames transcribe model "${model}". Supported models in hyperframes v0.6.95 are: ${Array.from(HYPERFRAMES_TRANSCRIBE_SUPPORTED_MODELS).join(", ")}.`
    );
  }
  if (/^th\b/i.test(language) && model !== "large-v3") {
    throw new Error(
      `Thai transcription on hyperframes v0.6.95 must use "large-v3". Received "${model}".`
    );
  }
}

function extractProcessFailureDetails(error: unknown): string {
  if (!error || typeof error !== "object") {
    return String(error ?? "");
  }
  const record = error as Record<string, unknown>;
  const stderr = String(record.stderr ?? "").trim();
  const stdout = String(record.stdout ?? "").trim();
  const message = String(record.message ?? "").trim();
  return [stderr, stdout, message]
    .filter(Boolean)
    .join(" | ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveBinaryFromPath(name: string, env?: NodeJS.ProcessEnv): string | null {
  const pathValue = String(env?.PATH ?? process.env.PATH ?? "").trim();
  if (!pathValue) return null;
  for (const segment of pathValue.split(path.delimiter)) {
    const candidate = path.join(segment, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function isUsableWhisperExecutable(candidate: string, env?: HyperframesRuntimeAdapterEnv): boolean {
  if (!candidate || !existsSync(candidate)) return false;
  try {
    execFileSync(candidate, ["--help"], {
      stdio: "ignore",
      timeout: 5000,
      env: buildHyperframesCliProcessEnv(env ?? process.env),
    });
    return true;
  } catch {
    return false;
  }
}

function resolveWhisperBinDir(env?: HyperframesRuntimeAdapterEnv): string {
  return cleanTranscriptText(
    (env as Record<string, string | undefined> | undefined)?.HYPERFRAMES_WHISPER_BIN_DIR,
  ) || HYPERFRAMES_DEFAULT_WHISPER_BIN_DIR;
}

function parsePositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return Math.floor(parsed);
}

function readEnvValue(env: HyperframesRuntimeAdapterEnv | undefined, key: string): string | undefined {
  return (env as Record<string, string | undefined> | undefined)?.[key];
}

export function resolveWhisperThreadCount(env?: HyperframesRuntimeAdapterEnv): number {
  const explicit = parsePositiveInteger(readEnvValue(env, "HYPERFRAMES_WHISPER_THREADS"));
  const availableCpus = typeof os.availableParallelism === "function"
    ? os.availableParallelism()
    : os.cpus().length;
  const safeCpuCount = Math.max(1, Number.isFinite(availableCpus) ? availableCpus : 1);
  const maxThreads = Math.max(
    1,
    parsePositiveInteger(readEnvValue(env, "HYPERFRAMES_WHISPER_THREADS_MAX")) ?? 2,
  );
  if (explicit) return Math.min(explicit, Math.max(1, safeCpuCount - 1), maxThreads);

  const totalMemoryGiB = os.totalmem() / (1024 ** 3);
  if (safeCpuCount <= 2 || totalMemoryGiB < 12) return 1;
  return Math.min(2, Math.max(1, safeCpuCount - 1), maxThreads);
}

export function resolveWhisperExecutable(env?: HyperframesRuntimeAdapterEnv): string {
  const explicit = cleanTranscriptText((env as Record<string, string | undefined> | undefined)?.HYPERFRAMES_WHISPER_PATH);
  if (explicit) {
    if (isUsableWhisperExecutable(explicit, env)) return explicit;
    throw new Error(
      `HyperFrames transcribe runtime is misconfigured: HYPERFRAMES_WHISPER_PATH is not a working whisper.cpp executable (${explicit}).`
    );
  }

  const whisperBinDir = resolveWhisperBinDir(env);
  const candidates = [
    path.join(whisperBinDir, "whisper-cli"),
    path.join(whisperBinDir, "main"),
    resolveBinaryFromPath("whisper-cli", env),
    resolveBinaryFromPath("whisper-cpp", env),
    path.join(os.homedir(), ".local", "bin", "whisper-cpp"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  const usable = candidates.find(candidate => isUsableWhisperExecutable(candidate, env));
  if (usable) return usable;

  throw new Error(
    `HyperFrames transcribe runtime is not ready: no working whisper.cpp executable found. Checked: ${Array.from(new Set(candidates)).join(", ")}.`
  );
}

function resolveWhisperModelPath(model: string): string {
  return path.join(HYPERFRAMES_DEFAULT_WHISPER_MODELS_DIR, `ggml-${model}.bin`);
}

function resolveTranscribeLocalConcurrency(env?: HyperframesRuntimeAdapterEnv): number {
  return parsePositiveInteger(readEnvValue(env, "HYPERFRAMES_TRANSCRIBE_LOCAL_CONCURRENCY")) ?? 1;
}

function resolveTranscribeLockPath(env?: HyperframesRuntimeAdapterEnv): string {
  return cleanTranscriptText(readEnvValue(env, "HYPERFRAMES_TRANSCRIBE_LOCK_PATH")) ||
    path.join(os.tmpdir(), "smartspec-hyperframes-transcribe.lock");
}

function resolveTranscribeLockWaitMs(env?: HyperframesRuntimeAdapterEnv): number {
  return parsePositiveInteger(readEnvValue(env, "HYPERFRAMES_TRANSCRIBE_LOCK_WAIT_MS")) ??
    HYPERFRAMES_TRANSCRIBE_DEFAULT_LOCK_WAIT_MS;
}

function resolveTranscribeLockPollMs(env?: HyperframesRuntimeAdapterEnv): number {
  return parsePositiveInteger(readEnvValue(env, "HYPERFRAMES_TRANSCRIBE_LOCK_POLL_MS")) ??
    HYPERFRAMES_TRANSCRIBE_LOCK_POLL_MS;
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function isTranscribeLockStale(lockPath: string): Promise<boolean> {
  try {
    const raw = await readFile(lockPath, "utf8");
    const parsed = JSON.parse(raw) as { pid?: unknown; acquiredAt?: unknown };
    const pid = Number(parsed.pid);
    const acquiredAt = Number(parsed.acquiredAt);
    if (!isProcessAlive(pid)) return true;
    return Number.isFinite(acquiredAt) && Date.now() - acquiredAt > HYPERFRAMES_TRANSCRIBE_LOCK_STALE_MS;
  } catch {
    return true;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function acquireTranscribeLocalLock(env?: HyperframesRuntimeAdapterEnv): Promise<() => Promise<void>> {
  const lockPath = resolveTranscribeLockPath(env);
  const waitMs = resolveTranscribeLockWaitMs(env);
  const pollMs = resolveTranscribeLockPollMs(env);
  const startedAt = Date.now();
  const ownerId = randomUUID();
  for (;;) {
    try {
      const file = await open(lockPath, "wx");
      await file.writeFile(JSON.stringify({
        pid: process.pid,
        ownerId,
        acquiredAt: Date.now(),
        purpose: "hyperframes-transcribe",
      }));
      await file.close();
      return async () => {
        try {
          const raw = await readFile(lockPath, "utf8");
          const parsed = JSON.parse(raw) as { ownerId?: unknown };
          if (parsed.ownerId === ownerId) await unlink(lockPath);
        } catch {
          // Best effort only. A missing lock already means this process no longer owns it.
        }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (await isTranscribeLockStale(lockPath)) {
        await unlink(lockPath).catch(() => undefined);
        continue;
      }
      if (Date.now() - startedAt > waitMs) {
        throw new Error(
          "HyperFrames transcribe is busy on this machine. Local concurrency is limited to 1 job; please retry after the current transcription finishes."
        );
      }
      await sleep(pollMs);
    }
  }
}

async function withTranscribeLocalConcurrencyLock<T>(
  env: HyperframesRuntimeAdapterEnv | undefined,
  callback: () => Promise<T>,
): Promise<T> {
  if (resolveTranscribeLocalConcurrency(env) > 1) return callback();
  const release = await acquireTranscribeLocalLock(env);
  try {
    return await callback();
  } finally {
    await release();
  }
}

function resolveFfmpegExecutable(env?: HyperframesRuntimeAdapterEnv): string {
  const explicit = cleanTranscriptText(env?.HYPERFRAMES_FFMPEG_BINARY);
  if (explicit) return explicit;
  return resolveBinaryFromPath("ffmpeg", env) ?? "ffmpeg";
}

function normalizeTranscriptionSegment(input: {
  mediaStartSec?: number;
  durationSec?: number;
}): HyperframesTranscriptionSegment | undefined {
  const mediaStartSec = Number(input.mediaStartSec ?? 0);
  const durationSec = Number(input.durationSec);
  const safeStartSec = Number.isFinite(mediaStartSec)
    ? Math.min(HYPERFRAMES_FINAL_COMPOSITE_MAX_SEC, Math.max(0, mediaStartSec))
    : 0;
  const safeDurationSec = Number.isFinite(durationSec)
    ? Math.min(HYPERFRAMES_FINAL_COMPOSITE_SHOT_MAX_SEC, Math.max(0.5, durationSec))
    : undefined;
  if (safeStartSec <= 0 && safeDurationSec === undefined) return undefined;
  return {
    mediaStartSec: Number(safeStartSec.toFixed(3)),
    durationSec: safeDurationSec === undefined ? undefined : Number(safeDurationSec.toFixed(3)),
  };
}

function extractMono16kAudioFromVideo(
  inputPath: string,
  outputPath: string,
  env?: HyperframesRuntimeAdapterEnv,
  segment?: HyperframesTranscriptionSegment,
): void {
  const segmentArgs = [
    ...(segment && segment.mediaStartSec > 0 ? ["-ss", String(segment.mediaStartSec)] : []),
    "-i",
    inputPath,
    ...(segment?.durationSec ? ["-t", String(segment.durationSec)] : []),
  ];
  execFileSync(
    resolveFfmpegExecutable(env),
    [...segmentArgs, "-vn", "-ar", "16000", "-ac", "1", "-f", "wav", "-y", outputPath],
    {
      stdio: "ignore",
      timeout: 2 * 60 * 1000,
      env: buildHyperframesCliProcessEnv(env ?? process.env),
    },
  );
}

export function storageKeyFromManagedHyperframesMediaUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const pathname = /^https?:\/\//i.test(trimmed)
      ? new URL(trimmed).pathname
      : trimmed;
    if (pathname.startsWith("/api/storage/files/")) {
      return decodeURIComponent(pathname.slice("/api/storage/files/".length));
    }
    if (pathname.startsWith("/uploads/")) {
      return decodeURIComponent(pathname.slice("/uploads/".length));
    }
  } catch {
    return null;
  }
  return null;
}

function cleanTranscriptText(value: unknown): string {
  return String(value ?? "")
    .replace(/[♪♫]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTranscriptToken(value: unknown, index: number): HyperframesTranscriptToken | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const text = cleanTranscriptText(record.text);
  const offsets = record.offsets && typeof record.offsets === "object"
    ? record.offsets as Record<string, unknown>
    : null;
  const start = Number(record.start ?? offsets?.from);
  const end = Number(record.end ?? offsets?.to);
  if (!text || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const looksLikeMilliseconds = end > 60 || start > 60;
  return {
    id: cleanTranscriptText(record.id) || `w${index + 1}`,
    text,
    start: Math.max(0, looksLikeMilliseconds ? start / 1000 : start),
    end: Math.max(0, looksLikeMilliseconds ? end / 1000 : end),
  };
}

export function parseHyperframesTranscriptJson(rawJson: string): HyperframesTranscriptToken[] {
  const parsed = JSON.parse(rawJson) as unknown;
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).transcription)) {
    const segments = (parsed as Record<string, unknown>).transcription as unknown[];
    const segmentTokens = segments
      .map((item, index) => normalizeTranscriptToken(item, index))
      .filter((item): item is HyperframesTranscriptToken => Boolean(item));
    if (segmentTokens.length > 0) return segmentTokens;

    return segments.flatMap((segment, segmentIndex) => {
      if (!segment || typeof segment !== "object" || Array.isArray(segment)) return [];
      const nested = (segment as Record<string, unknown>).tokens;
      if (!Array.isArray(nested)) return [];
      return nested
        .map((item, tokenIndex) => normalizeTranscriptToken(item, segmentIndex * 1000 + tokenIndex))
        .filter((item): item is HyperframesTranscriptToken => Boolean(item))
        .filter(item => !/^\[(?:_|BLANK|BEG|END)/i.test(item.text));
    });
  }
  const candidate = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).words)
      ? (parsed as Record<string, unknown>).words as unknown[]
      : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).tokens)
        ? (parsed as Record<string, unknown>).tokens as unknown[]
        : [];
  return candidate
    .map((item, index) => normalizeTranscriptToken(item, index))
    .filter((item): item is HyperframesTranscriptToken => Boolean(item));
}

export function buildSubtitleCuesFromTranscriptTokens(
  tokens: HyperframesTranscriptToken[],
  options: { maxCharsPerCue?: number; maxDurationSec?: number; maxGapSec?: number } = {},
): HyperframesTranscriptCue[] {
  const maxCharsPerCue = options.maxCharsPerCue ?? 72;
  const maxDurationSec = options.maxDurationSec ?? 3.6;
  const maxGapSec = options.maxGapSec ?? 0.75;
  const cues: HyperframesTranscriptCue[] = [];
  let current: HyperframesTranscriptToken[] = [];

  const flush = () => {
    if (current.length === 0) return;
    const text = cleanTranscriptText(current.map(token => token.text).join(" "));
    if (text) {
      cues.push({
        index: cues.length + 1,
        text,
        start: current[0]!.start,
        end: current[current.length - 1]!.end,
      });
    }
    current = [];
  };

  for (const token of tokens) {
    const nextText = cleanTranscriptText([...current.map(item => item.text), token.text].join(" "));
    const previous = current[current.length - 1];
    const duration = current.length > 0 ? token.end - current[0]!.start : token.end - token.start;
    const gap = previous ? token.start - previous.end : 0;
    if (
      current.length > 0 &&
      (nextText.length > maxCharsPerCue || duration > maxDurationSec || gap > maxGapSec)
    ) {
      flush();
    }
    current.push(token);
  }
  flush();
  return cues;
}

function formatTimestamp(seconds: number, separator: "," | "."): string {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const wholeSeconds = Math.floor(safe % 60);
  const millis = Math.round((safe - Math.floor(safe)) * 1000);
  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    `${String(wholeSeconds).padStart(2, "0")}${separator}${String(millis).padStart(3, "0")}`,
  ].join(":");
}

export function renderTranscriptCuesAsVtt(cues: HyperframesTranscriptCue[]): string {
  return [
    "WEBVTT",
    "",
    ...cues.flatMap(cue => [
      `${formatTimestamp(cue.start, ".")} --> ${formatTimestamp(cue.end, ".")}`,
      cue.text,
      "",
    ]),
  ].join("\n");
}

export function renderTranscriptCuesAsSrt(cues: HyperframesTranscriptCue[]): string {
  return cues
    .flatMap(cue => [
      String(cue.index),
      `${formatTimestamp(cue.start, ",")} --> ${formatTimestamp(cue.end, ",")}`,
      cue.text,
      "",
    ])
    .join("\n");
}

export async function transcribeHyperframesStoryboardShot(input: {
  sourceVideoUrl: string;
  mediaStartSec?: number;
  durationSec?: number;
  language?: string;
  model?: string;
  deps?: HyperframesTranscriptionDeps;
}): Promise<HyperframesStoryboardShotTranscription> {
  const language = cleanTranscriptText(input.language) || "th";
  const model = resolveRequestedTranscribeModel(language, input.model);
  validateRequestedTranscribeModel(language, model);

  const storageKey = storageKeyFromManagedHyperframesMediaUrl(input.sourceVideoUrl);
  if (!storageKey) {
    throw new Error("HyperFrames transcribe requires a managed /api/storage/files or /uploads video URL.");
  }

  const workDir = await mkdtemp(path.join(os.tmpdir(), "smartspec-hyperframes-transcribe-"));
  const sourcePath = path.join(workDir, "source.mp4");
  const audioPath = path.join(workDir, "source.wav");
  const transcriptBase = path.join(workDir, "transcript");
  const runtimeEnv = input.deps?.env ?? process.env;
  const runCommand =
    input.deps?.runCommand ??
    ((command, args, options) => execFileAsync(command, args, options));
  const env = buildHyperframesCliProcessEnv(runtimeEnv);
  const whisperModelPath = (input.deps?.resolveModelPath ?? resolveWhisperModelPath)(model);
  const segment = normalizeTranscriptionSegment({
    mediaStartSec: input.mediaStartSec,
    durationSec: input.durationSec,
  });
  try {
    await withTranscribeLocalConcurrencyLock(runtimeEnv, async () => {
      const whisperExecutable = resolveWhisperExecutable(runtimeEnv);
      const whisperThreads = resolveWhisperThreadCount(runtimeEnv);
      await (input.deps?.copyStorageToPath ?? storageCopyToPath)(storageKey, sourcePath);
      if (!input.deps?.resolveModelPath && !existsSync(whisperModelPath)) {
        throw new Error(
          `HyperFrames transcribe model is not installed locally: ${whisperModelPath}`
        );
      }
      await (input.deps?.extractAudioFromVideo ?? extractMono16kAudioFromVideo)(
        sourcePath,
        audioPath,
        runtimeEnv,
        segment,
      );
      await runCommand(
        whisperExecutable,
        [
          "--model",
          whisperModelPath,
          "--threads",
          String(whisperThreads),
          "--output-json-full",
          "--output-file",
          transcriptBase,
          "--suppress-nst",
          "--language",
          language,
          audioPath,
        ],
        {
          cwd: workDir,
          timeout: DEFAULT_TRANSCRIBE_TIMEOUT_MS,
          maxBuffer: DEFAULT_TRANSCRIBE_MAX_BUFFER,
          env,
        },
      );
    });

    const transcriptJson = await readFile(path.join(workDir, "transcript.json"), "utf8");
    const tokens = parseHyperframesTranscriptJson(transcriptJson);
    if (tokens.length === 0) {
      throw new Error("HyperFrames transcribe completed but transcript.json did not contain word-level tokens.");
    }
    const cues = buildSubtitleCuesFromTranscriptTokens(tokens);
    const text = cues.map(cue => cue.text).join("\n").slice(0, HYPERFRAMES_TRANSCRIBE_TEXT_MAX_CHARS);
    return {
      text,
      cues,
      vtt: renderTranscriptCuesAsVtt(cues),
      srt: renderTranscriptCuesAsSrt(cues),
      model,
      language,
    };
  } catch (error) {
    const message = extractProcessFailureDetails(error) || (error instanceof Error ? error.message : String(error));
    if (/npm warn exec|package was not found and will be installed/i.test(message)) {
      throw new Error(
        "HyperFrames transcribe runtime is misconfigured: the official CLI must be available locally and must not rely on npm auto-install during requests."
      );
    }
    if (
      /whisper-cpp not found|no working whisper\.cpp executable|HYPERFRAMES_WHISPER_PATH is not a working/i.test(message) ||
      (/No such file or directory/i.test(message) && /whisper(?:-cpp|-cli|\.cpp)?/i.test(message))
    ) {
      throw new Error(
        `HyperFrames transcribe runtime is not ready: whisper.cpp is missing or points to a stale temporary path. Configure HYPERFRAMES_WHISPER_PATH to a working whisper-cli binary, set HYPERFRAMES_WHISPER_BIN_DIR, or install whisper.cpp under ${HYPERFRAMES_DEFAULT_WHISPER_BIN_DIR}.`
      );
    }
    if (/unknown DTW preset/i.test(message)) {
      throw new Error(
        "HyperFrames transcribe runtime is using an incompatible DTW preset for the installed whisper.cpp build."
      );
    }
    throw new Error(`HyperFrames transcribe failed: ${message}`);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
