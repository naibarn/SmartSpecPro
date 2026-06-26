import { and, eq } from "drizzle-orm";

import { getDb } from "../db";
import { storageGet } from "../storage";
import { workerArtifacts, workerJobs } from "../../drizzle/schema";
import {
  createLibraryItem,
  safeEnqueueLibraryIndexJob,
  type LibraryActor,
} from "./libraryService";
import { auditLogger } from "./auditLogger";
import {
  HyperframesWorkerVerificationError,
  verifyHyperframesWorkerArtifacts,
} from "./hyperframesWorkerVerificationService";
import { isPlainObject, sanitizeWorkerPayload } from "./workerPayloadSanitizer";

type WorkerJobRecord = Record<string, any>;
type WorkerArtifactRecord = Record<string, any>;

const WORKER_ARTIFACT_STORAGE_PREFIX = "worker-artifacts/";
const MAX_WORKER_ARTIFACT_SIZE_BYTES = parseInt(
  process.env.WORKER_ARTIFACT_MAX_BYTES || String(2000 * 1024 * 1024),
  10,
);
const UNSAFE_DOWNLOAD_ONLY_CONTENT_TYPES = new Set([
  "image/svg+xml",
  "text/html",
  "application/xhtml+xml",
]);
const REJECTED_CONTENT_TYPES = new Set([
  "application/x-msdownload",
  "application/x-dosexec",
  "application/x-bat",
  "application/x-msi",
  "application/x-sh",
  "application/javascript",
  "text/javascript",
]);

export interface WorkerArtifactPublicationResult {
  artifactId: string;
  publishedItemId: number;
  created: boolean;
  indexStatus: string;
  safeServing: "inline" | "download_only";
  sourceUrl?: string | null;
}

export interface WorkerArtifactRepository {
  getJobById: (tenantId: string, jobId: string) => Promise<WorkerJobRecord | null>;
  listArtifactsByJobId: (jobId: string) => Promise<WorkerArtifactRecord[]>;
  updateArtifactPublishedItem: (artifactId: string, publishedItemId: number) => Promise<void>;
  updateJobOutput: (jobId: string, outputJson: Record<string, unknown>) => Promise<void>;
}

export class WorkerArtifactValidationError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.name = "WorkerArtifactValidationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const defaultRepo: WorkerArtifactRepository = {
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
  async updateArtifactPublishedItem(artifactId, publishedItemId) {
    const db = await getDb();
    await db
      .update(workerArtifacts)
      .set({ publishedItemId })
      .where(eq(workerArtifacts.id, artifactId));
  },
  async updateJobOutput(jobId, outputJson) {
    const db = await getDb();
    await db
      .update(workerJobs)
      .set({ outputJson })
      .where(eq(workerJobs.id, jobId));
  },
};

