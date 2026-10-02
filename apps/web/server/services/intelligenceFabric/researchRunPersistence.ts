import { and, desc, eq } from "drizzle-orm";
import {
  intelligenceResearchRequests,
  intelligenceResearchRuns,
  workerJobs,
} from "../../../drizzle/schema";
import { getDb } from "../../db";
import { parseResearchRun } from "./researchContracts";
import type { ResearchRun } from "./researchContracts";

const RECEIPT_MAX_BYTES = 32_768;
const MAX_RUN_NUMBER = 2_147_483_647;
const PROVIDER_ID_MAX_LENGTH = 160;
const SECRET_VALUE = /(?:\b(?:api[_-]?key|authorization|cookie|credential|password|secret|token)\b\s*[:=]\s*\S+|\b(?:bearer\s+|sk-|rk_live_)[A-Za-z0-9_\-.]{8,})/i;

export type ResearchRunPersistenceErrorCode =
  | "RESEARCH_RUN_INVALID"
  | "RESEARCH_RUN_AUTHORITY_MISMATCH"
  | "RESEARCH_RUN_RECEIPT_SECRET"
  | "RESEARCH_RUN_RECEIPT_TOO_LARGE"
  | "RESEARCH_RUN_REPLAY_CONFLICT";

export class ResearchRunPersistenceError extends Error {
  constructor(readonly code: ResearchRunPersistenceErrorCode) {
    super(code);
    this.name = "ResearchRunPersistenceError";
  }
}

/** Trusted server context. Its values are verified again against request and job rows. */
export interface ResearchRunTrustContext {
  readonly tenantId: string;
  readonly researchRequestId: string;
  readonly canonicalJobId: string;
}

export interface PersistedResearchRun {
  readonly id: string;
  readonly requestId: string;
  readonly tenantId: string | null;
  readonly runNumber: number;
  readonly status: string;
  readonly providerId: string;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
  readonly receiptJson: Record<string, unknown>;
  readonly createdAt: Date;
}

export interface BoundResearchRequestJob {
  readonly requestId: string;
  readonly requestTenantId: string | null;
  readonly authorizationScope: string;
  readonly canonicalJobId: string | null;
  readonly jobId: string | null;
  readonly jobTenantId: string | null;
}

export interface ResearchRunInsert {
  readonly id: string;
  readonly requestId: string;
  readonly tenantId: string;
  readonly runNumber: number;
  readonly status: string;
  readonly providerId: string;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
  readonly receiptJson: Record<string, unknown>;
}

/** Small query port keeps persistence deterministic and makes every read tenant-scoped. */
export interface ResearchRunPersistenceQuery {
  findBoundRequestAndJob(input: ResearchRunTrustContext): Promise<BoundResearchRequestJob | undefined>;
  findRunById(input: { readonly id: string; readonly tenantId: string; readonly requestId: string }): Promise<PersistedResearchRun | undefined>;
  findRunByRequestNumber(input: { readonly tenantId: string; readonly requestId: string; readonly runNumber: number }): Promise<PersistedResearchRun | undefined>;
  insertRunIfAbsent(input: ResearchRunInsert): Promise<PersistedResearchRun | undefined>;
  listRuns(input: { readonly tenantId: string; readonly requestId: string }): Promise<readonly PersistedResearchRun[]>;
}

export interface ResearchRunPersistenceDependencies {
  readonly query?: ResearchRunPersistenceQuery;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function fail(code: ResearchRunPersistenceErrorCode): never {
  throw new ResearchRunPersistenceError(code);
}

function receiptFromRun(run: ResearchRun): Record<string, unknown> {
  return {
    contractVersion: run.contractVersion,
    researchRunId: run.researchRunId,
    researchRequestId: run.researchRequestId,
    ...(run.canonicalJobRef === undefined ? {} : { canonicalJobRef: run.canonicalJobRef }),
    ...(run.tenantId === undefined ? {} : { tenantId: run.tenantId }),
    providerId: run.providerId,
    ...(run.modelOrAgentVersion === undefined ? {} : { modelOrAgentVersion: run.modelOrAgentVersion }),
    startedAt: run.startedAt,
    ...(run.completedAt === undefined ? {} : { completedAt: run.completedAt }),
    status: run.status,
    ...(run.queryPlanRef === undefined ? {} : { queryPlanRef: run.queryPlanRef }),
    toolReceiptRefs: [...run.toolReceiptRefs],
    artifactRefs: [...run.artifactRefs],
    candidateRefs: [...run.candidateRefs],
    sourceUrlsOrIds: [...run.sourceUrlsOrIds],
    ...(run.costReceiptRef === undefined ? {} : { costReceiptRef: run.costReceiptRef }),
    ...(run.parentResearchRunIds === undefined ? {} : { parentResearchRunIds: [...run.parentResearchRunIds] }),
  };
}

function assertSecretFree(value: unknown): void {
  if (typeof value === "string") {
    if (SECRET_VALUE.test(value)) fail("RESEARCH_RUN_RECEIPT_SECRET");
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertSecretFree(item);
    return;
  }
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) assertSecretFree(child);
  }
}

