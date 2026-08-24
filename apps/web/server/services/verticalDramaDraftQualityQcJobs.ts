import { randomUUID } from "node:crypto";
import { getRedisClient } from "./redis";
import {
  draftQualityQcProgressSchema,
  draftQualityQcCreditEstimateSchema,
  draftQualityQcHistoryEntrySchema,
  draftQualityQcReportSchema,
  fingerprintDraftQualityQcCandidate,
  type DraftQualityQcCreditEstimate,
  type DraftQualityQcFailure,
  type DraftQualityQcHistoryEntry,
  type DraftQualityQcReport,
  type DraftQualityQcJobStatus,
  type DraftQualityQcProgress,
  type DraftQualityQcResultSnapshot,
} from "@shared/verticalDramaSeries/draftQualityQc";
import {
  runVerticalDramaDraftQualityQc,
  runVerticalDramaDraftQualityQcRepair,
  type DraftQualityQcImmutableConstraints,
} from "./verticalDramaDraftQualityQc";
import {
  appendVerticalDramaDraftVersion,
  updateVerticalDramaDraftJob,
  getVerticalDramaDraftLedgerByQcRunId,
  getVerticalDramaDraftQcSnapshotsByRunId,
  getVerticalDramaDraftQcSnapshotsByDraftId,
  getVerticalDramaDraftVersion,
  type PersistVerticalDramaDraftVersion,
  type VerticalDramaDraftVersionRef,
  type VerticalDramaDraftJobPatch,
} from "./verticalDramaDraftLedger";

type DraftQualityQcDraft = Record<string, unknown>;

export const VERTICAL_DRAMA_DRAFT_QC_QUEUE = "vertical_drama_draft_quality_qc";
const JOB_TTL_SECONDS = 60 * 60;
const ACTIVE_POINTER_TTL_SECONDS = 60 * 60;
/** A QC run has a bounded provider budget; no run may wait indefinitely. */
export const DRAFT_QC_STALE_AFTER_MS = 30 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 15 * 1000;
const MAX_DRAFT_BYTES = 160_000;

export interface VerticalDramaDraftQualityQcOwner {
  tenantId: string;
  userId: number;
}

export interface VerticalDramaDraftQualityQcPayload extends VerticalDramaDraftQualityQcOwner {
  runId: string;
  draftSessionId: string;
  /** Canonical Series owner for every new QC run; legacy records may omit it. */
  seriesId?: number;
  requestFingerprint: string;
  /** Snapshot of the server-approved LLM Recommend model used by QC. */
  model?: string;
  draftId?: string;
  draft: DraftQualityQcDraft;
  immutableConstraints: DraftQualityQcImmutableConstraints;
  maxImprovementRounds: number;
  operation?: "qc" | "repair";
  repairSourceVersion?: number;
  repairSourceFingerprint?: string;
  repairSourceReport?: DraftQualityQcReport;
}

export interface VerticalDramaDraftQualityQcPublicResult extends Omit<
  DraftQualityQcResultSnapshot,
  "best"
> {
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
  recoveredFromFailure?: boolean;
  recoveryMessage?: string;
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

type DurableQcSnapshot = {
  draftId: string;
  runId: string | null;
  candidateVersion?: number;
  contentHash?: string;
  contentJson: unknown;
  metadata: Record<string, unknown>;
};

interface JobDependencies {
  /** History is an explicit UI action; default callers must stay metadata-light. */
  includeHistory?: boolean;
  redis?: DraftQualityQcRedisAdapter;
  now?: () => number;
  enqueueBullmqJob?: (runId: string) => Promise<void>;
  persistVersion?: PersistVerticalDramaDraftVersion;
  persistJobStatus?: (
    draftId: string,
    owner: VerticalDramaDraftQualityQcOwner,
    patch: VerticalDramaDraftJobPatch
  ) => Promise<boolean>;
  getLedgerByQcRunId?: typeof getVerticalDramaDraftLedgerByQcRunId;
  getQcSnapshotsByRunId?: typeof getVerticalDramaDraftQcSnapshotsByRunId;
  getQcSnapshotsByDraftId?: typeof getVerticalDramaDraftQcSnapshotsByDraftId;
  getDraftVersion?: typeof getVerticalDramaDraftVersion;
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
  draftSessionId: string,
  seriesId?: number
): string {
  return `vd:draft-qc:active:${owner.tenantId}:${owner.userId}:${seriesId ?? "legacy"}:${draftSessionId}`;
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
      pointerKey(record, record.draftSessionId, record.seriesId),
      record.runId,
      "EX",
      ACTIVE_POINTER_TTL_SECONDS
    );
  }
}

