import { describe, expect, it } from "vitest";
import {
  appendResearchRun,
  createResearchRunPersistence,
  getResearchRun,
  listResearchRuns,
  ResearchRunPersistenceError,
  type ResearchRunPersistenceQuery,
} from "./researchRunPersistence";

const context = {
  tenantId: "tenant-1",
  researchRequestId: "request-1",
  canonicalJobId: "job-1",
} as const;

const run = {
  contractVersion: "spec266-research-v1" as const,
  researchRunId: "run-1",
  researchRequestId: "request-1",
  canonicalJobRef: "job-1",
  tenantId: "tenant-1",
  providerId: "provider-1",
  modelOrAgentVersion: "model-1",
  startedAt: "2026-10-02T00:00:00.000Z",
  completedAt: "2026-10-02T00:00:01.000Z",
  status: "completed" as const,
  queryPlanRef: "plan-1",
  toolReceiptRefs: ["tool-receipt-1"],
  artifactRefs: ["artifact-1"],
  candidateRefs: ["candidate-1"],
  sourceUrlsOrIds: ["source-1"],
  costReceiptRef: "cost-1",
  parentResearchRunIds: [],
};

type StoredRun = {
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
};

function createQuery(overrides: Partial<ResearchRunPersistenceQuery> = {}) {
  const rows: StoredRun[] = [];
  const query: ResearchRunPersistenceQuery = {
    findBoundRequestAndJob: async () => ({
      requestId: "request-1",
      requestTenantId: "tenant-1",
      authorizationScope: "TENANT",
      canonicalJobId: "job-1",
      jobId: "job-1",
      jobTenantId: "tenant-1",
    }),
    findRunById: async ({ id, tenantId, requestId }) => rows.find(row => row.id === id && row.tenantId === tenantId && row.requestId === requestId),
    findRunByRequestNumber: async ({ tenantId, requestId, runNumber }) =>
      rows.find(row => row.tenantId === tenantId && row.requestId === requestId && row.runNumber === runNumber),
    insertRunIfAbsent: async input => {
      if (rows.some(row => row.requestId === input.requestId && row.runNumber === input.runNumber)) return undefined;
      if (rows.some(row => row.id === input.id)) return undefined;
      const row: StoredRun = {
        id: input.id,
        requestId: input.requestId,
        tenantId: input.tenantId,
        runNumber: input.runNumber,
        status: input.status,
        providerId: input.providerId,
        startedAt: input.startedAt,
        completedAt: input.completedAt,
        receiptJson: input.receiptJson,
        createdAt: new Date("2026-10-02T00:00:02.000Z"),
      };
      rows.push(row);
      return row;
    },
    listRuns: async ({ requestId, tenantId }) =>
      rows.filter(row => row.requestId === requestId && row.tenantId === tenantId),
    ...overrides,
  };
  return { query, rows };
}

describe("Spec 266 immutable ResearchRun persistence", () => {
  it("appends a server-bound tenant run and reads only through the same request/job context", async () => {
    const { query } = createQuery();

    const appended = await appendResearchRun({ query, context, run, runNumber: 1 });
    const fetched = await getResearchRun({ query, context, runNumber: 1 });
    const listed = await listResearchRuns({ query, context });

    expect(appended).toMatchObject({ created: true, run: { id: "run-1", requestId: "request-1", runNumber: 1 } });
    expect(appended.run.receiptJson).toEqual(run);
    expect(fetched).toEqual(appended.run);
    expect(listed).toEqual([appended.run]);
  });

  it("rejects a request/job binding when the persisted tenant or canonical job differs", async () => {
    const { query } = createQuery({
      findBoundRequestAndJob: async () => ({
        requestId: "request-1",
        requestTenantId: "tenant-1",
        authorizationScope: "TENANT",
        canonicalJobId: "job-1",
        jobId: "job-1",
        jobTenantId: "tenant-other",
      }),
    });

    await expect(appendResearchRun({ query, context, run, runNumber: 1 }))
      .rejects.toMatchObject({ code: "RESEARCH_RUN_AUTHORITY_MISMATCH" });
    await expect(appendResearchRun({ query, context: { ...context, canonicalJobId: "job-other" }, run, runNumber: 1 }))
      .rejects.toMatchObject({ code: "RESEARCH_RUN_AUTHORITY_MISMATCH" });

    const requestMismatch = createQuery({
      findBoundRequestAndJob: async () => ({
        requestId: "request-1",
        requestTenantId: "tenant-other",
        authorizationScope: "TENANT",
        canonicalJobId: "job-1",
        jobId: "job-1",
        jobTenantId: "tenant-1",
      }),
    });
    await expect(appendResearchRun({ query: requestMismatch.query, context, run, runNumber: 1 }))
      .rejects.toMatchObject({ code: "RESEARCH_RUN_AUTHORITY_MISMATCH" });
  });

  it("returns the same immutable receipt for an identical request/run-number replay and rejects changed content", async () => {
    const { query } = createQuery();
    const first = await appendResearchRun({ query, context, run, runNumber: 1 });
    const replay = await appendResearchRun({ query, context, run, runNumber: 1 });

    expect(replay).toEqual({ created: false, run: first.run });
    await expect(appendResearchRun({
      query,
      context,
      run: { ...run, providerId: "provider-2" },
      runNumber: 1,
    })).rejects.toMatchObject({ code: "RESEARCH_RUN_REPLAY_CONFLICT" });
  });

  it("rejects malformed, oversized, or secret-bearing metadata before it reaches storage", async () => {
    const { query, rows } = createQuery();

    await expect(appendResearchRun({
      query,
      context,
      run: { ...run, toolReceiptRefs: ["credential:super-secret"] },
      runNumber: 1,
    })).rejects.toMatchObject({ code: "RESEARCH_RUN_RECEIPT_SECRET" });
    await expect(appendResearchRun({
      query,
      context,
      run: { ...run, unsupportedReceiptData: true } as unknown,
      runNumber: 1,
    })).rejects.toMatchObject({ code: "RESEARCH_RUN_INVALID" });
    await expect(appendResearchRun({
      query,
      context,
      run: { ...run, tenantId: "tenant-other" },
      runNumber: 1,
    })).rejects.toMatchObject({ code: "RESEARCH_RUN_INVALID" });
    await expect(appendResearchRun({
      query,
      context,
      run: { ...run, providerId: "p".repeat(161) },
      runNumber: 1,
    })).rejects.toMatchObject({ code: "RESEARCH_RUN_INVALID" });
    await expect(appendResearchRun({
      query,
      context,
      run: {
        ...run,
        sourceUrlsOrIds: Array.from({ length: 256 }, (_, index) => `source-${index}-${"a".repeat(180)}`),
      },
      runNumber: 1,
    })).rejects.toMatchObject({ code: "RESEARCH_RUN_RECEIPT_TOO_LARGE" });
    expect(rows).toEqual([]);
  });

  it("exposes no ResearchRun mutation operations", () => {
    const persistence = createResearchRunPersistence({ query: createQuery().query });
    expect(persistence).toHaveProperty("append");
    expect(persistence).toHaveProperty("get");
    expect(persistence).toHaveProperty("list");
    expect(persistence).not.toHaveProperty("update");
    expect(persistence).not.toHaveProperty("delete");
    expect(ResearchRunPersistenceError).toBeTypeOf("function");
  });
});
