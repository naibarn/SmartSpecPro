import { and, eq } from "drizzle-orm";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { marketplaceAutoReviewOutboxJobs } from "../../drizzle/schema";
import { getDb } from "../db";
import { runHyperframesRenderWorkerOnce } from "./hyperframesRenderWorker";

let releaseLocalRenderSlot: (() => void) | null = null;

function getArgValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${value} is not a positive integer`);
  }
  return parsed;
}

async function main(): Promise<void> {
  const renderJobId = getArgValue("--render-job-id");
  const limit = parsePositiveInt(getArgValue("--limit")) ?? 1;
  const workerId = `hyperframes-worker-${process.pid}`;
  const localSlot = await acquireLocalHyperframesRenderSlot();
  releaseLocalRenderSlot = localSlot.release;
  registerShutdownLockRelease(renderJobId, workerId);
  try {
    const result = await runHyperframesRenderWorkerOnce({
      renderJobId,
      limit,
      workerId,
    });
    console.info("[HyperFramesRenderWorkerCli] completed", {
      renderJobId: renderJobId ?? null,
      ...result,
    });
  } finally {
    localSlot.release();
    releaseLocalRenderSlot = null;
  }
}

function registerShutdownLockRelease(
  renderJobId: string | undefined,
  workerId: string,
): void {
  if (!renderJobId) return;
  let releasing = false;
  const release = (signal: NodeJS.Signals) => {
    if (releasing) return;
    releasing = true;
    void releaseRenderJobLock({
      renderJobId,
      workerId,
      signal,
    }).finally(() => {
      releaseLocalRenderSlot?.();
      process.exit(0);
    });
  };
  process.once("SIGTERM", release);
  process.once("SIGINT", release);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getLocalRenderLockPath(): string {
  return process.env.HYPERFRAMES_LOCAL_RENDER_LOCK_PATH ||
    join(tmpdir(), "smartspec-hyperframes-render.lock");
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
    return code !== "ESRCH";
  }
}

function readLockOwner(lockPath: string): number | null {
  try {
    const raw = readFileSync(lockPath, "utf8").trim();
    const pid = Number(raw.split(/\s+/)[0]);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

async function acquireLocalHyperframesRenderSlot(): Promise<{ release: () => void }> {
  const lockPath = getLocalRenderLockPath();
  const timeoutMs = Number(process.env.HYPERFRAMES_LOCAL_RENDER_LOCK_TIMEOUT_MS || 6 * 60 * 60_000);
  const pollMs = Number(process.env.HYPERFRAMES_LOCAL_RENDER_LOCK_POLL_MS || 5_000);
  const deadline = Date.now() + Math.max(timeoutMs, pollMs);
  mkdirSync(dirname(lockPath), { recursive: true });

  while (Date.now() < deadline) {
    try {
      const fd = openSync(lockPath, "wx");
      writeFileSync(fd, `${process.pid} ${new Date().toISOString()}\n`);
      closeSync(fd);
      let released = false;
      return {
        release: () => {
          if (released) return;
          released = true;
          try {
            const owner = readLockOwner(lockPath);
            if (owner === process.pid) unlinkSync(lockPath);
          } catch {
            // Best-effort cleanup only; stale owner recovery handles leftovers.
          }
        },
      };
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
      if (code !== "EEXIST") throw error;
      const owner = readLockOwner(lockPath);
      if (!owner || !isPidAlive(owner)) {
        try {
          unlinkSync(lockPath);
          continue;
        } catch {
          await sleep(pollMs);
          continue;
        }
      }
      console.info("[HyperFramesRenderWorkerCli] waiting for local render slot", {
        ownerPid: owner,
        renderPid: process.pid,
      });
      await sleep(pollMs);
    }
  }
  throw new Error("Timed out waiting for local HyperFrames render slot.");
}

async function releaseRenderJobLock(input: {
  renderJobId: string;
  workerId: string;
  signal: NodeJS.Signals;
}): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const now = new Date();
    await db
      .update(marketplaceAutoReviewOutboxJobs)
      .set({
        status: "retry",
        lockedBy: null,
        lockedUntil: null,
        completedAt: null,
        scheduledAt: now,
        updatedAt: now,
        lastError: `HyperFrames render worker was interrupted by ${input.signal}; job was released for retry.`,
      })
      .where(
        and(
          eq(marketplaceAutoReviewOutboxJobs.id, input.renderJobId),
          eq(marketplaceAutoReviewOutboxJobs.status, "running"),
          eq(marketplaceAutoReviewOutboxJobs.lockedBy, input.workerId),
        ),
      );
  } catch (error) {
    console.warn(
      "[HyperFramesRenderWorkerCli] failed to release render job lock",
      error instanceof Error ? error.message : error,
    );
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error(
      "[HyperFramesRenderWorkerCli] failed",
      error instanceof Error ? error.stack || error.message : error,
    );
    process.exit(1);
  });