function publicResult(
  result: Awaited<ReturnType<typeof runVerticalDramaDraftQualityQc>>,
  draftArtifactId?: string,
  runId?: string
): VerticalDramaDraftQualityQcPublicResult {
  return {
    runId,
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

function publicResultFromDurableSnapshot(
  snapshot: DurableQcSnapshot
): VerticalDramaDraftQualityQcPublicResult | null {
  const metadata = snapshot.metadata ?? {};
  const draft =
    snapshot.contentJson &&
    typeof snapshot.contentJson === "object" &&
    !Array.isArray(snapshot.contentJson)
      ? (snapshot.contentJson as DraftQualityQcDraft)
      : null;
  const report = draftQualityQcReportSchema.safeParse(metadata.report);
  if (!draft || !report.success) return null;
  const creditEstimate = draftQualityQcCreditEstimateSchema.safeParse(
    metadata.creditEstimate
  );
  const history = Array.isArray(metadata.history)
    ? metadata.history
        .map(item => draftQualityQcHistoryEntrySchema.safeParse(item))
        .filter(
          (
            item
          ): item is {
            success: true;
            data: DraftQualityQcHistoryEntry;
          } => item.success
        )
        .map(item => item.data)
    : [];
  const bestRound =
    typeof metadata.round === "number" && Number.isInteger(metadata.round)
      ? metadata.round
      : 0;
  const recoveredHistory = history.length
    ? history
    : [
        {
          round: bestRound,
          score: report.data.overallScore,
          status: report.data.status,
          kept: true,
          reason: "failed" as const,
          candidateVersion: snapshot.candidateVersion,
          candidateFingerprint: fingerprintDraftQualityQcCandidate(draft),
          report: report.data,
        },
      ];
  return {
    runId: snapshot.runId ?? undefined,
    best: {
      draft,
      report: report.data,
      round: bestRound,
      fingerprint: fingerprintDraftQualityQcCandidate(draft),
    },
    history: recoveredHistory,
    creditEstimate: creditEstimate.success
      ? creditEstimate.data
      : {
          baselineCalls: 1,
          maxImprovementRounds: 0,
          maxCalls: 1,
          estimatedCredits: 1,
          actualCredits: 0,
        },
    stopReason: metadata.stopReason === "passed" ? "passed" : "max_rounds",
    roundsAttempted:
      typeof metadata.roundsAttempted === "number"
        ? metadata.roundsAttempted
        : bestRound,
    evaluationsCompleted:
      typeof metadata.evaluationsCompleted === "number"
        ? metadata.evaluationsCompleted
        : 1,
    model: typeof metadata.model === "string" ? metadata.model : "historical",
    draftArtifactId: snapshot.draftId,
    recoveredFromFailure: metadata.recoveredFromFailure === true,
    recoveryMessage:
      typeof metadata.recoveryMessage === "string"
        ? metadata.recoveryMessage
        : undefined,
  };
}

/**
 * A provider/schema failure must not erase scorecards that were already
 * completed. Rebuild a selectable result from the immutable ledger version
 * recorded for the last kept scorecard. This is recovery of real evidence,
 * not a fallback score and not a provider/model fallback.
 */
export async function recoverVerticalDramaDraftQualityQcResultFromFailure(
  record: VerticalDramaDraftQualityQcRecord,
  failure: DraftQualityQcFailure,
  dependencies?: JobDependencies
): Promise<VerticalDramaDraftQualityQcPublicResult | null> {
  const candidate = [...failure.history]
    .filter(
      item =>
        item.kept &&
        item.report &&
        item.candidateVersion &&
        item.candidateFingerprint
    )
    .sort((left, right) => left.round - right.round)
    .at(-1);
  if (!candidate?.report || !candidate.candidateFingerprint) return null;

  let draft: DraftQualityQcDraft | null = null;
  if (record.draftId && candidate.candidateVersion) {
    const version = await (
      dependencies?.getDraftVersion ?? getVerticalDramaDraftVersion
    )(record.draftId, candidate.candidateVersion, {
      tenantId: record.tenantId,
      userId: record.userId,
    });
    if (
      version?.runId === record.runId &&
      version.contentJson &&
      typeof version.contentJson === "object" &&
      !Array.isArray(version.contentJson)
    ) {
      draft = version.contentJson as DraftQualityQcDraft;
    }
  }
  // Keep direct/unit-test and legacy runs recoverable when no ledger id was
  // supplied, but only if the original Draft still matches the scorecard.
  if (
    !draft &&
    candidate.round === 0 &&
    fingerprintDraftQualityQcCandidate(record.draft) ===
      candidate.candidateFingerprint
  ) {
    draft = record.draft;
  }
  if (!draft) return null;

  const fingerprint = fingerprintDraftQualityQcCandidate(draft);
  if (fingerprint !== candidate.candidateFingerprint) return null;
  return {
    runId: record.runId,
    best: {
      draft,
      report: candidate.report,
      round: candidate.round,
      fingerprint,
    },
    history: failure.history,
    creditEstimate: failure.creditEstimate ?? {
      baselineCalls: 1,
      maxImprovementRounds: record.maxImprovementRounds,
      maxCalls: 1 + record.maxImprovementRounds * 2,
      estimatedCredits: 1,
      actualCredits: 0,
    },
    // The run did not reach a normal bounded terminal state. Keep this
    // distinct via recoveredFromFailure so the receipt gate can require an
    // explicit warning confirmation instead of treating it as a normal pass.
    stopReason: "max_rounds",
    roundsAttempted: failure.roundsAttempted,
    evaluationsCompleted: failure.evaluationsCompleted,
    model: record.model ?? "unknown",
    draftArtifactId: record.draftId,
    recoveredFromFailure: true,
    recoveryMessage:
      "QC รอบล่าสุดหยุดก่อนสร้างคะแนนใหม่ แต่ระบบกู้ Draft และ scorecard รอบก่อนที่ตรวจครบแล้วจาก ledger ให้เลือกได้",
  };
}

export async function recoverVerticalDramaDraftQualityQcResultByRunId(
  runId: string,
  owner: VerticalDramaDraftQualityQcOwner,
  seriesId?: number,
  dependencies?: JobDependencies
): Promise<VerticalDramaDraftQualityQcPublicResult | null> {
  const [snapshot] = await (
    dependencies?.getQcSnapshotsByRunId ??
    getVerticalDramaDraftQcSnapshotsByRunId
  )(runId, owner, seriesId);
  return snapshot
    ? publicResultFromDurableSnapshot(snapshot as DurableQcSnapshot)
    : null;
}

export async function recoverVerticalDramaDraftQualityQcHistory(
  draftId: string,
  owner: VerticalDramaDraftQualityQcOwner,
  excludeRunId?: string,
  seriesId?: number,
  dependencies?: JobDependencies
): Promise<VerticalDramaDraftQualityQcPublicResult[]> {
  const snapshots = await (
    dependencies?.getQcSnapshotsByDraftId ??
    getVerticalDramaDraftQcSnapshotsByDraftId
  )(draftId, owner, seriesId);
  return snapshots
    .filter(snapshot => snapshot.runId && snapshot.runId !== excludeRunId)
    .map(snapshot =>
      publicResultFromDurableSnapshot(snapshot as DurableQcSnapshot)
    )
    .filter(
      (result): result is VerticalDramaDraftQualityQcPublicResult =>
        result !== null
    );
}

export async function enqueueVerticalDramaDraftQualityQc(
  payload: Omit<
    VerticalDramaDraftQualityQcPayload,
    "runId" | "requestFingerprint"
  >,
  dependencies: JobDependencies = {}
): Promise<{ runId: string; deduped: boolean }> {
  const seriesId = payload.seriesId;
  if (
    typeof seriesId !== "number" ||
    !Number.isInteger(seriesId) ||
    seriesId <= 0
  ) {
    throw new Error("Draft QC requires an owning Series");
  }
  if (!payload.draftId) {
    throw new Error("Draft QC requires a durable Draft ledger");
  }
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
    operation: payload.operation ?? "qc",
    repairSourceVersion: payload.repairSourceVersion,
    repairSourceFingerprint: payload.repairSourceFingerprint,
  });
  const deps = resolveDependencies(dependencies);
  const activeKey = pointerKey(payload, payload.draftSessionId, seriesId);
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
    // Persist the run id before admitting the paid job to BullMQ. Otherwise a
    // fast worker can finish QC and have its terminal status overwritten by a
    // late `ready_for_qc` update from the router.
    const persisted = await (
      dependencies.persistJobStatus ?? updateVerticalDramaDraftJob
    )(payload.draftId, payload, {
      jobStatus: "ready_for_qc",
      qcRunId: runId,
      seriesId,
      lastError: null,
    });
    if (!persisted) {
      throw new Error("Draft ledger not found or not owned by this Series");
    }
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
  seriesId?: number,
  dependencies?: JobDependencies
): Promise<VerticalDramaDraftQualityQcRecord | null> {
  const record = await readRecord(runId, dependencies);
  if (
    !record ||
    record.tenantId !== owner.tenantId ||
    record.userId !== owner.userId ||
    (seriesId !== undefined && record.seriesId !== seriesId)
  )
    return null;
  return record;
}

