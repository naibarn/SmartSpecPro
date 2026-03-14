import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db", () => {
  const values = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn().mockReturnValue({ values });
  return { db: { insert, __mockValues: values } };
});

vi.mock("../../../drizzle/schema", () => ({
  publicApiAuditLog: { _: "publicApiAuditLog" },
}));

import { apiAuditMiddleware } from "../apiAuditMiddleware";
import { db } from "../../db";

const mockInsert = db.insert as any;
const mockValues = (db as any).__mockValues;

function makeReqRes() {
  const req: any = {
    auth: {
      ok: true,
      mode: "api_key",
      tenantId: "tenant-uuid",
      userId: 42,
      apiKeyId: "key-uuid",
      sub: "42",
      scopes: ["skills:list"],
    },
    method: "POST",
    path: "/v1/skills/abc/execute",
    query: { stream: "true" },
    ip: "1.2.3.4",
    headers: {
      "content-length": "100",
      authorization: "Bearer sk-ssp_abc12345_secretKey",
      "user-agent": "TestAgent/1.0",
    },
    requestId: "trace-123",
  };

  const finishCallbacks: (() => void)[] = [];
  const res: any = {
    statusCode: 200,
    on: (event: string, cb: () => void) => {
      if (event === "finish") finishCallbacks.push(cb);
    },
    getHeader: (name: string) => {
      if (name === "X-Credits-Used") return "5";
      return undefined;
    },
    _triggerFinish: () => finishCallbacks.forEach((cb) => cb()),
  };

  const next = vi.fn();
  return { req, res, next };
}

describe("apiAuditMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates audit record for API key request", () => {
    const { req, res, next } = makeReqRes();
    apiAuditMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();

    // Trigger finish
    res._triggerFinish();

    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-uuid",
        userId: 42,
        apiKeyId: "key-uuid",
        method: "POST",
        path: "/v1/skills/abc/execute",
      }),
    );
  });

  it("captures statusCode, creditsUsed, latencyMs", () => {
    const { req, res, next } = makeReqRes();
    apiAuditMiddleware(req, res, next);
    res._triggerFinish();

    const insertArg = mockValues.mock.calls[0][0];
    expect(insertArg.statusCode).toBe(200);
    expect(insertArg.creditsUsed).toBe(5);
    expect(insertArg.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("sanitizes Authorization header in requestMeta", () => {
    const { req, res, next } = makeReqRes();
    apiAuditMiddleware(req, res, next);
    res._triggerFinish();

    const insertArg = mockValues.mock.calls[0][0];
    expect(insertArg.requestMeta.authorization).toBe("Bearer [REDACTED]");
  });

  it("skips for session auth", () => {
    const { req, res, next } = makeReqRes();
    req.auth.mode = "session";
    apiAuditMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("is non-blocking on insert failure", () => {
    mockValues.mockRejectedValueOnce(new Error("DB error"));
    const { req, res, next } = makeReqRes();
    apiAuditMiddleware(req, res, next);
    res._triggerFinish();

    // Should not throw
    expect(next).toHaveBeenCalled();
  });
});
