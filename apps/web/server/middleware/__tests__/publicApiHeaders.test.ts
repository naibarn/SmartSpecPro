import { describe, it, expect, vi } from "vitest";
import {
  publicApiHeadersMiddleware,
  formatApiError,
  sendApiError,
} from "../publicApiHeaders";

describe("publicApiHeadersMiddleware", () => {
  it("sets X-Request-Id from req.requestId", () => {
    const headers: Record<string, string> = {};
    const req: any = { requestId: "trace-abc-123" };
    const res: any = {
      setHeader: (k: string, v: string) => {
        headers[k] = v;
      },
    };
    const next = vi.fn();

    publicApiHeadersMiddleware(req, res, next);

    expect(headers["X-Request-Id"]).toBe("trace-abc-123");
    expect(next).toHaveBeenCalled();
  });

  it("skips X-Request-Id when requestId is absent", () => {
    const headers: Record<string, string> = {};
    const req: any = {};
    const res: any = {
      setHeader: (k: string, v: string) => {
        headers[k] = v;
      },
    };
    const next = vi.fn();

    publicApiHeadersMiddleware(req, res, next);

    expect(headers["X-Request-Id"]).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });
});

describe("formatApiError", () => {
  it("formats auth error correctly", () => {
    const result = formatApiError("invalid_api_key", "Bad key");
    expect(result).toEqual({
      error: {
        code: "invalid_api_key",
        message: "Bad key",
        type: "auth_error",
      },
    });
  });

  it("formats billing error correctly", () => {
    const result = formatApiError(
      "insufficient_credits",
      "Not enough credits",
    );
    expect(result.error.type).toBe("billing_error");
  });

  it("formats rate limit error correctly", () => {
    const result = formatApiError("rate_limit_exceeded", "Too fast");
    expect(result.error.type).toBe("rate_limit_error");
  });

  it("formats feature disabled error correctly", () => {
    const result = formatApiError("feature_disabled", "API disabled");
    expect(result.error.type).toBe("auth_error");
  });

  it("falls back to internal_error for unknown codes", () => {
    const result = formatApiError("unknown_code", "Something");
    expect(result.error.type).toBe("internal_error");
  });

  it("allows explicit type override", () => {
    const result = formatApiError("invalid_api_key", "Bad key", "custom_type");
    expect(result.error.type).toBe("custom_type");
  });
});

describe("sendApiError", () => {
  it("sets status and sends formatted error", () => {
    const headers: Record<string, string> = {};
    const res: any = {
      setHeader: vi.fn((key: string, value: string) => {
        headers[key] = value;
      }),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    sendApiError(res, 401, "invalid_api_key", "Bad key");

    expect(headers["X-Api-Error-Code"]).toBe("invalid_api_key");
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: "invalid_api_key" }),
      }),
    );
  });
});
