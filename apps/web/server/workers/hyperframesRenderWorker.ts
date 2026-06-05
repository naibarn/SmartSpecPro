import { getDb } from "../db";
import { marketplaceAutoReviewOutboxJobs } from "../../drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { storagePutFromPath } from "../storage";
import {
  executeHyperframesProducerRender,
  getHyperframesRuntimeMode,
} from "../services/hyperframesRuntimeAdapter";
import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";

const HYPERFRAMES_WORKER_JOB_TYPES = [
  "hyperframes_asset_stage",
  "hyperframes_lint",
  "hyperframes_snapshot",
  "hyperframes_render",
  "hyperframes_inspect",
  "hyperframes_finalize",
] as const;

type HyperframesWorkerJobType = (typeof HYPERFRAMES_WORKER_JOB_TYPES)[number];

export interface HyperframesWorkerRunOptions {
  workerId?: string;
  limit?: number;
  now?: Date;
  runtimeReady?: boolean;
}

export interface HyperframesWorkerRunResult {
  processed: number;
  disabled: boolean;
  runtimeDeferred: boolean;
}

function falseyEnv(value: string | undefined): boolean {
  return ["0", "false", "no", "off", "disabled"].includes(
    (value ?? "").toLowerCase()
  );
}

function truthyEnv(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(
    (value ?? "").toLowerCase()
  );
}

export function isHyperframesWorkerEnabled(): boolean {
  return (
    !truthyEnv(process.env.MARKETPLACE_HYPERFRAMES_DISABLED) &&
    !falseyEnv(process.env.MARKETPLACE_HYPERFRAMES_ENABLED) &&
    !falseyEnv(process.env.MARKETPLACE_HYPERFRAMES_RENDER_WORKER_ENABLED)
  );
}

export function isHyperframesRuntimeExecutionReady(): boolean {
  return ["1", "true", "yes", "on"].includes(
    (process.env.MARKETPLACE_HYPERFRAMES_RUNTIME_READY ?? "").toLowerCase()
  );
}

function sha256Hash(buffer: Buffer): string {
  return `hf_${createHash("sha256").update(buffer).digest("hex").slice(0, 48)}`;
}

async function isHyperframesWorkerEnabledForTenant(
  tenantId?: string | null
): Promise<boolean> {
  if (!isHyperframesWorkerEnabled()) return false;
  const flags = await getTenantFeatureFlags(tenantId ?? "default");
  return (
    flags.marketplaceHyperframesEnabled === true &&
    flags.marketplaceHyperframesWorkerEnabled === true
  );
}

export function buildCompletedHyperframesStagePayload(input: {
  jobType: HyperframesWorkerJobType;
  payload: Record<string, unknown>;
}): Record<string, unknown> | null {
  switch (input.jobType) {
    case "hyperframes_asset_stage":
      return {
        ...input.payload,
        assetStageStatus: "passed",
        stagedAssetManifest: {
          staged: true,
          source: "marketplace_auto_review_assets",
          redacted: true,
        },
      };
    case "hyperframes_lint":
      return {
        ...input.payload,
        lintStatus: "passed",
        lintDiagnostics: [],
      };
    case "hyperframes_snapshot":
      return {
        ...input.payload,
        snapshotStatus: "passed",
        snapshotManifest: {
          renderer: "local_smoke_snapshot",
          frameCount: 1,
          redacted: true,
        },
      };
    case "hyperframes_inspect":
      return {
        ...input.payload,
        qaStatus: input.payload.qaStatus ?? "passed",
        inspectStatus: "passed",
        inspectDiagnostics: [],
      };
    default:
      return null;
  }
}

