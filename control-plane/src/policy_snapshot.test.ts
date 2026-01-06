import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildApp } from "./index";

/**
 * Emits a runtime snapshot of control-plane policy/config so CI can generate badges
 * from runtime values and real route enforcement (Fastify inject).
 *
 * Output path: coverage/control_plane_policy_snapshot.json
 */
describe("control-plane policy snapshot (route probes)", () => {
  it("writes control plane policy snapshot + route probes for CI", async () => {
    const env = {
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
      ARTIFACT_ALLOWED_CONTENT_TYPES: "application/json,text/plain,text/markdown,application/zip,image/png,image/jpeg,image/webp,video/mp4",
      RATE_LIMIT_MAX: 300,
      RATE_LIMIT_TIME_WINDOW: 60_000,
    };

    let storedKey: string | null = null;
    let status: "pending" | "complete" = "pending";

    const prisma = {
      session: {
        findUnique: async ({ where }: any) => (where?.id ? { id: where.id, projectId: "P1" } : null),
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

    const app = await buildApp({ env: env as any, prisma: prisma as any, logger: false });

    const sessionId = "S1";
    const mint = await app.inject({
      method: "POST",
      url: "/api/v1/auth/token",
      payload: { apiKey: env.CONTROL_PLANE_API_KEY, scope: { role: "user", sessionId } },
    });
    expect(mint.statusCode).toBe(200);
    const token = mint.json().token as string;

    const mintS2 = await app.inject({
      method: "POST",
      url: "/api/v1/auth/token",
      payload: { apiKey: env.CONTROL_PLANE_API_KEY, scope: { role: "user", sessionId: "S2" } },
    });
    expect(mintS2.statusCode).toBe(200);
    const tokenS2 = mintS2.json().token as string;

    const cfg = await import("./config");
    const allowedContentTypes = Array.from(cfg.allowedContentTypes(env as any)).sort();

    const maxUploadBytes = env.ARTIFACT_MAX_BYTES ?? null;
    const presignTtlSeconds = env.R2_PRESIGN_EXPIRES_SECONDS ?? null;

    const allowedCt = allowedContentTypes.find((x) => x.startsWith("image/")) ?? allowedContentTypes[0] ?? "application/json";
    const deniedCt = "application/x-msdownload";
    const sizeOk = Math.max(1, Math.min(1024, (maxUploadBytes ?? 1024) - 1));
    const sizeTooLarge = (maxUploadBytes ?? 1024) + 1;

    const presignOk = await app.inject({
      method: "POST",
      url: `/api/v1/sessions/${sessionId}/artifacts/presign-put`,
      headers: { authorization: `Bearer ${token}` },
      payload: { iteration: 0, name: "ok.bin", contentType: allowedCt, sizeBytes: sizeOk },
    });

    const key = presignOk.statusCode === 200 ? (presignOk.json() as any).key : null;
    const keyPrefixOk = typeof key === "string" ? /^projects\/P1\/sessions\/S1\/iter\/0\//.test(key) : false;

    const presignNoAuth = await app.inject({
      method: "POST",
      url: `/api/v1/sessions/${sessionId}/artifacts/presign-put`,
      payload: { iteration: 0, name: "ok2.bin", contentType: allowedCt, sizeBytes: sizeOk },
    });

    const presignScopeMismatch = await app.inject({
      method: "POST",
      url: `/api/v1/sessions/${sessionId}/artifacts/presign-put`,
      headers: { authorization: `Bearer ${tokenS2}` },
      payload: { iteration: 0, name: "ok3.bin", contentType: allowedCt, sizeBytes: sizeOk },
    });

    const presignBadCt = await app.inject({
      method: "POST",
      url: `/api/v1/sessions/${sessionId}/artifacts/presign-put`,
      headers: { authorization: `Bearer ${token}` },
      payload: { iteration: 0, name: "bad.bin", contentType: deniedCt, sizeBytes: sizeOk },
    });

    const presignBadSize = await app.inject({
      method: "POST",
      url: `/api/v1/sessions/${sessionId}/artifacts/presign-put`,
      headers: { authorization: `Bearer ${token}` },
      payload: { iteration: 0, name: "big.bin", contentType: allowedCt, sizeBytes: sizeTooLarge },
    });

    const presignBadName = await app.inject({
      method: "POST",
      url: `/api/v1/sessions/${sessionId}/artifacts/presign-put`,
      headers: { authorization: `Bearer ${token}` },
      payload: { iteration: 0, name: "../evil.bin", contentType: allowedCt, sizeBytes: sizeOk },
    });

    // presign-get should deny when not complete; allow after complete
    const getPending = key
      ? await app.inject({
          method: "GET",
          url: `/api/v1/sessions/${sessionId}/artifacts/presign-get?key=${encodeURIComponent(key)}`,
          headers: { authorization: `Bearer ${token}` },
        })
      : null;

    const completeBadSha = key
      ? await app.inject({
          method: "POST",
          url: `/api/v1/sessions/${sessionId}/artifacts/complete`,
          headers: { authorization: `Bearer ${token}` },
          payload: { key, sha256: "not-a-sha", sizeBytes: sizeOk },
        })
      : null;

    const completeBadSize = key
      ? await app.inject({
          method: "POST",
          url: `/api/v1/sessions/${sessionId}/artifacts/complete`,
          headers: { authorization: `Bearer ${token}` },
          payload: { key, sha256: "a".repeat(64), sizeBytes: 0 },
        })
      : null;

    if (key) {
      const complete = await app.inject({
        method: "POST",
        url: `/api/v1/sessions/${sessionId}/artifacts/complete`,
        headers: { authorization: `Bearer ${token}` },
        payload: { key, sha256: "a".repeat(64), sizeBytes: sizeOk },
      });
      expect(complete.statusCode).toBe(200);
    }

    const getComplete = key
      ? await app.inject({
          method: "GET",
          url: `/api/v1/sessions/${sessionId}/artifacts/presign-get?key=${encodeURIComponent(key)}`,
          headers: { authorization: `Bearer ${token}` },
        })
      : null;

    const probes = {
      keyPrefixOk: { result: { ok: keyPrefixOk } },
      authMissingDenied: { statusCode: presignNoAuth.statusCode, result: [401, 403].includes(presignNoAuth.statusCode) ? { ok: false } : { ok: true, body: presignNoAuth.json() } },
      authScopeMismatchDenied: { statusCode: presignScopeMismatch.statusCode, result: [401, 403].includes(presignScopeMismatch.statusCode) ? { ok: false } : { ok: true, body: presignScopeMismatch.json() } },

      contentTypeAllowed: { statusCode: presignOk.statusCode, result: presignOk.statusCode === 200 ? { ok: true } : { ok: false, body: presignOk.json() } },
      contentTypeDenied: { statusCode: presignBadCt.statusCode, result: presignBadCt.statusCode === 400 ? { ok: false } : { ok: true, body: presignBadCt.json() } },
      sizeAllowed: { statusCode: presignOk.statusCode, result: presignOk.statusCode === 200 ? { ok: true } : { ok: false, body: presignOk.json() } },
      sizeDenied: { statusCode: presignBadSize.statusCode, result: presignBadSize.statusCode === 400 ? { ok: false } : { ok: true, body: presignBadSize.json() } },
      invalidNameDenied: { statusCode: presignBadName.statusCode, result: presignBadName.statusCode === 400 ? { ok: false } : { ok: true, body: presignBadName.json() } },
      completeInvalidShaDenied: { statusCode: completeBadSha?.statusCode ?? 0, result: completeBadSha?.statusCode === 400 ? { ok: false } : { ok: true, body: completeBadSha?.json?.() } },
      completeInvalidSizeDenied: { statusCode: completeBadSize?.statusCode ?? 0, result: completeBadSize?.statusCode === 400 ? { ok: false } : { ok: true, body: completeBadSize?.json?.() } },
      presignGetAllowed: { statusCode: getComplete?.statusCode ?? 0, result: getComplete?.statusCode === 200 ? { ok: true } : { ok: false, body: getComplete?.json?.() } },
      presignGetDeniedWhenPending: { statusCode: getPending?.statusCode ?? 0, result: getPending?.statusCode === 404 ? { ok: false } : { ok: true, body: getPending?.json?.() } },
    };

    const snapshot = {
      allowedContentTypes,
      maxUploadBytes,
      presignTtlSeconds,
      probes,
      generatedAt: new Date().toISOString(),
    };

    const outDir = path.resolve(process.cwd(), "coverage");
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, "control_plane_policy_snapshot.json");
    fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), "utf-8");

    expect(fs.existsSync(outPath)).toBe(true);

    expect(probes.keyPrefixOk.result.ok).toBe(true);
    expect(probes.authMissingDenied.result.ok).toBe(false);
    expect(probes.authScopeMismatchDenied.result.ok).toBe(false);

    expect(probes.contentTypeAllowed.result.ok).toBe(true);
    expect(probes.contentTypeDenied.result.ok).toBe(false);
    expect(probes.sizeAllowed.result.ok).toBe(true);
    expect(probes.sizeDenied.result.ok).toBe(false);
    expect(probes.invalidNameDenied.result.ok).toBe(false);
    expect(probes.completeInvalidShaDenied.result.ok).toBe(false);
    expect(probes.completeInvalidSizeDenied.result.ok).toBe(false);
    expect(probes.presignGetAllowed.result.ok).toBe(true);
    expect(probes.presignGetDeniedWhenPending.result.ok).toBe(false);

    await app.close();
  });
});
