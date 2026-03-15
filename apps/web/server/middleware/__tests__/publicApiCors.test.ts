import { describe, it, expect, vi } from "vitest";
import { publicApiCorsMiddleware } from "../publicApiCors";

function makeReqRes(method = "GET") {
  const headers: Record<string, string> = {};
  const req: any = { method };
  const res: any = {
    setHeader: (k: string, v: string) => {
      headers[k] = v;
    },
    status: vi.fn().mockReturnThis(),
    end: vi.fn(),
    _headers: headers,
  };
  const next = vi.fn();
  return { req, res, next, headers };
}

describe("publicApiCors", () => {
  it("sets CORS headers on normal request", () => {
    const { req, res, next, headers } = makeReqRes("GET");
    publicApiCorsMiddleware(req, res, next);

    expect(headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(headers["Access-Control-Allow-Methods"]).toContain("GET");
    expect(headers["Access-Control-Allow-Methods"]).toContain("POST");
    expect(headers["Access-Control-Allow-Headers"]).toContain("Authorization");
    expect(headers["Access-Control-Allow-Headers"]).toContain("Idempotency-Key");
    expect(next).toHaveBeenCalled();
  });

  it("returns 204 for OPTIONS preflight", () => {
    const { req, res, next } = makeReqRes("OPTIONS");
    publicApiCorsMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("exposes custom headers", () => {
    const { req, res, next, headers } = makeReqRes("GET");
    publicApiCorsMiddleware(req, res, next);

    const exposed = headers["Access-Control-Expose-Headers"];
    expect(exposed).toContain("X-Request-Id");
    expect(exposed).toContain("X-Credits-Used");
    expect(exposed).toContain("X-RateLimit-Limit");
  });
});
