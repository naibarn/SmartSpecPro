import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Hoisted mocks ---
const {
  mockQueueAdd,
  mockQueueClose,
  mockWorkerClose,
  mockWorkerOn,
  mockSendTelegramMessage,
  mockDecrypt,
  mockGetDb,
  mockDbUpdate,
  mockDbSelect,
} = vi.hoisted(() => ({
  mockQueueAdd: vi.fn().mockResolvedValue(undefined),
  mockQueueClose: vi.fn().mockResolvedValue(undefined),
  mockWorkerClose: vi.fn().mockResolvedValue(undefined),
  mockWorkerOn: vi.fn(),
  mockSendTelegramMessage: vi
    .fn()
    .mockResolvedValue({ ok: true, messageId: 456 }),
  mockDecrypt: vi.fn((v: string) => v.replace("enc_", "dec_")),
  mockGetDb: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbSelect: vi.fn(),
}));

let capturedProcessor: any = null;

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: mockQueueAdd,
    close: mockQueueClose,
  })),
  Worker: vi.fn().mockImplementation((_name: any, processor: any) => {
    capturedProcessor = processor;
    return {
      on: mockWorkerOn,
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
  getRealtimeClient: vi.fn(() => ({
    duplicate: vi.fn(() => ({})),
  })),
}));

vi.mock("../telegramService", () => ({
  sendTelegramMessage: mockSendTelegramMessage,
}));

vi.mock("../crypto", () => ({
  decrypt: mockDecrypt,
}));

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../../../drizzle/schema", () => ({
  channelMessages: { id: "cm.id" },
  systemSettings: { category: "ss.category" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: any, val: any) => ({ _type: "eq", val })),
}));

import type { DeliveryJob } from "@shared/channelTypes";
import { UnrecoverableError } from "bullmq";

function makeJob(overrides: Partial<DeliveryJob> = {}): DeliveryJob {
  return {
    channelMessageId: "cm-1",
    chatId: "123",
    text: "<b>Hello</b>",
    parseMode: "HTML",
    conversationId: "conv-1",
    tenantId: "tenant-1",
    ...overrides,
  };
}

function makeBullMQJob(data: DeliveryJob, attemptsMade = 0) {
  return {
    data,
    attemptsMade,
    opts: { attempts: 5 },
    id: `tg-deliver-${data.channelMessageId}`,
  } as any;
}

function setupMockDb() {
  const setFn = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  });
  mockDbUpdate.mockReturnValue({ set: setFn });

  const settings = [
    { key: "enabled", value: "true" },
    { key: "bot_token", value: "enc_token" },
  ];
  const fromFn = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(settings),
  });
  mockDbSelect.mockReturnValue({ from: fromFn });

  const db = {
    update: mockDbUpdate,
    select: mockDbSelect,
  };
  mockGetDb.mockResolvedValue(db);
  return db;
}

