import crypto from "node:crypto";
import AdmZip from "adm-zip";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  build: null as any,
  publish: vi.fn(),
  catalog: vi.fn(),
}));
vi.mock("../../db", () => {
  const db = {
    select: (fields: Record<string, unknown>) => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: async () => [{ value: mocks.build }] }),
          limit: async () =>
            "id" in fields ? [{ id: 1 }] : [{ value: mocks.build }],
        }),
      }),
    }),
    update: () => ({
      set: (value: any) => ({
        where: async () => {
          mocks.build = value.valueJson;
        },
      }),
    }),
    insert: () => ({
      values: async (value: any) => {
        mocks.build = value.valueJson;
      },
    }),
    transaction: async (callback: any) =>
      callback({ ...db, execute: async () => [] }),
  };
  return { getDb: () => db };
});
vi.mock("../desktopReleaseSettings", () => ({
  getDesktopReleaseConfig: async () => ({
    githubRepository: "owner/repo",
    githubToken: "token",
    githubTokenConfigured: true,
  }),
}));
vi.mock("../desktopReleaseService", () => ({
  compareDesktopReleaseVersions: (a: string, b: string) =>
    a.localeCompare(b, undefined, { numeric: true }),
  ensureDesktopReleaseSchema: async () => undefined,
  listDesktopReleaseCatalog: mocks.catalog,
  persistDesktopReleaseUpload: mocks.publish,
}));
import {
  reconcileWorkerAppBuild,
  startWorkerAppBuild,
} from "../workerAppBuildService";

function artifact(manifestChange: Record<string, unknown> = {}) {
  const installer = Buffer.from("MZ installer bytes");
  const manifest = {
    product: "smart-ai-hub-worker-app",
    platform: "windows-x64",
    version: "0.1.433",
    fileName: "smart-ai-hub-worker-app-0.1.433-x64-setup.exe",
    sizeBytes: installer.length,
    sha256: crypto.createHash("sha256").update(installer).digest("hex"),
    sourceCommit: "a".repeat(40),
    workflowRunId: "42",
    buildId: "build-id",
    ...manifestChange,
  };
  const zip = new AdmZip();
  zip.addFile(manifest.fileName, installer);
  zip.addFile(
    "worker-release-manifest.json",
    Buffer.from(JSON.stringify(manifest))
  );
  return zip.toBuffer();
}
function setupGithub(zip: Buffer, conclusion = "success", digest?: string) {
  const hash =
    digest ?? `sha256:${crypto.createHash("sha256").update(zip).digest("hex")}`;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/workflows/"))
        return Response.json({
          workflow_runs: [
            {
              id: 42,
              html_url: "https://github.com/owner/repo/actions/runs/42",
              status: "completed",
              conclusion,
              event: "workflow_dispatch",
              head_branch: "main",
              display_title: "Worker App Windows 0.1.433 · build-id",
            },
          ],
        });
      if (url.includes("/runs/42/artifacts"))
        return Response.json({
          artifacts: [
            {
              id: 7,
              name: "smart-ai-hub-worker-app-windows-x64",
              expired: false,
              size_in_bytes: zip.length,
              digest: hash,
            },
          ],
        });
      if (url.includes("/artifacts/7/zip")) return new Response(zip);
      throw new Error("unexpected URL");
    })
  );
}

describe("Worker App build promotion", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.build = {
      id: "build-id",
      repository: "owner/repo",
      version: "0.1.433",
      sourceSha: "a".repeat(40),
      requestedBy: 1,
      createdAt: new Date().toISOString(),
      status: "building",
      runId: null,
      runUrl: null,
      error: null,
    };
    mocks.catalog.mockReset().mockResolvedValue({ releases: [] });
    mocks.publish.mockReset().mockResolvedValue({});
  });
  it("selects the next source version and dispatches a pinned build", async () => {
    mocks.build = null;
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.includes("git/ref/heads/main"))
        return Response.json({ object: { sha: "a".repeat(40) } });
      if (url.includes("contents/apps/worker-app/package.json"))
        return Response.json({
          encoding: "base64",
          content: Buffer.from(JSON.stringify({ version: "0.1.432" })).toString(
            "base64"
          ),
        });
      if (url.includes("/dispatches"))
        return new Response(null, { status: 204 });
      throw new Error("unexpected URL");
    });
    vi.stubGlobal("fetch", fetchMock);
    const build = await startWorkerAppBuild(1, "0.1.316");
    expect(build).toMatchObject({
      version: "0.1.433",
      sourceSha: "a".repeat(40),
      status: "queued",
    });
    const request = JSON.parse(fetchMock.mock.calls[2][1]?.body as string);
    expect(request.inputs).toMatchObject({
      build_id: build.id,
      source_sha: build.sourceSha,
      release_version: build.version,
      publish_direct: "false",
    });
  });
  it("imports only the installer whose manifest and archive match the selected run", async () => {
    setupGithub(artifact());
    expect((await reconcileWorkerAppBuild("build-id")).status).toBe(
      "published"
    );
    expect(mocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        version: "0.1.433",
        fileName: "smart-ai-hub-worker-app-0.1.433-x64-setup.exe",
        publish: true,
      }),
      expect.anything()
    );
  });
  it("rejects a manifest for a different source commit", async () => {
    setupGithub(artifact({ sourceCommit: "b".repeat(40) }));
    expect(await reconcileWorkerAppBuild("build-id")).toMatchObject({
      status: "failed",
      error: "worker_build_manifest_mismatch",
    });
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it("rejects a tampered artifact archive", async () => {
    setupGithub(artifact(), "success", `sha256:${"0".repeat(64)}`);
    expect(await reconcileWorkerAppBuild("build-id")).toMatchObject({
      status: "failed",
      error: "worker_build_artifact_digest_mismatch",
    });
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it("does not import an artifact from a failed workflow", async () => {
    setupGithub(artifact(), "failure");
    expect(await reconcileWorkerAppBuild("build-id")).toMatchObject({
      status: "failed",
      error: "worker_build_workflow_failed",
    });
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it("rejects a manifest from a different build", async () => {
    setupGithub(artifact({ buildId: "another-build" }));
    expect(await reconcileWorkerAppBuild("build-id")).toMatchObject({
      status: "failed",
      error: "worker_build_manifest_mismatch",
    });
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
