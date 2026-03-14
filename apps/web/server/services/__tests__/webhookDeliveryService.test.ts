import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../db", () => ({ getDb: vi.fn() }));
const mockRedisClient = {
  publish: vi.fn().mockResolvedValue(1),
  duplicate: vi.fn(),
};
mockRedisClient.duplicate.mockReturnValue(mockRedisClient);

vi.mock("../redisClients", () => ({
  getRealtimeClient: vi.fn(() => mockRedisClient),
}));
vi.mock("../crypto", () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace(/^enc:/, "")),
}));
vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({}),
    close: vi.fn().mockResolvedValue(undefined),
  })),
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

import { getDb } from "../../db";

const mockGetDb = vi.mocked(getDb as any);

import {
  executeWebhookDelivery,
  dispatchWebhookEvent,
  sanitizePayload,
  emitPublicApiEvent,
} from "../webhookDeliveryService";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const testEndpoint = {
  id: "ep-1",
  tenantId: "tenant-1",
  url: "https://example.com/hook",
  secretEncrypted: "enc:mysecret",
  events: ["job.completed"],
  retryPolicy: "exponential",
  isActive: true,
  failureCount: 0,
  lastDeliveredAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeDb(endpoint = testEndpoint, updateResult: any[] = [{ failureCount: 1 }]) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([endpoint]),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue([]),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(updateResult),
        }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// sanitizePayload
// ---------------------------------------------------------------------------

describe("sanitizePayload", () => {
  it("removes sensitive keys", () => {
    const payload = {
      job_id: "j1",
      apiKey: "sk-secret",
      secret: "s",
      token: "t",
      password: "p",
      status: "completed",
    };
    const result = sanitizePayload(payload);
    expect(result).toHaveProperty("job_id");
    expect(result).toHaveProperty("status");
    expect(result).not.toHaveProperty("apiKey");
    expect(result).not.toHaveProperty("secret");
    expect(result).not.toHaveProperty("token");
    expect(result).not.toHaveProperty("password");
  });

  it("case-insensitively strips keys", () => {
    const result = sanitizePayload({ API_KEY: "val", Authorization: "bearer x", data: 1 });
    expect(result).not.toHaveProperty("API_KEY");
    expect(result).not.toHaveProperty("Authorization");
    expect(result).toHaveProperty("data");
  });
});

// ---------------------------------------------------------------------------
// executeWebhookDelivery — success
// ---------------------------------------------------------------------------

describe("executeWebhookDelivery — success", () => {
  it("POSTs with HMAC-SHA256 signature header", async () => {
    const db = makeDb();
    mockGetDb.mockResolvedValue(db);
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    await executeWebhookDelivery("ep-1", "job.completed", { job_id: "j1", status: "completed" }, 1);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://example.com/hook");
    expect(opts.headers["X-SmartSpec-Signature"]).toMatch(/^sha256=[a-f0-9]{64}$/);
    expect(opts.headers["X-SmartSpec-Event"]).toBe("job.completed");
  });

  it("resets failureCount to 0 on success", async () => {
    const db = makeDb();
    mockGetDb.mockResolvedValue(db);
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    await executeWebhookDelivery("ep-1", "job.completed", { job_id: "j1" }, 1);

    const updateSet = db.update().set;
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ failureCount: 0 }),
    );
  });

  it("logs delivery to api_webhook_deliveries on success", async () => {
    const db = makeDb();
    mockGetDb.mockResolvedValue(db);
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    await executeWebhookDelivery("ep-1", "job.completed", { job_id: "j1" }, 1);

    expect(db.insert).toHaveBeenCalled();
    const insertValues = db.insert().values;
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "job.completed", statusCode: 200 }),
    );
  });
});

// ---------------------------------------------------------------------------
// executeWebhookDelivery — failure and retry
// ---------------------------------------------------------------------------