function normalizeContentType(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeChecksum(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function determineItemType(contentType: string, artifactType: string): string {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("audio/")) return "audio";
  if (contentType === "application/pdf" || contentType.startsWith("text/")) {
    return "document";
  }
  if (artifactType.includes("thumbnail")) return "image";
  if (artifactType.includes("subtitle")) return "document";
  return "file";
}

function determineSafeServing(contentType: string): "inline" | "download_only" {
  if (UNSAFE_DOWNLOAD_ONLY_CONTENT_TYPES.has(contentType)) {
    return "download_only";
  }
  if (contentType.startsWith("image/") || contentType.startsWith("video/") || contentType.startsWith("audio/")) {
    return "inline";
  }
  if (contentType === "application/pdf" || contentType.startsWith("text/plain")) {
    return "inline";
  }
  return "download_only";
}

function validateArtifactForPublication(
  tenantId: string,
  jobId: string,
  artifact: WorkerArtifactRecord,
): {
  checksumSha256: string;
  contentType: string;
  sizeBytes: number;
  itemType: string;
  safeServing: "inline" | "download_only";
} {
  const metadata = (artifact.metadataJson ?? {}) as Record<string, unknown>;
  const checksumSha256 = normalizeChecksum(metadata.checksumSha256);
  const contentType = normalizeContentType(metadata.contentType);
  const sizeBytes = typeof metadata.sizeBytes === "number"
    ? metadata.sizeBytes
    : Number(metadata.sizeBytes);

  if (
    typeof artifact.storageRef !== "string"
    || !artifact.storageRef.startsWith(`${WORKER_ARTIFACT_STORAGE_PREFIX}${tenantId}/${jobId}/`)
  ) {
    throw new WorkerArtifactValidationError(
      "invalid_storage_ref",
      409,
      "Worker artifact storageRef does not match the expected tenant/job prefix",
    );
  }

  if (!/^[a-f0-9]{64}$/.test(checksumSha256)) {
    throw new WorkerArtifactValidationError(
      "invalid_checksum",
      400,
      "Worker artifact checksum must be a sha256 hex digest",
    );
  }

  if (!Number.isFinite(sizeBytes) || sizeBytes < 0 || sizeBytes > MAX_WORKER_ARTIFACT_SIZE_BYTES) {
    throw new WorkerArtifactValidationError(
      "invalid_size",
      400,
      "Worker artifact size exceeds the publication limit",
    );
  }

  if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(contentType)) {
    throw new WorkerArtifactValidationError(
      "invalid_content_type",
      400,
      "Worker artifact content type is invalid",
    );
  }

  if (REJECTED_CONTENT_TYPES.has(contentType)) {
    throw new WorkerArtifactValidationError(
      "unsupported_content_type",
      400,
      `Worker artifact content type ${contentType} is not allowed for publication`,
    );
  }

  const itemType = determineItemType(contentType, String(artifact.artifactType || ""));
  const safeServing = determineSafeServing(contentType);
  return {
    checksumSha256,
    contentType,
    sizeBytes,
    itemType,
    safeServing,
  };
}

function prepareArtifactsForPublication(
  job: WorkerJobRecord,
  artifacts: WorkerArtifactRecord[],
): {
  artifacts: WorkerArtifactRecord[];
  hyperframesVerificationReport: Record<string, unknown> | null;
} {
  if (job.jobType !== "hyperframes_final_composite") {
    return { artifacts, hyperframesVerificationReport: null };
  }

  const report = verifyHyperframesWorkerArtifacts({ job, artifacts });
  const publishableIds = new Set(report.publishableArtifactIds);
  return {
    artifacts: artifacts.filter((artifact) => publishableIds.has(artifact.id)),
    hyperframesVerificationReport: report as unknown as Record<string, unknown>,
  };
}

