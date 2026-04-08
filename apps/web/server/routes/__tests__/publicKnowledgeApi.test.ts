import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../services/libraryService", () => ({
  getLibraryItemById: vi.fn(),
  safeEnqueueLibraryIndexJob: vi.fn(),
  searchLibraryItems: vi.fn(),
  uploadLibraryFile: vi.fn(),
}));

vi.mock("../../services/creditService", () => ({
  calculateLibraryUploadCreditCost: vi.fn(),
  chargeForRagQuery: vi.fn(),
  getCreditBalance: vi.fn(),
}));

vi.mock("../../services/workerDelegationService", () => ({
  assertDelegatedWorkerGrant: vi.fn(),
  WorkerDelegationError: class WorkerDelegationError extends Error {
    code: string;
    statusCode: number;
    type: string;

    constructor(code: string, statusCode: number, message: string, type = "auth_error") {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
      this.type = type;
    }
  },
}));

vi.mock("../../services/delegatedWorkerPlatformService", () => ({
  buildDelegatedWorkerOriginMetadata: vi.fn((_auth, _surface, extra) => extra ?? {}),
  runWithDelegatedWorkerExecution: vi.fn(async (_input, fn) => fn()),
  DelegatedWorkerPlatformError: class DelegatedWorkerPlatformError extends Error {
    code: string;
    statusCode: number;
    type: string;

    constructor(code: string, statusCode: number, message: string, type = "invalid_request_error") {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
      this.type = type;
    }
  },
}));

import { createPublicKnowledgeRouter } from "../publicKnowledgeApi";
import {
  getLibraryItemById,
  safeEnqueueLibraryIndexJob,
  searchLibraryItems,
  uploadLibraryFile,
} from "../../services/libraryService";
import {
  calculateLibraryUploadCreditCost,
  chargeForRagQuery,
  getCreditBalance,
} from "../../services/creditService";
import { assertDelegatedWorkerGrant } from "../../services/workerDelegationService";
import { runWithDelegatedWorkerExecution } from "../../services/delegatedWorkerPlatformService";

const mockSearchLibraryItems = vi.mocked(searchLibraryItems);
const mockUploadLibraryFile = vi.mocked(uploadLibraryFile);
const mockGetLibraryItemById = vi.mocked(getLibraryItemById);
const mockSafeEnqueueLibraryIndexJob = vi.mocked(safeEnqueueLibraryIndexJob);
const mockCalculateLibraryUploadCreditCost = vi.mocked(calculateLibraryUploadCreditCost);
const mockChargeForRagQuery = vi.mocked(chargeForRagQuery);
const mockGetCreditBalance = vi.mocked(getCreditBalance);
const mockAssertDelegatedWorkerGrant = vi.mocked(assertDelegatedWorkerGrant);
const mockRunWithDelegatedWorkerExecution = vi.mocked(runWithDelegatedWorkerExecution);

function makeApp(authOverrides: Record<string, unknown> = {}) {
  const app = express();
  app.use(express.json({ limit: "70mb" }));
  app.use((req: any, _res: any, next: any) => {
    req.auth = {
      ok: true,
      mode: "delegated_worker",
      sub: "worker-delegate:test",
      scopes: ["library:search", "library:upload", "rag:search", "rag:ingest"],
      userId: 7,
      ownerUserId: 7,
      tenantId: "tenant-1",
      workerId: "worker-1",
      workerJobId: "job-1",
      delegatedSessionId: "session-1",
      runtimeType: "openclaw_gateway",
      scopeProfile: "worker_gateway_hybrid_executor",
      ...authOverrides,
    };
    next();
  });
  app.use("/v1/knowledge", createPublicKnowledgeRouter());
  return app;
}

