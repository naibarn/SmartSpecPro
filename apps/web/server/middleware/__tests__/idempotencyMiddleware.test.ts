import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRedis = {
  set: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
};

vi.mock("../../services/redis", () => ({
  getRedisClient: () => mockRedis,
}));

import { idempotencyMiddleware } from "../idempotencyMiddleware";

function makeReqRes(overrides: Record<string, any> = {}) {
  const req: any = {
    method: "POST",
    headers: { "idempotency-key": "test-idem-key" },
    auth: { tenantId: "tenant-uuid" },
    ...overrides,
  };

  const _headers: Record<string, string> = {};
  const res: any = {
    statusCode: 200,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    setHeader: (k: string, v: string) => {
      _headers[k] = v;
    },
    getHeader: (k: string) => _headers[k],
  };

  const next = vi.fn();
  return { req, res, next };
}

describe("idempotencyMiddleware", () => {
  const mw = idempotencyMiddleware();

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.set.mockResolvedValue("OK");
    mockRedis.get.mockResolvedValue(null);
    mockRedis.del.mockResolvedValue(1);
  });

  it("skips GET requests", async () => {
    const { req, res, next } = makeReqRes({ method: "GET" });
    await mw(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it("skips when no Idempotency-Key header", async () => {
    const { req, res, next } = makeReqRes({ headers: {} });
    await mw(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("returns cached response on second call", async () => {
    mockRedis.get.mockResolvedValue(
      JSON.stringify({
        statusCode: 200,
        body: '{"ok":true}',
        contentType: "application/json",
      }),
    );

    const { req, res, next } = makeReqRes();
    await mw(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith('{"ok":true}');
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 409 when lock is already held", async () => {
    mockRedis.set.mockResolvedValue(null); // NX failed

    const { req, res, next } = makeReqRes();
    await mw(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: "idempotency_conflict" }),
      }),
    );
  });

  it("rejects key longer than 64 chars", async () => {
    const { req, res, next } = makeReqRes({
      headers: { "idempotency-key": "a".repeat(65) },
    });
    await mw(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("idempotency keys are tenant-scoped", async () => {
    const { req, res, next } = makeReqRes();
    await mw(req, res, next);

    expect(mockRedis.set).toHaveBeenCalledWith(
      expect.stringContaining("idempotency:lock:tenant-uuid:test-idem-key"),
      expect.any(String),
      "EX",
      60,
      "NX",
    );
  });
});
