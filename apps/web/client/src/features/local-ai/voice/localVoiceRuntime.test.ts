import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getLocalVoiceRuntimeAvailability } from "./localVoiceRuntime";

describe("getLocalVoiceRuntimeAvailability", () => {
  const browserCatalog = [
    {
      id: "gemma4-e2b-web-fast",
      family: "gemma4",
      variant: "E2B",
      supportedPlatforms: ["web"],
      runtimeFamily: "mediapipe-webgpu",
      approximateSizeMb: 2004,
      downloadRequired: true,
      supportsVoiceInput: true,
      defaultVoiceInputMode: "gemma4_local",
      modalities: {
        text: true,
        image: false,
        audio: true,
        ocr: "conditional",
      },
      minimumRequirements: {
        requiresSecureContext: true,
        requiresWebGpu: true,
        requiredWebGpuFeatures: [],
      },
      integrity: {
        manifestVersion: 1,
        checksumSha256: "abc",
      },
      runtimeConfig: {
        browser: {
          bundleUrl:
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.27/genai_bundle.cjs",
          bundleSha256: "bundle-checksum",
          wasmRootUrl:
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.27/wasm",
          wasmVersion: "0.10.27",
          wasmAssetChecksums: {
            "genai_wasm_internal.js": "wasm-checksum",
          },
          modelAssetUrl:
            "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.task",
        },
      },
      status: "allowed",
      statusReason: null,
    },
  ] as const;

  const tauriCatalog = [
    {
      id: "gemma4-e2b-tauri-fast",
      family: "gemma4",
      variant: "E2B",
      supportedPlatforms: ["tauri"],
      runtimeFamily: "tauri-native",
      approximateSizeMb: 2584,
      downloadRequired: true,
      supportsVoiceInput: true,
      defaultVoiceInputMode: "gemma4_local",
      modalities: {
        text: true,
        image: true,
        audio: true,
        ocr: "conditional",
      },
      minimumRequirements: {
        requiresSecureContext: false,
        requiresWebGpu: false,
        requiredWebGpuFeatures: [],
      },
      integrity: {
        manifestVersion: 1,
        checksumSha256: "abc",
      },
      runtimeConfig: {
        tauri: {
          fromHuggingFaceRepo: "litert-community/gemma-4-E2B-it-litert-lm",
          modelFileName: "gemma-4-E2B-it.litertlm",
          cliBinaryName: "litert-lm",
        },
      },
      status: "allowed",
      statusReason: null,
    },
  ] as const;

  const browserCapability = {
    supported: true,
    platform: "web",
    secureContext: true,
    webgpu: true,
    webgpuAdapterAvailable: true,
    webgpuDeviceAvailable: true,
    webgpuProfileRequirementsMet: true,
    eligibleProfiles: ["gemma4-e2b-web-fast"],
    eligibleVoiceProfiles: ["gemma4-e2b-web-fast"],
    reasons: [],
    storageEstimateMb: 2004,
  } as const;

  const unsupportedCapability = {
    supported: false,
    platform: "web",
    secureContext: true,
    webgpu: false,
    webgpuAdapterAvailable: false,
    webgpuDeviceAvailable: false,
    webgpuProfileRequirementsMet: false,
    eligibleProfiles: [],
    eligibleVoiceProfiles: [],
    reasons: ["browser_local_voice_unavailable"],
    storageEstimateMb: null,
  } as const;

  beforeEach(() => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn(() =>
          JSON.stringify({
            installedModelIds: ["gemma4-e2b-web-fast"],
          }),
        ),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports browser local voice readiness when a voice-capable Gemma web profile is installed", () => {
    expect(
      getLocalVoiceRuntimeAvailability({
        platform: "web",
        catalog: [...browserCatalog],
        capability: { ...browserCapability },
        deviceScope: {
          tenantId: "tenant-1",
          userId: "user-1",
          runtimeNamespace: "web",
        },
      }),
    ).toEqual({
      supported: true,
      ready: true,
      reason: null,
    });
  });

  it("reports browser local voice support but not readiness when no browser model is installed", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn(() =>
          JSON.stringify({
            installedModelIds: [],
          }),
        ),
      },
    });

    expect(
      getLocalVoiceRuntimeAvailability({
        platform: "web",
        catalog: [...browserCatalog],
        capability: { ...browserCapability },
        deviceScope: {
          tenantId: "tenant-1",
          userId: "user-1",
          runtimeNamespace: "web",
        },
      }),
    ).toEqual({
      supported: true,
      ready: false,
      reason: "browser_voice_model_not_installed",
    });
  });

  it("keeps browser local voice unavailable when browser capability fails", () => {
    expect(
      getLocalVoiceRuntimeAvailability({
        platform: "web",
        catalog: [...browserCatalog],
        capability: { ...unsupportedCapability },
      }),
    ).toEqual({
      supported: false,
      ready: false,
      reason: "browser_local_voice_unavailable",
    });
  });

  it("reports tauri voice support but not readiness when no model is prepared", () => {
    expect(
      getLocalVoiceRuntimeAvailability({
        platform: "tauri",
        catalog: [...tauriCatalog],
        capability: { ...unsupportedCapability },
        tauriRuntimeStatus: {
          available: true,
          supportsScriptBundle: true,
          supportsGemma4Text: true,
          supportsGemma4Voice: true,
          nodePath: "/usr/bin/node",
          litertLmPath: "/usr/bin/litert-lm",
          runtimeRoot: "/tmp/local-ai",
          managedModelRoot: "/tmp/local-ai/models",
          bundleMode: "on-demand",
          gemmaProfileIds: ["gemma4-e2b-tauri-fast"],
          bundledGemmaProfileIds: [],
          installedGemmaProfileIds: [],
          reason: null,
        },
      }),
    ).toEqual({
      supported: true,
      ready: false,
      reason: "tauri_voice_model_not_installed",
    });
  });

  it("reports tauri voice readiness when a voice-capable Gemma profile is installed", () => {
    expect(
      getLocalVoiceRuntimeAvailability({
        platform: "tauri",
        catalog: [...tauriCatalog],
        capability: { ...unsupportedCapability },
        tauriRuntimeStatus: {
          available: true,
          supportsScriptBundle: true,
          supportsGemma4Text: true,
          supportsGemma4Voice: true,
          nodePath: "/usr/bin/node",
          litertLmPath: "/usr/bin/litert-lm",
          runtimeRoot: "/tmp/local-ai",
          managedModelRoot: "/tmp/local-ai/models",
          bundleMode: "on-demand",
          gemmaProfileIds: ["gemma4-e2b-tauri-fast"],
          bundledGemmaProfileIds: [],
          installedGemmaProfileIds: ["gemma4-e2b-tauri-fast"],
          reason: null,
        },
      }),
    ).toEqual({
      supported: true,
      ready: true,
      reason: null,
    });
  });
});