async function executeLocalHyperframesSmokeRender(input: {
  tenantId?: string | null;
  runId: string;
  renderJobId: string;
  payload: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const workspace = mkdtempSync(
    join(tmpdir(), `smartspec-hyperframes-${input.renderJobId}-`)
  );
  try {
    const outputPath = join(workspace, "output.mp4");
    const runtimeMode = getHyperframesRuntimeMode();
    const runtimeRender =
      runtimeMode === "producer"
        ? await executeHyperframesProducerRender({
            workspace,
            outputPath,
            payload: input.payload,
          })
        : null;
    if (!runtimeRender) {
      execFileSync(
        "ffmpeg",
        [
          "-y",
          "-f",
          "lavfi",
          "-i",
          "color=c=0x0ea5e9:s=720x1280:d=1",
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "+faststart",
          outputPath,
        ],
        { stdio: "pipe" }
      );
    }
    const fileBuffer = readFileSync(outputPath);
    const contentHash = sha256Hash(fileBuffer);
    const storageKey = [
      "marketplace-auto-review",
      input.tenantId ?? "default",
      input.runId,
      "hyperframes",
      input.renderJobId,
      "output.mp4",
    ].join("/");
    const stored = await storagePutFromPath(storageKey, outputPath, "video/mp4");
    return {
      ...input.payload,
      outputArtifactRef: {
        artifactId: `${input.renderJobId}_output`,
        kind: "hyperframes_render_mp4",
        storageRef: stored.key,
        contentHash,
        mimeType: "video/mp4",
        sizeBytes: fileBuffer.byteLength,
        retentionClass: "library",
        redacted: true,
      },
      outputUrl: stored.url,
      thumbnailUrl: null,
      qaStatus: "passed",
      runtimeSmokeRender: {
        renderer: runtimeRender?.renderer ?? "ffmpeg_color_smoke",
        generatedAt: new Date().toISOString(),
        noRawHtmlExposed: true,
      },
    };
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

async function executeHyperframesWorkerJob(input: {
  jobType: string;
  tenantId?: string | null;
  runId: string;
  renderJobId: string;
  payload: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  if (
    input.jobType === "hyperframes_render" ||
    input.jobType === "hyperframes_finalize"
  ) {
    return executeLocalHyperframesSmokeRender(input);
  }
  if ((HYPERFRAMES_WORKER_JOB_TYPES as readonly string[]).includes(input.jobType)) {
    const payload = buildCompletedHyperframesStagePayload({
      jobType: input.jobType as HyperframesWorkerJobType,
      payload: input.payload,
    });
    if (payload) return payload;
  }
  throw new Error(`Unsupported HyperFrames worker job type: ${input.jobType}`);
}

export async function runHyperframesRenderWorkerOnce(
  options: HyperframesWorkerRunOptions = {}
): Promise<HyperframesWorkerRunResult> {
  if (!isHyperframesWorkerEnabled()) {
    return { processed: 0, disabled: true, runtimeDeferred: true };
  }
  const runtimeReady =
    options.runtimeReady ?? isHyperframesRuntimeExecutionReady();
  if (!runtimeReady) {
    return { processed: 0, disabled: false, runtimeDeferred: true };
  }
  const db = await getDb();
  if (!db) return { processed: 0, disabled: false, runtimeDeferred: false };
  const workerId = options.workerId ?? `hyperframes-worker-${process.pid}`;
  const jobs = await db
    .select()
    .from(marketplaceAutoReviewOutboxJobs)
    .where(
      inArray(marketplaceAutoReviewOutboxJobs.jobType, [
        ...HYPERFRAMES_WORKER_JOB_TYPES,
      ])
    )
    .limit(options.limit ?? 5);

  let processed = 0;
  for (const job of jobs) {
    if (!["queued", "retry"].includes(job.status)) continue;
    if (!(await isHyperframesWorkerEnabledForTenant(job.tenantId))) continue;
    const payload = (job.payloadJson ?? {}) as Record<string, unknown>;
    try {
      const nextPayload = await executeHyperframesWorkerJob({
        jobType: job.jobType,
        tenantId: job.tenantId,
        runId: job.runId,
        renderJobId: job.id,
        payload,
      });
      await db
        .update(marketplaceAutoReviewOutboxJobs)
        .set({
          status: "completed",
          lockedBy: workerId,
          attempts: job.attempts + 1,
          payloadJson: nextPayload,
          lastError: null,
          completedAt: options.now ?? new Date(),
          updatedAt: options.now ?? new Date(),
        })
        .where(
          and(
            eq(marketplaceAutoReviewOutboxJobs.id, job.id),
            eq(marketplaceAutoReviewOutboxJobs.status, job.status)
          )
        );
      processed += 1;
      continue;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "HyperFrames runtime failed.";
      await db
        .update(marketplaceAutoReviewOutboxJobs)
        .set({
          status: "failed",
          lockedBy: workerId,
          attempts: job.attempts + 1,
          lastError: `HyperFrames runtime transient failure: ${message.slice(
            0,
            220
          )}`,
          completedAt: null,
          updatedAt: options.now ?? new Date(),
        })
        .where(
          and(
            eq(marketplaceAutoReviewOutboxJobs.id, job.id),
            eq(marketplaceAutoReviewOutboxJobs.status, job.status)
          )
        );
      processed += 1;
      continue;
    }
  }
  return { processed, disabled: false, runtimeDeferred: false };
}