export async function getVerticalDramaDraftQualityQcStatusBySession(
  draftSessionId: string,
  owner: VerticalDramaDraftQualityQcOwner,
  seriesId?: number,
  dependencies?: JobDependencies
): Promise<VerticalDramaDraftQualityQcRecord | null> {
  const runId = await resolveDependencies(dependencies).redis.get(
    pointerKey(owner, draftSessionId, seriesId)
  );
  if (!runId) return null;
  return getVerticalDramaDraftQualityQcStatus(
    runId,
    owner,
    seriesId,
    dependencies
  );
}

export async function getVerticalDramaDraftQualityQcRunIdBySession(
  draftSessionId: string,
  owner: VerticalDramaDraftQualityQcOwner,
  seriesId?: number,
  dependencies?: JobDependencies
): Promise<string | null> {
  return resolveDependencies(dependencies).redis.get(
    pointerKey(owner, draftSessionId, seriesId)
  );
}

export async function clearVerticalDramaDraftQualityQcPointer(
  draftSessionId: string,
  owner: VerticalDramaDraftQualityQcOwner,
  seriesId?: number,
  dependencies?: JobDependencies
): Promise<void> {
  await resolveDependencies(dependencies).redis.del(
    pointerKey(owner, draftSessionId, seriesId)
  );
}

