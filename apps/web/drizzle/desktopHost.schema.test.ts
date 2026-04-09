import { describe, expect, test } from "vitest";
import { getTableColumns } from "drizzle-orm";

import { desktopDevices } from "./schema";

describe("desktop_devices table schema", () => {
  test("has required columns", () => {
    const columns = getTableColumns(desktopDevices);

    expect(columns.id).toBeDefined();
    expect(columns.tenantId).toBeDefined();
    expect(columns.userId).toBeDefined();
    expect(columns.displayName).toBeDefined();
    expect(columns.machineName).toBeDefined();
    expect(columns.healthStatus).toBeDefined();
    expect(columns.workerProjectionEnabled).toBeDefined();
    expect(columns.projectedWorkerRuntimeType).toBeDefined();
    expect(columns.platform).toBeDefined();
    expect(columns.capabilitiesJson).toBeDefined();
    expect(columns.healthSummaryJson).toBeDefined();
    expect(columns.localRootsJson).toBeDefined();
    expect(columns.packageCachePathsJson).toBeDefined();
    expect(columns.packageSyncStateJson).toBeDefined();
    expect(columns.pendingActionsJson).toBeDefined();
    expect(columns.currentWorkspaceProfileJson).toBeDefined();
    expect(columns.lastRunSummaryJson).toBeDefined();
    expect(columns.policyCursor).toBeDefined();
    expect(columns.policyVersion).toBeDefined();
    expect(columns.policyExpiresAt).toBeDefined();
    expect(columns.warningFlagsJson).toBeDefined();
    expect(columns.enrolledAt).toBeDefined();
    expect(columns.lastSeenAt).toBeDefined();
    expect(columns.disabledAt).toBeDefined();
    expect(columns.createdAt).toBeDefined();
    expect(columns.updatedAt).toBeDefined();
  });

  test("defaults workerProjectionEnabled to false", () => {
    const columns = getTableColumns(desktopDevices);
    expect(columns.workerProjectionEnabled.default).toBe(false);
  });

  test("requires tenantId and displayName", () => {
    const columns = getTableColumns(desktopDevices);
    expect(columns.tenantId.notNull).toBe(true);
    expect(columns.displayName.notNull).toBe(true);
  });
});
