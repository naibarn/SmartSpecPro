import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import { and, eq, gt, isNull, sql } from "drizzle-orm";

import {
  runnerNodes,
  spec224RunnerJobInputs,
  spec224RunnerInputSources,
  workerJobAttempts,
  workerJobs,
} from "../../drizzle/schema";
import { getDb } from "../db";

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_FILES = 64;
export const SPEC224_RUNNER_INPUT_MAX_BYTES = 2 * 1024 * 1024;
const MAX_FILE_BYTES = 1024 * 1024;
const SAFE_PATH = /^(?!.*(?:^|\/)\.{1,2}(?:\/|$))[A-Za-z0-9][A-Za-z0-9._/-]*\.(?:md|json)$/i;

export class Spec224RunnerInputStagingError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "Spec224RunnerInputStagingError";
  }
}

export type Spec224RunnerInputFile = {
  path: string;
  contentBase64: string;
};

export type Spec224StagedRunnerInputFile = Spec224RunnerInputFile & {
  digest: string;
  bytes: number;
};

export type Spec224StagedRunnerInput = {
  inputRef: string;
  workerJobId: string;
  commandId: string;
  attemptId: string;
  attempt: number;
  leaseId: string;
  fencingToken: number;
  tenantId: string;
  runnerId: string;
  runnerSessionId: string;
  authorizationGrantRef: string;
  workspaceRef: string;
  fetchGrantHash: string;
  inputDigest: string;
  totalBytes: number;
  files: Spec224StagedRunnerInputFile[];
  materializedAt: Date | null;
};

export type Spec224RunnerInputSource = {
  inputSourceRef: string;
  tenantId: string;
  startRef: string;
  inputDigest: string;
  totalBytes: number;
  files: Spec224StagedRunnerInputFile[];
};

export type StageRunnerInputRequest = Omit<
  Spec224StagedRunnerInput,
  | "inputRef"
  | "fetchGrantHash"
  | "inputDigest"
  | "totalBytes"
  | "files"
  | "materializedAt"
> & {
  files: Spec224RunnerInputFile[];
};

export type Spec224RunnerInputStagingStore = {
  findByInputRef(inputRef: string): Promise<Spec224StagedRunnerInput | null>;
  findByCommandId(commandId: string): Promise<Spec224StagedRunnerInput | null>;
  insert(input: Spec224StagedRunnerInput): Promise<Spec224StagedRunnerInput>;
  currentLease(input: {
    tenantId: string;
    workerJobId: string;
    attempt: number;
    attemptId: string;
    fencingToken: number;
    now: Date;
  }): Promise<boolean>;
  markMaterialized(inputRef: string, at: Date): Promise<void>;
  rotateFetchGrant(inputRef: string, fetchGrantHash: string): Promise<void>;
  consumeFetchGrant(input: {
    inputRef: string;
    fetchGrantHash: string;
    consumedAt: Date;
  }): Promise<boolean>;
  isCurrentRunnerSession(input: {
    tenantId: string;
    runnerId: string;
    runnerSessionId: string;
  }): Promise<boolean>;
  findSourceByRef(inputSourceRef: string): Promise<Spec224RunnerInputSource | null>;
  findSourceByStart(input: { tenantId: string; startRef: string }): Promise<Spec224RunnerInputSource | null>;
  insertSource(input: Spec224RunnerInputSource): Promise<Spec224RunnerInputSource>;
  bindSourceToWorkerJob(input: { tenantId: string; startRef: string; inputSourceRef: string; workerJobId: string }): Promise<boolean>;
};

