import { describe, expect, it, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  FEATURE_192_TIMER_INVENTORY,
  feature192TimerInventorySummary,
  getFeature192TimerEntry,
  shouldRunFeature192InProcessTimer,
} from "../feature192TimerPolicy";

describe("Feature 192 startup timer policy", () => {
  afterEach(() => {
    delete process.env.FEATURE_186_HARD_CUTOVER;
  });

  it("classifies every known business initializer", () => {
    expect(FEATURE_192_TIMER_INVENTORY.length).toBeGreaterThanOrEqual(20);
    expect(() => getFeature192TimerEntry("unknown-initializer")).toThrow(
      "FEATURE_192_TIMER_UNCLASSIFIED",
    );
    expect(feature192TimerInventorySummary().every(item => item.hardCutoverAction)).toBe(true);
  });

  it("runs only canonical or product-integration schedules in hard cutover", () => {
    process.env.FEATURE_186_HARD_CUTOVER = "true";
    expect(shouldRunFeature192InProcessTimer("initializeGDriveCleanupJob")).toBe(true);
    expect(shouldRunFeature192InProcessTimer("initializeTrashPurgeJob")).toBe(true);
    expect(shouldRunFeature192InProcessTimer("initializeBillingJobs")).toBe(false);
    expect(shouldRunFeature192InProcessTimer("initializePendingApprovalAlertJob")).toBe(false);
    expect(shouldRunFeature192InProcessTimer("initializeSkillMaintenanceScheduleJob")).toBe(false);
  });

  it("keeps every skipped startup path guarded in source", () => {
    process.env.FEATURE_186_HARD_CUTOVER = "true";
    const webRoot = join(import.meta.dirname, "../../..");
    for (const entry of feature192TimerInventorySummary().filter(item => item.hardCutoverAction === "skip")) {
      const source = readFileSync(join(webRoot, entry.source), "utf8");
      expect(source, entry.initializer).toMatch(/FEATURE_186_HARD_CUTOVER|shouldRunFeature192InProcessTimer|isCloudflareHardCutoverEnabled/);
    }
  });
});
