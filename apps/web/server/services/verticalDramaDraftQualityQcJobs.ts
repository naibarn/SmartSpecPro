import { randomUUID } from "node:crypto";
import { getRedisClient } from "./redis";
import {
  draftQualityQcProgressSchema,
  fingerprintDraftQualityQcCandidate,
  type DraftQualityQcCreditEstimate,
  type DraftQualityQcFailure,
  type DraftQualityQcHistoryEntry,
  type DraftQualityQcReport,
  type DraftQualityQcJobStatus,
  type DraftQualityQcProgress,
} from "@shared/verticalDramaSeries/draftQualityQc";
import {
  runVerticalDramaDraftQualityQc,
  type DraftQualityQcImmutableConstraints,
} from "./verticalDramaDraftQualityQc";
import {
  appendVerticalDramaDraftVersion,
  updateVerticalDramaDraftJob,
  type PersistVerticalDramaDraftVersion,
  type VerticalDramaDraftVersionRef,
  type VerticalDramaDraftJobPatch,
} from "./verticalDramaDraftLedger";

type DraftQualityQcDraft = Record<string, unknown>;

export const VERTICAL_DRAMA_DRAFT_QC_QUEUE = "vertical_drama_draft_quality_qc";
const JOB_TTL_SECONDS = 60 * 60;
const ACTIVE_POINTER_TTL_SECONDS = 60 * 60;
const MAX_DRAFT_BYTES = 160_000;

export interface VerticalDramaDraftQualityQcOwner {
  tenantId: string;
  userId: number;
}

export interface VerticalDramaDraftQualityQcPayload extends VerticalDramaDraftQualityQcOwner {
  runId: string;
  draftSessionId: string;
  requestFingerprint: string;
  /** Snapshot of the server-approved LLM Recommend model used by QC. */
  model?: string;
  draftId?: string;
  draft: DraftQualityQcDraft;
  immutableConstraints: DraftQualityQcImmutableConstraints;
  maxImprovementRounds: number;
}

export interface VerticalDramaDraftQualityQcPublicResult {
  best: {
    draft: DraftQualityQcDraft;
    report: DraftQualityQcReport;
    round: number;
    fingerprint: string;
  };
  history: DraftQualityQcHistoryEntry[];
  creditEstimate: DraftQualityQcCreditEstimate;
  stopReason: "passed" | "max_rounds" | "no_improvement";
  roundsAttempted: number;
  evaluationsCompleted: number;
  model: string;
  draftArtifactId?: string;
  draftArtifact?: VerticalDramaDraftVersionRef;
}

export interface VerticalDramaDraftQualityQcRecord extends VerticalDramaDraftQualityQcPayload {
  status: DraftQualityQcJobStatus;
  progress: DraftQualityQcProgress | null;
  result: VerticalDramaDraftQualityQcPublicResult | null;
  error: string | null;
  failure: DraftQualityQcFailure | null;
  createdAt: string;
  updatedAt: string;
}

export interface DraftQualityQcRedisAdapter {
  get: (key: string) => Promise<string | null>;
  set: (
    key: string,
    value: string,
    mode: "EX",
    seconds: number
  ) => Promise<unknown>;
  del: (key: string) => Promise<unknown>;
}

interface JobDependencies {
  redis?: DraftQualityQcRedisAdapter;
  now?: () => number;
  enqueueBullmqJob?: (runId: string) => Promise<void>;
  persistVersion?: PersistVerticalDramaDraftVersion;
  persistJobStatus?: (
    draftId: string,
    owner: VerticalDramaDraftQualityQcOwner,
    patch: VerticalDramaDraftJobPatch
  ) => Promise<boolean>;
}

function defaultRedis(): DraftQualityQcRedisAdapter {
  const redis = getRedisClient();
  return {
    get: key => redis.get(key),
    set: (key, value, mode, seconds) => redis.set(key, value, mode, seconds),
    del: key => redis.del(key),
  };
}

function resolveDependencies(dependencies?: JobDependencies) {
  return {
    redis: dependencies?.redis ?? defaultRedis(),
    now: dependencies?.now ?? Date.now,
  };
}

function recordKey(runId: string): string {
  return `vd:draft-qc:${runId}`;
}

function pointerKey(
  owner: VerticalDramaDraftQualityQcOwner,
  draftSessionId: string
): string {
  return `vd:draft-qc:active:${owner.tenantId}:${owner.userId}:${draftSessionId}`;
}

