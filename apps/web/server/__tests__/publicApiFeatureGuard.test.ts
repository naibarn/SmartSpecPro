import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: vi.fn(),
}));

import { publicApiFeatureGuard } from "../middleware/publicApiFeatureGuard";
import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";

function makeReqRes(authOverrides: Record<string, any> = {}) {
  const req = {
    auth: {
      ok: true,
      mode: "api_key",
      sub: "42",
      scopes: ["skills:list"],
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

describe("publicApiFeatureGuard middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects API key auth when tenant publicApi=false", async () => {
    (getTenantFeatureFlags as any).mockResolvedValue({ publicApi: false });
    const { req, res, next } = makeReqRes();

    await publicApiFeatureGuard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: "feature_disabled" }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("passes API key auth when tenant publicApi=true", async () => {
    (getTenantFeatureFlags as any).mockResolvedValue({ publicApi: true });
    const { req, res, next } = makeReqRes();

    await publicApiFeatureGuard(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("session auth bypasses publicApi guard", async () => {
    const { req, res, next } = makeReqRes({ mode: "session" });

    await publicApiFeatureGuard(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(getTenantFeatureFlags).not.toHaveBeenCalled();
  });

  it("bearer auth bypasses publicApi guard", async () => {
    const { req, res, next } = makeReqRes({ mode: "bearer" });

    await publicApiFeatureGuard(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(getTenantFeatureFlags).not.toHaveBeenCalled();
  });

  it("handles Redis/DB lookup failure gracefully", async () => {
    (getTenantFeatureFlags as any).mockRejectedValue(new Error("Redis down"));
    const { req, res, next } = makeReqRes();

    await publicApiFeatureGuard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when no auth is attached", async () => {
    const req = {} as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
    const next = vi.fn();

    await publicApiFeatureGuard(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
