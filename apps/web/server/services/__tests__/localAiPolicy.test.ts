import { describe, expect, it } from "vitest";

import { resolveLocalAiPolicy } from "../localAiPolicy";

describe("resolveLocalAiPolicy", () => {
  it("disables the catalog when the tenant feature flag is off", () => {
    const result = resolveLocalAiPolicy({
      tenantFlags: { localClientLlmMode: false },
      platform: "web",
    });

    expect(result.policy.state).toBe("tenant_disabled");
    expect(result.catalog).toEqual([]);
  });

  it("filters the catalog by allowlist", () => {
    const result = resolveLocalAiPolicy({
      tenantFlags: { localClientLlmMode: true },
      platform: "web",
      allowProfileIds: ["gemma4-e2b-web-fast"],
    });

    expect(result.catalog.map((entry) => entry.id)).toEqual([
      "gemma4-e2b-web-fast",
    ]);
  });

  it("marks revoked profiles as unusable on refresh", () => {
    const result = resolveLocalAiPolicy({
      tenantFlags: { localClientLlmMode: true },
      platform: "web",
      revokedProfileIds: ["gemma4-e4b-web-balanced"],
    });

    expect(
      result.catalog.find((entry) => entry.id === "gemma4-e4b-web-balanced")
        ?.status,
    ).toBe("revoked");
  });

  it("can force cloud-only mode without hiding the explanatory policy payload", () => {
    const result = resolveLocalAiPolicy({
      tenantFlags: { localClientLlmMode: true },
      platform: "web",
      forceCloudOnly: true,
    });

    expect(result.policy.state).toBe("force_cloud_only");
    expect(result.policy.forceCloudOnly).toBe(true);
    expect(result.catalog.length).toBeGreaterThan(0);
  });
});
