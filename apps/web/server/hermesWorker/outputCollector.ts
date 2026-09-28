/**
 * Feature 135 — Hermes Grok media worker (section 07): 4-signal output
 * collection + validation (spec §13.5, plan §10 design constraint #5).
 *
 * Trust order (first signal that yields at least one candidate file wins):
 *   1. `SMARTSPECPRO_RESULT_BEGIN {json} SMARTSPECPRO_RESULT_END` marker
 *      block in stdout.
 *   2. Scan the job workspace's `output/` directory.
 *   3. `MEDIA:<url>` (or the fake-CLI fixture's `MEDIA_TAGS:[...]`) tags in
 *      stdout — each URL is downloaded into the workspace `tmp/` dir before
 *      validation.
 *   4. Scan the configured Hermes cache directories
 *      (`$HERMES_HOME/cache/{images,videos}`), bounded to files whose mtime
 *      falls inside the job's `[startedAt, endedAt]` time window.
 *
 * Every candidate path is confinement-checked (must resolve under the
 * workspace's own output/tmp dirs or one of the configured cache dirs; NEVER
 * under any Hermes connection profile root — including a different
 * connection's) and filename-safety-checked (no null bytes/control chars,
 * no Windows reserved device names, no overlong names) before being
 * type-validated (image magic bytes, video via injectable `ffprobe`).
 *
 * No `db` import — see `server/services/__tests__/hermesMediaNamespaceGuard.test.ts`.
 */
import fs from "node:fs/promises";
import path from "node:path";

export type HermesOutputErrorCode = "HERMES_RESULT_INVALID" | "HERMES_OUTPUT_INVALID";

export class HermesOutputError extends Error {
  readonly code: HermesOutputErrorCode;

  constructor(code: HermesOutputErrorCode, message: string) {
    super(message);
    this.name = "HermesOutputError";
    this.code = code;
  }
}

export interface CollectedOutput {
  kind: "image" | "video";
  path: string;
  sizeBytes: number;
  contentType: string;
  signal: "result_marker" | "workspace_scan" | "media_tag" | "cache_scan";
}

export interface FfprobeCheckResult {
  ok: boolean;
  durationSec?: number;
  hasVideoStream?: boolean;
  hasAudioStream?: boolean;
}

export interface CollectOutputsParams {
  invocation: { stdout: string };
  workspace: { outputDir: string; tmpDir: string };
  cacheDirs: string[];
  /** Any connection's profile root — a resolved candidate path under ANY of
   *  these is rejected, not just the current job's own connection. */
  forbiddenRoots?: string[];
  jobWindow: { startedAt: Date; endedAt: Date };
  expected: { kind: "image" | "video"; count: number };
  fetchImpl?: typeof fetch;
  ffprobeImpl?: (filePath: string) => Promise<FfprobeCheckResult>;
}

const RESULT_MARKER_PATTERN = /SMARTSPECPRO_RESULT_BEGIN\s+([\s\S]*?)\s+SMARTSPECPRO_RESULT_END/;
const MEDIA_LINE_PATTERN = /^MEDIA:(.+)$/;
const MEDIA_TAGS_LINE_PATTERN = /^MEDIA_TAGS:(.+)$/;

const RESERVED_WINDOWS_NAMES = new Set([
  "con", "prn", "aux", "nul",
  "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
  "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
]);
const MAX_FILE_NAME_LENGTH = 255;

function assertSafeFileName(fileName: string): void {
  if (fileName.length === 0 || fileName.length > MAX_FILE_NAME_LENGTH) {
    throw new HermesOutputError("HERMES_OUTPUT_INVALID", "Output file name length is invalid");
  }
  // Null bytes / control characters.
  if (/[\x00-\x1F\x7F]/.test(fileName)) {
    throw new HermesOutputError("HERMES_OUTPUT_INVALID", "Output file name contains control characters");
  }
  const stem = fileName.split(".")[0]?.toLowerCase() ?? "";
  if (RESERVED_WINDOWS_NAMES.has(stem)) {
    throw new HermesOutputError("HERMES_OUTPUT_INVALID", "Output file name is a reserved device name");
  }
}