function assertValidRun(input: { readonly context: ResearchRunTrustContext; readonly run: unknown; readonly runNumber: number }): { readonly run: ResearchRun; readonly receipt: Record<string, unknown> } {
  if (!Number.isInteger(input.runNumber) || input.runNumber < 1 || input.runNumber > MAX_RUN_NUMBER) fail("RESEARCH_RUN_INVALID");
  const parsed = parseResearchRun(input.run);
  if (!parsed.ok) fail("RESEARCH_RUN_INVALID");
  const run = parsed.value;
  if (run.researchRequestId !== input.context.researchRequestId ||
    run.tenantId !== input.context.tenantId ||
    run.canonicalJobRef !== input.context.canonicalJobId ||
    run.providerId.length > PROVIDER_ID_MAX_LENGTH) {
    fail("RESEARCH_RUN_INVALID");
  }
  const receipt = receiptFromRun(run);
  assertSecretFree(receipt);
  try {
    if (Buffer.byteLength(canonicalJson(receipt), "utf8") > RECEIPT_MAX_BYTES) fail("RESEARCH_RUN_RECEIPT_TOO_LARGE");
  } catch (error) {
    if (error instanceof ResearchRunPersistenceError) throw error;
    fail("RESEARCH_RUN_INVALID");
  }
  return { run, receipt };
}

function assertBoundRequestJob(context: ResearchRunTrustContext, binding: BoundResearchRequestJob | undefined): void {
  if (!binding || binding.requestId !== context.researchRequestId ||
    binding.authorizationScope !== "TENANT" || binding.requestTenantId !== context.tenantId ||
    binding.canonicalJobId !== context.canonicalJobId || binding.jobId !== context.canonicalJobId ||
    binding.jobTenantId !== context.tenantId) {
    fail("RESEARCH_RUN_AUTHORITY_MISMATCH");
  }
}

function equivalent(existing: PersistedResearchRun, expected: ResearchRunInsert): boolean {
  return existing.id === expected.id && existing.requestId === expected.requestId && existing.tenantId === expected.tenantId &&
    existing.runNumber === expected.runNumber && existing.status === expected.status &&
    existing.providerId === expected.providerId && existing.startedAt.getTime() === expected.startedAt.getTime() &&
    (existing.completedAt?.getTime() ?? null) === (expected.completedAt?.getTime() ?? null) &&
    canonicalJson(existing.receiptJson) === canonicalJson(expected.receiptJson);
}

function defaultQuery(): ResearchRunPersistenceQuery {
  const database: any = getDb();
  return {
    async findBoundRequestAndJob(input) {
      const rows = await database
        .select({
          requestId: intelligenceResearchRequests.id,
          requestTenantId: intelligenceResearchRequests.tenantId,
          authorizationScope: intelligenceResearchRequests.authorizationScope,
          canonicalJobId: intelligenceResearchRequests.canonicalJobId,
          jobId: workerJobs.id,
          jobTenantId: workerJobs.tenantId,
        })
        .from(intelligenceResearchRequests)
        .leftJoin(workerJobs, eq(intelligenceResearchRequests.canonicalJobId, workerJobs.id))
        .where(and(
          eq(intelligenceResearchRequests.id, input.researchRequestId),
          eq(intelligenceResearchRequests.tenantId, input.tenantId),
          eq(intelligenceResearchRequests.canonicalJobId, input.canonicalJobId),
        ))
        .limit(1);
      return rows[0];
    },
    async findRunByRequestNumber(input) {
      const rows = await database
        .select()
        .from(intelligenceResearchRuns)
        .where(and(
          eq(intelligenceResearchRuns.requestId, input.requestId),
          eq(intelligenceResearchRuns.tenantId, input.tenantId),
          eq(intelligenceResearchRuns.runNumber, input.runNumber),
        ))
        .limit(1);
      return rows[0];
    },
    async findRunById(input) {
      const rows = await database.select().from(intelligenceResearchRuns)
        .where(and(
          eq(intelligenceResearchRuns.id, input.id),
          eq(intelligenceResearchRuns.tenantId, input.tenantId),
          eq(intelligenceResearchRuns.requestId, input.requestId),
        )).limit(1);
      return rows[0];
    },
    async insertRunIfAbsent(input) {
      const rows = await database
        .insert(intelligenceResearchRuns)
        .values(input)
        .onConflictDoNothing({ target: intelligenceResearchRuns.id })
        .returning();
      return rows[0];
    },
    async listRuns(input) {
      return database
        .select()
        .from(intelligenceResearchRuns)
        .where(and(
          eq(intelligenceResearchRuns.requestId, input.requestId),
          eq(intelligenceResearchRuns.tenantId, input.tenantId),
        ))
        .orderBy(desc(intelligenceResearchRuns.runNumber));
    },
  };
}

