import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @sentry/node (v10 API uses getIsolationScope)
const mockSetTag = vi.fn();
vi.mock("@sentry/node", () => ({
  getIsolationScope: vi.fn(() => ({
    setTag: mockSetTag,
  })),
}));

import { correlationIdMiddleware } from "../middleware/correlationId";

/** UUID v4 regex pattern */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createMockReq(headers: Record<string, string> = {}): any {
  return {
    headers: { ...headers },
    requestId: undefined,
  };
}

function createMockRes(): any {
  const headersMap: Record<string, string> = {};
  return {
    setHeader: vi.fn((key: string, value: string) => {
      headersMap[key] = value;
    }),
    getHeader: (key: string) => headersMap[key],
    _headers: headersMap,
  };
}

describe("Correlation ID Middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate a UUID when no X-Request-ID header is present", () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    correlationIdMiddleware(req, res, next);

    expect(req.requestId).toBeDefined();
    expect(req.requestId).toMatch(UUID_PATTERN);
    expect(res.setHeader).toHaveBeenCalledWith("X-Request-ID", req.requestId);
    expect(next).toHaveBeenCalled();
  });

  it("should use incoming X-Request-ID header when present", () => {
    const req = createMockReq({ "x-request-id": "test-abc-123" });
    const res = createMockRes();
    const next = vi.fn();

    correlationIdMiddleware(req, res, next);

    expect(req.requestId).toBe("test-abc-123");
    expect(res.setHeader).toHaveBeenCalledWith("X-Request-ID", "test-abc-123");
    expect(next).toHaveBeenCalled();
  });

  it("should set X-Request-ID as a Sentry tag", () => {
    const req = createMockReq({ "x-request-id": "test-xyz-789" });
    const res = createMockRes();
    const next = vi.fn();

    correlationIdMiddleware(req, res, next);

    expect(mockSetTag).toHaveBeenCalledWith("request_id", "test-xyz-789");
  });

  it("should generate UUID when X-Request-ID header is empty string", () => {
    const req = createMockReq({ "x-request-id": "" });
    const res = createMockRes();
    const next = vi.fn();

    correlationIdMiddleware(req, res, next);

    expect(req.requestId).toMatch(UUID_PATTERN);
  });
});