describe("publicKnowledgeApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchLibraryItems.mockResolvedValue({
      version: "library_search_v1",
      query: "brief",
      total: 1,
      limit: 10,
      offset: 0,
      has_more: false,
      results: [{ id: 11, title: "Brief", itemType: "document" }],
    } as any);
    mockUploadLibraryFile.mockResolvedValue({
      item: { id: 88, title: "notes.pdf" },
      storageKey: "library/notes.pdf",
      indexJob: { jobId: 12, status: "queued" },
      billing: { creditsCharged: 3, category: "document", fileSizeBytes: 10, baseCredits: 3, stepCredits: 0, extraSteps: 0, sizeStepMb: 5 },
    } as any);
    mockCalculateLibraryUploadCreditCost.mockResolvedValue({
      totalCredits: 3,
      category: "document",
      fileSizeBytes: 10,
      fileSizeMb: 1,
      sizeStepMb: 5,
      baseCredits: 3,
      stepCredits: 0,
      extraSteps: 0,
    } as any);
    mockChargeForRagQuery.mockResolvedValue({ creditsUsed: 1, transactionId: 99 });
    mockGetCreditBalance.mockResolvedValue({ credits: 42 } as any);
    mockGetLibraryItemById.mockResolvedValue({
      id: 55,
      tenantId: "tenant-1",
      ownerUserId: 7,
      itemType: "document",
      source: "document_upload",
      title: "Research Notes",
      description: null,
      status: "ready",
      visibility: "private",
      metadata: {},
      sourceUrl: null,
      thumbnailUrl: null,
      deletedAt: null,
      createdAt: new Date("2026-04-07T10:00:00.000Z"),
      updatedAt: new Date("2026-04-07T10:00:00.000Z"),
    } as any);
    mockSafeEnqueueLibraryIndexJob.mockResolvedValue({
      jobId: 401,
      status: "pending",
      created: true,
      payloadVersion: "v1",
      dedupeKey: "rag-ingest-55",
    } as any);
  });

  it("searches only the owner library scope", async () => {
    const res = await request(makeApp())
      .post("/v1/knowledge/library/search")
      .send({ query: "brief", limit: 10 });

    expect(res.status).toBe(200);
    expect(mockAssertDelegatedWorkerGrant).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "delegated_worker" }),
      expect.objectContaining({ grantType: "library_search_scope" }),
    );
    expect(mockSearchLibraryItems).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "my_library",
        filters: expect.objectContaining({ ownerUserId: 7 }),
      }),
      expect.objectContaining({ userId: 7, tenantId: "tenant-1" }),
    );
  });

  it("uploads into the owner library and returns credit headers", async () => {
    const res = await request(makeApp())
      .post("/v1/knowledge/library/upload")
      .set("Idempotency-Key", "upload-1")
      .send({
        fileName: "notes.pdf",
        fileType: "application/pdf",
        fileBase64: Buffer.from("hello").toString("base64"),
      });

    expect(res.status).toBe(201);
    expect(mockRunWithDelegatedWorkerExecution).toHaveBeenCalledWith(
      expect.objectContaining({ estimatedCredits: 3, idempotencyKey: "upload-1", actionClass: "compute" }),
      expect.any(Function),
    );
    expect(mockUploadLibraryFile).toHaveBeenCalledWith(
      expect.objectContaining({
        billingMetadata: expect.objectContaining({
          endpoint: "/v1/knowledge/library/upload",
        }),
      }),
      expect.objectContaining({ userId: 7, tenantId: "tenant-1" }),
    );
    expect(res.headers["x-credits-used"]).toBe("3");
    expect(res.headers["x-credits-remaining"]).toBe("42");
  });

  it("charges RAG search against the owner user", async () => {
    const res = await request(makeApp())
      .post("/v1/knowledge/rag/search")
      .set("Idempotency-Key", "rag-1")
      .send({ query: "summarize my notes" });

    expect(res.status).toBe(200);
    expect(mockChargeForRagQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        service: "rag.semantic_search",
        tenantId: "tenant-1",
        idempotencyKey: "rag-1",
      }),
    );
    expect(res.body.credits_used).toBe(1);
  });

  it("uploads directly into owner RAG knowledge when the worker requests rag ingest", async () => {
    const res = await request(makeApp())
      .post("/v1/knowledge/rag/ingest")
      .set("Idempotency-Key", "rag-upload-1")
      .send({
        sourceType: "upload",
        fileName: "knowledge.pdf",
        fileType: "application/pdf",
        fileBase64: Buffer.from("hello").toString("base64"),
      });

    expect(res.status).toBe(201);
    expect(mockAssertDelegatedWorkerGrant).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "delegated_worker" }),
      expect.objectContaining({ grantType: "rag_scope", requireScopeFlag: "ingest" }),
    );
    expect(mockUploadLibraryFile).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          requestedKnowledgeTarget: "rag",
        }),
        billingMetadata: expect.objectContaining({
          endpoint: "/v1/knowledge/rag/ingest",
          sourceType: "upload",
        }),
      }),
      expect.objectContaining({ userId: 7, tenantId: "tenant-1" }),
    );
    expect(res.headers["x-credits-used"]).toBe("3");
    expect(res.body.ingest_target).toBe("rag");
  });

  it("re-enqueues indexing for an owner library item during rag ingest", async () => {
    const res = await request(makeApp())
      .post("/v1/knowledge/rag/ingest")
      .set("Idempotency-Key", "rag-item-1")
      .send({
        sourceType: "library_item",
        libraryItemId: 55,
      });

    expect(res.status).toBe(202);
    expect(mockGetLibraryItemById).toHaveBeenCalledWith(
      55,
      expect.objectContaining({ userId: 7, tenantId: "tenant-1" }),
    );
    expect(mockSafeEnqueueLibraryIndexJob).toHaveBeenCalledWith(
      expect.objectContaining({
        libraryItemId: 55,
        tenantId: "tenant-1",
        source: "public_api.rag_ingest",
      }),
    );
    expect(res.headers["x-credits-used"]).toBe("0");
    expect(res.body.indexJob.jobId).toBe(401);
  });
});
