/**
 * Feature 135 — Hermes Grok media worker (section 07): job workspace
 * lifecycle. A `JobWorkspace` is a scratch directory tree
 * (`input/output/manifest/logs/tmp`) rooted strictly under this manager's
 * configured `root` — NEVER inside any Hermes profile directory (spec §8.2
 * — job workspaces and connection profiles are structurally disjoint; see
 * `__tests__/profileStrategy.test.ts`'s disjointness guard).
 *
 * Retention (spec §4.7 / acceptance checklist):
 *  - `settleCompleted` deletes the workspace immediately after a verified
 *    artifact upload.
 *  - `settleFailed` retains the workspace and stamps a terminal marker;
 *    `sweep()` evicts it once `failedRetentionMs` (default 72h) has
 *    elapsed.
 *  - `sweep()` also rotates per-job log files older than `logsRetentionMs`
 *    (default 14 days) and, under disk pressure (`freeDiskBytes()` below
 *    `diskPressureThresholdBytes`), evicts the OLDEST terminal (failed)
 *    workspaces first — active workspaces (no terminal marker) are never
 *    touched by any eviction path.
 *
 * No `db` import — see `server/services/__tests__/hermesMediaNamespaceGuard.test.ts`.
 */
import fs from "node:fs/promises";
import path from "node:path";

export interface JobWorkspace {
  jobId: string;
  root: string;
  inputDir: string;
  outputDir: string;
  manifestDir: string;
  logsDir: string;
  tmpDir: string;
}

interface TerminalMarker {
  status: "active" | "failed";
  createdAt: string;
  terminalAt?: string;
}

const DEFAULT_FAILED_RETENTION_MS = 72 * 60 * 60 * 1000;
const DEFAULT_LOGS_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const DEFAULT_DISK_PRESSURE_THRESHOLD_BYTES = 2 * 1024 * 1024 * 1024;
const MARKER_FILE_NAME = "status.json";
const JOB_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export interface WorkspaceManagerConfig {
  root: string;
  clock?: () => Date;
  failedRetentionMs?: number;
  logsRetentionMs?: number;
  diskPressureThresholdBytes?: number;
  /** Injectable free-disk probe — defaults to `fs.statfs` on `root`, falling
   *  back to `Number.POSITIVE_INFINITY` (never refuse claims) when
   *  `statfs` is unavailable/fails, e.g. on platforms without it. */
  statfsImpl?: (target: string) => Promise<{ bavail: number; bsize: number }>;
}

export interface WorkspaceManager {
  create(jobId: string): Promise<JobWorkspace>;
  settleCompleted(jobId: string): Promise<void>;
  settleFailed(jobId: string): Promise<void>;
  sweep(): Promise<{ evictedFailed: string[]; rotatedLogs: string[]; evictedForDiskPressure: string[] }>;
  freeDiskBytes(): Promise<number>;
}

function assertSafeJobId(jobId: string): string {
  if (!JOB_ID_PATTERN.test(jobId)) {
    throw new Error(`Invalid worker job id for workspace: ${jobId}`);
  }
  return jobId;
}

function jobDirFor(root: string, jobId: string): string {
  return path.join(root, assertSafeJobId(jobId));
}

async function readMarker(jobDir: string): Promise<TerminalMarker | null> {
  try {
    const raw = await fs.readFile(path.join(jobDir, "manifest", MARKER_FILE_NAME), "utf-8");
    return JSON.parse(raw) as TerminalMarker;
  } catch {
    return null;
  }
}

async function writeMarker(jobDir: string, marker: TerminalMarker): Promise<void> {
  await fs.writeFile(path.join(jobDir, "manifest", MARKER_FILE_NAME), JSON.stringify(marker), "utf-8");
}

