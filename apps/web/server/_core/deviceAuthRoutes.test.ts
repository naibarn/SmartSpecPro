import express from "express";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";

const TEST_JWT_SIGNING_KEY = "test-jwt-secret-32-chars-minimum-1234567890";
const TEST_JWT_SECRET = TEST_JWT_SIGNING_KEY;

const mocks = vi.hoisted(() => ({
  claimJti: vi.fn().mockResolvedValue(true),
  revokeJti: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./revocation", () => ({
  claimJti: mocks.claimJti,
  revokeJti: mocks.revokeJti,
}));

vi.mock("./limits", () => ({
  rateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

async function mintDesktopToken(params: {
  type: "access" | "refresh";
  jti: string;
  expSeconds?: number;
}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    sub: "desktop-user",
    userId: 42,
    type: params.type,
    scopes: ["llm:chat"],
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + (params.expSeconds ?? 3600))
    .setJti(params.jti)
    .sign(new TextEncoder().encode(TEST_JWT_SIGNING_KEY));
}

async function mintSessionLikeToken() {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    openId: "session-open-id",
    appId: "smartspec-local-dev",
    name: "Session User",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .setJti("session-jti")
    .sign(new TextEncoder().encode(TEST_JWT_SECRET));
}

describe("registerDeviceAuthRoutes /auth/device/revoke", () => {
  let registerDeviceAuthRoutes: typeof import("./deviceAuthRoutes").registerDeviceAuthRoutes;
  let refreshTenantBindingMatches: typeof import("./deviceAuthRoutes").refreshTenantBindingMatches;

  beforeAll(async () => {
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval").mockImplementation((() => 0) as any);

    vi.resetModules();
    ({ registerDeviceAuthRoutes, refreshTenantBindingMatches } = await import("./deviceAuthRoutes"));
    setIntervalSpy.mockRestore();
  });

  beforeEach(() => {
    mocks.revokeJti.mockReset();
    mocks.revokeJti.mockResolvedValue(undefined);
  });

  it("revokes both desktop access and refresh tokens", async () => {
    const app = express();
    app.use(express.json());
    registerDeviceAuthRoutes(app);

    const accessToken = await mintDesktopToken({ type: "access", jti: "access-jti" });
    const refreshToken = await mintDesktopToken({ type: "refresh", jti: "refresh-jti" });

    const response = await request(app)
      .post("/auth/device/revoke")
      .send({ access_token: accessToken, refresh_token: refreshToken });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      revoked: {
        access_token: true,
        refresh_token: true,
      },
    });
    expect(mocks.revokeJti).toHaveBeenCalledTimes(2);
    expect(mocks.revokeJti).toHaveBeenCalledWith("access-jti", expect.any(Number));
    expect(mocks.revokeJti).toHaveBeenCalledWith("refresh-jti", expect.any(Number));
  });

  it("rejects non-desktop JWTs without a desktop token type", async () => {
    const app = express();
    app.use(express.json());
    registerDeviceAuthRoutes(app);

    const sessionToken = await mintSessionLikeToken();

    const response = await request(app)
      .post("/auth/device/revoke")
      .send({ access_token: sessionToken });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: {
        message: "Invalid desktop token",
      },
    });
    expect(mocks.revokeJti).not.toHaveBeenCalled();
  });

  it("fails closed when the companion tenant membership has been revoked", () => {
    expect(refreshTenantBindingMatches(
      { id: 42, currentTenantId: "tenant-current" },
      { userId: 42, clientId: "smartaihub-runner-companion", tenantId: "tenant-revoked" },
    )).toBe(false);
    expect(refreshTenantBindingMatches(
      { id: 42, currentTenantId: "tenant-current" },
      { userId: 42, clientId: "smartaihub-runner-companion", tenantId: "tenant-current" },
    )).toBe(true);
  });
});
