import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthenticateRequest,
  mockCatalog,
  mockImportLocal,
  mockWorkerRuntimeReleaseError,
  mockWorkerRuntimeSigningKeyError,
  mockSigningKeyGet,
  mockSigningKeySet,
} = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
  mockCatalog: vi.fn(),
  mockImportLocal: vi.fn(),
  mockWorkerRuntimeReleaseError: class extends Error {
    code = "worker_runtime_release_failed";
    statusCode = 500;
    details = undefined;
  },
  mockWorkerRuntimeSigningKeyError: class extends Error {
    code = "worker_runtime_signing_key_failed";
    statusCode = 500;
  },
  mockSigningKeyGet: vi.fn(),
  mockSigningKeySet: vi.fn(),
}));

vi.mock("../../_core/sdk", () => ({
  sdk: { authenticateRequest: mockAuthenticateRequest },
}));

vi.mock("../../services/workerRuntimeReleaseService", () => ({
  finalizeWorkerRuntimeReleaseUpload: vi.fn(),
  importLocalWorkerRuntimeRelease: mockImportLocal,
  listWorkerRuntimeReleaseCatalog: mockCatalog,
  persistWorkerRuntimeReleaseUploadFromPath: vi.fn(),
  presignWorkerRuntimeReleaseUpload: vi.fn(),
  publishWorkerRuntimeRelease: vi.fn(),
  withdrawWorkerRuntimeRelease: vi.fn(),
  WorkerRuntimeReleaseError: mockWorkerRuntimeReleaseError,
  MAX_WORKER_RUNTIME_RELEASE_BYTES: 8 * 1024 * 1024 * 1024,
}));

vi.mock("../../services/workerRuntimeSigningKeyService", () => ({
  getWorkerRuntimeSigningKey: mockSigningKeyGet,
  setWorkerRuntimeSigningPublicKey: mockSigningKeySet,
  WorkerRuntimeSigningKeyError: mockWorkerRuntimeSigningKeyError,
}));

