/**
 * Seed data tests for baseline sandbox profiles.
 * Validates profile definitions without requiring a database.
 */
import { describe, it, expect } from "vitest";
import { BASELINE_PROFILES } from "../drizzle/seedSandboxProfiles";

describe("Sandbox Profile Seed Data", () => {
  it("should define exactly 4 baseline profiles", () => {
    expect(BASELINE_PROFILES).toHaveLength(4);
  });

  it("should have unique slugs", () => {
    const slugs = BASELINE_PROFILES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("code-default profile should have correct resource defaults", () => {
    const profile = BASELINE_PROFILES.find((p) => p.slug === "code-default");
    expect(profile).toBeDefined();
    expect(profile!.cpuLimit).toBe("1000m");
    expect(profile!.memoryLimitMb).toBe(2048);
    expect(profile!.timeoutSeconds).toBe(600);
    expect(profile!.networkDefaultAction).toBe("deny");
    expect(profile!.allowCodeInterpreter).toBe(true);
    expect(profile!.executionMode).toBe("code");
  });

  it("media-processing profile should have correct resource defaults", () => {
    const profile = BASELINE_PROFILES.find((p) => p.slug === "media-processing");
    expect(profile).toBeDefined();
    expect(profile!.cpuLimit).toBe("2000m");
    expect(profile!.memoryLimitMb).toBe(4096);
    expect(profile!.timeoutSeconds).toBe(1800);
    expect(profile!.networkDefaultAction).toBe("deny");
    expect(profile!.allowCommand).toBe(true);
    expect(profile!.executionMode).toBe("media");
  });

  it("browser-default profile should have correct resource defaults", () => {
    const profile = BASELINE_PROFILES.find((p) => p.slug === "browser-default");
    expect(profile).toBeDefined();
    expect(profile!.baseImage).toBe("smartspec/browser-sandbox:local");
    expect(profile!.cpuLimit).toBe("2000m");
    expect(profile!.memoryLimitMb).toBe(4096);
    expect(profile!.timeoutSeconds).toBe(600);
    expect(profile!.networkDefaultAction).toBe("allow");
    expect(profile!.allowBrowser).toBe(true);
    expect(profile!.executionMode).toBe("browser");
  });

  it("file-parser profile should have correct resource defaults", () => {
    const profile = BASELINE_PROFILES.find((p) => p.slug === "file-parser");
    expect(profile).toBeDefined();
    expect(profile!.cpuLimit).toBe("1000m");
    expect(profile!.memoryLimitMb).toBe(2048);
    expect(profile!.timeoutSeconds).toBe(300);
    expect(profile!.networkDefaultAction).toBe("deny");
    expect(profile!.allowCommand).toBe(true);
    expect(profile!.executionMode).toBe("file");
  });

  it("all profiles should have a baseImage defined", () => {
    for (const profile of BASELINE_PROFILES) {
      expect(profile.baseImage).toBeDefined();
      expect(profile.baseImage!.length).toBeGreaterThan(0);
    }
  });
});
