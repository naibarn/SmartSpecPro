import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import http from "http";

// Hoisted mocks — available before module evaluation
const {
  mockGetFeatureFlag,
  mockHasEnoughCredits,
  mockAuthorizeRequest,
  mockSignBearerToken,
  mockDebugError,
  mockGetDb,
  mockEq,
  mockAnd,
} = vi.hoisted(() => ({
  mockGetFeatureFlag: vi.fn(),
  mockHasEnoughCredits: vi.fn(),
  mockAuthorizeRequest: vi.fn(),
  mockSignBearerToken: vi.fn().mockReturnValue("mock-jwt-token"),
  mockDebugError: vi.fn(),
  mockGetDb: vi.fn(),
  mockEq: vi.fn(),
  mockAnd: vi.fn(),
}));

vi.mock("../services/featureFlags", () => ({
  getFeatureFlag: mockGetFeatureFlag,
}));
vi.mock("../services/creditService", () => ({
  hasEnoughCredits: mockHasEnoughCredits,
}));
vi.mock("./authz", () => ({
  authorizeRequest: mockAuthorizeRequest,
}));
vi.mock("./tokens", () => ({
  signBearerToken: mockSignBearerToken,
}));
vi.mock("./logger", () => ({
  debugError: mockDebugError,
}));
vi.mock("../db", () => ({
  getDb: mockGetDb,
}));
vi.mock("../../drizzle/schema", () => ({
  agencies: {
    id: "agencies.id",
    tenantId: "agencies.tenantId",
  },
  users: {
    id: "users.id",
    currentTenantId: "users.currentTenantId",
  },
  conversations: {
    id: "conversations.id",
    personaId: "conversations.personaId",
    tenantId: "conversations.tenantId",
  },
}));
vi.mock("drizzle-orm", () => ({
  eq: mockEq,
  and: mockAnd,
}));

import {
  registerAgencyStreamRoutes,
  HEARTBEAT_INTERVAL_MS,
} from "./agencyStreamProxy";
import express from "express";

/** Make HTTP request using Node http module (unaffected by globalThis.fetch mock) */
function httpRequest(
  base: string,
  path: string,
  body: object,
): Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, base);
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body,
          }),
        );
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function startServer(app: express.Express) {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return { server, base: `http://127.0.0.1:${port}` };
}

function makeSSEStream(events: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(enc.encode(events));
      controller.close();
    },
  });
}

function makeSelectResult(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  return { from };
}

function makeOwnershipDb() {
  return {
    select: vi.fn((projection: Record<string, unknown>) => {
      const keys = Object.keys(projection || {});
      if (keys.includes("tenantId") && !keys.includes("personaId")) {
        return makeSelectResult([{ tenantId: "tenant-1" }]);
      }
      if (keys.includes("id")) {
        return makeSelectResult([{ id: "ag-1" }]);
      }
      if (keys.includes("personaId")) {
        return makeSelectResult([]);
      }
      return makeSelectResult([]);
    }),
  };
}

