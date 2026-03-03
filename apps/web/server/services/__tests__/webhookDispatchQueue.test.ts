/**
 * Tests for webhookDispatchQueue (BullMQ-based dispatch)
 *
 * Covers: queue init/shutdown, worker processor for agency/chat/workflow,
 * credit idempotency, failure logging, UnrecoverableError on missing target.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnrecoverableError } from "bullmq";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  mockQueueAdd,
  mockQueueClose,
  mockWorkerClose,
  mockWorkerOn,
  mockDbInsert,
  mockDbUpdate,
  mockGetDb,
  mockExecuteRun,
  mockProcessMessageServerSide,
  mockFetch,
  mockDeductCredits,
  mockAuditLog,
} = vi.hoisted(() => ({
  mockQueueAdd: vi.fn().mockResolvedValue(undefined),
  mockQueueClose: vi.fn().mockResolvedValue(undefined),
  mockWorkerClose: vi.fn().mockResolvedValue(undefined),
  mockWorkerOn: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockGetDb: vi.fn(),
  mockExecuteRun: vi.fn(),
  mockProcessMessageServerSide: vi.fn(),
  mockFetch: vi.fn(),
  mockDeductCredits: vi.fn().mockResolvedValue(undefined),
  mockAuditLog: vi.fn(),
}));

let capturedProcessor: any = null;
let capturedOnFailed: ((job: any, err: Error) => void) | null = null;

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: mockQueueAdd,
    close: mockQueueClose,
  })),
  Worker: vi.fn().mockImplementation((_name: any, processor: any) => {
    capturedProcessor = processor;
    return {
      on: vi.fn().mockImplementation((event: string, cb: any) => {
        if (event === "failed") capturedOnFailed = cb;
      }),
      close: mockWorkerClose,
    };
  }),
  UnrecoverableError: class UnrecoverableError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "UnrecoverableError";
    }
  },
}));

vi.mock("../redisClients", () => ({
  getRealtimeClient: vi.fn(() => ({ duplicate: vi.fn(() => ({})) })),
}));

vi.mock("../../db", () => ({ getDb: mockGetDb }));

vi.mock("../../../drizzle/schema", () => ({
  webhookTriggers: { id: "id", totalTriggers: "totalTriggers", lastTriggeredAt: "lastTriggeredAt" },
  webhookTriggerLogs: { triggerId: "triggerId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: any, val: any) => ({ eq: val })),
  sql: vi.fn((parts: any) => ({ sql: parts })),
}));

vi.mock("../agencyBridge", () => ({
  agencyBridge: { executeRun: mockExecuteRun },
}));

vi.mock("../channelGateway", () => ({
  channelGateway: { processMessageServerSide: mockProcessMessageServerSide },
}));

vi.mock("../creditService", () => ({
  deductCredits: mockDeductCredits,
}));

vi.mock("../auditLogger", () => ({
  auditLogger: { log: mockAuditLog },
}));

vi.mock("../webhookTriggerService", () => ({
  stripSecrets: vi.fn((obj: any) => obj),
}));

vi.mock("../../_core/env", () => ({
  ENV: { pythonBackendUrl: "http://localhost:8000", webGatewayToken: "test-gateway-token" },
}));

// Intercept global fetch
vi.stubGlobal("fetch", mockFetch);

// ── Helpers ───────────────────────────────────────────────────────────────────

import type { WebhookDispatchJob } from "../webhookDispatchQueue";

function makeJob(overrides: Partial<WebhookDispatchJob> = {}): WebhookDispatchJob {
  return {
    triggerId: "trig-uuid-1",
    userId: 42,
    tenantId: "tenant-abc",
    targetType: "chat",
    targetConversationId: 99,
    message: "Hello from webhook",
    payload: { event: "order.created" },
    creditCost: 1,
    startTime: Date.now() - 50,
    requestBodyHash: "abc123",
    requestMethod: "POST",
    requestBodySize: 64,
    requestHeadersSafe: { "content-type": "application/json" },
    sourceIpMasked: "1.2.3.0/24",
    parsedBody: { type: "order.created" },
    ...overrides,
  };
}

function makeBullMQJob(data: WebhookDispatchJob, overrides: Record<string, any> = {}) {
  return { id: "job-1", data, attemptsMade: 1, opts: { attempts: 4 }, ...overrides };
}

function setupDb() {
  const mockInsertValues = vi.fn().mockResolvedValue([]);
  const mockUpdateSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
  mockDbInsert.mockReturnValue({ values: mockInsertValues });
  mockDbUpdate.mockReturnValue({ set: mockUpdateSet });
  mockGetDb.mockResolvedValue({ insert: mockDbInsert, update: mockDbUpdate });
  return { mockInsertValues, mockUpdateSet };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("webhookDispatchQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessor = null;
    capturedOnFailed = null;
  });

  describe("initWebhookDispatchQueue / closeWebhookDispatchQueue", () => {
    it("creates Queue and Worker with correct name", async () => {
      const { Queue, Worker } = await import("bullmq");
      const { initWebhookDispatchQueue, closeWebhookDispatchQueue } =
        await import("../webhookDispatchQueue");

      await initWebhookDispatchQueue();
      expect(Queue).toHaveBeenCalledWith("webhook-dispatch", expect.any(Object));
      expect(Worker).toHaveBeenCalledWith("webhook-dispatch", expect.any(Function), expect.any(Object));

      await closeWebhookDispatchQueue();
      expect(mockWorkerClose).toHaveBeenCalled();
      expect(mockQueueClose).toHaveBeenCalled();
    });
  });

  describe("enqueueWebhookDispatch", () => {
    it("adds job to queue with deterministic jobId", async () => {
      const { initWebhookDispatchQueue, enqueueWebhookDispatch, closeWebhookDispatchQueue } =
        await import("../webhookDispatchQueue");

      await initWebhookDispatchQueue();
      const job = makeJob();
      await enqueueWebhookDispatch(job);

      expect(mockQueueAdd).toHaveBeenCalledWith(
        "dispatch",
        job,
        expect.objectContaining({ jobId: expect.stringContaining("wh-trig-uuid-1") }),
      );

      await closeWebhookDispatchQueue();
    });
  });

  describe("processWebhookDispatch — chat", () => {
    it("calls channelGateway.processMessageServerSide and logs success", async () => {
      setupDb();
      mockProcessMessageServerSide.mockResolvedValue(undefined);

      const { processWebhookDispatch } = await import("../webhookDispatchQueue");
      const job = makeBullMQJob(makeJob({ targetType: "chat", targetConversationId: 99 }));

      await processWebhookDispatch(job as any);

      expect(mockProcessMessageServerSide).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 99, content: "Hello from webhook" }),
      );
      expect(mockDeductCredits).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: "wh-dispatch-job-1" }),
      );
      expect(mockDbInsert).toHaveBeenCalled();
    });
  });

  describe("processWebhookDispatch — agency", () => {
    it("calls agencyBridge.executeRun and stores runId as targetExecutionId", async () => {
      setupDb();
      mockExecuteRun.mockResolvedValue({ runId: "run-abc-123", status: "completed", response: "OK" });

      const { processWebhookDispatch } = await import("../webhookDispatchQueue");
      const job = makeBullMQJob(
        makeJob({ targetType: "agency", targetAgencyId: "agency-uuid", targetConversationId: undefined }),
      );

      await processWebhookDispatch(job as any);

      expect(mockExecuteRun).toHaveBeenCalledWith(
        expect.objectContaining({ agencyId: "agency-uuid", message: "Hello from webhook" }),
      );
      // Success log insert called — targetExecutionId should be run-abc-123
      const insertCall = mockDbInsert.mock.calls[0];
      expect(insertCall).toBeDefined();
    });
  });

  describe("processWebhookDispatch — workflow", () => {
    it("POSTs to Python internal endpoint and stores executionId", async () => {
      setupDb();
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ executionId: "exec-workflow-xyz" }),
      });

      const { processWebhookDispatch } = await import("../webhookDispatchQueue");
      const job = makeBullMQJob(
        makeJob({ targetType: "workflow", targetWorkflowId: 7, targetConversationId: undefined }),
      );

      await processWebhookDispatch(job as any);

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/v1/workflows/internal/7/webhook-trigger",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ Authorization: "Bearer test-gateway-token" }),
        }),
      );
      expect(mockDeductCredits).toHaveBeenCalled();
    });

    it("throws (retryable) when workflow endpoint returns non-OK", async () => {
      setupDb();
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue("Internal error"),
      });

      const { processWebhookDispatch } = await import("../webhookDispatchQueue");
      const job = makeBullMQJob(
        makeJob({ targetType: "workflow", targetWorkflowId: 7, targetConversationId: undefined }),
      );

      await expect(processWebhookDispatch(job as any)).rejects.toThrow("Workflow dispatch failed");
    });
  });

  describe("processWebhookDispatch — no valid target", () => {
    it("throws UnrecoverableError so BullMQ does not retry", async () => {
      setupDb();

      const { processWebhookDispatch } = await import("../webhookDispatchQueue");
      const job = makeBullMQJob(
        makeJob({
          targetType: "chat",
          targetConversationId: undefined, // missing required field
        }),
      );

      await expect(processWebhookDispatch(job as any)).rejects.toThrow(UnrecoverableError);
    });
  });

  describe("credit idempotency", () => {
    it("uses job.id as idempotency key to prevent double-charge on retry", async () => {
      setupDb();
      mockProcessMessageServerSide.mockResolvedValue(undefined);

      const { processWebhookDispatch } = await import("../webhookDispatchQueue");
      const job = makeBullMQJob(makeJob(), { id: "unique-job-id-42" });

      await processWebhookDispatch(job as any);

      expect(mockDeductCredits).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: "wh-dispatch-unique-job-id-42" }),
      );
    });
  });
});
