import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isSharedProductionDebug, getDebugTenantDomain } from "./sharedProductionDebug";
const shared = { NODE_ENV: "development", SMARTSPEC_ENVIRONMENT: "development", SMARTSPEC_DEV_DATABASE_MODE: "shared-production", APP_URL: "https://aimarkethubs.com", SMARTSPEC_DEV_TENANT_DOMAIN: "smartaihub.app" };
describe("shared production debugging", () => {
  it("requires the explicit development profile", () => {
    expect(isSharedProductionDebug(shared)).toBe(true);
    expect(isSharedProductionDebug({ ...shared, NODE_ENV: "production" })).toBe(false);
    expect(isSharedProductionDebug({ ...shared, SMARTSPEC_ENVIRONMENT: "production" })).toBe(false);
    expect(isSharedProductionDebug({ ...shared, SMARTSPEC_DEV_DATABASE_MODE: "isolated" })).toBe(false);
  });
  it("maps only the dedicated debug hostname to the existing tenant", () => {
    expect(getDebugTenantDomain("aimarkethubs.com", shared)).toBe("smartaihub.app");
    expect(getDebugTenantDomain("customer.example", shared)).toBe("customer.example");
    expect(getDebugTenantDomain("aimarkethubs.com", { ...shared, NODE_ENV: "production" })).toBe("aimarkethubs.com");
    expect(getDebugTenantDomain("aimarkethubs.com", { ...shared, APP_URL: "invalid" })).toBe("aimarkethubs.com");
  });
  it("keeps startup synchronization and recovery within the background ownership boundary", () => {
    const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    const guardedStart = source.indexOf("if (applicationRuntimeProfile.ownsBackgroundWork) {");
    const guardedEnd = source.indexOf('console.log("[Startup] Request runtime:');
    for (const call of ["await initializeSkillRegistry()", "await recoverActiveRunsOnStartup()", "await initializeUnifiedJobControlPlaneRuntime()", "await initializeDatabaseBackupJob()"])
      expect(source.indexOf(call)).toBeGreaterThan(guardedStart);
    for (const call of ["await initializeSkillRegistry()", "await recoverActiveRunsOnStartup()", "await initializeUnifiedJobControlPlaneRuntime()", "await initializeDatabaseBackupJob()"])
      expect(source.indexOf(call)).toBeLessThan(guardedEnd);
    expect(source).toContain('if (!applicationRuntimeProfile.ownsBackgroundWork) return;');
  });
});
