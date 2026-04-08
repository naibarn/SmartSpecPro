import { describe, expect, it } from "vitest";

import { DEFAULT_LOCAL_AI_SYNCED_PREFERENCES } from "../../../../../packages/local-ai-core/src/index";
import { decideLocalAiRuntime } from "../localAiRuntimeRouter";

const baseCapability = {
  supported: true,
  platform: "web" as const,
  secureContext: true,
  webgpu: true,
  webgpuAdapterAvailable: true,
  webgpuProfileRequirementsMet: true,
  eligibleProfiles: ["gemma4-e2b-web-fast"],
  eligibleVoiceProfiles: ["gemma4-e2b-web-fast"],
  reasons: [],
  storageEstimateMb: 2048,
};

const baseCatalog = [
  {
    id: "gemma4-e2b-web-fast",
    family: "gemma4",
    variant: "E2B",
    supportedPlatforms: ["web"] as const,
    runtimeFamily: "mediapipe-webgpu" as const,
    approximateSizeMb: 2004,
    downloadRequired: true,
    supportsVoiceInput: true,
    defaultVoiceInputMode: "gemma4_local" as const,
    modalities: {
      text: true,
      image: false,
      audio: true,
      ocr: "conditional" as const,
    },
    minimumRequirements: {
      requiresSecureContext: true,
      requiresWebGpu: true,
      requiredWebGpuFeatures: [],
    },
    integrity: {
      manifestVersion: 1,
      checksumSha256: null,
    },
    status: "allowed" as const,
    statusReason: null,
  },
];

describe("decideLocalAiRuntime", () => {
  it("routes cloud when the tenant is disabled", () => {
    const result = decideLocalAiRuntime({
      taskClass: "general_chat",
      prefs: {
        ...DEFAULT_LOCAL_AI_SYNCED_PREFERENCES,
        enabled: true,
        mode: "auto",
      },
      policy: {
        state: "tenant_disabled",
        featureEnabled: false,
        forceCloudOnly: true,
        defaultExecutionMode: "off",
        allowedProfileIds: null,
        reason: "tenant_disabled",
      },
      capability: baseCapability,
      catalog: baseCatalog,
    });

    expect(result.selectedRuntime).toBe("cloud");
    expect(result.reason).toBe("tenant_disabled");
  });

  it("selects hybrid when the device and profile are eligible", () => {
    const result = decideLocalAiRuntime({
      taskClass: "summarization",
      prefs: {
        ...DEFAULT_LOCAL_AI_SYNCED_PREFERENCES,
        enabled: true,
        mode: "auto",
        defaultModelId: "gemma4-e2b-web-fast",
      },
      policy: {
        state: "enabled",
        featureEnabled: true,
        forceCloudOnly: false,
        defaultExecutionMode: "auto",
        allowedProfileIds: null,
        reason: null,
      },
      capability: baseCapability,
      catalog: baseCatalog,
    });

    expect(result.selectedRuntime).toBe("hybrid");
    expect(result.selectedProfileId).toBe("gemma4-e2b-web-fast");
  });

  it("keeps local_only requests from allowing cloud fallback", () => {
    const result = decideLocalAiRuntime({
      taskClass: "voice_dictation",
      prefs: {
        ...DEFAULT_LOCAL_AI_SYNCED_PREFERENCES,
        enabled: true,
        mode: "local_only",
        defaultModelId: "gemma4-e2b-web-fast",
      },
      policy: {
        state: "enabled",
        featureEnabled: true,
        forceCloudOnly: false,
        defaultExecutionMode: "auto",
        allowedProfileIds: null,
        reason: null,
      },
      capability: {
        ...baseCapability,
        supported: false,
        eligibleProfiles: [],
      },
      catalog: baseCatalog,
    });

    expect(result.selectedRuntime).toBe("cloud");
    expect(result.fallbackAllowed).toBe(false);
  });
});
