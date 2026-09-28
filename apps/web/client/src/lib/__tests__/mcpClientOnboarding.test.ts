import { describe, expect, it } from "vitest";
import {
  buildMcpClientOnboardingDescriptor,
  buildHermesMcpInstallUrl,
  getMcpClientSetupMode,
} from "../mcpClientOnboarding";

describe("mcpClientOnboarding", () => {
  it("builds a public Hermes OAuth deep link without credentials", () => {
    const link = buildHermesMcpInstallUrl("https://smartaihub.app/v1/mcp");
    const config = new URL(link).searchParams.get("config");

    expect(link.startsWith("hermes://mcp/install?")).toBe(true);
    expect(config).toBeTruthy();
    expect(atob(config!)).toBe(
      JSON.stringify({ url: "https://smartaihub.app/v1/mcp", auth: "oauth" })
    );
    expect(link).not.toMatch(/token|secret|api[-_]?key|bearer/i);
  });

  it("keeps the client-specific setup boundary explicit", () => {
    expect(getMcpClientSetupMode("hermes-one")).toBe("deep-link");
    expect(getMcpClientSetupMode("claude")).toBe("settings");
    expect(getMcpClientSetupMode("codex")).toBe("settings");
  });

  it("builds the same secret-free descriptor for browser and headless clients", () => {
    const descriptor = buildMcpClientOnboardingDescriptor(
      "codex",
      "https://smartaihub.app/v1/mcp"
    );

    expect(descriptor.version).toBe("2026-08-18.1");
    expect(descriptor.transport).toBe("streamable-http");
    expect(descriptor.requiredScopes).toContain("mcp:read");
    expect(descriptor.quotaPreview).toEqual({
      fiveHourCredits: 500,
      dailyCredits: 1500,
      weeklyCredits: 5000,
    });
    expect(JSON.stringify(descriptor)).not.toMatch(
      /sk-[A-Za-z0-9]|Bearer\s+[A-Za-z0-9]|-----BEGIN/i
    );
  });

  it("rejects credential-bearing or non-HTTPS onboarding endpoints", () => {
    expect(() =>
      buildMcpClientOnboardingDescriptor("generic", "http://evil.test/v1/mcp")
    ).toThrow("HTTPS");
    expect(() =>
      buildMcpClientOnboardingDescriptor(
        "generic",
        "https://user:pass@smartaihub.app/v1/mcp"
      )
    ).toThrow("credentials");
    expect(() =>
      buildMcpClientOnboardingDescriptor(
        "generic",
        "https://smartaihub.app/v1/mcp?token=secret"
      )
    ).toThrow("request data");
  });
});
