import { describe, expect, it } from "vitest";
import { hasStagingDeploymentProfileRunway, isActiveStagingDeploymentJob,
  stagingApplicationHttpProfileExpiresAt, STAGING_APPLICATION_HTTP_PROFILE_MAX_LIFETIME_MS } from "./cloudflareStagingDispatchReadiness";

describe("Cloudflare Staging dispatch readiness", () => {
  it("caps a newly issued profile at six hours and never extends the parent configuration", () => {
    const issuedAt = new Date("2026-10-31T08:00:00.000Z");
    expect(stagingApplicationHttpProfileExpiresAt("2026-11-01T00:00:00.000Z", issuedAt))
      .toBe(new Date(issuedAt.getTime() + STAGING_APPLICATION_HTTP_PROFILE_MAX_LIFETIME_MS).toISOString());
    expect(stagingApplicationHttpProfileExpiresAt("2026-10-31T09:00:00.000Z", issuedAt)).toBe("2026-10-31T09:00:00.000Z");
  });

  it("requires the profile to outlive the complete authorization, grant, and job window", () => {
    const now = Date.parse("2026-10-31T08:00:00.000Z");
    expect(hasStagingDeploymentProfileRunway(new Date(now + 4 * 60 * 60_000 + 45 * 60_000).toISOString(), now)).toBe(true);
    expect(hasStagingDeploymentProfileRunway(new Date(now + 4 * 60 * 60_000 + 45 * 60_000 - 1).toISOString(), now)).toBe(false);
    expect(hasStagingDeploymentProfileRunway("not-a-date", now)).toBe(false);
  });

  it("blocks only an active deployment for the exact tenant project and Staging contract", () => {
    const identity = { tenantId: "tenant-a", projectId: "project-a" };
    const active = { status: "running", inputJson: { projectId: "project-a", environment: "staging", contractVersion: "cloudflare-staging-origin-v2" } };
    expect(isActiveStagingDeploymentJob(active, identity)).toBe(true);
    expect(isActiveStagingDeploymentJob({ ...active, status: "succeeded" }, identity)).toBe(false);
    expect(isActiveStagingDeploymentJob({ ...active, inputJson: { ...active.inputJson, environment: "production" } }, identity)).toBe(false);
    expect(isActiveStagingDeploymentJob({ ...active, inputJson: { ...active.inputJson, projectId: "project-b" } }, identity)).toBe(false);
    expect(isActiveStagingDeploymentJob({ ...active, inputJson: { ...active.inputJson, contractVersion: "legacy" } }, identity)).toBe(false);
  });
});
