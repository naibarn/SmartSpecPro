import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireScopes } from "../middleware/requireScopes";

function makeReqRes(authOverrides: Record<string, any> = {}) {
  const req = {
    auth: {
      ok: true,
      mode: "api_key",
      sub: "42",
      scopes: ["skills:list", "skills:execute"],
      tenantId: "tenant-uuid",
      apiKeyId: "key-id",
      userId: 42,
      ...authOverrides,
    },
  } as any;

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as any;

  const next = vi.fn();
  return { req, res, next };
}

describe("requireScopes middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 for missing scope", () => {
    const { req, res, next } = makeReqRes({ scopes: ["skills:list"] });
    const mw = requireScopes("skills:execute");
    mw(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: "insufficient_scopes" }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("passes for matching scope", () => {
    const { req, res, next } = makeReqRes({ scopes: ["skills:execute", "skills:list"] });
    const mw = requireScopes("skills:execute");
    mw(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("grants all scopes for session auth (web UI)", () => {
    const { req, res, next } = makeReqRes({ mode: "session", scopes: undefined });
    const mw = requireScopes("skills:execute");
    mw(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("checks multiple scopes (AND logic)", () => {
    const { req, res, next } = makeReqRes({ scopes: ["skills:execute"] });
    const mw = requireScopes("skills:execute", "agencies:invoke");
    mw(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("passes when all multiple scopes are present", () => {
    const { req, res, next } = makeReqRes({
      scopes: ["skills:execute", "agencies:invoke", "skills:list"],
    });
    const mw = requireScopes("skills:execute", "agencies:invoke");
    mw(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("grants all scopes for bearer auth", () => {
    const { req, res, next } = makeReqRes({ mode: "bearer" });
    const mw = requireScopes("skills:execute");
    mw(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("returns 401 when no auth is attached", () => {
    const req = {} as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
    const next = vi.fn();

    const mw = requireScopes("skills:execute");
    mw(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