export async function publishWorkerArtifacts(
  input: {
    tenantId: string;
    jobId: string;
    actorUserId?: number | null;
    actorRole?: string | null;
  },
  deps: {
    repo?: WorkerArtifactRepository;
    createLibraryItem?: typeof createLibraryItem;
    safeEnqueueLibraryIndexJob?: typeof safeEnqueueLibraryIndexJob;
    storageGet?: typeof storageGet;
  } = {},
): Promise<WorkerArtifactPublicationResult[]> {
  const repo = deps.repo ?? defaultRepo;
  const createItem = deps.createLibraryItem ?? createLibraryItem;
  const enqueueIndex = deps.safeEnqueueLibraryIndexJob ?? safeEnqueueLibraryIndexJob;
  const resolveStorage = deps.storageGet ?? storageGet;

  const job = await repo.getJobById(input.tenantId, input.jobId);
  if (!job) {
    throw new WorkerArtifactValidationError("job_not_found", 404, `Worker job ${input.jobId} was not found`);
  }

  const actorUserId = input.actorUserId ?? job.requestedByUserId ?? null;
  if (!actorUserId) {
    return [];
  }

  const actor: LibraryActor = {
    userId: actorUserId,
    tenantId: input.tenantId,
    role: input.actorRole ?? "user",
  };

  const allArtifacts = await repo.listArtifactsByJobId(job.id);
  let artifacts: WorkerArtifactRecord[];
  let hyperframesVerificationReport: Record<string, unknown> | null;
  try {
    const prepared = prepareArtifactsForPublication(job, allArtifacts);
    artifacts = prepared.artifacts;
    hyperframesVerificationReport = prepared.hyperframesVerificationReport;
  } catch (error) {
    if (error instanceof HyperframesWorkerVerificationError) {
      await repo.updateJobOutput(job.id, {
        ...(isPlainObject(job.outputJson) ? job.outputJson : {}),
        hyperframesWorkerVerification: error.report as unknown as Record<string, unknown>,
      });
      throw new WorkerArtifactValidationError(
        error.code,
        409,
        error.message,
      );
    }
    throw error;
  }
  const results: WorkerArtifactPublicationResult[] = [];

  for (const artifact of artifacts) {
    if (artifact.publishedItemId) {
      results.push({
        artifactId: artifact.id,
        publishedItemId: artifact.publishedItemId,
        created: false,
        indexStatus: "already_published",
        safeServing: determineSafeServing(normalizeContentType(artifact.metadataJson?.contentType)),
        sourceUrl:
          typeof artifact.metadataJson?.sourceUrl === "string"
            ? artifact.metadataJson.sourceUrl
            : null,
      });
      continue;
    }

    const validated = validateArtifactForPublication(input.tenantId, input.jobId, artifact);
    const storageAsset = await resolveStorage(artifact.storageRef);
    const sourceMetadata = sanitizeWorkerPayload(artifact.metadataJson ?? {}) as Record<string, unknown>;
    const libraryResult = await createItem(
      {
        itemType: validated.itemType,
        source: "worker_runtime",
        title:
          typeof sourceMetadata.fileName === "string" && sourceMetadata.fileName.trim().length > 0
            ? sourceMetadata.fileName.trim()
            : typeof sourceMetadata.title === "string" && sourceMetadata.title.trim().length > 0
              ? sourceMetadata.title.trim()
              : `${artifact.artifactType} (${job.jobType})`,
        description:
          typeof sourceMetadata.description === "string"
            ? sourceMetadata.description
            : typeof job.inputJson?.description === "string"
              ? job.inputJson.description
              : null,
        status: "indexing",
        visibility: "private",
        metadata: {
          ...sourceMetadata,
          checksumSha256: validated.checksumSha256,
          contentType: validated.contentType,
          sizeBytes: validated.sizeBytes,
          safeServing: validated.safeServing,
          workerJobId: job.id,
          workerId: job.workerId,
          runtimeType: job.runtimeType,
        },
        sourceUrl: storageAsset.url,
        thumbnailUrl:
          validated.itemType === "image" && validated.safeServing === "inline"
            ? storageAsset.url
            : null,
        sourceLink: {
          linkType: "worker_artifact",
          linkId: String(artifact.id),
          providerTaskId: job.id,
        },
      },
      actor,
    );

    const indexJob = await enqueueIndex({
      libraryItemId: libraryResult.item.id,
      tenantId: input.tenantId,
      jobType: "initial_index",
      domain: "library",
      operation: "index",
      source: "library.worker_artifact",
      sourceMetadata: {
        workerJobId: job.id,
        workerArtifactId: artifact.id,
        runtimeType: job.runtimeType,
      },
      allowThrottle: true,
    });

    await repo.updateArtifactPublishedItem(artifact.id, libraryResult.item.id);
    auditLogger.log({
      eventType: "worker_artifact_published",
      userId: actor.userId,
      metadata: {
        tenantId: input.tenantId,
        workerJobId: job.id,
        workerArtifactId: artifact.id,
        publishedItemId: libraryResult.item.id,
        runtimeType: job.runtimeType,
        workerId: job.workerId,
        safeServing: validated.safeServing,
      },
    });
    results.push({
      artifactId: artifact.id,
      publishedItemId: libraryResult.item.id,
      created: !libraryResult.idempotent,
      indexStatus: indexJob.status,
      safeServing: validated.safeServing,
      sourceUrl: storageAsset.url,
    });
  }

  await repo.updateJobOutput(job.id, {
    ...(isPlainObject(job.outputJson) ? job.outputJson : {}),
    ...(hyperframesVerificationReport
      ? { hyperframesWorkerVerification: hyperframesVerificationReport }
      : {}),
    publishedArtifacts: results.map((result) => ({
      artifactId: result.artifactId,
      publishedItemId: result.publishedItemId,
      indexStatus: result.indexStatus,
      safeServing: result.safeServing,
      sourceUrl: result.sourceUrl ?? null,
    })),
  });

  return results;
}