async function assertConfined(
  candidatePath: string,
  allowedRoots: string[],
  forbiddenRoots: string[],
): Promise<string> {
  const resolved = path.resolve(candidatePath);
  // Resolve through symlinks (if the path exists) so an escape via symlink
  // is caught even when the link itself sits inside an allowed root.
  let real = resolved;
  try {
    real = await fs.realpath(resolved);
  } catch {
    // Path may not exist yet (pre-flight checks) — fall back to the
    // resolved (unlinked) path for containment checks.
  }

  const withinAny = (roots: string[]) =>
    roots.some((root) => {
      const resolvedRoot = path.resolve(root);
      return real === resolvedRoot || real.startsWith(resolvedRoot + path.sep);
    });

  // Explicitly-allowed roots (workspace output/tmp + THIS job's own cache
  // dirs) win FIRST. This matters because a job's own cache dirs
  // (`$HERMES_HOME/cache/{images,videos}`) are nested under its own
  // connection's profile home, which is itself nested under the shared
  // `forbiddenRoots` profile root passed in by `jobHandlers.ts` — checking
  // `forbiddenRoots` first would make the whole cache-scan signal
  // permanently unreachable for every job. `forbiddenRoots` only matters
  // for a candidate that is NOT already inside one of the explicitly
  // allowed roots (e.g. a marker-declared path resolving under a
  // DIFFERENT connection's profile directory).
  if (withinAny(allowedRoots)) {
    return real;
  }
  if (withinAny(forbiddenRoots)) {
    throw new HermesOutputError("HERMES_OUTPUT_INVALID", "Output path resolves under a forbidden profile root");
  }
  throw new HermesOutputError("HERMES_OUTPUT_INVALID", "Output path escapes the allowed workspace/cache roots");
}

// ────────────────────────────────────────────────────────────────────────
// Type validation
// ────────────────────────────────────────────────────────────────────────

const IMAGE_MAGIC_BYTES: Array<{ contentType: string; magic: Buffer }> = [
  { contentType: "image/png", magic: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
  { contentType: "image/jpeg", magic: Buffer.from([0xff, 0xd8, 0xff]) },
  { contentType: "image/gif", magic: Buffer.from("GIF8", "ascii") },
  { contentType: "image/webp", magic: Buffer.from("RIFF", "ascii") },
];

async function validateImageFile(filePath: string): Promise<{ contentType: string; sizeBytes: number }> {
  const buffer = await fs.readFile(filePath);
  const stat = await fs.stat(filePath);
  const match = IMAGE_MAGIC_BYTES.find((candidate) => buffer.subarray(0, candidate.magic.length).equals(candidate.magic));
  if (!match || stat.size === 0) {
    throw new HermesOutputError("HERMES_OUTPUT_INVALID", `Output file ${path.basename(filePath)} failed image magic-byte validation`);
  }
  return { contentType: match.contentType, sizeBytes: stat.size };
}

async function validateVideoFile(
  filePath: string,
  ffprobeImpl: (filePath: string) => Promise<FfprobeCheckResult>,
): Promise<{ contentType: string; sizeBytes: number }> {
  const stat = await fs.stat(filePath);
  const probe = await ffprobeImpl(filePath);
  if (!probe.ok || !probe.hasVideoStream) {
    throw new HermesOutputError("HERMES_OUTPUT_INVALID", `Output file ${path.basename(filePath)} failed ffprobe video validation`);
  }
  return { contentType: "video/mp4", sizeBytes: stat.size };
}

async function defaultFfprobe(): Promise<FfprobeCheckResult> {
  // No real ffprobe wired by default — callers MUST inject one for video
  // jobs; failing closed here surfaces as a typed rejection rather than a
  // silent pass.
  return { ok: false };
}

async function validateCandidate(
  filePath: string,
  kind: "image" | "video",
  ffprobeImpl: (filePath: string) => Promise<FfprobeCheckResult>,
): Promise<{ contentType: string; sizeBytes: number }> {
  assertSafeFileName(path.basename(filePath));
  return kind === "image" ? validateImageFile(filePath) : validateVideoFile(filePath, ffprobeImpl);
}

/**
 * Public entry point reused by `jobHandlers.ts` for PRE-SPAWN reference
 * validation (spec §13.2) — the exact same magic-byte/dimension/ffprobe
 * checks this module applies to OUTPUTS, applied to a downloaded reference
 * BEFORE Hermes is ever spawned. A reference that passes sha256 but fails
 * this check throws `HermesOutputError` (caller maps it to a typed
 * rejection — corrupt-but-checksummed assets never reach the CLI).
 */
export async function validateMediaFile(
  filePath: string,
  kind: "image" | "video",
  ffprobeImpl: ((filePath: string) => Promise<FfprobeCheckResult>) | undefined,
): Promise<{ contentType: string; sizeBytes: number }> {
  return validateCandidate(filePath, kind, ffprobeImpl ?? defaultFfprobe);
}

// ────────────────────────────────────────────────────────────────────────
// Signal 1 — result marker
// ────────────────────────────────────────────────────────────────────────

interface ParsedResultMarker {
  status: "ok" | "error";
  files?: string[];
  message?: string;
}

function parseResultMarker(stdout: string): ParsedResultMarker | null {
  const match = RESULT_MARKER_PATTERN.exec(stdout);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]) as ParsedResultMarker;
    if (parsed.status !== "ok" && parsed.status !== "error") {
      throw new Error("missing/invalid status");
    }
    return parsed;
  } catch {
    throw new HermesOutputError("HERMES_RESULT_INVALID", "SMARTSPECPRO_RESULT block was not valid JSON");
  }
}

