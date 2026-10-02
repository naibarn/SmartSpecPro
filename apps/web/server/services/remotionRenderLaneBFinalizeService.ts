/**
 * Lane B (worker-fleet) completion finalizer for `remotion_render_video`
 * worker jobs.
 *
 * Why this exists
 * ---------------
 * A `remotion_render_video` job can finish through two different lanes and
 * only ONE of them used to produce a root-level `worker_jobs.outputJson`:
 *
 *  - Lane A (in-process): `videoIntelligenceJobs.dispatchLaneARemotionRenderJob`
 *    writes the executor's return value DIRECTLY as the row's `outputJson`
 *    (`{ videoProjectId, projectRevision, traceId, outputUrl,
 *    outputArtifactRef, artifacts }`), so every consumer reading
 *    `outputJson.outputUrl` / `outputJson.artifacts` at the ROOT works.
 *
 *  - Lane B (external worker over HTTP): the worker uploads its mp4 through
 *    `POST /api/worker-jobs/:jobId/artifacts/init-upload` + `/complete`, then
 *    reports a final `job.completed` event. `recordWorkerJobEvent` nests that
 *    event's payload under `outputJson.lastEventPayload` and never spreads it
 *    to the root — so `outputJson.outputUrl` stayed permanently undefined for
 *    every Lane B render, and a finished render looked unreconcilable to any
 *    consumer written against the Lane A shape.
 *
 * This module closes that gap the same way `hermesMediaFinalizeService`
 * closes the equivalent gap for `hermes_media_*` jobs: a narrow, job-type
 * keyed finalize step invoked once on terminal completion.
 *
 * Why the worker cannot just send the URL itself
 * ---------------------------------------------
 * `worker_artifacts` (drizzle `workerArtifacts`) has NO `url` column — only
 * `storageRef`. A real playback URL only exists once the server resolves that
 * ref through the active storage backend (`storageGet`), exactly as
 * `workerArtifactService.publishWorkerArtifacts` already does. So the worker
 * sends its `storageRef` as an `outputUrl` stand-in and the server replaces it
 * with the resolved URL here. A non-http(s) `outputUrl` reported by a worker
 * is therefore treated as a ref, never as a URL.
 */

import { and, eq } from "drizzle-orm";

import { getDb } from "../db";
import { storageGet } from "../storage";
import { workerArtifacts, workerJobs } from "../../drizzle/schema";
import { debugError } from "../_core/logger";
import { isPlainObject, sanitizeWorkerPayload } from "./workerPayloadSanitizer";

export const REMOTION_RENDER_VIDEO_JOB_TYPE = "remotion_render_video";

/**
 * The artifact the render's playback URL must come from. Lane A emits this
 * exact `artifactType` for its mp4 (`hyperframesRenderWorker.ts`), and the
 * Lane B worker mirrors it — the mp4 is the only artifact of the four
 * (`mp4`/`manifest`/`log`/`probe_report`) that is a real stored object.
 */
const REMOTION_RENDER_MP4_ARTIFACT_TYPE = "remotion_render_mp4";

type JobRecord = Record<string, any>;
type ArtifactRecord = Record<string, any>;

export interface RemotionRenderLaneBFinalizeRepository {
  getJobById: (tenantId: string, jobId: string) => Promise<JobRecord | null>;
  listArtifactsByJobId: (jobId: string) => Promise<ArtifactRecord[]>;
  updateJobOutput: (jobId: string, outputJson: Record<string, unknown>) => Promise<void>;
}

export interface RemotionRenderLaneBFinalizeDeps {
  repo?: RemotionRenderLaneBFinalizeRepository;
  storageGet?: (storageRef: string) => Promise<{ key: string; url: string }>;
}

export interface RemotionRenderLaneBFinalizeResult {
  outputUrl: string;
  outputArtifactRef: Record<string, unknown>;
  artifacts: Record<string, unknown>[];
  videoProjectId: string | null;
  projectRevision: number | null;
  traceId: string | null;
}

export const defaultRemotionRenderLaneBFinalizeRepo: RemotionRenderLaneBFinalizeRepository = {
  async getJobById(tenantId, jobId) {
    const db = await getDb();
    const [job] = await db
      .select()
      .from(workerJobs)
      .where(and(eq(workerJobs.id, jobId), eq(workerJobs.tenantId, tenantId)))
      .limit(1);
    return job ?? null;
  },
  async listArtifactsByJobId(jobId) {
    const db = await getDb();
    return db
      .select()
      .from(workerArtifacts)
      .where(eq(workerArtifacts.workerJobId, jobId));
  },
  async updateJobOutput(jobId, outputJson) {
    const db = await getDb();
    await db.update(workerJobs).set({ outputJson }).where(eq(workerJobs.id, jobId));
  },
};

