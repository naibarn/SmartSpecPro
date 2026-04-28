import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAppRuntimeConfig: vi.fn(),
  getActiveStorageConfig: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock("../../server/services/appRuntimeConfig", () => ({
  getAppRuntimeConfig: mocks.getAppRuntimeConfig,
}));

vi.mock("../../server/db", () => ({
  getDb: mocks.getDb,
}));

vi.mock("../../server/storage", () => ({
  getActiveStorageConfig: mocks.getActiveStorageConfig,
}));

import {
  buildReadinessReport,
  parseReadinessCliArgs,
} from "../verify-auto-team-work-request-readiness";

function runtime(overrides: Record<string, string> = {}) {
  return {
    appPublicUrl: "",
    appUrl: "",
    proxyToken: "",
    publicUrl: "https://work.example.test",
    pythonBackendUrl: "https://media.example.test",
    webGatewayToken: "internal-token",
    ...overrides,
  };
}

function fakeDb(options: {
  activeRuns?: Array<Record<string, unknown>>;
  artifactRefCount?: number;
  enabledImageModelCount?: number;
  enabledProviderCount?: number;
  enabledVideoModelCount?: number;
  finalResultCount?: number;
  notificationCount?: number;
  stuckRuns?: Array<Record<string, unknown>>;
}) {
  const rowsByCall = [
    [{ count: options.finalResultCount ?? 0 }],
    [{ count: options.artifactRefCount ?? 0 }],
    [{ count: options.notificationCount ?? 0 }],
    [{ count: options.enabledProviderCount ?? 1 }],
    [{ count: options.enabledImageModelCount ?? 1 }],
    [{ count: options.enabledVideoModelCount ?? 1 }],
    options.activeRuns ?? [],
    options.stuckRuns ?? [],
  ];
  let callIndex = 0;

  return {
    select: vi.fn(() => {
      const rows = rowsByCall[callIndex++] ?? [];
      const terminal = {
        orderBy: () => ({
          limit: async () => rows,
        }),
        then: (
          resolve: (value: Array<Record<string, unknown>>) => unknown,
          reject?: (reason: unknown) => unknown,
        ) => Promise.resolve(rows).then(resolve, reject),
      };

      const fromResult = {
        innerJoin: () => ({
          where: () => terminal,
        }),
        where: () => terminal,
        then: (
          resolve: (value: Array<Record<string, unknown>>) => unknown,
          reject?: (reason: unknown) => unknown,
        ) => Promise.resolve(rows).then(resolve, reject),
      };

      return {
        from: () => fromResult,
      };
    }),
  };
}

describe("verify-auto-team-work-request-readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.getAppRuntimeConfig.mockResolvedValue(runtime());
    mocks.getActiveStorageConfig.mockResolvedValue({
      provider: "s3",
      bucket: "media-bucket",
    });
    mocks.getDb.mockReturnValue(fakeDb({}));
  });

  it("parses supported CLI flags", () => {
    expect(parseReadinessCliArgs(["--json", "--allow-missing-db"])).toEqual({
      allowMissingDb: true,
      outputJson: true,
    });
  });

  it("passes when runtime and DB-backed media prerequisites are ready", async () => {
    const report = await buildReadinessReport();

    expect(report.status).toBe("pass");
    expect(report.checks.map((check) => check.key)).toContain("media.video_models");
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        key: "database.auto_team_final_results",
        status: "pass",
      }),
    );
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        key: "database.notifications",
        status: "pass",
      }),
    );
  });

  it("fails when the internal media job token is missing", async () => {
    mocks.getAppRuntimeConfig.mockResolvedValue(
      runtime({ proxyToken: "", webGatewayToken: "" }),
    );

    const report = await buildReadinessReport();

    expect(report.status).toBe("fail");
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        key: "runtime.internal_token",
        status: "fail",
      }),
    );
  });

  it("can downgrade a missing local DB to a warning for sandbox checks", async () => {
    mocks.getDb.mockImplementation(() => {
      throw new Error("DATABASE_URL is not configured");
    });

    const report = await buildReadinessReport({ allowMissingDb: true });

    expect(report.status).toBe("warn");
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        key: "database.connection",
        status: "warn",
      }),
    );
  });

  it("fails when paused async media runs have no recoverable pipeline state", async () => {
    mocks.getDb.mockReturnValue(
      fakeDb({
        stuckRuns: [
          {
            id: "run_missing_pipeline",
            status: "paused",
            stopReason: "awaiting_async_media_pipeline",
          },
        ],
      }),
    );

    const report = await buildReadinessReport();

    expect(report.status).toBe("fail");
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        key: "media.missing_pipeline_state",
        status: "fail",
      }),
    );
  });

  it("warns when active async media pipelines are mid-flight", async () => {
    mocks.getDb.mockReturnValue(
      fakeDb({
        activeRuns: [
          {
            id: "run_active_pipeline",
            mediaPipelineStatus: "waiting_for_video_tasks",
            status: "running",
          },
        ],
      }),
    );

    const report = await buildReadinessReport();

    expect(report.status).toBe("warn");
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        key: "media.active_async_pipelines",
        status: "warn",
      }),
    );
  });

  it("fails production readiness when public URL or recovery workers are disabled", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WORK_OS_DISABLE_AUTO_TEAM_RECOVERY", "true");
    mocks.getAppRuntimeConfig.mockResolvedValue(
      runtime({ appPublicUrl: "", appUrl: "", publicUrl: "" }),
    );

    const report = await buildReadinessReport();

    expect(report.status).toBe("fail");
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        key: "runtime.public_url",
        status: "fail",
      }),
    );
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        key: "workers.auto_team_recovery",
        status: "fail",
      }),
    );
  });

  it("fails production readiness when the configured public result URL is local or not https", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.getAppRuntimeConfig.mockResolvedValue(
      runtime({ publicUrl: "http://localhost:5173" }),
    );

    const report = await buildReadinessReport();

    expect(report.status).toBe("fail");
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        key: "runtime.public_result_url",
        status: "fail",
      }),
    );
  });

  it("fails production readiness when only local storage is active", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.getActiveStorageConfig.mockResolvedValue({ provider: "local" });

    const report = await buildReadinessReport();

    expect(report.status).toBe("fail");
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        key: "storage.managed_media_provider",
        status: "fail",
      }),
    );
  });
});
