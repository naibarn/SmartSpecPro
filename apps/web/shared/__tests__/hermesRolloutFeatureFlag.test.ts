import { describe, expect, it } from "vitest";

import {
  ALLOWED_FEATURE_FLAGS,
  FEATURE_FLAG_DEFAULTS,
  evaluateHermesCapabilityRolloutReadiness,
  evaluateHermesRolloutReadiness,
} from "../featureFlags";

describe("hermesAgentRuntime rollout gating", () => {
  it("defaults to false and stays allowlisted as the parent Hermes gate", () => {
    expect(FEATURE_FLAG_DEFAULTS.hermesAgentRuntime).toBe(false);
    expect(ALLOWED_FEATURE_FLAGS.has("hermesAgentRuntime")).toBe(true);
  });

  it("defaults the Hermes expansion slices to false and allowlists them", () => {
    expect(FEATURE_FLAG_DEFAULTS.hermesProfileExperience).toBe(false);
    expect(FEATURE_FLAG_DEFAULTS.hermesChannelWorkflowExpansion).toBe(false);
    expect(FEATURE_FLAG_DEFAULTS.hermesMemoryContextSync).toBe(false);
    expect(FEATURE_FLAG_DEFAULTS.hermesTaskModes).toBe(false);
    expect(FEATURE_FLAG_DEFAULTS.hermesVisibilitySummaries).toBe(false);
    expect(ALLOWED_FEATURE_FLAGS.has("hermesProfileExperience")).toBe(true);
    expect(ALLOWED_FEATURE_FLAGS.has("hermesChannelWorkflowExpansion")).toBe(true);
    expect(ALLOWED_FEATURE_FLAGS.has("hermesMemoryContextSync")).toBe(true);
    expect(ALLOWED_FEATURE_FLAGS.has("hermesTaskModes")).toBe(true);
    expect(ALLOWED_FEATURE_FLAGS.has("hermesVisibilitySummaries")).toBe(true);
  });

  it("fails closed for every Hermes surface when the parent gate is disabled", () => {
    expect(evaluateHermesRolloutReadiness({
      featureFlags: { hermesAgentRuntime: false },
      bridgeCapabilities: {
        apiServerEnabled: true,
        supportsDelegatedHttp: true,
        supportsDelegatedMcp: true,
        supportsBoundConnector: true,
        supportsCallbacks: true,
        gatewayPlatforms: ["telegram"],
      },
    })).toEqual({
      parentGateEnabled: false,
      surfaces: {
        registration: false,
        boundDispatch: false,
        delegatedMcp: false,
        channelCompanion: false,
      },
      highestEnabledSurface: "disabled",
      remoteEndpointPolicy: "loopback_only",
    });
  });

  it("keeps registration available before dispatch when Hermes lacks bound-dispatch prerequisites", () => {
    expect(evaluateHermesRolloutReadiness({
      featureFlags: { hermesAgentRuntime: true },
      bridgeCapabilities: {
        apiServerEnabled: true,
        supportsDelegatedHttp: true,
        supportsBoundConnector: false,
        supportsDelegatedMcp: true,
        supportsCallbacks: true,
        gatewayPlatforms: ["telegram"],
      },
    })).toEqual({
      parentGateEnabled: true,
      surfaces: {
        registration: true,
        boundDispatch: false,
        delegatedMcp: false,
        channelCompanion: false,
      },
      highestEnabledSurface: "registration",
      remoteEndpointPolicy: "loopback_only",
    });
  });

  it("keeps delegated MCP and channel companion exposure separated above bound dispatch", () => {
    const delegatedOnly = evaluateHermesRolloutReadiness({
      featureFlags: { hermesAgentRuntime: true },
      bridgeCapabilities: {
        apiServerEnabled: true,
        supportsDelegatedHttp: true,
        supportsBoundConnector: true,
        supportsDelegatedMcp: true,
        supportsCallbacks: false,
        gatewayPlatforms: ["telegram"],
      },
    });

    expect(delegatedOnly.surfaces).toEqual({
      registration: true,
      boundDispatch: true,
      delegatedMcp: true,
      channelCompanion: false,
    });
    expect(delegatedOnly.highestEnabledSurface).toBe("delegated_mcp");

    const channelCompanionOnly = evaluateHermesRolloutReadiness({
      featureFlags: { hermesAgentRuntime: true },
      bridgeCapabilities: {
        apiServerEnabled: true,
        supportsDelegatedHttp: true,
        supportsBoundConnector: true,
        supportsDelegatedMcp: false,
        supportsCallbacks: true,
        gatewayPlatforms: ["telegram", "discord"],
      },
      remoteEndpointPolicyExceptionId: "hermes-remote-allow-001",
    });

    expect(channelCompanionOnly.surfaces).toEqual({
      registration: true,
      boundDispatch: true,
      delegatedMcp: false,
      channelCompanion: true,
    });
    expect(channelCompanionOnly.highestEnabledSurface).toBe("channel_companion");
    expect(channelCompanionOnly.remoteEndpointPolicy).toBe("audited_exception_granted");
  });

  it("summarizes Hermes capability slices from tenant feature flags", () => {
    expect(evaluateHermesCapabilityRolloutReadiness({
      hermesProfileExperience: true,
      hermesChannelWorkflowExpansion: false,
      hermesMemoryContextSync: true,
      hermesTaskModes: false,
      hermesVisibilitySummaries: true,
    })).toEqual({
      profileExperience: true,
      channelWorkflowExpansion: false,
      memoryContextSync: true,
      taskModes: false,
      visibilitySummaries: true,
    });
  });
});