async function readRecord(
  runId: string,
  dependencies?: JobDependencies
): Promise<VerticalDramaDraftQualityQcRecord | null> {
  const { redis } = resolveDependencies(dependencies);
  const raw = await redis.get(recordKey(runId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VerticalDramaDraftQualityQcRecord;
  } catch {
    return null;
  }
}

async function writeRecord(
  record: VerticalDramaDraftQualityQcRecord,
  dependencies?: JobDependencies
): Promise<void> {
  const { redis } = resolveDependencies(dependencies);
  await redis.set(
    recordKey(record.runId),
    JSON.stringify(record),
    "EX",
    JOB_TTL_SECONDS
  );
  // Keep terminal results discoverable for the creator's short-lived wizard
  // workspace so refresh can restore the review/QC result without recharging.
  if (record.status !== "cancelled") {
    await redis.set(
      pointerKey(record, record.draftSessionId),
      record.runId,
      "EX",
      ACTIVE_POINTER_TTL_SECONDS
    );
  }
}

function publicResult(
  result: Awaited<ReturnType<typeof runVerticalDramaDraftQualityQc>>,
  draftArtifactId?: string
): VerticalDramaDraftQualityQcPublicResult {
  return {
    best: result.best,
    history: result.history,
    creditEstimate: result.creditEstimate,
    stopReason: result.stopReason,
    roundsAttempted: result.roundsAttempted,
    evaluationsCompleted: result.evaluationsCompleted,
    model: result.model,
    draftArtifactId,
    draftArtifact: result.draftArtifact,
  };
}

export async function enqueueVerticalDramaDraftQualityQc(
  payload: Omit<
    VerticalDramaDraftQualityQcPayload,
    "runId" | "requestFingerprint"
  >,
  dependencies: JobDependencies = {}
): Promise<{ runId: string; deduped: boolean }> {
  const bytes = Buffer.byteLength(JSON.stringify(payload.draft), "utf8");
  if (bytes > MAX_DRAFT_BYTES)
    throw new Error("Draft QC candidate is too large");
  const requestFingerprint = fingerprintDraftQualityQcCandidate({
    draftSessionId: payload.draftSessionId,
    draftId: payload.draftId,
    model: payload.model,
    draft: payload.draft,
    immutableConstraints: payload.immutableConstraints,
    maxImprovementRounds: payload.maxImprovementRounds,
  });
  const deps = resolveDependencies(dependencies);
  const activeKey = pointerKey(payload, payload.draftSessionId);
  const existingRunId = await deps.redis.get(activeKey);
  if (existingRunId) {
    const existing = await readRecord(existingRunId, dependencies);
    if (
      existing &&
      (existing.status === "queued" || existing.status === "running") &&
      existing.requestFingerprint === requestFingerprint
    ) {
      return { runId: existingRunId, deduped: true };
    }
    await deps.redis.del(activeKey);
  }
  const runId = randomUUID();
  const now = new Date(deps.now()).toISOString();
  const record: VerticalDramaDraftQualityQcRecord = {
    ...payload,
    runId,
    requestFingerprint,
    status: "queued",
    progress: null,
    result: null,
    error: null,
    failure: null,
    createdAt: now,
    updatedAt: now,
  };
  await writeRecord(record, dependencies);
  try {
    await (dependencies.enqueueBullmqJob ?? defaultEnqueueBullmqJob)(runId);
  } catch (error) {
    // Do not leave the wizard polling a job that was never admitted to a
    // worker. The creator gets a retryable, actionable terminal state and the
    // active pointer is released for a clean retry.
    await writeRecord(
      {
        ...record,
        status: "failed",
        error:
          error instanceof Error ? error.message : "Draft QC queue unavailable",
        updatedAt: new Date().toISOString(),
      },
      dependencies
    );
    await deps.redis.del(activeKey);
    throw new Error("Draft QC queue is unavailable; please retry");
  }
  return { runId, deduped: false };
}

export async function getVerticalDramaDraftQualityQcStatus(
  runId: string,
  owner: VerticalDramaDraftQualityQcOwner,
  dependencies?: JobDependencies
): Promise<VerticalDramaDraftQualityQcRecord | null> {
  const record = await readRecord(runId, dependencies);
  if (
    !record ||
    record.tenantId !== owner.tenantId ||
    record.userId !== owner.userId
  )
    return null;
  return record;
}

export async function getVerticalDramaDraftQualityQcStatusBySession(
  draftSessionId: string,
  owner: VerticalDramaDraftQualityQcOwner,
  dependencies?: JobDependencies
): Promise<VerticalDramaDraftQualityQcRecord | null> {
  const runId = await resolveDependencies(dependencies).redis.get(
    pointerKey(owner, draftSessionId)
  );
  if (!runId) return null;
  return getVerticalDramaDraftQualityQcStatus(runId, owner, dependencies);
}

export async function cancelVerticalDramaDraftQualityQc(
  runId: string,
  owner: VerticalDramaDraftQualityQcOwner,
  dependencies?: JobDependencies
): Promise<boolean> {
  const deps = resolveDependencies(dependencies);
  const record = await getVerticalDramaDraftQualityQcStatus(
    runId,
    owner,
    dependencies
  );
  if (!record) return false;
  if (
    record.status === "succeeded" ||
    record.status === "failed" ||
    record.status === "cancelled"
  )
    return true;
  await writeRecord(
    {
      ...record,
      status: "cancelled",
      error: "Cancelled by creator",
      updatedAt: new Date(deps.now()).toISOString(),
    },
    dependencies
  );
  await deps.redis.del(pointerKey(record, record.draftSessionId));
  return true;
}

async function isCancelled(
  runId: string,
  dependencies?: JobDependencies
): Promise<boolean> {
  const record = await readRecord(runId, dependencies);
  return record?.status === "cancelled";
}

export async function runVerticalDramaDraftQualityQcJob(
  runId: string,
  dependencies: JobDependencies = {}
): Promise<void> {
  const record = await readRecord(runId, dependencies);
  if (!record || record.status === "cancelled") return;
  const persistJobStatus =
    dependencies.persistJobStatus ?? updateVerticalDramaDraftJob;
  if (record.draftId) {
    await persistJobStatus(record.draftId, record, {
      jobStatus: "qc_running",
      qcRunId: record.runId,
      lastError: null,
    });
  }
  await writeRecord(
    { ...record, status: "running", updatedAt: new Date().toISOString() },
    dependencies
  );
  try {
    const result = await runVerticalDramaDraftQualityQc(
      {
        draft: record.draft,
        immutableConstraints: record.immutableConstraints,
        maxImprovementRounds: record.maxImprovementRounds,
        userId: record.userId,
        tenantId: record.tenantId,
        draftId: record.draftId,
        draftSessionId: record.draftSessionId,
        runId: record.runId,
        enforceCompleteness: true,
        isCancelled: () => isCancelled(runId, dependencies),
        onProgress: event => {
          void readRecord(runId, dependencies).then(current => {
            if (!current || current.status === "cancelled") return;
            return writeRecord(
              {
                ...current,
                status: "running",
                progress: draftQualityQcProgressSchema.parse(event),
                updatedAt: new Date().toISOString(),
              },
              dependencies
            );
          });
        },
      },
      {
        model: record.model,
        persistVersion:
          dependencies.persistVersion ?? appendVerticalDramaDraftVersion,
      }
    );
    const latest = await readRecord(runId, dependencies);
    if (!latest || latest.status === "cancelled") return;
    await writeRecord(
      {
        ...latest,
        status: "succeeded",
        result: publicResult(result, latest.draftId),
        progress: {
          phase: "finalizing",
          round: result.best.round,
          maxRounds: record.maxImprovementRounds,
          callsDone: result.creditEstimate.maxCalls,
          callsMax: result.creditEstimate.maxCalls,
          lastScore: result.best.report.overallScore,
        },
        updatedAt: new Date().toISOString(),
      },
      dependencies
    );
    if (latest.draftId) {
      await persistJobStatus(latest.draftId, latest, {
        jobStatus: result.stopReason === "passed" ? "passed" : "failed",
        qcRunId: latest.runId,
        lastQcScore: Math.round(result.best.report.overallScore * 10),
        lastQcPassed: result.best.report.pass,
        lastError:
          result.stopReason === "passed"
            ? null
            : `QC stopped: ${result.stopReason}`,
      });
    }
  } catch (error) {
    const latest = await readRecord(runId, dependencies);
    if (!latest || latest.status === "cancelled") return;
    const failure =
      error instanceof Error && "failure" in error
        ? ((error as { failure?: DraftQualityQcFailure }).failure ?? null)
        : null;
    await writeRecord(
      {
        ...latest,
        status: "failed",
        error: error instanceof Error ? error.message : "Draft QC failed",
        failure,
        updatedAt: new Date().toISOString(),
      },
      dependencies
    );
    if (latest.draftId) {
      await persistJobStatus(latest.draftId, latest, {
        jobStatus: "failed",
        qcRunId: latest.runId,
        lastError: latest.error,
      });
    }
  }
}

let queue: any = null;
let worker: any = null;

async function defaultEnqueueBullmqJob(runId: string): Promise<void> {
  if (!queue) throw new Error("Draft QC queue is not initialized");
  // The QC loop performs its own bounded provider retries. Do not let BullMQ
  // replay a paid run after a partially charged failure; the terminal record
  // is retryable from the wizard, which starts a fresh idempotent run.
  await queue.add(
    "run",
    { runId },
    { attempts: 1, removeOnComplete: true, removeOnFail: { age: 24 * 60 * 60 } }
  );
}

export async function initVerticalDramaDraftQualityQcQueue(): Promise<void> {
  if (queue) return;
  try {
    const { Queue, Worker } = await import("bullmq");
    const connection = getRedisClient();
    queue = new Queue(VERTICAL_DRAMA_DRAFT_QC_QUEUE, { connection });
    worker = new Worker(
      VERTICAL_DRAMA_DRAFT_QC_QUEUE,
      async (job: any) =>
        runVerticalDramaDraftQualityQcJob(job.data.runId, {
          persistJobStatus: updateVerticalDramaDraftJob,
        }),
      { connection, concurrency: 2 }
    );
    worker.on("failed", (job: any, error: Error) =>
      console.error(
        `[${VERTICAL_DRAMA_DRAFT_QC_QUEUE}] job ${job?.id} failed`,
        error.message
      )
    );
  } catch (error) {
    console.warn(
      `[${VERTICAL_DRAMA_DRAFT_QC_QUEUE}] initialization skipped`,
      error instanceof Error ? error.message : error
    );
  }
}

export async function closeVerticalDramaDraftQualityQcQueue(): Promise<void> {
  try {
    await worker?.close();
    await queue?.close();
  } finally {
    queue = null;
    worker = null;
  }
}