async function listJobDirs(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

export function createWorkspaceManager(cfg: WorkspaceManagerConfig): WorkspaceManager {
  const clock = cfg.clock ?? (() => new Date());
  const failedRetentionMs = cfg.failedRetentionMs ?? DEFAULT_FAILED_RETENTION_MS;
  const logsRetentionMs = cfg.logsRetentionMs ?? DEFAULT_LOGS_RETENTION_MS;
  const diskPressureThresholdBytes = cfg.diskPressureThresholdBytes ?? DEFAULT_DISK_PRESSURE_THRESHOLD_BYTES;
  const root = cfg.root;

  async function statfsDefault(target: string): Promise<{ bavail: number; bsize: number }> {
    const statfsFn = (fs as unknown as { statfs?: (p: string) => Promise<{ bavail: number; bsize: number }> }).statfs;
    if (!statfsFn) return { bavail: Number.POSITIVE_INFINITY, bsize: 1 };
    return statfsFn(target);
  }
  const statfsImpl = cfg.statfsImpl ?? statfsDefault;

  return {
    async create(jobId: string): Promise<JobWorkspace> {
      const jobDir = jobDirFor(root, jobId);
      const workspace: JobWorkspace = {
        jobId,
        root: jobDir,
        inputDir: path.join(jobDir, "input"),
        outputDir: path.join(jobDir, "output"),
        manifestDir: path.join(jobDir, "manifest"),
        logsDir: path.join(jobDir, "logs"),
        tmpDir: path.join(jobDir, "tmp"),
      };
      await fs.mkdir(workspace.inputDir, { recursive: true });
      await fs.mkdir(workspace.outputDir, { recursive: true });
      await fs.mkdir(workspace.manifestDir, { recursive: true });
      await fs.mkdir(workspace.logsDir, { recursive: true });
      await fs.mkdir(workspace.tmpDir, { recursive: true });
      await writeMarker(jobDir, { status: "active", createdAt: clock().toISOString() });
      return workspace;
    },

    async settleCompleted(jobId: string): Promise<void> {
      const jobDir = jobDirFor(root, jobId);
      await fs.rm(jobDir, { recursive: true, force: true });
    },

    async settleFailed(jobId: string): Promise<void> {
      const jobDir = jobDirFor(root, jobId);
      const existing = await readMarker(jobDir);
      await writeMarker(jobDir, {
        status: "failed",
        createdAt: existing?.createdAt ?? clock().toISOString(),
        terminalAt: clock().toISOString(),
      });
    },

    async freeDiskBytes(): Promise<number> {
      try {
        const stats = await statfsImpl(root);
        if (!Number.isFinite(stats.bavail) || !Number.isFinite(stats.bsize)) {
          return Number.POSITIVE_INFINITY;
        }
        return stats.bavail * stats.bsize;
      } catch {
        return Number.POSITIVE_INFINITY;
      }
    },

    async sweep(): Promise<{ evictedFailed: string[]; rotatedLogs: string[]; evictedForDiskPressure: string[] }> {
      const now = clock().getTime();
      const jobIds = await listJobDirs(root);

      const evictedFailed: string[] = [];
      const rotatedLogs: string[] = [];
      const terminalCandidates: Array<{ jobId: string; terminalAtMs: number }> = [];

      for (const jobId of jobIds) {
        const jobDir = path.join(root, jobId);
        const marker = await readMarker(jobDir);

        // Log rotation runs regardless of terminal state — active jobs may
        // still accumulate long-lived log files across retries.
        const logsDir = path.join(jobDir, "logs");
        try {
          const logFiles = await fs.readdir(logsDir);
          for (const fileName of logFiles) {
            const filePath = path.join(logsDir, fileName);
            const stat = await fs.stat(filePath);
            if (now - stat.mtimeMs > logsRetentionMs) {
              await fs.rm(filePath, { force: true });
              rotatedLogs.push(filePath);
            }
          }
        } catch {
          // No logs dir yet — nothing to rotate.
        }

        if (marker?.status === "failed" && marker.terminalAt) {
          const terminalAtMs = Date.parse(marker.terminalAt);
          if (Number.isFinite(terminalAtMs)) {
            if (now - terminalAtMs > failedRetentionMs) {
              await fs.rm(jobDir, { recursive: true, force: true });
              evictedFailed.push(jobId);
              continue; // Already gone — not a disk-pressure candidate.
            }
            terminalCandidates.push({ jobId, terminalAtMs });
          }
        }
      }

      // Disk-pressure eviction: oldest terminal (failed) job first, never
      // touching active workspaces, stopping once free space clears the
      // threshold or no terminal candidates remain.
      const evictedForDiskPressure: string[] = [];
      terminalCandidates.sort((left, right) => left.terminalAtMs - right.terminalAtMs);
      for (const candidate of terminalCandidates) {
        const free = await (async (): Promise<number> => {
          try {
            const stats = await statfsImpl(root);
            if (!Number.isFinite(stats.bavail) || !Number.isFinite(stats.bsize)) return Number.POSITIVE_INFINITY;
            return stats.bavail * stats.bsize;
          } catch {
            return Number.POSITIVE_INFINITY;
          }
        })();
        if (free >= diskPressureThresholdBytes) break;
        const jobDir = path.join(root, candidate.jobId);
        await fs.rm(jobDir, { recursive: true, force: true });
        evictedForDiskPressure.push(candidate.jobId);
      }

      return { evictedFailed, rotatedLogs, evictedForDiskPressure };
    },
  };
}
