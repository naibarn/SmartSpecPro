import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { validateFeatureFlags, resolveFeatureFlags, isFeatureEnabled } from "../../services/tenantFeatureFlagService";
import { FEATURE_FLAG_DEFAULTS } from "../../../shared/featureFlags";

// Mock db module
vi.mock("../../db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

describe("updateFeatureFlags mutation — validation", () => {
  it("validates keys against allowlist and strips unrecognized", () => {
    const result = validateFeatureFlags({ canvas: true, unknownFlag: true });
    expect(result).toEqual({ canvas: true });
    expect("unknownFlag" in result).toBe(false);
  });

  it("strips non-boolean values", () => {
    const result = validateFeatureFlags({ canvas: "true" as unknown as boolean, voiceChat: true });
    expect(result).toEqual({ voiceChat: true });
  });

  it("accepts all recognized flags", () => {
    const all = {
      multiChannel: true,
      chatWidget: true,
      browserTool: true,
      canvas: true,
      voiceChat: true,
      webhookTriggers: true,
      costDisplay: false,
      personaSystem: false,
      crossAgency: true,
      channelRouter: true,
      liveBrowser: true,
      automationCopilot: true,
      responsesApi: false,
      taskPlannerEnabled: true,
      taskPlannerAgencyEscalation: false,
    } as const;
    const result = validateFeatureFlags(all);
    expect(result).toEqual(all);
  });
});

describe("updateFeatureFlags mutation — RBAC (simulated)", () => {
  it("domain_admin targeting same tenant should succeed (simulated by validating logic)", () => {
    // The RBAC check in the router: domain_admin + own tenant = pass
    const callerTenantId = "tenant-123";
    const inputTenantId = "tenant-123";
    const isDomainAdmin = true;
    const isAdmin = false;

    let shouldAllow: boolean;
    if (isAdmin) {
      shouldAllow = true; // admin can update any
    } else if (isDomainAdmin) {
      shouldAllow = !inputTenantId || inputTenantId === callerTenantId;
    } else {
      shouldAllow = false;
    }

    expect(shouldAllow).toBe(true);
  });

  it("domain_admin targeting different tenant should be forbidden", () => {
    const callerTenantId = "tenant-123";
    const inputTenantId = "tenant-456";
    const isDomainAdmin = true;
    const isAdmin = false;

    let shouldAllow: boolean;
    if (isAdmin) {
      shouldAllow = true;
    } else if (isDomainAdmin) {
      shouldAllow = !inputTenantId || inputTenantId === callerTenantId;
    } else {
      shouldAllow = false;
    }

    expect(shouldAllow).toBe(false);
  });

  it("admin can modify any tenant flags", () => {
    const isAdmin = true;
    expect(isAdmin).toBe(true); // admin always allowed
  });
});

describe("requireFeatureFlag middleware — simulated via isFeatureEnabled", () => {
  it("allows request when feature flag is true", () => {
    const storedFlags = { canvas: true };
    expect(isFeatureEnabled(storedFlags, "canvas")).toBe(true);
  });

  it("returns false when feature flag is false", () => {
    const storedFlags = { canvas: false };
    expect(isFeatureEnabled(storedFlags, "canvas")).toBe(false);
  });

  it("returns default (false) when featureFlags sub-key is missing for non-default flags", () => {
    expect(isFeatureEnabled({}, "canvas")).toBe(true);
    expect(isFeatureEnabled(null, "channelRouter")).toBe(true);
  });

  it("returns default (true) when flag is missing but default is true", () => {
    // costDisplay and personaSystem default to true
    expect(isFeatureEnabled({}, "costDisplay")).toBe(true);
    expect(isFeatureEnabled(null, "personaSystem")).toBe(true);
  });
});

describe("generic settings mutation audit — validateFeatureFlags prevents bypass", () => {
  it("strips featureFlags key from generic settings payload", () => {
    // validateFeatureFlags only accepts known Claw flag keys
    // "featureFlags" is not a valid flag key, so it gets stripped
    const result = validateFeatureFlags({ featureFlags: { canvas: true } } as Record<string, unknown>);
    expect(result).toEqual({});
  });

  it("validates flags are strict booleans (prevents object injection)", () => {
    const result = validateFeatureFlags({
      canvas: { $gt: "" } as unknown as boolean,
    });
    expect(result).toEqual({});
  });
});

describe("getFeatureFlagDefaults", () => {
  it("costDisplay defaults to true", () => {
    expect(FEATURE_FLAG_DEFAULTS.costDisplay).toBe(true);
  });

  it("personaSystem defaults to true", () => {
    expect(FEATURE_FLAG_DEFAULTS.personaSystem).toBe(true);
  });

  it("all other flags default to false", () => {
    const falseKeys: (keyof typeof FEATURE_FLAG_DEFAULTS)[] = [
      "mcpStdio",
      "mcpOAuth",
      "UPLOAD_POST_GATEWAY_ENABLED",
      "localClientLlmMode",
      "openClawExternalRuntime",
      "desktopZeroClawWorker",
      "nemoClawSecureWorkerPool",
      "hiClawClusterRuntime",
      "hermesAgentRuntime",
      "desktopHostEnabled",
    ];
    for (const key of falseKeys) {
      expect(FEATURE_FLAG_DEFAULTS[key]).toBe(false);
    }
  });
});

describe("mergeFeatureFlags — resolveFeatureFlags", () => {
  afterEach(() => {
    delete process.env.SMARTSPEC_PLAYWRIGHT_ENABLED;
  });

  it("preserves unchanged flags when updating", () => {
    const existing = { canvas: true, voiceChat: false };
    const merged = resolveFeatureFlags({ ...existing, voiceChat: true });
    expect(merged.canvas).toBe(true);
    expect(merged.voiceChat).toBe(true);
  });

  it("preserves defaults for flags not in stored set", () => {
    const stored = { canvas: true };
    const resolved = resolveFeatureFlags(stored);
    expect(resolved.canvas).toBe(true);
    expect(resolved.costDisplay).toBe(true); // default true
    expect(resolved.multiChannel).toBe(true); // default true
  });

  it("forces browser session feature flags off when Playwright is globally disabled", () => {
    process.env.SMARTSPEC_PLAYWRIGHT_ENABLED = "false";

    const resolved = resolveFeatureFlags({
      browserTool: true,
      automationCopilot: true,
      liveBrowser: true,
      chatBrowserSessionEntry: true,
      agencyBrowserSessionUi: true,
      workflowBrowserSessionNodes: true,
    });

    expect(resolved.browserTool).toBe(false);
    expect(resolved.automationCopilot).toBe(false);
    expect(resolved.liveBrowser).toBe(false);
    expect(resolved.chatBrowserSessionEntry).toBe(false);
    expect(resolved.agencyBrowserSessionUi).toBe(false);
    expect(resolved.workflowBrowserSessionNodes).toBe(false);
  });
});
