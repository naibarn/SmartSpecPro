import { buildApp } from "./index";

function fakeEnv() {
  return {
    NODE_ENV: "test",
    PORT: 7070,
    DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
    CONTROL_PLANE_API_KEY: "x".repeat(24),
    JWT_SECRET: "y".repeat(16),
    JWT_ISSUER: "smartspec-control-plane",
    JWT_AUDIENCE: "smartspec",
    COVERAGE_MIN_PERCENT: 70,
    R2_ENDPOINT: "https://example.com",
    R2_REGION: "auto",
    R2_BUCKET: "bucket",
    R2_ACCESS_KEY_ID: "key",
    R2_SECRET_ACCESS_KEY: "secret",
    R2_PRESIGN_EXPIRES_SECONDS: 600,
    ARTIFACT_MAX_BYTES: 10 * 1024 * 1024,
    ARTIFACT_ALLOWED_CONTENT_TYPES: "application/json,text/plain,text/markdown,application/zip",
    RATE_LIMIT_MAX: 300,
    RATE_LIMIT_TIME_WINDOW: 60_000,
  };
}

describe("control-plane buildApp", () => {
  it("responds healthz", async () => {
    const app = await buildApp({ env: fakeEnv() as any, prisma: {} as any, logger: false });
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await app.close();
  });

  it("mints token with api key and denies invalid api key", async () => {
    const app = await buildApp({ env: fakeEnv() as any, prisma: {} as any, logger: false });

    const bad = await app.inject({
      method: "POST",
      url: "/api/v1/auth/token",
      payload: { apiKey: "bad", scope: { role: "user" } },
    });
    expect(bad.statusCode).toBe(401);
    expect(bad.json().error).toBe("invalid_api_key");

    const ok = await app.inject({
      method: "POST",
      url: "/api/v1/auth/token",
      payload: { apiKey: "x".repeat(24), scope: { role: "runner", sessionId: "S1" } },
    });
    expect(ok.statusCode).toBe(200);
    const token = ok.json().token as string;
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(10);

    await app.close();
  });

  it("protects routes: unauthorized without token, forbidden with wrong role, session scope mismatch", async () => {
    const app = await buildApp({ env: fakeEnv() as any, prisma: {} as any, logger: false });

    // Unauthorized (no token)
    const unauth = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { name: "p" } });
    expect(unauth.statusCode).toBe(401);
    expect(unauth.json().error).toBe("unauthorized");

    // Mint runner token
    const mint = await app.inject({
      method: "POST",
      url: "/api/v1/auth/token",
      payload: { apiKey: "x".repeat(24), scope: { role: "runner", sessionId: "S1" } },
    });
    const token = mint.json().token as string;

    // Forbidden (runner cannot create project)
    const forbidden = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "p" },
    });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json().error).toBe("forbidden");

    // Session scope mismatch should be blocked before hitting prisma
    const mismatch = await app.inject({
      method: "POST",
      url: "/api/v1/sessions/S2/iterations",
      headers: { authorization: `Bearer ${token}` },
      payload: { input: { kind: "text", text: "hi" } },
    });
    expect(mismatch.statusCode).toBe(403);
    expect(mismatch.json().error).toBe("session_scope_mismatch");

    await app.close();
  });
});