export interface DraftQualityQcReconciliation {
  record: VerticalDramaDraftQualityQcRecord | null;
  stale: boolean;
  message?: string;
  draftId?: string;
  historicalResult?: VerticalDramaDraftQualityQcPublicResult;
}

async function removeQueuedBullmqJob(runId: string): Promise<void> {
  let inspectionQueue = queue;
  let ownsInspectionQueue = false;
  try {
    if (!inspectionQueue) {
      const { Queue } = await import("bullmq");
      inspectionQueue = new Queue(VERTICAL_DRAMA_DRAFT_QC_QUEUE, {
        connection: getRedisClient(),
      });
      ownsInspectionQueue = true;
    }
    const direct = await inspectionQueue.getJob(runId);
    if (direct) {
      await direct.remove().catch(() => undefined);
      return;
    }
    // Older jobs used an auto-generated BullMQ id. Remove only waiting-like
    // jobs whose payload points at this run; active workers are stopped by the
    // Redis state transition below and will not commit a late success.
    for (const state of ["waiting", "delayed", "prioritized"]) {
      const jobs = await inspectionQueue.getJobs([state], 0, -1);
      for (const job of jobs) {
        if (job?.data?.runId === runId)
          await job.remove().catch(() => undefined);
      }
    }
  } catch {
    // Reconciliation must still close the durable state if BullMQ inspection
    // is unavailable during a Redis/worker incident.
  } finally {
    if (ownsInspectionQueue)
      await inspectionQueue?.close().catch(() => undefined);
  }
}

async function markStaleQcRecord(
  record: VerticalDramaDraftQualityQcRecord,
  dependencies: JobDependencies,
  message: string
): Promise<void> {
  const deps = resolveDependencies(dependencies);
  await writeRecord(
    {
      ...record,
      status: "failed",
      error: message,
      failure: null,
      updatedAt: new Date(deps.now()).toISOString(),
    },
    dependencies
  );
  await deps.redis.del(
    pointerKey(record, record.draftSessionId, record.seriesId)
  );
  await removeQueuedBullmqJob(record.runId);
  if (record.draftId) {
    await (dependencies.persistJobStatus ?? updateVerticalDramaDraftJob)(
      record.draftId,
      record,
      {
        jobStatus: "failed",
        qcRunId: record.runId,
        seriesId: record.seriesId,
        lastError: message,
      }
    );
  }
}

/**
 * Reconciles Redis, BullMQ and the durable Draft ledger. Redis is the fast
 * progress store, never the only source of truth. A missing/stale record is
 * closed as failed so the wizard can offer an explicit retry instead of
 * showing a phantom queued run forever.
 */