// Retired execution path: the stream proxy now returns 410 before credits or
// upstream calls. Historical behavior is retained only as migration evidence.
describe.skip("agencyStreamProxy (retired execution path)", () => {
  const originalFetch = globalThis.fetch;
  const requestBody = {
    agencyId: "ag-1",
    conversationId: "conv-1",
    message: "hello",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockAuthorizeRequest.mockResolvedValue({
      ok: true,
      mode: "session",
      sub: "42",
      user: { id: 42 },
      scopes: ["llm:chat"],
    });
    mockGetFeatureFlag.mockResolvedValue(true);
    mockHasEnoughCredits.mockResolvedValue(true);
    mockGetDb.mockResolvedValue(makeOwnershipDb());
    mockEq.mockImplementation((left: unknown, right: unknown) => ({
      op: "eq",
      left,
      right,
    }));
    mockAnd.mockImplementation((...conditions: unknown[]) => ({
      op: "and",
      conditions,
    }));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function createApp() {
    const app = express();
    app.use(express.json());
    registerAgencyStreamRoutes(app);
    return app;
  }

  it("sets correct SSE headers (Content-Type, Cache-Control, X-Accel-Buffering)", async () => {
    const sseBody = `event: run_started\ndata: {"run_id":"r1"}\n\n`;
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(makeSSEStream(sseBody), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );

    const app = createApp();
    const { server, base } = await startServer(app);

    try {
      const res = await httpRequest(base, "/api/v1/agency/stream", requestBody);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe(
        "text/event-stream; charset=utf-8",
      );
      expect(res.headers["cache-control"]).toBe("no-cache, no-transform");
      expect(res.headers["x-accel-buffering"]).toBe("no");
    } finally {
      server.close();
    }
  });

  it("proxies SSE events from Python to client unchanged", async () => {
    const sseBody = `event: token\ndata: {"content":"hello"}\n\nevent: run_finished\ndata: {"run_id":"abc"}\n\n`;
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(makeSSEStream(sseBody), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );

    const app = createApp();
    const { server, base } = await startServer(app);

    try {
      const res = await httpRequest(base, "/api/v1/agency/stream", requestBody);
      expect(res.body).toContain(
        `event: token\ndata: {"content":"hello"}\n\n`,
      );
      expect(res.body).toContain(
        `event: run_finished\ndata: {"run_id":"abc"}\n\n`,
      );
    } finally {
      server.close();
    }
  });

  it("forwards compilePreview payload to the upstream stream runtime", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(makeSSEStream(`event: run_finished\ndata: {"run_id":"abc"}\n\n`), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );

    const app = createApp();
    const { server, base } = await startServer(app);

    try {
      await httpRequest(base, "/api/v1/agency/stream", {
        ...requestBody,
        compilePreview: {
          planSummary: {
            engineMix: ["agency_swarm", "adk2"],
            subgraphCount: 2,
            bridgeCount: 1,
            usesHybrid: true,
            errorCount: 0,
          },
        },
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/agencies/ag-1/stream"),
        expect.objectContaining({
          body: expect.stringContaining("\"compile_preview\":{\"planSummary\":{\"engineMix\":[\"agency_swarm\",\"adk2\"]"),
        }),
      );
    } finally {
      server.close();
    }
  });

  it("passes preview_ready events through without altering legacy events", async () => {
    const sseBody = [
      `event: token\ndata: {"content":"hello"}\n\n`,
      `event: preview_ready\ndata: {"run_id":"abc","preview_artifact_ids":["artifact-1"],"intent":"research_report","summary":"Preview ready"}\n\n`,
      `event: run_finished\ndata: {"run_id":"abc"}\n\n`,
    ].join("");

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(makeSSEStream(sseBody), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );

    const app = createApp();
    const { server, base } = await startServer(app);

    try {
      const res = await httpRequest(base, "/api/v1/agency/stream", requestBody);
      expect(res.body).toContain(`event: token\ndata: {"content":"hello"}\n\n`);
      expect(res.body).toContain(`event: preview_ready\ndata: {"run_id":"abc","preview_artifact_ids":["artifact-1"],"intent":"research_report","summary":"Preview ready"}\n\n`);
      expect(res.body).toContain(`event: run_finished\ndata: {"run_id":"abc"}\n\n`);
    } finally {
      server.close();
    }
  });

  it("checks feature flag — returns 404 when disabled", async () => {
    mockGetFeatureFlag.mockResolvedValue(false);
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    const app = createApp();
    const { server, base } = await startServer(app);

    try {
      const res = await httpRequest(base, "/api/v1/agency/stream", requestBody);
      expect(res.status).toBe(404);
      expect(JSON.parse(res.body)).toEqual({
        error: "Agency feature not enabled",
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      server.close();
    }
  });

  it("checks credits — returns 402 when insufficient", async () => {
    mockHasEnoughCredits.mockResolvedValue(false);
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    const app = createApp();
    const { server, base } = await startServer(app);

    try {
      const res = await httpRequest(base, "/api/v1/agency/stream", requestBody);
      expect(res.status).toBe(402);
      expect(JSON.parse(res.body)).toEqual({ error: "Insufficient credits" });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      server.close();
    }
  });

  it("handles Python connection drop gracefully", async () => {
    const enc = new TextEncoder();
    const errorStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(
          enc.encode(`event: token\ndata: {"content":"hi"}\n\n`),
        );
        await new Promise((r) => setTimeout(r, 10));
        controller.error(new Error("Connection reset"));
      },
    });

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(errorStream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );

    const app = createApp();
    const { server, base } = await startServer(app);

    try {
      const res = await httpRequest(base, "/api/v1/agency/stream", requestBody);
      expect(res.body).toContain(`event: token\ndata: {"content":"hi"}\n\n`);
      expect(res.body).toContain(`event: error\n`);
      expect(res.body).toContain(`"message":"Upstream connection lost"`);
    } finally {
      server.close();
    }
  });

  it("sends heartbeat keepalive on interval", async () => {
    const writes: string[] = [];
    let heartbeatCallback: (() => void) | undefined;
    let closeHandler: (() => void) | undefined;
    const setIntervalSpy = vi
      .spyOn(globalThis, "setInterval")
      .mockImplementation(((callback: TimerHandler) => {
        heartbeatCallback = callback as () => void;
        return 1 as unknown as ReturnType<typeof setInterval>;
      }) as typeof setInterval);
    const clearIntervalSpy = vi
      .spyOn(globalThis, "clearInterval")
      .mockImplementation(() => undefined);

    // We'll test the heartbeat at a lower level using mock req/res
    const mockReq: any = {
      body: {
        agencyId: "ag-1",
        conversationId: "conv-1",
        message: "hello",
      },
      headers: {},
      on: vi.fn((event: string, handler: () => void) => {
        if (event === "close") {
          closeHandler = handler;
        }
      }),
    };

    const mockRes: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      writeHead: vi.fn(),
      flushHeaders: vi.fn(),
      write: vi.fn((data: any) => {
        const str =
          typeof data === "string"
            ? data
            : new TextDecoder().decode(data);
        writes.push(str);
        return true;
      }),
      end: vi.fn(() => {
        mockRes.writableEnded = true;
      }),
      headersSent: false,
      writableEnded: false,
    };

    // Create a long-running stream that we can control
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const longStream = new ReadableStream<Uint8Array>({
      start(ctrl) {
        streamController = ctrl;
      },
    });

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(longStream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );

    // Build a minimal Express app and extract the handler
    const app = createApp();
    const layers = (app as any)._router.stack;
    const routeLayer = layers.find(
      (l: any) => l.route?.path === "/api/v1/agency/stream",
    );
    const handler = routeLayer.route.stack[0].handle;

    // Invoke handler directly
    const handlerPromise = handler(mockReq, mockRes);

    await vi.waitFor(() =>
      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        HEARTBEAT_INTERVAL_MS,
      ),
    );

    heartbeatCallback?.();
    heartbeatCallback?.();

    const keepalives = writes.filter((w) => w === ": keepalive\n\n");
    expect(keepalives.length).toBe(2);

    streamController.close();
    closeHandler?.();
    await handlerPromise;

    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it("returns 401 when no auth provided", async () => {
    mockAuthorizeRequest.mockResolvedValue({
      ok: false,
      error: "Unauthorized",
    });

    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    const app = createApp();
    const { server, base } = await startServer(app);

    try {
      const res = await httpRequest(base, "/api/v1/agency/stream", requestBody);
      expect(res.status).toBe(401);
      expect(JSON.parse(res.body)).toEqual({ error: "Unauthorized" });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      server.close();
    }
  });

  it("rejects invalid agencyId format (SSRF prevention)", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    const app = createApp();
    const { server, base } = await startServer(app);

    try {
      const res = await httpRequest(base, "/api/v1/agency/stream", {
        agencyId: "../../admin/delete",
        conversationId: "conv-1",
        message: "hello",
      });
      expect(res.status).toBe(400);
      expect(JSON.parse(res.body)).toEqual({
        error: "Invalid agencyId format",
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      server.close();
    }
  });

  it("returns proper HTTP error when upstream rejects before streaming", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "forbidden" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    );

    const app = createApp();
    const { server, base } = await startServer(app);

    try {
      const res = await httpRequest(base, "/api/v1/agency/stream", requestBody);
      // With deferred writeHead, upstream 403 returns as HTTP 403
      expect(res.status).toBe(403);
      expect(JSON.parse(res.body)).toEqual({
        error: "Upstream error: 403",
      });
    } finally {
      server.close();
    }
  });

  it("enforces per-user concurrent stream limit", async () => {
    // Create a never-ending stream for each connection
    function makeLongStream() {
      return new ReadableStream<Uint8Array>({
        start() {
          // Never closes — simulates long-running stream
        },
      });
    }

    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(makeLongStream(), {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    );

    const app = createApp();
    const { server, base } = await startServer(app);

    try {
      // Open 3 streams (the limit)
      const streams = await Promise.all(
        Array.from({ length: 3 }, () =>
          new Promise<http.IncomingMessage>((resolve) => {
            const url = new URL("/api/v1/agency/stream", base);
            const data = JSON.stringify(requestBody);
            const req = http.request(
              {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Content-Length": Buffer.byteLength(data),
                },
              },
              resolve,
            );
            req.write(data);
            req.end();
          }),
        ),
      );

      // Wait for all to get 200
      await new Promise((r) => setTimeout(r, 100));

      // 4th stream should be rejected with 429
      const res = await httpRequest(base, "/api/v1/agency/stream", requestBody);
      expect(res.status).toBe(429);
      expect(JSON.parse(res.body)).toEqual({
        error: "Too many concurrent streams",
      });

      // Clean up streams
      for (const s of streams) s.destroy();
    } finally {
      server.close();
    }
  });
});