/** Append one immutable receipt. No provider invocation, job dispatch, update, or delete occurs here. */
export async function appendResearchRun(input: {
  readonly query?: ResearchRunPersistenceQuery;
  readonly context: ResearchRunTrustContext;
  readonly run: unknown;
  readonly runNumber: number;
}): Promise<{ readonly created: boolean; readonly run: PersistedResearchRun }> {
  const query = input.query ?? defaultQuery();
  assertBoundRequestJob(input.context, await query.findBoundRequestAndJob(input.context));
  const { run, receipt } = assertValidRun(input);
  const values: ResearchRunInsert = {
    id: run.researchRunId,
    requestId: input.context.researchRequestId,
    tenantId: input.context.tenantId,
    runNumber: input.runNumber,
    status: run.status,
    providerId: run.providerId,
    startedAt: new Date(run.startedAt),
    completedAt: run.completedAt ? new Date(run.completedAt) : null,
    receiptJson: receipt,
  };
  let inserted: PersistedResearchRun | undefined;
  try {
    inserted = await query.insertRunIfAbsent(values);
  } catch (error) {
    const occupiedNumber = await query.findRunByRequestNumber({
      tenantId: input.context.tenantId,
      requestId: input.context.researchRequestId,
      runNumber: input.runNumber,
    });
    if (occupiedNumber) fail("RESEARCH_RUN_REPLAY_CONFLICT");
    throw error;
  }
  if (inserted) return { created: true, run: inserted };
  const existing = await query.findRunById({ id: values.id, tenantId: values.tenantId, requestId: values.requestId });
  if (!existing || !equivalent(existing, values)) fail("RESEARCH_RUN_REPLAY_CONFLICT");
  return { created: false, run: existing };
}

/** Read one immutable receipt after proving the same tenant/request/job binding. */
export async function getResearchRun(input: {
  readonly query?: ResearchRunPersistenceQuery;
  readonly context: ResearchRunTrustContext;
  readonly runNumber: number;
}): Promise<PersistedResearchRun | undefined> {
  if (!Number.isInteger(input.runNumber) || input.runNumber < 1 || input.runNumber > MAX_RUN_NUMBER) fail("RESEARCH_RUN_INVALID");
  const query = input.query ?? defaultQuery();
  assertBoundRequestJob(input.context, await query.findBoundRequestAndJob(input.context));
  return query.findRunByRequestNumber({ tenantId: input.context.tenantId, requestId: input.context.researchRequestId, runNumber: input.runNumber });
}

/** List immutable receipts after proving the same tenant/request/job binding. */
export async function listResearchRuns(input: {
  readonly query?: ResearchRunPersistenceQuery;
  readonly context: ResearchRunTrustContext;
}): Promise<readonly PersistedResearchRun[]> {
  const query = input.query ?? defaultQuery();
  assertBoundRequestJob(input.context, await query.findBoundRequestAndJob(input.context));
  return query.listRuns({ tenantId: input.context.tenantId, requestId: input.context.researchRequestId });
}

/** Injectable repository facade intentionally exposes append/get/list only. */
export function createResearchRunPersistence(dependencies: ResearchRunPersistenceDependencies = {}) {
  return {
    append: (input: Omit<Parameters<typeof appendResearchRun>[0], "query">) => appendResearchRun({ ...input, query: dependencies.query }),
    get: (input: Omit<Parameters<typeof getResearchRun>[0], "query">) => getResearchRun({ ...input, query: dependencies.query }),
    list: (input: Omit<Parameters<typeof listResearchRuns>[0], "query">) => listResearchRuns({ ...input, query: dependencies.query }),
  } as const;
}
