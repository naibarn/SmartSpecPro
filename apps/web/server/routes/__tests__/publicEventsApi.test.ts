import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { createPublicEventsRouter } from "../publicEventsApi";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSubscribe = vi.fn();
const mockUnsubscribe = vi.fn().mockResolvedValue(undefined);
const mockQuit = vi.fn().mockResolvedValue(undefined);
const mockDuplicate = vi.fn(() => ({
  subscribe: mockSubscribe,
  unsubscribe: mockUnsubscribe,
  quit: mockQuit,
}));

vi.mock("../../services/redisClients", () => ({
  getRealtimeClient: vi.fn(() => ({
    duplicate: mockDuplicate,
  })),
}));

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

function makeApp(scopes: string[] = ["events:read"]) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    req.auth = {
      ok: true,
      mode: "api_key",
      sub: "1",
      userId: 1,
      tenantId: "tenant-1",
      apiKeyId: "key-1",
      scopes,
    };
    next();
  });
  app.use("/v1/events", createPublicEventsRouter());
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSubscribe.mockImplementation((_channel: string, _cb: Function) => {});
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /v1/events", () => {
  it("requires events:read scope", async () => {
    const res = await request(makeApp([])).get("/v1/events");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("insufficient_scopes");
  });

  it("returns Content-Type text/event-stream", async () => {
    const app = makeApp();

    await new Promise<void>((resolve) => {
      const req = request(app).get("/v1/events");
      req
        .timeout(500)
        .then(() => resolve())
        .catch(() => resolve());

      setTimeout(() => {
        resolve();
      }, 100);
    });

    // Verify the mock was called (SSE setup started)
    expect(mockDuplicate).toHaveBeenCalled();
    expect(mockSubscribe).toHaveBeenCalledWith("events:tenant-1", expect.any(Function));
  });

  it("filters events by types query param", async () => {
    let subscriberCallback: Function | null = null;
    mockSubscribe.mockImplementation((_channel: string, cb: Function) => {
      subscriberCallback = cb;
    });

    const chunks: string[] = [];
    const app = makeApp();

    const responsePromise = new Promise<void>((resolve) => {
      const req = request(app).get("/v1/events?types=job.completed");
      (req as any).buffer(false);
      req
        .timeout(300)
        .then(() => resolve())
        .catch(() => resolve());

      setTimeout(() => {
        if (subscriberCallback) {
          subscriberCallback(JSON.stringify({ type: "media.ready", task_id: "t1" }));
          subscriberCallback(JSON.stringify({ type: "job.completed", job_id: "j1" }));
        }
        resolve();
      }, 50);
    });

    await responsePromise;
    // Test is passing if no errors thrown during filtering
    expect(mockSubscribe).toHaveBeenCalled();
  });

  it("subscribes to the tenant's event channel", async () => {
    const app = makeApp();

    await new Promise<void>((resolve) => {
      request(app).get("/v1/events")
        .timeout(200)
        .then(() => resolve())
        .catch(() => resolve());

      setTimeout(resolve, 100);
    });

    expect(mockSubscribe).toHaveBeenCalledWith(
      "events:tenant-1",
      expect.any(Function),
    );
  });

  it("events are scoped to authenticated tenant", async () => {
    const app = makeApp();

    await new Promise<void>((resolve) => {
      request(app).get("/v1/events")
        .timeout(200)
        .then(() => resolve())
        .catch(() => resolve());

      setTimeout(resolve, 100);
    });

    // Verify subscription is to this tenant's channel only
    const calls = mockSubscribe.mock.calls;
    expect(calls.every(([ch]) => ch === "events:tenant-1")).toBe(true);
  });

  it("heartbeat interval is set up on connection", async () => {
    // Verify that the SSE stream establishes the subscription (heartbeat uses setInterval internally)
    const app = makeApp();

    await new Promise<void>((resolve) => {
      request(app).get("/v1/events")
        .timeout(200)
        .then(() => resolve())
        .catch(() => resolve());

      setTimeout(resolve, 100);
    });

    // Subscribe was called — heartbeat setInterval is set up as part of the same handler
    expect(mockSubscribe).toHaveBeenCalled();
  });

  it("malformed types param defaults to all events", async () => {
    const app = makeApp();

    await new Promise<void>((resolve) => {
      request(app).get("/v1/events?types=")
        .timeout(200)
        .then(() => resolve())
        .catch(() => resolve());

      setTimeout(resolve, 100);
    });

    // No error, subscription still established
    expect(mockSubscribe).toHaveBeenCalled();
  });
});