export async function reconcileVerticalDramaDraftQualityQc(
  runId: string,
  owner: VerticalDramaDraftQualityQcOwner,
  seriesId?: number,
  dependencies: JobDependencies = {}
): Promise<DraftQualityQcReconciliation> {
  const deps = resolveDependencies(dependencies);
  const record = await getVerticalDramaDraftQualityQcStatus(
    runId,
    owner,
    seriesId,
    dependencies
  );
  if (record) {
    const active = record.status === "queued" || record.status === "running";
    const age = deps.now() - new Date(record.updatedAt).getTime();
    if (active && age > DRAFT_QC_STALE_AFTER_MS) {
      const message =
        "Draft QC queue หมดอายุหรือ Worker หยุดทำงานก่อนจบ ระบบเคลียร์คิวนี้แล้ว กรุณายืนยันเริ่ม QC ใหม่";
      await markStaleQcRecord(record, dependencies, message);
      return {
        record: { ...record, status: "failed", error: message },
        stale: true,
        message,
        draftId: record.draftId,
      };
    }
    return { record, stale: false };
  }

  const ledger = await (
    dependencies.getLedgerByQcRunId ?? getVerticalDramaDraftLedgerByQcRunId
  )(runId, owner, seriesId);
  if (!ledger || ledger.qcRunId !== runId) {
    const message =
      "Draft QC run record ไม่พบแล้ว (อาจหมดอายุหรือ Worker หยุดทำงาน) ระบบเคลียร์คิวนี้แล้ว กรุณายืนยันเริ่ม QC ใหม่";
    await removeQueuedBullmqJob(runId);
    return { record: null, stale: true, message };
  }
  const historicalResult =
    dependencies.includeHistory !== false
      ? ((await recoverVerticalDramaDraftQualityQcResultByRunId(
          runId,
          owner,
          seriesId,
          dependencies
        )) ??
        (
          await recoverVerticalDramaDraftQualityQcHistory(
            ledger.id,
            owner,
            runId,
            seriesId,
            dependencies
          )
        )[0])
      : undefined;
  const message = historicalResult
    ? "คิว QC รอบเดิมหมดอายุแล้ว แต่ระบบกู้ผล QC รอบก่อนจากประวัติถาวรให้แล้ว กรุณาเริ่ม QC รอบใหม่เพื่อเปรียบเทียบ"
    : "Draft QC run record ไม่อยู่ในคิวแล้ว (อาจหมดอายุหรือ Worker หยุดทำงาน) ระบบเคลียร์สถานะค้างแล้ว กรุณายืนยันเริ่ม QC ใหม่";
  if (
    !["passed", "failed", "cancelled", "archived"].includes(ledger.jobStatus)
  ) {
    await (dependencies.persistJobStatus ?? updateVerticalDramaDraftJob)(
      ledger.id,
      owner,
      {
        jobStatus: "failed",
        qcRunId: runId,
        seriesId: ledger.seriesId ?? undefined,
        lastError: message,
      }
    );
  }
  await removeQueuedBullmqJob(runId);
  return {
    record: null,
    stale: true,
    message,
    draftId: ledger.id,
    historicalResult: historicalResult ?? undefined,
  };
}