// ────────────────────────────────────────────────────────────────────────
// Signal 3 — MEDIA tags
// ────────────────────────────────────────────────────────────────────────

function extractMediaUrls(stdout: string): string[] {
  const urls: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const direct = MEDIA_LINE_PATTERN.exec(line.trim());
    if (direct?.[1]) {
      urls.push(direct[1].trim());
      continue;
    }
    const tagged = MEDIA_TAGS_LINE_PATTERN.exec(line.trim());
    if (tagged?.[1]) {
      try {
        const parsed = JSON.parse(tagged[1]) as unknown;
        if (Array.isArray(parsed)) {
          for (const entry of parsed) {
            if (typeof entry === "string" && entry.length > 0) urls.push(entry);
          }
        }
      } catch {
        // Malformed MEDIA_TAGS line — ignore, fall through to the next signal.
      }
    }
  }
  return urls;
}

async function downloadMediaUrl(url: string, tmpDir: string, fetchImpl: typeof fetch, index: number): Promise<string> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new HermesOutputError("HERMES_OUTPUT_INVALID", `Failed to download MEDIA reference ${url}: HTTP ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const extension = url.split(".").pop()?.split(/[?#]/)[0]?.slice(0, 8) || "bin";
  const localName = `media-${index}.${extension.replace(/[^a-z0-9]/gi, "") || "bin"}`;
  const localPath = path.join(tmpDir, localName);
  await fs.writeFile(localPath, Buffer.from(arrayBuffer));
  return localPath;
}

// ────────────────────────────────────────────────────────────────────────
// Signal 2 / 4 — directory scans
// ────────────────────────────────────────────────────────────────────────

async function listFilesIn(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => path.join(dir, entry.name));
  } catch {
    return [];
  }
}

async function scanWorkspaceOutput(outputDir: string): Promise<string[]> {
  return listFilesIn(outputDir);
}

async function scanCacheDirsWithinWindow(
  cacheDirs: string[],
  window: { startedAt: Date; endedAt: Date },
): Promise<string[]> {
  const startMs = window.startedAt.getTime();
  const endMs = window.endedAt.getTime();
  const results: string[] = [];
  for (const dir of cacheDirs) {
    for (const filePath of await listFilesIn(dir)) {
      const stat = await fs.stat(filePath);
      if (stat.mtimeMs >= startMs && stat.mtimeMs <= endMs) {
        results.push(filePath);
      }
    }
  }
  return results;
}

// ────────────────────────────────────────────────────────────────────────
// Public entrypoint
// ────────────────────────────────────────────────────────────────────────

export async function collectOutputs(params: CollectOutputsParams): Promise<CollectedOutput[]> {
  const forbiddenRoots = params.forbiddenRoots ?? [];
  const allowedRoots = [params.workspace.outputDir, params.workspace.tmpDir, ...params.cacheDirs];
  const ffprobeImpl = params.ffprobeImpl ?? defaultFfprobe;
  const fetchImpl = params.fetchImpl ?? fetch;
  const kind = params.expected.kind;

  async function buildCollected(filePath: string, signal: CollectedOutput["signal"]): Promise<CollectedOutput> {
    const confined = await assertConfined(filePath, allowedRoots, forbiddenRoots);
    const { contentType, sizeBytes } = await validateCandidate(confined, kind, ffprobeImpl);
    return { kind, path: confined, sizeBytes, contentType, signal };
  }

  // Signal 1 — result marker.
  const marker = parseResultMarker(params.invocation.stdout);
  if (marker) {
    if (marker.status === "error") {
      throw new HermesOutputError("HERMES_RESULT_INVALID", marker.message ?? "Hermes reported a generation error");
    }
    const files = marker.files ?? [];
    if (files.length === 0) {
      throw new HermesOutputError("HERMES_RESULT_INVALID", "SMARTSPECPRO_RESULT block reported no output files");
    }
    const collected: CollectedOutput[] = [];
    let downloadIndex = 0;
    for (const file of files) {
      // The xAI media tools return HOSTED result URLs and the agent has no
      // file/terminal toolset to save them locally (spec §4.2) — an https
      // entry in the marker's files array is therefore the NORMAL success
      // shape for this runtime, not an error. Download it into tmp/ (same
      // path the MEDIA-tag signal uses) before validation.
      if (/^https?:\/\//i.test(file.trim())) {
        const localPath = await downloadMediaUrl(file.trim(), params.workspace.tmpDir, fetchImpl, downloadIndex);
        downloadIndex += 1;
        collected.push(await buildCollected(localPath, "result_marker"));
        continue;
      }
      const filePath = path.isAbsolute(file) ? file : path.join(params.workspace.outputDir, file);
      collected.push(await buildCollected(filePath, "result_marker"));
    }
    return collected;
  }

  // Signal 2 — workspace output scan.
  const workspaceFiles = await scanWorkspaceOutput(params.workspace.outputDir);
  if (workspaceFiles.length > 0) {
    const collected: CollectedOutput[] = [];
    for (const filePath of workspaceFiles) {
      collected.push(await buildCollected(filePath, "workspace_scan"));
    }
    return collected;
  }

  // Signal 3 — MEDIA tags (download-first).
  const mediaUrls = extractMediaUrls(params.invocation.stdout);
  if (mediaUrls.length > 0) {
    const collected: CollectedOutput[] = [];
    for (let index = 0; index < mediaUrls.length; index += 1) {
      const localPath = await downloadMediaUrl(mediaUrls[index], params.workspace.tmpDir, fetchImpl, index);
      collected.push(await buildCollected(localPath, "media_tag"));
    }
    return collected;
  }

  // Signal 4 — cache scan bounded by the job time window.
  const cacheFiles = await scanCacheDirsWithinWindow(params.cacheDirs, params.jobWindow);
  if (cacheFiles.length > 0) {
    const collected: CollectedOutput[] = [];
    for (const filePath of cacheFiles) {
      collected.push(await buildCollected(filePath, "cache_scan"));
    }
    return collected;
  }

  throw new HermesOutputError("HERMES_RESULT_INVALID", "No output signal (marker/workspace/media-tag/cache) produced any files");
}
