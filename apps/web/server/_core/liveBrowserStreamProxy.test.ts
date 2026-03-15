import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { EventEmitter } from "events";
import type { Request, Response } from "express";

const { mockAuthorizeRequest } = vi.hoisted(() => ({
  mockAuthorizeRequest: vi.fn(),
}));

vi.mock("./authz", () => ({
  authorizeRequest: mockAuthorizeRequest,
}));

import { registerLiveBrowserStreamRoutes } from "./liveBrowserStreamProxy";

function makeSSEStream(events: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(enc.encode(events));
      controller.close();
    },
  });
}

function getStreamRouteHandler() {
  const app = express();
  registerLiveBrowserStreamRoutes(app);
  const layer = (app as any)._router.stack.find(
    (entry: any) => entry.route?.path === "/api/live-browser/sessions/:sessionId/stream",
  );
  if (!layer) {
    throw new Error("Live browser stream route not registered");
  }
  return layer.route.stack[0].handle as (req: Request, res: Response) => Promise<void>;
}

function createMockRequest(input: {
  sessionId: string;
  lastEventId?: string;
  headers?: Record<string, string>;
}) {
  const req = new EventEmitter() as Request & EventEmitter;
  req.params = { sessionId: input.sessionId } as any;
  req.query = input.lastEventId ? { lastEventId: input.lastEventId } : {};
  req.headers = input.headers ?? {};
  return req;
}

function createMockResponse() {
  let resolveEnd: (() => void) | null = null;
  const done = new Promise<void>((resolve) => {
    resolveEnd = resolve;
  });
  const bodyChunks: string[] = [];
  const headers: Record<string, string> = {};

  const res = {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    writeHead(statusCode: number, nextHeaders: Record<string, string>) {
      this.statusCode = statusCode;
      this.headersSent = true;
      Object.assign(headers, nextHeaders);
      return this;
    },
    flushHeaders() {
      this.headersSent = true;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.headersSent = true;
      bodyChunks.push(JSON.stringify(payload));
      this.writableEnded = true;
      resolveEnd?.();
      return this;
    },
    write(chunk: Uint8Array | string) {
      bodyChunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
      return true;
    },
    end(chunk?: Uint8Array | string) {
      if (chunk) {
        bodyChunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
      }
      this.writableEnded = true;
      resolveEnd?.();
      return this;
    },
  } as unknown as Response;

  return {
    res,
    done,
    getBody: () => bodyChunks.join(""),
    getHeaders: () => headers,
  };
}

describe("liveBrowserStreamProxy", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthorizeRequest.mockResolvedValue({
      ok: true,
      mode: "session",
      sub: "42",
      user: { id: 42, currentTenantId: "tenant-123" },
      scopes: ["llm:chat"],
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("proxies live-browser SSE events unchanged", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        makeSSEStream(
          [
            "id: lbs_123abc:2:evt_2\n",
            "event: live_browser_event\n",
            'data: {"eventId":"evt_2","sessionId":"lbs_123abc","sessionVersion":2,"type":"command_queued","timestamp":"2026-03-13T01:00:00Z","payload":{},"cursor":"lbs_123abc:2:evt_2"}\n\n',
          ].join(""),
        ),
        {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        },
      ),
    );

    const handler = getStreamRouteHandler();
    const req = createMockRequest({
      sessionId: "lbs_123abc",
      lastEventId: "lbs_123abc:1:evt_1",
    });
    const response = createMockResponse();

    await handler(req, response.res);
    await response.done;

    expect(response.res.statusCode).toBe(200);
    expect(response.getHeaders()["Content-Type"]).toBe("text/event-stream; charset=utf-8");
    expect(response.getBody()).toContain("event: live_browser_event");
    expect(response.getBody()).toContain('"type":"command_queued"');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining(
          "/api/v1/live-browser/sessions/lbs_123abc/stream?tenantId=tenant-123&userId=42&actorType=user&actorId=42&lastEventId=lbs_123abc%3A1%3Aevt_1",
        ),
      }),
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Accept: "text/event-stream",
        }),
      }),
    );
  });

  it("rejects malformed session ids before proxying upstream", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    const handler = getStreamRouteHandler();
    const req = createMockRequest({ sessionId: "bad!" });
    const response = createMockResponse();

    await handler(req, response.res);
    await response.done;

    expect(response.res.statusCode).toBe(400);
    expect(response.getBody()).toBe(JSON.stringify({ error: "Invalid sessionId format" }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("requires tenant context before opening the upstream stream", async () => {
    mockAuthorizeRequest.mockResolvedValueOnce({
      ok: true,
      mode: "session",
      sub: "42",
      user: { id: 42, currentTenantId: null },
      scopes: ["llm:chat"],
    });
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    const handler = getStreamRouteHandler();
    const req = createMockRequest({ sessionId: "lbs_123abc" });
    const response = createMockResponse();

    await handler(req, response.res);
    await response.done;

    expect(response.res.statusCode).toBe(403);
    expect(response.getBody()).toBe(JSON.stringify({ error: "Missing tenant context" }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses the bearer tenant header when proxying non-session streams", async () => {
    mockAuthorizeRequest.mockResolvedValueOnce({
      ok: true,
      mode: "bearer",
      sub: "42",
      scopes: ["llm:chat"],
    });
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(makeSSEStream("event: live_browser_event\ndata: {}\n\n"), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );

    const handler = getStreamRouteHandler();
    const req = createMockRequest({
      sessionId: "lbs_123abc",
      headers: { "x-tenant-id": "tenant-bearer" },
    });
    const response = createMockResponse();

    await handler(req, response.res);
    await response.done;

    expect(response.res.statusCode).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining("tenantId=tenant-bearer"),
      }),
      expect.any(Object),
    );
  });
});
