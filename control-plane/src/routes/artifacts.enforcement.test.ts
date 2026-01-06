import { describe, it, expect } from "vitest";
import { buildApp } from "../index";

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
    R2_BUCKET: "dummy-bucket",
    R2_ACCESS_KEY_ID: "dummy",
    R2_SECRET_ACCESS_KEY: "dummy",
    R2_PRESIGN_EXPIRES_SECONDS: 600,
    ARTIFACT_MAX_BYTES: 10 * 1024 * 1024,
    ARTIFACT_ALLOWED_CONTENT_TYPES: "application/json,text/plain,text/markdown,application/zip,image/png,image/jpeg,image/webp,video/mp4",
    RATE_LIMIT_MAX: 300,
    RATE_LIMIT_TIME_WINDOW: 60_000,
  };
}

function prismaMock() {
  let storedKey: string | null = null;
  let status: "pending" | "complete" = "pending";

  return {
    session: {
      findUnique: async ({ where }: any) => {
        if (where?.id) return { id: where.id, projectId: "P1" };
        return null;
      },
    },
    artifact: {
      create: async ({ data }: any) => {
        storedKey = data.key;
        status = "pending";
        return { id: "A1", ...data };
      },
      findFirst: async ({ where }: any) => {
        if (where?.sessionId && where?.key) {
          if (storedKey && where.key !== storedKey) return null;
          if (where?.status === "complete" && status !== "complete") return null;
          return { id: "A1", projectId: "P1", sessionId: where.sessionId, key: where.key, status };
        }
        return null;
      },
      update: async ({ where, data }: any) => {
        if (data?.status) status = data.status;
        return { id: where.id, ...data };
      },
    },
    auditLog: {
      create: async (_: any) => ({ id: "L1" }),
    },
  };
}

async function mintToken(app: any, role: "user" | "runner" | "admin", sessionId: string) {
  const mint = await app.inject({
    method: "POST",
    url: "/api/v1/auth/token",
    payload: { apiKey: "x".repeat(24), scope: { role, sessionId } },
  });
  expect(mint.statusCode).toBe(200);
  return mint.json().token as string;
}

describe("artifacts route enforcement (Fastify inject)", () => {
  it("enforces allowlist/size/invalid_name and validates complete payload; key prefix fixed", async () => {
    const prisma = prismaMock() as any;
    const env = fakeEnv() as any;
    const app = await buildApp({ env, prisma, logger: false });

    const sessionId = "S1";
    const token = await mintToken(app, "user", sessionId);

    // Allowed presign-put
    const ok = await app.inject({
      method: "POST",
      url: `/api/v1/sessions/${sessionId}/artifacts/presign-put`,
      headers: { authorization: `Bearer ${token}` },
      payload: { iteration: 0, name: "image.png", contentType: "image/png", sizeBytes: 1024 },
    });
    expect(ok.statusCode).toBe(200);
    const okJson = ok.json();

    // Key must always be anchored to project+session prefix (no key injection)
    expect(okJson.key).toMatch(/^projects\/P1\/sessions\/S1\/iter\/0\//);

    // Auth required
    const noAuth = await app.inject({
      method: "POST",
      url: `/api/v1/sessions/${sessionId}/artifacts/presign-put`,
      payload: { iteration: 0, name: "image.png", contentType: "image/png", sizeBytes: 1024 },
    });
    expect([401, 403]).toContain(noAuth.statusCode);

    // Session scope mismatch should be denied (token for S2 cannot access S1)
    const tokenS2 = await mintToken(app, "user", "S2");
    const scopeMismatch = await app.inject({
      method: "POST",
      url: `/api/v1/sessions/${sessionId}/artifacts/presign-put`,
      headers: { authorization: `Bearer ${tokenS2}` },
      payload: { iteration: 0, name: "image.png", contentType: "image/png", sizeBytes: 1024 },
    });
    expect([401, 403]).toContain(scopeMismatch.statusCode);

    // Invalid name should be 400 (not 500)
    const badName = await app.inject({
      method: "POST",
      url: `/api/v1/sessions/${sessionId}/artifacts/presign-put`,
      headers: { authorization: `Bearer ${token}` },
      payload: { iteration: 0, name: "../evil.png", contentType: "image/png", sizeBytes: 1024 },
    });
    expect(badName.statusCode).toBe(400);
    expect(badName.json().error).toBe("invalid_name");

    // Denied content-type
    const badCt = await app.inject({
      method: "POST",
      url: `/api/v1/sessions/${sessionId}/artifacts/presign-put`,
      headers: { authorization: `Bearer ${token}` },
      payload: { iteration: 0, name: "evil.bin", contentType: "application/x-msdownload", sizeBytes: 1024 },
    });
    expect(badCt.statusCode).toBe(400);
    expect(badCt.json().error).toBe("content_type_not_allowed");

    // Denied size
    const tooBig = await app.inject({
      method: "POST",
      url: `/api/v1/sessions/${sessionId}/artifacts/presign-put`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        iteration: 0,
        name: "big.zip",
        contentType: "application/zip",
        sizeBytes: env.ARTIFACT_MAX_BYTES + 1,
      },
    });
    expect(tooBig.statusCode).toBe(400);
    expect(tooBig.json().error).toBe("artifact_too_large");

    // presign-get should fail when artifact not complete
    const getPending = await app.inject({
      method: "GET",
      url: `/api/v1/sessions/${sessionId}/artifacts/presign-get?key=${encodeURIComponent(okJson.key)}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getPending.statusCode).toBe(404);

    // complete invalid sha256 -> 400 invalid_request
    const badSha = await app.inject({
      method: "POST",
      url: `/api/v1/sessions/${sessionId}/artifacts/complete`,
      headers: { authorization: `Bearer ${token}` },
      payload: { key: okJson.key, sha256: "not-a-sha", sizeBytes: 1024 },
    });
    expect(badSha.statusCode).toBe(400);
    expect(badSha.json().error).toBe("invalid_request");

    // complete invalid size -> 400 invalid_request
    const badSize = await app.inject({
      method: "POST",
      url: `/api/v1/sessions/${sessionId}/artifacts/complete`,
      headers: { authorization: `Bearer ${token}` },
      payload: { key: okJson.key, sha256: "a".repeat(64), sizeBytes: 0 },
    });
    expect(badSize.statusCode).toBe(400);
    expect(badSize.json().error).toBe("invalid_request");

    // complete ok then presign-get ok
    const complete = await app.inject({
      method: "POST",
      url: `/api/v1/sessions/${sessionId}/artifacts/complete`,
      headers: { authorization: `Bearer ${token}` },
      payload: { key: okJson.key, sha256: "a".repeat(64), sizeBytes: 1024 },
    });
    expect(complete.statusCode).toBe(200);

    const getOk = await app.inject({
      method: "GET",
      url: `/api/v1/sessions/${sessionId}/artifacts/presign-get?key=${encodeURIComponent(okJson.key)}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(getOk.statusCode).toBe(200);
    expect(typeof getOk.json().url).toBe("string");

    await app.close();
  });
});
