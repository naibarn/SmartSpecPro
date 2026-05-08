import express from "express";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";

const TEST_JWT_SIGNING_KEY = "test-jwt-key.local";

const mocks = vi.hoisted(() => ({
  revokeJti: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./revocation", () => ({
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

  beforeAll(async () => {
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval").mockImplementation((() => 0) as any);

    vi.resetModules();
    ({ registerDeviceAuthRoutes } = await import("./deviceAuthRoutes"));
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
});