describe("worker runtime release admin routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue(null);
    mockCatalog.mockResolvedValue({
      generatedAt: "2026-08-31T00:00:00.000Z",
      releases: [],
      currentByRuntime: {
        "hyperframes-wsl2": null,
        "hyperframes-windows-x64": null,
        "hyperframes-macos-arm64": null,
      },
    });
    mockImportLocal.mockResolvedValue({
      id: 42,
      version: "2026.09.07.1",
      runtimeId: "hyperframes-wsl2",
      platform: "windows",
      channel: "stable",
      fileName: "smart-ai-hub-worker-runtime-hyperframes-wsl2-2026.09.07.1.zip",
      contentType: "application/zip",
      fileSizeBytes: 4_454_456_216,
      fileSha256:
        "e4c78ca7ce9531ae13af78e81498d11bf289938787ff5e2245a749fd89b23629",
      manifest: { runner: { version: "0.1.0" } },
      validationStatus: "valid",
      validationChecks: [
        { id: "manifest", status: "ok", message: "Manifest is valid." },
      ],
      isPublished: false,
      publishedAt: null,
      withdrawnAt: null,
      uploadedAt: "2026-09-07T00:00:00.000Z",
      updatedAt: "2026-09-07T00:00:00.000Z",
      uploadedByUserId: 1,
      uploadedByName: "Admin",
      downloadUrl:
        "/api/workers/runtime-pack/download/smart-ai-hub-worker-runtime-hyperframes-wsl2-2026.09.07.1.zip",
    });
    mockSigningKeyGet.mockResolvedValue({
      configured: false,
      active: null,
      history: [],
    });
    mockSigningKeySet.mockResolvedValue({
      configured: true,
      active: {
        keyId: "ed25519-test",
        algorithm: "ed25519",
        publicKey: "-----BEGIN PUBLIC KEY-----",
        fingerprintSha256: "a".repeat(64),
        registeredAt: "2026-08-31T00:00:00.000Z",
        retiredAt: null,
      },
      history: [],
    });
  });

  async function makeApp() {
    const { registerWorkerRuntimeReleaseRoutes } =
      await import("../workerRuntimeReleases");
    const app = express();
    app.use(express.json());
    registerWorkerRuntimeReleaseRoutes(app);
    return app;
  }

  it("requires an authenticated user", async () => {
    const response = await request(await makeApp()).get(
      "/api/admin/worker-runtime/releases"
    );
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("worker_runtime_admin_unauthorized");
  });

  it("rejects domain admins because runtime publishing is system-admin only", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: 7, role: "domain_admin" });
    const response = await request(await makeApp()).get(
      "/api/admin/worker-runtime/releases"
    );
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("worker_runtime_admin_forbidden");
  });

  it("returns the grouped platform catalog to a system admin", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: 1, role: "admin" });
    const response = await request(await makeApp()).get(
      "/api/admin/worker-runtime/releases"
    );
    expect(response.status).toBe(200);
    expect(response.body.currentByRuntime).toHaveProperty("hyperframes-wsl2");
    expect(mockCatalog).toHaveBeenCalledWith({ includeUnpublished: true });
  });

  it("imports a server-side runtime artifact for a system admin", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: 1, role: "admin" });

    const response = await request(await makeApp())
      .post("/api/admin/worker-runtime/releases/import-local")
      .send({
        version: "2026.09.07.1",
        runtimeId: "hyperframes-wsl2",
        channel: "stable",
      });

    expect(response.status).toBe(201);
    expect(response.body.release.version).toBe("2026.09.07.1");
    expect(mockImportLocal).toHaveBeenCalledWith({
      release: {
        version: "2026.09.07.1",
        runtimeId: "hyperframes-wsl2",
        channel: "stable",
      },
      uploadedByUserId: 1,
    });
  });

  it("protects server-side runtime import from unauthenticated users", async () => {
    const response = await request(await makeApp())
      .post("/api/admin/worker-runtime/releases/import-local")
      .send({
        version: "2026.09.07.1",
        runtimeId: "hyperframes-wsl2",
      });

    expect(response.status).toBe(401);
    expect(mockImportLocal).not.toHaveBeenCalled();
  });

  it("rejects a non-canonical server import version", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: 1, role: "admin" });

    const response = await request(await makeApp())
      .post("/api/admin/worker-runtime/releases/import-local")
      .send({
        version: "../runtime.zip",
        runtimeId: "hyperframes-wsl2",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("invalid_request");
    expect(mockImportLocal).not.toHaveBeenCalled();
  });

  it("returns signing-key status to a system admin", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: 1, role: "admin" });
    const response = await request(await makeApp()).get(
      "/api/admin/worker-runtime/signing-key"
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      configured: false,
      active: null,
      history: [],
    });
    expect(mockSigningKeyGet).toHaveBeenCalledOnce();
  });

  it("stores a public key through the dedicated admin endpoint", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: 42, role: "admin" });
    const publicKey = "-----BEGIN PUBLIC KEY-----\nexample";
    const response = await request(await makeApp())
      .put("/api/admin/worker-runtime/signing-key")
      .send({ publicKey });

    expect(response.status).toBe(200);
    expect(response.body.active.keyId).toBe("ed25519-test");
    expect(mockSigningKeySet).toHaveBeenCalledWith({
      publicKey,
      updatedBy: 42,
    });
  });

  it("protects signing-key status from unauthenticated users", async () => {
    const response = await request(await makeApp()).get(
      "/api/admin/worker-runtime/signing-key"
    );
    expect(response.status).toBe(401);
    expect(mockSigningKeyGet).not.toHaveBeenCalled();
  });

  it("returns an actionable status when the release migration is missing", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: 1, role: "admin" });
    mockCatalog.mockRejectedValueOnce({
      code: "42P01",
      message: 'relation "worker_runtime_releases" does not exist',
    });

    const response = await request(await makeApp()).get(
      "/api/admin/worker-runtime/releases"
    );

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: {
        code: "worker_runtime_database_not_ready",
        message:
          "Worker Runtime release database is not ready. Apply the Worker Runtime migration before using release history or upload.",
      },
    });
  });
});