export async function cancelVerticalDramaDraftQualityQc(
  runId: string,
  owner: VerticalDramaDraftQualityQcOwner,
  seriesId?: number,
  dependencies?: JobDependencies
): Promise<boolean> {
  const deps = resolveDependencies(dependencies);
  const record = await getVerticalDramaDraftQualityQcStatus(
    runId,
    owner,
    seriesId,
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
  await deps.redis.del(
    pointerKey(record, record.draftSessionId, record.seriesId)
  );
  await removeQueuedBullmqJob(record.runId);
  return true;
}

async function isCancelled(
  runId: string,
  dependencies?: JobDependencies
): Promise<boolean> {
  const record = await readRecord(runId, dependencies);
  return record?.status !== "running";
}

export async function runVerticalDramaDraftQualityQcJob(
  runId: string,
  dependencies: JobDependencies = {}
): Promise<void> {
  const record = await readRecord(runId, dependencies);
  // A reconciler may have already closed this run while BullMQ was waiting
  // for a worker. Never resurrect failed/cancelled/stale work after refresh.
  if (!record || record.status !== "queued") return;
  const persistJobStatus =
    dependencies.persistJobStatus ?? updateVerticalDramaDraftJob;
  const persistVersionBase =
    dependencies.persistVersion ?? appendVerticalDramaDraftVersion;
  const persistVersion: PersistVerticalDramaDraftVersion = input =>
    persistVersionBase({ ...input, seriesId: record.seriesId });
  if (record.draftId) {
    await persistJobStatus(record.draftId, record, {
      jobStatus: "qc_running",
      qcRunId: record.runId,
      seriesId: record.seriesId,
      lastError: null,
    });
  }
  await writeRecord(
    { ...record, status: "running", updatedAt: new Date().toISOString() },
    dependencies
  );
  const heartbeat = setInterval(() => {
    void readRecord(runId, dependencies).then(current => {
      if (current?.status !== "running") return;
      return writeRecord(
        { ...current, updatedAt: new Date().toISOString() },
        dependencies
      );
    });
  }, HEARTBEAT_INTERVAL_MS);
  try {
    const progressHandler = (event: DraftQualityQcProgress) => {
      void readRecord(runId, dependencies).then(current => {
        // Reconciliation/cancellation may close the run while an LLM
        // callback is still settling. Never resurrect a terminal run.
        if (!current || current.status !== "running") return;
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
    };
    if (
      record.operation === "repair" &&
      (!record.repairSourceReport ||
        !record.repairSourceVersion ||
        !record.repairSourceFingerprint)
    ) {
      throw new Error("Draft QC repair source metadata is incomplete");
    }
    const result =
      record.operation === "repair"
        ? await runVerticalDramaDraftQualityQcRepair(
            {
              draft: record.draft,
              sourceReport: record.repairSourceReport!,
              sourceVersion: record.repairSourceVersion!,
              sourceFingerprint: record.repairSourceFingerprint!,
              immutableConstraints: record.immutableConstraints,
              userId: record.userId,
              tenantId: record.tenantId,
              draftId: record.draftId,
              draftSessionId: record.draftSessionId,
              runId: record.runId,
              isCancelled: () => isCancelled(runId, dependencies),
              onProgress: progressHandler,
            },
            {
              model: record.model,
              persistVersion,
            }
          )
        : await runVerticalDramaDraftQualityQc(
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
              onProgress: progressHandler,
            },
            {
              model: record.model,
              persistVersion,
            }
          );
    const latest = await readRecord(runId, dependencies);
    if (!latest || latest.status !== "running") return;
    await writeRecord(
      {
        ...latest,
        status: "succeeded",
        result: publicResult(result, latest.draftId, latest.runId),
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
        seriesId: latest.seriesId,
        lastError:
          result.stopReason === "passed"
            ? null
            : `QC stopped: ${result.stopReason}`,
      });
    }
  } catch (error) {
    const latest = await readRecord(runId, dependencies);
    if (!latest || latest.status !== "running") return;
    const failure =
      error instanceof Error && "failure" in error
        ? ((error as { failure?: DraftQualityQcFailure }).failure ?? null)
        : null;
    let recoveredResult = failure
      ? await recoverVerticalDramaDraftQualityQcResultFromFailure(
          latest,
          failure,
          dependencies
        ).catch(() => null)
      : null;
    if (recoveredResult && latest.draftId && latest.draftSessionId) {
      try {
        const artifact = await (
          dependencies.persistVersion ?? appendVerticalDramaDraftVersion
        )({
          tenantId: latest.tenantId,
          userId: latest.userId,
          draftId: latest.draftId,
          draftSessionId: latest.draftSessionId,
          seriesId: latest.seriesId,
          stage: "qc-final",
          content: recoveredResult.best.draft,
          runId: latest.runId,
          changedPaths: ["qc.recoveredBest"],
          metadata: {
            report: recoveredResult.best.report,
            round: recoveredResult.best.round,
            stopReason: "failed",
            recoveredFromFailure: true,
            recoveryMessage: recoveredResult.recoveryMessage,
            history: recoveredResult.history,
            creditEstimate: recoveredResult.creditEstimate,
            roundsAttempted: recoveredResult.roundsAttempted,
            evaluationsCompleted: recoveredResult.evaluationsCompleted,
            model: recoveredResult.model,
          },
        });
        recoveredResult = { ...recoveredResult, draftArtifact: artifact };
      } catch {
        // The live Redis result remains usable even if durable snapshot
        // finalization is temporarily unavailable.
      }
    }
    await writeRecord(
      {
        ...latest,
        status: "failed",
        result: recoveredResult,
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
        seriesId: latest.seriesId,
        lastError: latest.error,
      });
    }
  } finally {
    clearInterval(heartbeat);
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
    {
      jobId: runId,
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: { age: 24 * 60 * 60 },
    }
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