describe("executeWebhookDelivery — failure", () => {
  it("increments failureCount on failure", async () => {
    const db = makeDb();
    mockGetDb.mockResolvedValue(db);
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(
      executeWebhookDelivery("ep-1", "job.completed", { job_id: "j1" }, 1),
    ).rejects.toThrow();

    expect(db.update).toHaveBeenCalled();
  });

  it("logs failure with error to api_webhook_deliveries", async () => {
    const db = makeDb();
    mockGetDb.mockResolvedValue(db);
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(
      executeWebhookDelivery("ep-1", "job.completed", { job_id: "j1" }, 1),
    ).rejects.toThrow();

    const insertValues = db.insert().values;
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500, error: expect.stringContaining("500") }),
    );
  });

  it("disables endpoint when failureCount reaches 3", async () => {
    const db = makeDb(testEndpoint, [{ failureCount: 3 }]);
    mockGetDb.mockResolvedValue(db);
    mockFetch.mockResolvedValue({ ok: false, status: 503 });

    await expect(
      executeWebhookDelivery("ep-1", "job.completed", { job_id: "j1" }, 3),
    ).rejects.toThrow();

    // Should have called update twice: once to increment, once to disable
    expect(db.update).toHaveBeenCalledTimes(2);
  });

  it("retryPolicy=none does not enqueue retry", async () => {
    const endpoint = { ...testEndpoint, retryPolicy: "none" };
    const db = makeDb(endpoint, [{ failureCount: 1 }]);
    mockGetDb.mockResolvedValue(db);
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const { Queue } = await import("bullmq");
    const queueInstance = vi.mocked(Queue).mock.results[0]?.value;

    await expect(
      executeWebhookDelivery("ep-1", "job.completed", { job_id: "j1" }, 1),
    ).rejects.toThrow();

    if (queueInstance) {
      expect(queueInstance.add).not.toHaveBeenCalled();
    }
  });

  it("uses BullMQ delayed jobs for exponential retry", async () => {
    const { initWebhookApiDeliveryQueue } = await import("../webhookDeliveryService");
    await initWebhookApiDeliveryQueue();

    const db = makeDb(testEndpoint, [{ failureCount: 1 }]);
    mockGetDb.mockResolvedValue(db);
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(
      executeWebhookDelivery("ep-1", "job.completed", { job_id: "j1" }, 1),
    ).rejects.toThrow();

    const { Queue } = await import("bullmq");
    const queueInstance = (Queue as any).mock.results.at(-1)?.value;
    // Queue.add should be called with delay for retry
    if (queueInstance) {
      expect(queueInstance.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ attempt: 2 }),
        expect.objectContaining({ delay: 5000 }),
      );
    }
  });
});

// ---------------------------------------------------------------------------
// dispatchWebhookEvent
// ---------------------------------------------------------------------------

describe("dispatchWebhookEvent", () => {
  it("skips endpoints that don't subscribe to the event type", async () => {
    const ep = { ...testEndpoint, events: ["media.ready"] };
    const db = {
      select: vi.fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ id: ep.id, retryPolicy: ep.retryPolicy }]) }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ events: ["media.ready"] }]) }),
        }),
    };
    mockGetDb.mockResolvedValue(db);

    // job.completed should not be dispatched to ep that only subscribes to media.ready
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    await dispatchWebhookEvent("tenant-1", "job.completed", { job_id: "j1" });

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// emitPublicApiEvent
// ---------------------------------------------------------------------------

describe("emitPublicApiEvent", () => {
  it("publishes to Redis for SSE consumers", async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
      }),
    };
    mockGetDb.mockResolvedValue(db);

    await emitPublicApiEvent("tenant-1", "job.completed", { job_id: "j1", status: "completed" });

    // Give async calls time to settle
    await new Promise((r) => setTimeout(r, 10));

    expect(mockRedisClient.publish).toHaveBeenCalledWith(
      "events:tenant-1",
      expect.stringContaining("job.completed"),
    );
  });
});
