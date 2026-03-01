import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Hoisted mocks ---
const {
  mockAdapterGet,
  mockAdapterValidateWebhook,
  mockAdapterParseInbound,
  mockAdapterFormatMessage,
  mockRedisSet,
  mockChannelGatewayIngest,
  mockGetDb,
  mockDbSelect,
  mockAuditLog,
} = vi.hoisted(() => ({
  mockAdapterGet: vi.fn(),
  mockAdapterValidateWebhook: vi.fn().mockResolvedValue(true),
  mockAdapterParseInbound: vi.fn(),
  mockAdapterFormatMessage: vi.fn((text: string) => [text]),
  mockRedisSet: vi.fn().mockResolvedValue("OK"),
  mockChannelGatewayIngest: vi.fn().mockResolvedValue({ ok: true }),
  mockGetDb: vi.fn(),
  mockDbSelect: vi.fn(),
  mockAuditLog: vi.fn(),
}));

vi.mock("../../services/channelAdapters", () => ({
  adapterRegistry: {
    get: mockAdapterGet,
  },
}));

vi.mock("../../services/redisClients", () => ({
  getCacheClient: vi.fn(() => ({
    set: mockRedisSet,
  })),
}));

vi.mock("../../services/channelGateway", () => ({
  channelGateway: {
    ingest: mockChannelGatewayIngest,
  },
}));

vi.mock("../../services/auditLogger", () => ({
  auditLogger: {
    log: mockAuditLog,
  },
}));

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../../../drizzle/schema", () => ({
  channelConnections: {
    id: "cc.id",
    status: "cc.status",
    tenantId: "cc.tenantId",
    userId: "cc.userId",
    activeChannelId: "cc.activeChannelId",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: any, val: any) => ({ _type: "eq", val })),
}));

import { createChannelWebhookRouter } from "../channelWebhook";
import express from "express";
import request from "supertest";

function createMockAdapter(channelType = "telegram") {
  return {
    channelType,
    validateWebhook: mockAdapterValidateWebhook,
    parseInbound: mockAdapterParseInbound,
    formatMessage: mockAdapterFormatMessage,
  };
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/webhooks", createChannelWebhookRouter());
  return app;
}

function setupParsedInbound(update_id = 100) {
  mockAdapterParseInbound.mockResolvedValue({
    event: {
      eventType: "user_message",
      channel: {
        type: "telegram",
        connectionId: "conn-123",
        externalChatId: "12345",
        externalMessageId: "42",
      },
      message: { text: "Hello!", attachments: [] },
    },
    dedupKey: `tg:conn-123:${update_id}`,
  });
}

function setupDbConnection() {
  const limitFn = vi.fn().mockResolvedValue([
    {
      id: "conn-123",
      status: "active",
      tenantId: "tenant-1",
      userId: 42,
      activeChannelId: "ch-1",
    },
  ]);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  mockDbSelect.mockReturnValue({ from: fromFn });
  mockGetDb.mockResolvedValue({ select: mockDbSelect });
}

describe("channelWebhook router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 for unknown channelType", async () => {
    mockAdapterGet.mockReturnValue(undefined); // No adapter registered

    const app = makeApp();
    const res = await request(app)
      .post("/webhooks/unknown/conn-123")
      .send({ update_id: 1 });

    expect(res.status).toBe(404);
  });

  it("returns 403 when adapter.validateWebhook returns false", async () => {
    mockAdapterGet.mockReturnValue(createMockAdapter());
    mockAdapterValidateWebhook.mockResolvedValueOnce(false);

    const app = makeApp();
    const res = await request(app)
      .post("/webhooks/telegram/conn-123")
      .send({ update_id: 1 });

    expect(res.status).toBe(403);
  });

  it("returns 200 when message type is ignored (parseInbound returns null)", async () => {
    mockAdapterGet.mockReturnValue(createMockAdapter());
    mockAdapterValidateWebhook.mockResolvedValueOnce(true);
    mockAdapterParseInbound.mockResolvedValueOnce(null);

    const app = makeApp();
    const res = await request(app)
      .post("/webhooks/telegram/conn-123")
      .send({ update_id: 1 });

    expect(res.status).toBe(200);
    expect(mockRedisSet).not.toHaveBeenCalled();
  });

  it("routes to correct adapter based on channelType param", async () => {
    const adapter = createMockAdapter("telegram");
    mockAdapterGet.mockImplementation((type: string) =>
      type === "telegram" ? adapter : undefined,
    );
    mockAdapterValidateWebhook.mockResolvedValueOnce(true);
    setupParsedInbound();

    const app = makeApp();
    await request(app)
      .post("/webhooks/telegram/conn-123")
      .send({ update_id: 100 });

    expect(mockAdapterGet).toHaveBeenCalledWith("telegram");
    expect(mockAdapterValidateWebhook).toHaveBeenCalled();
    expect(mockAdapterParseInbound).toHaveBeenCalledWith(
      expect.any(Object),
      "conn-123",
    );
  });

  it("returns 200 immediately before async processing", async () => {
    mockAdapterGet.mockReturnValue(createMockAdapter());
    mockAdapterValidateWebhook.mockResolvedValueOnce(true);
    setupParsedInbound();
    setupDbConnection();

    let ingestCalled = false;
    let responseSent = false;

    mockChannelGatewayIngest.mockImplementation(async () => {
      ingestCalled = true;
      return { ok: true };
    });

    const app = makeApp();
    const res = await request(app)
      .post("/webhooks/telegram/conn-123")
      .send({ update_id: 100 });

    responseSent = true;
    expect(res.status).toBe(200);
    // Response sent before ingest is called
    expect(responseSent).toBe(true);
  });

  it("rejects duplicate updates via Redis NX dedup", async () => {
    mockAdapterGet.mockReturnValue(createMockAdapter());
    mockAdapterValidateWebhook.mockResolvedValue(true);
    setupParsedInbound(200);
    setupDbConnection();

    const app = makeApp();

    // First call: Redis returns "OK" (key set)
    mockRedisSet.mockResolvedValueOnce("OK");
    const res1 = await request(app)
      .post("/webhooks/telegram/conn-123")
      .send({ update_id: 200 });
    expect(res1.status).toBe(200);

    // Second call: Redis returns null (duplicate)
    mockRedisSet.mockResolvedValueOnce(null);
    const res2 = await request(app)
      .post("/webhooks/telegram/conn-123")
      .send({ update_id: 200 });
    expect(res2.status).toBe(200);

    // Redis set called for both
    expect(mockRedisSet).toHaveBeenCalledTimes(2);
  });

  it("uses correct dedup key format in Redis", async () => {
    mockAdapterGet.mockReturnValue(createMockAdapter());
    mockAdapterValidateWebhook.mockResolvedValueOnce(true);
    setupParsedInbound(99);

    const app = makeApp();
    await request(app)
      .post("/webhooks/telegram/conn-123")
      .send({ update_id: 99 });

    expect(mockRedisSet).toHaveBeenCalledWith(
      "channel:dedup:tg:conn-123:99",
      "1",
      "EX",
      86400,
      "NX",
    );
  });
});
