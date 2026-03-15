import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRedisGet = vi.fn();

vi.mock("../redis", () => ({
  getRedisClient: vi.fn(() => ({
    get: mockRedisGet,
  })),
}));

describe("browser policy release control", () => {
  beforeEach(() => {
    vi.resetModules();
    mockRedisGet.mockReset();
  });

  it("fails closed when release or rollout readiness snapshots are missing", async () => {
    const { assertBrowserPolicyFeaturePromotionReady } = await import(
      "../browserPolicyReleaseControl"
    );

    mockRedisGet.mockResolvedValue(null);

    await expect(
      assertBrowserPolicyFeaturePromotionReady({
        tenantId: "tenant-1",
        flagName: "automationCopilot",
        nextValue: true,
      }),
    ).rejects.toThrow(/browser policy release gate blocked automationCopilot access/);
  });

  it("allows automation copilot promotion when both release gates pass", async () => {
    const { assertBrowserPolicyFeaturePromotionReady } = await import(
      "../browserPolicyReleaseControl"
    );

    mockRedisGet
      .mockResolvedValueOnce(
        JSON.stringify({
          regressionSuitePassed: true,
          abuseSuitePassed: true,
          auditCompletenessReady: true,
          redTeamPassed: true,
          rollbackReady: true,
          rawBrowserBypassClosed: true,
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          observedDays: 14,
          totalDecisions: 10000,
          reviewedSampleSize: 500,
          precision: 0.99,
          falsePositiveRate: 0.005,
          falseNegativeRate: 0.01,
          stableDays: 7,
          p0p1Misses: 0,
        }),
      );

    await expect(
      assertBrowserPolicyFeaturePromotionReady({
        tenantId: "tenant-1",
        flagName: "automationCopilot",
        nextValue: true,
      }),
    ).resolves.toBeUndefined();
  });

  it("treats browserTool as a controlled promotion surface too", async () => {
    const { assertBrowserPolicyFeaturePromotionReady } = await import(
      "../browserPolicyReleaseControl"
    );

    mockRedisGet.mockResolvedValue(null);

    await expect(
      assertBrowserPolicyFeaturePromotionReady({
        tenantId: "tenant-1",
        flagName: "browserTool",
        nextValue: true,
      }),
    ).rejects.toThrow(/browser policy release gate blocked browserTool access/);
  });

  it("treats liveBrowser as a controlled promotion surface too", async () => {
    const { assertBrowserPolicyFeaturePromotionReady } = await import(
      "../browserPolicyReleaseControl"
    );

    mockRedisGet.mockResolvedValue(null);

    await expect(
      assertBrowserPolicyFeaturePromotionReady({
        tenantId: "tenant-1",
        flagName: "liveBrowser",
        nextValue: true,
      }),
    ).rejects.toThrow(/browser policy release gate blocked liveBrowser access/);
  });

  it("reports gate status for UI consumers", async () => {
    const { getBrowserPolicySurfaceGateStatus } = await import(
      "../browserPolicyReleaseControl"
    );

    mockRedisGet
      .mockResolvedValueOnce(
        JSON.stringify({
          regressionSuitePassed: true,
          abuseSuitePassed: true,
          auditCompletenessReady: true,
          redTeamPassed: true,
          rollbackReady: true,
          rawBrowserBypassClosed: true,
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          observedDays: 14,
          totalDecisions: 10000,
          reviewedSampleSize: 500,
          precision: 0.99,
          falsePositiveRate: 0.005,
          falseNegativeRate: 0.01,
          stableDays: 7,
          p0p1Misses: 0,
        }),
      );

    await expect(
      getBrowserPolicySurfaceGateStatus({ surface: "browserTool" }),
    ).resolves.toMatchObject({
      surface: "browserTool",
      ready: true,
      transition: "observe_to_read_only",
      release: { passed: true },
      rollout: { passed: true },
    });
  });
});
