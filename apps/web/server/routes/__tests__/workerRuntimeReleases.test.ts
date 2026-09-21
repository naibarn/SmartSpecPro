import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthenticateRequest,
  mockCatalog,
  mockImportGithubActions,
  mockImportLocal,
  mockRunnerCatalog,
  mockRunnerFinalize,
  mockRunnerPresign,
  mockWorkerRuntimeReleaseError,
  mockWorkerRuntimeSigningKeyError,
  mockSigningKeyGet,
  mockSigningKeySet,
} = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
  mockCatalog: vi.fn(),
  mockImportGithubActions: vi.fn(),
  mockImportLocal: vi.fn(),
  mockRunnerCatalog: vi.fn(),
  mockRunnerFinalize: vi.fn(),
  mockRunnerPresign: vi.fn(),
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
  importGithubActionsWorkerRuntimeRelease: mockImportGithubActions,
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

vi.mock("../../services/workerRuntimeRunnerArtifactService", () => ({
  listWorkerRuntimeRunnerArtifacts: mockRunnerCatalog,
  finalizeWorkerRuntimeRunnerArtifactUpload: mockRunnerFinalize,
  presignWorkerRuntimeRunnerArtifactUpload: mockRunnerPresign,
  persistWorkerRuntimeRunnerArtifactFromPath: vi.fn(),
  streamWorkerRuntimeRunnerArtifact: vi.fn(),
  WorkerRuntimeRunnerArtifactError: class extends Error {
    code = "worker_runtime_runner_failed";
    statusCode = 500;
  },
  MAX_WORKER_RUNTIME_RUNNER_BYTES: 1024 * 1024 * 1024,
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
    mockImportGithubActions.mockResolvedValue({
      id: 44,
      version: "0.1.414",
      runtimeId: "content-protection-windows-x64",
      platform: "windows",
      channel: "stable",
      fileName:
        "smart-ai-hub-content-protection-runtime-windows-x64-0.1.414.zip",
      contentType: "application/zip",
      fileSizeBytes: 566423680,
      fileSha256: "b".repeat(64),
      manifest: { runtimeId: "content-protection-windows-x64" },
      validationStatus: "valid",
      validationChecks: [
        { id: "manifest", status: "ok", message: "Manifest is valid." },
      ],
      isPublished: false,
      publishedAt: null,
      withdrawnAt: null,
      uploadedAt: "2026-09-21T00:00:00.000Z",
      updatedAt: "2026-09-21T00:00:00.000Z",
      uploadedByUserId: 1,
      uploadedByName: "Admin",
      downloadUrl:
        "/api/workers/runtime-pack/download/smart-ai-hub-content-protection-runtime-windows-x64-0.1.414.zip",
    });
    mockRunnerCatalog.mockResolvedValue({
      generatedAt: "2026-09-08T00:00:00.000Z",
      artifacts: [],
    });
    mockRunnerPresign.mockResolvedValue({
      uploadUrl: "https://storage.example.test/presigned-runner",
      storageKey: "worker-runtime-runner-uploads/test-runner.exe",
    });
    mockRunnerFinalize.mockResolvedValue({
      id: 9,
      fileName: "speaker-aware-runner.exe",
      contentType: "application/octet-stream",
      fileSizeBytes: 442,
      fileSha256: "a".repeat(64),
      uploadedAt: "2026-09-08T00:00:00.000Z",
      uploadedByUserId: 1,
      uploadedByName: "Admin",
      downloadUrl: "/api/admin/worker-runtime/runner-artifacts/9/download",
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

  it("returns persisted runner artifacts to a system admin", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: 1, role: "admin" });
    const response = await request(await makeApp()).get(
      "/api/admin/worker-runtime/runner-artifacts"
    );
    expect(response.status).toBe(200);
    expect(response.body.artifacts).toEqual([]);
    expect(mockRunnerCatalog).toHaveBeenCalledTimes(1);
  });

  it("presigns a direct runner upload for object storage", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: 1, role: "admin" });
    const response = await request(await makeApp())
      .post("/api/admin/worker-runtime/runner-artifacts/upload-url")
      .send({
        fileName: "speaker-aware-runner.exe",
        contentType: "application/octet-stream",
        fileSizeBytes: 442,
      });
    expect(response.status).toBe(200);
    expect(response.body.uploadUrl).toContain("presigned-runner");
    expect(mockRunnerPresign).toHaveBeenCalledWith({
      fileName: "speaker-aware-runner.exe",
      contentType: "application/octet-stream",
      fileSizeBytes: 442,
    });
  });

  it("finalizes a direct runner upload and persists its provenance", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: 1, role: "admin" });
    const response = await request(await makeApp())
      .post("/api/admin/worker-runtime/runner-artifacts/upload/complete")
      .send({
        fileName: "speaker-aware-runner.exe",
        contentType: "application/octet-stream",
        fileSizeBytes: 442,
        storageKey: "worker-runtime-runner-uploads/test-runner.exe",
      });
    expect(response.status).toBe(201);
    expect(response.body.artifact.fileName).toBe("speaker-aware-runner.exe");
    expect(mockRunnerFinalize).toHaveBeenCalledWith({
      upload: {
        fileName: "speaker-aware-runner.exe",
        contentType: "application/octet-stream",
        fileSizeBytes: 442,
        storageKey: "worker-runtime-runner-uploads/test-runner.exe",
      },
      uploadedByUserId: 1,
    });
  });

  it("starts and reports a server-side runtime import for a system admin", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: 1, role: "admin" });

    const response = await request(await makeApp())
      .post("/api/admin/worker-runtime/releases/import-local")
      .send({
        version: "2026.09.07.1",
        runtimeId: "hyperframes-wsl2",
        channel: "stable",
      });

    expect(response.status).toBe(202);
    expect(response.body.operation.status).toBe("running");
    expect(response.body.operation.id).toEqual(expect.any(String));

    await vi.waitFor(() =>
      expect(mockImportLocal).toHaveBeenCalledWith({
        release: {
          version: "2026.09.07.1",
          runtimeId: "hyperframes-wsl2",
          channel: "stable",
        },
        uploadedByUserId: 1,
      })
    );

    const statusResponse = await request(await makeApp()).get(
      `/api/admin/worker-runtime/releases/import-local/${response.body.operation.id}`
    );
    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.operation.status).toBe("succeeded");
    expect(statusResponse.body.operation.release.version).toBe("2026.09.07.1");
  });

  it("starts a GitHub Actions runtime import without a browser file upload", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: 1, role: "admin" });

    const response = await request(await makeApp())
      .post("/api/admin/worker-runtime/releases/import-github-actions")
      .send({
        version: "0.1.414",
        runtimeId: "content-protection-windows-x64",
        channel: "stable",
      });

    expect(response.status).toBe(202);
    await vi.waitFor(() =>
      expect(mockImportGithubActions).toHaveBeenCalledWith({
        release: {
          version: "0.1.414",
          runtimeId: "content-protection-windows-x64",
          channel: "stable",
        },
        uploadedByUserId: 1,
      })
    );

    const statusResponse = await request(await makeApp()).get(
      `/api/admin/worker-runtime/releases/import-github-actions/${response.body.operation.id}`
    );
    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.operation.status).toBe("succeeded");
  });

  it("deduplicates concurrent server-side runtime imports", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: 1, role: "admin" });
    let completeImport!: (value: any) => void;
    mockImportLocal.mockImplementationOnce(
      () => new Promise(resolve => (completeImport = resolve))
    );
    const payload = {
      version: "2026.09.07.2",
      runtimeId: "hyperframes-wsl2",
      channel: "stable",
    };
    const app = await makeApp();
    const first = await request(app)
      .post("/api/admin/worker-runtime/releases/import-local")
      .send(payload);
    const second = await request(app)
      .post("/api/admin/worker-runtime/releases/import-local")
      .send(payload);

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(second.body.operation.id).toBe(first.body.operation.id);
    await vi.waitFor(() => expect(mockImportLocal).toHaveBeenCalledTimes(1));
    completeImport({
      id: 43,
      version: payload.version,
    });
  });

  it("protects server-side import status from unauthenticated users", async () => {
    const response = await request(await makeApp()).get(
      "/api/admin/worker-runtime/releases/import-local/missing"
    );
    expect(response.status).toBe(401);
  });

  it("returns not found for an unknown server-side import operation", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: 1, role: "admin" });
    const response = await request(await makeApp()).get(
      "/api/admin/worker-runtime/releases/import-local/missing"
    );
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe(
      "worker_runtime_import_operation_not_found"
    );
  });

  it("reports a failed server-side import without dropping the HTTP connection", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: 1, role: "admin" });
    mockImportLocal.mockRejectedValueOnce(
      new Error("R2 rejected the runtime archive")
    );
    const app = await makeApp();
    const response = await request(app)
      .post("/api/admin/worker-runtime/releases/import-local")
      .send({
        version: "2026.09.07.4",
        runtimeId: "hyperframes-wsl2",
        channel: "stable",
      });

    expect(response.status).toBe(202);
    await vi.waitFor(async () => {
      const statusResponse = await request(app).get(
        `/api/admin/worker-runtime/releases/import-local/${response.body.operation.id}`
      );
      expect(statusResponse.body.operation.status).toBe("failed");
      expect(statusResponse.body.operation.error.message).toBe(
        "R2 rejected the runtime archive"
      );
    });
  });

  it("passes the canonical import payload to the service", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: 1, role: "admin" });
    const response = await request(await makeApp())
      .post("/api/admin/worker-runtime/releases/import-local")
      .send({
        version: "2026.09.07.3",
        runtimeId: "hyperframes-wsl2",
        channel: "stable",
      });
    expect(response.status).toBe(202);
    await vi.waitFor(() =>
      expect(mockImportLocal).toHaveBeenCalledWith({
      release: {
        version: "2026.09.07.3",
        runtimeId: "hyperframes-wsl2",
        channel: "stable",
      },
      uploadedByUserId: 1,
      })
    );
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
