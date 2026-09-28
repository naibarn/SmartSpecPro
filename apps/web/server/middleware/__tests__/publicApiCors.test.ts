import { describe, it, expect, vi } from "vitest";
import { isMcpPreflightRequest, publicApiCorsMiddleware } from "../publicApiCors";

function makeReqRes(method = "GET") {
  const headers: Record<string, string> = {};
  const req: any = { method };
  const res: any = {
    setHeader: (k: string, v: string) => {
      headers[k] = v;
    },
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
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

  it("restricts MCP preflight to configured origins and protocol headers", () => {
    const previous = process.env.MCP_CORS_ALLOWED_ORIGINS;
    process.env.MCP_CORS_ALLOWED_ORIGINS = "https://client.example.test";
    try {
      const allowed = makeReqRes("OPTIONS");
      allowed.req.originalUrl = "/v1/mcp";
      allowed.req.headers = {
        origin: "https://client.example.test",
        "access-control-request-headers": "Authorization, MCP-Protocol-Version, traceparent",
      };
      publicApiCorsMiddleware(allowed.req, allowed.res, allowed.next);
      expect(allowed.headers["Access-Control-Allow-Origin"]).toBe("https://client.example.test");
      expect(allowed.headers["Access-Control-Allow-Credentials"]).toBe("true");
      expect(allowed.res.status).toHaveBeenCalledWith(204);

      const denied = makeReqRes("OPTIONS");
      denied.req.originalUrl = "/v1/mcp";
      denied.req.headers = {
        origin: "https://evil.example.test",
        "access-control-request-headers": "Authorization",
      };
      publicApiCorsMiddleware(denied.req, denied.res, denied.next);
      expect(denied.res.status).toHaveBeenCalledWith(403);
      expect(denied.next).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.MCP_CORS_ALLOWED_ORIGINS;
      else process.env.MCP_CORS_ALLOWED_ORIGINS = previous;
    }
  });

  it("recognizes MCP preflights and allows the default hosted client origins", () => {
    const request = makeReqRes("OPTIONS");
    request.req.originalUrl = "/v1/mcp";
    request.req.headers = {
      origin: "https://claude.ai",
      "access-control-request-headers": "authorization,content-type,mcp-protocol-version",
    };
    expect(isMcpPreflightRequest(request.req)).toBe(true);
    publicApiCorsMiddleware(request.req, request.res, request.next);
    expect(request.headers["Access-Control-Allow-Origin"]).toBe("https://claude.ai");
    expect(request.res.status).toHaveBeenCalledWith(204);
  });
});
