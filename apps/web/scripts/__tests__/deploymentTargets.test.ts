import { describe, expect, it } from "vitest";
import {
  resolveDeploymentTarget,
  assertLegacyLinuxReleaseTarget,
} from "../deploymentTargets.mjs";

describe("deployment targets", () => {
  it("maps the three public domains to their distinct logical targets", () => {
    expect(resolveDeploymentTarget("legacy-debian-dev")).toMatchObject({
      domain: "smartaihub.app",
      environment: "development",
      application: "legacy-smartspec",
      runtime: "debian-systemd",
      buildMode: "production",
      deploymentAuthority: "delegated-development",
    });
    expect(resolveDeploymentTarget("modular-debian-dev")).toMatchObject({
      domain: "aimarkethubs.com",
      environment: "development",
      application: "smartsihub-modular-core",
      status: "serving",
      applicationAvailable: true,
      deployable: true,
      controller: "modular-debian-dev-release",
      currentRelease: "modular-debian-dev-4349529142843d42a78b8e961a5e4e863efcf676-language-selector-accent",
    });
    expect(resolveDeploymentTarget("modular-cloudflare-prod")).toMatchObject({
      domain: "smartsihub.com",
      environment: "production",
      runtime: "cloudflare-workers-hono",
      status: "registered-not-activated",
    });
  });

  it("only authorizes the explicit legacy development target for the Linux release controller", () => {
    expect(assertLegacyLinuxReleaseTarget("legacy-debian-dev").domain).toBe("smartaihub.app");
    expect(() => assertLegacyLinuxReleaseTarget("modular-debian-dev")).toThrow("TARGET_NOT_SUPPORTED_BY_LEGACY_LINUX_RELEASE");
    expect(() => assertLegacyLinuxReleaseTarget("modular-cloudflare-prod")).toThrow("TARGET_NOT_SUPPORTED_BY_LEGACY_LINUX_RELEASE");
  });

  it("requires an explicit known target and fails closed for aliases", () => {
    expect(() => resolveDeploymentTarget(undefined)).toThrow("DEPLOYMENT_TARGET_REQUIRED");
    expect(() => resolveDeploymentTarget("smartaihub.app")).toThrow("UNKNOWN_DEPLOYMENT_TARGET");
  });
});