function asRecord(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? (value as Record<string, unknown>) : {};
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isHttpUrl(value: unknown): boolean {
  const text = cleanString(value);
  return text != null && /^https?:\/\//i.test(text);
}

/**
 * Picks the artifact row whose `storageRef` holds the rendered mp4. Prefers
 * the ref the worker itself named in the completed payload (so a job that
 * uploaded several mp4s across retried attempts resolves the one the worker
 * actually reported), then the canonical `remotion_render_mp4` artifact type,
 * then any video artifact.
 */
function selectRenderedVideoArtifact(
  artifacts: ArtifactRecord[],
  reportedStorageRef: string | null,
): ArtifactRecord | null {
  if (reportedStorageRef) {
    const byRef = artifacts.find((artifact) => artifact.storageRef === reportedStorageRef);
    if (byRef) return byRef;
  }
  const byType = artifacts.find(
    (artifact) => artifact.artifactType === REMOTION_RENDER_MP4_ARTIFACT_TYPE,
  );
  if (byType) return byType;
  return (
    artifacts.find((artifact) => {
      const contentType = cleanString(asRecord(artifact.metadataJson).contentType) ?? "";
      return contentType.toLowerCase().startsWith("video/");
    }) ?? null
  );
}

/**
 * Reads the mp4 ref the worker named in its `job.completed` payload. The
 * worker may put it in `outputArtifactRef.storageRef`, in the matching
 * `artifacts[]` entry, or — because it has no way to mint a real URL — as the
 * `outputUrl` stand-in. A value that already looks like an http(s) URL is NOT
 * a storage ref and is ignored here.
 */
function readReportedStorageRef(payload: Record<string, unknown>): string | null {
  const fromArtifactRef = cleanString(asRecord(payload.outputArtifactRef).storageRef);
  if (fromArtifactRef) return fromArtifactRef;

  const artifacts = Array.isArray(payload.artifacts) ? payload.artifacts : [];
  for (const entry of artifacts) {
    const record = asRecord(entry);
    if (record.artifactType !== REMOTION_RENDER_MP4_ARTIFACT_TYPE) continue;
    const ref = cleanString(record.storageRef);
    if (ref) return ref;
  }

  const outputUrl = cleanString(payload.outputUrl);
  return outputUrl && !isHttpUrl(outputUrl) ? outputUrl : null;
}

function buildArtifactRef(
  artifact: ArtifactRecord,
  resolvedUrl: string,
  reportedRef: Record<string, unknown>,
): Record<string, unknown> {
  const metadata = asRecord(artifact.metadataJson);
  return {
    ...reportedRef,
    artifactId: artifact.id ?? reportedRef.artifactId ?? null,
    artifactType: artifact.artifactType ?? reportedRef.artifactType ?? REMOTION_RENDER_MP4_ARTIFACT_TYPE,
    storageRef: artifact.storageRef,
    url: resolvedUrl,
    contentHash:
      cleanString(metadata.checksumSha256) ?? cleanString(reportedRef.contentHash) ?? null,
    mimeType: cleanString(metadata.contentType) ?? cleanString(reportedRef.mimeType) ?? null,
    sizeBytes: finiteNumber(metadata.sizeBytes) ?? finiteNumber(reportedRef.sizeBytes) ?? null,
  };
}

/**
 * Keeps the worker-reported `artifacts[]` list (manifest/log/probe entries
 * carry information no DB row has) while replacing the mp4 entry's stand-in
 * `url` with the server-resolved one. When the worker reported no list at
 * all, the list is synthesized from the uploaded artifact rows so consumers
 * that read `outputJson.artifacts` still see the render's output.
 */
function buildArtifactsList(
  payload: Record<string, unknown>,
  artifacts: ArtifactRecord[],
  videoArtifact: ArtifactRecord,
  resolvedUrl: string,
): Record<string, unknown>[] {
  const reported = Array.isArray(payload.artifacts) ? payload.artifacts : [];
  if (reported.length > 0) {
    return reported.map((entry) => {
      const record = { ...asRecord(entry) };
      const matchesVideo =
        cleanString(record.storageRef) === videoArtifact.storageRef
        || (cleanString(record.storageRef) == null
          && record.artifactType === videoArtifact.artifactType);
      return matchesVideo ? buildArtifactRef(videoArtifact, resolvedUrl, record) : record;
    });
  }

  return artifacts.map((artifact) => {
    if (artifact.storageRef === videoArtifact.storageRef) {
      return buildArtifactRef(artifact, resolvedUrl, {});
    }
    const metadata = asRecord(artifact.metadataJson);
    return {
      artifactId: artifact.id ?? null,
      artifactType: artifact.artifactType,
      storageRef: artifact.storageRef,
      contentHash: cleanString(metadata.checksumSha256),
      mimeType: cleanString(metadata.contentType),
      sizeBytes: finiteNumber(metadata.sizeBytes),
    };
  });
}

/**
 * Spreads a Lane B `job.completed` payload onto the ROOT of the job's
 * `outputJson`, with `outputUrl` resolved from the uploaded artifact's
 * `storageRef` through the active storage backend.
 *
 * Idempotent: re-running after a successful finalize re-resolves the same ref
 * and rewrites the same fields. Never throws — a storage-resolution failure
 * must not un-complete a render that genuinely succeeded; it returns `null`
 * and logs, leaving `outputJson.lastEventPayload` (already persisted by
 * `recordWorkerJobEvent`) as the only record of the completion.
 *
 * Identity fields (`videoProjectId`, `projectRevision`, `traceId`) come from
 * the event payload and fall back to the job's own `inputJson`, which is the
 * enqueue-time source of truth for all three.
 */
export async function finalizeRemotionRenderVideoLaneBOutput(
  params: {
    tenantId: string;
    jobId: string;
    eventPayload?: unknown;
  },
  deps: RemotionRenderLaneBFinalizeDeps = {},
): Promise<RemotionRenderLaneBFinalizeResult | null> {
  const repo = deps.repo ?? defaultRemotionRenderLaneBFinalizeRepo;
  const resolveStorage = deps.storageGet ?? storageGet;

  try {
    const job = await repo.getJobById(params.tenantId, params.jobId);
    if (!job) return null;
    if (job.jobType !== REMOTION_RENDER_VIDEO_JOB_TYPE) return null;

    const payload = sanitizeWorkerPayload(asRecord(params.eventPayload)) as Record<string, unknown>;
    const artifacts = await repo.listArtifactsByJobId(job.id);
    const videoArtifact = selectRenderedVideoArtifact(artifacts, readReportedStorageRef(payload));
    if (!videoArtifact) {
      debugError(
        "remotionRenderLaneBFinalize",
        `remotion_render_video job ${params.jobId} completed without a resolvable video artifact; `
          + "root outputJson.outputUrl was not set",
        null,
      );
      return null;
    }

    const stored = await resolveStorage(videoArtifact.storageRef);
    const resolvedUrl = cleanString(stored?.url);
    if (!resolvedUrl) {
      debugError(
        "remotionRenderLaneBFinalize",
        `Storage backend returned no URL for remotion_render_video job ${params.jobId} `
          + `artifact ${videoArtifact.storageRef}`,
        null,
      );
      return null;
    }

    const inputJson = asRecord(job.inputJson);
    const result: RemotionRenderLaneBFinalizeResult = {
      outputUrl: resolvedUrl,
      outputArtifactRef: buildArtifactRef(
        videoArtifact,
        resolvedUrl,
        asRecord(payload.outputArtifactRef),
      ),
      artifacts: buildArtifactsList(payload, artifacts, videoArtifact, resolvedUrl),
      videoProjectId:
        cleanString(payload.videoProjectId) ?? cleanString(inputJson.videoProjectId),
      projectRevision:
        finiteNumber(payload.projectRevision) ?? finiteNumber(inputJson.projectRevision),
      traceId: cleanString(payload.traceId) ?? cleanString(inputJson.traceId),
    };

    // Re-read is deliberate: `recordWorkerJobEvent` (and, on the default
    // repo, `publishWorkerArtifacts`) both write `outputJson` before this
    // runs, so merging onto the row read at the top of this function would
    // drop `publishedArtifacts` / `lastEventPayload`.
    const current = await repo.getJobById(params.tenantId, params.jobId);
    await repo.updateJobOutput(job.id, {
      ...asRecord((current ?? job).outputJson),
      outputUrl: result.outputUrl,
      outputArtifactRef: result.outputArtifactRef,
      artifacts: result.artifacts,
      videoProjectId: result.videoProjectId,
      projectRevision: result.projectRevision,
      traceId: result.traceId,
    });

    return result;
  } catch (error) {
    debugError(
      "remotionRenderLaneBFinalize",
      `Failed to finalize Lane B remotion_render_video output for job ${params.jobId}`,
      error,
    );
    return null;
  }
}
