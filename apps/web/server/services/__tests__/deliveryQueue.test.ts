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
  mockAdapterGet,
  mockAdapterSendMessage,
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
  mockAdapterGet: vi.fn(),
  mockAdapterSendMessage: vi
    .fn()
    .mockResolvedValue({ ok: true, externalMessageId: "456" }),
}));

vi.mock("../redisClients", () => ({
  getRealtimeClient: vi.fn(() => ({
    duplicate: vi.fn(() => ({})),
  })),
}));

vi.mock("../channelAdapters/registry", () => ({
  adapterRegistry: {
    get: mockAdapterGet,
  },
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
  channelMessages: { id: "cm.id", deliveryStatus: "cm.deliveryStatus", conversationChannelId: "cm.conversationChannelId" },
  systemSettings: { category: "ss.category" },
  conversationChannels: { id: "cc.id", state: "cc.state" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: any, val: any) => ({ _type: "eq", val })),
}));

import type { DeliveryJob } from "@shared/channelTypes";
import { processDeliveryJob } from "../deliveryQueue";

function makeJob(overrides: Partial<DeliveryJob> = {}): DeliveryJob {
  return {
    channelMessageId: "cm-1",
    chatId: "123",
    text: "<b>Hello</b>",
    parseMode: "HTML",
    channelType: "telegram",
    conversationId: "conv-1",
    tenantId: "tenant-1",
    ...overrides,
  };
}

function makeWorkerJob(data: DeliveryJob, attemptsMade = 0) {
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

  const telegramSettings = [
    { key: "enabled", value: "true" },
    { key: "bot_token", value: "enc_token" },
  ];

  // Branch by table argument: channelMessages vs systemSettings
  mockDbSelect.mockImplementation(() => ({
    from: vi.fn().mockImplementation((table: any) => {
      // channelMessages table
      if (table && table.id === "cm.id") {
        return {
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: "cm-1", deliveryStatus: "pending", conversationChannelId: null },
            ]),
          }),
        };
      }
      // systemSettings or anything else
      return {
        where: vi.fn().mockResolvedValue(telegramSettings),
      };
    }),
  }));

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
    // Default adapter mock: Telegram adapter with sendMessage
    mockAdapterGet.mockReturnValue({
      sendMessage: mockAdapterSendMessage,
    });
  });

  describe("processDeliveryJob (worker processor)", () => {
    it("sends message and updates status to sent", async () => {
      setupMockDb();
      const job = makeWorkerJob(makeJob());
      await processDeliveryJob(job);

      expect(mockAdapterSendMessage).toHaveBeenCalledWith(
        { botToken: "dec_token" },
        "123",
        "<b>Hello</b>",
        { parseMode: "HTML" },
      );

      expect(mockDbUpdate).toHaveBeenCalled();

    });

    it("classifies 403 (bot blocked) as permanent", async () => {
      setupMockDb();
      mockAdapterSendMessage.mockRejectedValueOnce(
        Object.assign(new Error("Forbidden: bot was blocked by the user"), {
          statusCode: 403,
          blocked: true,
        }),
      );

      const job = makeWorkerJob(makeJob());
      await expect(processDeliveryJob(job)).rejects.toThrow(
        "bot was blocked by the user",
      );

    });

    it("classifies chat not found as permanent", async () => {
      setupMockDb();
      mockAdapterSendMessage.mockRejectedValueOnce(
        Object.assign(new Error("Bad Request: chat not found"), {
          statusCode: 400,
        }),
      );

      const job = makeWorkerJob(makeJob());
      await expect(processDeliveryJob(job)).rejects.toThrow("chat not found");

    });

    it("re-throws transient errors for worker_jobs retry", async () => {
      setupMockDb();
      mockAdapterSendMessage.mockRejectedValueOnce(
        Object.assign(new Error("Internal Server Error"), {
          statusCode: 500,
        }),
      );

      const job = makeWorkerJob(makeJob());
      await expect(processDeliveryJob(job)).rejects.toThrow(
        "Internal Server Error",
      );

    });
  });

  describe("processDeliveryJob (no adapter)", () => {
    it("reports an unavailable adapter for channel type", async () => {
      setupMockDb();
      mockAdapterGet.mockReturnValue(undefined); // No adapter registered

      const job = makeWorkerJob(makeJob({ channelType: "whatsapp" }));
      await expect(processDeliveryJob(job)).rejects.toThrow(
        "No adapter for channel type: whatsapp",
      );

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

      expect(mockWorkerClose).toHaveBeenCalled();
      expect(mockQueueClose).toHaveBeenCalledTimes(2); // main + DLQ
    });
  });
});