function fail(code: string): never {
  throw new Spec224RunnerInputStagingError(code);
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function newFetchGrant(): string {
  return randomBytes(32).toString("base64url");
}

function sameHash(left: string, right: string): boolean {
  if (!SHA256.test(left) || !SHA256.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function requireId(value: string, code: string): string {
  if (typeof value !== "string" || !ID.test(value)) fail(code);
  return value;
}

function requirePositive(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 1) fail(code);
  return value;
}

function decodeBase64(value: string): Buffer {
  if (
    typeof value !== "string" ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  )
    fail("SPEC224_RUNNER_INPUT_BASE64_INVALID");
  const bytes = Buffer.from(value, "base64");
  if (!bytes.length || bytes.length > MAX_FILE_BYTES)
    fail("SPEC224_RUNNER_INPUT_FILE_SIZE_INVALID");
  return bytes;
}

function safePath(value: string): string {
  const path = typeof value === "string" ? value.trim() : "";
  if (
    !path ||
    path.length > 240 ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.includes("\0") ||
    !SAFE_PATH.test(path)
  )
    fail("SPEC224_RUNNER_INPUT_PATH_INVALID");
  return path;
}

/** The byte framing is implemented identically by the Runner. */
export function digestSpec224RunnerInput(
  files: Array<{ path: string; bytes: Buffer }>
): string {
  const hash = createHash("sha256");
  for (const file of [...files].sort((left, right) => left.path.localeCompare(right.path))) {
    hash.update(file.path, "utf8");
    hash.update(Buffer.from([0]));
    hash.update(file.bytes);
    hash.update(Buffer.from([0]));
  }
  return hash.digest("hex");
}

function normalizeFiles(files: Spec224RunnerInputFile[]): {
  files: Spec224StagedRunnerInputFile[];
  inputDigest: string;
  totalBytes: number;
} {
  if (!Array.isArray(files) || !files.length || files.length > MAX_FILES)
    fail("SPEC224_RUNNER_INPUT_FILE_COUNT_INVALID");
  const seen = new Set<string>();
  let totalBytes = 0;
  const normalized = files.map(file => {
    const path = safePath(file?.path);
    if (seen.has(path)) fail("SPEC224_RUNNER_INPUT_PATH_DUPLICATE");
    seen.add(path);
    const bytes = decodeBase64(file?.contentBase64);
    totalBytes += bytes.length;
    if (totalBytes > SPEC224_RUNNER_INPUT_MAX_BYTES)
      fail("SPEC224_RUNNER_INPUT_TOTAL_SIZE_INVALID");
    return {
      path,
      digest: sha256(bytes),
      bytes: bytes.length,
      contentBase64: bytes.toString("base64"),
      raw: bytes,
    };
  });
  normalized.sort((left, right) => left.path.localeCompare(right.path));
  return {
    files: normalized.map(({ raw: _raw, ...file }) => file),
    inputDigest: digestSpec224RunnerInput(
      normalized.map(file => ({ path: file.path, bytes: file.raw }))
    ),
    totalBytes,
  };
}

function equivalent(existing: Spec224StagedRunnerInput, staged: Spec224StagedRunnerInput): boolean {
  return (
    existing.workerJobId === staged.workerJobId &&
    existing.commandId === staged.commandId &&
    existing.attemptId === staged.attemptId &&
    existing.attempt === staged.attempt &&
    existing.leaseId === staged.leaseId &&
    existing.fencingToken === staged.fencingToken &&
    existing.tenantId === staged.tenantId &&
    existing.runnerId === staged.runnerId &&
    existing.runnerSessionId === staged.runnerSessionId &&
    existing.authorizationGrantRef === staged.authorizationGrantRef &&
    existing.workspaceRef === staged.workspaceRef &&
    existing.inputDigest === staged.inputDigest &&
    existing.totalBytes === staged.totalBytes
  );
}

export function createSpec224RunnerInputStagingService(
  store: Spec224RunnerInputStagingStore = new DrizzleSpec224RunnerInputStagingStore(),
  options: { inputRef?: () => string; inputSourceRef?: () => string; now?: () => Date } = {}
) {
  const inputRef = options.inputRef ?? (() => `spec224-input:${randomUUID()}`);
  const inputSourceRef = options.inputSourceRef ?? (() => `spec224-source:${randomUUID()}`);
  const now = options.now ?? (() => new Date());

  return {
    async isStagedInputBoundToManifest(input: {
      inputRef: string;
      inputDigest: string;
      totalBytes: number;
      commandId: string;
      workerJobId: string;
      attemptId: string;
      attempt: number;
      leaseId: string;
      fencingToken: number;
      tenantId: string;
      runnerId: string;
      runnerSessionId: string;
      authorizationGrantRef: string;
      workspaceRef: string;
    }): Promise<boolean> {
      const staged = await store.findByInputRef(input.inputRef);
      return Boolean(staged &&
        staged.inputDigest === input.inputDigest &&
        staged.totalBytes === input.totalBytes &&
        staged.commandId === input.commandId &&
        staged.workerJobId === input.workerJobId &&
        staged.attemptId === input.attemptId &&
        staged.attempt === input.attempt &&
        staged.leaseId === input.leaseId &&
        staged.fencingToken === input.fencingToken &&
        staged.tenantId === input.tenantId &&
        staged.runnerId === input.runnerId &&
        staged.runnerSessionId === input.runnerSessionId &&
        staged.authorizationGrantRef === input.authorizationGrantRef &&
        staged.workspaceRef === input.workspaceRef);
    },

    async preStageRunnerInput(input: {
      tenantId: string;
      startRef: string;
      files: Spec224RunnerInputFile[];
    }): Promise<{
      inputSourceRef: string;
      inputDigest: string;
      totalBytes: number;
      files: Array<{ path: string; digest: string; bytes: number }>;
    }> {
      const tenantId = requireId(input.tenantId, "SPEC224_RUNNER_INPUT_TENANT_INVALID");
      const startRef = requireId(input.startRef, "SPEC224_RUNNER_INPUT_START_REF_INVALID");
      const normalized = normalizeFiles(input.files);
      const existing = await store.findSourceByStart({ tenantId, startRef });
      if (existing) {
        if (
          existing.inputDigest !== normalized.inputDigest ||
          existing.totalBytes !== normalized.totalBytes
        )
          fail("SPEC224_RUNNER_INPUT_START_CONFLICT");
        return safeSourceSummary(existing);
      }
      const source = await store.insertSource({
        inputSourceRef: requireId(inputSourceRef(), "SPEC224_RUNNER_INPUT_SOURCE_REF_INVALID"),
        tenantId,
        startRef,
        ...normalized,
      });
      return safeSourceSummary(source);
    },

    async bindSourceToWorkerJob(input: {
      tenantId: string;
      startRef: string;
      inputSourceRef: string;
      workerJobId: string;
    }): Promise<void> {
      const tenantId = requireId(input.tenantId, "SPEC224_RUNNER_INPUT_TENANT_INVALID");
      const startRef = requireId(input.startRef, "SPEC224_RUNNER_INPUT_START_REF_INVALID");
      const inputSourceRef = requireId(input.inputSourceRef, "SPEC224_RUNNER_INPUT_SOURCE_REF_INVALID");
      const workerJobId = requireId(input.workerJobId, "SPEC224_RUNNER_INPUT_WORKER_JOB_INVALID");
      const source = await store.findSourceByRef(inputSourceRef);
      if (!source || source.tenantId !== tenantId || source.startRef !== startRef) {
        fail("SPEC224_RUNNER_INPUT_SOURCE_NOT_FOUND");
      }
      if (!(await store.bindSourceToWorkerJob({ tenantId, startRef, inputSourceRef, workerJobId }))) {
        fail("SPEC224_RUNNER_INPUT_SOURCE_JOB_CONFLICT");
      }
    },

    async bindPreStagedRunnerInput(input: Omit<StageRunnerInputRequest, "files"> & {
      inputSourceRef: string;
    }) {
      const source = await store.findSourceByRef(
        requireId(input.inputSourceRef, "SPEC224_RUNNER_INPUT_SOURCE_REF_INVALID")
      );
      if (!source || source.tenantId !== input.tenantId)
        fail("SPEC224_RUNNER_INPUT_SOURCE_NOT_FOUND");
      const active = await store.currentLease({
        tenantId: input.tenantId,
        workerJobId: input.workerJobId,
        attempt: input.attempt,
        attemptId: input.attemptId,
        fencingToken: input.fencingToken,
        now: now(),
      });
      if (!active || !(await store.isCurrentRunnerSession({
        tenantId: input.tenantId,
        runnerId: input.runnerId,
        runnerSessionId: input.runnerSessionId,
      })))
        fail("SPEC224_RUNNER_INPUT_LEASE_STALE");
      return this.stageRunnerInput({ ...input, files: source.files });
    },

    async stageRunnerInput(input: StageRunnerInputRequest): Promise<{
      inputRef: string;
      inputDigest: string;
      totalBytes: number;
      files: Array<{ path: string; digest: string; bytes: number }>;
      /** Ephemeral capability: never add this to a RunnerJobCommand or event. */
      inputFetchGrant: string;
    }> {
      const files = normalizeFiles(input.files);
      const staged: Spec224StagedRunnerInput = {
        inputRef: requireId(inputRef(), "SPEC224_RUNNER_INPUT_REF_INVALID"),
        workerJobId: requireId(input.workerJobId, "SPEC224_RUNNER_INPUT_JOB_INVALID"),
        commandId: requireId(input.commandId, "SPEC224_RUNNER_INPUT_COMMAND_INVALID"),
        attemptId: requireId(input.attemptId, "SPEC224_RUNNER_INPUT_ATTEMPT_ID_INVALID"),
        attempt: requirePositive(input.attempt, "SPEC224_RUNNER_INPUT_ATTEMPT_INVALID"),
        leaseId: requireId(input.leaseId, "SPEC224_RUNNER_INPUT_LEASE_INVALID"),
        fencingToken: requirePositive(input.fencingToken, "SPEC224_RUNNER_INPUT_FENCE_INVALID"),
        tenantId: requireId(input.tenantId, "SPEC224_RUNNER_INPUT_TENANT_INVALID"),
        runnerId: requireId(input.runnerId, "SPEC224_RUNNER_INPUT_RUNNER_INVALID"),
        runnerSessionId: requireId(input.runnerSessionId, "SPEC224_RUNNER_INPUT_SESSION_INVALID"),
        authorizationGrantRef: requireId(input.authorizationGrantRef, "SPEC224_RUNNER_INPUT_GRANT_INVALID"),
        workspaceRef: requireId(input.workspaceRef, "SPEC224_RUNNER_INPUT_WORKSPACE_INVALID"),
        fetchGrantHash: sha256(newFetchGrant()),
        ...files,
        materializedAt: null,
      };
      const existing = await store.findByCommandId(staged.commandId);
      if (existing) {
        if (!equivalent(existing, staged)) fail("SPEC224_RUNNER_INPUT_COMMAND_CONFLICT");
        return { ...safeSummary(existing), inputFetchGrant: await rotateGrant(store, existing.inputRef) };
      }
      const saved = await store.insert(staged);
      return { ...safeSummary(saved), inputFetchGrant: await rotateGrant(store, saved.inputRef) };
    },

    async rotateInputFetchGrant(input: {
      inputRef: string;
      tenantId: string;
      runnerId: string;
      runnerSessionId: string;
    }): Promise<{ inputRef: string; inputFetchGrant: string }> {
      const staged = await store.findByInputRef(
        requireId(input.inputRef, "SPEC224_RUNNER_INPUT_REF_INVALID")
      );
      if (!staged) fail("SPEC224_RUNNER_INPUT_NOT_FOUND");
      if (
        staged.tenantId !== input.tenantId ||
        staged.runnerId !== input.runnerId ||
        staged.runnerSessionId !== input.runnerSessionId
      )
        fail("SPEC224_RUNNER_INPUT_BINDING_MISMATCH");
      const active = await store.currentLease({
        tenantId: staged.tenantId,
        workerJobId: staged.workerJobId,
        attempt: staged.attempt,
        attemptId: staged.attemptId,
        fencingToken: staged.fencingToken,
        now: now(),
      });
      if (!active || !(await store.isCurrentRunnerSession(input)))
        fail("SPEC224_RUNNER_INPUT_LEASE_STALE");
      return {
        inputRef: staged.inputRef,
        inputFetchGrant: await rotateGrant(store, staged.inputRef),
      };
    },

    async getRunnerInputForMaterialization(input: {
      inputRef: string;
      tenantId: string;
      runnerId: string;
      runnerSessionId: string;
      authorizationGrantRef: string;
      inputFetchGrant: string;
    }): Promise<Spec224StagedRunnerInput> {
      const inputRef = requireId(input.inputRef, "SPEC224_RUNNER_INPUT_REF_INVALID");
      const staged = await store.findByInputRef(inputRef);
      if (!staged) fail("SPEC224_RUNNER_INPUT_NOT_FOUND");
      if (
        staged.tenantId !== input.tenantId ||
        staged.runnerId !== input.runnerId ||
        staged.runnerSessionId !== input.runnerSessionId ||
        staged.authorizationGrantRef !== input.authorizationGrantRef
      )
        fail("SPEC224_RUNNER_INPUT_BINDING_MISMATCH");
      const fetchGrantHash = sha256(input.inputFetchGrant);
      if (!sameHash(staged.fetchGrantHash, fetchGrantHash))
        fail("SPEC224_RUNNER_INPUT_FETCH_GRANT_INVALID");
      const active = await store.currentLease({
        tenantId: staged.tenantId,
        workerJobId: staged.workerJobId,
        attempt: staged.attempt,
        attemptId: staged.attemptId,
        fencingToken: staged.fencingToken,
        now: now(),
      });
      if (!active) fail("SPEC224_RUNNER_INPUT_LEASE_STALE");
      if (!(await store.isCurrentRunnerSession(input)))
        fail("SPEC224_RUNNER_INPUT_SESSION_STALE");
      if (!(await store.consumeFetchGrant({ inputRef, fetchGrantHash, consumedAt: now() })))
        fail("SPEC224_RUNNER_INPUT_FETCH_GRANT_REPLAYED");
      return staged;
    },

    async recordInputMaterialized(input: {
      inputRef: string;
      commandId: string;
      tenantId: string;
      runnerId: string;
      runnerSessionId: string;
      inputDigest: string;
      totalBytes: number;
      fileCount: number;
    }): Promise<void> {
      const staged = await store.findByInputRef(
        requireId(input.inputRef, "SPEC224_RUNNER_INPUT_REF_INVALID")
      );
      if (!staged) fail("SPEC224_RUNNER_INPUT_NOT_FOUND");
      if (
        staged.commandId !== input.commandId ||
        staged.tenantId !== input.tenantId ||
        staged.runnerId !== input.runnerId ||
        staged.runnerSessionId !== input.runnerSessionId ||
        staged.inputDigest !== input.inputDigest ||
        staged.totalBytes !== input.totalBytes ||
        staged.files.length !== input.fileCount ||
        !SHA256.test(input.inputDigest)
      )
        fail("SPEC224_RUNNER_INPUT_RECEIPT_MISMATCH");
      const active = await store.currentLease({
        tenantId: staged.tenantId,
        workerJobId: staged.workerJobId,
        attempt: staged.attempt,
        attemptId: staged.attemptId,
        fencingToken: staged.fencingToken,
        now: now(),
      });
      if (!active) fail("SPEC224_RUNNER_INPUT_LEASE_STALE");
      if (
        !(await store.isCurrentRunnerSession({
          tenantId: staged.tenantId,
          runnerId: staged.runnerId,
          runnerSessionId: staged.runnerSessionId,
        }))
      )
        fail("SPEC224_RUNNER_INPUT_SESSION_STALE");
      if (!staged.materializedAt) await store.markMaterialized(staged.inputRef, now());
    },
  };
}

function safeSummary(staged: Spec224StagedRunnerInput) {
  return {
    inputRef: staged.inputRef,
    inputDigest: staged.inputDigest,
    totalBytes: staged.totalBytes,
    files: staged.files.map(file => ({
      path: file.path,
      digest: file.digest,
      bytes: file.bytes,
    })),
  };
}

function safeSourceSummary(source: Spec224RunnerInputSource) {
  return {
    inputSourceRef: source.inputSourceRef,
    inputDigest: source.inputDigest,
    totalBytes: source.totalBytes,
    files: source.files.map(file => ({
      path: file.path,
      digest: file.digest,
      bytes: file.bytes,
    })),
  };
}

async function rotateGrant(
  store: Spec224RunnerInputStagingStore,
  inputRef: string
): Promise<string> {
  const inputFetchGrant = newFetchGrant();
  await store.rotateFetchGrant(inputRef, sha256(inputFetchGrant));
  return inputFetchGrant;
}

class DrizzleSpec224RunnerInputStagingStore
  implements Spec224RunnerInputStagingStore
{
  async findByInputRef(inputRef: string) {
    const [row] = await getDb()
      .select()
      .from(spec224RunnerJobInputs)
      .where(eq(spec224RunnerJobInputs.id, inputRef))
      .limit(1);
    return row ? rowToInput(row) : null;
  }

  async findByCommandId(commandId: string) {
    const [row] = await getDb()
      .select()
      .from(spec224RunnerJobInputs)
      .where(eq(spec224RunnerJobInputs.commandId, commandId))
      .limit(1);
    return row ? rowToInput(row) : null;
  }

  async insert(input: Spec224StagedRunnerInput) {
    const [row] = await getDb()
      .insert(spec224RunnerJobInputs)
      .values({
        id: input.inputRef,
        tenantId: input.tenantId,
        workerJobId: input.workerJobId,
        commandId: input.commandId,
        attemptId: input.attemptId,
        attempt: input.attempt,
        leaseId: input.leaseId,
        fencingToken: input.fencingToken,
        runnerId: input.runnerId,
        runnerSessionId: input.runnerSessionId,
        authorizationGrantRef: input.authorizationGrantRef,
        workspaceRef: input.workspaceRef,
        fetchGrantHash: input.fetchGrantHash,
        inputDigest: input.inputDigest,
        totalBytes: input.totalBytes,
        filesJson: input.files.map(({ path, digest, contentBase64 }) => ({
          path,
          digest,
          contentBase64,
        })),
      })
      .returning();
    if (!row) fail("SPEC224_RUNNER_INPUT_STORE_FAILED");
    return rowToInput(row);
  }

  async currentLease(input: {
    tenantId: string;
    workerJobId: string;
    attempt: number;
    attemptId: string;
    fencingToken: number;
    now: Date;
  }) {
    const [row] = await getDb()
      .select({ id: workerJobs.id })
      .from(workerJobs)
      .innerJoin(
        workerJobAttempts,
        and(
          eq(workerJobAttempts.workerJobId, workerJobs.id),
          eq(workerJobAttempts.attempt, workerJobs.attempt)
        )
      )
      .where(
        and(
          eq(workerJobs.id, input.workerJobId),
          eq(workerJobs.tenantId, input.tenantId),
          eq(workerJobs.attempt, input.attempt),
          eq(workerJobs.fencingVersion, input.fencingToken),
          eq(workerJobAttempts.id, input.attemptId),
          gt(workerJobs.leaseExpiresAt, input.now)
        )
      )
      .limit(1);
    return Boolean(row);
  }

  async markMaterialized(inputRef: string, at: Date) {
    await getDb()
      .update(spec224RunnerJobInputs)
      .set({ materializedAt: at })
      .where(eq(spec224RunnerJobInputs.id, inputRef));
  }

  async rotateFetchGrant(inputRef: string, fetchGrantHash: string) {
    await getDb()
      .update(spec224RunnerJobInputs)
      .set({ fetchGrantHash, fetchGrantConsumedAt: null })
      .where(eq(spec224RunnerJobInputs.id, inputRef));
  }

  async consumeFetchGrant(input: {
    inputRef: string;
    fetchGrantHash: string;
    consumedAt: Date;
  }) {
    const [row] = await getDb()
      .update(spec224RunnerJobInputs)
      .set({ fetchGrantConsumedAt: input.consumedAt })
      .where(
        and(
          eq(spec224RunnerJobInputs.id, input.inputRef),
          eq(spec224RunnerJobInputs.fetchGrantHash, input.fetchGrantHash),
          isNull(spec224RunnerJobInputs.fetchGrantConsumedAt)
        )
      )
      .returning({ id: spec224RunnerJobInputs.id });
    return Boolean(row);
  }

  async isCurrentRunnerSession(input: {
    tenantId: string;
    runnerId: string;
    runnerSessionId: string;
  }) {
    const [row] = await getDb()
      .select({ runnerId: runnerNodes.runnerId })
      .from(runnerNodes)
      .where(
        and(
          eq(runnerNodes.tenantId, input.tenantId),
          eq(runnerNodes.runnerId, input.runnerId),
          eq(runnerNodes.activeSessionId, input.runnerSessionId),
          eq(runnerNodes.trustState, "trusted"),
          eq(runnerNodes.status, "online")
        )
      )
      .limit(1);
    return Boolean(row);
  }

  async findSourceByRef(inputSourceRef: string) {
    const [row] = await getDb()
      .select()
      .from(spec224RunnerInputSources)
      .where(eq(spec224RunnerInputSources.id, inputSourceRef))
      .limit(1);
    return row ? rowToSource(row) : null;
  }

  async findSourceByStart(input: { tenantId: string; startRef: string }) {
    const [row] = await getDb()
      .select()
      .from(spec224RunnerInputSources)
      .where(
        and(
          eq(spec224RunnerInputSources.tenantId, input.tenantId),
          eq(spec224RunnerInputSources.startRef, input.startRef)
        )
      )
      .limit(1);
    return row ? rowToSource(row) : null;
  }

  async insertSource(input: Spec224RunnerInputSource) {
    const [row] = await getDb()
      .insert(spec224RunnerInputSources)
      .values({
        id: input.inputSourceRef,
        tenantId: input.tenantId,
        startRef: input.startRef,
        inputDigest: input.inputDigest,
        totalBytes: input.totalBytes,
        filesJson: input.files.map(({ path, digest, contentBase64 }) => ({
          path,
          digest,
          contentBase64,
        })),
      })
      .returning();
    if (!row) fail("SPEC224_RUNNER_INPUT_SOURCE_STORE_FAILED");
    return rowToSource(row);
  }

  async bindSourceToWorkerJob(input: {
    tenantId: string;
    startRef: string;
    inputSourceRef: string;
    workerJobId: string;
  }) {
    const [row] = await getDb()
      .update(spec224RunnerInputSources)
      .set({ workerJobId: input.workerJobId })
      .where(and(
        eq(spec224RunnerInputSources.id, input.inputSourceRef),
        eq(spec224RunnerInputSources.tenantId, input.tenantId),
        eq(spec224RunnerInputSources.startRef, input.startRef),
        sql`(${spec224RunnerInputSources.workerJobId} IS NULL OR ${spec224RunnerInputSources.workerJobId} = ${input.workerJobId})`,
      ))
      .returning({ workerJobId: spec224RunnerInputSources.workerJobId });
    if (row?.workerJobId === input.workerJobId) return true;
    const [existing] = await getDb()
      .select({ workerJobId: spec224RunnerInputSources.workerJobId })
      .from(spec224RunnerInputSources)
      .where(and(
        eq(spec224RunnerInputSources.id, input.inputSourceRef),
        eq(spec224RunnerInputSources.tenantId, input.tenantId),
        eq(spec224RunnerInputSources.startRef, input.startRef),
      ))
      .limit(1);
    return existing?.workerJobId === input.workerJobId;
  }
}

function rowToInput(
  row: typeof spec224RunnerJobInputs.$inferSelect
): Spec224StagedRunnerInput {
  const files = row.filesJson.map(file => ({
    path: file.path,
    digest: file.digest,
    contentBase64: file.contentBase64,
    bytes: Buffer.from(file.contentBase64, "base64").byteLength,
  }));
  return {
    inputRef: row.id,
    tenantId: row.tenantId,
    workerJobId: row.workerJobId,
    commandId: row.commandId,
    attemptId: row.attemptId,
    attempt: row.attempt,
    leaseId: row.leaseId,
    fencingToken: row.fencingToken,
    runnerId: row.runnerId,
    runnerSessionId: row.runnerSessionId,
    authorizationGrantRef: row.authorizationGrantRef,
    workspaceRef: row.workspaceRef,
    fetchGrantHash: row.fetchGrantHash,
    inputDigest: row.inputDigest,
    totalBytes: row.totalBytes,
    files,
    materializedAt: row.materializedAt,
  };
}

function rowToSource(
  row: typeof spec224RunnerInputSources.$inferSelect
): Spec224RunnerInputSource {
  return {
    inputSourceRef: row.id,
    tenantId: row.tenantId,
    startRef: row.startRef,
    inputDigest: row.inputDigest,
    totalBytes: row.totalBytes,
    files: row.filesJson.map(file => ({
      path: file.path,
      digest: file.digest,
      contentBase64: file.contentBase64,
      bytes: Buffer.from(file.contentBase64, "base64").byteLength,
    })),
  };
}

export const defaultSpec224RunnerInputStagingService =
  createSpec224RunnerInputStagingService();