describe("deliveryQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProcessor = null;
  });

  describe("initDeliveryQueue", () => {
    it("creates Queue and Worker with correct config", async () => {
      const { initDeliveryQueue, closeDeliveryQueue } = await import(
        "../deliveryQueue"
      );
      const { Queue, Worker } = await import("bullmq");

      await initDeliveryQueue();

      expect(Queue).toHaveBeenCalledTimes(2); // main queue + DLQ
      expect(Worker).toHaveBeenCalledTimes(1);

      // Worker should have concurrency and limiter
      const workerCall = (Worker as any).mock.calls[0];
      expect(workerCall[0]).toBe("telegram-delivery");
      expect(workerCall[2]).toMatchObject({
        concurrency: 10,
        limiter: { max: 25, duration: 1000 },
      });

      await closeDeliveryQueue();
    });
  });

  describe("enqueueDelivery", () => {
    it("adds job to queue with deterministic jobId", async () => {
      const { initDeliveryQueue, enqueueDelivery, closeDeliveryQueue } =
        await import("../deliveryQueue");

      await initDeliveryQueue();

      const job = makeJob();
      await enqueueDelivery(job);

      expect(mockQueueAdd).toHaveBeenCalledWith("deliver", job, {
        jobId: "tg-deliver-cm-1",
      });

      await closeDeliveryQueue();
    });

    it("skips when queue not initialized", async () => {
      // Fresh import to get un-initialized state
      vi.resetModules();
      const { enqueueDelivery } = await import("../deliveryQueue");

      await enqueueDelivery(makeJob());

      expect(mockQueueAdd).not.toHaveBeenCalled();
    });
  });

  describe("processDeliveryJob (worker processor)", () => {
    it("sends message and updates status to sent", async () => {
      setupMockDb();
      const { initDeliveryQueue, closeDeliveryQueue } = await import(
        "../deliveryQueue"
      );

      await initDeliveryQueue();
      expect(capturedProcessor).toBeTruthy();

      const job = makeBullMQJob(makeJob());
      await capturedProcessor(job);

      expect(mockSendTelegramMessage).toHaveBeenCalledWith(
        "dec_token",
        "123",
        "<b>Hello</b>",
        "HTML",
      );

      expect(mockDbUpdate).toHaveBeenCalled();

      await closeDeliveryQueue();
    });

    it("throws UnrecoverableError for 403 (bot blocked)", async () => {
      setupMockDb();
      mockSendTelegramMessage.mockRejectedValueOnce(
        Object.assign(new Error("Forbidden: bot was blocked by the user"), {
          statusCode: 403,
          blocked: true,
        }),
      );

      const { initDeliveryQueue, closeDeliveryQueue } = await import(
        "../deliveryQueue"
      );
      await initDeliveryQueue();

      const job = makeBullMQJob(makeJob());
      await expect(capturedProcessor(job)).rejects.toThrow(
        "bot was blocked by the user",
      );

      await closeDeliveryQueue();
    });

    it("throws UnrecoverableError for chat not found", async () => {
      setupMockDb();
      mockSendTelegramMessage.mockRejectedValueOnce(
        Object.assign(new Error("Bad Request: chat not found"), {
          statusCode: 400,
        }),
      );

      const { initDeliveryQueue, closeDeliveryQueue } = await import(
        "../deliveryQueue"
      );
      await initDeliveryQueue();

      const job = makeBullMQJob(makeJob());
      await expect(capturedProcessor(job)).rejects.toThrow("chat not found");

      await closeDeliveryQueue();
    });

    it("re-throws transient errors for BullMQ retry", async () => {
      setupMockDb();
      mockSendTelegramMessage.mockRejectedValueOnce(
        Object.assign(new Error("Internal Server Error"), {
          statusCode: 500,
        }),
      );

      const { initDeliveryQueue, closeDeliveryQueue } = await import(
        "../deliveryQueue"
      );
      await initDeliveryQueue();

      const job = makeBullMQJob(makeJob());
      await expect(capturedProcessor(job)).rejects.toThrow(
        "Internal Server Error",
      );

      await closeDeliveryQueue();
    });
  });

  describe("isPermanentError", () => {
    it("detects 403 status code", async () => {
      const { _isPermanentError } = await import("../deliveryQueue");

      expect(_isPermanentError({ statusCode: 403 })).toBe(true);
      expect(_isPermanentError({ statusCode: 500 })).toBe(false);
    });

    it("detects blocked flag", async () => {
      const { _isPermanentError } = await import("../deliveryQueue");

      expect(_isPermanentError({ blocked: true })).toBe(true);
    });

    it("detects error message patterns", async () => {
      const { _isPermanentError } = await import("../deliveryQueue");

      expect(
        _isPermanentError({ message: "Bot was blocked by the user" }),
      ).toBe(true);
      expect(_isPermanentError({ message: "chat not found" })).toBe(true);
      expect(_isPermanentError({ message: "Forbidden" })).toBe(true);
      expect(_isPermanentError({ message: "timeout" })).toBe(false);
    });
  });

  describe("closeDeliveryQueue", () => {
    it("closes worker and queue", async () => {
      const { initDeliveryQueue, closeDeliveryQueue } = await import(
        "../deliveryQueue"
      );

      await initDeliveryQueue();
      await closeDeliveryQueue();

      expect(mockWorkerClose).toHaveBeenCalled();
      expect(mockQueueClose).toHaveBeenCalledTimes(2); // main + DLQ
    });
  });
});
