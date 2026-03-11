import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetDb,
  mockLoadTenantBrowserPolicyConfig,
  mockGetBrowserPolicySurfaceGateStatus,
} = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockLoadTenantBrowserPolicyConfig: vi.fn(),
  mockGetBrowserPolicySurfaceGateStatus: vi.fn(),
}));

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../browserPolicyStore", async () => {
  const actual = await vi.importActual("../browserPolicyStore");
  return {
    ...actual,
    loadTenantBrowserPolicyConfig: mockLoadTenantBrowserPolicyConfig,
  };
});

vi.mock("../browserPolicyReleaseControl", () => ({
  getBrowserPolicySurfaceGateStatus: mockGetBrowserPolicySurfaceGateStatus,
}));

function createDbMock() {
  const selectQueue: unknown[] = [];
  const selectLimit = vi.fn();
  const selectWhere = vi.fn(() => ({
    limit: selectLimit,
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve(resolve(selectQueue.shift() ?? [])),
  }));
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values: insertValues }));

  return {
    db: { select, update, insert },
    selectQueue,
    selectLimit,
    updateSet,
    insertValues,
  };
}

describe("browserPolicySettingsBridge", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetDb.mockReset();
    mockLoadTenantBrowserPolicyConfig.mockReset();
    mockGetBrowserPolicySurfaceGateStatus.mockReset();
  });

  it("updates tenant browser policy config and keeps legacy automation settings synchronized", async () => {
    const { db, selectLimit, selectQueue, updateSet, insertValues } = createDbMock();
    mockGetDb.mockResolvedValue(db);
    selectQueue.push(
      [
        { key: "allowed_domains", value: "example.com, docs.example.com" },
        { key: "automation_vision_model", value: "gpt-4o-mini" },
      ],
    );
    selectLimit
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ key: "allowed_domains", value: "example.com" }]);
    mockLoadTenantBrowserPolicyConfig.mockResolvedValue({
      config: {
        enabled: true,
        enforcementMode: "read_only",
        defaultApprovalTtlSeconds: 420,
        reviewCadenceDays: 30,
        killSwitchEnabled: false,
        requireTamperEvidence: true,
        evidenceRetentionDays: 180,
        allowedDomains: ["example.com", "docs.example.com"],
        visionModel: "gpt-4o-mini",
        seededDefault: false,
      },
      rules: [],
      source: "db",
      metadata: {},
      storageStatus: "ready",
    });
    mockGetBrowserPolicySurfaceGateStatus.mockResolvedValue({
      surface: "automationCopilot",
      transition: "observe_to_read_only",
      ready: true,
      release: { passed: true, failedChecks: [] },
      rollout: { passed: true, failedChecks: [] },
    });

    const { updateTenantAutomationPolicySettings } = await import(
      "../browserPolicySettingsBridge"
    );

    const result = await updateTenantAutomationPolicySettings({
      tenantId: "tenant-1",
      userId: 7,
      config: {
        enabled: true,
        enforcementMode: "read_only",
        defaultApprovalTtlSeconds: 420,
        reviewCadenceDays: 30,
        killSwitchEnabled: false,
        requireTamperEvidence: true,
        evidenceRetentionDays: 180,
        allowedDomains: ["example.com", "docs.example.com"],
        visionModel: "gpt-4o-mini",
      },
    });

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        enforcementMode: "read_only",
        allowedDomains: ["example.com", "docs.example.com"],
        visionModel: "gpt-4o-mini",
        seededDefault: false,
      }),
    );
    expect(updateSet).not.toHaveBeenCalled();
    expect(result.policyConfig.enforcementMode).toBe("read_only");
    expect(result.storageStatus).toBe("ready");
    expect(result.legacyUiConnected).toBe(true);
    expect(result.userCustomization.allowPersonalDomainSubset).toBe(true);
  });

  it("returns a friendly error when tenant browser policy storage is not ready", async () => {
    const schemaError = Object.assign(
      new Error('column "metadata" does not exist'),
      { code: "42703" },
    );
    const selectLimit = vi.fn().mockRejectedValue(schemaError);
    const selectWhere = vi.fn(() => ({ limit: selectLimit }));
    const selectFrom = vi.fn(() => ({ where: selectWhere }));
    const select = vi.fn(() => ({ from: selectFrom }));
    mockGetDb.mockResolvedValue({ select });

    const { updateTenantAutomationPolicySettings } = await import(
      "../browserPolicySettingsBridge"
    );

    await expect(
      updateTenantAutomationPolicySettings({
        tenantId: "tenant-1",
        userId: 7,
        config: {
          enabled: true,
          enforcementMode: "read_only",
          defaultApprovalTtlSeconds: 420,
          reviewCadenceDays: 30,
          killSwitchEnabled: false,
          requireTamperEvidence: true,
          evidenceRetentionDays: 180,
          allowedDomains: ["example.com"],
          visionModel: "gpt-4o-mini",
        },
      }),
    ).rejects.toThrow(
      "Tenant-wide browser policy storage is not ready in this environment yet. Apply the browser policy database migration before saving tenant-wide settings.",
    );
  });
});
