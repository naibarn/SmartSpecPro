import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getTenantFeatureFlags } = vi.hoisted(() => ({
  getTenantFeatureFlags: vi.fn(),
}));

vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags,
}));

import { FEATURE_FLAG_DEFAULTS } from "../../../shared/featureFlags";
import { resolveMcpRolloutPolicy } from "../mcpRolloutPolicy";

describe("mcpRolloutPolicy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MCP_MODERN_PROTOCOL_ENABLED = "true";
  });

  afterEach(() => {
    delete process.env.MCP_MODERN_PROTOCOL_ENABLED;
  });

  it("requires both the deployment kill switch and tenant modern flag", async () => {
    getTenantFeatureFlags.mockResolvedValue({
      ...FEATURE_FLAG_DEFAULTS,
      mcpModernProtocolEnabled: true,
      mcpResourcesEnabled: true,
      mcpGuideToolAliasesEnabled: false,
    });

    const policy = await resolveMcpRolloutPolicy("tenant-1");
    expect(policy.modern).toBe(true);
    expect(policy.resources).toBe(true);
    expect(policy.guideAliases).toBe(false);
    expect(policy.tasks).toBe(false);
    expect(policy.subscriptions).toBe(false);
  });

  it("fails new capabilities closed when tenant flag storage is unavailable", async () => {
    getTenantFeatureFlags.mockRejectedValue(new Error("feature store unavailable"));

    const policy = await resolveMcpRolloutPolicy("tenant-1");
    expect(policy.modern).toBe(false);
    expect(policy.resources).toBe(false);
    expect(policy.guideAliases).toBe(false);
    expect(policy.legacy).toBe(true);
  });
});
